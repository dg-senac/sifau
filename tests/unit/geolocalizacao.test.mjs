// ============================================================================
// SIFAU — Testes da captura pontual de localização da ocorrência
// ============================================================================
// O que decide se o fiscal consegue marcar o local da ocorrência no APK e no
// navegador: a classificação dos erros (permissão negada × bloqueada × GPS
// desligado × tempo esgotado), as permissões do Android no manifesto (somente
// durante o uso — nunca em segundo plano) e o casamento entre o JavaScript e o
// plugin nativo que abre as configurações.
//
// Roda com `npm run test:unit` (Node com remoção de tipos, sem build).
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const {
  classificarFalhaNativa,
  classificarFalhaDoNavegador,
  capturarLocalizacao,
  emAplicativoNativo,
} = await import('../../src/lib/geolocalizacao.ts');

// ── Mensagens reais do plugin @capacitor/geolocation (código nativo) ────────

test('mensagens do plugin nativo são classificadas pelo motivo certo', () => {
  // GPS do aparelho desligado (vem de checkPermissions/requestPermissions
  // e, mais tarde, de sendLocation).
  assert.equal(classificarFalhaNativa('Location services are not enabled'), 'gps-indisponivel');
  assert.equal(classificarFalhaNativa('location disabled'), 'gps-indisponivel');
  // FusedLocationProvider não conseguiu correção.
  assert.equal(classificarFalhaNativa('location unavailable'), 'gps-indisponivel');
  // Aparelho sem Google Play Services.
  assert.equal(classificarFalhaNativa('Google Play Services not available'), 'gps-indisponivel');
  // O fiscal negou a permissão na caixa do sistema.
  assert.equal(classificarFalhaNativa('Location permission was denied'), 'permissao-negada');
  // Erro desconhecido não vira mentira classificada.
  assert.equal(classificarFalhaNativa('alguma falha inédita'), 'inesperada');
});

test('classificação nativa tolera mensagem vazia ou ausente', () => {
  assert.equal(classificarFalhaNativa(null), 'inesperada');
  assert.equal(classificarFalhaNativa(undefined), 'inesperada');
  assert.equal(classificarFalhaNativa(''), 'inesperada');
});

// ── Códigos de erro do navigator.geolocation (navegador) ────────────────────

test('códigos do navegador separam negativa de bloqueio permanente', () => {
  // 1 = PERMISSION_DENIED: bloqueado quando a Permissions API confirma "denied"
  // (navegador não repete a caixa de diálogo), negada quando não dá para saber.
  assert.equal(classificarFalhaDoNavegador(1, 'denied'), 'permissao-bloqueada');
  assert.equal(classificarFalhaDoNavegador(1, null), 'permissao-negada');
  assert.equal(classificarFalhaDoNavegador(1, 'prompt'), 'permissao-negada');
  // 2 = POSITION_UNAVAILABLE, 3 = TIMEOUT.
  assert.equal(classificarFalhaDoNavegador(2, null), 'gps-indisponivel');
  assert.equal(classificarFalhaDoNavegador(3, null), 'tempo-esgotado');
  assert.equal(classificarFalhaDoNavegador(undefined, null), 'inesperada');
});

// ── Ponto de entrada ────────────────────────────────────────────────────────

test('fora do aparelho e sem geolocalização, devolve sem-suporte (nunca lança)', async () => {
  // No Node não há plataforma nativa nem navigator.geolocation: o caminho web
  // precisa guardar o caso e devolver motivo — não derrubar a tela.
  assert.equal(emAplicativoNativo(), false);
  const resultado = await capturarLocalizacao();
  assert.equal(resultado.ok, false);
  assert.equal(resultado.motivo, 'sem-suporte');
});

// ── Permissões do Android (o motivo do APK não pedir localização) ───────────

test('manifesto Android declara localização apenas durante o uso', () => {
  const manifesto = readFileSync(join(RAIZ, 'android/app/src/main/AndroidManifest.xml'), 'utf8')
    // Comentário XML não é permissão: a análise olha só o que vale de verdade.
    .replace(/<!--[\s\S]*?-->/g, '');
  // Sem estas duas, o WebView nem expõe geolocalização e o plugin não tem o
  // que pedir em tempo de execução.
  assert.match(manifesto, /android\.permission\.ACCESS_FINE_LOCATION/);
  assert.match(manifesto, /android\.permission\.ACCESS_COARSE_LOCATION/);
  // Segundo plano nunca: esta permissão NÃO pode entrar.
  assert.doesNotMatch(manifesto, /ACCESS_BACKGROUND_LOCATION/);
  // Aparelho sem GPS continua instalando o aplicativo.
  assert.match(manifesto, /android\.hardware\.location\.gps[^>]*android:required="false"/s);
});

test('projeto Android tem o plugin de geolocalização sincronizado', () => {
  // Sem `npx cap sync android` depois de instalar o plugin, o Gradle não
  // compila o plugin e o APK sai sem ele — a falha só apareceria no aparelho.
  const settings = readFileSync(join(RAIZ, 'android/capacitor.settings.gradle'), 'utf8');
  assert.match(settings, /capacitor-geolocation/);
  const build = readFileSync(join(RAIZ, 'android/app/capacitor.build.gradle'), 'utf8');
  assert.match(build, /implementation project\(':capacitor-geolocation'\)/);
});

// ── Casamento JavaScript ↔ plugin nativo que abre as configurações ──────────

test('o nome do plugin de configurações é o mesmo nos dois lados', () => {
  const java = readFileSync(
    join(RAIZ, 'android/app/src/main/java/br/recife/sifau/AbrirConfiguracoesPlugin.java'),
    'utf8',
  );
  const js = readFileSync(join(RAIZ, 'src/lib/geolocalizacao.ts'), 'utf8');
  const noJava = java.match(/@CapacitorPlugin\(name = "([^"]+)"\)/)?.[1];
  const noJs = js.match(/registerPlugin<[^>]+>\('([^']+)'\)/)?.[1];
  assert.ok(noJava, 'o plugin nativo precisa declarar o nome em @CapacitorPlugin');
  assert.ok(noJs, 'o JavaScript precisa registrar o plugin pelo mesmo nome');
  assert.equal(noJs, noJava);
  // E o MainActivity precisa registrá-lo, senão a chamada vira "not implemented".
  const main = readFileSync(
    join(RAIZ, 'android/app/src/main/java/br/recife/sifau/MainActivity.java'),
    'utf8',
  );
  assert.match(main, /registerPlugin\(AbrirConfiguracoesPlugin\.class\)/);
});

// ── A tela de ocorrência usa este módulo (e não geolocalização solta) ───────

test('NewOccurrence captura via módulo com permissão, não via navigator direto', () => {
  const tela = readFileSync(join(RAIZ, 'src/screens/NewOccurrence.tsx'), 'utf8');
  assert.match(tela, /capturarLocalizacao\(/);
  assert.match(tela, /abrirConfiguracoesDoAplicativo/);
  assert.doesNotMatch(tela, /navigator\.geolocation/);
});

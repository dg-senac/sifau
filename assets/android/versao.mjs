// ============================================================================
// SIFAU — Versão do aplicativo Android
// ============================================================================
// O Android exige dois números, e os dois precisam ser controlados juntos:
//
//   * `versionName` — o que a pessoa vê ("1.2.0");
//   * `versionCode`  — um número inteiro que SÓ PODE CRESCER. É ele que o
//     aparelho usa para decidir se aceita instalar por cima ("atualizar") ou se
//     recusa ("aplicativo não instalado"). Um `versionCode` repetido ou menor
//     faz a instalação falhar, e o erro que aparece na tela não diz por quê.
//
// Por isso este arquivo existe: a versão é declarada **uma vez** (na etiqueta
// do Git ou na linha de comando) e os dois números saem dela por regra fixa,
// sem ninguém digitar `versionCode` à mão.
//
// Uso:
//   node assets/android/versao.mjs 1.2.0     → grava a versão
//   node assets/android/versao.mjs --mostrar → só mostra o que está lá
//   node assets/android/versao.mjs --codigo 1.2.0 → só o número (usado pela publicação)
// ============================================================================

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const CAMINHO_BUILD_GRADLE = join(RAIZ, 'android', 'app', 'build.gradle');

/**
 * Converte "1.2.3" em número inteiro que cresce sempre na mesma ordem.
 * 1.0.0 → 10000 · 1.2.3 → 10203 · 2.0.0 → 20000
 *
 * A conta usa duas casas para menor e correção (até 99 cada) e o resto para a
 * maior. Assim "1.10.0" (11000) é maior que "1.9.0" (10900) — o que a
 * comparação de texto erraria, e é o tipo de erro que só aparece meses depois,
 * quando alguém tenta atualizar o aplicativo de um fiscal e não consegue.
 */
export function versionCodeDe(versao) {
  const partes = String(versao).trim().replace(/^v/i, '').split('.');
  if (partes.length > 3) {
    // "1.2.3.4" seria convertido em "1.2.3" silenciosamente, e o nome da versão
    // no arquivo não bate com o número calculado — o APK sairia com uma versão
    // e o registro com outra.
    throw new Error(`Versão inválida: "${versao}". Use no máximo três números (1.2.3).`);
  }
  const [maior, menor = '0', correcao = '0'] = partes;
  for (const parte of [maior, menor, correcao]) {
    if (!/^\d+$/.test(parte)) {
      throw new Error(`Versão inválida: "${versao}". Use o formato 1.2.3 (só números e pontos).`);
    }
  }
  const [a, b, c] = [Number(maior), Number(menor), Number(correcao)];
  if (b > 99 || c > 99) {
    throw new Error(`Versão inválida: "${versao}". O segundo e o terceiro número vão até 99.`);
  }
  return a * 10000 + b * 100 + c;
}

/** Lê a versão que está gravada hoje no `build.gradle`. */
export function versaoAtual(texto = readFileSync(CAMINHO_BUILD_GRADLE, 'utf8')) {
  const nome = /versionName\s+"([^"]+)"/.exec(texto)?.[1];
  const codigo = /versionCode\s+(\d+)/.exec(texto)?.[1];
  if (!nome || !codigo) {
    throw new Error('Não encontrei versionName/versionCode em android/app/build.gradle.');
  }
  return { nome, codigo: Number(codigo) };
}

/**
 * Escreve a versão no `build.gradle` e devolve o texto novo.
 * É idempotente: rodar duas vezes com a mesma versão dá o mesmo arquivo.
 */
export function aplicarVersao(versao, texto = readFileSync(CAMINHO_BUILD_GRADLE, 'utf8')) {
  const nome = String(versao).trim().replace(/^v/i, '');
  const codigo = versionCodeDe(nome);
  const comNome = texto.replace(/(versionName\s+)"[^"]*"/, `$1"${nome}"`);
  const comCodigo = comNome.replace(/(versionCode\s+)\d+/, `$1${codigo}`);

  // A conferência é feita LENDO o resultado, e não comparando com o texto
  // anterior: aplicar a versão que já está gravada tem de dar o mesmo arquivo,
  // e não erro. Antes desta correção, rodar duas vezes a mesma versão quebrava
  // a publicação — o tipo de defeito que só aparece em re-execução.
  const conferido = versaoAtual(comCodigo);
  if (conferido.nome !== nome || conferido.codigo !== codigo) {
    throw new Error('Não consegui gravar a versão: o formato do build.gradle mudou.');
  }
  return comCodigo;
}

// ────────────────────────────────────────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  const argumento = process.argv[2];

  if (argumento === '--codigo') {
    // Usado pela publicação: é o número que o APK gerado PRECISA ter por dentro.
    console.log(versionCodeDe(process.argv[3]));
  } else if (!argumento || argumento === '--mostrar') {
    const atual = versaoAtual();
    console.log(`versão atual: ${atual.nome} (versionCode ${atual.codigo})`);
  } else {
    const antes = versaoAtual();
    const atualizado = aplicarVersao(argumento);
    writeFileSync(CAMINHO_BUILD_GRADLE, atualizado, 'utf8');
    const depois = versaoAtual(atualizado);
    if (depois.nome !== String(argumento).replace(/^v/i, '') || depois.codigo !== versionCodeDe(argumento)) {
      // Rede de segurança: o arquivo no disco precisa ter ficado com o que foi
      // pedido. Gravar e não conferir é como o versionCode fica repetido sem
      // ninguém perceber, e o erro só aparece na hora de instalar por cima.
      throw new Error('A versão gravada não confere com a pedida.');
    }
    console.log(`✓ versão ${antes.nome} (${antes.codigo}) → ${depois.nome} (${depois.codigo})`);
  }
}

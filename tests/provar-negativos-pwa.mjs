// ============================================================================
// Prova de que a verificação de instalação (tests/check-pwa.mjs) pega o que
// diz pegar.
//
// Um teste que nunca reprovou não é proteção, é enfeite. Aqui cada defeito é
// injetado de propósito, um por vez: se a verificação continuar passando com o
// defeito no lugar, é ela que está quebrada — e este arquivo avisa.
//
// Não roda no `npm run verify`: ele mexe nos arquivos do projeto (com backup e
// restauração a cada caso). Uso: `npm run test:pwa:negativos`
// ============================================================================

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

const SW = join(RAIZ, 'src', 'service-worker.ts');
const MANIFEST = join(RAIZ, 'public', 'manifest.webmanifest');
const OFFLINE = join(RAIZ, 'public', 'offline.html');
const REGISTRO = join(RAIZ, 'src', 'registrarServiceWorker.ts');
const PACKAGE = join(RAIZ, 'package.json');

/**
 * Cada caso: o arquivo, o que estragar, e o trecho que a verificação PRECISA
 * dizer ao reprovar — conferir o motivo, e não só a reprovação, é o que separa
 * "pegou" de "caiu por outro motivo".
 */
const casos = [
  {
    nome: 'service worker limpando todos os caches',
    arquivo: SW,
    estragar: (t) => t.replace('caches.delete(nome)', 'caches.delete()'),
    esperado: 'limpeza genérica',
  },
  {
    nome: 'service worker apagando a fila de fiscalização',
    arquivo: SW,
    estragar: (t) => t.replace("sw.addEventListener('message'", "localStorage.clear();\nsw.addEventListener('message'"),
    esperado: 'localStorage.clear()',
  },
  {
    nome: 'service worker guardando resposta de login',
    arquivo: SW,
    estragar: (t) => t.replace("const PREFIXO_DO_APP = 'sifau-';", "const PREFIXO_DO_APP = 'sifau-';\nconst BANCO = 'https://xyz.supabase.co/';"),
    esperado: 'banco como arquivo local',
  },
  {
    nome: 'service worker servindo a versão antiga do aplicativo',
    arquivo: SW,
    estragar: (t) => t.replace("if (requisicao.mode === 'navigate') {", 'if (false) {'),
    esperado: 'rede-primeiro para a casca',
  },
  {
    nome: 'service worker sem prazo para a rede',
    arquivo: SW,
    // Tira o prazo por inteiro: a declaração E o uso. Só renomear a declaração
    // não seria um defeito de verdade — o uso continuaria lá.
    estragar: (t) =>
      t
        .replace('const ESPERA_MAXIMA_MS = 3500;', '// sem prazo nenhum')
        .replace('comPrazo(daRede, ESPERA_MAXIMA_MS)', 'daRede'),
    esperado: 'sem prazo para a rede',
  },
  {
    nome: 'casca apontando para arquivo que não existe',
    arquivo: SW,
    estragar: (t) => t.replace("'./offline.html'", "'./pagina-que-nao-existe.html'"),
    esperado: 'que não existe em public/',
  },
  {
    nome: 'manifest abrindo com barra de navegador',
    arquivo: MANIFEST,
    estragar: (t) => t.replace('"display": "standalone"', '"display": "browser"'),
    esperado: 'standalone',
  },
  {
    nome: 'manifest com ícone em caminho absoluto',
    arquivo: MANIFEST,
    estragar: (t) => t.replace('"./icone-192.png"', '"/icone-192.png"'),
    esperado: 'caminho absoluto',
  },
  {
    nome: 'página sem conexão buscando algo de fora',
    arquivo: OFFLINE,
    estragar: (t) => t.replace('<body>', '<body>\n    <img src="https://exemplo.invalido/logo.png" alt="" />'),
    esperado: 'carrega algo de fora',
  },
  {
    nome: 'registro sem `updateViaCache`',
    arquivo: REGISTRO,
    estragar: (t) => t.replace("updateViaCache: 'none',", ''),
    esperado: 'updateViaCache',
  },
  {
    nome: 'build que não compila o service worker',
    arquivo: PACKAGE,
    estragar: (t) => t.replace('vite build && node assets/pwa/compilar.mjs', 'vite build'),
    esperado: 'não compila o service worker',
  },
  {
    nome: 'manifest editado à mão em public/',
    arquivo: MANIFEST,
    estragar: (t) => t.replace('"SIFAU"', '"SIFAU "'),
    esperado: 'diferente do que a fonte gera',
  },
];

let problemas = 0;
for (const caso of casos) {
  const original = readFileSync(caso.arquivo, 'utf8');
  const estragado = caso.estragar(original);

  if (estragado === original) {
    console.error(`✗ ${caso.nome}: o defeito não chegou a ser injetado (o texto mudou de lugar?)`);
    problemas += 1;
    continue;
  }

  writeFileSync(caso.arquivo, estragado, 'utf8');
  let saida = '';
  let reprovou = false;
  try {
    execFileSync(process.execPath, [join(RAIZ, 'tests', 'check-pwa.mjs')], { encoding: 'utf8', stdio: 'pipe' });
  } catch (erro) {
    reprovou = true;
    saida = `${erro.stdout ?? ''}${erro.stderr ?? ''}`;
  } finally {
    writeFileSync(caso.arquivo, original, 'utf8');
  }

  if (!reprovou) {
    console.error(`✗ ${caso.nome}: a verificação PASSOU com o defeito no lugar — é ela que está quebrada`);
    problemas += 1;
    continue;
  }
  if (!saida.includes(caso.esperado)) {
    console.error(`✗ ${caso.nome}: reprovou, mas por outro motivo. Esperado citar "${caso.esperado}":`);
    console.error(saida.split('\n').slice(0, 4).map((l) => `      ${l}`).join('\n'));
    problemas += 1;
    continue;
  }
  console.log(`✓ ${caso.nome} → reprovado pelo motivo certo`);
}

// Conferência final: com tudo restaurado, a verificação precisa voltar a passar.
execFileSync(process.execPath, [join(RAIZ, 'tests', 'check-pwa.mjs')], { stdio: 'inherit' });

if (problemas > 0) {
  console.error(`\n${problemas} defeito(s) que a verificação de instalação não pega.`);
  process.exit(1);
}
console.log(`\n✓ ${casos.length} defeitos injetados: todos pegos, todos pelo motivo certo, e nada ficou alterado`);

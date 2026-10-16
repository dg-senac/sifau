// ============================================================================
// SIFAU — Verificação dos recursos de instalação (o que o passo 14 acrescenta)
// ============================================================================
// O que este teste protege, em ordem de importância:
//
// 1. **O aplicativo não pode perder o que está guardado no aparelho por causa
//    de um service worker mal escrito.** Este é o defeito que justifica o
//    arquivo existir: a fila de fiscalização (o que o fiscal registrou sem
//    sinal) mora no armazenamento do aparelho. Um service worker que apagasse
//    esse armazenamento na troca de versão destruiria justamente o dado que não
//    tem como ser recuperado em nenhum outro lugar.
//
// 2. **O que pode ser guardado e o que nunca pode.** O service worker guarda os
//    ARQUIVOS do aplicativo para abrir sem rede. Ele não pode guardar a resposta
//    de login nem endereço temporário de arquivo: é dado de sessão e de
//    fiscalização, e guardar isso no cache faria um dado de um aparelho
//    aparecer em outro, ou sobreviver ao encerramento da sessão.
//
// 3. **O aplicativo não pode ficar preso a uma cópia antiga.** A casca é servida
//    da rede primeiro, e a versão nova é apresentada ao fiscal em vez de tomar o
//    lugar da antiga no meio de uma vistoria.
//
// 4. **Os arquivos gerados são os que a fonte gera.** O manifest e a página de
//    "sem conexão" saem de `assets/pwa/gerar.mjs`; se alguém editar em `public/`,
//    o teste avisa.
//
// Uso: `npm run test:pwa`
// ============================================================================

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { arquivosDoPwa, caminhoDoPwa } from '../assets/pwa/gerar.mjs';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLICO = join(RAIZ, 'public');

let falhas = 0;
function conferir(condicao, mensagem, detalhe = '') {
  if (condicao) return;
  console.error(`✗ ${mensagem}${detalhe ? `\n    ${detalhe}` : ''}`);
  falhas += 1;
}

// ── 0. Os arquivos gerados são os que a fonte gera ──────────────────────────
for (const { arquivo, conteudo } of arquivosDoPwa()) {
  let noDisco = null;
  try {
    noDisco = readFileSync(caminhoDoPwa(arquivo), 'utf8');
  } catch {
    conferir(false, `public/${arquivo} não existe`, 'rode `npm run pwa:gerar`');
    continue;
  }
  conferir(
    noDisco === conteudo,
    `public/${arquivo} está diferente do que a fonte gera`,
    'rode `npm run pwa:gerar` — não edite o arquivo em public/ à mão',
  );
}

// ── 1. manifest ─────────────────────────────────────────────────────────────
const caminhoManifest = join(PUBLICO, 'manifest.webmanifest');
conferir(existsSync(caminhoManifest), 'public/manifest.webmanifest não existe');

if (existsSync(caminhoManifest)) {
  const manifest = JSON.parse(readFileSync(caminhoManifest, 'utf8'));
  conferir(manifest.name === 'SIFAU', 'o nome do aplicativo no manifest está errado', `valor: ${manifest.name}`);
  conferir(
    manifest.short_name === 'SIFAU',
    'o nome curto (o que aparece embaixo do ícone) está errado',
    `valor: ${manifest.short_name}`,
  );
  conferir(manifest.start_url === './', 'o aplicativo precisa abrir no próprio endereço', `valor: ${manifest.start_url}`);
  conferir(
    manifest.display === 'standalone',
    'sem `standalone` o atalho abre com barra de navegador',
    `valor: ${manifest.display}`,
  );
  conferir(
    manifest.theme_color === '#0d428b',
    'a cor da barra do sistema não é a da marca',
    `valor: ${manifest.theme_color}`,
  );
  // Caminho relativo: o sistema precisa funcionar publicado numa subpasta.
  for (const campo of ['start_url', 'scope', 'id']) {
    conferir(
      !String(manifest[campo] ?? '').startsWith('/'),
      `o campo \`${campo}\` usa caminho absoluto: o aplicativo quebraria numa subpasta`,
      `valor: ${manifest[campo]}`,
    );
  }

  const icones = manifest.icons ?? [];
  conferir(icones.length >= 2, 'faltam ícones no manifest', `encontrados: ${icones.length}`);
  const propositos = icones.map((i) => i.purpose).filter(Boolean).join(' ');
  conferir(
    propositos.includes('maskable'),
    'falta um ícone `maskable`: sem ele o ícone fica com borda branca em alguns aparelhos',
  );

  for (const icone of icones) {
    conferir(!icone.src.startsWith('/'), `o ícone ${icone.src} usa caminho absoluto`);
    conferir(existsSync(join(PUBLICO, icone.src.replace(/^\.\//, ''))), `o ícone declarado não existe: ${icone.src}`);
  }

  // Um atalho para o fiscal abrir "nova ocorrência" direto é o tipo de coisa
  // que se perde numa limpeza; se existir, tem que estar certo.
  for (const atalho of manifest.shortcuts ?? []) {
    conferir(Boolean(atalho.name && atalho.url), `atalho incompleto no manifest: ${JSON.stringify(atalho)}`);
  }
}

// ── 2. página sem conexão ───────────────────────────────────────────────────
const caminhoOffline = join(PUBLICO, 'offline.html');
conferir(
  existsSync(caminhoOffline),
  'public/offline.html não existe — sem rede o fiscal veria a tela de erro do navegador',
);
if (existsSync(caminhoOffline)) {
  const offline = readFileSync(caminhoOffline, 'utf8');
  // Ela é servida sem rede nenhuma: não pode buscar nada de fora.
  conferir(
    !/(src|href)\s*=\s*["']https?:/i.test(offline),
    'a página sem conexão carrega algo de fora — ela precisa ser um arquivo só, sem rede',
  );
  conferir(/Tentar de novo/i.test(offline), 'a página sem conexão não oferece uma forma de tentar de novo');
}

// ── 3. service worker ───────────────────────────────────────────────────────
const caminhoSw = join(RAIZ, 'src', 'service-worker.ts');
conferir(existsSync(caminhoSw), 'src/service-worker.ts não existe: o aplicativo não é instalável nem abre sem rede');

if (existsSync(caminhoSw)) {
  const sw = readFileSync(caminhoSw, 'utf8');

  // (1) Nada de limpeza genérica de armazenamento.
  const limpezasProibidas = [
    [/caches\.delete\s*\(\s*\)/, '`caches.delete()` sem nome apaga todos os caches do aplicativo'],
    [/localStorage\.clear\s*\(/, '`localStorage.clear()` apagaria a fila de fiscalização pendente'],
    [/indexedDB\.deleteDatabase/, 'apagar banco do IndexedDB pode apagar dados pendentes do aparelho'],
  ];
  for (const [padrao, motivo] of limpezasProibidas) {
    conferir(!padrao.test(sw), `o service worker contém limpeza genérica de armazenamento: ${motivo}`);
  }

  // (2) Limpeza restrita ao que é do SIFAU e não é da versão atual.
  const limpezaSeletiva = /keys\s*\(\s*\)[\s\S]{0,400}(startsWith|includes)\(/.test(sw);
  conferir(limpezaSeletiva, 'o service worker não limpa apenas os caches do SIFAU (o certo é filtrar por prefixo)');
  conferir(/sifau-/i.test(sw), 'o service worker não marca seus caches com um prefixo próprio');

  // (3) O que não pode ser guardado nem virar arquivo local.
  const proibicoes = [
    [/supabase\.co/i, 'o service worker não pode tratar o banco como arquivo local'],
    [/signedUrl|signed_url/i, 'o service worker não pode guardar endereço temporário de arquivo'],
    [/\/auth\/v1\//, 'o service worker não pode guardar resposta de autenticação'],
    [/\/rest\/v1\//, 'o service worker não pode guardar resposta de dados'],
  ];
  for (const [padrao, motivo] of proibicoes) {
    conferir(!padrao.test(sw), motivo);
  }
  conferir(
    /headers\.has\(['"]authorization['"]\)/.test(sw),
    'o service worker não recusa pedidos com cabeçalho de autorização — é assim que dado de um usuário não vira arquivo em cache',
  );
  conferir(
    /url\.origin\s*!==\s*sw\.location\.origin/.test(sw),
    'o service worker não limita o que trata ao próprio endereço do aplicativo',
  );

  // (4) A casca é servida da rede primeiro, com prazo, e a versão antiga nunca
  //     fica no lugar da nova enquanto houver rede.
  conferir(
    /redePrimeiro/.test(sw) && /requisicao\.mode === 'navigate'/.test(sw),
    'o service worker não usa rede-primeiro para a casca: ele pode servir uma versão velha do aplicativo',
  );
  conferir(/ignoreSearch/.test(sw), 'o service worker não ignora os parâmetros do endereço ao procurar no cache');
  // O prazo precisa estar DECLARADO e USADO: procurar só o nome deixaria passar
  // um prazo declarado e nunca aplicado — foi o que aconteceu na primeira
  // versão desta verificação, e o defeito injetado de propósito a pegou.
  const usosDoPrazo = (sw.match(/ESPERA_MAXIMA_MS/g) ?? []).length;
  conferir(
    /setTimeout\(/.test(sw) && usosDoPrazo >= 2,
    'sem prazo para a rede, aparelho conectado a um wi-fi que não responde deixa a tela branca',
    `declarações e usos do prazo encontrados: ${usosDoPrazo}`,
  );

  // (5) A casca aponta para arquivos que existem.
  const dentroDaCasca = [...sw.matchAll(/'(\.\/[^']+)'/g)].map((m) => m[1]);
  for (const caminho of new Set(dentroDaCasca)) {
    conferir(
      existsSync(join(PUBLICO, caminho.replace(/^\.\//, ''))),
      `a casca do service worker cita ${caminho}, que não existe em public/`,
      'a lista da casca precisa apontar só para arquivos que existem',
    );
  }
}

// ── 4. ligação: registro, build e aviso de versão nova ──────────────────────
const caminhoRegistro = join(RAIZ, 'src', 'registrarServiceWorker.ts');
conferir(
  existsSync(caminhoRegistro),
  'falta o registro do service worker: sem ele o arquivo existe mas nunca é ativado',
);

if (existsSync(caminhoRegistro)) {
  const registro = readFileSync(caminhoRegistro, 'utf8');
  conferir(
    /import\.meta\.env\.PROD/.test(registro),
    'o registro não se limita ao aplicativo construído: em desenvolvimento, guardar em cache faria a tela não mudar depois da edição',
  );
  conferir(
    /isNativePlatform/.test(registro),
    'o registro não evita o aplicativo instalado, onde quem serve os arquivos é o próprio aparelho',
  );
  // A opção de verdade, e não a citação dela num comentário: a primeira versão
  // desta verificação se satisfazia com o comentário ao lado do código.
  conferir(
    /updateViaCache:\s*'none'/.test(registro),
    'faltando `updateViaCache: none`, o navegador pode usar por 24 horas uma cópia antiga do próprio service worker',
  );
  conferir(/scope:\s*'\.\/'/.test(registro), 'o service worker precisa registrar com escopo relativo');
}

const main = readFileSync(join(RAIZ, 'src', 'main.tsx'), 'utf8');
conferir(/AvisoDeAtualizacao/.test(main), 'o aviso de versão nova não está montado no aplicativo');

const pacote = JSON.parse(readFileSync(join(RAIZ, 'package.json'), 'utf8'));
conferir(
  /compilar\.mjs/.test(pacote.scripts?.build ?? ''),
  'o `npm run build` não compila o service worker: o aplicativo sairia sem funcionar sem conexão',
);
conferir(
  /compilar\.mjs/.test(pacote.scripts?.typecheck ?? '') ||
    /tsconfig\.worker\.json/.test(pacote.scripts?.typecheck ?? ''),
  'o service worker não entra na checagem de tipos',
);

// ── 5. HTML: os arquivos de instalação estão ligados ───────────────────────
const html = readFileSync(join(RAIZ, 'index.html'), 'utf8');
conferir(html.includes('manifest.webmanifest'), 'index.html não aponta para o manifest', 'sem isso o app não é instalável');
conferir(
  /apple-mobile-web-app|apple-touch-icon/i.test(html),
  'index.html não tem as marcações de instalação no iPhone/iPad',
);

if (falhas > 0) {
  console.error(`\n${falhas} problema(s) na configuração de instalação do aplicativo.`);
  process.exit(1);
}
console.log('✓ instalação conferida: manifest, ícones, casca, página sem conexão, service worker e registro');

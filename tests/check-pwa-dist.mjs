// ============================================================================
// SIFAU — Verificação do aplicativo JÁ CONSTRUÍDO (a pasta dist/)
// ============================================================================
// A verificação de origem (`tests/check-pwa.mjs`) lê o código. Esta lê o que
// saiu da construção — e as duas não são a mesma coisa. Um service worker pode
// estar correto no código e não chegar ao `dist/`, e aí o aplicativo sai sem
// funcionar sem conexão, sem nenhum aviso.
//
// A conferência mais importante daqui é a da versão: o service worker carrega a
// impressão digital de tudo o que foi construído. Se ela não bater com o que
// está em `dist/`, é sinal de que os arquivos foram trocados depois e os fiscais
// ficariam presos numa versão antiga — o tipo de erro que não aparece em teste
// de tela.
//
// Uso: `npm run test:pwa:dist` (depois de `npm run build`)
// ============================================================================

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';

import { NOME_DO_ARQUIVO, versaoDoQueFoiConstruido } from '../assets/pwa/compilar.mjs';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(RAIZ, 'dist');

let falhas = 0;
function conferir(condicao, mensagem, detalhe = '') {
  if (condicao) return;
  console.error(`✗ ${mensagem}${detalhe ? `\n    ${detalhe}` : ''}`);
  falhas += 1;
}

if (!existsSync(DIST)) {
  console.error('✗ a pasta dist/ não existe: rode `npm run build` antes desta verificação.');
  process.exit(1);
}

function arquivosDe(pasta, extensoes) {
  const encontrados = [];
  for (const entrada of readdirSync(pasta)) {
    const caminho = join(pasta, entrada);
    if (statSync(caminho).isDirectory()) encontrados.push(...arquivosDe(caminho, extensoes));
    else if (!extensoes || extensoes.some((ext) => entrada.endsWith(ext))) encontrados.push(caminho);
  }
  return encontrados;
}

// ── 1. Os arquivos de instalação chegaram ao dist ───────────────────────────
for (const arquivo of ['manifest.webmanifest', 'offline.html', 'index.html', NOME_DO_ARQUIVO]) {
  conferir(existsSync(join(DIST, arquivo)), `dist/${arquivo} não existe`);
}

// ── 2. Os ícones declarados no manifest estão lá ────────────────────────────
const caminhoManifest = join(DIST, 'manifest.webmanifest');
if (existsSync(caminhoManifest)) {
  const manifest = JSON.parse(readFileSync(caminhoManifest, 'utf8'));
  for (const icone of manifest.icons ?? []) {
    conferir(
      existsSync(join(DIST, icone.src.replace(/^\.\//, ''))),
      `o manifest cita ${icone.src}, que não está no dist`,
    );
  }
}

// ── 3. O service worker é o da versão que está em dist ──────────────────────
const caminhoSw = join(DIST, NOME_DO_ARQUIVO);
if (existsSync(caminhoSw)) {
  const codigo = readFileSync(caminhoSw, 'utf8');

  // Sintaxe: um service worker que não compila é recusado pelo navegador, e o
  // aplicativo simplesmente deixa de ter funcionamento sem conexão — em
  // silêncio. `vm.Script` confere a sintaxe sem executar nada.
  try {
    new Script(codigo);
  } catch (erro) {
    conferir(false, 'o service worker construído não é um arquivo válido', String(erro));
  }

  // O compilador pode escrever `sifau-2217d85f1d46` ou `sifau-${"2217d85f1d46"}`,
  // conforme a versão dele: o que importa é a sequência de dígitos no fim.
  const versaoNoArquivo = /sifau-[^0-9a-f]{0,8}([0-9a-f]{12})/.exec(codigo)?.[1];
  conferir(Boolean(versaoNoArquivo), 'o service worker não carrega a versão do que foi construído');

  if (versaoNoArquivo) {
    const versaoEsperada = versaoDoQueFoiConstruido();
    conferir(
      versaoNoArquivo === versaoEsperada,
      'a versão do service worker não corresponde ao que está em dist: os arquivos foram trocados depois da construção, e os fiscais ficariam presos na versão antiga',
      `no arquivo: ${versaoNoArquivo} · no dist: ${versaoEsperada}`,
    );
  }

  // A limpeza genérica também é conferida aqui, no arquivo que vai para o
  // navegador — é ele que roda no aparelho, não o código-fonte.
  conferir(!/caches\.delete\(\s*\)/.test(codigo), 'o service worker construído tem limpeza genérica de cache');
  conferir(!/localStorage\.clear\s*\(/.test(codigo), 'o service worker construído pode apagar a fila de fiscalização');
}

// ── 4. Nada de terceiros no que foi construído ──────────────────────────────
// Esta é a prova de verdade do que o `test:assets` confere na origem: o que
// chega ao aparelho não pode depender de nenhum servidor de fora para desenhar
// a tela.
const PROIBIDOS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdn.jsdelivr.net', 'unpkg.com'];
for (const caminho of arquivosDe(DIST, ['.css', '.js', '.html'])) {
  const conteudo = readFileSync(caminho, 'utf8');
  for (const host of PROIBIDOS) {
    conferir(
      !conteudo.includes(host),
      `o dist busca recurso de ${host}`,
      `${caminho.slice(DIST.length + 1)} — o aplicativo precisa funcionar sem internet`,
    );
  }
}

// ── 5. As fontes viajaram junto ─────────────────────────────────────────────
const fontes = arquivosDe(DIST, ['.woff2']);
conferir(fontes.length >= 6, 'as fontes não estão no dist: sem internet o aplicativo abriria com outra tipografia', `arquivos de fonte encontrados: ${fontes.length}`);

// ── 6. O HTML construído aponta para o manifest ─────────────────────────────
const html = readFileSync(join(DIST, 'index.html'), 'utf8');
conferir(html.includes('manifest.webmanifest'), 'o index.html construído não aponta para o manifest');

if (falhas > 0) {
  console.error(`\n${falhas} problema(s) no aplicativo construído.`);
  process.exit(1);
}
console.log('✓ aplicativo construído: instalável, com service worker da versão certa, fontes próprias e nada de terceiros');

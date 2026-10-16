// ============================================================================
// SIFAU — Nenhum recurso visual vindo de fora do aplicativo
// ============================================================================
// Esta checagem existe por um defeito real que esteve no projeto desde o
// começo: o `src/index.css` abria com um `@import` das fontes do Google. Isso
// significava que, sem internet, o aplicativo abria com a tipografia do
// sistema — e o campo é justamente onde a conexão falha. Também significava
// mandar o IP de quem abria o app para um terceiro, a cada abertura.
//
// A regra aqui é estreita de propósito: só fontes e ícones de terceiros, que
// não têm razão para existir num aplicativo que precisa funcionar offline.
// O mapa de fundo é exceção conhecida e deliberada (o Leaflet busca as
// imagens dos servidores de mapa) — por isso ele não é citado nesta lista.
//
// Uso: `node tests/check-external-assets.mjs`
// ============================================================================

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = new URL('..', import.meta.url).pathname;

// Hosts que não podem aparecer em código do aplicativo.
const PROIBIDOS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'use.typekit.net',
  'fonts.bunny.net',
  'cdnjs.cloudflare.com',
  'unpkg.com',
  'cdn.jsdelivr.net',
];

const EXTENSOES = ['.css', '.ts', '.tsx', '.html', '.json'];
const IGNORAR = new Set(['node_modules', 'dist', '.git', 'android', 'ios', 'tests']);

function arquivos(diretorio) {
  const encontrados = [];
  for (const entrada of readdirSync(diretorio)) {
    if (IGNORAR.has(entrada)) continue;
    const caminho = join(diretorio, entrada);
    if (statSync(caminho).isDirectory()) encontrados.push(...arquivos(caminho));
    else if (EXTENSOES.some((ext) => entrada.endsWith(ext))) encontrados.push(caminho);
  }
  return encontrados;
}

const alvos = [
  join(RAIZ, 'index.html'),
  ...arquivos(join(RAIZ, 'src')),
].filter((caminho) => {
  try {
    return statSync(caminho).isFile();
  } catch {
    return false;
  }
});

const achados = [];
for (const caminho of alvos) {
  const conteudo = readFileSync(caminho, 'utf8');
  conteudo.split('\n').forEach((linha, indice) => {
    const inicio = linha.trim();
    // Comentário que só explica o defeito antigo é permitido; a URL em si, não.
    // A comparação é feita na linha crua: cortar `//` a partir daqui apagaria o
    // host junto com o `//` de `https://` — foi o que aconteceu na primeira
    // versão desta checagem, e ela deixou passar a injeção que deveria pegar.
    if (inicio.startsWith('//') || inicio.startsWith('*') || inicio.startsWith('/*') || inicio.startsWith('* ')) {
      return;
    }
    for (const host of PROIBIDOS) {
      if (linha.includes(host)) {
        achados.push({ caminho: caminho.slice(RAIZ.length), linha: indice + 1, host });
      }
    }
  });
}

if (achados.length > 0) {
  console.error('✗ recurso externo de terceiro no código do aplicativo:');
  for (const { caminho, linha, host } of achados) {
    console.error(`    ${caminho}:${linha} → ${host}`);
  }
  console.error('');
  console.error('  Fontes e ícones precisam ser servidos pelo próprio aplicativo:');
  console.error('  o app roda em campo, sem sinal, e não pode depender de terceiros.');
  process.exit(1);
}

console.log(`✓ nenhuma fonte ou ícone de terceiro em ${alvos.length} arquivos verificados`);

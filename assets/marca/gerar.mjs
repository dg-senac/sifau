// ============================================================================
// Gera os arquivos da marca em `public/` a partir de `src/lib/marca.ts`.
//
// Por que existe: o mesmo desenho aparece no aplicativo (componentes React),
// nos arquivos soltos (landing page, impressão) e no ícone que o aparelho
// mostra. Se cada lado fosse desenhado à mão, as versões iam divergir na
// primeira correção.
//
// Uso: `npm run marca:gerar`
// Conferência (roda no `npm run verify`): `npm run test:marca`
// ============================================================================

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import sharp from 'sharp';

import {
  svgIcone,
  svgLogoHorizontal,
  svgLogoMonocromatico,
  svgLogoVertical,
  svgSimbolo,
} from '../../src/lib/marca.ts';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUBLICO = join(RAIZ, 'public');

/** Arquivos de texto (SVG). A ordem é a de `public/`, e o teste compara. */
export function arquivosDaMarca() {
  return [
    { arquivo: 'icon.svg', conteudo: svgIcone() },
    { arquivo: 'logo-simbolo.svg', conteudo: svgSimbolo() },
    { arquivo: 'logo-horizontal.svg', conteudo: svgLogoHorizontal() },
    { arquivo: 'logo-vertical.svg', conteudo: svgLogoVertical() },
    { arquivo: 'logo-monocromatica.svg', conteudo: svgLogoMonocromatico() },
  ];
}

/**
 * Ícones em PNG, cada um com o desenho de origem e o lado em pixels.
 *
 * Eles existem porque o sistema exige PNG para instalar o atalho: o Android e o
 * iPhone não aceitam SVG na tela de início. Por isso a fonte continua sendo o
 * mesmo desenho — o PNG é só a reprodução.
 *
 * Os dois últimos são de fundo cheio (`raio: 0`): quem recorta a forma é o
 * aparelho, e o arquivo precisa encher o quadrado até a borda, senão sobra
 * fundo branco ou preto nos cantos recortados.
 */
export function iconesDaMarca() {
  const cheio = (id) => svgIcone({ id, raio: 0 });
  return [
    { arquivo: 'icone-192.png', svg: svgIcone({ id: 'sifau-192' }), px: 192 },
    { arquivo: 'icone-512.png', svg: svgIcone({ id: 'sifau-512' }), px: 512 },
    { arquivo: 'icone-maskable-512.png', svg: cheio('sifau-maskable'), px: 512 },
    { arquivo: 'apple-touch-icon.png', svg: cheio('sifau-apple'), px: 180 },
  ];
}

/** Caminho absoluto de um arquivo gerado. */
export function caminhoDaMarca(arquivo) {
  return join(PUBLICO, arquivo);
}

/** Reproduz um ícone em memória, do jeito que ele é gravado. */
export async function renderizarIcone({ svg, px }) {
  return sharp(Buffer.from(svg), { density: 600 }).resize(px, px).png().toBuffer();
}

async function gerar() {
  for (const { arquivo, conteudo } of arquivosDaMarca()) {
    writeFileSync(caminhoDaMarca(arquivo), conteudo, 'utf8');
    console.log(`✓ public/${arquivo}`);
  }
  for (const icone of iconesDaMarca()) {
    writeFileSync(caminhoDaMarca(icone.arquivo), await renderizarIcone(icone));
    console.log(`✓ public/${icone.arquivo} (${icone.px}px)`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await gerar();
}

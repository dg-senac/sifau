// ============================================================================
// SIFAU — A marca do aplicativo e a marca dos arquivos não podem divergir
// ============================================================================
// `src/lib/marca.ts` monta os desenhos; `assets/marca/gerar.mjs` grava os
// arquivos de `public/`. Este teste confere que os arquivos gravados são
// exatamente o que a fonte gera hoje.
//
// Sem ele, o caminho mais provável seria: alguém ajusta um arquivo de `public/`
// na mão, para a landing page, e meses depois o aplicativo e o site mostram
// marcas levemente diferentes — o tipo de defeito que ninguém percebe olhando
// uma tela só.
//
// Os SVG são comparados byte a byte. Os PNG são comparados **pixel a pixel**,
// e não byte a byte, de propósito: dois codificadores PNG diferentes produzem
// arquivos diferentes com a mesma imagem, e o que interessa aqui é a imagem.
//
// Uso: `npm run test:marca`
// ============================================================================

import { readFileSync } from 'node:fs';

import sharp from 'sharp';

import {
  arquivosDaMarca,
  caminhoDaMarca,
  iconesDaMarca,
  renderizarIcone,
} from '../assets/marca/gerar.mjs';

const divergentes = [];

// ── SVG: byte a byte ────────────────────────────────────────────────────────
for (const { arquivo, conteudo } of arquivosDaMarca()) {
  let noDisco = null;
  try {
    noDisco = readFileSync(caminhoDaMarca(arquivo), 'utf8');
  } catch {
    divergentes.push(`${arquivo}: não existe`);
    continue;
  }
  if (noDisco !== conteudo) divergentes.push(`${arquivo}: diferente do que a fonte gera`);
}

// ── PNG: mesmo desenho, mesmos pixels ───────────────────────────────────────
for (const icone of iconesDaMarca()) {
  const { arquivo, px } = icone;
  let noDisco;
  try {
    noDisco = await sharp(caminhoDaMarca(arquivo)).raw().toBuffer({ resolveWithObject: true });
  } catch {
    divergentes.push(`${arquivo}: não existe ou não é uma imagem que dá para ler`);
    continue;
  }

  const esperado = await sharp(await renderizarIcone(icone)).raw().toBuffer({ resolveWithObject: true });

  if (noDisco.info.width !== px || noDisco.info.height !== px) {
    divergentes.push(
      `${arquivo}: ${noDisco.info.width}x${noDisco.info.height} pixels, e o tamanho declarado é ${px}x${px}`,
    );
    continue;
  }
  if (noDisco.info.width !== esperado.info.width || noDisco.info.height !== esperado.info.height) {
    divergentes.push(`${arquivo}: tamanho diferente do que a fonte gera`);
    continue;
  }
  if (!noDisco.data.equals(esperado.data)) {
    divergentes.push(`${arquivo}: o desenho no disco não é o que a fonte gera`);
  }
}

if (divergentes.length > 0) {
  console.error('✗ a marca em public/ não bate com src/lib/marca.ts:');
  for (const linha of divergentes) console.error(`    ${linha}`);
  console.error('');
  console.error('  Rode `npm run marca:gerar` e confira o resultado antes de enviar.');
  process.exit(1);
}

const total = arquivosDaMarca().length + iconesDaMarca().length;
console.log(`✓ ${total} arquivos da marca batem com src/lib/marca.ts`);

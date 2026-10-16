// ============================================================================
// Compila o service worker para dentro de `dist/`.
//
// Por que ele precisa de um passo só dele: o service worker não faz parte do
// pacote do aplicativo. Ele é um arquivo separado, que o navegador baixa por
// conta própria e roda num contexto sem tela. Se entrasse no pacote, o Vite lhe
// daria um nome embaralhado, e o navegador precisa encontrá-lo em um endereço
// fixo (`/service-worker.js`) para poder atualizá-lo.
//
// A versão injetada aqui é a **impressão digital de tudo o que foi construído**:
// qualquer mudança no aplicativo muda essa impressão, o arquivo do service
// worker muda junto, e o navegador instala a versão nova em vez de continuar
// servindo a antiga.
//
// Uso: `npm run build` (roda depois do `vite build`).
// Conferência: `npm run test:pwa:dist`.
// ============================================================================

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

import { build } from 'vite';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIST = join(RAIZ, 'dist');
/** Endereço fixo: é onde o navegador procura para atualizar. */
export const NOME_DO_ARQUIVO = 'service-worker.js';

/** Todos os arquivos de uma pasta, em ordem, pulando subpastas de controle. */
function arquivosDe(pasta) {
  const encontrados = [];
  for (const entrada of readdirSync(pasta)) {
    const caminho = join(pasta, entrada);
    if (statSync(caminho).isDirectory()) encontrados.push(...arquivosDe(caminho));
    else encontrados.push(caminho);
  }
  return encontrados.sort();
}

/**
 * Impressão digital do que foi construído.
 *
 * O próprio service worker fica de fora: ele contém a versão, então incluí-lo
 * criaria um vaivém — a versão dependeria do arquivo, que depende da versão.
 */
export function versaoDoQueFoiConstruido() {
  if (!existsSync(DIST)) {
    throw new Error('A pasta dist/ não existe: rode `vite build` antes de compilar o service worker.');
  }
  const impressao = createHash('sha256');
  for (const caminho of arquivosDe(DIST)) {
    if (caminho.endsWith(NOME_DO_ARQUIVO)) continue;
    impressao.update(relative(DIST, caminho));
    impressao.update(readFileSync(caminho));
  }
  return impressao.digest('hex').slice(0, 12);
}

export async function compilarServiceWorker(versao = versaoDoQueFoiConstruido()) {
  await build({
    configFile: false,
    root: RAIZ,
    logLevel: 'warn',
    // O texto é substituído no momento da compilação, e é assim que a versão
    // entra no arquivo.
    define: { __VERSAO__: JSON.stringify(versao) },
    build: {
      outDir: DIST,
      emptyOutDir: false,
      // Sem minificar de propósito: os nomes das funções continuam legíveis no
      // rastreamento de erro. Quando algo dá errado no aparelho do fiscal, é
      // este arquivo que se lê — os comentários o próprio compilador já tira.
      minify: false,
      target: 'es2020',
      lib: {
        entry: join(RAIZ, 'src', 'service-worker.ts'),
        // O formato iife não tem importação nem exportação: é o que o navegador
        // espera de um service worker.
        formats: ['iife'],
        name: 'SifauServiceWorker',
        fileName: () => NOME_DO_ARQUIVO,
      },
    },
  });

  const caminho = join(DIST, NOME_DO_ARQUIVO);
  if (!existsSync(caminho)) {
    throw new Error(`O service worker não foi gerado em ${caminho}.`);
  }
  const texto = readFileSync(caminho, 'utf8');
  if (!texto.includes(versao)) {
    throw new Error('O service worker foi gerado sem a versão: a atualização automática não funcionaria.');
  }
  return { caminho, versao, bytes: Buffer.byteLength(texto) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { versao, bytes } = await compilarServiceWorker();
  console.log(`✓ dist/${NOME_DO_ARQUIVO} (versão ${versao}, ${(bytes / 1024).toFixed(1)} kB)`);
}

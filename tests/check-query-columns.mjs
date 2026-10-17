#!/usr/bin/env node
// ============================================================================
// SIFAU — Guarda contra `select('*')` em tabelas com anexo
// ============================================================================
// As tabelas abaixo guardam (ou guardaram) arquivo: quatro delas em base64
// dentro da linha, e `ocorrencias`/`vistorias` agora só com o caminho no
// Storage. Pedir `*` nelas arrasta o anexo para dentro da tela mesmo quando ela
// só mostra texto — foi assim que a tela de início passou a baixar centenas de
// megabytes por abertura, quando as fotos eram base64.
//
// O motivo mudou depois do passo 10 (hoje `ocorrencias.fotos` é caminho, e
// caminho é barato), mas a regra fica: ela mantém explícito o que cada tela lê
// e deixa na fronteira as colunas por onde o base64 pode voltar.
//
//   node tests/check-query-columns.mjs
// ============================================================================

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { REPO_ROOT } from './harness.mjs';

const RESET = '\x1b[0m';
const paint = (c, t) => (process.stdout.isTTY === false ? t : `${c}${t}${RESET}`);
const GREEN = '\x1b[32m', RED = '\x1b[31m', DIM = '\x1b[2m', BOLD = '\x1b[1m';

/**
 * Tabelas que já guardaram arquivo em base64 e a coluna que hoje guarda o
 * CAMINHO. O `select('*')` nelas é proibido: era assim que uma lista de
 * ocorrências trazia, sem ninguém pedir, o conteúdo de todas as fotos.
 *
 * `permitidoEm` é a lista de arquivos onde o `select('*')` continua aceitável,
 * com o motivo. Está vazia de propósito: depois de as cinco colunas migrarem
 * para o Storage, nenhuma lista precisa do arquivo dentro da linha.
 *
 * `admin_messages` saiu da lista quando `attachments` passou a guardar
 * caminhos: a linha da mensagem ficou leve, e trazer todas as colunas dela
 * deixou de ser problema.
 */
const TABELAS_PESADAS = {
  ocorrencias: { coluna: 'fotos', permitidoEm: [] },
  vistorias: { coluna: 'fotos_depois', permitidoEm: [] },
  autos_infracao: { coluna: 'assinatura_autuado', permitidoEm: [] },
  documentos: { coluna: 'arquivo_path', permitidoEm: [] },
};

function arquivosFonte(dir) {
  const saida = [];
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) saida.push(...arquivosFonte(caminho));
    else if (/\.(ts|tsx)$/.test(nome)) saida.push(caminho);
  }
  return saida;
}

const problemas = [];

// --- 1. Nenhum select('*') em tabela com anexo ------------------------------
for (const caminho of arquivosFonte(join(REPO_ROOT, 'src'))) {
  const rel = relative(REPO_ROOT, caminho);
  const conteudo = readFileSync(caminho, 'utf8').split('\n');

  conteudo.forEach((linha, i) => {
    const m = linha.match(/\.from\(\s*['"](\w+)['"]\s*\)[\s\S]*?\.select\(\s*['"]\*['"]/);
    const tabela = m?.[1];
    if (!tabela || !TABELAS_PESADAS[tabela]) return;

    const { coluna, permitidoEm } = TABELAS_PESADAS[tabela];
    if (permitidoEm.includes(rel)) return;

    problemas.push(
      `${rel}:${i + 1}  select('*') em "${tabela}", que guarda "${coluna}" em base64.\n` +
      `      Use uma lista explícita (src/lib/columns.ts).`,
    );
  });
}

// --- 2. As listas de colunas não podem incluir o anexo ----------------------
const colunasPath = join(REPO_ROOT, 'src/lib/columns.ts');
const colunasFonte = readFileSync(colunasPath, 'utf8');
const constantes = [...colunasFonte.matchAll(/export const (\w+)\s*=\s*\n?\s*'([^']+)'/g)];

if (constantes.length === 0) {
  problemas.push('src/lib/columns.ts: nenhuma constante de colunas encontrada.');
}

for (const [, nome, valor] of constantes) {
  const lista = valor.split(',').map((c) => c.trim());
  for (const { coluna } of Object.values(TABELAS_PESADAS)) {
    if (lista.includes(coluna)) {
      problemas.push(
        `src/lib/columns.ts: a constante ${nome} inclui "${coluna}", que é anexo em base64.\n` +
        `      Listas de colunas não devem trazer anexo.`,
      );
    }
  }
}

// --- 3. Sem duplicidade entre as constantes ---------------------------------
const nomes = constantes.map(([, nome]) => nome);
if (new Set(nomes).size !== nomes.length) {
  problemas.push('src/lib/columns.ts: nome de constante repetido.');
}

// --- Relatório ---------------------------------------------------------------
console.log();
console.log(paint(BOLD, 'SIFAU — colunas de consulta'));
console.log(paint(DIM, `Tabelas com anexo monitoradas: ${Object.keys(TABELAS_PESADAS).join(', ')}`));
console.log(paint(DIM, `Constantes verificadas: ${nomes.join(', ')}`));
console.log();

if (problemas.length === 0) {
  console.log(paint(GREEN, '✓ nenhuma leitura arrasta anexo sem propósito'));
  console.log();
  process.exit(0);
}

console.log(paint(RED, paint(BOLD, `${problemas.length} problema(s):`)));
for (const p of problemas) console.log(paint(RED, `  • ${p}`));
console.log();
process.exit(1);

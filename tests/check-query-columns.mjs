#!/usr/bin/env node
// ============================================================================
// SIFAU — Guarda contra `select('*')` em tabelas com anexo
// ============================================================================
// As tabelas abaixo guardam arquivos em base64 e por isso podem ficar enormes.
// Pedir `*` nelas arrasta os anexos para dentro da tela, mesmo quando ela só
// mostra texto. Foi assim que a tela de início passou a baixar potencialmente
// centenas de megabytes por abertura.
//
// Este script falha se alguém voltar a usar `select('*')` nessas tabelas, ou se
// as listas de colunas de `src/lib/columns.ts` passarem a incluir o anexo.
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
 * Tabelas com coluna de anexo em base64 e a coluna correspondente.
 * `proibido` é a lista de arquivos onde o `select('*')` é aceitável, com o
 * motivo — hoje só há um caso, e ele é temporário.
 */
const TABELAS_PESADAS = {
  ocorrencias: { coluna: 'fotos', permitidoEm: [] },
  vistorias: { coluna: 'fotos_depois', permitidoEm: [] },
  autos_infracao: { coluna: 'assinatura_autuado', permitidoEm: [] },
  documentos: {
    coluna: 'arquivo_data',
    // A galeria precisa do conteúdo para renderizar as imagens e baixar o
    // arquivo. Diferente das listas, aqui o anexo é o propósito da tela.
    // O passo de migração para Supabase Storage substitui isto por URL assinada.
    permitidoEm: ['src/lib/documents.ts'],
  },
  admin_messages: {
    coluna: 'attachments',
    // O painel administrativo exibe os anexos na conversa.
    // MensagensScreen só checa `attachments.length > 0` e poderia usar uma
    // consulta mais leve quando houver contagem no schema.
    permitidoEm: ['src/screens/AdminScreen.tsx', 'src/screens/MessagesScreen.tsx'],
  },
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

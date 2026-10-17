#!/usr/bin/env node
// ============================================================================
// SIFAU — Paridade entre os dois caminhos de instalação
// ============================================================================
// O projeto tem duas formas de criar o banco:
//
//   * supabase/SETUP_COMPLETO.sql   → projeto novo, colado no SQL Editor
//   * supabase/migrations/*.sql     → projeto existente, pela Supabase CLI
//
// Se elas divergirem, um projeto criado pelo SQL Editor fica com schema
// diferente de um criado por migrations — que é exatamente a origem dos
// defeitos encontrados neste repositório (políticas e funções que existiam em
// um caminho e não no outro).
//
// Este script aplica os dois em bancos separados e compara tabelas, funções,
// políticas, colunas, restrições, privilégios e gatilhos. Qualquer divergência
// é falha.
//
//   node tests/compare-install-paths.mjs
// ============================================================================

import { createDatabase } from './harness.mjs';
import { snapshotDb, comparar } from './snapshot.mjs';

const RESET = '\x1b[0m';
const paint = (c, t) => (process.stdout.isTTY === false ? t : `${c}${t}${RESET}`);
const GREEN = '\x1b[32m', RED = '\x1b[31m', DIM = '\x1b[2m', BOLD = '\x1b[1m';

async function retrato(source) {
  const db = await createDatabase({ source });
  const resultado = await snapshotDb(db);
  await db.close();
  return resultado;
}

console.log();
console.log(paint(BOLD, 'SIFAU — paridade entre caminhos de instalação'));
console.log(paint(DIM, 'SETUP_COMPLETO.sql  vs  supabase/migrations/*.sql'));

let setup, migracoes;
try {
  [setup, migracoes] = await Promise.all([retrato('setup'), retrato('migrations')]);
} catch (error) {
  console.error();
  console.error(paint(RED, `✗ não foi possível aplicar um dos caminhos: ${error.message}`));
  process.exit(1);
}

console.log();
let tudoIgual = true;
for (const { chave, igual, soA, soB, total } of comparar(setup, migracoes)) {
  if (!igual) tudoIgual = false;

  const marca = igual ? paint(GREEN, '✓') : paint(RED, '✗');
  console.log(`${marca} ${chave.padEnd(12)} ${total} vs ${migracoes[chave].length}${igual ? '' : '  ← DIVERGEM'}`);
  if (soA.length) console.log(paint(DIM, `    só no SETUP_COMPLETO: ${soA.slice(0, 10).join(', ')}`));
  if (soB.length) console.log(paint(DIM, `    só nas migrations:    ${soB.slice(0, 10).join(', ')}`));
}

console.log();
if (tudoIgual) {
  console.log(paint(GREEN, 'Os dois caminhos de instalação produzem o mesmo schema.'));
  process.exit(0);
}
console.log(paint(RED, paint(BOLD, 'DIVERGÊNCIA: um projeto novo e um migrado ficariam diferentes.')));
console.log(paint(DIM, 'Acrescente o bloco que falta ao SETUP_COMPLETO.sql, na ordem da migration.'));
process.exit(1);

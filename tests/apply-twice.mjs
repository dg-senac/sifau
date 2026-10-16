#!/usr/bin/env node
// ============================================================================
// SIFAU — o script de instalação pode ser executado duas vezes?
// ============================================================================
// Quem instala cola o script no SQL Editor do Supabase e clica em Run. Se algo
// falhar no meio (permissão, timeout, erro ao apagar linha), a pessoa vai
// querer rodar de novo — e um script que não é re-executável deixa o banco em
// estado pela metade, sem caminho de volta.
//
// Este script faz as duas perguntas que importam:
//
//   1. a segunda execução TERMINA? (se não, diz exatamente o comando que quebrou)
//   2. o schema depois da segunda execução é IGUAL ao de depois da primeira?
//      (não basta não quebrar: não pode duplicar nem sobrescrever regra)
//
//   node tests/apply-twice.mjs
// ============================================================================

import { createDatabase, applyRepoSql } from './harness.mjs';
import { snapshotDb, comparar } from './snapshot.mjs';

const RESET = '\x1b[0m';
const paint = (c, t) => (process.stdout.isTTY === false ? t : `${c}${t}${RESET}`);
const GREEN = '\x1b[32m', RED = '\x1b[31m', DIM = '\x1b[2m', BOLD = '\x1b[1m';

const ARQUIVO = 'supabase/SETUP_COMPLETO.sql';

console.log();
console.log(paint(BOLD, 'SIFAU — o script de instalação roda duas vezes?'));
console.log(paint(DIM, ARQUIVO));

const db = await createDatabase({ source: 'setup' });
console.log(paint(GREEN, '✓ primeira aplicação'));

let depoisDaPrimeira;
try {
  depoisDaPrimeira = await snapshotDb(db);
} catch (error) {
  console.error(paint(RED, `✗ não consegui ler o schema depois da primeira aplicação: ${error.message}`));
  await db.close();
  process.exit(1);
}

try {
  await applyRepoSql(db, ARQUIVO);
  console.log(paint(GREEN, '✓ segunda aplicação'));
} catch (error) {
  console.log(paint(RED, '✗ segunda aplicação falhou'));
  console.log();
  console.log(paint(RED, paint(BOLD, 'O script NÃO é re-executável.')));
  console.log(`${paint(DIM, 'erro:')}    ${error.message}`);
  if (error.detail) console.log(`${paint(DIM, 'detalhe:')} ${error.detail}`);
  if (error.hint) console.log(`${paint(DIM, 'dica:')}    ${error.hint}`);
  console.log();
  console.log(paint(DIM, 'Quem colar este script no SQL Editor e precisar rodar de novo'));
  console.log(paint(DIM, 'vai parar neste ponto — corrija antes de entregar.'));
  await db.close();
  process.exit(1);
}

const depoisDaSegunda = await snapshotDb(db);
await db.close();

console.log();
let tudoIgual = true;
for (const { chave, igual, soA, soB, total } of comparar(depoisDaPrimeira, depoisDaSegunda)) {
  if (!igual) tudoIgual = false;
  const marca = igual ? paint(GREEN, '✓') : paint(RED, '✗');
  console.log(`${marca} ${chave.padEnd(12)} ${total} vs ${depoisDaSegunda[chave].length}${igual ? '' : '  ← MUDOU'}`);
  if (soA.length) console.log(paint(DIM, `    só depois da primeira: ${soA.slice(0, 10).join(', ')}`));
  if (soB.length) console.log(paint(DIM, `    só depois da segunda:  ${soB.slice(0, 10).join(', ')}`));
}

console.log();
if (tudoIgual) {
  console.log(paint(GREEN, 'O script é re-executável: rodar de novo não quebra e não muda o schema.'));
  process.exit(0);
}
console.log(paint(RED, paint(BOLD, 'RODAR DE NOVO MUDA O SCHEMA.')));
console.log(paint(DIM, 'Quem executar o script duas vezes fica com um banco diferente de quem executou uma.'));
process.exit(1);

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
// defeitos encontrados neste repositório (políticas e funções que existiam
// em um caminho e não no outro).
//
// Este script aplica os dois em bancos separados e compara tabelas, funções,
// políticas e colunas. Qualquer divergência é falha.
//
//   node tests/compare-install-paths.mjs
// ============================================================================

import { createDatabase } from './harness.mjs';

const RESET = '\x1b[0m';
const paint = (c, t) => (process.stdout.isTTY === false ? t : `${c}${t}${RESET}`);
const GREEN = '\x1b[32m', RED = '\x1b[31m', DIM = '\x1b[2m', BOLD = '\x1b[1m';

// Normaliza o corpo de uma função antes de comparar. Os dois caminhos de
// instalação devem ter a MESMA lógica; o texto dos comentários pode diferir
// (o SETUP_COMPLETO.sql é comentado para quem lê o SQL Editor, a migration é
// comentada para quem lê o histórico). O que não pode diferir é o código.
function normalizarCorpo(corpo) {
  return corpo
    .replace(/--[^\n]*/g, ' ') // comentários de linha
    .replace(/\s+/g, ' ')      // espaços, quebras de linha e indentação
    .trim()
    .toLowerCase();
}

async function snapshot(source) {
  const db = await createDatabase({ source });
  const consultas = {
    tabelas: `SELECT table_name AS v FROM information_schema.tables
              WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY 1`,
    // Compara o CORPO da função, não só o nome: uma correção aplicada em um
    // caminho e esquecida no outro passaria despercebida se só o nome fosse
    // comparado. O corpo e a marcação de SECURITY DEFINER importam — o B2
    // (bootstrap_admin sem ativar o fiscal) só aparece comparando código.
    funcoes: `SELECT p.proname || '(' ||
                     pg_catalog.pg_get_function_identity_arguments(p.oid) || ')' ||
                     ' secdef=' || p.prosecdef ||
                     ' body=' || p.prosrc AS v
              FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public' ORDER BY 1`,
    // Compara a expressão da política, não só o nome: uma política com o mesmo
    // nome e condição diferente é exatamente o tipo de divergência que causou
    // o defeito da trilha de auditoria.
    politicas: `SELECT tablename || ':' || policyname || ' [' || cmd || ']' ||
                      ' using=' || COALESCE(qual, '-') ||
                      ' check=' || COALESCE(with_check, '-') AS v
                FROM pg_policies WHERE schemaname = 'public' ORDER BY 1`,
    // Colunas detectam divergência de schema, não apenas de nomes de objeto.
    colunas: `SELECT table_name || '.' || column_name || ' ' || data_type ||
                     ' null=' || is_nullable ||
                     ' default=' || COALESCE(column_default, '-') AS v
              FROM information_schema.columns
              WHERE table_schema = 'public' ORDER BY 1`,
    // Restrições (CHECK, UNIQUE, PK) carregam regra de negócio.
    restricoes: `SELECT c.relname || ':' || con.conname || ' ' ||
                        pg_catalog.pg_get_constraintdef(con.oid) AS v
                 FROM pg_constraint con
                 JOIN pg_class c ON c.oid = con.conrelid
                 JOIN pg_namespace n ON n.oid = c.relnamespace
                 WHERE n.nspname = 'public' ORDER BY 1`,
    // Privilégios por coluna, não só por tabela.
    privilegios: `SELECT grantee || ' ' || table_name || ' ' || privilege_type ||
                         ' ' || COALESCE(column_name, '(tabela)') AS v
                  FROM information_schema.column_privileges
                  WHERE table_schema = 'public'
                    AND grantee IN ('authenticated', 'anon')
                  ORDER BY 1`,
  };

  const resultado = {};
  for (const [nome, sql] of Object.entries(consultas)) {
    resultado[nome] = (await db.query(sql)).rows.map((r) =>
      nome === 'funcoes' ? normalizarCorpo(r.v) : r.v,
    );
  }
  await db.close();
  return resultado;
}

console.log();
console.log(paint(BOLD, 'SIFAU — paridade entre caminhos de instalação'));
console.log(paint(DIM, 'SETUP_COMPLETO.sql  vs  supabase/migrations/*.sql'));

let setup, migracoes;
try {
  [setup, migracoes] = await Promise.all([snapshot('setup'), snapshot('migrations')]);
} catch (error) {
  console.error();
  console.error(paint(RED, `✗ não foi possível aplicar um dos caminhos: ${error.message}`));
  process.exit(1);
}

console.log();
let tudoIgual = true;
for (const chave of Object.keys(setup)) {
  const a = setup[chave];
  const b = migracoes[chave];
  const soSetup = a.filter((v) => !b.includes(v));
  const soMigracoes = b.filter((v) => !a.includes(v));
  const igual = soSetup.length === 0 && soMigracoes.length === 0;
  if (!igual) tudoIgual = false;

  const marca = igual ? paint(GREEN, '✓') : paint(RED, '✗');
  console.log(`${marca} ${chave.padEnd(10)} ${a.length} vs ${b.length}${igual ? '' : '  ← DIVERGEM'}`);
  if (soSetup.length) console.log(paint(DIM, `    só no SETUP_COMPLETO: ${soSetup.slice(0, 10).join(', ')}`));
  if (soMigracoes.length) console.log(paint(DIM, `    só nas migrations:    ${soMigracoes.slice(0, 10).join(', ')}`));
}

console.log();
if (tudoIgual) {
  console.log(paint(GREEN, 'Os dois caminhos de instalação produzem o mesmo schema.'));
  process.exit(0);
}
console.log(paint(RED, paint(BOLD, 'DIVERGÊNCIA: um projeto novo e um migrado ficariam diferentes.')));
console.log(paint(DIM, 'Acrescente o bloco que falta ao SETUP_COMPLETO.sql, na ordem da migration.'));
process.exit(1);

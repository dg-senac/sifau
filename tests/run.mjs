#!/usr/bin/env node
// ============================================================================
// SIFAU — Runner dos testes de banco
// ============================================================================
// Roda cada suíte em um banco limpo e independente, para que uma suíte não
// contamine a seguinte.
//
//   node tests/run.mjs                    # testa supabase/SETUP_COMPLETO.sql
//   node tests/run.mjs --source=migrations # testa supabase/migrations/*.sql
//
// Conceito de "bug conhecido" (knownBug): um teste que documenta um defeito já
// identificado e ainda não corrigido. Ele NÃO derruba a suíte, mas aparece no
// relatório. Quando a correção entrar, ele passa a aparecer como "RESOLVIDO",
// o que é o sinal para remover o marcador.
// ============================================================================

import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createDatabase, REPO_ROOT, TESTS_DIR } from './harness.mjs';

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';

const useColor = process.stdout.isTTY !== false;
const paint = (color, text) => (useColor ? `${color}${text}${RESET}` : text);

const sourceArg = process.argv.find((a) => a.startsWith('--source='));
const source = sourceArg ? sourceArg.split('=')[1] : 'setup';

if (!['setup', 'migrations'].includes(source)) {
  console.error(`Fonte desconhecida: ${source}. Use --source=setup ou --source=migrations.`);
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Mini framework de teste
// ---------------------------------------------------------------------------
function createTestApi() {
  const results = [];
  const record = (kind) => async (name, fn, ref) => {
    try {
      await fn();
      results.push({ kind, name, ref, passed: true });
    } catch (error) {
      results.push({ kind, name, ref, passed: false, error });
    }
  };

  const api = {
    test: record('normal'),
    knownBug: record('known'),

    /** Afirma que a operação FALHA (testes de negação de acesso). */
    async denies(fn, label = 'operação') {
      try {
        await fn();
      } catch {
        return; // falhou como esperado
      }
      throw new Error(`${label} deveria ter sido negada, mas foi aceita`);
    },

    /**
     * Afirma que o acesso foi fechado — seja por `permission denied` (GRANT
     * revogado) ou por RLS devolvendo zero linhas. Os dois são resultados
     * seguros e o Supabase real usa os dois mecanismos.
     */
    async deniedOrEmpty(fn, label = 'acesso') {
      try {
        const result = await fn();
        const rows = result?.rows ?? [];
        const n = rows.length === 1 && 'n' in rows[0] ? Number(rows[0].n) : rows.length;
        if (n !== 0) {
          throw new Error(`${label}: esperado acesso negado ou vazio, mas retornou ${n} linha(s)`);
        }
      } catch (error) {
        if (/esperado acesso negado/.test(error.message)) throw error;
        return; // negado pelo banco — comportamento aceitável
      }
    },

    eq(actual, expected, label = 'valor') {
      const a = JSON.stringify(actual);
      const b = JSON.stringify(expected);
      if (a !== b) throw new Error(`${label}: esperado ${b}, obtido ${a}`);
    },

    ok(value, label = 'condição') {
      if (!value) throw new Error(`${label} não foi satisfeita`);
    },

    /** Compara contagens como número, tolerando bigint/string do driver. */
    count(actual, expected, label) {
      const n = Number(actual);
      if (n !== expected) throw new Error(`${label}: esperado ${expected}, obtido ${n}`);
    },
  };
  return { api, results };
}

// ---------------------------------------------------------------------------
// Execução
// ---------------------------------------------------------------------------
const suiteDir = join(TESTS_DIR, 'suites');
const suiteFiles = readdirSync(suiteDir).filter((f) => f.endsWith('.test.mjs')).sort();

console.log();
console.log(paint(BOLD, 'SIFAU — testes de banco'));
console.log(paint(DIM, 'PostgreSQL real (PGlite) · ambiente Supabase simulado'));
console.log(paint(DIM, `Fonte: ${source === 'setup' ? 'supabase/SETUP_COMPLETO.sql' : 'supabase/migrations/*.sql'}`));

const totals = { passed: 0, failed: 0, known: 0, resolved: 0 };
const failureDetails = [];
let aborted = null;

for (const file of suiteFiles) {
  const suite = (await import(join(suiteDir, file))).default;

  let db;
  try {
    db = await createDatabase({ source });
  } catch (error) {
    console.error();
    console.error(paint(RED, `✗ Não foi possível aplicar o schema (${file})`));
    console.error(paint(RED, `  ${error.message}`));
    console.error(paint(DIM, '  O harness não conseguiu criar o banco; as suítes seguintes não foram executadas.'));
    aborted = true;
    break;
  }

  const { api, results } = createTestApi();
  api.db = db;

  console.log();
  console.log(paint(BLUE, `▸ ${suite.name}`));

  try {
    await suite.run(api);
  } catch (error) {
    console.error(paint(RED, `  ✗ a suíte falhou por erro inesperado: ${error.message}`));
    totals.failed += 1;
    failureDetails.push({ suite: suite.name, test: '(erro na suíte)', error });
  } finally {
    await db.close();
  }

  for (const r of results) {
    if (r.kind === 'known') {
      if (r.passed) {
        totals.resolved += 1;
        console.log(`  ${paint(YELLOW, '★')} ${paint(DIM, `RESOLVIDO — ${r.name} [${r.ref}] — remova o marcador knownBug`)}`);
      } else {
        totals.known += 1;
        console.log(`  ${paint(YELLOW, '⚠')} ${paint(DIM, `CONHECIDO  ${r.name}  [${r.ref}]`)}`);
      }
      continue;
    }
    if (r.passed) {
      totals.passed += 1;
      console.log(`  ${paint(GREEN, '✓')} ${r.name}`);
    } else {
      totals.failed += 1;
      console.log(`  ${paint(RED, '✗')} ${paint(RED, r.name)}`);
      console.log(`      ${paint(DIM, r.error.message)}`);
      failureDetails.push({ suite: suite.name, test: r.name, error: r.error });
    }
  }
}

console.log();
console.log('─'.repeat(72));
if (aborted) {
  console.log(paint(RED, paint(BOLD, 'FALHA: o schema não pôde ser aplicado.')));
  process.exit(1);
}

const summary = [
  paint(GREEN, `${totals.passed} passaram`),
  totals.known ? paint(YELLOW, `${totals.known} conhecidos (bugs em aberto)`) : null,
  totals.resolved ? paint(YELLOW, `${totals.resolved} resolvidos (remover marcador)`) : null,
  totals.failed ? paint(RED, `${totals.failed} falharam`) : null,
].filter(Boolean).join(paint(DIM, ' · '));

console.log(summary);
console.log();

if (totals.failed > 0) {
  console.log(paint(RED, paint(BOLD, 'Falhas inesperadas:')));
  for (const f of failureDetails) {
    console.log(paint(RED, `  • [${f.suite}] ${f.test}`));
    console.log(paint(DIM, `    ${f.error.message}`));
  }
  console.log();
  process.exit(1);
}

process.exit(0);

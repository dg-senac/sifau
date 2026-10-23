import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const ler = p => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
test('arquivo para SQL Editor contém a migration exata, em uma transação, sem limpeza de dados', () => {
  const migration = ler('supabase/migrations/20261023000000_account_isolation.sql');
  const sql = ler('entrega/SQL_EDITOR_ISOLAR_CONTAS.txt');
  assert.ok(sql.includes(migration)); assert.ok(ler('supabase/SETUP_COMPLETO.sql').includes(migration));
  assert.equal((sql.match(/^BEGIN;$/gm) ?? []).length, 1); assert.equal((sql.match(/^COMMIT;$/gm) ?? []).length, 1);
  const foraFuncoes = sql.replace(/\$\$[\s\S]*?\$\$/g, '').replace(/--[^\n]*/g, '');
  assert.doesNotMatch(foraFuncoes, /\b(?:TRUNCATE|DELETE\s+FROM|UPDATE\s+public|INSERT\s+INTO|DROP\s+TABLE)\b/i);
});

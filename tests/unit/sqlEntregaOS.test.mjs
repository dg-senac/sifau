import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const ler = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const corpo = (s) => s.split('\n').filter((l) => l !== 'BEGIN;' && l !== 'COMMIT;').join('\n').trim();
test('SQL entregue para copiar contém as duas migrations sem cortes e em uma transação', () => {
  const sql = ler('entrega/SQL_EDITOR_OS_COMPLETO.txt');
  for (const nome of ['20261021000000_os_workflow.sql', '20261022000000_os_auto_decision.sql']) {
    assert.ok(sql.includes(corpo(ler(`supabase/migrations/${nome}`))));
  }
  assert.equal((sql.match(/^BEGIN;$/gm) ?? []).length, 1);
  assert.equal((sql.match(/^COMMIT;$/gm) ?? []).length, 1);
  assert.ok(sql.trim().endsWith('COMMIT;'));
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carregarAtividade, CONSULTAS_ATIVIDADE, MODULOS_ATIVIDADE, larguraBarra } from '../../src/lib/atividade.ts';

test('acompanhamento cobre cinco módulos e todas as situações/tipos sem consultas duplicadas', () => {
  assert.deepEqual(MODULOS_ATIVIDADE.map(m => m.id), ['ocorrencias', 'os', 'documentos', 'vistorias', 'autos']);
  assert.equal(new Set(CONSULTAS_ATIVIDADE.map(q => q.id)).size, CONSULTAS_ATIVIDADE.length);
  for (const m of MODULOS_ATIVIDADE) {
    assert.ok(CONSULTAS_ATIVIDADE.some(q => q.id === m.id && !q.campo));
    for (const c of m.categorias) assert.ok(CONSULTAS_ATIVIDADE.some(q => q.id === `${m.id}:${c}` && q.valor === c && q.campo === m.campo));
  }
});
test('contagens acima de mil são preservadas e há no máximo quatro consultas simultâneas', async () => {
  let ativas = 0; let pico = 0;
  const resultado = await carregarAtividade(async q => {
    ativas++; pico = Math.max(pico, ativas);
    await new Promise(r => setTimeout(r, 1)); ativas--;
    return { count: q.id === 'os' ? 2345 : 0, error: null };
  });
  assert.equal(resultado.os, 2345); assert.equal(resultado.documentos, 0); assert.ok(pico <= 4);
  assert.equal(Object.keys(resultado).length, CONSULTAS_ATIVIDADE.length);
});
test('falhas, null, contagens inválidas e rejeições não viram zero nem derrubam outros módulos', async () => {
  const resultado = await carregarAtividade(async q => {
    if (q.id === 'documentos') return { count: 0, error: new Error('acesso negado') };
    if (q.id === 'vistorias') throw new Error('sem rede');
    if (q.id === 'os') return { count: null, error: null };
    if (q.id === 'autos') return { count: -1, error: null };
    return { count: 12, error: null };
  });
  for (const id of ['documentos', 'vistorias', 'os', 'autos']) assert.equal(resultado[id], null);
  assert.equal(resultado.ocorrencias, 12);
});
test('cancelamento interrompe a fila e não devolve um resumo incompleto como sucesso', async () => {
  const controle = new AbortController(); let chamadas = 0;
  await assert.rejects(() => carregarAtividade(async () => {
    chamadas++; controle.abort(); return { count: 2, error: null };
  }, controle.signal), { name: 'AbortError' });
  assert.ok(chamadas <= 4);
});
test('barras vazias/indisponíveis têm largura zero; proporção nunca ultrapassa 100%', () => {
  assert.equal(larguraBarra(0, 10), 0); assert.equal(larguraBarra(null, 10), 0);
  assert.equal(larguraBarra(0, 0), 0); assert.equal(larguraBarra(5, 10), 50); assert.equal(larguraBarra(20, 10), 100);
});

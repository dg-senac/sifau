import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { criarPdfOS } from '../../src/lib/pdfOS.ts';
const ordem = {
  id: '33333333-3333-4333-8333-333333333333', numero: 'OS-2026-0001', origem: 'Denúncia', requerente: 'Pessoa requerente',
  fiscal_abertura: '33333333-3333-4333-8333-333333333333', apoio_operacional: false, descricao: 'Vistoria da ocupação de calçada.',
  legislacao: [], endereco: 'Rua das Flores, Cabo de Santo Agostinho / PE', latitude: null, longitude: null,
  emitida_em: '2026-10-21T01:30:00Z', prazo_resposta: '2026-10-23T15:00:00Z', status: 'Aberta',
  versao: 2, concluida_em: null, edicao_ate: null,
  fluxo: { fiscal_abertura_nome: 'Fiscal de Teste', decisao_auto: { decisao: 'nao_emitir', justificativa: 'Não houve infração.',
    fiscal_nome: 'Fiscal de Teste', registrado_em: '2026-10-21T01:30:00Z' } },
};
const texto = (pdf) => new TextDecoder('latin1').decode(pdf.output('arraybuffer'));
test('PDF da OS identifica município, revisão, decisão e horário de Recife', async () => {
  const pdf = await criarPdfOS(ordem); const t = texto(pdf);
  assert.ok(t.startsWith('%PDF-')); assert.match(t, /CABO DE SANTO AGOSTINHO/);
  assert.match(t, /OS-2026-0001/); assert.match(t, /20\/10\/2026, 22:30:00/);
  assert.match(t, /Fiscal de Teste/); assert.match(t, /Nenhum|autom|emitir/);
  assert.ok(!t.includes('CNPJ')); assert.ok(!t.includes('Secretaria de'));
});
test('paginação repete cabeçalho e conserva relatos extensos até a última linha', async () => {
  const pdf = await criarPdfOS({ ...ordem, descricao: ('Descrição extensa de fiscalização.\n').repeat(200) + 'FIM-DO-RELATO' });
  assert.ok(pdf.getNumberOfPages() > 2); const t = texto(pdf);
  assert.equal((t.match(/CABO DE SANTO AGOSTINHO/g) ?? []).length, pdf.getNumberOfPages());
  assert.match(t, /FIM-DO-RELATO/);
});
test('assinatura salva não é omitida silenciosamente quando não há carregador', async () => {
  await assert.rejects(() => criarPdfOS({ ...ordem, fluxo: { ...ordem.fluxo, notificacao: { nome: 'Pessoa', assinatura: 'assinatura.png' } } }), /assinatura salva/);
});
test('o modelo mantém autos anteriores no dossiê', async () => {
  const pdf = await criarPdfOS({ ...ordem, fluxo: { ...ordem.fluxo, autos_anteriores: [{ autuado_nome: 'Pessoa do auto anterior', valor_multa: 1234.56 }] } });
  assert.match(texto(pdf), /Pessoa do auto anterior/); assert.match(texto(pdf), /1\.234,56/);
});

test('assinatura é carregada e incorporada; falha no download impede PDF incompleto', async () => {
  const os = { ...ordem, fluxo: { ...ordem.fluxo, notificacao: { nome: 'Pessoa', assinatura: 'assinatura-privada.png' } } };
  const chamadas = [];
  // Apenas imagem sintética de teste; não é assinatura de uma pessoa.
  const png = readFileSync(new URL('../../public/icone-192.png', import.meta.url)).toString('base64');
  const pdf = await criarPdfOS(os, async (path) => { chamadas.push(path); return `data:image/png;base64,${png}`; });
  assert.deepEqual(chamadas, ['assinatura-privada.png']); assert.match(texto(pdf), /\/Subtype \/Image/);
  await assert.rejects(() => criarPdfOS(os, async () => { throw new Error('falha ao carregar'); }), /falha ao carregar/);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { unzipSync, strFromU8 } from 'fflate';
import { gerarCSV, celulaCSV, formatarValor, gerarExcel, gerarPDF, gerarArquivoRelatorio, carregarPaginas, hashArquivo } from '../../src/lib/relatorios.ts';
import { COLUNAS_OCORRENCIAS, COLUNAS_FISCAIS, COLUNAS_AUDITORIA } from '../../src/lib/modelosRelatorios.ts';

const exemplo = {
  titulo: 'Ocorrências e fiscalização', nomeArquivo: 'teste_sifau', escopo: 'Todos os registros autorizados.',
  geradoEm: new Date('2026-10-21T01:30:00Z'),
  colunas: [
    { chave: 'nome', titulo: 'Nome da pessoa', largura: 35 },
    { chave: 'telefone', titulo: 'Telefone', largura: 22 },
    { chave: 'relato', titulo: 'Descrição detalhada', largura: 65 },
    { chave: 'data', titulo: 'Registrado em', tipo: 'dataHora' },
    { chave: 'dia', titulo: 'Vencimento', tipo: 'data' },
    { chave: 'multa', titulo: 'Valor da multa', tipo: 'moeda' },
    { chave: 'status', titulo: 'Situação', tipo: 'status' },
    { chave: 'latitude', titulo: 'Latitude', tipo: 'numero' },
    { chave: 'id', titulo: 'Identificador técnico', tecnica: true },
  ],
  linhas: [{ nome: 'João da Conceição', telefone: '08101234567', relato: 'Notificação; "obra"\nSegunda linha',
    data: '2026-10-21T01:30:00Z', dia: '2026-10-21', multa: 1234.56, status: 'Concluída', latitude: -8.05, id: '001234' }],
};

function xmls(blob) {
  return blob.arrayBuffer().then((b) => Object.fromEntries(Object.entries(unzipSync(new Uint8Array(b))).map(([k, v]) => [k, strFromU8(v)])));
}

test('CSV tem BOM, ponto e vírgula, CRLF e aspas escapadas sem perder acentos ou linhas', () => {
  const csv = gerarCSV(exemplo);
  assert.ok(csv.startsWith('\uFEFF"Nome da pessoa";"Telefone";'));
  assert.ok(csv.endsWith('\r\n'));
  assert.ok(csv.includes('João da Conceição'));
  assert.ok(csv.includes('"Notificação; ""obra""\nSegunda linha"'));
  assert.ok(csv.includes('"20/10/2026, 22:30:00"'));
  assert.ok(csv.includes('"21/10/2026"'));
  assert.ok(csv.includes('"-8,05"'));
  assert.ok(!csv.includes("'-8,05"));
});

test('CSV neutraliza fórmulas de texto com espaços, tabulações e controles', () => {
  for (const ataque of ['=1+1', '+SUM(A1)', '-1+2', '@SUM(A1)', '   =1', '\t=1', '\r=1', '\n=1', '\u0000=1']) {
    assert.ok(celulaCSV(ataque).startsWith('"\''), JSON.stringify(ataque));
  }
  assert.equal(celulaCSV('Nome normal'), '"Nome normal"');
});

test('datas e números têm apresentação brasileira sem trocar o dia civil', () => {
  assert.equal(formatarValor('2026-10-21', { chave: 'd', titulo: 'Data', tipo: 'data' }), '21/10/2026');
  assert.equal(formatarValor('2026-10-21T01:30:00Z', { chave: 'd', titulo: 'Data', tipo: 'dataHora' }), '20/10/2026, 22:30:00');
  assert.match(formatarValor(1234.56, { chave: 'v', titulo: 'Valor', tipo: 'moeda' }), /1\.234,56/);
  assert.equal(formatarValor(null, { chave: 'n', titulo: 'Nome' }), 'Não informado');
  assert.equal(formatarValor(false, { chave: 's', titulo: 'Sim' }), 'Não');
  assert.equal(formatarValor('data inválida', { chave: 'd', titulo: 'Data', tipo: 'dataHora' }), 'data inválida');
});

test('XLSX é ZIP Office real com abas, filtros válidos, cabeçalho fixo e estilos', async () => {
  const arquivo = await gerarExcel(exemplo);
  const files = await xmls(arquivo);
  assert.ok(files['[Content_Types].xml']);
  assert.match(files['xl/workbook.xml'], /name="Dados"/);
  assert.match(files['xl/workbook.xml'], /name="Identificadores"/);
  assert.match(files['xl/workbook.xml'], /name="Sobre o relatório"/);
  const dados = files['xl/worksheets/sheet1.xml'];
  const ids = files['xl/worksheets/sheet2.xml'];
  assert.match(dados, /state="frozen"/);
  assert.match(dados, /ySplit="1"/);
  assert.match(dados, /<autoFilter ref="A1:I2"\/>/);
  assert.match(ids, /<autoFilter ref="A1:B2"\/>/);
  assert.ok(dados.indexOf('</sheetData>') < dados.indexOf('<autoFilter'));
  assert.ok(!files['xl/worksheets/sheet3.xml'].includes('<autoFilter'));
  assert.match(files['xl/styles.xml'], /wrapText="1"/);
  assert.match(files['xl/styles.xml'], /cellStyle name="Normal"/);
  assert.match(files['xl/styles.xml'], /dd\/mm\/yyyy hh:mm:ss/);
  assert.match(files['xl/styles.xml'], /0[dD]428[bB]/);
  assert.match(files['xl/sharedStrings.xml'], /João da Conceição/);
});

test('XLSX preserva telefones e IDs como texto e moeda/data como números nativos', async () => {
  const files = await xmls(await gerarExcel(exemplo));
  const dados = files['xl/worksheets/sheet1.xml'];
  const ids = files['xl/worksheets/sheet2.xml'];
  assert.match(dados, /<c r="C2"[^>]*t="s"/); // Telefone
  assert.match(ids, /<c r="B2"[^>]*t="s"/); // Identificador técnico
  assert.match(dados, /<c r="G2"[^>]*><v>1234\.56<\/v>/); // Moeda
  assert.match(dados, /<c r="E2"[^>]*><v>[\d.]+<\/v>/); // Data nativa
  const serial = Number(dados.match(/<c r="E2"[^>]*><v>([\d.]+)<\/v>/)[1]);
  assert.equal(new Date(Math.round((serial - 25569) * 86400000)).toISOString(), '2026-10-20T22:30:00.000Z');
  assert.match(files['xl/sharedStrings.xml'], /08101234567/);
  assert.match(files['xl/sharedStrings.xml'], /001234/);
});

test('nenhum texto livre vira fórmula ou link externo no XLSX', async () => {
  const ataques = ['=HYPERLINK("https://example.invalid")', '+1+1', '@SUM(A1)', '-1+2'];
  const files = await xmls(await gerarExcel({ ...exemplo, linhas: ataques.map((nome) => ({ ...exemplo.linhas[0], nome })) }));
  for (const conteudo of Object.values(files)) {
    assert.ok(!conteudo.includes('<f>'));
    assert.ok(!conteudo.includes('TargetMode="External"'));
  }
});

test('PDF real tem várias páginas para relatos extensos e conserva o fim do texto', async () => {
  const pdf = await gerarPDF({ ...exemplo, linhas: Array.from({ length: 12 }, (_, i) => ({ ...exemplo.linhas[0],
    nome: `Fiscal ${i}`, relato: 'Descrição legível com acentos. '.repeat(100) + 'FIM_DO_RELATO' })) });
  const bytes = new TextDecoder('latin1').decode(await pdf.arrayBuffer());
  assert.ok(bytes.startsWith('%PDF-'));
  assert.ok((bytes.match(/\/Type \/Page\b/g) ?? []).length > 1);
  assert.match(bytes, /FIM_DO_RELATO/);
  assert.match(bytes, /12 registros/);
});

test('nome do download usa a data de Recife e extensão verdadeira', async () => {
  for (const formato of ['xlsx', 'pdf', 'csv']) {
    const arquivo = await gerarArquivoRelatorio(exemplo, formato);
    assert.equal(arquivo.nome, `teste_sifau_2026-10-20.${formato}`);
    assert.ok(arquivo.blob.size > 0);
  }
  await assert.rejects(() => gerarArquivoRelatorio({ ...exemplo, linhas: [] }, 'xlsx'), /Não há registros/);
});

test('paginação exporta mais de mil linhas sem truncar e aborta em caso de erro', async () => {
  const chamadas = [];
  const dados = Array.from({ length: 1234 }, (_, id) => ({ id }));
  const total = await carregarPaginas(async (inicio, fim) => {
    chamadas.push([inicio, fim]); return { data: dados.slice(inicio, fim + 1), error: null };
  });
  assert.equal(total.length, 1234);
  assert.deepEqual(chamadas, [[0, 499], [500, 999], [1000, 1499]]);
  await assert.rejects(() => carregarPaginas(async () => ({ data: [], error: { message: 'Sem permissão' } })), /Sem permissão/);
  await assert.rejects(() => carregarPaginas(async () => ({ data: null, error: null })), /não retornou/);
});

test('modelos mantêm identificadores técnicos separados e títulos em português', () => {
  for (const colunas of [COLUNAS_OCORRENCIAS, COLUNAS_FISCAIS, COLUNAS_AUDITORIA]) {
    assert.ok(colunas.some((c) => c.tecnica));
    assert.ok(colunas.every((c) => c.titulo !== c.chave));
  }
});

test('hash SHA-256 identifica exatamente os bytes de cada formato, inclusive JSON técnico', async () => {
  for (const formato of ['xlsx', 'pdf', 'csv', 'json']) {
    const blob = formato === 'json' ? new Blob([JSON.stringify(exemplo.linhas)]) : (await gerarArquivoRelatorio(exemplo, formato)).blob;
    const esperado = createHash('sha256').update(new Uint8Array(await blob.arrayBuffer())).digest('hex');
    assert.equal(await hashArquivo(blob), esperado);
    assert.notEqual(await hashArquivo(new Blob([blob, 'alteração'])), esperado);
  }
});

test('limite de texto do Excel não trunca silenciosamente conteúdo', async () => {
  await assert.rejects(() => gerarExcel({ ...exemplo, linhas: [{ ...exemplo.linhas[0], relato: 'x'.repeat(32768) }] }), /limite de texto do Excel/);
});

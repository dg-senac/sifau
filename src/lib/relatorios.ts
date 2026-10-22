// Formatos de leitura são derivados dos mesmos dados; nunca alteram os registros.
// Importações pesadas só acontecem quando o usuário solicita o formato.
import type { CellObject, Feature, Sheet } from 'write-excel-file/universal';
import { CORES } from './marca.ts';

export type FormatoRelatorio = 'xlsx' | 'pdf' | 'csv';
export type ValorRelatorio = string | number | boolean | null | undefined;
export type LinhaRelatorio = Record<string, ValorRelatorio>;
export type ColunaRelatorio = {
  chave: string;
  titulo: string;
  tipo?: 'texto' | 'numero' | 'moeda' | 'data' | 'dataHora' | 'status';
  largura?: number;
  tecnica?: boolean;
};
export type Relatorio = {
  titulo: string;
  nomeArquivo: string;
  escopo: string;
  colunas: ColunaRelatorio[];
  linhas: LinhaRelatorio[];
  geradoEm?: Date;
};
export type ArquivoRelatorio = { blob: Blob; nome: string };
const FUSO = 'America/Recife';
const textoVazio = 'Não informado';
const formatoData = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, dateStyle: 'short' });
const formatoDataPartes = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
const formatoDataHora = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, dateStyle: 'short', timeStyle: 'medium' });

function dataValida(valor: ValorRelatorio): Date | null {
  if (typeof valor !== 'string' || !valor.trim()) return null;
  const data = new Date(valor);
  return Number.isFinite(data.getTime()) ? data : null;
}
export function formatarValor(valor: ValorRelatorio, coluna: ColunaRelatorio): string {
  if (valor == null || valor === '') return textoVazio;
  if (typeof valor === 'boolean') return valor ? 'Sim' : 'Não';
  if (coluna.tipo === 'data' && /^\d{4}-\d{2}-\d{2}$/.test(String(valor))) {
    const [ano, mes, dia] = String(valor).split('-'); return `${dia}/${mes}/${ano}`;
  }
  if (coluna.tipo === 'data' || coluna.tipo === 'dataHora') {
    const data = dataValida(valor);
    return data ? (coluna.tipo === 'data' ? formatoData : formatoDataHora).format(data) : String(valor);
  }
  if (typeof valor === 'number' && Number.isFinite(valor)) {
    if (coluna.tipo === 'moeda') return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    return valor.toLocaleString('pt-BR', { maximumFractionDigits: 7, useGrouping: false });
  }
  return String(valor);
}

// CSV pode executar fórmulas ao abrir em planilhas: neutraliza prefixos até
// quando há espaços/controles antes deles. O XLSX usa células String, nunca Formula.
export function celulaCSV(texto: string, numeroSeguro = false): string {
  const inicio = texto.replace(/^[\s\p{Cc}]*/u, '');
  const perigoso = !numeroSeguro && (/^[=+\-@]/.test(inicio) || /^[\t\r\n]/.test(texto));
  const seguro = perigoso ? `'${texto}` : texto;
  return `"${seguro.replace(/"/g, '""')}"`;
}
export function gerarCSV(relatorio: Relatorio): string {
  return '\uFEFF' + [relatorio.colunas.map((c) => celulaCSV(c.titulo)).join(';'),
    ...relatorio.linhas.map((linha) => relatorio.colunas.map((c) => celulaCSV(formatarValor(linha[c.chave], c), c.tipo === 'numero' && typeof linha[c.chave] === 'number' && Number.isFinite(linha[c.chave]))).join(';')),
  ].join('\r\n') + '\r\n';
}

function corStatus(valor: ValorRelatorio): string | undefined {
  switch (valor) {
    case 'Resolvida': case 'Concluída': case 'Ativo': case 'Pago': return '#dff2e6';
    case 'Crítica': case 'Suspenso': case 'Cancelada': case 'Escalonada': return '#fce4e4';
    case 'Em vistoria': case 'Atribuída': case 'Triada': return '#e2edfc';
    case 'Aberta': case 'Pendente': case 'Pendente / desativado': case 'Alta': return '#fff0ce';
    default: return undefined;
  }
}
function celulaExcel(valor: ValorRelatorio, coluna: ColunaRelatorio, indice: number): CellObject {
  const estilo: CellObject = { alignVertical: 'top', wrap: true,
    backgroundColor: (coluna.tipo === 'status' ? corStatus(valor) : undefined) ?? (indice % 2 ? '#f1f5fa' : '#ffffff'), textColor: '#17314f' };
  if (valor == null || valor === '') return { ...estilo, type: String, value: textoVazio };
  if ((coluna.tipo === 'numero' || coluna.tipo === 'moeda') && typeof valor === 'number' && Number.isFinite(valor)) {
    return { ...estilo, type: Number, value: valor, format: coluna.tipo === 'moeda' ? '"R$" #,##0.00' : '0.#######' };
  }
  if (coluna.tipo === 'data' || coluna.tipo === 'dataHora') {
    const data = dataValida(valor);
    if (data) {
      // Excel não guarda fuso. Grava o horário civil de Recife como serial de
      // data nativa, igual ao horário mostrado no CSV/PDF, sem depender do computador.
      const partes = formatoDataPartes.formatToParts(data);
      const campos = Object.fromEntries(partes.map((p) => [p.type, p.value]));
      const apenasData = coluna.tipo === 'data' && /^\d{4}-\d{2}-\d{2}$/.test(String(valor));
      const civil = apenasData ? new Date(`${valor}T00:00:00Z`) : new Date(Date.UTC(
        +campos.year, +campos.month - 1, +campos.day, +campos.hour, +campos.minute, +campos.second));
      return { ...estilo, type: Date, value: civil, format: coluna.tipo === 'data' ? 'dd/mm/yyyy' : 'dd/mm/yyyy hh:mm:ss' };
    }
  }
  // Telefones, documentos, IDs e texto livre não viram números/fórmulas/links.
  if (String(valor).length > 32767) throw new Error('Um campo excede o limite de texto do Excel. Use PDF ou CSV para preservar o conteúdo completo.');
  return { ...estilo, type: String, value: typeof valor === 'boolean' ? (valor ? 'Sim' : 'Não') : String(valor), format: '@' };
}

export async function gerarExcel(relatorio: Relatorio): Promise<Blob> {
  const [{ default: escrever }, util] = await Promise.all([import('write-excel-file/universal'), import('write-excel-file/utility')]);
  if (relatorio.linhas.length > 1048575) throw new Error('O Excel suporta até 1.048.575 registros por aba. Divida a exportação.');
  const principais = relatorio.colunas.filter((c) => !c.tecnica);
  const tecnicas = relatorio.colunas.filter((c) => c.tecnica);
  const registro: ColunaRelatorio = { chave: '__registro', titulo: 'Registro', tipo: 'numero', largura: 10 };
  function aba(nome: string, colunas: ColunaRelatorio[]): Sheet<Blob> {
    return { sheet: nome, stickyRowsCount: 1, stickyColumnsCount: 1, showGridLines: false, orientation: 'landscape',
      columns: colunas.map((c) => ({ width: c.largura ?? (c.tipo === 'dataHora' ? 23 : 26) })),
      data: [colunas.map((c) => ({ value: c.titulo, type: String, fontWeight: 'bold',
        backgroundColor: CORES.azulProfundo, textColor: '#ffffff', wrap: true, height: 32 })),
      ...relatorio.linhas.map((linha, i) => colunas.map((c) => celulaExcel(c.chave === '__registro' ? i + 1 : linha[c.chave], c, i)))],
    };
  }
  const abas: Sheet<Blob>[] = [aba('Dados', [registro, ...principais])];
  if (tecnicas.length) abas.push(aba('Identificadores', [registro, ...tecnicas]));
  abas.push({ sheet: 'Sobre o relatório', columns: [{ width: 24 }, { width: 100 }], data: [
    [{ value: 'SIFAU', fontWeight: 'bold' as const }, { value: relatorio.titulo, fontWeight: 'bold' as const }],
    ['Abrangência', relatorio.escopo], ['Registros', { type: Number, value: relatorio.linhas.length }],
    ['Gerado em', formatoDataHora.format(relatorio.geradoEm ?? new Date())], ['Fuso horário', FUSO],
    ['Identificadores', 'A coluna Registro relaciona os dados com os identificadores técnicos da aba Identificadores.'],
    ['Proteção', 'Textos e identificadores são células de texto, não fórmulas. Preserve este arquivo em local autorizado.'],
  ].map((linha) => linha.map((c) => typeof c === 'string' ? { value: c, wrap: true } : c)) });
  const filtros: Feature<Blob> = { files: { transform: {
    'xl/styles.xml': { transform(xml) {
      // Declara o estilo Normal para leitores que não inferem o padrão.
      if (!util.findElement(xml, 'cellStyleXfs')) xml = util.insertElementMarkupAccordingToOrderOfSiblings(xml,
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>',
        util.getOrderOfSiblings('xl/styles.xml', 'styleSheet')!, 'styleSheet');
      if (!util.findElement(xml, 'cellStyles')) xml = util.insertElementMarkupAccordingToOrderOfSiblings(xml,
        '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>',
        util.getOrderOfSiblings('xl/styles.xml', 'styleSheet')!, 'styleSheet');
      return xml;
    } },
    'xl/worksheets/sheet{id}.xml': {
    transform(xml, _opcoes, { sheetIndex }) {
      if (sheetIndex >= abas.length - 1) return xml;
      const colunas = abas[sheetIndex].columns!.length;
      const intervalo = `A1:${util.getCellAddress(relatorio.linhas.length, colunas - 1)}`;
      return util.insertElementMarkupAccordingToOrderOfSiblings(xml, `<autoFilter ref="${intervalo}"/>`,
        util.getOrderOfSiblings('xl/worksheets/sheet{id}.xml', 'worksheet')!, 'worksheet');
    },
  } } } };
  return escrever(abas, { fontFamily: 'Calibri', fontSize: 11, features: [filtros] }).toBlob();
}

export async function gerarPDF(relatorio: Relatorio): Promise<Blob> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const colunas = relatorio.colunas.filter((c) => !c.tecnica);
  const pdf = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });
  const largura = pdf.internal.pageSize.getWidth();
  let y = 48;
  function paragrafo(texto: string, tamanho: number, negrito = false) {
    pdf.setFont('helvetica', negrito ? 'bold' : 'normal'); pdf.setFontSize(tamanho);
    for (const linha of pdf.splitTextToSize(texto, largura - 80) as string[]) {
      pdf.text(linha, 40, y); y += tamanho + 4;
    }
    y += 6;
  }
  paragrafo('SIFAU — Relatório', 16, true);
  paragrafo(relatorio.titulo, 13, true);
  paragrafo(`Abrangência: ${relatorio.escopo}`, 10);
  paragrafo(`${relatorio.linhas.length} ${relatorio.linhas.length === 1 ? 'registro' : 'registros'} • Gerado em ${formatoDataHora.format(relatorio.geradoEm ?? new Date())} (horário de Recife)`, 10);
  paragrafo('Identificadores técnicos completos estão disponíveis no Excel e no CSV.', 9);
  // Ficha por registro: descrição e endereço extensos ficam legíveis, sem
  // esmagar dez colunas em uma página. A tabela pagina textos automaticamente.
  autoTable(pdf, {
    startY: y + 4, margin: { top: 40, right: 40, bottom: 42, left: 40 },
    head: [['Campo', 'Informação']],
    body: relatorio.linhas.flatMap((linha, i) => [
      [{ content: `Registro ${i + 1}`, colSpan: 2, styles: { fillColor: [13, 66, 139], textColor: [255, 255, 255], fontStyle: 'bold' as const } }],
      ...colunas.map((c) => [c.titulo, formatarValor(linha[c.chave], c)]),
    ]),
    styles: { font: 'helvetica', fontSize: 10, cellPadding: 6, overflow: 'linebreak', valign: 'top' },
    headStyles: { fillColor: [13, 66, 139] }, columnStyles: { 0: { cellWidth: 125 } },
    alternateRowStyles: { fillColor: [243, 246, 250] }, rowPageBreak: 'avoid',
  });
  const paginas = pdf.getNumberOfPages();
  for (let pagina = 1; pagina <= paginas; pagina++) {
    pdf.setPage(pagina); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(80);
    pdf.text(`SIFAU • ${pagina} / ${paginas}`, largura - 40, pdf.internal.pageSize.getHeight() - 20, { align: 'right' });
  }
  return pdf.output('blob');
}

export async function gerarArquivoRelatorio(relatorio: Relatorio, formato: FormatoRelatorio): Promise<ArquivoRelatorio> {
  if (!relatorio.linhas.length) throw new Error('Não há registros para exportar.');
  const blob = formato === 'xlsx' ? await gerarExcel(relatorio) : formato === 'pdf' ? await gerarPDF(relatorio) :
    new Blob([gerarCSV(relatorio)], { type: 'text/csv;charset=utf-8' });
  const dia = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(relatorio.geradoEm ?? new Date());
  return { blob, nome: `${relatorio.nomeArquivo}_${dia}.${formato}` };
}
export function baixarArquivo({ blob, nome }: ArquivoRelatorio): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = nome;
  document.body.appendChild(link); link.click(); link.remove();
  // Não revoga imediatamente: o navegador/WebView precisa consumir o Blob.
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// Não exporta silenciosamente só as primeiras 1.000 linhas do Supabase.
export async function carregarPaginas<T>(ler: (inicio: number, fim: number) => PromiseLike<{
  data: T[] | null; error: { message: string } | null;
}>): Promise<T[]> {
  const resultado: T[] = [];
  for (let inicio = 0; ; inicio += 500) {
    const { data, error } = await ler(inicio, inicio + 499);
    if (error) throw new Error(error.message);
    if (!data) throw new Error('O servidor não retornou os registros. Tente novamente.');
    resultado.push(...data);
    if (data.length < 500) return resultado;
  }
}

export async function hashArquivo(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

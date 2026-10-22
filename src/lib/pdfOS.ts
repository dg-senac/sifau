import type { OrdemComFluxo, DocumentoOS } from './fluxoOS.ts';

// Modelo institucional, sem brasão, CNPJ, secretaria ou fundamento legal inventados.
export async function criarPdfOS(os: OrdemComFluxo, carregarAssinatura?: (path: string) => Promise<string>) {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
  const largura = pdf.internal.pageSize.getWidth();
  const margem = 44; const util = largura - 2 * margem; const limite = 765;
  let y = 154;
  const data = (valor: unknown, apenasDia = false) => {
    if (!valor) return 'Não informado';
    if (apenasDia && /^\d{4}-\d{2}-\d{2}$/.test(String(valor))) return String(valor).split('-').reverse().join('/');
    const d = new Date(String(valor));
    return Number.isFinite(d.getTime()) ? new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Recife', dateStyle: 'short', ...(apenasDia ? {} : { timeStyle: 'medium' }),
    }).format(d) : String(valor);
  };
  function cabecalho() {
    pdf.setFillColor(13, 66, 139); pdf.rect(margem, 32, 48, 46, 'F');
    pdf.setTextColor(255); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10); pdf.text('SIFAU', margem + 7, 59);
    pdf.setTextColor(26, 42, 60); pdf.setFontSize(11);
    pdf.text('MUNICÍPIO DO CABO DE SANTO AGOSTINHO', margem + 60, 45);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9);
    pdf.text('ESTADO DE PERNAMBUCO', margem + 60, 60);
    pdf.text('Sistema Municipal de Fiscalização e Atendimento Urbano', margem + 60, 75);
    pdf.setDrawColor(13, 66, 139); pdf.setLineWidth(1); pdf.line(margem, 89, largura - margem, 89);
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(16); pdf.text('ORDEM DE SERVIÇO', margem, 115);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9);
    const numero = pdf.splitTextToSize(`Nº ${os.numero.length > 70 ? os.numero.slice(0, 67) + '...' : os.numero}  |  Revisão ${os.versao}`, util);
    pdf.text(numero, margem, 132);
    y = 142 + numero.length * 11;
  }
  cabecalho();
  function reservar(altura: number) { if (y + altura > limite) { pdf.addPage(); cabecalho(); } }
  function secao(titulo: string) {
    reservar(55); y += 9;
    pdf.setFillColor(233, 239, 245); pdf.rect(margem, y, util, 23, 'F');
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9); pdf.setTextColor(13, 66, 139);
    pdf.text(titulo, margem + 9, y + 15); y += 34;
  }
  function campo(titulo: string, valor: unknown) {
    reservar(36);
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8); pdf.setTextColor(78, 91, 108);
    pdf.text(titulo.toUpperCase(), margem + 8, y); y += 13;
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10); pdf.setTextColor(24, 35, 49);
    for (const linha of pdf.splitTextToSize(String(valor ?? '').trim() || 'Não informado', util - 16) as string[]) {
      if (y + 13 > limite) {
        pdf.addPage(); cabecalho();
        pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8); pdf.setTextColor(78, 91, 108);
        pdf.text(`${titulo.toUpperCase()} (CONTINUAÇÃO)`, margem + 8, y); y += 14;
        pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10); pdf.setTextColor(24, 35, 49);
      }
      pdf.text(linha, margem + 8, y); y += 14;
    }
    y += 10;
  }
  secao('01  IDENTIFICAÇÃO E OBJETO');
  if (os.numero.length > 70) campo('Número completo da OS', os.numero);
  campo('Situação / origem', `${os.status} / ${os.origem}`);
  campo('Emissão / prazo de resposta', `${data(os.emitida_em)} / ${data(os.prazo_resposta)}`);
  campo('Fiscal de abertura', os.fluxo.fiscal_abertura_nome ?? 'Nome não registrado na emissão; consulte o identificador ao final.');
  campo('Requerente', os.requerente);
  campo('Endereço da diligência', os.endereco);
  campo('Objeto da ordem de serviço', os.descricao);
  if (os.apoio_operacional) campo('Apoio operacional', os.orgao_apoio);
  if (os.legislacao?.length) campo('Legislação informada na OS', os.legislacao.join('\n'));

  secao('02  DECISÃO SOBRE AUTO DE INFRAÇÃO');
  const decisao = os.fluxo.decisao_auto;
  campo('Decisão do fiscal', os.fluxo.auto_id ? 'Auto de infração emitido.' : decisao?.decisao === 'nao_emitir' ?
    'Não emitir auto de infração nesta OS.' : decisao?.decisao === 'emitir' ?
      'Emissão escolhida; o auto ainda não foi gerado.' : 'Decisão não registrada. A emissão não é automática.');
  if (decisao) {
    campo('Justificativa', decisao.justificativa || 'Emissão sujeita ao preenchimento e à confirmação do auto pelo fiscal.');
    campo('Fiscal / registro da decisão', `${decisao.fiscal_nome} / ${data(decisao.registrado_em)}`);
  }
  const campos: [string, string][] = [
    ['nome', 'Nome do responsável'], ['documento', 'Documento do responsável'],
    ['autuado_nome', 'Nome do autuado'], ['autuado_documento', 'Documento do autuado'],
    ['endereco', 'Endereço'], ['tipo_infracao', 'Tipo de infração'], ['artigo_legal', 'Artigo / fundamento legal'],
    ['texto', 'Descrição / providências'], ['motivo', 'Descrição da infração'], ['fundamento', 'Fundamento legal'],
    ['valor_base', 'Valor base'], ['valor_multa', 'Valor da multa'], ['vencimento', 'Vencimento'],
    ['testemunha_nome', 'Testemunha'], ['pagamento', 'Pagamento'], ['ciencia', 'Ciência do responsável'],
    ['fiscal_nome', 'Fiscal responsável pelo registro'], ['registrado_em', 'Registrado em'],
    ['created_at', 'Emissão do documento'], ['atualizado_em', 'Última alteração'],
  ];
  async function documento(titulo: string, dados?: DocumentoOS) {
    secao(titulo);
    if (!dados) { campo('Registro', 'Não emitido / não aplicável nesta revisão.'); return; }
    for (const [chave, rotulo] of campos) {
      const valor = dados[chave];
      if (valor == null || valor === '') continue;
      campo(rotulo, ['valor_base', 'valor_multa'].includes(chave) ? Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) :
        chave === 'vencimento' ? data(valor, true) : ['registrado_em', 'created_at', 'atualizado_em'].includes(chave) ? data(valor) : valor);
    }
    const assinatura = dados.assinatura ?? dados.assinatura_autuado;
    if (typeof assinatura === 'string' && assinatura) {
      if (!carregarAssinatura) throw new Error('É necessário carregar a assinatura salva para gerar o documento completo.');
      const imagem = await carregarAssinatura(assinatura);
      reservar(116); const tamanho = pdf.getImageProperties(imagem);
      const proporcao = Math.min(260 / tamanho.width, 75 / tamanho.height);
      pdf.addImage(imagem, 'PNG', margem + 8, y, tamanho.width * proporcao, tamanho.height * proporcao); y += 82;
      pdf.setDrawColor(100); pdf.setLineWidth(0.4); pdf.line(margem + 8, y, margem + 270, y); y += 15;
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(55);
      pdf.text(titulo.includes('CONCLUSÃO') ? 'Assinatura manuscrita do fiscal' : 'Assinatura manuscrita do responsável / autuado', margem + 8, y); y += 20;
    }
  }
  await documento('03  NOTIFICAÇÃO', os.fluxo.notificacao);
  await documento('04  AUTO DE INFRAÇÃO — QUANDO EMITIDO', os.fluxo.auto);
  await documento('05  TERMO DE EMBARGO — QUANDO APLICÁVEL', os.fluxo.embargo);
  await documento('06  CONCLUSÃO DA ORDEM DE SERVIÇO', os.fluxo.conclusao);
  if (os.concluida_em) campo('Conclusão / limite para correções', `${data(os.concluida_em)} / ${data(os.edicao_ate)}`);
  for (const [indice, anterior] of (os.fluxo.autos_anteriores ?? []).entries()) await documento(`ANEXO ${indice + 1}  AUTO ANTERIOR VINCULADO`, anterior);
  secao('REFERÊNCIAS E OBSERVAÇÕES');
  campo('Identificador da OS', os.id);
  if (os.ocorrencia_id) campo('Denúncia vinculada', os.ocorrencia_id);
  campo('Identificador do fiscal de abertura', os.fiscal_abertura);
  campo('Validação', 'Modelo de apresentação institucional sujeito à validação do órgão responsável. Não comprova entrega de notificação por si só. Assinatura manuscrita digitalizada não equivale a certificado ICP-Brasil.');
  const paginas = pdf.getNumberOfPages();
  for (let p = 1; p <= paginas; p++) {
    pdf.setPage(p); pdf.setDrawColor(180); pdf.setLineWidth(0.4); pdf.line(margem, 788, largura - margem, 788);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7); pdf.setTextColor(85);
    pdf.text('SIFAU • Cabo de Santo Agostinho / PE • Modelo institucional', margem, 802);
    pdf.text(`${p} / ${paginas}`, largura - margem, 802, { align: 'right' });
    pdf.text('Horários de Recife • Documento gerado a partir de revisão salva no sistema.', margem, 814);
  }
  return pdf;
}

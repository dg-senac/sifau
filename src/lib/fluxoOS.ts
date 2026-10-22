import { supabase } from './supabase';
import type { Fiscal, OrdemServico } from './types';
import { prepararAnexos, enviarArquivos } from './anexos';
import { ANEXOS_BUCKET, buildAnexoPath, uploadAnexo, removerAnexo } from './storage';
import { documentsApi } from './documents';

export type EtapaOS = 'editar' | 'notificacao' | 'auto' | 'embargo' | 'concluir' | 'iniciar';
export type DocumentoOS = Record<string, string | number | null>;
export type FluxoOS = {
  fiscal_abertura_nome?: string;
  notificacao?: DocumentoOS;
  auto?: DocumentoOS;
  auto_id?: string;
  embargo?: DocumentoOS;
  conclusao?: DocumentoOS;
  autos_anteriores?: DocumentoOS[];
};
export type OrdemComFluxo = OrdemServico & {
  fluxo: FluxoOS;
  versao: number;
  concluida_em: string | null;
  edicao_ate: string | null;
};
export type RevisaoOS = {
  id: string; etapa: EtapaOS | 'criacao' | 'migracao'; versao: number; criado_em: string;
  dados: OrdemComFluxo;
};
export const OS_COLUMNS = 'id, numero, origem, ocorrencia_id, requerente, fiscal_abertura, fiscal_designado, apoio_operacional, orgao_apoio, descricao, legislacao, endereco, latitude, longitude, emitida_em, prazo_resposta, status, fluxo, versao, concluida_em, edicao_ate';
export function osBloqueada(os: OrdemComFluxo, agora = Date.now()) {
  return os.status === 'Cancelada' || (os.status === 'Concluída' &&
    (!os.edicao_ate || agora >= Date.parse(os.edicao_ate)));
}
export async function salvarEtapaOS(os: OrdemComFluxo, etapa: EtapaOS, dados: DocumentoOS, fiscal: Fiscal, assinatura?: string | null) {
  if (!navigator.onLine) throw new Error('Conecte-se à internet para salvar esta etapa. Os campos continuam nesta tela.');
  let assinaturaPath: string | undefined;
  if (assinatura) {
    const anexos = await prepararAnexos({ fiscalId: fiscal.id, arquivos: [assinatura], tipo: 'assinatura',
      vinculo: { ordem_servico_id: os.id }, mime: 'image/png', extensao: 'png' });
    await enviarArquivos(anexos);
    const { error: erroAnexo } = await supabase.from('anexos').insert(anexos.map((a) => a.anexo));
    if (erroAnexo) throw new Error('Não foi possível registrar a assinatura. Tente novamente.');
    assinaturaPath = anexos[0]?.path;
  }
  const { data, error } = await supabase.rpc('salvar_etapa_os', {
    p_os_id: os.id, p_versao: os.versao, p_etapa: etapa,
    p_dados: { ...dados, ...(assinaturaPath ? { assinatura: assinaturaPath } : {}) },
  });
  if (error) throw new Error(error.message);
  return data as OrdemComFluxo;
}

// PDF sempre usa a revisão SALVA, nunca o que ainda está sendo digitado.
// Quebra de linha e de página também para nomes/endereços/relatos extensos.
export async function baixarDossieOS(os: OrdemComFluxo, fiscal: Fiscal) {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
  let y = 48;
  function texto(valor: string, negrito = false) {
    pdf.setFont('helvetica', negrito ? 'bold' : 'normal');
    pdf.setFontSize(negrito ? 12 : 10);
    for (const linha of pdf.splitTextToSize(valor, 495) as string[]) {
      if (y > 774) { pdf.addPage(); y = 48; }
      pdf.text(linha, 48, y); y += 15;
    }
    y += 5;
  }
  texto(`SIFAU - ORDEM DE SERVIÇO ${os.numero}`, true);
  texto(`Revisão ${os.versao} | Emitida em ${new Date(os.emitida_em).toLocaleString('pt-BR')}`);
  texto(`Situação: ${os.status}${osBloqueada(os) ? ' - somente leitura' : ''}`);
  texto(`Origem: ${os.origem}`);
  texto(`Fiscal de abertura: ${os.fluxo.fiscal_abertura_nome ?? `Nome não registrado na emissão (ID: ${os.fiscal_abertura})`}`);
  texto(`Requerente: ${os.requerente}`);
  texto(`Endereço da OS: ${os.endereco}`);
  texto(`Descrição: ${os.descricao}`);
  texto(`Prazo de resposta: ${new Date(os.prazo_resposta).toLocaleString('pt-BR')}`);
  if (os.ocorrencia_id) texto(`Denúncia vinculada: ${os.ocorrencia_id}`);
  if (os.concluida_em) texto(`Concluída em: ${new Date(os.concluida_em).toLocaleString('pt-BR')}`);
  if (os.edicao_ate) texto(`Correções permitidas até: ${new Date(os.edicao_ate).toLocaleString('pt-BR')}`);
  const nomes: Record<string, string> = {
    nome: 'Responsável', documento: 'Documento', endereco: 'Endereço', texto: 'Relato',
    fundamento: 'Fundamento legal', ciencia: 'Ciência', fiscal_nome: 'Fiscal responsável',
    autuado_nome: 'Autuado', autuado_documento: 'Documento do autuado',
    tipo_infracao: 'Infração', artigo_legal: 'Artigo legal', motivo: 'Motivo',
    valor_base: 'Valor base (R$)', valor_multa: 'Multa (R$)', vencimento: 'Vencimento',
    testemunha_nome: 'Testemunha', pagamento: 'Pagamento', registrado_em: 'Registro',
    created_at: 'Emissão', atualizado_em: 'Última alteração',
  };
  const secoes = [ ['notificacao', 'NOTIFICAÇÃO'], ['auto', 'AUTO DE INFRAÇÃO'],
    ['embargo', 'TERMO DE EMBARGO'], ['conclusao', 'CONCLUSÃO'] ] as const;
  const documentos: [string, DocumentoOS | undefined][] = secoes.map(([chave, titulo]) => [titulo, os.fluxo[chave]]);
  for (const anterior of os.fluxo.autos_anteriores ?? []) documentos.push(['AUTO ANTERIOR VINCULADO À OS', anterior]);
  for (const [titulo, dados] of documentos) {
    texto(titulo, true);
    if (!dados) { texto('Não emitido / não aplicável.'); continue; }
    for (const [campo, valor] of Object.entries(dados)) {
      if (nomes[campo] && valor != null && valor !== '') texto(`${nomes[campo]}: ${valor}`);
    }
    const path = dados.assinatura ?? dados.assinatura_autuado;
    if (typeof path === 'string' && path) {
      const { data, error } = await supabase.storage.from(ANEXOS_BUCKET).download(path);
      if (error || !data) throw new Error('Não foi possível carregar uma assinatura. Tente baixar novamente.');
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject; reader.readAsDataURL(data);
      });
      if (y + 95 > 774) { pdf.addPage(); y = 48; }
      pdf.addImage(dataUrl, 'PNG', 48, y, 240, 80); y += 100;
      texto(titulo === 'CONCLUSÃO' ? 'Assinatura manuscrita do fiscal.' : 'Assinatura manuscrita do responsável/autuado.');
    }
  }
  texto('Assinaturas manuscritas digitalizadas não equivalem a certificado digital ICP-Brasil.');
  const nome = `${os.numero.replace(/[^a-zA-Z0-9_-]/g, '_')}-revisao-${os.versao}.pdf`;
  // Arquiva uma cópia privada vinculada à OS. Falha no arquivo não é anunciada como sucesso.
  const { data: arquivados, error: erroConsulta } = await supabase.from('documentos')
    .select('id').eq('ordem_servico_id', os.id).eq('metadados->>origem', 'fluxo_os')
    .eq('metadados->>os_versao', String(os.versao)).limit(1);
  if (erroConsulta) throw new Error('Não foi possível consultar o arquivo da OS. Tente novamente.');
  if (arquivados?.length) { pdf.save(nome); return; }
  const id = crypto.randomUUID();
  const path = buildAnexoPath(fiscal.id, id, new Date(), 'pdf');
  const dataUrl = pdf.output('datauristring');
  await uploadAnexo(path, dataUrl);
  try {
    await documentsApi.create({ fiscal_id: fiscal.id, ocorrencia_id: null,
      vistoria_id: null, ordem_servico_id: os.id, tipo_documento: 'relatorio',
      titulo: nome, descricao: 'Dossiê da OS, gerado a partir de revisão salva.',
      arquivo_path: path, arquivo_nome: nome, arquivo_tipo: 'application/pdf',
      arquivo_tamanho: pdf.output('blob').size, ordem: os.versao,
      metadados: { os_versao: os.versao, origem: 'fluxo_os' },
    });
  } catch (error) { await removerAnexo(path).catch(() => {}); throw error; }
  pdf.save(nome);
}

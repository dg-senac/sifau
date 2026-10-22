import { supabase } from './supabase';
import type { Fiscal, OrdemServico } from './types';
import { prepararAnexos, enviarArquivos } from './anexos';
import { ANEXOS_BUCKET, buildAnexoPath, uploadAnexo, removerAnexo } from './storage';
import { documentsApi } from './documents';

export type EtapaOS = 'editar' | 'notificacao' | 'auto' | 'embargo' | 'concluir' | 'iniciar';
export type DocumentoOS = Record<string, string | number | null>;
export type DecisaoAutoOS = {
  decisao: 'emitir' | 'nao_emitir'; justificativa: string; fiscal_id: string; fiscal_nome: string; registrado_em: string;
};
export type FluxoOS = {
  fiscal_abertura_nome?: string;
  notificacao?: DocumentoOS;
  decisao_auto?: DecisaoAutoOS;
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
  id: string; etapa: EtapaOS | 'criacao' | 'migracao' | 'decisao_auto'; versao: number; criado_em: string;
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
  const { criarPdfOS } = await import('./pdfOS');
  const pdf = await criarPdfOS(os, async (path) => {
    const { data, error } = await supabase.storage.from(ANEXOS_BUCKET).download(path);
    if (error || !data) throw new Error('Não foi possível carregar uma assinatura. Tente novamente.');
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject; reader.readAsDataURL(data);
    });
  });
  const nome = `${os.numero.replace(/[^a-zA-Z0-9_-]/g, '_')}-revisao-${os.versao}.pdf`;
  // Arquiva uma cópia privada vinculada à OS. Falha no arquivo não é anunciada como sucesso.
  const { data: arquivados, error: erroConsulta } = await supabase.from('documentos')
    .select('id').eq('ordem_servico_id', os.id).eq('metadados->>origem', 'fluxo_os')
    .eq('metadados->>os_versao', String(os.versao)).eq('metadados->>modelo_pdf', 'cabo-institucional-v1').limit(1);
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
      metadados: { os_versao: os.versao, origem: 'fluxo_os', modelo_pdf: 'cabo-institucional-v1' },
    });
  } catch (error) { await removerAnexo(path).catch(() => {}); throw error; }
  pdf.save(nome);
}

export async function decidirAutoOS(os: OrdemComFluxo, emitir: boolean, justificativa = '') {
  if (!navigator.onLine) throw new Error('Conecte-se para registrar sua decisão.');
  const { data, error } = await supabase.rpc('decidir_auto_os', {
    p_os_id: os.id, p_versao: os.versao, p_emitir: emitir, p_justificativa: justificativa,
  });
  if (error) throw new Error(error.message);
  return data as OrdemComFluxo;
}

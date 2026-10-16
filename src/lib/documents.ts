import { supabase } from './supabase';
import { Documento } from './types';
import { createQueueId } from './offlineQueue';
import { buildAnexoPath, removerAnexo, uploadAnexo } from './storage';
import { fileUtils } from './fileUtils';

// ============================================================================
// SIFAU — Biblioteca de documentos do fiscal
// ============================================================================
// Diferente das fotos de campo, o arquivo daqui é PDF e Word digitalizado, que
// não dá para recomprimir: ele mora no bucket `sifau-anexos` e a linha guarda
// só o caminho (`arquivo_path`).
//
// As consultas listam as colunas uma a uma de propósito: `select('*')` trazia o
// conteúdo inteiro de cada documento para desenhar a lista, e é isso — não o
// número de linhas — que deixava a tela lenta.
// ============================================================================

/**
 * Colunas que o app realmente lê. Fora daqui só existe conteúdo no bucket.
 *
 * Numa linha só, de propósito: o `supabase-js` deduz o tipo do resultado a
 * partir do texto literal passado ao `select`, e uma constante montada com `+`
 * vira `string` — a dedução se perde e o retorno chega como `GenericStringError`.
 */
const CAMPOS_DOCUMENTO = 'id, fiscal_id, ocorrencia_id, vistoria_id, ordem_servico_id, tipo_documento, titulo, descricao, arquivo_path, arquivo_nome, arquivo_tipo, arquivo_tamanho, ordem, metadados, criado_em, atualizado_em';

export const documentsApi = {
  // Buscar documentos por fiscal
  async getByFiscal(fiscalId: string) {
    const { data, error } = await supabase
      .from('documentos')
      .select(CAMPOS_DOCUMENTO)
      .eq('fiscal_id', fiscalId)
      .order('criado_em', { ascending: false });
    
    if (error) throw error;
    return data as Documento[];
  },

  // Buscar documentos por ocorrência
  async getByOccurrence(occurrenceId: string) {
    const { data, error } = await supabase
      .from('documentos')
      .select(CAMPOS_DOCUMENTO)
      .eq('ocorrencia_id', occurrenceId)
      .order('ordem', { ascending: true });
    
    if (error) throw error;
    return data as Documento[];
  },

  // Buscar documentos por vistoria
  async getByVistoria(vistoriaId: string) {
    const { data, error } = await supabase
      .from('documentos')
      .select(CAMPOS_DOCUMENTO)
      .eq('vistoria_id', vistoriaId)
      .order('ordem', { ascending: true });
    
    if (error) throw error;
    return data as Documento[];
  },

  // Buscar documentos por ordem de serviço
  async getByOrdemServico(ordemServicoId: string) {
    const { data, error } = await supabase
      .from('documentos')
      .select(CAMPOS_DOCUMENTO)
      .eq('ordem_servico_id', ordemServicoId)
      .order('ordem', { ascending: true });
    
    if (error) throw error;
    return data as Documento[];
  },

  // Criar novo documento
  async create(documento: Omit<Documento, 'id' | 'criado_em' | 'atualizado_em'>) {
    const { data, error } = await supabase
      .from('documentos')
      .insert(documento)
      .select(CAMPOS_DOCUMENTO)
      .single();
    
    if (error) throw error;
    return data as Documento;
  },

  // Atualizar documento
  async update(id: string, updates: Partial<Documento>) {
    const { data, error } = await supabase
      .from('documentos')
      .update(updates)
      .eq('id', id)
      .select(CAMPOS_DOCUMENTO)
      .single();
    
    if (error) throw error;
    return data as Documento;
  },

  // Deletar documento
  async delete(id: string) {
    const { error } = await supabase
      .from('documentos')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
  },

  // Reordenar documentos
  async reorder(documentos: { id: string; ordem: number }[]) {
    const updates = documentos.map(({ id, ordem }) =>
      supabase.from('documentos').update({ ordem }).eq('id', id)
    );
    
    const results = await Promise.all(updates);
    const failedUpdate = results.find((result) => result.error)?.error;
    if (failedUpdate) throw failedUpdate;
  },

  /**
   * Sobe um arquivo e grava a linha do documento.
   *
   * A ordem importa e é a mesma das fotos de campo: o arquivo entra no bucket
   * ANTES da linha. Se a linha falhasse primeiro, o registro apontaria para um
   * arquivo que não existe; falhando depois, o pior caso é um arquivo no bucket
   * sem linha — e esse é removido aqui mesmo.
   */
  async enviarArquivo({
    arquivo, fiscalId, ordem, tipo = 'documento',
  }: {
    arquivo: File;
    fiscalId: string;
    ordem: number;
    tipo?: Documento['tipo_documento'];
  }): Promise<Documento> {
    const dataUrl = await fileUtils.fileToBase64(arquivo, true);
    const mime = fileUtils.mimeDoDataUrl(dataUrl);
    const documentoId = createQueueId();
    const caminho = buildAnexoPath(fiscalId, documentoId, new Date(), fileUtils.extensaoDoMime(mime));

    await uploadAnexo(caminho, dataUrl);

    try {
      return await documentsApi.create({
        fiscal_id: fiscalId,
        ocorrencia_id: null,
        vistoria_id: null,
        ordem_servico_id: null,
        tipo_documento: tipo,
        titulo: arquivo.name,
        descricao: null,
        arquivo_path: caminho,
        arquivo_nome: arquivo.name,
        arquivo_tipo: mime,
        // Tamanho do que foi GRAVADO: uma foto reduzida na tela ocupa bem menos
        // que o arquivo original, e é o número gravado que descreve o acervo.
        arquivo_tamanho: Math.ceil((dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75),
        ordem,
        metadados: { uploadDate: new Date().toISOString(), originalName: arquivo.name },
      });
    } catch (error) {
      await removerAnexo(caminho).catch((falha) => {
        console.error('Arquivo ficou no bucket sem linha de documento:', caminho, falha);
      });
      throw error;
    }
  },

  /** Apaga a linha e, depois, o arquivo. Linha primeiro: ela é a fonte da verdade. */
  async removerDocumento(documento: Pick<Documento, 'id' | 'arquivo_path'>) {
    await documentsApi.delete(documento.id);
    await removerAnexo(documento.arquivo_path).catch((falha) => {
      console.error('Documento apagado, mas o arquivo ficou no bucket:', documento.arquivo_path, falha);
    });
  },

  // Buscar documento por ID
  async getById(id: string) {
    const { data, error } = await supabase
      .from('documentos')
      .select(CAMPOS_DOCUMENTO)
      .eq('id', id)
      .single();
    
    if (error) throw error;
    return data as Documento;
  },
};

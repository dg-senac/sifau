import { supabase } from './supabase';
import { Documento } from './types';

// Funções para gerenciar documentos
export const documentsApi = {
  // Buscar documentos por fiscal
  async getByFiscal(fiscalId: string) {
    const { data, error } = await supabase
      .from('documentos')
      .select('*')
      .eq('fiscal_id', fiscalId)
      .order('criado_em', { ascending: false });
    
    if (error) throw error;
    return data as Documento[];
  },

  // Buscar documentos por ocorrência
  async getByOccurrence(occurrenceId: string) {
    const { data, error } = await supabase
      .from('documentos')
      .select('*')
      .eq('ocorrencia_id', occurrenceId)
      .order('ordem', { ascending: true });
    
    if (error) throw error;
    return data as Documento[];
  },

  // Buscar documentos por vistoria
  async getByVistoria(vistoriaId: string) {
    const { data, error } = await supabase
      .from('documentos')
      .select('*')
      .eq('vistoria_id', vistoriaId)
      .order('ordem', { ascending: true });
    
    if (error) throw error;
    return data as Documento[];
  },

  // Buscar documentos por ordem de serviço
  async getByOrdemServico(ordemServicoId: string) {
    const { data, error } = await supabase
      .from('documentos')
      .select('*')
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
      .select()
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
      .select()
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

  // Buscar documento por ID
  async getById(id: string) {
    const { data, error } = await supabase
      .from('documentos')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) throw error;
    return data as Documento;
  },
};

// Funções auxiliares para converter arquivos
export const fileUtils = {
  // Evitar arquivos enormes em base64; uploads vão pelo REST e não pelo Storage.
  validateFileSize(file: File, maxSizeMB: number = 5): boolean {
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    return file.size <= maxSizeBytes;
  },

  validateFileType(file: File): boolean {
    const allowedTypes = new Set([
      'image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ]);
    const allowedExtensions = new Set(['jpg', 'jpeg', 'png', 'webp', 'pdf', 'doc', 'docx']);
    const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
    return allowedExtensions.has(extension) && (!file.type || allowedTypes.has(file.type));
  },

  // Comprimir imagem antes de converter para base64
  async compressImage(file: File, maxWidth: number = 1920, quality: number = 0.85): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          // Redimensionar se necessário
          if (width > maxWidth) {
            height = (height * maxWidth) / width;
            width = maxWidth;
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Failed to get canvas context'));
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);

          // Converter para base64 com compressão
          const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
          resolve(compressedDataUrl);
        };
        img.onerror = reject;
        img.src = e.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  },

  // Converter arquivo para base64 (com compressão para imagens)
  async fileToBase64(file: File, compress: boolean = true): Promise<string> {
    // Validar tamanho
    if (!this.validateFileSize(file, 5)) {
      throw new Error('Arquivo muito grande. Máximo permitido: 5MB');
    }
    if (!this.validateFileType(file)) {
      throw new Error('Tipo de arquivo não permitido. Envie imagens JPG, PNG ou WebP, PDF ou Word.');
    }

    // Se for imagem e compressão estiver habilitada, comprimir
    if (compress && file.type.startsWith('image/')) {
      return this.compressImage(file);
    }

    // Para outros arquivos, converter direto
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  },

  // Converter base64 para blob
  base64ToBlob(base64: string, mimeType: string): Blob {
    const byteCharacters = atob(base64.split(',')[1]);
    const byteArrays = [];
    
    for (let offset = 0; offset < byteCharacters.length; offset += 512) {
      const slice = byteCharacters.slice(offset, offset + 512);
      const byteNumbers = new Array(slice.length);
      
      for (let i = 0; i < slice.length; i++) {
        byteNumbers[i] = slice.charCodeAt(i);
      }
      
      const byteArray = new Uint8Array(byteNumbers);
      byteArrays.push(byteArray);
    }
    
    return new Blob(byteArrays, { type: mimeType });
  },

  // Determinar MIME type
  getMimeType(fileName: string): string {
    const ext = fileName.split('.').pop()?.toLowerCase();
    const mimeTypes: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      pdf: 'application/pdf',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xls: 'application/vnd.ms-excel',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
    
    return mimeTypes[ext || ''] || 'application/octet-stream';
  },

  // Formatar tamanho do arquivo
  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  },
};

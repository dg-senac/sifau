import { supabase } from './supabase';
import { Documento, AssinaturaDigital } from './types';

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
    
    await Promise.all(updates);
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

// Funções para gerenciar assinaturas digitais
export const signaturesApi = {
  // Criar assinatura digital
  async create(assinatura: Omit<AssinaturaDigital, 'id' | 'criado_em'>) {
    // Gerar hash do documento se fornecido
    let hashDocumento = assinatura.hash_documento;
    if (assinatura.documento_id && !hashDocumento) {
      const documento = await documentsApi.getById(assinatura.documento_id);
      hashDocumento = await this.generateHash(documento.arquivo_data);
    }

    // Validar certificado se fornecido
    let certificadoValido = assinatura.certificado_valido;
    if (assinatura.certificado_digital && !certificadoValido) {
      const { data, error } = await supabase.rpc('validar_certificado_digital', {
        p_certificado: assinatura.certificado_digital,
        p_emissor: assinatura.certificado_emissor,
        p_validade_inicio: assinatura.certificado_validade_inicio,
        p_validade_fim: assinatura.certificado_validade_fim,
      });
      
      if (!error) {
        certificadoValido = data;
      }
    }

    const { data, error } = await supabase
      .from('assinaturas_digitais')
      .insert({
        ...assinatura,
        hash_documento: hashDocumento,
        certificado_valido: certificadoValido,
      })
      .select()
      .single();
    
    if (error) throw error;
    return data as AssinaturaDigital;
  },

  // Buscar assinaturas por fiscal
  async getByFiscal(fiscalId: string) {
    const { data, error } = await supabase
      .from('assinaturas_digitais')
      .select('*')
      .eq('fiscal_id', fiscalId)
      .order('criado_em', { ascending: false });
    
    if (error) throw error;
    return data as AssinaturaDigital[];
  },

  // Buscar assinaturas por documento
  async getByDocumento(documentoId: string) {
    const { data, error } = await supabase
      .from('assinaturas_digitais')
      .select('*')
      .eq('documento_id', documentoId)
      .order('criado_em', { ascending: false });
    
    if (error) throw error;
    return data as AssinaturaDigital[];
  },

  // Validar assinatura
  async validate(assinaturaId: string) {
    const { data, error } = await supabase
      .from('assinaturas_digitais')
      .select('*')
      .eq('id', assinaturaId)
      .single();
    
    if (error) throw error;
    
    const assinatura = data as AssinaturaDigital;
    
    // Verificar certificado
    if (assinatura.certificado_digital) {
      const { data: valid, error: validationError } = await supabase.rpc('validar_certificado_digital', {
        p_certificado: assinatura.certificado_digital,
        p_emissor: assinatura.certificado_emissor,
        p_validade_inicio: assinatura.certificado_validade_inicio,
        p_validade_fim: assinatura.certificado_validade_fim,
      });
      
      if (validationError) throw validationError;
      
      return {
        isValid: valid,
        certificadoValido: valid,
        assinatura,
      };
    }
    
    return {
      isValid: true,
      certificadoValido: false,
      assinatura,
    };
  },

  // Gerar hash do documento
  async generateHash(data: string) {
    const { data: hash, error } = await supabase.rpc('gerar_hash_documento', {
      p_data: data,
    });
    
    if (error) throw error;
    return hash as string;
  },

  // Capturar informações do dispositivo
  captureDeviceInfo(): Record<string, any> {
    return {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      screenWidth: window.screen.width,
      screenHeight: window.screen.height,
      timestamp: new Date().toISOString(),
    };
  },

  // Capturar IP address (simulado - em produção usaria uma API real)
  async captureIP(): Promise<string | null> {
    try {
      const response = await fetch('https://api.ipify.org?format=json');
      const data = await response.json();
      return data.ip;
    } catch {
      return null;
    }
  },
};

// Funções auxiliares para converter arquivos
export const fileUtils = {
  // Validar tamanho do arquivo (máximo 5MB)
  validateFileSize(file: File, maxSizeMB: number = 5): boolean {
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    return file.size <= maxSizeBytes;
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
    if (!this.validateFileSize(file, 10)) {
      throw new Error('Arquivo muito grande. Máximo permitido: 10MB');
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

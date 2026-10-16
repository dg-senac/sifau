// ============================================================================
// SIFAU — Utilidades de arquivo do aplicativo
// ============================================================================
// Regras que valem para QUALQUER upload do app (foto de campo, documento
// digitalizado, assinatura): limite de tamanho, tipos aceitos, redução da
// imagem antes de converter e formatação de tamanho para exibir.
//
// O arquivo em base64 (data URL) aqui é só passagem: é o formato que o canvas e
// o `FileReader` produzem e o que o upload para o Storage consome. Nada disso
// vai para o banco — desde a migração para o bucket, o banco guarda caminho.
// ============================================================================

export const fileUtils = {
  /** Tamanho máximo aceito no upload, em MB. Igual ao limite do bucket. */
  LIMITE_MB: 5,

  /** Medida máxima da imagem antes de subir: 1920 px (documento digitalizado). */
  LARGURA_MAXIMA_DOCUMENTO: 1920,

  /** Evita arquivos enormes em base64. O limite também existe no bucket. */
  validateFileSize(file: File, maxSizeMB: number = 5): boolean {
    return file.size <= maxSizeMB * 1024 * 1024;
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

  /** Reduz a imagem para caber em `maxWidth` e devolve um data URL JPEG. */
  async compressImage(file: File, maxWidth: number = 1920, quality: number = 0.85): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let { width, height } = img;

          if (width > maxWidth) {
            height = (height * maxWidth) / width;
            width = maxWidth;
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Não foi possível preparar a imagem para redução.'));
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = () => reject(new Error('O arquivo não é uma imagem legível.'));
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject(new Error('Falha ao ler o arquivo.'));
      reader.readAsDataURL(file);
    });
  },

  /**
   * Converte o arquivo para data URL, reduzindo imagens.
   *
   * Imagem vira JPEG reduzido (a maior parte do peso de uma foto de celular é
   * resolução que nenhuma tela do app usa); PDF e Word vão inteiros.
   */
  async fileToBase64(file: File, compress: boolean = true): Promise<string> {
    if (!this.validateFileSize(file)) {
      throw new Error(`Arquivo "${file.name}" excede o limite de ${this.LIMITE_MB} MB.`);
    }
    if (!this.validateFileType(file)) {
      throw new Error(`Tipo de arquivo não permitido: ${file.name}. Envie JPG, PNG, WebP, PDF ou Word.`);
    }

    if (compress && file.type.startsWith('image/')) {
      return this.compressImage(file);
    }

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error(`Falha ao ler "${file.name}".`));
      reader.readAsDataURL(file);
    });
  },

  /** MIME declarado no começo de um data URL (`data:image/jpeg;base64,...`). */
  mimeDoDataUrl(dataUrl: string): string {
    return /^data:([^;,]+)/.exec(dataUrl)?.[1] ?? 'application/octet-stream';
  },

  /** Extensão de arquivo a partir do MIME, para o caminho no bucket. */
  extensaoDoMime(mime: string): string {
    const mapa: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif',
      'application/pdf': 'pdf',
      'application/msword': 'doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    };
    return mapa[mime] ?? 'bin';
  },

  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  },
};

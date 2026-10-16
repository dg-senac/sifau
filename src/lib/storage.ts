// ============================================================================
// SIFAU — Arquivos no Supabase Storage
// ============================================================================
// Até o passo 10 a foto era gravada em base64 DENTRO da linha do banco. Isso
// pesava ~7,8 MB por ciclo de fiscalização (ocorrência com 5 fotos mais
// vistoria com 3), e 99,7% desse peso era conteúdo que nenhuma tela exibe.
//
// Agora o arquivo vai para o bucket privado `sifau-anexos` e o banco guarda o
// caminho. Duas consequências que valem estar escritas aqui:
//
//   1. O caminho é MONTADO ANTES do upload, a partir do id do fiscal e do id do
//      anexo (que o app já gera na hora de enfileirar). Isso é o que permite
//      gravar a linha offline com o caminho certo e subir o arquivo depois,
//      sem precisar reescrever a linha.
//
//   2. O upload é idempotente (`upsert`). Se o app for fechado no meio do envio,
//      a próxima tentativa sobe o mesmo caminho de novo, sem duplicar arquivo.
//
// A política do bucket exige que a PRIMEIRA pasta do caminho seja o id do
// fiscal (`{fiscal_id}/{ano}/{mes}/{anexo_id}.jpg`). É por isso que o caminho
// não é escolhido pela tela: quem monta é esta função.
// ============================================================================

import { supabase } from '@/lib/supabase';

export const ANEXOS_BUCKET = 'sifau-anexos';

/** Momento do arquivo na linha do tempo: registro da ocorrência ou vistoria. */
export type Momento = 'antes' | 'depois';

/** Tipos aceitos pela tabela `public.anexos` (o CHECK do banco é a autoridade). */
export type TipoAnexo =
  | 'foto'
  | 'foto_depois'
  | 'assinatura'
  | 'documento'
  | 'relatorio'
  | 'auto_infracao'
  | 'anexo_mensagem';

/**
 * Monta o caminho do objeto no bucket.
 *
 * `{fiscal_id}/{ano}/{mes}/{anexo_id}.jpg` — o primeiro nível é o que a
 * política de acesso usa para separar um fiscal do outro.
 */
export function buildAnexoPath(
  fiscalId: string,
  anexoId: string,
  quando: Date = new Date(),
  extensao = 'jpg',
): string {
  const ano = String(quando.getFullYear());
  const mes = String(quando.getMonth() + 1).padStart(2, '0');
  return `${fiscalId}/${ano}/${mes}/${anexoId}.${extensao}`;
}

/** Converte o data URL que o `PhotoUpload` produz em Blob, sem passar pela rede. */
export function dataUrlToBlob(dataUrl: string): Blob {
  const separador = dataUrl.indexOf(',');
  if (separador < 0) throw new Error('Arquivo de imagem inválido.');

  const cabecalho = dataUrl.slice(0, separador);
  const corpo = dataUrl.slice(separador + 1);
  const mime = /:(.*?);/.exec(cabecalho)?.[1] ?? 'image/jpeg';

  const binario = atob(corpo);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/** Tamanho real do arquivo, em bytes, a partir do data URL. */
export function dataUrlBytes(dataUrl: string): number {
  const separador = dataUrl.indexOf(',');
  if (separador < 0) return 0;
  const corpo = dataUrl.slice(separador + 1);
  // Cada 4 caracteres base64 viram 3 bytes; o `padding` desconta o recheio.
  const recheio = corpo.endsWith('==') ? 2 : corpo.endsWith('=') ? 1 : 0;
  return Math.floor((corpo.length * 3) / 4) - recheio;
}

/** Dimensões da imagem, para o relatório de uso em `anexos.largura/altura`. */
function measure(dataUrl: string): Promise<{ largura: number; altura: number }> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve({ largura: image.naturalWidth, altura: image.naturalHeight });
    // Sem dimensão não se perde o arquivo: a linha fica sem largura/altura.
    image.onerror = () => resolve({ largura: 0, altura: 0 });
    image.src = dataUrl;
  });
}

export type DadosDoAnexo = { largura: number; altura: number; bytes: number };

/** Lê as informações do arquivo antes de subir, para gravar em `anexos`. */
export async function inspecionarArquivo(dataUrl: string): Promise<DadosDoAnexo> {
  const { largura, altura } = await measure(dataUrl);
  return { largura, altura, bytes: dataUrlBytes(dataUrl) };
}

/**
 * Sobe o arquivo para o bucket. Idempotente: subir o mesmo caminho duas vezes
 * substitui o arquivo em vez de falhar.
 *
 * Não trata erro de propósito — quem chama decide se enfileira para depois
 * (o caso de campo, sem sinal) ou se mostra a mensagem.
 */
export async function uploadAnexo(path: string, dataUrl: string): Promise<void> {
  const blob = dataUrlToBlob(dataUrl);
  const { error } = await supabase.storage
    .from(ANEXOS_BUCKET)
    .upload(path, blob, { upsert: true, contentType: blob.type || 'image/jpeg' });
  if (error) throw error;
}

/**
 * Remove o arquivo do bucket. Usado quando o registro que o referenciava não
 * chegou a existir, para não deixar arquivo órfão pagando cota.
 */
export async function removerAnexo(path: string): Promise<void> {
  const { error } = await supabase.storage.from(ANEXOS_BUCKET).remove([path]);
  if (error) throw error;
}

// ============================================================================
// SIFAU — Anexos da conversa entre administração e fiscal
// ============================================================================
// O administrador pode mandar arquivo junto da mensagem no painel. Como nas
// fotos de campo e na biblioteca de documentos, o arquivo mora no bucket
// `sifau-anexos` e a linha guarda só o caminho — aqui, a lista de caminhos em
// `admin_messages.attachments` (uma coluna `text[]`, o mesmo formato de
// `ocorrencias.fotos`).
//
// O arquivo sobe pela pasta de QUEM ENVIA. Não é detalhe de organização: a
// política do bucket exige que o primeiro nível do caminho seja o id do usuário
// autenticado, então gravar na pasta do destinatário seria recusado pelo
// Storage.
// ============================================================================

import { createQueueId } from '@/lib/offlineQueue';
import { buildAnexoPath, extensaoDoPath, removerAnexo, uploadAnexo } from '@/lib/storage';
import { fileUtils } from '@/lib/fileUtils';

export type AnexoDeMensagem = {
  /** Caminho no bucket — é isto que a coluna `attachments` guarda. */
  path: string;
  /** O arquivo em memória, para subir. Não vai para o banco. */
  dataUrl: string;
};

/**
 * Prepara os arquivos escolhidos no painel: reduz imagem, monta o caminho e
 * devolve o par (caminho, arquivo) já pronto para subir.
 *
 * Valida tamanho e tipo igual ao resto do app — `fileToBase64` lança com a
 * mensagem que a tela mostra.
 */
export async function prepararAnexosDeMensagem({
  remetenteId,
  arquivos,
}: {
  remetenteId: string;
  arquivos: File[];
}): Promise<AnexoDeMensagem[]> {
  return Promise.all(arquivos.map(async (arquivo) => {
    const dataUrl = await fileUtils.fileToBase64(arquivo, true);
    const mime = fileUtils.mimeDoDataUrl(dataUrl);
    const path = buildAnexoPath(
      remetenteId,
      createQueueId(),
      new Date(),
      fileUtils.extensaoDoMime(mime),
    );
    return { path, dataUrl };
  }));
}

/** Sobe todos os arquivos. Lança se algum falhar — quem chama decide o destino. */
export async function enviarAnexosDeMensagem(anexos: AnexoDeMensagem[]): Promise<void> {
  await Promise.all(anexos.map((anexo) => uploadAnexo(anexo.path, anexo.dataUrl)));
}

/** Nome sugerido para download. A coluna guarda só o caminho, então o nome é ele. */
export function nomeDoAnexoDaMensagem(path: string): string {
  return path.split('/').pop() ?? path;
}

/**
 * Como chamar o anexo na tela.
 *
 * O nome original do arquivo se perdeu quando o anexo saiu de dentro da linha
 * (a coluna é uma lista de caminhos, e o caminho carrega o id do arquivo para
 * não colidir com nomes repetidos). Mostrar `3f2a....pdf` para o fiscal não
 * ajuda ninguém — o que ele precisa saber é se aquilo é foto, PDF ou documento
 * do Word, porque cada um abre de um jeito.
 */
export function rotuloDoAnexo(path: string): string {
  const extensao = extensaoDoPath(path);
  if (['jpg', 'jpeg', 'png', 'webp', 'heic', 'gif'].includes(extensao)) return 'Foto';
  if (extensao === 'pdf') return 'Documento PDF';
  if (['doc', 'docx'].includes(extensao)) return 'Documento do Word';
  return 'Arquivo';
}

/**
 * Descarta arquivos que subiram mas ficaram sem mensagem (o envio falhou depois
 * do upload). Falha aqui não pode derrubar nada: o registro já não existe, o
 * que sobra é arquivo sem dono no bucket.
 */
export async function descartarAnexosDeMensagem(anexos: AnexoDeMensagem[]): Promise<void> {
  await Promise.all(anexos.map((anexo) => removerAnexo(anexo.path).catch((falha) => {
    console.error('Arquivo ficou no bucket sem mensagem:', anexo.path, falha);
  })));
}

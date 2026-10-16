// ============================================================================
// SIFAU — Preparo das fotos que acompanham um registro
// ============================================================================
// Uma foto de campo percorre três passos: é reduzida no `PhotoUpload`, sobe
// para o bucket e vira uma linha em `public.anexos` ligada ao registro. Esta
// função faz o preparo (medida + caminho + linha de anexo) num lugar só, para
// que as duas telas que gravam foto sigam exatamente a mesma regra.
//
// Por que o caminho é montado aqui e não na hora de subir: o app grava o
// registro OFFLINE com o caminho já dentro. Se o caminho só existisse depois do
// envio, a linha salva em campo apontaria para o nada.
// ============================================================================

import { createQueueId } from '@/lib/offlineQueue';
import { supabase } from '@/lib/supabase';
import {
  buildAnexoPath, inspecionarArquivo, uploadAnexo,
  type Momento, type TipoAnexo,
} from '@/lib/storage';

/** O vínculo do anexo com o registro. O banco exige exatamente um. */
export type VinculoAnexo =
  | { ocorrencia_id: string }
  | { vistoria_id: string }
  | { auto_infracao_id: string };

export type AnexoPreparado = {
  id: string;
  path: string;
  dataUrl: string;
  /** Linha de `public.anexos` pronta para inserir, depois do vínculo existir. */
  anexo: Record<string, unknown>;
};

export type PreparoAnexos = {
  fiscalId: string;
  /** Arquivos em data URL, do jeito que o `PhotoUpload` e o `SignaturePad` produzem. */
  arquivos: string[];
  tipo: TipoAnexo;
  momento?: Momento | null;
  vinculo: VinculoAnexo;
  mime?: string;
  extensao?: string;
};

export async function prepararAnexos({
  fiscalId, arquivos, tipo, momento = null, vinculo, mime = 'image/jpeg', extensao = 'jpg',
}: PreparoAnexos): Promise<AnexoPreparado[]> {
  return Promise.all(arquivos.map(async (dataUrl) => {
    const id = createQueueId();
    const path = buildAnexoPath(fiscalId, id, new Date(), extensao);
    const { largura, altura, bytes } = await inspecionarArquivo(dataUrl);

    return {
      id,
      path,
      dataUrl,
      anexo: {
        id,
        fiscal_id: fiscalId,
        ...vinculo,
        tipo,
        momento,
        storage_path: path,
        arquivo_tipo: mime,
        arquivo_bytes: bytes || null,
        largura: largura || null,
        altura: altura || null,
      },
    };
  }));
}

/** Sobe todos os arquivos. Lança se algum falhar — quem chama decide o destino. */
export async function enviarArquivos(arquivos: AnexoPreparado[]): Promise<void> {
  await Promise.all(arquivos.map((arquivo) => uploadAnexo(arquivo.path, arquivo.dataUrl)));
}

/**
 * Grava as linhas de `anexos` depois que o registro existe.
 *
 * Falha aqui não derruba o registro: o arquivo já está no bucket e o caminho já
 * está na linha. O que faltaria é a descrição do arquivo, que pode ser
 * recomposta a partir do caminho — por isso o erro é registrado, não propagado.
 */
export async function gravarAnexos(arquivos: AnexoPreparado[]): Promise<void> {
  if (arquivos.length === 0) return;
  const { error } = await supabase
    .from('anexos')
    .upsert(arquivos.map((arquivo) => arquivo.anexo), { onConflict: 'id', ignoreDuplicates: true });
  if (error) console.error('Fotos gravadas no Storage sem descrição em anexos:', error);
}

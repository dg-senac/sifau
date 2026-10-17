import { supabase } from '@/lib/supabase';
import { uploadAnexo } from '@/lib/storage';

/**
 * Arquivo que acompanha um registro pendente (passo 10: foto no Storage).
 *
 * O arquivo viaja junto do registro, e não como item separado, por dois
 * motivos: a contagem do aviso de sincronização continua contando REGISTROS
 * (uma ocorrência com 3 fotos é 1 pendência, não 4), e a ordem fica garantida —
 * o arquivo sobe antes de a linha que o referencia ser gravada.
 */
export type ArquivoPendente = {
  /** Caminho no bucket, já montado antes do envio. */
  path: string;
  /** O arquivo em si, no formato que o `PhotoUpload` produz. */
  dataUrl: string;
  /** Linha de `public.anexos` a inserir depois que o vínculo existir. */
  anexo: Record<string, unknown>;
};

export type QueueItem = {
  id: string;
  table: string;
  op: 'insert' | 'update';
  payload: Record<string, unknown>;
  match?: Record<string, unknown>;
  label: string;
  createdAt: string;
  error?: string;
  /** Arquivos a subir para o Storage antes de gravar a linha. */
  uploads?: ArquivoPendente[];
};

const STORAGE_KEY = 'sifau-offline-queue';
type Listener = (queue: QueueItem[]) => void;
const listeners = new Set<Listener>();
let currentQueueUserId: string | null = null;
let flushing = false;

function getStorageKey(userId = currentQueueUserId): string {
  return `${STORAGE_KEY}:${userId ?? 'anonymous'}`;
}

/** Isola os dados pendentes por conta neste aparelho compartilhado. */
export function setQueueUser(userId: string | null) {
  if (currentQueueUserId === userId) return;
  currentQueueUserId = userId;
  const queue = readQueue(getStorageKey(userId));
  listeners.forEach((listener) => listener(queue));
}

export function createQueueId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.random() * 16 | 0;
    const value = character === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export function isRecoverableSyncError(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true;
  if (typeof error !== 'object' || error === null) return false;

  const details = error as { status?: unknown; statusCode?: unknown; code?: unknown; message?: unknown };
  const statusValue = details.status ?? details.statusCode;
  const status = typeof statusValue === 'number' ? statusValue : Number(statusValue);
  const code = typeof details.code === 'string' ? details.code : '';
  const message = typeof details.message === 'string' ? details.message.toLowerCase() : '';
  return status === 0 || status === 408 || status === 429 || status >= 500
    || /network|fetch|timeout|temporar|connection reset/.test(message)
    || ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENETUNREACH'].includes(code);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Um arquivo pendente só é válido se tiver caminho, conteúdo e linha de anexo. */
function isArquivoPendente(value: unknown): value is ArquivoPendente {
  return isRecord(value) &&
    typeof value.path === 'string' && value.path.length > 0 &&
    typeof value.dataUrl === 'string' && value.dataUrl.startsWith('data:') &&
    isRecord(value.anexo);
}

function readQueue(key = getStorageKey()): QueueItem[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is QueueItem =>
      isRecord(item) &&
      typeof item.id === 'string' && typeof item.table === 'string' &&
      (item.op === 'insert' || item.op === 'update') &&
      isRecord(item.payload) &&
      (item.op !== 'update' || (isRecord(item.match) && Object.keys(item.match).length > 0)) &&
      typeof item.label === 'string' && typeof item.createdAt === 'string' &&
      (item.uploads === undefined ||
        (Array.isArray(item.uploads) && item.uploads.every(isArquivoPendente))),
    );
  } catch {
    return [];
  }
}

function writeQueue(queue: QueueItem[], key = getStorageKey()) {
  try {
    localStorage.setItem(key, JSON.stringify(queue));
  } catch (error) {
    console.error('Não foi possível salvar a fila offline neste aparelho:', error);
    throw error;
  }
  if (key === getStorageKey()) listeners.forEach((listener) => listener(queue));
}

export function getQueue(): QueueItem[] {
  return readQueue();
}

export function subscribeQueue(listener: Listener): () => void {
  listeners.add(listener);
  listener(readQueue());
  return () => listeners.delete(listener);
}

type QueueOperationInput =
  | { table: string; op: 'insert'; payload: Record<string, unknown>; label: string; uploads?: ArquivoPendente[] }
  | { table: string; op: 'update'; match: Record<string, unknown>; payload: Record<string, unknown>; label: string };

/** Adiciona uma operação pendente com ID estável para tentativas idempotentes. */
export function enqueue(
  table: string,
  payload: Record<string, unknown>,
  label: string,
  uploads?: ArquivoPendente[],
): QueueItem {
  return enqueueBatch([{ table, op: 'insert', payload, label, uploads }])[0];
}

export function enqueueUpdate(
  table: string,
  match: Record<string, unknown>,
  payload: Record<string, unknown>,
  label: string,
): QueueItem {
  return enqueueBatch([{ table, op: 'update', payload, match, label }])[0];
}

/** Grava várias operações dependentes em uma única escrita local, sem fila parcial. */
export function enqueueBatch(operations: QueueOperationInput[]): QueueItem[] {
  if (!currentQueueUserId) throw new Error('A fila offline exige uma sessão de usuário ativa.');
  if (operations.some((operation) => operation.op === 'update' && Object.keys(operation.match).length === 0)) {
    throw new Error('Uma operação offline de atualização precisa de um filtro seguro.');
  }

  const key = getStorageKey();
  const items = operations.map((operation): QueueItem => {
    const id = createQueueId();
    const payload = operation.op === 'insert' && typeof operation.payload.id !== 'string'
      ? { ...operation.payload, id }
      : operation.payload;
    return { ...operation, payload, id, createdAt: new Date().toISOString() };
  });
  writeQueue([...readQueue(key), ...items], key);
  return items;
}

export function removeFromQueue(id: string) {
  const key = getStorageKey();
  writeQueue(readQueue(key).filter((item) => item.id !== id), key);
}

function updateQueueItem(itemId: string, update: (item: QueueItem) => QueueItem | null, key: string) {
  const queue = readQueue(key);
  const next = queue.flatMap((item) => {
    if (item.id !== itemId) return [item];
    const updated = update(item);
    return updated ? [updated] : [];
  });
  writeQueue(next, key);
}

/** Envia pendências somente na sessão proprietária, mantendo falhas para retry. */
export async function flushQueue(): Promise<{ sent: number; remaining: number }> {
  if (flushing || !currentQueueUserId || !navigator.onLine) {
    return { sent: 0, remaining: readQueue().length };
  }

  const queueUserId = currentQueueUserId;
  const key = getStorageKey(queueUserId);
  flushing = true;
  let sent = 0;

  try {
    const pending = readQueue(key);
    for (const item of pending) {
      if (!navigator.onLine || currentQueueUserId !== queueUserId) break;

      let error: { message: string } | null = null;
      if (item.op === 'update') {
        const { data, error: updateError } = await supabase
          .from(item.table)
          .update(item.payload)
          .match(item.match ?? {})
          .select('id');
        error = updateError;
        if (!error && (!data || data.length === 0)) {
          updateQueueItem(item.id, (current) => ({
            ...current,
            error: 'O registro não foi atualizado; confirme se ele ainda existe e se sua conta tem acesso.',
          }), key);
          continue;
        }
      } else {
        // Os arquivos sobem ANTES da linha: o registro grava caminhos, e um
        // caminho sem arquivo é pior que um arquivo sem registro. O envio é
        // idempotente, então repetir depois de uma falha parcial é seguro.
        for (const arquivo of item.uploads ?? []) {
          try {
            await uploadAnexo(arquivo.path, arquivo.dataUrl);
          } catch (uploadError) {
            error = { message: `Falha ao enviar a foto: ${(uploadError as Error).message}` };
            break;
          }
        }

        if (!error) {
          const { error: insertError } = await supabase.from(item.table).upsert(
            { ...item.payload, id: item.payload.id ?? item.id },
            { onConflict: 'id', ignoreDuplicates: true },
          );
          error = insertError;
        }

        // Só com a linha gravada é que o vínculo existe para os anexos.
        if (!error) {
          for (const arquivo of item.uploads ?? []) {
            const { error: anexoError } = await supabase
              .from('anexos')
              .upsert(arquivo.anexo, { onConflict: 'id', ignoreDuplicates: true });
            if (anexoError) {
              // O arquivo e o caminho já estão salvos; o que falta é a
              // descrição do arquivo. Vale registrar sem descartar o pendente.
              console.error('Anexo gravado sem descrição:', anexoError);
              break;
            }
          }
        }
      }

      // Uma troca de usuário durante a requisição não pode modificar a fila de outra conta.
      if (currentQueueUserId !== queueUserId) break;
      if (error) {
        updateQueueItem(item.id, (current) => ({ ...current, error: error.message }), key);
      } else {
        writeQueue(readQueue(key).filter((queued) => queued.id !== item.id), key);
        sent += 1;
      }
    }

    return { sent, remaining: readQueue(key).length };
  } catch (error) {
    console.error('Falha inesperada ao sincronizar a fila offline:', error);
    return { sent, remaining: readQueue(key).length };
  } finally {
    flushing = false;
  }
}

/** Tenta sincronizar ao voltar online e por polling como fallback. */
export function startAutoSync(): () => void {
  const handleOnline = () => { void flushQueue(); };
  const intervalId = window.setInterval(() => {
    if (navigator.onLine) void flushQueue();
  }, 30000);

  window.addEventListener('online', handleOnline);
  if (navigator.onLine) void flushQueue();

  return () => {
    window.removeEventListener('online', handleOnline);
    window.clearInterval(intervalId);
  };
}

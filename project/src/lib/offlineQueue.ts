import { supabase } from '@/lib/supabase';

export type QueueItem = {
  id: string;
  table: string;
  op: 'insert' | 'update';
  payload: Record<string, unknown>;
  match?: Record<string, unknown>;
  label: string;
  createdAt: string;
  error?: string;
};

const STORAGE_KEY = 'sifau-offline-queue';
type Listener = (queue: QueueItem[]) => void;
const listeners = new Set<Listener>();
let flushing = false;

function readQueue(): QueueItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as QueueItem[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(queue: QueueItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  listeners.forEach((l) => l(queue));
}

export function getQueue(): QueueItem[] {
  return readQueue();
}

export function subscribeQueue(listener: Listener): () => void {
  listeners.add(listener);
  listener(readQueue());
  return () => listeners.delete(listener);
}

/** Adiciona um INSERT pendente à fila (usado quando o dispositivo está offline ou o envio falha). */
export function enqueue(table: string, payload: Record<string, unknown>, label: string): QueueItem {
  return enqueueItem({ table, op: 'insert', payload, label });
}

/** Adiciona um UPDATE pendente à fila (ex: mudar status de uma ocorrência offline). */
export function enqueueUpdate(
  table: string,
  match: Record<string, unknown>,
  payload: Record<string, unknown>,
  label: string,
): QueueItem {
  return enqueueItem({ table, op: 'update', payload, match, label });
}

function enqueueItem(partial: Omit<QueueItem, 'id' | 'createdAt'>): QueueItem {
  const item: QueueItem = { ...partial, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
  const queue = readQueue();
  queue.push(item);
  writeQueue(queue);
  return item;
}

export function removeFromQueue(id: string) {
  writeQueue(readQueue().filter((i) => i.id !== id));
}

/** Tenta enviar todos os itens pendentes ao Supabase, na ordem em que foram criados. */
export async function flushQueue(): Promise<{ sent: number; remaining: number }> {
  if (flushing || !navigator.onLine) return { sent: 0, remaining: readQueue().length };
  flushing = true;
  let sent = 0;
  try {
    const queue = readQueue();
    const stillPending: QueueItem[] = [];
    for (const item of queue) {
      const { error } = item.op === 'update'
        ? await supabase.from(item.table).update(item.payload).match(item.match ?? {})
        : await supabase.from(item.table).insert(item.payload);
      if (error) {
        // Mantém na fila; provavelmente ainda sem conexão real ou erro temporário.
        stillPending.push({ ...item, error: error.message });
      } else {
        sent += 1;
      }
    }
    writeQueue(stillPending);
    return { sent, remaining: stillPending.length };
  } finally {
    flushing = false;
  }
}

/** Registra os listeners globais de conectividade para tentar sincronizar automaticamente. */
export function startAutoSync() {
  window.addEventListener('online', () => { flushQueue(); });
  // Tenta periodicamente também, pois "online" nem sempre significa internet real.
  setInterval(() => { if (navigator.onLine) flushQueue(); }, 30000);
  if (navigator.onLine) flushQueue();
}

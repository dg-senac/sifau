import { useEffect, useState } from 'react';
import { CloudUpload, Loader2, RefreshCw } from 'lucide-react';
import { flushQueue, getQueue, subscribeQueue } from '@/lib/offlineQueue';

export function SyncBanner() {
  const [count, setCount] = useState(getQueue().length);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => subscribeQueue((queue) => setCount(queue.length)), []);

  if (count === 0) return null;

  const syncNow = async () => {
    setSyncing(true);
    await flushQueue();
    setSyncing(false);
  };

  return (
    <div className="sync-banner">
      <div className="sync-banner-icon">
        {syncing ? <Loader2 className="spin" size={17} /> : <CloudUpload size={17} />}
      </div>
      <div>
        <b>{count} registro{count > 1 ? 's' : ''} pendente{count > 1 ? 's' : ''}</b>
        <span>Serão enviados automaticamente quando a conexão voltar.</span>
      </div>
      <button className="ghost-button small" onClick={syncNow} disabled={syncing}>
        <RefreshCw size={13} /> Sincronizar
      </button>
    </div>
  );
}

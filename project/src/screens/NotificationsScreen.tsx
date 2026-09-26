import { useEffect, useState } from 'react';
import { Bell, CheckCheck, ClipboardCheck, Info, Loader2, TriangleAlert } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Fiscal, Notificacao } from '@/lib/types';
import { PageTitle, EmptyState } from '@/components/ui';

const ICONS: Record<Notificacao['tipo'], typeof Bell> = {
  atribuicao: ClipboardCheck,
  sla: TriangleAlert,
  status: Info,
  info: Bell,
};

export function NotificationsScreen({ fiscal }: { fiscal: Fiscal | null }) {
  const [items, setItems] = useState<Notificacao[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!fiscal) return;
    setLoading(true);
    const { data } = await supabase
      .from('notificacoes')
      .select('*')
      .eq('fiscal_id', fiscal.id)
      .order('created_at', { ascending: false })
      .limit(80);
    setItems(data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    if (!fiscal) return;
    const channel = supabase
      .channel(`notificacoes-${fiscal.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notificacoes', filter: `fiscal_id=eq.${fiscal.id}` },
        () => load(),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fiscal?.id]);

  const markRead = async (item: Notificacao) => {
    if (item.lida) return;
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, lida: true } : i)));
    await supabase.from('notificacoes').update({ lida: true }).eq('id', item.id);
  };

  const markAllRead = async () => {
    const unread = items.filter((i) => !i.lida);
    if (!unread.length || !fiscal) return;
    setItems((prev) => prev.map((i) => ({ ...i, lida: true })));
    await supabase.from('notificacoes').update({ lida: true }).eq('fiscal_id', fiscal.id).eq('lida', false);
  };

  const unreadCount = items.filter((i) => !i.lida).length;

  return (
    <>
      <PageTitle
        eyebrow="Central de avisos"
        title="Notificações"
        action={
          unreadCount > 0 ? (
            <button className="ghost-button small" onClick={markAllRead}>
              <CheckCheck size={14} /> Marcar tudo
            </button>
          ) : undefined
        }
      />
      {loading ? (
        <div className="empty-state"><Loader2 className="spin" size={22} /></div>
      ) : items.length === 0 ? (
        <EmptyState icon={<Bell size={27} />} title="Nenhuma notificação" message="Avisos de atribuição, prazo e status aparecerão aqui." />
      ) : (
        <div className="notification-list">
          {items.map((item) => {
            const Icon = ICONS[item.tipo] ?? Bell;
            return (
              <article
                key={item.id}
                className={`notification-card tapable ${item.lida ? '' : 'unread'}`}
                onClick={() => markRead(item)}
              >
                <div className={`notification-icon ${item.tipo}`}><Icon size={17} /></div>
                <div>
                  <b>{item.titulo}</b>
                  <span>{item.mensagem}</span>
                  <small>{new Date(item.created_at).toLocaleString('pt-BR')}</small>
                </div>
                {!item.lida && <i className="unread-dot" />}
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { AlertCircle, Loader2, MessageSquare, RefreshCw, Send } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Fiscal } from '@/lib/types';
import { EmptyState, PageTitle, SkeletonList } from '@/components/ui';
import { AnexoDaMensagem } from '@/components/AnexoDaMensagem';

type AdminMessage = {
  id: string;
  fiscal_id: string;
  sender_type: 'admin' | 'fiscal';
  message: string;
  /** Caminhos no bucket `sifau-anexos` — não o arquivo (ver lib/mensagens.ts). */
  attachments: string[];
  read_at: string | null;
  created_at: string;
};

export function MessagesScreen({ fiscal }: { fiscal: Fiscal | null }) {
  const [items, setItems] = useState<AdminMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const fiscalId = fiscal?.id;

  const load = useCallback(async () => {
    if (!fiscalId) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error: loadError } = await supabase
      .from('admin_messages')
      .select('*')
      .eq('fiscal_id', fiscalId)
      .order('created_at', { ascending: true })
      .limit(100);
    if (loadError) {
      setError('Não foi possível carregar as mensagens.');
      setLoading(false);
      return;
    }

    const conversation = (data ?? []) as AdminMessage[];
    const unreadIds = conversation
      .filter((message) => message.sender_type === 'admin' && !message.read_at)
      .map((message) => message.id);
    if (unreadIds.length > 0) {
      const readAt = new Date().toISOString();
      const { error: readError } = await supabase
        .from('admin_messages')
        .update({ read_at: readAt })
        .in('id', unreadIds);
      if (!readError) {
        conversation.forEach((message) => {
          if (unreadIds.includes(message.id)) message.read_at = readAt;
        });
      }
    }
    setItems(conversation);
    setError('');
    setLoading(false);
  }, [fiscalId]);

  useEffect(() => {
    void load();
    if (!fiscalId) return;
    const channel = supabase
      .channel(`messages-${fiscalId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'admin_messages', filter: `fiscal_id=eq.${fiscalId}`,
      }, () => { void load(); })
      .subscribe();
    const refreshId = window.setInterval(() => { void load(); }, 30000);
    return () => {
      window.clearInterval(refreshId);
      void supabase.removeChannel(channel);
    };
  }, [fiscalId, load]);

  const send = async (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!fiscalId || !text || sending) return;

    setSending(true);
    setError('');
    const { error: sendError } = await supabase.from('admin_messages').insert({
      fiscal_id: fiscalId,
      sender_type: 'fiscal',
      message: text,
      attachments: [],
    });
    setSending(false);
    if (sendError) {
      console.error('Erro ao enviar mensagem para a administração:', sendError);
      setError('Não foi possível enviar sua mensagem. Tente novamente.');
      return;
    }
    setDraft('');
    await load();
  };

  return (
    <>
      <PageTitle
        eyebrow="Comunicação institucional"
        title="Mensagens"
        action={<button className="icon-button light" onClick={() => void load()} aria-label="Atualizar mensagens"><RefreshCw size={17} /></button>}
      />
      <section className="message-page-card" aria-label="Conversa com a administração">
        <div className="message-page-history" aria-live="polite">
          {loading ? (
            <SkeletonList linhas={3} label="Carregando mensagens" />
          ) : items.length === 0 ? (
            <EmptyState icon={<MessageSquare size={28} />} title="Nenhuma mensagem" message="Envie uma mensagem para falar com a administração." />
          ) : items.map((item) => (
            <article key={item.id} className={`message-page-item ${item.sender_type === 'fiscal' ? 'sent' : 'received'}`}>
              <div className="message-page-bubble">
                <b>{item.sender_type === 'fiscal' ? 'Você' : 'Administração'}</b>
                <p>{item.message}</p>
                {/* O anexo fica na pasta de quem enviou. O fiscal destinatário
                    alcança esse arquivo pela regra `can_read_message_attachment`
                    (migration 20261019000000): ele vale para o arquivo preso a
                    uma mensagem dele, e não abre a pasta do administrador. */}
                {item.attachments.length > 0 && (
                  <div className="message-anexos" aria-label="Anexos da mensagem">
                    {item.attachments.map((path) => <AnexoDaMensagem key={path} path={path} />)}
                  </div>
                )}
                <time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString('pt-BR')}</time>
              </div>
            </article>
          ))}
        </div>
        {error && <div className="form-message" role="alert"><AlertCircle size={16} />{error}</div>}
        <form className="message-page-compose" onSubmit={send}>
          <label className="sr-only" htmlFor="fiscal-message">Escreva uma mensagem para a administração</label>
          <textarea
            id="fiscal-message"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Escreva uma mensagem para a administração…"
            maxLength={4000}
            rows={3}
            required
          />
          <button className="primary-button" type="submit" disabled={sending || !draft.trim()}>
            {sending ? <Loader2 className="spin" size={16} /> : <Send size={16} />}
            Enviar
          </button>
        </form>
      </section>
    </>
  );
}

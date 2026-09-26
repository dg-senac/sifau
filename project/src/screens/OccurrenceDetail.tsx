import { FormEvent, useEffect, useState } from 'react';
import {
  AlertTriangle, Calendar, ChevronRight, Clock3, FileText, MapPin, Navigation, User, X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Fiscal, Occurrence, OCCURRENCE_STATUSES, Vistoria } from '@/lib/types';
import { PageTitle, Badge, UrgencyBadge } from '@/components/ui';

export function OccurrenceDetail({
  item,
  fiscal,
  onClose,
}: {
  item: Occurrence;
  fiscal: Fiscal | null;
  onClose: () => void;
}) {
  const [vistorias, setVistorias] = useState<Vistoria[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [fiscalNome, setFiscalNome] = useState('');
  const [designadoNome, setDesignadoNome] = useState('');
  const [newStatus, setNewStatus] = useState(item.status);
  const [observacao, setObservacao] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [showStatusForm, setShowStatusForm] = useState(false);

  const load = async () => {
    const [{ data: vData }, { data: aData }, { data: fData }] = await Promise.all([
      supabase.from('vistorias').select('*').eq('ocorrencia_id', item.id).order('created_at', { ascending: false }),
      supabase.from('auditoria').select('*').eq('ocorrencia_id', item.id).order('created_at', { ascending: false }),
      supabase.from('fiscais').select('id, nome').in('id', [item.fiscal_registrou, item.fiscal_designado ?? '']),
    ]);
    setVistorias(vData ?? []);
    setAuditLogs(aData ?? []);
    const fmap = Object.fromEntries((fData ?? []).map((f) => [f.id, f.nome]));
    setFiscalNome(fmap[item.fiscal_registrou] ?? 'Fiscal');
    if (item.fiscal_designado) setDesignadoNome(fmap[item.fiscal_designado] ?? 'Fiscal');
  };

  useEffect(() => {
    load();
  }, [item.id]);

  const overdue = new Date(item.sla_deadline).getTime() < Date.now() && !['Resolvida', 'Arquivada'].includes(item.status);
  const slaRemaining = Math.round((new Date(item.sla_deadline).getTime() - Date.now()) / 3600000);

  const changeStatus = async (event: FormEvent) => {
    event.preventDefault();
    if (!fiscal) return;
    if (newStatus === item.status && !observacao) {
      setShowStatusForm(false);
      return;
    }
    setSaving(true);
    setMessage('');
    const { error } = await supabase.from('ocorrencias').update({ status: newStatus }).eq('id', item.id);
    if (error) {
      setMessage('Erro ao atualizar status.');
      setSaving(false);
      return;
    }
    await supabase.from('auditoria').insert({
      ocorrencia_id: item.id,
      status_anterior: item.status,
      status_novo: newStatus,
      fiscal_id: fiscal.id,
      observacao: observacao.trim() || `Status alterado de ${item.status} para ${newStatus}`,
    });
    setShowStatusForm(false);
    setObservacao('');
    setSaving(false);
    load();
  };

  return (
    <>
      <PageTitle
        eyebrow="Detalhe da ocorrência"
        title={item.categoria}
        action={
          <button className="icon-button light" onClick={onClose}>
            <X size={20} />
          </button>
        }
      />
      <div className="occurrence-detail">
        <div className="detail-top-row">
          <UrgencyBadge urgency={item.urgencia} />
          <Badge danger={overdue}>{item.status}</Badge>
        </div>
        <p>{item.descricao}</p>
        <div className="detail-info-grid">
          <div className="detail-info-item">
            <MapPin size={15} />
            <div>
              <span>Endereço</span>
              <b>{item.endereco}</b>
              <small>{item.bairro}</small>
            </div>
          </div>
          <div className="detail-info-item">
            <User size={15} />
            <div>
              <span>Registrado por</span>
              <b>{fiscalNome}</b>
            </div>
          </div>
          {designadoNome && (
            <div className="detail-info-item">
              <Navigation size={15} />
              <div>
                <span>Designado para</span>
                <b>{designadoNome}</b>
              </div>
            </div>
          )}
          <div className="detail-info-item">
            <Clock3 size={15} />
            <div>
              <span>SLA</span>
              <b className={overdue ? 'text-danger' : ''}>
                {overdue ? 'Estourado' : slaRemaining > 0 ? `${slaRemaining}h restantes` : 'Vencendo'}
              </b>
              <small>{new Date(item.sla_deadline).toLocaleString('pt-BR')}</small>
            </div>
          </div>
          <div className="detail-info-item">
            <Calendar size={15} />
            <div>
              <span>Criada em</span>
              <b>{new Date(item.created_at).toLocaleString('pt-BR')}</b>
            </div>
          </div>
        </div>
        {item.latitude && item.longitude && (
          <div className="detail-coords">
            <MapPin size={14} />
            {item.latitude.toFixed(5)}, {item.longitude.toFixed(5)}
          </div>
        )}
      </div>

      {fiscal && !showStatusForm && (
        <button className="outline-button full" onClick={() => { setNewStatus(item.status); setShowStatusForm(true); }}>
          <AlertTriangle size={16} /> Alterar status
        </button>
      )}

      {showStatusForm && (
        <form className="form-card compact" onSubmit={changeStatus}>
          <div className="form-section">
            <h2>Alterar status da ocorrência</h2>
            <label>
              Novo status
              <select value={newStatus} onChange={(e) => setNewStatus(e.target.value)}>
                {OCCURRENCE_STATUSES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label>
              Observação <span className="optional">opcional</span>
              <textarea
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                placeholder="Justifique a mudança de status..."
              />
            </label>
          </div>
          {message && (
            <div className="form-message">
              <AlertTriangle size={16} />
              {message}
            </div>
          )}
          <div className="form-actions">
            <button type="button" className="ghost-button" onClick={() => setShowStatusForm(false)}>Cancelar</button>
            <button className="primary-button" disabled={saving}>
              {saving ? 'Salvando...' : 'Confirmar'}
            </button>
          </div>
        </form>
      )}

      <div className="section-heading" style={{ marginTop: '20px' }}>
        <h2>Vistorias ({vistorias.length})</h2>
      </div>
      {vistorias.length === 0 ? (
        <span className="muted">Nenhuma vistoria realizada.</span>
      ) : (
        <div className="audit-list">
          {vistorias.map((v) => (
            <article className="audit-item" key={v.id}>
              <div className="audit-line" />
              <div>
                <span className="eyebrow">{new Date(v.chegada_at).toLocaleString('pt-BR')}</span>
                <h3>Ação: {v.acao_tomada}</h3>
                <span>{v.laudo}</span>
                {v.valor_multa != null && v.valor_multa > 0 && (
                  <span className="audit-fiscal">Multa: R$ {v.valor_multa.toFixed(2)} · Processo: {v.numero_processo ?? '—'}</span>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="section-heading" style={{ marginTop: '20px' }}>
        <h2>Histórico de status ({auditLogs.length})</h2>
      </div>
      {auditLogs.length === 0 ? (
        <span className="muted">Sem movimentações registradas.</span>
      ) : (
        <div className="audit-list">
          {auditLogs.map((log) => (
            <article className="audit-item" key={log.id}>
              <div className="audit-line" />
              <div>
                <span className="eyebrow">{new Date(log.created_at).toLocaleString('pt-BR')}</span>
                <h3>
                  {log.status_anterior ?? 'Novo'} <ChevronRight size={15} /> {log.status_novo}
                </h3>
                <span>{log.observacao ?? 'Alteração de status'}</span>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}

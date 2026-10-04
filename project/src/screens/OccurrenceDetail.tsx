import { FormEvent, useEffect, useState } from 'react';
import {
  AlertTriangle, Calendar, Camera, ChevronRight, Clock3, Edit2, FileText, MapPin, Navigation, Save, User, X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Fiscal, Occurrence, OCCURRENCE_STATUSES, Vistoria, CATEGORIES, SUBCATEGORIES, URGENCY_LEVELS } from '@/lib/types';
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
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    categoria: item.categoria,
    subcategoria: item.subcategoria,
    descricao: item.descricao,
    urgencia: item.urgencia,
    endereco: item.endereco,
    bairro: item.bairro,
    latitude: item.latitude,
    longitude: item.longitude,
  });

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

  const saveEdit = async (event: FormEvent) => {
    event.preventDefault();
    if (!fiscal) return;
    setSaving(true);
    setMessage('');

    const { error } = await supabase.from('ocorrencias').update({
      categoria: editForm.categoria,
      subcategoria: editForm.subcategoria,
      descricao: editForm.descricao,
      urgencia: editForm.urgencia,
      endereco: editForm.endereco,
      bairro: editForm.bairro,
      latitude: editForm.latitude,
      longitude: editForm.longitude,
    }).eq('id', item.id);

    if (error) {
      setMessage('Erro ao salvar alterações.');
      setSaving(false);
      return;
    }

    await supabase.from('auditoria').insert({
      ocorrencia_id: item.id,
      status_anterior: item.status,
      status_novo: item.status,
      fiscal_id: fiscal.id,
      observacao: 'Dados da ocorrência editados',
    });

    setIsEditing(false);
    setSaving(false);
    load();
  };

  const cancelEdit = () => {
    setEditForm({
      categoria: item.categoria,
      subcategoria: item.subcategoria,
      descricao: item.descricao,
      urgencia: item.urgencia,
      endereco: item.endereco,
      bairro: item.bairro,
      latitude: item.latitude,
      longitude: item.longitude,
    });
    setIsEditing(false);
  };

  const getCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setEditForm({
            ...editForm,
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
        },
        (error) => {
          setMessage('Não foi possível obter sua localização.');
        }
      );
    } else {
      setMessage('Geolocalização não suportada neste navegador.');
    }
  };

  return (
    <>
      <PageTitle
        eyebrow="Detalhe da ocorrência"
        title={isEditing ? 'Editar ocorrência' : item.categoria}
        action={
          fiscal && !isEditing ? (
            <button className="icon-button light" onClick={() => setIsEditing(true)}>
              <Edit2 size={18} />
            </button>
          ) : (
            <button className="icon-button light" onClick={onClose}>
              <X size={20} />
            </button>
          )
        }
      />
      {isEditing ? (
        <form className="form-card" onSubmit={saveEdit}>
          <div className="form-section">
            <h2>Editar ocorrência</h2>
            <label>
              Categoria
              <select
                value={editForm.categoria}
                onChange={(e) => setEditForm({ ...editForm, categoria: e.target.value, subcategoria: SUBCATEGORIES[e.target.value]?.[0] || '' })}
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </label>
            <label>
              Subcategoria
              <select
                value={editForm.subcategoria}
                onChange={(e) => setEditForm({ ...editForm, subcategoria: e.target.value })}
              >
                {SUBCATEGORIES[editForm.categoria]?.map((sub) => (
                  <option key={sub} value={sub}>{sub}</option>
                ))}
              </select>
            </label>
            <label>
              Urgência
              <select
                value={editForm.urgencia}
                onChange={(e) => setEditForm({ ...editForm, urgencia: e.target.value })}
              >
                {URGENCY_LEVELS.map((level) => (
                  <option key={level} value={level}>{level}</option>
                ))}
              </select>
            </label>
            <label>
              Descrição
              <textarea
                value={editForm.descricao}
                onChange={(e) => setEditForm({ ...editForm, descricao: e.target.value })}
                placeholder="Descreva o problema..."
                rows={3}
              />
            </label>
            <label>
              Endereço
              <input
                value={editForm.endereco}
                onChange={(e) => setEditForm({ ...editForm, endereco: e.target.value })}
                placeholder="Rua, número, complemento"
              />
            </label>
            <label>
              Bairro/região
              <input
                value={editForm.bairro}
                onChange={(e) => setEditForm({ ...editForm, bairro: e.target.value })}
                placeholder="Bairro"
              />
            </label>
            <label>
              Localização
              <div className="two-fields">
                <input
                  type="number"
                  step="any"
                  value={editForm.latitude || ''}
                  onChange={(e) => setEditForm({ ...editForm, latitude: e.target.value ? parseFloat(e.target.value) : null })}
                  placeholder="Latitude"
                />
                <input
                  type="number"
                  step="any"
                  value={editForm.longitude || ''}
                  onChange={(e) => setEditForm({ ...editForm, longitude: e.target.value ? parseFloat(e.target.value) : null })}
                  placeholder="Longitude"
                />
              </div>
              <button
                type="button"
                className="location-button"
                onClick={getCurrentLocation}
              >
                <MapPin size={16} />
                {editForm.latitude && editForm.longitude ? 'Atualizar localização' : 'Usar minha localização'}
              </button>
            </label>
          </div>
          {message && (
            <div className="form-message">
              <AlertTriangle size={16} />
              {message}
            </div>
          )}
          <div className="form-actions">
            <button type="button" className="ghost-button" onClick={cancelEdit}>Cancelar</button>
            <button className="primary-button" disabled={saving}>
              {saving ? 'Salvando...' : <><Save size={16} /> Salvar</>}
            </button>
          </div>
        </form>
      ) : (
        <div className="occurrence-detail">
          <div className="detail-header">
            <div className="detail-badges">
              <UrgencyBadge urgency={item.urgencia} />
              <Badge danger={overdue}>{item.status}</Badge>
            </div>
            <div className="detail-meta">
              <span className="detail-category">{item.categoria}</span>
              <span className="detail-subcategory">{item.subcategoria}</span>
            </div>
          </div>

          <div className="detail-description">
            <p>{item.descricao}</p>
          </div>

          <div className="detail-sections">
            <div className="detail-section">
              <h3 className="detail-section-title">
                <MapPin size={16} />
                Localização
              </h3>
              <div className="detail-section-content">
                <div className="detail-address">
                  <b>{item.endereco}</b>
                  <span>{item.bairro}</span>
                </div>
                {item.latitude && item.longitude && (
                  <div className="detail-coords">
                    <MapPin size={14} />
                    <span>{item.latitude.toFixed(5)}, {item.longitude.toFixed(5)}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="detail-section">
              <h3 className="detail-section-title">
                <User size={16} />
                Responsáveis
              </h3>
              <div className="detail-section-content">
                <div className="detail-responsible">
                  <span className="detail-label">Registrado por</span>
                  <b>{fiscalNome}</b>
                </div>
                {designadoNome && (
                  <div className="detail-responsible">
                    <span className="detail-label">Designado para</span>
                    <b>{designadoNome}</b>
                  </div>
                )}
              </div>
            </div>

            <div className="detail-section">
              <h3 className="detail-section-title">
                <Clock3 size={16} />
                Prazos
              </h3>
              <div className="detail-section-content">
                <div className={`detail-sla ${overdue ? 'overdue' : ''}`}>
                  <span className="detail-label">SLA</span>
                  <b>
                    {overdue ? '⚠️ Estourado' : slaRemaining > 0 ? `${slaRemaining}h restantes` : 'Vencendo'}
                  </b>
                  <small>{new Date(item.sla_deadline).toLocaleString('pt-BR')}</small>
                </div>
              </div>
            </div>

            <div className="detail-section">
              <h3 className="detail-section-title">
                <Calendar size={16} />
                Informações
              </h3>
              <div className="detail-section-content">
                <div className="detail-info">
                  <span className="detail-label">Criada em</span>
                  <b>{new Date(item.created_at).toLocaleString('pt-BR')}</b>
                </div>
                <div className="detail-info">
                  <span className="detail-label">ID da ocorrência</span>
                  <small>{item.id.slice(0, 8)}...</small>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

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
        <div className="empty-state">
          <FileText size={32} />
          <b>Nenhuma vistoria realizada</b>
          <span>Esta ocorrência ainda não foi inspecionada</span>
        </div>
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
        <div className="empty-state">
          <Clock3 size={32} />
          <b>Sem movimentações</b>
          <span>Nenhuma alteração de status registrada</span>
        </div>
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

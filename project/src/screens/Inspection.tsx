import { FormEvent, useEffect, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, ChevronRight, ClipboardList, Clock3,
  Loader2, MapPin, Navigation, X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { ACTIONS, Fiscal, Occurrence } from '@/lib/types';
import { PageTitle, EmptyState, Badge } from '@/components/ui';
import { PhotoUpload } from '@/components/PhotoUpload';
import { DocumentGallery } from '@/components/DocumentGallery';
import { enqueue, enqueueUpdate } from '@/lib/offlineQueue';
import { documentsApi, fileUtils } from '@/lib/documents';
import { AutoInfracaoForm } from '@/screens/AutoInfracao';

export function Inspection({ fiscal }: { fiscal: Fiscal | null }) {
  const [items, setItems] = useState<Occurrence[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<Occurrence | null>(null);
  const [fiscais, setFiscais] = useState<Fiscal[]>([]);
  const [showRedistribute, setShowRedistribute] = useState<Occurrence | null>(null);
  const [autoFor, setAutoFor] = useState<{ item: Occurrence; valorMulta: number; numeroProcesso: string } | null>(null);

  const load = async () => {
    setLoading(true);
    if (!fiscal) return;
    const { data } = await supabase
      .from('ocorrencias').select('*')
      .eq('fiscal_designado', fiscal.id)
      .in('status', ['Atribuída', 'Em vistoria'])
      .order('sla_deadline');
    setItems(data ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [fiscal?.id]);

  const loadFiscais = async () => {
    const { data } = await supabase.from('fiscais').select('*').eq('ativo', true).neq('id', fiscal?.id ?? '');
    setFiscais(data ?? []);
  };

  if (autoFor) {
    return (
      <AutoInfracaoForm
        item={autoFor.item}
        fiscal={fiscal}
        valorMultaSugerido={autoFor.valorMulta}
        numeroProcesso={autoFor.numeroProcesso}
        onClose={() => { setAutoFor(null); load(); }}
      />
    );
  }

  if (active) {
    return (
      <InspectionForm
        item={active}
        fiscal={fiscal}
        onClose={(auto) => {
          setActive(null);
          load();
          if (auto) setAutoFor({ item: active, valorMulta: auto.valorMulta, numeroProcesso: auto.numeroProcesso });
        }}
      />
    );
  }

  if (showRedistribute) {
    return (
      <RedistributeScreen
        item={showRedistribute}
        fiscais={fiscais}
        fiscal={fiscal}
        onClose={() => setShowRedistribute(null)}
        onRedistributed={() => { setShowRedistribute(null); load(); }}
      />
    );
  }

  return (
    <>
      <PageTitle eyebrow="Operação" title="Minha fila de vistorias"
        action={<span className="sync-pill"><CheckCircle2 size={14} /> Sincronizado</span>} />
      <div className="notice-card">
        <div className="notice-icon"><Navigation size={19} /></div>
        <div>
          <b>Distribuição equilibrada</b>
          <span>Os casos são atribuídos automaticamente por região e disponibilidade.</span>
        </div>
      </div>
      {loading ? (
        <div className="empty-state"><Loader2 className="spin" size={22} /></div>
      ) : items.length === 0 ? (
        <EmptyState icon={<ClipboardList size={28} />} title="Fila limpa" message="Você não tem vistorias atribuídas no momento." />
      ) : (
        <div className="inspection-list">
          {items.map((item) => (
            <article className="inspection-card" key={item.id}>
              <div>
                <span className="eyebrow">{item.categoria}</span>
                <h3>{item.descricao}</h3>
                <span className="card-meta"><MapPin size={14} />{item.endereco}</span>
                <div className="inspection-sla">
                  <Clock3 size={13} />
                  {new Date(item.sla_deadline).getTime() < Date.now() ? 'SLA estourado' : `SLA ${new Date(item.sla_deadline).toLocaleDateString('pt-BR')}`}
                </div>
              </div>
              <div className="inspection-actions">
                <button className="primary-button small" onClick={() => setActive(item)}>
                  Iniciar <ChevronRight size={16} />
                </button>
                <button className="ghost-button small" onClick={() => { loadFiscais(); setShowRedistribute(item); }}>
                  Redistribuir
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}

function RedistributeScreen({
  item, fiscais, fiscal, onClose, onRedistributed,
}: {
  item: Occurrence; fiscais: Fiscal[]; fiscal: Fiscal | null;
  onClose: () => void; onRedistributed: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const redistribute = async (targetId: string) => {
    setBusy(true);
    const { error } = await supabase.from('ocorrencias').update({ fiscal_designado: targetId }).eq('id', item.id);
    if (error) { setMessage('Não foi possível redistribuir.'); setBusy(false); return; }
    await supabase.from('auditoria').insert({
      ocorrencia_id: item.id,
      status_anterior: item.status,
      status_novo: 'Atribuída',
      fiscal_id: fiscal?.id ?? '',
      observacao: 'Ocorrência redistribuída para outro fiscal',
    });
    onRedistributed();
  };

  return (
    <>
      <PageTitle eyebrow="Redistribuir" title="Transferir vistoria"
        action={<button className="icon-button light" onClick={onClose}><X size={20} /></button>} />
      <div className="notice-card">
        <div className="notice-icon"><MapPin size={19} /></div>
        <div><b>{item.categoria}</b><span>{item.endereco}</span></div>
      </div>
      {message && <div className="form-message"><AlertTriangle size={16} />{message}</div>}
      {fiscais.length === 0 ? (
        <EmptyState icon={<ClipboardList size={28} />} title="Sem fiscais disponíveis" message="Não há outros fiscais ativos." />
      ) : (
        <div className="user-list">
          {fiscais.map((f) => (
            <article className="user-card" key={f.id}>
              <div className="avatar">{f.nome.charAt(0)}</div>
              <div className="user-info"><b>{f.nome}</b><span>{f.bairro}</span></div>
              <button className="primary-button small" disabled={busy} onClick={() => redistribute(f.id)}>Atribuir</button>
            </article>
          ))}
        </div>
      )}
    </>
  );
}

function InspectionForm({
  item,
  fiscal,
  onClose,
}: {
  item: Occurrence;
  fiscal: Fiscal | null;
  onClose: (auto?: { valorMulta: number; numeroProcesso: string }) => void;
}) {
  const [laudo, setLaudo] = useState('');
  const [acao, setAcao] = useState<string>('Sem ação');
  const [valorMulta, setValorMulta] = useState('');
  const [numeroProcesso, setNumeroProcesso] = useState('');
  const [arrival, setArrival] = useState<{ lat: number; lng: number; time: Date } | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);

  const registerArrival = () => {
    if (!navigator.geolocation) { setMessage('Seu aparelho não disponibilizou a localização.'); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => setArrival({ lat: pos.coords.latitude, lng: pos.coords.longitude, time: new Date() }),
      () => setMessage('Precisamos da localização para registrar a chegada.'),
    );
  };

  const loadDocuments = async () => {
    if (!fiscal) return;
    setLoadingDocs(true);
    try {
      const docs = await documentsApi.getByOccurrence(item.id);
      setDocuments(docs);
    } catch (error) {
      console.error('Erro ao carregar documentos:', error);
    } finally {
      setLoadingDocs(false);
    }
  };

  useEffect(() => {
    loadDocuments();
  }, [item.id, fiscal?.id]);

  const handleDocumentUpload = async (files: File[]) => {
    if (!fiscal) return;
    try {
      for (const file of files) {
        const base64 = await fileUtils.fileToBase64(file);
        
        const documento = {
          fiscal_id: fiscal.id,
          ocorrencia_id: item.id,
          vistoria_id: null,
          ordem_servico_id: null,
          tipo_documento: file.type.startsWith('image/') ? 'foto' : 'documento',
          titulo: file.name,
          descricao: `Documento da ocorrência ${item.id}`,
          arquivo_data: base64,
          arquivo_nome: file.name,
          arquivo_tipo: file.type,
          arquivo_tamanho: file.size,
          ordem: documents.length,
          metadados: {
            uploadDate: new Date().toISOString(),
            occurrenceId: item.id,
          },
        };

        await documentsApi.create(documento);
      }

      await loadDocuments();
    } catch (error) {
      console.error('Erro ao fazer upload de documento:', error);
    }
  };

  const handleDocumentDelete = async (id: string) => {
    try {
      await documentsApi.delete(id);
      await loadDocuments();
    } catch (error) {
      console.error('Erro ao deletar documento:', error);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!arrival) { setMessage('Registre a chegada antes de finalizar a vistoria.'); return; }
    if (laudo.trim().length < 10) { setMessage('Escreva um laudo com pelo menos 10 caracteres.'); return; }
    if (photos.length < 1) { setMessage('Anexe pelo menos 1 foto "depois".'); return; }
    if (!fiscal) return;
    setSaving(true);
    setMessage('');

    const vistoriaPayload = {
      ocorrencia_id: item.id,
      fiscal_id: fiscal.id,
      chegada_at: arrival.time.toISOString(),
      chegada_latitude: arrival.lat,
      chegada_longitude: arrival.lng,
      laudo: laudo.trim(),
      acao_tomada: acao,
      valor_multa: acao === 'Multa' ? parseFloat(valorMulta) || 0 : null,
      numero_processo: acao === 'Multa' ? numeroProcesso : null,
      fotos_depois: photos,
    };
    const newStatus = acao === 'Sem ação' || acao === 'Orientação' ? 'Resolvida' : acao === 'Encaminhamento' ? 'Escalonada' : 'Resolvida';

    if (!navigator.onLine) {
      enqueue('vistorias', vistoriaPayload, `Vistoria: ${item.categoria}`);
      enqueueUpdate('ocorrencias', { id: item.id }, { status: newStatus }, 'Atualização de status');
      enqueue('auditoria', {
        ocorrencia_id: item.id,
        status_anterior: item.status,
        status_novo: newStatus,
        fiscal_id: fiscal.id,
        latitude: arrival.lat,
        longitude: arrival.lng,
        observacao: `Vistoria realizada (offline). Ação: ${acao}.`,
      }, 'Auditoria');
      setSaving(false);
      onClose(acao === 'Multa' ? { valorMulta: parseFloat(valorMulta) || 0, numeroProcesso } : undefined);
      return;
    }

    const { error: vistoriaError } = await supabase.from('vistorias').insert(vistoriaPayload);

    if (vistoriaError) {
      enqueue('vistorias', vistoriaPayload, `Vistoria: ${item.categoria}`);
      setMessage('Sem conexão estável: a vistoria foi salva na fila e será enviada automaticamente.');
      setSaving(false);
      setTimeout(() => onClose(acao === 'Multa' ? { valorMulta: parseFloat(valorMulta) || 0, numeroProcesso } : undefined), 1400);
      return;
    }

    await supabase.from('ocorrencias').update({ status: newStatus }).eq('id', item.id);
    await supabase.from('auditoria').insert({
      ocorrencia_id: item.id,
      status_anterior: item.status,
      status_novo: newStatus,
      fiscal_id: fiscal.id,
      latitude: arrival.lat,
      longitude: arrival.lng,
      observacao: `Vistoria realizada. Ação: ${acao}.`,
    });

    onClose(acao === 'Multa' ? { valorMulta: parseFloat(valorMulta) || 0, numeroProcesso } : undefined);
  };

  return (
    <>
      <PageTitle eyebrow="Vistoria em andamento" title={item.categoria}
        action={<button className="icon-button light" onClick={onClose}><X size={20} /></button>} />
      <div className="occurrence-detail">
        <p>{item.descricao}</p>
        <div className="card-meta">
          <span><MapPin size={14} />{item.endereco}</span>
          <span><Clock3 size={14} />SLA {new Date(item.sla_deadline).toLocaleDateString('pt-BR')}</span>
        </div>
        <Badge>{item.status}</Badge>
      </div>

      <form className="form-card" onSubmit={submit}>
        <div className="form-section">
          <h2>Chegada ao local</h2>
          <button type="button" className={`location-button ${arrival ? 'captured' : ''}`} onClick={registerArrival}>
            <Navigation size={18} />
            {arrival ? `Chegada registrada às ${arrival.time.toLocaleTimeString('pt-BR')}` : 'Registrar chegada com GPS'}
          </button>
        </div>

        <div className="form-section">
          <h2>Laudo da vistoria</h2>
          <label>
            Laudo
            <textarea required minLength={10} value={laudo} onChange={(e) => setLaudo(e.target.value)} placeholder="Descreva o que encontrou no local..." />
          </label>
          <label>
            Ação tomada
            <select value={acao} onChange={(e) => setAcao(e.target.value)}>
              {ACTIONS.map((a) => <option key={a}>{a}</option>)}
            </select>
          </label>
          {acao === 'Multa' && (
            <>
              <label>
                Valor da multa (R$)
                <input type="number" step="0.01" required value={valorMulta} onChange={(e) => setValorMulta(e.target.value)} placeholder="0,00" />
              </label>
              <label>
                Número do processo
                <input required value={numeroProcesso} onChange={(e) => setNumeroProcesso(e.target.value)} placeholder="Nº do processo" />
              </label>
            </>
          )}
        </div>

        <div className="form-section">
          <h2>Fotos "depois"</h2>
          <PhotoUpload photos={photos} onChange={setPhotos} max={5} minRequired={1} label="Anexar foto" hint="Mínimo 1 foto obrigatória" />
        </div>

        <div className="form-section">
          <h2>Documentos adicionais</h2>
          <DocumentGallery
            documentos={documents}
            onUpload={handleDocumentUpload}
            onDelete={handleDocumentDelete}
            editable={true}
            showMetadata={true}
          />
        </div>

        {message && <div className="form-message"><AlertTriangle size={16} />{message}</div>}
        <button className="primary-button full" disabled={saving}>
          {saving ? <Loader2 className="spin" size={18} /> : 'Finalizar vistoria'}
        </button>
      </form>
    </>
  );
}

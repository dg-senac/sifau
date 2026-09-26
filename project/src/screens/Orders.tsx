import { FormEvent, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ChevronRight,
  FileText,
  ListFilter,
  MapPin,
  Navigation,
  Plus,
  X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Fiscal, OS_ORIGINS, OS_STATUSES, OrdemServico } from '@/lib/types';
import { PageTitle, EmptyState, Badge } from '@/components/ui';

export function Orders({ fiscal }: { fiscal: Fiscal | null }) {
  const [orders, setOrders] = useState<OrdemServico[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState('Todos');
  const [detail, setDetail] = useState<OrdemServico | null>(null);

  const load = async () => {
    setLoading(true);
    let query = supabase.from('ordens_servico').select('*').order('emitida_em', { ascending: false });
    if (statusFilter !== 'Todos') query = query.eq('status', statusFilter);
    const { data } = await query;
    setOrders(data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [statusFilter]);

  if (detail) {
    return <OrderDetail order={detail} fiscal={fiscal} onClose={() => { setDetail(null); load(); }} />;
  }

  return (
    <>
      <PageTitle
        eyebrow="Gestão operacional"
        title="Ordens de serviço"
        action={
          <button className="primary-button small" onClick={() => setShowForm(!showForm)}>
            <Plus size={16} /> Nova OS
          </button>
        }
      />
      {showForm && (
        <OrderForm
          fiscal={fiscal}
          onDone={() => {
            setShowForm(false);
            load();
          }}
          onCancel={() => setShowForm(false)}
        />
      )}
      <div className="filter-row">
        <div className="select-wrap">
          <ListFilter size={16} />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option>Todos</option>
            {OS_STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        <span className="result-count">{orders.length} ordens</span>
      </div>
      {loading ? (
        <div className="empty-state"><Navigation className="spin" size={22} /></div>
      ) : orders.length === 0 ? (
        <EmptyState icon={<FileText size={28} />} title="Nenhuma ordem de serviço" message="Crie a primeira OS para começar." />
      ) : (
        <div className="order-list">
          {orders.map((order) => (
            <article className="order-card" key={order.id} onClick={() => setDetail(order)}>
              <div className="order-number">
                {order.numero}
                <Badge>{order.status}</Badge>
              </div>
              <h3>{order.descricao}</h3>
              <div className="card-meta">
                <span><MapPin size={14} />{order.endereco}</span>
                <span>{order.origem}</span>
              </div>
              <ChevronRight size={18} className="order-chevron" />
            </article>
          ))}
        </div>
      )}
    </>
  );
}

function OrderForm({
  fiscal,
  onDone,
  onCancel,
}: {
  fiscal: Fiscal | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    numero: `OS-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9999)).padStart(4, '0')}`,
    origem: 'Denúncia',
    requerente: '',
    descricao: '',
    endereco: '',
    apoio: false,
    orgao_apoio: '',
    prazo: '',
  });
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const captureLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setMessage('Não foi possível capturar a localização.'),
    );
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!fiscal) return;
    setSaving(true);
    setMessage('');
    const { error } = await supabase.from('ordens_servico').insert({
      numero: form.numero,
      origem: form.origem,
      requerente: form.requerente,
      descricao: form.descricao,
      endereco: form.endereco,
      apoio_operacional: form.apoio,
      orgao_apoio: form.apoio ? form.orgao_apoio : null,
      prazo_resposta: new Date(form.prazo).toISOString(),
      fiscal_abertura: fiscal.id,
      latitude: location?.lat ?? null,
      longitude: location?.lng ?? null,
    });
    if (error) {
      setMessage('Erro ao criar ordem. Verifique se o número é único.');
      setSaving(false);
      return;
    }
    onDone();
  };

  return (
    <form className="form-card compact" onSubmit={submit}>
      <div className="form-section">
        <h2>Nova ordem de serviço</h2>
        <label>
          Número da OS
          <input required value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} />
        </label>
        <label>
          Origem
          <select value={form.origem} onChange={(e) => setForm({ ...form, origem: e.target.value })}>
            {OS_ORIGINS.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </label>
        <label>
          Requerente
          <input required value={form.requerente} onChange={(e) => setForm({ ...form, requerente: e.target.value })} />
        </label>
        <label>
          Descrição
          <textarea required value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
        </label>
        <label>
          Endereço
          <input required value={form.endereco} onChange={(e) => setForm({ ...form, endereco: e.target.value })} />
        </label>
        <button type="button" className={`location-button ${location ? 'captured' : ''}`} onClick={captureLocation}>
          <Navigation size={18} />
          {location ? 'Local capturado' : 'Capturar localização'}
        </button>
        <label>
          Apoio operacional
          <div className="toggle-row">
            <button
              type="button"
              className={form.apoio ? 'toggle on' : 'toggle'}
              onClick={() => setForm({ ...form, apoio: !form.apoio })}
            >
              <i />
            </button>
            <span>{form.apoio ? 'Sim' : 'Não'}</span>
          </div>
        </label>
        {form.apoio && (
          <label>
            Órgão de apoio
            <select value={form.orgao_apoio} onChange={(e) => setForm({ ...form, orgao_apoio: e.target.value })}>
              <option value="">Selecione</option>
              <option>Polícia Militar</option>
              <option>Guarda Municipal</option>
              <option>Outro</option>
            </select>
          </label>
        )}
        <label>
          Prazo de resposta
          <input required type="datetime-local" value={form.prazo} onChange={(e) => setForm({ ...form, prazo: e.target.value })} />
        </label>
      </div>
      {message && (
        <div className="form-message">
          <AlertTriangle size={16} />
          {message}
        </div>
      )}
      <div className="form-actions">
        <button type="button" className="ghost-button" onClick={onCancel}>Cancelar</button>
        <button className="primary-button" disabled={saving}>Criar ordem</button>
      </div>
    </form>
  );
}

function OrderDetail({ order, fiscal, onClose }: { order: OrdemServico; fiscal: Fiscal | null; onClose: () => void }) {
  const [vistorias, setVistorias] = useState<any[]>([]);
  const [autos, setAutos] = useState<any[]>([]);
  const [withinRange, setWithinRange] = useState(false);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState('');
  const watchId = useRef<number | null>(null);

  useEffect(() => () => {
    if (watchId.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchId.current);
    }
  }, []);

  useEffect(() => {
    supabase.from('vistorias').select('*').eq('ocorrencia_id', order.ocorrencia_id ?? '').then(({ data }) => setVistorias(data ?? []));
    supabase.from('autos_infracao').select('*').eq('os_id', order.id).then(({ data }) => setAutos(data ?? []));
  }, [order]);

  const checkProximity = () => {
    if (!navigator.geolocation || order.latitude == null || order.longitude == null) {
      setMessage('Localização do fiscal ou da OS indisponível.');
      return;
    }
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    setChecking(true);
    setWithinRange(false);
    setMessage('Obtendo localização precisa...');
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        const dist = haversine(pos.coords.latitude, pos.coords.longitude, order.latitude!, order.longitude!);
        const accuracy = pos.coords.accuracy;
        const isWithinRange = dist + accuracy <= 100;
        setWithinRange(isWithinRange);
        setMessage(isWithinRange
          ? `Localização confirmada: ${Math.round(dist)}m do endereço (precisão ±${Math.round(accuracy)}m).`
          : `Distância estimada: ${Math.round(dist)}m (precisão ±${Math.round(accuracy)}m). A distância mais a margem de erro precisa ser de até 100m.`);
        setChecking(false);
      },
      (error) => {
        setWithinRange(false);
        setMessage(error.code === error.PERMISSION_DENIED
          ? 'Permita o acesso à localização para verificar a proximidade.'
          : 'Não foi possível obter sua localização. Verifique o GPS e tente novamente.');
        if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
        watchId.current = null;
        setChecking(false);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    );
  };

  const startInspection = async () => {
    if (!fiscal || !withinRange) return;
    await supabase.from('ordens_servico').update({ status: 'Em vistoria' }).eq('id', order.id);
    onClose();
  };

  return (
    <>
      <PageTitle
        eyebrow="Detalhe da OS"
        title={order.numero}
        action={
          <button className="icon-button light" onClick={onClose}>
            <X size={20} />
          </button>
        }
      />
      <div className="occurrence-detail">
        <p>{order.descricao}</p>
        <div className="card-meta">
          <span><MapPin size={14} />{order.endereco}</span>
          <span>Requerente: {order.requerente}</span>
        </div>
        <div className="detail-badges">
          <Badge>{order.status}</Badge>
          <Badge>{order.origem}</Badge>
          {order.apoio_operacional && <Badge>Apoio: {order.orgao_apoio}</Badge>}
        </div>
      </div>

      {order.status === 'Aberta' && (
        <div className="proximity-card">
          <div className="proximity-icon"><Navigation size={20} /></div>
          <div>
            <b>Regra de proximidade</b>
            <span>Só é possível iniciar a vistoria a até 100m do endereço, considerando a precisão do GPS.</span>
          </div>
        </div>
      )}

      {order.status === 'Aberta' && (
        <>
          <button className="outline-button full" onClick={checkProximity} disabled={checking}>
            <Navigation size={16} />
            {checking ? 'Obtendo localização...' : watchId.current !== null ? 'GPS em acompanhamento' : 'Verificar proximidade'}
          </button>
          {message && <div className="info-message"><AlertTriangle size={16} />{message}</div>}
          <button className="primary-button full" onClick={startInspection} disabled={!withinRange}>
            Iniciar vistoria da OS
          </button>
        </>
      )}

      <div className="section-heading" style={{ marginTop: '20px' }}>
        <h2>Vistorias ({vistorias.length})</h2>
      </div>
      {vistorias.length === 0 ? (
        <span className="muted">Nenhuma vistoria vinculada.</span>
      ) : (
        <div className="audit-list">
          {vistorias.map((v) => (
            <article className="audit-item" key={v.id}>
              <div className="audit-line" />
              <div>
                <span className="eyebrow">{new Date(v.chegada_at).toLocaleString('pt-BR')}</span>
                <h3>Ação: {v.acao_tomada}</h3>
                <span>{v.laudo}</span>
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="section-heading" style={{ marginTop: '20px' }}>
        <h2>Autos de infração ({autos.length})</h2>
      </div>
      {autos.length === 0 ? (
        <span className="muted">Nenhum auto vinculado.</span>
      ) : (
        <div className="order-list">
          {autos.map((a) => (
            <article className="order-card" key={a.id}>
              <div className="order-number">
                {a.tipo_infracao}
                <Badge danger={a.pagamento === 'Pendente'}>{a.pagamento}</Badge>
              </div>
              <h3>R$ {a.valor_multa?.toFixed(2)}</h3>
              <div className="card-meta">
                <span>Autuado: {a.autuado_nome}</span>
                <span>{a.ciencia}</span>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

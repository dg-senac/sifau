import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
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
import { Fiscal, OS_ORIGINS, OS_STATUSES, Vistoria } from '@/lib/types';
import { INSPECTION_COLUMNS } from '@/lib/columns';
import { PageTitle, EmptyState, Badge, SkeletonList } from '@/components/ui';
import { FluxoOrdemServico } from '@/components/FluxoOrdemServico';
import { OS_COLUMNS, salvarEtapaOS, type OrdemComFluxo } from '@/lib/fluxoOS';
import { capturarLocalizacao, type MotivoDeFalha } from '@/lib/geolocalizacao';

const ERROS_GPS_OS: Record<MotivoDeFalha, string> = {
  'permissao-negada': 'Permita a localização para capturar o ponto da OS.',
  'permissao-bloqueada': 'Localização bloqueada. Habilite a permissão nas configurações do aplicativo/site.',
  'gps-indisponivel': 'Localização indisponível. Verifique se o GPS está ligado.',
  'tempo-esgotado': 'O GPS demorou demais. Tente novamente em local aberto.',
  'sem-suporte': 'Este aparelho não disponibiliza localização.',
  inesperada: 'Não foi possível obter a localização. Tente novamente.',
};

export function Orders({ fiscal }: { fiscal: Fiscal | null }) {
  const [orders, setOrders] = useState<OrdemComFluxo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [arquivo, setArquivo] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState('Todos');
  const [detail, setDetail] = useState<OrdemComFluxo | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      let query = supabase.from('ordens_servico').select(OS_COLUMNS).order('emitida_em', { ascending: false });
      if (arquivo) query = query.in('status', ['Concluída', 'Cancelada']);
      else if (statusFilter !== 'Todos') query = query.eq('status', statusFilter);
      const { data, error } = await query;
      if (error) throw error;
      setOrders((data ?? []) as OrdemComFluxo[]);
    } catch {
      setLoadError('Não foi possível carregar as OS. Verifique sua conexão e se a atualização do banco foi aplicada.');
    } finally { setLoading(false); }
  }, [statusFilter, arquivo]);

  useEffect(() => {
    void load();
  }, [load]);

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
      <div className="os-acoes" role="group" aria-label="Visualização de ordens">
        <button className="outline-button" aria-pressed={!arquivo} onClick={() => setArquivo(false)}>Todas as OS</button>
        <button className="outline-button" aria-pressed={arquivo} onClick={() => setArquivo(true)}>Histórico de OS concluídas</button>
      </div>
      <div className="filter-row">
        <div className="select-wrap">
          <ListFilter size={16} />
          <select disabled={arquivo} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option>Todos</option>
            {OS_STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        <span className="result-count">{orders.length} ordens</span>
      </div>
      {loadError ? (
        <div className="form-message" role="alert">{loadError}<button className="outline-button" onClick={() => void load()}>Tentar de novo</button></div>
      ) : loading ? (
        <SkeletonList linhas={3} label="Carregando ordens de serviço" />
      ) : orders.length === 0 ? (
        <EmptyState icon={<FileText size={28} />} title="Nenhuma ordem de serviço" message="Crie a primeira OS para começar." />
      ) : (
        <div className="order-list">
          {orders.map((order) => (
            <article
              className="order-card tapable"
              key={order.id}
              onClick={() => setDetail(order)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDetail(order); } }}
            >
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
    numero: `OS-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
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

  const [capturando, setCapturando] = useState(false);
  const capturandoRef = useRef(false);
  const captureLocation = async () => {
    if (capturandoRef.current) return;
    capturandoRef.current = true; setCapturando(true); setMessage('Obtendo localização da OS...');
    try {
      const resultado = await capturarLocalizacao({ aoPedirPermissao: () => setMessage('A localização identifica o local da OS, somente durante o uso do aplicativo.') });
      if (resultado.ok) {
        setLocation({ lat: resultado.latitude, lng: resultado.longitude });
        setMessage('Localização capturada.');
      } else setMessage(ERROS_GPS_OS[resultado.motivo]);
    } finally { capturandoRef.current = false; setCapturando(false); }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!fiscal || saving) return;
    setSaving(true);
    setMessage('');
    try {
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
    } catch { setMessage('Não foi possível criar a OS. Verifique sua conexão.'); }
    finally { setSaving(false); }
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
        <button type="button" className={`location-button ${location ? 'captured' : ''}`} onClick={() => void captureLocation()} disabled={capturando}>
          <Navigation size={18} />
          {capturando ? 'Obtendo localização...' : location ? 'Local capturado' : 'Capturar localização'}
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

function OrderDetail({ order: initialOrder, fiscal, onClose }: { order: OrdemComFluxo; fiscal: Fiscal | null; onClose: () => void }) {
  const [order, setOrder] = useState(initialOrder);
  const [vistorias, setVistorias] = useState<Vistoria[]>([]);
  const [withinRange, setWithinRange] = useState(false);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState('');
  const gpsEmAndamento = useRef(false);
  const [posicao, setPosicao] = useState<{ latitude: number; longitude: number; precisao: number } | null>(null);

  useEffect(() => {
    const fetchOrderData = async () => {
      if (!order.ocorrencia_id) { setVistorias([]); return; }
      // Lista somente laudo e metadados, sem fotos pesadas.
      const { data: vistoriasData } = await supabase
        .from('vistorias').select(INSPECTION_COLUMNS).eq('ocorrencia_id', order.ocorrencia_id);
      setVistorias(vistoriasData ?? []);

    };

    fetchOrderData();
  }, [order.ocorrencia_id]);

  const checkProximity = async () => {
    if (gpsEmAndamento.current) return;
    if (order.latitude == null || order.longitude == null) {
      setMessage('Localização da OS indisponível.'); return;
    }
    gpsEmAndamento.current = true; setChecking(true); setWithinRange(false); setPosicao(null);
    setMessage('Obtendo localização precisa...');
    try {
      const resultado = await capturarLocalizacao();
      if (!resultado.ok) { setMessage(ERROS_GPS_OS[resultado.motivo]); return; }
      const precisao = resultado.precisaoMetros;
      if (precisao == null || !Number.isFinite(precisao)) {
        setMessage('O GPS não informou a precisão. Capture novamente para validar os 100 metros.'); return;
      }
      const distancia = haversine(resultado.latitude, resultado.longitude, order.latitude, order.longitude);
      const dentro = distancia + precisao <= 100;
      setWithinRange(dentro);
      setPosicao({ latitude: resultado.latitude, longitude: resultado.longitude, precisao });
      setMessage(dentro ? `Localização confirmada: ${Math.round(distancia)}m (precisão ±${Math.round(precisao)}m).` :
        `Distância estimada: ${Math.round(distancia)}m (precisão ±${Math.round(precisao)}m). Distância e margem de erro devem somar até 100m.`);
    } finally { gpsEmAndamento.current = false; setChecking(false); }
  };

  const startInspection = async () => {
    if (!fiscal || !withinRange || !posicao || checking) return;
    setChecking(true);
    try {
      setOrder(await salvarEtapaOS(order, 'iniciar', posicao, fiscal));
      setMessage('Vistoria iniciada.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível iniciar.'); }
    finally { setChecking(false); }
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

      {order.status === 'Aberta' && fiscal && (order.fiscal_abertura === fiscal.id || order.fiscal_designado === fiscal.id) && (
        <div className="proximity-card">
          <div className="proximity-icon"><Navigation size={20} /></div>
          <div>
            <b>Regra de proximidade</b>
            <span>Só é possível iniciar a vistoria a até 100m do endereço, considerando a precisão do GPS.</span>
          </div>
        </div>
      )}

      {order.status === 'Aberta' && fiscal && (order.fiscal_abertura === fiscal.id || order.fiscal_designado === fiscal.id) && (
        <>
          <button className="outline-button full" onClick={checkProximity} disabled={checking}>
            <Navigation size={16} />
            {checking ? 'Obtendo localização...' : 'Verificar proximidade'}
          </button>
          {message && <div className="info-message"><AlertTriangle size={16} />{message}</div>}
          <button className="primary-button full" onClick={startInspection} disabled={!withinRange || checking}>
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

      <FluxoOrdemServico ordem={order} fiscal={fiscal} onChange={setOrder} />

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

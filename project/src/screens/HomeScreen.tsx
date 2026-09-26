import { FormEvent, useEffect, useState } from 'react';
import {
  AlertTriangle, Camera, CheckCircle2, ChevronRight, Clock3, ListFilter,
  Loader2, MapPin, Plus, SlidersHorizontal, X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Fiscal, Occurrence, Screen } from '@/lib/types';
import { PageTitle, EmptyState, UrgencyBadge, Badge } from '@/components/ui';
import { OccurrenceDetail } from '@/screens/OccurrenceDetail';

export function HomeScreen({
  fiscal,
  onNavigate,
}: {
  fiscal: Fiscal | null;
  onNavigate: (s: Screen) => void;
}) {
  const [items, setItems] = useState<Occurrence[]>([]);
  const [status, setStatus] = useState('Todos');
  const [categoria, setCategoria] = useState('Todas');
  const [bairro, setBairro] = useState('Todos');
  const [loading, setLoading] = useState(true);
  const [resolvedCount, setResolvedCount] = useState(0);
  const [compliance, setCompliance] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const [detail, setDetail] = useState<Occurrence | null>(null);

  const load = async () => {
    setLoading(true);
    let query = supabase.from('ocorrencias').select('*').order('created_at', { ascending: false }).limit(50);
    if (status !== 'Todos') query = query.eq('status', status);
    if (categoria !== 'Todas') query = query.eq('categoria', categoria);
    if (bairro !== 'Todos') query = query.eq('bairro', bairro);
    const { data } = await query;
    setItems(data ?? []);
    setLoading(false);

    if (fiscal) {
      const { count: resolved } = await supabase
        .from('ocorrencias').select('id', { count: 'exact', head: true })
        .eq('fiscal_designado', fiscal.id).eq('status', 'Resolvida');
      const { count: totalAssigned } = await supabase
        .from('ocorrencias').select('id', { count: 'exact', head: true })
        .eq('fiscal_designado', fiscal.id);
      setResolvedCount(resolved ?? 0);
      setCompliance(totalAssigned ? Math.round(((resolved ?? 0) / totalAssigned) * 100) : 0);
    }
  };

  useEffect(() => { load(); }, [status, categoria, bairro, fiscal?.id]);

  const assigned = items.filter((item) => item.fiscal_designado === fiscal?.id).length;
  const bairros = [...new Set(items.map((i) => i.bairro))];

  if (detail) {
    return <OccurrenceDetail item={detail} fiscal={fiscal} onClose={() => { setDetail(null); load(); }} />;
  }

  return (
    <>
      <PageTitle
        eyebrow={`Olá, ${fiscal?.nome?.split(' ')[0] ?? 'Fiscal'}`}
        title="Central de fiscalização"
        action={
          <button className="icon-button light" onClick={() => setShowFilters(!showFilters)}>
            <SlidersHorizontal size={19} />
          </button>
        }
      />
      <section className="personal-summary">
        <div>
          <span>Minha fila</span>
          <b>{assigned}</b>
          <small>atribuídas</small>
        </div>
        <div>
          <span>Resolvidas</span>
          <b>{resolvedCount}</b>
          <small>no total</small>
        </div>
        <div>
          <span>SLA</span>
          <b>{compliance}%</b>
          <small>cumprimento</small>
        </div>
      </section>
      <button className="new-report" onClick={() => onNavigate('new')}>
        <div className="new-report-icon"><Plus size={22} /></div>
        <div>
          <b>Registrar ocorrência</b>
          <span>Envie uma nova denúncia de fiscalização</span>
        </div>
        <ChevronRight size={20} />
      </button>

      {showFilters && (
        <div className="filter-panel">
          <div className="filter-panel-header">
            <b>Filtros</b>
            <button className="icon-button" onClick={() => setShowFilters(false)}><X size={18} /></button>
          </div>
          <label>
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option>Todos</option>
              {['Aberta', 'Triada', 'Atribuída', 'Em vistoria', 'Resolvida', 'Arquivada', 'Escalonada'].map((v) => <option key={v}>{v}</option>)}
            </select>
          </label>
          <label>
            Categoria
            <select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
              <option>Todas</option>
              {['Buraco na via', 'Iluminação pública', 'Poluição sonora', 'Entulho / lixo irregular', 'Poda de árvore / risco de queda', 'Vazamento de água / esgoto', 'Ocupação irregular de calçada', 'Sinalização de trânsito danificada', 'Comércio/obra sem licença'].map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label>
            Bairro
            <select value={bairro} onChange={(e) => setBairro(e.target.value)}>
              <option>Todos</option>
              {bairros.map((b) => <option key={b}>{b}</option>)}
            </select>
          </label>
          <button className="ghost-button small" onClick={() => { setStatus('Todos'); setCategoria('Todas'); setBairro('Todos'); }}>Limpar filtros</button>
        </div>
      )}

      <div className="section-heading">
        <h2>Ocorrências recentes</h2>
        <button onClick={() => onNavigate('dashboard')}>Ver painel</button>
      </div>
      <div className="filter-row">
        <div className="select-wrap">
          <ListFilter size={16} />
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option>Todos</option>
            {['Aberta', 'Triada', 'Atribuída', 'Em vistoria', 'Resolvida', 'Escalonada'].map((v) => <option key={v}>{v}</option>)}
          </select>
        </div>
        <span className="result-count">{items.length} registros</span>
      </div>
      {loading ? (
        <div className="empty-state"><Loader2 className="spin" size={22} /></div>
      ) : items.length === 0 ? (
        <EmptyState icon={<MapPin size={27} />} title="Nenhuma ocorrência" message="Os registros da sua cidade aparecerão aqui." />
      ) : (
        <div className="occurrence-list">
          {items.map((item) => (
            <OccurrenceCard key={item.id} item={item} onClick={() => setDetail(item)} />
          ))}
        </div>
      )}
    </>
  );
}

export function OccurrenceCard({ item, onClick }: { item: Occurrence; onClick?: () => void }) {
  const overdue = new Date(item.sla_deadline).getTime() < Date.now() && !['Resolvida', 'Arquivada'].includes(item.status);
  return (
    <article className="occurrence-card tapable" onClick={onClick}>
      <div className="card-top">
        <span className={`status-dot ${item.status.toLowerCase().replace(/ /g, '-')}`} />
        <span className="card-category">{item.categoria}</span>
        <UrgencyBadge urgency={item.urgencia} />
      </div>
      <h3>{item.descricao}</h3>
      <div className="card-meta">
        <span><MapPin size={14} />{item.bairro}</span>
        <span><Clock3 size={14} />{overdue ? 'SLA estourado' : `SLA ${new Date(item.sla_deadline).toLocaleDateString('pt-BR')}`}</span>
      </div>
      <div className="card-footer">
        <Badge danger={overdue}>{item.status}</Badge>
        <span>{new Date(item.created_at).toLocaleDateString('pt-BR')}</span>
      </div>
    </article>
  );
}

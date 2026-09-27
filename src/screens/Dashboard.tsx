import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Landmark,
  MapPin,
  Search,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { CATEGORIES, OCCURRENCE_STATUSES } from '@/lib/types';
import { PageTitle } from '@/components/ui';

export function Dashboard() {
  const [stats, setStats] = useState({ total: 0, resolved: 0, overdue: 0 });
  const [byCategory, setByCategory] = useState<{ categoria: string; count: number; pct: number }[]>([]);
  const [byStatus, setByStatus] = useState<{ status: string; count: number }[]>([]);
  const [fiscalRanking, setFiscalRanking] = useState<{ nome: string; resolvidas: number; compliance: number }[]>([]);
  const [escalated, setEscalated] = useState<number>(0);

  useEffect(() => {
    const fetchDashboardData = async () => {
      const [total, resolved, overdue] = await Promise.all([
        supabase.from('ocorrencias').select('id', { count: 'exact', head: true }),
        supabase
          .from('ocorrencias')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'Resolvida'),
        supabase
          .from('ocorrencias')
          .select('id', { count: 'exact', head: true })
          .lt('sla_deadline', new Date().toISOString())
          .not('status', 'in', '(Resolvida,Arquivada)'),
      ]);

      setStats({
        total: total.count ?? 0,
        resolved: resolved.count ?? 0,
        overdue: overdue.count ?? 0,
      });

      const { data: categoryData } = await supabase.from('ocorrencias').select('categoria');
      const counts: Record<string, number> = {};
      (categoryData ?? []).forEach((row) => {
        counts[row.categoria] = (counts[row.categoria] ?? 0) + 1;
      });
      const max = Math.max(...Object.values(counts), 1);
      setByCategory(
        Object.entries(counts).map(([categoria, count]) => ({
          categoria,
          count,
          pct: Math.round((count / max) * 100),
        })) as { categoria: string; count: number; pct: number }[],
      );

      const { data: statusData } = await supabase.from('ocorrencias').select('status');
      const statusCounts: Record<string, number> = {};
      (statusData ?? []).forEach((row) => {
        statusCounts[row.status] = (statusCounts[row.status] ?? 0) + 1;
      });
      setByStatus(
        OCCURRENCE_STATUSES.map((status) => ({
          status,
          count: statusCounts[status] ?? 0,
        })),
      );

      const { count: escalatedCount } = await supabase
        .from('ocorrencias')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'Escalonada');
      setEscalated(escalatedCount ?? 0);

      const { data: fiscalData } = await supabase.from('ocorrencias').select('fiscal_designado, status');
      const byFiscal: Record<string, { resolvidas: number; total: number }> = {};
      (fiscalData ?? []).forEach((row) => {
        if (!row.fiscal_designado) return;
        if (!byFiscal[row.fiscal_designado]) byFiscal[row.fiscal_designado] = { resolvidas: 0, total: 0 };
        byFiscal[row.fiscal_designado].total++;
        if (row.status === 'Resolvida') byFiscal[row.fiscal_designado].resolvidas++;
      });
      const ids = Object.keys(byFiscal);
      if (ids.length === 0) {
        setFiscalRanking([]);
        return;
      }
      const { data: fiscais } = await supabase.from('fiscais').select('id, nome').in('id', ids);
      const ranking = (fiscais ?? []).map((f) => ({
        nome: f.nome,
        resolvidas: byFiscal[f.id]?.resolvidas ?? 0,
        compliance: byFiscal[f.id]?.total
          ? Math.round((byFiscal[f.id].resolvidas / byFiscal[f.id].total) * 100)
          : 0,
      }));
      ranking.sort((a, b) => b.resolvidas - a.resolvidas);
      setFiscalRanking(ranking);
    };

    fetchDashboardData();
  }, []);

  const compliance = stats.total ? Math.round((stats.resolved / stats.total) * 100) : 0;
  const maxStatus = Math.max(...byStatus.map((s) => s.count), 1);

  const exportCSV = async () => {
    const { data } = await supabase.from('ocorrencias').select('*');
    if (!data || data.length === 0) return;
    const headers = ['id', 'categoria', 'subcategoria', 'descricao', 'status', 'urgencia', 'bairro', 'endereco', 'created_at', 'sla_deadline'];
    const rows = data.map((row) =>
      headers.map((h) => `"${String(row[h] ?? '').replace(/"/g, '""')}"`).join(','),
    );
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ocorrencias_sifau_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageTitle
        eyebrow="Visão geral"
        title="Painel operacional"
        action={
          <button className="icon-button light">
            <Search size={19} />
          </button>
        }
      />
      <div className="metrics-grid">
        <Metric icon={<Landmark size={18} />} label="Ocorrências" value={stats.total} tone="blue" />
        <Metric icon={<CheckCircle2 size={18} />} label="Resolvidas" value={stats.resolved} tone="green" />
        <Metric icon={<AlertTriangle size={18} />} label="SLA estourado" value={stats.overdue} tone="red" />
        <Metric icon={<Clock3 size={18} />} label="Cumprimento" value={`${compliance}%`} tone="yellow" />
      </div>

      <section className="dashboard-card">
        <div className="section-heading">
          <h2>Distribuição por status</h2>
          <button onClick={exportCSV} className="export-button">Exportar CSV</button>
        </div>
        <div className="bar-chart">
          {byStatus.map((s) => (
            <div key={s.status} style={{ height: `${Math.max((s.count / maxStatus) * 100, 8)}%` }}>
              <span>{s.status} ({s.count})</span>
            </div>
          ))}
        </div>
      </section>

      <section className="dashboard-card">
        <div className="section-heading">
          <h2>Ocorrências por categoria</h2>
        </div>
        <div className="category-bars">
          {byCategory.length === 0 ? (
            <span className="muted">Sem dados ainda</span>
          ) : (
            byCategory.map((c) => (
              <div className="category-bar-row" key={c.categoria}>
                <span>{c.categoria}</span>
                <div className="category-bar-track">
                  <div className="category-bar-fill" style={{ width: `${c.pct}%` }} />
                </div>
                <b>{c.count}</b>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="dashboard-card heatmap">
        <div className="section-heading">
          <h2>Concentração na cidade</h2>
          <span className="muted">Últimos 30 dias</span>
        </div>
        <div className="map-placeholder">
          <div className="map-grid" />
          <div className="map-pin pin-a"><MapPin size={21} /></div>
          <div className="map-pin pin-b"><MapPin size={21} /></div>
          <div className="map-pin pin-c"><MapPin size={21} /></div>
          <span>Mapa operacional</span>
        </div>
      </section>

      <section className="dashboard-card">
        <div className="section-heading">
          <h2>Ranking de fiscais</h2>
          <span className="muted">Por desempenho</span>
        </div>
        {fiscalRanking.length === 0 ? (
          <span className="muted">Sem dados ainda</span>
        ) : (
          <div className="ranking-list">
            {fiscalRanking.map((f, i) => (
              <div className="ranking-row" key={i}>
                <span className="rank-pos">{i + 1}</span>
                <div>
                  <b>{f.nome}</b>
                  <span>{f.resolvidas} resolvidas · {f.compliance}% SLA</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {escalated > 0 && (
        <section className="dashboard-card escalated-card">
          <div className="escalated-icon"><AlertTriangle size={20} /></div>
          <div>
            <b>{escalated} casos escalonados</b>
            <span>Casos travados que precisam redistribuição manual</span>
          </div>
        </section>
      )}
    </>
  );
}

function Metric({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  tone: string;
}) {
  return (
    <div className={`metric-card ${tone}`}>
      <div className="metric-icon">{icon}</div>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

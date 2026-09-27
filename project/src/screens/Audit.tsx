import { useEffect, useState } from 'react';
import { ChevronRight, FileCheck2, Loader2, Search, ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Auditoria, Fiscal, OCCURRENCE_STATUSES } from '@/lib/types';
import { PageTitle, EmptyState } from '@/components/ui';

export function Audit() {
  const [logs, setLogs] = useState<(Auditoria & { fiscal_nome?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('Todos');
  const [search, setSearch] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState('');
  const [exports, setExports] = useState<{ id: string; hash: string; descricao: string; quantidade: number; created_at: string }[]>([]);

  const load = async () => {
    setLoading(true);
    let query = supabase.from('auditoria').select('*').order('created_at', { ascending: false }).limit(50);
    if (statusFilter !== 'Todos') query = query.eq('status_novo', statusFilter);
    const { data } = await query;
    let enriched = data ?? [];
    if (enriched.length > 0) {
      const fiscalIds = [...new Set(enriched.map((l) => l.fiscal_id))];
      const { data: fiscais } = await supabase.from('fiscais').select('id, nome').in('id', fiscalIds);
      const map = Object.fromEntries((fiscais ?? []).map((f) => [f.id, f.nome]));
      enriched = enriched.map((l) => ({ ...l, fiscal_nome: map[l.fiscal_id] ?? 'Fiscal' }));
    }
    if (search) {
      enriched = enriched.filter(
        (l) =>
          (l.observacao ?? '').toLowerCase().includes(search.toLowerCase()) ||
          (l.fiscal_nome ?? '').toLowerCase().includes(search.toLowerCase()),
      );
    }
    setLogs(enriched);
    setLoading(false);
  };

  const loadExports = async () => {
    const { data } = await supabase.from('exportacoes_auditoria').select('*').order('created_at', { ascending: false }).limit(10);
    setExports(data ?? []);
  };

  useEffect(() => {
    load();
  }, [statusFilter, search]);

  useEffect(() => {
    loadExports();
  }, []);

  const doExport = async () => {
    setExporting(true);
    setExportMessage('');
    const { data } = await supabase.from('auditoria').select('*').order('created_at', { ascending: false });
    if (!data || data.length === 0) {
      setExportMessage('Não há registros para exportar.');
      setExporting(false);
      return;
    }
    const content = JSON.stringify(data, null, 2);
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(content));
    const hash = Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, '0')).join('');

    const { data: userData } = await supabase.auth.getUser();
    const fiscalId = userData.user?.id;
    if (fiscalId) {
      await supabase.from('exportacoes_auditoria').insert({
        fiscal_id: fiscalId,
        hash,
        descricao: `Exportação completa da trilha de auditoria - ${new Date().toLocaleString('pt-BR')}`,
        quantidade: data.length,
      });
    }

    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `auditoria_sifau_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);

    setExportMessage(`Exportação concluída com ${data.length} registros. Hash: ${hash.slice(0, 16)}...`);
    setExporting(false);
    loadExports();
  };

  return (
    <>
      <PageTitle
        eyebrow="Cadeia de custódia"
        title="Trilha de auditoria"
        action={
          <button className="outline-button small" onClick={doExport} disabled={exporting}>
            {exporting ? <Loader2 className="spin" size={16} /> : <FileCheck2 size={16} />}
            Exportar
          </button>
        }
      />
      <div className="immutable-banner">
        <ShieldCheck size={19} />
        <div>
          <b>Registro imutável</b>
          <span>As mudanças são permanentes e não podem ser apagadas.</span>
        </div>
      </div>

      {exportMessage && <div className="info-message"><FileCheck2 size={16} />{exportMessage}</div>}

      <div className="filter-row">
        <div className="select-wrap">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option>Todos</option>
            {OCCURRENCE_STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="search-box">
        <Search size={17} />
        <input
          placeholder="Buscar por observação ou fiscal"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="empty-state"><Loader2 className="spin" size={22} /></div>
      ) : logs.length === 0 ? (
        <EmptyState icon={<FileCheck2 size={28} />} title="Sem movimentações ainda" message="A trilha aparecerá conforme os status forem alterados." />
      ) : (
        <div className="audit-list">
          {logs.map((log) => (
            <article className="audit-item" key={log.id}>
              <div className="audit-line" />
              <div>
                <span className="eyebrow">{new Date(log.created_at).toLocaleString('pt-BR')}</span>
                <h3>
                  {log.status_anterior ?? 'Novo'} <ChevronRight size={15} /> {log.status_novo}
                </h3>
                <span>{log.observacao ?? 'Alteração de status registrada'}</span>
                <span className="audit-fiscal">Por: {log.fiscal_nome}</span>
              </div>
            </article>
          ))}
        </div>
      )}

      {exports.length > 0 && (
        <>
          <div className="section-heading" style={{ marginTop: '24px' }}>
            <h2>Exportações anteriores</h2>
          </div>
          <div className="audit-list">
            {exports.map((exp) => (
              <article className="audit-item" key={exp.id}>
                <div className="audit-line" />
                <div>
                  <span className="eyebrow">{new Date(exp.created_at).toLocaleString('pt-BR')}</span>
                  <h3>{exp.quantidade} registros</h3>
                  <span className="audit-hash">Hash: {exp.hash.slice(0, 24)}...</span>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </>
  );
}

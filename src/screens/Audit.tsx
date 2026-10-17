import { useCallback, useEffect, useState } from 'react';
import { ChevronRight, FileCheck2, Loader2, Search, ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Auditoria, OCCURRENCE_STATUSES } from '@/lib/types';
import { PageTitle, EmptyState, SkeletonList } from '@/components/ui';

export function Audit() {
  const [logs, setLogs] = useState<(Auditoria & { fiscal_nome?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('Todos');
  const [search, setSearch] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState('');
  const [exports, setExports] = useState<{ id: string; hash: string; descricao: string; quantidade: number; created_at: string }[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    let query = supabase.from('auditoria').select('*').order('created_at', { ascending: false }).limit(50);
    if (statusFilter !== 'Todos') query = query.eq('status_novo', statusFilter);
    const { data } = await query;
    let enriched = data ?? [];
    if (enriched.length > 0) {
      const fiscalIds = [...new Set(enriched.map((l) => l.fiscal_id))];
      const [{ data: directory }, { data: administrators }] = await Promise.all([
        supabase.rpc('get_fiscal_directory'),
        supabase.from('administradores').select('id, nome').in('id', fiscalIds),
      ]);
      const fiscais = ((directory ?? []) as { id: string; nome: string }[])
        .filter((fiscal) => fiscalIds.includes(fiscal.id));
      const adminNames = (administrators ?? []) as { id: string; nome: string }[];
      const map = Object.fromEntries([...fiscais, ...adminNames].map((actor) => [actor.id, actor.nome]));
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
  }, [statusFilter, search]);

  const loadExports = useCallback(async () => {
    const { data } = await supabase.from('exportacoes_auditoria').select('*').order('created_at', { ascending: false }).limit(10);
    setExports(data ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadExports();
  }, [loadExports]);

  const doExport = async () => {
    setExporting(true);
    setExportMessage('');
    try {
      const pageSize = 500;
      const data: Auditoria[] = [];
      for (let offset = 0; ; offset += pageSize) {
        const { data: page, error } = await supabase.from('auditoria').select('*')
          .order('created_at', { ascending: true })
          .order('id', { ascending: true })
          .range(offset, offset + pageSize - 1);
        if (error) throw error;
        data.push(...((page ?? []) as Auditoria[]));
        if (!page || page.length < pageSize) break;
      }
      if (data.length === 0) {
        setExportMessage('Não há registros para exportar.');
        return;
      }

      const content = JSON.stringify(data, null, 2);
      const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
      const hash = Array.from(new Uint8Array(hashBuffer)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
      const { data: userData } = await supabase.auth.getUser();
      const fiscalId = userData.user?.id;
      let registryWarning = '';
      if (fiscalId) {
        const { error } = await supabase.from('exportacoes_auditoria').insert({
          fiscal_id: fiscalId,
          hash,
          descricao: `Exportação completa da trilha de auditoria - ${new Date().toLocaleString('pt-BR')}`,
          quantidade: data.length,
        });
        if (error) {
          console.error('Arquivo exportado, mas o registro do hash falhou:', error);
          registryWarning = ' O registro do hash no banco falhou; contate a administração.';
        }
      }

      const blob = new Blob([content], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `auditoria_sifau_${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);

      setExportMessage(`Exportação concluída com ${data.length} registros. Hash SHA-256: ${hash}.${registryWarning}`);
      void loadExports();
    } catch (error) {
      console.error('Erro ao exportar a trilha de auditoria:', error);
      setExportMessage('Não foi possível exportar a trilha completa. Tente novamente.');
    } finally {
      setExporting(false);
    }
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
        <SkeletonList linhas={4} label="Carregando auditoria" />
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

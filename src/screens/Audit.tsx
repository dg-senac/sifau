import { useCallback, useEffect, useState } from 'react';
import { ChevronRight, FileCheck2, Search, ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Auditoria, OCCURRENCE_STATUSES } from '@/lib/types';
import { PageTitle, EmptyState, SkeletonList } from '@/components/ui';
import { ExportarRelatorio } from '@/components/ExportarRelatorio';
import { baixarArquivo, carregarPaginas, gerarArquivoRelatorio, hashArquivo, type FormatoRelatorio } from '@/lib/relatorios';
import { COLUNAS_AUDITORIA } from '@/lib/modelosRelatorios';

export function Audit() {
  const [logs, setLogs] = useState<(Auditoria & { fiscal_nome?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('Todos');
  const [search, setSearch] = useState('');
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

  const doExport = async (formato: FormatoRelatorio | 'json') => {
    setExportMessage('');
    const geradoEm = new Date();
    const dados = await carregarPaginas<Auditoria>((inicio, fim) => supabase.from('auditoria')
      .select('id, ocorrencia_id, status_anterior, status_novo, fiscal_id, created_at, latitude, longitude, observacao')
      .lte('created_at', geradoEm.toISOString()).order('created_at', { ascending: true })
      .order('id', { ascending: true }).range(inicio, fim));
    if (!dados.length) throw new Error('Não há registros para exportar.');
    let arquivo;
    if (formato === 'json') {
      // Mantém os campos originais: JSON técnico não recebe nomes derivados nem formatação visual.
      arquivo = { blob: new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json;charset=utf-8' }),
        nome: `auditoria_sifau_${geradoEm.toISOString().slice(0, 10)}.json` };
    } else {
      const [directory, admins] = await Promise.all([
        carregarPaginas<{ id: string; nome: string }>((inicio, fim) =>
          supabase.rpc('get_fiscal_directory').order('id', { ascending: true }).range(inicio, fim)),
        carregarPaginas<{ id: string; nome: string }>((inicio, fim) =>
          supabase.from('administradores').select('id, nome').order('id', { ascending: true }).range(inicio, fim)),
      ]);
      const nomes = new Map<string, string>([...directory, ...admins]
        .map((ator) => [ator.id, ator.nome]));
      arquivo = await gerarArquivoRelatorio({ titulo: 'Trilha de auditoria', nomeArquivo: 'auditoria_sifau',
        escopo: 'Trilha completa acessível à sua conta até o início da exportação. Não se limita aos 50 registros, à busca ou ao filtro de situação da tela.',
        colunas: COLUNAS_AUDITORIA, geradoEm,
        linhas: dados.map((d) => ({ ...d, fiscal_nome: nomes.get(d.fiscal_id) ?? 'Nome indisponível (consulte o identificador técnico)',
          status_anterior: d.status_anterior ?? 'Registro inicial' })),
      }, formato);
    }
    // Hash dos BYTES do arquivo efetivamente baixado, não de um JSON auxiliar.
    const hash = await hashArquivo(arquivo.blob);
    const { data: usuario, error: erroUsuario } = await supabase.auth.getUser();
    let aviso = '';
    if (erroUsuario || !usuario.user) {
      aviso = ' Não foi possível registrar o hash no banco; contate a administração.';
    } else {
      const { error } = await supabase.from('exportacoes_auditoria').insert({
        fiscal_id: usuario.user.id, hash, descricao: `Trilha completa em ${formato.toUpperCase()} — ${geradoEm.toLocaleString('pt-BR')}`,
        quantidade: dados.length,
      });
      if (error) aviso = ' O registro do hash no banco falhou; contate a administração.';
    }
    baixarArquivo(arquivo);
    setExportMessage(`Download solicitado: ${dados.length} registros em ${formato.toUpperCase()}. SHA-256: ${hash}.${aviso}`);
    void loadExports();
  };

  return (
    <>
      <PageTitle
        eyebrow="Cadeia de custódia"
        title="Trilha de auditoria"
      />
      <div className="immutable-banner">
        <ShieldCheck size={19} />
        <div>
          <b>Registro imutável</b>
          <span>As mudanças são permanentes e não podem ser apagadas.</span>
        </div>
      </div>

      <ExportarRelatorio titulo="Exportar trilha completa" escopo="Inclui todos os registros acessíveis, não apenas os 50 exibidos. Busca e filtros da tela não limitam a exportação. Cada formato recebe seu próprio hash SHA-256." onExport={doExport} permitirJSON />
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
                  <span>{exp.descricao}</span>
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

import { useEffect, useState } from 'react';
import { BarChart3, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { carregarAtividade, larguraBarra, MODULOS_ATIVIDADE, ROTULOS_DOCUMENTOS, type ContagensAtividade } from '@/lib/atividade';
import { SkeletonList } from '@/components/ui';

const numero = (n: number | null | undefined) => n == null ? 'Indisponível' : n.toLocaleString('pt-BR');
export function PainelAtividade({ atualizacao = 0 }: { atualizacao?: number }) {
  const [dados, setDados] = useState<ContagensAtividade | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [repetir, setRepetir] = useState(0);
  const [atualizado, setAtualizado] = useState<Date | null>(null);
  useEffect(() => {
    const controle = new AbortController();
    setCarregando(true); setDados(null); setAtualizado(null);
    void carregarAtividade((consulta) => {
      let query = supabase.from(consulta.tabela).select('id', { count: 'exact', head: true }).abortSignal(controle.signal);
      if (consulta.campo) query = query.eq(consulta.campo, consulta.valor);
      return query;
    }, controle.signal).then((resultado) => {
      if (!controle.signal.aborted) { setDados(resultado); setAtualizado(new Date()); }
    }).catch(() => {
      // O cancelamento é esperado ao sair ou atualizar; falhas individuais já são null.
      if (!controle.signal.aborted) setDados({});
    }).finally(() => { if (!controle.signal.aborted) setCarregando(false); });
    return () => controle.abort();
  }, [atualizacao, repetir]);
  const parcial = dados && Object.values(dados).some(v => v === null);
  const totais = MODULOS_ATIVIDADE.map(m => ({ rotulo: m.titulo, valor: dados?.[m.id] ?? null }));
  return <section className="activity-panel" aria-label="Acompanhamento do trabalho">
    <div className="section-heading"><h2><BarChart3 size={19} aria-hidden="true" /> Meu acompanhamento</h2>
      <button type="button" className="icon-button light" disabled={carregando} aria-label="Atualizar acompanhamento" title="Atualizar acompanhamento" onClick={() => setRepetir(v => v + 1)}><RefreshCw size={18} /></button>
    </div>
    <p className="muted">Todo o período · registros acessíveis à sua conta, conforme suas permissões. Não se limita ao mapa dos últimos 30 dias.</p>
    {carregando ? <SkeletonList linhas={2} label="Carregando acompanhamento" /> : <>
      {(!dados || !Object.keys(dados).length || parcial) && <p role="alert" className="form-message">Algumas contagens estão indisponíveis. Verifique a conexão e tente atualizar; indisponível não significa zero.</p>}
      <p className="muted" role="status">{atualizado && `Consulta realizada às ${atualizado.toLocaleTimeString('pt-BR', { timeZone: 'America/Recife' })} (Recife)`}</p>
      <Grafico titulo="Registros por módulo" linhas={totais} />
      <p className="muted">Um caso pode ter OS, documentos, vistorias e autos vinculados. Os módulos não devem ser somados como se fossem casos distintos.</p>
      {MODULOS_ATIVIDADE.filter(m => m.categorias.length > 0).map(m => <Grafico key={m.id}
        titulo={m.id === 'documentos' ? 'Documentos por tipo' : `${m.titulo} por situação`}
        linhas={m.categorias.map(c => ({ rotulo: m.id === 'documentos' ? ROTULOS_DOCUMENTOS[c] ?? c : c, valor: dados?.[`${m.id}:${c}`] ?? null }))} />)}
    </>}
  </section>;
}
function Grafico({ titulo, linhas }: { titulo: string; linhas: { rotulo: string; valor: number | null }[] }) {
  const maior = Math.max(0, ...linhas.map(l => l.valor ?? 0));
  const vazio = linhas.every(l => l.valor === 0);
  return <section className="activity-chart">
    <h3>{titulo}</h3>
    {vazio && <p className="muted">Nenhum registro neste grupo ainda.</p>}
    <ul>{linhas.map(l => <li key={l.rotulo}>
      <div className="activity-label"><span>{l.rotulo}</span><strong>{numero(l.valor)}</strong></div>
      <div className="activity-track" aria-hidden="true"><div style={{ width: `${larguraBarra(l.valor, maior)}%` }} /></div>
    </li>)}</ul>
    <p className="activity-caption">Barras proporcionais à maior contagem deste grupo.</p>
  </section>;
}

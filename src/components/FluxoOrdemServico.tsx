import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { AlertTriangle, Download, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { OCCURRENCE_COLUMNS } from '@/lib/columns';
import type { Fiscal, Occurrence } from '@/lib/types';
import { SignaturePad } from './SignaturePad';
import { OS_COLUMNS, baixarDossieOS, osBloqueada, salvarEtapaOS, type DocumentoOS, type EtapaOS, type OrdemComFluxo, type RevisaoOS } from '@/lib/fluxoOS';

const titulos: Record<EtapaOS | 'criacao' | 'migracao', string> = { criacao: 'Criação da OS', migracao: 'Registro anterior à atualização', editar: 'Editar OS / vincular denúncia', iniciar: 'Iniciar vistoria',
  notificacao: 'Notificação', auto: 'Auto de infração', embargo: 'Termo de embargo', concluir: 'Concluir OS' };
const dataHora = (valor: string) => new Date(valor).toLocaleString('pt-BR');

export function FluxoOrdemServico({ ordem, fiscal, onChange }: {
  ordem: OrdemComFluxo; fiscal: Fiscal | null; onChange: (ordem: OrdemComFluxo) => void;
}) {
  const [etapa, setEtapa] = useState<EtapaOS | null>(null);
  const [historico, setHistorico] = useState<RevisaoOS[]>([]);
  const [erroHistorico, setErroHistorico] = useState(false);
  const [mensagem, setMensagem] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [agora, setAgora] = useState(Date.now());
  useEffect(() => { const timer = window.setInterval(() => setAgora(Date.now()), 15000);
    return () => window.clearInterval(timer); }, []);
  const bloqueada = osBloqueada(ordem, agora);
  const podeEditar = !bloqueada && !!fiscal &&
    (ordem.fiscal_abertura === fiscal.id || ordem.fiscal_designado === fiscal.id);
  const carregarHistorico = useCallback(async () => {
    setErroHistorico(false);
    const { data, error } = await supabase.from('os_historico')
      .select('id, etapa, versao, criado_em, dados').eq('os_id', ordem.id).order('versao', { ascending: false });
    if (error) { setErroHistorico(true); return; }
    setHistorico((data ?? []) as RevisaoOS[]);
  }, [ordem.id]);
  useEffect(() => { void carregarHistorico(); }, [carregarHistorico, ordem.versao]);

  async function baixar(os: OrdemComFluxo) {
    if (!fiscal) return;
    setOcupado(true); setMensagem('Preparando e arquivando PDF...');
    try { await baixarDossieOS(os, fiscal); setMensagem('PDF arquivado em Documentos e download solicitado.'); }
    catch (error) { setMensagem(error instanceof Error ? error.message : 'Falha ao gerar PDF. Tente novamente.'); }
    finally { setOcupado(false); }
  }
  async function recarregar() {
    setOcupado(true);
    try {
      const { data, error } = await supabase.from('ordens_servico').select(OS_COLUMNS).eq('id', ordem.id).single();
      if (error) throw error;
      onChange(data as OrdemComFluxo); setMensagem('OS atualizada.');
    } catch { setMensagem('Não foi possível atualizar a OS. Tente novamente.'); }
    finally { setOcupado(false); }
  }
  return <section className="os-fluxo" aria-label="Tramitação da ordem de serviço">
    <h2>Andamento da OS</h2>
    <p className="muted">OS → Notificação → Auto de infração, se necessário → Embargo, se aplicável.</p>
    <ol className="os-etapas">
      <li>OS criada em {dataHora(ordem.emitida_em)}</li>
      <li>{ordem.fluxo.notificacao ? 'Notificação registrada' : 'Notificação ainda não registrada'}</li>
      <li>{ordem.fluxo.auto ? `Auto emitido para ${ordem.fluxo.auto.autuado_nome}` : 'Sem auto de infração (opcional)'}</li>
      <li>{ordem.fluxo.embargo ? 'Embargo registrado' : 'Sem embargo (quando aplicável)'}</li>
      <li>{ordem.concluida_em ? `Concluída em ${dataHora(ordem.concluida_em)}` : 'Em andamento'}</li>
    </ol>
    {ordem.status === 'Concluída' && <div className="info-message">
      {bloqueada ? 'Encerrada definitivamente. Consulta, histórico e download continuam disponíveis.' :
        `Correções permitidas até ${dataHora(ordem.edicao_ate!)}. Alterar não prorroga o prazo.`}
    </div>}
    {mensagem && <div className="info-message" role="status">{mensagem}</div>}
    <div className="os-acoes">
      <button className="outline-button" disabled={ocupado} onClick={() => void recarregar()}><RefreshCw size={16} /> Atualizar</button>
      <button className="outline-button" disabled={ocupado || !fiscal} onClick={() => void baixar(ordem)}><Download size={16} /> Baixar dossiê da OS</button>
      {podeEditar && !etapa && !ocupado && <>
        <button className="outline-button" onClick={() => setEtapa('editar')}>Editar OS / vincular denúncia</button>
        <button className="primary-button" onClick={() => setEtapa('notificacao')}>{ordem.fluxo.notificacao ? 'Corrigir notificação' : 'Registrar notificação'}</button>
        <button className="outline-button" disabled={!ordem.fluxo.notificacao || !ordem.ocorrencia_id}
          onClick={() => setEtapa('auto')}>{ordem.fluxo.auto ? 'Corrigir auto de infração' : 'Gerar auto de infração'}</button>
        {!ordem.ocorrencia_id && <p className="muted">Para emitir um auto, vincule uma denúncia registrada por você ou designada a você.</p>}
        <button className="outline-button" disabled={!ordem.fluxo.auto_id} onClick={() => setEtapa('embargo')}>
          {ordem.fluxo.embargo ? 'Corrigir embargo' : 'Registrar embargo (se aplicável)'}</button>
        <button className="primary-button" onClick={() => setEtapa('concluir')}>{ordem.concluida_em ? 'Corrigir conclusão' : 'Concluir OS — com ou sem auto'}</button>
      </>}
    </div>
    {etapa && fiscal && <FormularioEtapa key={`${ordem.id}-${etapa}-${ordem.versao}`} ordem={ordem} fiscal={fiscal}
      etapa={etapa} bloqueada={bloqueada} onCancel={() => setEtapa(null)}
      onSave={(salva) => { onChange(salva); setEtapa(null); setMensagem('Etapa salva no sistema e registrada no histórico.'); }} />}
    <h3>Documentos registrados</h3>
    {(['notificacao', 'auto', 'embargo', 'conclusao'] as const).map((chave) => {
      const doc = ordem.fluxo[chave];
      if (!doc) return null;
      return <article className="form-card compact" key={chave}>
        <b>{chave === 'conclusao' ? 'Conclusão' : titulos[chave]}</b>
        <p>{doc.nome ?? doc.autuado_nome ?? doc.fiscal_nome}</p>
        <p>{doc.texto ?? doc.motivo}</p>
        {doc.endereco && <p>Endereço: {doc.endereco}</p>}
        {doc.fundamento && <p>Fundamento: {doc.fundamento}</p>}
        {doc.artigo_legal && <p>Artigo: {doc.artigo_legal} · Multa: R$ {Number(doc.valor_multa).toFixed(2)}</p>}
        {doc.ciencia && <p>Ciência: {doc.ciencia}</p>}
        <span className="muted">Fiscal: {doc.fiscal_nome}</span>
      </article>;
    })}
    {(ordem.fluxo.autos_anteriores ?? []).map((auto, indice) => <article className="form-card compact" key={String(auto.id ?? indice)}>
      <b>Auto anterior vinculado à OS</b>
      <p>{auto.autuado_nome} · {auto.tipo_infracao}</p><p>{auto.motivo}</p>
      <span>Multa: R$ {Number(auto.valor_multa).toFixed(2)} · Ciência: {auto.ciencia}</span>
    </article>)}
    <h3>Histórico de revisões</h3>
    {erroHistorico ? <div className="form-message" role="alert">Não foi possível carregar o histórico.
      <button className="outline-button" onClick={() => void carregarHistorico()}>Tentar de novo</button></div> :
      historico.length === 0 ? <p className="muted">Nenhuma etapa registrada neste fluxo.</p> :
      <ul className="os-revisoes">{historico.map((revisao) => <li key={revisao.id}>
        <span>Revisão {revisao.versao} · {titulos[revisao.etapa]} · {dataHora(revisao.criado_em)}</span>
        <button className="outline-button" disabled={ocupado || !fiscal} onClick={() => void baixar(revisao.dados)}>Baixar esta revisão</button>
      </li>)}</ul>}
  </section>;
}

function FormularioEtapa({ ordem, fiscal, etapa, bloqueada, onCancel, onSave }: {
  ordem: OrdemComFluxo; fiscal: Fiscal; etapa: EtapaOS; bloqueada: boolean;
  onCancel: () => void; onSave: (ordem: OrdemComFluxo) => void;
}) {
  const original = etapa === 'editar' ? { requerente: ordem.requerente, descricao: ordem.descricao,
    endereco: ordem.endereco, ocorrencia_id: ordem.ocorrencia_id ?? '' } :
    (etapa === 'concluir' ? ordem.fluxo.conclusao : ordem.fluxo[etapa as 'notificacao' | 'auto' | 'embargo']);
  const [campos, setCampos] = useState<DocumentoOS>(() => ({ nome: String(ordem.fluxo.notificacao?.nome ?? ''),
    documento: String(ordem.fluxo.notificacao?.documento ?? ''), endereco: ordem.endereco,
    texto: '', fundamento: '', ciencia: 'Ausente',
    autuado_nome: String(ordem.fluxo.notificacao?.nome ?? ''), autuado_documento: String(ordem.fluxo.notificacao?.documento ?? ''),
    tipo_infracao: '', artigo_legal: '', valor_base: '0', valor_multa: '0', motivo: ordem.descricao,
    vencimento: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10), ...original,
    // Correção de um documento assinado exige nova assinatura; nunca reutilizar ciência silenciosamente.
    assinatura: null,
  }));
  const [denuncias, setDenuncias] = useState<Occurrence[]>([]);
  const [erroDenuncias, setErroDenuncias] = useState(false);
  const [assinatura, setAssinatura] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const salvandoRef = useRef(false);
  const carregarDenuncias = useCallback(async () => {
    setErroDenuncias(false);
    const { data, error } = await supabase.from('ocorrencias').select(OCCURRENCE_COLUMNS)
      .or(`fiscal_registrou.eq.${fiscal.id},fiscal_designado.eq.${fiscal.id}`).order('created_at', { ascending: false });
    if (error) { setErroDenuncias(true); return; }
    setDenuncias((data ?? []) as Occurrence[]);
  }, [fiscal.id]);
  useEffect(() => { if (etapa === 'editar') void carregarDenuncias(); }, [etapa, carregarDenuncias]);
  function campo(nome: string, titulo: string, tipo = 'text', obrigatorio = true) {
    return <label key={nome}>{titulo}{tipo === 'textarea' ?
      <textarea required={obrigatorio} maxLength={10000} value={String(campos[nome] ?? '')} onChange={(e) => setCampos({ ...campos, [nome]: e.target.value })} /> :
      <input required={obrigatorio} type={tipo} min={tipo === 'number' ? '0' : undefined} step={tipo === 'number' ? '0.01' : undefined}
        maxLength={500} value={String(campos[nome] ?? '')} onChange={(e) => setCampos({ ...campos, [nome]: e.target.value })} />}</label>;
  }
  async function salvar(e: FormEvent) {
    e.preventDefault(); if (salvandoRef.current || bloqueada) return;
    if (campos.ciencia === 'Assinou' && !assinatura && etapa !== 'editar' && etapa !== 'concluir') {
      setErro('Capture a assinatura ou escolha Recusou/Ausente.'); return;
    }
    salvandoRef.current = true;
    setOcupado(true); setErro('');
    try { onSave(await salvarEtapaOS(ordem, etapa, campos, fiscal, assinatura)); }
    catch (error) { setErro(error instanceof Error ? error.message : 'Não foi possível salvar.'); }
    finally { salvandoRef.current = false; setOcupado(false); }
  }
  return <form className="form-card os-etapa-form" onSubmit={(e) => void salvar(e)}>
    <h3>{titulos[etapa]}</h3>
    <p>Fiscal responsável pelo registro: <b>{fiscal.nome}</b></p>
    <fieldset disabled={ocupado || bloqueada}>
      {etapa === 'editar' ? <>
        {campo('requerente', 'Requerente')}{campo('descricao', 'Descrição', 'textarea')}{campo('endereco', 'Endereço')}
        <label>Denúncia vinculada (opcional para OS; obrigatória para auto)
          <select value={String(campos.ocorrencia_id ?? '')} onChange={(e) => setCampos({ ...campos, ocorrencia_id: e.target.value })}>
            <option value="">Sem denúncia vinculada</option>
            {ordem.ocorrencia_id && !denuncias.some((d) => d.id === ordem.ocorrencia_id) &&
              <option value={ordem.ocorrencia_id}>Denúncia vinculada atualmente</option>}
            {denuncias.map((d) => <option key={d.id} value={d.id}>{d.categoria} — {d.endereco}</option>)}
          </select>
        </label>
        {erroDenuncias && <div role="alert">Não foi possível carregar as denúncias.
          <button type="button" className="outline-button" onClick={() => void carregarDenuncias()}>Tentar de novo</button></div>}
      </> : etapa === 'auto' ? <>
        {campo('autuado_nome', 'Nome do autuado')}{campo('autuado_documento', 'CPF/CNPJ ou documento do autuado')}
        {campo('tipo_infracao', 'Tipo de infração')}{campo('artigo_legal', 'Artigo / fundamento legal')}
        {campo('motivo', 'Descrição da infração', 'textarea')}{campo('valor_base', 'Valor base (R$)', 'number')}
        {campo('valor_multa', 'Multa (R$)', 'number')}{campo('vencimento', 'Vencimento', 'date')}
        {campo('testemunha_nome', 'Testemunha (opcional)', 'text', false)}
        <p>Endereço: {ordem.endereco}</p>
      </> : etapa === 'concluir' ? <>
        <p>Auto e embargo não são obrigatórios. Explique o resultado e o motivo de não emitir, quando aplicável.</p>
        {campo('texto', 'Resultado / justificativa da conclusão', 'textarea')}
        <p>{ordem.concluida_em ? 'Esta correção não reinicia o prazo de 48 horas.' : 'Ao confirmar, começam as 48 horas para correções. Após o prazo, somente consulta e download.'}</p>
      </> : <>
        {etapa === 'notificacao' && <p>Registre a notificação realizada. Este botão não envia e-mail nem mensagem ao responsável.</p>}
        {etapa === 'embargo' && <p>Emita somente quando a medida for legalmente cabível. Um auto não determina embargo automático.</p>}
        {campo('nome', 'Nome da pessoa / responsável')}{campo('documento', 'Documento', 'text', false)}
        {campo('endereco', 'Endereço do documento')}{campo('texto', etapa === 'embargo' ? 'Descrição e alcance do embargo' : 'Conteúdo da notificação', 'textarea')}
        {campo('fundamento', 'Fundamento legal', 'textarea', etapa === 'embargo')}
      </>}
      {etapa !== 'editar' && <>
        {original?.ciencia === 'Assinou' && <p>Este documento estava assinado. Para corrigir, capture uma nova assinatura ou atualize a ciência conforme o ocorrido.</p>}
        {etapa !== 'concluir' && <label>Ciência do responsável
          <select value={String(campos.ciencia)} onChange={(e) => { setCampos({ ...campos, ciencia: e.target.value, assinatura: null }); setAssinatura(null); }}>
            <option>Ausente</option><option>Recusou</option><option>Assinou</option>
          </select></label>}
        {(etapa === 'concluir' || campos.ciencia === 'Assinou') && <>
          <p>{etapa === 'concluir' ? 'Assinatura do fiscal (opcional)' : 'Assinatura do responsável / autuado'}</p>
          <SignaturePad onChange={setAssinatura} />
        </>}
      </>}
    </fieldset>
    {bloqueada && <p role="alert">O prazo terminou. Não é mais possível salvar alterações.</p>}
    {erro && <div className="form-message" role="alert"><AlertTriangle size={16} />{erro}</div>}
    <div className="form-actions">
      <button type="button" className="ghost-button" disabled={ocupado} onClick={onCancel}>Cancelar</button>
      <button className="primary-button" disabled={ocupado || bloqueada}>{ocupado ? 'Salvando...' : etapa === 'concluir' ? 'Confirmar conclusão' : 'Salvar etapa'}</button>
    </div>
  </form>;
}

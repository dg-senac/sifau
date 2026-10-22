import { applyRepoSql } from '../harness.mjs';
import { IDS, seedScenario, createOccurrence } from '../fixtures.mjs';
export default {
  name: 'decisão explícita de auto na OS',
  async run(t) {
    const db = t.db; await seedScenario(db);
    const ocorrencia = await createOccurrence(db, IDS.active);
    const { rows } = await db.as(IDS.active, 'authenticated', () => db.query(`INSERT INTO public.ordens_servico
      (numero, origem, requerente, fiscal_abertura, ocorrencia_id, descricao, endereco, prazo_resposta)
      VALUES ('OS-DECISAO', 'Denúncia', 'Pessoa', $1, $2, 'Descrição da OS', 'Rua Um', now()+interval '2 days') RETURNING *`, [IDS.active, ocorrencia]));
    let os = rows[0];
    async function decidir(emitir, motivo = '', ator = IDS.active, versao = os.versao) {
      const { rows } = await db.as(ator, 'authenticated', () => db.query('SELECT * FROM public.decidir_auto_os($1, $2, $3, $4)', [os.id, versao, emitir, motivo]));
      return rows[0];
    }
    async function etapa(nome, dados) {
      const { rows } = await db.as(IDS.active, 'authenticated', () => db.query('SELECT * FROM public.salvar_etapa_os($1, $2, $3, $4)', [os.id, os.versao, nome, JSON.stringify(dados)]));
      return rows[0];
    }
    await t.test('nenhuma decisão é tomada automaticamente ao criar OS', async () => t.ok(!os.fluxo.decisao_auto));
    await t.test('negar emissão exige justificativa e escolha não pode ser nula', async () => {
      await t.denies(() => decidir(false)); await t.denies(() => decidir(false, 'curta')); await t.denies(() => decidir(null));
    });
    await t.test('fiscal alheio ou inativo não decide pela OS', async () => {
      await t.denies(() => decidir(false, 'Sem infração constatada.', IDS.other));
      await t.denies(() => decidir(false, 'Sem infração constatada.', IDS.pending));
    });
    await t.test('não emitir persiste no histórico sem concluir a OS ou criar auto', async () => {
      os = await decidir(false, 'Sem infração constatada no local.');
      t.eq(os.status, 'Aberta'); t.eq(os.concluida_em, null); t.eq(os.fluxo.decisao_auto.decisao, 'nao_emitir');
      t.eq(os.fluxo.decisao_auto.fiscal_nome, 'Fiscal Ativo');
      const resultado = await db.owner('SELECT count(*)::int AS n FROM public.autos_infracao WHERE os_id=$1', [os.id]); t.eq(resultado.rows[0].n, 0);
      const h = await db.owner("SELECT dados->'fluxo'->'decisao_auto'->>'decisao' AS escolha FROM public.os_historico WHERE os_id=$1 AND etapa='decisao_auto'", [os.id]);
      t.eq(h.rows[0].escolha, 'nao_emitir');
    });
    await t.test('uma decisão antiga não sobrescreve a mais recente', async () => { await t.denies(() => decidir(true, '', IDS.active, 0)); });
    os = await etapa('notificacao', { nome: 'Pessoa', texto: 'Notificação registrada', endereco: 'Rua Um', ciencia: 'Ausente' });
    const auto = { autuado_nome: 'Pessoa', autuado_documento: 'Documento', tipo_infracao: 'Tipo', artigo_legal: 'Artigo',
      valor_base: 10, valor_multa: 10, motivo: 'Descrição', ciencia: 'Ausente', vencimento: '2027-01-01' };
    await t.test('API não gera auto enquanto a decisão salva for não emitir', async () => { await t.denies(() => etapa('auto', auto)); });
    await t.test('fiscal pode rever a escolha; emitir sozinho ainda não cria multa', async () => {
      os = await decidir(true); t.eq(os.fluxo.decisao_auto.decisao, 'emitir');
      const a = await db.owner('SELECT count(*)::int AS n FROM public.autos_infracao WHERE os_id=$1', [os.id]); t.eq(a.rows[0].n, 0);
    });
    await t.test('após confirmar o formulário o auto existe e não pode ser apagado com não emitir', async () => {
      os = await etapa('auto', auto); t.ok(os.fluxo.auto_id); await t.denies(() => decidir(false, 'Tentativa de remover auto já emitido.'));
    });
    await t.test('decisão respeita o bloqueio definitivo das 48 horas', async () => {
      const nova = await db.owner(`INSERT INTO public.ordens_servico(numero,origem,requerente,fiscal_abertura,descricao,endereco,prazo_resposta)
        VALUES ('OS-DECISAO-EXPIRADA','Gestão','Pessoa',$1,'Descrição','Rua',now()) RETURNING *`, [IDS.active]);
      os = nova.rows[0]; os = await etapa('concluir', { texto: 'Orientação realizada sem auto.' });
      await db.owner('ALTER TABLE public.ordens_servico DISABLE TRIGGER os_encerrada_protecao');
      await db.owner("UPDATE public.ordens_servico SET edicao_ate=now()-interval '1 hour' WHERE id=$1", [os.id]);
      await db.owner('ALTER TABLE public.ordens_servico ENABLE TRIGGER os_encerrada_protecao');
      await t.denies(() => decidir(true)); await t.denies(() => decidir(false, 'Sem infração.', IDS.admin));
    });
    await t.test('arquivo completo do SQL Editor é executável e reaplicável sem apagar o histórico', async () => {
      const antes = await db.owner('SELECT count(*)::int AS n FROM public.os_historico');
      await applyRepoSql(db, 'entrega/SQL_EDITOR_OS_COMPLETO.txt');
      await applyRepoSql(db, 'entrega/SQL_EDITOR_OS_COMPLETO.txt');
      const depois = await db.owner('SELECT count(*)::int AS n FROM public.os_historico');
      t.eq(depois.rows[0].n, antes.rows[0].n);
      const funcao = await db.owner("SELECT pg_get_functiondef('public.proteger_auto_os()'::regprocedure) AS definicao");
      t.ok(funcao.rows[0].definicao.includes('nao_emitir'));
    });
  },
};

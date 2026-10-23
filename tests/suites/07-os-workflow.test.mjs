import { applyRepoSql } from '../harness.mjs';
import { IDS, seedScenario, createOccurrence, SAMPLE_STORAGE_PATH } from '../fixtures.mjs';

export default {
  name: 'tramitação e encerramento de ordens de serviço',
  async run(t) {
    const db = t.db;
    await seedScenario(db);
    const propria = await createOccurrence(db, IDS.active);
    const outra = await createOccurrence(db, IDS.other);
    const designada = await createOccurrence(db, IDS.other);
    await db.owner('UPDATE public.ocorrencias SET fiscal_designado = $1 WHERE id = $2', [IDS.active, designada]);
    let numero = 0;
    async function criar(ocorrencia = null) {
      return db.as(IDS.active, 'authenticated', async () => {
        const { rows } = await db.query(`INSERT INTO public.ordens_servico
          (numero, origem, requerente, fiscal_abertura, descricao, endereco, prazo_resposta, ocorrencia_id)
          VALUES ($1, 'Denúncia', 'Pessoa requerente', $2, 'Descrição da OS', 'Rua Um, 10', now() + interval '3 days', $3)
          RETURNING *`, [`OS-FLUXO-${++numero}`, IDS.active, ocorrencia]);
        return rows[0];
      });
    }
    async function salvar(os, etapa, dados = {}, usuario = IDS.active) {
      return db.as(usuario, 'authenticated', async () => {
        const { rows } = await db.query('SELECT * FROM public.salvar_etapa_os($1, $2, $3, $4::jsonb)',
          [os.id, os.versao, etapa, JSON.stringify(dados)]);
        return rows[0];
      });
    }
    const notificacao = { nome: 'Pessoa Notificada', documento: 'Documento teste', endereco: 'Rua Um, 10',
      texto: 'Notificação entregue ao responsável.', ciencia: 'Ausente' };
    const auto = { autuado_nome: 'Pessoa Autuada', autuado_documento: 'Documento teste',
      tipo_infracao: 'Obra irregular', artigo_legal: 'Artigo informado pelo fiscal',
      valor_base: 100, valor_multa: 100, motivo: 'Descrição da infração.', ciencia: 'Ausente', vencimento: '2027-01-01' };
    const embargo = { ...notificacao, texto: 'Paralisação da intervenção descrita.', fundamento: 'Fundamento legal informado pelo fiscal' };
    let os;
    await t.test('OS nasce sem auto e com emissão preservada no histórico', async () => {
      os = await criar();
      t.eq(os.fluxo.fiscal_abertura_nome, 'Fiscal Ativo');
      t.ok(!os.fluxo.auto_id);
      const { rows } = await db.owner('SELECT etapa, versao FROM public.os_historico WHERE os_id = $1', [os.id]);
      t.eq(rows, [{ etapa: 'criacao', versao: 0 }]);
    });
    await t.test('fiscal não vincula OS à denúncia de terceiro', async () => {
      await t.denies(() => criar(outra));
      await t.denies(() => salvar(os, 'editar', { descricao: 'Texto', endereco: 'Rua', requerente: 'Pessoa', ocorrencia_id: outra }));
    });
    await t.test('denúncia feita pelo fiscal pode ser vinculada à mesma OS', async () => {
      os = await salvar(os, 'editar', { descricao: 'Texto corrigido', endereco: 'Rua Um, 10', requerente: 'Pessoa', ocorrencia_id: propria });
      t.eq(os.ocorrencia_id, propria);
    });
    await t.test('outro fiscal, pendente e anônimo não alteram a OS', async () => {
      for (const usuario of [IDS.other, IDS.pending]) await t.denies(() => salvar(os, 'notificacao', notificacao, usuario));
      await db.as(null, 'anon', async () => {
        await t.denies(() => db.query("SELECT public.salvar_etapa_os($1, 1, 'concluir', '{}'::jsonb)", [os.id]));
      });
    });
    await t.test('etapas fora de ordem ou incompletas são rejeitadas', async () => {
      await t.denies(() => salvar(os, 'auto', auto));
      await t.denies(() => salvar(os, 'embargo', embargo));
      await t.denies(() => salvar(os, 'notificacao', { ...notificacao, nome: '' }));
      await t.denies(() => salvar(os, 'notificacao', { ...notificacao, ciencia: 'Assinou' }));
    });
    await t.test('notificação persiste com nome do fiscal fornecido pelo servidor', async () => {
      os = await salvar(os, 'notificacao', { ...notificacao, fiscal_nome: 'Nome falsificado' });
      t.eq(os.fluxo.notificacao.fiscal_nome, 'Fiscal Ativo');
      t.eq(os.fluxo.notificacao.nome, notificacao.nome);
    });
    await t.test('assinatura não vinculada à OS é rejeitada', async () => {
      await t.denies(() => salvar(os, 'notificacao', { ...notificacao, ciencia: 'Assinou', assinatura: SAMPLE_STORAGE_PATH }));
    });
    await t.test('gravação concorrente não sobrescreve uma revisão mais nova', async () => {
      await t.denies(() => salvar({ ...os, versao: os.versao - 1 }, 'notificacao', notificacao));
    });
    await t.test('auto é real e vinculado simultaneamente à OS e à denúncia', async () => {
      os = await salvar(os, 'auto', auto);
      const { rows } = await db.owner('SELECT os_id, ocorrencia_id, autuado_nome FROM public.autos_infracao WHERE id = $1', [os.fluxo.auto_id]);
      t.eq(rows[0], { os_id: os.id, ocorrencia_id: propria, autuado_nome: auto.autuado_nome });
      t.eq(os.fluxo.auto.fiscal_nome, 'Fiscal Ativo');
    });
    await t.test('corrigir auto atualiza a mesma linha e preserva a revisão anterior', async () => {
      const id = os.fluxo.auto_id;
      os = await salvar(os, 'auto', { ...auto, valor_multa: 150 });
      t.eq(os.fluxo.auto_id, id);
      const { rows } = await db.owner('SELECT count(*)::int AS n FROM public.autos_infracao WHERE os_id = $1', [os.id]);
      t.eq(rows[0].n, 1);
      const snapshot = await db.owner("SELECT dados->'fluxo'->'auto'->>'valor_multa' AS valor FROM public.os_historico WHERE os_id = $1 AND etapa = 'auto' ORDER BY versao LIMIT 1", [os.id]);
      t.eq(Number(snapshot.rows[0].valor), 100);
    });
    await t.test('auto impede trocar a denúncia e não aceita multa negativa', async () => {
      await t.denies(() => salvar(os, 'editar', { descricao: 'Texto', endereco: 'Rua', requerente: 'Pessoa', ocorrencia_id: designada }));
      await t.denies(() => salvar(os, 'auto', { ...auto, valor_multa: -1 }));
    });
    await t.test('embargo exige auto e fundamento legal, sem ser gerado automaticamente', async () => {
      t.ok(!os.fluxo.embargo);
      await t.denies(() => salvar(os, 'embargo', { ...embargo, fundamento: '' }));
      os = await salvar(os, 'embargo', embargo);
      t.eq(os.fluxo.embargo.fundamento, embargo.fundamento);
    });
    await t.test('conclusão define exatamente 48 horas a partir do servidor', async () => {
      await t.denies(() => salvar(os, 'concluir', {}));
      os = await salvar(os, 'concluir', { texto: 'Fiscalização concluída com auto e embargo.' });
      t.eq(os.status, 'Concluída');
      t.eq(Date.parse(os.edicao_ate) - Date.parse(os.concluida_em), 48 * 3600000);
    });
    await t.test('correções dentro do prazo não reiniciam a conclusão nem as 48 horas', async () => {
      const prazo = os.edicao_ate; const conclusao = os.concluida_em;
      os = await salvar(os, 'concluir', { texto: 'Conclusão corrigida.' });
      os = await salvar(os, 'notificacao', { ...notificacao, texto: 'Texto corrigido.' });
      t.eq(os.edicao_ate, prazo); t.eq(os.concluida_em, conclusao);
    });
    await t.test('OS sem denúncia pode concluir sem auto nem embargo', async () => {
      let simples = await criar();
      simples = await salvar(simples, 'concluir', { texto: 'Orientação realizada; auto e embargo não se aplicam.' });
      t.eq(simples.status, 'Concluída');
      t.ok(!simples.fluxo.auto_id && !simples.fluxo.embargo);
    });
    await t.test('designação legada não autoriza vincular denúncia de outra conta à OS', async () => {
      await t.denies(() => criar(designada));
    });
    await t.test('cliente não contorna o fluxo atualizando status ou inserindo auto diretamente', async () => {
      const aberta = await criar(propria);
      await db.as(IDS.active, 'authenticated', async () => {
        await t.denies(() => db.query("UPDATE public.ordens_servico SET status = 'Concluída' WHERE id = $1", [aberta.id]));
        await t.denies(() => db.query(`INSERT INTO public.autos_infracao(os_id, ocorrencia_id, tipo_infracao, artigo_legal,
          valor_base, valor_multa, motivo, autuado_nome, autuado_documento, ciencia, vencimento)
          VALUES ($1, $2, 'Tipo', 'Artigo', 1, 1, 'Motivo', 'Nome', 'Documento', 'Ausente', '2027-01-01')`, [aberta.id, propria]));
      });
    });
    await t.test('histórico não aceita alteração/exclusão e não é exposto a terceiros', async () => {
      await db.as(IDS.other, 'authenticated', async () => {
        const { rows } = await db.query('SELECT * FROM public.os_historico WHERE os_id = $1', [os.id]);
        t.eq(rows.length, 0);
      });
      await t.denies(() => db.owner('DELETE FROM public.os_historico WHERE os_id = $1', [os.id]));
      await t.denies(() => db.owner("UPDATE public.os_historico SET etapa = 'adulteracao' WHERE os_id = $1", [os.id]));
    });
    await t.test('após 48 horas nem responsável nem administrador podem alterar; consulta continua', async () => {
      // Viagem no tempo somente no fixture do teste; não há bypass no RPC.
      await db.owner('ALTER TABLE public.ordens_servico DISABLE TRIGGER os_encerrada_protecao');
      await db.owner("UPDATE public.ordens_servico SET concluida_em = now() - interval '3 days', edicao_ate = now() - interval '1 day' WHERE id = $1", [os.id]);
      await db.owner('ALTER TABLE public.ordens_servico ENABLE TRIGGER os_encerrada_protecao');
      await t.denies(() => salvar(os, 'notificacao', notificacao));
      await t.denies(() => salvar(os, 'auto', auto));
      await t.denies(() => salvar(os, 'embargo', embargo));
      await t.denies(() => salvar(os, 'concluir', { texto: 'Tentativa de reiniciar prazo' }, IDS.admin));
      await t.denies(() => db.owner('DELETE FROM public.ordens_servico WHERE id = $1', [os.id]));
      await t.denies(() => db.owner('DELETE FROM public.autos_infracao WHERE os_id = $1', [os.id]));
      await db.as(IDS.active, 'authenticated', async () => {
        const resultado = await db.query('SELECT * FROM public.os_historico WHERE os_id = $1', [os.id]);
        t.ok(resultado.rows.length > 0);
      });
    });
    await t.test('OS e dados pessoais não ficam visíveis ao fiscal não envolvido', async () => {
      await db.as(IDS.other, 'authenticated', async () => {
        const { rows } = await db.query('SELECT fluxo FROM public.ordens_servico WHERE id = $1', [os.id]);
        t.eq(rows.length, 0);
      });
    });
    await t.test('assinatura de etapa e PDF arquivado não podem ser apagados ou sobrescritos', async () => {
      let assinada = await criar();
      const assinatura = `${IDS.active}/2026/10/assinatura-os.png`;
      const pdf = `${IDS.active}/2026/10/dossie-os.pdf`;
      await db.as(IDS.active, 'authenticated', async () => {
        for (const path of [assinatura, pdf]) await db.query(
          "INSERT INTO storage.objects(bucket_id, name, owner) VALUES ('sifau-anexos', $1, $2)", [path, IDS.active]);
        await db.query(`INSERT INTO public.anexos(fiscal_id, ordem_servico_id, tipo, storage_path, arquivo_tipo)
          VALUES ($1, $2, 'assinatura', $3, 'image/png')`, [IDS.active, assinada.id, assinatura]);
      });
      assinada = await salvar(assinada, 'notificacao', { ...notificacao, ciencia: 'Assinou', assinatura });
      t.eq(assinada.fluxo.notificacao.assinatura, assinatura);
      await db.as(IDS.active, 'authenticated', async () => {
        await db.query(`INSERT INTO public.documentos(fiscal_id, ordem_servico_id, tipo_documento, arquivo_path, metadados)
          VALUES ($1, $2, 'relatorio', $3, '{"origem":"fluxo_os","os_versao":1}')`, [IDS.active, assinada.id, pdf]);
        await t.denies(() => db.query('DELETE FROM public.anexos WHERE storage_path = $1', [assinatura]));
        await t.denies(() => db.query('DELETE FROM public.documentos WHERE arquivo_path = $1', [pdf]));
        await t.denies(() => db.query("UPDATE public.documentos SET metadados = '{}' WHERE arquivo_path = $1", [pdf]));
        for (const path of [assinatura, pdf]) {
          const removidos = await db.query("DELETE FROM storage.objects WHERE name = $1 RETURNING id", [path]);
          t.eq(removidos.rows.length, 0);
          const alterados = await db.query("UPDATE storage.objects SET metadata = '{}' WHERE name = $1 RETURNING id", [path]);
          t.eq(alterados.rows.length, 0);
          const leitura = await db.query('SELECT name FROM storage.objects WHERE name = $1', [path]);
          t.eq(leitura.rows.length, 1);
        }
      });
    });
    await t.test('iniciar vistoria mantém a regra de 100m, com precisão, também no servidor', async () => {
      let perto = await criar();
      await db.owner('UPDATE public.ordens_servico SET latitude = -8.05, longitude = -34.9 WHERE id = $1', [perto.id]);
      await t.denies(() => salvar(perto, 'iniciar', {}));
      await t.denies(() => salvar(perto, 'iniciar', { latitude: -8.05, longitude: -34.9, precisao: -1 }));
      await t.denies(() => salvar(perto, 'iniciar', { latitude: -8.07, longitude: -34.9, precisao: 10 }));
      await t.denies(() => salvar(perto, 'iniciar', { latitude: -8.05, longitude: -34.9, precisao: 110 }));
      perto = await salvar(perto, 'iniciar', { latitude: -8.05, longitude: -34.9, precisao: 10 });
      t.eq(perto.status, 'Em vistoria');
    });
    await t.test('conclusões legadas sem prazo permanecem somente para consulta', async () => {
      const antiga = await criar();
      await db.owner("UPDATE public.ordens_servico SET status = 'Concluída' WHERE id = $1", [antiga.id]);
      await t.denies(() => salvar(antiga, 'editar', { descricao: 'Texto', endereco: 'Rua', requerente: 'Pessoa' }));
    });
    await t.test('atualização preserva autos e OS concluídas anteriores, inclusive ao reaplicar', async () => {
      const legada = await criar(propria);
      // Simula o estado anterior à migration (sem os novos gatilhos de fluxo).
      await db.owner('DROP TRIGGER os_encerrada_protecao ON public.ordens_servico');
      await db.owner('DROP TRIGGER auto_os_protecao ON public.autos_infracao');
      await db.owner('ALTER TABLE public.os_historico DISABLE TRIGGER os_historico_imutavel');
      await db.owner('DELETE FROM public.os_historico WHERE os_id = $1', [legada.id]);
      await db.owner('ALTER TABLE public.os_historico ENABLE TRIGGER os_historico_imutavel');
      for (const nome of ['Autuado anterior', 'Autuado mais recente']) {
        await db.owner(`INSERT INTO public.autos_infracao(os_id, ocorrencia_id, tipo_infracao, artigo_legal,
          valor_base, valor_multa, motivo, autuado_nome, autuado_documento, ciencia, vencimento, created_at)
          VALUES ($1, $2, 'Infração anterior', 'Artigo', 10, 10, 'Motivo', $3, 'Documento', 'Ausente', '2027-01-01',
            CASE WHEN $3 = 'Autuado anterior' THEN now() - interval '1 day' ELSE now() END)`, [legada.id, propria, nome]);
      }
      await db.owner("UPDATE public.ordens_servico SET status = 'Concluída' WHERE id = $1", [legada.id]);
      await applyRepoSql(db, 'supabase/migrations/20261021000000_os_workflow.sql');
      await applyRepoSql(db, 'supabase/migrations/20261021000000_os_workflow.sql');
      const { rows } = await db.owner('SELECT * FROM public.ordens_servico WHERE id = $1', [legada.id]);
      t.eq(rows[0].fluxo.auto.autuado_nome, 'Autuado mais recente');
      t.eq(rows[0].fluxo.autos_anteriores.length, 1);
      t.eq(rows[0].fluxo.autos_anteriores[0].autuado_nome, 'Autuado anterior');
      t.eq(rows[0].edicao_ate, null);
      const historias = await db.owner('SELECT etapa FROM public.os_historico WHERE os_id = $1', [legada.id]);
      t.eq(historias.rows, [{ etapa: 'migracao' }]);
      await t.denies(() => salvar(rows[0], 'concluir', { texto: 'Reabrir indevidamente' }));
    });
  },
};

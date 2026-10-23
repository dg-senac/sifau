// ============================================================================
// Suíte 1 — Controle de acesso e RLS
// ============================================================================
// Verifica as propriedades de segurança que o app assume: cadastro nasce
// pendente, usuário não aprovado não enxerga dado operacional, anônimo não
// acessa nada, e não existe porta lateral de autoaprovação.
// ============================================================================

import { IDS, seedScenario, createOccurrence, SAMPLE_STORAGE_PATH } from '../fixtures.mjs';

export default {
  name: 'acesso e RLS',

  async run(t) {
    const db = t.db;
    await seedScenario(db);

    // Cenário: uma ocorrência real registrada por um fiscal ativo, para que os
    // testes de leitura tenham dado concreto e não passem por vacuidade.
    const occurrenceId = await createOccurrence(db, IDS.active);

    await t.test('cadastro cria o perfil fiscal já inativo (pendente de aprovação)', async () => {
      const { rows } = await db.owner(`SELECT ativo FROM public.fiscais WHERE id = $1`, [IDS.pending]);
      t.eq(rows.length, 1, 'perfil fiscal criado pelo trigger');
      t.eq(rows[0].ativo, false, 'ativo');
    });

    await t.test('fiscal pendente não lê ocorrências', async () => {
      const visible = await db.as(IDS.pending, 'authenticated', async () =>
        Number((await db.query(`SELECT count(*) AS n FROM public.ocorrencias`)).rows[0].n));
      t.count(visible, 0, 'ocorrências visíveis ao pendente');
    });

    await t.test('fiscal pendente não lê os dados dos colegas', async () => {
      const visible = await db.as(IDS.pending, 'authenticated', async () =>
        Number((await db.query(`SELECT count(*) AS n FROM public.fiscais`)).rows[0].n));
      t.count(visible, 1, 'fiscais visíveis ao pendente (apenas o próprio)');
    });

    await t.test('fiscal pendente não lê a trilha de auditoria', async () => {
      // Defeito B1 (corrigido): a política legada `fiscal_select_auditoria`
      // usava `USING (true)` e, por ser permissiva, anulava a política
      // restritiva — a trilha ficava legível para qualquer conta autenticada.
      const visible = await db.as(IDS.pending, 'authenticated', async () =>
        Number((await db.query(`SELECT count(*) AS n FROM public.auditoria`)).rows[0].n));
      t.count(visible, 0, 'registros de auditoria visíveis ao pendente');
    });

    await t.test('fiscal pendente não insere registro na auditoria', async () => {
      await db.as(IDS.pending, 'authenticated', async () => {
        await t.denies(
          () => db.query(
            `INSERT INTO public.auditoria (ocorrencia_id, status_novo, fiscal_id)
             VALUES ($1, 'Resolvida', $2)`,
            [occurrenceId, IDS.pending],
          ),
          'inserção de auditoria por usuário pendente',
        );
      });
    });

    await t.test('fiscal pendente não consegue se autoaprovar', async () => {
      await db.as(IDS.pending, 'authenticated', async () => {
        await t.denies(
          () => db.query(`UPDATE public.fiscais SET ativo = true WHERE id = $1`, [IDS.pending]),
          'autoaprovação via UPDATE direto',
        );
      });
      const { rows } = await db.owner(`SELECT ativo FROM public.fiscais WHERE id = $1`, [IDS.pending]);
      t.eq(rows[0].ativo, false, 'perfil continua inativo após a tentativa');
    });

    await t.test('fiscal aprovado lê as ocorrências e o próprio perfil', async () => {
      await db.as(IDS.active, 'authenticated', async () => {
        const occurrences = await db.query(`SELECT count(*) AS n FROM public.ocorrencias`);
        t.count(Number(occurrences.rows[0].n), 1, 'ocorrências visíveis ao aprovado');

        const self = await db.query(`SELECT count(*) AS n FROM public.fiscais`);
        t.count(Number(self.rows[0].n), 1, 'fiscais visíveis ao aprovado (apenas o próprio)');
      });
    });

    await t.test('fiscal aprovado não altera o próprio nível de acesso', async () => {
      await db.as(IDS.active, 'authenticated', async () => {
        await t.denies(
          () => db.query(`UPDATE public.fiscais SET ativo = false, bairro = 'Outro' WHERE id = $1`, [IDS.active]),
          'alteração de coluna não concedida',
        );
        // A coluna concedida pelo app deve continuar funcionando.
        await db.query(`UPDATE public.fiscais SET bairro = $1 WHERE id = $2`, ['Pina', IDS.active]);
      });
    });

    await t.test('anônimo não lê ocorrências nem fiscais', async () => {
      await db.as(null, 'anon', async () => {
        await t.deniedOrEmpty(() => db.query(`SELECT count(*) AS n FROM public.ocorrencias`), 'leitura anônima de ocorrências');
        await t.deniedOrEmpty(() => db.query(`SELECT count(*) AS n FROM public.fiscais`), 'leitura anônima de fiscais');
        await t.deniedOrEmpty(() => db.query(`SELECT count(*) AS n FROM public.auditoria`), 'leitura anônima de auditoria');
      });
    });

    await t.test('anônimo não executa RPC administrativa', async () => {
      await db.as(null, 'anon', async () => {
        await t.denies(
          () => db.query(`SELECT public.set_fiscal_active($1, true)`, [IDS.pending]),
          'set_fiscal_active como anônimo',
        );
        await t.denies(
          () => db.query(`SELECT public.assign_occurrence($1, $2)`, [occurrenceId, IDS.active]),
          'assign_occurrence como anônimo',
        );
      });
    });

    await t.test('toda tabela em public tem RLS habilitada', async () => {
      const { rows } = await db.owner(`
        SELECT c.relname AS tabela
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity
        ORDER BY 1`);
      t.eq(rows.map((r) => r.tabela), [], 'tabelas sem RLS');
    });

    await t.test('nenhuma tabela expõe SELECT incondicional ao usuário autenticado', async () => {
      // Defeito B1 (corrigido), causa raiz: uma política `USING (true)` é
      // permissiva e se soma (OR) às demais, anulando qualquer restrição mais
      // específica na mesma tabela. Este teste impede a reintrodução.
      const { rows } = await db.owner(`
        SELECT tablename || '.' || policyname AS politica
        FROM pg_policies
        WHERE schemaname = 'public' AND cmd = 'SELECT' AND qual = 'true'
        ORDER BY 1`);
      t.eq(rows.map((r) => r.politica), [], 'políticas de SELECT incondicionais');
    });

    await t.test('nenhuma tabela expõe escrita incondicional', async () => {
      const { rows } = await db.owner(`
        SELECT tablename || '.' || policyname || ' [' || cmd || ']' AS politica
        FROM pg_policies
        WHERE schemaname = 'public'
          AND (qual = 'true' OR with_check = 'true')
        ORDER BY 1`);
      t.eq(rows.map((r) => r.politica), [], 'políticas incondicionais de escrita');
    });

    await t.test('fiscal só enxerga as próprias notificações', async () => {
      await db.owner("INSERT INTO public.notificacoes(fiscal_id,ocorrencia_id,titulo,mensagem) VALUES ($1,$2,'Teste','Aviso privado')", [IDS.active, occurrenceId]);

      const own = await db.as(IDS.active, 'authenticated', async () =>
        Number((await db.query(`SELECT count(*) AS n FROM public.notificacoes`)).rows[0].n));
      t.ok(own >= 1, 'fiscal ativo recebeu a própria notificação');

      const other = await db.as(IDS.other, 'authenticated', async () =>
        Number((await db.query(`SELECT count(*) AS n FROM public.notificacoes`)).rows[0].n));
      t.count(other, 0, 'notificações visíveis ao outro fiscal');
    });

    await t.test('fiscal não enxerga a localização dos colegas', async () => {
      await db.as(IDS.active, 'authenticated', async () => {
        await db.query(`SELECT public.record_fiscal_location(-8.12, -34.90, 10, 80)`);
      });
      await db.as(IDS.other, 'authenticated', async () => {
        await db.query(`SELECT public.record_fiscal_location(-8.05, -34.88, 12, 70)`);
      });

      await db.as(IDS.active, 'authenticated', async () => {
        const { rows } = await db.query(`SELECT fiscal_id FROM public.fiscal_location`);
        t.eq(rows.map((r) => r.fiscal_id), [IDS.active], 'localizações visíveis ao fiscal');
      });

      await db.as(IDS.admin, 'authenticated', async () => {
        const { rows } = await db.query(`SELECT count(*) AS n FROM public.fiscal_location`);
        t.ok(Number(rows[0].n) >= 2, 'administrador enxerga todas as localizações');
      });
    });

    await t.test('ocorrência com foto anexada continua restrita ao pendente', async () => {
      const comFoto = await createOccurrence(db, IDS.active, { fotos: [SAMPLE_STORAGE_PATH] });
      t.ok(comFoto, 'ocorrência com foto gravada');

      const anexadas = await db.owner(
        `SELECT cardinality(fotos) AS n FROM public.ocorrencias WHERE id = $1`, [comFoto]);
      t.count(anexadas.rows[0].n, 1, 'fotos gravadas na ocorrência');

      const visible = await db.as(IDS.pending, 'authenticated', async () =>
        Number((await db.query(`SELECT count(*) AS n FROM public.ocorrencias`)).rows[0].n));
      t.count(visible, 0, 'ocorrências visíveis ao pendente (incluindo a que tem foto)');
    });
  },
};

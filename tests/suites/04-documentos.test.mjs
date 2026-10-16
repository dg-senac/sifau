// ============================================================================
// Suíte 4 — Módulo de documentos
// ============================================================================
// A migration original deste módulo admite por escrito que expôs todos os
// arquivos e assinaturas a qualquer conta autenticada. Esta suíte existe para
// garantir que a correção se mantenha: arquivo só é visível ao dono (ou ao
// administrador), e não dá para anexar documento a registro de outra pessoa.
// ============================================================================

import { IDS, seedScenario, createOccurrence, SAMPLE_PHOTO } from '../fixtures.mjs';

export default {
  name: 'documentos',

  async run(t) {
    const db = t.db;
    await seedScenario(db);

    const ocorrencia = await createOccurrence(db, IDS.active);

    let docId;

    await t.test('fiscal registra um documento próprio', async () => {
      const { rows } = await db.as(IDS.active, 'authenticated', async () =>
        db.query(
          `INSERT INTO public.documentos
             (fiscal_id, ocorrencia_id, tipo_documento, titulo, arquivo_data, arquivo_nome, arquivo_tipo)
           VALUES ($1, $2, 'foto', 'Fachada do imóvel', $3, 'fachada.jpg', 'image/jpeg')
           RETURNING id`,
          [IDS.active, ocorrencia, SAMPLE_PHOTO],
        ));
      docId = rows[0]?.id;
      t.ok(docId, 'documento gravado');
    });

    await t.test('dono enxerga o próprio documento', async () => {
      const n = await db.as(IDS.active, 'authenticated', async () =>
        Number((await db.query(`SELECT count(*) AS n FROM public.documentos`)).rows[0].n));
      t.count(n, 1, 'documentos visíveis ao dono');
    });

    await t.test('outro fiscal NÃO enxerga o documento alheio', async () => {
      const n = await db.as(IDS.other, 'authenticated', async () =>
        Number((await db.query(`SELECT count(*) AS n FROM public.documentos`)).rows[0].n));
      t.count(n, 0, 'documentos visíveis ao outro fiscal');
    });

    await t.test('administrador enxerga os documentos para auditoria', async () => {
      const n = await db.as(IDS.admin, 'authenticated', async () =>
        Number((await db.query(`SELECT count(*) AS n FROM public.documentos`)).rows[0].n));
      t.ok(n >= 1, 'documentos visíveis ao administrador');
    });

    await t.test('fiscal não anexa documento em nome de outro', async () => {
      await db.as(IDS.other, 'authenticated', async () => {
        await t.denies(
          () => db.query(
            `INSERT INTO public.documentos (fiscal_id, tipo_documento, arquivo_data)
             VALUES ($1, 'foto', $2)`,
            [IDS.active, SAMPLE_PHOTO],
          ),
          'documento em nome de outro fiscal',
        );
      });
    });

    await t.test('fiscal não anexa documento a ocorrência que não é dele', async () => {
      // Ocorrência do fiscal "active", sem vínculo com o fiscal "other".
      await db.as(IDS.other, 'authenticated', async () => {
        await t.denies(
          () => db.query(
            `INSERT INTO public.documentos (fiscal_id, ocorrencia_id, tipo_documento, arquivo_data)
             VALUES ($1, $2, 'foto', $3)`,
            [IDS.other, ocorrencia, SAMPLE_PHOTO],
          ),
          'documento vinculado a ocorrência alheia',
        );
      });
    });

    await t.test('fiscal não altera o conteúdo de um documento já gravado', async () => {
      // O grant de UPDATE cobre apenas a coluna `ordem`: o arquivo é imutável.
      await db.as(IDS.active, 'authenticated', async () => {
        await t.denies(
          () => db.query(`UPDATE public.documentos SET arquivo_data = $1 WHERE id = $2`,
            ['data:image/jpeg;base64,ADULTERADO', docId]),
          'alteração do conteúdo do documento',
        );
      });
      const { rows } = await db.owner(`SELECT arquivo_data FROM public.documentos WHERE id = $1`, [docId]);
      t.eq(rows[0].arquivo_data, SAMPLE_PHOTO, 'conteúdo preservado');
    });

    await t.test('fiscal reordena o próprio documento', async () => {
      await db.as(IDS.active, 'authenticated', async () => {
        await db.query(`UPDATE public.documentos SET ordem = 5 WHERE id = $1`, [docId]);
      });
      const { rows } = await db.owner(`SELECT ordem FROM public.documentos WHERE id = $1`, [docId]);
      t.count(rows[0].ordem, 5, 'ordem atualizada');
    });

    await t.test('fiscal não exclui o documento alheio', async () => {
      await db.as(IDS.other, 'authenticated', async () => {
        const { rows } = await db.query(`DELETE FROM public.documentos WHERE id = $1 RETURNING id`, [docId]);
        t.count(rows.length, 0, 'linhas excluídas pelo outro fiscal');
      });
      const n = await db.owner(`SELECT count(*) AS n FROM public.documentos WHERE id = $1`, [docId]);
      t.count(Number(n.rows[0].n), 1, 'documento preservado');
    });

    await t.test('assinaturas digitais ficam restritas ao dono', async () => {
      await db.as(IDS.active, 'authenticated', async () => {
        await db.query(
          `INSERT INTO public.assinaturas_digitais (fiscal_id, documento_id, assinatura_data, certificado_valido)
           VALUES ($1, $2, $3, false)`,
          [IDS.active, docId, SAMPLE_PHOTO],
        );
      });
      const doDono = await db.as(IDS.active, 'authenticated', async () =>
        Number((await db.query(`SELECT count(*) AS n FROM public.assinaturas_digitais`)).rows[0].n));
      const doOutro = await db.as(IDS.other, 'authenticated', async () =>
        Number((await db.query(`SELECT count(*) AS n FROM public.assinaturas_digitais`)).rows[0].n));
      t.ok(doDono >= 1, 'assinatura visível ao dono');
      t.count(doOutro, 0, 'assinatura visível ao outro fiscal');
    });

    await t.test('anônimo não alcança as tabelas de documentos', async () => {
      await db.as(null, 'anon', async () => {
        await t.deniedOrEmpty(() => db.query(`SELECT count(*) AS n FROM public.documentos`), 'leitura anônima');
        await t.deniedOrEmpty(() => db.query(`SELECT count(*) AS n FROM public.assinaturas_digitais`), 'leitura anônima');
      });
    });

    await t.test('as tabelas de documentos têm RLS habilitada', async () => {
      const { rows } = await db.owner(`
        SELECT c.relname AS tabela
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity
          AND c.relname IN ('documentos', 'assinaturas_digitais')`);
      t.eq(rows.map((r) => r.tabela), [], 'tabelas sem RLS');
    });

    await t.test('documentos não expõem SELECT incondicional', async () => {
      const { rows } = await db.owner(`
        SELECT policyname FROM pg_policies
        WHERE schemaname = 'public' AND tablename IN ('documentos', 'assinaturas_digitais')
          AND cmd = 'SELECT' AND qual = 'true'`);
      t.eq(rows.map((r) => r.policyname), [], 'políticas incondicionais');
    });
  },
};

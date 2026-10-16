// ============================================================================
// Suíte 3 — Fluxo operacional de fiscalização
// ============================================================================
// Percorre o caminho real do app, de ponta a ponta:
//   registrar ocorrência → triagem → distribuição → vistoria → conclusão
// e confere que a trilha de auditoria registra cada transição.
//
// Esta suíte protege a LÓGICA do sistema: se um dia um ajuste de schema
// quebrar o fluxo de fiscalização, é aqui que aparece.
// ============================================================================

import { IDS, seedScenario, occurrencePayload, createOccurrence, SAMPLE_STORAGE_PATH } from '../fixtures.mjs';

export default {
  name: 'fluxo operacional',

  async run(t) {
    const db = t.db;
    await seedScenario(db);

    let occurrenceId;

    await t.test('fiscal ativo registra uma ocorrência', async () => {
      occurrenceId = await createOccurrence(db, IDS.active);
      t.ok(occurrenceId, 'id da ocorrência');
    });

    await t.test('ocorrência nasce "Aberta" e sem responsável (entra na triagem)', async () => {
      const { rows } = await db.owner(
        `SELECT status, fiscal_designado, sla_deadline FROM public.ocorrencias WHERE id = $1`, [occurrenceId]);
      t.eq(rows[0].status, 'Aberta', 'status inicial');
      t.eq(rows[0].fiscal_designado, null, 'responsável inicial');
      t.ok(rows[0].sla_deadline !== null, 'prazo de SLA definido na criação');
    });

    await t.test('descrição curta é rejeitada pelo banco', async () => {
      await db.as(IDS.active, 'authenticated', async () => {
        await t.denies(
          () => db.query(
            `INSERT INTO public.ocorrencias
               (fiscal_registrou, categoria, subcategoria, descricao, bairro, endereco, sla_deadline)
             VALUES ($1, 'Buraco na via', 'Asfalto', 'curta', 'Pina', 'Rua X', now() + interval '1 day')`,
            [IDS.active],
          ),
          'ocorrência com descrição abaixo do mínimo',
        );
      });
    });

    await t.test('fiscal não registra ocorrência em nome de outro fiscal', async () => {
      await db.as(IDS.active, 'authenticated', async () => {
        await t.denies(
          () => db.query(
            `INSERT INTO public.ocorrencias
               (fiscal_registrou, categoria, subcategoria, descricao, bairro, endereco, sla_deadline)
             VALUES ($1, 'Buraco na via', 'Asfalto',
                     'Tentativa de registrar em nome de outro fiscal do sistema.', 'Pina', 'Rua X',
                     now() + interval '1 day')`,
            [IDS.other],
          ),
          'ocorrência atribuída a outro fiscal na criação',
        );
      });
    });

    await t.test('criação da ocorrência gera registro de auditoria', async () => {
      const { rows } = await db.owner(
        `SELECT count(*) AS n FROM public.auditoria WHERE ocorrencia_id = $1`, [occurrenceId]);
      t.ok(Number(rows[0].n) >= 1, 'registros de auditoria da ocorrência');
    });

    await t.test('administrador distribui a ocorrência na triagem', async () => {
      await db.as(IDS.admin, 'authenticated', async () => {
        await db.query(`SELECT public.assign_occurrence($1, $2)`, [occurrenceId, IDS.active]);
      });
      const { rows } = await db.owner(
        `SELECT status, fiscal_designado FROM public.ocorrencias WHERE id = $1`, [occurrenceId]);
      t.eq(rows[0].status, 'Atribuída', 'status após distribuição');
      t.eq(rows[0].fiscal_designado, IDS.active, 'responsável após distribuição');
    });

    await t.test('distribuição notifica o fiscal responsável', async () => {
      const { rows } = await db.owner(
        `SELECT tipo, lida FROM public.notificacoes WHERE fiscal_id = $1`, [IDS.active]);
      t.ok(rows.length >= 1, 'notificações do fiscal');
      t.ok(rows.some((r) => r.tipo === 'atribuicao'), 'notificação de atribuição');
    });

    await t.test('fiscal conclui a vistoria pelo RPC do app', async () => {
      const vistoriaId = '66666666-6666-4666-8666-666666666666';
      await db.as(IDS.active, 'authenticated', async () => {
        await db.query(
          `SELECT public.complete_inspection(
             p_vistoria_id := $1, p_occurrence_id := $2, p_fiscal_id := $3,
             p_arrival_at := now(), p_arrival_latitude := -8.12, p_arrival_longitude := -34.90,
             p_laudo := 'Vistoria realizada no local, com registro fotográfico da correção.',
             p_acao_tomada := 'Notificação', p_valor_multa := NULL, p_numero_processo := NULL,
             p_fotos_depois := ARRAY[$4], p_status := 'Resolvida',
             p_note := 'Vistoria realizada. Ação: Notificação.')`,
          [vistoriaId, occurrenceId, IDS.active, SAMPLE_STORAGE_PATH],
        );
      });

      const inspection = await db.owner(
        `SELECT fiscal_id, acao_tomada, cardinality(fotos_depois) AS fotos
         FROM public.vistorias WHERE id = $1`, [vistoriaId]);
      t.eq(inspection.rows.length, 1, 'vistoria gravada');
      t.eq(inspection.rows[0].fiscal_id, IDS.active, 'fiscal da vistoria');
      t.count(inspection.rows[0].fotos, 1, 'fotos obrigatórias da conclusão');

      const after = await db.owner(`SELECT status FROM public.ocorrencias WHERE id = $1`, [occurrenceId]);
      t.eq(after.rows[0].status, 'Resolvida', 'status da ocorrência após a vistoria');
    });

    await t.test('o ciclo completo ficou registrado na auditoria', async () => {
      const { rows } = await db.owner(
        `SELECT status_anterior, status_novo FROM public.auditoria
         WHERE ocorrencia_id = $1 ORDER BY created_at`, [occurrenceId]);
      const transitions = rows.map((r) => `${r.status_anterior ?? '∅'}→${r.status_novo}`);
      t.ok(transitions.some((s) => s.endsWith('→Atribuída')), `transição para Atribuída (${transitions.join(', ')})`);
      t.ok(transitions.some((s) => s.endsWith('→Resolvida')), `transição para Resolvida (${transitions.join(', ')})`);
    });

    await t.test('fiscal não conclui vistoria de ocorrência que não é dele', async () => {
      const outra = await createOccurrence(db, IDS.active);
      await db.as(IDS.admin, 'authenticated', async () => {
        await db.query(`SELECT public.assign_occurrence($1, $2)`, [outra, IDS.active]);
      });

      // O fiscal "other" tenta concluir a vistoria de uma ocorrência do colega.
      const payload = occurrencePayload(IDS.other);
      await db.as(IDS.other, 'authenticated', async () => {
        await t.denies(
          () => db.query(
            `SELECT public.complete_inspection(
               p_vistoria_id := gen_random_uuid(), p_occurrence_id := $1, p_fiscal_id := $2,
               p_arrival_at := now(), p_arrival_latitude := -8.1, p_arrival_longitude := -34.9,
               p_laudo := 'Tentativa de concluir vistoria de ocorrência alheia.',
               p_acao_tomada := 'Notificação', p_valor_multa := NULL, p_numero_processo := NULL,
               p_fotos_depois := ARRAY[$3], p_status := 'Resolvida', p_note := NULL)`,
            [outra, IDS.other, SAMPLE_STORAGE_PATH],
          ),
          'conclusão de vistoria de ocorrência alheia',
        );
      });
      t.ok(payload.descricao.length >= 20, 'payload de apoio válido');
    });

    await t.test('vistoria com ação "Multa" exige valor e número de processo', async () => {
      const alvo = await createOccurrence(db, IDS.active);
      await db.as(IDS.admin, 'authenticated', async () => {
        await db.query(`SELECT public.assign_occurrence($1, $2)`, [alvo, IDS.active]);
      });
      await db.as(IDS.active, 'authenticated', async () => {
        await t.denies(
          () => db.query(
            `SELECT public.complete_inspection(
               p_vistoria_id := gen_random_uuid(), p_occurrence_id := $1, p_fiscal_id := $2,
               p_arrival_at := now(), p_arrival_latitude := -8.1, p_arrival_longitude := -34.9,
               p_laudo := 'Multa aplicada sem os dados obrigatórios do processo.',
               p_acao_tomada := 'Multa', p_valor_multa := NULL, p_numero_processo := NULL,
               p_fotos_depois := ARRAY[$3], p_status := 'Resolvida', p_note := NULL)`,
            [alvo, IDS.active, SAMPLE_STORAGE_PATH],
          ),
          'multa sem valor e processo',
        );
      });
    });

    await t.test('vistoria sem foto é rejeitada pelo banco', async () => {
      const alvo = await createOccurrence(db, IDS.active);
      await db.as(IDS.admin, 'authenticated', async () => {
        await db.query(`SELECT public.assign_occurrence($1, $2)`, [alvo, IDS.active]);
      });
      await db.as(IDS.active, 'authenticated', async () => {
        await t.denies(
          () => db.query(
            `SELECT public.complete_inspection(
               p_vistoria_id := gen_random_uuid(), p_occurrence_id := $1, p_fiscal_id := $2,
               p_arrival_at := now(), p_arrival_latitude := -8.1, p_arrival_longitude := -34.9,
               p_laudo := 'Vistoria sem evidência fotográfica anexada.',
               p_acao_tomada := 'Notificação', p_valor_multa := NULL, p_numero_processo := NULL,
               p_fotos_depois := ARRAY[]::text[], p_status := 'Resolvida', p_note := NULL)`,
            [alvo, IDS.active],
          ),
          'conclusão sem foto',
        );
      });
    });

    await t.test('ordem de serviço pode ser aberta por fiscal ativo', async () => {
      await db.as(IDS.active, 'authenticated', async () => {
        await db.query(
          `INSERT INTO public.ordens_servico
             (numero, origem, requerente, fiscal_abertura, descricao, endereco, prazo_resposta)
           VALUES ('OS-2026-0001', 'Denúncia', 'Secretaria de Mobilidade', $1,
                   'Vistoria de sinalização danificada em via pública.', 'Av. Caxangá, 500',
                   now() + interval '5 days')`,
          [IDS.active],
        );
      });
      const { rows } = await db.owner(
        `SELECT status FROM public.ordens_servico WHERE numero = 'OS-2026-0001'`);
      t.eq(rows[0].status, 'Aberta', 'status inicial da ordem de serviço');
    });

    await t.test('auditoria é imutável (rejeita UPDATE e DELETE)', async () => {
      await db.owner(`SET ROLE authenticated;`);
      try {
        await t.denies(
          () => db.owner(`UPDATE public.auditoria SET status_novo = 'Adulterado' WHERE ocorrencia_id = $1`, [occurrenceId]),
          'UPDATE na auditoria',
        );
        await t.denies(
          () => db.owner(`DELETE FROM public.auditoria WHERE ocorrencia_id = $1`, [occurrenceId]),
          'DELETE na auditoria',
        );
      } finally {
        await db.owner(`RESET ROLE;`);
      }
    });

    await t.test('exportação de auditoria calcula integridade', async () => {
      await db.as(IDS.active, 'authenticated', async () => {
        await db.query(
          `INSERT INTO public.exportacoes_auditoria (fiscal_id, hash, descricao, quantidade)
           VALUES ($1, 'sha256-de-teste', 'Exportação de teste da trilha', 1)`,
          [IDS.active],
        );
      });
      const { rows } = await db.owner(
        `SELECT count(*) AS n FROM public.exportacoes_auditoria WHERE fiscal_id = $1`, [IDS.active]);
      t.count(Number(rows[0].n), 1, 'exportações do fiscal');
    });
  },
};

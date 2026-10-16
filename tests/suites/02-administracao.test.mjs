// ============================================================================
// Suíte 2 — Administração
// ============================================================================
// Cobre o caminho de onboarding do administrador (o ponto mais frágil hoje,
// por causa do defeito B2) e o controle de quem pode aprovar quem.
// ============================================================================

import { IDS, EMAILS, seedScenario, createOccurrence } from '../fixtures.mjs';

export default {
  name: 'administração',

  async run(t) {
    const db = t.db;

    // Este cenário NÃO usa o contorno do B2, porque o próprio comportamento do
    // bootstrap é o objeto do teste.
    await seedScenario(db, { approve: [], activateAdmin: false });

    await t.test('bootstrap_admin registra o administrador', async () => {
      const { rows } = await db.owner(
        `SELECT email, nome FROM public.administradores WHERE id = $1`, [IDS.admin]);
      t.eq(rows.length, 1, 'registros administrativos');
      t.eq(rows[0].email, EMAILS.admin, 'e-mail do administrador');
    });

    await t.test('bootstrap_admin falha para e-mail inexistente', async () => {
      await t.denies(
        () => db.owner(`SELECT public.bootstrap_admin($1, $2)`, ['naoexiste@prefeitura.gov.br', 'X']),
        'bootstrap_admin com e-mail inexistente',
      );
    });

    await t.test('is_admin() é verdadeiro para o administrador', async () => {
      await db.as(IDS.admin, 'authenticated', async () => {
        const { rows } = await db.query(`SELECT public.is_admin() AS v`);
        t.eq(rows[0].v, true, 'is_admin()');
      });
    });

    await t.test('is_admin() é falso para um fiscal comum', async () => {
      await db.as(IDS.active, 'authenticated', async () => {
        const { rows } = await db.query(`SELECT public.is_admin() AS v`);
        t.eq(rows[0].v, false, 'is_admin()');
      });
    });

    await t.test('bootstrap_admin não é executável pelas roles de API', async () => {
      await db.as(IDS.admin, 'authenticated', async () => {
        await t.denies(
          () => db.query(`SELECT public.bootstrap_admin($1, $2)`, [EMAILS.admin, 'X']),
          'bootstrap_admin como usuário autenticado',
        );
      });
    });

    await t.test('bootstrap_admin ativa o perfil fiscal do administrador', async () => {
      // Defeito B2 (corrigido): sem a ativação, o administrador fica com
      // is_active_fiscal() = false, o que quebra toda operação que dependa
      // dessa função — inclusive a criação de ocorrências.
      const { rows } = await db.owner(`SELECT ativo FROM public.fiscais WHERE id = $1`, [IDS.admin]);
      t.eq(rows[0].ativo, true, 'perfil fiscal do administrador');
    });

    await t.test('administrador consegue registrar uma ocorrência', async () => {
      // Consequência direta do B2: a política occurrences_insert_self exige
      // is_active_fiscal(). Antes da correção, o banco recusava o insert do
      // administrador com "new row violates row-level security policy".
      await db.as(IDS.admin, 'authenticated', async () => {
        await db.query(
          `INSERT INTO public.ocorrencias
             (fiscal_registrou, categoria, subcategoria, descricao, urgencia, bairro, endereco, sla_deadline)
           VALUES ($1, 'Buraco na via', 'Asfalto',
                   'Registro feito pelo administrador para validar a política de insert.', 'Média',
                   'Centro', 'Rua do Administrador, 10', now() + interval '72 hours')`,
          [IDS.admin],
        );
      });
    });

    await t.test('administrador aprova um fiscal pelo RPC do painel', async () => {
      await db.as(IDS.admin, 'authenticated', async () => {
        await db.query(`SELECT public.set_fiscal_active($1, true)`, [IDS.pending]);
      });
      const { rows } = await db.owner(`SELECT ativo FROM public.fiscais WHERE id = $1`, [IDS.pending]);
      t.eq(rows[0].ativo, true, 'fiscal aprovado');
    });

    await t.test('aprovação registra a ação em admin_logs', async () => {
      const { rows } = await db.owner(
        `SELECT action, target_id FROM public.admin_logs WHERE target_id = $1`, [IDS.pending]);
      t.ok(rows.length >= 1, 'registro de auditoria administrativa');
      t.eq(rows[0].action, 'ACTIVATE_FISCAL', 'ação registrada');
    });

    await t.test('fiscal comum não aprova nem desaprova ninguém', async () => {
      // Aprova o fiscal "active" pelo caminho legítimo antes de testar.
      await db.as(IDS.admin, 'authenticated', async () => {
        await db.query(`SELECT public.set_fiscal_active($1, true)`, [IDS.active]);
      });

      await db.as(IDS.active, 'authenticated', async () => {
        await t.denies(
          () => db.query(`SELECT public.set_fiscal_active($1, true)`, [IDS.other]),
          'set_fiscal_active por fiscal comum',
        );
      });
      const { rows } = await db.owner(`SELECT ativo FROM public.fiscais WHERE id = $1`, [IDS.other]);
      t.eq(rows[0].ativo, false, 'alvo permanece inativo');
    });

    await t.test('administrador distribui uma ocorrência sem responsável', async () => {
      const occurrenceId = await createOccurrence(db, IDS.active);
      const before = await db.owner(`SELECT fiscal_designado FROM public.ocorrencias WHERE id = $1`, [occurrenceId]);
      t.eq(before.rows[0].fiscal_designado, null, 'responsável antes da distribuição');

      await db.as(IDS.admin, 'authenticated', async () => {
        await db.query(`SELECT public.assign_occurrence($1, $2)`, [occurrenceId, IDS.pending]);
      });

      const after = await db.owner(
        `SELECT fiscal_designado, status FROM public.ocorrencias WHERE id = $1`, [occurrenceId]);
      t.eq(after.rows[0].fiscal_designado, IDS.pending, 'responsável depois da distribuição');
      t.eq(after.rows[0].status, 'Atribuída', 'status depois da distribuição');
    });

    await t.test('administrador não distribui para fiscal inativo', async () => {
      const occurrenceId = await createOccurrence(db, IDS.active);
      await db.as(IDS.admin, 'authenticated', async () => {
        await t.denies(
          () => db.query(`SELECT public.assign_occurrence($1, $2)`, [occurrenceId, IDS.other]),
          'distribuição para fiscal inativo',
        );
      });
    });

    await t.test('administrador não redistribui ocorrência já atribuída sem usar a redistribuição', async () => {
      const occurrenceId = await createOccurrence(db, IDS.active);
      await db.as(IDS.admin, 'authenticated', async () => {
        await db.query(`SELECT public.assign_occurrence($1, $2)`, [occurrenceId, IDS.active]);
        await t.denies(
          () => db.query(`SELECT public.assign_occurrence($1, $2)`, [occurrenceId, IDS.pending]),
          'segunda distribuição pela rota normal',
        );
      });
    });

    // `redistribute_occurrence` NÃO é uma operação administrativa: o app a chama
    // em `Inspection.tsx` para o próprio fiscal repassar a ocorrência dele a um
    // colega. O contrato exige que quem chama seja o designado atual.
    await t.test('fiscal designado repassa a própria ocorrência a um colega', async () => {
      await db.as(IDS.admin, 'authenticated', async () => {
        await db.query(`SELECT public.set_fiscal_active($1, true)`, [IDS.other]);
      });

      const occurrenceId = await createOccurrence(db, IDS.active);
      await db.as(IDS.admin, 'authenticated', async () => {
        await db.query(`SELECT public.assign_occurrence($1, $2)`, [occurrenceId, IDS.active]);
      });

      await db.as(IDS.active, 'authenticated', async () => {
        await db.query(`SELECT public.redistribute_occurrence($1, $2)`, [occurrenceId, IDS.other]);
      });

      const { rows } = await db.owner(
        `SELECT fiscal_designado FROM public.ocorrencias WHERE id = $1`, [occurrenceId]);
      t.eq(rows[0].fiscal_designado, IDS.other, 'novo responsável após redistribuição');
    });

    await t.test('fiscal que não é o designado não redistribui a ocorrência alheia', async () => {
      const occurrenceId = await createOccurrence(db, IDS.active);
      await db.as(IDS.admin, 'authenticated', async () => {
        await db.query(`SELECT public.assign_occurrence($1, $2)`, [occurrenceId, IDS.active]);
      });

      await db.as(IDS.other, 'authenticated', async () => {
        await t.denies(
          () => db.query(`SELECT public.redistribute_occurrence($1, $2)`, [occurrenceId, IDS.other]),
          'redistribuição por quem não é o designado',
        );
      });

      const { rows } = await db.owner(
        `SELECT fiscal_designado FROM public.ocorrencias WHERE id = $1`, [occurrenceId]);
      t.eq(rows[0].fiscal_designado, IDS.active, 'responsável preservado');
    });

    await t.test('redistribuição não permite escolher a si mesmo', async () => {
      const occurrenceId = await createOccurrence(db, IDS.active);
      await db.as(IDS.admin, 'authenticated', async () => {
        await db.query(`SELECT public.assign_occurrence($1, $2)`, [occurrenceId, IDS.active]);
      });
      await db.as(IDS.active, 'authenticated', async () => {
        await t.denies(
          () => db.query(`SELECT public.redistribute_occurrence($1, $2)`, [occurrenceId, IDS.active]),
          'redistribuição para o próprio fiscal',
        );
      });
    });

    await t.test('administrador não redistribui por esta rota (é operação do fiscal)', async () => {
      // Registra o contrato atual para que uma mudança acidental apareça.
      // Se o painel algum dia precisar redistribuir, é preciso um RPC próprio.
      const occurrenceId = await createOccurrence(db, IDS.active);
      await db.as(IDS.admin, 'authenticated', async () => {
        await db.query(`SELECT public.assign_occurrence($1, $2)`, [occurrenceId, IDS.active]);
        await t.denies(
          () => db.query(`SELECT public.redistribute_occurrence($1, $2)`, [occurrenceId, IDS.pending]),
          'redistribuição pelo administrador',
        );
      });
    });

    await t.test('diretório de fiscais não expõe dados sensíveis', async () => {
      await db.as(IDS.active, 'authenticated', async () => {
        const { rows } = await db.query(`SELECT * FROM public.get_fiscal_directory()`);
        t.ok(rows.length >= 1, 'diretório retornou registros');
        const columns = Object.keys(rows[0]);
        t.ok(columns.includes('nome'), 'diretório inclui o nome');
        t.ok(!columns.includes('email'), 'diretório NÃO inclui e-mail');
        t.ok(!columns.includes('telefone'), 'diretório NÃO inclui telefone');
      });
    });
  },
};

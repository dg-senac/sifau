// ============================================================================
// SIFAU — Cenários compartilhados entre suítes
// ============================================================================
// Um cenário base reproduzível: um administrador, um fiscal pendente de
// aprovação e dois fiscais já aprovados. As suítes partem daqui para não
// repetirem a mesma montagem.
// ============================================================================

export const IDS = {
  admin: '11111111-1111-4111-8111-111111111111',
  pending: '22222222-2222-4222-8222-222222222222',
  active: '33333333-3333-4333-8333-333333333333',
  other: '44444444-4444-4444-8444-444444444444',
  banned: '55555555-5555-4555-8555-555555555555',
};

export const EMAILS = {
  admin: 'admin@prefeitura.gov.br',
  pending: 'pendente@prefeitura.gov.br',
  active: 'ativo@prefeitura.gov.br',
  other: 'outro@prefeitura.gov.br',
  banned: 'banido@prefeitura.gov.br',
};

/**
 * Monta o cenário base.
 *
 * @param {object} db        handle devolvido por createDatabase()
 * @param {object} [options]
 * @param {string[]} [options.approve]  ids de fiscais que devem ser aprovados
 * @param {boolean}  [options.activateAdmin=true]
 *        Ativa o fiscal do administrador como superusuário.
 *        IMPORTANTE: isto é um contorno do defeito B2 — `bootstrap_admin()`
 *        cria o administrador mas deixa o perfil fiscal inativo. Existe um
 *        teste dedicado a esse defeito em `02-administracao`. Aqui o contorno
 *        serve apenas para que as demais suítes partam de um admin funcional.
 */
export async function seedScenario(db, { approve = [IDS.active, IDS.other], activateAdmin = true } = {}) {
  await db.createAuthUser({
    id: IDS.admin,
    email: EMAILS.admin,
    meta: { nome: 'Administrador SIFAU', telefone: '8100000000', bairro: 'Centro' },
  });
  await db.owner(`SELECT public.bootstrap_admin($1, $2)`, [EMAILS.admin, 'Administrador SIFAU']);

  if (activateAdmin) {
    await db.owner(`UPDATE public.fiscais SET ativo = true WHERE id = $1`, [IDS.admin]);
  }

  await db.createAuthUser({
    id: IDS.pending,
    email: EMAILS.pending,
    meta: { nome: 'Fiscal Pendente', telefone: '8111111111', bairro: 'Boa Viagem' },
  });
  await db.createAuthUser({
    id: IDS.active,
    email: EMAILS.active,
    meta: { nome: 'Fiscal Ativo', telefone: '8122222222', bairro: 'Pina' },
  });
  await db.createAuthUser({
    id: IDS.other,
    email: EMAILS.other,
    meta: { nome: 'Fiscal Outro', telefone: '8133333333', bairro: 'Centro' },
  });

  // A aprovação é feita pelo administrador, passando pelo RPC — e não por
  // UPDATE direto — para exercitar o caminho real do painel.
  for (const fiscalId of approve) {
    await db.as(IDS.admin, 'authenticated', async () => {
      await db.query(`SELECT public.set_fiscal_active($1, true)`, [fiscalId]);
    });
  }

  return IDS;
}

/** Payload padrão de uma ocorrência válida (descrição ≥ 20 caracteres). */
export function occurrencePayload(fiscalId, overrides = {}) {
  return {
    fiscal_registrou: fiscalId,
    categoria: 'Buraco na via',
    subcategoria: 'Asfalto',
    descricao: 'Buraco de grande porte na pista, com risco para veículos e pedestres.',
    urgencia: 'Alta',
    bairro: 'Boa Viagem',
    endereco: 'Av. Boa Viagem, 1000',
    sla_deadline: new Date(Date.now() + 72 * 3600 * 1000).toISOString(),
    ...overrides,
  };
}

/** Uma foto válida e minúscula, no formato que o app grava (data URL base64). */
export const SAMPLE_PHOTO = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQ==';

/**
 * Insere uma ocorrência como o fiscal informado e devolve o id.
 *
 * Usa exatamente as colunas que o app realmente envia (`NewOccurrence.tsx`),
 * respeitando os grants por coluna do schema — inclusive `fotos`.
 */
export async function createOccurrence(db, fiscalId, { fotos = [], ...overrides } = {}) {
  const payload = occurrencePayload(fiscalId, overrides);
  return db.as(fiscalId, 'authenticated', async () => {
    const { rows } = await db.query(
      `INSERT INTO public.ocorrencias
         (fiscal_registrou, categoria, subcategoria, descricao, urgencia, bairro, endereco, fotos, sla_deadline)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id`,
      [
        payload.fiscal_registrou, payload.categoria, payload.subcategoria,
        payload.descricao, payload.urgencia, payload.bairro, payload.endereco,
        fotos, payload.sla_deadline,
      ],
    );
    return rows[0].id;
  });
}

/** Executa `fn` como administrador e devolve o valor. */
export async function asAdmin(db, fn) {
  return db.as(IDS.admin, 'authenticated', fn);
}

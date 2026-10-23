// ============================================================================
// SIFAU — Harness de teste do banco
// ============================================================================
// Sobe um PostgreSQL real (PGlite, PostgreSQL 16 compilado para WebAssembly),
// aplica o schema do SIFAU com o ambiente Supabase simulado e oferece um
// helper (`as`) para executar consultas como um usuário autenticado — o que
// faz o RLS valer de verdade, em vez de ser ignorado pelo superusuário.
//
// Uso:
//   const db = await createDatabase({ source: 'setup' });
//   await db.as(userId, 'authenticated', async () => db.query('...'));
// ============================================================================

import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TESTS_DIR = join(REPO_ROOT, 'tests');

/**
 * O PGlite não inclui as extensões `pgcrypto` / `uuid-ossp` (no Supabase elas
 * são nativas). Como o schema só as declara, substituímos a linha por um
 * `SELECT 1` neutro e registramos quais foram simuladas, para ficar explícito
 * que existe uma diferença entre este ambiente e o Supabase.
 */
function stubExtensions(sql) {
  const stubbed = new Set();
  const replaced = sql.replace(
    /CREATE\s+EXTENSION\s+IF\s+NOT\s+EXISTS\s+"?([\w-]+)"?(\s+WITH\s+SCHEMA\s+\w+)?\s*;/gi,
    (_match, name) => {
      stubbed.add(name);
      return `SELECT 1; -- [harness] extensão "${name}" simulada (indisponível no PGlite)`;
    },
  );
  return { sql: replaced, stubbed: [...stubbed] };
}

function readSql(relativePath) {
  return readFileSync(join(REPO_ROOT, relativePath), 'utf8');
}

/**
 * Aplica um arquivo .sql do repositório no banco informado, com os mesmos
 * `stubExtensions` usados na criação. Serve para reaplicar um script (ver
 * tests/apply-twice.mjs) sem duplicar a lógica de leitura e de stub.
 */
export async function applyRepoSql(handle, relativePath) {
  const { sql } = stubExtensions(readSql(relativePath));
  await handle.exec(sql);
}

/**
 * Cria um banco limpo com o schema do SIFAU aplicado.
 *
 * @param {{ source?: 'setup' | 'migrations' }} options
 *   - 'setup'      → aplica supabase/SETUP_COMPLETO.sql (projeto novo)
 *   - 'migrations' → aplica supabase/migrations/*.sql em ordem (projeto existente)
 */
export async function createDatabase({ source = 'setup', lastMigration } = {}) {
  const db = new PGlite();
  const stubbed = new Set();

  await db.exec(readSql('tests/supabase-sim.sql'));

  const files = [];
  if (source === 'setup') {
    files.push('supabase/SETUP_COMPLETO.sql');
  } else {
    const dir = join(REPO_ROOT, 'supabase/migrations');
    for (const name of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
      // Apenas testes de upgrade usam um ponto de partida anterior.
      if (!lastMigration || name <= lastMigration) files.push(`supabase/migrations/${name}`);
    }
  }

  for (const file of files) {
    const { sql, stubbed: names } = stubExtensions(readSql(file));
    names.forEach((n) => stubbed.add(n));
    try {
      await db.exec(sql);
    } catch (error) {
      // Repassa o arquivo com a falha para o runner exibir no relatório.
      error.message = `[${file}] ${error.message}`;
      throw error;
    }
  }

  /**
   * Executa `fn` como se fosse uma requisição autenticada daquela role.
   * Define o claim do JWT (auth.uid) e troca a role — é a troca de role que
   * faz o PostgreSQL aplicar as políticas de RLS.
   */
  async function as(userId, role, fn) {
    const claims = [
      `SELECT set_config('request.jwt.claim.sub', '${userId ?? ''}', false);`,
      `SELECT set_config('request.jwt.claim.role', '${role}', false);`,
    ];
    await db.exec(claims.join('\n'));
    await db.exec(`SET ROLE ${role};`);
    try {
      return await fn();
    } finally {
      await db.exec('RESET ROLE;');
    }
  }

  return {
    db,
    stubbedExtensions: [...stubbed],
    files,
    as,
    query: (text, params) => db.query(text, params),
    exec: (text) => db.exec(text),

    /** Executa como administrador do banco (ignora RLS) — para montar cenários. */
    owner: (text, params) => db.query(text, params),

    /** Insere um usuário no `auth.users` simulando o cadastro. */
    async createAuthUser({ id, email, meta = {} }) {
      await db.query(
        `INSERT INTO auth.users (id, email, raw_user_meta_data)
         VALUES ($1, $2, $3::jsonb)`,
        [id, email, JSON.stringify(meta)],
      );
    },

    /** Executa `fn` sem role especial (superusuário) — ignora RLS. */
    async withoutRls(fn) {
      return fn();
    },

    async close() {
      await db.close();
    },
  };
}

/** Motivo curto e legível para uma falha de permissão do PostgreSQL. */
export function describePgError(error) {
  const code = error?.code ?? '?';
  const messages = {
    42501: 'permissão negada (RLS ou GRANT)',
    23514: 'violação de CHECK',
    23505: 'violação de unicidade',
    23503: 'violação de chave estrangeira',
    22023: 'parâmetro inválido',
    P0002: 'registro não encontrado',
  };
  return `${code}: ${messages[code] ?? error.message}`;
}

export { TESTS_DIR };

// ============================================================================
// SIFAU — Retrato do schema, para comparar dois bancos entre si
// ============================================================================
// Usado por dois testes que fazem perguntas diferentes sobre o mesmo assunto:
//
//   tests/compare-install-paths.mjs → instalar por SETUP_COMPLETO.sql e por
//       migrations produz o MESMO schema? (dois bancos, dois caminhos)
//
//   tests/apply-twice.mjs → rodar o mesmo script duas vezes deixa o schema
//       IGUAL? (um banco, duas execuções)
//
// As duas perguntas só têm valor se a comparação for funda. Comparar nome de
// objeto não bastou no passado: "a política existe nos dois lados" não é o
// mesmo que "a política faz a mesma coisa nos dois lados" — foi exatamente aí
// que os defeitos B1 e B2 se esconderam.
// ============================================================================

/** Consultas que compõem o retrato. Cada uma devolve uma lista de strings. */
export const CONSULTAS = {
  tabelas: `SELECT table_name AS v FROM information_schema.tables
            WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY 1`,

  // Corpo da função, não só o nome: uma correção aplicada em um caminho e
  // esquecida no outro passa despercebida se só o nome for comparado.
  funcoes: `SELECT p.proname || '(' ||
                   pg_catalog.pg_get_function_identity_arguments(p.oid) || ')' ||
                   ' secdef=' || p.prosecdef ||
                   ' body=' || p.prosrc AS v
            FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' ORDER BY 1`,

  // Expressão da política, não só o nome.
  politicas: `SELECT tablename || ':' || policyname || ' [' || cmd || ']' ||
                    ' using=' || COALESCE(qual, '-') ||
                    ' check=' || COALESCE(with_check, '-') AS v
              FROM pg_policies WHERE schemaname = 'public' ORDER BY 1`,

  colunas: `SELECT table_name || '.' || column_name || ' ' || data_type ||
                   ' null=' || is_nullable ||
                   ' default=' || COALESCE(column_default, '-') AS v
            FROM information_schema.columns
            WHERE table_schema = 'public' ORDER BY 1`,

  // Restrições (CHECK, UNIQUE, PK, FK) carregam regra de negócio.
  restricoes: `SELECT c.relname || ':' || con.conname || ' ' ||
                      pg_catalog.pg_get_constraintdef(con.oid) AS v
               FROM pg_constraint con
               JOIN pg_class c ON c.oid = con.conrelid
               JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE n.nspname = 'public' ORDER BY 1`,

  // Privilégios por coluna, não só por tabela.
  privilegios: `SELECT grantee || ' ' || table_name || ' ' || privilege_type ||
                       ' ' || COALESCE(column_name, '(tabela)') AS v
                FROM information_schema.column_privileges
                WHERE table_schema = 'public'
                  AND grantee IN ('authenticated', 'anon')
                ORDER BY 1`,

  // Gatilhos: a automação que ninguém lembra que existe até ela sumir.
  gatilhos: `SELECT c.relname || ':' || t.tgname || ' ' ||
                    pg_catalog.pg_get_triggerdef(t.oid) AS v
             FROM pg_trigger t
             JOIN pg_class c ON c.oid = t.tgrelid
             JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'public' AND NOT t.tgisinternal ORDER BY 1`,
};

/**
 * Normaliza o corpo de uma função antes de comparar. Os dois caminhos de
 * instalação devem ter a MESMA lógica; o texto dos comentários pode diferir
 * (o SETUP_COMPLETO.sql é comentado para quem lê o SQL Editor, a migration é
 * comentada para quem lê o histórico). O que não pode diferir é o código.
 */
export function normalizarCorpo(corpo) {
  return corpo
    .replace(/--[^\n]*/g, ' ') // comentários de linha
    .replace(/\s+/g, ' ')      // espaços, quebras de linha e indentação
    .trim()
    .toLowerCase();
}

/** Roda todas as consultas no banco informado e devolve o retrato. */
export async function snapshotDb(handle) {
  const retrato = {};
  for (const [nome, sql] of Object.entries(CONSULTAS)) {
    retrato[nome] = (await handle.query(sql)).rows.map((r) =>
      nome === 'funcoes' ? normalizarCorpo(r.v) : r.v,
    );
  }
  return retrato;
}

/**
 * Compara dois retratos dimensão por dimensão.
 *
 * @returns {{chave: string, igual: boolean, soA: string[], soB: string[], total: number}[]}
 */
export function comparar(a, b) {
  return Object.keys(a).map((chave) => {
    const listaA = a[chave];
    const listaB = b[chave];
    const soA = listaA.filter((v) => !listaB.includes(v));
    const soB = listaB.filter((v) => !listaA.includes(v));
    return { chave, igual: soA.length === 0 && soB.length === 0, soA, soB, total: listaA.length };
  });
}

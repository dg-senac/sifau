-- ============================================================================
-- Corrige duas falhas de acesso apuradas por teste
-- ============================================================================
-- Esta migration é segura de aplicar em banco em uso: ela apenas restringe
-- acesso e corrige uma função. Não remove dados e não altera registros
-- operacionais.
--
-- Aplicar depois de 20261012100000_harden_documents.sql.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Trilha de auditoria legível por qualquer conta autenticada
-- ----------------------------------------------------------------------------
-- A migration 20260925025016 criou, para `auditoria`:
--
--   CREATE POLICY "fiscal_select_auditoria" ON public.auditoria
--     FOR SELECT TO authenticated USING (true);
--
-- A migration 20261012090000 apaga uma lista branca de políticas permissivas
-- antigas, mas essa lista não inclui `fiscal_select_auditoria` nem
-- `fiscal_insert_auditoria`. Como políticas permissivas são combinadas com OR,
-- a política `USING (true)` anulava a `audit_select_approved` criada depois.
--
-- Efeito: qualquer conta autenticada — inclusive um fiscal recém-cadastrado e
-- nunca aprovado, com `is_active_fiscal() = false` — lia a trilha de auditoria
-- inteira: quem mudou o quê, quando e onde.
--
-- A política de INSERT também é desnecessária: a trilha é escrita somente pelo
-- trigger `audit_occurrence_change`, que é SECURITY DEFINER e roda como o dono
-- da tabela, sem passar pelo RLS. O aplicativo nunca insere em `auditoria`
-- diretamente (só lê, em Audit.tsx, AdminScreen.tsx e OccurrenceDetail.tsx).
--
-- Após esta migration, o acesso à trilha fica definido exclusivamente por
-- `audit_select_approved`: fiscal ativo ou administrador.
DROP POLICY IF EXISTS "fiscal_select_auditoria" ON public.auditoria;
DROP POLICY IF EXISTS "fiscal_insert_auditoria" ON public.auditoria;

-- Varredura defensiva: remove qualquer outra política permissiva que tenha
-- sobrado nas tabelas operacionais, pelo mesmo motivo acima. Uma política
-- `USING (true)` anula, na prática, as políticas restritivas da mesma tabela.
DO $$
DECLARE
  policy_row record;
BEGIN
  FOR policy_row IN
    SELECT tablename, policyname
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'public'
      AND (qual = 'true' OR with_check = 'true')
  LOOP
    EXECUTE pg_catalog.format(
      'DROP POLICY IF EXISTS %I ON public.%I',
      policy_row.policyname, policy_row.tablename
    );
    RAISE NOTICE 'Política permissiva removida: %.%',
      policy_row.tablename, policy_row.policyname;
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 2. Administrador criado sem perfil fiscal ativo
-- ----------------------------------------------------------------------------
-- `handle_new_fiscal` cria todo perfil como inativo, porque fiscais comuns
-- precisam de aprovação. `bootstrap_admin` gravava a linha em `administradores`
-- mas nunca ativava o fiscal correspondente, então o administrador ficava com
-- `is_active_fiscal() = false`.
--
-- Consequência medida em teste: a política `occurrences_insert_self` exige
-- `is_active_fiscal()`, então o administrador recebia
-- "new row violates row-level security policy for table ocorrencias" ao tentar
-- registrar uma ocorrência. O painel funcionava por acaso, porque as ações
-- administrativas passam por RPCs SECURITY DEFINER.
--
-- A ativação não abre privilégio novo: o perfil já existe e a conta já está em
-- `administradores`. Ela apenas torna as duas verificações coerentes.
CREATE OR REPLACE FUNCTION public.bootstrap_admin(p_email text, p_nome text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  admin_user_id uuid;
  admin_email text := pg_catalog.lower(pg_catalog.btrim(p_email));
  admin_name text := COALESCE(NULLIF(pg_catalog.btrim(p_nome), ''), 'Administrador SIFAU');
BEGIN
  IF admin_email IS NULL OR admin_email = '' THEN
    RAISE EXCEPTION 'Informe o e-mail do usuário já criado no Supabase Auth' USING ERRCODE = '22023';
  END IF;

  SELECT u.id INTO admin_user_id
  FROM auth.users AS u
  WHERE pg_catalog.lower(u.email) = admin_email
  LIMIT 1;
  IF admin_user_id IS NULL THEN
    RAISE EXCEPTION 'Não existe usuário no Supabase Auth com esse e-mail' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.administradores (id, email, nome)
  VALUES (admin_user_id, admin_email, admin_name)
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, nome = EXCLUDED.nome;

  -- Mantém o perfil fiscal coerente com o papel administrativo.
  UPDATE public.fiscais SET ativo = true WHERE id = admin_user_id;

  RETURN admin_user_id;
END;
$$;
REVOKE ALL ON FUNCTION public.bootstrap_admin(text, text) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. Reparo para bancos que já executaram o bootstrap antes desta correção
-- ----------------------------------------------------------------------------
-- Administradores já promovidos continuam com o perfil inativo, a menos que
-- alguém os ative manualmente. Esta instrução corrige os existentes.
UPDATE public.fiscais AS f
SET ativo = true
WHERE f.ativo = false
  AND EXISTS (SELECT 1 FROM public.administradores AS a WHERE a.id = f.id);

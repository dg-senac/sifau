-- ============================================================================
-- SIFAU — Ambiente Supabase simulado para testes locais de SQL
-- ============================================================================
-- Este arquivo NÃO é executado no Supabase. Ele existe apenas para permitir
-- rodar o schema do SIFAU em um PostgreSQL comum (via PGlite), reproduzindo o
-- mínimo que o Supabase fornece de fábrica:
--
--   * schema `auth` com `auth.users`, `auth.uid()`, `auth.role()` e `auth.jwt()`
--   * schema `storage` (usado por políticas de arquivo, quando existirem)
--   * as roles `anon`, `authenticated`, `service_role` e `supabase_auth_admin`
--
-- Sem isso, o schema do SIFAU não pode ser aplicado fora do Supabase, porque
-- ele referencia `auth.users` e `auth.uid()` em chaves estrangeiras, triggers
-- e políticas de RLS.
--
-- As colunas de `auth.users` abaixo são o subconjunto realmente usado pelo
-- SIFAU (id, email, raw_user_meta_data, banned_until, email_confirmed_at).
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS storage;
CREATE SCHEMA IF NOT EXISTS extensions;

CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE ROLE supabase_auth_admin NOLOGIN;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE,
  encrypted_password text,
  raw_user_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz,
  last_sign_in_at timestamptz,
  email_confirmed_at timestamptz,
  banned_until timestamptz,
  aud text DEFAULT 'authenticated',
  role text DEFAULT 'authenticated'
);

-- Equivalente ao `auth.uid()` do Supabase: lê o `sub` do JWT da requisição.
-- Nos testes, definimos esse valor com SET request.jwt.claim.sub = '<uuid>'.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION auth.role() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), 'anon')
$$;

CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;

-- O Supabase concede acesso aos schemas por padrão para essas roles.
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Tabelas do Storage
-- ----------------------------------------------------------------------------
-- No Supabase elas existem antes de qualquer migration e são gerenciadas pelo
-- serviço de Storage. Aqui a gente reproduz o suficiente para poder TESTAR as
-- políticas de bucket: sem isso, a única forma de validar o acesso aos
-- arquivos seria em produção, com foto real de fiscal.
CREATE TABLE IF NOT EXISTS storage.buckets (
  id text PRIMARY KEY,
  name text NOT NULL,
  public boolean NOT NULL DEFAULT false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text REFERENCES storage.buckets(id),
  name text,
  owner uuid,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Mesma função do Supabase: as pastas do caminho, sem o nome do arquivo.
-- `storage.foldername('a/b/foto.jpg')` → `{a,b}`.
CREATE OR REPLACE FUNCTION storage.foldername(name text) RETURNS text[]
LANGUAGE sql IMMUTABLE AS $$
  SELECT (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;

GRANT SELECT ON storage.buckets TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO anon, authenticated;

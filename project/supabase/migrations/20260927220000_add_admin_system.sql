-- ============================================================================
-- Sistema de Administração SIFAU
-- ============================================================================

-- Tabela de administradores
CREATE TABLE IF NOT EXISTS public.administradores (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL UNIQUE,
  nome text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Tabela de tracking de localização dos fiscais
CREATE TABLE IF NOT EXISTS public.fiscal_location (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_id uuid NOT NULL REFERENCES public.fiscais(id) ON DELETE CASCADE,
  latitude numeric(10,7) NOT NULL,
  longitude numeric(10,7) NOT NULL,
  accuracy numeric(10,2),
  battery_level integer,
  is_online boolean NOT NULL DEFAULT true,
  last_seen timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Tabela de usuários banidos
CREATE TABLE IF NOT EXISTS public.banned_users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  fiscal_id uuid REFERENCES public.fiscais(id) ON DELETE CASCADE,
  banned_by uuid REFERENCES public.administradores(id),
  reason text,
  ban_type text NOT NULL DEFAULT 'permanent' CHECK (ban_type IN ('temporary', 'permanent')),
  banned_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  data_wiped_at timestamptz
);

-- Tabela de mensagens admin-fiscal
CREATE TABLE IF NOT EXISTS public.admin_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid REFERENCES public.administradores(id) ON DELETE CASCADE,
  fiscal_id uuid REFERENCES public.fiscais(id) ON DELETE CASCADE,
  sender_type text NOT NULL CHECK (sender_type IN ('admin', 'fiscal')),
  message text NOT NULL,
  attachments text[] NOT NULL DEFAULT '{}',
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Tabela de logs de atividades do admin
CREATE TABLE IF NOT EXISTS public.admin_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid REFERENCES public.administradores(id) ON DELETE CASCADE,
  action text NOT NULL,
  target_type text NOT NULL, -- 'fiscal', 'ocorrencia', 'sistema'
  target_id uuid,
  details jsonb,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS fiscal_location_fiscal_idx ON public.fiscal_location(fiscal_id);
CREATE INDEX IF NOT EXISTS fiscal_location_last_seen_idx ON public.fiscal_location(last_seen DESC);
CREATE INDEX IF NOT EXISTS admin_messages_fiscal_idx ON public.admin_messages(fiscal_id);
CREATE INDEX IF NOT EXISTS admin_messages_admin_idx ON public.admin_messages(admin_id);
CREATE INDEX IF NOT EXISTS admin_logs_admin_idx ON public.admin_logs(admin_id);
CREATE INDEX IF NOT EXISTS admin_logs_created_idx ON public.admin_logs(created_at DESC);

-- RLS
ALTER TABLE public.administradores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_location ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.banned_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_logs ENABLE ROW LEVEL SECURITY;

-- Políticas para administradores
DROP POLICY IF EXISTS "Admin vê todos os admins" ON public.administradores;
DROP POLICY IF EXISTS "Admin insere admins" ON public.administradores;

CREATE POLICY "Admin vê todos os admins"
  ON public.administradores FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admin insere admins"
  ON public.administradores FOR INSERT TO authenticated
  WITH CHECK (true);

-- Políticas para localização
DROP POLICY IF EXISTS "Admin vê todas as localizações" ON public.fiscal_location;
DROP POLICY IF EXISTS "Fiscal vê apenas sua localização" ON public.fiscal_location;
DROP POLICY IF EXISTS "Fiscal insere sua localização" ON public.fiscal_location;
DROP POLICY IF EXISTS "Fiscal atualiza sua localização" ON public.fiscal_location;

CREATE POLICY "Admin vê todas as localizações"
  ON public.fiscal_location FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Fiscal vê apenas sua localização"
  ON public.fiscal_location FOR SELECT TO authenticated
  USING (fiscal_id = auth.uid());

CREATE POLICY "Fiscal insere sua localização"
  ON public.fiscal_location FOR INSERT TO authenticated
  WITH CHECK (fiscal_id = auth.uid());

CREATE POLICY "Fiscal atualiza sua localização"
  ON public.fiscal_location FOR UPDATE TO authenticated
  USING (fiscal_id = auth.uid())
  WITH CHECK (fiscal_id = auth.uid());

-- Políticas para usuários banidos
DROP POLICY IF EXISTS "Admin vê todos os banidos" ON public.banned_users;
DROP POLICY IF EXISTS "Admin gerencia banimentos" ON public.banned_users;

CREATE POLICY "Admin vê todos os banidos"
  ON public.banned_users FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admin gerencia banimentos"
  ON public.banned_users FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- Políticas para mensagens
DROP POLICY IF EXISTS "Admin vê todas as mensagens" ON public.admin_messages;
DROP POLICY IF EXISTS "Fiscal vê suas mensagens" ON public.admin_messages;
DROP POLICY IF EXISTS "Admin envia mensagens" ON public.admin_messages;
DROP POLICY IF EXISTS "Fiscal envia mensagens" ON public.admin_messages;
DROP POLICY IF EXISTS "Fiscal marca como lida" ON public.admin_messages;

CREATE POLICY "Admin vê todas as mensagens"
  ON public.admin_messages FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Fiscal vê suas mensagens"
  ON public.admin_messages FOR SELECT TO authenticated
  USING (fiscal_id = auth.uid());

CREATE POLICY "Admin envia mensagens"
  ON public.admin_messages FOR INSERT TO authenticated
  WITH CHECK (sender_type = 'admin' AND admin_id = auth.uid());

CREATE POLICY "Fiscal envia mensagens"
  ON public.admin_messages FOR INSERT TO authenticated
  WITH CHECK (sender_type = 'fiscal' AND fiscal_id = auth.uid());

CREATE POLICY "Fiscal marca como lida"
  ON public.admin_messages FOR UPDATE TO authenticated
  USING (fiscal_id = auth.uid())
  WITH CHECK (fiscal_id = auth.uid());

-- Políticas para logs
DROP POLICY IF EXISTS "Admin vê todos os logs" ON public.admin_logs;
DROP POLICY IF EXISTS "Admin insere logs" ON public.admin_logs;

CREATE POLICY "Admin vê todos os logs"
  ON public.admin_logs FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admin insere logs"
  ON public.admin_logs FOR INSERT TO authenticated
  WITH CHECK (true);

-- Função para verificar se é admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.administradores 
    WHERE id = auth.uid()
  );
$$;

-- Dar permissão de execução para usuários autenticados
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon;

-- Função para verificar se usuário está banido
CREATE OR REPLACE FUNCTION public.is_user_banned()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.banned_users 
    WHERE id = auth.uid()
    AND (ban_type = 'permanent' OR expires_at > now())
  );
$$;

-- Dar permissão de execução para usuários autenticados
GRANT EXECUTE ON FUNCTION public.is_user_banned() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_user_banned() TO anon;

-- Função para fazer wipe de dados do usuário
CREATE OR REPLACE FUNCTION public.wipe_user_data(user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Deletar vistorias do fiscal
  DELETE FROM public.vistorias WHERE fiscal_id = user_id;
  
  -- Deletar ou reatribuir ocorrências
  UPDATE public.ocorrencias 
  SET fiscal_registrou = NULL, fiscal_designado = NULL
  WHERE fiscal_registrou = user_id OR fiscal_designado = user_id;
  
  -- Deletar ordens de serviço
  DELETE FROM public.ordens_servico 
  WHERE fiscal_abertura = user_id OR fiscal_designado = user_id;
  
  -- Deletar notificações
  DELETE FROM public.notificacoes WHERE fiscal_id = user_id;
  
  -- Deletar localizações
  DELETE FROM public.fiscal_location WHERE fiscal_id = user_id;
  
  -- Deletar perfil fiscal
  DELETE FROM public.fiscais WHERE id = user_id;
  
  -- Deletar push tokens
  DELETE FROM public.push_tokens WHERE fiscal_id = user_id;
  
  -- Deletar mensagens
  DELETE FROM public.admin_messages WHERE fiscal_id = user_id;
  
  -- Marcar como wiped
  UPDATE public.banned_users 
  SET data_wiped_at = now()
  WHERE id = user_id;
END;
$$;

-- Dar permissão de execução para usuários autenticados
GRANT EXECUTE ON FUNCTION public.wipe_user_data(uuid) TO authenticated;

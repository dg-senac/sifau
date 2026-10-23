-- ============================================================================
-- SIFAU — Configuração completa do Supabase
-- Execute uma única vez em um projeto Supabase NOVO, no SQL Editor.
-- Para um banco já existente, aplique as migrations pela Supabase CLI em ordem.
-- Requer os serviços padrão Supabase Auth e as roles anon/authenticated.
-- ============================================================================
-- Este arquivo é CURADO, não uma cópia literal do histórico de migrations.
--
-- Ele representa o ESTADO FINAL desejado do schema. Cada bloco traz a migration
-- de origem no cabeçalho, mas dois ajustes são aplicados aqui e não no arquivo
-- histórico, porque migrations já aplicadas não devem ser editadas:
--
--   1. Políticas permissivas (`USING (true)`) não são criadas. Elas existiam
--      nas migrations antigas e uma delas sobrevivia ao hardening, deixando a
--      trilha de auditoria legível para qualquer conta autenticada.
--   2. `bootstrap_admin` ativa o perfil fiscal do administrador. Sem isso, o
--      administrador ficava com `is_active_fiscal() = false` e não conseguia
--      operar.
--
-- Para bancos já existentes, os mesmos ajustes são aplicados pela migration
-- `20261013000000_fix_permissive_policies_and_admin_bootstrap.sql`.
--
-- O script `npm run test:sql:parity` confere que os dois caminhos de instalação
-- (este arquivo e as migrations em ordem) produzem o mesmo schema final. Se os
-- dois divergirem, a verificação falha.
-- ============================================================================
-- Após executar este arquivo:
-- 1. Crie o primeiro usuário em Authentication > Users (ou pela tela de cadastro).
-- 2. No SQL Editor, promova esse usuário como administrador:
--      SELECT public.bootstrap_admin('admin@prefeitura.gov.br', 'Administrador SIFAU');
--    Use o e-mail real da conta já criada. A função não pode ser chamada pelas APIs.
-- 3. Encerre e inicie a sessão do usuário para carregar as permissões de admin.
-- Novos cadastros de fiscais ficam inativos até aprovação de um administrador.
-- ============================================================================

-- Instalação: aplicativo principal SIFAU + módulo de documentos


-- ============================================================================
-- Origem: 20260925025016_create_sifau_core.sql
-- ============================================================================
/*
# SIFAU core municipal inspection data

1. New Tables
- `fiscais`: authenticated fiscal profiles, contact data, operational region, specialty and active state.
- `ocorrencias`: municipal reports, classification, location, SLA deadline, assignment and lifecycle status.
- `vistorias`: inspection arrival evidence, report, action and after-photo reference.
- `ordens_servico`: service orders, origin, execution assignment, location, deadlines and status.
- `autos_infracao`: fines and notification/payment information.
- `reincidencias`: prior-fine recurrence details and multiplier.
- `auditoria`: append-only status transition chain of custody.
- `sla_config`: configurable category response hours.
- `exportacoes_auditoria`: integrity records for exported audit data.

2. Security
- Every table enables RLS.
- All authenticated fiscal users can view and operate shared municipal records.
- Anonymous users have no access.
- Audit rows allow insert and select only; update and delete are intentionally absent.
- The `auditoria` table has a trigger that rejects updates and deletes.

3. Integrity
- All foreign keys reference auth users or existing operational records.
- Occurrence SLA deadline is stored explicitly for stable audit history.
- OS number is unique.
*/

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.fiscais (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome text NOT NULL,
  email text NOT NULL,
  telefone text NOT NULL,
  bairro text NOT NULL,
  especialidade text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sla_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria text NOT NULL UNIQUE,
  prazo_horas integer NOT NULL DEFAULT 72 CHECK (prazo_horas BETWEEN 1 AND 720),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ocorrencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_registrou uuid NOT NULL REFERENCES public.fiscais(id),
  fiscal_designado uuid REFERENCES public.fiscais(id),
  categoria text NOT NULL,
  subcategoria text NOT NULL,
  descricao text NOT NULL CHECK (char_length(descricao) >= 20),
  status text NOT NULL DEFAULT 'Aberta' CHECK (status IN ('Aberta','Triada','Atribuída','Em vistoria','Resolvida','Arquivada','Escalonada')),
  urgencia text NOT NULL DEFAULT 'Média' CHECK (urgencia IN ('Baixa','Média','Alta','Crítica')),
  latitude numeric(10,7),
  longitude numeric(10,7),
  bairro text NOT NULL,
  endereco text NOT NULL,
  fotos text[] NOT NULL DEFAULT '{}',
  sla_deadline timestamptz NOT NULL,
  duplicata_de uuid REFERENCES public.ocorrencias(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.vistorias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ocorrencia_id uuid NOT NULL REFERENCES public.ocorrencias(id) ON DELETE CASCADE,
  fiscal_id uuid NOT NULL REFERENCES public.fiscais(id),
  chegada_at timestamptz NOT NULL,
  chegada_latitude numeric(10,7) NOT NULL,
  chegada_longitude numeric(10,7) NOT NULL,
  laudo text NOT NULL,
  acao_tomada text NOT NULL CHECK (acao_tomada IN ('Notificação','Multa','Encaminhamento','Orientação','Sem ação')),
  valor_multa numeric(12,2),
  numero_processo text,
  fotos_depois text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ordens_servico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero text NOT NULL UNIQUE,
  origem text NOT NULL CHECK (origem IN ('Preventiva','Denúncia','Ofício','Comunicação Interna','Gestão')),
  ocorrencia_id uuid REFERENCES public.ocorrencias(id),
  requerente text NOT NULL,
  fiscal_abertura uuid NOT NULL REFERENCES public.fiscais(id),
  fiscal_designado uuid REFERENCES public.fiscais(id),
  apoio_operacional boolean NOT NULL DEFAULT false,
  orgao_apoio text,
  descricao text NOT NULL,
  legislacao text[] NOT NULL DEFAULT '{}',
  endereco text NOT NULL,
  latitude numeric(10,7),
  longitude numeric(10,7),
  emitida_em timestamptz NOT NULL DEFAULT now(),
  prazo_resposta timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'Aberta' CHECK (status IN ('Aberta','Em vistoria','Concluída','Cancelada'))
);

CREATE TABLE IF NOT EXISTS public.autos_infracao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  os_id uuid REFERENCES public.ordens_servico(id),
  ocorrencia_id uuid REFERENCES public.ocorrencias(id),
  tipo_infracao text NOT NULL,
  artigo_legal text NOT NULL,
  valor_base numeric(12,2) NOT NULL CHECK (valor_base >= 0),
  valor_multa numeric(12,2) NOT NULL CHECK (valor_multa >= 0),
  motivo text NOT NULL,
  autuado_nome text NOT NULL,
  autuado_documento text NOT NULL,
  ciencia text NOT NULL CHECK (ciencia IN ('Assinou','Recusou','Ausente')),
  testemunha_nome text,
  pagamento text NOT NULL DEFAULT 'Pendente' CHECK (pagamento IN ('Pendente','Pago','Cancelado')),
  vencimento date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.reincidencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auto_id uuid NOT NULL REFERENCES public.autos_infracao(id) ON DELETE CASCADE,
  documento_responsavel text NOT NULL,
  ocorrencia_original_id uuid REFERENCES public.ocorrencias(id),
  nivel integer NOT NULL CHECK (nivel >= 1),
  fator numeric(5,2) NOT NULL DEFAULT 1.5 CHECK (fator >= 1)
);

CREATE TABLE IF NOT EXISTS public.auditoria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ocorrencia_id uuid NOT NULL REFERENCES public.ocorrencias(id) ON DELETE CASCADE,
  status_anterior text,
  status_novo text NOT NULL,
  fiscal_id uuid NOT NULL REFERENCES public.fiscais(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  latitude numeric(10,7),
  longitude numeric(10,7),
  observacao text
);

CREATE TABLE IF NOT EXISTS public.exportacoes_auditoria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_id uuid NOT NULL REFERENCES public.fiscais(id),
  hash text NOT NULL,
  descricao text NOT NULL,
  quantidade integer NOT NULL CHECK (quantidade >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.block_auditoria_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'A trilha de auditoria e imutavel';
END;
$$;
DROP TRIGGER IF EXISTS auditoria_immutable ON public.auditoria;
CREATE TRIGGER auditoria_immutable BEFORE UPDATE OR DELETE ON public.auditoria FOR EACH ROW EXECUTE FUNCTION public.block_auditoria_mutation();

ALTER TABLE public.fiscais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sla_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ocorrencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vistorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ordens_servico ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.autos_infracao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reincidencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auditoria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exportacoes_auditoria ENABLE ROW LEVEL SECURITY;

-- As políticas permissivas desta etapa foram REMOVIDAS na consolidação.
--
-- A versão anterior deste arquivo criava, aqui, políticas
-- `FOR SELECT ... USING (true)` (e equivalentes de INSERT/UPDATE/DELETE) para
-- as tabelas operacionais e para `auditoria`. A migration de hardening apagava
-- uma lista branca dessas políticas — mas a lista não incluía
-- `fiscal_select_auditoria` nem `fiscal_insert_auditoria`.
--
-- Como políticas permissivas são combinadas com OR, a política `USING (true)`
-- anulava a política restritiva criada depois, e a trilha de auditoria ficava
-- legível por qualquer conta autenticada — inclusive um fiscal recém-cadastrado
-- e nunca aprovado. Ver a suíte `tests/suites/01-acesso.test.mjs`.
--
-- Uma instalação nova não deve criar a política para depois apagá-la: o acesso
-- é definido apenas pelas políticas restritivas declaradas no bloco final.
-- Manter aqui qualquer `USING (true)` reintroduz o defeito.
--
-- As políticas de INSERT em `auditoria` também não são necessárias: a trilha é
-- escrita somente pelo trigger `audit_occurrence_change`, que é SECURITY DEFINER
-- e roda como o dono da tabela, sem passar pelo RLS. O aplicativo nunca insere
-- em `auditoria` diretamente.

CREATE INDEX IF NOT EXISTS ocorrencias_status_idx ON public.ocorrencias(status);
CREATE INDEX IF NOT EXISTS ocorrencias_bairro_idx ON public.ocorrencias(bairro);
CREATE INDEX IF NOT EXISTS ocorrencias_sla_idx ON public.ocorrencias(sla_deadline);
CREATE INDEX IF NOT EXISTS auditoria_created_idx ON public.auditoria(created_at DESC);

INSERT INTO public.sla_config (categoria, prazo_horas) VALUES
('Buraco na via',72),('Iluminação pública',72),('Poluição sonora',24),('Entulho / lixo irregular',48),('Poda de árvore / risco de queda',24),('Vazamento de água / esgoto',24),('Ocupação irregular de calçada',72),('Sinalização de trânsito danificada',48),('Comércio/obra sem licença',120)
ON CONFLICT (categoria) DO NOTHING;

-- ============================================================================
-- Origem: 20260925120000_add_notifications.sql
-- ============================================================================
/*
# SIFAU notifications

1. New Tables
- `notificacoes`: per-fiscal notification inbox (assignment, SLA warning, status change), read/unread state.

2. Security
- RLS enabled; a fiscal can only select/update their own notifications.
- Inserts happen only via triggers (SECURITY DEFINER functions), not directly by clients.

3. Automation
- Trigger on `ocorrencias`: notifies the newly assigned fiscal when `fiscal_designado` changes.
- Trigger on `auditoria`: notifies the fiscal who opened the occurrence whenever its status changes.
*/

CREATE TABLE IF NOT EXISTS public.notificacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_id uuid NOT NULL REFERENCES public.fiscais(id) ON DELETE CASCADE,
  ocorrencia_id uuid REFERENCES public.ocorrencias(id) ON DELETE CASCADE,
  tipo text NOT NULL DEFAULT 'info' CHECK (tipo IN ('atribuicao', 'sla', 'status', 'info')),
  titulo text NOT NULL,
  mensagem text NOT NULL,
  lida boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notificacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Fiscal vê suas notificações"
  ON public.notificacoes FOR SELECT TO authenticated
  USING (fiscal_id = auth.uid());

CREATE POLICY "Fiscal marca como lida"
  ON public.notificacoes FOR UPDATE TO authenticated
  USING (fiscal_id = auth.uid())
  WITH CHECK (fiscal_id = auth.uid());

CREATE OR REPLACE FUNCTION public.notify_on_assignment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.fiscal_designado IS NOT NULL
     AND (OLD.fiscal_designado IS DISTINCT FROM NEW.fiscal_designado) THEN
    INSERT INTO public.notificacoes (fiscal_id, ocorrencia_id, tipo, titulo, mensagem)
    VALUES (
      NEW.fiscal_designado,
      NEW.id,
      'atribuicao',
      'Nova ocorrência atribuída',
      'Você foi designado para: ' || NEW.categoria || ' - ' || NEW.bairro
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_assignment ON public.ocorrencias;
CREATE TRIGGER trg_notify_assignment
  AFTER UPDATE ON public.ocorrencias
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_assignment();

CREATE OR REPLACE FUNCTION public.notify_on_status_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  registrante uuid;
BEGIN
  SELECT fiscal_registrou INTO registrante FROM public.ocorrencias WHERE id = NEW.ocorrencia_id;
  IF registrante IS NOT NULL AND registrante <> NEW.fiscal_id THEN
    INSERT INTO public.notificacoes (fiscal_id, ocorrencia_id, tipo, titulo, mensagem)
    VALUES (
      registrante,
      NEW.ocorrencia_id,
      'status',
      'Status atualizado',
      'A ocorrência que você registrou mudou para: ' || NEW.status_novo
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_status ON public.auditoria;
CREATE TRIGGER trg_notify_status
  AFTER INSERT ON public.auditoria
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_status_change();

-- ============================================================================
-- Origem: 20260926140000_add_push_tokens.sql
-- ============================================================================
/*
# SIFAU push notification tokens

1. New Tables
- `push_tokens`: one row per device/token registered by a fiscal via the native app (Capacitor).

2. Security
- RLS enabled; a fiscal can insert/update/select only their own tokens.
- `token` is globally unique so upsert-by-token works across re-installs.
*/

CREATE TABLE IF NOT EXISTS public.push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_id uuid NOT NULL REFERENCES public.fiscais(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  platform text NOT NULL DEFAULT 'android',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Fiscal gerencia seus tokens"
  ON public.push_tokens FOR ALL TO authenticated
  USING (fiscal_id = auth.uid())
  WITH CHECK (fiscal_id = auth.uid());

-- ============================================================================
-- Origem: 20260926150000_create_fiscal_signup_profile.sql
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_fiscal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.fiscais (id, email, nome, telefone, bairro, especialidade)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NULLIF(btrim(NEW.raw_user_meta_data ->> 'nome'), ''),
      NULLIF(split_part(COALESCE(NEW.email, ''), '@', 1), ''),
      'Fiscal'
    ),
    COALESCE(NULLIF(btrim(NEW.raw_user_meta_data ->> 'telefone'), ''), ''),
    COALESCE(NULLIF(btrim(NEW.raw_user_meta_data ->> 'bairro'), ''), ''),
    NULLIF(btrim(NEW.raw_user_meta_data ->> 'especialidade'), '')
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_fiscal() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created_fiscal ON auth.users;
CREATE TRIGGER on_auth_user_created_fiscal
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_fiscal();

-- ============================================================================
-- Origem: 20260927220000_add_admin_system.sql
-- ============================================================================
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

-- A função legada não pode ser chamada por clientes; a migration de hardening a remove.
REVOKE ALL ON FUNCTION public.wipe_user_data(uuid) FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- Origem: 20260930130000_add_documents.sql
-- ============================================================================
-- ============================================================================
-- SIFAU — Sistema de Documentos
-- Adiciona suporte para galeria de fotos, histórico de documentos e
-- registros de assinatura manuscrita (sem validação de certificado digital)
-- ============================================================================

-- Tabela de documentos e fotos
CREATE TABLE IF NOT EXISTS public.documentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ocorrencia_id uuid REFERENCES public.ocorrencias(id) ON DELETE CASCADE,
  vistoria_id uuid REFERENCES public.vistorias(id) ON DELETE CASCADE,
  ordem_servico_id uuid REFERENCES public.ordens_servico(id) ON DELETE CASCADE,
  tipo_documento text NOT NULL CHECK (tipo_documento IN ('foto', 'assinatura', 'documento', 'relatorio', 'auto_infracao')),
  titulo text,
  descricao text,
  -- Caminho no bucket sifau-anexos: {fiscal_id}/{ano}/{mes}/{documento_id}.extensao
  arquivo_path text NOT NULL,
  arquivo_nome text,
  arquivo_tipo text, -- MIME type
  arquivo_tamanho integer, -- tamanho em bytes
  ordem integer DEFAULT 0, -- para ordenação
  metadados jsonb DEFAULT '{}', -- informações adicionais
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_documentos_fiscal ON public.documentos(fiscal_id);
CREATE INDEX IF NOT EXISTS idx_documentos_ocorrencia ON public.documentos(ocorrencia_id);
CREATE INDEX IF NOT EXISTS idx_documentos_vistoria ON public.documentos(vistoria_id);
CREATE INDEX IF NOT EXISTS idx_documentos_ordem_servico ON public.documentos(ordem_servico_id);
CREATE INDEX IF NOT EXISTS idx_documentos_tipo ON public.documentos(tipo_documento);
CREATE INDEX IF NOT EXISTS idx_documentos_criado_em ON public.documentos(criado_em DESC);

-- Trigger para atualizar atualizado_em
CREATE OR REPLACE FUNCTION public.atualizar_documento_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_atualizar_documento_timestamp ON public.documentos;
CREATE TRIGGER trigger_atualizar_documento_timestamp
  BEFORE UPDATE ON public.documentos
  FOR EACH ROW
  EXECUTE FUNCTION public.atualizar_documento_timestamp();

-- Política de segurança RLS
ALTER TABLE public.documentos ENABLE ROW LEVEL SECURITY;

-- Qualquer usuário autenticado pode ver documentos
CREATE POLICY "documentos_view_all"
  ON public.documentos FOR SELECT
  TO authenticated
  USING (true);

-- Usuários podem inserir seus próprios documentos
CREATE POLICY "documentos_insert_own"
  ON public.documentos FOR INSERT
  TO authenticated
  WITH CHECK (fiscal_id = auth.uid());

-- Usuários podem atualizar seus próprios documentos
CREATE POLICY "documentos_update_own"
  ON public.documentos FOR UPDATE
  TO authenticated
  USING (fiscal_id = auth.uid())
  WITH CHECK (fiscal_id = auth.uid());

-- Usuários podem deletar seus próprios documentos
CREATE POLICY "documentos_delete_own"
  ON public.documentos FOR DELETE
  TO authenticated
  USING (fiscal_id = auth.uid());

-- Tabela de assinaturas digitais avançadas
CREATE TABLE IF NOT EXISTS public.assinaturas_digitais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  documento_id uuid REFERENCES public.documentos(id) ON DELETE CASCADE,
  assinatura_data text NOT NULL, -- Base64 da imagem da assinatura
  certificado_digital text, -- certificado digital em base64
  certificado_valido boolean DEFAULT false,
  certificado_emissor text,
  certificado_validade_inicio timestamptz,
  certificado_validade_fim timestamptz,
  hash_documento text, -- hash do documento assinado
  ip_address text,
  dispositivo_info jsonb DEFAULT '{}',
  criado_em timestamptz NOT NULL DEFAULT now()
);

-- Índices para assinaturas
CREATE INDEX IF NOT EXISTS idx_assinaturas_fiscal ON public.assinaturas_digitais(fiscal_id);
CREATE INDEX IF NOT EXISTS idx_assinaturas_documento ON public.assinaturas_digitais(documento_id);

-- RLS para assinaturas
ALTER TABLE public.assinaturas_digitais ENABLE ROW LEVEL SECURITY;

CREATE POLICY "assinaturas_view_all"
  ON public.assinaturas_digitais FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "assinaturas_insert_own"
  ON public.assinaturas_digitais FOR INSERT
  TO authenticated
  WITH CHECK (fiscal_id = auth.uid());

-- Certificate validation is intentionally not implemented in the browser app.
-- Keep no RPC that could falsely mark user-provided certificate data as valid.

-- Comentários
COMMENT ON TABLE public.documentos IS 'Sistema de documentos do SIFAU - fotos, assinaturas, relatórios';
COMMENT ON TABLE public.assinaturas_digitais IS 'Registros de assinatura manuscrita; não representam certificado ou assinatura digital validada';

COMMENT ON COLUMN public.documentos.metadados IS 'Metadados adicionais em JSON (ex: GPS, timestamp da foto, etc)';
COMMENT ON COLUMN public.assinaturas_digitais.certificado_digital IS 'Campo legado; não é validado pelo sistema';

-- ============================================================================
-- Origem: 20261012090000_harden_access_and_audit.sql
-- ============================================================================
-- SIFAU security, approval flow, automatic audit trail and native push registration.
-- Apply after the core, notification, push-token and admin migrations.

CREATE TABLE IF NOT EXISTS public.administradores (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL UNIQUE,
  nome text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

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

CREATE TABLE IF NOT EXISTS public.admin_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid REFERENCES public.administradores(id) ON DELETE CASCADE,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id uuid,
  details jsonb,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.fiscais
  ADD COLUMN IF NOT EXISTS notif_atribuicao boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notif_sla boolean NOT NULL DEFAULT true;
ALTER TABLE public.autos_infracao
  ADD COLUMN IF NOT EXISTS assinatura_autuado text;

-- Enforce the same minimum evidence and fine-data rules on direct/offline inserts
-- as on the online inspection RPC, without rejecting historical rows during rollout.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.vistorias'::regclass
      AND conname = 'vistorias_fine_payload_check'
  ) THEN
    ALTER TABLE public.vistorias
      ADD CONSTRAINT vistorias_fine_payload_check CHECK (
        (acao_tomada = 'Multa'
          AND valor_multa IS NOT NULL
          AND valor_multa >= 0
          AND NULLIF(pg_catalog.btrim(numero_processo), '') IS NOT NULL)
        OR
        (acao_tomada <> 'Multa'
          AND valor_multa IS NULL
          AND numero_processo IS NULL)
      ) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.vistorias'::regclass
      AND conname = 'vistorias_photos_count_check'
  ) THEN
    ALTER TABLE public.vistorias
      ADD CONSTRAINT vistorias_photos_count_check
      CHECK (pg_catalog.cardinality(fotos_depois) BETWEEN 1 AND 5) NOT VALID;
  END IF;
END $$;

-- The audit actor may be an administrator as well as a fiscal. Preserve the
-- authenticated identity instead of forcing an admin action to impersonate a fiscal.
ALTER TABLE public.auditoria DROP CONSTRAINT IF EXISTS auditoria_fiscal_id_fkey;
ALTER TABLE public.auditoria DROP CONSTRAINT IF EXISTS auditoria_actor_auth_user_fkey;
ALTER TABLE public.auditoria
  ADD CONSTRAINT auditoria_actor_auth_user_fkey FOREIGN KEY (fiscal_id) REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS fiscal_location_fiscal_idx ON public.fiscal_location(fiscal_id);
CREATE INDEX IF NOT EXISTS fiscal_location_last_seen_idx ON public.fiscal_location(last_seen DESC);
CREATE INDEX IF NOT EXISTS admin_messages_fiscal_idx ON public.admin_messages(fiscal_id, created_at);
CREATE INDEX IF NOT EXISTS admin_logs_created_idx ON public.admin_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS banned_users_expiration_idx ON public.banned_users(expires_at);

-- The app uses only the current device position. Keep one current row per fiscal
-- instead of inserting a permanent location trail every minute.
WITH ranked_locations AS (
  SELECT id, pg_catalog.row_number() OVER (
    PARTITION BY fiscal_id ORDER BY last_seen DESC, created_at DESC, id DESC
  ) AS position
  FROM public.fiscal_location
)
DELETE FROM public.fiscal_location AS locations
USING ranked_locations
WHERE locations.id = ranked_locations.id AND ranked_locations.position > 1;
CREATE UNIQUE INDEX IF NOT EXISTS fiscal_location_one_row_per_fiscal_idx
  ON public.fiscal_location(fiscal_id);

-- New self-service accounts cannot access operational data until an admin approves them.
CREATE OR REPLACE FUNCTION public.handle_new_fiscal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.fiscais (id, email, nome, telefone, bairro, especialidade, ativo)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NULLIF(btrim(NEW.raw_user_meta_data ->> 'nome'), ''),
      NULLIF(split_part(COALESCE(NEW.email, ''), '@', 1), ''),
      'Fiscal'
    ),
    COALESCE(NULLIF(btrim(NEW.raw_user_meta_data ->> 'telefone'), ''), ''),
    COALESCE(NULLIF(btrim(NEW.raw_user_meta_data ->> 'bairro'), ''), ''),
    NULLIF(btrim(NEW.raw_user_meta_data ->> 'especialidade'), ''),
    false
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.handle_new_fiscal() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS on_auth_user_created_fiscal ON auth.users;
CREATE TRIGGER on_auth_user_created_fiscal
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_fiscal();

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.administradores AS a WHERE a.id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.is_user_banned()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.banned_users AS b
      WHERE b.id = auth.uid()
        AND (b.ban_type = 'permanent' OR b.expires_at IS NULL OR b.expires_at > now())
    );
$$;

CREATE OR REPLACE FUNCTION public.is_eligible_fiscal(p_fiscal_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_fiscal_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.fiscais AS f
      WHERE f.id = p_fiscal_id AND f.ativo = true
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.banned_users AS b
      WHERE b.id = p_fiscal_id
        AND (b.ban_type = 'permanent' OR b.expires_at IS NULL OR b.expires_at > now())
    );
$$;

CREATE OR REPLACE FUNCTION public.is_active_fiscal()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL AND public.is_eligible_fiscal(auth.uid());
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_user_banned() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_eligible_fiscal(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_active_fiscal() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_user_banned() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_eligible_fiscal(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_active_fiscal() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_fiscal_directory()
RETURNS TABLE (id uuid, nome text, bairro text, especialidade text, ativo boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT (public.is_admin() OR public.is_active_fiscal()) THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT f.id, f.nome, f.bairro, f.especialidade, f.ativo
    FROM public.fiscais AS f
    WHERE (f.ativo = true AND public.is_eligible_fiscal(f.id))
       OR f.id = auth.uid()
       OR public.is_admin()
    ORDER BY f.nome;
END;
$$;
REVOKE ALL ON FUNCTION public.get_fiscal_directory() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_fiscal_directory() TO authenticated;

CREATE OR REPLACE FUNCTION public.set_fiscal_active(p_fiscal_id uuid, p_active boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id uuid := auth.uid();
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Apenas administradores podem alterar o acesso de fiscais' USING ERRCODE = '42501';
  END IF;

  UPDATE public.fiscais SET ativo = p_active WHERE id = p_fiscal_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fiscal não encontrado' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.admin_logs (admin_id, action, target_type, target_id, details)
  VALUES (
    actor_id,
    CASE WHEN p_active THEN 'ACTIVATE_FISCAL' ELSE 'DEACTIVATE_FISCAL' END,
    'fiscal',
    p_fiscal_id,
    pg_catalog.jsonb_build_object('active', p_active)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.set_fiscal_active(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_fiscal_active(uuid, boolean) TO authenticated;

-- Provision an initial administrator from the Supabase SQL Editor only. Execution
-- is intentionally not granted to API roles; create the account in Auth first.
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

  -- O trigger de cadastro cria todo perfil fiscal como inativo, porque um fiscal
  -- comum precisa de aprovação. O administrador é a exceção: sem esta ativação,
  -- ele fica com is_active_fiscal() = false, e toda operação que depende dessa
  -- função falha para ele — inclusive registrar uma ocorrência, porque a
  -- política occurrences_insert_self exige is_active_fiscal().
  --
  -- Isso não abre privilégio: o perfil já existe e a conta já é administradora.
  -- A ativação apenas mantém as duas verificações coerentes entre si.
  UPDATE public.fiscais SET ativo = true WHERE id = admin_user_id;

  RETURN admin_user_id;
END;
$$;
REVOKE ALL ON FUNCTION public.bootstrap_admin(text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.register_push_token(p_token text, p_platform text DEFAULT 'android')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_active_fiscal() THEN
    RAISE EXCEPTION 'Apenas fiscais ativos podem registrar notificações push' USING ERRCODE = '42501';
  END IF;
  IF p_token IS NULL
     OR pg_catalog.length(pg_catalog.btrim(p_token)) < 20
     OR pg_catalog.length(p_token) > 4096 THEN
    RAISE EXCEPTION 'Token push inválido' USING ERRCODE = '22023';
  END IF;
  IF p_platform IS NOT NULL AND p_platform NOT IN ('android', 'ios', 'web') THEN
    RAISE EXCEPTION 'Plataforma inválida' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.push_tokens (fiscal_id, token, platform, updated_at)
  VALUES (auth.uid(), p_token, COALESCE(NULLIF(p_platform, ''), 'android'), now())
  ON CONFLICT (token) DO UPDATE
    SET platform = EXCLUDED.platform,
        updated_at = now()
    WHERE public.push_tokens.fiscal_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Este token push já pertence a outra conta' USING ERRCODE = '23505';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.register_push_token(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_push_token(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.unregister_push_token(p_token text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  DELETE FROM public.push_tokens
  WHERE token = p_token AND fiscal_id = auth.uid();
$$;
REVOKE ALL ON FUNCTION public.unregister_push_token(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unregister_push_token(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_fiscal_location(
  p_latitude numeric,
  p_longitude numeric,
  p_accuracy numeric DEFAULT NULL,
  p_battery_level integer DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_active_fiscal() THEN
    RAISE EXCEPTION 'Apenas fiscais ativos podem registrar localização' USING ERRCODE = '42501';
  END IF;
  IF p_latitude IS NULL OR p_longitude IS NULL
     OR p_latitude NOT BETWEEN -90 AND 90
     OR p_longitude NOT BETWEEN -180 AND 180
     OR (p_accuracy IS NOT NULL AND p_accuracy NOT BETWEEN 0 AND 100000)
     OR (p_battery_level IS NOT NULL AND p_battery_level NOT BETWEEN 0 AND 100) THEN
    RAISE EXCEPTION 'Coordenadas inválidas' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.fiscal_location
    (fiscal_id, latitude, longitude, accuracy, battery_level, is_online, last_seen)
  VALUES
    (auth.uid(), p_latitude, p_longitude, p_accuracy, p_battery_level, true, now())
  ON CONFLICT (fiscal_id) DO UPDATE
    SET latitude = EXCLUDED.latitude,
        longitude = EXCLUDED.longitude,
        accuracy = EXCLUDED.accuracy,
        battery_level = EXCLUDED.battery_level,
        is_online = true,
        last_seen = now();
END;
$$;
REVOKE ALL ON FUNCTION public.record_fiscal_location(numeric, numeric, numeric, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_fiscal_location(numeric, numeric, numeric, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_fiscal_offline()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.fiscal_location
  SET is_online = false, last_seen = now()
  WHERE fiscal_id = auth.uid();
END;
$$;
REVOKE ALL ON FUNCTION public.mark_fiscal_offline() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_fiscal_offline() TO authenticated;

-- Every occurrence mutation is recorded by the database in the same transaction.
CREATE OR REPLACE FUNCTION public.audit_occurrence_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id uuid := auth.uid();
  audit_note text;
  audit_latitude numeric;
  audit_longitude numeric;
BEGIN
  audit_note := NULLIF(pg_catalog.current_setting('sifau.audit_note', true), '');
  audit_latitude := COALESCE(
    NULLIF(pg_catalog.current_setting('sifau.audit_latitude', true), '')::numeric,
    NEW.latitude
  );
  audit_longitude := COALESCE(
    NULLIF(pg_catalog.current_setting('sifau.audit_longitude', true), '')::numeric,
    NEW.longitude
  );

  IF TG_OP = 'UPDATE' THEN
    IF pg_catalog.to_jsonb(OLD) = pg_catalog.to_jsonb(NEW) THEN
      RETURN NEW;
    END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    actor_id := COALESCE(actor_id, NEW.fiscal_registrou);
    audit_note := COALESCE(audit_note, 'Ocorrência registrada');
    INSERT INTO public.auditoria
      (ocorrencia_id, status_anterior, status_novo, fiscal_id, latitude, longitude, observacao)
    VALUES
      (NEW.id, NULL, NEW.status, actor_id, audit_latitude, audit_longitude, audit_note);
    RETURN NEW;
  END IF;

  actor_id := COALESCE(actor_id, NEW.fiscal_designado, NEW.fiscal_registrou);
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    audit_note := COALESCE(audit_note, 'Status alterado de ' || OLD.status || ' para ' || NEW.status);
  ELSIF OLD.fiscal_designado IS DISTINCT FROM NEW.fiscal_designado THEN
    audit_note := COALESCE(audit_note, CASE
      WHEN NEW.fiscal_designado IS NULL THEN 'Fiscalização removida da fila de atribuições'
      ELSE 'Ocorrência atribuída ou redistribuída para outro fiscal'
    END);
  ELSE
    audit_note := COALESCE(audit_note, 'Dados da ocorrência editados');
  END IF;

  INSERT INTO public.auditoria
    (ocorrencia_id, status_anterior, status_novo, fiscal_id, latitude, longitude, observacao)
  VALUES
    (NEW.id, OLD.status, NEW.status, actor_id, audit_latitude, audit_longitude, audit_note);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_audit_occurrence_change ON public.ocorrencias;
CREATE TRIGGER trg_audit_occurrence_change
  AFTER INSERT OR UPDATE ON public.ocorrencias
  FOR EACH ROW EXECUTE FUNCTION public.audit_occurrence_change();
REVOKE ALL ON FUNCTION public.audit_occurrence_change() FROM PUBLIC, anon, authenticated;

-- Perform the inspection record and occurrence status transition atomically, so
-- neither half is left behind if one write fails. The ordinary RLS policies still
-- authorize the caller because this function runs as SECURITY INVOKER.
CREATE OR REPLACE FUNCTION public.complete_inspection(
  p_vistoria_id uuid,
  p_occurrence_id uuid,
  p_fiscal_id uuid,
  p_arrival_at timestamptz,
  p_arrival_latitude numeric,
  p_arrival_longitude numeric,
  p_laudo text,
  p_acao_tomada text,
  p_valor_multa numeric,
  p_numero_processo text,
  p_fotos_depois text[],
  p_status text,
  p_note text
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF p_fiscal_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Fiscal da vistoria inválido' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.ocorrencias AS assigned
    WHERE assigned.id = p_occurrence_id
      AND assigned.fiscal_designado = auth.uid()
      AND assigned.status IN ('Atribuída', 'Em vistoria')
  ) THEN
    RAISE EXCEPTION 'A vistoria exige uma ocorrência em andamento atribuída a você' USING ERRCODE = '42501';
  END IF;
  IF p_arrival_latitude NOT BETWEEN -90 AND 90
     OR p_arrival_longitude NOT BETWEEN -180 AND 180 THEN
    RAISE EXCEPTION 'Coordenadas de chegada inválidas' USING ERRCODE = '22023';
  END IF;
  IF pg_catalog.char_length(pg_catalog.btrim(COALESCE(p_laudo, ''))) < 10
     OR pg_catalog.char_length(pg_catalog.btrim(COALESCE(p_laudo, ''))) > 10000
     OR COALESCE(pg_catalog.cardinality(p_fotos_depois), 0) NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'Laudo ou fotos da vistoria inválidos' USING ERRCODE = '22023';
  END IF;
  IF p_acao_tomada IS NULL OR p_acao_tomada NOT IN ('Notificação', 'Multa', 'Encaminhamento', 'Orientação', 'Sem ação') THEN
    RAISE EXCEPTION 'Ação da vistoria inválida' USING ERRCODE = '22023';
  END IF;
  IF p_acao_tomada = 'Multa'
     AND (p_valor_multa IS NULL OR p_valor_multa < 0 OR NULLIF(pg_catalog.btrim(p_numero_processo), '') IS NULL) THEN
    RAISE EXCEPTION 'Multa exige valor não negativo e número de processo' USING ERRCODE = '22023';
  END IF;
  IF (p_acao_tomada = 'Encaminhamento') IS DISTINCT FROM (p_status = 'Escalonada') THEN
    RAISE EXCEPTION 'O status final não corresponde à ação da vistoria' USING ERRCODE = '22023';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('Resolvida', 'Escalonada') THEN
    RAISE EXCEPTION 'Status final inválido' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.set_config('sifau.audit_note', pg_catalog.left(
    COALESCE(NULLIF(pg_catalog.btrim(p_note), ''), 'Vistoria realizada'), 2000
  ), true);
  PERFORM pg_catalog.set_config('sifau.audit_latitude', p_arrival_latitude::text, true);
  PERFORM pg_catalog.set_config('sifau.audit_longitude', p_arrival_longitude::text, true);

  INSERT INTO public.vistorias (
    id, ocorrencia_id, fiscal_id, chegada_at, chegada_latitude, chegada_longitude,
    laudo, acao_tomada, valor_multa, numero_processo, fotos_depois
  ) VALUES (
    p_vistoria_id, p_occurrence_id, p_fiscal_id, p_arrival_at, p_arrival_latitude, p_arrival_longitude,
    pg_catalog.btrim(p_laudo), p_acao_tomada,
    CASE WHEN p_acao_tomada = 'Multa' THEN p_valor_multa ELSE NULL END,
    CASE WHEN p_acao_tomada = 'Multa' THEN p_numero_processo ELSE NULL END,
    COALESCE(p_fotos_depois, ARRAY[]::text[])
  ) ON CONFLICT (id) DO NOTHING;

  IF NOT EXISTS (
    SELECT 1 FROM public.vistorias AS existing
    WHERE existing.id = p_vistoria_id
      AND existing.ocorrencia_id = p_occurrence_id
      AND existing.fiscal_id = p_fiscal_id
  ) THEN
    RAISE EXCEPTION 'Identificador de vistoria já utilizado por outro registro' USING ERRCODE = '23505';
  END IF;

  UPDATE public.ocorrencias SET status = p_status WHERE id = p_occurrence_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ocorrência não encontrada ou sem permissão' USING ERRCODE = '42501';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.complete_inspection(uuid, uuid, uuid, timestamptz, numeric, numeric, text, text, numeric, text, text[], text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_inspection(uuid, uuid, uuid, timestamptz, numeric, numeric, text, text, numeric, text, text[], text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_occurrence_status(
  p_occurrence_id uuid,
  p_status text,
  p_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF p_status NOT IN ('Aberta', 'Triada', 'Atribuída', 'Em vistoria', 'Resolvida', 'Arquivada', 'Escalonada') THEN
    RAISE EXCEPTION 'Status inválido' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_catalog.set_config('sifau.audit_note', pg_catalog.left(
    COALESCE(NULLIF(pg_catalog.btrim(p_note), ''), ''), 2000
  ), true);
  UPDATE public.ocorrencias SET status = p_status WHERE id = p_occurrence_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ocorrência não encontrada ou sem permissão' USING ERRCODE = '42501';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.update_occurrence_status(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_occurrence_status(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.redistribute_occurrence(p_occurrence_id uuid, p_target_fiscal_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_assignee uuid;
  current_status text;
BEGIN
  IF NOT public.is_active_fiscal() THEN
    RAISE EXCEPTION 'Apenas fiscais ativos podem redistribuir ocorrências' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_eligible_fiscal(p_target_fiscal_id) THEN
    RAISE EXCEPTION 'O fiscal de destino não está ativo' USING ERRCODE = '22023';
  END IF;

  SELECT o.fiscal_designado, o.status
  INTO current_assignee, current_status
  FROM public.ocorrencias AS o
  WHERE o.id = p_occurrence_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ocorrência não encontrada' USING ERRCODE = 'P0002';
  END IF;
  IF current_status NOT IN ('Atribuída', 'Em vistoria') THEN
    RAISE EXCEPTION 'Apenas ocorrências em andamento podem ser redistribuídas' USING ERRCODE = '22023';
  END IF;
  IF current_assignee IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Apenas o fiscal atualmente designado pode redistribuir esta ocorrência' USING ERRCODE = '42501';
  END IF;
  IF p_target_fiscal_id = auth.uid() THEN
    RAISE EXCEPTION 'Escolha um fiscal diferente para redistribuir a ocorrência' USING ERRCODE = '22023';
  END IF;

  UPDATE public.ocorrencias SET fiscal_designado = p_target_fiscal_id WHERE id = p_occurrence_id;
END;
$$;
REVOKE ALL ON FUNCTION public.redistribute_occurrence(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redistribute_occurrence(uuid, uuid) TO authenticated;

-- Initial triage assigns only unassigned work. Assignment authority is server-side
-- and the database audit/notification triggers run in the same transaction.
CREATE OR REPLACE FUNCTION public.assign_occurrence(p_occurrence_id uuid, p_target_fiscal_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_assignee uuid;
  current_status text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Apenas administradores podem distribuir ocorrências' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_eligible_fiscal(p_target_fiscal_id) THEN
    RAISE EXCEPTION 'O fiscal de destino não está ativo' USING ERRCODE = '22023';
  END IF;

  SELECT o.fiscal_designado, o.status INTO current_assignee, current_status
  FROM public.ocorrencias AS o
  WHERE o.id = p_occurrence_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ocorrência não encontrada' USING ERRCODE = 'P0002';
  END IF;
  IF current_assignee IS NOT NULL THEN
    RAISE EXCEPTION 'A ocorrência já foi atribuída; use a redistribuição' USING ERRCODE = '22023';
  END IF;
  IF current_status NOT IN ('Aberta', 'Triada', 'Escalonada') THEN
    RAISE EXCEPTION 'Esta ocorrência não está disponível para distribuição' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.set_config(
    'sifau.audit_note',
    pg_catalog.left('Ocorrência distribuída pelo administrador para fiscal ' || p_target_fiscal_id::text, 2000),
    true
  );
  UPDATE public.ocorrencias
  SET fiscal_designado = p_target_fiscal_id, status = 'Atribuída'
  WHERE id = p_occurrence_id;
END;
$$;
REVOKE ALL ON FUNCTION public.assign_occurrence(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_occurrence(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.notify_on_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  wants_notification boolean;
BEGIN
  IF NEW.fiscal_designado IS NULL
     OR NOT public.is_eligible_fiscal(NEW.fiscal_designado)
     OR OLD.fiscal_designado IS NOT DISTINCT FROM NEW.fiscal_designado THEN
    RETURN NEW;
  END IF;

  SELECT f.notif_atribuicao INTO wants_notification
  FROM public.fiscais AS f WHERE f.id = NEW.fiscal_designado;
  IF COALESCE(wants_notification, true) THEN
    INSERT INTO public.notificacoes (fiscal_id, ocorrencia_id, tipo, titulo, mensagem)
    VALUES (
      NEW.fiscal_designado,
      NEW.id,
      'atribuicao',
      'Nova ocorrência atribuída',
      'Você foi designado para: ' || NEW.categoria || ' - ' || NEW.bairro
    );
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_notify_assignment ON public.ocorrencias;
CREATE TRIGGER trg_notify_assignment
  AFTER UPDATE OF fiscal_designado ON public.ocorrencias
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_assignment();

CREATE OR REPLACE FUNCTION public.notify_on_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  registrante uuid;
BEGIN
  IF NEW.status_anterior IS NOT DISTINCT FROM NEW.status_novo THEN
    RETURN NEW;
  END IF;
  SELECT o.fiscal_registrou INTO registrante
  FROM public.ocorrencias AS o WHERE o.id = NEW.ocorrencia_id;
  IF registrante IS NOT NULL
     AND registrante <> NEW.fiscal_id
     AND public.is_eligible_fiscal(registrante) THEN
    INSERT INTO public.notificacoes (fiscal_id, ocorrencia_id, tipo, titulo, mensagem)
    VALUES (
      registrante,
      NEW.ocorrencia_id,
      'status',
      'Status atualizado',
      'A ocorrência que você registrou mudou para: ' || NEW.status_novo
    );
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_notify_status ON public.auditoria;
CREATE TRIGGER trg_notify_status
  AFTER INSERT ON public.auditoria
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_status_change();

-- Remove the old arbitrary-user data wipe function. Operational and audit records
-- must remain linked for legal traceability; deactivation/ban is reversible instead.
DROP FUNCTION IF EXISTS public.wipe_user_data(uuid);

-- Remove permissive policies generated by the initial scaffold.
DO $$
DECLARE
  table_name text;
  policy_suffix text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'fiscais', 'sla_config', 'ocorrencias', 'vistorias', 'ordens_servico',
    'autos_infracao', 'reincidencias', 'exportacoes_auditoria'
  ] LOOP
    FOREACH policy_suffix IN ARRAY ARRAY['select', 'insert', 'update', 'delete'] LOOP
      EXECUTE pg_catalog.format(
        'DROP POLICY IF EXISTS %I ON public.%I',
        'fiscal_' || policy_suffix || '_' || table_name,
        table_name
      );
    END LOOP;
  END LOOP;
END $$;


-- Segunda varredura, agora por ESTADO e não por nome.
--
-- A varredura acima depende de acertar o nome de cada política — foi assim que
-- o defeito da trilha de auditoria passou: `fiscal_select_auditoria` e
-- `fiscal_insert_auditoria` existiam no banco, mas não estavam em nenhuma
-- lista. Como políticas permissivas se combinam com OR, uma `USING (true)`
-- anula as restritivas da mesma tabela.
--
-- Esta varredura derruba qualquer política que ainda esteja incondicional,
-- independentemente do nome, e é a mesma da migration
-- 20261013000000_fix_permissive_policies_and_admin_bootstrap.sql. As suítes de
-- teste exigem que o estado final tenha zero políticas incondicionais.
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
DROP POLICY IF EXISTS "Admin vê todos os admins" ON public.administradores;
DROP POLICY IF EXISTS "Admin insere admins" ON public.administradores;
DROP POLICY IF EXISTS "Admin vê todas as localizações" ON public.fiscal_location;
DROP POLICY IF EXISTS "Fiscal vê apenas sua localização" ON public.fiscal_location;
DROP POLICY IF EXISTS "Fiscal insere sua localização" ON public.fiscal_location;
DROP POLICY IF EXISTS "Fiscal atualiza sua localização" ON public.fiscal_location;
DROP POLICY IF EXISTS "Admin vê todos os banidos" ON public.banned_users;
DROP POLICY IF EXISTS "Admin gerencia banimentos" ON public.banned_users;
DROP POLICY IF EXISTS "Admin vê todas as mensagens" ON public.admin_messages;
DROP POLICY IF EXISTS "Fiscal vê suas mensagens" ON public.admin_messages;
DROP POLICY IF EXISTS "Admin envia mensagens" ON public.admin_messages;
DROP POLICY IF EXISTS "Fiscal envia mensagens" ON public.admin_messages;
DROP POLICY IF EXISTS "Fiscal marca como lida" ON public.admin_messages;
DROP POLICY IF EXISTS "Admin vê todos os logs" ON public.admin_logs;
DROP POLICY IF EXISTS "Admin insere logs" ON public.admin_logs;
DROP POLICY IF EXISTS "Fiscal vê suas notificações" ON public.notificacoes;
DROP POLICY IF EXISTS "Fiscal marca como lida" ON public.notificacoes;
DROP POLICY IF EXISTS "Fiscal gerencia seus tokens" ON public.push_tokens;

ALTER TABLE public.fiscais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sla_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ocorrencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vistorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ordens_servico ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.autos_infracao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reincidencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auditoria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exportacoes_auditoria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notificacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.administradores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_location ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.banned_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_logs ENABLE ROW LEVEL SECURITY;

-- Restrict table privileges as well as row access. Browser clients only receive
-- the exact columns required by the application; all other operations are denied.
REVOKE ALL ON public.fiscais, public.sla_config, public.ocorrencias, public.vistorias,
  public.ordens_servico, public.autos_infracao, public.reincidencias, public.auditoria,
  public.exportacoes_auditoria, public.notificacoes, public.push_tokens,
  public.administradores, public.fiscal_location, public.banned_users,
  public.admin_messages, public.admin_logs FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.fiscais TO authenticated;
GRANT UPDATE (nome, telefone, bairro, especialidade, notif_atribuicao, notif_sla)
  ON public.fiscais TO authenticated;
GRANT SELECT ON public.sla_config TO authenticated;
GRANT SELECT ON public.ocorrencias TO authenticated;
GRANT INSERT (id, fiscal_registrou, categoria, subcategoria, descricao, urgencia, latitude, longitude, bairro, endereco, fotos, sla_deadline)
  ON public.ocorrencias TO authenticated;
GRANT UPDATE (status, categoria, subcategoria, descricao, urgencia, latitude, longitude, bairro, endereco)
  ON public.ocorrencias TO authenticated;
GRANT SELECT ON public.vistorias TO authenticated;
GRANT INSERT (id, ocorrencia_id, fiscal_id, chegada_at, chegada_latitude, chegada_longitude, laudo, acao_tomada, valor_multa, numero_processo, fotos_depois)
  ON public.vistorias TO authenticated;
GRANT SELECT ON public.ordens_servico TO authenticated;
GRANT INSERT (numero, origem, ocorrencia_id, requerente, fiscal_abertura, fiscal_designado, apoio_operacional, orgao_apoio, descricao, legislacao, endereco, latitude, longitude, prazo_resposta)
  ON public.ordens_servico TO authenticated;
GRANT UPDATE (status) ON public.ordens_servico TO authenticated;
GRANT SELECT ON public.autos_infracao TO authenticated;
GRANT INSERT (id, os_id, ocorrencia_id, tipo_infracao, artigo_legal, valor_base, valor_multa, motivo, autuado_nome, autuado_documento, assinatura_autuado, ciencia, testemunha_nome, pagamento, vencimento)
  ON public.autos_infracao TO authenticated;
GRANT SELECT ON public.reincidencias TO authenticated;
GRANT SELECT ON public.auditoria TO authenticated;
GRANT SELECT, INSERT ON public.exportacoes_auditoria TO authenticated;
GRANT SELECT ON public.notificacoes TO authenticated;
GRANT UPDATE (lida) ON public.notificacoes TO authenticated;
GRANT SELECT ON public.administradores TO authenticated;
GRANT SELECT ON public.fiscal_location TO authenticated;
GRANT SELECT ON public.banned_users TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.banned_users TO authenticated;
GRANT SELECT ON public.admin_messages TO authenticated;
GRANT INSERT (admin_id, fiscal_id, sender_type, message, attachments) ON public.admin_messages TO authenticated;
GRANT UPDATE (read_at) ON public.admin_messages TO authenticated;
GRANT SELECT, INSERT ON public.admin_logs TO authenticated;

-- Core operational data is shared only with approved, non-banned fiscal users.
-- Drop this migration's own policies first so recovery/reapplication is safe.
DO $$
DECLARE
  policy_row record;
BEGIN
  FOR policy_row IN
    SELECT schemaname, tablename, policyname
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'public'
      AND policyname = ANY (ARRAY[
        'fiscais_select_approved', 'fiscais_update_self',
        'sla_select_approved', 'sla_admin_update',
        'occurrences_select_approved', 'occurrences_insert_self', 'occurrences_update_related',
        'inspections_select_approved', 'inspections_insert_assigned',
        'orders_select_approved', 'orders_insert_self', 'orders_update_related',
        'fines_select_related', 'fines_insert_related', 'recurrence_admin_only',
        'audit_select_approved', 'audit_exports_select_own', 'audit_exports_insert_own',
        'notifications_select_own', 'notifications_update_own',
        'administrators_select_self_or_admin', 'locations_select_self_or_admin',
        'bans_admin_only', 'messages_select_admin_or_owner', 'messages_insert_valid_sender',
        'messages_update_read_state', 'logs_select_admin_only', 'logs_insert_admin_only'
      ])
  LOOP
    EXECUTE pg_catalog.format('DROP POLICY IF EXISTS %I ON public.%I', policy_row.policyname, policy_row.tablename);
  END LOOP;
END $$;

CREATE POLICY fiscais_select_approved ON public.fiscais FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_admin());
CREATE POLICY fiscais_update_self ON public.fiscais FOR UPDATE TO authenticated
  USING (id = auth.uid() AND public.is_active_fiscal())
  WITH CHECK (id = auth.uid() AND public.is_active_fiscal());

CREATE POLICY sla_select_approved ON public.sla_config FOR SELECT TO authenticated
  USING (public.is_active_fiscal() OR public.is_admin());
CREATE POLICY sla_admin_update ON public.sla_config FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY occurrences_select_approved ON public.ocorrencias FOR SELECT TO authenticated
  USING (public.is_active_fiscal() OR public.is_admin());
CREATE POLICY occurrences_insert_self ON public.ocorrencias FOR INSERT TO authenticated
  WITH CHECK (fiscal_registrou = auth.uid() AND public.is_active_fiscal());
CREATE POLICY occurrences_update_related ON public.ocorrencias FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    OR (public.is_active_fiscal() AND (fiscal_registrou = auth.uid() OR fiscal_designado = auth.uid()))
  )
  WITH CHECK (
    public.is_admin()
    OR (
      public.is_active_fiscal()
      AND (fiscal_registrou = auth.uid() OR fiscal_designado = auth.uid())
      AND (
        fiscal_designado IS NULL
        OR public.is_eligible_fiscal(fiscal_designado)
      )
    )
  );

CREATE POLICY inspections_select_approved ON public.vistorias FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR (
      public.is_active_fiscal()
      AND (
        fiscal_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.ocorrencias AS o
          WHERE o.id = ocorrencia_id
            AND (o.fiscal_registrou = auth.uid() OR o.fiscal_designado = auth.uid())
        )
      )
    )
  );
CREATE POLICY inspections_insert_assigned ON public.vistorias FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR (
      fiscal_id = auth.uid() AND public.is_active_fiscal()
      AND EXISTS (
        SELECT 1 FROM public.ocorrencias AS o
        WHERE o.id = ocorrencia_id
          AND o.fiscal_designado = auth.uid()
          AND o.status IN ('Atribuída', 'Em vistoria')
      )
    )
  );

CREATE POLICY orders_select_approved ON public.ordens_servico FOR SELECT TO authenticated
  USING (public.is_active_fiscal() OR public.is_admin());
CREATE POLICY orders_insert_self ON public.ordens_servico FOR INSERT TO authenticated
  WITH CHECK (
    fiscal_abertura = auth.uid() AND public.is_active_fiscal()
    AND (
      fiscal_designado IS NULL
      OR public.is_eligible_fiscal(fiscal_designado)
    )
  );
CREATE POLICY orders_update_related ON public.ordens_servico FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    OR (public.is_active_fiscal() AND (fiscal_abertura = auth.uid() OR fiscal_designado = auth.uid()))
  )
  WITH CHECK (
    public.is_admin()
    OR (
      public.is_active_fiscal()
      AND (fiscal_abertura = auth.uid() OR fiscal_designado = auth.uid())
      AND (
        fiscal_designado IS NULL
        OR public.is_eligible_fiscal(fiscal_designado)
      )
    )
  );

CREATE POLICY fines_select_related ON public.autos_infracao FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR (
      public.is_active_fiscal()
      AND (
        EXISTS (
          SELECT 1 FROM public.ocorrencias AS o
          WHERE o.id = ocorrencia_id
            AND (o.fiscal_registrou = auth.uid() OR o.fiscal_designado = auth.uid())
        )
        OR EXISTS (
          SELECT 1 FROM public.ordens_servico AS os
          WHERE os.id = os_id
            AND (os.fiscal_abertura = auth.uid() OR os.fiscal_designado = auth.uid())
        )
      )
    )
  );
CREATE POLICY fines_insert_related ON public.autos_infracao FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR (
      public.is_active_fiscal()
      AND (
        EXISTS (
          SELECT 1 FROM public.ocorrencias AS o
          WHERE o.id = ocorrencia_id AND o.fiscal_designado = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM public.ordens_servico AS os
          WHERE os.id = os_id AND os.fiscal_designado = auth.uid()
        )
      )
    )
  );

CREATE POLICY recurrence_admin_only ON public.reincidencias FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY audit_select_approved ON public.auditoria FOR SELECT TO authenticated
  USING (public.is_active_fiscal() OR public.is_admin());
CREATE POLICY audit_exports_select_own ON public.exportacoes_auditoria FOR SELECT TO authenticated
  USING (fiscal_id = auth.uid() OR public.is_admin());
CREATE POLICY audit_exports_insert_own ON public.exportacoes_auditoria FOR INSERT TO authenticated
  WITH CHECK (fiscal_id = auth.uid() AND (public.is_active_fiscal() OR public.is_admin()));

-- Notifications and push tokens belong to the authenticated fiscal only.
CREATE POLICY notifications_select_own ON public.notificacoes FOR SELECT TO authenticated
  USING (fiscal_id = auth.uid() AND public.is_active_fiscal());
CREATE POLICY notifications_update_own ON public.notificacoes FOR UPDATE TO authenticated
  USING (fiscal_id = auth.uid() AND public.is_active_fiscal())
  WITH CHECK (fiscal_id = auth.uid() AND public.is_active_fiscal());
-- Admin capabilities never depend on client-side flags or embedded passwords.
CREATE POLICY administrators_select_self_or_admin ON public.administradores FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_admin());
CREATE POLICY locations_select_self_or_admin ON public.fiscal_location FOR SELECT TO authenticated
  USING (fiscal_id = auth.uid() OR public.is_admin());
CREATE POLICY bans_admin_only ON public.banned_users FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY messages_select_admin_or_owner ON public.admin_messages FOR SELECT TO authenticated
  USING (public.is_admin() OR (fiscal_id = auth.uid() AND public.is_active_fiscal()));
CREATE POLICY messages_insert_valid_sender ON public.admin_messages FOR INSERT TO authenticated
  WITH CHECK (
    (sender_type = 'admin' AND admin_id = auth.uid() AND fiscal_id IS NOT NULL AND public.is_admin())
    OR (sender_type = 'fiscal' AND admin_id IS NULL AND fiscal_id = auth.uid() AND public.is_active_fiscal())
  );
CREATE POLICY messages_update_read_state ON public.admin_messages FOR UPDATE TO authenticated
  USING (
    (public.is_admin() AND sender_type = 'fiscal')
    OR (fiscal_id = auth.uid() AND sender_type = 'admin' AND public.is_active_fiscal())
  )
  WITH CHECK (
    (public.is_admin() AND sender_type = 'fiscal')
    OR (fiscal_id = auth.uid() AND sender_type = 'admin' AND public.is_active_fiscal())
  );
CREATE POLICY logs_select_admin_only ON public.admin_logs FOR SELECT TO authenticated
  USING (public.is_admin());
CREATE POLICY logs_insert_admin_only ON public.admin_logs FOR INSERT TO authenticated
  WITH CHECK (admin_id = auth.uid() AND public.is_admin());

-- Called by a scheduled Supabase job (e.g. every 15 minutes) to issue SLA alerts.
CREATE OR REPLACE FUNCTION public.notify_upcoming_sla()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  inserted_count integer;
BEGIN
  INSERT INTO public.notificacoes (fiscal_id, ocorrencia_id, tipo, titulo, mensagem)
  SELECT
    o.fiscal_designado,
    o.id,
    'sla',
    'Prazo de SLA próximo',
    'A ocorrência "' || o.categoria || '" em ' || o.bairro || ' vence em até 24 horas.'
  FROM public.ocorrencias AS o
  JOIN public.fiscais AS f ON f.id = o.fiscal_designado
  WHERE f.notif_sla = true
    AND public.is_eligible_fiscal(o.fiscal_designado)
    AND o.fiscal_designado IS NOT NULL
    AND o.sla_deadline > now()
    AND o.sla_deadline <= now() + interval '24 hours'
    AND o.status NOT IN ('Resolvida', 'Arquivada')
    AND NOT EXISTS (
      SELECT 1 FROM public.notificacoes AS n
      WHERE n.fiscal_id = o.fiscal_designado
        AND n.ocorrencia_id = o.id
        AND n.tipo = 'sla'
    );
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_upcoming_sla() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_upcoming_sla() TO service_role;

-- Realtime is optional in non-Supabase environments; add the needed tables when
-- the standard Supabase publication exists and does not already contain them.
DO $$
DECLARE
  table_name text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH table_name IN ARRAY ARRAY['notificacoes', 'admin_messages'] LOOP
      IF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = table_name
      ) THEN
        EXECUTE pg_catalog.format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', table_name);
      END IF;
    END LOOP;
  END IF;
END $$;

ALTER TABLE public.notificacoes REPLICA IDENTITY FULL;
ALTER TABLE public.admin_messages REPLICA IDENTITY FULL;

-- ============================================================================
-- Origem: 20261012100000_harden_documents.sql
-- ============================================================================
-- Harden the optional documents module. The initial documents migration
-- exposed all stored files and signatures to every authenticated account.

ALTER TABLE public.documentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assinaturas_digitais ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "documentos_view_all" ON public.documentos;
DROP POLICY IF EXISTS "documentos_insert_own" ON public.documentos;
DROP POLICY IF EXISTS "documentos_update_own" ON public.documentos;
DROP POLICY IF EXISTS "documentos_delete_own" ON public.documentos;
DROP POLICY IF EXISTS documentos_select_owner_or_admin ON public.documentos;
DROP POLICY IF EXISTS documentos_insert_owner ON public.documentos;
DROP POLICY IF EXISTS documentos_update_owner ON public.documentos;
DROP POLICY IF EXISTS documentos_delete_owner ON public.documentos;

DROP POLICY IF EXISTS "assinaturas_view_all" ON public.assinaturas_digitais;
DROP POLICY IF EXISTS "assinaturas_insert_own" ON public.assinaturas_digitais;
DROP POLICY IF EXISTS assinaturas_select_owner_or_admin ON public.assinaturas_digitais;
DROP POLICY IF EXISTS assinaturas_insert_owner ON public.assinaturas_digitais;

REVOKE ALL ON public.documentos, public.assinaturas_digitais FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.documentos TO authenticated;
GRANT UPDATE (ordem) ON public.documentos TO authenticated;
GRANT SELECT, INSERT ON public.assinaturas_digitais TO authenticated;

CREATE OR REPLACE FUNCTION public.document_relations_belong_to_user(
  p_owner_id uuid,
  p_occurrence_id uuid,
  p_inspection_id uuid,
  p_order_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_owner_id = auth.uid()
    AND (
      p_occurrence_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.ocorrencias AS o
        WHERE o.id = p_occurrence_id
          AND (o.fiscal_registrou = auth.uid() OR o.fiscal_designado = auth.uid())
      )
    )
    AND (
      p_inspection_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.vistorias AS v
        WHERE v.id = p_inspection_id AND v.fiscal_id = auth.uid()
      )
    )
    AND (
      p_order_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.ordens_servico AS os
        WHERE os.id = p_order_id
          AND (os.fiscal_abertura = auth.uid() OR os.fiscal_designado = auth.uid())
      )
    );
$$;
REVOKE ALL ON FUNCTION public.document_relations_belong_to_user(uuid, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.document_relations_belong_to_user(uuid, uuid, uuid, uuid) TO authenticated;

CREATE POLICY documentos_select_owner_or_admin ON public.documentos FOR SELECT TO authenticated
  USING (public.is_admin() OR (public.is_active_fiscal() AND fiscal_id = auth.uid()));
CREATE POLICY documentos_insert_owner ON public.documentos FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR (
      public.is_active_fiscal()
      AND public.document_relations_belong_to_user(fiscal_id, ocorrencia_id, vistoria_id, ordem_servico_id)
    )
  );
CREATE POLICY documentos_update_owner ON public.documentos FOR UPDATE TO authenticated
  USING (public.is_admin() OR (public.is_active_fiscal() AND fiscal_id = auth.uid()))
  WITH CHECK (
    public.is_admin()
    OR (
      public.is_active_fiscal()
      AND public.document_relations_belong_to_user(fiscal_id, ocorrencia_id, vistoria_id, ordem_servico_id)
    )
  );
CREATE POLICY documentos_delete_owner ON public.documentos FOR DELETE TO authenticated
  USING (public.is_admin() OR (public.is_active_fiscal() AND fiscal_id = auth.uid()));

CREATE POLICY assinaturas_select_owner_or_admin ON public.assinaturas_digitais FOR SELECT TO authenticated
  USING (public.is_admin() OR (public.is_active_fiscal() AND fiscal_id = auth.uid()));
CREATE POLICY assinaturas_insert_owner ON public.assinaturas_digitais FOR INSERT TO authenticated
  WITH CHECK (
    fiscal_id = auth.uid()
    AND public.is_active_fiscal()
    AND (
      documento_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.documentos AS d
        WHERE d.id = documento_id AND d.fiscal_id = auth.uid()
      )
    )
  );

-- Never treat uploaded metadata as proof that a certificate or signature was
-- cryptographically verified. Real certificate validation needs a trusted CA.
CREATE OR REPLACE FUNCTION public.mark_signature_certificate_unverified()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.certificado_valido := false;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_mark_signature_certificate_unverified ON public.assinaturas_digitais;
CREATE TRIGGER trg_mark_signature_certificate_unverified
  BEFORE INSERT OR UPDATE ON public.assinaturas_digitais
  FOR EACH ROW EXECUTE FUNCTION public.mark_signature_certificate_unverified();
REVOKE ALL ON FUNCTION public.mark_signature_certificate_unverified() FROM PUBLIC, anon, authenticated;

-- Remove the old simulated RPCs; neither is used by the current app.
DROP FUNCTION IF EXISTS public.validar_certificado_digital(text, text, timestamptz, timestamptz);
DROP FUNCTION IF EXISTS public.gerar_hash_documento(text);

COMMENT ON TABLE public.assinaturas_digitais IS
  'Registros de assinatura manuscrita; não representam certificado ou assinatura digital validada';
COMMENT ON COLUMN public.assinaturas_digitais.certificado_valido IS
  'Campo legado; o sistema força false e não valida certificados digitais';
COMMENT ON COLUMN public.assinaturas_digitais.certificado_digital IS
  'Campo legado; não é validado pelo sistema';

-- ============================================================================
-- ANEXOS — modelo único de arquivos (desenho aprovado no passo 7 do plano)
-- ============================================================================
-- Até aqui o sistema guardava arquivo em CINCO lugares diferentes, todos como
-- base64 DENTRO do banco: `ocorrencias.fotos`, `vistorias.fotos_depois`,
-- `autos_infracao.assinatura_autuado`, `documentos.arquivo_data` e
-- `admin_messages.attachments`.
--
-- Medido em PostgreSQL real, com conteúdo incompressível, um ciclo de
-- fiscalização (ocorrência com 5 fotos + vistoria com 3 fotos) custava
-- ~7,8 MB, e 99,7% desse peso era conteúdo que nenhuma tela exibe. No plano
-- gratuito do Supabase (500 MB de banco) isso dá ~63 ciclos antes de encher.
--
-- A partir daqui o arquivo mora no Supabase Storage (bucket privado, lido por
-- URL assinada) e o banco guarda apenas o caminho.
--
-- Esta tabela descreve o arquivo de um REGISTRO de fiscalização (ocorrência,
-- vistoria, ordem de serviço, auto de infração ou mensagem). Os outros dois
-- usos de arquivo têm casa própria, e de propósito não viram linha aqui:
-- `documentos` é a biblioteca particular do fiscal (com título, ordem e
-- vínculo opcional a um registro) e `admin_messages.attachments` é a lista de
-- anexos da conversa, lida junto da mensagem. O mesmo arquivo em duas tabelas
-- seriam duas versões da mesma verdade — e a segunda sempre desatualiza.

CREATE TABLE IF NOT EXISTS public.anexos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Vínculo: exatamente UM destino por anexo, garantido pelo CHECK abaixo.
  -- São cinco colunas com chave estrangeira de verdade, em vez de um par
  -- genérico (entidade, entidade_id), porque só assim o banco impede anexo
  -- órfão — um par sem FK aceitaria qualquer id.
  ocorrencia_id uuid REFERENCES public.ocorrencias(id) ON DELETE CASCADE,
  vistoria_id uuid REFERENCES public.vistorias(id) ON DELETE CASCADE,
  ordem_servico_id uuid REFERENCES public.ordens_servico(id) ON DELETE CASCADE,
  auto_infracao_id uuid REFERENCES public.autos_infracao(id) ON DELETE CASCADE,
  mensagem_id uuid REFERENCES public.admin_messages(id) ON DELETE CASCADE,

  tipo text NOT NULL CHECK (
    tipo IN ('foto','foto_depois','assinatura','documento','relatorio','auto_infracao','anexo_mensagem')
  ),
  -- 'antes' (registro da ocorrência) ou 'depois' (vistoria). Esta coluna é o
  -- que mantém reversível a decisão sobre exibir as fotos de campo: a tela
  -- decide por `WHERE momento = ...`, o schema não precisa saber a resposta.
  -- Se a equipe optar por não exibir, é só parar de coletar.
  momento text CHECK (momento IS NULL OR momento IN ('antes','depois')),

  -- O arquivo NÃO mora no banco. Convenção do caminho no bucket sifau-anexos:
  --   {fiscal_id}/{ano}/{mes}/{anexo_id}.jpg
  -- O primeiro nível por fiscal faz a política de bucket caber em uma linha
  -- (cada fiscal alcança a própria pasta), e o id no nome evita colisão entre
  -- arquivos de mesmo nome enviados pelo usuário.
  storage_path text NOT NULL UNIQUE,
  arquivo_nome text,
  arquivo_tipo text,
  arquivo_bytes integer CHECK (arquivo_bytes IS NULL OR arquivo_bytes > 0),
  largura integer CHECK (largura IS NULL OR largura > 0),
  altura integer CHECK (altura IS NULL OR altura > 0),

  titulo text,
  descricao text,
  ordem integer NOT NULL DEFAULT 0,
  metadados jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_em timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT anexos_vinculo_unico CHECK (
    (ocorrencia_id IS NOT NULL)::int
    + (vistoria_id IS NOT NULL)::int
    + (ordem_servico_id IS NOT NULL)::int
    + (auto_infracao_id IS NOT NULL)::int
    + (mensagem_id IS NOT NULL)::int = 1
  )
);

CREATE INDEX IF NOT EXISTS idx_anexos_fiscal ON public.anexos(fiscal_id);
CREATE INDEX IF NOT EXISTS idx_anexos_ocorrencia ON public.anexos(ocorrencia_id);
CREATE INDEX IF NOT EXISTS idx_anexos_vistoria ON public.anexos(vistoria_id);
CREATE INDEX IF NOT EXISTS idx_anexos_ordem_servico ON public.anexos(ordem_servico_id);
CREATE INDEX IF NOT EXISTS idx_anexos_auto_infracao ON public.anexos(auto_infracao_id);
CREATE INDEX IF NOT EXISTS idx_anexos_mensagem ON public.anexos(mensagem_id);
CREATE INDEX IF NOT EXISTS idx_anexos_tipo ON public.anexos(tipo);
CREATE INDEX IF NOT EXISTS idx_anexos_criado_em ON public.anexos(criado_em DESC);

ALTER TABLE public.anexos ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.anexos FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.anexos TO authenticated;
-- O arquivo é imutável: por UPDATE só passam os campos de apresentação.
-- `storage_path` só é gravável no INSERT — nem o dono troca o arquivo de um
-- anexo existente, ele cria outro.
GRANT UPDATE (titulo, descricao, ordem) ON public.anexos TO authenticated;

-- Diz se o alvo do vínculo pertence a quem está pedindo. É SECURITY DEFINER
-- para poder ler as tabelas operacionais sem depender das políticas delas, e
-- porque o auth.uid() precisa ser o do usuário, não o do dono da função.
--
-- `autos_infracao` é o único vínculo sem coluna de fiscal: o dono vem do
-- vínculo dele (ordem de serviço ou ocorrência).
CREATE OR REPLACE FUNCTION public.attachment_links_belong_to_user(
  p_occurrence_id uuid,
  p_inspection_id uuid,
  p_order_id uuid,
  p_fine_id uuid,
  p_message_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    (
      p_occurrence_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.ocorrencias AS o
        WHERE o.id = p_occurrence_id
          AND (o.fiscal_registrou = auth.uid() OR o.fiscal_designado = auth.uid())
      )
    )
    AND (
      p_inspection_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.vistorias AS v
        WHERE v.id = p_inspection_id AND v.fiscal_id = auth.uid()
      )
    )
    AND (
      p_order_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.ordens_servico AS os
        WHERE os.id = p_order_id
          AND (os.fiscal_abertura = auth.uid() OR os.fiscal_designado = auth.uid())
      )
    )
    AND (
      p_fine_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.autos_infracao AS a
        WHERE a.id = p_fine_id
          AND (
            EXISTS (
              SELECT 1 FROM public.ordens_servico AS os
              WHERE os.id = a.os_id
                AND (os.fiscal_abertura = auth.uid() OR os.fiscal_designado = auth.uid())
            )
            OR EXISTS (
              SELECT 1 FROM public.ocorrencias AS o
              WHERE o.id = a.ocorrencia_id
                AND (o.fiscal_registrou = auth.uid() OR o.fiscal_designado = auth.uid())
            )
          )
      )
    )
    AND (
      p_message_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.admin_messages AS m
        WHERE m.id = p_message_id
          AND (
            (m.sender_type = 'fiscal' AND m.fiscal_id = auth.uid())
            OR (m.sender_type = 'admin' AND m.admin_id = auth.uid())
          )
      )
    );
$$;
REVOKE ALL ON FUNCTION public.attachment_links_belong_to_user(uuid, uuid, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.attachment_links_belong_to_user(uuid, uuid, uuid, uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS anexos_select_owner_admin_or_linked ON public.anexos;
DROP POLICY IF EXISTS anexos_insert_owner ON public.anexos;
DROP POLICY IF EXISTS anexos_update_owner_or_admin ON public.anexos;
DROP POLICY IF EXISTS anexos_delete_owner_or_admin ON public.anexos;

-- SELECT: o dono, o administrador, ou o fiscal vinculado ao alvo. O terceiro
-- caso é o que deixa o fiscal designado ver as fotos "antes" da ocorrência que
-- ele vai vistoriar, sem abrir o arquivo para os colegas.
CREATE POLICY anexos_select_owner_admin_or_linked ON public.anexos FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR (
      public.is_active_fiscal()
      AND (
        fiscal_id = auth.uid()
        OR public.attachment_links_belong_to_user(
             ocorrencia_id, vistoria_id, ordem_servico_id, auto_infracao_id, mensagem_id
           )
      )
    )
  );

-- INSERT: exige ser o dono E que o alvo do vínculo seja alcançável por quem
-- está inserindo. Sem a segunda parte, um fiscal poderia anexar arquivo no
-- registro de outro só acertando o id.
CREATE POLICY anexos_insert_owner ON public.anexos FOR INSERT TO authenticated
  WITH CHECK (
    fiscal_id = auth.uid()
    AND public.is_active_fiscal()
    AND public.attachment_links_belong_to_user(
          ocorrencia_id, vistoria_id, ordem_servico_id, auto_infracao_id, mensagem_id
        )
  );

CREATE POLICY anexos_update_owner_or_admin ON public.anexos FOR UPDATE TO authenticated
  USING (public.is_admin() OR (public.is_active_fiscal() AND fiscal_id = auth.uid()))
  WITH CHECK (public.is_admin() OR (public.is_active_fiscal() AND fiscal_id = auth.uid()));

CREATE POLICY anexos_delete_owner_or_admin ON public.anexos FOR DELETE TO authenticated
  USING (public.is_admin() OR (public.is_active_fiscal() AND fiscal_id = auth.uid()));

COMMENT ON TABLE public.anexos IS
  'Modelo único de arquivos. O conteúdo fica no Supabase Storage (bucket privado) e aqui mora só o storage_path.';
COMMENT ON COLUMN public.anexos.momento IS
  'Hora do registro na linha do tempo: antes (ocorrência) ou depois (vistoria).';
COMMENT ON COLUMN public.anexos.storage_path IS
  'sifau/{fiscal_id}/{ano}/{mes}/{anexo_id}.extensao — o arquivo nunca é gravado no banco.';

-- ============================================================================
-- FOTOS NO STORAGE — bucket privado, caminho no lugar do base64
-- ============================================================================
-- Até aqui a foto era gravada como base64 DENTRO da linha do banco:
-- `ocorrencias.fotos` e `vistorias.fotos_depois` somavam ~7,8 MB por ciclo de
-- fiscalização (uma ocorrência com 5 fotos mais uma vistoria com 3), e 99,7%
-- desse peso era conteúdo que nenhuma tela exibe. No plano gratuito do
-- Supabase (500 MB de banco) isso dá ~63 ciclos antes de encher.
--
-- A partir daqui o arquivo mora no bucket privado `sifau-anexos` e a linha
-- guarda só o CAMINHO do objeto — algumas dezenas de bytes. A tabela
-- `public.anexos` continua sendo quem descreve o arquivo: tipo, momento,
-- tamanho e dimensões.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'sifau-anexos',
  'sifau-anexos',
  false,                                -- privado: nada de URL permanente
  5 * 1024 * 1024,                      -- 5 MB, o limite já documentado no README
  ARRAY[
    'image/jpeg', 'image/png', 'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
-- `DO NOTHING` de propósito, e não `DO UPDATE`.
--
-- O SQL Editor executa o script inteiro como UMA transação: se um único
-- comando falhar por falta de privilégio, a instalação inteira é desfeita.
-- O papel do SQL Editor tem INSERT em `storage.buckets` (é o caminho que a
-- própria Supabase documenta para criar bucket por SQL), mas UPDATE em uma
-- tabela do serviço de Storage não é garantido em todo projeto.
--
-- Então: se o bucket não existe, ele é criado com os valores certos; se já
-- existe, o script não briga com ele. O roteiro de aplicação tem uma consulta
-- que confere `public = false`, que é a única configuração que importa aqui.
ON CONFLICT (id) DO NOTHING;

-- Convenção do caminho: {fiscal_id}/{ano}/{mes}/{anexo_id}.{ext}
--
-- O primeiro nível é o id do fiscal, e é isso que faz a política de acesso
-- caber em uma linha: cada fiscal só alcança a própria pasta. Não existe
-- política de leitura pública — o acesso é por URL assinada, gerada na hora
-- para quem tem direito ao arquivo.
--
-- `is_admin()` entra em leitura e exclusão porque o painel precisa auditar e
-- remover conteúdo; não entra no INSERT, que é sempre do dono do arquivo.

-- Exceção nomeada para o anexo da CONVERSA: o arquivo enviado pela administração
-- fica na pasta dela, e o fiscal destinatário da mensagem precisa conseguir
-- abri-lo. A função responde sim só para o arquivo preso a uma mensagem
-- endereçada a quem pergunta — não abre a pasta do administrador.
CREATE OR REPLACE FUNCTION public.can_read_message_attachment(p_object_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_messages AS m
    WHERE p_object_name = ANY (m.attachments)
      AND (
        m.fiscal_id = auth.uid()
        OR public.is_admin()
      )
  );
$$;

COMMENT ON FUNCTION public.can_read_message_attachment(text) IS
  'Diz se o usuário atual pode ler um arquivo do bucket pelo fato de ele estar anexado a uma mensagem da conversa dele. Não concede nada além disso.';

REVOKE ALL ON FUNCTION public.can_read_message_attachment(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_message_attachment(text) TO authenticated;

CREATE INDEX IF NOT EXISTS idx_admin_messages_attachments
  ON public.admin_messages USING gin (attachments);

DROP POLICY IF EXISTS anexos_storage_select ON storage.objects;
DROP POLICY IF EXISTS anexos_storage_insert ON storage.objects;
DROP POLICY IF EXISTS anexos_storage_update ON storage.objects;
DROP POLICY IF EXISTS anexos_storage_delete ON storage.objects;

CREATE POLICY anexos_storage_select ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'sifau-anexos'
    AND (
      public.is_admin()
      OR (storage.foldername(name))[1] = auth.uid()::text
      -- Arquivo anexado a uma mensagem da conversa de quem pergunta. É o que
      -- permite ao fiscal abrir o anexo que a administração enviou, sem abrir a
      -- pasta do administrador para mais nada.
      OR public.can_read_message_attachment(name)
    )
  );

CREATE POLICY anexos_storage_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'sifau-anexos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY anexos_storage_update ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'sifau-anexos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'sifau-anexos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY anexos_storage_delete ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'sifau-anexos'
    AND (
      public.is_admin()
      OR (storage.foldername(name))[1] = auth.uid()::text
    )
  );

-- ----------------------------------------------------------------------------
-- Guarda contra a volta do base64
-- ----------------------------------------------------------------------------
-- Trocar o conteúdo por caminho é o tipo de mudança que volta sem avisar: basta
-- uma tela nova chamar o upload do jeito antigo e o banco começa a inchar de
-- novo, de forma invisível, porque nada quebra na hora.
--
-- Este gatilho recusa qualquer valor que comece com `data:` — o prefixo de
-- arquivo embutido — nas colunas que passaram a guardar caminho. Ele só olha a
-- coluna citada (no UPDATE, apenas quando ela é alterada), então não pesa no
-- resto da operação.
CREATE OR REPLACE FUNCTION public.reject_inline_base64() RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  coluna text := TG_ARGV[0];
  valor jsonb := pg_catalog.to_jsonb(NEW);
  tipo text;
  item text;
BEGIN
  IF valor IS NULL THEN
    RETURN NEW;
  END IF;

  tipo := pg_catalog.jsonb_typeof(valor -> coluna);

  -- Coluna de lista: cada item é um arquivo (fotos da ocorrência e da vistoria).
  IF tipo = 'array' THEN
    FOR item IN SELECT pg_catalog.jsonb_array_elements_text(valor -> coluna) LOOP
      IF item LIKE 'data:%' THEN
        RAISE EXCEPTION
          'A coluna % não aceita arquivo embutido: suba o arquivo para o Storage e grave só o caminho.',
          coluna
          USING ERRCODE = '22023';
      END IF;
    END LOOP;

  -- Coluna de texto simples: o valor é o arquivo (assinatura do autuado).
  ELSIF tipo = 'string' THEN
    IF (valor ->> coluna) LIKE 'data:%' THEN
      RAISE EXCEPTION
        'A coluna % não aceita arquivo embutido: suba o arquivo para o Storage e grave só o caminho.',
        coluna
        USING ERRCODE = '22023';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.reject_inline_base64() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_ocorrencias_fotos_sem_base64 ON public.ocorrencias;
CREATE TRIGGER trg_ocorrencias_fotos_sem_base64
  BEFORE INSERT OR UPDATE OF fotos ON public.ocorrencias
  FOR EACH ROW EXECUTE FUNCTION public.reject_inline_base64('fotos');

DROP TRIGGER IF EXISTS trg_vistorias_fotos_sem_base64 ON public.vistorias;
CREATE TRIGGER trg_vistorias_fotos_sem_base64
  BEFORE INSERT OR UPDATE OF fotos_depois ON public.vistorias
  FOR EACH ROW EXECUTE FUNCTION public.reject_inline_base64('fotos_depois');

COMMENT ON COLUMN public.ocorrencias.fotos IS
  'Caminhos das fotos no bucket sifau-anexos (nunca o arquivo). A descrição de cada arquivo está em public.anexos.';
COMMENT ON COLUMN public.vistorias.fotos_depois IS
  'Caminhos das fotos "depois" no bucket sifau-anexos (nunca o arquivo). A descrição de cada arquivo está em public.anexos.';
COMMENT ON COLUMN public.anexos.storage_path IS
  'Caminho no bucket sifau-anexos: {fiscal_id}/{ano}/{mes}/{anexo_id}.extensao — o arquivo nunca é gravado no banco.';

-- ----------------------------------------------------------------------------
-- Assinatura do autuado: caminho no lugar do arquivo
-- ----------------------------------------------------------------------------
-- `autos_infracao.assinatura_autuado` guardava o PNG da assinatura colhida na
-- tela, em base64, dentro da linha. A assinatura é gerada como imagem a partir
-- de um canvas, então o arquivo é pequeno se comparado a uma foto — mas o
-- princípio é o mesmo das fotos de campo, e a regra precisa ser uma só: arquivo
-- mora no bucket, banco guarda o caminho.
--
-- O aplicativo continua montando o PDF do auto com a imagem em memória (o
-- jsPDF precisa dos bytes). O que muda é o que fica GRAVADO.
DROP TRIGGER IF EXISTS trg_autos_assinatura_sem_base64 ON public.autos_infracao;
CREATE TRIGGER trg_autos_assinatura_sem_base64
  BEFORE INSERT OR UPDATE OF assinatura_autuado ON public.autos_infracao
  FOR EACH ROW EXECUTE FUNCTION public.reject_inline_base64('assinatura_autuado');

COMMENT ON COLUMN public.autos_infracao.assinatura_autuado IS
  'Caminho da assinatura no bucket sifau-anexos (nunca o arquivo). A descrição do arquivo está em public.anexos.';

-- ----------------------------------------------------------------------------
-- Documentos do fiscal: caminho no lugar do arquivo
-- ----------------------------------------------------------------------------
-- `documentos.arquivo_data` guardava o arquivo inteiro em base64 (text NOT
-- NULL). É a biblioteca digitalizada do fiscal — PDF e Word, que são
-- justamente os formatos que não dá para recomprimir —, então é o ponto do
-- banco que mais cresce por upload, e a lista da tela trazia o conteúdo de
-- TODOS os documentos só para desenhar as miniaturas.
--
-- A coluna passa a se chamar `arquivo_path` e guarda o caminho no bucket. O
-- nome mudou junto porque `arquivo_data` descrevia o conteúdo que deixou de
-- existir: manter o nome antigo guardando um caminho é o tipo de meia-verdade
-- que faz o próximo leitor errar.
--
-- O bloco só renomeia se a coluna antiga existir, para que rodar este arquivo
-- de novo (ou aplicá-lo sobre um banco que já nasceu com o nome novo) não
-- quebre.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'documentos' AND column_name = 'arquivo_data'
  ) THEN
    ALTER TABLE public.documentos RENAME COLUMN arquivo_data TO arquivo_path;
  END IF;

  -- O nome da restrição NOT NULL é derivado do nome da coluna no momento da
  -- criação, e renomear a coluna NÃO renomeia a restrição: um banco migrado
  -- ficaria com `documentos_arquivo_data_not_null` descrevendo `arquivo_path`
  -- — um nome que mente sobre o conteúdo, e diferente de um banco novo. Foi a
  -- conferência de paridade entre os dois caminhos de instalação que pegou
  -- isso; sem ela a diferença só apareceria quando alguém comparasse os dois
  -- bancos.
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.documentos'::regclass
      AND conname = 'documentos_arquivo_data_not_null'
  ) THEN
    ALTER TABLE public.documentos
      RENAME CONSTRAINT documentos_arquivo_data_not_null TO documentos_arquivo_path_not_null;
  END IF;
END $$;

COMMENT ON COLUMN public.documentos.arquivo_path IS
  'Caminho do arquivo no bucket sifau-anexos: {fiscal_id}/{ano}/{mes}/{documento_id}.extensao (nunca o arquivo).';

-- A mesma guarda das fotos vale aqui: sem ela, uma tela antiga (ou um cliente
-- fora do app) volta a gravar base64 e o banco volta a crescer sem ninguém ver.
DROP TRIGGER IF EXISTS trg_documentos_arquivo_sem_base64 ON public.documentos;
CREATE TRIGGER trg_documentos_arquivo_sem_base64
  BEFORE INSERT OR UPDATE OF arquivo_path ON public.documentos
  FOR EACH ROW EXECUTE FUNCTION public.reject_inline_base64('arquivo_path');

-- ----------------------------------------------------------------------------
-- Anexos da conversa: caminho no lugar do arquivo
-- ----------------------------------------------------------------------------
-- `admin_messages.attachments` é a lista de arquivos que o administrador envia
-- ao fiscal no painel. Era mais um ponto com o arquivo dentro da linha, em
-- base64, e como a coluna é `text[]` (lista de textos) o formato antigo era
-- exatamente o mesmo das fotos: cada item era um data URL inteiro.
--
-- Agora cada item é o caminho no bucket sifau-anexos. O arquivo sobe pela pasta
-- de quem envia — o administrador —, que é a mesma regra das fotos: cada conta
-- escreve na própria pasta, e a política do bucket não precisa de exceção.
--
-- O que o formato antigo guardava e o novo não: o nome original do arquivo. A
-- coluna é uma lista de textos, e o caminho carrega o id do arquivo justamente
-- para não colidir com nomes repetidos. As telas baixam usando o nome do
-- caminho (`{id}.extensao`), que abre no programa certo por causa da extensão.
DROP TRIGGER IF EXISTS trg_admin_messages_attachments_sem_base64 ON public.admin_messages;
CREATE TRIGGER trg_admin_messages_attachments_sem_base64
  BEFORE INSERT OR UPDATE OF attachments ON public.admin_messages
  FOR EACH ROW EXECUTE FUNCTION public.reject_inline_base64('attachments');

COMMENT ON COLUMN public.admin_messages.attachments IS
  'Caminhos dos arquivos da conversa no bucket sifau-anexos (nunca o arquivo). Cada item é um caminho: {remetente_id}/{ano}/{mes}/{anexo_id}.extensao. O primeiro nível é a pasta de quem enviou, que é como a política do bucket autoriza a escrita.';

-- Fim da instalação. Guarde também as migrations em supabase/migrations/.
-- Tramitação de OS: notificação -> auto opcional -> embargo opcional -> conclusão.
-- A janela de correção começa na PRIMEIRA conclusão e nunca é prorrogada.
BEGIN;
ALTER TABLE public.ordens_servico ADD COLUMN IF NOT EXISTS fluxo jsonb NOT NULL DEFAULT '{}';
ALTER TABLE public.ordens_servico ADD COLUMN IF NOT EXISTS versao integer NOT NULL DEFAULT 0;
ALTER TABLE public.ordens_servico ADD COLUMN IF NOT EXISTS concluida_em timestamptz;
ALTER TABLE public.ordens_servico ADD COLUMN IF NOT EXISTS edicao_ate timestamptz;

CREATE TABLE IF NOT EXISTS public.os_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  os_id uuid NOT NULL REFERENCES public.ordens_servico(id),
  fiscal_id uuid NOT NULL REFERENCES public.fiscais(id),
  etapa text NOT NULL,
  versao integer NOT NULL,
  dados jsonb NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (os_id, versao)
);
ALTER TABLE public.os_historico ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.os_historico FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.os_historico TO authenticated;
DROP POLICY IF EXISTS os_historico_leitura ON public.os_historico;
CREATE POLICY os_historico_leitura ON public.os_historico FOR SELECT TO authenticated
USING (public.is_admin() OR (public.is_active_fiscal() AND EXISTS (
  SELECT 1 FROM public.ordens_servico o WHERE o.id = os_id
  AND (o.fiscal_abertura = auth.uid() OR o.fiscal_designado = auth.uid())
)));
DROP TRIGGER IF EXISTS os_historico_imutavel ON public.os_historico;
CREATE TRIGGER os_historico_imutavel BEFORE UPDATE OR DELETE ON public.os_historico
FOR EACH ROW EXECUTE FUNCTION public.block_auditoria_mutation();

-- Preserva os autos que já estavam vinculados antes da atualização. Não se
-- atribui uma autoria que o registro antigo não guardou.
UPDATE public.ordens_servico o SET fluxo = o.fluxo || jsonb_build_object(
  'auto_id', a.id, 'auto', to_jsonb(a) || jsonb_build_object(
    'fiscal_nome', 'Não registrado no auto anterior', 'endereco', o.endereco),
  'autos_anteriores', COALESCE((SELECT jsonb_agg(to_jsonb(anterior) ORDER BY anterior.created_at, anterior.id)
    FROM public.autos_infracao anterior WHERE anterior.os_id = o.id AND anterior.id <> a.id), '[]'::jsonb))
FROM public.autos_infracao a
WHERE o.id = a.os_id AND o.versao = 0 AND NOT (o.fluxo ? 'auto_id')
  AND a.id = (SELECT ultimo.id FROM public.autos_infracao ultimo WHERE ultimo.os_id = o.id
    ORDER BY ultimo.created_at DESC, ultimo.id DESC LIMIT 1);
INSERT INTO public.os_historico(os_id, fiscal_id, etapa, versao, dados)
  SELECT id, fiscal_abertura, 'migracao', versao, to_jsonb(o)
  FROM public.ordens_servico o
  ON CONFLICT (os_id, versao) DO NOTHING;

-- A OS agora contém dados pessoais de notificação/autuação: somente envolvidos
-- e administradores podem consultar o dossiê.
DROP POLICY IF EXISTS orders_select_approved ON public.ordens_servico;
CREATE POLICY orders_select_approved ON public.ordens_servico FOR SELECT TO authenticated
USING (public.is_admin() OR (public.is_active_fiscal() AND
  (fiscal_abertura = auth.uid() OR fiscal_designado = auth.uid())));

CREATE OR REPLACE FUNCTION public.proteger_os_encerrada() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF OLD.status IN ('Concluída', 'Cancelada') AND
     (OLD.edicao_ate IS NULL OR now() >= OLD.edicao_ate) THEN
    RAISE EXCEPTION 'OS encerrada definitivamente; disponível apenas para consulta.' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Preserve a OS no histórico; exclusão não permitida.' USING ERRCODE = '42501';
  END IF;
  IF OLD.concluida_em IS NOT NULL AND
     (NEW.concluida_em IS DISTINCT FROM OLD.concluida_em OR
      NEW.edicao_ate IS DISTINCT FROM OLD.edicao_ate OR NEW.status <> OLD.status) THEN
    RAISE EXCEPTION 'A conclusão e seu prazo não podem ser reiniciados.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS os_encerrada_protecao ON public.ordens_servico;
CREATE TRIGGER os_encerrada_protecao BEFORE UPDATE OR DELETE ON public.ordens_servico
FOR EACH ROW EXECUTE FUNCTION public.proteger_os_encerrada();
-- As mudanças operacionais passam pelo RPC (concorrência, prazo e histórico).
REVOKE UPDATE (status) ON public.ordens_servico FROM authenticated;

CREATE OR REPLACE FUNCTION public.proteger_auto_os() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE o public.ordens_servico; alvo uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.os_id IS DISTINCT FROM NEW.os_id THEN
    RAISE EXCEPTION 'Não é permitido desvincular ou transferir o auto da OS.';
  END IF;
  alvo := CASE WHEN TG_OP = 'DELETE' THEN OLD.os_id ELSE NEW.os_id END;
  IF alvo IS NOT NULL THEN
    IF current_user IN ('authenticated', 'anon') THEN
      RAISE EXCEPTION 'Use a tramitação da OS para registrar o auto.' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO o FROM public.ordens_servico WHERE id = alvo FOR UPDATE;
    IF o.status = 'Cancelada' OR (o.status = 'Concluída' AND
       (o.edicao_ate IS NULL OR now() >= o.edicao_ate)) THEN
      RAISE EXCEPTION 'OS encerrada; não é possível alterar seus autos.' USING ERRCODE = '42501';
    END IF;
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Preserve o auto no histórico.'; END IF;
    IF o.fluxo->'notificacao' IS NULL OR o.ocorrencia_id IS NULL THEN
      RAISE EXCEPTION 'Vincule uma denúncia e registre a notificação antes do auto.';
    END IF;
    IF NEW.ocorrencia_id IS DISTINCT FROM o.ocorrencia_id THEN
      RAISE EXCEPTION 'A denúncia do auto deve ser a mesma da OS.';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS auto_os_protecao ON public.autos_infracao;
CREATE TRIGGER auto_os_protecao BEFORE INSERT OR UPDATE OR DELETE ON public.autos_infracao
FOR EACH ROW EXECUTE FUNCTION public.proteger_auto_os();

CREATE OR REPLACE FUNCTION public.salvar_etapa_os(
  p_os_id uuid, p_versao integer, p_etapa text, p_dados jsonb DEFAULT '{}'
) RETURNS public.ordens_servico
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  o public.ordens_servico;
  a public.autos_infracao;
  ator uuid := auth.uid();
  nome_fiscal text;
  dados jsonb;
  auto_id uuid;
  ocorrencia uuid;
  assinatura text;
  lat double precision; lng double precision; precisao double precision; distancia double precision;
BEGIN
  IF ator IS NULL OR NOT (public.is_admin() OR public.is_active_fiscal()) THEN
    RAISE EXCEPTION 'Acesso negado.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO o FROM public.ordens_servico WHERE id = p_os_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'OS não encontrada.' USING ERRCODE = 'P0002'; END IF;
  IF NOT COALESCE((public.is_admin() OR o.fiscal_abertura = ator OR o.fiscal_designado = ator), false) THEN
    RAISE EXCEPTION 'Esta OS não está vinculada a você.' USING ERRCODE = '42501';
  END IF;
  IF o.status = 'Cancelada' OR (o.status = 'Concluída' AND
     (o.edicao_ate IS NULL OR now() >= o.edicao_ate)) THEN
    RAISE EXCEPTION 'Prazo encerrado. A OS está disponível apenas para consulta.' USING ERRCODE = '42501';
  END IF;
  IF p_versao IS DISTINCT FROM o.versao THEN
    RAISE EXCEPTION 'A OS foi atualizada em outro aparelho. Recarregue antes de salvar.' USING ERRCODE = '40001';
  END IF;
  IF p_dados IS NULL OR jsonb_typeof(p_dados) <> 'object' OR octet_length(p_dados::text) > 60000 THEN
    RAISE EXCEPTION 'Dados inválidos ou muito extensos.' USING ERRCODE = '22023';
  END IF;
  SELECT nome INTO nome_fiscal FROM public.fiscais WHERE id = ator;
  assinatura := NULLIF(p_dados->>'assinatura', '');
  IF assinatura IS NOT NULL AND (
    split_part(assinatura, '/', 1) <> ator::text OR
    NOT EXISTS (SELECT 1 FROM public.anexos x WHERE x.storage_path = assinatura
      AND x.fiscal_id = ator AND x.ordem_servico_id = o.id AND x.tipo = 'assinatura')
  ) THEN RAISE EXCEPTION 'Assinatura inválida ou não vinculada à OS.'; END IF;

  IF p_etapa = 'editar' THEN
    ocorrencia := NULLIF(p_dados->>'ocorrencia_id', '')::uuid;
    IF ocorrencia IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.ocorrencias c WHERE c.id = ocorrencia
      AND (public.is_admin() OR c.fiscal_registrou = ator OR c.fiscal_designado = ator)
    ) THEN RAISE EXCEPTION 'Escolha uma denúncia registrada por você ou designada a você.'; END IF;
    IF EXISTS (SELECT 1 FROM public.autos_infracao WHERE os_id = o.id)
       AND ocorrencia IS DISTINCT FROM o.ocorrencia_id THEN
      RAISE EXCEPTION 'A denúncia não pode mudar após a emissão de auto.';
    END IF;
    IF btrim(COALESCE(p_dados->>'descricao', '')) = '' OR
       btrim(COALESCE(p_dados->>'endereco', '')) = '' OR
       btrim(COALESCE(p_dados->>'requerente', '')) = '' THEN
      RAISE EXCEPTION 'Preencha descrição, endereço e requerente.';
    END IF;
    o.descricao := btrim(p_dados->>'descricao');
    o.endereco := btrim(p_dados->>'endereco');
    o.requerente := btrim(p_dados->>'requerente');
    o.ocorrencia_id := ocorrencia;
  ELSIF p_etapa IN ('notificacao', 'embargo') THEN
    IF btrim(COALESCE(p_dados->>'nome', '')) = '' OR
       btrim(COALESCE(p_dados->>'texto', '')) = '' OR
       btrim(COALESCE(p_dados->>'endereco', '')) = '' THEN
      RAISE EXCEPTION 'Informe responsável, endereço e descrição do documento.';
    END IF;
    IF p_etapa = 'embargo' AND NOT EXISTS (SELECT 1 FROM public.autos_infracao WHERE os_id = o.id) THEN
      RAISE EXCEPTION 'Registre o auto antes de emitir um embargo.';
    END IF;
    IF p_etapa = 'embargo' AND btrim(COALESCE(p_dados->>'fundamento', '')) = '' THEN
      RAISE EXCEPTION 'Informe o fundamento legal do embargo.';
    END IF;
    dados := jsonb_build_object('nome', btrim(p_dados->>'nome'),
      'documento', COALESCE(p_dados->>'documento', ''), 'endereco', btrim(p_dados->>'endereco'),
      'texto', btrim(p_dados->>'texto'), 'fundamento', COALESCE(p_dados->>'fundamento', ''),
      'ciencia', COALESCE(p_dados->>'ciencia', 'Não registrada'),
      'assinatura', assinatura, 'fiscal_nome', nome_fiscal, 'fiscal_id', ator,
      'registrado_em', COALESCE(o.fluxo->p_etapa->>'registrado_em', now()::text),
      'atualizado_em', now());
    IF dados->>'ciencia' NOT IN ('Assinou', 'Recusou', 'Ausente', 'Não registrada') THEN
      RAISE EXCEPTION 'Ciência inválida.';
    END IF;
    IF dados->>'ciencia' = 'Assinou' AND assinatura IS NULL THEN
      RAISE EXCEPTION 'Capture a assinatura ou altere a ciência.';
    END IF;
    o.fluxo := jsonb_set(o.fluxo, ARRAY[p_etapa], dados);
  ELSIF p_etapa = 'auto' THEN
    IF o.fluxo->'notificacao' IS NULL OR o.ocorrencia_id IS NULL THEN
      RAISE EXCEPTION 'Vincule uma denúncia e registre a notificação antes do auto.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.ocorrencias c WHERE c.id = o.ocorrencia_id
      AND (public.is_admin() OR c.fiscal_registrou = ator OR c.fiscal_designado = ator)) THEN
      RAISE EXCEPTION 'A denúncia não está vinculada a você.' USING ERRCODE = '42501';
    END IF;
    IF btrim(COALESCE(p_dados->>'autuado_nome', '')) = '' OR
       btrim(COALESCE(p_dados->>'autuado_documento', '')) = '' OR
       btrim(COALESCE(p_dados->>'artigo_legal', '')) = '' OR
       btrim(COALESCE(p_dados->>'tipo_infracao', '')) = '' OR
       btrim(COALESCE(p_dados->>'motivo', '')) = '' THEN
      RAISE EXCEPTION 'Preencha autuado, documento, infração, motivo e fundamento legal.';
    END IF;
    IF p_dados->>'ciencia' = 'Assinou' AND assinatura IS NULL THEN
      RAISE EXCEPTION 'Capture a assinatura ou altere a ciência.';
    END IF;
    auto_id := NULLIF(o.fluxo->>'auto_id', '')::uuid;
    IF auto_id IS NULL THEN
      INSERT INTO public.autos_infracao(os_id, ocorrencia_id, tipo_infracao, artigo_legal,
        valor_base, valor_multa, motivo, autuado_nome, autuado_documento,
        ciencia, assinatura_autuado, testemunha_nome, vencimento)
      VALUES (o.id, o.ocorrencia_id, p_dados->>'tipo_infracao', p_dados->>'artigo_legal',
        (p_dados->>'valor_base')::numeric, (p_dados->>'valor_multa')::numeric,
        p_dados->>'motivo', p_dados->>'autuado_nome', p_dados->>'autuado_documento',
        p_dados->>'ciencia', assinatura, NULLIF(p_dados->>'testemunha_nome', ''),
        (p_dados->>'vencimento')::date) RETURNING * INTO a;
    ELSE
      UPDATE public.autos_infracao SET tipo_infracao = p_dados->>'tipo_infracao',
        artigo_legal = p_dados->>'artigo_legal', valor_base = (p_dados->>'valor_base')::numeric,
        valor_multa = (p_dados->>'valor_multa')::numeric, motivo = p_dados->>'motivo',
        autuado_nome = p_dados->>'autuado_nome', autuado_documento = p_dados->>'autuado_documento',
        ciencia = p_dados->>'ciencia', assinatura_autuado = assinatura,
        testemunha_nome = NULLIF(p_dados->>'testemunha_nome', ''), vencimento = (p_dados->>'vencimento')::date
      WHERE id = auto_id AND os_id = o.id RETURNING * INTO a;
      IF NOT FOUND THEN RAISE EXCEPTION 'Auto vinculado não encontrado.'; END IF;
    END IF;
    o.fluxo := o.fluxo || jsonb_build_object('auto_id', a.id,
      'auto', to_jsonb(a) || jsonb_build_object('fiscal_nome', nome_fiscal,
        'fiscal_id', ator, 'endereco', o.endereco, 'atualizado_em', now()));
  ELSIF p_etapa = 'concluir' THEN
    IF btrim(COALESCE(p_dados->>'texto', '')) = '' THEN
      RAISE EXCEPTION 'Registre o resultado, inclusive quando não houver auto ou embargo.';
    END IF;
    o.status := 'Concluída';
    IF o.concluida_em IS NULL THEN
      o.concluida_em := now();
      o.edicao_ate := now() + interval '48 hours';
    END IF;
    o.fluxo := o.fluxo || jsonb_build_object('conclusao', jsonb_build_object(
      'texto', p_dados->>'texto', 'assinatura', assinatura, 'fiscal_nome', nome_fiscal,
      'fiscal_id', ator, 'registrado_em', o.concluida_em, 'atualizado_em', now()));
  ELSIF p_etapa = 'iniciar' THEN
    IF o.status <> 'Aberta' THEN RAISE EXCEPTION 'OS não está aberta.'; END IF;
    lat := (p_dados->>'latitude')::double precision;
    lng := (p_dados->>'longitude')::double precision;
    precisao := (p_dados->>'precisao')::double precision;
    IF (lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180 AND precisao BETWEEN 0 AND 100) IS NOT TRUE
       OR o.latitude IS NULL OR o.longitude IS NULL THEN
      RAISE EXCEPTION 'Capture uma localização válida com precisão para validar a proximidade.';
    END IF;
    distancia := 12742000 * asin(sqrt(least(1.0,
      power(sin(radians((o.latitude::double precision - lat) / 2)), 2) +
      cos(radians(lat)) * cos(radians(o.latitude::double precision)) *
      power(sin(radians((o.longitude::double precision - lng) / 2)), 2))));
    IF distancia + precisao > 100 THEN RAISE EXCEPTION 'A vistoria exige distância e margem de erro de até 100m.'; END IF;
    o.status := 'Em vistoria';
  ELSE
    RAISE EXCEPTION 'Etapa inválida.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.ordens_servico SET fluxo = o.fluxo, versao = versao + 1,
    status = o.status, concluida_em = o.concluida_em, edicao_ate = o.edicao_ate,
    descricao = o.descricao, endereco = o.endereco, requerente = o.requerente,
    ocorrencia_id = o.ocorrencia_id WHERE id = o.id RETURNING * INTO o;
  INSERT INTO public.os_historico(os_id, fiscal_id, etapa, versao, dados)
    VALUES (o.id, ator, p_etapa, o.versao, to_jsonb(o));
  RETURN o;
END;
$$;
REVOKE ALL ON FUNCTION public.salvar_etapa_os(uuid, integer, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.salvar_etapa_os(uuid, integer, text, jsonb) TO authenticated;

-- Retrato do nome do fiscal na emissão (não depende de alterações futuras no perfil).
CREATE OR REPLACE FUNCTION public.preparar_emissao_os() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  NEW.fluxo := jsonb_build_object('fiscal_abertura_nome',
    (SELECT f.nome FROM public.fiscais f WHERE f.id = NEW.fiscal_abertura));
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS os_emissao_identificacao ON public.ordens_servico;
CREATE TRIGGER os_emissao_identificacao BEFORE INSERT ON public.ordens_servico
FOR EACH ROW EXECUTE FUNCTION public.preparar_emissao_os();

-- Guarda a emissão inicial, valida o vínculo também para clientes fora do app.
CREATE OR REPLACE FUNCTION public.registrar_criacao_os() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.ocorrencia_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.ocorrencias c WHERE c.id = NEW.ocorrencia_id
    AND (public.is_admin() OR c.fiscal_registrou = auth.uid() OR c.fiscal_designado = auth.uid())
  ) THEN RAISE EXCEPTION 'Escolha uma denúncia registrada por você ou designada a você.'; END IF;
  INSERT INTO public.os_historico(os_id, fiscal_id, etapa, versao, dados)
    VALUES (NEW.id, NEW.fiscal_abertura, 'criacao', 0, to_jsonb(NEW));
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS os_criacao_historico ON public.ordens_servico;
CREATE TRIGGER os_criacao_historico AFTER INSERT ON public.ordens_servico
FOR EACH ROW EXECUTE FUNCTION public.registrar_criacao_os();

-- Protege arquivos que já integram um dossiê/revisão, inclusive contra remoção
-- pelo proprietário via API de Storage. O acesso continua privado e com RLS.
CREATE OR REPLACE FUNCTION public.arquivo_preservado_os(p_path text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.documentos d
    WHERE d.arquivo_path = p_path AND d.ordem_servico_id IS NOT NULL
      AND d.metadados->>'origem' = 'fluxo_os')
  OR EXISTS (SELECT 1 FROM public.os_historico h WHERE
    h.dados->'fluxo'->'notificacao'->>'assinatura' = p_path OR
    h.dados->'fluxo'->'auto'->>'assinatura_autuado' = p_path OR
    h.dados->'fluxo'->'embargo'->>'assinatura' = p_path OR
    h.dados->'fluxo'->'conclusao'->>'assinatura' = p_path OR
    EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(h.dados->'fluxo'->'autos_anteriores', '[]'::jsonb)) anterior
      WHERE anterior->>'assinatura_autuado' = p_path));
$$;
REVOKE ALL ON FUNCTION public.arquivo_preservado_os(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.arquivo_preservado_os(text) TO authenticated;
DROP POLICY IF EXISTS os_arquivo_sem_exclusao ON storage.objects;
CREATE POLICY os_arquivo_sem_exclusao ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated
USING (bucket_id <> 'sifau-anexos' OR NOT public.arquivo_preservado_os(name));
DROP POLICY IF EXISTS os_arquivo_sem_sobrescrita ON storage.objects;
CREATE POLICY os_arquivo_sem_sobrescrita ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
USING (bucket_id <> 'sifau-anexos' OR NOT public.arquivo_preservado_os(name))
WITH CHECK (bucket_id <> 'sifau-anexos' OR NOT public.arquivo_preservado_os(name));

CREATE OR REPLACE FUNCTION public.proteger_documento_os() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF OLD.ordem_servico_id IS NOT NULL AND OLD.metadados->>'origem' = 'fluxo_os' THEN
    RAISE EXCEPTION 'O dossiê da OS integra o histórico e não pode ser removido ou alterado.' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS documento_os_preservado ON public.documentos;
CREATE TRIGGER documento_os_preservado BEFORE UPDATE OR DELETE ON public.documentos
FOR EACH ROW EXECUTE FUNCTION public.proteger_documento_os();

CREATE OR REPLACE FUNCTION public.proteger_anexo_os() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF public.arquivo_preservado_os(OLD.storage_path) THEN
    RAISE EXCEPTION 'A assinatura integra uma revisão da OS e deve ser preservada.' USING ERRCODE = '42501';
  END IF;
  RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS anexo_os_preservado ON public.anexos;
CREATE TRIGGER anexo_os_preservado BEFORE DELETE ON public.anexos
FOR EACH ROW EXECUTE FUNCTION public.proteger_anexo_os();

COMMIT;
-- Decisão explícita do fiscal; não emitir não conclui a OS nem cria multa.
BEGIN;
CREATE OR REPLACE FUNCTION public.decidir_auto_os(
  p_os_id uuid, p_versao integer, p_emitir boolean, p_justificativa text DEFAULT ''
) RETURNS public.ordens_servico
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE o public.ordens_servico; ator uuid := auth.uid(); nome text;
BEGIN
  IF ator IS NULL OR NOT (public.is_admin() OR public.is_active_fiscal()) THEN
    RAISE EXCEPTION 'Acesso negado.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO o FROM public.ordens_servico WHERE id = p_os_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'OS não encontrada.' USING ERRCODE = 'P0002'; END IF;
  IF NOT COALESCE(public.is_admin() OR o.fiscal_abertura = ator OR o.fiscal_designado = ator, false) THEN
    RAISE EXCEPTION 'Esta OS não está vinculada a você.' USING ERRCODE = '42501';
  END IF;
  IF o.status = 'Cancelada' OR (o.status = 'Concluída' AND (o.edicao_ate IS NULL OR now() >= o.edicao_ate)) THEN
    RAISE EXCEPTION 'OS encerrada definitivamente; apenas consulta.' USING ERRCODE = '42501';
  END IF;
  IF p_versao IS DISTINCT FROM o.versao THEN
    RAISE EXCEPTION 'A OS foi atualizada. Recarregue antes de decidir.' USING ERRCODE = '40001';
  END IF;
  IF p_emitir IS NULL THEN RAISE EXCEPTION 'Escolha emitir ou não emitir o auto.'; END IF;
  IF EXISTS (SELECT 1 FROM public.autos_infracao WHERE os_id = o.id) THEN
    RAISE EXCEPTION 'Já existe um auto. A decisão não pode apagar ou cancelar um auto emitido.';
  END IF;
  IF NOT p_emitir AND char_length(btrim(COALESCE(p_justificativa, ''))) < 10 THEN
    RAISE EXCEPTION 'Explique a decisão de não emitir o auto (mínimo de 10 caracteres).';
  END IF;
  IF char_length(COALESCE(p_justificativa, '')) > 2000 THEN RAISE EXCEPTION 'Justificativa muito longa.'; END IF;
  SELECT f.nome INTO nome FROM public.fiscais f WHERE f.id = ator;
  UPDATE public.ordens_servico SET versao = versao + 1,
    fluxo = fluxo || jsonb_build_object('decisao_auto', jsonb_build_object(
      'decisao', CASE WHEN p_emitir THEN 'emitir' ELSE 'nao_emitir' END,
      'justificativa', btrim(COALESCE(p_justificativa, '')), 'fiscal_id', ator,
      'fiscal_nome', nome, 'registrado_em', now()))
    WHERE id = o.id RETURNING * INTO o;
  INSERT INTO public.os_historico(os_id, fiscal_id, etapa, versao, dados)
    VALUES (o.id, ator, 'decisao_auto', o.versao, to_jsonb(o));
  RETURN o;
END;
$$;
REVOKE ALL ON FUNCTION public.decidir_auto_os(uuid, integer, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decidir_auto_os(uuid, integer, boolean, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.proteger_auto_os() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE o public.ordens_servico; alvo uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.os_id IS DISTINCT FROM NEW.os_id THEN
    RAISE EXCEPTION 'Não é permitido desvincular ou transferir o auto da OS.';
  END IF;
  alvo := CASE WHEN TG_OP = 'DELETE' THEN OLD.os_id ELSE NEW.os_id END;
  IF alvo IS NOT NULL THEN
    IF current_user IN ('authenticated', 'anon') THEN
      RAISE EXCEPTION 'Use a tramitação da OS para registrar o auto.' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO o FROM public.ordens_servico WHERE id = alvo FOR UPDATE;
    IF o.status = 'Cancelada' OR (o.status = 'Concluída' AND (o.edicao_ate IS NULL OR now() >= o.edicao_ate)) THEN
      RAISE EXCEPTION 'OS encerrada; não é possível alterar seus autos.' USING ERRCODE = '42501';
    END IF;
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Preserve o auto no histórico.'; END IF;
    IF o.fluxo->'decisao_auto'->>'decisao' = 'nao_emitir' THEN
      RAISE EXCEPTION 'O fiscal escolheu não emitir. Registre uma nova decisão de emitir antes de gerar o auto.';
    END IF;
    IF o.fluxo->'notificacao' IS NULL OR o.ocorrencia_id IS NULL THEN
      RAISE EXCEPTION 'Vincule uma denúncia e registre a notificação antes do auto.';
    END IF;
    IF NEW.ocorrencia_id IS DISTINCT FROM o.ocorrencia_id THEN
      RAISE EXCEPTION 'A denúncia do auto deve ser a mesma da OS.';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
COMMIT;


-- Isolamento por conta. NÃO exclui, transfere ou reescreve registros existentes.
-- Atribuição/redistribuição desativadas nesta fase. Administradores mantêm gestão global.
BEGIN;
DO $$
BEGIN
  IF to_regclass('public.os_historico') IS NULL
     OR to_regprocedure('public.decidir_auto_os(uuid,integer,boolean,text)') IS NULL THEN
    RAISE EXCEPTION 'Atualização de privacidade exige o esquema de tramitação de OS já instalado. Pare e confira as migrations anteriores; nenhuma alteração foi aplicada.';
  END IF;
END;
$$;

-- Restrições adicionais (AND), resistentes a políticas permissivas legadas.
DROP POLICY IF EXISTS conta_ocorrencias ON public.ocorrencias;
CREATE POLICY conta_ocorrencias ON public.ocorrencias AS RESTRICTIVE FOR ALL TO authenticated
USING (public.is_admin() OR (public.is_active_fiscal() AND fiscal_registrou = auth.uid()))
WITH CHECK (public.is_admin() OR (public.is_active_fiscal() AND fiscal_registrou = auth.uid()));
DROP POLICY IF EXISTS conta_os ON public.ordens_servico;
CREATE POLICY conta_os ON public.ordens_servico AS RESTRICTIVE FOR ALL TO authenticated
USING (public.is_admin() OR (public.is_active_fiscal() AND fiscal_abertura = auth.uid()))
WITH CHECK (public.is_admin() OR (public.is_active_fiscal() AND fiscal_abertura = auth.uid()));
DROP POLICY IF EXISTS conta_vistorias ON public.vistorias;
CREATE POLICY conta_vistorias ON public.vistorias AS RESTRICTIVE FOR ALL TO authenticated
USING (public.is_admin() OR (public.is_active_fiscal() AND fiscal_id = auth.uid()))
WITH CHECK (public.is_admin() OR (public.is_active_fiscal() AND fiscal_id = auth.uid()
 AND EXISTS (SELECT 1 FROM public.ocorrencias o WHERE o.id = ocorrencia_id AND o.fiscal_registrou = auth.uid())));
DROP POLICY IF EXISTS inspections_insert_assigned ON public.vistorias;
CREATE POLICY inspections_insert_assigned ON public.vistorias FOR INSERT TO authenticated
WITH CHECK (public.is_admin() OR (public.is_active_fiscal() AND fiscal_id = auth.uid()
 AND EXISTS (SELECT 1 FROM public.ocorrencias o WHERE o.id = ocorrencia_id
 AND o.fiscal_registrou = auth.uid() AND o.status NOT IN ('Resolvida', 'Arquivada'))));

DROP POLICY IF EXISTS conta_autos ON public.autos_infracao;
CREATE POLICY conta_autos ON public.autos_infracao AS RESTRICTIVE FOR ALL TO authenticated
USING (public.is_admin() OR (public.is_active_fiscal() AND (
 (os_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.ordens_servico o WHERE o.id = os_id AND o.fiscal_abertura = auth.uid()))
 OR (os_id IS NULL AND EXISTS (SELECT 1 FROM public.ocorrencias o WHERE o.id = ocorrencia_id AND o.fiscal_registrou = auth.uid())))))
WITH CHECK (public.is_admin() OR (public.is_active_fiscal() AND (
 (os_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.ordens_servico o WHERE o.id = os_id AND o.fiscal_abertura = auth.uid()))
 OR (os_id IS NULL AND EXISTS (SELECT 1 FROM public.ocorrencias o WHERE o.id = ocorrencia_id AND o.fiscal_registrou = auth.uid())))));
DROP POLICY IF EXISTS fines_insert_related ON public.autos_infracao;
CREATE POLICY fines_insert_related ON public.autos_infracao FOR INSERT TO authenticated
WITH CHECK (public.is_admin() OR (public.is_active_fiscal() AND os_id IS NULL
 AND EXISTS (SELECT 1 FROM public.ocorrencias o WHERE o.id = ocorrencia_id AND o.fiscal_registrou = auth.uid())));

DROP POLICY IF EXISTS conta_auditoria ON public.auditoria;
CREATE POLICY conta_auditoria ON public.auditoria AS RESTRICTIVE FOR SELECT TO authenticated
USING (public.is_admin() OR (public.is_active_fiscal() AND EXISTS (
 SELECT 1 FROM public.ocorrencias o WHERE o.id = ocorrencia_id AND o.fiscal_registrou = auth.uid())));
DROP POLICY IF EXISTS conta_os_historico ON public.os_historico;
CREATE POLICY conta_os_historico ON public.os_historico AS RESTRICTIVE FOR SELECT TO authenticated
USING (public.is_admin() OR (public.is_active_fiscal() AND EXISTS (
 SELECT 1 FROM public.ordens_servico o WHERE o.id = os_id AND o.fiscal_abertura = auth.uid())));
DROP POLICY IF EXISTS conta_notificacoes ON public.notificacoes;
CREATE POLICY conta_notificacoes ON public.notificacoes AS RESTRICTIVE FOR SELECT TO authenticated
USING (public.is_admin() OR (public.is_active_fiscal() AND fiscal_id = auth.uid() AND
 (ocorrencia_id IS NULL OR EXISTS (SELECT 1 FROM public.ocorrencias o WHERE o.id = ocorrencia_id AND o.fiscal_registrou = auth.uid()))));

DROP POLICY IF EXISTS conta_anexos ON public.anexos;
CREATE POLICY conta_anexos ON public.anexos AS RESTRICTIVE FOR SELECT TO authenticated
USING (public.is_admin() OR (public.is_active_fiscal() AND (fiscal_id = auth.uid()
 OR (mensagem_id IS NOT NULL AND public.can_read_message_attachment(storage_path)))));
DROP POLICY IF EXISTS conta_storage_ativo ON storage.objects;
CREATE POLICY conta_storage_ativo ON storage.objects AS RESTRICTIVE FOR ALL TO authenticated
USING (bucket_id <> 'sifau-anexos' OR public.is_admin() OR public.is_active_fiscal())
WITH CHECK (bucket_id <> 'sifau-anexos' OR public.is_admin() OR public.is_active_fiscal());

-- Nenhum novo trabalho pode ser atribuído pelo cliente. Os valores antigos ficam intactos.
REVOKE INSERT (fiscal_designado) ON public.ordens_servico FROM authenticated;
CREATE OR REPLACE FUNCTION public.assign_occurrence(p_occurrence_id uuid, p_target_fiscal_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
 RAISE EXCEPTION 'Atribuição de trabalho desativada. Cada conta utiliza seus próprios registros.' USING ERRCODE = '42501';
END;
$$;
CREATE OR REPLACE FUNCTION public.redistribute_occurrence(p_occurrence_id uuid, p_target_fiscal_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
 RAISE EXCEPTION 'Redistribuição desativada nesta fase.' USING ERRCODE = '42501';
END;
$$;


CREATE OR REPLACE FUNCTION public.complete_inspection(
  p_vistoria_id uuid,
  p_occurrence_id uuid,
  p_fiscal_id uuid,
  p_arrival_at timestamptz,
  p_arrival_latitude numeric,
  p_arrival_longitude numeric,
  p_laudo text,
  p_acao_tomada text,
  p_valor_multa numeric,
  p_numero_processo text,
  p_fotos_depois text[],
  p_status text,
  p_note text
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF p_fiscal_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Fiscal da vistoria inválido' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.ocorrencias AS assigned
    WHERE assigned.id = p_occurrence_id
      AND (public.is_admin() OR assigned.fiscal_registrou = auth.uid())
      AND assigned.status IN ('Aberta', 'Triada', 'Atribuída', 'Em vistoria', 'Escalonada')
  ) THEN
    RAISE EXCEPTION 'A vistoria exige uma ocorrência sua, ainda não encerrada' USING ERRCODE = '42501';
  END IF;
  IF p_arrival_latitude NOT BETWEEN -90 AND 90
     OR p_arrival_longitude NOT BETWEEN -180 AND 180 THEN
    RAISE EXCEPTION 'Coordenadas de chegada inválidas' USING ERRCODE = '22023';
  END IF;
  IF pg_catalog.char_length(pg_catalog.btrim(COALESCE(p_laudo, ''))) < 10
     OR pg_catalog.char_length(pg_catalog.btrim(COALESCE(p_laudo, ''))) > 10000
     OR COALESCE(pg_catalog.cardinality(p_fotos_depois), 0) NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'Laudo ou fotos da vistoria inválidos' USING ERRCODE = '22023';
  END IF;
  IF p_acao_tomada IS NULL OR p_acao_tomada NOT IN ('Notificação', 'Multa', 'Encaminhamento', 'Orientação', 'Sem ação') THEN
    RAISE EXCEPTION 'Ação da vistoria inválida' USING ERRCODE = '22023';
  END IF;
  IF p_acao_tomada = 'Multa'
     AND (p_valor_multa IS NULL OR p_valor_multa < 0 OR NULLIF(pg_catalog.btrim(p_numero_processo), '') IS NULL) THEN
    RAISE EXCEPTION 'Multa exige valor não negativo e número de processo' USING ERRCODE = '22023';
  END IF;
  IF (p_acao_tomada = 'Encaminhamento') IS DISTINCT FROM (p_status = 'Escalonada') THEN
    RAISE EXCEPTION 'O status final não corresponde à ação da vistoria' USING ERRCODE = '22023';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('Resolvida', 'Escalonada') THEN
    RAISE EXCEPTION 'Status final inválido' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.set_config('sifau.audit_note', pg_catalog.left(
    COALESCE(NULLIF(pg_catalog.btrim(p_note), ''), 'Vistoria realizada'), 2000
  ), true);
  PERFORM pg_catalog.set_config('sifau.audit_latitude', p_arrival_latitude::text, true);
  PERFORM pg_catalog.set_config('sifau.audit_longitude', p_arrival_longitude::text, true);

  INSERT INTO public.vistorias (
    id, ocorrencia_id, fiscal_id, chegada_at, chegada_latitude, chegada_longitude,
    laudo, acao_tomada, valor_multa, numero_processo, fotos_depois
  ) VALUES (
    p_vistoria_id, p_occurrence_id, p_fiscal_id, p_arrival_at, p_arrival_latitude, p_arrival_longitude,
    pg_catalog.btrim(p_laudo), p_acao_tomada,
    CASE WHEN p_acao_tomada = 'Multa' THEN p_valor_multa ELSE NULL END,
    CASE WHEN p_acao_tomada = 'Multa' THEN p_numero_processo ELSE NULL END,
    COALESCE(p_fotos_depois, ARRAY[]::text[])
  ) ON CONFLICT (id) DO NOTHING;

  IF NOT EXISTS (
    SELECT 1 FROM public.vistorias AS existing
    WHERE existing.id = p_vistoria_id
      AND existing.ocorrencia_id = p_occurrence_id
      AND existing.fiscal_id = p_fiscal_id
  ) THEN
    RAISE EXCEPTION 'Identificador de vistoria já utilizado por outro registro' USING ERRCODE = '23505';
  END IF;

  UPDATE public.ocorrencias SET status = p_status WHERE id = p_occurrence_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ocorrência não encontrada ou sem permissão' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.document_relations_belong_to_user(
  p_owner_id uuid,
  p_occurrence_id uuid,
  p_inspection_id uuid,
  p_order_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_owner_id = auth.uid()
    AND (
      p_occurrence_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.ocorrencias AS o
        WHERE o.id = p_occurrence_id
          AND (o.fiscal_registrou = auth.uid())
      )
    )
    AND (
      p_inspection_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.vistorias AS v
        WHERE v.id = p_inspection_id AND v.fiscal_id = auth.uid()
      )
    )
    AND (
      p_order_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.ordens_servico AS os
        WHERE os.id = p_order_id
          AND (os.fiscal_abertura = auth.uid())
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.attachment_links_belong_to_user(
  p_occurrence_id uuid,
  p_inspection_id uuid,
  p_order_id uuid,
  p_fine_id uuid,
  p_message_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    (
      p_occurrence_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.ocorrencias AS o
        WHERE o.id = p_occurrence_id
          AND (o.fiscal_registrou = auth.uid())
      )
    )
    AND (
      p_inspection_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.vistorias AS v
        WHERE v.id = p_inspection_id AND v.fiscal_id = auth.uid()
      )
    )
    AND (
      p_order_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.ordens_servico AS os
        WHERE os.id = p_order_id
          AND (os.fiscal_abertura = auth.uid())
      )
    )
    AND (
      p_fine_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.autos_infracao AS a
        WHERE a.id = p_fine_id
          AND (
            EXISTS (
              SELECT 1 FROM public.ordens_servico AS os
              WHERE os.id = a.os_id
                AND (os.fiscal_abertura = auth.uid())
            )
            OR EXISTS (
              SELECT 1 FROM public.ocorrencias AS o
              WHERE a.os_id IS NULL AND o.id = a.ocorrencia_id
                AND (o.fiscal_registrou = auth.uid())
            )
          )
      )
    )
    AND (
      p_message_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.admin_messages AS m
        WHERE m.id = p_message_id
          AND (
            (m.sender_type = 'fiscal' AND m.fiscal_id = auth.uid())
            OR (m.sender_type = 'admin' AND m.admin_id = auth.uid())
          )
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.salvar_etapa_os(
  p_os_id uuid, p_versao integer, p_etapa text, p_dados jsonb DEFAULT '{}'
) RETURNS public.ordens_servico
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  o public.ordens_servico;
  a public.autos_infracao;
  ator uuid := auth.uid();
  nome_fiscal text;
  dados jsonb;
  auto_id uuid;
  ocorrencia uuid;
  assinatura text;
  lat double precision; lng double precision; precisao double precision; distancia double precision;
BEGIN
  IF ator IS NULL OR NOT (public.is_admin() OR public.is_active_fiscal()) THEN
    RAISE EXCEPTION 'Acesso negado.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO o FROM public.ordens_servico WHERE id = p_os_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'OS não encontrada.' USING ERRCODE = 'P0002'; END IF;
  IF NOT COALESCE((public.is_admin() OR o.fiscal_abertura = ator), false) THEN
    RAISE EXCEPTION 'Esta OS não está vinculada a você.' USING ERRCODE = '42501';
  END IF;
  IF o.status = 'Cancelada' OR (o.status = 'Concluída' AND
     (o.edicao_ate IS NULL OR now() >= o.edicao_ate)) THEN
    RAISE EXCEPTION 'Prazo encerrado. A OS está disponível apenas para consulta.' USING ERRCODE = '42501';
  END IF;
  IF p_versao IS DISTINCT FROM o.versao THEN
    RAISE EXCEPTION 'A OS foi atualizada em outro aparelho. Recarregue antes de salvar.' USING ERRCODE = '40001';
  END IF;
  IF p_dados IS NULL OR jsonb_typeof(p_dados) <> 'object' OR octet_length(p_dados::text) > 60000 THEN
    RAISE EXCEPTION 'Dados inválidos ou muito extensos.' USING ERRCODE = '22023';
  END IF;
  SELECT nome INTO nome_fiscal FROM public.fiscais WHERE id = ator;
  assinatura := NULLIF(p_dados->>'assinatura', '');
  IF assinatura IS NOT NULL AND (
    split_part(assinatura, '/', 1) <> ator::text OR
    NOT EXISTS (SELECT 1 FROM public.anexos x WHERE x.storage_path = assinatura
      AND x.fiscal_id = ator AND x.ordem_servico_id = o.id AND x.tipo = 'assinatura')
  ) THEN RAISE EXCEPTION 'Assinatura inválida ou não vinculada à OS.'; END IF;

  IF p_etapa = 'editar' THEN
    ocorrencia := NULLIF(p_dados->>'ocorrencia_id', '')::uuid;
    IF ocorrencia IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.ocorrencias c WHERE c.id = ocorrencia
      AND (public.is_admin() OR c.fiscal_registrou = ator)
    ) THEN RAISE EXCEPTION 'Escolha uma denúncia registrada pela sua conta.'; END IF;
    IF EXISTS (SELECT 1 FROM public.autos_infracao WHERE os_id = o.id)
       AND ocorrencia IS DISTINCT FROM o.ocorrencia_id THEN
      RAISE EXCEPTION 'A denúncia não pode mudar após a emissão de auto.';
    END IF;
    IF btrim(COALESCE(p_dados->>'descricao', '')) = '' OR
       btrim(COALESCE(p_dados->>'endereco', '')) = '' OR
       btrim(COALESCE(p_dados->>'requerente', '')) = '' THEN
      RAISE EXCEPTION 'Preencha descrição, endereço e requerente.';
    END IF;
    o.descricao := btrim(p_dados->>'descricao');
    o.endereco := btrim(p_dados->>'endereco');
    o.requerente := btrim(p_dados->>'requerente');
    o.ocorrencia_id := ocorrencia;
  ELSIF p_etapa IN ('notificacao', 'embargo') THEN
    IF btrim(COALESCE(p_dados->>'nome', '')) = '' OR
       btrim(COALESCE(p_dados->>'texto', '')) = '' OR
       btrim(COALESCE(p_dados->>'endereco', '')) = '' THEN
      RAISE EXCEPTION 'Informe responsável, endereço e descrição do documento.';
    END IF;
    IF p_etapa = 'embargo' AND NOT EXISTS (SELECT 1 FROM public.autos_infracao WHERE os_id = o.id) THEN
      RAISE EXCEPTION 'Registre o auto antes de emitir um embargo.';
    END IF;
    IF p_etapa = 'embargo' AND btrim(COALESCE(p_dados->>'fundamento', '')) = '' THEN
      RAISE EXCEPTION 'Informe o fundamento legal do embargo.';
    END IF;
    dados := jsonb_build_object('nome', btrim(p_dados->>'nome'),
      'documento', COALESCE(p_dados->>'documento', ''), 'endereco', btrim(p_dados->>'endereco'),
      'texto', btrim(p_dados->>'texto'), 'fundamento', COALESCE(p_dados->>'fundamento', ''),
      'ciencia', COALESCE(p_dados->>'ciencia', 'Não registrada'),
      'assinatura', assinatura, 'fiscal_nome', nome_fiscal, 'fiscal_id', ator,
      'registrado_em', COALESCE(o.fluxo->p_etapa->>'registrado_em', now()::text),
      'atualizado_em', now());
    IF dados->>'ciencia' NOT IN ('Assinou', 'Recusou', 'Ausente', 'Não registrada') THEN
      RAISE EXCEPTION 'Ciência inválida.';
    END IF;
    IF dados->>'ciencia' = 'Assinou' AND assinatura IS NULL THEN
      RAISE EXCEPTION 'Capture a assinatura ou altere a ciência.';
    END IF;
    o.fluxo := jsonb_set(o.fluxo, ARRAY[p_etapa], dados);
  ELSIF p_etapa = 'auto' THEN
    IF o.fluxo->'notificacao' IS NULL OR o.ocorrencia_id IS NULL THEN
      RAISE EXCEPTION 'Vincule uma denúncia e registre a notificação antes do auto.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.ocorrencias c WHERE c.id = o.ocorrencia_id
      AND (public.is_admin() OR c.fiscal_registrou = ator)) THEN
      RAISE EXCEPTION 'A denúncia não está vinculada a você.' USING ERRCODE = '42501';
    END IF;
    IF btrim(COALESCE(p_dados->>'autuado_nome', '')) = '' OR
       btrim(COALESCE(p_dados->>'autuado_documento', '')) = '' OR
       btrim(COALESCE(p_dados->>'artigo_legal', '')) = '' OR
       btrim(COALESCE(p_dados->>'tipo_infracao', '')) = '' OR
       btrim(COALESCE(p_dados->>'motivo', '')) = '' THEN
      RAISE EXCEPTION 'Preencha autuado, documento, infração, motivo e fundamento legal.';
    END IF;
    IF p_dados->>'ciencia' = 'Assinou' AND assinatura IS NULL THEN
      RAISE EXCEPTION 'Capture a assinatura ou altere a ciência.';
    END IF;
    auto_id := NULLIF(o.fluxo->>'auto_id', '')::uuid;
    IF auto_id IS NULL THEN
      INSERT INTO public.autos_infracao(os_id, ocorrencia_id, tipo_infracao, artigo_legal,
        valor_base, valor_multa, motivo, autuado_nome, autuado_documento,
        ciencia, assinatura_autuado, testemunha_nome, vencimento)
      VALUES (o.id, o.ocorrencia_id, p_dados->>'tipo_infracao', p_dados->>'artigo_legal',
        (p_dados->>'valor_base')::numeric, (p_dados->>'valor_multa')::numeric,
        p_dados->>'motivo', p_dados->>'autuado_nome', p_dados->>'autuado_documento',
        p_dados->>'ciencia', assinatura, NULLIF(p_dados->>'testemunha_nome', ''),
        (p_dados->>'vencimento')::date) RETURNING * INTO a;
    ELSE
      UPDATE public.autos_infracao SET tipo_infracao = p_dados->>'tipo_infracao',
        artigo_legal = p_dados->>'artigo_legal', valor_base = (p_dados->>'valor_base')::numeric,
        valor_multa = (p_dados->>'valor_multa')::numeric, motivo = p_dados->>'motivo',
        autuado_nome = p_dados->>'autuado_nome', autuado_documento = p_dados->>'autuado_documento',
        ciencia = p_dados->>'ciencia', assinatura_autuado = assinatura,
        testemunha_nome = NULLIF(p_dados->>'testemunha_nome', ''), vencimento = (p_dados->>'vencimento')::date
      WHERE id = auto_id AND os_id = o.id RETURNING * INTO a;
      IF NOT FOUND THEN RAISE EXCEPTION 'Auto vinculado não encontrado.'; END IF;
    END IF;
    o.fluxo := o.fluxo || jsonb_build_object('auto_id', a.id,
      'auto', to_jsonb(a) || jsonb_build_object('fiscal_nome', nome_fiscal,
        'fiscal_id', ator, 'endereco', o.endereco, 'atualizado_em', now()));
  ELSIF p_etapa = 'concluir' THEN
    IF btrim(COALESCE(p_dados->>'texto', '')) = '' THEN
      RAISE EXCEPTION 'Registre o resultado, inclusive quando não houver auto ou embargo.';
    END IF;
    o.status := 'Concluída';
    IF o.concluida_em IS NULL THEN
      o.concluida_em := now();
      o.edicao_ate := now() + interval '48 hours';
    END IF;
    o.fluxo := o.fluxo || jsonb_build_object('conclusao', jsonb_build_object(
      'texto', p_dados->>'texto', 'assinatura', assinatura, 'fiscal_nome', nome_fiscal,
      'fiscal_id', ator, 'registrado_em', o.concluida_em, 'atualizado_em', now()));
  ELSIF p_etapa = 'iniciar' THEN
    IF o.status <> 'Aberta' THEN RAISE EXCEPTION 'OS não está aberta.'; END IF;
    lat := (p_dados->>'latitude')::double precision;
    lng := (p_dados->>'longitude')::double precision;
    precisao := (p_dados->>'precisao')::double precision;
    IF (lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180 AND precisao BETWEEN 0 AND 100) IS NOT TRUE
       OR o.latitude IS NULL OR o.longitude IS NULL THEN
      RAISE EXCEPTION 'Capture uma localização válida com precisão para validar a proximidade.';
    END IF;
    distancia := 12742000 * asin(sqrt(least(1.0,
      power(sin(radians((o.latitude::double precision - lat) / 2)), 2) +
      cos(radians(lat)) * cos(radians(o.latitude::double precision)) *
      power(sin(radians((o.longitude::double precision - lng) / 2)), 2))));
    IF distancia + precisao > 100 THEN RAISE EXCEPTION 'A vistoria exige distância e margem de erro de até 100m.'; END IF;
    o.status := 'Em vistoria';
  ELSE
    RAISE EXCEPTION 'Etapa inválida.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.ordens_servico SET fluxo = o.fluxo, versao = versao + 1,
    status = o.status, concluida_em = o.concluida_em, edicao_ate = o.edicao_ate,
    descricao = o.descricao, endereco = o.endereco, requerente = o.requerente,
    ocorrencia_id = o.ocorrencia_id WHERE id = o.id RETURNING * INTO o;
  INSERT INTO public.os_historico(os_id, fiscal_id, etapa, versao, dados)
    VALUES (o.id, ator, p_etapa, o.versao, to_jsonb(o));
  RETURN o;
END;
$$;

CREATE OR REPLACE FUNCTION public.registrar_criacao_os() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.ocorrencia_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.ocorrencias c WHERE c.id = NEW.ocorrencia_id
    AND (public.is_admin() OR c.fiscal_registrou = auth.uid())
  ) THEN RAISE EXCEPTION 'Escolha uma denúncia registrada pela sua conta.'; END IF;
  INSERT INTO public.os_historico(os_id, fiscal_id, etapa, versao, dados)
    VALUES (NEW.id, NEW.fiscal_abertura, 'criacao', 0, to_jsonb(NEW));
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.decidir_auto_os(
  p_os_id uuid, p_versao integer, p_emitir boolean, p_justificativa text DEFAULT ''
) RETURNS public.ordens_servico
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE o public.ordens_servico; ator uuid := auth.uid(); nome text;
BEGIN
  IF ator IS NULL OR NOT (public.is_admin() OR public.is_active_fiscal()) THEN
    RAISE EXCEPTION 'Acesso negado.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO o FROM public.ordens_servico WHERE id = p_os_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'OS não encontrada.' USING ERRCODE = 'P0002'; END IF;
  IF NOT COALESCE(public.is_admin() OR o.fiscal_abertura = ator, false) THEN
    RAISE EXCEPTION 'Esta OS não está vinculada a você.' USING ERRCODE = '42501';
  END IF;
  IF o.status = 'Cancelada' OR (o.status = 'Concluída' AND (o.edicao_ate IS NULL OR now() >= o.edicao_ate)) THEN
    RAISE EXCEPTION 'OS encerrada definitivamente; apenas consulta.' USING ERRCODE = '42501';
  END IF;
  IF p_versao IS DISTINCT FROM o.versao THEN
    RAISE EXCEPTION 'A OS foi atualizada. Recarregue antes de decidir.' USING ERRCODE = '40001';
  END IF;
  IF p_emitir IS NULL THEN RAISE EXCEPTION 'Escolha emitir ou não emitir o auto.'; END IF;
  IF EXISTS (SELECT 1 FROM public.autos_infracao WHERE os_id = o.id) THEN
    RAISE EXCEPTION 'Já existe um auto. A decisão não pode apagar ou cancelar um auto emitido.';
  END IF;
  IF NOT p_emitir AND char_length(btrim(COALESCE(p_justificativa, ''))) < 10 THEN
    RAISE EXCEPTION 'Explique a decisão de não emitir o auto (mínimo de 10 caracteres).';
  END IF;
  IF char_length(COALESCE(p_justificativa, '')) > 2000 THEN RAISE EXCEPTION 'Justificativa muito longa.'; END IF;
  SELECT f.nome INTO nome FROM public.fiscais f WHERE f.id = ator;
  UPDATE public.ordens_servico SET versao = versao + 1,
    fluxo = fluxo || jsonb_build_object('decisao_auto', jsonb_build_object(
      'decisao', CASE WHEN p_emitir THEN 'emitir' ELSE 'nao_emitir' END,
      'justificativa', btrim(COALESCE(p_justificativa, '')), 'fiscal_id', ator,
      'fiscal_nome', nome, 'registrado_em', now()))
    WHERE id = o.id RETURNING * INTO o;
  INSERT INTO public.os_historico(os_id, fiscal_id, etapa, versao, dados)
    VALUES (o.id, ator, 'decisao_auto', o.versao, to_jsonb(o));
  RETURN o;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_upcoming_sla()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  inserted_count integer;
BEGIN
  INSERT INTO public.notificacoes (fiscal_id, ocorrencia_id, tipo, titulo, mensagem)
  SELECT
    o.fiscal_registrou,
    o.id,
    'sla',
    'Prazo de SLA próximo',
    'A ocorrência "' || o.categoria || '" em ' || o.bairro || ' vence em até 24 horas.'
  FROM public.ocorrencias AS o
  JOIN public.fiscais AS f ON f.id = o.fiscal_registrou
  WHERE f.notif_sla = true
    AND public.is_eligible_fiscal(o.fiscal_registrou)
    AND o.fiscal_registrou IS NOT NULL
    AND o.sla_deadline > now()
    AND o.sla_deadline <= now() + interval '24 hours'
    AND o.status NOT IN ('Resolvida', 'Arquivada')
    AND NOT EXISTS (
      SELECT 1 FROM public.notificacoes AS n
      WHERE n.fiscal_id = o.fiscal_registrou
        AND n.ocorrencia_id = o.id
        AND n.tipo = 'sla'
    );
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.account_isolation_ready() RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$ SELECT true; $$;
REVOKE ALL ON FUNCTION public.account_isolation_ready() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.account_isolation_ready() TO authenticated;

COMMIT;

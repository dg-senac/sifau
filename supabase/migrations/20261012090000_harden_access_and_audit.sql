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

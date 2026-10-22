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

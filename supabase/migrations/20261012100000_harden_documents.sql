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

-- ============================================================================
-- SIFAU — Sistema de Documentos
-- Adiciona suporte para galeria de fotos, histórico de documentos e 
-- assinaturas digitais avançadas com certificado
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
  arquivo_data text NOT NULL, -- Base64 do arquivo
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

-- Função para validar certificado digital (simulada)
CREATE OR REPLACE FUNCTION public.validar_certificado_digital(
  p_certificado text,
  p_emissor text,
  p_validade_inicio timestamptz,
  p_validade_fim timestamptz
)
RETURNS boolean AS $$
BEGIN
  -- Validações básicas
  IF p_certificado IS NULL OR length(p_certificado) < 100 THEN
    RETURN false;
  END IF;
  
  IF p_emissor IS NULL OR length(p_emissor) < 3 THEN
    RETURN false;
  END IF;
  
  IF p_validade_inicio IS NULL OR p_valididade_fim IS NULL THEN
    RETURN false;
  END IF;
  
  -- Verificar se o certificado está válido no momento atual
  IF now() < p_valididade_inicio OR now() > p_valididade_fim THEN
    RETURN false;
  END IF;
  
  -- Em produção, aqui seria feita a validação real do certificado
  -- usando uma autoridade certificadora
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função para gerar hash do documento
CREATE OR REPLACE FUNCTION public.gerar_hash_documento(p_data text)
RETURNS text AS $$
BEGIN
  RETURN encode(digest(p_data, 'sha256'), 'hex');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comentários
COMMENT ON TABLE public.documentos IS 'Sistema de documentos do SIFAU - fotos, assinaturas, relatórios';
COMMENT ON TABLE public.assinaturas_digitais IS 'Assinaturas digitais avançadas com certificado';
COMMENT ON COLUMN public.documentos.arquivo_data IS 'Dados do arquivo em base64';
COMMENT ON COLUMN public.documentos.metadados IS 'Metadados adicionais em JSON (ex: GPS, timestamp da foto, etc)';
COMMENT ON COLUMN public.assinaturas_digitais.certificado_digital IS 'Certificado digital em base64 para validação';

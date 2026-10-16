-- ============================================================================
-- ANEXOS — modelo único de arquivos
-- ============================================================================
-- Cria a tabela `public.anexos`, que passa a ser o ÚNICO lugar do schema que
-- descreve um arquivo. O conteúdo vai para o Supabase Storage (bucket privado,
-- lido por URL assinada) e o banco guarda só o `storage_path`.
--
-- Antes desta migration o arquivo era base64 dentro do banco, em cinco lugares:
-- `ocorrencias.fotos`, `vistorias.fotos_depois`, `autos_infracao.assinatura_autuado`,
-- `documentos.arquivo_data` e `admin_messages.attachments`. Medido em
-- PostgreSQL real, um ciclo de fiscalização custava ~7,8 MB — 99,7% disso em
-- conteúdo que nenhuma tela exibe.
--
-- Esta migration é ADITIVA: não remove tabela, não altera dado e não mexe em
-- nenhuma política existente. As tabelas antigas continuam no lugar até o
-- aplicativo terminar de migrar para a tabela nova; só depois elas saem.
--
-- Segura de aplicar em banco em uso.
-- ============================================================================

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
-- URL assinada) e o banco guarda apenas o caminho. Esta tabela é o ÚNICO
-- lugar do schema que descreve um arquivo.

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

  -- O arquivo NÃO mora no banco. Convenção do caminho:
  --   sifau/{fiscal_id}/{ano}/{mes}/{anexo_id}.jpg
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


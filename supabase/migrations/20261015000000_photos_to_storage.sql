-- ============================================================================
-- Fotos no Storage: bucket privado, caminho no lugar do base64
-- ============================================================================
-- `ocorrencias.fotos` e `vistorias.fotos_depois` deixam de guardar o arquivo em
-- base64 e passam a guardar o caminho do objeto no bucket privado
-- `sifau-anexos`. A descrição do arquivo (tipo, momento, tamanho, dimensões)
-- fica em `public.anexos`, criada na migration anterior.
--
-- Motivo, medido: um ciclo de fiscalização (ocorrência com 5 fotos + vistoria
-- com 3) pesava ~7,8 MB de banco, 99,7% disso em conteúdo que nenhuma tela
-- exibe. No plano gratuito (500 MB) isso dá ~63 ciclos antes de encher.
--
-- O que esta migration NÃO faz:
--   * não move arquivo nenhum (não existe arquivo antigo: o banco é novo);
--   * não remove as colunas `fotos` e `fotos_depois` — elas continuam
--     existindo, agora com caminhos. Isso mantém intacto o contrato do RPC
--     `complete_inspection`, que já valida "de 1 a 5 fotos", e o CHECK que
--     exige pelo menos uma foto na vistoria. Trocar a coluna por outra coisa
--     faria o app e o banco mudarem de forma ao mesmo tempo, que é o tipo de
--     mudança que gera defeito em campo.
--
-- Segura de aplicar em banco em uso.
-- ============================================================================

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
  item text;
BEGIN
  IF valor IS NULL OR pg_catalog.jsonb_typeof(valor -> coluna) <> 'array' THEN
    RETURN NEW;
  END IF;

  FOR item IN SELECT pg_catalog.jsonb_array_elements_text(valor -> coluna) LOOP
    IF item LIKE 'data:%' THEN
      RAISE EXCEPTION
        'A coluna % não aceita arquivo embutido: suba o arquivo para o Storage e grave só o caminho.',
        coluna
        USING ERRCODE = '22023';
    END IF;
  END LOOP;

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


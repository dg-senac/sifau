-- ============================================================================
-- SIFAU — Documentos do fiscal no Storage
-- ============================================================================
-- Terceiro e último ponto onde um arquivo entrava no banco: a biblioteca de
-- documentos do fiscal (`documentos.arquivo_data`, base64). A coluna passa a
-- guardar o caminho no bucket sifau-anexos, com o nome que diz isso.
--
-- Aplicar depois de 20261016000000_signature_to_storage.sql, que redefine
-- `reject_inline_base64` com o caso de coluna de texto.
-- ============================================================================

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

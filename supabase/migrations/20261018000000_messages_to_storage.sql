-- ============================================================================
-- SIFAU — Anexos da conversa no Storage
-- ============================================================================
-- Quarto ponto onde um arquivo entrava no banco: `admin_messages.attachments`
-- (text[]) guardava o data URL inteiro de cada anexo enviado pelo painel.
--
-- Cada item passa a ser o caminho no bucket sifau-anexos. O gatilho é o mesmo
-- das fotos, de propósito: uma tela antiga que voltasse a gravar base64 seria
-- recusada pelo banco em vez de encher a cota em silêncio.
--
-- Aplicar depois de 20261017000000_documents_to_storage.sql.
-- ============================================================================

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

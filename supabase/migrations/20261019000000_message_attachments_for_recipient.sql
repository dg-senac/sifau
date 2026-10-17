-- ============================================================================
-- SIFAU — O destinatário pode abrir o anexo da conversa
-- ============================================================================
-- Até aqui, o anexo que a administração enviava na conversa chegava à tela do
-- fiscal como um aviso: "Anexos disponíveis somente no painel administrativo".
-- O motivo era a política do bucket, e não uma escolha de produto.
--
-- A regra de pasta do Storage é que cada conta lê a própria pasta
-- (`{uid}/{ano}/{mes}/{arquivo}`), e o arquivo anexado a uma mensagem fica na
-- pasta de QUEM ENVIOU — o administrador. Então o fiscal não o alcançava, mesmo
-- sendo o destinatário da mensagem.
--
-- A correção é uma exceção estreita e nomeada: o fiscal passa a ler **o arquivo
-- que está preso a uma mensagem endereçada a ele**, e mais nada. Ele NÃO passa a
-- ler a pasta do administrador: um arquivo que está na pasta dele e não está em
-- nenhuma mensagem para esse fiscal continua fora de alcance, e isso é provado
-- em teste.
--
-- Aplicar depois de 20261018000000_messages_to_storage.sql.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- A pergunta que a política faz
-- ----------------------------------------------------------------------------
-- Por que uma função, em vez de escrever a consulta direto na política:
--
--   1. a política roda linha a linha; uma função `STABLE` recebe o caminho e
--      devolve sim/não, e o planejador consegue tratar isso como um filtro
--      barato;
--   2. a leitura de `admin_messages` precisa acontecer com as regras da própria
--      tabela desligadas — quem está lendo o arquivo é o destinatário, e a
--      mensagem pode estar marcada como lida em outro instante. `SECURITY
--      DEFINER` faz a consulta interna rodar com o dono da função, e a função
--      devolve apenas um booleano, nunca o conteúdo da mensagem;
--   3. fica um lugar só para corrigir a regra, com nome que se lê.
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
        -- O destinatário da mensagem: é o fiscal a quem a conversa pertence,
        -- independentemente de quem enviou.
        m.fiscal_id = auth.uid()
        -- A administração já lê tudo pelo bucket (a política de SELECT tem
        -- `is_admin()`); a condição fica aqui para a regra ser legível sozinha.
        OR public.is_admin()
      )
  );
$$;

COMMENT ON FUNCTION public.can_read_message_attachment(text) IS
  'Diz se o usuário atual pode ler um arquivo do bucket pelo fato de ele estar anexado a uma mensagem da conversa dele. Não concede nada além disso.';

REVOKE ALL ON FUNCTION public.can_read_message_attachment(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_message_attachment(text) TO authenticated;

-- A função procura um caminho dentro de uma lista (`= ANY(text[])`). O índice
-- GIN é o que faz essa procura não virar varredura de todas as mensagens a cada
-- arquivo aberto.
CREATE INDEX IF NOT EXISTS idx_admin_messages_attachments
  ON public.admin_messages USING gin (attachments);

-- ----------------------------------------------------------------------------
-- A política de leitura do bucket
-- ----------------------------------------------------------------------------
-- A única mudança em relação à política anterior é a terceira condição. As
-- outras duas continuam valendo exatamente como estavam: o dono da pasta e o
-- administrador.
--
-- O `DROP` antes do `CREATE` é o que torna esta migration re-executável — a
-- mesma regra que o roteiro de instalação exige de todo script aplicado à mão.
DROP POLICY IF EXISTS anexos_storage_select ON storage.objects;
CREATE POLICY anexos_storage_select ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'sifau-anexos'
    AND (
      public.is_admin()
      OR (storage.foldername(name))[1] = auth.uid()::text
      OR public.can_read_message_attachment(name)
    )
  );

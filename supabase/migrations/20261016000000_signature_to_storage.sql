-- ============================================================================
-- Assinatura do autuado: caminho no lugar do arquivo
-- ============================================================================
-- Fecha o terceiro ponto onde o arquivo ainda morava dentro da linha do banco,
-- depois das fotos de campo (20261015000000).
--
-- A função de guarda `reject_inline_base64` ganhou o caso de coluna de texto
-- simples: até aqui ela só olhava coluna de lista (`text[]`), e a assinatura do
-- autuado é um valor único. Com isso a mesma regra vale para os dois formatos:
-- arquivo vai para o bucket, banco guarda o caminho.
--
-- Segura de aplicar em banco em uso. Não altera dado existente: um banco em uso
-- que já tenha assinatura em base64 continua com ela até o app regravá-la, e a
-- guarda só age em INSERT/UPDATE.
-- ============================================================================

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

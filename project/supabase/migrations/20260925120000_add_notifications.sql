/*
# SIFAU notifications

1. New Tables
- `notificacoes`: per-fiscal notification inbox (assignment, SLA warning, status change), read/unread state.

2. Security
- RLS enabled; a fiscal can only select/update their own notifications.
- Inserts happen only via triggers (SECURITY DEFINER functions), not directly by clients.

3. Automation
- Trigger on `ocorrencias`: notifies the newly assigned fiscal when `fiscal_designado` changes.
- Trigger on `auditoria`: notifies the fiscal who opened the occurrence whenever its status changes.
*/

CREATE TABLE IF NOT EXISTS public.notificacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_id uuid NOT NULL REFERENCES public.fiscais(id) ON DELETE CASCADE,
  ocorrencia_id uuid REFERENCES public.ocorrencias(id) ON DELETE CASCADE,
  tipo text NOT NULL DEFAULT 'info' CHECK (tipo IN ('atribuicao', 'sla', 'status', 'info')),
  titulo text NOT NULL,
  mensagem text NOT NULL,
  lida boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notificacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Fiscal vê suas notificações"
  ON public.notificacoes FOR SELECT TO authenticated
  USING (fiscal_id = auth.uid());

CREATE POLICY "Fiscal marca como lida"
  ON public.notificacoes FOR UPDATE TO authenticated
  USING (fiscal_id = auth.uid())
  WITH CHECK (fiscal_id = auth.uid());

CREATE OR REPLACE FUNCTION public.notify_on_assignment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.fiscal_designado IS NOT NULL
     AND (OLD.fiscal_designado IS DISTINCT FROM NEW.fiscal_designado) THEN
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
  AFTER UPDATE ON public.ocorrencias
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_assignment();

CREATE OR REPLACE FUNCTION public.notify_on_status_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  registrante uuid;
BEGIN
  SELECT fiscal_registrou INTO registrante FROM public.ocorrencias WHERE id = NEW.ocorrencia_id;
  IF registrante IS NOT NULL AND registrante <> NEW.fiscal_id THEN
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

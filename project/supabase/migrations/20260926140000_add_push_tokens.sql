/*
# SIFAU push notification tokens

1. New Tables
- `push_tokens`: one row per device/token registered by a fiscal via the native app (Capacitor).

2. Security
- RLS enabled; a fiscal can insert/update/select only their own tokens.
- `token` is globally unique so upsert-by-token works across re-installs.
*/

CREATE TABLE IF NOT EXISTS public.push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_id uuid NOT NULL REFERENCES public.fiscais(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  platform text NOT NULL DEFAULT 'android',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Fiscal gerencia seus tokens"
  ON public.push_tokens FOR ALL TO authenticated
  USING (fiscal_id = auth.uid())
  WITH CHECK (fiscal_id = auth.uid());

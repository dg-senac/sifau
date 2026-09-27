/*
# SIFAU core municipal inspection data

1. New Tables
- `fiscais`: authenticated fiscal profiles, contact data, operational region, specialty and active state.
- `ocorrencias`: municipal reports, classification, location, SLA deadline, assignment and lifecycle status.
- `vistorias`: inspection arrival evidence, report, action and after-photo reference.
- `ordens_servico`: service orders, origin, execution assignment, location, deadlines and status.
- `autos_infracao`: fines and notification/payment information.
- `reincidencias`: prior-fine recurrence details and multiplier.
- `auditoria`: append-only status transition chain of custody.
- `sla_config`: configurable category response hours.
- `exportacoes_auditoria`: integrity records for exported audit data.

2. Security
- Every table enables RLS.
- All authenticated fiscal users can view and operate shared municipal records.
- Anonymous users have no access.
- Audit rows allow insert and select only; update and delete are intentionally absent.
- The `auditoria` table has a trigger that rejects updates and deletes.

3. Integrity
- All foreign keys reference auth users or existing operational records.
- Occurrence SLA deadline is stored explicitly for stable audit history.
- OS number is unique.
*/

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.fiscais (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome text NOT NULL,
  email text NOT NULL,
  telefone text NOT NULL,
  bairro text NOT NULL,
  especialidade text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sla_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria text NOT NULL UNIQUE,
  prazo_horas integer NOT NULL DEFAULT 72 CHECK (prazo_horas BETWEEN 1 AND 720),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ocorrencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_registrou uuid NOT NULL REFERENCES public.fiscais(id),
  fiscal_designado uuid REFERENCES public.fiscais(id),
  categoria text NOT NULL,
  subcategoria text NOT NULL,
  descricao text NOT NULL CHECK (char_length(descricao) >= 20),
  status text NOT NULL DEFAULT 'Aberta' CHECK (status IN ('Aberta','Triada','Atribuída','Em vistoria','Resolvida','Arquivada','Escalonada')),
  urgencia text NOT NULL DEFAULT 'Média' CHECK (urgencia IN ('Baixa','Média','Alta','Crítica')),
  latitude numeric(10,7),
  longitude numeric(10,7),
  bairro text NOT NULL,
  endereco text NOT NULL,
  fotos text[] NOT NULL DEFAULT '{}',
  sla_deadline timestamptz NOT NULL,
  duplicata_de uuid REFERENCES public.ocorrencias(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.vistorias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ocorrencia_id uuid NOT NULL REFERENCES public.ocorrencias(id) ON DELETE CASCADE,
  fiscal_id uuid NOT NULL REFERENCES public.fiscais(id),
  chegada_at timestamptz NOT NULL,
  chegada_latitude numeric(10,7) NOT NULL,
  chegada_longitude numeric(10,7) NOT NULL,
  laudo text NOT NULL,
  acao_tomada text NOT NULL CHECK (acao_tomada IN ('Notificação','Multa','Encaminhamento','Orientação','Sem ação')),
  valor_multa numeric(12,2),
  numero_processo text,
  fotos_depois text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ordens_servico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero text NOT NULL UNIQUE,
  origem text NOT NULL CHECK (origem IN ('Preventiva','Denúncia','Ofício','Comunicação Interna','Gestão')),
  ocorrencia_id uuid REFERENCES public.ocorrencias(id),
  requerente text NOT NULL,
  fiscal_abertura uuid NOT NULL REFERENCES public.fiscais(id),
  fiscal_designado uuid REFERENCES public.fiscais(id),
  apoio_operacional boolean NOT NULL DEFAULT false,
  orgao_apoio text,
  descricao text NOT NULL,
  legislacao text[] NOT NULL DEFAULT '{}',
  endereco text NOT NULL,
  latitude numeric(10,7),
  longitude numeric(10,7),
  emitida_em timestamptz NOT NULL DEFAULT now(),
  prazo_resposta timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'Aberta' CHECK (status IN ('Aberta','Em vistoria','Concluída','Cancelada'))
);

CREATE TABLE IF NOT EXISTS public.autos_infracao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  os_id uuid REFERENCES public.ordens_servico(id),
  ocorrencia_id uuid REFERENCES public.ocorrencias(id),
  tipo_infracao text NOT NULL,
  artigo_legal text NOT NULL,
  valor_base numeric(12,2) NOT NULL CHECK (valor_base >= 0),
  valor_multa numeric(12,2) NOT NULL CHECK (valor_multa >= 0),
  motivo text NOT NULL,
  autuado_nome text NOT NULL,
  autuado_documento text NOT NULL,
  ciencia text NOT NULL CHECK (ciencia IN ('Assinou','Recusou','Ausente')),
  testemunha_nome text,
  pagamento text NOT NULL DEFAULT 'Pendente' CHECK (pagamento IN ('Pendente','Pago','Cancelado')),
  vencimento date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.reincidencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auto_id uuid NOT NULL REFERENCES public.autos_infracao(id) ON DELETE CASCADE,
  documento_responsavel text NOT NULL,
  ocorrencia_original_id uuid REFERENCES public.ocorrencias(id),
  nivel integer NOT NULL CHECK (nivel >= 1),
  fator numeric(5,2) NOT NULL DEFAULT 1.5 CHECK (fator >= 1)
);

CREATE TABLE IF NOT EXISTS public.auditoria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ocorrencia_id uuid NOT NULL REFERENCES public.ocorrencias(id) ON DELETE CASCADE,
  status_anterior text,
  status_novo text NOT NULL,
  fiscal_id uuid NOT NULL REFERENCES public.fiscais(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  latitude numeric(10,7),
  longitude numeric(10,7),
  observacao text
);

CREATE TABLE IF NOT EXISTS public.exportacoes_auditoria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_id uuid NOT NULL REFERENCES public.fiscais(id),
  hash text NOT NULL,
  descricao text NOT NULL,
  quantidade integer NOT NULL CHECK (quantidade >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.block_auditoria_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'A trilha de auditoria e imutavel';
END;
$$;
DROP TRIGGER IF EXISTS auditoria_immutable ON public.auditoria;
CREATE TRIGGER auditoria_immutable BEFORE UPDATE OR DELETE ON public.auditoria FOR EACH ROW EXECUTE FUNCTION public.block_auditoria_mutation();

ALTER TABLE public.fiscais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sla_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ocorrencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vistorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ordens_servico ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.autos_infracao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reincidencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auditoria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exportacoes_auditoria ENABLE ROW LEVEL SECURITY;

DO $$ DECLARE t text; BEGIN FOR t IN SELECT unnest(ARRAY['fiscais','sla_config','ocorrencias','vistorias','ordens_servico','autos_infracao','reincidencias','exportacoes_auditoria']) LOOP
  EXECUTE format('DROP POLICY IF EXISTS "fiscal_select_%s" ON public.%I', t, t);
  EXECUTE format('DROP POLICY IF EXISTS "fiscal_insert_%s" ON public.%I', t, t);
  EXECUTE format('DROP POLICY IF EXISTS "fiscal_update_%s" ON public.%I', t, t);
  EXECUTE format('DROP POLICY IF EXISTS "fiscal_delete_%s" ON public.%I', t, t);
  EXECUTE format('CREATE POLICY "fiscal_select_%s" ON public.%I FOR SELECT TO authenticated USING (true)', t, t);
  EXECUTE format('CREATE POLICY "fiscal_insert_%s" ON public.%I FOR INSERT TO authenticated WITH CHECK (true)', t, t);
  EXECUTE format('CREATE POLICY "fiscal_update_%s" ON public.%I FOR UPDATE TO authenticated USING (true) WITH CHECK (true)', t, t);
  EXECUTE format('CREATE POLICY "fiscal_delete_%s" ON public.%I FOR DELETE TO authenticated USING (true)', t, t);
END LOOP; END $$;

DROP POLICY IF EXISTS "fiscal_select_auditoria" ON public.auditoria;
DROP POLICY IF EXISTS "fiscal_insert_auditoria" ON public.auditoria;
CREATE POLICY "fiscal_select_auditoria" ON public.auditoria FOR SELECT TO authenticated USING (true);
CREATE POLICY "fiscal_insert_auditoria" ON public.auditoria FOR INSERT TO authenticated WITH CHECK (true);

CREATE INDEX IF NOT EXISTS ocorrencias_status_idx ON public.ocorrencias(status);
CREATE INDEX IF NOT EXISTS ocorrencias_bairro_idx ON public.ocorrencias(bairro);
CREATE INDEX IF NOT EXISTS ocorrencias_sla_idx ON public.ocorrencias(sla_deadline);
CREATE INDEX IF NOT EXISTS auditoria_created_idx ON public.auditoria(created_at DESC);

INSERT INTO public.sla_config (categoria, prazo_horas) VALUES
('Buraco na via',72),('Iluminação pública',72),('Poluição sonora',24),('Entulho / lixo irregular',48),('Poda de árvore / risco de queda',24),('Vazamento de água / esgoto',24),('Ocupação irregular de calçada',72),('Sinalização de trânsito danificada',48),('Comércio/obra sem licença',120)
ON CONFLICT (categoria) DO NOTHING;
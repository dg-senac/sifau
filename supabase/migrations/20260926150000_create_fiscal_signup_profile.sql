CREATE OR REPLACE FUNCTION public.handle_new_fiscal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.fiscais (id, email, nome, telefone, bairro, especialidade)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NULLIF(btrim(NEW.raw_user_meta_data ->> 'nome'), ''),
      NULLIF(split_part(COALESCE(NEW.email, ''), '@', 1), ''),
      'Fiscal'
    ),
    COALESCE(NULLIF(btrim(NEW.raw_user_meta_data ->> 'telefone'), ''), ''),
    COALESCE(NULLIF(btrim(NEW.raw_user_meta_data ->> 'bairro'), ''), ''),
    NULLIF(btrim(NEW.raw_user_meta_data ->> 'especialidade'), '')
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_fiscal() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created_fiscal ON auth.users;
CREATE TRIGGER on_auth_user_created_fiscal
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_fiscal();
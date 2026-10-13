-- Diagnóstico administrativo do SIFAU.
-- Execute no SQL Editor do Supabase. Não insira administradores diretamente:
-- use public.bootstrap_admin(...) depois de criar a conta em Auth.

-- Confirme que a conta já existe em Supabase Auth:
SELECT id, email, created_at
FROM auth.users
WHERE lower(email) = lower('admin@prefeitura.gov.br');

-- Confirme que o registro administrativo foi criado:
SELECT id, email, nome, created_at
FROM public.administradores
WHERE lower(email) = lower('admin@prefeitura.gov.br');

-- Confirme que as funções esperadas existem:
SELECT routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'bootstrap_admin', 'is_admin', 'is_user_banned',
    'is_active_fiscal', 'is_eligible_fiscal'
  )
ORDER BY routine_name;

-- No contexto autenticado do usuário, is_admin() deve retornar true.
-- No SQL Editor a chamada usa o contexto administrativo do banco (sem JWT do app)
-- e, portanto, pode retornar false; a consulta à tabela acima é a verificação aqui.
SELECT public.is_admin() AS is_admin_for_current_auth_context;

-- Para promover uma conta já criada, troque o e-mail e execute separadamente:
-- SELECT public.bootstrap_admin('admin@prefeitura.gov.br', 'Administrador SIFAU');

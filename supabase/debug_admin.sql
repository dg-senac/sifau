-- ============================================================================
-- Script de Debug para Administrador
-- Execute este script para verificar se o administrador está configurado corretamente
-- ============================================================================

-- 1. Verificar se o usuário existe em auth.users
SELECT 'Usuário em auth.users:' as info;
SELECT id, email, created_at 
FROM auth.users 
WHERE email = 'douglasadmin2008@gmail.com';

-- 2. Verificar se o usuário está na tabela administradores
SELECT 'Usuário em administradores:' as info;
SELECT * FROM public.administradores WHERE email = 'douglasadmin2008@gmail.com';

-- 3. Verificar se o usuário está na tabela fiscais
SELECT 'Usuário em fiscais:' as info;
SELECT * FROM public.fiscais WHERE email = 'douglasadmin2008@gmail.com';

-- 4. Testar a função is_admin com o ID do usuário
SELECT 'Teste da função is_admin:' as info;
-- Substitua pelo ID real do usuário obtido na primeira query
SELECT public.is_admin() as is_admin_result;

-- 5. Verificar se as tabelas existem
SELECT 'Tabelas existentes:' as info;
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('administradores', 'fiscal_location', 'banned_users', 'admin_messages', 'admin_logs');

-- 6. Verificar se as funções existem
SELECT 'Funções existentes:' as info;
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name IN ('is_admin', 'is_user_banned', 'wipe_user_data');

-- 7. Verificar permissões da função is_admin
SELECT 'Permissões da função is_admin:' as info;
SELECT grantee, privilege_type 
FROM information_schema.role_routine_grants 
WHERE routine_name = 'is_admin' 
AND routine_schema = 'public';

-- Se o usuário não estiver na tabela administradores, execute:
-- INSERT INTO public.administradores (id, email, nome)
-- VALUES (
--   (SELECT id FROM auth.users WHERE email = 'douglasadmin2008@gmail.com' LIMIT 1),
--   'douglasadmin2008@gmail.com',
--   'Administrador Principal'
-- )
-- ON CONFLICT (email) DO NOTHING;
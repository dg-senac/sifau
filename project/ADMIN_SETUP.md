# Configuração do Sistema de Administração SIFAU

## Visão Geral
O sistema de administração permite que você gerencie todos os fiscais, veja suas localizações em tempo real, envie mensagens, e banifique usuários quando necessário.

## Configuração Inicial

### 1. Executar a Migration do Supabase
No painel do Supabase, vá em:
- SQL Editor
- Cole o conteúdo do arquivo: `supabase/migrations/20260927220000_add_admin_system.sql`
- Execute o script

Isso criará todas as tabelas necessárias para o sistema de administração.

### 2. Criar sua conta de administrador
1. **Primeiro**, crie uma conta normal no app com o email `douglasadmin2008@gmail.com`
2. **Depois**, no SQL Editor do Supabase, execute:

```sql
-- Inserir como administrador
INSERT INTO public.administradores (id, email, nome)
VALUES (
  (SELECT id FROM auth.users WHERE email = 'douglasadmin2008@gmail.com' LIMIT 1),
  'douglasadmin2008@gmail.com',
  'Administrador Principal'
)
ON CONFLICT (email) DO NOTHING;
```

⚠️ **Importante**: Execute este INSERT APENAS depois de criar a conta no app. Se o usuário não existir em `auth.users`, o INSERT falhará.

### 3. Gerar uma senha segura
Para sua conta de administrador, recomendo uma senha forte como:
```
SIFAU@Admin2026!Segura#$
```
Características:
- Mínimo 12 caracteres
- Letras maiúsculas e minúsculas
- Números
- Caracteres especiais (!@#$%^&*)
- Não usa palavras comuns

## Funcionalidades do Painel Admin

### 📊 Dashboard de Estatísticas
- Total de fiscais cadastrados
- Fiscais online agora
- Fiscais offline
- Usuários banidos
- Total de ocorrências
- Ocorrências resolvidas hoje

### 👥 Lista de Fiscais
- Visualização de todos os fiscais com status online/offline
- Informações detalhadas: nome, email, bairro, especialidade
- Estatísticas: número de ocorrências e resolvidas
- Última localização conhecida
- Nível de bateria do dispositivo

### 💬 Sistema de Chat
- Chat individual com cada fiscal
- Envio de mensagens de texto
- Anexos: imagens, vídeos, documentos
- Histórico de conversas
- Indicador de mensagens lidas

### 🚫 Sistema de Banimento
- Banimento temporário (1, 7, 30, 90 dias)
- Banimento permanente
- Motivo obrigatório do banimento
- Opção de apagar todos os dados do fiscal (wipe)
- Log de todas as ações de banimento

### 📍 Tracking de Localização
- Localização em tempo real dos fiscais
- Histórico de localizações
- Status online/offline automático
- Nível de bateria do dispositivo
- Precisão da localização

### 📋 Logs de Auditoria
- Registro de todas as ações do admin
- Timestamp de cada ação
- IP address quando disponível
- Detalhes em JSON de cada operação

### 📥 Exportação de Dados
- Exportar lista de fiscais em CSV
- Dados completos: ID, nome, email, telefone, bairro, etc.

## Como Usar

### Acessar o Painel Admin
1. Faça login com `douglasadmin2008@gmail.com`
2. O sistema detectará automaticamente que é administrador
3. Você será redirecionado para o painel administrativo

### Gerenciar Fiscais
- **Buscar**: Use a barra de busca para encontrar por nome, email ou bairro
- **Filtrar**: Filtre por status (Todos, Online, Offline)
- **Chat**: Clique no ícone de mensagem para abrir o chat
- **Banir**: Clique no ícone de banimento para bloquear um fiscal
- **Desbanir**: Clique no ícone de check verde para reativar um fiscal

### Enviar Mensagens
1. Clique no ícone de chat do fiscal
2. Digite sua mensagem
3. Opcionalmente, anexe arquivos (imagens, vídeos, documentos)
4. Clique em enviar

### Banir um Fiscal
1. Clique no ícone de banimento
2. Escolha o tipo: temporário ou permanente
3. Se temporário, selecione a duração
4. Informe o motivo do banimento
5. Confirme a ação
6. Opcionalmente, escolha apagar todos os dados do fiscal

### Ver Logs
1. Clique no ícone de documento no header
2. Visualize todas as ações realizadas
3. Veja detalhes de cada operação

## Segurança

### ⚠️ Importante
- Apenas usuários na tabela `administradores` têm acesso ao painel admin
- O sistema verifica automaticamente se é admin no login
- Todas as ações são logadas para auditoria
- Dados de fiscais banidos podem ser completamente removidos

### 🔐 Recomendações
- Use uma senha forte e única
- Não compartilhe suas credenciais
- Revise os logs regularmente
- Mantenha o Supabase atualizado
- Use conexões HTTPS sempre

## Solução de Problemas

### Admin não aparece no painel
Verifique se o email está na tabela `administradores`:
```sql
SELECT * FROM public.administradores WHERE email = 'douglasadmin2008@gmail.com';
```

### Localização não funciona
- Verifique se o navegador tem permissão de geolocalização
- O fiscal deve aceitar a permissão de localização
- Dispositivo móvel: verifique configurações de GPS

### Chat não funciona
- Verifique se as tabelas `admin_messages` foram criadas
- Ambos admin e fiscal precisam estar online

### Banimento não funciona
- Verifique a função `is_user_banned` no Supabase
- Confirme as políticas RLS da tabela `banned_users`

## Manutenção

### Limpar logs antigos
```sql
DELETE FROM public.admin_logs 
WHERE created_at < NOW() - INTERVAL '90 days';
```

### Limpar localizações antigas
```sql
DELETE FROM public.fiscal_location 
WHERE created_at < NOW() - INTERVAL '30 days';
```

### Limpar mensagens antigas
```sql
DELETE FROM public.admin_messages 
WHERE created_at < NOW() - INTERVAL '60 days';
```

## Suporte
Se tiver problemas, verifique:
1. As migrations foram executadas corretamente
2. As políticas RLS estão configuradas
3. As funções SQL foram criadas
4. O email do admin está na tabela correta
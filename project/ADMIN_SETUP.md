# Configuração segura do primeiro administrador

O painel não tem e-mail/senha embutidos no código. A autorização vem exclusivamente do registro em `public.administradores` e das políticas do Supabase.

## Projeto novo

1. Siga as instruções do [`README.md`](README.md) e execute `supabase/SETUP_COMPLETO.sql` uma única vez.
2. Crie a conta de administrador no app (ou em **Supabase → Authentication → Users**). Use uma senha forte escolhida pelo próprio administrador; não reutilize uma senha de exemplo.
3. No **SQL Editor** do Supabase, execute com o e-mail exato da conta criada:

```sql
SELECT public.bootstrap_admin('admin@prefeitura.gov.br', 'Administrador SIFAU');
```

A função procura o usuário existente em `auth.users` e cria/atualiza seu registro administrativo. Ela não é executável pelas roles `anon` e `authenticated`; faça a operação apenas no SQL Editor administrativo. Depois, encerre e inicie a sessão do usuário para carregar o painel.

> Troque o e-mail de exemplo pelo endereço institucional real. Não compartilhe a chave `service_role` nem a senha de banco.

## Aprovar e administrar fiscais

- Cadastros novos permanecem inativos até um administrador aprová-los no painel.
- O painel permite ativar/desativar usuários, aplicar/remover banimentos, enviar mensagens, consultar localizações operacionais e fazer triagem/atribuição manual de ocorrências sem responsável a fiscais ativos.
- A localização é enviada enquanto o app está aberto e o fiscal está ativo. Informe essa coleta aos usuários e limite o acesso administrativo conforme a política municipal.
- Banir ou desativar bloqueia novas operações protegidas por RLS; dados de fiscalização e trilha de auditoria são preservados.

## Integridade e privacidade

- Não use scripts antigos que insiram administradores com um e-mail fixo ou senha de exemplo.
- Não execute `DELETE` de auditoria, ocorrências ou localizações para “limpar” o banco. A trilha é preservada para rastreabilidade e retenção deve seguir a política formal do órgão.
- Em banco já existente, aplique apenas migrations ainda pendentes; **não** reexecute o SQL completo sobre produção.
- Teste o fluxo em staging e mantenha backup antes de alterações de acesso.

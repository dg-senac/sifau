# Guia de instalação e operação do SIFAU

## 1. Banco de dados Supabase

### Projeto novo

1. Crie um projeto Supabase e habilite o provedor Auth por e-mail/senha.
2. Execute [`supabase/SETUP_COMPLETO.sql`](supabase/SETUP_COMPLETO.sql) uma única vez no SQL Editor.
3. Crie o primeiro usuário e promova-o com `public.bootstrap_admin(...)` conforme [`ADMIN_SETUP.md`](ADMIN_SETUP.md).
4. Configure `.env` com `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.

### Projeto existente

Não rode o SQL completo em um banco já populado. Aplique apenas as migrations pendentes em ordem. A migration `20261012090000_harden_access_and_audit.sql` ativa o fluxo de aprovação, restringe acesso às tabelas, corrige operações de vistoria/redistribuição e registra alterações por trigger. Faça backup e teste em staging antes de produção.

A galeria de documentos faz parte da aplicação principal e é criada pelas migrations
`20260930130000_add_documents.sql` e `20261012100000_harden_documents.sql`, ambas já
incluídas em [`supabase/SETUP_COMPLETO.sql`](supabase/SETUP_COMPLETO.sql). Não há mais
cópia separada do app.

## 2. Cadastro, aprovação e permissões

- Novos cadastros recebem perfil fiscal inativo.
- O primeiro administrador precisa ser promovido manualmente no SQL Editor; depois, o painel pode aprovar os demais fiscais.
- Ocorrências novas entram sem fiscal responsável. O administrador as distribui manualmente na seção de triagem; a distribuição automática por região/disponibilidade ainda não faz parte do app.
- Apenas URLs/chaves públicas do Supabase ficam no frontend. Nunca use `service_role` em `.env` com prefixo `VITE_`.
- Banimento/desativação impede novas consultas e operações protegidas por RLS. A sessão revalida as permissões periodicamente.

## 3. Operação offline

Ocorrências e vistorias pendentes são mantidas no `localStorage` do aparelho, separadas por usuário, com IDs estáveis para permitir tentativas idempotentes. A sincronização é tentada ao voltar a conexão e, como fallback, a cada 30 segundos.

O conteúdo local não é criptografado pelo app. Em aparelho compartilhado, encerre a sessão e siga a política de proteção de dispositivos da organização. Evite registrar dados além do necessário.

## 4. Auto de infração e assinatura manuscrita

Ao concluir uma vistoria com ação “Multa”, o fiscal pode preencher os dados e gerar um PDF. O campo capturado no canvas é uma **imagem manuscrita**; ele não valida identidade, certificado digital ou assinatura digital qualificada. A adequação jurídica do auto, da ciência e do fluxo de guarda deve ser aprovada pela assessoria jurídica e pela política documental do órgão.

## 5. Push nativo (opcional: Capacitor + Firebase FCM HTTP v1)

As notificações internas do app funcionam sem FCM. O push do sistema operacional exige projeto Firebase, credencial de conta de serviço e configuração do Supabase Edge Function.

### 5.1 Android

1. Confirme o `appId` em `capacitor.config.ts` (atualmente `br.recife.sifau`).
2. No Firebase Console, adicione um app Android com o mesmo package name e baixe `google-services.json` para `android/app/google-services.json`.
3. Habilite Firebase Cloud Messaging HTTP v1 e crie uma conta de serviço com permissão de envio. Guarde o JSON privado fora do repositório.
4. Gere/sincronize os arquivos nativos:

```bash
npm ci
npm run build
npx cap sync android
```

O APK de debug pode ser gerado com `cd android && ./gradlew assembleDebug` (JDK 17). Para o workflow do GitHub Actions, configure os secrets `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`; sem eles o job para com uma mensagem clara. O push nativo no APK do CI é opcional: salve o conteúdo de `google-services.json` em Base64 no secret `GOOGLE_SERVICES_JSON`. O arquivo original e o APK não devem ser commitados.

### 5.2 Supabase Edge Function e webhook privado

Instale/entre na Supabase CLI e vincule o projeto. Configure um segredo aleatório forte para o webhook e o JSON da conta de serviço como secrets da Edge Function:

```bash
supabase secrets set PUSH_WEBHOOK_SECRET="<segredo-aleatorio>" FCM_SERVICE_ACCOUNT_JSON="$(cat /caminho/seguro/service-account.json)"
supabase functions deploy send-push --no-verify-jwt
```

`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` são disponibilizados no ambiente das Edge Functions do projeto Supabase. Não os coloque no frontend.

No painel Supabase, crie um **Database Webhook** para `public.notificacoes` no evento `INSERT`:

- Método: `POST`
- URL: `https://<project-ref>.supabase.co/functions/v1/send-push`
- Header: `Authorization: Bearer <o mesmo PUSH_WEBHOOK_SECRET>`
- Header: `Content-Type: application/json`

O segredo do webhook deve ser independente da anon key e rotacionado se exposto. A função envia apenas para fiscais ativos/não banidos e limpa tokens FCM que retornam `UNREGISTERED`.

### 5.3 Alertas de SLA (opcional)

A função de banco `public.notify_upcoming_sla()` cria alertas para prazos que vencem nas próximas 24 horas, no máximo uma vez por ocorrência. Para executá-la automaticamente, habilite `pg_cron` em **Database → Extensions** e agende-a uma única vez pelo SQL Editor:

```sql
SELECT cron.schedule(
  'sifau-upcoming-sla',
  '*/15 * * * *',
  'SELECT public.notify_upcoming_sla();'
);
```

Se preferir não habilitar `pg_cron`, invoque a função com um job confiável usando uma role de banco autorizada. Não exponha credenciais administrativas no frontend.

## 6. Verificações antes de produção

```bash
npm ci
npm run typecheck
npm run lint
npm run build
npm audit
```

O setup SQL e as migrations foram validados localmente com parser PostgreSQL e smoke tests em PGlite usando um esquema Auth simulado. Ainda é obrigatório validar as migrations em um projeto Supabase de staging antes de aplicar em produção.

# SIFAU — Guia das novas funcionalidades

## 1. Banco de dados novo (Supabase)
Se você vai usar um projeto Supabase **novo** (do zero):
1. Crie o projeto em supabase.com.
2. Abra **SQL Editor** e cole o conteúdo de `supabase/SETUP_COMPLETO.sql` (arquivo único
   com todas as tabelas, RLS e triggers). Rode uma única vez.
3. Em **Project Settings > API**, copie a URL e a `anon key` e coloque no `.env`:
   ```
   VITE_SUPABASE_URL=...
   VITE_SUPABASE_ANON_KEY=...
   ```
4. Em **Authentication > Providers**, deixe e-mail/senha habilitado (é o que a tela de
   login usa).

Se você já tinha o banco antigo, basta rodar só as duas migrations novas:
`20260925120000_add_notifications.sql` e `20260926140000_add_push_tokens.sql`.

## 2. Modo offline real
Já funciona sem configuração extra. Quando o app está sem internet:
- Registrar ocorrência e finalizar vistoria são salvos numa fila local
  (`localStorage`) em vez de falhar.
- Um banner "X registros pendentes" aparece no topo das telas, com botão
  "Sincronizar" manual.
- Ao voltar a conexão (evento `online` do navegador, ou a cada 30s), o app
  tenta reenviar tudo sozinho, na ordem em que foi criado.
- Fotos já são guardadas como base64 dentro do próprio registro, então não
  dependem de upload separado para funcionar offline.

## 3. PDF do auto de infração
Ao finalizar uma vistoria com ação **"Multa"**, o app abre automaticamente a
tela **"Emitir auto de infração"**: dados do autuado, tipo de infração,
artigo legal, valores, e um campo de **ciência** (Assinou / Recusou / Ausente).
Se "Assinou", aparece um campo de assinatura por toque (canvas) para o autuado
assinar no próprio aparelho. Ao salvar, o app gera um PDF pronto para
compartilhar ou imprimir, com todos os dados e a assinatura embutida.

## 4. Push notifications nativas (Capacitor + Firebase)
As notificações dentro do app (sino, tela de Notificações, tempo real) já
funcionam sem nada extra. Para elas también chegarem como **notificação nativa
do celular** (mesmo com o app fechado), é preciso gerar o app Android com
Capacitor e configurar o Firebase Cloud Messaging (FCM). Passo a passo:

### 4.1 Gerar o projeto Android (uma vez)
```bash
npm install
npm run build
npx cap add android
npx cap sync android
```
Isso cria a pasta `android/` (não incluída neste zip, pois é gerada pela
ferramenta do Capacitor).

### 4.2 Criar o projeto Firebase
1. Acesse console.firebase.google.com e crie um projeto.
2. Adicione um app Android com o pacote `br.recife.sifau` (mesmo `appId` do
   `capacitor.config.ts`).
3. Baixe o `google-services.json` gerado e coloque em `android/app/google-services.json`.
4. Em `android/build.gradle`, adicione o classpath do Google Services:
   ```gradle
   dependencies {
     classpath 'com.google.gms:google-services:4.4.2'
   }
   ```
5. Em `android/app/build.gradle`, no final do arquivo:
   ```gradle
   apply plugin: 'com.google.gms.google-services'
   ```
6. Em **Project Settings > Cloud Messaging** no Firebase, copie a **Server key**
   (API legada do Cloud Messaging — se estiver desabilitada, ative em "Cloud
   Messaging API (Legacy)" no Google Cloud Console).

### 4.3 Configurar o Supabase para enviar o push
```bash
supabase secrets set FCM_SERVER_KEY=coloque_a_server_key_aqui
supabase functions deploy send-push
```
Depois, em **Database > Webhooks** no painel do Supabase, crie um webhook:
- Tabela: `notificacoes`
- Evento: `INSERT`
- Tipo: `HTTP Request` → URL da função `send-push`
- Header: `Authorization: Bearer <sua anon key>`

Pronto: sempre que uma notificação for criada (atribuição de ocorrência,
mudança de status), o fiscal recebe também uma notificação nativa no celular.

### 4.4 Gerar o APK
O workflow `.github/workflows/build-apk.yml` já faz isso automaticamente a
cada push na branch `main` (ou manualmente pela aba Actions do GitHub). Ele
precisa dos secrets `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` configurados
em **Settings > Secrets and variables > Actions** do repositório. Se for usar
push notifications, também suba o `google-services.json` como secret em Base64
(`GOOGLE_SERVICES_JSON`) e descomente o passo correspondente no workflow.

> Em navegador comum (sem instalar o APK), o app funciona normalmente, só que
> sem a notificação nativa fora do app — as notificações continuam aparecendo
> no sino e na tela de Notificações em tempo real.

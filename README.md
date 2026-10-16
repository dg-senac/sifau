# SIFAU

Aplicativo web/mobile para registro, atribuição e fiscalização de ocorrências urbanas. Usa Supabase Auth, PostgreSQL/RLS, sincronização offline, galeria de documentos e geração de auto de infração em PDF.

## Executar localmente

Requisitos: Node.js 20 ou compatível com Vite 6.

```bash
npm ci
cp .env.example .env
```

Preencha no `.env` apenas `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (chave pública/anon). **Nunca** coloque `service_role`, senha de banco ou chave privada no frontend. Depois:

```bash
npm run dev
```

Validação local:

```bash
npm run typecheck
npm run lint
npm run build
npm audit
```

## Supabase

### Projeto novo

1. Crie um projeto Supabase e habilite Auth por e-mail/senha.
2. No SQL Editor, execute **uma vez** [`supabase/SETUP_COMPLETO.sql`](supabase/SETUP_COMPLETO.sql).
3. Crie o primeiro usuário no app ou em **Authentication → Users**.
4. Promova esse usuário no SQL Editor usando `public.bootstrap_admin`, conforme [`ADMIN_SETUP.md`](ADMIN_SETUP.md).
5. Configure `.env` com a URL e a chave pública do projeto.

O trigger de cadastro cria fiscais **inativos**; um administrador precisa aprovar o acesso no painel. Ocorrências novas ficam sem responsável e aparecem na triagem administrativa, onde um administrador as atribui a um fiscal ativo; a distribuição automática por região ainda não é oferecida. O SQL de instalação também ativa RLS, restringe privilégios das tabelas e registra alterações operacionais na trilha de auditoria.

### Banco já existente

Não execute o script completo sobre um banco em uso. Aplique somente as migrations ainda pendentes, em ordem, usando Supabase CLI ou o processo de deploy já adotado pelo ambiente:

```text
supabase/migrations/*.sql
```

A migration `20261012090000_harden_access_and_audit.sql` inclui mudanças de RLS, cadastro pendente, auditoria e RPCs. Faça backup e revise políticas/dados antes de aplicar em produção. A migration elimina localizações duplicadas por fiscal para manter somente a mais recente.

### Testes do banco

O schema é verificado contra um PostgreSQL real, com um ambiente Supabase simulado
(`auth.users`, `auth.uid`, roles `anon`/`authenticated`), sem precisar de Docker nem
de credenciais:

```bash
npm run test:sql              # testa supabase/SETUP_COMPLETO.sql
npm run test:sql:migrations   # testa supabase/migrations/*.sql em ordem
npm run test:sql:parity       # confere que os dois caminhos geram o mesmo schema
```

Veja [`tests/README.md`](tests/README.md) para a convenção de leitura do resultado.

### Módulo de documentos

A galeria é a biblioteca do fiscal: ele envia foto, PDF ou Word — digitalização de
documento, na maior parte dos casos, e é por isso que ela mantém 1920 px enquanto
as fotos de campo usam 1280 px. O acesso é restrito ao fiscal proprietário (o
administrador enxerga para auditoria), e a migration
`20261012100000_harden_documents.sql` restringe os registros e remove a falsa
validação de certificado.

O arquivo da galeria fica no bucket, em `documentos.arquivo_path`; o vínculo com
ocorrência, vistoria ou ordem de serviço existe no banco e hoje o aplicativo grava
os documentos sem vínculo.

> **Limites importantes.** Cada arquivo tem no máximo 5 MB, e nenhum deles é
> gravado no banco: desde a migração para o Storage, **todas** as colunas de
> arquivo — fotos de campo, assinatura do autuado, biblioteca de documentos e
> anexos da conversa — guardam só o caminho no bucket (veja abaixo). Gravar
> arquivo dentro da linha continua possível em tese e é **recusado por gatilho**.
>
> Assinatura manuscrita é apenas uma **imagem** colhida na tela. Não é validação
> criptográfica, não é certificado digital e **não constitui assinatura digital
> qualificada** nos termos da ICP-Brasil. Não use esse recurso como prova de
> autoria sem respaldo jurídico próprio.

### Arquivos no Storage

Nenhum arquivo fica no banco. Todos vão para o bucket privado `sifau-anexos` e a
linha guarda só o caminho (`{fiscal_id}/{ano}/{mes}/{anexo_id}.extensao`) — a
exibição pede uma URL assinada, que vale 1 hora. A descrição do arquivo de um
registro (tipo, momento, tamanho, dimensões) fica em `public.anexos`; as fotos de
ocorrência e vistoria continuam nas colunas `fotos`/`fotos_depois`, agora com o
caminho em vez do conteúdo.

Em base64, cada arquivo crescia cerca de 33% e entrava em toda consulta que usasse
`select('*')`. Medido por linha, em PostgreSQL real: documento digitalizado de
1 MB = **1.425 KB** de banco; anexo de conversa de 250 KB = **356 KB**; assinatura
de 30 KB = **50 KB**; o caminho no lugar do arquivo = **4 KB**. No plano gratuito
(500 MB), cerca de **350 documentos de 1 MB** encheriam a cota.

**Fotos de campo.** Medido em PostgreSQL real, um ciclo de fiscalização
(ocorrência com 5 fotos e vistoria com 3) ocupava **7.830 KB** de banco. Com o arquivo no Storage, o ciclo
ocupa **9 KB** — o banco deixa de ser o limite: o plano gratuito sai de ~63
ciclos para dezenas de milhares. O limite passa a ser o Storage (1 GB no plano
gratuito, cerca de 4.000 fotos a 250 KB).

Como o conteúdo saiu da linha, existe um gatilho no banco que **recusa** qualquer
valor começando com `data:` nas cinco colunas de arquivo (`fotos`,
`fotos_depois`, `assinatura_autuado`, `arquivo_path` e `attachments`): voltar ao
base64 não é uma decisão que passe despercebida.

> **Convivência:** um registro só existe se o arquivo subiu antes. Falha de upload
> leva o registro inteiro para a fila (online) ou mantém o item pendente (offline),
> em vez de gravar uma linha apontando para arquivo que não existe.

> Para os arquivos serem enviados, o projeto Supabase precisa do bucket e das
> políticas de `storage.objects` — eles estão no `SETUP_COMPLETO.sql` e nas
> migrations `20261015000000` a `20261018000000`. Sem isso o app funciona e o
> registro entra na fila, mas o arquivo não sobe.

## Gerar o APK e publicar uma versão

O APK é gerado no GitHub (`.github/workflows/build-apk.yml`), em dois caminhos:
enviar uma etiqueta `v1.2.0` publica uma Release com o APK anexado; rodar o
workflow à mão gera o APK como arquivo de execução, sem publicar.

Antes de gerar, configure em **Settings → Secrets and variables → Actions**:
`VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (obrigatórios) e
`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` e
`ANDROID_KEY_PASSWORD` (para assinar com a chave do órgão). Sem a chave, o APK
sai assinado com a chave de teste — serve para conferir, **não para distribuir**:
um aplicativo assinado com a chave de teste não pode ser atualizado por um
assinado com a chave oficial, e quem instalar teria de desinstalar antes.

### Como criar a chave de assinatura (uma vez, 2 minutos)

```bash
keytool -genkeypair -v -keystore sifau-release.jks -alias sifau \
  -keyalg RSA -keysize 4096 -validity 10000
base64 -w0 sifau-release.jks > sifau-release.jks.base64
```

Depois, em **Settings → Secrets and variables → Actions**, crie quatro segredos:
`ANDROID_KEYSTORE_BASE64` (o conteúdo do arquivo `.base64`),
`ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (`sifau`) e
`ANDROID_KEY_PASSWORD`. **Guarde o `.jks` e as senhas em cofre** e não os envie
ao Git: o repositório já os ignora, e a verificação `npm run test:android`
reprova se algum arquivo de chave aparecer sob controle do Git.

Opção extra: `VITE_APP_URL` pode ser cadastrado em **Variables** (não em
Secrets) para o link de recuperação de senha apontar para o endereço público.

> **A chave de assinatura é insubstituível.** Se ela for perdida, não existe
> forma de publicar atualização para quem já instalou o aplicativo — só publicar
> outro aplicativo, com outro identificador. Guarde o arquivo `.jks` e as senhas
> em cofre, fora do GitHub.

### Sobre o `tar` fixado em `overrides` (leia antes de "corrigir" o `npm audit`)

O `package.json` fixa `tar@^6.2.1` **apenas** para `@capacitor/cli`. Isso é
deliberado e não é um descuido de segurança:

- A versão 7 do `tar` corrige avisos de segurança que o `npm audit` aponta na
  linha 6, **mas quebra o Capacitor**: o CLI chama `require('tar').default.extract`
  e o `tar` 7 marca `__esModule` sem exportar `default`. O resultado é
  `Cannot read properties of undefined (reading 'extract')` e **nenhum APK é
  gerado** — foi exatamente o que aconteceu, e o build ficou vermelho por dias.
- O `tar` só é usado na hora de gerar o APK, na máquina ou no runner, para
  desempacotar o modelo que vem **dentro do próprio pacote do Capacitor**. Ele
  não vai para o aplicativo do fiscal e não recebe arquivo de terceiros.
- O conserto de verdade é subir o Capacitor para a versão 8 (que usa `tar` 7),
  junto com `@capacitor/core`, `@capacitor/android` e os plugins — mudança de
  versão maior, com verificação própria, não um ajuste de última hora.

`npm run test:android` reprova se o `tar` for fixado de novo para o Capacitor —
antes de gerar o APK, e sem precisar de SDK de Android.

## Instalação e funcionamento sem conexão

O aplicativo pode ser instalado pelo navegador (Android e iPhone) e abre **sem
internet**, com os arquivos guardados no próprio aparelho. Ele não guarda dados
do serviço no cache: login, consultas, fotos e assinaturas passam direto, e a
fila de registros pendentes continua no armazenamento do aparelho, como antes.

**Ao publicar uma versão nova:** basta construir e publicar (`npm run build`). O
service worker carrega a impressão digital do que foi construído; quem estiver
com o aplicativo aberto recebe o aviso "Nova versão pronta" e escolhe a hora de
atualizar. **Ninguém é atualizado no meio de uma vistoria de propósito** — a
troca no meio de uma tela aberta faria o aplicativo pedir arquivos que já não
existem no servidor.

Os arquivos de instalação (manifest, ícones, página de "sem conexão") são gerados
por `npm run pwa:gerar`, e a marca por `npm run marca:gerar`. **Não edite o que
está em `public/` à mão:** o teste `npm run test:pwa` reprova, de propósito.

## Segurança e operação

- Sessões e perfis são verificados pelo servidor; contas pendentes ou banidas não acessam as tabelas operacionais.
- **Senhas:** o fiscal recupera o acesso sozinho ("Esqueci minha senha") e troca a senha no perfil. A troca exige a senha atual, e depois dela as outras sessões são encerradas. O link do e-mail cria uma sessão antes de a senha mudar — por isso o app mostra a tela de definir senha **antes** de deixar entrar. Para o link funcionar, o endereço do app precisa estar em *Additional Redirect URLs* no painel do Supabase e em `VITE_APP_URL` (ver `supabase/ROTEIRO_APLICACAO.md`, etapa 5).
- Dados offline ficam no `localStorage` do aparelho, separados por usuário, e são enviados quando a conexão retorna. Em aparelho compartilhado, encerre a sessão e proteja o dispositivo.
- A localização é enviada enquanto o fiscal está com o app aberto e ativo. Informe essa coleta na política de privacidade da organização.
- Push nativo é opcional e exige Firebase Cloud Messaging HTTP v1, Supabase Edge Function e webhook privado. Veja [`GUIA_NOVAS_FUNCIONALIDADES.md`](GUIA_NOVAS_FUNCIONALIDADES.md).
- O código SQL foi verificado com parser PostgreSQL e smoke test local em PGlite com um esquema Supabase simulado; **não foi aplicado a um projeto Supabase real**. Faça staging e backup antes da produção.
- O CI roda os mesmos testes no GitHub. Ele não substitui o teste em projeto Supabase real: o simulador cobre RLS, gatilhos, funções e privilégios, e não cobre e-mail, Storage de verdade nem o painel.

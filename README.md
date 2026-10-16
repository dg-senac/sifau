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

A galeria de documentos guarda fotos, arquivos e imagens de assinatura vinculados a
uma ocorrência, vistoria ou ordem de serviço. O acesso é restrito ao fiscal
proprietário (o administrador enxerga para auditoria), e a migration
`20261012100000_harden_documents.sql` restringe os registros e remove a falsa
validação de certificado.

> **Limites importantes.** Os arquivos são gravados em `base64` nas colunas do banco, e
> a interface limita cada upload a 5 MB. A biblioteca de documentos é o último ponto do
> app nesse modelo: as **fotos de campo** já saem do banco (veja abaixo). Em base64,
> cada arquivo cresce cerca de 33% e entra em toda consulta que use `select('*')`.
>
> Assinatura manuscrita é apenas uma **imagem** colhida na tela. Não é validação
> criptográfica, não é certificado digital e **não constitui assinatura digital
> qualificada** nos termos da ICP-Brasil. Não use esse recurso como prova de
> autoria sem respaldo jurídico próprio.

### Fotos de campo no Storage

As fotos de ocorrência e de vistoria **não ficam no banco**. Elas vão para o
bucket privado `sifau-anexos` e a linha guarda só o caminho
(`{fiscal_id}/{ano}/{mes}/{anexo_id}.jpg`); a descrição de cada arquivo — tipo,
momento, tamanho, dimensões — fica em `public.anexos`.

Medido em PostgreSQL real, um ciclo de fiscalização (ocorrência com 5 fotos e
vistoria com 3) ocupava **7.830 KB** de banco. Com o arquivo no Storage, o ciclo
ocupa **9 KB** — o banco deixa de ser o limite: o plano gratuito sai de ~63
ciclos para dezenas de milhares. O limite passa a ser o Storage (1 GB no plano
gratuito, cerca de 4.000 fotos a 250 KB).

Como o conteúdo saiu da linha, existe um gatilho no banco que **recusa** qualquer
valor começando com `data:` nas colunas de foto: voltar ao base64 não é uma
decisão que passe despercebida.

> Para os arquivos serem enviados, o projeto Supabase precisa do bucket e das
> políticas de `storage.objects` — eles estão no `SETUP_COMPLETO.sql` e na
> migration `20261015000000_photos_to_storage.sql`. Sem isso o app funciona e a
> ocorrência entra na fila, mas a foto não sobe.

## Segurança e operação

- Sessões e perfis são verificados pelo servidor; contas pendentes ou banidas não acessam as tabelas operacionais.
- Dados offline ficam no `localStorage` do aparelho, separados por usuário, e são enviados quando a conexão retorna. Em aparelho compartilhado, encerre a sessão e proteja o dispositivo.
- A localização é enviada enquanto o fiscal está com o app aberto e ativo. Informe essa coleta na política de privacidade da organização.
- Push nativo é opcional e exige Firebase Cloud Messaging HTTP v1, Supabase Edge Function e webhook privado. Veja [`GUIA_NOVAS_FUNCIONALIDADES.md`](GUIA_NOVAS_FUNCIONALIDADES.md).
- O código SQL foi verificado com parser PostgreSQL e smoke test local em PGlite com um esquema Supabase simulado; **não foi aplicado a um projeto Supabase real**. Faça staging e backup antes da produção.

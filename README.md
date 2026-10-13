# SIFAU

Aplicativo web/mobile para registro, atribuição e fiscalização de ocorrências urbanas. A versão principal fica na raiz do repositório; ela usa Supabase Auth, PostgreSQL/RLS, sincronização offline e geração de auto de infração em PDF.

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

### Cópia opcional com documentos

`project/` é uma cópia do app sincronizada com a versão principal e acrescenta a galeria de documentos. Para instalar **essa** cópia, use [`project/supabase/SETUP_COMPLETO.sql`](project/supabase/SETUP_COMPLETO.sql) e rode os comandos npm dentro de `project/`. O módulo restringe documentos ao fiscal proprietário; PDFs/assinaturas manuscritas não constituem validação de certificado nem assinatura digital qualificada.

## Segurança e operação

- Sessões e perfis são verificados pelo servidor; contas pendentes ou banidas não acessam as tabelas operacionais.
- Dados offline ficam no `localStorage` do aparelho, separados por usuário, e são enviados quando a conexão retorna. Em aparelho compartilhado, encerre a sessão e proteja o dispositivo.
- A localização é enviada enquanto o fiscal está com o app aberto e ativo. Informe essa coleta na política de privacidade da organização.
- Push nativo é opcional e exige Firebase Cloud Messaging HTTP v1, Supabase Edge Function e webhook privado. Veja [`GUIA_NOVAS_FUNCIONALIDADES.md`](GUIA_NOVAS_FUNCIONALIDADES.md).
- O código SQL foi verificado com parser PostgreSQL e smoke test local em PGlite com um esquema Supabase simulado; **não foi aplicado a um projeto Supabase real**. Faça staging e backup antes da produção.

# SIFAU — Análise técnica e roadmap

**Data:** 2026-10-16
**Escopo:** app web/mobile (`/`), banco Supabase (`supabase/`), cópia `project/`, empacotamento Android
**Método:** leitura do código, build real (`npm ci && typecheck && lint && build`) e **execução do SQL em PostgreSQL real** (PGlite) com ambiente Supabase simulado (`auth.users`, `auth.uid()`, roles `anon`/`authenticated`).

---

## 0. Resumo executivo

O projeto está em **estado muito melhor do que a média**: o SQL executa sem erro, as 16 tabelas têm RLS ativa, 30 políticas, 21 funções, colunas batem com os tipos TypeScript, `typecheck`, `lint` e `build` passam limpos, e o fluxo de aprovação de fiscais funciona de verdade (testado).

Porém **há 2 bugs de banco confirmados por teste que impedem o "sem bug nenhum"** que você pediu, e **1 problema de arquitetura que vai derrubar o app quando entrar em uso real**. Os três estão detalhados abaixo com evidência.

Nota importante: **não consegui acessar o seu projeto Supabase** (`ousxaegyremkjlwkwzqh.supabase.co`) — o sandbox só tem saída para GitHub/npm/PyPI. Então validei o SQL em PostgreSQL real local, não contra o seu banco. Ainda assim, os bugs abaixo são de *definição de schema* — valem igualmente no seu projeto.

---

## 1. BLOQUEADORES — corrigir antes de qualquer coisa

### 🔴 B1. A trilha de auditoria está legível para qualquer usuário autenticado

**Evidência (teste executado):**
```
FAIL  Fiscal NÃO aprovado NÃO deve ler auditoria — linhas lidas = 1
```
Um fiscal **pendente** (cadastro não aprovado, `is_active_fiscal() = false`) consegue fazer `SELECT` na tabela `auditoria` inteira.

**Causa raiz:** em `supabase/SETUP_COMPLETO.sql:202` é criada a política legada:
```sql
CREATE POLICY "fiscal_select_auditoria" ON public.auditoria
  FOR SELECT TO authenticated USING (true);
```
A migration de hardening (`20261012090000_...`, linhas 1471-1483) apaga uma **lista branca** de políticas antigas, mas `fiscal_select_auditoria` **não está nessa lista**. Como políticas RLS PERMISSIVE são combinadas com `OR`, a política `true` anula a política nova `audit_select_approved` (`is_active_fiscal() OR is_admin()`).

**Impacto:** a auditoria é o "chain of custody" do sistema (append-only, com trigger que bloqueia UPDATE/DELETE). Hoje ela é sigilosa só na aparência: qualquer pessoa com login — inclusive conta recém-criada, nunca aprovada — lê todo o histórico de ocorrências, quem mudou o quê, quando e onde.

**Correção (1 linha):**
```sql
DROP POLICY IF EXISTS "fiscal_select_auditoria" ON public.auditoria;
DROP POLICY IF EXISTS "fiscal_insert_auditoria" ON public.auditoria;
```
> O mesmo padrão merece auditoria nas demais tabelas — as outras foram limpas corretamente, mas vale deixar isso coberto por teste automatizado (ver Fase 1).

---

### 🔴 B2. O administrador criado no bootstrap não consegue operar

**Evidência (teste executado):**
```
FAIL  bootstrap ativa o fiscal admin — ativo=false
... ERROR: new row violates row-level security policy for table "ocorrencias"
```

**Causa raiz:** `public.bootstrap_admin()` (`SETUP_COMPLETO.sql:891-919`) insere a linha em `administradores`, mas **nunca faz `UPDATE public.fiscais SET ativo = true`**. O trigger de cadastro criou esse fiscal como **inativo** (correto, para fiscais comuns), e ele fica inativo para sempre.

**Impacto:**
- `occurrences_insert_self` exige `fiscal_registrou = auth.uid() AND is_active_fiscal()` → **o admin não consegue inserir ocorrência** (confirmado no teste).
- Toda operação nova que dependa de `is_active_fiscal()` falha para o admin: `notificacoes` (SELECT), `register_push_token`.
- Hoje o app "escapa" porque o admin entra pela tela `admin` e as ações dele passam por RPCs `SECURITY DEFINER` (`assign_occurrence`, `set_fiscal_active`). Ou seja: **funciona por acidente**. Na primeira tela nova que escreva direto na tabela, quebra de forma confusa.

**Correção:** ao final de `bootstrap_admin`, ativar o fiscal correspondente:
```sql
UPDATE public.fiscais SET ativo = true WHERE id = admin_user_id;
```
E, por robustez, revisar as políticas que hoje usam só `is_active_fiscal()` para também aceitarem `is_admin()`.

---

### 🔴 B3. Fotos em base64 dentro do Postgres — o app vai travar em uso real

Este é o problemão, e é o mais urgente na prática.

**Situação:** as fotos são convertidas para **base64** no navegador e gravadas em colunas `text[]` (`ocorrencias.fotos`, `vistorias.fotos_depois`) e `text` (`documentos.arquivo_data`). Não há Supabase Storage em lugar nenhum do SQL (`grep storage` = 0 ocorrências).

**A conta (com os limites do próprio código, `PhotoUpload.tsx:13-15`):**

| | |
|---|---|
| Limite por foto comprimida | 700 KB = 716.800 bytes |
| Após base64 (+33%) | ~955 KB ≈ **0,91 MB por foto** |
| 5 fotos por ocorrência | **~4,6 MB por ocorrência** |

Agora cruze com as consultas — todas usam `select('*')`, que **arrasta as fotos mesmo quando só se quer uma lista**:

| Tela | Linha | Limite | Payload só de fotos |
|---|---|---|---|
| `HomeScreen.tsx` | 30 | `.limit(50)` | **~228 MB** |
| `MapScreen.tsx` | 29 | `.limit(150)` | **~684 MB** |
| `Dashboard.tsx` | 208 | sem limite | cresce sem teto |
| `AdminScreen.tsx` | 256, 312 | — | idem |
| `Inspection.tsx` | 30 | — | idem |
| `Orders.tsx` | 248 | — | idem |

**Três consequências distintas:**

1. **Frontend:** abrir "Início" ou o mapa baixa centenas de MB. Em 4G de campo isso é tela branca / app morto. É a causa nº 1 de "o app está com bug".
2. **Banco:** no plano free do Supabase (500 MB), com 5 fotos por ocorrência, o banco **enche em ~110 ocorrências**. Não é "algum dia" — é no primeiro mês de operação.
3. **Offline:** a fila offline (`src/lib/offlineQueue.ts`) grava a ocorrência **inteira, com as fotos em base64**, no `localStorage`. O limite do `localStorage` é ~5 MB → **uma única ocorrência offline pode estourar a cota**, e aí o `writeQueue` lança `QuotaExceededError` e o fiscal perde o registro. Você já tem a mensagem de erro para isso (`NewOccurrence.tsx`), o que mostra que o problema é conhecido.

**Correção em 2 etapas:**

- **Etapa 1 (rápida, hoje, sem migration):** trocar `select('*')` por colunas explícitas nas telas de lista, deixando `fotos` de fora. Ganho imediato de ~99% no tráfego. É uma mudança de baixo risco e alto retorno.
- **Etapa 2 (estrutural):** mover arquivos para **Supabase Storage** (bucket privado por fiscal/ocorrência + políticas), gravando no banco só o *path*. O app já tem `PhotoUpload` isolado e a fila offline com operações genéricas, então o encaixe é razoável. Exige decidir o que fazer com o que já está no banco.

---

## 2. Higiene e risco de manutenção

### 🟠 H1. `project/` é uma segunda cópia completa do app

- 112 de 218 arquivos versionados são duplicatas (`project/src`, `project/android`, `project/supabase`, `project/package.json`…) — **1,2 MB** de espelho.
- As duas árvores **já divergiram**: `App.tsx`, `AppShell.tsx`, `index.css`, `types.ts`, `MoreScreen.tsx` diferem, e `project/` tem `DocumentGallery`, `DocumentHistory`, `DocumentsScreen`, `documents.ts` que não existem na raiz.
- O `README` admite o custo ("é uma cópia do app sincronizada") e o `GUIA` manda aplicar uma migration **só** dessa cópia.

**Risco concreto:** antes de lançar, você não sabe qual é o app oficial. Qualquer correção (inclusive B1/B2/B3) precisa ser feita duas vezes — e uma vai ser esquecida.

**Recomendação:** escolher **uma** versão canônica (sugiro a raiz, que é a que tem o hardening mais recente e o README aponta como principal) e portar o módulo de documentos para ela como funcionalidade normal. Depois remover `project/`. Se preferir manter as duas, transformar em workspace/branch, nunca em pastas irmãs versionadas.

### 🟠 H2. `.env.production` está commitado

`git ls-files` confirma `.env.production` e `project/.env.production` versionados. A `anon key` é pública por natureza, então não é vazamento de segredo — mas é um cheiro ruim, e o `.gitignore` já tinha a regra (`.env*`) que foi contornada com `-f`. O workflow `build-apk.yml` **já usa secrets** corretamente. Basta remover do índice e alinhhar (`VITE_SUPABASE_URL`/`ANON_KEY` via secrets).

### 🟠 H3. Sem rede de segurança automatizada

O único workflow é o de APK. Não há CI rodando `typecheck`, `lint`, `build` — nem **nenhum teste de SQL**, apesar do README declarar que o SQL "não foi aplicado a um projeto Supabase real". Foi exatamente por isso que B1 e B2 passaram despercebidos: são invisíveis em revisão de código e óbvios em execução.

**Proposta:** um job que sobe Postgres (ou PGlite, como fiz aqui) com `auth` simulado, aplica `SETUP_COMPLETO.sql` e roda a bateria de smoke tests (cadastro → aprovação → ocorrência → vistoria → auditoria + os testes de negação de acesso). Barato de manter e teria pegado os dois bugs. Posso versionar o harness que usei.

### 🟡 H4. PWA, ícone e branding ausentes

- `public/icon.svg` é **placeholder**: retângulo azul chapado com a palavra "SIFAU" em Arial.
- **Não existe** `manifest.webmanifest`, ícones PWA, `apple-touch-icon` nem service worker.
- `index.html`: `theme-color` é `#1e40af`, que **não** é a cor usada no app (`#0d428b`/`#1766d1`).
- `index.html`: `maximum-scale=1.0, user-scalable=no` bloqueia zoom por pinça — barreira de acessibilidade (WCAG 1.4.4) e um dos primeiros itens que uma auditoria aponta.

Isso vira bloqueador no momento em que a landing page precisar dizer "instale o app" e exibir a marca.

---

## 3. Lacunas funcionais

| # | Lacuna | Por que importa |
|---|---|---|
| L1 | **Não existe recuperação de senha** (nenhum `resetPasswordForEmail`, nenhuma tela "Esqueci minha senha") e **nem troca de senha** no perfil | Fiscal que esquece a senha fica **trancado para fora** sem autoatendimento — só admin/banco resolve. E não há como trocar uma senha comprometida. É o item de maior valor pelo menor esforço de todo o app. |
| L2 | Distribuição automática por região não existe | O README assume isso como pendente; hoje toda ocorrência passa por triagem manual do admin. Com volume, vira gargalo. |
| L3 | Sem exportação em massa (CSV/XLSX) no painel | Existe PDF de auto de infração, mas relatório gerencial/transparência não sai. |
| L4 | Sem PWA instalável | Impacto direto na landing page: hoje o caminho web é só baixar APK. Um PWA "instalar na tela inicial" é o teste mais barato que existe. |
| L5 | Offline não guarda mapa nem pré-carga | `MapScreen` depende de tiles do OSM online; em campo sem sinal, mapa vazio. |
| L6 | Push depende de FCM configurado | Código pronto (`push.ts`, Edge Function), mas exige projeto Firebase + secrets. Sem isso, as notificações ficam só no app. |
| L7 | Sem página de privacidade | O app **coleta geolocalização contínua** e o próprio README manda informar isso. Play Store e LGPD vão exigir; e a landing page precisa do link. |

---

## 4. O que já está bom (não mexer)

Vale registrar, porque é o que sustenta o resto:

- **Fluxo de aprovação de fiscais funciona**: testado ponta a ponta — cadastro nasce `ativo=false`, pendente não lê `ocorrencias` (RLS bloqueia de fato), admin aprova via `set_fiscal_active`, e a partir daí o acesso libera.
- **`fiscais_update_self` está correta** e é o ponto onde era fácil errar: `USING` **e** `WITH CHECK` exigem `is_active_fiscal()`. Um fiscal pendente **não consegue se auto-aprovar**. Bom trabalho.
- **Auditoria é append-only de verdade**: trigger bloqueia `UPDATE` e `DELETE` (testado).
- **Schema ↔ TypeScript 100% consistentes**: conferi coluna por coluna nas 9 tabelas principais contra `src/lib/types.ts`.
- **Isolamento da fila offline por usuário** com IDs estáveis e tentativas idempotentes — bem pensado para aparelho compartilhado.
- `RPCs` sensíveis com `REVOKE`/`GRANT` corretos, `SECURITY DEFINER` + `SET search_path = ''`, e `bootstrap_admin` corretamente inelegível pelas roles de API.
- Código limpo: `typecheck`, `lint` e `build` passando, code-splitting por tela, tratamento de erro de auth com redação de dados sensíveis nos logs.

---

## 5. Roadmap sugerido — do mais fácil ao mais difícil

### Fase 0 — Destravar (curta, alto impacto)
1. **B1** RLS da auditoria — 2 linhas de SQL
2. **B2** `bootstrap_admin` ativar o fiscal — 1 linha de SQL
3. **B3 etapa 1** `select('*')` → colunas explícitas nas telas de lista
4. **H2** tirar `.env.production` do git
5. **H4 parcial** `index.html`: zoom, `theme-color`, favicon real

→ Com isso o app e o banco ficam efetivamente **sem bug conhecido**.

### Fase 1 — Blindar (média)
6. **H3** CI com `typecheck` + `lint` + `build` + smoke test de SQL (versionar o harness)
7. **L1** recuperação e troca de senha
8. **B3 etapa 2** fotos no Supabase Storage + política de migração do que já existe
9. **H1** unificar o app canônico e aposentar `project/`
10. Error boundary global + observabilidade de erros

### Fase 2 — Lançar
11. **H4** identidade visual completa: logo (ver `PROMPTS_LOGO.md`), ícones Android, splash, favicon, `manifest.webmanifest`
12. **L7** página de privacidade + termos
13. **Landing page** (repo separado): hero com prints reais do app, seção de recursos, botão de download do APK (GitHub Releases), PWA/"testar agora", FAQ, contato
14. **L4** PWA instalável
15. **L3** exportação CSV/XLSX no painel

### Fase 3 — Completude
16. **L2** distribuição automática por região/disponibilidade
17. **L5** modo offline do mapa
18. **L6** push nativo (Firebase + Edge Function)
19. Relatórios gerenciais, dashboard público de transparência

---

## 6. Decisões que preciso de você

1. **Qual app é o canônico?** Raiz ou `project/` (com documentos)? Isso define onde tudo vai ser corrigido.
2. **Fotos:** fazemos a Etapa 1 já (rápida) e a Etapa 2 (Storage) na Fase 1? Ou já vamos direto para Storage?
3. **Já existem dados em produção** no Supabase? Muda o plano de correção do B1/B2 (migration incremental vs. reexecução).
4. **Landing page:** confirma repo separado, e o download será **APK via GitHub Releases** ou você pretende publicar na Play Store?

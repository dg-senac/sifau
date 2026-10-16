# Roteiro — colocar o banco novo no ar (passo 9 do plano)

Este roteiro é para **você executar**, porque eu não alcanço o seu Supabase daqui
(o sandbox onde eu trabalho não tem saída para `ousxaegyremkjlwkwzqh.supabase.co`).
São 4 etapas, uns 15 minutos. No fim tem as consultas de conferência — me manda o
resultado delas e eu confirmo se está tudo certo.

O script é o `supabase/SETUP_COMPLETO.sql` (2.252 linhas, 92 KB).

---

## Antes de começar: projeto novo ou o projeto atual?

**Recomendo projeto novo.** Motivo: você pediu para refazer o banco do zero. Se a gente
usar o projeto atual, o schema novo entra *em cima* do antigo — e como o histórico teve
37 migrations, sobra objeto que ninguém lembra que existe (função órfã, política antiga,
coluna morta). Num projeto vazio, o que existe é exatamente o que está escrito no
script: 19 tabelas, 25 funções, 38 políticas, 6 gatilhos.

Consequências de criar um projeto novo, todas conhecidas e aceitáveis agora:

- **As contas de fiscal de hoje não existem mais.** Cada fiscal se cadastra de novo.
- **O administrador é criado de novo** (etapa 3 abaixo).
- **O app precisa apontar para o projeto novo**: duas linhas em `.env` e `.env.production`
  (a URL e a chave pública `anon`). Ainda não existe APK distribuído, então ninguém
  fica com app apontando para o lugar errado.
- **Não apague o projeto antigo.** Deixe parado como backup por um tempo.

Se você preferir manter o projeto atual, o script também funciona (ele é re-executável e
não apaga dado), mas aí sobra o lixo histórico — me avise que eu te passo as consultas
para listar o que ficou sobrando.

---

## Etapa 1 — criar o projeto

1. [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**.
2. Nome: `sifau` (ou o que preferir). Região: **South America (São Paulo)** — é a mais
   próxima de Recife e reduz a latência do app.
3. Guarde a senha do banco no seu gerenciador de senhas.
4. Espere o provisionamento terminar (uns 2 minutos).

## Etapa 2 — rodar o script

1. No projeto novo: **SQL Editor** → **New query**.
2. Abra o arquivo `supabase/SETUP_COMPLETO.sql` e cole **o arquivo inteiro**.
   - Se colar no navegador ficar pesado, use o botão de upload do editor (arrastar o
     arquivo `.sql`).
3. **Run** (ou `Ctrl+Enter`).
4. Deve terminar com **Success. No rows returned**. Avisos do tipo `NOTICE: Política
   permissiva removida...` são esperados e são o script limpando o scaffold antigo.

> Se der erro, **não faça nada além de me mandar a mensagem completa** (ela costuma
> dizer a linha). O script é re-executável: rodar de novo do começo não duplica nada —
> isso é testado (`npm run test:sql:rerun`).

## Etapa 3 — criar o administrador

O banco não cria conta: as contas nascem no Supabase Auth. O caminho é o mesmo que o
app usa, e o script tem a função que promove a conta a administrador.

1. **Authentication → Users → Add user → Create new user**.
   - E-mail do administrador (o seu) e uma senha.
   - Marque **Auto Confirm User** (senão o login fica preso esperando confirmação de
     e-mail).
2. **SQL Editor** → rode, trocando o e-mail pelo que você acabou de criar:

```sql
SELECT public.bootstrap_admin('seu-email@aqui.com', 'Seu Nome');
```

3. Confira que o perfil fiscal do administrador ficou **ativo** — é o defeito B2, que
   agora tem teste:

```sql
SELECT ativo FROM public.fiscais WHERE email = 'seu-email@aqui.com';
-- esperado: true
```

Sem esse `true`, o administrador toma
`new row violates row-level security policy for table ocorrencias` ao registrar uma
ocorrência — era exatamente o bug B2.

## Etapa 4 — apontar o app para o projeto novo

1. **Project Settings → API**: copie **Project URL** e a chave **anon public**.
   - A chave `anon` é pública por natureza (ela vai dentro do app). **Nunca** me mande a
     `service_role` — essa dá acesso total ao banco e não tem lugar no cliente.
2. Me mande as duas, ou edite você mesmo nos arquivos `.env` e `.env.production`:
   `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.

> Ainda não é agora que o app vai funcionar 100%: falta o **bucket de fotos** (passo 10).
> O login, o cadastro, o fluxo de ocorrência e vistoria já funcionam com este banco.

---

## Conferência — cole o resultado disto de volta

```sql
-- 1. Tabelas (esperado: 19)
SELECT count(*) AS tabelas FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE';

-- 2. Políticas permissivas (esperado: 0 linhas)
--    Uma política USING (true) anula as restritivas da mesma tabela: foi o B1.
SELECT tablename, policyname FROM pg_policies
WHERE schemaname = 'public' AND (qual = 'true' OR with_check = 'true');

-- 3. Tabela de anexos: 5 vínculos, 6 chaves estrangeiras e o CHECK de vínculo
--    único. Esperado: 14 linhas. Confira que aparece anexos_vinculo_unico e que
--    aparecem as 6 referências: auth.users, ocorrencias, vistorias,
--    ordens_servico, autos_infracao e admin_messages.
SELECT conname, pg_catalog.pg_get_constraintdef(oid) AS definicao
FROM pg_constraint
WHERE conrelid = 'public.anexos'::regclass AND contype IN ('c','f','p','u')
ORDER BY conname;

-- 4. Toda tabela com RLS ligada (esperado: 0 linhas)
SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;

-- 5. Nenhum anexo inválido — a tabela começa vazia (esperado: 0)
SELECT count(*) AS anexos FROM public.anexos;

-- 6. O administrador ativo (esperado: true, uma linha)
SELECT nome, ativo FROM public.fiscais WHERE email = 'seu-email@aqui.com';
```

---

## O que vem depois (passo 10)

1. **Bucket privado de fotos** no Storage, com política por pasta de fiscal, e a tabela
   `anexos` (já criada aqui) passando a guardar o caminho do arquivo em vez do base64
   dentro do banco. É o que resolve o banco encher: hoje o plano gratuito (500 MB) dá
   para ~63 ciclos de fiscalização; com o arquivo fora do banco, dá para dezenas de
   milhares.
2. **O app passa a usar a tabela nova**: upload no lugar do base64, e a galeria lendo por
   URL assinada.

O bucket vai exigir mais um pedacinho de SQL — pequeno, e eu te aviso quando chegar a
hora. Não precisa rodar nada além do que está neste roteiro agora.

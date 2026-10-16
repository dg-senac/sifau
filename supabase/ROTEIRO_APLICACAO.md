# Roteiro — colocar o banco novo no ar (passo 9 do plano)

Este roteiro é para **você executar**, porque eu não alcanço o seu Supabase daqui
(o sandbox onde eu trabalho não tem saída para `ousxaegyremkjlwkwzqh.supabase.co`).
São 4 etapas, uns 15 minutos. No fim tem as consultas de conferência — me manda o
resultado delas e eu confirmo se está tudo certo.

O script é o `supabase/SETUP_COMPLETO.sql` (2514 linhas, 103 KB).

---

## Antes de começar: projeto novo ou o projeto atual?

**Recomendo projeto novo.** Motivo: você pediu para refazer o banco do zero. Se a gente
usar o projeto atual, o schema novo entra *em cima* do antigo — e como o histórico teve
37 migrations, sobra objeto que ninguém lembra que existe (função órfã, política antiga,
coluna morta). Num projeto vazio, o que existe é exatamente o que está escrito no
script: 19 tabelas, 26 funções, 38 políticas, 11 gatilhos e 1 bucket.

Consequências de criar um projeto novo, todas conhecidas e aceitáveis agora:

- **As contas de fiscal de hoje não existem mais.** Cada fiscal se cadastra de novo.
- **O administrador é criado de novo** (etapa 3 abaixo).
- **O app precisa apontar para o projeto novo**: duas linhas em `.env` e `.env.production`
  (a URL e a chave pública `anon`). Ainda não existe APK distribuído, então ninguém
  fica com app apontando para o lugar errado.
- **Não apague o projeto antigo.** Deixe parado como backup por um tempo.

Se você preferir manter o projeto atual, o caminho é **aplicar as migrations**
(`supabase/migrations/*.sql`, na ordem dos nomes): elas foram escritas exatamente para
entrar em cima de um banco que já existe. O script grande eu valido para projeto vazio —
sobre o banco com o histórico antigo ele não foi testado, e prefiro te dizer isso a te
deixar descobrir. Em qualquer um dos casos, o lixo histórico continua lá; me avise que eu
passo as consultas para listar o que ficou sobrando.

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

> O script já cria o **bucket privado dos arquivos** (`sifau-anexos`) e as políticas de
> acesso a ele. Não é preciso criar bucket pelo painel do Storage, nem rodar mais
> nenhum SQL depois deste: ele já traz os quatro blocos que migraram o arquivo para
> fora do banco (fotos, assinatura, galeria e conversa) e os cinco gatilhos que recusam
> base64 de volta.

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

> Com este banco, o fluxo de campo está inteiro: cadastro, aprovação, ocorrência com
> fotos, vistoria com fotos, auditoria. As fotos vão para o bucket privado, não para o
> banco. O que ainda não migrou é a **biblioteca de documentos** (galeria) e a
> assinatura do autuado — isso é ajuste no app, sem SQL novo.

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

-- 7. O bucket das fotos (esperado: 1 linha, public = false)
SELECT id, public, file_size_limit FROM storage.buckets WHERE id = 'sifau-anexos';

-- 8. As políticas do bucket (esperado: 4 linhas — uma de cada comando)
SELECT policyname, cmd FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects' ORDER BY policyname;

-- 9. Arquivo fora do banco (esperado: 10 linhas — as 5 colunas que guardam
--    CAMINHO e os 5 gatilhos que recusam base64 nelas)
SELECT 'coluna' AS tipo, table_name || '.' || column_name AS nome
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name IN ('fotos', 'fotos_depois', 'assinatura_autuado', 'arquivo_path', 'attachments')
UNION ALL
SELECT 'gatilho', tgname FROM pg_trigger
WHERE NOT tgisinternal AND tgname LIKE 'trg_%_sem_base64'
ORDER BY 1, 2;
```

---

## O que este script resolve

Medido em PostgreSQL real, antes e depois da migração das fotos para o Storage:

| | por ciclo de fiscalização (ocorrência com 5 fotos + vistoria com 3) |
|---|---|
| com o arquivo em base64 na linha | **7.830 KB** de banco |
| com o arquivo no bucket privado | **9 KB** de banco |

O plano gratuito sai de ~63 ciclos para dezenas de milhares. O novo limite é o Storage
(1 GB no plano gratuito, ~4.000 fotos a 250 KB), que é o lugar certo para ele: arquivo
pode ser arquivado ou removido sem tocar no registro.

Para o app subir arquivo é preciso que o bucket e as políticas deste script existam —
sem eles, a ocorrência entra e a foto **fica na fila** do aparelho, com aviso na tela.

## O que já está pronto no app

Nenhuma coluna do sistema guarda arquivo dentro da linha, e o lado do aplicativo já
acompanha: fotos de campo (ocorrência e vistoria), assinatura do autuado, biblioteca de
documentos e anexos da conversa sobem para o bucket antes de a linha existir — online e
offline —, e a exibição pede URL assinada na hora.

**Duas coisas continuam sendo decisão sua, não minha:**

1. **O fiscal não abre o anexo que o administrador manda no chat.** O arquivo fica na
   pasta de quem enviou (é o que a política do bucket permite), e a tela dele já dizia
   "Anexos disponíveis somente no painel administrativo" antes desta migração. Dar
   acesso ao destinatário é acrescentar uma política de leitura e exibir o anexo na tela
   do fiscal.
2. **A tabela `assinaturas_digitais` nunca recebeu uma linha do aplicativo** — existe
   para registrar que o sistema NÃO valida certificado digital. Tirar é uma migração de
   poucas linhas, mas apagar tabela é irreversível: só faço com o seu ok.

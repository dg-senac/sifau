# Testes do banco — SIFAU

Roda o schema do SIFAU em um **PostgreSQL real** (PGlite — PostgreSQL 16 compilado
para WebAssembly) com um ambiente Supabase simulado, para verificar RLS, permissões
e o fluxo de fiscalização **sem precisar de um projeto Supabase**.

## Por que existe

Os dois defeitos mais graves encontrados neste projeto (trilha de auditoria legível
por usuário não aprovado e administrador sem perfil fiscal ativo) eram **invisíveis
em revisão de código** e óbvios em execução. Esta suíte é a rede de segurança que
impede que voltem.

## Como rodar

```bash
npm run test:sql              # testa supabase/SETUP_COMPLETO.sql (projeto novo)
npm run test:sql:migrations   # testa supabase/migrations/*.sql em ordem (projeto existente)
npm run test:unit             # funções puras do app (sem navegador, sem Supabase)
npm run verify                # tudo em sequência, com tipo, lint e build
```

O mesmo `npm run verify` roda no CI (`.github/workflows/verify.yml`) em todo pull
request e em todo push para `main`. Se você for mexer no SQL, rode antes de
enviar: é mais barato do que descobrir depois de aplicar no Supabase.

Sem dependências externas além do `npm install`: não precisa de Docker, de servidor
PostgreSQL nem de credenciais.

## Como ler o resultado

| Símbolo | Significado |
|---|---|
| `✓` | passou |
| `✗` | **falhou** — regressão real, a suíte sai com código 1 |
| `⚠ CONHECIDO` | defeito já identificado e ainda não corrigido (`knownBug`) |
| `★ RESOLVIDO` | o defeito foi corrigido; **remova o marcador `t.knownBug`** |

Um teste marcado como `knownBug` que passa vira `★ RESOLVIDO` — é o sinal de que a
correção entrou e o marcador pode sair. Assim a suíte documenta a dívida sem
esconder regressão nova.

## Estrutura

```
tests/
├── README.md              # este arquivo
├── supabase-sim.sql       # ambiente Supabase mínimo (auth.users, auth.uid, roles, Storage)
├── harness.mjs            # sobe o banco, aplica o schema, executa como usuário
├── fixtures.mjs           # cenário base (admin, pendente, ativos) e payloads
├── snapshot.mjs           # retrato do schema em 8 dimensões (tabelas, colunas, políticas…)
├── compare-install-paths.mjs # projeto novo × projeto migrado: o mesmo schema?
├── apply-twice.mjs        # o script é re-executável? (aplicar duas vezes não muda nada)
├── check-query-columns.mjs   # nenhuma tela pede `select('*')` em tabela de arquivo
├── run.mjs                # runner e mini framework de teste
├── unit/                  # testes de função pura do app (Node, sem banco)
└── suites/
    ├── 01-acesso.test.mjs            # RLS, papéis, negação de acesso
    ├── 02-administracao.test.mjs     # bootstrap, aprovação, triagem, redistribuição
    ├── 03-fluxo-operacional.test.mjs # ocorrência → vistoria → auditoria
    ├── 04-documentos.test.mjs        # biblioteca do fiscal, acesso restrito ao dono
    ├── 05-anexos.test.mjs            # modelo único de anexos e regra de vínculo
    └── 06-storage.test.mjs           # bucket privado, pasta por fiscal e anti-base64
```

`npm run verify` roda tudo em sequência: tipo, lint, build, consultas, as duas
suítes de banco, a paridade entre caminhos e a re-execução do script.

Cada suíte roda em um **banco limpo e independente**, para que uma não contamine a
seguinte. Se o schema não puder ser aplicado, a execução para e aponta o arquivo e a
posição do erro.

## Como escrever um teste

```js
await t.test('descrição do comportamento esperado', async () => {
  const visible = await db.as(IDS.pending, 'authenticated', async () =>
    Number((await db.query('SELECT count(*) AS n FROM public.ocorrencias')).rows[0].n));
  t.count(visible, 0, 'ocorrências visíveis ao pendente');
});
```

Helpers disponíveis: `t.test`, `t.knownBug(fn, ref)`, `t.denies(fn, label)`,
`t.deniedOrEmpty(fn, label)`, `t.eq`, `t.count`, `t.ok`.

`db.as(userId, role, fn)` é o que faz o RLS valer: ele define o claim do JWT
(`request.jwt.claim.sub`) e **troca a role**, e é a troca de role que faz o
PostgreSQL aplicar as políticas. Sem isso, o superusuário ignora o RLS e os testes
passariam falsamente.

`db.owner(...)` executa como superusuário e **ignora o RLS** — use apenas para
montar cenário ou inspecionar o resultado, nunca para verificar segurança.

## Limites conhecidos desta simulação

- **Extensões:** o PGlite não traz `pgcrypto`/`uuid-ossp`. O harness substitui as
  declarações e avisa quais foram simuladas. No Supabase elas são nativas.
- **Storage:** o `supabase-sim.sql` cria `storage.buckets` e `storage.objects` com
  RLS ligada, o suficiente para provar as políticas do bucket e o caminho por
  fiscal (por isso os negativos são confiáveis: sem RLS o teste passaria por
  motivo errado). O que **não** é simulado é o envio real de bytes, a validade da
  URL assinada e os limites de tamanho/tipo do serviço — isso só o Supabase real
  responde.
- **Realtime, Auth e Edge Functions:** fora do escopo. Aqui se testa banco.
- **Não substitui o teste no Supabase real.** Antes de aplicar em produção, rode o
  script em um projeto de staging.

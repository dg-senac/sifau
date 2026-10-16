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
```

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
├── supabase-sim.sql       # ambiente Supabase mínimo (auth.users, auth.uid, roles)
├── harness.mjs            # sobe o banco, aplica o schema, executa como usuário
├── fixtures.mjs           # cenário base (admin, pendente, ativos) e payloads
├── run.mjs                # runner e mini framework de teste
└── suites/
    ├── 01-acesso.test.mjs            # RLS, papéis, negação de acesso
    ├── 02-administracao.test.mjs     # bootstrap, aprovação, triagem, redistribuição
    └── 03-fluxo-operacional.test.mjs # ocorrência → vistoria → auditoria
```

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
- **Storage:** não há bucket simulado. Quando as fotos forem para o Supabase
  Storage, os testes de arquivo vão precisar de uma camada a mais.
- **Realtime, Auth e Edge Functions:** fora do escopo. Aqui se testa banco.
- **Não substitui o teste no Supabase real.** Antes de aplicar em produção, rode o
  script em um projeto de staging.

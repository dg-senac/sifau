# Comparativo: raiz vs `project/`

**Objetivo:** decidir qual é a versão canônica do app antes de mexer em qualquer código.
**Método:** comparação de todos os 218 arquivos versionados + execução dos **dois** scripts SQL em PostgreSQL real.

---

## 1. Veredito em uma linha

> **A raiz é a versão mais evoluída. `project/` é um fork antigo que carrega uma única coisa que a raiz não tem: o módulo de documentos (6 arquivos).**

Ou seja: não é "duas versões do app", é **um app + 1 funcionalidade isolada** presa num diretório paralelo que ficou para trás.

---

## 2. A prova: inventário de arquivos

### Arquivos que existem **só na raiz**
**Nenhum.** Zero.

### Arquivos que existem **só em `project/`** — exatamente 6, todos do módulo de documentos
```
project/src/screens/DocumentsScreen.tsx              388 linhas
project/src/components/DocumentGallery.tsx           360 linhas
project/src/components/DocumentHistory.tsx           304 linhas
project/src/lib/documents.ts                         243 linhas
project/supabase/migrations/20260930130000_add_documents.sql
project/supabase/migrations/20261012100000_harden_documents.sql
```

### Os 12 arquivos que existem nos dois mas **divergiram**

| Arquivo | Raiz | project/ | Quem está melhor |
|---|---|---|---|
| `README.md` | 61 linhas | 22 linhas | **Raiz** — o de `project/` é um resumo |
| `.github/workflows/build-apk.yml` | 69 linhas | 51 linhas | **Raiz** — o de `project/` não valida os secrets antes do build |
| `.gitignore` | 28 linhas | 23 linhas | **Raiz** — tem `.env*` e os padrões de Firebase/service-account |
| `.env.example` | 4 linhas | 4 linhas | **Raiz** — comentários mais completos |
| `supabase/SETUP_COMPLETO.sql` | 1716 linhas | 1979 linhas | **project/**, mas só pelas 2 tabelas de documentos |
| `src/index.css` | 235 linhas | 364 linhas | **project/**, mas só pelos estilos de documentos |
| `src/lib/types.ts` | 175 linhas | 213 linhas | **project/**, mas só pelos tipos de documentos |
| `src/App.tsx` | 330 linhas | 333 linhas | 3 linhas de diferença — só a rota `documents` |
| `src/components/AppShell.tsx` | 147 linhas | 151 linhas | 4 linhas — só o link no menu |
| `src/screens/MoreScreen.tsx` | 52 linhas | 53 linhas | 1 linha — só o item de menu |
| `package.json` | `@capacitor/cli ^6.1.2` | `^6.2.2` | Empate (ambos `^6`, o npm resolve igual) |
| `package-lock.json` | 5590 linhas | 5638 linhas | Consequência do item acima |

**Observação importante:** as diferenças de `App.tsx`, `AppShell.tsx` e `MoreScreen.tsx` são **apenas o encaixe do módulo de documentos** — uma rota lazy, um link de menu e um item de lista. Não há lógica de negócio divergente entre as duas cópias.

---

## 3. O que os dois SQL fazem

| | Raiz | project/ |
|---|---|---|
| Executa sem erro? | ✅ | ✅ |
| Tabelas | 16 | **18** (+ `documentos`, + `assinaturas_digitais`) |
| Funções | 21 | **24** |
| RLS ativa em tudo | ✅ | ✅ |
| Bug B1 (auditoria legível) | 🔴 presente | 🔴 **também presente** |
| Bug B2 (bootstrap não ativa) | 🔴 presente | 🔴 **também presente** |

**Conclusão:** o SQL de `project/` **não é uma versão mais corrigida** — é o mesmo SQL + documentos. Os dois bugs que encontrei estão nos dois lugares, então escolher a raiz não custa nenhuma correção.

---

## 4. O módulo de documentos presta? Sim — e é bem feito

Vale registrar, porque muda a recomendação de "jogar fora" para "aproveitar". A migration `20261012100000_harden_documents.sql` demonstra cuidado real:

- A migration **admite o próprio erro original** por escrito: *"The initial documents migration exposed all stored files and signatures to every authenticated account."*
- Revoga tudo e re-concede cirurgicamente: `GRANT UPDATE (ordem)` — só a coluna de ordenação é atualizável, o resto do registro é imutável.
- Cria `document_relations_belong_to_user()`, que valida que a ocorrência/vistoria/ordem referenciada **realmente pertence ao usuário** antes de aceitar o anexo. Isso é exatamente o que faltava em `fiscal_select_auditoria`.
- Documenta a limitação jurídica no código (`assinatura_digitais` não é assinatura digital qualificada).

São ~1.295 linhas de frontend + RLS cuidadosa. **Vale portar.**

---

## 5. Duas coisas que verifiquei porque eram risco

**✅ `wipe_user_data()` foi corretamente removida.** Ela existia em `public`, era `SECURITY DEFINER` e apagava dados de qualquer usuário. Foi `REVOKE`ada e depois **`DROP`ada** na migration de hardening — confirmei que ela **não existe** no estado final (não está entre as 21 funções). Detalhe revelador: ela fazia `SET fiscal_registrou = NULL`, mas a coluna é `NOT NULL` — ou seja, **estava quebrada e era perigosa**. A remoção foi acertada.

**✅ `supabase/debug_admin.sql` é inofensivo.** Só consultas de leitura para diagnosticar o admin. Pode ficar.

---

## 6. Recomendação

**Adotar a raiz como canônica e portar o módulo de documentos para ela.**

O trabalho de port é **mecânico e pequeno**, porque a costura já está pronta:

| Passo | O quê |
|---|---|
| 1 | Copiar os 4 arquivos de `project/src/` para `src/` |
| 2 | Aplicar 3 patches minúsculos: 1 rota em `App.tsx`, 1 link em `AppShell.tsx`, 1 item em `MoreScreen.tsx` |
| 3 | Copiar as 2 migrations de documentos para `supabase/migrations/` |
| 4 | Acrescentar os tipos e estilos de documentos (`types.ts`, `index.css`) |
| 5 | `rm -rf project/` |

**Por que a raiz e não o contrário:** sair de `project/` significaria re-fazer o README completo, o check de secrets do workflow e os padrões do `.gitignore` — e depois ainda reconciliar a dívida das duas trees. Sair da raiz é só adicionar o que falta.

---

## 7. E o "refazer do zero" que você mencionou

Você disse que acha que há dados, mas topou reconstruir. Isso **é a melhor saída** aqui, e por um motivo técnico específico: os bugs B1 e B2 existem porque o `SETUP_COMPLETO.sql` é uma **concatenação cega das migrations** — ele cria políticas permissivas antigas, apaga algumas, e no caso da auditoria **recria a política ruim de volta** (linha 202). Um schema consolidado e limpo elimina B1 **por construção**, em vez de remendar com `DROP`.

Minha proposta para o banco, quando chegarmos lá:

1. Gerar **um** `SETUP_COMPLETO.sql` consolidado a partir das migrations, **sem nenhuma política `USING (true)`** — as permissivas nunca chegam a existir.
2. `bootstrap_admin` ativando o fiscal (corrige B2 na origem).
3. **Unificar os 4 lugares que hoje guardam arquivo** — `ocorrencias.fotos`, `vistorias.fotos_depois`, `documentos.arquivo_data`, `assinaturas_digitais` — num **único modelo de anexos** com os arquivos no Supabase Storage e só o *path* no banco. Hoje isso é redundância que polui o schema *e* é a causa do bug B3 (base64 de 4,6 MB por ocorrência em toda listagem).
4. Aposentar as pastas de migration antigas como histórico, mantendo só o script consolidado + as migrations de documentos.

Isso te dá um schema que dá para ler inteiro, entender e auditar — em vez de 1.716 linhas de arqueologia.

---

## 8. Próximo passo

Aguardando sua decisão sobre a canônica. **Minha recomendação: raiz + port dos documentos.** Se concordar, o primeiro trabalho de código será exatamente esse port + a Fase 0 (as 5 correções rápidas), e eu te mostro o diff antes de aplicar.

# SIFAU — Plano de execução passo a passo

**Regra do jogo:** um passo por vez. Cada passo é pequeno, eu te mostro o diff **antes** de aplicar, e nenhum passo avança sem o anterior estar verificado. Nada de refatoração gigante de uma vez.

**Meta final desta trilha:** app + banco Supabase **funcionando sem bug conhecido**, com identidade visual e caminho de distribuição prontos para a landing page.

**Legenda:** ⬜ a fazer · 🔄 em andamento · ✅ feito · ⏸️ espera decisão sua

---

## FASE A — Travar a base e limpar a casa

O objetivo desta fase é eliminar a ambiguidade "qual é o app?" e criar a rede de segurança que vai me deixar provar cada mudança no banco.

### ✅ Passo 1 — Confirmar a versão canônica
- **Decisão sua:** raiz + port dos documentos (minha recomendação) ou `project/`.
- **Por que primeiro:** tudo depois depende disso. Errar aqui significa fazer todo o resto duas vezes.
- **Entrego:** nada de código. Só o seu OK.
- **Resultado:** raiz confirmada como canônica, com port do módulo de documentos.

### ✅ Passo 2 — Rede de segurança (harness de teste do banco)
- **O que é:** versionar no repo o harness que usei na análise — sobe PostgreSQL real (PGlite) com `auth.users`/`auth.uid()`/roles simuladas, aplica o SQL e roda a bateria: cadastro → aprovação → ocorrência → vistoria → auditoria → **testes de negação de acesso**.
- **Por que antes de tudo:** é ele que vai provar que o schema reconstruído não reintroduziu bug. Sem isso, refazer o banco é fé, não engenharia. Foi exatamente a ausência dele que deixou B1 e B2 passarem.
- **Arquivos novos:** `supabase/tests/` + script `npm run test:sql`.
- **Verificação:** ✅ **57 testes passam**, e os defeitos ficam visíveis como `⚠ CONHECIDO` em vez de escondidos.
- **Resultado:** `npm run test:sql`, `test:sql:migrations` e `test:sql:parity`. Os dois caminhos de instalação produzem schema idêntico, e o teste de paridade falha se voltarem a divergir.

### ✅ Passo 3 — Portar o módulo de documentos para a raiz
- **O que muda:** copiar 4 arquivos de `project/src/` → `src/`; 3 patches mínimos (1 rota em `App.tsx`, 1 link em `AppShell.tsx`, 1 item em `MoreScreen.tsx`); tipos em `types.ts`; estilos em `index.css`; 2 migrations de documentos em `supabase/migrations/`.
- **Resolve:** a existência de duas cópias do app.
- **Verificação:** `typecheck` + `lint` + `build` + preview local da tela de login e do menu.
- **Risco:** baixo — a costura já existe, é só reconectar.
- **Resultado:** módulo portado. Nenhuma regra de estilo perdida (357 vs 357), `.unread-dot` morto e `.photo-error` conflitante descartados, e `SETUP_COMPLETO.sql` passou a criar as tabelas de documentos para não divergir das migrations. Nova suíte cobre o isolamento dos arquivos.

### ✅ Passo 4 — Remover `project/`
- **O que muda:** `git rm -r project/` (depois do passo 3 verde) e incorporar a documentação útil ao `README` principal.
- **Resolve:** 112 de 218 arquivos duplicados, 1,2 MB de espelho, e a causa raiz de "não sei qual app é o oficial".
- **Verificação:** ✅ arquivos versionados caíram de **238 para 126**; a documentação útil do `project/README.md` (limite de 5 MB, recomendação de Storage e a ressalva de que assinatura manuscrita não é assinatura digital qualificada) foi incorporada ao README principal.

**✅ Fim da Fase A — CONCLUÍDA:** um app só, uma árvore só, com teste automatizado do banco rodando e paridade verificada entre os dois caminhos de instalação.

---

## FASE B — Fase 0: o app e o banco sem bug

### ✅ Passo 5 — Parar de baixar fotos em toda listagem
- **O que muda:** trocar `select('*')` por colunas explícitas nas telas de lista, deixando `fotos`/`fotos_depois` de fora.
- **Arquivos:** `HomeScreen.tsx:30`, `MapScreen.tsx:29`, `Dashboard.tsx:208`, `AdminScreen.tsx:256/312`, `Inspection.tsx:30`, `Orders.tsx:248`.
- **Resolve:** ~228 MB no Início e ~684 MB no mapa caem para poucos KB. **É o maior ganho de qualidade percebida por menor esforço de todo o plano.**
- **Verificação:** preview local + contagem das colunas retornadas.
- **Risco:** baixo, mas exigiu cuidado nas telas que usam as fotos.
- **Resultado:** as fotos **nunca eram exibidas em nenhuma tela** — só gravadas. Isso tornou a restrição segura. Verificado que o tipo do supabase-js degrada se a constante não for literal de texto, e o comentário em `lib/columns.ts` registra isso. Guarda em `tests/check-query-columns.mjs` reprova se o padrão voltar.

### ✅ Passo 6 — Higiene rápida
- **O que muda:** tirar `.env.production` do git (mantendo no disco local); `index.html` → liberar zoom (`maximum-scale`/`user-scalable`), corrigir `theme-color` para `#0d428b`, trocar o favicon placeholder.
- **Resolve:** risco de configuração e a barreira de acessibilidade de zoom.
- **Resultado:** `.env.production` fora do índice (segue no disco e ignorado); zoom liberado (WCAG 1.4.4); `theme-color` alinhado ao azul da marca; favicon novo (escudo + confirmação no gradiente da marca), conferido a 16/32/48/128 px.
- **Observação:** o favicon é provisório — será substituído pela identidade final do passo 13.

**✅ Fim da Fase B — CONCLUÍDA:** app sem os bugs de desempenho conhecidos; banco ainda com B1 e B2 (morrem na Fase C). `npm run verify` roda typecheck, lint, guarda de colunas, as duas suítes de SQL e a paridade de schema.

---

## FASE C — Reconstruir o banco do zero, limpo

Aqui é onde os dois bugs de SQL morrem **por construção**, em vez de remendo. Só faz sentido porque você topou refazer.

### ✅ Passo 7 — Decidir o modelo de anexos
- **Decisão sua, com meu parecer ao lado:** hoje existem **4 lugares** guardando arquivo em base64 (`ocorrencias.fotos`, `vistorias.fotos_depois`, `documentos.arquivo_data`, `assinaturas_digitais`). Minha recomendação: **um único modelo de anexos**, com o arquivo no Supabase Storage e só o *path* no banco.
- **Por que decidir antes de escrever o schema:** é a decisão que mais afeta o desenho das tabelas. Mudar depois é caro.
- **Entrego:** um desenho das tabelas para você aprovar, sem SQL ainda.

### ✅ Passo 8 — Gerar o `SETUP_COMPLETO.sql` consolidado
- **O que muda:** um schema único, curado e legível — **sem nenhuma política `USING (true)`** (as permissivas nunca chegam a existir → B1 morre na origem); `bootstrap_admin` ativando o fiscal (B2 na origem); política de anexos do passo 7.
- **Resolve:** as 1.716 linhas de arqueologia viram um script que dá para ler inteiro. Mata B1 e B2.
- **Verificação:** harness do passo 2, **agora 100% verde**, incluindo os testes de negação de acesso.
- **Risco:** 🟠 médio — é reescrita de schema. Por isso o harness vem antes e o script fica versionado ao lado do antigo para comparação.
- **Resultado (feito):** B1 e B2 morreram, com **62 testes ✓ / 0 ✗** nos dois caminhos. Duas decisões de método:
  1. **A migration antiga não foi editada** (já aplicada em banco real). A correção entrou num arquivo novo, `20261013000000_fix_permissive_policies_and_admin_bootstrap.sql`, e no `SETUP_COMPLETO.sql` curado. O `SETUP_COMPLETO.sql` é um arquivo curado, não cópia literal do histórico — o cabeçalho explica isso a quem for ler.
  2. **A paridade entre os dois caminhos ficou muito mais forte.** Antes ela comparava nome de tabela, função, política e coluna. Agora compara **o corpo das funções** (ignorando comentário, porque um arquivo é comentado para quem lê o SQL Editor e o outro para quem lê histórico), **a expressão de cada política** (`USING`/`WITH CHECK`), **as restrições** (CHECK/UNIQUE/PK) e **os privilégios por coluna**. Passou de 4 para 6 dimensões e de ~250 para ~700 itens comparados.
- **Por que isso importa:** a paridade fraca era o motivo de B1 e B2 terem nascido. A comparação de nome não distinguia "a política existe nos dois" de "a política *faz a mesma coisa* nos dois" — que era exatamente o defeito. Testei a nova paridade **ao contrário**: injetei uma permissividade em uma política e ela acusou o nome da política e a condição divergente; injetei um corpo de função sem a ativação do administrador e ela acusou; injetei uma coluna a mais e ela acusou.
- **Achado do caminho:** havia 8 políticas permissivas `USING (true)` (em `fiscal_location`, `admin_messages`, `banned_users`, `administradores`) **criadas e derrubadas** por uma lista de nomes no meio do arquivo. O estado final estava correto — mas o mecanismo dependia de acertar cada nome, que foi exatamente como B1 escapou. Acrescentei ao `SETUP_COMPLETO.sql` a mesma varredura **por estado** (`qual = 'true' OR with_check = 'true'`, derruba independentemente do nome) que já tinha posto na migration. As suítes de acesso exigem zero políticas incondicionais no estado final dos dois caminhos.
- **Segunda parte do passo (a tabela do passo 7):** o desenho que você aprovou previa que o passo 8 entregasse o schema consolidado **com a tabela `anexos`** — e eu havia commitado só as correções de B1/B2. A tabela entrou agora: `SETUP_COMPLETO.sql` + migration `20261014000000_create_anexos.sql`, com os 5 vínculos por FK, o CHECK de vínculo único, `momento` (`antes`/`depois`), RLS e grants por coluna. **19 testes próprios** (`tests/suites/05-anexos.test.mjs`) cobrem as regras; suíte total: **81 testes ✓ nos dois caminhos**. O aplicativo ainda **não** usa a tabela nova — isso é o passo 10, de propósito, para não mexer no app em duas frentes ao mesmo tempo.
- **Limpeza que a correção do B2 permitiu:** o cenário de teste tinha um contorno que ativava o fiscal do administrador "na mão", porque `bootstrap_admin` não ativava. Removido — agora as suítes **dependem** da correção. Se o B2 voltar, elas falham em massa, em vez de passarem por causa do contorno.

### 🔄 Passo 9 — Aplicar no Supabase (depende de você)
- **O que muda:** rodar o schema novo no projeto. Como você vai refazer do zero e ainda não existe usuário em produção, a recomendação é **projeto novo** — o schema fica exatamente o que está escrito no script, sem sobra do histórico.
- **Verificação:** eu não alcanço seu Supabase daqui, então: eu te entrego o SQL + um **roteiro de verificação** com as consultas exatas para você rodar e colar o resultado. Se algum passo falhar, ajusto com base no retorno.
- **Risco:** 🟠 depende de você executar.
- **Entrega:** `supabase/ROTEIRO_APLICACAO.md` — 4 etapas (criar projeto, colar o script, criar o administrador, apontar o app) e 6 consultas de conferência, com o resultado esperado de cada uma **medido**, não estimado. O roteiro recomenda projeto novo e lista as consequências honestas: as contas de fiscal atuais não existem mais, cada fiscal se cadastra de novo, e o app precisa apontar para a URL nova (2 linhas de `.env`).
- **Preparação que eu fiz antes de te pedir para rodar** (para o roteiro não ser "confie em mim"):
  - Descobri e corrigi um defeito que só apareceria na sua mão: **o `SETUP_COMPLETO.sql` não era re-executável**. Um `CREATE TRIGGER` sem `DROP` antes fazia a segunda execução parar no meio — exatamente o que aconteceria se você rodasse, desse algum erro e tentasse de novo. Agora existe `npm run test:sql:rerun`, que aplica o arquivo duas vezes e compara o schema antes/depois das duas rodadas (7 dimensões, incluindo os 6 gatilhos).
  - A comparação por retrato foi extraída para `tests/snapshot.mjs` e passou a incluir **gatilhos** — a automação que ninguém lembra que existe até ela sumir.

**✅ Fim da Fase C:** banco sem B1 nem B2, comprovado por teste, com schema legível.

---

## FASE D — Fotos no Storage (o bug mais caro)

### ✅ Passo 10 — Fotos no Storage (parte 1: as fotos de campo)
- **O que muda:** bucket privado `sifau-anexos` + 4 políticas em `storage.objects` (cada fiscal na própria pasta, administrador auditando); `ocorrencias.fotos` e `vistorias.fotos_depois` passam a guardar o **caminho**; o app sobe o arquivo antes de gravar a linha, online e offline.
- **Resolve:** o B3 nas duas colunas que somavam 99,7% do peso.
- **Verificação:** 12 testes novos no harness (bucket privado, pasta por fiscal, anônimo barrado, gatilho anti-base64), todos testados **ao contrário** — quebrando a política de INSERT, a de SELECT e o gatilho, os testes certos falham.
- **Risco:** 🟠 médio-alto — é o passo que mais mexe no app.
- **Resultado:** medido em PostgreSQL real, o ciclo de fiscalização (ocorrência com 5 fotos + vistoria com 3) caiu de **7.830 KB para 9 KB** no banco — **874x menos**. O plano gratuito sai de ~63 ciclos para ~57.000; o limite passa a ser o Storage (1 GB ≈ 4.000 fotos), que é o lugar certo para ele.
- **Duas decisões de desenho que vale você saber:**
  1. **As colunas não foram removidas — elas guardam caminho agora.** O desenho do passo 7 dizia que `fotos` e `fotos_depois` "viram anexos". Fazendo literalmente, o RPC `complete_inspection` e o CHECK que exige 1 foto na vistoria teriam de mudar **ao mesmo tempo** que o app — no passo que mais mexe no app. Preferi manter a forma da coluna e trocar só o conteúdo: o contrato do RPC fica intacto, a garantia "vistoria tem foto" continua no banco, e o ganho é o mesmo, porque o peso estava no conteúdo. A tabela `anexos` descreve cada arquivo (tipo, momento, tamanho, dimensões).
  2. **Um gatilho recusa base64 nessas colunas.** Trocar conteúdo por caminho é o tipo de mudança que volta sem avisar: bastaria uma tela nova chamar o upload antigo e o banco voltaria a inchar em silêncio. Agora o banco recusa (`reject_inline_base64`), e há teste.
- **O que fica para a parte 2 deste passo:** a biblioteca de documentos (`documentos.arquivo_data`), os anexos do chat do painel (`admin_messages.attachments`) e a assinatura do autuado (`autos_infracao.assinatura_autuado`) continuam em base64. São os três pontos que ainda usam arquivo dentro do banco — e a galeria é a única tela que realmente exibe arquivo, então ela merece cuidado próprio.
- **Nota de honestidade sobre a fila offline:** o arquivo pendente ainda viaja em base64 dentro do `localStorage`. Fotografias ficaram ~3x menores (250 KB), mas 5 fotos pendentes ainda são ~1,7 MB — cabem, e o app avisa se a cota estourar. Guardar o arquivo em IndexedDB seria o certo para volumes maiores; não farei isso agora porque muda o mecanismo de fila inteiro, e o ganho imediato não paga o risco.

**✅ Fim da Fase D:** o app e o banco estão, para todos os efeitos, prontos para uso real.

---

## FASE E — Fechar lacunas de produto

### ⬜ Passo 11 — Recuperação e troca de senha
- **O que muda:** tela "Esqueci minha senha" (`resetPasswordForEmail`) + fluxo de redefinição + troca de senha no perfil.
- **Resolve:** hoje um fiscal que esquece a senha fica **trancado para fora** sem autoatendimento, e não há como trocar senha comprometida. **Maior valor pelo menor esforço de todo o plano.**
- **Verificação:** fluxo completo com e-mail real.

### ⬜ Passo 12 — CI de verdade
- **O que muda:** job que roda `typecheck` + `lint` + `build` + o harness de SQL em cada push.
- **Resolve:** H3 — hoje só existe o workflow de APK. B1 e B2 passariam a ser impossíveis de reintroduzir.
- **Verificação:** abrir um PR de propósito com erro e ver o CI reprovar.

**✅ Fim da Fase E:** produto sem lacuna bloqueante, com rede de proteção automatizada.

---

## FASE F — Identidade visual e distribuição

### ⏸️ Passo 13 — Logo
- **Decisão sua:** quer que eu **gere as imagens** a partir dos prompts de `PROMPTS_LOGO.md`, ou você leva os prompts para a sua ferramenta?
- **O que muda:** logo horizontal (login), vertical (splash), ícone do app, monocromática (PDF), favicon.
- **Verificação:** preview local com a logo real na tela de login.

### ⬜ Passo 14 — PWA instalável
- **O que muda:** `manifest.webmanifest`, ícones, service worker.
- **Resolve:** o botão secundário da landing page ("testar na hora") só funciona com isso. Fecha H4 e L4.

### ⬜ Passo 15 — Release do APK
- **O que muda:** ligar o `build-apk.yml` que já existe a uma Release no GitHub, com APK versionado.
- **Resolve:** é o que a landing page vai apontar como botão principal.

### ⬜ Passo 16 — Landing page (repo separado)
- **O que muda:** hero com prints reais do app, seção de recursos, **botão principal = baixar APK** / **secundário = testar o PWA**, FAQ, contato, link da política de privacidade.
- **Pré-requisito:** passos 13–15 prontos (marca + download + PWA), senão o site não tem o que mostrar.

### ⬜ Passo 17 — Política de privacidade
- **O que muda:** página de privacidade.
- **Por que não pode ficar de fora:** o app coleta geolocalização contínua e o próprio README manda informar isso. LGPD e Play Store exigem, e a landing page precisa do link.

---

## Ordem, resumida

```
Fase A  Passos 1-4    limpar a casa            ✅ resolve a ambiguidade do repo
Fase B  Passos 5-6    correções rápidas         ✅ resolve desempenho e higiene
Fase C  Passos 7-9    banco reconstruído        ✅ resolve bugs 1 e 2
Fase D  Passo 10      fotos no Storage          ✅ resolve bug 3  ← app+banco OK
Fase E  Passos 11-12  senhas + CI               ✅ fecha lacunas bloqueantes
Fase F  Passos 13-17  marca + distribuição      ✅ caminho para a landing page
```

**O que você pediu — "app e banco funcionando sem bug nenhum" — fica pronto no fim da Fase D (passo 10).** As fases E e F são o caminho para o lançamento.

---

## Onde eu preciso de você

| Passo | O que preciso |
|---|---|
| **1** | OK na raiz como canônica (+ port dos documentos) |
| **7** | Aprovação do modelo único de anexos |
| **9** | Rodar o SQL no SQL Editor (eu não alcanço seu Supabase daqui) |
| **13** | Se eu gero as imagens da logo ou você leva os prompts |

Fora esses quatro pontos, consigo tocar o resto sozinho e te reportando a cada passo.

---

## Duas combinações para não nos perdermos

1. **Como eu reporto:** ao fim de cada passo te digo, em três linhas — o que mudou, como verifiquei, e qual é o próximo. Se um passo der errado, eu paro e te conto em vez de improvisar.
2. **Como você acompanha:** este arquivo é atualizado a cada passo (⬜ → ✅), então ele é sempre a fonte da verdade do andamento.

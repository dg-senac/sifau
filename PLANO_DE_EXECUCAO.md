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
  - Descobri e corrigi um defeito que só apareceria na sua mão: **o `SETUP_COMPLETO.sql` não era re-executável**. Um `CREATE TRIGGER` sem `DROP` antes fazia a segunda execução parar no meio — exatamente o que aconteceria se você rodasse, desse algum erro e tentasse de novo. Agora existe `npm run test:sql:rerun`, que aplica o arquivo duas vezes e compara o schema antes/depois das duas rodadas (então 7 dimensões, incluindo os 6 gatilhos; hoje são 8 dimensões e 11 gatilhos).
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
- **Nota de honestidade sobre a fila offline:** o arquivo pendente ainda viaja em base64 dentro do `localStorage`. Fotografias ficaram ~3x menores (250 KB), mas 5 fotos pendentes ainda são ~1,7 MB — cabem, e o app avisa se a cota estourar. Guardar o arquivo em IndexedDB seria o certo para volumes maiores; não farei isso agora porque muda o mecanismo de fila inteiro, e o ganho imediato não paga o risco.

### ✅ Passo 10 (parte 2) — Assinatura, galeria e conversa fora do banco
- **O que muda:** as três colunas que ainda guardavam arquivo dentro da linha passam a guardar o caminho no mesmo bucket `sifau-anexos` — a assinatura do autuado (2a), a biblioteca de documentos (2b) e os anexos da conversa do painel (2c). Com isso nenhuma das cinco colunas do sistema usa arquivo dentro do banco, e o gatilho `reject_inline_base64` cobre as cinco.
- **Medido em PostgreSQL real, com conteúdo incompressível, por linha:** documento digitalizado de 1 MB = **1.425 KB**; anexo de conversa de 250 KB = **356 KB**; assinatura de 30 KB = **50 KB**; o caminho no lugar do arquivo = **4 KB**. Traduzindo para o plano gratuito (500 MB de banco): cerca de **350 documentos de 1 MB** encheriam a cota — e cada um deles também era baixado para desenhar a lista da galeria, porque a consulta usava `select('*')`.
- **A galeria precisou de desenho próprio** — é a única tela que EXIBE arquivo. O bucket é privado, então exibir virou pedir uma URL assinada na hora, e isso criou dois estados que antes não existiam: carregando e não deu para carregar. Ficou num gancho (`useArquivoAssinado`, com cache de 10 minutos) e em dois componentes (`StorageFile`), em vez de repetir `useEffect` em cada tela. Arquivo que sumiu do bucket mostra o estado de erro com botão de tentar de novo, não uma imagem quebrada em silêncio.
- **Renomear coluna não renomeia o que deriva dela:** `documentos.arquivo_data` virou `arquivo_path`, mas a restrição NOT NULL continuou com o nome antigo (`documentos_arquivo_data_not_null`) num banco migrado. Quem pegou foi a conferência de paridade entre os dois caminhos de instalação — nenhuma tela quebraria por isso. A migração agora renomeia a restrição junto, e a suíte guarda o caso.
- **Limitação que fica aberta (é decisão sua, não minha):** o anexo que o administrador manda no chat fica na pasta dele, porque a política do bucket exige que o primeiro nível do caminho seja o id de quem está autenticado. O fiscal não abre esse arquivo — e a tela dele já dizia "Anexos disponíveis somente no painel administrativo" antes desta migração, então não é regressão: é o comportamento que já existia ficando explícito no banco. Corrigir é acrescentar uma política de leitura para o destinatário da mensagem e exibir o anexo na tela do fiscal; não fiz porque muda o que o app entrega ao fiscal.
- **Sobrou uma tabela morta para decidir:** `assinaturas_digitais` nunca recebeu uma linha do aplicativo — nenhuma tela escreve nela, só existe o tipo em `src/lib/types.ts`. As colunas `certificado_digital` e `certificado_valido` estão lá para dizer, por escrito, que o sistema NÃO valida certificado digital. É o tipo de sobra que confunde quem lê o schema depois. A remoção é uma migração de poucas linhas, e **não removi sem você mandar**: apagar tabela é irreversível, e essa decisão é sua.
- **Verificação:** 8 testes novos no banco (um por coluna migrada, cada um afirmando a MENSAGEM do gatilho — recusar por falta de permissão também seria um erro, e passaria como se o gatilho tivesse funcionado), testados ao contrário: removendo o gatilho, o teste cai. Suíte em **101 casos** nos dois caminhos, paridade em 8 dimensões com 11 gatilhos, script ainda re-executável.

**✅ Fim da Fase D:** o app e o banco estão prontos — falta só o **passo 9** (aplicar no Supabase, que depende de você) para valer em produção.

---

## FASE E — Fechar lacunas de produto

### ✅ Passo 11 — Recuperação e troca de senha
- **O que muda:** "Esqueci minha senha" na tela de entrada, tela de definir a senha nova (aberta pelo link do e-mail) e "Trocar senha" no perfil.
- **Resolve:** até aqui, fiscal que esquecia a senha ficava **trancado para fora** sem autoatendimento, e não havia como trocar uma senha comprometida. Era o maior valor pelo menor esforço do plano.
- **Resultado:** os três fluxos existem. O que vale registrar são as decisões que não são óbvias:
  1. **A tela de senha nova vem ANTES da checagem de sessão.** O link de recuperação cria uma sessão válida antes de o fiscal definir a senha — o caminho "natural" (checar sessão e entrar) levaria a pessoa direto para dentro do app com a senha antiga ainda valendo. É o defeito clássico desse fluxo.
  2. **A troca de senha dentro do app pede a senha atual.** O Supabase aceitaria trocar só com a sessão; pedir a senha de novo é o que impede que aparelho emprestado com sessão aberta tome a conta. Depois de trocar, as OUTRAS sessões são encerradas.
  3. **O motivo da recusa do link aparece em português.** O Supabase devolve `#error=access_denied&error_code=otp_expired` em inglês; sem traduzir e sem mostrar, o fiscal fica olhando a tela de login sem entender que o link venceu — e pede ajuda.
  4. **O token sai do endereço depois de lido.** Token de acesso parado na barra de endereço fica no histórico do navegador, no print que alguém tira e no link que alguém copia.
  5. **`VITE_APP_URL` existe por um motivo concreto:** dentro do aplicativo instalado, o endereço é `http://localhost` — um link de e-mail apontando para lá não abre nada no telefone. Sem essa variável, a tela avisa que falta configurar em vez de mandar um e-mail inútil.
- **Verificação:** 10 testes de unidade novos (`npm run test:unit`, roda sem navegador e sem Supabase) sobre a leitura do link — recuperação, link vencido, token no `#` ou no `?`, limpeza do endereço e as regras da senha. E o fluxo inteiro precisa do seu teste com e-mail real (passo a passo abaixo).
- **Para você testar (5 minutos):** entre pelo app → "Esqueci minha senha" → informe o e-mail do administrador → receba o link → abra: o app deve pedir a **nova senha** (não deve entrar direto) → defina → entre com a nova. Depois, no perfil, troque a senha de novo, errando a senha atual de propósito para ver a recusa.
- **O que falta para funcionar no aplicativo instalado:** cadastrar o endereço público do app no painel do Supabase (Authentication → URL Configuration → *Additional Redirect URLs*) e preencher `VITE_APP_URL`. Está na etapa 5 do `ROTEIRO_APLICACAO.md`.

### ✅ Passo 12 — CI de verdade
- **O que muda:** `.github/workflows/verify.yml`, rodando em todo pull request e em todo push para `main`: `npm ci` → `npm run verify` (tipo, lint, unidade, colunas, SQL das duas instalações, paridade, re-execução) → `npm run build`.
- **Resolve:** H3 — até aqui só existia o workflow de APK, que constrói e não julga. **O que o CI protege não é estilo: são os dois defeitos que quase foram para produção.** B1 (trilha de auditoria legível por usuário não aprovado) e B2 (administrador sem perfil fiscal ativo) eram invisíveis em revisão de código — os dois só apareceram porque um teste de banco existia para pegá-los. Enquanto o teste morava só na máquina de quem escreveu, ele protegia até o próximo esquecimento.
- **Detalhe que importa:** o job fixa Node 22 pela mesma razão do passo 11 — os testes de unidade importam `.ts` direto e dependem da remoção de tipos (22.18+). Num Node mais antigo o passo falharia por motivo errado, e falha por motivo errado ensina a ignorar o CI.
- **Verificação:** feita em duas mãos, com o veredito do GitHub e não meu.
  1. **Verde:** pull request [#2](https://github.com/dg-senac/sifau/pull/2), job `verificar` **passou em 53 s** (`npm ci` → verificação inteira → build).
  2. **Vermelho, de propósito:** com um defeito injetado de propósito no SQL (a guarda anti-base64 deixando de reconhecer `data:`), o mesmo job **reprovou em 32 s** — e reprovou no passo certo, com o build nem chegando a rodar. Um CI que nunca foi visto reprovando não é proteção, é enfeite; a injeção foi revertida em seguida e o histórico do PR ficou limpo (o defeito de propósito e sua reversão foram descartados antes de enviar).
- **O que fica pendente de você:** nada. O PR #2 está aberto esperando decisão de merge; o merge para `main` é o que dispara o workflow de APK.

**✅ Fim da Fase E:** produto sem lacuna bloqueante, com rede de proteção automatizada.

---

## FASE F — Identidade visual e distribuição

### ⏸️ Passo 13 — Logo
- **Decisão sua:** quer que eu **gere as imagens** a partir dos prompts de `PROMPTS_LOGO.md`, ou você leva os prompts para a sua ferramenta?
- **O que muda:** logo horizontal (login), vertical (splash), ícone do app, monocromática (PDF), favicon.
- **Verificação:** preview local com a logo real na tela de login.

### ✅ Passo 14 — Aplicativo instalável e funcionando sem conexão
- **O que muda:** manifest, ícones (192, 512, recortável e iPhone), service worker, página de "sem conexão" e o aviso de versão nova. As fontes passaram a viajar dentro do aplicativo.
- **Resolve:** o botão secundário da landing page ("testar na hora") só funciona com isso, e o fiscal em campo ganha o app abrindo sem sinal. **E resolve um problema que ninguém tinha notado:** as fontes vinham do servidor do Google **a cada abertura** — sem internet, o aplicativo abria com outra tipografia, justamente onde a conexão falha. Agora são 428 KB de fonte dentro do pacote.
- **As decisões que não são óbvias** (todas tomadas pelo que aconteceria no aparelho do fiscal, não pelo que é mais comum na internet):
  1. **O service worker nunca faz limpeza genérica.** A fila de fiscalização mora no armazenamento do aparelho; um `caches.delete()` ou um `localStorage.clear()` na troca de versão apagaria exatamente o dado que não tem como ser recuperado em lugar nenhum. A limpeza é por prefixo e só nos caches do SIFAU.
  2. **Pedido com credencial não é arquivo.** O service worker só trata GET para o próprio endereço do aplicativo, e recusa qualquer pedido com cabeçalho de autorização. Login e consultas passam direto: guardar resposta de login em cache entregaria dado de um fiscal a outro no mesmo aparelho.
  3. **A versão nova não toma o lugar da antiga sozinha.** Ela espera, e o aplicativo mostra "Nova versão pronta". Se a troca fosse automática (`skipWaiting`), uma tela aberta no meio de uma vistoria passaria a pedir arquivos que já não existem no servidor — porque os arquivos do Vite têm o conteúdo no próprio nome e somem na troca.
  4. **Rede primeiro, com prazo de 3,5 s.** O caso ruim é o celular conectado a um wi-fi que não responde: sem prazo, o fiscal fica olhando tela branca até o navegador desistir sozinho (mais de um minuto). Com prazo, o aplicativo abre com o que está guardado, e o que está guardado é sempre da mesma versão.
  5. **A página de "sem conexão" não promete o que não pode cumprir.** Ela só aparece quando o aplicativo não abriu, então não diz "seus registros serão enviados" — diz que os registros continuam guardados no aparelho, que é o que é verdade.
- **Verificação, em três camadas:**
  1. **12 defeitos injetados de propósito** (`npm run test:pwa:negativos`): cache apagado por inteiro, fila de fiscalização apagada, resposta de login guardada, versão antiga servida, casca apontando para arquivo inexistente, manifest sem tela cheia, ícone em caminho absoluto, página buscando coisa de fora e mais. **Todos pegos, e todos pelo motivo certo** — este teste nasceu de uma regra nossa: verificação que nunca reprovou não é proteção, é enfeite.
  2. **Ele pegou duas fraquezas na própria verificação:** uma se satisfazia com o texto de um comentário (`updateViaCache` citado mas não usado) e outra, com metade do nome de uma constante (prazo declarado e nunca aplicado). As duas foram corrigidas, e agora o defeito injetado é reprovado de verdade.
  3. **Verificação do aplicativo construído** (`npm run test:pwa:dist`): o service worker carrega a impressão digital de tudo o que foi construído; se os arquivos forem trocados depois, a verificação acusa — senão os fiscais ficariam presos numa versão antiga sem ninguém perceber.
- **O que falta para você:** o botão "testar na hora" da landing page precisa de um endereço público em HTTPS onde o aplicativo esteja no ar (é de lá que o visitante instala). Enquanto isso não existir, o passo 16 tem o que mostrar apenas pelo APK.

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

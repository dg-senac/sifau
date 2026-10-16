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

### ⬜ Passo 5 — Parar de baixar fotos em toda listagem
- **O que muda:** trocar `select('*')` por colunas explícitas nas telas de lista, deixando `fotos`/`fotos_depois` de fora.
- **Arquivos:** `HomeScreen.tsx:30`, `MapScreen.tsx:29`, `Dashboard.tsx:208`, `AdminScreen.tsx:256/312`, `Inspection.tsx:30`, `Orders.tsx:248`.
- **Resolve:** ~228 MB no Início e ~684 MB no mapa caem para poucos KB. **É o maior ganho de qualidade percebida por menor esforço de todo o plano.**
- **Verificação:** preview local + contagem das colunas retornadas.
- **Risco:** baixo, mas exige cuidado nas telas que **usam** as fotos (`OccurrenceDetail`, `AutoInfracao`) — essas continuam com `*` de propósito.

### ⬜ Passo 6 — Higiene rápida
- **O que muda:** tirar `.env.production` do git (mantendo no disco local); `index.html` → liberar zoom (`maximum-scale`/`user-scalable`), corrigir `theme-color` para `#0d428b`, trocar o favicon placeholder.
- **Resolve:** risco de configuração e a barreira de acessibilidade de zoom.
- **Verificação:** build + inspeção do HTML gerado.

**✅ Fim da Fase B:** app sem os bugs de desempenho conhecidos; banco ainda com B1 e B2 (morrem na Fase C).

---

## FASE C — Reconstruir o banco do zero, limpo

Aqui é onde os dois bugs de SQL morrem **por construção**, em vez de remendo. Só faz sentido porque você topou refazer.

### ⏸️ Passo 7 — Decidir o modelo de anexos
- **Decisão sua, com meu parecer ao lado:** hoje existem **4 lugares** guardando arquivo em base64 (`ocorrencias.fotos`, `vistorias.fotos_depois`, `documentos.arquivo_data`, `assinaturas_digitais`). Minha recomendação: **um único modelo de anexos**, com o arquivo no Supabase Storage e só o *path* no banco.
- **Por que decidir antes de escrever o schema:** é a decisão que mais afeta o desenho das tabelas. Mudar depois é caro.
- **Entrego:** um desenho das tabelas para você aprovar, sem SQL ainda.

### ⬜ Passo 8 — Gerar o `SETUP_COMPLETO.sql` consolidado
- **O que muda:** um schema único, curado e legível — **sem nenhuma política `USING (true)`** (as permissivas nunca chegam a existir → B1 morre na origem); `bootstrap_admin` ativando o fiscal (B2 na origem); política de anexos do passo 7.
- **Resolve:** as 1.716 linhas de arqueologia viram um script que dá para ler inteiro. Mata B1 e B2.
- **Verificação:** harness do passo 2, **agora 100% verde**, incluindo os testes de negação de acesso.
- **Risco:** 🟠 médio — é reescrita de schema. Por isso o harness vem antes e o script fica versionado ao lado do antigo para comparação.

### ⬜ Passo 9 — Aplicar no Supabase e migrar o que existir
- **O que muda:** rodar o schema novo no projeto e, se houver dado que valha a pena, um script de migração pontual.
- **Verificação:** eu não alcanço seu Supabase daqui, então: eu te entrego o SQL + um **roteiro de verificação** com as consultas exatas para você rodar e colar o resultado. Se algum passo falhar, ajusto com base no retorno.
- **Risco:** 🟠 depende de você executar. Faço backup-guiado antes.

**✅ Fim da Fase C:** banco sem B1 nem B2, comprovado por teste, com schema legível.

---

## FASE D — Fotos no Storage (o bug mais caro)

### ⬜ Passo 10 — Bucket, políticas e caminho no app
- **O que muda:** bucket privado no Supabase Storage + políticas por fiscal/ocorrência; `PhotoUpload` passa a subir arquivo e guardar o *path*; telas de detalhe resolvem via URL assinada.
- **Resolve:** B3 inteiro — o banco para de inchar (500 MB davam para ~110 ocorrências; passam a dar para dezenas de milhares) e some o risco de estourar a cota do `localStorage` no modo offline.
- **Verificação:** harness + teste manual do fluxo de anexo, inclusive **offline**.
- **Risco:** 🟠 médio-alto — é o passo que mais mexe no app. Por isso o passo 5 já terá aliviado o problema antes, e podemos ir com calma.

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

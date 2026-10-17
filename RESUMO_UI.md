# SIFAU — resumo da melhoria de interface (outubro de 2026)

Trabalho **somente de interface**. Nada mudou no banco de dados, nas regras de
segurança, no fluxo do sistema (cadastro → aprovação → ocorrência → vistoria →
auto → auditoria) nem nas consultas que as telas fazem. `npm run verify` está
**verde** com todos os testes originais.

---

## O que você vai notar no celular

1. **O administrador não fica mais preso no painel.** Dava para tocar em "Meu
   perfil" ou "Vistoria" e o app voltava para o painel sozinho. Agora a troca
   funciona, e o menu lateral (☰) ganhou o atalho "Painel Administrativo" — é
   por ali que se volta ao painel. A lista "Mais" também mostra o painel em
   primeiro lugar para quem é administrador.
2. **O painel administrativo cabe na tela.** Antes a busca e o cartão do fiscal
   estouravam para fora e a linha rolava de lado.
3. **A barra de baixo sobe da barra de gestos do Android.** Em aparelho com
   navegação por gestos, os botões de baixo não ficam mais meio escondidos.
4. **Botões maiores.** Todo alvo de toque tem pelo menos 44px — dá para usar
   com luva. Os botõezinhos de ação do painel (chat, banir) cresceram.
5. **Carregamento com esqueleto.** No lugar da bolinha girando, aparece a
   "forma" do conteúdo (cartões cinzas) enquanto os dados chegam — na central,
   na fila de vistorias, nas ordens, na auditoria, nas notificações, nas
   mensagens, na equipe, nos documentos, no painel e ao trocar de tela.
6. **Um só desenho de "tela vazia".** Onde não há nada para mostrar, a mensagem
   segue o mesmo formato em todo o app (ícone, título, frase de apoio).
7. **Texto de apoio mais escuro.** As letras cinzinhas passaram do limite de
   contraste para leitura no sol (mínimo 4,5:1).
8. **As fotos mostram as ações sem precisar de mouse.** Em celular, os botões de
   ver/apagar da miniatura aparecem sempre; antes só apareciam ao passar o
   mouse — coisa que não existe em aparelho.
9. **Visualizador de imagens com controles dentro da tela.** Antes as setas e o
   "fechar" ficavam fora do visor em celular.
10. **Cores organizadas.** As 160 cores soltas viraram 41 tons nomeados (um só
    lugar no arquivo de estilo). Mesmo tom de azul, verde, amarelo e vermelho em
    todas as telas; cartões, selos e avisos com o mesmo formato.
11. **Um toque "afunda" o cartão** nas listas (resposta ao toque imediata), e os
    cartões de ocorrência e de ordem também funcionam no teclado (acessibilidade).
12. **Rótulos menores maiores** (como "atribuídas" no resumo azul e a data no pé
    do cartão) e a caixa de filtros da central ganhou estilo próprio.

## Tela a tela

| Tela | O que mudou |
|---|---|
| Entrada / cadastro / recuperar senha | Botões e abas com 44px; texto de apoio mais escuro; nada de mudança de fluxo. |
| Início (central) | Esqueleto no carregamento; caixa de filtros com estilo; cartões com toque e teclado; "Registrar ocorrência" intacto. |
| Nova ocorrência | Sem mudança de fluxo; botões de urgência maiores (2×2 em tela estreita); contraste. |
| Vistoria (fila) | Esqueleto; aviso no formato padrão; prazo com selo verde/vermelho; botões "Abrir"/"Redistribuir" maiores. |
| Vistoria (formulário) | Sem mudança de fluxo; campos e botões maiores; contraste. |
| Auto de infração | Aviso no formato padrão; contraste; sem mudança de fluxo (PDF, assinatura, fila offline como antes). |
| Detalhe da ocorrência | Esqueleto nas listas de vistorias e histórico; cabeçalho empilha em tela estreita; coordenadas nunca estouram a linha. |
| Painel (gráficos) | Esqueleto no carregamento; rótulos do gráfico de barras cabem em 324px; "Exportar CSV" maior. |
| Ordens | Esqueleto; cartão com toque e teclado; botões maiores. |
| Auditoria | Esqueleto; contraste; botão de exportar maior. |
| Mensagens | Esqueleto; estado vazio no formato padrão; anexos com 44px; área de texto confortável. |
| Notificações | Esqueleto; estado vazio no formato padrão; contraste. |
| Documentos | Esqueleto no lugar do girar de tela inteira; ações das fotos sempre visíveis no toque; visualizador com controles dentro da tela; estatísticas em 2 colunas em tela estreita. |
| Mapa | Estado vazio no formato padrão. |
| Fiscais cadastrados | **Novo:** agora mostra esqueleto enquanto carrega (antes piscava "nenhum fiscal encontrado"); estado vazio no formato padrão. |
| Meu perfil | Interruptores com papel de interruptor para leitor de tela; aviso no formato padrão. |
| Mais | Painel Administrativo em primeiro para administrador; demais itens intactos. |
| Painel administrativo | Cabe na largura do celular (Apêndice A); atalho de volta no menu lateral; botões de ação 44px com rótulo para leitor de tela; vazio dos logs no formato padrão; seletor de distribuição maior. |
| Menu lateral | Atalho "Painel Administrativo" para administrador; respeita área segura. |

## O que NÃO mudou (de propósito)

- `supabase/`, `tests/`, `android/`, `public/` e `src/lib/` — intocados.
- Nenhuma consulta ao Supabase mudou de coluna; nenhuma tela nova pede dado que
  o banco não tem.
- Fluxo completo: cadastrar → aprovar → ocorrência com foto → vistoria → auto →
  auditoria. Etapas, ordem e permissões (RLS) idênticas.

## Avisos para quem usa o APK

- A cor de alguns textos de apoio ficou **um pouco mais escura** e os botõezinhos
  **maiores** — é a mesma tela, mais legível no sol. Se algo parecer "mais
  cheio", é o alvo de toque de 44px.
- Os botões de ação do painel administrativo (ativar, chat, banir) agora são um
  pouco maiores e passam a ter rótulo falado pelo leitor de tela.
- Não é preciso migração, reconfiguração ou reinstalação além do APK novo.

## Sugestões para o futuro (fora do escopo "só UI")

1. **Separar o painel administrativo em telas menores** (aprovação, triagem,
   conversa, banimento e logs) — hoje são ~1100 linhas num componente só; nada
   quebra, mas dificulta manutenção.
2. **Mostrar a foto "antes/depois" da vistoria no detalhe da ocorrência** — o
   banco guarda o caminho, mas nenhuma tela exibe hoje; seria nova consulta e
   mexe na regra de colunas, então ficou de fora.
3. **Contador de anexos na lista de mensagens** — exigiria nova consulta.
4. **Filtro por período no painel de gráficos** — os dados existem, mas é
   mudança de consulta; combinar antes.
5. **Confirmação com o polegar (snackbar) após ações** (atribuir, banir) em vez
   de só o texto no topo — melhoria de percepção, sem dado novo.
6. **Ordem das categorias por mais usadas** na nova ocorrência — hoje a lista é
   fixa; seria só interface, e cabe num próximo passo.

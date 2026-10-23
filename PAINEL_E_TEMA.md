# Acompanhamento do trabalho e tema claro/noturno

## Onde encontrar

- **Entrada:** botão de lua/sol acima do formulário.
- **Após entrar:** lua/sol no cabeçalho, ao lado das notificações.
- **Início → Meu acompanhamento**, ou **Painel** na navegação inferior.

O tema é aplicado antes da renderização do React. Na primeira visita acompanha
claro/escuro do dispositivo; após uma escolha, a preferência fica salva neste
navegador/aparelho. Não depende do login nem altera o tema de outros aparelhos.
As abas do mesmo navegador sincronizam a mudança. Se o navegador bloquear o
armazenamento, o botão continua funcionando, mas a persistência não é garantida.
Fotos, mapas, assinaturas e PDFs não sofrem filtros de inversão. O PDF continua
com seu modelo de impressão claro. O campo de assinatura permanece branco para
preservar a legibilidade da tinta azul salva.

## O que os gráficos mostram

- Totais de ocorrências, OS, documentos, vistorias e autos de infração.
- Situações das ocorrências e das OS.
- Documentos por tipo: fotos, assinaturas, documentos digitalizados, relatórios
  e arquivos de autos. Arquivos de autos não são somados aos autos emitidos.

**Escopo:** todo o período, somente os registros que a conta pode consultar
pelas políticas existentes (RLS). Não representa um histórico de cada clique e
não mede produtividade individual certificada. Um administrador pode ver um
conjunto mais amplo que um fiscal. Uma mesma ocorrência pode originar vários
outros registros; somar módulos não equivale ao número de casos distintos.

As consultas dos gráficos são HEAD com `count: exact`, sem baixar arquivos e
sem o limite de mil linhas das listagens. Há no máximo quatro consultas
simultâneas do acompanhamento. As barras são comparadas com a maior contagem
do respectivo grupo, não são percentuais de conclusão. Zero tem largura zero.
As contagens são consultas independentes, não um snapshot transacional: podem
variar se alguém salvar registros durante a atualização.

Falhas individuais mostram **Indisponível**, não zero; os demais módulos seguem
visíveis. O botão Atualizar acompanhamento repete as consultas. Sair da tela ou
iniciar nova consulta cancela a carga anterior. O botão Atualizar painel também
atualiza o acompanhamento e os detalhes antigos de ocorrências.

## Publicação

Não há SQL, migration ou nova dependência de produção para esta melhoria.
É necessário integrar o PR e aguardar o deploy **Production** da Vercel para
que a mudança apareça na URL pública. A implantação não foi feita nesta sessão.
Se o app estiver instalado como PWA, o aviso de nova versão pode solicitar a
atualização; para o aplicativo Android nativo, é necessário novo build do APK.
Não confundir um Preview de outra branch com o deploy de produção.

## Verificação realizada

- `npm run verify`: typecheck, lint, 44 testes unitários, 141 testes SQL em cada
  caminho de instalação, paridade e reaplicação aprovados.
- `npm run build` aprovado.
- Chromium/Playwright com os componentes reais AppShell, HomeScreen, Dashboard
  e AuthScreen, em fixture com respostas de rede simuladas (sem login real):
  - atalho abre os gráficos; cinco módulos e agrupamentos de OS/documentos;
  - contagem de 2.345 documentos, sem truncamento e sem buscar os arquivos;
  - barra zero, falha parcial, recuperação e estado vazio;
  - troca de tema e persistência de ambos os temas após recarregar;
  - tela de entrada em modo escuro;
  - 320, 360 e 520px nos dois temas, sem rolagem horizontal e botão de 44px;
  - sem erros de JavaScript. Capturas claro/escuro conferidas.

Os testes com dados simulados não substituem a conferência em uma conta real
no deploy publicado nem testes em Android físico. Banco de produção intocado.

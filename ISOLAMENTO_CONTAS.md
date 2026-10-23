# Privacidade por conta — sem apagar registros

## Comportamento

- Conta comum: suas ocorrências (`fiscal_registrou`), OS (`fiscal_abertura`),
  vistorias/documentos/assinaturas/anexos (`fiscal_id`). A auditoria e o histórico
  só são legíveis quando pertencem a uma ocorrência/OS da própria conta.
- Autos: pertencem à conta criadora da OS quando há OS; sem OS, ao criador da
  ocorrência vinculada. Autos sem esses vínculos permanecem na visão do admin,
  sem inventar um proprietário. Nada é transferido entre contas automaticamente.
- Administrador: inicia no painel administrativo, com indicação permanente do
  papel e visão geral. Mantém Mais, Painel, Ordens, documentos, mapa e as demais
  telas. Sua atividade operacional não aparece nas contas comuns.
- As contas administrativas existentes são preservadas. Esta atualização não
  promove, remove ou limita o número de administradores existentes: o ajuste é
  de separação de acesso e identificação da interface, não de exclusão de contas.
- O diretório de equipe continua disponível, mostrando apenas os campos públicos
  já previstos pelo RPC, não e-mail/telefone ou trabalhos dos outros usuários.
- Conversas e arquivos expressamente enviados pela administração ao destinatário
  continuam acessíveis nessa conversa. Isso não compartilha pastas nem outros casos.

A proteção principal é **RLS no banco**, inclusive para contagens, buscas,
exportações e acessos diretos com IDs conhecidos. Não depende só de esconder
cartões no navegador. Políticas restritivas se combinam com as anteriores por
AND para conter permissões legadas de leitura compartilhada.

## Sem atribuição nesta fase

- A vistoria mostra as ocorrências próprias ainda não encerradas. Pode ser
  iniciada sem a administração distribuir um caso. Laudo, fotos e validações
  continuam obrigatórios, conforme o fluxo anterior.
- Atribuir/redistribuir estão desativados no servidor e não são oferecidos nas
  telas. As preferências de aviso de atribuição ficam preservadas, mas o botão
  correspondente aparece indisponível nesta fase.
- Campos de atribuições antigas **não são apagados**. Eles não passam a conceder
  leitura ou alteração de trabalhos de outras contas.
- Alertas de SLA passam a se dirigir ao criador, sem depender de atribuição.
- O fluxo da OS mantém notificação, decisão de emitir/não emitir, assinaturas,
  histórico e prazo original de correção de 48h.

Se um trabalho antigo foi criado por uma conta e executado por outra, não há
transferência automática. O administrador continua podendo consultá-lo; o
acesso pessoal segue os campos de origem acima. Revisar casos ambíguos exige
uma decisão explícita do responsável, não apagar dados ou adivinhar autoria.

## Publicação — ordem importante

1. Faça backup e valide em homologação. Mantenha o esquema SIFAU anterior,
   incluindo as migrations do fluxo e da decisão de auto da OS.
2. No projeto correto, SQL Editor → New query, execute inteiro o arquivo
   `entrega/SQL_EDITOR_ISOLAR_CONTAS.txt`, como administrador (`postgres`).
3. Se houver erro de pré-requisito, **pare** e confira a atualização anterior.
   A execução é transacional e não modifica registros. Não use o script de
   limpeza de testes: ele é outro arquivo e não faz parte desta atualização.
4. Depois publique esta versão do app (merge e deploy Production; novo build
   para o Android nativo). Não foi aplicado SQL/deploy em produção nesta sessão.
**A privacidade deve ser a última atualização SQL aplicada.** Não reaplique
os scripts antigos isolados de OS depois dela: eles podem substituir funções
seguras por versões anteriores. `SETUP_COMPLETO.sql` já inclui tudo na ordem
correta para instalação; para um projeto existente prefira o arquivo incremental
acima, sem executar novamente scripts antigos.

5. Entre separadamente com duas contas comuns e a conta administrativa e confira
   os registros, contagens, documentos e exportações esperados em cada uma.

O app verifica o RPC `account_isolation_ready`. Sem a atualização SQL, não abre
os registros com as políticas compartilhadas antigas: mostra aviso para conferir
conexão/migration. Uma falha transitória de rede após verificação válida mantém
o comportamento de sessão já previsto. Sincronização offline só inicia depois
da verificação de acesso. Pendências permanecem separadas por ID de conta.

Trocar de conta remonta as telas e limpa o estado de navegação anterior; respostas
atrasadas de perfil não podem substituir o perfil da sessão nova. Falhas ao
carregar perfil exibem opção de tentar novamente, não uma tela de outra conta.

## Garantias e validação

A migration contém alterações de políticas, funções e permissões. **Não contém
limpeza de tabelas nem reatribuição dos dados existentes**. As senhas, contas,
configurações, arquivos e linhas históricas ficam preservados.

- Suite de isolamento com administrador e duas contas comuns, leitura direta,
  IDs conhecidos, mutações/RPCs, Storage, documentos, históricos, notificações,
  atribuições legadas, SLA e manutenção das 48h.
- Teste de upgrade real do schema anterior: compara todas as linhas de public,
  auth e storage antes/depois, incluindo senha fictícia, OS encerrada, auto,
  histórico e vínculo de designação antigo. Nenhuma linha muda.
- O arquivo exato para SQL Editor é reaplicado duas vezes e comparado ao schema
  de instalação. Testes antigos foram atualizados para o contrato sem atribuição,
  preservando validações de segurança e integridade.
- Chromium/Playwright com o App real e respostas de auth/REST simuladas:
  login/troca entre duas contas, fila própria sem distribuição, admin identificado,
  navegação Mais/Painel/Documentos e tema preservados, bloqueio sem a migration,
  larguras 320/360/520px. Capturas conferidas; sem erros JavaScript.

Testes simulados não substituem verificação com contas reais no projeto após a
publicação. Nenhuma conta ou registro de produção foi apagado ou modificado.

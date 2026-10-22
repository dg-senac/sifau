# Tramitação de ordens de serviço

## Fluxo disponível

1. Criar a OS normalmente, preservando origem, requerente, endereço, descrição,
   apoio operacional, localização e prazo de resposta.
2. Abrir novamente a mesma OS. Em **Editar OS / vincular denúncia**, selecionar
   uma denúncia registrada pelo fiscal ou designada a ele, quando houver.
3. **Registrar notificação**: responsável, documento, endereço, relato, fundamento
   e ciência (assinou, recusou ou ausente). Isto registra a notificação realizada;
   não envia mensagem/e-mail nem comprova por si só entrega ou validade jurídica.
4. **Gerar auto de infração**, se necessário: autuado, documento, tipo, fundamento
   legal, motivo, valores, vencimento, testemunha e ciência. O auto é uma linha
   real em `autos_infracao`, vinculada à OS e à denúncia. A edição corrige a
   mesma linha; cada versão anterior permanece no histórico da OS.
5. **Registrar embargo**, se legalmente cabível: responsável, endereço, alcance,
   fundamento legal e ciência. Exige um auto, mas nunca é gerado automaticamente.
6. **Concluir OS**, com resultado/justificativa, mesmo sem auto e sem embargo.
   A assinatura manuscrita do fiscal é opcional nesta etapa. A conclusão pode
   também ser corrigida dentro do prazo original.

### Prazo de correção

**48 horas corridas contadas da primeira conclusão**, pelo relógio do servidor.
Correções não reiniciam esse prazo, e não é permitido reabrir a OS para burlá-lo.
Após o limite, a OS já está concluída e torna-se somente leitura automaticamente,
sem depender de um aplicativo aberto, agendamento ou tarefa de cron.
A proteção vale também para o administrador usando a API normal.

Não há prazo de dois dias para terminar uma OS que ainda está em andamento.
O prazo de resposta preenchido na criação é independente da janela de correções.

### Assinaturas e arquivos

- Notificação, auto e embargo aceitam a ciência sem assinatura (ausente/recusou).
  A opção "Assinou" exige nova assinatura quando o documento é corrigido.
- Assinaturas são PNGs no bucket privado `sifau-anexos`, nunca base64 no banco.
- Assinatura manuscrita digitalizada não equivale a certificado ICP-Brasil.
- **Baixar dossiê da OS** reúne os dados salvos, incluindo assinaturas e conclusão,
  num PDF paginado. Uma cópia é arquivada em `documentos`, vinculada à OS e à revisão.
  Revisões antigas também podem ser baixadas. Uma nova tentativa de download
  não arquiva outra cópia se a revisão já estiver visível ao usuário.
- Não é preciso baixar para salvar o andamento: cada etapa já persiste no banco.
- PDFs arquivados e assinaturas que integram revisões são protegidos contra
  exclusão/alteração pelas APIs normais, inclusive no Storage.
- Os demais fiscais não têm acesso aos dados pessoais do dossiê: leitura de OS
  é restrita ao fiscal de abertura, designado e administradores.
- As etapas requerem internet. Falha não é anunciada como sincronização concluída;
  os campos permanecem na tela para nova tentativa. Ainda não há fila offline
  para tramitação/encerramento de OS. Fechar a tela descarta campos não salvos.

## Implantação (necessária antes do novo APK)

**Este trabalho não executa alterações no projeto Supabase de produção.**

1. Fazer backup e testar em ambiente de homologação.
2. Em banco existente com as migrations anteriores aplicadas, executar somente:
   `supabase/migrations/20261021000000_os_workflow.sql`.
   Pode ser aplicado pelo SQL Editor ou pela rotina de migrations do projeto.
3. Não executar `SETUP_COMPLETO.sql` sobre produção. Ele foi atualizado apenas
   para instalações novas e para manter a paridade com as migrations.
4. Publicar a aplicação / gerar e instalar o APK atualizado.

A migration acrescenta `fluxo`, `versao`, `concluida_em`, `edicao_ate` à OS,
cria `os_historico`, o RPC `salvar_etapa_os`, RLS, proteções de prazo e arquivos.
Mudanças de status passam pelo RPC, não mais por UPDATE direto do cliente.

### Dados anteriores

- OS existentes recebem um retrato de migração. Nenhuma OS ou auto é apagado.
- Autos previamente ligados à OS são incorporados ao retrato; os anteriores
  ao mais recente também aparecem no PDF. Não se inventa o nome de um fiscal
  autuante que o registro antigo não armazenava.
- OS já concluídas/canceladas sem janela de correção ficam somente para consulta.
  A migration não reabre documentos antigos nem cria um prazo retroativo.
- Um auto antigo precisa de uma notificação registrada na OS para ser corrigido
  pelo novo fluxo. Seus dados originais continuam preservados no histórico.

## Testes

`npm run verify` cobre os testes anteriores e a suíte nova
`tests/suites/07-os-workflow.test.mjs`, aplicada tanto pelo setup quanto por
migrations. Inclui sequência, vínculo próprio/designado, recusa a terceiros e
anônimos, concorrência, duplicação, correção, encerramento sem auto, 48h sem
prorrogação, histórico imutável, arquivos preservados e proximidade com precisão.

`npm run build` valida a compilação web. Isso não substitui teste em aparelho.

### Roteiro manual no APK

- Criar OS, sair, voltar à lista e abrir a mesma OS.
- Vincular uma denúncia própria e outra designada; confirmar que denúncias de
  terceiros não aparecem como opção.
- Registrar notificação sem assinatura e com assinatura.
- Gerar auto, voltar mais tarde, corrigir e conferir que não duplica.
- Registrar embargo fundamentado somente quando aplicável.
- Concluir outra OS sem auto/embargo com justificativa.
- Baixar PDF atual e revisão anterior, conferir nomes, endereço, valores,
  paginação de texto longo, assinaturas e cópia arquivada em Documentos.
- Validar download no WebView Android e no navegador (o ambiente de coding não
  comprova o comportamento do gerenciador de downloads do aparelho).
- Corrigir dentro de 48h e conferir que a data limite não muda.
- Em homologação, simular expiração e confirmar somente leitura inclusive após
  recarregar, alterar relógio do telefone e tentar chamar a API diretamente.

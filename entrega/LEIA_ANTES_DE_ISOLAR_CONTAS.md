# Aplicar pelo Chromebook — sem limpar nada

A correção está preparada no código, mas **ainda não está ativa em produção**.
Este procedimento é de privacidade, não de limpeza de testes.

## Primeiro: banco de dados

1. Faça uma cópia de segurança e confira o nome do projeto antes de executar.
2. Abra o painel do **Supabase** no navegador → seu projeto → **SQL Editor**.
3. Clique em **New query**.
4. Abra `SQL_EDITOR_ISOLAR_CONTAS.txt`, copie **todo** o conteúdo e cole na consulta.
5. Execute em **Run**, usando o papel administrativo `postgres` do SQL Editor.
6. Aguarde o sucesso. Se aparecer erro, **pare e envie a mensagem**, sem senhas
   ou chaves. Não rode limpeza nem outros scripts para tentar contornar.

O arquivo exige o fluxo de OS anterior já instalado. É uma transação: se houver
falha, a atualização não fica aplicada pela metade. Não apaga nem transfere
registros, contas, documentos, fotos ou históricos. O script também foi testado
para reaplicação sem mudança dos dados.

## Depois: aplicativo

- Só depois do SQL bem-sucedido publique esta versão do app. O PR ainda precisa
  de aprovação/merge e a publicação de produção precisa ser conferida.
- No navegador, abra a versão atualizada. Para o aplicativo Android nativo,
  será necessário instalar uma versão gerada com este código.
- Sem o SQL, o novo app bloqueia o acesso em vez de carregar dados compartilhados.
- Não reaplique scripts antigos de OS depois da privacidade; eles podem repor
  funções antigas. A atualização de privacidade deve ficar por último.

## Conferência rápida

- Conta comum A: apenas registros e documentos de A; vistoria sem atribuição.
- Conta comum B: apenas registros e documentos de B, inclusive após trocar A/B.
- Administração: faixa **Modo administrador** e acesso à gestão geral.
- Confira também **Mais**, **Painel**, documentos em papel cadastrados, mapa e OS.

Nada foi apagado. A limpeza de testes continua adiada e não faz parte desta entrega.
Para detalhes técnicos e resultados dos testes, consulte `ISOLAMENTO_CONTAS.md`.

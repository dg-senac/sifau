# Exportações legíveis

## Onde encontrar

- **Painel operacional:** “Exportar ocorrências”.
- **Painel administrativo:** botão com ícone de download, “Exportar fiscais”.
- **Trilha de auditoria:** “Exportar trilha completa”.

Excel é a opção inicial/recomendada; PDF e CSV podem ser escolhidos no seletor.
A auditoria mantém também o **JSON técnico**, sem substituir os campos originais
por valores formatados ou nomes derivados.

## Formatos

### Excel (.xlsx)

Arquivo Office Open XML real (não CSV renomeado), com três abas:

- **Dados:** títulos em português, cabeçalho azul, primeira linha/coluna fixas,
  filtros, largura de coluna definida, quebra de linha, faixas alternadas e
  destaque por situação. Datas e valores numéricos são células nativas; nomes,
  telefones e identificadores são texto, preservando zeros à esquerda.
- **Identificadores:** UUIDs e vínculos técnicos, relacionados à aba Dados pela
  coluna **Registro**. Não são descartados nem expostos como cabeçalhos principais.
- **Sobre o relatório:** título, abrangência, quantidade, geração e fuso horário.

Datas usam horário civil de **America/Recife** e formato brasileiro. Valores de
moeda, quando presentes no modelo, têm formato R$. Um texto acima do limite de
32.767 caracteres por célula é recusado com orientação para usar PDF/CSV, não
truncado silenciosamente.

### PDF

Relatório de leitura/impressão: título, abrangência, quantidade, data de geração,
fichas por registro, texto paginado, cabeçalhos de tabela repetidos e páginas
numeradas. Os IDs técnicos estão disponíveis nos formatos Excel/CSV para não
comprometer a leitura. A fonte principal mantém suporte aos acentos em português.

### CSV

UTF-8 com BOM, separador `;`, finais de linha CRLF, aspas escapadas, nomes de
colunas em português, datas e números brasileiros. Campos de texto potencialmente
interpretados como fórmula recebem prefixo de proteção. O CSV não guarda estilos
nem tipos de célula: para preservar telefones/IDs com zeros ao abrir diretamente
em uma planilha, prefira XLSX ou importe essas colunas como texto.

### JSON técnico da auditoria

Mantém os campos brutos da trilha. O SHA-256 registrado corresponde aos bytes do
arquivo efetivamente oferecido para download, seja JSON, Excel, CSV ou PDF.
Falha ao registrar o hash é comunicada, não disfarçada como registro bem-sucedido.
Os formatos de leitura não substituem o JSON para integrações técnicas.

## Abrangência, segurança e limites

- Os arquivos incluem **todos os registros acessíveis à conta**, independentemente
  da busca/filtro da tela. Isto é informado junto aos controles e no relatório.
- O mapa usa um recorte de 30 dias, mas a exportação de ocorrências não se limita
  a esse recorte. A auditoria não se limita aos 50 registros visíveis.
- As consultas são paginadas (500 registros) e têm ordenação estável. Não ficam
  silenciosamente limitadas às primeiras 1.000 linhas da API.
- O início da exportação é usado como limite de data dos registros. Isso não é
  um snapshot transacional: alterações concorrentes em tabelas mutáveis podem
  refletir nas páginas seguintes. A auditoria, por sua vez, é imutável.
- Situação cadastral de um fiscal indica a ativação do perfil; banimentos são
  controles separados, como explicado no relatório.
- As permissões do Supabase permanecem valendo. Não há consultas com service_role
  nem leitura de fotos/assinaturas pesadas para gerar os relatórios tabulares.
- CSV e XLSX não transformam textos de usuários em fórmulas ou links externos.
- Dados pessoais exportados devem ser guardados/compartilhados somente em locais
  e com pessoas autorizadas.
- Arquivos originais enviados pelos usuários e os PDFs específicos de OS/auto
  permanecem inalterados por esta melhoria.
- A mensagem “Download solicitado” não garante que o sistema operacional concluiu
  a gravação. O usuário precisa conferir a pasta de downloads.

## Implantação e validação

Esta melhoria de exportação **não exige SQL novo nem mudanças no Android**.
É necessário publicar o frontend ou gerar/instalar um novo APK. Se o pacote de
OS deste mesmo PR ainda não foi implantado, sua migration continua necessária,
conforme `FLUXO_OS.md`.

Dependências de geração são carregadas sob demanda: `write-excel-file` para XLSX
e `jspdf-autotable` com o jsPDF já existente para paginação do PDF. `fflate` é
usado como dependência de desenvolvimento nos testes da estrutura dos arquivos.

`tests/unit/relatorios.test.mjs` cobre arquivos reais, abas/filtros/estilos,
tipos/datas/zeros, fórmulas, acentos, CSV, paginação PDF, hash dos bytes, limites,
nome do download e paginação da API. Rodar `npm run verify` e `npm run build`.

Antes de publicar, testar manualmente Excel/Google Sheets no Chromebook e o
gerenciador de downloads no APK Android. Os testes automatizados não substituem
essa validação em aparelho.

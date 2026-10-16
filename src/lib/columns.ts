// ============================================================================
// SIFAU — Listas de colunas para consultas de leitura
// ============================================================================
// As tabelas operacionais guardam anexos em base64 dentro de colunas de texto
// (`ocorrencias.fotos`, `vistorias.fotos_depois`, `autos_infracao.assinatura_autuado`).
// Em base64, cada foto cresce cerca de 33%, e uma ocorrência com as 5 fotos
// permitidas chega perto de 4,6 MB.
//
// Um `select('*')` nessas tabelas arrasta os anexos mesmo quando a tela só quer
// mostrar uma lista. Era o caso das telas de início, mapa, painel, vistoria e
// ordens — que juntas baixavam centenas de megabytes para exibir texto.
//
// Estas constantes existem para que a lista de colunas fique num só lugar.
// Ao acrescentar um campo novo, atualize a constante; ao criar uma tela que
// precise do anexo, peça a coluna de propósito.
//
// Regra prática: anexo só é lido pela galeria de documentos, que é a única tela
// que realmente os exibe.
//
// IMPORTANTE: cada valor precisa continuar sendo um **literal** de texto (uma
// única string, sem `.join()` nem concatenação). O supabase-js deriva o tipo de
// retorno a partir do literal passado ao `select()`; se a constante virar um
// `string` genérico, a inferência se perde e o tipo do resultado degrada.
// ============================================================================

/**
 * Colunas de `ocorrencias`, exceto `fotos`.
 *
 * `fotos` é gravada por `NewOccurrence` e **nunca é exibida em nenhuma tela** —
 * nem na lista, nem no detalhe. Manter a coluna fora das leituras evita baixar
 * megabytes de base64 sem uso.
 */
export const OCCURRENCE_COLUMNS =
  'id, fiscal_registrou, fiscal_designado, categoria, subcategoria, descricao, status, urgencia, latitude, longitude, bairro, endereco, sla_deadline, duplicata_de, created_at' as const;

/**
 * Colunas de `vistorias`, exceto `fotos_depois`.
 *
 * `fotos_depois` é gravada pela vistoria (mínimo de 1 foto, exigido por CHECK
 * no banco) e **também nunca é exibida**: as telas de detalhe e de ordens
 * mostram apenas data, ação, laudo e multa.
 */
export const INSPECTION_COLUMNS =
  'id, ocorrencia_id, fiscal_id, chegada_at, chegada_latitude, chegada_longitude, laudo, acao_tomada, valor_multa, numero_processo, created_at' as const;

/**
 * Colunas de `autos_infracao`, exceto `assinatura_autuado`.
 *
 * A assinatura do autuado é gravada como PNG em base64 e não é exibida na
 * listagem de autos — apenas o tipo de infração, o valor, o autuado e a ciência.
 */
export const FINE_COLUMNS =
  'id, os_id, ocorrencia_id, tipo_infracao, artigo_legal, valor_base, valor_multa, motivo, autuado_nome, autuado_documento, ciencia, testemunha_nome, pagamento, vencimento, created_at' as const;

/**
 * Apenas os campos usados na exportação CSV do painel.
 *
 * A exportação antes usava `select('*')` para montar 10 colunas de texto,
 * baixando os anexos de todas as ocorrências do banco para descartá-los.
 */
export const OCCURRENCE_EXPORT_COLUMNS =
  'id, categoria, subcategoria, descricao, status, urgencia, bairro, endereco, created_at, sla_deadline' as const;

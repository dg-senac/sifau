// ============================================================================
// SIFAU — Listas de colunas para consultas de leitura
// ============================================================================
// Estas constantes nasceram quando as fotos eram base64 DENTRO da linha do
// banco: um `select('*')` numa lista arrastava megabytes de imagem para exibir
// texto, e as telas de início, mapa, painel e ordens faziam exatamente isso.
//
// Depois do passo 10 o arquivo saiu do banco: `ocorrencias.fotos` e
// `vistorias.fotos_depois` passaram a guardar o CAMINHO no Storage, e a
// descrição de cada arquivo vive em `public.anexos`. Um `select('*')` deixou de
// ser caro nessas colunas.
//
// O padrão continua valendo por outro motivo, que não é peso:
//
//   * a tela deve pedir o que ela usa. Um `select('*')` faz a tela ficar
//     dependente de coluna que ela não conhece, e a próxima coluna pesada que
//     alguém acrescentar cai nela sem aviso;
//   * e as colunas de anexo continuam sendo a fronteira onde o base64 pode
//     voltar sem ninguém perceber — existe gatilho no banco recusando, e estas
//     constantes mantêm a leitura dessas colunas explícita.
//
// IMPORTANTE: cada valor precisa continuar sendo um **literal** de texto (uma
// única string, sem `.join()` nem concatenação). O supabase-js deriva o tipo de
// retorno a partir do literal passado ao `select()`; se a constante virar um
// `string` genérico, a inferência se perde e o tipo do resultado degrada.
// ============================================================================

/**
 * Colunas de `ocorrencias`, exceto `fotos`.
 *
 * `fotos` guarda caminhos no Storage desde o passo 10 e **nunca é exibida em
 * nenhuma tela** — nem na lista, nem no detalhe. Quem quiser exibir a evidência
 * de uma ocorrência deve ler `public.anexos`, que tem tipo, momento e dimensões.
 */
export const OCCURRENCE_COLUMNS =
  'id, fiscal_registrou, fiscal_designado, categoria, subcategoria, descricao, status, urgencia, latitude, longitude, bairro, endereco, sla_deadline, duplicata_de, created_at' as const;

/**
 * Colunas de `vistorias`, exceto `fotos_depois`.
 *
 * `fotos_depois` guarda caminhos no Storage desde o passo 10 — mínimo de 1 foto,
 * exigido pelo RPC `complete_inspection` e pelo CHECK da coluna — e **também
 * nunca é exibida**: as telas de detalhe e de ordens mostram apenas data, ação,
 * laudo e multa.
 */
export const INSPECTION_COLUMNS =
  'id, ocorrencia_id, fiscal_id, chegada_at, chegada_latitude, chegada_longitude, laudo, acao_tomada, valor_multa, numero_processo, created_at' as const;

/**
 * Colunas de `autos_infracao`, exceto `assinatura_autuado`.
 *
 * A assinatura do autuado ainda é gravada como PNG em base64: é o último ponto
 * do app que não migrou para o Storage. Não é exibida na listagem de autos —
 * apenas o tipo de infração, o valor, o autuado e a ciência.
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

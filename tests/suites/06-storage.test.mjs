// ============================================================================
// Suíte 6 — Fotos no Storage
// ============================================================================
// A foto saiu de dentro da linha do banco e virou arquivo em bucket privado.
// Isso move a pergunta de segurança de lugar: antes era "quem enxerga a linha",
// agora é "quem enxerga o ARQUIVO". Esta suíte prova as duas coisas:
//
//   * o bucket é privado e o caminho de cada fiscal é a própria pasta
//   * ninguém sobe nem lê arquivo na pasta de outro; o administrador audita
//   * o base64 não volta: o gatilho recusa `data:` nas colunas de foto
//
// A prova aqui vale mais do que a de produção: o bucket de verdade só aceitaria
// teste com foto real de fiscal.
// ============================================================================

import { IDS, seedScenario, createOccurrence, SAMPLE_STORAGE_PATH, SAMPLE_PHOTO } from '../fixtures.mjs';

const BUCKET = 'sifau-anexos';
const caminhoDe = (fiscalId, nome) => `${fiscalId}/2026/10/${nome}`;

export default {
  name: 'storage',

  async run(t) {
    const db = t.db;
    await seedScenario(db);

    await t.test('o bucket existe e é privado', async () => {
      const { rows } = await db.owner(
        `SELECT public, file_size_limit, allowed_mime_types FROM storage.buckets WHERE id = $1`,
        [BUCKET]);
      t.eq(rows.length, 1, 'buckets com esse id');
      t.eq(rows[0].public, false, 'bucket privado');
      t.eq(Number(rows[0].file_size_limit), 5 * 1024 * 1024, 'limite por arquivo');
      t.ok(rows[0].allowed_mime_types.includes('image/jpeg'), 'JPEG permitido');
    });

    await t.test('fiscal sobe arquivo na própria pasta', async () => {
      const { rows } = await db.as(IDS.active, 'authenticated', async () =>
        db.query(
          `INSERT INTO storage.objects (bucket_id, name, owner)
           VALUES ($1, $2, $3) RETURNING id`,
          [BUCKET, caminhoDe(IDS.active, 'fachada.jpg'), IDS.active],
        ));
      t.ok(rows[0]?.id, 'objeto gravado');
    });

    await t.test('fiscal NÃO sobe arquivo na pasta de outro', async () => {
      await db.as(IDS.other, 'authenticated', async () => {
        await t.denies(
          () => db.query(
            `INSERT INTO storage.objects (bucket_id, name, owner)
             VALUES ($1, $2, $3)`,
            [BUCKET, caminhoDe(IDS.active, 'invadido.jpg'), IDS.other],
          ),
          'upload na pasta de outro fiscal',
        );
      });
    });

    await t.test('fiscal não alcança o bucket por caminho fora da própria pasta', async () => {
      // Sem pasta nenhuma: o primeiro nível do caminho não é um id de fiscal.
      await db.as(IDS.active, 'authenticated', async () => {
        await t.denies(
          () => db.query(
            `INSERT INTO storage.objects (bucket_id, name, owner)
             VALUES ($1, 'arquivo-na-raiz.jpg', $2)`,
            [BUCKET, IDS.active],
          ),
          'upload na raiz do bucket',
        );
      });
    });

    await t.test('fiscal lê o próprio arquivo e não o do colega', async () => {
      // O colega tem um arquivo na pasta dele (gravado pelo dono do banco).
      await db.owner(
        `INSERT INTO storage.objects (bucket_id, name, owner) VALUES ($1, $2, $3)`,
        [BUCKET, caminhoDe(IDS.other, 'do-colega.jpg'), IDS.other]);

      const proprios = await db.as(IDS.active, 'authenticated', async () =>
        (await db.query(`SELECT name FROM storage.objects WHERE bucket_id = $1`, [BUCKET])).rows);
      t.eq(proprios.length, 1, 'arquivos visíveis ao fiscal');
      t.eq(proprios[0].name, caminhoDe(IDS.active, 'fachada.jpg'), 'é o arquivo da própria pasta');
    });

    await t.test('administrador audita os arquivos de todos', async () => {
      const n = await db.as(IDS.admin, 'authenticated', async () =>
        Number((await db.query(`SELECT count(*) AS n FROM storage.objects`)).rows[0].n));
      t.count(n, 2, 'arquivos visíveis ao administrador');
    });

    await t.test('anônimo não lê nem sobe arquivo', async () => {
      await db.as(null, 'anon', async () => {
        await t.deniedOrEmpty(
          () => db.query(`SELECT count(*) AS n FROM storage.objects`),
          'leitura anônima do bucket',
        );
        await t.denies(
          () => db.query(
            `INSERT INTO storage.objects (bucket_id, name, owner)
             VALUES ($1, $2, $3)`,
            [BUCKET, caminhoDe(IDS.active, 'anomino.jpg'), IDS.active],
          ),
          'upload anônimo',
        );
      });
    });

    await t.test('fiscal apaga o próprio arquivo e não o do colega', async () => {
      const alheio = await db.as(IDS.active, 'authenticated', async () =>
        (await db.query(
          `DELETE FROM storage.objects WHERE name = $1 RETURNING id`,
          [caminhoDe(IDS.other, 'do-colega.jpg')],
        )).rows.length);
      t.count(alheio, 0, 'arquivos apagados na pasta do colega');

      const proprio = await db.as(IDS.active, 'authenticated', async () =>
        (await db.query(
          `DELETE FROM storage.objects WHERE name = $1 RETURNING id`,
          [caminhoDe(IDS.active, 'fachada.jpg')],
        )).rows.length);
      t.count(proprio, 1, 'arquivos apagados na própria pasta');
    });

    await t.test('ocorrência guarda caminho, não arquivo embutido', async () => {
      const ocorrenciaId = await createOccurrence(db, IDS.active, { fotos: [SAMPLE_STORAGE_PATH] });
      const { rows } = await db.owner(
        `SELECT fotos FROM public.ocorrencias WHERE id = $1`, [ocorrenciaId]);
      t.eq(rows[0].fotos, [SAMPLE_STORAGE_PATH], 'caminho preservado na coluna');
    });

    await t.test('o gatilho recusa foto embutida (base64) na ocorrência', async () => {
      // É a guarda contra a regressão: bastaria uma tela nova chamar o upload
      // antigo para o banco voltar a inchar, sem nada quebrar na hora.
      await db.as(IDS.active, 'authenticated', async () => {
        await t.denies(
          () => db.query(
            `INSERT INTO public.ocorrencias
               (fiscal_registrou, categoria, subcategoria, descricao, urgencia, bairro, endereco, fotos, sla_deadline)
             VALUES ($1, 'Buraco na via', 'Asfalto',
                     'Descrição longa o suficiente para passar pela validação.', 'Alta',
                     'Centro', 'Rua do Teste, 1', ARRAY[$2], now() + interval '72 hours')`,
            [IDS.active, SAMPLE_PHOTO],
          ),
          'foto em base64 na ocorrência',
        );
      });
    });

    await t.test('o gatilho recusa foto embutida (base64) na vistoria', async () => {
      // A vistoria entra pela coluna direta: o RPC também passa pelo gatilho.
      const ocorrencia = await createOccurrence(db, IDS.active);
      await db.as(IDS.admin, 'authenticated', async () => {
        await db.query(`SELECT public.assign_occurrence($1, $2)`, [ocorrencia, IDS.active]);
      });

      await db.as(IDS.active, 'authenticated', async () => {
        await t.denies(
          () => db.query(
            `INSERT INTO public.vistorias
               (ocorrencia_id, fiscal_id, chegada_at, chegada_latitude, chegada_longitude,
                laudo, acao_tomada, fotos_depois)
             VALUES ($1, $2, now(), -8.12, -34.90,
                     'Vistoria com foto embutida, que deve ser recusada pelo gatilho.',
                     'Notificação', ARRAY[$3])`,
            [ocorrencia, IDS.active, SAMPLE_PHOTO],
          ),
          'foto em base64 na vistoria',
        );
      });
    });

    await t.test('vistoria concluída pelo RPC grava caminhos', async () => {
      const ocorrencia = await createOccurrence(db, IDS.active);
      await db.as(IDS.admin, 'authenticated', async () => {
        await db.query(`SELECT public.assign_occurrence($1, $2)`, [ocorrencia, IDS.active]);
      });

      const vistoriaId = '77777777-7777-4777-8777-777777777777';
      const caminho = `${IDS.active}/2026/10/depois-da-vistoria.jpg`;
      await db.as(IDS.active, 'authenticated', async () => {
        await db.query(
          `SELECT public.complete_inspection(
             p_vistoria_id := $1, p_occurrence_id := $2, p_fiscal_id := $3,
             p_arrival_at := now(), p_arrival_latitude := -8.12, p_arrival_longitude := -34.90,
             p_laudo := 'Vistoria concluída com registro fotográfico da correção.',
             p_acao_tomada := 'Notificação', p_valor_multa := NULL, p_numero_processo := NULL,
             p_fotos_depois := ARRAY[$4], p_status := 'Resolvida',
             p_note := 'Vistoria realizada. Ação: Notificação.')`,
          [vistoriaId, ocorrencia, IDS.active, caminho],
        );
      });

      const { rows } = await db.owner(
        `SELECT fotos_depois FROM public.vistorias WHERE id = $1`, [vistoriaId]);
      t.eq(rows[0].fotos_depois, [caminho], 'caminho gravado pelo RPC');
    });
  },
};

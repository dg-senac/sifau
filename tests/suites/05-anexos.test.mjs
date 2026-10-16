// ============================================================================
// Suíte 5 — Anexos (modelo único de arquivos)
// ============================================================================
// A tabela `anexos` é o único lugar do schema que descreve um arquivo: o
// conteúdo vai para o Storage e o banco guarda só o caminho. Esta suíte prova
// as regras que o desenho do passo 7 prometeu:
//
//   * exatamente um vínculo por anexo (CHECK), e o vínculo precisa existir (FK)
//   * ninguém anexa arquivo em registro de outra pessoa
//   * o dono vê, o fiscal vinculado ao alvo vê, o administrador vê, o resto não
//   * o arquivo é imutável: só `titulo`, `descricao` e `ordem` mudam por UPDATE
//
// Os dois primeiros casos são os que o modelo antigo não tinha: lá o arquivo
// morava em `text[]` dentro da própria linha, sem FK e sem regra de dono.
// ============================================================================

import { IDS, seedScenario, createOccurrence, SAMPLE_PHOTO } from '../fixtures.mjs';

/** Caminho no Storage, na convenção do desenho: sifau/{fiscal}/{ano}/{mes}/{id}.jpg */
const caminho = (fiscalId, nome) => `sifau/${fiscalId}/2026/10/${nome}`;

export default {
  name: 'anexos',

  async run(t) {
    const db = t.db;
    await seedScenario(db);

    const ocorrenciaA = await createOccurrence(db, IDS.active);
    const ocorrenciaB = await createOccurrence(db, IDS.active);

    // Uma ordem de serviço do fiscal ativo serve de vínculo alternativo, para
    // provar que o CHECK recusa dois destinos ao mesmo tempo.
    const os = await db.as(IDS.active, 'authenticated', async () =>
      db.query(
        `INSERT INTO public.ordens_servico
           (numero, origem, requerente, fiscal_abertura, descricao, endereco, prazo_resposta)
         VALUES ('OS-2026-0001', 'Denúncia', 'Central de atendimento', $1,
                 'Vistoria de calçada irregular na esquina da praça central.',
                 'Rua da Aurora, 500', now() + interval '10 days')
         RETURNING id`,
        [IDS.active],
      ));
    const osId = os.rows[0].id;

    let anexoA;
    let anexoB;
    let vistoriaId;

    await t.test('fiscal anexa arquivo na própria ocorrência', async () => {
      const { rows } = await db.as(IDS.active, 'authenticated', async () =>
        db.query(
          `INSERT INTO public.anexos
             (fiscal_id, ocorrencia_id, tipo, momento, storage_path, arquivo_nome, arquivo_tipo, arquivo_bytes, largura, altura)
           VALUES ($1, $2, 'foto', 'antes', $3, 'fachada.jpg', 'image/jpeg', 245760, 1280, 960)
           RETURNING id`,
          [IDS.active, ocorrenciaA, caminho(IDS.active, 'fachada.jpg')],
        ));
      anexoA = rows[0]?.id;
      t.ok(anexoA, 'anexo gravado');
    });

    await t.test('o vínculo é obrigatório e único', async () => {
      // Sem vínculo nenhum.
      await db.as(IDS.active, 'authenticated', async () => {
        await t.denies(
          () => db.query(
            `INSERT INTO public.anexos (fiscal_id, tipo, storage_path)
             VALUES ($1, 'foto', $2)`,
            [IDS.active, caminho(IDS.active, 'sem-vinculo.jpg')],
          ),
          'anexo sem vínculo',
        );
      });

      // Com dois vínculos ao mesmo tempo.
      await db.as(IDS.active, 'authenticated', async () => {
        await t.denies(
          () => db.query(
            `INSERT INTO public.anexos (fiscal_id, ocorrencia_id, ordem_servico_id, tipo, storage_path)
             VALUES ($1, $2, $3, 'foto', $4)`,
            [IDS.active, ocorrenciaA, osId, caminho(IDS.active, 'dois-vinculos.jpg')],
          ),
          'anexo com dois vínculos',
        );
      });
    });

    await t.test('anexo apontando para registro inexistente é recusado', async () => {
      // FK de verdade: o modelo antigo aceitava qualquer texto aqui.
      await db.as(IDS.active, 'authenticated', async () => {
        await t.denies(
          () => db.query(
            `INSERT INTO public.anexos (fiscal_id, ocorrencia_id, tipo, storage_path)
             VALUES ($1, '99999999-9999-4999-8999-999999999999', 'foto', $2)`,
            [IDS.active, caminho(IDS.active, 'orfao.jpg')],
          ),
          'anexo órfão',
        );
      });
    });

    await t.test('fiscal NÃO anexa arquivo na ocorrência de outro', async () => {
      // `outro` é fiscal ativo, mas não registrou nem foi designado nesta
      // ocorrência: o vínculo não é alcançável por ele.
      await db.as(IDS.other, 'authenticated', async () => {
        await t.denies(
          () => db.query(
            `INSERT INTO public.anexos (fiscal_id, ocorrencia_id, tipo, storage_path)
             VALUES ($1, $2, 'foto', $3)`,
            [IDS.other, ocorrenciaA, caminho(IDS.other, 'invasao.jpg')],
          ),
          'anexo em ocorrência alheia',
        );
      });
    });

    await t.test('fiscal NÃO anexa arquivo em nome de outro', async () => {
      await db.as(IDS.other, 'authenticated', async () => {
        await t.denies(
          () => db.query(
            `INSERT INTO public.anexos (fiscal_id, ordem_servico_id, tipo, storage_path)
             VALUES ($1, $2, 'documento', $3)`,
            [IDS.active, osId, caminho(IDS.other, 'em-nome-de-outro.pdf')],
          ),
          'anexo em nome de outro fiscal',
        );
      });
    });

    await t.test('tipo fora da lista é recusado', async () => {
      await db.as(IDS.active, 'authenticated', async () => {
        await t.denies(
          () => db.query(
            `INSERT INTO public.anexos (fiscal_id, ocorrencia_id, tipo, storage_path)
             VALUES ($1, $2, 'planilha_de_gastos', $3)`,
            [IDS.active, ocorrenciaA, caminho(IDS.active, 'tipo-invalido.csv')],
          ),
          'tipo inválido',
        );
      });
    });

    await t.test('o mesmo caminho de arquivo não pode ser usado duas vezes', async () => {
      // Protege contra o app subir o mesmo objeto duas vezes e ficar com duas
      // linhas apontando para um arquivo só.
      await db.as(IDS.active, 'authenticated', async () => {
        await t.denies(
          () => db.query(
            `INSERT INTO public.anexos (fiscal_id, ocorrencia_id, tipo, storage_path)
             VALUES ($1, $2, 'foto', $3)`,
            [IDS.active, ocorrenciaA, caminho(IDS.active, 'fachada.jpg')],
          ),
          'caminho duplicado',
        );
      });
    });

    await t.test('dono enxerga o próprio anexo', async () => {
      const n = await db.as(IDS.active, 'authenticated', async () =>
        Number((await db.query(`SELECT count(*) AS n FROM public.anexos`)).rows[0].n));
      t.count(n, 1, 'anexos visíveis ao dono');
    });

    await t.test('administrador enxerga os anexos para auditoria', async () => {
      const n = await db.as(IDS.admin, 'authenticated', async () =>
        Number((await db.query(`SELECT count(*) AS n FROM public.anexos`)).rows[0].n));
      t.ok(n >= 1, 'anexos visíveis ao administrador');
    });

    await t.test('fiscal recém-cadastrado, nunca aprovado, não enxerga anexo nenhum', async () => {
      // É a mesma classe do defeito B1: um perfil inativo não pode levar nada.
      await db.as(IDS.pending, 'authenticated', async () => {
        await t.deniedOrEmpty(() => db.query(`SELECT count(*) AS n FROM public.anexos`), 'anexos');
      });
    });

    await t.test('fiscal designado enxerga o anexo da ocorrência que vai vistoriar', async () => {
      // O desenho abre a leitura para o fiscal vinculado ao alvo: ele precisa
      // ver a foto "antes" do problema que vai vistoriar.
      await db.as(IDS.admin, 'authenticated', async () => {
        await db.query(`SELECT public.assign_occurrence($1, $2)`, [ocorrenciaA, IDS.other]);
      });

      const { rows } = await db.as(IDS.other, 'authenticated', async () =>
        db.query(`SELECT * FROM public.anexos`));
      t.count(rows.length, 1, 'anexos visíveis ao fiscal designado');
      t.eq(rows[0]?.id, anexoA, 'é o anexo da ocorrência atribuída a ele');
    });

    await t.test('o vínculo é específico: ver um alvo não abre os outros', async () => {
      // O fiscal `other` está vinculado à ocorrência A. A ocorrência B também
      // é do fiscal `active`, e o anexo dela NÃO pode aparecer para ele.
      const { rows } = await db.as(IDS.active, 'authenticated', async () =>
        db.query(
          `INSERT INTO public.anexos (fiscal_id, ocorrencia_id, tipo, storage_path)
           VALUES ($1, $2, 'foto', $3) RETURNING id`,
          [IDS.active, ocorrenciaB, caminho(IDS.active, 'segunda-ocorrencia.jpg')],
        ));
      anexoB = rows[0].id;

      const visiveis = await db.as(IDS.other, 'authenticated', async () =>
        (await db.query(`SELECT id FROM public.anexos`)).rows.map((r) => r.id));
      t.eq(visiveis, [anexoA], 'anexos visíveis ao fiscal designado');
    });

    await t.test('o arquivo é imutável: o caminho não muda por UPDATE', async () => {
      await db.as(IDS.active, 'authenticated', async () => {
        await t.denies(
          () => db.query(
            `UPDATE public.anexos SET storage_path = $1 WHERE id = $2`,
            [caminho(IDS.active, 'outro-caminho.jpg'), anexoA],
          ),
          'troca do caminho do arquivo',
        );
      });
    });

    await t.test('o dono ajusta título e ordem do anexo', async () => {
      await db.as(IDS.active, 'authenticated', async () => {
        await db.query(
          `UPDATE public.anexos SET titulo = 'Fachada com infiltração', ordem = 2 WHERE id = $1`,
          [anexoA],
        );
      });
      const { rows } = await db.owner(
        `SELECT titulo, ordem, storage_path FROM public.anexos WHERE id = $1`, [anexoA]);
      t.eq(rows[0].titulo, 'Fachada com infiltração', 'título atualizado');
      t.eq(rows[0].ordem, 2, 'ordem atualizada');
      t.eq(rows[0].storage_path, caminho(IDS.active, 'fachada.jpg'), 'caminho intacto');
    });

    await t.test('quem não é dono não apaga o anexo', async () => {
      // `other` enxerga este anexo (é o fiscal designado), mas não é o dono.
      const apagados = await db.as(IDS.other, 'authenticated', async () =>
        (await db.query(`DELETE FROM public.anexos WHERE id = $1 RETURNING id`, [anexoA])).rows.length);
      t.count(apagados, 0, 'linhas apagadas pelo fiscal não-dono');
    });

    await t.test('o dono apaga o próprio anexo', async () => {
      const apagados = await db.as(IDS.active, 'authenticated', async () =>
        (await db.query(`DELETE FROM public.anexos WHERE id = $1 RETURNING id`, [anexoB])).rows.length);
      t.count(apagados, 1, 'linhas apagadas pelo dono');
    });

    await t.test('anexo de vistoria usa o momento "depois"', async () => {
      // O caminho da vistoria: uma ocorrência atribuída ao próprio fiscal,
      // status em vistoria, e o anexo vinculado à vistoria.
      const ocorrenciaC = await createOccurrence(db, IDS.active);
      await db.as(IDS.admin, 'authenticated', async () => {
        await db.query(`SELECT public.assign_occurrence($1, $2)`, [ocorrenciaC, IDS.active]);
      });
      const vistoria = await db.as(IDS.active, 'authenticated', async () =>
        db.query(
          `INSERT INTO public.vistorias
             (ocorrencia_id, fiscal_id, chegada_at, chegada_latitude, chegada_longitude,
              laudo, acao_tomada, fotos_depois)
           VALUES ($1, $2, now(), -8.12, -34.90,
                   'Vistoria concluída, com registro fotográfico da correção.',
                   'Notificação', ARRAY[$3])
           RETURNING id`,
          [ocorrenciaC, IDS.active, SAMPLE_PHOTO],
        ));
      vistoriaId = vistoria.rows[0].id;

      const { rows } = await db.as(IDS.active, 'authenticated', async () =>
        db.query(
          `INSERT INTO public.anexos
             (fiscal_id, vistoria_id, tipo, momento, storage_path, largura, altura)
           VALUES ($1, $2, 'foto_depois', 'depois', $3, 1280, 960)
           RETURNING tipo, momento`,
          [IDS.active, vistoriaId, caminho(IDS.active, 'depois.jpg')],
        ));
      t.eq(rows[0].tipo, 'foto_depois', 'tipo do anexo de vistoria');
      t.eq(rows[0].momento, 'depois', 'momento do anexo de vistoria');
    });

    await t.test('anexo de mensagem só aceita mensagem do próprio remetente', async () => {
      const mensagem = await db.as(IDS.active, 'authenticated', async () =>
        db.query(
          `INSERT INTO public.admin_messages (sender_type, fiscal_id, message)
           VALUES ('fiscal', $1, 'Segue a foto do local corrigido.')
           RETURNING id`,
          [IDS.active],
        ));
      const mensagemId = mensagem.rows[0].id;

      const { rows } = await db.as(IDS.active, 'authenticated', async () =>
        db.query(
          `INSERT INTO public.anexos (fiscal_id, mensagem_id, tipo, storage_path)
           VALUES ($1, $2, 'anexo_mensagem', $3) RETURNING id`,
          [IDS.active, mensagemId, caminho(IDS.active, 'resposta.jpg')],
        ));
      t.ok(rows[0]?.id, 'anexo da própria mensagem gravado');

      // O outro fiscal é ativo e o vínculo é uma mensagem — mas não dele.
      await db.as(IDS.other, 'authenticated', async () => {
        await t.denies(
          () => db.query(
            `INSERT INTO public.anexos (fiscal_id, mensagem_id, tipo, storage_path)
             VALUES ($1, $2, 'anexo_mensagem', $3)`,
            [IDS.other, mensagemId, caminho(IDS.other, 'na-mensagem-alheia.jpg')],
          ),
          'anexo em mensagem de outro',
        );
      });
    });

    await t.test('anexo vinculado à ordem de serviço do próprio fiscal', async () => {
      const { rows } = await db.as(IDS.active, 'authenticated', async () =>
        db.query(
          `INSERT INTO public.anexos (fiscal_id, ordem_servico_id, tipo, storage_path, arquivo_tipo)
           VALUES ($1, $2, 'documento', $3, 'application/pdf') RETURNING id`,
          [IDS.active, osId, caminho(IDS.active, 'os-2026-0001.pdf')],
        ));
      t.ok(rows[0]?.id, 'anexo da ordem de serviço gravado');

      const n = await db.owner(
        `SELECT count(*) AS n FROM public.anexos WHERE ordem_servico_id = $1`, [osId]);
      t.count(n.rows[0].n, 1, 'anexos da ordem de serviço');
    });
  },
};

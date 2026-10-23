import { applyRepoSql, createDatabase } from '../harness.mjs';
import { IDS, seedScenario, createOccurrence, SAMPLE_PHOTO } from '../fixtures.mjs';

export default {
  name: 'isolamento por conta sem excluir registros',
  async run(t) {
    const db = t.db; await seedScenario(db);
    const pessoas = [IDS.admin, IDS.active, IDS.other]; const casos = {};
    const as = (ator, sql, args = []) => db.as(ator, 'authenticated', () => db.query(sql, args));
    for (const ator of pessoas) {
      const occ = await createOccurrence(db, ator, { sla_deadline: new Date(Date.now() + 3600000).toISOString() });
      const os = (await as(ator, `INSERT INTO public.ordens_servico(numero,origem,requerente,fiscal_abertura,ocorrencia_id,descricao,endereco,prazo_resposta)
        VALUES ($1,'Denúncia','Pessoa',$2,$3,'Descrição da OS','Rua Um',now()) RETURNING *`, [`OS-${ator}`, ator, occ])).rows[0];
      const path = `${ator}/2026/10/prova-privada.pdf`;
      await as(ator, "INSERT INTO storage.objects(bucket_id,name,owner) VALUES ('sifau-anexos',$1,$2)", [path, ator]);
      const doc = (await as(ator, `INSERT INTO public.documentos(fiscal_id,ocorrencia_id,tipo_documento,arquivo_path)
        VALUES ($1,$2,'documento',$3) RETURNING id`, [ator, occ, path])).rows[0].id;
      await as(ator, "INSERT INTO public.anexos(fiscal_id,ocorrencia_id,tipo,storage_path) VALUES ($1,$2,'documento',$3)", [ator, occ, path]);
      await as(ator, 'INSERT INTO public.assinaturas_digitais(fiscal_id,documento_id,assinatura_data) VALUES ($1,$2,$3)', [ator, doc, SAMPLE_PHOTO]);
      await as(ator, `INSERT INTO public.vistorias(ocorrencia_id,fiscal_id,chegada_at,chegada_latitude,chegada_longitude,laudo,acao_tomada,fotos_depois)
        VALUES ($1,$2,now(),-8,-34,'Laudo da própria conta','Orientação',ARRAY[$3])`, [occ, ator, path]);
      await as(ator, `INSERT INTO public.autos_infracao(ocorrencia_id,tipo_infracao,artigo_legal,valor_base,valor_multa,motivo,autuado_nome,autuado_documento,ciencia,vencimento)
        VALUES ($1,'Teste','Artigo',10,10,'Motivo','Pessoa','Documento','Ausente','2027-01-01')`, [occ]);
      casos[ator] = { occ, os, path, doc };
    }
    // Reproduz o dado legado sem usar atribuição (desativada na API).
    await db.owner('UPDATE public.ocorrencias SET fiscal_designado=$1 WHERE id=$2', [IDS.other, casos[IDS.admin].occ]);
    await db.owner('UPDATE public.ordens_servico SET fiscal_designado=$1 WHERE id=$2', [IDS.other, casos[IDS.admin].os.id]);
    await t.test('dois usuários comuns leem somente seus cadastros e suas contagens exatas', async () => {
      for (const ator of [IDS.active, IDS.other]) {
        for (const tabela of ['ocorrencias', 'ordens_servico', 'vistorias', 'autos_infracao', 'documentos', 'assinaturas_digitais', 'anexos']) {
          const { rows } = await as(ator, `SELECT count(*)::int AS n FROM public.${tabela}`); t.eq(rows[0].n, 1, tabela);
        }
        const { rows } = await as(ator, 'SELECT id FROM public.ocorrencias'); t.eq(rows[0].id, casos[ator].occ);
      }
    });
    await t.test('administrador mantém visão geral e contas comuns não ganham papel administrativo', async () => {
      for (const tabela of ['ocorrencias', 'ordens_servico', 'vistorias', 'autos_infracao', 'documentos', 'assinaturas_digitais', 'anexos']) {
        const { rows } = await as(IDS.admin, `SELECT count(*)::int AS n FROM public.${tabela}`); t.eq(rows[0].n, 3, tabela);
      }
      for (const ator of [IDS.active, IDS.other]) t.eq((await as(ator, 'SELECT public.is_admin() AS admin')).rows[0].admin, false);
    });
    await t.test('IDs adivinhados não expõem ocorrência, OS, histórico ou auditoria de outra conta', async () => {
      for (const ator of [IDS.active, IDS.other]) {
        t.eq((await as(ator, 'SELECT id FROM public.ocorrencias WHERE id=$1', [casos[IDS.admin].occ])).rows.length, 0);
        t.eq((await as(ator, 'SELECT id FROM public.ordens_servico WHERE id=$1', [casos[IDS.admin].os.id])).rows.length, 0);
        t.eq((await as(ator, 'SELECT * FROM public.os_historico WHERE os_id=$1', [casos[IDS.admin].os.id])).rows.length, 0);
        t.eq((await as(ator, 'SELECT * FROM public.auditoria WHERE ocorrencia_id=$1', [casos[IDS.admin].occ])).rows.length, 0);
      }
    });
    await t.test('ser designado num dado antigo não concede nenhum acesso adicional', async () => {
      const { rows } = await as(IDS.other, 'SELECT id FROM public.notificacoes WHERE ocorrencia_id=$1', [casos[IDS.admin].occ]); t.eq(rows.length, 0);
      for (const etapa of ['editar', 'notificacao', 'auto', 'concluir']) {
        await t.denies(() => as(IDS.other, 'SELECT * FROM public.salvar_etapa_os($1,0,$2,$3)', [casos[IDS.admin].os.id, etapa, '{}']));
      }
      await t.denies(() => as(IDS.other, "SELECT * FROM public.decidir_auto_os($1,0,false,'Sem infração constatada.')", [casos[IDS.admin].os.id]));
    });
    await t.test('conta comum não altera status ou autoria de ocorrência de outra pessoa', async () => {
      await t.denies(() => as(IDS.other, "SELECT public.update_occurrence_status($1,'Resolvida','Tentativa')", [casos[IDS.admin].occ]));
      t.eq((await as(IDS.other, "UPDATE public.ocorrencias SET descricao='Tentativa de alterar o cadastro alheio.' WHERE id=$1 RETURNING id", [casos[IDS.admin].occ])).rows.length, 0);
      await t.denies(() => as(IDS.other, 'UPDATE public.ocorrencias SET fiscal_registrou=$1 WHERE id=$2', [IDS.other, casos[IDS.admin].occ]));
      await t.denies(() => as(IDS.other, 'UPDATE public.ocorrencias SET fiscal_designado=$1 WHERE id=$2', [IDS.other, casos[IDS.admin].occ]));
    });
    await t.test('metadados e arquivos permanecem privados, inclusive nomes de caminhos conhecidos', async () => {
      for (const ator of [IDS.active, IDS.other]) {
        t.eq((await as(ator, 'SELECT name FROM storage.objects WHERE name=$1', [casos[IDS.admin].path])).rows.length, 0);
        t.eq((await as(ator, 'SELECT id FROM public.documentos WHERE id=$1', [casos[IDS.admin].doc])).rows.length, 0);
        t.eq((await as(ator, 'SELECT name FROM storage.objects WHERE name=$1', [casos[ator].path])).rows.length, 1);
        await t.denies(() => as(ator, "INSERT INTO public.anexos(fiscal_id,ocorrencia_id,tipo,storage_path) VALUES ($1,$2,'documento',$3)", [ator, casos[IDS.admin].occ, `${ator}/2026/10/intrusao.pdf`]));
        await t.denies(() => as(ator, "INSERT INTO public.documentos(fiscal_id,ordem_servico_id,tipo_documento,arquivo_path) VALUES ($1,$2,'documento',$3)", [ator, casos[IDS.admin].os.id, `${ator}/2026/10/intrusao.pdf`]));
      }
    });
    await t.test('anexos de conversa continuam acessíveis só ao destinatário e administrador', async () => {
      const path = `${IDS.admin}/2026/10/mensagem.pdf`;
      await as(IDS.admin, "INSERT INTO storage.objects(bucket_id,name,owner) VALUES ('sifau-anexos',$1,$2)", [path, IDS.admin]);
      await as(IDS.admin, "INSERT INTO public.admin_messages(admin_id,fiscal_id,sender_type,message,attachments) VALUES ($1,$2,'admin','Arquivo da conversa',ARRAY[$3])", [IDS.admin, IDS.other, path]);
      t.eq((await as(IDS.other, 'SELECT name FROM storage.objects WHERE name=$1',[path])).rows.length, 1);
      t.eq((await as(IDS.active, 'SELECT name FROM storage.objects WHERE name=$1',[path])).rows.length, 0);
    });
    await t.test('aprovação continua necessária para ler registros e arquivos', async () => {
      for (const tabela of ['ocorrencias', 'ordens_servico', 'vistorias', 'documentos', 'auditoria', 'anexos'])
        t.eq((await as(IDS.pending, `SELECT id FROM public.${tabela}`)).rows.length, 0);
      t.eq((await as(IDS.pending, 'SELECT name FROM storage.objects')).rows.length, 0);
    });
    await t.test('atribuição fica desativada no servidor, e OS não permite informar fiscal designado', async () => {
      for (const ator of pessoas) {
        for (const rpc of ['assign_occurrence','redistribute_occurrence']) await t.denies(() => as(ator, `SELECT public.${rpc}($1,$2)`, [casos[ator].occ, IDS.other]));
        await t.denies(() => as(ator, `INSERT INTO public.ordens_servico(numero,origem,requerente,fiscal_abertura,fiscal_designado,descricao,endereco,prazo_resposta)
          VALUES ('NOVA','Gestão','Pessoa',$1,$2,'Descrição','Rua',now())`, [ator, IDS.other]));
      }
    });
    await t.test('alerta de prazo usa o criador da ocorrência sem exigir atribuição', async () => {
      await db.owner('SELECT public.notify_upcoming_sla()');
      for (const ator of pessoas) t.eq((await as(ator, "SELECT id FROM public.notificacoes WHERE tipo='sla' AND ocorrencia_id=$1", [casos[ator].occ])).rows.length, 1);
    });
    await t.test('reaplicar o SQL entregue preserva integralmente todas as linhas, inclusive contas e vínculos antigos', async () => {
      const { rows: tabelas } = await db.owner(`SELECT table_schema,table_name FROM information_schema.tables WHERE table_type='BASE TABLE' AND table_schema IN ('public','auth','storage') ORDER BY 1,2`);
      const snapshot = async () => {
        const foto = {};
        for (const { table_schema: schema, table_name: tabela } of tabelas) {
          foto[`${schema}.${tabela}`] = (await db.owner(`SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) AS dados FROM "${schema}"."${tabela}" t`)).rows[0].dados;
        }
        return foto;
      };
      const antes = await snapshot();
      await applyRepoSql(db, 'entrega/SQL_EDITOR_ISOLAR_CONTAS.txt');
      await applyRepoSql(db, 'entrega/SQL_EDITOR_ISOLAR_CONTAS.txt');
      t.eq(await snapshot(), antes);
    });
    await t.test('usuário cadastra OS, notifica e conclui sua própria OS sem gerar multa automaticamente', async () => {
      let os = casos[IDS.active].os;
      os = (await as(IDS.active, 'SELECT * FROM public.salvar_etapa_os($1,$2,$3,$4)', [os.id, os.versao, 'notificacao', JSON.stringify({ nome:'Pessoa',endereco:'Rua',texto:'Vistoria da própria conta',ciencia:'Ausente' })])).rows[0];
      os = (await as(IDS.active, "SELECT * FROM public.decidir_auto_os($1,$2,false,'Sem infração constatada.')", [os.id,os.versao])).rows[0];
      os = (await as(IDS.active, 'SELECT * FROM public.salvar_etapa_os($1,$2,$3,$4)', [os.id,os.versao,'concluir',JSON.stringify({texto:'Fiscalização encerrada sem necessidade de auto.'})])).rows[0];
      t.eq(os.status, 'Concluída'); t.ok(!os.fluxo.auto_id);
      t.eq(Date.parse(os.edicao_ate)-Date.parse(os.concluida_em),48*3600000);
    });
    await t.test('admin pode consultar o histórico global e corrigir OS dentro do prazo, sem apagar a autoria', async () => {
      const id = casos[IDS.active].os.id;
      const os = (await as(IDS.admin, 'SELECT * FROM public.ordens_servico WHERE id=$1',[id])).rows[0];
      const salva = (await as(IDS.admin,'SELECT * FROM public.salvar_etapa_os($1,$2,$3,$4)',[id,os.versao,'concluir',JSON.stringify({texto:'Correção administrativa identificada no histórico.'})])).rows[0];
      t.eq(salva.fiscal_abertura,IDS.active); t.eq(salva.edicao_ate,os.edicao_ate);
      t.eq((await as(IDS.other,'SELECT * FROM public.os_historico WHERE os_id=$1',[id])).rows.length,0);
    });
    await t.test('upgrade real do schema anterior preserva dados e fecha a leitura compartilhada', async () => {
      const legado = await createDatabase({ source: 'migrations', lastMigration: '20261022000000_os_auto_decision.sql' });
      try {
        await seedScenario(legado);
        await legado.owner("UPDATE auth.users SET encrypted_password='hash-ficticio-nao-alterar' WHERE id=$1",[IDS.admin]);
        const id = await createOccurrence(legado, IDS.admin);
        await legado.as(IDS.admin,'authenticated',()=>legado.query('SELECT public.assign_occurrence($1,$2)',[id,IDS.other]));
        t.eq(Number((await legado.as(IDS.other,'authenticated',()=>legado.query('SELECT count(*) AS n FROM public.ocorrencias'))).rows[0].n),1);
        let antigaOS = (await legado.as(IDS.admin,'authenticated',()=>legado.query(`INSERT INTO public.ordens_servico(numero,origem,requerente,fiscal_abertura,fiscal_designado,ocorrencia_id,descricao,endereco,prazo_resposta)
          VALUES ('OS-LEGADA','Denúncia','Pessoa',$1,$2,$3,'OS antiga','Rua',now()) RETURNING *`,[IDS.admin,IDS.other,id]))).rows[0];
        const etapaLegada = async (nome,dados) => {
          antigaOS = (await legado.as(IDS.other,'authenticated',()=>legado.query('SELECT * FROM public.salvar_etapa_os($1,$2,$3,$4)',[antigaOS.id,antigaOS.versao,nome,JSON.stringify(dados)]))).rows[0];
        };
        await etapaLegada('notificacao',{nome:'Pessoa',endereco:'Rua',texto:'Notificação anterior preservada',ciencia:'Ausente'});
        await etapaLegada('auto',{autuado_nome:'Pessoa',autuado_documento:'Documento',tipo_infracao:'Infração',artigo_legal:'Artigo',valor_base:10,valor_multa:10,motivo:'Motivo',ciencia:'Ausente',vencimento:'2027-01-01'});
        await etapaLegada('concluir',{texto:'Conclusão legada que não deve mudar.'});

        const tabelas = (await legado.owner("SELECT table_schema,table_name FROM information_schema.tables WHERE table_type='BASE TABLE' AND table_schema IN ('auth','public','storage') ORDER BY 1,2")).rows;
        const foto = async () => {
          const dados = {};
          for (const r of tabelas) dados[`${r.table_schema}.${r.table_name}`] = (await legado.owner(`SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) AS d FROM "${r.table_schema}"."${r.table_name}" t`)).rows[0].d;
          return dados;
        };
        const antes = await foto();
        await applyRepoSql(legado,'entrega/SQL_EDITOR_ISOLAR_CONTAS.txt');
        t.eq(await foto(),antes);
        t.eq((await legado.as(IDS.other,'authenticated',()=>legado.query('SELECT id FROM public.ordens_servico WHERE id=$1',[antigaOS.id]))).rows.length,0);
        t.eq(Number((await legado.as(IDS.other,'authenticated',()=>legado.query('SELECT count(*) AS n FROM public.ocorrencias'))).rows[0].n),0);
        t.eq(Number((await legado.as(IDS.admin,'authenticated',()=>legado.query('SELECT count(*) AS n FROM public.ocorrencias'))).rows[0].n),1);
      } finally { await legado.db.close(); }
    });
  },
};

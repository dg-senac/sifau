// Supabase Edge Function: send-push
// Disparada por um Database Webhook na tabela `notificacoes` (evento INSERT).
// Busca os tokens do fiscal e envia a notificação via FCM (legacy HTTP API).
//
// Configuração necessária (uma vez):
//   supabase secrets set FCM_SERVER_KEY=xxxxxxxx
//   supabase functions deploy send-push
// E em Database > Webhooks: criar um webhook em `notificacoes` (INSERT) apontando
// para a URL desta função, com o header Authorization: Bearer <SUPABASE_ANON_KEY>.

import { createClient } from 'npm:@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const fcmServerKey = Deno.env.get('FCM_SERVER_KEY');

Deno.serve(async (req) => {
  try {
    const body = await req.json();
    const record = body.record ?? body;
    const fiscalId = record.fiscal_id;
    const titulo = record.titulo ?? 'SIFAU';
    const mensagem = record.mensagem ?? '';

    if (!fiscalId) {
      return new Response(JSON.stringify({ skipped: true }), { status: 200 });
    }
    if (!fcmServerKey) {
      return new Response(
        JSON.stringify({ error: 'FCM_SERVER_KEY não configurada' }),
        { status: 200 },
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { data: tokens } = await supabase
      .from('push_tokens')
      .select('token')
      .eq('fiscal_id', fiscalId);

    if (!tokens || tokens.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), { status: 200 });
    }

    const results = await Promise.all(
      tokens.map((t) =>
        fetch('https://fcm.googleapis.com/fcm/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `key=${fcmServerKey}`,
          },
          body: JSON.stringify({
            to: t.token,
            notification: { title: titulo, body: mensagem, sound: 'default' },
            data: { ocorrencia_id: record.ocorrencia_id ?? '', tipo: record.tipo ?? 'info' },
          }),
        }),
      ),
    );

    return new Response(JSON.stringify({ sent: results.length }), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});

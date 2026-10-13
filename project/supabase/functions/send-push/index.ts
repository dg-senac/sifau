// Supabase Edge Function invoked by a private Database Webhook on public.notificacoes.
// Firebase HTTP v1 requires an FCM service-account key, not the retired legacy server key.
import { createClient } from 'npm:@supabase/supabase-js@2';

type ServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
};

type FcmError = {
  error?: {
    status?: string;
    message?: string;
    details?: Array<{ errorCode?: string }>;
  };
};

const encoder = new TextEncoder();
let cachedAccessToken = '';
let accessTokenExpiresAt = 0;

function base64Url(value: string | Uint8Array): string {
  const bytes = typeof value === 'string' ? encoder.encode(value) : value;
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function safeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

async function getFcmAccessToken(account: ServiceAccount): Promise<string> {
  if (cachedAccessToken && Date.now() < accessTokenExpiresAt) return cachedAccessToken;

  const issuedAt = Math.floor(Date.now() / 1000);
  const jwtHeader = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const jwtClaim = base64Url(JSON.stringify({
    iss: account.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: issuedAt,
    exp: issuedAt + 3600,
  }));
  const pem = account.private_key.replace(/\\n/g, '\n');
  const keyBase64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----/g, '')
    .replace(/\s/g, '');
  const key = await crypto.subtle.importKey(
    'pkcs8',
    decodeBase64(keyBase64),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const unsignedJwt = `${jwtHeader}.${jwtClaim}`;
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, encoder.encode(unsignedJwt));
  const assertion = `${unsignedJwt}.${base64Url(new Uint8Array(signature))}`;
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  if (!response.ok) throw new Error(`FCM OAuth recusou a autenticação (HTTP ${response.status})`);

  const result = await response.json() as { access_token?: string; expires_in?: number };
  if (!result.access_token) throw new Error('FCM OAuth não retornou access_token');
  cachedAccessToken = result.access_token;
  accessTokenExpiresAt = Date.now() + Math.max((result.expires_in ?? 3600) - 60, 60) * 1000;
  return cachedAccessToken;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const webhookSecret = Deno.env.get('PUSH_WEBHOOK_SECRET');
  const expectedAuthorization = webhookSecret ? `Bearer ${webhookSecret}` : '';
  if (!expectedAuthorization || !safeEqual(req.headers.get('authorization') ?? '', expectedAuthorization)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const rawServiceAccount = Deno.env.get('FCM_SERVICE_ACCOUNT_JSON');
  if (!supabaseUrl || !serviceRoleKey || !rawServiceAccount) {
    return Response.json({ error: 'Configuração de push incompleta' }, { status: 500 });
  }

  try {
    const body = await req.json();
    const record = body?.record ?? body;
    const fiscalId = typeof record?.fiscal_id === 'string' ? record.fiscal_id : '';
    if (!fiscalId) return Response.json({ skipped: true }, { status: 200 });

    const account = JSON.parse(rawServiceAccount) as ServiceAccount;
    if (!account.project_id || !account.client_email || !account.private_key) {
      throw new Error('FCM_SERVICE_ACCOUNT_JSON inválido');
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: eligible, error: eligibilityError } = await supabase.rpc('is_eligible_fiscal', {
      p_fiscal_id: fiscalId,
    });
    if (eligibilityError) throw new Error(`Não foi possível validar o fiscal (${eligibilityError.code})`);
    if (!eligible) return Response.json({ sent: 0, skipped: 'inactive' }, { status: 200 });

    const { data: tokens, error: tokenError } = await supabase
      .from('push_tokens')
      .select('token')
      .eq('fiscal_id', fiscalId);
    if (tokenError) throw new Error(`Não foi possível consultar tokens push (${tokenError.code})`);
    if (!tokens?.length) return Response.json({ sent: 0 }, { status: 200 });

    const accessToken = await getFcmAccessToken(account);
    const title = String(record.titulo ?? 'SIFAU').slice(0, 120);
    const message = String(record.mensagem ?? '').slice(0, 1000);
    const payloadData = {
      notificacao_id: String(record.id ?? ''),
      ocorrencia_id: String(record.ocorrencia_id ?? ''),
      tipo: String(record.tipo ?? 'info'),
    };

    const results = await Promise.all(tokens.map(async ({ token }) => {
      const response = await fetch(
        `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(account.project_id)}/messages:send`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            message: {
              token,
              notification: { title, body: message },
              data: payloadData,
              android: { notification: { sound: 'default' } },
            },
          }),
        },
      );
      if (response.ok) return { sent: true, token };

      const details = await response.json().catch(() => ({})) as FcmError;
      const invalidToken = details.error?.status === 'UNREGISTERED'
        || details.error?.details?.some((detail) => detail.errorCode === 'UNREGISTERED') === true;
      if (invalidToken) {
        const { error } = await supabase.from('push_tokens').delete().eq('token', token);
        if (error) console.warn('Não foi possível limpar um token FCM inválido:', error.code);
        return { sent: false, invalid: true };
      }
      console.error('Falha de entrega FCM:', response.status, details.error?.status ?? 'unknown');
      return { sent: false, transient: response.status >= 500 || response.status === 429 };
    }));

    const sent = results.filter((result) => result.sent).length;
    const retryNeeded = results.some((result) => 'transient' in result && result.transient);
    return Response.json({ sent, total: tokens.length }, { status: retryNeeded ? 503 : 200 });
  } catch (error) {
    console.error('Falha ao processar webhook de push:', error);
    return Response.json({ error: 'Falha interna no envio de push' }, { status: 500 });
  }
});

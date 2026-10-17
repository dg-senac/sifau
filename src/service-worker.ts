// ============================================================================
// SIFAU — Service worker (o que faz o aplicativo abrir sem conexão)
// ============================================================================
// Ele não guarda dados da fiscalização. Ele guarda os ARQUIVOS do aplicativo
// (HTML, JavaScript, folha de estilo, fontes, ícones) para que o fiscal consiga
// abrir o sistema em campo, sem sinal. Os registros continuam indo para a fila
// offline, que já existia antes disto.
//
// ── As três decisões que importam aqui ─────────────────────────────────────
//
// 1. **Nada de limpeza genérica.** A fila de fiscalização mora no armazenamento
//    do aparelho. Um service worker que limpa "tudo" na troca de versão apagaria
//    justamente o dado que não tem como ser recuperado em nenhum outro lugar.
//    Aqui só são apagados os caches que começam com `sifau-` e não são os da
//    versão atual.
//
// 2. **Pedido com credencial não é arquivo.** O service worker só trata pedidos
//    para o próprio endereço do aplicativo, do tipo GET e sem cabeçalho de
//    autorização. Login, consulta de ocorrência, envio de foto: tudo isso passa
//    direto, sem passar pelo cache. Guardar resposta de login no cache seria
//    entregar dado de um usuário a outro no mesmo aparelho.
//
// 3. **A versão nova não toma o lugar da antiga sozinha.** Quando existe versão
//    nova, ela fica esperando e o aplicativo avisa o fiscal, que decide a hora
//    de recarregar. Se a troca fosse automática, uma tela aberta no meio de uma
//    vistoria passaria a pedir arquivos que já não existem no servidor.
//
// ── Como este arquivo é construído ─────────────────────────────────────────
// Ele NÃO faz parte do pacote do aplicativo: é compilado à parte por
// `assets/pwa/compilar.mjs`, que injeta a versão (a impressão digital do que
// foi construído) no lugar de `__VERSAO__`. Qualquer mudança no aplicativo
// muda a versão, o que faz o navegador instalar o service worker novo.
// ============================================================================

/// <reference lib="webworker" />

declare const __VERSAO__: string;

const CACHE_BASE = `sifau-${__VERSAO__}`;
const PREFIXO_DO_APP = 'sifau-';

/**
 * A casca do aplicativo: o mínimo para abrir sem rede.
 * Os arquivos com nome embaralhado que o Vite gera não entram aqui porque os
 * nomes só existem depois da construção — eles entram no cache no primeiro uso.
 */
const CASCA = [
  './',
  './offline.html',
  './manifest.webmanifest',
  './icon.svg',
  './icone-192.png',
  './icone-512.png',
  './icone-maskable-512.png',
  './apple-touch-icon.png',
];

/**
 * Espera máxima pela rede antes de mostrar o que está guardado.
 *
 * Existe por uma situação comum e ruim: o celular diz que está conectado a um
 * wi-fi que, na prática, não responde. Sem prazo, o fiscal fica olhando uma
 * tela branca até o navegador desistir sozinho, o que pode levar mais de um
 * minuto. Com prazo, o aplicativo abre com os arquivos guardados e o pedido ao
 * servidor segue em segundo plano.
 *
 * O que está guardado é sempre da mesma versão do aplicativo — casca e arquivos
 * entram e saem do cache juntos —, então mostrar o guardado não deixa a tela
 * pela metade.
 */
const ESPERA_MAXIMA_MS = 3500;

const sw = self as unknown as ServiceWorkerGlobalScope;

// ────────────────────────────────────────────────────────────────────────────
// Instalação: guardar a casca
// ────────────────────────────────────────────────────────────────────────────
sw.addEventListener('install', (evento) => {
  evento.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_BASE);
      // Um arquivo por vez, com o erro contido: se um deles faltar, é melhor
      // instalar com a casca quase completa do que não instalar e perder o
      // funcionamento sem rede por inteiro.
      await Promise.all(
        CASCA.map(async (arquivo) => {
          try {
            await cache.add(new Request(arquivo, { cache: 'reload' }));
          } catch {
            // Arquivo que não veio não impede o resto.
          }
        }),
      );
    })(),
  );
});

// ────────────────────────────────────────────────────────────────────────────
// Ativação: tirar de cena os caches de versões antigas
// ────────────────────────────────────────────────────────────────────────────
sw.addEventListener('activate', (evento) => {
  evento.waitUntil(
    (async () => {
      const nomes = await caches.keys();
      const antigos = nomes.filter(
        (nome) => nome.startsWith(PREFIXO_DO_APP) && nome !== CACHE_BASE,
      );
      await Promise.all(antigos.map((nome) => caches.delete(nome)));
      // `claim` faz esta página passar a ser atendida pela versão nova sem
      // precisar fechar e abrir o aplicativo.
      await sw.clients.claim();
    })(),
  );
});

// ────────────────────────────────────────────────────────────────────────────
// Responder aos pedidos
// ────────────────────────────────────────────────────────────────────────────
sw.addEventListener('fetch', (evento) => {
  const requisicao = evento.request;

  // Só leitura: nada de POST/PATCH/DELETE (login, RPC, envio de arquivo).
  if (requisicao.method !== 'GET') return;

  // Pedido que carrega credencial não é arquivo — é dado de usuário.
  if (requisicao.headers.has('authorization') || requisicao.headers.has('apikey')) return;

  // Coisa de outro servidor (banco de dados, imagens de mapa) não é arquivo do
  // aplicativo, e o aplicativo não tem o que fazer com ela guardada.
  const url = new URL(requisicao.url);
  if (url.origin !== sw.location.origin) return;

  // Pedido feito pelo próprio navegador para uso imediato: responder do cache
  // aqui viraria erro quando não houver nada guardado.
  if (requisicao.cache === 'only-if-cached' && requisicao.mode !== 'same-origin') return;

  if (requisicao.mode === 'navigate') {
    evento.respondWith(redePrimeiro(requisicao));
    return;
  }

  // Daqui para baixo: arquivo do aplicativo. Os arquivos do Vite têm o conteúdo
  // embaralhado no próprio nome, então o mesmo nome sempre traz o mesmo
  // conteúdo — guardar e servir do cache é seguro.
  evento.respondWith(guardadoPrimeiro(requisicao));
});

/**
 * Casca e páginas: tenta a rede, com prazo; cai para o cache se ela não vier.
 * Nunca serve uma página velha enquanto houver rede — a versão nova do
 * aplicativo aparece assim que existe.
 */
async function redePrimeiro(requisicao: Request): Promise<Response> {
  const cache = await caches.open(CACHE_BASE);

  const daRede = fetch(requisicao).then((resposta) => {
    if (resposta.ok) void guardar(cache, requisicao, resposta.clone());
    return resposta;
  });

  try {
    return await comPrazo(daRede, ESPERA_MAXIMA_MS);
  } catch {
    const guardada =
      (await cache.match(requisicao, { ignoreSearch: true })) ?? (await cache.match('./'));
    if (guardada) return guardada;

    // Não há nada guardado: vale esperar a rede até o fim antes de mostrar a
    // página de "sem conexão".
    try {
      const resposta = await daRede;
      if (resposta.ok) return resposta;
      return resposta;
    } catch {
      const semConexao = await cache.match('./offline.html');
      if (semConexao) return semConexao;
      return new Response('Sem conexão e sem arquivos guardados.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }
  }
}

/** Arquivos: do cache se estiver lá, da rede se não estiver. */
async function guardadoPrimeiro(requisicao: Request): Promise<Response> {
  const cache = await caches.open(CACHE_BASE);
  const guardada = await cache.match(requisicao);
  if (guardada) return guardada;

  const resposta = await fetch(requisicao);
  if (resposta.ok) void guardar(cache, requisicao, resposta.clone());
  return resposta;
}

/**
 * Guarda uma resposta — com as recusas escritas, para não parecer esquecimento:
 * resposta que não deu certo, resposta de outro servidor sem permissão de
 * leitura, e resposta que pediu explicitamente para não ser guardada.
 */
async function guardar(cache: Cache, requisicao: Request, resposta: Response): Promise<void> {
  if (!resposta.ok) return;
  if (resposta.type === 'opaque') return;
  const controle = resposta.headers.get('cache-control') ?? '';
  if (/no-store|private/i.test(controle)) return;
  try {
    await cache.put(requisicao, resposta);
  } catch {
    // Cache cheio ou resposta que não pode ser copiada: seguir sem guardar é
    // melhor do que estourar o pedido do fiscal.
  }
}

/** A promessa acima, mas com prazo. */
function comPrazo<T>(promessa: Promise<T>, milissegundos: number): Promise<T> {
  return new Promise<T>((resolver, rejeitar) => {
    const relogio = setTimeout(() => rejeitar(new Error('prazo esgotado')), milissegundos);
    promessa.then(
      (valor) => {
        clearTimeout(relogio);
        resolver(valor);
      },
      (erro) => {
        clearTimeout(relogio);
        rejeitar(erro);
      },
    );
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Troca de versão pedida pelo aplicativo
// ────────────────────────────────────────────────────────────────────────────
sw.addEventListener('message', (evento) => {
  const dados = evento.data as { tipo?: string } | null;
  if (dados?.tipo === 'ATIVAR_NOVA_VERSAO') void sw.skipWaiting();
});

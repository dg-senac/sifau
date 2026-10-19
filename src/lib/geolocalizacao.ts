// ============================================================================
// SIFAU — Captura pontual de localização (botão "Capturar localização atual")
// ============================================================================
// Isto NÃO é o rastreamento operacional do fiscal (src/lib/locationTracking.ts):
// aqui é a captura de UM ponto, no toque do botão, para marcar onde a
// ocorrência aconteceu.
//
// Por que este módulo existe: `navigator.geolocation` não basta dentro do APK.
// No Android, o WebView só expõe geolocalização quando o aplicativo declara as
// permissões no AndroidManifest e pede a permissão em tempo de execução — e a
// caixa de diálogo do sistema não aparece sozinha. O plugin oficial
// `@capacitor/geolocation` resolve isso no app nativo; no navegador, o plugin
// não sabe pedir permissão (`requestPermissions` nem é implementado na web),
// então lá seguimos usando `navigator.geolocation` + Permissions API.
//
// Detalhe importante descoberto no código do plugin (v6): no Android o
// `getCurrentPosition` IGNORA a opção `timeout` (usa o FusedLocationProvider
// sem cancelamento). Para honrar "tempo esgotado", a captura nativa corre
// contra um cronômetro nosso.
// ============================================================================

import { Capacitor, registerPlugin } from '@capacitor/core';

/** Motivos de falha, na linguagem do fiscal — a tela traduz cada um. */
export type MotivoDeFalha =
  // Negou na caixa de diálogo (ou estava negada e ainda dá para pedir de novo).
  | 'permissao-negada'
  // Negou de forma definitiva: o sistema não mostra mais a caixa de diálogo.
  | 'permissao-bloqueada'
  // GPS desligado, sem correção de sinal ou serviço de localização ausente.
  | 'gps-indisponivel'
  // Demorou demais para obter a posição.
  | 'tempo-esgotado'
  // O aparelho/navegador não oferece serviço de localização.
  | 'sem-suporte'
  // Qualquer outra coisa — mostra mensagem genérica com o detalhe técnico.
  | 'inesperada';

export type CapturaDeLocalizacao =
  | {
      ok: true;
      latitude: number;
      longitude: number;
      /** Precisão da correção GPS, em metros, quando o aparelho informa. */
      precisaoMetros?: number;
    }
  | { ok: false; motivo: MotivoDeFalha; detalhe?: string };

export interface OpcoesDeCaptura {
  /** Limite de tempo para obter a posição (padrão: 20s no app, 15s na web). */
  tempoLimiteMs?: number;
  /**
   * Chamado quando uma permissão do sistema vai ser solicitada — a tela usa
   * isto para explicar, antes da caixa de diálogo, para que a localização
   * será usada.
   */
  aoPedirPermissao?: () => void;
}

// ── Classificação de erros (funções puras, testadas em tests/unit) ──────────

/**
 * Traduz as mensagens de erro do plugin nativo (Android/iOS) para um motivo.
 * As mensagens vêm do código do plugin:
 *   "Location services are not enabled" / "location disabled" (GPS desligado),
 *   "location unavailable" (sem correção), "Google Play Services not available",
 *   "Location permission was denied".
 */
export function classificarFalhaNativa(mensagem: string | undefined | null): MotivoDeFalha {
  const texto = (mensagem ?? '').toLowerCase();
  if (texto.includes('permission')) return 'permissao-negada';
  if (
    texto.includes('location services are not enabled') ||
    texto.includes('location disabled') ||
    texto.includes('location unavailable') ||
    texto.includes('play services')
  ) {
    return 'gps-indisponivel';
  }
  if (texto.includes('timeout')) return 'tempo-esgotado';
  return 'inesperada';
}

/**
 * Traduz os códigos de erro do `navigator.geolocation` para um motivo.
 * `estadoDaPermissao` é o estado na Permissions API no momento do erro:
 * navegadores não voltam a exibir a caixa de diálogo depois de uma negativa,
 * então código 1 com estado "denied" é bloqueio permanente, não negativa.
 */
export function classificarFalhaDoNavegador(
  codigo: number | undefined,
  estadoDaPermissao: string | null,
): MotivoDeFalha {
  // 1 = PERMISSION_DENIED, 2 = POSITION_UNAVAILABLE, 3 = TIMEOUT.
  if (codigo === 1) return estadoDaPermissao === 'denied' ? 'permissao-bloqueada' : 'permissao-negada';
  if (codigo === 2) return 'gps-indisponivel';
  if (codigo === 3) return 'tempo-esgotado';
  return 'inesperada';
}

// ── Contagem de negativas (define "negou" vs "bloqueou" no app nativo) ──────
// O Android devolve apenas "negada", sem dizer se a caixa de diálogo ainda
// pode aparecer. Regra adotada: a 1ª negativa é tratada como "negada — pode
// tentar de novo"; a 2ª seguida (que no Android 11+ costuma ser o sistema
// negando sem mostrar diálogo) é tratada como bloqueio permanente e a tela
// passa a orientar as configurações.

const NEGATIVAS_ATE_BLOQUEIO = 2;
let negativasDePermissao = 0;

// ── Abrir as configurações do aplicativo (somente no APK) ───────────────────

interface PluginAbrirConfiguracoes {
  abrir: () => Promise<void>;
}

/**
 * Abre a tela do sistema com os detalhes do aplicativo (onde ficam as
 * permissões). Devolve `false` quando não há suporte — no navegador, por
 * exemplo, a tela explica o caminho manual.
 */
export async function abrirConfiguracoesDoAplicativo(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const plugin = registerPlugin<PluginAbrirConfiguracoes>('AbrirConfiguracoes');
    await plugin.abrir();
    return true;
  } catch (erro) {
    console.warn('Não foi possível abrir as configurações do aplicativo:', erro);
    return false;
  }
}

/** True quando rodando dentro do APK Android (versus navegador). */
export function emAplicativoNativo(): boolean {
  return Capacitor.isNativePlatform();
}

// ── Captura ─────────────────────────────────────────────────────────────────

/** Captura um ponto. Nunca lança: toda falha vem como `{ ok: false, motivo }`. */
export async function capturarLocalizacao(
  opcoes: OpcoesDeCaptura = {},
): Promise<CapturaDeLocalizacao> {
  if (Capacitor.isNativePlatform()) return capturarNoAplicativo(opcoes);
  return capturarNoNavegador(opcoes);
}

async function capturarNoAplicativo(opcoes: OpcoesDeCaptura): Promise<CapturaDeLocalizacao> {
  let Geolocation: typeof import('@capacitor/geolocation').Geolocation;
  try {
    ({ Geolocation } = await import('@capacitor/geolocation'));
  } catch (erro) {
    console.error('Plugin de geolocalização não disponível no aplicativo:', erro);
    return { ok: false, motivo: 'sem-suporte', detalhe: 'plugin @capacitor/geolocation ausente' };
  }

  // 1. Já está concedida? Captura direto, sem caixa de diálogo.
  let estado: string | null = null;
  try {
    const status = await Geolocation.checkPermissions();
    estado = status.location;
  } catch (erro) {
    // Rejeita com "Location services are not enabled" quando o GPS do aparelho
    // está desligado — pedir permissão nesse estado não adianta.
    const mensagem = mensagemDe(erro);
    return { ok: false, motivo: classificarFalhaNativa(mensagem), detalhe: mensagem };
  }

  if (estado === 'denied') {
    // Negou antes (nesta sessão do app): a próxima negativa carateriza bloqueio.
    negativasDePermissao = Math.max(negativasDePermissao, 1);
  }

  // 2. Precisa pedir: a tela explica e o plugin abre a caixa do sistema.
  if (estado !== 'granted') {
    opcoes.aoPedirPermissao?.();
    let pedido: string | null = null;
    try {
      const status = await Geolocation.requestPermissions();
      pedido = status.location;
    } catch (erro) {
      const mensagem = mensagemDe(erro);
      return { ok: false, motivo: classificarFalhaNativa(mensagem), detalhe: mensagem };
    }
    if (pedido !== 'granted') {
      negativasDePermissao += 1;
      const bloqueada = negativasDePermissao >= NEGATIVAS_ATE_BLOQUEIO;
      return { ok: false, motivo: bloqueada ? 'permissao-bloqueada' : 'permissao-negada' };
    }
  }
  negativasDePermissao = 0;

  // 3. Captura propriamente dita, com limite de tempo nosso (o plugin ignora
  // o `timeout` no Android).
  try {
    const posicao = await comLimiteDeTempo(
      Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: opcoes.tempoLimiteMs ?? 15_000,
        maximumAge: 0,
      }),
      opcoes.tempoLimiteMs ?? 20_000,
    );
    return {
      ok: true,
      latitude: posicao.coords.latitude,
      longitude: posicao.coords.longitude,
      precisaoMetros: posicao.coords.accuracy,
    };
  } catch (erro) {
    if (erro instanceof ErroDeLimiteDeTempo) {
      return { ok: false, motivo: 'tempo-esgotado', detalhe: `${opcoes.tempoLimiteMs ?? 20_000} ms` };
    }
    const mensagem = mensagemDe(erro);
    return { ok: false, motivo: classificarFalhaNativa(mensagem), detalhe: mensagem };
  }
}

async function capturarNoNavegador(opcoes: OpcoesDeCaptura): Promise<CapturaDeLocalizacao> {
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
    return { ok: false, motivo: 'sem-suporte', detalhe: 'navegador sem geolocalização' };
  }

  // 'denied' aqui é bloqueio permanente: navegadores não repetem a caixa de
  // diálogo depois de uma negativa — só nas configurações do site.
  let estado = await estadoDaPermissaoNoNavegador();
  if (estado === 'denied') return { ok: false, motivo: 'permissao-bloqueada' };

  if (estado !== 'granted') opcoes.aoPedirPermissao?.();

  try {
    const posicao = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: opcoes.tempoLimiteMs ?? 15_000,
        maximumAge: 0,
      });
    });
    return {
      ok: true,
      latitude: posicao.coords.latitude,
      longitude: posicao.coords.longitude,
      precisaoMetros: posicao.coords.accuracy,
    };
  } catch (erro) {
    const codigo = (erro as GeolocationPositionError | null)?.code;
    // Reconsulta a Permissions API para separar negativa de bloqueio.
    if (codigo === 1) estado = await estadoDaPermissaoNoNavegador();
    return {
      ok: false,
      motivo: classificarFalhaDoNavegador(codigo, estado),
      detalhe: (erro as GeolocationPositionError | null)?.message,
    };
  }
}

async function estadoDaPermissaoNoNavegador(): Promise<string | null> {
  try {
    if (typeof navigator === 'undefined' || !navigator.permissions) return null;
    const status = await navigator.permissions.query({ name: 'geolocation' });
    return status.state;
  } catch {
    return null;
  }
}

// ── Apoio ───────────────────────────────────────────────────────────────────

class ErroDeLimiteDeTempo extends Error {}

function mensagemDe(erro: unknown): string {
  return (erro as { message?: string } | null)?.message ?? String(erro);
}

/** Corre contra o cronômetro: quem chegar primeiro vence. */
function comLimiteDeTempo<T>(promessa: Promise<T>, limiteMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const cronometro = setTimeout(() => reject(new ErroDeLimiteDeTempo('timeout')), limiteMs);
    promessa.then(
      (valor) => {
        clearTimeout(cronometro);
        resolve(valor);
      },
      (erro) => {
        clearTimeout(cronometro);
        reject(erro);
      },
    );
  });
}

// ============================================================================
// Gera os arquivos de instalação do aplicativo: o manifest e a página que
// aparece quando não há conexão.
//
// Por que gerar em vez de escrever à mão: os dois carregam a marca (nome, cor,
// escudo) e os dois iam envelhecer sozinhos se fossem escritos uma vez. A
// fonte continua sendo `src/lib/marca.ts`.
//
// Uso: `npm run pwa:gerar`
// Conferência (roda no `npm run verify`): `npm run test:pwa`
// ============================================================================

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { CORES, FAMILIA_TEXTO, TAGLINE, desenhoDoEscudo, ESCUDO, LIMITES_DO_ESCUDO } from '../../src/lib/marca.ts';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUBLICO = join(RAIZ, 'public');

/** Nome e descrição do aplicativo — os mesmos que aparecem no index.html. */
export const NOME = 'SIFAU';
export const DESCRICAO = 'Sistema de Fiscalização Ambiental Urbana do Recife';

/**
 * O manifest, no formato que os navegadores leem.
 *
 * Duas escolhas que não são óbvias:
 *
 * - `start_url` e os caminhos dos ícones são **relativos** (`./`), como o resto
 *   do aplicativo. Se o sistema for publicado numa subpasta
 *   (`https://recife.pe.gov.br/sifau/`), ele continua funcionando; com caminho
 *   absoluto (`/icone-192.png`) o ícone quebraria.
 * - `display: standalone` é o que faz o atalho abrir em tela cheia, sem barra
 *   de endereço — é o que separa "atalho para um site" de "aplicativo".
 */
export function conteudoDoManifest() {
  const manifest = {
    id: './',
    name: NOME,
    short_name: NOME,
    description: DESCRICAO,
    lang: 'pt-BR',
    dir: 'ltr',
    start_url: './',
    scope: './',
    display: 'standalone',
    orientation: 'portrait',
    // A cor de fundo é a mesma da tela de entrada (.auth-page), para a abertura
    // não piscar branco antes do aplicativo desenhar.
    background_color: '#f5f8fc',
    theme_color: CORES.azulProfundo,
    categories: ['productivity', 'government'],
    icons: [
      { src: './icone-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: './icone-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // `maskable` é o que permite ao Android recortar o ícone na forma do
      // aparelho (círculo, gota, quadrado) sem cortar o escudo.
      { src: './icone-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: './apple-touch-icon.png', sizes: '180x180', type: 'image/png', purpose: 'any' },
    ],
  };
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

/**
 * O escudo da marca, escrito à mão como SVG simples para dentro da página.
 *
 * Aqui não dá para reaproveitar `svgSimbolo()`: esta página é servida **sem
 * rede** e precisa caber num arquivo só, sem fonte, sem imagem e sem nada
 * externo. O traçado vem de `marca.ts`, para continuar sendo um desenho só.
 */
function escudoInline() {
  const B = LIMITES_DO_ESCUDO;
  const centrar = (caixa) => {
    const escala = caixa / (B.maxY - B.minY);
    const cx = (B.minX + B.maxX) / 2;
    const cy = (B.minY + B.maxY) / 2;
    return { escala, cx, cy };
  };
  const { escala, cx, cy } = centrar(96);
  const vazados = desenhoDoEscudo()
    .filter((forma) => forma.tipo === 'caminho' && forma.preenchimento === 'nenhum')
    .map(
      (forma) =>
        `<path d="${forma.d}" fill="none" stroke="#fff" stroke-width="${forma.larguraDoContorno ?? 5}" stroke-linecap="round" stroke-linejoin="round"/>`,
    )
    .join('\n        ');
  return `<svg viewBox="0 0 110 110" width="110" height="110" role="img" aria-label="${NOME}">
        <defs>
          <linearGradient id="marca" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="64" y2="64">
            <stop offset="0" stop-color="${CORES.azulVivo}"/>
            <stop offset="1" stop-color="${CORES.azulNoite}"/>
          </linearGradient>
          <clipPath id="recorte"><path d="${ESCUDO}"/></clipPath>
        </defs>
        <g transform="translate(55 55) scale(${escala.toFixed(4)}) translate(${-cx} ${-cy})">
          <path d="${ESCUDO}" fill="url(#marca)"/>
          <g clip-path="url(#recorte)">
            ${vazados}
          </g>
        </g>
      </svg>`;
}

/**
 * A página mostrada quando o aplicativo não tem nem os próprios arquivos em
 * cache e está sem conexão.
 *
 * Ela existe por um motivo específico: sem ela, o fiscal sem sinal veria a tela
 * de erro do navegador — "não foi possível conectar" — que parece defeito do
 * sistema. Aqui ele lê o que aconteceu, em português, e o que fazer.
 *
 * O texto **não** promete que os registros pendentes serão enviados: se esta
 * página apareceu, o aplicativo não abriu. Ele diz o que é verdade — que os
 * registros continuam guardados no aparelho.
 */
export function conteudoDaPaginaSemConexao() {
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>${NOME} — sem conexão</title>
    <meta name="theme-color" content="${CORES.azulProfundo}" />
    <style>
      /* Tudo aqui é do próprio arquivo: esta página precisa funcionar sem
         nenhuma rede, então não carrega fonte, ícone nem folha de estilo. */
      :root { font-family: ${FAMILIA_TEXTO}; color: #172b4d; background: #f5f8fc; }
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; display: flex; flex-direction: column; align-items: center;
             justify-content: center; padding: 32px 20px; background: linear-gradient(160deg, #f7fbff 0%, #eaf3ff 100%); }
      main { width: min(100%, 420px); background: #fff; border: 1px solid #dfeaf6; border-radius: 18px;
             padding: 26px 22px; box-shadow: 0 16px 38px rgba(32, 76, 130, .08); text-align: center; }
      h1 { font-size: 21px; color: #183a67; margin: 18px 0 8px; }
      p { margin: 0 0 14px; font-size: 13px; line-height: 1.6; color: #47617f; }
      ol { text-align: left; margin: 0 0 18px; padding-left: 20px; font-size: 13px; line-height: 1.7; color: #47617f; }
      .aviso { display: flex; gap: 9px; align-items: flex-start; text-align: left; background: #fff7e9;
               border: 1px solid #f0d9a8; border-radius: 11px; padding: 11px 12px; margin-bottom: 18px; }
      .aviso span { font-size: 12px; line-height: 1.5; color: #8a5c18; }
      button { width: 100%; min-height: 48px; border: 0; border-radius: 11px; background: #1766d1; color: #fff;
               font-family: inherit; font-size: 14px; font-weight: 700; cursor: pointer; }
      button:hover { background: #0e55b3; }
      footer { margin-top: 20px; font-size: 11px; color: #89a0bb; text-align: center; }
    </style>
  </head>
  <body>
    <main>
      ${escudoInline()}
      <h1>Sem conexão com a internet</h1>
      <p>
        Este aparelho ainda não guardou os arquivos do ${NOME}, então o aplicativo não
        consegue abrir agora.
      </p>
      <ol>
        <li>Verifique se o celular está com dados móveis ou wi-fi.</li>
        <li>Toque em "Tentar de novo".</li>
      </ol>
      <div class="aviso">
        <span>
          <b>Nada foi perdido.</b> Os registros que você fez e ainda não foram enviados
          continuam guardados neste aparelho; eles sobem quando a conexão voltar.
        </span>
      </div>
      <button onclick="location.replace('./')">Tentar de novo</button>
    </main>
    <footer>${NOME} — ${TAGLINE}</footer>
  </body>
</html>
`;
}

/** Arquivo → conteúdo. É o que o teste `test:pwa` compara com o disco. */
export function arquivosDoPwa() {
  return [
    { arquivo: 'manifest.webmanifest', conteudo: conteudoDoManifest() },
    { arquivo: 'offline.html', conteudo: conteudoDaPaginaSemConexao() },
  ];
}

export function caminhoDoPwa(arquivo) {
  return join(PUBLICO, arquivo);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const { arquivo, conteudo } of arquivosDoPwa()) {
    writeFileSync(caminhoDoPwa(arquivo), conteudo, 'utf8');
    console.log(`✓ public/${arquivo}`);
  }
}

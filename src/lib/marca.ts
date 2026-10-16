// ============================================================================
// SIFAU — A marca, em código
// ============================================================================
// Aqui ficam a geometria e as cores da marca. Duas coisas dependem deste
// arquivo, e é isso que impede a marca de se dividir em duas versões:
//
//   1. os componentes do aplicativo (`src/components/Logo.tsx`);
//   2. os arquivos soltos de `public/` (`npm run marca:gerar`), que são o que a
//      landing page, o splash e a impressão vão usar.
//
// Um teste (`npm run test:marca`) confere que os arquivos em `public/` são
// exatamente o que este módulo gera. Sem ele, alguém ajustaria o arquivo solto
// e a marca do app ficaria diferente da marca do site.
//
// **Sobre a tipografia:** o texto da marca é texto de verdade, com a fonte que o
// aplicativo já carrega (`src/fonts.ts`). Isso mantém o alinhamento ótico
// perfeito dentro do app. Em arquivo solto, a fonte vem do sistema de quem
// abrir — por isso, antes de mandar a marca para impressão ou para um designer,
// converta o texto SIFAU em curvas (Inkscape: *Caminho → Objeto para
// caminho*). Está anotado em `PROMPTS_LOGO.md`.
// ============================================================================

export const TAGLINE = 'Fiscalização urbana inteligente';

export const FAMILIA_TITULO = "'Space Grotesk', 'DM Sans', system-ui, sans-serif";
export const FAMILIA_TEXTO = "'DM Sans', system-ui, sans-serif";

/** Cores da marca — as mesmas que o aplicativo já usa nas telas. */
export const CORES = {
  azulProfundo: '#0d428b', // título SIFAU, cabeçalho
  azulVivo: '#1569db', // início do gradiente
  azulNoite: '#07357d', // fim do gradiente
  tintaClara: '#e7f0ff',
  cinzaAzulado: '#7890ae',
  preto: '#000000',
} as const;

// ---------------------------------------------------------------------------
// Geometria
// ---------------------------------------------------------------------------
// O escudo é a forma que já foi entregue no ícone do app (versão do primeiro
// commit), redesenhada para ocupar mais espaço quando aparece sozinha — sem
// trocar o desenho, para quem já instalou o aplicativo reconhecer o ícone.
//
// Desenho: escudo + confirmação (o "check" do ShieldCheck que o app usa) +
// linguagem de mapa — a malha de ruas com uma rua destacada e o furo do pino,
// no lugar onde um pino de mapa tem o furo.

/** Contorno do escudo, em uma caixa de 64 × 64. */
export const ESCUDO =
  'M32 9.6 51 17.1v16.3c0 11.4-8.1 19.8-19 24-10.9-4.2-19-12.6-19-24V17.1z';

/** A confirmação dentro do escudo. */
export const CONFIRMACAO = 'M22.6 34.2 29.4 41 42 28.2';

/**
 * Malha de ruas, em branco vazado.
 *
 * **Só a avenida.** A primeira versão tinha também duas ruas verticais, e
 * ficava bonita em 96 px — mas em 24 px (o tamanho do cabeçalho) os três traços
 * viravam três riscos cruzados e o escudo parecia sujo. A marca precisa
 * funcionar no tamanho pequeno, que é onde ela mais aparece no aplicativo;
 * a vertical foi a que cedeu.
 */
export const MALHA = [
  { d: 'M13.6 23.6H50.4', traco: 2.2, opacidade: 0.9 }, // a avenida
];

/** O furo do pino, no lugar do furo de um pino de mapa. */
export const FURO_DO_PIN = { cx: 32, cy: 49.5, r: 3.1 };

/**
 * Escala do escudo dentro do ícone quadrado do aplicativo.
 *
 * O mesmo valor serve para o ícone de fundo cheio ("maskable"), que alguns
 * aparelhos recortam em círculo. O círculo de segurança tem 80% do lado, ou
 * seja, raio de 25,6 unidades num ícone de 64; nesta escala o ponto mais
 * distante do escudo fica a 20,8 unidades do centro. Cabe com folga — por isso
 * não existe uma segunda escala só para o ícone recortado.
 */
export const ESCALA_NO_ICONE = 0.82;

/**
 * A caixa exata que o desenho do escudo ocupa (não é a caixa de 64 do desenho:
 * o escudo é mais estreito que a caixa). Serve para centrar o escudo em
 * qualquer moldura — inclusive nos recursos do Android, que precisam saber
 * onde o desenho começa e termina para posicioná-lo dentro da zona segura do
 * ícone.
 */
export const LIMITES_DO_ESCUDO = { minX: 13, maxX: 51, minY: 9.6, maxY: 57.4 } as const;

/**
 * A marca como **lista de formas**, e não como texto de arquivo.
 *
 * Esta é a peça que impede a marca de se dividir em duas: o desenho que aparece
 * na tela (componentes React) e o desenho que sai em arquivo (SVG) são gerados
 * a partir desta mesma lista. Quem acrescentar um detalhe à marca acrescenta
 * aqui, e os dois lados acompanham sozinhos.
 *
 * `recorte: true` significa "desenhe isto só dentro do contorno do escudo" —
 * é o que faz a avenida terminar exatamente na borda, sem sobrar nem faltar.
 */
export type Forma =
  | {
      tipo: 'caminho';
      d: string;
      /** `gradiente` = gradiente da marca; `branco` = vazado; `nenhum` = só contorno. */
      preenchimento: 'gradiente' | 'branco' | 'preto' | 'nenhum';
      corDoContorno?: 'branco';
      larguraDoContorno?: number;
      opacidade?: number;
      recorte?: boolean;
    }
  | { tipo: 'circulo'; cx: number; cy: number; r: number; preenchimento: 'branco' | 'preto' };

/** Todas as formas que compõem a marca, na ordem de desenho. */
export function desenhoDoEscudo(): Forma[] {
  return [
    { tipo: 'caminho', d: ESCUDO, preenchimento: 'gradiente' },
    ...MALHA.map(
      (linha): Forma => ({
        tipo: 'caminho',
        d: linha.d,
        preenchimento: 'nenhum',
        corDoContorno: 'branco',
        larguraDoContorno: linha.traco,
        opacidade: linha.opacidade,
        recorte: true,
      }),
    ),
    {
      tipo: 'caminho',
      d: CONFIRMACAO,
      preenchimento: 'nenhum',
      corDoContorno: 'branco',
      larguraDoContorno: 5,
    },
    { tipo: 'circulo', ...FURO_DO_PIN, preenchimento: 'branco' },
  ];
}

/**
 * A mesma marca em uma cor só — para impressão, carimbo e fax.
 *
 * Sem a malha e sem gradiente de propósito: numa cor só, a avenida sairia como
 * um cinza e o gradiente viraria uma mancha. Fica o escudo chapado, com a
 * confirmação recortada — o que se reconhece à distância.
 *
 * O `preenchimento: 'preto'` é o único lugar da marca que não usa as cores do
 * aplicativo, e é por isso: quem imprime em preto e branco não tem azul.
 */
export function desenhoMonocromatico(): Forma[] {
  return [
    { tipo: 'caminho', d: ESCUDO, preenchimento: 'preto' },
    {
      tipo: 'caminho',
      d: CONFIRMACAO,
      preenchimento: 'nenhum',
      corDoContorno: 'branco',
      larguraDoContorno: 5,
    },
    { tipo: 'circulo', ...FURO_DO_PIN, preenchimento: 'branco' },
  ];
}

/** O escudo em contorno branco, para dentro do ícone do aplicativo. */
export function desenhoDoIcone(): Forma[] {
  return [
    { tipo: 'caminho', d: ESCUDO, preenchimento: 'nenhum', corDoContorno: 'branco', larguraDoContorno: 5.4 },
    {
      tipo: 'caminho',
      d: CONFIRMACAO,
      preenchimento: 'nenhum',
      corDoContorno: 'branco',
      larguraDoContorno: 5.4,
    },
  ];
}

// ---------------------------------------------------------------------------
// Montagem dos arquivos (.svg)
// ---------------------------------------------------------------------------

function gradiente(id: string): string {
  // `userSpaceOnUse` de propósito: o mesmo gradiente precisa cair igual no
  // escudo, na tela de fundo e nos vazados — se cada elemento calculasse o
  // próprio gradiente, os vazados ficariam desalinhados do fundo.
  return `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="64" y2="64">
    <stop offset="0" stop-color="${CORES.azulVivo}"/>
    <stop offset="1" stop-color="${CORES.azulNoite}"/>
  </linearGradient>`;
}

/**
 * Desenha uma lista de formas como texto de SVG.
 *
 * O `transformar` é para os desenhos que aparecem dentro de outro desenho — o
 * escudo pequeno que vive dentro do ícone quadrado do aplicativo.
 */
function formasParaSvg(
  formas: Forma[],
  { idGradiente, idRecorte, transformar }: { idGradiente?: string; idRecorte?: string; transformar?: string },
): string {
  const corpo = formas
    .map((forma) => {
      if (forma.tipo === 'circulo') {
        const cor = forma.preenchimento === 'preto' ? CORES.preto : '#fff';
        return `<circle cx="${forma.cx}" cy="${forma.cy}" r="${forma.r}" fill="${cor}"/>`;
      }
      const preenchimento =
        forma.preenchimento === 'gradiente'
          ? `url(#${idGradiente})`
          : forma.preenchimento === 'preto'
            ? CORES.preto
            : forma.preenchimento === 'branco'
              ? '#fff'
              : 'none';
      const contorno = forma.corDoContorno === 'branco' ? ' stroke="#fff"' : '';
      const largura = forma.larguraDoContorno ? ` stroke-width="${forma.larguraDoContorno}"` : '';
      const opacidade = forma.opacidade !== undefined ? ` opacity="${forma.opacidade}"` : '';
      return `<path d="${forma.d}" fill="${preenchimento}"${contorno}${largura}${opacidade}${
        forma.corDoContorno ? ' stroke-linecap="round" stroke-linejoin="round"' : ''
      }/>`;
    })
    .join('\n    ');

  const recortadas = formas.some((forma) => forma.tipo === 'caminho' && forma.recorte);
  const grupos = recortadas
    ? `\n  <g clip-path="url(#${idRecorte})">\n    ${corpo}\n  </g>`
    : `\n  ${corpo}`;

  const definicoes =
    idGradiente && idRecorte
      ? `<defs>\n    ${gradiente(idGradiente)}\n    <clipPath id="${idRecorte}"><path d="${ESCUDO}"/></clipPath>\n  </defs>`
      : idGradiente
        ? `<defs>${gradiente(idGradiente)}</defs>`
        : '';

  const interno = `${definicoes}${grupos}`.trim();
  return transformar ? `<g transform="${transformar}">\n    ${interno}\n  </g>` : interno;
}

const CABECALHO = 'Gerado por `npm run marca:gerar` — a fonte é src/lib/marca.ts. Não edite este arquivo à mão.';

/** O escudo sozinho — para marcas d'água, botões e espaços estreitos. */
export function svgSimbolo(id = 'sifau'): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Símbolo SIFAU">
  <!-- ${CABECALHO} -->
  ${formasParaSvg(desenhoDoEscudo(), { idGradiente: `${id}-grad`, idRecorte: `${id}-recorte` })}
</svg>
`;
}

/** Ícone do aplicativo: o escudo em contorno branco dentro do quadrado azul. */
export function svgIcone({
  id = 'sifau-icone',
  raio = 14,
}: {
  id?: string;
  /** `0` gera o ícone de fundo cheio, sem cantos arredondados (ver abaixo). */
  raio?: number;
} = {}): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="SIFAU">
  <!-- ${CABECALHO} -->
  <defs>${gradiente(`${id}-grad`)}</defs>
  <rect width="64" height="64" rx="${raio}" fill="url(#${id}-grad)"/>
  ${formasParaSvg(desenhoDoIcone(), {
    transformar: `translate(32 32) scale(${ESCALA_NO_ICONE}) translate(-32 -32)`,
  })}
</svg>
`;
}

/**
 * Marca horizontal — símbolo à esquerda, nome à direita.
 * É a versão para espaços largos e baixos (cabeçalho largo, assinatura de
 * e-mail, barra do navegador).
 */
export function svgLogoHorizontal(id = 'sifau-h'): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 212 68" role="img" aria-label="SIFAU — ${TAGLINE}">
  <!-- ${CABECALHO} -->
  ${formasParaSvg(desenhoDoEscudo(), {
    idGradiente: `${id}-grad`,
    idRecorte: `${id}-recorte`,
    transformar: 'translate(2 3) scale(0.96875)',
  })}
  <text x="82" y="45" font-family="${FAMILIA_TITULO}" font-size="38" font-weight="700"
    letter-spacing="1.9" textLength="122" lengthAdjust="spacing"
    fill="${CORES.azulProfundo}">SIFAU</text>
</svg>
`;
}

/**
 * Marca vertical — símbolo em cima, nome e frase embaixo.
 * É a versão para telas estreitas e centradas: abertura do aplicativo, splash,
 * primeira dobra da landing page.
 *
 * O `textLength` não é enfeite: fixa a largura do nome e da frase seja qual for
 * a fonte que estiver disponível, para o conjunto não desmontar.
 */
export function svgLogoVertical(id = 'sifau-v'): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 210" role="img" aria-label="SIFAU — ${TAGLINE}">
  <!-- ${CABECALHO} -->
  ${formasParaSvg(desenhoDoEscudo(), {
    idGradiente: `${id}-grad`,
    idRecorte: `${id}-recorte`,
    transformar: 'translate(64 4) scale(1.4375)',
  })}
  <text x="110" y="152" text-anchor="middle" font-family="${FAMILIA_TITULO}" font-size="50" font-weight="700"
    letter-spacing="2.5" textLength="158" lengthAdjust="spacing"
    fill="${CORES.azulProfundo}">SIFAU</text>
  <text x="110" y="182" text-anchor="middle" font-family="${FAMILIA_TEXTO}" font-size="11.5"
    letter-spacing="0.4" textLength="176" lengthAdjust="spacing"
    fill="${CORES.cinzaAzulado}">${TAGLINE}</text>
</svg>
`;
}

/**
 * Versão de uma cor só — para o PDF do auto de infração, carimbo, fax, bordado
 * e qualquer lugar onde só existe tinta preta. Sem a malha de ruas e sem
 * gradiente: em uma cor só, a malha viraria cinza.
 */
export function svgLogoMonocromatico(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Símbolo SIFAU">
  <!-- ${CABECALHO} -->
  ${formasParaSvg(desenhoMonocromatico(), {})}
</svg>
`;
}

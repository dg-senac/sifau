// ============================================================================
// SIFAU — A marca dentro do aplicativo
// ============================================================================
// Estes componentes desenham o MESMO desenho de `src/lib/marca.ts` — as formas
// vêm de `desenhoDoEscudo()`, e não são redesenhadas aqui. É o que impede a
// marca que aparece na tela de divergir da marca que sai em arquivo (`public/`),
// que é o que a landing page, o splash e a impressão vão usar.
//
// Por que não usar o `icon.svg` como `<img>`: assim o texto da marca é texto de
// verdade, com a fonte que o aplicativo já carrega (`src/fonts.ts`), herda as
// cores do tema e não custa um arquivo separado para aparecer.
//
// Por que não usar um ícone pronto (como era, com o `ShieldCheck` do
// lucide-react): a marca do sistema não é ícone de biblioteca. O escudo com
// confirmação continua sendo a forma — agora desenhada para o SIFAU, com a
// avenida e o furo do pino, que é o que liga a marca à fiscalização urbana.
// ============================================================================

import { useId } from 'react';

import {
  CORES,
  ESCUDO,
  FAMILIA_TEXTO,
  FAMILIA_TITULO,
  TAGLINE,
  desenhoDoEscudo,
  type Forma,
} from '../lib/marca';

/** Os `<defs>` de um desenho: gradiente e o recorte do escudo. */
function Definicoes({ idGradiente, idRecorte }: { idGradiente: string; idRecorte: string }) {
  return (
    <defs>
      {/* `userSpaceOnUse` para o gradiente cair igual no escudo e nos vazados. */}
      <linearGradient id={idGradiente} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="64" y2="64">
        <stop offset="0" stopColor={CORES.azulVivo} />
        <stop offset="1" stopColor={CORES.azulNoite} />
      </linearGradient>
      <clipPath id={idRecorte}>
        <path d={ESCUDO} />
      </clipPath>
    </defs>
  );
}

/** Uma forma da lista, em JSX. */
function FormaDesenhada({ forma, idGradiente }: { forma: Forma; idGradiente: string }) {
  if (forma.tipo === 'circulo') {
    return <circle cx={forma.cx} cy={forma.cy} r={forma.r} fill="#fff" />;
  }
  const preenchimento =
    forma.preenchimento === 'gradiente'
      ? `url(#${idGradiente})`
      : forma.preenchimento === 'preto'
        ? CORES.preto
        : forma.preenchimento === 'branco'
          ? '#fff'
          : 'none';
  return (
    <path
      d={forma.d}
      fill={preenchimento}
      stroke={forma.corDoContorno === 'branco' ? '#fff' : undefined}
      strokeWidth={forma.larguraDoContorno}
      strokeLinecap={forma.corDoContorno ? 'round' : undefined}
      strokeLinejoin={forma.corDoContorno ? 'round' : undefined}
      opacity={forma.opacidade}
    />
  );
}

/** O desenho do escudo, com o recorte aplicado. */
function Escudo({ idGradiente, idRecorte }: { idGradiente: string; idRecorte: string }) {
  const formas = desenhoDoEscudo();
  return (
    <g clipPath={`url(#${idRecorte})`}>
      {formas.map((forma, indice) => (
        <FormaDesenhada key={indice} forma={forma} idGradiente={idGradiente} />
      ))}
    </g>
  );
}

/**
 * Escudo da marca — símbolo sozinho, para espaços quadrados.
 *
 * `titulo` vazio deixa o desenho puramente decorativo para leitor de tela: é o
 * caso de quando ele acompanha o texto "SIFAU" em HTML, e anunciar a marca duas
 * vezes só atrapalha quem usa leitor de tela.
 */
export function SifauSimbolo({
  tamanho = 24,
  titulo,
  className,
}: {
  tamanho?: number;
  titulo?: string;
  className?: string;
}) {
  // Os identificadores de gradiente precisam ser únicos na página: duas marcas
  // com o mesmo `id` fariam a segunda usar o gradiente da primeira.
  const id = useId().replace(/:/g, '');
  const gradiente = `${id}-g`;
  const recorte = `${id}-r`;

  return (
    <svg
      viewBox="0 0 64 64"
      width={tamanho}
      height={tamanho}
      className={className}
      role={titulo ? 'img' : undefined}
      aria-label={titulo}
      aria-hidden={titulo ? undefined : true}
    >
      <Definicoes idGradiente={gradiente} idRecorte={recorte} />
      <Escudo idGradiente={gradiente} idRecorte={recorte} />
    </svg>
  );
}

/**
 * Marca completa e empilhada — símbolo, nome e frase.
 * É a versão das telas de entrada, onde há espaço de sobra em largura e o
 * conjunto precisa se apresentar.
 *
 * O `textLength` fixa a largura do nome e da frase: sem ele, a composição
 * dependeria de qual fonte o navegador conseguiu carregar.
 */
export function SifauMarcaVertical({
  largura = 158,
  className,
}: {
  largura?: number;
  className?: string;
}) {
  const id = useId().replace(/:/g, '');
  const gradiente = `${id}-g`;
  const recorte = `${id}-r`;

  return (
    <svg
      viewBox="0 0 220 210"
      width={largura}
      height={(largura * 210) / 220}
      className={className}
      role="img"
      aria-label={`SIFAU — ${TAGLINE}`}
    >
      <Definicoes idGradiente={gradiente} idRecorte={recorte} />
      <g transform="translate(64 4) scale(1.4375)">
        <Escudo idGradiente={gradiente} idRecorte={recorte} />
      </g>
      <text
        x="110"
        y="152"
        textAnchor="middle"
        fontFamily={FAMILIA_TITULO}
        fontSize="50"
        fontWeight="700"
        letterSpacing="2.5"
        textLength="158"
        lengthAdjust="spacing"
        fill={CORES.azulProfundo}
      >
        SIFAU
      </text>
      <text
        x="110"
        y="182"
        textAnchor="middle"
        fontFamily={FAMILIA_TEXTO}
        fontSize="11.5"
        letterSpacing="0.4"
        textLength="176"
        lengthAdjust="spacing"
        fill={CORES.cinzaAzulado}
      >
        {TAGLINE}
      </text>
    </svg>
  );
}

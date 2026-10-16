// ============================================================================
// Gera os recursos do Android (ícone e abertura) a partir da marca.
//
// Por que existe: até aqui o aplicativo instalado mostrava **um quadrado azul
// vazio** na gaveta de aplicativos — o ícone era o do modelo do Capacitor,
// nunca trocado — e abria com uma tela branca. É a primeira coisa que o fiscal
// vê depois de instalar, e era a única parte do app que não tinha passado pela
// marca.
//
// Tudo sai de `src/lib/marca.ts`: o mesmo desenho que aparece na tela e nos
// arquivos de `public/`. Mudar a marca é mudar em todo lugar.
//
// Uso: `npm run marca:android`
// ============================================================================

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import sharp from 'sharp';

import { CORES, ESCUDO, LIMITES_DO_ESCUDO, svgIcone } from '../../src/lib/marca.ts';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const RES = join(RAIZ, 'android', 'app', 'src', 'main', 'res');

const B = LIMITES_DO_ESCUDO;
const CENTRO_X = (B.minX + B.maxX) / 2;
const CENTRO_Y = (B.minY + B.maxY) / 2;
const ALTURA = B.maxY - B.minY;

/** A confirmação vazada dentro do escudo, usada nos vetores do Android. */
const CONFIRMACAO_ANDROID = 'M22.6 34.2 29.4 41 42 28.2';

/**
 * O escudo em vetor do Android, centrado numa moldura quadrada de `lado` dp,
 * ocupando `alvo` dp de altura.
 *
 * Sem gradiente de propósito: gradiente em `VectorDrawable` só funciona a
 * partir do Android 7 (API 24) e o aplicativo é instalado a partir do Android 5
 * (minSdk 22). Em aparelho mais antigo o desenho sairia estourado, ou não
 * sairia. Traço branco sobre o azul da marca dá o mesmo reconhecimento sem
 * depender da versão.
 */
function vetorDoEscudo(lado, alvo, espessura) {
  const escala = (alvo / ALTURA).toFixed(4);
  return `<?xml version="1.0" encoding="utf-8"?>
<!-- Gerado por \`npm run marca:android\` — a fonte é src/lib/marca.ts. -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="${lado}dp"
    android:height="${lado}dp"
    android:viewportWidth="${lado}"
    android:viewportHeight="${lado}">
    <group
        android:translateX="${(lado / 2).toFixed(3)}"
        android:translateY="${(lado / 2).toFixed(3)}"
        android:scaleX="${escala}"
        android:scaleY="${escala}">
        <group
            android:translateX="${-CENTRO_X}"
            android:translateY="${-CENTRO_Y}">
            <path
                android:pathData="${ESCUDO}"
                android:strokeColor="#FFFFFF"
                android:strokeWidth="${espessura}"
                android:strokeLineJoin="round" />
            <path
                android:pathData="${CONFIRMACAO_ANDROID}"
                android:strokeColor="#FFFFFF"
                android:strokeWidth="${espessura}"
                android:strokeLineCap="round"
                android:strokeLineJoin="round" />
        </group>
    </group>
</vector>
`;
}

async function gerarIcones() {
  const densidades = [
    { pasta: 'mipmap-mdpi', px: 48 },
    { pasta: 'mipmap-hdpi', px: 72 },
    { pasta: 'mipmap-xhdpi', px: 96 },
    { pasta: 'mipmap-xxhdpi', px: 144 },
    { pasta: 'mipmap-xxxhdpi', px: 192 },
  ];
  const icone = Buffer.from(svgIcone());

  for (const { pasta, px } of densidades) {
    const destino = join(RES, pasta);
    mkdirSync(destino, { recursive: true });

    // Ícone quadrado — o formato do Android até a versão 7.
    await sharp(icone, { density: 600 })
      .resize(px, px)
      .png()
      .toFile(join(destino, 'ic_launcher.png'));

    // Ícone redondo: a mesma arte, recortada em círculo. `dest-in` mantém do
    // desenho só o que cai dentro do círculo.
    const circulo = Buffer.from(
      `<svg width="${px}" height="${px}"><circle cx="${px / 2}" cy="${px / 2}" r="${px / 2}" fill="#fff"/></svg>`,
    );
    await sharp(icone, { density: 600 })
      .resize(px, px)
      .composite([{ input: circulo, blend: 'dest-in' }])
      .png()
      .toFile(join(destino, 'ic_launcher_round.png'));

    console.log(`✓ ${pasta}/ic_launcher.png + ic_launcher_round.png (${px}px)`);
  }
}

function gerarAdaptativo() {
  // Do Android 8 em diante o sistema recorta o ícone na forma que o aparelho
  // usa (círculo, gota, quadrado arredondado). A zona segura é um círculo de
  // 66dp dentro da moldura de 108dp: o desenho precisa caber aí dentro, senão
  // as pontas do escudo aparecem cortadas em alguns aparelhos.
  const pasta = join(RES, 'mipmap-anydpi-v26');
  mkdirSync(pasta, { recursive: true });
  for (const nome of ['ic_launcher', 'ic_launcher_round']) {
    writeFileSync(
      join(pasta, `${nome}.xml`),
      `<?xml version="1.0" encoding="utf-8"?>
<!-- Gerado por \`npm run marca:android\`. -->
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background" />
    <foreground android:drawable="@drawable/ic_launcher_foreground" />
</adaptive-icon>
`,
      'utf8',
    );
  }

  // 58dp de 108dp: dentro da zona segura de 66dp, com folga para o traço.
  writeFileSync(
    join(RES, 'drawable', 'ic_launcher_foreground.xml'),
    vetorDoEscudo(108, 58, 5.4),
    'utf8',
  );

  // O robô do Capacitor sai de cena.
  rmSync(join(RES, 'drawable-v24', 'ic_launcher_foreground.xml'), { force: true });
  console.log('✓ mipmap-anydpi-v26/ e drawable/ic_launcher_foreground.xml');
}

function gerarAbertura() {
  const drawable = join(RES, 'drawable');
  mkdirSync(drawable, { recursive: true });

  // Os PNGs do modelo (tela branca com o logotipo do Capacitor) saem de cena.
  for (const pasta of [
    'drawable',
    'drawable-port-mdpi',
    'drawable-port-hdpi',
    'drawable-port-xhdpi',
    'drawable-port-xxhdpi',
    'drawable-port-xxxhdpi',
    'drawable-land-mdpi',
    'drawable-land-hdpi',
    'drawable-land-xhdpi',
    'drawable-land-xxhdpi',
    'drawable-land-xxxhdpi',
  ]) {
    rmSync(join(RES, pasta, 'splash.png'), { force: true });
    rmSync(join(RES, pasta, 'splash_icon.png'), { force: true });
  }

  // Fundo desenhado por forma, e não por bitmap esticado: bitmap esticado
  // deforma o desenho — o escudo viraria uma elipse em tela de proporção
  // diferente da imagem.
  writeFileSync(
    join(drawable, 'splash_fundo.xml'),
    `<?xml version="1.0" encoding="utf-8"?>
<!-- Gerado por \`npm run marca:android\`. -->
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
    <solid android:color="@color/splash_background" />
</shape>
`,
    'utf8',
  );

  writeFileSync(join(drawable, 'splash_escudo.xml'), vetorDoEscudo(96, 68, 5.4), 'utf8');

  writeFileSync(
    join(drawable, 'splash.xml'),
    `<?xml version="1.0" encoding="utf-8"?>
<!-- Gerado por \`npm run marca:android\`.
     Duas camadas: o fundo preenche a tela e o escudo fica centrado, sempre no
     tamanho certo — porque quem posiciona é o sistema, não o recorte da imagem. -->
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item android:drawable="@drawable/splash_fundo" />
    <item>
        <bitmap android:src="@drawable/splash_escudo" android:gravity="center" />
    </item>
</layer-list>
`,
    'utf8',
  );
  console.log('✓ drawable/splash.xml (fundo sólido + escudo centrado)');
}

function atualizarCores() {
  writeFileSync(
    join(RES, 'values', 'colors.xml'),
    `<?xml version="1.0" encoding="utf-8"?>
<!-- Gerado por \`npm run marca:android\` — a fonte é src/lib/marca.ts.

     colorPrimary/colorPrimaryDark/colorAccent são exigidas pelo tema em
     values/styles.xml. Elas estavam faltando, e recurso faltando não deixa o
     aplicativo feio: ele **não compila**. -->
<resources>
    <color name="colorPrimary">${CORES.azulProfundo}</color>
    <color name="colorPrimaryDark">${CORES.azulNoite}</color>
    <color name="colorAccent">${CORES.azulVivo}</color>
    <color name="ic_launcher_background">${CORES.azulNoite}</color>
    <color name="splash_background">${CORES.azulNoite}</color>
</resources>
`,
    'utf8',
  );
  console.log('✓ values/colors.xml');
}

await gerarIcones();
gerarAdaptativo();
gerarAbertura();
atualizarCores();

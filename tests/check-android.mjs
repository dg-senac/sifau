// ============================================================================
// SIFAU — Verificação do projeto Android (antes de tentar construir)
// ============================================================================
// Esta verificação existe porque o APK **não compilar** é o defeito mais caro e
// mais silencioso deste projeto: ninguém descobre até a hora de publicar, e o
// erro do Android não diz o que fazer.
//
// Três defeitos reais entraram no projeto por esse caminho, e os três só
// apareceram rodando o Gradle — que exige um SDK de Android e leva minutos:
//
//   1. o tema usava `@color/colorPrimary`, `colorPrimaryDark` e `colorAccent`,
//      e o `colors.xml` não definia nenhuma das três: recurso faltando não deixa
//      o aplicativo feio, ele NÃO COMPILA;
//   2. o ícone do aplicativo era o do modelo do Capacitor (um quadrado azul
//      vazio) e nada no repositório percebia;
//   3. o Capacitor parou de funcionar por causa de uma atualização de
//      dependência — e o build ficou meses vermelho sem ninguém saber por quê.
//
// O item 3 é o mais traiçoeiro, e a checagem dele é a mais valiosa daqui: o
// `package.json` fixava `tar@^7` para calar um aviso de segurança, e o Capacitor
// usa o `tar` do jeito antigo (`require('tar').default.extract`). O `tar@7` marca
// `__esModule` e não tem `default`, então o Capacitor quebrava com
// "Cannot read properties of undefined (reading 'extract')" — mensagem que não
// aponta para a causa, e que aparece só na hora de empacotar.
//
// Uso:
//   node tests/check-android.mjs              → confere
//   node tests/check-android.mjs --negativos  → injeta defeitos e confere que são pegos
// ============================================================================

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const ANDROID = join(RAIZ, 'android');
const RES = join(ANDROID, 'app', 'src', 'main', 'res');
const MANIFEST = join(ANDROID, 'app', 'src', 'main', 'AndroidManifest.xml');
const PACOTE = join(RAIZ, 'package.json');

let falhas = 0;
function conferir(condicao, mensagem, detalhe = '') {
  if (condicao) return;
  console.error(`✗ ${mensagem}${detalhe ? `\n    ${detalhe}` : ''}`);
  falhas += 1;
}

function ler(caminho) {
  return readFileSync(caminho, 'utf8');
}

// ────────────────────────────────────────────────────────────────────────────
// 1. O Capacitor precisa conseguir rodar (é ele que monta o APK)
// ────────────────────────────────────────────────────────────────────────────
{
  const pacote = JSON.parse(ler(PACOTE));
  const overrides = pacote.overrides ?? {};

  // Declaração: ninguém pode fixar `tar` 7 para o Capacitor. O `tar` 7 é mais
  // novo e tem as correções de segurança, mas quebra o CLI do Capacitor — e
  // Capacitor quebrado significa não conseguir gerar APK nenhum.
  const overrideDoCli = overrides['@capacitor/cli']?.tar ?? '';
  conferir(
    /^\^?6\./.test(overrideDoCli) || overrideDoCli === '',
    'o `tar` fixado para o @capacitor/cli não é da linha 6, que é a que o Capacitor sabe usar',
    `valor: ${overrideDoCli || '(ausente)'} — tar 7 quebra o Capacitor ("reading \'extract\'" of undefined) e o APK deixa de ser gerado`,
  );
  conferir(
    overrides.tar === undefined && overrides['@capacitor/cli'] !== undefined,
    'há um `tar` fixado para todos os pacotes: o correto é fixar apenas para o @capacitor/cli',
    `overrides atuais: ${JSON.stringify(overrides)}`,
  );

  // Fato: o `tar` que está INSTALADO tem de funcionar do jeito que o Capacitor
  // o chama. Esta é a parte que pega o defeito de verdade, e não a intenção:
  // ela resolve o pacote a partir do próprio arquivo do Capacitor que o usa.
  const caminhoDoCapacitor = join(RAIZ, 'node_modules', '@capacitor', 'cli', 'dist', 'util', 'template.js');
  if (!existsSync(caminhoDoCapacitor)) {
    conferir(false, 'não encontrei o @capacitor/cli instalado', 'rode `npm ci` antes desta verificação');
  } else {
    const require = createRequire(caminhoDoCapacitor);
    let tar = null;
    try {
      tar = require('tar');
    } catch (erro) {
      conferir(false, 'o @capacitor/cli não consegue carregar o `tar`', String(erro?.message ?? erro));
    }
    if (tar) {
      // Reproduz o que o compilador do Capacitor faz: `__importDefault`.
      const importado = tar && tar.__esModule ? tar : { default: tar };
      conferir(
        typeof importado.default?.extract === 'function',
        'o `tar` instalado não expõe `extract` do jeito que o Capacitor chama: o empacotamento do APK vai falhar',
        `versão instalada: ${tar.version ?? require('tar/package.json').version}`,
      );
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 2. Todo recurso citado pelo Android precisa existir
// ────────────────────────────────────────────────────────────────────────────
// Esta é a checagem que teria pego o `colorPrimary` faltando: no Android,
// citar um recurso que não existe não é aviso, é erro de compilação.
{
  // Nomes definidos em res/values/*.xml
  const definidos = new Set();
  const values = join(RES, 'values');
  if (existsSync(values)) {
    for (const arquivo of readdirSync(values).filter((n) => n.endsWith('.xml'))) {
      const conteudo = ler(join(values, arquivo));
      for (const m of conteudo.matchAll(/<(color|string|style|dimen|integer|bool|array)\s+name="([^"]+)"/g)) {
        definidos.add(`${m[1]}/${m[2]}`);
      }
    }
  }

  // Nomes que existem como arquivo (drawable, mipmap, xml…) em qualquer variação
  const comoArquivo = new Set();
  for (const pasta of readdirSync(RES)) {
    const caminho = join(RES, pasta);
    if (!statSync(caminho).isDirectory()) continue;
    const tipo = pasta.split('-')[0];
    for (const arquivo of readdirSync(caminho)) {
      comoArquivo.add(`${tipo}/${arquivo.replace(/\.(xml|png|webp|jpg)$/, '')}`);
    }
  }

  const citados = new Map(); // referência → onde foi citada
  const arquivosParaLer = [MANIFEST];
  for (const pasta of readdirSync(RES)) {
    const caminho = join(RES, pasta);
    if (statSync(caminho).isDirectory()) {
      for (const arquivo of readdirSync(caminho)) {
        if (arquivo.endsWith('.xml')) arquivosParaLer.push(join(caminho, arquivo));
      }
    }
  }

  for (const arquivo of arquivosParaLer) {
    const conteudo = ler(arquivo);
    // Tira os comentários: citação dentro de comentário não vira recurso.
    const semComentario = conteudo.replace(/<!--[\s\S]*?-->/g, '');
    for (const m of semComentario.matchAll(/@(color|drawable|mipmap|style|string|xml)\/([A-Za-z0-9_]+)/g)) {
      const referencia = `${m[1]}/${m[2]}`;
      if (!citados.has(referencia)) citados.set(referencia, relative(RAIZ, arquivo));
    }
  }

  const faltando = [...citados.entries()].filter(
    ([referencia]) => !definidos.has(referencia) && !comoArquivo.has(referencia),
  );
  for (const [referencia, onde] of faltando) {
    conferir(
      false,
      `o Android cita @${referencia}, que não existe em res/`,
      `citado em ${onde} — recurso faltando faz o APK não compilar`,
    );
  }
  if (faltando.length === 0) {
    console.log(`✓ ${citados.size} recursos citados pelo Android existem (cores, ícones, estilos, textos)`);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 3. O projeto Android continua sendo o projeto do SIFAU
// ────────────────────────────────────────────────────────────────────────────
{
  const manifest = ler(MANIFEST);
  conferir(/android:icon="@mipmap\/ic_launcher"/.test(manifest), 'o manifesto não aponta para o ícone do aplicativo');
  conferir(
    /android:roundIcon="@mipmap\/ic_launcher_round"/.test(manifest),
    'o manifesto não aponta para o ícone redondo (o Android usa este em vários aparelhos)',
  );
  conferir(/package="br\.recife\.sifau"|applicationId "br\.recife\.sifau"/.test(ler(join(ANDROID, 'app', 'build.gradle'))), 'o identificador do aplicativo não é br.recife.sifau');

  // O ícone precisa ser o do SIFAU, e não o do modelo do Capacitor: o do
  // Capacitor é um quadrado azul vazio, e foi o que esteve publicado.
  const icone = join(RES, 'mipmap-xxxhdpi', 'ic_launcher.png');
  conferir(existsSync(icone), 'falta o ícone do aplicativo em mipmap-xxxhdpi');
  if (existsSync(icone)) {
    const tamanho = statSync(icone).size;
    conferir(
      tamanho > 3000,
      'o ícone do aplicativo é pequeno demais para ser o do SIFAU (provavelmente é o quadrado vazio do modelo)',
      `${tamanho} bytes em ${relative(RAIZ, icone)} — rode \`npm run marca:android\``,
    );
  }
  conferir(
    existsSync(join(RES, 'mipmap-anydpi-v26', 'ic_launcher.xml')),
    'falta o ícone adaptativo (Android 8+): o ícone fica com borda branca em vários aparelhos',
  );
  conferir(
    existsSync(join(RES, 'drawable', 'splash.xml')) && existsSync(join(RES, 'drawable-v23', 'splash.xml')),
    'falta a tela de abertura: o aplicativo abre com tela branca',
  );
  // Vetor dentro de `<bitmap>` é erro de compilação do aapt2 — e foi assim que
  // este arquivo nasceu antes de a verificação existir.
  for (const pasta of ['drawable', 'drawable-v23']) {
    const caminho = join(RES, pasta, 'splash.xml');
    if (!existsSync(caminho)) continue;
    conferir(
      !/<bitmap/.test(ler(caminho)),
      `<bitmap> em ${pasta}/splash.xml: o aapt2 recusa imagem vetorial dentro de <bitmap> (erro de compilação)`,
    );
  }

  const configCapacitor = ler(join(RAIZ, 'capacitor.config.ts'));
  conferir(/webDir:\s*'dist'/.test(configCapacitor), "o Capacitor não aponta para a pasta 'dist': o APK sairia sem o aplicativo dentro");
  conferir(/appId:\s*'br\.recife\.sifau'/.test(configCapacitor), 'o appId do Capacitor não é br.recife.sifau');
}

// ────────────────────────────────────────────────────────────────────────────
// 4. Nenhuma chave de assinatura no repositório
// ────────────────────────────────────────────────────────────────────────────
{
  const rastreados = execFileSync('git', ['ls-files'], { cwd: RAIZ, encoding: 'utf8' })
    .split('\n')
    .filter((caminho) => /\.(jks|keystore)$/.test(caminho) || /keystore\.properties$/.test(caminho));
  conferir(
    rastreados.length === 0,
    'há chave de assinatura versionada no repositório',
    `${rastreados.join(', ')} — trocar a chave, não só apagar o arquivo`,
  );
}

// ────────────────────────────────────────────────────────────────────────────
// 5. Prova dos negativos
// ────────────────────────────────────────────────────────────────────────────
if (process.argv.includes('--negativos')) {
  const CASOS = [
    {
      // O defeito que realmente entrou no repositório e derrubou o build.
      nome: 'tar 7 fixado para todos os pacotes (o defeito real)',
      arquivo: PACOTE,
      estragar: (t) => {
        const d = JSON.parse(t);
        d.overrides = { tar: '^7.5.22' };
        return JSON.stringify(d, null, 2);
      },
      esperado: 'fixar apenas para o @capacitor/cli',
    },
    {
      nome: 'tar 7 fixado só para o Capacitor',
      arquivo: PACOTE,
      estragar: (t) => {
        const d = JSON.parse(t);
        d.overrides = { '@capacitor/cli': { tar: '^7.5.22' } };
        return JSON.stringify(d, null, 2);
      },
      esperado: 'linha 6',
    },
    {
      nome: 'recurso de cor faltando no colors.xml',
      arquivo: join(RES, 'values', 'colors.xml'),
      estragar: (t) => t.replace(/<color name="colorPrimary">[^<]*<\/color>\n\s*/, ''),
      esperado: '@color/colorPrimary',
    },
    {
      nome: 'ícone do modelo do Capacitor',
      arquivo: join(RES, 'mipmap-anydpi-v26', 'ic_launcher.xml'),
      estragar: (t) => t.replace('@drawable/ic_launcher_foreground', '@drawable/icone_que_nao_existe'),
      esperado: '@drawable/icone_que_nao_existe',
    },
    {
      nome: 'splash com imagem vetorial dentro de <bitmap>',
      arquivo: join(RES, 'drawable-v23', 'splash.xml'),
      estragar: (t) =>
        t.replace(
          '<item android:drawable="@drawable/splash_escudo" android:gravity="center" />',
          '<item><bitmap android:src="@drawable/splash_escudo" android:gravity="center" /></item>',
        ),
      esperado: 'recusa imagem vetorial',
    },
    {
      nome: 'manifesto sem ícone redondo',
      arquivo: MANIFEST,
      estragar: (t) => t.replace(/\s*android:roundIcon="[^"]*"/, ''),
      esperado: 'ícone redondo',
    },
    {
      nome: 'Capacitor apontando para a pasta errada',
      arquivo: join(RAIZ, 'capacitor.config.ts'),
      estragar: (t) => t.replace("webDir: 'dist'", "webDir: 'build'"),
      esperado: 'pasta',
    },
  ];

  let problemas = 0;
  for (const caso of CASOS) {
    const original = ler(caso.arquivo);
    const estragado = caso.estragar(original);
    if (estragado === original) {
      console.error(`✗ ${caso.nome}: o defeito não chegou a ser injetado`);
      problemas += 1;
      continue;
    }
    writeFileSync(caso.arquivo, estragado, 'utf8');
    let saida = '';
    let reprovou = false;
    try {
      execFileSync(process.execPath, [join(RAIZ, 'tests', 'check-android.mjs')], { encoding: 'utf8', stdio: 'pipe' });
    } catch (erro) {
      reprovou = true;
      saida = `${erro.stdout ?? ''}${erro.stderr ?? ''}`;
    } finally {
      writeFileSync(caso.arquivo, original, 'utf8');
    }
    if (!reprovou) {
      console.error(`✗ ${caso.nome}: a verificação PASSOU com o defeito no lugar — é ela que está quebrada`);
      problemas += 1;
      continue;
    }
    if (!saida.includes(caso.esperado)) {
      console.error(`✗ ${caso.nome}: reprovou por outro motivo. Esperado citar "${caso.esperado}"`);
      problemas += 1;
      continue;
    }
    console.log(`✓ ${caso.nome} → reprovado pelo motivo certo`);
  }

  execFileSync(process.execPath, [join(RAIZ, 'tests', 'check-android.mjs')], { stdio: 'inherit' });
  if (problemas > 0) {
    console.error(`\n${problemas} defeito(s) que a verificação do Android não pega.`);
    process.exit(1);
  }
  console.log(`\n✓ ${CASOS.length} defeitos injetados: todos pegos`);
}

if (falhas > 0) {
  console.error(`\n${falhas} problema(s) no projeto Android.`);
  process.exit(1);
}
console.log('✓ projeto Android conferido: Capacitor funcionando, recursos do tema existindo, ícone e abertura do SIFAU');

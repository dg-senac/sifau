// ============================================================================
// SIFAU — Verificação da publicação do APK (passo 15)
// ============================================================================
// Esta verificação existe por causa de uma família de defeito que não aparece em
// teste de tela: o APK que **instala**, **abre** e mesmo assim está errado.
//
//   * sem chave de assinatura, o APK de publicação sai sem assinatura e o
//     aparelho recusa instalar ("aplicativo não instalado") sem dizer por quê;
//   * com `versionCode` que não cresce, o aparelho recusa a ATUALIZAÇÃO por
//     cima — e o fiscal que já tem o aplicativo fica preso na versão antiga;
//   * com o número certo no nome do arquivo e errado por dentro, a Release
//     publica um APK que parece a versão nova e não é;
//   * com a chave privada versionada por descuido, qualquer pessoa que clone o
//     repositório pode assinar um aplicativo em nome do órgão — e isso não se
//     desfaz apagando o arquivo depois.
//
// Uso:
//   node tests/check-release.mjs              → confere
//   node tests/check-release.mjs --negativos  → injeta defeitos e confere que são pegos
// ============================================================================

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CAMINHO_BUILD_GRADLE, aplicarVersao, versaoAtual, versionCodeDe } from '../assets/android/versao.mjs';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORKFLOW = join(RAIZ, '.github', 'workflows', 'build-apk.yml');
const GITIGNORE_ANDROID = join(RAIZ, 'android', '.gitignore');
const VERSAO_MJS = join(RAIZ, 'assets', 'android', 'versao.mjs');

let falhas = 0;
function conferir(condicao, mensagem, detalhe = '') {
  if (condicao) return;
  console.error(`✗ ${mensagem}${detalhe ? `\n    ${detalhe}` : ''}`);
  falhas += 1;
}

// ────────────────────────────────────────────────────────────────────────────
// 1. A regra do versionCode — a parte que dá para provar sem Android
// ────────────────────────────────────────────────────────────────────────────
{
  // A ordem dos números tem de ser a mesma ordem da versão. Comparar "1.10.0"
  // com "1.9.0" como texto daria errado; a conta tem de dar certo.
  const series = ['1.0.0', '1.0.1', '1.2.0', '1.9.0', '1.10.0', '1.11.0', '2.0.0', '2.0.1', '10.0.0'];
  for (let i = 1; i < series.length; i += 1) {
    const anterior = versionCodeDe(series[i - 1]);
    const seguinte = versionCodeDe(series[i]);
    conferir(
      seguinte > anterior,
      `a versão ${series[i]} não gera um número maior que ${series[i - 1]}`,
      `${seguinte} vs ${anterior} — o aparelho recusaria a atualização por cima`,
    );
  }

  // "1.2" é aceito de propósito e vale como 1.2.0; o resto é entrada errada e
  // precisa ser recusada em vez de virar número torto.
  const aceitas = { '1.2': 10200, 'v1.2.0': 10200, '1.0.0': 10000 };
  for (const [entrada, esperado] of Object.entries(aceitas)) {
    let obtido = null;
    try {
      obtido = versionCodeDe(entrada);
    } catch {
      /* a conferência abaixo reprova */
    }
    conferir(obtido === esperado, `a versão "${entrada}" devia valer ${esperado} e valeu ${obtido}`);
  }

  for (const entrada of ['abc', '', '1.-1.0', '1.2.100', '1.2.3.4.5', '1.2.x']) {
    let recusou = false;
    try {
      versionCodeDe(entrada);
    } catch {
      recusou = true;
    }
    conferir(recusou, `a versão inválida "${entrada || '(vazia)'}" foi aceita`);
  }

  // Escrever a versão duas vezes precisa dar o mesmo arquivo, senão o build
  // muda de resultado conforme quantas vezes rodou — e a publicação que roda
  // duas vezes (retentativa, reenvio da etiqueta) quebraria.
  const original = readFileSync(CAMINHO_BUILD_GRADLE, 'utf8');
  let uma = null;
  let duas = null;
  try {
    uma = aplicarVersao('3.4.5', original);
    duas = aplicarVersao('3.4.5', uma);
  } catch (erro) {
    // Reprovado, e não estouro de tela: uma verificação que quebra em vez de
    // dizer o que está errado deixa o próximo leitor sem saber onde olhar.
    conferir(false, 'não consegui aplicar a versão duas vezes seguidas', String(erro?.message ?? erro));
  }
  if (uma !== null && duas !== null) {
    conferir(uma === duas, 'escrever a versão duas vezes seguidas muda o arquivo');
    const atual = versaoAtual(uma);
    conferir(
      atual.nome === '3.4.5' && atual.codigo === 30405,
      'a versão gravada no build.gradle não confere',
      JSON.stringify(atual),
    );
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 2. Assinatura no build.gradle
// ────────────────────────────────────────────────────────────────────────────
{
  const gradle = readFileSync(CAMINHO_BUILD_GRADLE, 'utf8');
  conferir(/signingConfigs\s*\{/.test(gradle), 'o build.gradle não tem configuração de assinatura');
  conferir(
    /keystore\.properties/.test(gradle),
    'o build.gradle não lê a chave de assinatura de keystore.properties',
  );
  conferir(
    /temChaveDeRelease/.test(gradle) && /if\s*\(temChaveDeRelease\)\s*\{\s*signingConfig/.test(gradle.replace(/\n\s*/g, ' ')),
    'o build.gradle não usa a chave só quando ela existe: sem a chave, o build de release quebraria',
  );
  conferir(
    /versionCode\s+\d+/.test(gradle) && /versionName\s+"[^"]+"/.test(gradle),
    'faltam versionCode/versionName no build.gradle',
  );
}

// ────────────────────────────────────────────────────────────────────────────
// 3. A chave privada não pode estar no Git
// ────────────────────────────────────────────────────────────────────────────
{
  const ignores = readFileSync(GITIGNORE_ANDROID, 'utf8');
  for (const padrao of ['*.jks', '*.keystore', 'keystore.properties']) {
    conferir(
      new RegExp(`^${padrao.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm').test(ignores) ||
        ignores.split('\n').some((linha) => linha.trim() === padrao),
      `android/.gitignore não ignora ${padrao}: a chave de assinatura pode entrar no Git`,
    );
  }

  // A prova que importa: o Git não pode conhecer nenhum arquivo de chave.
  const rastreados = execFileSync('git', ['ls-files'], { cwd: RAIZ, encoding: 'utf8' })
    .split('\n')
    .filter((caminho) => /\.(jks|keystore|p12|pfx)$/.test(caminho) || /keystore\.properties$/.test(caminho));
  conferir(
    rastreados.length === 0,
    'há arquivo de chave de assinatura versionado no repositório',
    `${rastreados.join(', ')} — apagar não basta: a chave precisa ser trocada`,
  );
}

// ────────────────────────────────────────────────────────────────────────────
// 4. O workflow de publicação
// ────────────────────────────────────────────────────────────────────────────
{
  const wf = readFileSync(WORKFLOW, 'utf8');

  // Quando roda
  conferir(/workflow_dispatch:/.test(wf), 'o workflow não pode ser disparado à mão');
  conferir(/tags:\s*\['v\*'\]|tags:\s*\["v\*"\]/.test(wf), 'o workflow não roda ao enviar uma etiqueta v*');
  conferir(
    !/^\s*branches(-ignore)?:/m.test(wf),
    'o workflow publica a cada envio para um ramo: publicar precisa ser decisão, não efeito colateral',
  );
  conferir(/concurrency:/.test(wf), 'sem controle de concorrência, dois builds podem publicar a mesma etiqueta ao mesmo tempo');
  conferir(/contents:\s*write/.test(wf), 'sem permissão de escrita em contents, a Release não é publicada');

  // Node: a construção lê .ts direto (marca), o que exige Node 22
  const node = /node-version:\s*(\S+)/.exec(wf)?.[1] ?? '';
  conferir(
    /^\s*22/.test(node) || /^\s*['"]?2[2-9]/.test(node),
    `o workflow usa Node ${node || '?'}: a construção lê arquivos .ts direto (src/lib/marca.ts) e precisa do Node 22.18+`,
  );

  // Segredos obrigatórios e nada de service_role
  conferir(/secrets\.VITE_SUPABASE_URL/.test(wf), 'o workflow não verifica VITE_SUPABASE_URL');
  conferir(/secrets\.VITE_SUPABASE_ANON_KEY/.test(wf), 'o workflow não verifica VITE_SUPABASE_ANON_KEY');
  conferir(
    !/SERVICE_ROLE/.test(wf),
    'o workflow menciona service_role: essa chave dá acesso total ao banco e nunca pode entrar no aplicativo',
  );

  // Assinatura
  conferir(
    /secrets\.ANDROID_KEYSTORE_BASE64/.test(wf),
    'o workflow não usa o segredo da chave de assinatura (citar o nome num comentário não assina nada)',
  );
  for (const segredo of ['ANDROID_KEYSTORE_PASSWORD', 'ANDROID_KEY_ALIAS', 'ANDROID_KEY_PASSWORD']) {
    conferir(new RegExp(`secrets\\.${segredo}`).test(wf), `o workflow não usa o segredo ${segredo}`);
  }
  conferir(
    /assembleRelease/.test(wf) && /assembleDebug/.test(wf),
    'o workflow precisa gerar o APK de publicação e saber cair para o de teste quando não há chave',
  );
  conferir(
    /printf 'storeFile=/.test(wf),
    'a chave é gravada sem `printf`: heredoc dentro de YAML carrega indentação para dentro do arquivo',
  );
  conferir(
    /storeFile=\$\{?\(?pwd\)?\}?|\$\(pwd\)\/android\//.test(wf),
    'o caminho da chave não é absoluto: o Gradle resolve caminho relativo a partir de android/app',
  );

  // Não vazar segredo para o log
  const linhasComSegredo = wf
    .split('\n')
    .filter((linha) => /echo/.test(linha) && /SENHA_|PASSWORD|CHAVE_BASE64/.test(linha));
  conferir(
    linhasComSegredo.length === 0,
    'o workflow imprime uma senha no log de execução',
    linhasComSegredo.join(' | '),
  );

  // Conferência do APK gerado — por dentro do arquivo, não pelo nome
  conferir(/aapt2/.test(wf), 'o workflow não confere o conteúdo do APK gerado');
  for (const campo of ['versionName', 'versionCode', 'package: name']) {
    conferir(
      new RegExp(campo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(wf),
      `o workflow não confere o ${campo} do APK gerado`,
    );
  }
  conferir(/--codigo/.test(wf), 'o workflow não compara o versionCode do APK com o esperado');

  // Publicação
  conferir(/gh release create/.test(wf) && /gh release upload/.test(wf), 'o workflow não publica a Release com o arquivo');
  conferir(/sha256sum/.test(wf), 'o workflow não publica a impressão digital do APK');
  conferir(
    /--clobber/.test(wf),
    'refazer a publicação da mesma versão sem `--clobber` falharia por arquivo já existente',
  );
  conferir(
    /npx cap sync android/.test(wf),
    'o workflow não sincroniza o Capacitor: o APK sairia com a versão anterior do site',
  );
  conferir(
    /water|Sem a chave de assinatura|::warning/.test(wf),
    'o workflow não avisa quando o APK sai sem chave de publicação',
  );
  conferir(
    /::error::/.test(wf),
    'o workflow não falha com mensagem clara: erro silencioso em publicação é o pior dos casos',
  );
}

// ────────────────────────────────────────────────────────────────────────────
// 5. Prova dos negativos (opcional) — cada defeito injetado precisa ser pego
// ────────────────────────────────────────────────────────────────────────────
if (process.argv.includes('--negativos')) {
  const casos = [
    {
      nome: 'workflow com Node 20 (a construção quebraria)',
      arquivo: WORKFLOW,
      estragar: (t) => t.replace('node-version: 22', 'node-version: 20'),
      esperado: 'precisa do Node 22.18',
    },
    {
      nome: 'workflow publicando a cada envio para um ramo',
      arquivo: WORKFLOW,
      estragar: (t) => t.replace("    tags: ['v*']", '    tags: [\'v*\']\n    branches: [main]'),
      esperado: 'publicar precisa ser decisão',
    },
    {
      nome: 'workflow sem a chave de assinatura',
      arquivo: WORKFLOW,
      estragar: (t) => t.replaceAll('ANDROID_KEYSTORE_BASE64', 'ANDROID_CHAVE_INEXISTENTE'),
      esperado: 'não usa o segredo da chave de assinatura',
    },
    {
      nome: 'workflow assinando sem conferir o APK gerado',
      arquivo: WORKFLOW,
      estragar: (t) => t.replace(/aapt2/g, 'ferramenta-ausente'),
      esperado: 'não confere o conteúdo do APK',
    },
    {
      nome: 'workflow imprimindo a senha do cofre no log',
      arquivo: WORKFLOW,
      estragar: (t) => t.replace('echo "Chave de assinatura preparada."', 'echo "senha: $SENHA_COFRE"'),
      esperado: 'imprime uma senha no log',
    },
    {
      nome: 'workflow sem controle de concorrência',
      arquivo: WORKFLOW,
      estragar: (t) => t.replace(/concurrency:\n  group: apk-\$\{\{ github\.ref \}\}\n  cancel-in-progress: false\n/, ''),
      esperado: 'controle de concorrência',
    },
    {
      nome: 'workflow com caminho relativo para a chave',
      arquivo: WORKFLOW,
      estragar: (t) => t.replace('"$(pwd)/android/sifau-release.jks"', '"android/sifau-release.jks"'),
      esperado: 'não é absoluto',
    },
    {
      nome: 'build.gradle sem configuração de assinatura',
      arquivo: CAMINHO_BUILD_GRADLE,
      estragar: (t) => t.replace(/signingConfigs \{/, 'assinaturas {'),
      esperado: 'não tem configuração de assinatura',
    },
    {
      nome: 'chave de assinatura liberada no .gitignore',
      arquivo: GITIGNORE_ANDROID,
      estragar: (t) => t.replace(/^\*\.jks$/m, '#*.jks'),
      esperado: 'não ignora *.jks',
    },
    {
      nome: 'regra de versionCode que não cresce',
      arquivo: VERSAO_MJS,
      // A regra vira uma soma simples: "1.10.0" passaria a valer menos que
      // "1.9.0", e o aparelho recusaria a atualização por cima.
      estragar: (t) => t.replace('return a * 10000 + b * 100 + c;', 'return a + b + c;'),
      esperado: 'não gera um número maior',
    },
    {
      nome: 'regra que aceita versão com número a mais',
      arquivo: VERSAO_MJS,
      estragar: (t) => t.replace('if (partes.length > 3) {', 'if (false) {'),
      esperado: 'foi aceita',
    },
    {
      nome: 'gravação da versão que não é idempotente',
      arquivo: VERSAO_MJS,
      estragar: (t) => t.replace('return comCodigo;', "if (comCodigo === texto) throw new Error('nao mudou');\n  return comCodigo;"),
      esperado: 'aplicar a versão duas vezes',
    },
  ];

  let problemas = 0;
  for (const caso of casos) {
    const original = readFileSync(caso.arquivo, 'utf8');
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
      execFileSync(process.execPath, [join(RAIZ, 'tests', 'check-release.mjs')], { encoding: 'utf8', stdio: 'pipe' });
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
    if (caso.esperado && !saida.includes(caso.esperado)) {
      console.error(`✗ ${caso.nome}: reprovou por outro motivo. Esperado citar "${caso.esperado}"`);
      problemas += 1;
      continue;
    }
    console.log(`✓ ${caso.nome} → reprovado pelo motivo certo`);
  }

  execFileSync(process.execPath, [join(RAIZ, 'tests', 'check-release.mjs')], { stdio: 'inherit' });
  if (problemas > 0) {
    console.error(`\n${problemas} defeito(s) que a verificação de publicação não pega.`);
    process.exit(1);
  }
  console.log(`\n✓ ${casos.length} defeitos injetados: todos pegos`);
}

if (falhas > 0) {
  console.error(`\n${falhas} problema(s) na publicação do APK.`);
  process.exit(1);
}
console.log('✓ publicação do APK conferida: versão que cresce, assinatura, chave fora do Git e Release com impressão digital');

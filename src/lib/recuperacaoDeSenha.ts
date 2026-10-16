// ============================================================================
// SIFAU — Recuperação de senha: a parte que não fala com a rede
// ============================================================================
// Um link de recuperação chega no e-mail e volta para o aplicativo com o token
// no endereço (`#access_token=...&type=recovery`), ou com o motivo da recusa
// (`#error=access_denied&error_code=otp_expired`). Ler isso é chato, tem caso de
// canto (token no `#` ou no `?`) e é onde o erro passa despercebido: se o app
// ignorar o `error_code`, o fiscal fica olhando uma tela de login sem saber que
// o link venceu.
//
// Por isso esta leitura mora aqui, separada das telas e do Supabase: é função
// pura, tem teste (`tests/unit/recuperacao.test.mjs`) e roda sem navegador.
// ============================================================================

/** Mínimo de caracteres da senha — o mesmo que o cadastro exige. */
export const TAMANHO_MINIMO_DA_SENHA = 12;

export type RecuperacaoNoEndereco =
  | { situacao: 'nenhuma' }
  | { situacao: 'recuperacao'; token: string | null }
  | { situacao: 'erro'; mensagem: string; codigo: string };

/**
 * Chaves que o Supabase devolve no endereço e que são credencial (ou rastro
 * dela). Elas são lidas para decidir a tela e depois apagadas do endereço: um
 * token de acesso parado na barra de endereço fica no histórico do navegador,
 * no print que alguém tira e no link que alguém copia.
 */
const CHAVES_DE_CREDENCIAL = [
  'access_token',
  'refresh_token',
  'expires_in',
  'expires_at',
  'token_type',
  'provider_token',
  'code',
  'state',
  'type',
  'error',
  'error_code',
  'error_description',
];

/** Mensagem em português para o motivo da recusa. O Supabase responde em inglês. */
export function mensagemDoErroDeLink(codigo: string): string {
  switch (codigo) {
    case 'otp_expired':
      return 'Este link de recuperação expirou ou já foi usado. Peça um novo link.';
    case 'access_denied':
      return 'O link de recuperação não foi aceito. Peça um novo link.';
    case 'otp_disabled':
      return 'A recuperação por e-mail está desativada no projeto. Fale com a administração.';
    default:
      return 'Não foi possível usar este link de recuperação. Peça um novo link.';
  }
}

function parametrosDoEndereco({ hash, search }: { hash?: string; search?: string }): URLSearchParams {
  // O token do fluxo implícito vem depois do `#`; no fluxo PKCE, depois do `?`.
  const parametros = new URLSearchParams((hash ?? '').replace(/^#/, ''));
  for (const [chave, valor] of new URLSearchParams(search ?? '')) {
    if (!parametros.has(chave)) parametros.append(chave, valor);
  }
  return parametros;
}

/**
 * O que o endereço atual diz sobre recuperação de senha.
 *
 * `nenhuma` é o caso normal (abrir o app). `recuperacao` traz o token quando ele
 * veio no endereço. `erro` traz o motivo da recusa, já em português.
 */
export function lerRecuperacaoDoEndereco(partes: { hash?: string; search?: string }): RecuperacaoNoEndereco {
  const parametros = parametrosDoEndereco(partes);
  const codigoDoErro = parametros.get('error_code') ?? parametros.get('error');

  if (codigoDoErro) {
    const codigo = parametros.get('error_code') ?? 'desconhecido';
    return { situacao: 'erro', codigo, mensagem: mensagemDoErroDeLink(codigo) };
  }

  if (parametros.get('type') === 'recovery') {
    return { situacao: 'recuperacao', token: parametros.get('access_token') };
  }

  return { situacao: 'nenhuma' };
}

/**
 * O mesmo endereço, sem as chaves de credencial.
 *
 * Mantém o resto da consulta e do fragmento: se um dia o app usar `?tela=...`,
 * a limpeza não pode levar junto.
 */
export function urlSemCredenciais(url: string): string {
  const partes = new URL(url);

  for (const chave of CHAVES_DE_CREDENCIAL) partes.searchParams.delete(chave);

  const doHash = new URLSearchParams(partes.hash.replace(/^#/, ''));
  for (const chave of CHAVES_DE_CREDENCIAL) doHash.delete(chave);

  const consulta = partes.searchParams.toString();
  const fragmento = doHash.toString();

  return [
    partes.origin,
    partes.pathname,
    consulta ? `?${consulta}` : '',
    fragmento ? `#${fragmento}` : '',
  ].join('');
}

/**
 * Confere a nova senha. Devolve a mensagem do problema, ou `null` se está ok.
 *
 * As regras são as que o aplicativo já cobra no cadastro. Não invento exigência
 * nova aqui: senha que o cadastro aceita e a troca recusa é o tipo de
 * inconsistência que faz o usuário achar que o app está quebrado.
 */
export function validarNovaSenha({
  senha,
  confirmacao,
  senhaAtual,
}: {
  senha: string;
  confirmacao: string;
  senhaAtual?: string;
}): string | null {
  if (senha.length < TAMANHO_MINIMO_DA_SENHA) {
    return `A senha precisa ter pelo menos ${TAMANHO_MINIMO_DA_SENHA} caracteres.`;
  }
  if (senha !== confirmacao) {
    return 'As duas senhas não são iguais.';
  }
  if (senhaAtual && senha === senhaAtual) {
    return 'A nova senha precisa ser diferente da atual.';
  }
  return null;
}

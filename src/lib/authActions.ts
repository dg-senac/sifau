// ============================================================================
// SIFAU — Tudo que fala com a autenticação do Supabase
// ============================================================================
// Um lugar só para: encerrar sessão, pedir o link de recuperação, definir uma
// senha nova (link aberto) e trocar a senha com a sessão em uso. As telas
// desenham; elas não chamam `supabase.auth` diretamente.
//
// As mensagens de erro em português também moram aqui, porque o Supabase
// responde em inglês e cada tela traduzindo do seu jeito é como o app acaba com
// três textos diferentes para o mesmo problema.
// ============================================================================

import { supabase } from '@/lib/supabase';
import { unregisterPush } from '@/lib/push';

export type ErroDeAuth = {
  code?: string;
  message?: string;
  name?: string;
  status?: number;
};

/** Remove o token do dispositivo enquanto a sessão ainda pode autorizá-lo. */
export async function signOut() {
  await unregisterPush();
  return supabase.auth.signOut();
}

export function logAuthError(operacao: string, error: unknown, valoresSensiveis: string[]) {
  if (!import.meta.env.DEV) return;

  const detalhes = (typeof error === 'object' && error !== null ? error : {}) as ErroDeAuth;
  let message = detalhes.message ?? String(error);
  for (const valor of valoresSensiveis) {
    if (valor) message = message.split(valor).join('[redigido]');
  }
  console.error(`[SIFAU] Falha em ${operacao}`, {
    code: detalhes.code,
    message,
    name: detalhes.name,
    status: detalhes.status,
  });
}

/** Mensagem em português para um erro de autenticação. */
export function getAuthErrorMessage(error: ErroDeAuth) {
  const message = `${error.code ?? ''} ${error.message ?? ''}`.toLowerCase();

  if (
    message.includes('invalid email') ||
    message.includes('email address is invalid') ||
    message.includes('unable to validate email') ||
    message.includes('email_invalid')
  ) {
    return 'Informe um endereço de e-mail válido.';
  }
  if (
    message.includes('weak password') ||
    message.includes('password should be at least') ||
    message.includes('password must be at least') ||
    message.includes('password is too short') ||
    message.includes('password_not_strong_enough')
  ) {
    return 'A senha não atende aos requisitos de segurança. Escolha uma senha mais forte.';
  }
  if (
    message.includes('already registered') ||
    message.includes('already been registered') ||
    message.includes('user_already_exists') ||
    message.includes('email_exists')
  ) {
    return 'Este e-mail já está cadastrado.';
  }
  if (message.includes('invalid login credentials')) {
    return 'E-mail ou senha inválidos.';
  }
  if (message.includes('session') && message.includes('not found')) {
    return 'Sua sessão expirou. Entre novamente com a senha atual.';
  }
  if (error.status === 429) {
    return 'Muitas tentativas. Aguarde um pouco e tente novamente.';
  }
  if (
    error.status === 401 ||
    error.status === 403 ||
    error.status === 404 ||
    message.includes('invalid api key') ||
    message.includes('signup is disabled')
  ) {
    return 'Não foi possível conectar à autenticação do SIFAU. Verifique a configuração do Supabase.';
  }
  if (message.includes('fetch') || message.includes('network') || error.status === 0) {
    return 'Falha de conexão. Verifique sua internet e tente novamente.';
  }

  return 'Não foi possível concluir a solicitação. Tente novamente.';
}

/**
 * Endereço para onde o link do e-mail deve voltar.
 *
 * Vem de `VITE_APP_URL` porque dentro do aplicativo instalado (Capacitor) o
 * endereço é `http://localhost`: apontar o link para lá levaria o fiscal para
 * uma página em branco no próprio telefone. Sem a variável e fora do navegador,
 * devolvemos `null` — e a tela avisa, em vez de mandar um e-mail inútil.
 */
export function enderecoDeRetorno(): string | null {
  const configurado = import.meta.env.VITE_APP_URL?.trim();
  if (configurado) return configurado.replace(/\/+$/, '');

  const atual = window.location.origin;
  return /^https?:/.test(window.location.protocol) && atual ? `${atual}/` : null;
}

/**
 * Pede o e-mail de recuperação.
 *
 * O Supabase não diz se o e-mail existe (resposta igual para conta e para
 * endereço desconhecido) — e isso é bom: a tela não vira um consultor de quem
 * tem conta no sistema.
 */
export async function solicitarRecuperacaoDeSenha(email: string) {
  const retorno = enderecoDeRetorno();
  if (!retorno) {
    return {
      error: {
        message: 'recovery_url_not_configured',
        code: 'recovery_url_not_configured',
      } as ErroDeAuth,
    };
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: retorno });
  if (error) logAuthError('recuperação de senha', error, [email]);
  return { error: (error ?? null) as ErroDeAuth | null };
}

/** Define a senha de quem chegou pelo link de recuperação (já tem sessão). */
export async function definirNovaSenha(senha: string) {
  const { error } = await supabase.auth.updateUser({ password: senha });
  if (error) logAuthError('definição de nova senha', error, [senha]);
  return { error: (error ?? null) as ErroDeAuth | null };
}

/**
 * Troca a senha com a sessão em uso, exigindo a senha atual.
 *
 * O Supabase aceitaria trocar a senha só com a sessão. Pedimos a senha atual de
 * novo de propósito: sessão aberta num aparelho emprestado não deve bastar para
 * tomar a conta.
 *
 * Depois de trocar, encerra as OUTRAS sessões: se a senha foi trocada porque
 * alguém mais tinha acesso, é isso que derruba o acesso.
 */
export async function trocarSenhaComSenhaAtual({
  email,
  senhaAtual,
  novaSenha,
}: {
  email: string;
  senhaAtual: string;
  novaSenha: string;
}) {
  const { error: erroDeSenha } = await supabase.auth.signInWithPassword({
    email,
    password: senhaAtual,
  });
  if (erroDeSenha) {
    logAuthError('confirmação da senha atual', erroDeSenha, [email, senhaAtual]);
    return { error: erroDeSenha as ErroDeAuth, senhaAtualIncorreta: true, erroAoEncerrarOutras: null };
  }

  const { error } = await supabase.auth.updateUser({ password: novaSenha });
  if (error) {
    logAuthError('troca de senha', error, [novaSenha]);
    return { error: error as ErroDeAuth, senhaAtualIncorreta: false, erroAoEncerrarOutras: null };
  }

  const { error: erroAoEncerrar } = await supabase.auth.signOut({ scope: 'others' });
  if (erroAoEncerrar) {
    console.error('Senha trocada, mas não foi possível encerrar as outras sessões:', erroAoEncerrar);
  }

  return { error: null, senhaAtualIncorreta: false, erroAoEncerrarOutras: erroAoEncerrar ?? null };
}

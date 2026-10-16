// ============================================================================
// SIFAU — Testes da leitura do link de recuperação de senha
// ============================================================================
// O que se testa aqui é o que decidia entre "definir senha nova" e "o link
// venceu" — e o que sobrava no endereço depois disso. É a parte do fluxo de
// recuperação que dá para provar sem Supabase, sem e-mail e sem navegador.
//
// Roda com `npm run test:unit` (Node com remoção de tipos, sem build).
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  TAMANHO_MINIMO_DA_SENHA,
  lerRecuperacaoDoEndereco,
  mensagemDoErroDeLink,
  urlSemCredenciais,
  validarNovaSenha,
} from '../../src/lib/recuperacaoDeSenha.ts';

test('endereço comum não é confundido com recuperação', () => {
  assert.deepEqual(lerRecuperacaoDoEndereco({}), { situacao: 'nenhuma' });
  assert.deepEqual(lerRecuperacaoDoEndereco({ hash: '', search: '' }), { situacao: 'nenhuma' });
  // O app não usa rota no fragmento hoje, mas se um dia usar, isso não pode
  // virar "link de recuperação".
  assert.deepEqual(lerRecuperacaoDoEndereco({ hash: '#/ocorrencias/12' }), { situacao: 'nenhuma' });
});

test('link do fluxo implícito traz o token', () => {
  const lido = lerRecuperacaoDoEndereco({
    hash: '#access_token=TOKEN123&refresh_token=REFRESH&expires_in=3600&token_type=bearer&type=recovery',
  });
  assert.equal(lido.situacao, 'recuperacao');
  assert.equal(lido.token, 'TOKEN123');
});

test('link do fluxo PKCE também é reconhecido', () => {
  const lido = lerRecuperacaoDoEndereco({ search: '?code=abc123&type=recovery' });
  assert.equal(lido.situacao, 'recuperacao');
  assert.equal(lido.token, null, 'sem token no endereço: quem troca o código é o supabase-js');
});

test('link recusado vira mensagem em português, não em inglês', () => {
  const lido = lerRecuperacaoDoEndereco({
    hash: '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
  });
  assert.equal(lido.situacao, 'erro');
  assert.equal(lido.codigo, 'otp_expired');
  assert.match(lido.mensagem, /expirou/);
  assert.doesNotMatch(lido.mensagem, /Email link is invalid/, 'o texto do Supabase não vai para a tela');
});

test('recusa também chega pela consulta da URL', () => {
  const lido = lerRecuperacaoDoEndereco({ search: '?error_code=otp_expired' });
  assert.equal(lido.situacao, 'erro');
  assert.equal(lido.codigo, 'otp_expired');
});

test('código desconhecido não deixa o fiscal sem explicação', () => {
  const mensagem = mensagemDoErroDeLink('algo_novo_do_supabase');
  assert.match(mensagem, /Peça um novo link/);
  assert.doesNotMatch(mensagem, /algo_novo_do_supabase/, 'código interno não aparece para o usuário');
});

test('o endereço fica sem credencial depois de lido', () => {
  const limpo = urlSemCredenciais(
    'https://app.sifau.gov.br/?tela=inicio#access_token=TOKEN&refresh_token=REFRESH&type=recovery',
  );
  assert.equal(limpo, 'https://app.sifau.gov.br/?tela=inicio');
  assert.doesNotMatch(limpo, /TOKEN|REFRESH/, 'token não sobra no histórico do navegador');
});

test('a limpeza preserva o que não é credencial', () => {
  assert.equal(
    urlSemCredenciais('https://app.sifau.gov.br/relatorio#secao=2'),
    'https://app.sifau.gov.br/relatorio#secao=2',
  );
  assert.equal(
    urlSemCredenciais('https://app.sifau.gov.br/?code=abc&tela=mapa'),
    'https://app.sifau.gov.br/?tela=mapa',
  );
});

test('a senha nova é conferida antes de falar com o Supabase', () => {
  assert.match(
    validarNovaSenha({ senha: 'curta', confirmacao: 'curta' }),
    new RegExp(`pelo menos ${TAMANHO_MINIMO_DA_SENHA}`),
  );
  assert.equal(
    validarNovaSenha({ senha: 'a'.repeat(TAMANHO_MINIMO_DA_SENHA), confirmacao: 'b'.repeat(TAMANHO_MINIMO_DA_SENHA) }),
    'As duas senhas não são iguais.',
  );
  assert.equal(
    validarNovaSenha({
      senha: 'senha-repetida-123',
      confirmacao: 'senha-repetida-123',
      senhaAtual: 'senha-repetida-123',
    }),
    'A nova senha precisa ser diferente da atual.',
  );
  assert.equal(
    validarNovaSenha({ senha: 'senha-nova-98765', confirmacao: 'senha-nova-98765' }),
    null,
  );
});

test('a senha mínima acompanha o cadastro', () => {
  // Se este número mudar, o cadastro precisa mudar junto: senha que o cadastro
  // aceita e a troca recusa faz o usuário achar que o app está quebrado.
  assert.equal(TAMANHO_MINIMO_DA_SENHA, 12);
});

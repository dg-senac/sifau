// ============================================================================
// SIFAU — Definir nova senha (chegada pelo link do e-mail)
// ============================================================================
// Uma tela, três situações, e as três precisam existir:
//
//   1. link válido   → o fiscal define a senha nova e entra;
//   2. link recusado → o motivo (vencido, já usado) aparece em português, com o
//                      caminho para pedir outro — sem isso o fiscal fica
//                      olhando uma tela de login sem entender o que houve;
//   3. senha trocada → confirmação e entrada.
//
// Não é modal nem aviso dentro do app de propósito: quem abre o link ainda não
// está dentro, e a única coisa que ele pode fazer aqui é trocar a senha.
// ============================================================================

import { FormEvent, useState } from 'react';
import { AlertTriangle, KeyRound, Loader2, MailCheck } from 'lucide-react';
import {
  definirNovaSenha, getAuthErrorMessage, signOut, solicitarRecuperacaoDeSenha,
} from '@/lib/authActions';
import { SifauMarcaVertical } from '@/components/Logo';
import { TAMANHO_MINIMO_DA_SENHA, validarNovaSenha } from '@/lib/recuperacaoDeSenha';

type NovaSenhaScreenProps = {
  /** Motivo da recusa do link, quando o endereço trouxe um. */
  problema: string | null;
  /** E-mail da sessão aberta pelo link, para pré-preencher o pedido de novo link. */
  email: string | null;
  /** Chamado quando a recuperação terminou (ou o fiscal desistiu dela). */
  onConcluir: () => void;
};

export function NovaSenhaScreen({ problema, email, onConcluir }: NovaSenhaScreenProps) {
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [pronta, setPronta] = useState(false);
  const [pedidoPara, setPedidoPara] = useState(email ?? '');
  const [pedidoEnviado, setPedidoEnviado] = useState('');

  const salvar = async (event: FormEvent) => {
    event.preventDefault();
    setMessage('');

    const problemaNaSenha = validarNovaSenha({ senha, confirmacao });
    if (problemaNaSenha) {
      setMessage(problemaNaSenha);
      return;
    }

    setBusy(true);
    const { error } = await definirNovaSenha(senha);
    setBusy(false);

    if (error) {
      setMessage(getAuthErrorMessage(error));
      return;
    }
    setSenha('');
    setConfirmacao('');
    setPronta(true);
  };

  const pedirOutroLink = async (event: FormEvent) => {
    event.preventDefault();
    setMessage('');

    const para = pedidoPara.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(para)) {
      setMessage('Informe um endereço de e-mail válido.');
      return;
    }

    setBusy(true);
    const { error } = await solicitarRecuperacaoDeSenha(para);
    setBusy(false);

    if (error) {
      setMessage(
        error.code === 'recovery_url_not_configured'
          ? 'A recuperação por e-mail ainda não está configurada neste aplicativo (falta o endereço público do app).'
          : getAuthErrorMessage(error),
      );
      return;
    }
    setPedidoEnviado(para);
  };

  const sair = async () => {
    await signOut();
    onConcluir();
  };

  return (
    <div className="auth-page">
      <div className="auth-brand">
        <SifauMarcaVertical largura={158} className="auth-marca" />
      </div>

      <div className="auth-card">
        {pronta ? (
          <>
            <h2>Senha alterada</h2>
            <p className="muted">
              A nova senha já vale para este acesso. Os outros aparelhos que estavam
              conectados precisarão entrar de novo.
            </p>
            <button className="primary-button full" onClick={onConcluir}>
              Entrar no SIFAU
            </button>
          </>
        ) : problema ? (
          <>
            <h2>O link não serve mais</h2>
            <div className="form-message">
              <AlertTriangle size={16} />
              {problema}
            </div>
            <form onSubmit={pedirOutroLink}>
              <label>
                E-mail do cadastro
                <input
                  required
                  type="email"
                  value={pedidoPara}
                  onChange={(e) => setPedidoPara(e.target.value)}
                  placeholder="fiscal@prefeitura.gov.br"
                />
              </label>
              {message && (
                <div className="form-message">
                  <AlertTriangle size={16} />
                  {message}
                </div>
              )}
              {pedidoEnviado && (
                <div className="info-message">
                  <MailCheck size={16} />
                  <span>
                    Se existir uma conta com <b>{pedidoEnviado}</b>, o novo link chegou. Ele
                    vale por 1 hora — confira também a caixa de spam.
                  </span>
                </div>
              )}
              <button className="primary-button full" disabled={busy}>
                {busy ? <Loader2 className="spin" size={18} /> : 'Pedir novo link'}
              </button>
            </form>
            <button className="link-button full" type="button" onClick={onConcluir}>
              Voltar para o login
            </button>
          </>
        ) : (
          <>
            <h2>Definir nova senha</h2>
            <p className="muted">
              Você chegou pelo link de recuperação. Escolha a senha nova — ela passa a valer
              neste e nos próximos acessos.
            </p>
            <form onSubmit={salvar}>
              <label>
                Nova senha
                <input
                  required
                  type="password"
                  autoComplete="new-password"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  placeholder={`Pelo menos ${TAMANHO_MINIMO_DA_SENHA} caracteres`}
                />
              </label>
              <label>
                Repita a nova senha
                <input
                  required
                  type="password"
                  autoComplete="new-password"
                  value={confirmacao}
                  onChange={(e) => setConfirmacao(e.target.value)}
                  placeholder="Igual à de cima"
                />
              </label>
              {message && (
                <div className="form-message">
                  <AlertTriangle size={16} />
                  {message}
                </div>
              )}
              <button className="primary-button full" disabled={busy}>
                {busy ? <Loader2 className="spin" size={18} /> : <><KeyRound size={16} /> Salvar nova senha</>}
              </button>
            </form>
            <button className="link-button full" type="button" onClick={() => void sair()}>
              Sair e voltar ao login
            </button>
          </>
        )}
      </div>

      <small className="auth-footer">Acesso restrito a fiscais municipais</small>
    </div>
  );
}

import { FormEvent, useState } from 'react';
import { AlertTriangle, Loader2, MailCheck, ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getAuthErrorMessage, logAuthError, solicitarRecuperacaoDeSenha, type ErroDeAuth } from '@/lib/authActions';
import { TAMANHO_MINIMO_DA_SENHA } from '@/lib/recuperacaoDeSenha';

export function AuthScreen() {
  const [mode, setMode] = useState<'login' | 'signup' | 'recuperar'>('login');
  const [form, setForm] = useState({
    nome: '',
    email: '',
    senha: '',
    telefone: '',
    bairro: '',
    especialidade: '',
  });
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [enviadoPara, setEnviadoPara] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage('');

    const email = form.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setMessage('Informe um endereço de e-mail válido.');
      return;
    }
    if (mode === 'recuperar') {
      setBusy(true);
      const { error } = await solicitarRecuperacaoDeSenha(email);
      setBusy(false);
      if (error) {
        setMessage(
          error.code === 'recovery_url_not_configured'
            ? 'A recuperação por e-mail ainda não está configurada neste aplicativo (falta o endereço público do app). Peça para a administração redefinir sua senha.'
            : getAuthErrorMessage(error),
        );
        return;
      }
      setEnviadoPara(email);
      return;
    }
    if (!form.senha) {
      setMessage('Informe sua senha.');
      return;
    }
    if (mode === 'signup') {
      if (!form.nome.trim() || !form.telefone.trim() || !form.bairro.trim()) {
        setMessage('Preencha nome, telefone e bairro/região.');
        return;
      }
      if (form.senha.length < TAMANHO_MINIMO_DA_SENHA) {
        setMessage(`A senha precisa ter pelo menos ${TAMANHO_MINIMO_DA_SENHA} caracteres.`);
        return;
      }
    }

    setBusy(true);
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password: form.senha,
        });
        if (error) {
          logAuthError('login', error, [email, form.senha]);
          setMessage(getAuthErrorMessage(error));
        }
        return;
      }

      // O trigger do banco cria o perfil fiscal como pendente de aprovação.
      const { data, error } = await supabase.auth.signUp({
        email,
        password: form.senha,
        options: {
          data: {
            nome: form.nome.trim(),
            telefone: form.telefone.trim(),
            bairro: form.bairro.trim(),
            especialidade: form.especialidade.trim() || null,
          },
        },
      });
      if (error) {
        logAuthError('cadastro', error, [email, form.senha]);
        setMessage(getAuthErrorMessage(error));
      } else if (!data.user) {
        setMessage('Não foi possível confirmar a criação da conta. Tente novamente.');
      } else if (!data.session) {
        setMessage('Cadastro recebido. Confirme seu e-mail, se solicitado, e aguarde a aprovação de um administrador.');
      } else {
        setMessage('Cadastro recebido. Seu acesso será liberado após a aprovação de um administrador.');
      }
    } catch (error) {
      logAuthError(mode === 'login' ? 'login' : 'cadastro', error, [email, form.senha]);
      setMessage(getAuthErrorMessage(error as ErroDeAuth));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-brand">
        <div className="brand-mark xl">
          <ShieldCheck size={44} />
        </div>
        <h1>SIFAU</h1>
        <p>Fiscalização urbana inteligente</p>
      </div>
      <div className="auth-card">
        {mode !== 'recuperar' && (
          <div className="auth-tabs">
            <button
              className={mode === 'login' ? 'selected' : ''}
              onClick={() => setMode('login')}
            >
              Entrar
            </button>
            <button
              className={mode === 'signup' ? 'selected' : ''}
              onClick={() => setMode('signup')}
            >
              Criar cadastro
            </button>
          </div>
        )}
        <h2>
          {mode === 'login' && 'Bem-vindo de volta'}
          {mode === 'signup' && 'Cadastro de fiscal'}
          {mode === 'recuperar' && 'Recuperar acesso'}
        </h2>
        <p className="muted">
          {mode === 'login' && 'Acesse sua central de fiscalização.'}
          {mode === 'signup' && 'Preencha seus dados para começar.'}
          {mode === 'recuperar' && 'Informe o e-mail do seu cadastro: enviamos um link para você definir uma senha nova.'}
        </p>
        <form onSubmit={submit}>
          {mode === 'signup' && (
            <>
              <label>
                Nome completo
                <input
                  required
                  value={form.nome}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })}
                  placeholder="Como devemos chamar você?"
                />
              </label>
              <div className="two-fields">
                <label>
                  Telefone
                  <input
                    required
                    value={form.telefone}
                    onChange={(e) => setForm({ ...form, telefone: e.target.value })}
                    placeholder="(00) 00000-0000"
                  />
                </label>
                <label>
                  Bairro/região
                  <input
                    required
                    value={form.bairro}
                    onChange={(e) => setForm({ ...form, bairro: e.target.value })}
                    placeholder="Sua região"
                  />
                </label>
              </div>
              <label>
                Especialidade <span className="optional">opcional</span>
                <input
                  value={form.especialidade}
                  onChange={(e) => setForm({ ...form, especialidade: e.target.value })}
                  placeholder="Ex.: obras e posturas"
                />
              </label>
            </>
          )}
          <label>
            E-mail
            <input
              required
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="fiscal@prefeitura.gov.br"
            />
          </label>
          {mode !== 'recuperar' && (
            <label>
              Senha
              <input
                required
                type="password"
                value={form.senha}
                onChange={(e) => setForm({ ...form, senha: e.target.value })}
                placeholder="Sua senha"
              />
            </label>
          )}
          {message && (
            <div className="form-message">
              <AlertTriangle size={16} />
              {message}
            </div>
          )}
          {enviadoPara && mode === 'recuperar' && (
            <div className="info-message">
              <MailCheck size={16} />
              <span>
                Se existir uma conta com <b>{enviadoPara}</b>, o link de recuperação chegou.
                Ele vale por 1 hora — confira também a caixa de spam.
              </span>
            </div>
          )}
          <button className="primary-button full" disabled={busy}>
            {busy ? (
              <Loader2 className="spin" size={18} />
            ) : mode === 'login' ? (
              'Entrar no SIFAU'
            ) : mode === 'signup' ? (
              'Criar acesso'
            ) : (
              'Enviar link de recuperação'
            )}
          </button>
        </form>
        {mode === 'login' && (
          <button
            className="link-button full"
            type="button"
            onClick={() => {
              setMessage('');
              setEnviadoPara('');
              setMode('recuperar');
            }}
          >
            Esqueci minha senha
          </button>
        )}
        {mode === 'recuperar' && (
          <button
            className="link-button full"
            type="button"
            onClick={() => {
              setMessage('');
              setEnviadoPara('');
              setMode('login');
            }}
          >
            Voltar para o login
          </button>
        )}
      </div>
      <small className="auth-footer">Acesso restrito a fiscais municipais</small>
    </div>
  );
}

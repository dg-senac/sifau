import { FormEvent, useState } from 'react';
import { AlertTriangle, Loader2, ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type AuthErrorDetails = {
  code?: string;
  message?: string;
  name?: string;
  status?: number;
};

function logAuthError(operation: string, error: unknown, sensitiveValues: string[]) {
  if (!import.meta.env.DEV) return;

  const details = (typeof error === 'object' && error !== null ? error : {}) as AuthErrorDetails;
  let message = details.message ?? String(error);
  for (const value of sensitiveValues) {
    if (value) message = message.split(value).join('[redigido]');
  }
  console.error(`[SIFAU] Falha em ${operation}`, {
    code: details.code,
    message,
    name: details.name,
    status: details.status,
  });
}

function getAuthErrorMessage(error: AuthErrorDetails) {
  const message = `${error.code ?? ''} ${error.message ?? ''}`.toLowerCase();

  if (message.includes('email_not_confirmed') || message.includes('email not confirmed')) {
    return 'Confirme seu e-mail antes de entrar.';
  }
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

export function AuthScreen() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
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

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage('');

    const email = form.email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setMessage('Informe um endereço de e-mail válido.');
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
      if (form.senha.length < 6) {
        setMessage('A senha precisa ter pelo menos 6 caracteres.');
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
      } else if (data.session) {
        const { data: profile, error: profileError } = await supabase
          .from('fiscais')
          .select('id')
          .eq('id', data.user.id)
          .maybeSingle();
        if (profileError || !profile) {
          if (profileError) logAuthError('verificação do perfil', profileError, [email, form.senha]);
          setMessage('A conta foi criada, mas o perfil fiscal não foi confirmado. Procure o suporte antes de tentar novo cadastro.');
        }
      } else {
        setMessage('Cadastro criado. Verifique seu e-mail e confirme o endereço para poder entrar no SIFAU.');
      }
    } catch (error) {
      logAuthError(mode === 'login' ? 'login' : 'cadastro', error, [email, form.senha]);
      setMessage(getAuthErrorMessage(error as AuthErrorDetails));
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
        <h2>{mode === 'login' ? 'Bem-vindo de volta' : 'Cadastro de fiscal'}</h2>
        <p className="muted">
          {mode === 'login' ? 'Acesse sua central de fiscalização.' : 'Preencha seus dados para começar.'}
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
                Esspecialidade <span className="optional">opcional</span>
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
          {message && (
            <div className="form-message">
              <AlertTriangle size={16} />
              {message}
            </div>
          )}
          <button className="primary-button full" disabled={busy}>
            {busy ? <Loader2 className="spin" size={18} /> : mode === 'login' ? 'Entrar no SIFAU' : 'Criar acesso'}
          </button>
        </form>
      </div>
      <small className="auth-footer">Acesso restrito a fiscais municipais</small>
    </div>
  );
}

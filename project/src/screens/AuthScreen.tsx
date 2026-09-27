import { FormEvent, useState } from 'react';
import { AlertTriangle, Loader2, ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';

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
    setBusy(true);
    setMessage('');

    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({
        email: form.email,
        password: form.senha,
      });
      if (error) setMessage('E-mail ou senha inválidos.');
    } else {
      if (form.senha.length < 6) {
        setMessage('A senha precisa ter pelo menos 6 caracteres.');
        setBusy(false);
        return;
      }
      const { data, error } = await supabase.auth.signUp({
        email: form.email,
        password: form.senha,
      });
      if (error) {
        setMessage(
          error.message.includes('already')
            ? 'Este e-mail já está cadastrado.'
            : 'Não foi possível criar o cadastro.',
        );
      } else if (data.user) {
        const { error: profileError } = await supabase.from('fiscais').insert({
          id: data.user.id,
          email: form.email,
          nome: form.nome,
          telefone: form.telefone,
          bairro: form.bairro,
          especialidade: form.especialidade || null,
        });
        if (profileError)
          setMessage('Conta criada, mas não foi possível concluir o perfil. Tente entrar novamente.');
      }
    }
    setBusy(false);
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

import { FormEvent, useEffect, useState } from 'react';
import { BadgeCheck, Bell, CheckCircle2, KeyRound, LogOut, Save, ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getAuthErrorMessage, signOut, trocarSenhaComSenhaAtual } from '@/lib/authActions';
import { TAMANHO_MINIMO_DA_SENHA, validarNovaSenha } from '@/lib/recuperacaoDeSenha';
import { Fiscal } from '@/lib/types';
import { NoticeCard, PageTitle } from '@/components/ui';

export function ProfileScreen({ fiscal, onUpdated }: { fiscal: Fiscal | null; onUpdated: () => void }) {
  const [nome, setNome] = useState(fiscal?.nome ?? '');
  const [telefone, setTelefone] = useState(fiscal?.telefone ?? '');
  const [bairro, setBairro] = useState(fiscal?.bairro ?? '');
  const [especialidade, setEspecialidade] = useState(fiscal?.especialidade ?? '');
  const [notifAtribuicao, setNotifAtribuicao] = useState(fiscal?.notif_atribuicao ?? true);
  const [notifSla, setNotifSla] = useState(fiscal?.notif_sla ?? true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [saved, setSaved] = useState(false);
  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmacaoDaSenha, setConfirmacaoDaSenha] = useState('');
  const [erroDeSenha, setErroDeSenha] = useState('');
  const [senhaTrocada, setSenhaTrocada] = useState(false);
  const [trocandoSenha, setTrocandoSenha] = useState(false);

  useEffect(() => {
    setNome(fiscal?.nome ?? '');
    setTelefone(fiscal?.telefone ?? '');
    setBairro(fiscal?.bairro ?? '');
    setEspecialidade(fiscal?.especialidade ?? '');
    setNotifAtribuicao(fiscal?.notif_atribuicao ?? true);
    setNotifSla(fiscal?.notif_sla ?? true);
  }, [fiscal?.id, fiscal?.nome, fiscal?.telefone, fiscal?.bairro, fiscal?.especialidade, fiscal?.notif_atribuicao, fiscal?.notif_sla]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!fiscal) return;
    if (nome.trim().length < 2 || !telefone.trim() || !bairro.trim()) {
      setMessage('Preencha nome, telefone e bairro/região.');
      return;
    }

    setSaving(true);
    setSaved(false);
    setMessage('');
    const { error } = await supabase
      .from('fiscais')
      .update({
        nome: nome.trim(),
        telefone: telefone.trim(),
        bairro: bairro.trim(),
        especialidade: especialidade.trim() || null,
        notif_atribuicao: notifAtribuicao,
        notif_sla: notifSla,
      })
      .eq('id', fiscal.id);

    setSaving(false);
    if (error) {
      console.error('Erro ao salvar perfil:', error);
      setMessage('Não foi possível salvar as alterações. Tente novamente.');
      return;
    }
    setSaved(true);
    onUpdated();
  };

  const trocarSenha = async (event: FormEvent) => {
    event.preventDefault();
    setErroDeSenha('');
    setSenhaTrocada(false);

    if (!fiscal?.email) {
      setErroDeSenha('Não foi possível identificar seu e-mail. Entre novamente.');
      return;
    }
    if (!senhaAtual) {
      setErroDeSenha('Informe a senha atual.');
      return;
    }

    const problema = validarNovaSenha({
      senha: novaSenha,
      confirmacao: confirmacaoDaSenha,
      senhaAtual,
    });
    if (problema) {
      setErroDeSenha(problema);
      return;
    }

    setTrocandoSenha(true);
    const { error, senhaAtualIncorreta } = await trocarSenhaComSenhaAtual({
      email: fiscal.email,
      senhaAtual,
      novaSenha,
    });
    setTrocandoSenha(false);

    if (error) {
      setErroDeSenha(
        senhaAtualIncorreta ? 'Senha atual incorreta.' : getAuthErrorMessage(error),
      );
      return;
    }

    setSenhaAtual('');
    setNovaSenha('');
    setConfirmacaoDaSenha('');
    setSenhaTrocada(true);
  };

  return (
    <>
      <PageTitle eyebrow="Área do fiscal" title="Meu perfil" />

      <div className="profile-hero">
        <div className="avatar large">{fiscal?.nome?.charAt(0) ?? 'F'}</div>
        <div>
          <b>{fiscal?.nome ?? 'Fiscal'}</b>
          <span>{fiscal?.email}</span>
          <span className={`status-pill ${fiscal?.ativo ? 'active' : 'inactive'}`}>
            <BadgeCheck size={12} /> {fiscal?.ativo ? 'Ativo' : 'Inativo'}
          </span>
        </div>
      </div>

      <form className="form-card" onSubmit={save}>
        <div className="form-section">
          <h2>Dados pessoais</h2>
          <label>
            Nome completo
            <input value={nome} onChange={(event) => setNome(event.target.value)} required />
          </label>
          <div className="two-fields">
            <label>
              Telefone
              <input value={telefone} onChange={(event) => setTelefone(event.target.value)} required />
            </label>
            <label>
              Bairro de atuação
              <input value={bairro} onChange={(event) => setBairro(event.target.value)} required />
            </label>
          </div>
          <label>
            Especialidade <span className="optional">(opcional)</span>
            <input
              value={especialidade}
              onChange={(event) => setEspecialidade(event.target.value)}
              placeholder="Ex: Meio ambiente, Posturas, Trânsito"
            />
          </label>
        </div>

        <div className="form-section">
          <h2>Notificações</h2>
          <div className="toggle-row">
            <button
              type="button"
              role="switch"
              aria-label="Avisar quando uma ocorrência for atribuída a mim"
              className={`toggle ${notifAtribuicao ? 'on' : ''}`}
              disabled title="Atribuição de trabalho desativada nesta fase"
              aria-checked={notifAtribuicao}
            ><i /></button>
            <span>Avisos de atribuição (indisponíveis nesta fase; preferência preservada)</span>
          </div>
          <div className="toggle-row">
            <button
              type="button"
              role="switch"
              aria-label="Avisar quando o prazo estiver próximo do fim"
              className={`toggle ${notifSla ? 'on' : ''}`}
              onClick={() => setNotifSla((value) => !value)}
              aria-checked={notifSla}
            ><i /></button>
            <span>Avisar quando o prazo de SLA estiver próximo do fim</span>
          </div>
        </div>

        {message && <div className="form-message" role="alert">{message}</div>}
        {saved && <div className="info-message"><Bell size={15} />Perfil e preferências atualizados.</div>}

        <button className="primary-button full" disabled={saving || !fiscal} type="submit">
          <Save size={17} /> {saving ? 'Salvando...' : 'Salvar alterações'}
        </button>
      </form>

      <form className="form-card compact" onSubmit={trocarSenha}>
        <div className="form-section">
          <h2>Trocar senha</h2>
          <p className="muted">
            A troca pede a senha atual: aparelho emprestado com sessão aberta não basta para
            tomar a conta. Ao trocar, os outros aparelhos conectados precisam entrar de novo.
          </p>
        </div>
        <div className="form-section">
          <label>
            Senha atual
            <input
              type="password"
              autoComplete="current-password"
              value={senhaAtual}
              onChange={(event) => setSenhaAtual(event.target.value)}
              placeholder="A senha que você usa hoje"
            />
          </label>
          <div className="two-fields">
            <label>
              Nova senha
              <input
                type="password"
                autoComplete="new-password"
                value={novaSenha}
                onChange={(event) => setNovaSenha(event.target.value)}
                placeholder={`${TAMANHO_MINIMO_DA_SENHA}+ caracteres`}
              />
            </label>
            <label>
              Repita a nova
              <input
                type="password"
                autoComplete="new-password"
                value={confirmacaoDaSenha}
                onChange={(event) => setConfirmacaoDaSenha(event.target.value)}
                placeholder="Igual à da esquerda"
              />
            </label>
          </div>
        </div>

        {erroDeSenha && <div className="form-message" role="alert">{erroDeSenha}</div>}
        {senhaTrocada && (
          <div className="info-message">
            <CheckCircle2 size={15} />
            Senha alterada. Os outros aparelhos precisarão entrar de novo.
          </div>
        )}

        <button className="primary-button full" disabled={trocandoSenha || !fiscal} type="submit">
          <KeyRound size={17} /> {trocandoSenha ? 'Trocando...' : 'Trocar senha'}
        </button>
      </form>

      <NoticeCard
        icon={<ShieldCheck size={17} />}
        title="SIFAU · Sistema Municipal de Fiscalização e Atendimento Urbano"
        text="Versão 1.2 · Dados protegidos por autenticação e auditoria imutável."
      />

      <button className="drawer-link logout" onClick={() => void signOut()}>
        <LogOut size={19} /> Encerrar sessão
      </button>
    </>
  );
}

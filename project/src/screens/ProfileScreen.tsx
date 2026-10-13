import { FormEvent, useEffect, useState } from 'react';
import { BadgeCheck, Bell, LogOut, Save, ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { signOut } from '@/lib/authActions';
import { Fiscal } from '@/lib/types';
import { PageTitle } from '@/components/ui';

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
              className={`toggle ${notifAtribuicao ? 'on' : ''}`}
              onClick={() => setNotifAtribuicao((value) => !value)}
              aria-pressed={notifAtribuicao}
            ><i /></button>
            <span>Avisar quando uma ocorrência for atribuída a mim</span>
          </div>
          <div className="toggle-row">
            <button
              type="button"
              className={`toggle ${notifSla ? 'on' : ''}`}
              onClick={() => setNotifSla((value) => !value)}
              aria-pressed={notifSla}
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

      <div className="notice-card">
        <div className="notice-icon"><ShieldCheck size={17} /></div>
        <div>
          <b>SIFAU · Sistema Municipal de Fiscalização e Atendimento Urbano</b>
          <span>Versão 1.2 · Dados protegidos por autenticação e auditoria imutável.</span>
        </div>
      </div>

      <button className="drawer-link logout" onClick={() => void signOut()}>
        <LogOut size={19} /> Encerrar sessão
      </button>
    </>
  );
}

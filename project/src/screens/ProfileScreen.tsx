import { FormEvent, useState } from 'react';
import { BadgeCheck, Bell, LogOut, Save, ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Fiscal } from '@/lib/types';
import { PageTitle } from '@/components/ui';

export function ProfileScreen({ fiscal, onUpdated }: { fiscal: Fiscal | null; onUpdated: () => void }) {
  const [nome, setNome] = useState(fiscal?.nome ?? '');
  const [telefone, setTelefone] = useState(fiscal?.telefone ?? '');
  const [bairro, setBairro] = useState(fiscal?.bairro ?? '');
  const [especialidade, setEspecialidade] = useState(fiscal?.especialidade ?? '');
  const [notifAtribuicao, setNotifAtribuicao] = useState(true);
  const [notifSla, setNotifSla] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!fiscal) return;
    setSaving(true);
    setSaved(false);
    await supabase
      .from('fiscais')
      .update({ nome, telefone, bairro, especialidade: especialidade || null })
      .eq('id', fiscal.id);
    localStorage.setItem(
      'sifau-notif-prefs',
      JSON.stringify({ atribuicao: notifAtribuicao, sla: notifSla }),
    );
    setSaving(false);
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
            <input value={nome} onChange={(e) => setNome(e.target.value)} required />
          </label>
          <div className="two-fields">
            <label>
              Telefone
              <input value={telefone} onChange={(e) => setTelefone(e.target.value)} required />
            </label>
            <label>
              Bairro de atuação
              <input value={bairro} onChange={(e) => setBairro(e.target.value)} required />
            </label>
          </div>
          <label>
            Especialidade <span className="optional">(opcional)</span>
            <input
              value={especialidade ?? ''}
              onChange={(e) => setEspecialidade(e.target.value)}
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
              onClick={() => setNotifAtribuicao((v) => !v)}
            >
              <i />
            </button>
            <span>Avisar quando uma ocorrência for atribuída a mim</span>
          </div>
          <div className="toggle-row">
            <button
              type="button"
              className={`toggle ${notifSla ? 'on' : ''}`}
              onClick={() => setNotifSla((v) => !v)}
            >
              <i />
            </button>
            <span>Avisar quando o prazo de SLA estiver próximo do fim</span>
          </div>
        </div>

        {saved && (
          <div className="info-message">
            <Bell size={15} /> Perfil e preferências atualizados.
          </div>
        )}

        <button className="primary-button full" disabled={saving} type="submit">
          <Save size={17} /> {saving ? 'Salvando...' : 'Salvar alterações'}
        </button>
      </form>

      <div className="notice-card">
        <div className="notice-icon"><ShieldCheck size={17} /></div>
        <div>
          <b>SIFAU · Sistema Municipal de Fiscalização e Atendimento Urbano</b>
          <span>Versão 1.1 · Dados protegidos por autenticação e auditoria imutável.</span>
        </div>
      </div>

      <button className="drawer-link logout" onClick={() => supabase.auth.signOut()}>
        <LogOut size={19} /> Encerrar sessão
      </button>
    </>
  );
}

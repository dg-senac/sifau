import { Bell, ChevronRight, FileCheck2, LogOut, Map, User, Users } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Fiscal, Screen } from '@/lib/types';
import { PageTitle } from '@/components/ui';

export function MoreScreen({
  fiscal,
  unreadCount,
  onNavigate,
}: {
  fiscal: Fiscal | null;
  unreadCount: number;
  onNavigate: (s: Screen) => void;
}) {
  const items: { id: Screen; label: string; desc: string; icon: typeof User; badge?: number }[] = [
    { id: 'profile', label: 'Meu perfil', desc: 'Dados pessoais e notificações', icon: User },
    { id: 'notifications', label: 'Notificações', desc: 'Atribuições, prazos e status', icon: Bell, badge: unreadCount },
    { id: 'map', label: 'Mapa da cidade', desc: 'Ocorrências geolocalizadas', icon: Map },
    { id: 'audit', label: 'Auditoria', desc: 'Histórico imutável de ações', icon: FileCheck2 },
    { id: 'users', label: 'Fiscais cadastrados', desc: 'Equipe municipal', icon: Users },
  ];

  return (
    <>
      <PageTitle eyebrow="Área do fiscal" title="Mais opções" />
      <div className="profile-card">
        <div className="avatar">{fiscal?.nome?.charAt(0) ?? 'F'}</div>
        <div>
          <b>{fiscal?.nome ?? 'Fiscal'}</b>
          <span>{fiscal?.bairro ?? 'Região não definida'}</span>
        </div>
      </div>
      <div className="more-list">
        {items.map(({ id, label, desc, icon: Icon, badge }) => (
          <button key={id} className="more-item tapable" onClick={() => onNavigate(id)}>
            <div className="more-icon"><Icon size={18} /></div>
            <div>
              <b>{label}</b>
              <span>{desc}</span>
            </div>
            {!!badge && <span className="more-badge">{badge}</span>}
            <ChevronRight size={18} className="order-chevron" />
          </button>
        ))}
      </div>
      <button className="drawer-link logout" onClick={() => supabase.auth.signOut()}>
        <LogOut size={19} /> Encerrar sessão
      </button>
    </>
  );
}

import { ReactNode, useState } from 'react';
import {
  Bell,
  Loader2,
  LogOut,
  Menu as MenuIcon,
  MapPinned,
  MessageSquare,
  Plus,
  FileCheck2,
  FileText,
  UserCog,
  Users,
  X,
  ShieldCheck,
} from 'lucide-react';
import { signOut } from '@/lib/authActions';
import { Fiscal, Screen } from '@/lib/types';
import { SifauSimbolo } from '@/components/Logo';
import { AlternarTema } from '@/components/AlternarTema';
import { SyncBanner } from '@/components/SyncBanner';

// O painel administrativo é alcançado pela lista "Mais" (e pelo menu lateral),
// e por isso conta como parte desse grupo: sem ele, a barra de baixo ficava
// sem nenhum item marcado enquanto o administrador estava no painel.
const MORE_GROUP: Screen[] = ['more', 'admin', 'profile', 'notifications', 'messages', 'map', 'users', 'audit', 'documents'];

export function AppShell({
  fiscal,
  screen,
  onScreen,
  navItems,
  children,
  unreadCount = 0,
  isAdmin = false,
}: {
  fiscal: Fiscal | null;
  screen: Screen;
  onScreen: (s: Screen) => void;
  navItems: { id: Screen; label: string; icon: typeof MenuIcon }[];
  children: ReactNode;
  unreadCount?: number;
  isAdmin?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  const change = (s: Screen) => {
    onScreen(s);
    setMenuOpen(false);
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="icon-button" onClick={() => setMenuOpen(true)} aria-label="Abrir menu">
          <MenuIcon size={22} />
        </button>
        <div className="brand">
          <div className="brand-mark">
            <SifauSimbolo tamanho={22} />
          </div>
          <div>
            <strong>SIFAU</strong>
            <span>{isAdmin ? 'Administração · visão geral' : 'Área pessoal · seus registros'}</span>
          </div>
        </div>
        <div className="topbar-actions">
          <AlternarTema />
          <button className="icon-button notification" aria-label="Notificações" onClick={() => change('notifications')}>
            <Bell size={20} />
            {unreadCount > 0 && <i />}
          </button>
        </div>
      </header>

      <main className="main-content">
        {isAdmin && <div className="admin-scope-banner" role="note"><ShieldCheck size={18} aria-hidden="true" /><span><b>Modo administrador</b>Você pode consultar registros gerais. As contas comuns acessam somente seus próprios dados.</span></div>}
        <SyncBanner />
        {children}
      </main>

      <nav className="bottom-nav">
        {navItems.map(({ id, label, icon: Icon }) => {
          const active = id === 'more' ? MORE_GROUP.includes(screen) : screen === id;
          return (
            <button
              key={id}
              className={active ? 'active' : ''}
              onClick={() => change(id)}
            >
              <Icon size={21} />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>

      {menuOpen && (
        <div className="drawer-backdrop" onClick={() => setMenuOpen(false)}>
          <aside className="drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <div className="brand-mark large">
                <SifauSimbolo tamanho={26} />
              </div>
              <div>
                <strong>SIFAU</strong>
                <small>Área do fiscal</small>
              </div>
              <button className="icon-button" onClick={() => setMenuOpen(false)}>
                <X size={20} />
              </button>
            </div>
            <button className="profile-card tapable" onClick={() => change('profile')}>
              <div className="avatar">{fiscal?.nome?.charAt(0) ?? 'F'}</div>
              <div>
                <b>{fiscal?.nome ?? 'Fiscal'}</b>
                <span>{fiscal?.bairro ?? 'Região não definida'}</span>
              </div>
            </button>
            {/* O painel não é um item da barra de baixo. Sem este atalho, o
                administrador que navegasse para outra tela não teria por onde
                voltar — a barra e a lista "Mais" não citam o painel. */}
            {isAdmin && (
              <button className="drawer-link" onClick={() => change('admin')}>
                <ShieldCheck size={19} /> Painel Administrativo
              </button>
            )}
            <button className="drawer-link" onClick={() => change('new')}>
              <Plus size={19} /> Nova ocorrência
            </button>
            <button className="drawer-link" onClick={() => change('map')}>
              <MapPinned size={19} /> Mapa da cidade
            </button>
            <button className="drawer-link" onClick={() => change('notifications')}>
              <Bell size={19} /> Notificações
              {unreadCount > 0 && <span className="count-chip">{unreadCount}</span>}
            </button>
            <button className="drawer-link" onClick={() => change('messages')}>
              <MessageSquare size={19} /> Mensagens
            </button>
            <button className="drawer-link" onClick={() => change('audit')}>
              <FileCheck2 size={19} /> Auditoria
            </button>
            <button className="drawer-link" onClick={() => change('documents')}>
              <FileText size={19} /> Documentos
            </button>
            <button className="drawer-link" onClick={() => change('users')}>
              <Users size={19} /> Fiscais cadastrados
            </button>
            <button className="drawer-link" onClick={() => change('profile')}>
              <UserCog size={19} /> Meu perfil
            </button>
            <button className="drawer-link logout" onClick={() => void signOut()}>
              <LogOut size={19} /> Encerrar sessão
            </button>
          </aside>
        </div>
      )}
    </div>
  );
}

export function LoadingScreen({ message }: { message: string }) {
  return (
    <div className="loading-screen">
      <Loader2 className="spin" size={30} />
      <span>{message}</span>
    </div>
  );
}

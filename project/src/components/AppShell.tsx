import { ReactNode, useEffect, useState } from 'react';
import {
  Bell,
  Loader2,
  LogOut,
  Menu as MenuIcon,
  MapPinned,
  Plus,
  FileCheck2,
  ShieldCheck,
  UserCog,
  Users,
  X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Fiscal, Screen } from '@/lib/types';
import { SyncBanner } from '@/components/SyncBanner';

const MORE_GROUP: Screen[] = ['more', 'profile', 'notifications', 'map', 'users', 'audit'];

export function AppShell({
  fiscal,
  screen,
  onScreen,
  navItems,
  children,
  unreadCount = 0,
}: {
  fiscal: Fiscal | null;
  screen: Screen;
  onScreen: (s: Screen) => void;
  navItems: { id: Screen; label: string; icon: typeof MenuIcon }[];
  children: ReactNode;
  unreadCount?: number;
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
            <ShieldCheck size={20} />
          </div>
          <div>
            <strong>SIFAU</strong>
            <span>Fiscalização urbana</span>
          </div>
        </div>
        <button className="icon-button notification" aria-label="Notificações" onClick={() => change('notifications')}>
          <Bell size={20} />
          {unreadCount > 0 && <i />}
        </button>
      </header>

      <main className="main-content">
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
                <ShieldCheck size={26} />
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
            <button className="drawer-link" onClick={() => change('audit')}>
              <FileCheck2 size={19} /> Auditoria
            </button>
            <button className="drawer-link" onClick={() => change('users')}>
              <Users size={19} /> Fiscais cadastrados
            </button>
            <button className="drawer-link" onClick={() => change('profile')}>
              <UserCog size={19} /> Meu perfil
            </button>
            <button className="drawer-link logout" onClick={() => supabase.auth.signOut()}>
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

export function useSession() {
  const [session, setSession] =
    useState<Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session']>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => setSession(data.session))
      .finally(() => setLoading(false));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  return { session, loading };
}

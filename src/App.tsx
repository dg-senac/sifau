import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { BarChart3, ClipboardList, FileText, Home as HomeIcon, Menu as MenuIcon } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { Fiscal, Screen } from '@/lib/types';
import { AppShell, LoadingScreen } from '@/components/AppShell';
import { useSession } from '@/lib/useSession';
import { signOut } from '@/lib/authActions';
import { AuthScreen } from '@/screens/AuthScreen';
import { HomeScreen } from '@/screens/HomeScreen';
import { NewOccurrence } from '@/screens/NewOccurrence';
import { Inspection } from '@/screens/Inspection';
import { isRecoverableSyncError, setQueueUser, startAutoSync } from '@/lib/offlineQueue';
import { registerPush, unregisterPush } from '@/lib/push';
import { locationTracker } from '@/lib/locationTracking';

const Dashboard = lazy(() => import('@/screens/Dashboard').then((module) => ({ default: module.Dashboard })));
const Orders = lazy(() => import('@/screens/Orders').then((module) => ({ default: module.Orders })));
const Audit = lazy(() => import('@/screens/Audit').then((module) => ({ default: module.Audit })));
const UsersScreen = lazy(() => import('@/screens/UsersScreen').then((module) => ({ default: module.UsersScreen })));
const MoreScreen = lazy(() => import('@/screens/MoreScreen').then((module) => ({ default: module.MoreScreen })));
const ProfileScreen = lazy(() => import('@/screens/ProfileScreen').then((module) => ({ default: module.ProfileScreen })));
const NotificationsScreen = lazy(() => import('@/screens/NotificationsScreen').then((module) => ({ default: module.NotificationsScreen })));
const MessagesScreen = lazy(() => import('@/screens/MessagesScreen').then((module) => ({ default: module.MessagesScreen })));
const MapScreen = lazy(() => import('@/screens/MapScreen').then((module) => ({ default: module.MapScreen })));
const AdminScreen = lazy(() => import('@/screens/AdminScreen').then((module) => ({ default: module.AdminScreen })));

const navItems: { id: Screen; label: string; icon: typeof HomeIcon }[] = [
  { id: 'home', label: 'Início', icon: HomeIcon },
  { id: 'inspection', label: 'Vistoria', icon: ClipboardList },
  { id: 'dashboard', label: 'Painel', icon: BarChart3 },
  { id: 'orders', label: 'Ordens', icon: FileText },
  { id: 'more', label: 'Mais', icon: MenuIcon },
];

type AccessState = 'idle' | 'checking' | 'allowed' | 'pending' | 'banned' | 'error';

function App() {
  const { session, loading } = useSession();
  const [screen, setScreen] = useState<Screen>('home');
  const [fiscal, setFiscal] = useState<Fiscal | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [accessState, setAccessState] = useState<AccessState>('idle');

  useEffect(() => {
    const userId = session?.user.id;
    if (!userId) {
      setAccessState('idle');
      setIsAdmin(false);
      setFiscal(null);
      return;
    }

    let cancelled = false;
    let checkingAccess = false;
    let lastVerifiedAllowed = false;
    let lastVerifiedAdmin = false;
    setAccessState('checking');

    const verifyAccess = async () => {
      if (checkingAccess || cancelled) return;
      checkingAccess = true;
      try {
        const { data: adminResult, error: adminError } = await supabase.rpc('is_admin');
        if (cancelled) return;
        if (adminError) {
          console.error('Não foi possível verificar o perfil administrativo:', adminError);
          if (!lastVerifiedAllowed || !isRecoverableSyncError(adminError)) setAccessState('error');
          return;
        }
        if (adminResult) {
          lastVerifiedAllowed = true;
          lastVerifiedAdmin = true;
          setIsAdmin(true);
          setAccessState('allowed');
          return;
        }

        if (lastVerifiedAdmin) lastVerifiedAllowed = false;
        lastVerifiedAdmin = false;
        setIsAdmin(false);
        const [{ data: banned, error: banError }, { data: active, error: activeError }] = await Promise.all([
          supabase.rpc('is_user_banned'),
          supabase.rpc('is_active_fiscal'),
        ]);
        if (cancelled) return;
        if (banError || activeError) {
          const accessError = banError ?? activeError;
          console.error('Não foi possível verificar o acesso do fiscal:', accessError);
          if (!lastVerifiedAllowed || !isRecoverableSyncError(accessError)) setAccessState('error');
        } else if (banned) {
          lastVerifiedAllowed = false;
          setAccessState('banned');
        } else if (active) {
          lastVerifiedAllowed = true;
          setAccessState('allowed');
        } else {
          lastVerifiedAllowed = false;
          setAccessState('pending');
        }
      } catch (error) {
        console.error('Não foi possível verificar o acesso:', error);
        if (!lastVerifiedAllowed || !isRecoverableSyncError(error)) setAccessState('error');
      } finally {
        checkingAccess = false;
      }
    };

    void verifyAccess();
    const intervalId = window.setInterval(() => {
      if (!document.hidden) void verifyAccess();
    }, 60000);
    const verifyOnFocus = () => { void verifyAccess(); };
    window.addEventListener('focus', verifyOnFocus);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', verifyOnFocus);
    };
  }, [session?.user.id]);

  const sessionUserId = session?.user.id;
  const loadFiscal = useCallback(async () => {
    if (!sessionUserId || accessState !== 'allowed') {
      setFiscal(null);
      return;
    }

    const { data, error } = await supabase
      .from('fiscais')
      .select('*')
      .eq('id', sessionUserId)
      .maybeSingle();

    if (error) {
      console.error('Erro ao carregar fiscal:', error);
      return;
    }
    setFiscal(data);
  }, [sessionUserId, accessState]);

  useEffect(() => { void loadFiscal(); }, [loadFiscal]);

  useEffect(() => {
    if (isAdmin) setScreen('admin');
    else if (screen === 'admin') setScreen('home');
  }, [isAdmin, screen]);

  useEffect(() => {
    setQueueUser(session?.user.id ?? null);
  }, [session?.user.id]);

  useEffect(() => startAutoSync(), []);

  useEffect(() => {
    const fiscalId = fiscal?.id;
    if (accessState === 'allowed' && fiscalId && !isAdmin) {
      void registerPush(fiscalId);
      return;
    }
    void unregisterPush();
  }, [accessState, fiscal?.id, isAdmin]);

  useEffect(() => {
    const fiscalId = fiscal?.id;
    if (accessState !== 'allowed' || !fiscalId || isAdmin) {
      locationTracker.stopTracking();
      return;
    }

    const start = () => {
      if (!document.hidden) locationTracker.startTracking(fiscalId);
    };
    const handleVisibilityChange = () => {
      if (document.hidden) {
        void locationTracker.markOffline();
        locationTracker.stopTracking();
      } else {
        start();
      }
    };
    const handleBeforeUnload = () => {
      void locationTracker.markOffline();
      locationTracker.stopTracking();
    };

    start();
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      void locationTracker.markOffline();
      locationTracker.stopTracking();
    };
  }, [accessState, fiscal?.id, isAdmin]);

  useEffect(() => {
    try {
      if (accessState === 'allowed' && localStorage.getItem('sifau-open-notifications')) {
        localStorage.removeItem('sifau-open-notifications');
        setScreen('notifications');
      }
    } catch (error) {
      console.error('Erro ao acessar localStorage:', error);
    }
  }, [accessState]);

  useEffect(() => {
    const fiscalId = fiscal?.id;
    if (accessState !== 'allowed' || !fiscalId || isAdmin) {
      setUnreadCount(0);
      return;
    }

    const refreshUnread = async () => {
      const { count, error } = await supabase
        .from('notificacoes')
        .select('id', { count: 'exact', head: true })
        .eq('fiscal_id', fiscalId)
        .eq('lida', false);
      if (error) {
        console.error('Erro ao consultar notificações não lidas:', error);
        return;
      }
      setUnreadCount(count ?? 0);
    };

    void refreshUnread();
    const channel = supabase
      .channel(`unread-${fiscalId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notificacoes', filter: `fiscal_id=eq.${fiscalId}` },
        () => { void refreshUnread(); },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [accessState, fiscal?.id, isAdmin]);

  if (!isSupabaseConfigured) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1>Configuração necessária</h1>
          <p className="muted">O SIFAU precisa das credenciais públicas do projeto Supabase para iniciar.</p>
          <ol>
            <li>Copie <code>.env.example</code> para <code>.env</code>.</li>
            <li>Preencha <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code>.</li>
            <li>Reinicie o servidor de desenvolvimento.</li>
          </ol>
          <p className="muted">Nunca use a chave <code>service_role</code> no aplicativo.</p>
        </div>
      </div>
    );
  }

  if (loading) return <LoadingScreen message="Carregando SIFAU" />;
  if (!session) return <AuthScreen />;
  if (accessState === 'checking' || accessState === 'idle') return <LoadingScreen message="Verificando permissões" />;
  if (accessState === 'pending' || accessState === 'banned' || accessState === 'error') {
    const title = accessState === 'pending'
      ? 'Acesso aguardando aprovação'
      : accessState === 'banned'
        ? 'Acesso suspenso'
        : 'Não foi possível verificar seu acesso';
    const message = accessState === 'pending'
      ? 'Seu cadastro foi recebido. Um administrador precisa ativar o perfil antes de você acessar os dados operacionais.'
      : accessState === 'banned'
        ? 'Sua conta está suspensa. Entre em contato com a administração do sistema.'
        : 'Verifique se as migrations mais recentes do Supabase foram aplicadas e tente novamente.';

    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1>{title}</h1>
          <p className="muted">{message}</p>
          <button className="ghost-button full" onClick={() => void signOut()}>Encerrar sessão</button>
        </div>
      </div>
    );
  }

  const renderScreen = () => {
    switch (screen) {
      case 'new':
        return <NewOccurrence fiscal={fiscal} onDone={() => setScreen('home')} />;
      case 'inspection':
        return <Inspection fiscal={fiscal} />;
      case 'dashboard':
        return <Dashboard />;
      case 'orders':
        return <Orders fiscal={fiscal} />;
      case 'audit':
        return <Audit />;
      case 'users':
        return <UsersScreen currentFiscal={fiscal} />;
      case 'more':
        return <MoreScreen fiscal={fiscal} unreadCount={unreadCount} onNavigate={setScreen} />;
      case 'profile':
        return <ProfileScreen fiscal={fiscal} onUpdated={loadFiscal} />;
      case 'notifications':
        return <NotificationsScreen fiscal={fiscal} />;
      case 'messages':
        return <MessagesScreen fiscal={fiscal} />;
      case 'map':
        return <MapScreen />;
      case 'admin':
        return isAdmin ? <AdminScreen /> : <HomeScreen fiscal={fiscal} onNavigate={setScreen} />;
      default:
        return <HomeScreen fiscal={fiscal} onNavigate={setScreen} />;
    }
  };

  return (
    <AppShell
      fiscal={fiscal}
      screen={screen}
      onScreen={setScreen}
      navItems={navItems}
      unreadCount={unreadCount}
    >
      <Suspense fallback={<LoadingScreen message="Carregando tela" />}>
        {renderScreen()}
      </Suspense>
    </AppShell>
  );
}

export default App;

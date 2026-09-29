import { BarChart3, ClipboardList, FileText, Home as HomeIcon, Menu as MenuIcon, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Fiscal, Screen } from '@/lib/types';
import { AppShell, useSession } from '@/components/AppShell';
import { LoadingScreen } from '@/components/AppShell';
import { AuthScreen } from '@/screens/AuthScreen';
import { HomeScreen } from '@/screens/HomeScreen';
import { NewOccurrence } from '@/screens/NewOccurrence';
import { Inspection } from '@/screens/Inspection';
import { Dashboard } from '@/screens/Dashboard';
import { Orders } from '@/screens/Orders';
import { Audit } from '@/screens/Audit';
import { UsersScreen } from '@/screens/UsersScreen';
import { MoreScreen } from '@/screens/MoreScreen';
import { ProfileScreen } from '@/screens/ProfileScreen';
import { NotificationsScreen } from '@/screens/NotificationsScreen';
import { MapScreen } from '@/screens/MapScreen';
import { AdminScreen } from '@/screens/AdminScreen';
import { startAutoSync } from '@/lib/offlineQueue';
import { registerPush } from '@/lib/push';
import { locationTracker } from '@/lib/locationTracking';

const navItems: { id: Screen; label: string; icon: typeof HomeIcon }[] = [
  { id: 'home', label: 'Início', icon: HomeIcon },
  { id: 'inspection', label: 'Vistoria', icon: ClipboardList },
  { id: 'dashboard', label: 'Painel', icon: BarChart3 },
  { id: 'orders', label: 'Ordens', icon: FileText },
  { id: 'more', label: 'Mais', icon: MenuIcon },
];

function App() {
  const { session, loading } = useSession();
  const [screen, setScreen] = useState<Screen>('home');
  const [fiscal, setFiscal] = useState<Fiscal | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [localAdmin, setLocalAdmin] = useState(false);

  const loadFiscal = () => {
    if (!session) {
      setFiscal(null);
      return;
    }

    const fetchFiscal = async () => {
      const { data, error } = await supabase
        .from('fiscais')
        .select('*')
        .eq('id', session.user.id)
        .maybeSingle();

      if (data) {
        setFiscal(data);
      } else if (error) {
        console.error('Erro ao carregar fiscal:', error);
      } else {
        // Perfil não existe - tentar criar automaticamente
        const { error: insertError } = await supabase
          .from('fiscais')
          .insert({
            id: session.user.id,
            email: session.user.email || '',
            nome: session.user.user_metadata?.nome || session.user.email?.split('@')[0] || 'Fiscal',
            telefone: session.user.user_metadata?.telefone || '',
            bairro: session.user.user_metadata?.bairro || '',
            especialidade: session.user.user_metadata?.especialidade || null,
            ativo: true,
          });

        if (insertError) {
          console.error('Erro ao criar perfil fiscal automaticamente:', insertError);
        } else {
          // Tentar carregar novamente após inserção
          const { data: newData } = await supabase
            .from('fiscais')
            .select('*')
            .eq('id', session.user.id)
            .maybeSingle();
          setFiscal(newData);
        }
      }
    };

    fetchFiscal();
  };

  useEffect(loadFiscal, [session]);

  useEffect(() => {
    const checkAdmin = async () => {
      if (!session) {
        setIsAdmin(false);
        return;
      }
      const { data } = await supabase.rpc('is_admin');
      setIsAdmin(data || false);
    };

    checkAdmin();
  }, [session]);

  // Iniciar tracking de localização quando fiscal estiver logado
  useEffect(() => {
    if (fiscal && !isAdmin) {
      locationTracker.startTracking(fiscal.id);
    } else {
      locationTracker.stopTracking();
    }

    return () => {
      locationTracker.stopTracking();
    };
  }, [fiscal, isAdmin]);

  // Marcar offline quando sair da página
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (fiscal && !isAdmin) {
        locationTracker.markOffline();
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden && fiscal && !isAdmin) {
        locationTracker.markOffline();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fiscal, isAdmin]);

  useEffect(() => { startAutoSync(); }, []);

  useEffect(() => {
    if (fiscal) registerPush(fiscal.id);
  }, [fiscal?.id]);

  useEffect(() => {
    try {
      if (localStorage.getItem('sifau-open-notifications')) {
        localStorage.removeItem('sifau-open-notifications');
        setScreen('notifications');
      }
    } catch (e) {
      console.error('Erro ao acessar localStorage:', e);
    }
  }, [fiscal]);

  useEffect(() => {
    if (!fiscal) {
      setUnreadCount(0);
      return;
    }
    const refreshUnread = async () => {
      const { count } = await supabase
        .from('notificacoes')
        .select('id', { count: 'exact', head: true })
        .eq('fiscal_id', fiscal.id)
        .eq('lida', false);
      setUnreadCount(count ?? 0);
    };
    refreshUnread();
    const channel = supabase
      .channel(`unread-${fiscal.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notificacoes', filter: `fiscal_id=eq.${fiscal.id}` },
        refreshUnread,
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fiscal?.id]);

  if (loading) return <LoadingScreen message="Carregando SIFAU" />;
  if (!session) return <AuthScreen onAdmin={() => { setLocalAdmin(true); setScreen('admin'); }} />;
  if ((isAdmin || localAdmin) && screen === 'home') setScreen('admin');

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
      case 'map':
        return <MapScreen />;
      case 'admin':
        return <AdminScreen />;
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
      {renderScreen()}
    </AppShell>
  );
}

export default App;

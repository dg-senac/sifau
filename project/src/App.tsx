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
import { startAutoSync } from '@/lib/offlineQueue';
import { registerPush } from '@/lib/push';

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

  const loadFiscal = () => {
    if (!session) {
      setFiscal(null);
      return;
    }
    supabase
      .from('fiscais')
      .select('*')
      .eq('id', session.user.id)
      .maybeSingle()
      .then(({ data }) => setFiscal(data));
  };

  useEffect(loadFiscal, [session]);

  useEffect(() => { startAutoSync(); }, []);

  useEffect(() => {
    if (fiscal) registerPush(fiscal.id);
  }, [fiscal?.id]);

  useEffect(() => {
    if (localStorage.getItem('sifau-open-notifications')) {
      localStorage.removeItem('sifau-open-notifications');
      setScreen('notifications');
    }
  }, [fiscal]);

  useEffect(() => {
    if (!fiscal) {
      setUnreadCount(0);
      return;
    }
    const refreshUnread = () => {
      supabase
        .from('notificacoes')
        .select('id', { count: 'exact', head: true })
        .eq('fiscal_id', fiscal.id)
        .eq('lida', false)
        .then(({ count }) => setUnreadCount(count ?? 0));
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
  if (!session) return <AuthScreen />;

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

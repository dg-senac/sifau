import { useCallback, useEffect, useState, useRef } from 'react';
import {
  ShieldCheck,
  Users,
  MapPin,
  MessageSquare,
  Ban,
  Search,
  CheckCircle,
  XCircle,
  Clock,
  Activity,
  FileText,
  Camera,
  Send,
  X,
  AlertTriangle,
  LogOut,
  RefreshCw,
  Download,
  BarChart3,
  UserCheck,
  UserX,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { signOut } from '@/lib/authActions';
import { Fiscal } from '@/lib/types';
import { fileUtils } from '@/lib/fileUtils';
import { ehImagem } from '@/lib/storage';
import {
  descartarAnexosDeMensagem, enviarAnexosDeMensagem, nomeDoAnexoDaMensagem,
  prepararAnexosDeMensagem, type AnexoDeMensagem,
} from '@/lib/mensagens';
import { AnexoImagem, BotaoBaixarAnexo } from '@/components/StorageFile';

type FiscalWithStatus = Fiscal & {
  is_online: boolean;
  last_seen: string;
  current_location: { lat: number; lng: number } | null;
  battery_level: number | null;
  occurrence_count: number;
  resolved_count: number;
  is_banned: boolean;
};

type AdminMessage = {
  id: string;
  admin_id: string;
  fiscal_id: string;
  sender_type: 'admin' | 'fiscal';
  message: string;
  attachments: string[];
  read_at: string | null;
  created_at: string;
};

type AdminLog = {
  id: string;
  admin_id: string;
  action: string;
  target_type: string;
  target_id: string | null;
  details: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
};

type LocationRow = {
  fiscal_id: string;
  latitude: number;
  longitude: number;
  battery_level: number | null;
  is_online: boolean;
  last_seen: string;
};

type OccurrenceStatsRow = {
  fiscal_registrou: string | null;
  status: string;
};

type BanRow = {
  id: string;
  ban_type: 'temporary' | 'permanent';
  expires_at: string | null;
};

type UnassignedOccurrence = {
  id: string;
  categoria: string;
  descricao: string;
  bairro: string;
  endereco: string;
  urgencia: string;
  status: string;
  created_at: string;
};

export function AdminScreen() {
  const [fiscais, setFiscais] = useState<FiscalWithStatus[]>([]);
  const [filteredFiscais, setFilteredFiscais] = useState<FiscalWithStatus[]>([]);
  const [selectedFiscal, setSelectedFiscal] = useState<FiscalWithStatus | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'offline'>('all');
  const [showChat, setShowChat] = useState(false);
  const [messages, setMessages] = useState<AdminMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  // O arquivo escolhido fica em memória (com um endereço local só para a
  // pré-visualização) até a mensagem ser enviada. É no envio que ele sobe para
  // o bucket — nada de arquivo dentro do banco.
  const [anexosPendentes, setAnexosPendentes] = useState<{ arquivo: File; preview: string }[]>([]);
  const [enviandoMensagem, setEnviandoMensagem] = useState(false);
  const [showBanModal, setShowBanModal] = useState(false);
  const [banReason, setBanReason] = useState('');
  const [banType, setBanType] = useState<'temporary' | 'permanent'>('permanent');
  const [banDuration, setBanDuration] = useState(30); // dias
  const [logs, setLogs] = useState<AdminLog[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [stats, setStats] = useState({
    total: 0,
    online: 0,
    offline: 0,
    banned: 0,
    total_occurrences: 0,
    resolved_today: 0,
  });
  const [unassignedOccurrences, setUnassignedOccurrences] = useState<UnassignedOccurrence[]>([]);
  const [assignmentTargets, setAssignmentTargets] = useState<Record<string, string>>({});
  const [assigningOccurrenceId, setAssigningOccurrenceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [pageError, setPageError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setPageError('');
    try {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const [fiscaisResult, locationsResult, bannedResult, occurrencesResult, resolvedResult, unassignedResult] = await Promise.all([
        supabase.from('fiscais').select('*'),
        supabase.from('fiscal_location').select('*').order('last_seen', { ascending: false }),
        supabase.from('banned_users').select('id, ban_type, expires_at'),
        supabase.from('ocorrencias').select('fiscal_registrou, status'),
        supabase.from('auditoria').select('id', { count: 'exact', head: true })
          .eq('status_novo', 'Resolvida').gte('created_at', startOfDay.toISOString()),
        supabase.from('ocorrencias')
          .select('id, categoria, descricao, bairro, endereco, urgencia, status, created_at')
          .is('fiscal_designado', null)
          .in('status', ['Aberta', 'Triada', 'Escalonada'])
          .order('created_at', { ascending: true })
          .limit(100),
      ]);

      const failure = [fiscaisResult.error, locationsResult.error, bannedResult.error, occurrencesResult.error, resolvedResult.error, unassignedResult.error]
        .find((error) => error !== null);
      if (failure) throw failure;

      const fiscaisData = fiscaisResult.data ?? [];
      const locations = (locationsResult.data ?? []) as LocationRow[];
      const banned = (bannedResult.data ?? []) as BanRow[];
      const occurrences = (occurrencesResult.data ?? []) as OccurrenceStatsRow[];
      setUnassignedOccurrences((unassignedResult.data ?? []) as UnassignedOccurrence[]);
      const activeBanIds = new Set(banned
        .filter((ban) => ban.ban_type === 'permanent' || Boolean(ban.expires_at && new Date(ban.expires_at).getTime() > Date.now()))
        .map((ban) => ban.id));

      const locationMap = new Map<string, LocationRow>();
      locations.forEach((location) => {
        const previous = locationMap.get(location.fiscal_id);
        if (!previous || new Date(location.last_seen) > new Date(previous.last_seen)) {
          locationMap.set(location.fiscal_id, location);
        }
      });

      const occurrenceStats = new Map<string, { total: number; resolved: number }>();
      occurrences.forEach((occurrence) => {
        if (!occurrence.fiscal_registrou) return;
        const current = occurrenceStats.get(occurrence.fiscal_registrou) ?? { total: 0, resolved: 0 };
        current.total += 1;
        if (occurrence.status === 'Resolvida') current.resolved += 1;
        occurrenceStats.set(occurrence.fiscal_registrou, current);
      });

      const processedFiscais: FiscalWithStatus[] = fiscaisData.map((fiscal) => {
        const location = locationMap.get(fiscal.id);
        const lastSeen = location?.last_seen ?? fiscal.created_at ?? '';
        const isOnline = Boolean(location?.is_online) && Date.now() - new Date(lastSeen).getTime() < 5 * 60 * 1000;
        const fiscalStats = occurrenceStats.get(fiscal.id) ?? { total: 0, resolved: 0 };
        const hasCoordinates = location && Number.isFinite(location.latitude) && Number.isFinite(location.longitude)
          && (location.latitude !== 0 || location.longitude !== 0);

        return {
          ...fiscal,
          is_online: isOnline,
          last_seen: lastSeen,
          current_location: hasCoordinates ? { lat: location.latitude, lng: location.longitude } : null,
          battery_level: location?.battery_level ?? null,
          occurrence_count: fiscalStats.total,
          resolved_count: fiscalStats.resolved,
          is_banned: activeBanIds.has(fiscal.id),
        };
      });

      setFiscais(processedFiscais);
      setStats({
        total: processedFiscais.length,
        online: processedFiscais.filter((fiscal) => fiscal.is_online).length,
        offline: processedFiscais.filter((fiscal) => !fiscal.is_online).length,
        banned: processedFiscais.filter((fiscal) => fiscal.is_banned).length,
        total_occurrences: occurrences.length,
        resolved_today: resolvedResult.count ?? 0,
      });
    } catch (error) {
      console.error('Erro ao carregar dados administrativos:', error);
      setPageError('Não foi possível carregar os dados. Confira as migrations e políticas do Supabase.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const verifyAdmin = async () => {
      const { data: isAdmin, error } = await supabase.rpc('is_admin');
      if (!active) return;
      if (error || !isAdmin) {
        setPageError(error ? 'Não foi possível verificar sua permissão administrativa.' : 'Acesso restrito a administradores do SIFAU.');
        setLoading(false);
        return;
      }
      setAuthorized(true);
      await loadData();
    };
    void verifyAdmin();
    return () => { active = false; };
  }, [loadData]);

  // Filtrar fiscais
  useEffect(() => {
    let filtered = fiscais;

    if (searchTerm) {
      filtered = filtered.filter(f =>
        f.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
        f.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        f.bairro.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (statusFilter === 'online') {
      filtered = filtered.filter(f => f.is_online);
    } else if (statusFilter === 'offline') {
      filtered = filtered.filter(f => !f.is_online);
    }

    setFilteredFiscais(filtered);
  }, [searchTerm, statusFilter, fiscais]);

  const loadMessages = useCallback(async (fiscalId: string) => {
    const { data, error } = await supabase
      .from('admin_messages')
      .select('*')
      .eq('fiscal_id', fiscalId)
      .order('created_at', { ascending: true })
      .limit(100);
    if (error) {
      setActionMessage('Não foi possível carregar a conversa.');
      return;
    }

    const conversation = (data ?? []) as AdminMessage[];
    const unreadIds = conversation
      .filter((message) => message.sender_type === 'fiscal' && !message.read_at)
      .map((message) => message.id);
    if (unreadIds.length > 0) {
      const readAt = new Date().toISOString();
      const { error: readError } = await supabase
        .from('admin_messages')
        .update({ read_at: readAt })
        .in('id', unreadIds);
      if (!readError) {
        conversation.forEach((message) => {
          if (unreadIds.includes(message.id)) message.read_at = readAt;
        });
      }
    }
    setMessages(conversation);
  }, []);

  const selectedFiscalId = selectedFiscal?.id;
  useEffect(() => {
    if (!selectedFiscalId) {
      setMessages([]);
      return;
    }

    void loadMessages(selectedFiscalId);
    const channel = supabase
      .channel(`admin-messages-${selectedFiscalId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'admin_messages', filter: `fiscal_id=eq.${selectedFiscalId}`,
      }, () => { void loadMessages(selectedFiscalId); })
      .subscribe();
    const refreshId = window.setInterval(() => { void loadMessages(selectedFiscalId); }, 30000);
    return () => {
      window.clearInterval(refreshId);
      void supabase.removeChannel(channel);
    };
  }, [selectedFiscalId, loadMessages]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadLogs = async () => {
    const { data, error } = await supabase
      .from('admin_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) {
      setActionMessage('Não foi possível carregar os logs administrativos.');
      return;
    }
    setLogs((data ?? []) as AdminLog[]);
  };

  const sendMessage = async () => {
    if (!selectedFiscal || enviandoMensagem) return;
    if (!newMessage.trim() && anexosPendentes.length === 0) return;
    setActionMessage('');

    const { data: adminData, error: authError } = await supabase.auth.getUser();
    const adminId = adminData.user?.id;
    if (authError || !adminId) {
      setActionMessage('Sua sessão expirou. Entre novamente para enviar mensagens.');
      return;
    }

    setEnviandoMensagem(true);

    // Os anexos sobem pela pasta de quem envia (o administrador). Se algum
    // falhar, a mensagem NÃO é enviada: mensagem anunciando anexo que não
    // existe é pior que mensagem nenhuma.
    let anexos: AnexoDeMensagem[] = [];
    try {
      anexos = await prepararAnexosDeMensagem({
        remetenteId: adminId,
        arquivos: anexosPendentes.map((item) => item.arquivo),
      });
      await enviarAnexosDeMensagem(anexos);
    } catch (error) {
      console.error('Erro ao enviar anexos da mensagem:', error);
      setActionMessage(
        error instanceof Error
          ? `Nenhuma mensagem foi enviada. ${error.message}`
          : 'Não foi possível enviar os anexos. Nenhuma mensagem foi enviada.',
      );
      setEnviandoMensagem(false);
      return;
    }

    const { error } = await supabase.from('admin_messages').insert({
      admin_id: adminId,
      fiscal_id: selectedFiscal.id,
      sender_type: 'admin',
      message: newMessage.trim(),
      attachments: anexos.map((anexo) => anexo.path),
    });

    if (error) {
      console.error('Erro ao enviar mensagem:', error);
      // A mensagem não existe; o arquivo que já subiu não pode ficar pagando
      // cota sozinho no bucket.
      await descartarAnexosDeMensagem(anexos);
      setActionMessage('Não foi possível enviar a mensagem. Tente novamente.');
    } else {
      limparPendentes();
      setNewMessage('');
      await loadMessages(selectedFiscal.id);
    }

    setEnviandoMensagem(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const arquivos = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (arquivos.length === 0) return;

    const recusados: string[] = [];
    const aceitos: { arquivo: File; preview: string }[] = [];

    for (const arquivo of arquivos) {
      if (!fileUtils.validateFileSize(arquivo)) {
        recusados.push(`${arquivo.name} (acima de ${fileUtils.LIMITE_MB} MB)`);
        continue;
      }
      if (!fileUtils.validateFileType(arquivo)) {
        recusados.push(`${arquivo.name} (tipo não aceito)`);
        continue;
      }
      aceitos.push({
        arquivo,
        preview: arquivo.type.startsWith('image/') ? URL.createObjectURL(arquivo) : '',
      });
    }

    if (recusados.length > 0) {
      setActionMessage(`Não dá para anexar: ${recusados.join('; ')}. Use imagem, PDF ou Word de até ${fileUtils.LIMITE_MB} MB.`);
    } else {
      setActionMessage('');
    }

    setAnexosPendentes((atuais) => [...atuais, ...aceitos]);
  };

  const removerPendente = (indice: number) => {
    setAnexosPendentes((atuais) => {
      const item = atuais[indice];
      if (item?.preview) URL.revokeObjectURL(item.preview);
      return atuais.filter((_, idx) => idx !== indice);
    });
  };

  const limparPendentes = () => {
    setAnexosPendentes((atuais) => {
      atuais.forEach((item) => { if (item.preview) URL.revokeObjectURL(item.preview); });
      return [];
    });
  };

  const banUser = async () => {
    if (!selectedFiscal) return;
    if (banReason.trim().length < 5) {
      setActionMessage('Informe um motivo com pelo menos cinco caracteres.');
      return;
    }
    setActionMessage('');

    const { data: adminData, error: authError } = await supabase.auth.getUser();
    const adminId = adminData.user?.id;
    if (authError || !adminId) {
      setActionMessage('Sua sessão expirou. Entre novamente para continuar.');
      return;
    }

    const expiresAt = banType === 'temporary'
      ? new Date(Date.now() + banDuration * 24 * 60 * 60 * 1000).toISOString()
      : null;
    const { error: banError } = await supabase.from('banned_users').upsert({
      id: selectedFiscal.id,
      fiscal_id: selectedFiscal.id,
      banned_by: adminId,
      reason: banReason.trim(),
      ban_type: banType,
      expires_at: expiresAt,
    }, { onConflict: 'id' });

    if (banError) {
      console.error('Erro ao banir usuário:', banError);
      setActionMessage('Não foi possível registrar o banimento. Confira as políticas do Supabase.');
      return;
    }

    const { error: logError } = await supabase.from('admin_logs').insert({
      admin_id: adminId,
      action: 'BAN_USER',
      target_type: 'fiscal',
      target_id: selectedFiscal.id,
      details: {
        fiscal_name: selectedFiscal.nome,
        ban_type: banType,
        reason: banReason.trim(),
        expires_at: expiresAt,
      },
    });

    setShowBanModal(false);
    setBanReason('');
    if (logError) setActionMessage('Banimento registrado, mas não foi possível gravar o log administrativo.');
    await loadData();
  };

  const unbanUser = async (fiscalId: string) => {
    const { data: adminData, error: authError } = await supabase.auth.getUser();
    const adminId = adminData.user?.id;
    if (authError || !adminId) {
      setActionMessage('Sua sessão expirou. Entre novamente para continuar.');
      return;
    }

    const { error } = await supabase.from('banned_users').delete().eq('id', fiscalId);
    if (error) {
      setActionMessage('Não foi possível remover o banimento.');
      return;
    }
    await supabase.from('admin_logs').insert({
      admin_id: adminId,
      action: 'UNBAN_USER',
      target_type: 'fiscal',
      target_id: fiscalId,
      details: { reason: 'Remoção manual do banimento' },
    });
    await loadData();
  };

  const eligibleFiscals = fiscais.filter((fiscal) => fiscal.ativo && !fiscal.is_banned);

  const setFiscalActive = async (fiscal: FiscalWithStatus, active: boolean) => {
    setActionMessage('');
    const { error } = await supabase.rpc('set_fiscal_active', {
      p_fiscal_id: fiscal.id,
      p_active: active,
    });
    if (error) {
      console.error('Erro ao atualizar o acesso do fiscal:', error);
      setActionMessage('Não foi possível atualizar o acesso deste fiscal.');
      return;
    }
    await loadData();
  };

  const assignOccurrence = async (occurrenceId: string) => {
    const targetId = assignmentTargets[occurrenceId] || eligibleFiscals[0]?.id;
    if (!targetId) {
      setActionMessage('Não há fiscais ativos e sem banimento para receber esta ocorrência.');
      return;
    }
    setAssigningOccurrenceId(occurrenceId);
    setActionMessage('');
    const { error } = await supabase.rpc('assign_occurrence', {
      p_occurrence_id: occurrenceId,
      p_target_fiscal_id: targetId,
    });
    if (error) {
      console.error('Erro ao distribuir ocorrência:', error);
      setActionMessage('Não foi possível atribuir a ocorrência. Atualize a lista e tente novamente.');
    } else {
      setActionMessage('Ocorrência atribuída com sucesso.');
      await loadData();
    }
    setAssigningOccurrenceId(null);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleLogout = async () => {
    const { error } = await signOut();
    if (error) setActionMessage('Não foi possível encerrar a sessão.');
  };

  const exportData = async () => {
    const { data, error } = await supabase.from('fiscais').select('*');
    if (error || !data) {
      setActionMessage('Não foi possível exportar os fiscais.');
      return;
    }

    const csvValue = (value: unknown) => {
      const text = String(value ?? '');
      const firstFormulaCharacter = text.trimStart()[0] ?? '';
      const safeText = /^[=+\-@]/.test(firstFormulaCharacter) || /^[\t\r\n]/.test(text)
        ? `'${text}`
        : text;
      return `"${safeText.replace(/"/g, '""')}"`;
    };
    const headers = ['ID', 'Nome', 'Email', 'Telefone', 'Bairro', 'Especialidade', 'Ativo', 'Criado em'];
    const rows = data.map((fiscal) => [
      fiscal.id, fiscal.nome, fiscal.email, fiscal.telefone, fiscal.bairro,
      fiscal.especialidade, fiscal.ativo ? 'Sim' : 'Não', fiscal.created_at,
    ].map(csvValue).join(','));
    const csv = [headers.map(csvValue).join(','), ...rows].join('\r\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fiscais_export_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="loading-screen">
        <RefreshCw className="spin" size={30} />
        <span>Carregando painel administrativo...</span>
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h2>Área restrita</h2>
          <p className="muted">{pageError || 'Somente administradores podem acessar este painel.'}</p>
          <button className="ghost-button full" onClick={handleLogout}>Encerrar sessão</button>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-screen">
      <header className="admin-header">
        <div className="admin-brand">
          <ShieldCheck size={24} />
          <div>
            <h1>Painel Administrativo SIFAU</h1>
            <p>Controle total do sistema</p>
          </div>
        </div>
        <div className="admin-actions">
          <button onClick={handleRefresh} disabled={refreshing} className="icon-button">
            <RefreshCw className={refreshing ? 'spin' : ''} size={20} />
          </button>
          <button onClick={exportData} className="icon-button">
            <Download size={20} />
          </button>
          <button onClick={() => { setShowLogs(true); loadLogs(); }} className="icon-button">
            <FileText size={20} />
          </button>
          <button onClick={handleLogout} className="icon-button logout">
            <LogOut size={20} />
          </button>
        </div>
      </header>
      {pageError && <div className="form-message" role="alert"><AlertTriangle size={16} />{pageError}</div>}
      {actionMessage && <div className="form-message" role="status"><AlertTriangle size={16} />{actionMessage}</div>}

      {/* Stats Cards */}
      <div className="admin-stats">
        <div className="stat-card">
          <Users size={24} />
          <div>
            <strong>{stats.total}</strong>
            <span>Total Fiscais</span>
          </div>
        </div>
        <div className="stat-card online">
          <CheckCircle size={24} />
          <div>
            <strong>{stats.online}</strong>
            <span>Online Agora</span>
          </div>
        </div>
        <div className="stat-card offline">
          <XCircle size={24} />
          <div>
            <strong>{stats.offline}</strong>
            <span>Offline</span>
          </div>
        </div>
        <div className="stat-card banned">
          <Ban size={24} />
          <div>
            <strong>{stats.banned}</strong>
            <span>Banidos</span>
          </div>
        </div>
        <div className="stat-card">
          <Activity size={24} />
          <div>
            <strong>{stats.total_occurrences}</strong>
            <span>Total Ocorrências</span>
          </div>
        </div>
        <div className="stat-card success">
          <BarChart3 size={24} />
          <div>
            <strong>{stats.resolved_today}</strong>
            <span>Resolvidas Hoje</span>
          </div>
        </div>
      </div>

      <section className="admin-triage" aria-labelledby="admin-triage-heading">
        <div className="admin-triage-heading">
          <div>
            <span className="eyebrow">Distribuição</span>
            <h2 id="admin-triage-heading">Ocorrências sem fiscal designado</h2>
          </div>
          <span className="count-chip">{unassignedOccurrences.length} pendentes</span>
        </div>
        {unassignedOccurrences.length === 0 ? (
          <p className="admin-triage-empty">Não há ocorrências aguardando distribuição.</p>
        ) : eligibleFiscals.length === 0 ? (
          <p className="admin-triage-empty">Ative pelo menos um fiscal não banido para distribuir os casos.</p>
        ) : (
          <div className="admin-triage-list">
            {unassignedOccurrences.map((occurrence) => (
              <article className="admin-triage-card" key={occurrence.id}>
                <div className="admin-triage-details">
                  <b>{occurrence.categoria} <span className="urgency">{occurrence.urgencia}</span></b>
                  <span>{occurrence.endereco} · {occurrence.bairro} · {occurrence.status}</span>
                  <p>{occurrence.descricao}</p>
                </div>
                <div className="admin-triage-actions">
                  <select
                    aria-label={`Fiscal para ${occurrence.categoria} em ${occurrence.bairro}`}
                    value={assignmentTargets[occurrence.id] || eligibleFiscals[0]?.id || ''}
                    onChange={(event) => setAssignmentTargets((current) => ({ ...current, [occurrence.id]: event.target.value }))}
                  >
                    {eligibleFiscals.map((fiscal) => (
                      <option key={fiscal.id} value={fiscal.id}>{fiscal.nome} · {fiscal.bairro}</option>
                    ))}
                  </select>
                  <button
                    className="primary-button small"
                    disabled={assigningOccurrenceId === occurrence.id}
                    onClick={() => { void assignOccurrence(occurrence.id); }}
                  >
                    {assigningOccurrenceId === occurrence.id ? 'Atribuindo…' : 'Atribuir'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Filters */}
      <div className="admin-filters">
        <div className="search-box">
          <Search size={18} />
          <input
            type="text"
            placeholder="Buscar por nome, email ou bairro..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="filter-buttons">
          <button
            className={statusFilter === 'all' ? 'active' : ''}
            onClick={() => setStatusFilter('all')}
          >
            Todos
          </button>
          <button
            className={statusFilter === 'online' ? 'active' : ''}
            onClick={() => setStatusFilter('online')}
          >
            <CheckCircle size={16} /> Online
          </button>
          <button
            className={statusFilter === 'offline' ? 'active' : ''}
            onClick={() => setStatusFilter('offline')}
          >
            <XCircle size={16} /> Offline
          </button>
        </div>
      </div>

      {/* Fiscal List */}
      <div className="fiscal-list">
        {filteredFiscais.length === 0 ? (
          <div className="empty-state">
            <Search size={48} />
            <p>Nenhum fiscal encontrado</p>
          </div>
        ) : (
          filteredFiscais.map(fiscal => (
            <div
              key={fiscal.id}
              className={`fiscal-card ${selectedFiscal?.id === fiscal.id ? 'selected' : ''} ${fiscal.is_banned ? 'banned' : ''}`}
              onClick={() => setSelectedFiscal(fiscal)}
            >
              <div className="fiscal-avatar">
                {fiscal.nome.charAt(0)}
                <span className={`status-indicator ${fiscal.is_online ? 'online' : 'offline'}`} />
              </div>
              <div className="fiscal-info">
                <div className="fiscal-header">
                  <h3>{fiscal.nome}</h3>
                  <span className={`status-badge ${fiscal.ativo ? 'online' : 'offline'}`}>
                    {fiscal.ativo ? 'Ativo' : 'Aguardando aprovação'}
                  </span>
                  {fiscal.is_banned && <Ban size={16} className="ban-icon" />}
                </div>
                <p className="fiscal-email">{fiscal.email}</p>
                <div className="fiscal-details">
                  <span className="fiscal-bairro">{fiscal.bairro}</span>
                  {fiscal.especialidade && <span className="fiscal-especialidade">{fiscal.especialidade}</span>}
                </div>
                <div className="fiscal-stats">
                  <span><Activity size={14} /> {fiscal.occurrence_count} ocorrências</span>
                  <span><CheckCircle size={14} /> {fiscal.resolved_count} resolvidas</span>
                </div>
              </div>
              <div className="fiscal-status">
                <div className={`status-badge ${fiscal.is_online ? 'online' : 'offline'}`}>
                  {fiscal.is_online ? <CheckCircle size={14} /> : <XCircle size={14} />}
                  {fiscal.is_online ? 'Online' : 'Offline'}
                </div>
                {fiscal.current_location && (
                  <div className="location-badge">
                    <MapPin size={14} />
                    Localização disponível
                  </div>
                )}
                {fiscal.battery_level !== null && (
                  <div className="battery-badge">
                    Bateria: {fiscal.battery_level}%
                  </div>
                )}
                <div className="last-seen">
                  <Clock size={12} />
                  {new Date(fiscal.last_seen).toLocaleString('pt-BR')}
                </div>
              </div>
              <div className="fiscal-actions">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    void setFiscalActive(fiscal, !fiscal.ativo);
                  }}
                  className={`action-button ${fiscal.ativo ? 'ban' : 'unban'}`}
                  title={fiscal.ativo ? 'Desativar acesso' : 'Aprovar e ativar fiscal'}
                  aria-label={fiscal.ativo ? 'Desativar acesso' : 'Aprovar e ativar fiscal'}
                >
                  {fiscal.ativo ? <UserX size={18} /> : <UserCheck size={18} />}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedFiscal(fiscal);
                    setShowChat(true);
                  }}
                  className="action-button chat"
                  title="Enviar mensagem"
                >
                  <MessageSquare size={18} />
                </button>
                {fiscal.is_banned ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      unbanUser(fiscal.id);
                    }}
                    className="action-button unban"
                    title="Desbanir"
                  >
                    <CheckCircle size={18} />
                  </button>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedFiscal(fiscal);
                      setShowBanModal(true);
                    }}
                    className="action-button ban"
                    title="Banir usuário"
                  >
                    <Ban size={18} />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Chat Modal */}
      {showChat && selectedFiscal && (
        <div className="modal-overlay" onClick={() => setShowChat(false)}>
          <div className="chat-modal" onClick={(e) => e.stopPropagation()}>
            <div className="chat-header">
              <div className="chat-fiscal-info">
                <div className="chat-avatar">{selectedFiscal.nome.charAt(0)}</div>
                <div>
                  <h3>{selectedFiscal.nome}</h3>
                  <p>{selectedFiscal.email}</p>
                </div>
              </div>
              <button onClick={() => setShowChat(false)} className="icon-button">
                <X size={20} />
              </button>
            </div>
            <div className="chat-messages">
              {messages.length === 0 ? (
                <div className="chat-empty">
                  <MessageSquare size={48} />
                  <p>Nenhuma mensagem ainda</p>
                  <small>Inicie uma conversa com {selectedFiscal.nome}</small>
                </div>
              ) : (
                messages.map(msg => (
                  <div
                    key={msg.id}
                    className={`chat-message ${msg.sender_type === 'admin' ? 'sent' : 'received'}`}
                  >
                    <div className="message-content">
                      <p>{msg.message}</p>
                      {msg.attachments.length > 0 && (
                        <div className="message-attachments">
                          {msg.attachments.map((caminho) => (
                            <div key={caminho} className="attachment-preview">
                              {ehImagem(caminho) ? (
                                <AnexoImagem path={caminho} alt="Anexo da mensagem" />
                              ) : (
                                <div className="file-attachment">
                                  <FileText size={24} />
                                  <span>{nomeDoAnexoDaMensagem(caminho)}</span>
                                  <BotaoBaixarAnexo
                                    path={caminho}
                                    nome={nomeDoAnexoDaMensagem(caminho)}
                                    titulo="Baixar anexo"
                                  />
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      <small className="message-time">
                        {new Date(msg.created_at).toLocaleString('pt-BR')}
                        {msg.read_at && ' • Lida'}
                      </small>
                    </div>
                  </div>
                ))
              )}
              <div ref={chatEndRef} />
            </div>
            <div className="chat-input">
              {anexosPendentes.length > 0 && (
                <div className="chat-attachments">
                  {anexosPendentes.map((item, i) => (
                    <div key={item.arquivo.name + i} className="attachment-preview small">
                      {item.preview ? (
                        <img src={item.preview} alt={item.arquivo.name} />
                      ) : (
                        <FileText size={20} />
                      )}
                      <button onClick={() => removerPendente(i)} title={`Remover ${item.arquivo.name}`}>
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="input-row">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="icon-button"
                  title="Anexar arquivo"
                >
                  <Camera size={20} />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*,.pdf,.doc,.docx"
                  style={{ display: 'none' }}
                  onChange={handleFileUpload}
                />
                <input
                  type="text"
                  placeholder="Digite sua mensagem..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                />
                <button onClick={sendMessage} className="send-button" disabled={enviandoMensagem}>
                  {enviandoMensagem ? <Clock size={20} /> : <Send size={20} />}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Ban Modal */}
      {showBanModal && selectedFiscal && (
        <div className="modal-overlay" onClick={() => setShowBanModal(false)}>
          <div className="ban-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ban-header">
              <AlertTriangle size={24} />
              <h2>Banir Usuário</h2>
            </div>
            <div className="ban-content">
              <p>Você está prestes a banir <strong>{selectedFiscal.nome}</strong></p>
              <div className="ban-options">
                <label>
                  <input
                    type="radio"
                    value="temporary"
                    checked={banType === 'temporary'}
                    onChange={(e) => setBanType(e.target.value as 'temporary' | 'permanent')}
                  />
                  Banimento temporário
                </label>
                {banType === 'temporary' && (
                  <select
                    value={banDuration}
                    onChange={(e) => setBanDuration(Number(e.target.value))}
                  >
                    <option value={1}>1 dia</option>
                    <option value={7}>7 dias</option>
                    <option value={30}>30 dias</option>
                    <option value={90}>90 dias</option>
                  </select>
                )}
                <label>
                  <input
                    type="radio"
                    value="permanent"
                    checked={banType === 'permanent'}
                    onChange={(e) => setBanType(e.target.value as 'temporary' | 'permanent')}
                  />
                  Banimento permanente
                </label>
              </div>
              <label className="ban-reason">
                Motivo do banimento:
                <textarea
                  value={banReason}
                  onChange={(e) => setBanReason(e.target.value)}
                  placeholder="Descreva o motivo do banimento..."
                  rows={3}
                />
              </label>
              <div className="ban-warning">
                <AlertTriangle size={16} />
                <p>
                  {banType === 'permanent' 
                    ? 'Este usuário perderá acesso permanentemente ao sistema.'
                    : `Este usuário perderá acesso por ${banDuration} dia(s).`}
                </p>
              </div>
            </div>
            <div className="ban-actions">
              <button onClick={() => setShowBanModal(false)} className="cancel-button">
                Cancelar
              </button>
              <button onClick={banUser} className="ban-button">
                <Ban size={18} /> Confirmar Banimento
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Logs Modal */}
      {showLogs && (
        <div className="modal-overlay" onClick={() => setShowLogs(false)}>
          <div className="logs-modal" onClick={(e) => e.stopPropagation()}>
            <div className="logs-header">
              <FileText size={24} />
              <h2>Logs de Atividades</h2>
              <button onClick={() => setShowLogs(false)} className="icon-button">
                <X size={20} />
              </button>
            </div>
            <div className="logs-content">
              {logs.length === 0 ? (
                <div className="empty-state">
                  <FileText size={48} />
                  <p>Nenhuma atividade registrada</p>
                </div>
              ) : (
                logs.map(log => (
                  <div key={log.id} className="log-entry">
                    <div className="log-header">
                      <span className="log-action">{log.action}</span>
                      <span className="log-time">
                        {new Date(log.created_at).toLocaleString('pt-BR')}
                      </span>
                    </div>
                    <div className="log-details">
                      <span className="log-target">{log.target_type}: {log.target_id}</span>
                      {log.ip_address && <span className="log-ip">IP: {log.ip_address}</span>}
                    </div>
                    {log.details && (
                      <pre className="log-json">{JSON.stringify(log.details, null, 2)}</pre>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useEffect, useState, useRef } from 'react';
import {
  ShieldCheck,
  Users,
  MapPin,
  MessageSquare,
  Ban,
  Search,
  Filter,
  MoreVertical,
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
  Trash2,
  UserPlus,
  BarChart3,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Fiscal } from '@/lib/types';

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
  details: any;
  ip_address: string | null;
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
  const [attachments, setAttachments] = useState<string[]>([]);
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
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Carregar dados iniciais
  const loadData = async () => {
    setLoading(true);
    try {
      // Carregar fiscais com status
      const { data: fiscaisData } = await supabase.from('fiscais').select('*');
      
      // Carregar localizações
      const { data: locations } = await supabase
        .from('fiscal_location')
        .select('*')
        .order('last_seen', { ascending: false });

      // Carregar usuários banidos
      const { data: banned } = await supabase.from('banned_users').select('id');

      // Carregar estatísticas de ocorrências
      const { data: occurrences } = await supabase
        .from('ocorrencias')
        .select('fiscal_registrou, status');

      // Processar dados
      const fiscalMap = new Map(fiscaisData?.map(f => [f.id, f]) || []);
      const locationMap = new Map();
      const bannedSet = new Set(banned?.map(b => b.id) || []);
      
      // Agrupar localizações mais recentes por fiscal
      locations?.forEach(loc => {
        if (!locationMap.has(loc.fiscal_id) || new Date(loc.last_seen) > new Date(locationMap.get(loc.fiscal_id).last_seen)) {
          locationMap.set(loc.fiscal_id, loc);
        }
      });

      // Contar ocorrências por fiscal
      const occurrenceStats = new Map();
      occurrences?.forEach(occ => {
        if (occ.fiscal_registrou) {
          const stats = occurrenceStats.get(occ.fiscal_registrou) || { total: 0, resolved: 0 };
          stats.total++;
          if (occ.status === 'Resolvida') stats.resolved++;
          occurrenceStats.set(occ.fiscal_registrou, stats);
        }
      });

      const processedFiscais: FiscalWithStatus[] = (fiscaisData || []).map(fiscal => {
        const location = locationMap.get(fiscal.id);
        const isOnline = location ? (new Date().getTime() - new Date(location.last_seen).getTime()) < 5 * 60 * 1000 : false;
        const stats = occurrenceStats.get(fiscal.id) || { total: 0, resolved: 0 };

        return {
          ...fiscal,
          is_online: isOnline,
          last_seen: location?.last_seen || fiscal.created_at,
          current_location: location ? { lat: location.latitude, lng: location.longitude } : null,
          battery_level: location?.battery_level || null,
          occurrence_count: stats.total,
          resolved_count: stats.resolved,
          is_banned: bannedSet.has(fiscal.id),
        };
      });

      setFiscais(processedFiscais);
      setFilteredFiscais(processedFiscais);

      // Calcular estatísticas
      const today = new Date().toISOString().split('T')[0];
      const resolvedToday = occurrences?.filter(o => 
        o.status === 'Resolvida' && o.created_at.startsWith(today)
      ).length || 0;

      setStats({
        total: processedFiscais.length,
        online: processedFiscais.filter(f => f.is_online).length,
        offline: processedFiscais.filter(f => !f.is_online).length,
        banned: processedFiscais.filter(f => f.is_banned).length,
        total_occurrences: occurrences?.length || 0,
        resolved_today: resolvedToday,
      });

    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

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

  // Carregar mensagens quando selecionar fiscal
  useEffect(() => {
    if (selectedFiscal) {
      loadMessages(selectedFiscal.id);
    }
  }, [selectedFiscal]);

  // Auto-scroll no chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadMessages = async (fiscalId: string) => {
    const { data } = await supabase
      .from('admin_messages')
      .select('*')
      .eq('fiscal_id', fiscalId)
      .order('created_at', { ascending: true });
    setMessages(data || []);
  };

  const loadLogs = async () => {
    const { data } = await supabase
      .from('admin_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    setLogs(data || []);
  };

  const sendMessage = async () => {
    if (!selectedFiscal || (!newMessage.trim() && attachments.length === 0)) return;

    const { data: adminData } = await supabase.auth.getUser();
    if (!adminData.user) return;

    const { error } = await supabase.from('admin_messages').insert({
      admin_id: adminData.user.id,
      fiscal_id: selectedFiscal.id,
      sender_type: 'admin',
      message: newMessage.trim(),
      attachments: attachments,
    });

    if (error) {
      console.error('Erro ao enviar mensagem:', error);
    } else {
      setNewMessage('');
      setAttachments([]);
      loadMessages(selectedFiscal.id);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const readers = Array.from(files).map(file => 
      new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      })
    );

    Promise.all(readers).then(results => {
      setAttachments([...attachments, ...results]);
    });
  };

  const banUser = async () => {
    if (!selectedFiscal) return;

    const { data: adminData } = await supabase.auth.getUser();
    if (!adminData.user) return;

    const expiresAt = banType === 'temporary' 
      ? new Date(Date.now() + banDuration * 24 * 60 * 60 * 1000).toISOString()
      : null;

    // Inserir na tabela de banidos
    const { error: banError } = await supabase.from('banned_users').insert({
      id: selectedFiscal.id,
      fiscal_id: selectedFiscal.id,
      banned_by: adminData.user.id,
      reason: banReason,
      ban_type: banType,
      expires_at: expiresAt,
    });

    if (banError) {
      console.error('Erro ao banir usuário:', banError);
      return;
    }

    // Fazer wipe dos dados se solicitado
    if (confirm('Deseja apagar todos os dados deste fiscal? Esta ação é irreversível.')) {
      await supabase.rpc('wipe_user_data', { user_id: selectedFiscal.id });
    }

    // Log da ação
    await supabase.from('admin_logs').insert({
      admin_id: adminData.user.id,
      action: 'BAN_USER',
      target_type: 'fiscal',
      target_id: selectedFiscal.id,
      details: {
        fiscal_name: selectedFiscal.nome,
        ban_type: banType,
        reason: banReason,
        expires_at: expiresAt,
      },
    });

    setShowBanModal(false);
    setBanReason('');
    loadData();
  };

  const unbanUser = async (fiscalId: string) => {
    const { data: adminData } = await supabase.auth.getUser();
    if (!adminData.user) return;

    await supabase.from('banned_users').delete().eq('id', fiscalId);

    await supabase.from('admin_logs').insert({
      admin_id: adminData.user.id,
      action: 'UNBAN_USER',
      target_type: 'fiscal',
      target_id: fiscalId,
      details: { reason: 'Admin manual unban' },
    });

    loadData();
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.reload();
  };

  const exportData = async () => {
    const { data } = await supabase.from('fiscais').select('*');
    if (!data) return;

    const csv = [
      'ID,Nome,Email,Telefone,Bairro,Especialidade,Ativo,Criado em',
      ...data.map(f => 
        `${f.id},"${f.nome}","${f.email}","${f.telefone}","${f.bairro}","${f.especialidade || ''}",${f.ativo},${f.created_at}`
      )
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fiscais_export_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  if (loading) {
    return (
      <div className="loading-screen">
        <RefreshCw className="spin" size={30} />
        <span>Carregando painel administrativo...</span>
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
                          {msg.attachments.map((att, i) => (
                            <div key={i} className="attachment-preview">
                              {att.startsWith('data:image') ? (
                                <img src={att} alt="Anexo" />
                              ) : (
                                <div className="file-attachment">
                                  <FileText size={24} />
                                  <span>Arquivo anexo</span>
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
              {attachments.length > 0 && (
                <div className="chat-attachments">
                  {attachments.map((att, i) => (
                    <div key={i} className="attachment-preview small">
                      {att.startsWith('data:image') ? (
                        <img src={att} alt="Preview" />
                      ) : (
                        <FileText size={20} />
                      )}
                      <button onClick={() => setAttachments(attachments.filter((_, idx) => idx !== i))}>
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
                  accept="image/*,video/*,.pdf,.doc,.docx"
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
                <button onClick={sendMessage} className="send-button">
                  <Send size={20} />
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

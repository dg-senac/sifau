import { useState } from 'react';
import { 
  Clock, 
  Filter, 
  Search, 
  Calendar, 
  Download, 
  Eye,
  FileText,
  Image as ImageIcon,
  FileCheck,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { Documento } from '@/lib/types';
import { fileUtils } from '@/lib/documents';

interface DocumentHistoryProps {
  documentos: Documento[];
  onView?: (doc: Documento) => void;
  onDownload?: (doc: Documento) => void;
  showFilters?: boolean;
}

type FilterType = 'all' | 'foto' | 'assinatura' | 'documento' | 'relatorio' | 'auto_infracao';
type SortType = 'recent' | 'oldest' | 'name' | 'size';

export function DocumentHistory({
  documentos,
  onView,
  onDownload,
  showFilters = true,
}: DocumentHistoryProps) {
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [sortType, setSortType] = useState<SortType>('recent');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Filtrar documentos
  const filteredDocs = documentos.filter(doc => {
    const matchesFilter = filterType === 'all' || doc.tipo_documento === filterType;
    const matchesSearch = searchTerm === '' || 
      doc.titulo?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.descricao?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.arquivo_nome?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  // Ordenar documentos
  const sortedDocs = [...filteredDocs].sort((a, b) => {
    switch (sortType) {
      case 'recent':
        return new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime();
      case 'oldest':
        return new Date(a.criado_em).getTime() - new Date(b.criado_em).getTime();
      case 'name':
        return (a.titulo || '').localeCompare(b.titulo || '');
      case 'size':
        return (b.arquivo_tamanho || 0) - (a.arquivo_tamanho || 0);
      default:
        return 0;
    }
  });

  // Agrupar por data
  const groupedDocs = sortedDocs.reduce((groups, doc) => {
    const date = new Date(doc.criado_em).toLocaleDateString('pt-BR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(doc);
    return groups;
  }, {} as Record<string, Documento[]>);

  const toggleGroup = (date: string) => {
    setExpandedGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(date)) {
        newSet.delete(date);
      } else {
        newSet.add(date);
      }
      return newSet;
    });
  };

  const getDocumentIcon = (tipo: string) => {
    switch (tipo) {
      case 'foto':
        return ImageIcon;
      case 'assinatura':
        return FileCheck;
      case 'documento':
        return FileText;
      case 'relatorio':
        return FileText;
      case 'auto_infracao':
        return FileText;
      default:
        return FileText;
    }
  };

  const getDocumentTypeLabel = (tipo: string) => {
    const labels: Record<string, string> = {
      foto: 'Foto',
      assinatura: 'Assinatura',
      documento: 'Documento',
      relatorio: 'Relatório',
      auto_infracao: 'Auto de Infração',
    };
    return labels[tipo] || tipo;
  };

  const getStats = () => {
    return {
      total: documentos.length,
      fotos: documentos.filter(d => d.tipo_documento === 'foto').length,
      assinaturas: documentos.filter(d => d.tipo_documento === 'assinatura').length,
      documentos: documentos.filter(d => d.tipo_documento === 'documento').length,
      relatorios: documentos.filter(d => d.tipo_documento === 'relatorio').length,
      autos: documentos.filter(d => d.tipo_documento === 'auto_infracao').length,
    };
  };

  const stats = getStats();

  return (
    <div className="document-history">
      {/* Estatísticas */}
      <div className="history-stats">
        <div className="stat-item">
          <strong>{stats.total}</strong>
          <span>Total</span>
        </div>
        <div className="stat-item">
          <ImageIcon size={16} />
          <strong>{stats.fotos}</strong>
          <span>Fotos</span>
        </div>
        <div className="stat-item">
          <FileCheck size={16} />
          <strong>{stats.assinaturas}</strong>
          <span>Assinaturas</span>
        </div>
        <div className="stat-item">
          <FileText size={16} />
          <strong>{stats.documentos + stats.relatorios + stats.autos}</strong>
          <span>Documentos</span>
        </div>
      </div>

      {/* Filtros */}
      {showFilters && (
        <div className="history-filters">
          <div className="search-box">
            <Search size={18} />
            <input
              type="text"
              placeholder="Buscar documentos..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          <div className="filter-buttons">
            <button
              className={filterType === 'all' ? 'active' : ''}
              onClick={() => setFilterType('all')}
            >
              Todos
            </button>
            <button
              className={filterType === 'foto' ? 'active' : ''}
              onClick={() => setFilterType('foto')}
            >
              <ImageIcon size={14} /> Fotos
            </button>
            <button
              className={filterType === 'assinatura' ? 'active' : ''}
              onClick={() => setFilterType('assinatura')}
            >
              <FileCheck size={14} /> Assinaturas
            </button>
            <button
              className={filterType === 'documento' ? 'active' : ''}
              onClick={() => setFilterType('documento')}
            >
              <FileText size={14} /> Documentos
            </button>
          </div>

          <div className="sort-dropdown">
            <Filter size={16} />
            <select
              value={sortType}
              onChange={(e) => setSortType(e.target.value as SortType)}
            >
              <option value="recent">Mais recentes</option>
              <option value="oldest">Mais antigos</option>
              <option value="name">Nome A-Z</option>
              <option value="size">Tamanho</option>
            </select>
          </div>
        </div>
      )}

      {/* Lista de documentos agrupados por data */}
      <div className="history-list">
        {Object.keys(groupedDocs).length === 0 ? (
          <div className="empty-state">
            <Clock size={48} />
            <p>Nenhum documento encontrado</p>
            {searchTerm && <small>Tente ajustar os filtros de busca</small>}
          </div>
        ) : (
          Object.entries(groupedDocs).map(([date, docs]) => {
            const isExpanded = expandedGroups.has(date);
            return (
              <div key={date} className="history-group">
                <button
                  className="history-group-header"
                  onClick={() => toggleGroup(date)}
                >
                  <Calendar size={16} />
                  <span>{date}</span>
                  <span className="group-count">({docs.length})</span>
                  {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
                
                {isExpanded && (
                  <div className="history-group-content">
                    {docs.map((doc) => {
                      const Icon = getDocumentIcon(doc.tipo_documento);
                      return (
                        <div key={doc.id} className="history-item">
                          <div className="history-item-icon">
                            <Icon size={20} />
                          </div>
                          <div className="history-item-info">
                            <div className="history-item-header">
                              <span className="history-item-title">
                                {doc.titulo || doc.arquivo_nome || 'Sem título'}
                              </span>
                              <span className="history-item-type">
                                {getDocumentTypeLabel(doc.tipo_documento)}
                              </span>
                            </div>
                            {doc.descricao && (
                              <p className="history-item-desc">{doc.descricao}</p>
                            )}
                            <div className="history-item-meta">
                              <span>
                                <Clock size={12} />
                                {new Date(doc.criado_em).toLocaleTimeString('pt-BR')}
                              </span>
                              {doc.arquivo_tamanho && (
                                <span>{fileUtils.formatFileSize(doc.arquivo_tamanho)}</span>
                              )}
                              {doc.metadados && Object.keys(doc.metadados).length > 0 && (
                                <span>
                                  <span className="metadata-badge">
                                    {Object.keys(doc.metadados).length} metadados
                                  </span>
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="history-item-actions">
                            {onView && (
                              <button
                                className="icon-button"
                                onClick={() => onView(doc)}
                                title="Visualizar"
                              >
                                <Eye size={18} />
                              </button>
                            )}
                            <button
                              className="icon-button"
                              onClick={() => onDownload ? onDownload(doc) : fileUtils.base64ToBlob(doc.arquivo_data, doc.arquivo_tipo || 'application/octet-stream')}
                              title="Baixar"
                            >
                              <Download size={18} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

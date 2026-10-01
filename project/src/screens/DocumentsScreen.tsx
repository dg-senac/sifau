import { useState, useEffect } from 'react';
import { 
  FileText, 
  Image as ImageIcon, 
  Upload, 
  Search, 
  Filter,
  FolderOpen,
  Calendar,
  Download,
  Trash2,
  Plus,
  Grid3x3,
  List,
  RefreshCw
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Fiscal, Documento } from '@/lib/types';
import { documentsApi, fileUtils } from '@/lib/documents';
import { DocumentGallery } from '@/components/DocumentGallery';
import { DocumentHistory } from '@/components/DocumentHistory';
import { PageTitle, EmptyState } from '@/components/ui';

type ViewMode = 'gallery' | 'history';
type FilterType = 'all' | 'ocorrencia' | 'vistoria' | 'ordem_servico' | 'general';

export function DocumentsScreen({ fiscal }: { fiscal: Fiscal | null }) {
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('gallery');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDoc, setSelectedDoc] = useState<Documento | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    loadDocuments();
  }, [fiscal]);

  const loadDocuments = async () => {
    if (!fiscal) return;
    setLoading(true);
    try {
      const data = await documentsApi.getByFiscal(fiscal.id);
      setDocumentos(data);
    } catch (error) {
      console.error('Erro ao carregar documentos:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (files: File[]) => {
    if (!fiscal) return;
    setUploading(true);

    try {
      for (const file of files) {
        // Validar tamanho antes de processar
        if (!fileUtils.validateFileSize(file, 10)) {
          throw new Error(`Arquivo "${file.name}" excede o limite de 10MB`);
        }

        const base64 = await fileUtils.fileToBase64(file, true);
        
        const documento: Omit<Documento, 'id' | 'criado_em' | 'atualizado_em'> = {
          fiscal_id: fiscal.id,
          ocorrencia_id: null,
          vistoria_id: null,
          ordem_servico_id: null,
          tipo_documento: file.type.startsWith('image/') ? 'foto' : 'documento',
          titulo: file.name,
          descricao: null,
          arquivo_data: base64,
          arquivo_nome: file.name,
          arquivo_tipo: file.type,
          arquivo_tamanho: file.size,
          ordem: documentos.length,
          metadados: {
            uploadDate: new Date().toISOString(),
            originalName: file.name,
          },
        };

        await documentsApi.create(documento);
      }

      await loadDocuments();
    } catch (error) {
      console.error('Erro ao fazer upload:', error);
      alert(error instanceof Error ? error.message : 'Erro ao fazer upload');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este documento?')) return;

    try {
      await documentsApi.delete(id);
      await loadDocuments();
    } catch (error) {
      console.error('Erro ao deletar documento:', error);
    }
  };

  const handleReorder = async (reorderedDocs: { id: string; ordem: number }[]) => {
    try {
      await documentsApi.reorder(reorderedDocs);
      await loadDocuments();
    } catch (error) {
      console.error('Erro ao reordenar documentos:', error);
    }
  };

  const handleDownload = (doc: Documento) => {
    const link = document.createElement('a');
    link.href = doc.arquivo_data;
    link.download = doc.arquivo_nome || `documento-${doc.id}`;
    link.click();
  };

  const handleView = (doc: Documento) => {
    setSelectedDoc(doc);
  };

  // Filtrar documentos
  const filteredDocs = documentos.filter(doc => {
    const matchesFilter = filterType === 'all' || 
      (filterType === 'ocorrencia' && doc.ocorrencia_id) ||
      (filterType === 'vistoria' && doc.vistoria_id) ||
      (filterType === 'ordem_servico' && doc.ordem_servico_id) ||
      (filterType === 'general' && !doc.ocorrencia_id && !doc.vistoria_id && !doc.ordem_servico_id);
    
    const matchesSearch = searchTerm === '' || 
      doc.titulo?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.descricao?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.arquivo_nome?.toLowerCase().includes(searchTerm.toLowerCase());
    
    return matchesFilter && matchesSearch;
  });

  const getStats = () => {
    return {
      total: documentos.length,
      fotos: documentos.filter(d => d.tipo_documento === 'foto').length,
      documentos: documentos.filter(d => d.tipo_documento === 'documento').length,
      assinaturas: documentos.filter(d => d.tipo_documento === 'assinatura').length,
      relatorios: documentos.filter(d => d.tipo_documento === 'relatorio').length,
      autos: documentos.filter(d => d.tipo_documento === 'auto_infracao').length,
    };
  };

  const stats = getStats();

  if (loading) {
    return (
      <div className="loading-screen">
        <RefreshCw className="spin" size={30} />
        <span>Carregando documentos...</span>
      </div>
    );
  }

  return (
    <>
      <PageTitle
        eyebrow="Central de arquivos"
        title="Documentos"
        action={
          <button
            className="icon-button"
            onClick={loadDocuments}
            disabled={loading}
          >
            <RefreshCw className={loading ? 'spin' : ''} size={20} />
          </button>
        }
      />

      {/* Estatísticas */}
      <div className="documents-stats">
        <div className="stat-card">
          <FileText size={20} />
          <div>
            <strong>{stats.total}</strong>
            <span>Total</span>
          </div>
        </div>
        <div className="stat-card">
          <ImageIcon size={20} />
          <div>
            <strong>{stats.fotos}</strong>
            <span>Fotos</span>
          </div>
        </div>
        <div className="stat-card">
          <FileText size={20} />
          <div>
            <strong>{stats.documentos}</strong>
            <span>Documentos</span>
          </div>
        </div>
        <div className="stat-card">
          <FileText size={20} />
          <div>
            <strong>{stats.assinaturas}</strong>
            <span>Assinaturas</span>
          </div>
        </div>
      </div>

      {/* Filtros e busca */}
      <div className="documents-filters">
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
            className={filterType === 'general' ? 'active' : ''}
            onClick={() => setFilterType('general')}
          >
            <FolderOpen size={14} /> Geral
          </button>
          <button
            className={filterType === 'ocorrencia' ? 'active' : ''}
            onClick={() => setFilterType('ocorrencia')}
          >
            Ocorrências
          </button>
          <button
            className={filterType === 'vistoria' ? 'active' : ''}
            onClick={() => setFilterType('vistoria')}
          >
            Vistorias
          </button>
          <button
            className={filterType === 'ordem_servico' ? 'active' : ''}
            onClick={() => setFilterType('ordem_servico')}
          >
            Ordens
          </button>
        </div>

        <div className="view-toggle">
          <button
            className={viewMode === 'gallery' ? 'active' : ''}
            onClick={() => setViewMode('gallery')}
          >
            <Grid3x3 size={18} />
          </button>
          <button
            className={viewMode === 'history' ? 'active' : ''}
            onClick={() => setViewMode('history')}
          >
            <List size={18} />
          </button>
        </div>
      </div>

      {/* Upload */}
      <div className="documents-upload">
        <label className="upload-zone">
          <Upload size={24} />
          <div>
            <strong>Arraste arquivos ou clique para upload</strong>
            <span>Imagens, PDFs, documentos</span>
          </div>
          <input
            type="file"
            multiple
            accept="image/*,.pdf,.doc,.docx"
            onChange={(e) => handleUpload(Array.from(e.target.files || []))}
            style={{ display: 'none' }}
          />
        </label>
      </div>

      {/* Conteúdo */}
      {filteredDocs.length === 0 ? (
        <EmptyState
          icon={<FileText size={27} />}
          title="Nenhum documento"
          message="Documentos, fotos e assinaturas aparecerão aqui."
        />
      ) : viewMode === 'gallery' ? (
        <DocumentGallery
          documentos={filteredDocs}
          onUpload={handleUpload}
          onDelete={handleDelete}
          onReorder={handleReorder}
          editable={true}
          showMetadata={true}
        />
      ) : (
        <DocumentHistory
          documentos={filteredDocs}
          onView={handleView}
          onDownload={handleDownload}
          showFilters={false}
        />
      )}

      {/* Modal de visualização */}
      {selectedDoc && (
        <div className="modal-overlay" onClick={() => setSelectedDoc(null)}>
          <div className="document-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{selectedDoc.titulo || selectedDoc.arquivo_nome || 'Documento'}</h3>
              <button onClick={() => setSelectedDoc(null)} className="icon-button">
                <Plus size={20} className="rotate-45" />
              </button>
            </div>
            
            <div className="modal-content">
              {selectedDoc.tipo_documento === 'foto' || selectedDoc.arquivo_tipo?.startsWith('image/') ? (
                <img src={selectedDoc.arquivo_data} alt={selectedDoc.titulo} />
              ) : (
                <div className="document-preview">
                  <FileText size={48} />
                  <p>Visualização não disponível para este tipo de arquivo</p>
                  <button
                    className="primary-button"
                    onClick={() => handleDownload(selectedDoc)}
                  >
                    <Download size={16} />
                    Baixar arquivo
                  </button>
                </div>
              )}
            </div>

            <div className="modal-footer">
              <div className="document-meta">
                <span><Calendar size={14} /> {new Date(selectedDoc.criado_em).toLocaleString('pt-BR')}</span>
                {selectedDoc.arquivo_tamanho && (
                  <span>{fileUtils.formatFileSize(selectedDoc.arquivo_tamanho)}</span>
                )}
                <span className="type-badge">{selectedDoc.tipo_documento}</span>
              </div>
              <div className="modal-actions">
                <button
                  className="icon-button delete"
                  onClick={() => {
                    handleDelete(selectedDoc.id);
                    setSelectedDoc(null);
                  }}
                >
                  <Trash2 size={18} />
                </button>
                <button
                  className="icon-button"
                  onClick={() => handleDownload(selectedDoc)}
                >
                  <Download size={18} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

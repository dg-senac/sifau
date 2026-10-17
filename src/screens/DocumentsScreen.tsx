import { useCallback, useEffect, useState } from 'react';
import { 
  FileText, 
  Image as ImageIcon, 
  Upload, 
  Search, 
  FolderOpen,
  Calendar,
  Download,
  Trash2,
  Plus,
  Grid3x3,
  List,
  RefreshCw
} from 'lucide-react';
import { Fiscal, Documento } from '@/lib/types';
import { documentsApi } from '@/lib/documents';
import { fileUtils } from '@/lib/fileUtils';
import { AnexoImagem, BotaoBaixarAnexo } from '@/components/StorageFile';
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

  const loadDocuments = useCallback(async () => {
    if (!fiscal) {
      setDocumentos([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await documentsApi.getByFiscal(fiscal.id);
      setDocumentos(data);
    } catch (error) {
      console.error('Erro ao carregar documentos:', error);
    } finally {
      setLoading(false);
    }
  }, [fiscal]);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  const handleUpload = async (files: File[]) => {
    if (!fiscal || files.length === 0) return;
    setUploading(true);

    // Cada arquivo é independente: uma falha (tipo não aceito, arquivo grande,
    // rede) não impede os outros de subir — e o aviso diz exatamente o que
    // entrou e o que não entrou, em vez de um "erro no upload" genérico.
    const falhas: string[] = [];
    let enviados = 0;

    for (const [indice, arquivo] of files.entries()) {
      try {
        await documentsApi.enviarArquivo({
          arquivo,
          fiscalId: fiscal.id,
          ordem: documentos.length + indice,
          tipo: arquivo.type.startsWith('image/') ? 'foto' : 'documento',
        });
        enviados += 1;
      } catch (error) {
        console.error('Erro ao enviar documento:', arquivo.name, error);
        falhas.push(`${arquivo.name}: ${error instanceof Error ? error.message : 'falha no envio'}`);
      }
    }

    await loadDocuments();
    setUploading(false);

    if (falhas.length > 0) {
      alert(`Enviados ${enviados} de ${files.length} arquivo(s).\n\n${falhas.join('\n')}`);
    }
  };

  const handleDelete = async (id: string) => {
    const documento = documentos.find((doc) => doc.id === id);
    if (!documento) return;
    if (!confirm('Tem certeza que deseja excluir este documento?')) return;

    try {
      await documentsApi.removerDocumento(documento);
      await loadDocuments();
    } catch (error) {
      console.error('Erro ao deletar documento:', error);
      alert('Não foi possível excluir o documento. Tente novamente.');
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
            <strong>{uploading ? 'Enviando arquivos…' : 'Arraste arquivos ou clique para upload'}</strong>
            <span>JPG, PNG, WebP, PDF ou Word · até 5 MB por arquivo</span>
          </div>
          <input
            type="file"
            multiple
            disabled={uploading}
            accept="image/jpeg,image/png,image/webp,.pdf,.doc,.docx"
            onChange={async (event) => {
              const input = event.currentTarget;
              await handleUpload(Array.from(input.files ?? []));
              input.value = '';
            }}
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
                <AnexoImagem
                  path={selectedDoc.arquivo_path}
                  alt={selectedDoc.titulo ?? 'Documento'}
                  className="modal-imagem"
                />
              ) : (
                <div className="document-preview">
                  <FileText size={48} />
                  <p>Visualização não disponível para este tipo de arquivo</p>
                  <BotaoBaixarAnexo
                    path={selectedDoc.arquivo_path}
                    nome={selectedDoc.arquivo_nome}
                    className="primary-button"
                    titulo="Baixar arquivo"
                  >
                    <Download size={16} />
                    Baixar arquivo
                  </BotaoBaixarAnexo>
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
                <BotaoBaixarAnexo
                  path={selectedDoc.arquivo_path}
                  nome={selectedDoc.arquivo_nome}
                  titulo={`Baixar ${selectedDoc.arquivo_nome || 'arquivo'}`}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

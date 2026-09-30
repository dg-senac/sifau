import { useState, useRef } from 'react';
import { 
  Image as ImageIcon, 
  FileText, 
  Download, 
  Trash2, 
  ZoomIn, 
  X,
  Plus,
  ChevronLeft,
  ChevronRight,
  Info
} from 'lucide-react';
import { Documento } from '@/lib/types';
import { fileUtils } from '@/lib/documents';

interface DocumentGalleryProps {
  documentos: Documento[];
  onUpload?: (files: File[]) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onReorder?: (documentos: { id: string; ordem: number }[]) => Promise<void>;
  editable?: boolean;
  showMetadata?: boolean;
}

export function DocumentGallery({
  documentos,
  onUpload,
  onDelete,
  onReorder,
  editable = false,
  showMetadata = false,
}: DocumentGalleryProps) {
  const [selectedDoc, setSelectedDoc] = useState<Documento | null>(null);
  const [draggedItem, setDraggedItem] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredDocs = documentos.sort((a, b) => a.ordem - b.ordem);
  const imageDocs = filteredDocs.filter(d => d.tipo_documento === 'foto');
  const otherDocs = filteredDocs.filter(d => d.tipo_documento !== 'foto');

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0 && onUpload) {
      await onUpload(files);
    }
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedItem(id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedItem || draggedItem === targetId || !onReorder) return;

    const draggedIndex = filteredDocs.findIndex(d => d.id === draggedItem);
    const targetIndex = filteredDocs.findIndex(d => d.id === targetId);

    if (draggedIndex === -1 || targetIndex === -1) return;

    const newOrder = [...filteredDocs];
    const [removed] = newOrder.splice(draggedIndex, 1);
    newOrder.splice(targetIndex, 0, removed);

    const reorderedDocs = newOrder.map((doc, index) => ({
      id: doc.id,
      ordem: index,
    }));

    await onReorder(reorderedDocs);
    setDraggedItem(null);
  };

  const handleDownload = (doc: Documento) => {
    const link = document.createElement('a');
    link.href = doc.arquivo_data;
    link.download = doc.arquivo_nome || `documento-${doc.id}`;
    link.click();
  };

  const handleNext = () => {
    if (currentIndex < imageDocs.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setSelectedDoc(imageDocs[currentIndex + 1]);
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setSelectedDoc(imageDocs[currentIndex - 1]);
    }
  };

  const getDocumentIcon = (tipo: string) => {
    switch (tipo) {
      case 'foto':
        return ImageIcon;
      case 'assinatura':
        return FileText;
      case 'documento':
      case 'relatorio':
      case 'auto_infracao':
        return FileText;
      default:
        return FileText;
    }
  };

  const isImage = (doc: Documento) => {
    return doc.tipo_documento === 'foto' || 
           doc.arquivo_tipo?.startsWith('image/');
  };

  return (
    <div className="document-gallery">
      {/* Header com botão de upload se editável */}
      {editable && (
        <div className="gallery-header">
          <h3>Documentos ({documentos.length})</h3>
          <button
            className="upload-button"
            onClick={() => fileInputRef.current?.click()}
          >
            <Plus size={18} />
            Adicionar
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.pdf,.doc,.docx"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
        </div>
      )}

      {/* Galeria de imagens */}
      {imageDocs.length > 0 && (
        <div className="gallery-section">
          <h4>Fotos ({imageDocs.length})</h4>
          <div className="gallery-grid">
            {imageDocs.map((doc, index) => (
              <div
                key={doc.id}
                className={`gallery-item ${draggedItem === doc.id ? 'dragging' : ''}`}
                draggable={editable}
                onDragStart={(e) => handleDragStart(e, doc.id)}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, doc.id)}
                onClick={() => {
                  setSelectedDoc(doc);
                  setCurrentIndex(index);
                }}
              >
                <div className="gallery-item-image">
                  <img src={doc.arquivo_data} alt={doc.titulo || 'Foto'} />
                  <div className="gallery-item-overlay">
                    <button
                      className="icon-button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownload(doc);
                      }}
                    >
                      <Download size={16} />
                    </button>
                    {editable && onDelete && (
                      <button
                        className="icon-button delete"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(doc.id);
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>
                {showMetadata && (
                  <div className="gallery-item-meta">
                    <span className="gallery-item-title">
                      {doc.titulo || `Foto ${index + 1}`}
                    </span>
                    {doc.arquivo_tamanho && (
                      <span className="gallery-item-size">
                        {fileUtils.formatFileSize(doc.arquivo_tamanho)}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Outros documentos */}
      {otherDocs.length > 0 && (
        <div className="gallery-section">
          <h4>Outros documentos ({otherDocs.length})</h4>
          <div className="document-list">
            {otherDocs.map((doc) => {
              const Icon = getDocumentIcon(doc.tipo_documento);
              return (
                <div
                  key={doc.id}
                  className="document-item"
                  draggable={editable}
                  onDragStart={(e) => handleDragStart(e, doc.id)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, doc.id)}
                >
                  <div className="document-item-icon">
                    <Icon size={24} />
                  </div>
                  <div className="document-item-info">
                    <span className="document-item-title">
                      {doc.titulo || doc.tipo_documento}
                    </span>
                    {doc.descricao && (
                      <span className="document-item-desc">
                        {doc.descricao}
                      </span>
                    )}
                    {doc.arquivo_tamanho && (
                      <span className="document-item-size">
                        {fileUtils.formatFileSize(doc.arquivo_tamanho)}
                      </span>
                    )}
                  </div>
                  <div className="document-item-actions">
                    <button
                      className="icon-button"
                      onClick={() => handleDownload(doc)}
                    >
                      <Download size={18} />
                    </button>
                    {editable && onDelete && (
                      <button
                        className="icon-button delete"
                        onClick={() => onDelete(doc.id)}
                      >
                        <Trash2 size={18} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Estado vazio */}
      {documentos.length === 0 && (
        <div className="gallery-empty">
          <ImageIcon size={48} />
          <p>Nenhum documento</p>
          {editable && (
            <button
              className="upload-button empty"
              onClick={() => fileInputRef.current?.click()}
            >
              <Plus size={18} />
              Adicionar primeiro documento
            </button>
          )}
        </div>
      )}

      {/* Modal de visualização de imagem */}
      {selectedDoc && isImage(selectedDoc) && (
        <div className="image-modal" onClick={() => setSelectedDoc(null)}>
          <div className="image-modal-content" onClick={(e) => e.stopPropagation()}>
            <button
              className="modal-close"
              onClick={() => setSelectedDoc(null)}
            >
              <X size={24} />
            </button>
            
            <button
              className="modal-nav prev"
              onClick={handlePrevious}
              disabled={currentIndex === 0}
            >
              <ChevronLeft size={32} />
            </button>
            
            <div className="modal-image-container">
              <img src={selectedDoc.arquivo_data} alt={selectedDoc.titulo || 'Foto'} />
            </div>
            
            <button
              className="modal-nav next"
              onClick={handleNext}
              disabled={currentIndex === imageDocs.length - 1}
            >
              <ChevronRight size={32} />
            </button>

            {showMetadata && (
              <div className="modal-metadata">
                <h4>{selectedDoc.titulo || `Foto ${currentIndex + 1}`}</h4>
                {selectedDoc.descricao && (
                  <p>{selectedDoc.descricao}</p>
                )}
                <div className="metadata-grid">
                  {selectedDoc.arquivo_tamanho && (
                    <span><Info size={14} /> {fileUtils.formatFileSize(selectedDoc.arquivo_tamanho)}</span>
                  )}
                  <span><Info size={14} /> {new Date(selectedDoc.criado_em).toLocaleString('pt-BR')}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

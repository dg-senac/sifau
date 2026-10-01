import { useRef, useState } from 'react';
import { Camera, X, AlertCircle } from 'lucide-react';
import { fileUtils } from '@/lib/documents';

export function PhotoUpload({
  photos,
  onChange,
  max = 5,
  label = 'Anexar fotos',
  hint = 'Até 5 imagens',
  minRequired = 0,
}: {
  photos: string[];
  onChange: (photos: string[]) => void;
  max?: number;
  label?: string;
  hint?: string;
  minRequired?: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string>('');

  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    setError('');
    
    const remaining = max - photos.length;
    const toRead = Array.from(files).slice(0, remaining);
    
    try {
      const readers = toRead.map(
        (file) =>
          fileUtils.fileToBase64(file, true).catch((err) => {
            throw new Error(`Erro no arquivo "${file.name}": ${err.message}`);
          }),
      );
      const results = await Promise.all(readers);
      onChange([...photos, ...results]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao processar arquivos');
    }
  };

  const removePhoto = (index: number) => {
    onChange(photos.filter((_, i) => i !== index));
  };

  return (
    <div className="photo-upload-wrap">
      <div
        className="upload-box"
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
      >
        <Camera size={22} />
        <div>
          <b>{label}</b>
          <span>
            {hint}
            {minRequired > 0 && ` · ${minRequired} obrigatória(s)`}
          </span>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => handleFiles(e.target.files)}
          style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
        />
      </div>
      {photos.length > 0 && (
        <div className="photo-preview-grid">
          {photos.map((photo, i) => (
            <div className="photo-preview" key={i}>
              <img src={photo} alt={`Foto ${i + 1}`} />
              <button
                type="button"
                className="photo-remove"
                onClick={(e) => {
                  e.stopPropagation();
                  removePhoto(i);
                }}
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
      {error && (
        <div className="photo-error">
          <AlertCircle size={14} />
          {error}
        </div>
      )}
      <div className="photo-count">
        {photos.length}/{max} {minRequired > 0 && `· mín. ${minRequired}`}
      </div>
    </div>
  );
}

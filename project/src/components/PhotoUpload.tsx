import { useRef, useState } from 'react';
import { Camera, X } from 'lucide-react';

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

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    const remaining = max - photos.length;
    const toRead = Array.from(files).slice(0, remaining);
    const readers = toRead.map(
      (file) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        }),
    );
    Promise.all(readers).then((results) => onChange([...photos, ...results]));
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
      <div className="photo-count">
        {photos.length}/{max} {minRequired > 0 && `· mín. ${minRequired}`}
      </div>
    </div>
  );
}

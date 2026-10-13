import { useRef, useState } from 'react';
import { AlertCircle, Camera, Loader2, X } from 'lucide-react';

type PhotoUploadProps = {
  photos: string[];
  onChange: (photos: string[]) => void;
  max?: number;
  label?: string;
  hint?: string;
  minRequired?: number;
};

const MAX_SOURCE_SIZE = 15 * 1024 * 1024;
const MAX_COMPRESSED_SIZE = 700 * 1024;
const MAX_IMAGE_SIDE = 1600;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`Não foi possível abrir a imagem "${file.name}".`));
    };
    image.src = objectUrl;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Falha ao otimizar a imagem.'));
    }, 'image/jpeg', quality);
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Falha ao ler a imagem.'));
    reader.onerror = () => reject(new Error('Falha ao ler a imagem.'));
    reader.readAsDataURL(blob);
  });
}

async function optimizePhoto(file: File): Promise<string> {
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') {
    throw new Error(`O arquivo "${file.name}" não é uma imagem compatível.`);
  }
  if (file.size > MAX_SOURCE_SIZE) {
    throw new Error(`A imagem "${file.name}" excede o limite de 15 MB.`);
  }

  const image = await loadImage(file);
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));

  const context = canvas.getContext('2d');
  if (!context) throw new Error('Este aparelho não conseguiu processar a imagem.');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  for (const quality of [0.82, 0.74, 0.66, 0.58, 0.5]) {
    const blob = await canvasToBlob(canvas, quality);
    if (blob.size <= MAX_COMPRESSED_SIZE) return blobToDataUrl(blob);
  }
  throw new Error(`Não foi possível reduzir "${file.name}" o suficiente. Escolha uma imagem menor.`);
}

export function PhotoUpload({
  photos,
  onChange,
  max = 5,
  label = 'Anexar fotos',
  hint = 'Até 5 imagens',
  minRequired = 0,
}: PhotoUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState(false);

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setError('');

    const remaining = max - photos.length;
    if (remaining <= 0) {
      setError(`O limite de ${max} fotos já foi atingido.`);
      return;
    }
    if (files.length > remaining) {
      setError(`Você pode adicionar no máximo mais ${remaining} foto(s).`);
    }

    setProcessing(true);
    try {
      const selected = Array.from(files).slice(0, remaining);
      const optimized = await Promise.all(selected.map(optimizePhoto));
      onChange([...photos, ...optimized]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Erro ao processar as imagens.');
    } finally {
      setProcessing(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const removePhoto = (index: number) => {
    onChange(photos.filter((_, photoIndex) => photoIndex !== index));
  };

  return (
    <div className="photo-upload-wrap">
      <div
        className={`upload-box ${processing ? 'is-processing' : ''}`}
        onClick={() => !processing && inputRef.current?.click()}
        role="button"
        tabIndex={0}
        aria-label={`${label}. ${hint}`}
        aria-disabled={processing || photos.length >= max}
        onKeyDown={(event) => {
          if ((event.key === 'Enter' || event.key === ' ') && !processing) {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
      >
        {processing ? <Loader2 className="spin" size={22} /> : <Camera size={22} />}
        <div>
          <b>{processing ? 'Otimizando imagens…' : label}</b>
          <span>{hint}{minRequired > 0 && ` · ${minRequired} obrigatória(s)`}</span>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          multiple
          disabled={processing || photos.length >= max}
          onChange={(event) => { void handleFiles(event.target.files); }}
          style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
        />
      </div>
      {photos.length > 0 && (
        <div className="photo-preview-grid">
          {photos.map((photo, index) => (
            <div className="photo-preview" key={`${index}-${photo.slice(0, 24)}`}>
              <img src={photo} alt={`Foto ${index + 1}`} />
              <button
                type="button"
                className="photo-remove"
                aria-label={`Remover foto ${index + 1}`}
                onClick={() => removePhoto(index)}
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
      {error && <div className="photo-error" role="alert"><AlertCircle size={14} />{error}</div>}
      <div className="photo-count">
        {photos.length}/{max} {minRequired > 0 && `· mín. ${minRequired}`}
        {photos.length > 0 && <span> · fotos reduzidas para uso offline</span>}
      </div>
    </div>
  );
}

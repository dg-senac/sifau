// ============================================================================
// SIFAU — Exibição de arquivo que mora no bucket
// ============================================================================
// Nenhuma tela recebe o arquivo; ela recebe um CAMINHO e pede uma URL assinada
// (ver `useArquivoAssinado`). Estes dois componentes são o que a tela desenha:
// a imagem com os estados de carregando/erro e o botão de baixar.
// ============================================================================

import { useEffect, useState } from 'react';
import { AlertCircle, Download, Loader2 } from 'lucide-react';
import { getSignedUrl } from '@/lib/storage';
import { useArquivoAssinado } from '@/hooks/useArquivoAssinado';

type AnexoImagemProps = {
  path?: string | null;
  alt: string;
  className?: string;
  /** Avisado quando o arquivo não existe mais no bucket (linha órfã). */
  onFalha?: () => void;
  onClick?: () => void;
  largura?: number;
  altura?: number;
};

/**
 * Imagem de um arquivo do bucket, com os estados de carregamento e de erro.
 *
 * O erro tem dois momentos: a URL assinada pode falhar (permissão, rede) e a
 * imagem pode falhar depois de a URL existir (objeto ausente). Os dois caem no
 * mesmo lugar visível, com botão de tentar de novo.
 */
export function AnexoImagem({ path, alt, className, onFalha, onClick, largura, altura }: AnexoImagemProps) {
  const { url, estado, motivo, tentarDeNovo } = useArquivoAssinado(path);
  const [falhouImagem, setFalhouImagem] = useState(false);

  useEffect(() => { setFalhouImagem(false); }, [url]);

  if (!path || estado === 'carregando') {
    return (
      <div className={`anexo-estado ${className ?? ''}`.trim()} aria-busy="true">
        <Loader2 size={20} className="anexo-girando" />
      </div>
    );
  }

  if (estado === 'erro' || falhouImagem) {
    return (
      <button
        type="button"
        className={`anexo-estado anexo-erro ${className ?? ''}`.trim()}
        onClick={(evento) => { evento.stopPropagation(); tentarDeNovo(); }}
        title={motivo || 'O arquivo não está disponível. Tentar de novo.'}
      >
        <AlertCircle size={20} />
      </button>
    );
  }

  return (
    <img
      src={url ?? ''}
      alt={alt}
      className={className}
      width={largura}
      height={altura}
      loading="lazy"
      onClick={onClick}
      onError={() => {
        console.error('Arquivo ausente no bucket:', path);
        setFalhouImagem(true);
        onFalha?.();
      }}
    />
  );
}

type BotaoBaixarProps = {
  path: string;
  nome?: string | null;
  className?: string;
  titulo?: string;
  children?: React.ReactNode;
};

/** Baixa o arquivo do bucket. O nome sugerido vem do registro, não do caminho. */
export function BotaoBaixarAnexo({ path, nome, className = 'icon-button', titulo = 'Baixar', children }: BotaoBaixarProps) {
  const [baixando, setBaixando] = useState(false);
  const [falhou, setFalhou] = useState(false);

  const baixar = async (evento: React.MouseEvent) => {
    evento.stopPropagation();
    setBaixando(true);
    setFalhou(false);
    try {
      const url = await getSignedUrl(path, { nome });
      const link = document.createElement('a');
      link.href = url;
      link.download = nome ?? '';
      link.rel = 'noopener';
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error('Erro ao baixar o arquivo:', path, error);
      setFalhou(true);
    } finally {
      setBaixando(false);
    }
  };

  return (
    <button
      type="button"
      className={className}
      onClick={baixar}
      disabled={baixando}
      title={falhou ? 'Não foi possível baixar. Tente novamente.' : titulo}
    >
      {baixando ? <Loader2 size={16} className="anexo-girando" /> : (children ?? <Download size={18} />)}
    </button>
  );
}

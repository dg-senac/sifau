// ============================================================================
// SIFAU — Um anexo da conversa, pronto para abrir
// ============================================================================
// O arquivo da conversa mora no bucket e a tela recebe só o caminho, então
// abrir exige pedir uma URL assinada — e é aí que a permissão aparece na
// prática: quem não tem direito ao arquivo não recebe a URL.
//
// Dois formatos convivem aqui, e o segundo é dívida do passado que não pode
// virar tela quebrada:
//
//   * **caminho** (`{uid}/{ano}/{mes}/{id}.ext`) — o formato atual;
//   * **data:** — anexos antigos, gravados antes de o arquivo sair de dentro da
//     linha. O banco não aceita mais esse formato, mas as linhas que já existem
//     continuam válidas, e o anexo precisa continuar abrindo.
// ============================================================================

import { AlertCircle, Download, FileText, Loader2 } from 'lucide-react';

import { useArquivoAssinado } from '@/hooks/useArquivoAssinado';
import { ehImagem } from '@/lib/storage';
import { nomeDoAnexoDaMensagem, rotuloDoAnexo } from '@/lib/mensagens';

/** Rótulo de um anexo antigo, que veio embutido na linha. */
function rotuloDoAnexoEmbutido(dataUrl: string): string {
  const mime = /^data:([^;,]+)/.exec(dataUrl)?.[1] ?? '';
  if (mime.startsWith('image/')) return 'Foto';
  if (mime === 'application/pdf') return 'Documento PDF';
  if (mime.includes('word')) return 'Documento do Word';
  return 'Arquivo';
}

export function AnexoDaMensagem({ path }: { path: string }) {
  const embutido = path.startsWith('data:');
  const imagem = embutido ? /^data:image\//.test(path) : ehImagem(path);
  // O gancho é chamado sempre (regra dos ganchos), mas não busca nada quando o
  // anexo é antigo: não há caminho para assinar.
  const { url, estado, motivo, tentarDeNovo } = useArquivoAssinado(embutido ? null : path);

  const rotulo = embutido ? rotuloDoAnexoEmbutido(path) : rotuloDoAnexo(path);

  // Nome do download: no formato atual é o do caminho. No antigo o arquivo não
  // tem nome guardado, então o nome é refeito a partir do tipo — o que importa
  // é a extensão, que é o que faz o celular abrir no programa certo.
  const tipoEmbutido = embutido ? /^data:([^;,]+)/.exec(path)?.[1] ?? '' : '';
  const extensaoEmbutida = tipoEmbutido === 'application/pdf'
    ? 'pdf'
    : tipoEmbutido.includes('word')
      ? 'docx'
      : tipoEmbutido.startsWith('image/')
        ? (tipoEmbutido.split('/')[1] || 'jpg').replace('jpeg', 'jpg')
        : 'bin';
  const nomeParaBaixar = embutido ? `anexo.${extensaoEmbutida}` : nomeDoAnexoDaMensagem(path);

  // Anexo do formato antigo: o arquivo está dentro da própria linha. Não dá para
  // abrir em aba nova (o navegador bloqueia navegação para `data:`), então ele
  // é sempre um botão de baixar — que funciona, porque o download é permitido.
  if (embutido) {
    return (
      <a className="message-anexo message-anexo-arquivo" href={path} download={nomeParaBaixar}
        title={`Baixar ${rotulo.toLowerCase()}`}>
        <FileText size={15} />
        <span>{rotulo}</span>
        <Download size={14} className="message-anexo-baixar" />
      </a>
    );
  }

  if (estado === 'carregando') {
    return (
      <div className="message-anexo message-anexo-carregando" aria-busy="true">
        <Loader2 size={15} className="anexo-girando" />
        <span>{rotulo}</span>
      </div>
    );
  }

  if (estado === 'erro') {
    return (
      <button
        type="button"
        className="message-anexo message-anexo-erro"
        onClick={tentarDeNovo}
        title={motivo || 'Não foi possível abrir o anexo. Tentar de novo.'}
      >
        <AlertCircle size={15} />
        <span>{rotulo} — tentar de novo</span>
      </button>
    );
  }

  if (imagem && url) {
    return (
      <a
        className="message-anexo message-anexo-imagem"
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        title={`Abrir ${rotulo.toLowerCase()}`}
      >
        <img src={url} alt={`Anexo: ${rotulo.toLowerCase()}`} loading="lazy" />
        <span>{rotulo}</span>
      </a>
    );
  }

  return (
    <a
      className="message-anexo message-anexo-arquivo"
      href={url ?? '#'}
      download={nomeParaBaixar}
      target="_blank"
      rel="noopener noreferrer"
      title={`Baixar ${rotulo.toLowerCase()}`}
    >
      <FileText size={15} />
      <span>{rotulo}</span>
      <Download size={14} className="message-anexo-baixar" />
    </a>
  );
}

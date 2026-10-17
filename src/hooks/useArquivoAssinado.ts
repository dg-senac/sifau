// ============================================================================
// SIFAU — URL assinada de arquivo do bucket
// ============================================================================
// O bucket é privado: nenhuma tela recebe o arquivo, ela recebe um CAMINHO e
// precisa pedir uma URL assinada na hora de mostrar. Isso cria dois estados que
// antes não existiam — "ainda carregando" e "não deu para carregar" —, e é por
// isso que a assinatura mora num gancho só, em vez de virar um `useEffect`
// copiado em cada tela.
//
// A URL vale 1 hora e fica em cache por 10 minutos: a grade da galeria monta uma
// miniatura por documento, e sem o cache cada re-render (abrir o modal,
// reordenar, filtrar) pediria tudo de novo.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { getSignedUrl } from '@/lib/storage';

const VALIDADE_URL_MS = 60 * 60 * 1000;
const VALIDADE_CACHE_MS = 10 * 60 * 1000;

const cache = new Map<string, { url: string; expiraEm: number }>();

/** A chave inclui o nome de download porque ele faz parte da URL assinada. */
const chave = (path: string, nome?: string | null) => `${path}|${nome ?? ''}`;

function doCache(path: string, nome?: string | null): string | null {
  const item = cache.get(chave(path, nome));
  if (!item) return null;
  if (item.expiraEm < Date.now()) {
    cache.delete(chave(path, nome));
    return null;
  }
  return item.url;
}

function noCache(path: string, nome: string | null | undefined, url: string) {
  cache.set(chave(path, nome), {
    url,
    expiraEm: Date.now() + Math.min(VALIDADE_URL_MS, VALIDADE_CACHE_MS),
  });
}

export type EstadoArquivo = 'carregando' | 'pronto' | 'erro';

/**
 * Pede (e guarda em cache) a URL assinada de um arquivo.
 *
 * Não lança: a tela precisa desenhar o estado de erro, não sumir por causa dele.
 */
export function useArquivoAssinado(path?: string | null, nome?: string | null) {
  const [url, setUrl] = useState<string | null>(() => (path ? doCache(path, nome) : null));
  const [estado, setEstado] = useState<EstadoArquivo>(
    () => (path && doCache(path, nome) ? 'pronto' : 'carregando'),
  );
  const [motivo, setMotivo] = useState<string>('');
  const [tentativa, setTentativa] = useState(0);
  const vivo = useRef(true);

  useEffect(() => {
    vivo.current = true;
    return () => { vivo.current = false; };
  }, []);

  useEffect(() => {
    if (!path) {
      setEstado('pronto');
      setUrl(null);
      return;
    }

    const guardada = doCache(path, nome);
    if (guardada) {
      setUrl(guardada);
      setEstado('pronto');
      return;
    }

    setEstado('carregando');
    setMotivo('');

    getSignedUrl(path, nome ? { nome } : undefined)
      .then((assinada) => {
        if (!vivo.current) return;
        noCache(path, nome, assinada);
        setUrl(assinada);
        setEstado('pronto');
      })
      .catch((error: unknown) => {
        if (!vivo.current) return;
        console.error('Erro ao assinar o endereço do arquivo:', path, error);
        setMotivo(error instanceof Error ? error.message : 'Falha ao abrir o arquivo.');
        setEstado('erro');
      });
  }, [path, nome, tentativa]);

  const tentarDeNovo = useCallback(() => setTentativa((n) => n + 1), []);
  return { url, estado, motivo, tentarDeNovo };
}

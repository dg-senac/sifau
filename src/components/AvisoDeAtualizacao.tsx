// ============================================================================
// SIFAU — Aviso de versão nova
// ============================================================================
// Quando existe versão nova, o service worker fica esperando e mostra este
// aviso. Quem decide recarregar é o fiscal, e não o aplicativo sozinho: a troca
// no meio de uma vistoria faria a tela aberta pedir arquivos que já não existem
// no servidor.
//
// Fica na parte de baixo, acima do menu, e pode ser dispensado — se ele
// dispensar, o aviso volta na próxima vez que abrir, porque a versão nova
// continua esperando.
// ============================================================================

import { useEffect, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';

import { registrarServiceWorker } from '@/registrarServiceWorker';

export function AvisoDeAtualizacao() {
  const [atualizar, setAtualizar] = useState<(() => void) | null>(null);

  useEffect(() => {
    registrarServiceWorker((aplicar) => setAtualizar(() => aplicar));
  }, []);

  if (!atualizar) return null;

  return (
    <div className="update-banner" role="status">
      <div className="update-banner-icon">
        <RefreshCw size={17} />
      </div>
      <div>
        <b>Nova versão pronta</b>
        <span>Atualize para receber as correções mais recentes.</span>
      </div>
      <button className="ghost-button small" onClick={atualizar}>
        Atualizar
      </button>
      <button className="icon-button" onClick={() => setAtualizar(null)} aria-label="Agora não">
        <X size={15} />
      </button>
    </div>
  );
}

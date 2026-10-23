import { useSyncExternalStore } from 'react';
import { Moon, Sun } from 'lucide-react';
import { CHAVE_TEMA, inicializarTema, trocarTema } from '@/lib/tema';

function observar(onChange: () => void) {
  const externo = (event: StorageEvent) => {
    if (event.key === CHAVE_TEMA || event.key === null) { inicializarTema(); onChange(); }
  };
  window.addEventListener('sifau:tema-alterado', onChange);
  window.addEventListener('storage', externo);
  return () => {
    window.removeEventListener('sifau:tema-alterado', onChange);
    window.removeEventListener('storage', externo);
  };
}
const temaAtual = () => document.documentElement.dataset.tema === 'escuro';
export function AlternarTema() {
  const escuro = useSyncExternalStore(observar, temaAtual, () => false);
  const rotulo = escuro ? 'Ativar modo claro' : 'Ativar modo noturno';
  return <button type="button" className="icon-button light theme-toggle" aria-label={rotulo} title={rotulo}
    aria-pressed={escuro} onClick={() => trocarTema(escuro ? 'claro' : 'escuro')}>
    {escuro ? <Sun size={20} aria-hidden="true" /> : <Moon size={20} aria-hidden="true" />}
  </button>;
}

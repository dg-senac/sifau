// ============================================================================
// SIFAU — Ligar o funcionamento sem conexão
// ============================================================================
// O service worker (`src/service-worker.ts`) é compilado à parte, porque roda
// em outro lugar: não tem tela, não tem `window` e responde aos pedidos do
// navegador. Este arquivo é quem o instala.
//
// Três situações em que NÃO se registra, cada uma por um motivo:
//
//   * navegador sem suporte — nada a fazer;
//   * ambiente de desenvolvimento — o Vite serve os arquivos um a um, e guardar
//     isso em cache criaria a confusão de editar o código e a tela não mudar;
//   * aplicativo instalado no celular — quem serve os arquivos é o próprio
//     aparelho, e não faz sentido guardar o que já está guardado.
// ============================================================================

import { Capacitor } from '@capacitor/core';

/** Como o aplicativo fica sabendo que existe versão nova e como aplicá-la. */
export type AvisoDeNovaVersao = (atualizarAgora: () => void) => void;

export function registrarServiceWorker(aoEncontrarNovaVersao?: AvisoDeNovaVersao) {
  if (!('serviceWorker' in navigator)) return;
  if (!import.meta.env.PROD) return;
  if (Capacitor.isNativePlatform()) return;
  // O navegador só permite em endereço seguro (https ou localhost). Num
  // endereço comum, registrar falharia de qualquer jeito — melhor nem tentar.
  if (!window.isSecureContext) return;

  window.addEventListener('load', () => {
    void registrar(aoEncontrarNovaVersao);
  });
}

async function registrar(aoEncontrarNovaVersao?: AvisoDeNovaVersao) {
  try {
    const registro = await navigator.serviceWorker.register(
      new URL('service-worker.js', document.baseURI).href,
      {
        scope: './',
        // Sem `updateViaCache`, o navegador poderia usar por até 24 horas uma
        // cópia antiga do próprio service worker — ou seja, ficaria preso numa
        // versão do aplicativo que já não existe.
        updateViaCache: 'none',
      },
    );

    const avisar = () => {
      aoEncontrarNovaVersao?.(() => aplicar(registro));
    };

    // Versão já baixada e esperando (acontece quando o fiscal abre o
    // aplicativo de novo depois de uma publicação).
    if (registro.waiting && navigator.serviceWorker.controller) avisar();

    registro.addEventListener('updatefound', () => {
      const instalando = registro.installing;
      if (!instalando) return;
      instalando.addEventListener('statechange', () => {
        // Só avisa se já havia um aplicativo rodando: na primeira visita não
        // existe "versão nova", existe a versão.
        if (instalando.state === 'installed' && navigator.serviceWorker.controller) avisar();
      });
    });

    // Um aplicativo aberto por dias no celular nunca procuraria versão nova
    // sozinho: o navegador só verifica ao abrir. Voltar para a tela é o momento
    // em que isso importa.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void registro.update().catch(() => undefined);
    });
  } catch (erro) {
    // Falhar aqui não pode atrapalhar o fiscal: sem service worker o aplicativo
    // funciona igual, apenas exige conexão para abrir.
    console.warn('[SIFAU] Não foi possível preparar o funcionamento sem conexão.', erro);
  }
}

/** Manda a versão que está esperando assumir e recarrega a tela. */
function aplicar(registro: ServiceWorkerRegistration) {
  const esperando = registro.waiting;
  if (!esperando) {
    window.location.reload();
    return;
  }
  navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), {
    once: true,
  });
  esperando.postMessage({ tipo: 'ATIVAR_NOVA_VERSAO' });
}

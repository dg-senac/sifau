import { Capacitor } from '@capacitor/core';
import { supabase } from '@/lib/supabase';

let registered = false;

/**
 * Registra o dispositivo para push notifications nativas (Android/iOS via Capacitor).
 * Em ambiente web (navegador comum) não faz nada: as notificações continuam
 * disponíveis dentro do app pela tela de Notificações.
 */
export async function registerPush(fiscalId: string) {
  if (registered || !Capacitor.isNativePlatform()) return;
  registered = true;

  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');

    let permission = await PushNotifications.checkPermissions();
    if (permission.receive !== 'granted') {
      permission = await PushNotifications.requestPermissions();
    }
    if (permission.receive !== 'granted') return;

    await PushNotifications.register();

    PushNotifications.addListener('registration', async (token) => {
      await supabase.from('push_tokens').upsert(
        {
          fiscal_id: fiscalId,
          token: token.value,
          platform: Capacitor.getPlatform(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'token' },
      );
    });

    PushNotifications.addListener('registrationError', (err) => {
      console.error('Erro ao registrar push notifications', err);
    });

    // Notificação recebida com o app aberto: nada especial a fazer, o Realtime
    // do Supabase já atualiza a tela de Notificações e o badge do sino.
    PushNotifications.addListener('pushNotificationReceived', () => {});

    // Usuário tocou na notificação (app em background/fechado): guarda a intenção
    // de abrir a tela de notificações assim que o app carregar.
    PushNotifications.addListener('pushNotificationActionPerformed', () => {
      localStorage.setItem('sifau-open-notifications', '1');
    });
  } catch (err) {
    console.error('Push notifications indisponíveis neste build', err);
  }
}

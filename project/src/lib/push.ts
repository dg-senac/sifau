import { Capacitor, PluginListenerHandle } from '@capacitor/core';
import { supabase } from '@/lib/supabase';

let registering = false;
let generation = 0;
let pendingFiscalId: string | null = null;
let activeFiscalId: string | null = null;
let activeToken: string | null = null;
let listenerHandles: PluginListenerHandle[] = [];
let tokenWriteInFlight: Promise<void> | null = null;

/**
 * Registra o dispositivo para push notifications nativas (Android/iOS via Capacitor).
 * A persistência usa RPC autenticada; o cliente não grava diretamente na tabela.
 */
export async function registerPush(fiscalId: string) {
  if (!Capacitor.isNativePlatform()) return;
  if (registering) {
    pendingFiscalId = fiscalId;
    return;
  }
  if (activeFiscalId === fiscalId && listenerHandles.length > 0) return;

  registering = true;
  const requestGeneration = ++generation;
  const handles: PluginListenerHandle[] = [];
  try {
    if (activeFiscalId && activeFiscalId !== fiscalId) {
      await releaseRegistration();
      if (requestGeneration !== generation) return;
    }

    const { PushNotifications } = await import('@capacitor/push-notifications');
    const permission = await PushNotifications.checkPermissions();
    const finalPermission = permission.receive === 'granted'
      ? permission
      : await PushNotifications.requestPermissions();
    if (finalPermission.receive !== 'granted' || requestGeneration !== generation) return;

    const { data: sessionData } = await supabase.auth.getSession();
    if (requestGeneration !== generation || sessionData.session?.user.id !== fiscalId) return;

    activeFiscalId = fiscalId;
    handles.push(await PushNotifications.addListener('registration', async ({ value }) => {
      if (activeFiscalId !== fiscalId) return;
      await persistPushToken(value, fiscalId);
    }));
    handles.push(await PushNotifications.addListener('registrationError', (error) => {
      console.error('Erro ao registrar push notifications:', error);
    }));
    handles.push(await PushNotifications.addListener('pushNotificationReceived', () => {
      // O badge e a caixa de entrada são atualizados pelo Supabase Realtime.
    }));
    handles.push(await PushNotifications.addListener('pushNotificationActionPerformed', () => {
      try { localStorage.setItem('sifau-open-notifications', '1'); }
      catch (error) { console.warn('Não foi possível guardar a navegação para notificações:', error); }
    }));

    if (requestGeneration !== generation) {
      await removeHandles(handles);
      return;
    }
    listenerHandles = handles;
    await PushNotifications.register();
  } catch (error) {
    console.error('Push notifications indisponíveis neste build:', error);
    if (requestGeneration === generation) {
      activeFiscalId = null;
      activeToken = null;
      listenerHandles = [];
    }
    await removeHandles(handles);
  } finally {
    registering = false;
    const nextFiscalId = pendingFiscalId;
    pendingFiscalId = null;
    if (nextFiscalId && nextFiscalId !== activeFiscalId) void registerPush(nextFiscalId);
  }
}

/** Desvincula o token deste fiscal antes de encerrar a sessão no aparelho. */
export async function unregisterPush() {
  generation += 1;
  pendingFiscalId = null;
  await releaseRegistration();
}

async function persistPushToken(token: string, fiscalId: string) {
  const requestGeneration = generation;
  activeToken = token;
  const previousWrite = tokenWriteInFlight;
  const write = (async () => {
    if (previousWrite) await previousWrite;
    if (requestGeneration !== generation || activeFiscalId !== fiscalId) return;

    try {
      const { error } = await supabase.rpc('register_push_token', {
        p_token: token,
        p_platform: Capacitor.getPlatform(),
      });
      if (error) console.error('Não foi possível salvar o token push:', error.message);
    } catch (error) {
      console.error('Não foi possível salvar o token push:', error);
    }

    if (requestGeneration !== generation || activeFiscalId !== fiscalId) {
      await removePushToken(token);
    }
  })();
  tokenWriteInFlight = write;
  try {
    await write;
  } finally {
    if (tokenWriteInFlight === write) tokenWriteInFlight = null;
  }
}

async function releaseRegistration() {
  const handles = listenerHandles;
  const token = activeToken;
  const pendingTokenWrite = tokenWriteInFlight;
  listenerHandles = [];
  activeToken = null;
  activeFiscalId = null;

  if (pendingTokenWrite) {
    try { await pendingTokenWrite; }
    catch (error) { console.warn('A sincronização do token push foi interrompida:', error); }
  }
  if (token) await removePushToken(token);
  await removeHandles(handles);
}

async function removePushToken(token: string) {
  try {
    const { error } = await supabase.rpc('unregister_push_token', { p_token: token });
    if (error) console.warn('Não foi possível remover o token push da sessão:', error.message);
  } catch (error) {
    console.warn('Não foi possível remover o token push da sessão:', error);
  }
}

async function removeHandles(handles: PluginListenerHandle[]) {
  await Promise.all(handles.map(async (handle) => {
    try { await handle.remove(); }
    catch (error) { console.warn('Não foi possível remover um listener push:', error); }
  }));
}

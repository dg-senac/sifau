import { supabase } from '@/lib/supabase';
import { unregisterPush } from '@/lib/push';

/** Remove o token do dispositivo enquanto a sessão ainda pode autorizá-lo. */
export async function signOut() {
  await unregisterPush();
  return supabase.auth.signOut();
}

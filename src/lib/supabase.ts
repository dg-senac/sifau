import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? '';

function isValidSupabaseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname));
  } catch {
    return false;
  }
}

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey && isValidSupabaseUrl(supabaseUrl));

if (!isSupabaseConfigured) {
  console.warn('SIFAU sem configuração do Supabase. Copie .env.example para .env e preencha as variáveis.');
}

// O fallback é válido para inicializar a aplicação, mas a tela de configuração
// impede qualquer chamada enquanto as variáveis reais não estiverem presentes.
export const supabase = createClient(
  isSupabaseConfigured ? supabaseUrl : 'https://sifau-config-missing.invalid',
  isSupabaseConfigured ? supabaseAnonKey : 'public-anon-key-not-configured',
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  },
);

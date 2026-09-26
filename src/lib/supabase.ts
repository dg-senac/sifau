import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl?.trim() || !supabaseAnonKey?.trim()) {
	throw new Error(
		'Configuração do Supabase ausente. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.',
	);
}

try {
	const parsedUrl = new URL(supabaseUrl);
	if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
		throw new Error();
	}
} catch {
	throw new Error('VITE_SUPABASE_URL precisa ser uma URL HTTP ou HTTPS válida.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

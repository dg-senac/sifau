import { useCallback, useEffect, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { lerRecuperacaoDoEndereco, urlSemCredenciais, type RecuperacaoNoEndereco } from '@/lib/recuperacaoDeSenha';

/**
 * A sessão do Supabase e o estado da recuperação de senha.
 *
 * A recuperação entra aqui, e não numa tela, porque quem decide qual tela
 * aparece é o aplicativo: o link do e-mail CRIA uma sessão antes de o fiscal
 * definir a senha. Sem isso, abrir o link levaria direto ao painel — com sessão
 * válida e senha não trocada —, que é o defeito clássico desse fluxo.
 */
export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [recuperacao, setRecuperacao] = useState<RecuperacaoNoEndereco>(() =>
    lerRecuperacaoDoEndereco(window.location),
  );

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data, error }) => {
      if (error) console.error('Erro ao recuperar a sessão:', error.message);
      if (active) {
        setSession(data.session);
        setLoading(false);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === 'PASSWORD_RECOVERY') setRecuperacao({ situacao: 'recuperacao', token: null });
      setSession(nextSession);
      setLoading(false);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  /**
   * Tira o token do endereço depois de ele ser lido.
   *
   * Só limpa quando a sessão já existe (prova de que o `supabase-js` já leu o
   * token) ou quando o link foi recusado — antes disso, apagar o fragmento
   * impediria a própria leitura que cria a sessão.
   */
  useEffect(() => {
    const endereco = window.location.href;
    const temCredencial = /(access_token|refresh_token|code|error|error_code)=/.test(endereco);
    if (!temCredencial) return;
    if (session || recuperacao.situacao === 'erro') {
      window.history.replaceState(null, '', urlSemCredenciais(endereco));
    }
  }, [session, recuperacao.situacao]);

  const encerrarRecuperacao = useCallback(() => setRecuperacao({ situacao: 'nenhuma' }), []);

  return { session, loading, recuperacao, encerrarRecuperacao };
}

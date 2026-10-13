import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Search, Users } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Fiscal } from '@/lib/types';
import { PageTitle } from '@/components/ui';

export function UsersScreen({ currentFiscal }: { currentFiscal: Fiscal | null }) {
  const [users, setUsers] = useState<Fiscal[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    const { data, error: loadError } = await supabase.rpc('get_fiscal_directory');
    if (loadError) {
      console.error('Erro ao carregar o diretório de fiscais:', loadError);
      setError('Não foi possível carregar a equipe. Verifique sua conexão e permissões.');
      return;
    }
    setUsers((data ?? []) as Fiscal[]);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const normalizedSearch = search.trim().toLocaleLowerCase('pt-BR');
  const filtered = users.filter((user) =>
    user.nome.toLocaleLowerCase('pt-BR').includes(normalizedSearch) ||
    user.bairro.toLocaleLowerCase('pt-BR').includes(normalizedSearch),
  );

  return (
    <>
      <PageTitle
        eyebrow="Equipe municipal"
        title="Fiscais cadastrados"
        action={<span className="count-chip"><Users size={15} /> {users.length}</span>}
      />
      <div className="search-box">
        <Search size={17} />
        <input
          placeholder="Buscar fiscal por nome ou região"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label="Buscar fiscal por nome ou região"
        />
      </div>
      {error && <div className="form-message" role="alert"><AlertCircle size={16} />{error}</div>}
      <div className="user-list">
        {filtered.map((user) => (
          <article className="user-card" key={user.id}>
            <div className="avatar">{user.nome.charAt(0)}</div>
            <div className="user-info">
              <b>
                {user.nome}
                {user.id === currentFiscal?.id && <span className="you-tag">Você</span>}
              </b>
              <span>{user.bairro} · {user.especialidade ?? 'Fiscal geral'}</span>
            </div>
            <span className={`status-pill ${user.ativo ? 'active' : 'inactive'}`}>
              {user.ativo ? 'Ativo' : 'Pendente'}
            </span>
          </article>
        ))}
        {!error && filtered.length === 0 && (
          <div className="empty-state"><Users size={26} /><b>Nenhum fiscal encontrado</b><span>Ajuste o termo da busca.</span></div>
        )}
      </div>
    </>
  );
}

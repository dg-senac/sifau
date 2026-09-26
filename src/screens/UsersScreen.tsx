import { useEffect, useState } from 'react';
import { Search, Users } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Fiscal } from '@/lib/types';
import { PageTitle } from '@/components/ui';

export function UsersScreen({ currentFiscal }: { currentFiscal: Fiscal | null }) {
  const [users, setUsers] = useState<Fiscal[]>([]);
  const [search, setSearch] = useState('');

  const load = async () => {
    const { data } = await supabase.from('fiscais').select('*').order('nome');
    setUsers(data ?? []);
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = users.filter(
    (u) =>
      u.nome.toLowerCase().includes(search.toLowerCase()) ||
      u.bairro.toLowerCase().includes(search.toLowerCase()),
  );

  const toggle = async (user: Fiscal) => {
    await supabase.from('fiscais').update({ ativo: !user.ativo }).eq('id', user.id);
    load();
  };

  return (
    <>
      <PageTitle
        eyebrow="Equipe municipal"
        title="Fiscais cadastrados"
        action={
          <span className="count-chip">
            <Users size={15} /> {users.length}
          </span>
        }
      />
      <div className="search-box">
        <Search size={17} />
        <input
          placeholder="Buscar fiscal por nome ou região"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="user-list">
        {filtered.map((user) => (
          <article className="user-card" key={user.id}>
            <div className="avatar">{user.nome.charAt(0)}</div>
            <div className="user-info">
              <b>
                {user.nome}
                {user.id === currentFiscal?.id && <span className="you-tag">Você</span>}
              </b>
              <span>
                {user.bairro} · {user.especialidade ?? 'Fiscal geral'}
              </span>
            </div>
            <button
              className={`toggle ${user.ativo ? 'on' : ''}`}
              onClick={() => toggle(user)}
              aria-label={user.ativo ? 'Desativar fiscal' : 'Ativar fiscal'}
            >
              <i />
            </button>
          </article>
        ))}
      </div>
    </>
  );
}

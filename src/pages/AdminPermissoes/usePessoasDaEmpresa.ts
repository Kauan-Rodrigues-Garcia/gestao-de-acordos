/**
 * usePessoasDaEmpresa — a lista que a aba «Por pessoa» pesquisa.
 *
 * Busca só as colunas que a tela mostra. Desligado entra na lista de propósito:
 * exceção de quem saiu precisa ser encontrada para ser removida, e sumir a
 * pessoa da busca esconde a exceção junto.
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface PessoaResumo {
  id: string;
  nome: string;
  usuario: string | null;
  perfil: string;
  setor_id: string | null;
  situacao: string | null;
}

export function usePessoasDaEmpresa(empresaId: string | null | undefined) {
  const [pessoas, setPessoas] = useState<PessoaResumo[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let cancelado = false;
    if (!empresaId) { setPessoas([]); setCarregando(false); return; }

    setCarregando(true);
    void supabase
      .from('perfis')
      .select('id, nome, usuario, perfil, setor_id, situacao')
      .eq('empresa_id', empresaId)
      .order('nome')
      .then(({ data, error }) => {
        if (cancelado) return;
        if (error) {
          console.warn('[usePessoasDaEmpresa]', error.message);
          setPessoas([]);
        } else {
          setPessoas((data as PessoaResumo[]) ?? []);
        }
        setCarregando(false);
      });

    return () => { cancelado = true; };
  }, [empresaId]);

  return { pessoas, carregando };
}

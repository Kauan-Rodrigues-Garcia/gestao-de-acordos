/**
 * useSetoresEquipes — as listas que alimentam os filtros de setor e equipe.
 *
 * ## Por que existe
 *
 * O Dashboard montava `useAnalytics()` só para pegar quatro coisas: a lista de
 * setores, o setor filtrado e as equipes do setor. Só que `useAnalytics` faz
 * MUITO mais que isso — ele varre, paginado, todos os acordos da empresa no
 * mês, busca metas e monta os mapas de operador/equipe. E o `AnalyticsPanel`,
 * que é filho do Dashboard, monta o MESMO hook. Resultado: duas varreduras
 * completas dos acordos a cada abertura da tela.
 *
 * Pior que o custo: a instância do Dashboard rodava sem mês, ou seja, presa ao
 * mês corrente, enquanto o painel roda no mês escolhido no seletor. As duas
 * discordavam por construção — e qualquer coisa que passasse a ler a instância
 * do Dashboard leria um mês diferente do que está escrito na tela.
 *
 * Aqui ficam apenas as duas consultas de LISTA (setores e equipes) e o estado
 * do filtro. Nenhum acordo é lido.
 */
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from './useAuth';
import { useEmpresa } from './useEmpresa';
import { useCargoPermissoes } from './useCargoPermissoes';
import { isPerfilAdmin, isPerfilLider, isPerfilDiretoria } from '@/lib/index';

export interface SetorResumo { id: string; nome: string }

/** Referência estável para "lista vazia" — `[]` novo a cada chamada faria o
 *  consumidor re-renderizar à toa em todo `useMemo` que dependa da lista. */
const VAZIO: SetorResumo[] = [];

export interface SetoresEquipes {
  /** Setores da empresa — só para quem pode filtrar entre eles. */
  setores: SetorResumo[];
  setorFiltro: string | null;
  setSetorFiltro: (id: string | null) => void;
  /** Equipes visíveis ao líder/elite (do próprio setor, ou todas com permissão). */
  equipesDoSetor: SetorResumo[];
  loading: boolean;
}

export function useSetoresEquipes(): SetoresEquipes {
  const { perfil }  = useAuth();
  const { empresa } = useEmpresa();
  const { temPermissao } = useCargoPermissoes();
  const verTodosSetores = temPermissao('ver_todos_setores');

  const [setores, setSetores]               = useState<SetorResumo[]>(VAZIO);
  const [equipesDoSetor, setEquipesDoSetor] = useState<SetorResumo[]>(VAZIO);
  const [setorFiltro, setSetorFiltro]       = useState<string | null>(null);
  const [loading, setLoading]               = useState(true);

  // Dependências PRIMITIVAS, não o objeto `perfil`.
  //
  // `useAuth` pode devolver um objeto novo a cada render — e devolve, sob teste.
  // Depender dele faria `carregar` mudar de identidade em todo render, o efeito
  // disparar de novo, o `setState` provocar outro render, e assim por diante:
  // laço infinito até estourar a memória. Foi exatamente o que aconteceu quando
  // este hook nasceu copiando as dependências de `useAnalytics`.
  const cargo    = perfil?.perfil ?? null;
  const setorId  = perfil?.setor_id ?? null;
  const empresaId = empresa?.id ?? null;

  const carregar = useCallback(async () => {
    if (!cargo || !empresaId) { setLoading(false); return; }
    const isAdmin     = isPerfilAdmin(cargo);
    const isLider     = isPerfilLider(cargo);
    const isDiretoria = isPerfilDiretoria(cargo);

    try {
      // Filtro de setor: admin/diretoria sempre; líder+ só com 'ver_todos_setores'.
      if (isAdmin || isDiretoria || (isLider && verTodosSetores)) {
        const { data } = await supabase
          .from('setores').select('id, nome')
          .eq('empresa_id', empresaId).order('nome');
        setSetores((data as SetorResumo[]) ?? []);
      } else {
        setSetores(VAZIO);
      }

      // Equipes: do próprio setor, ou da empresa toda com 'ver_todos_setores'.
      if (isLider && (setorId || verTodosSetores)) {
        let q = supabase.from('equipes').select('id, nome').eq('empresa_id', empresaId);
        if (!verTodosSetores && setorId) q = q.eq('setor_id', setorId);
        const { data } = await q.order('nome');
        setEquipesDoSetor((data as SetorResumo[]) ?? []);
      } else {
        setEquipesDoSetor(VAZIO);
      }
    } catch (err) {
      console.warn('[useSetoresEquipes] erro ao carregar listas:', err);
    } finally {
      setLoading(false);
    }
  }, [cargo, setorId, empresaId, verTodosSetores]);

  useEffect(() => { void carregar(); }, [carregar]);

  return { setores, setorFiltro, setSetorFiltro, equipesDoSetor, loading };
}

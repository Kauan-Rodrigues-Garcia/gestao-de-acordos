/**
 * O alcance da aba Acordos — de quem a lista mostra os acordos —, para as DUAS
 * mesas: a de Nosso produto (`index.tsx`) e a da regra Cofen (`AcordosCofen.tsx`).
 *
 * Tirado de `index.tsx` em 05/11/2026, quando a mesa da regra Cofen saiu do
 * Dashboard e veio para cá (Cleber: «deixar a aba separada tanto nosso produto
 * quanto cofen»). Antes ela herdava o recorte do Dashboard; agora obedece ao
 * alcance DESTA aba, como a de Nosso produto — quem decide é o painel de
 * permissões (`niveisLiberados('acordos')`).
 *
 * Alcance desta aba, e de nenhuma outra. Antes vinha de duas chaves globais e
 * de uma lista de cargo: `ver_acordos_gerais` decidia se a consulta ficava presa
 * ao próprio operador, `ver_todos_setores` decidia se as listas de equipe e de
 * pessoa passavam do próprio setor, e `isLider || isElite` decidia se os
 * atalhos de equipe apareciam. As mesmas duas chaves mandavam no Dashboard e na
 * Lixeira — mexer no alcance daqui mexia lá.
 *
 * `todos_setores` ACRESCENTA um filtro de setor (08/09/2026): setor → equipe em
 * cascata, como no Dashboard, e o setor escolhido recorta também a consulta.
 * Quem NÃO tem o nível fica sem seletor de setor, preso ao próprio.
 */
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { supabase } from '@/lib/supabase';
import { niveisLiberados } from '@/lib/permissoes-escopo';
import { COLUNAS_SETOR_DO_FILTRO, listaDoFiltroDeSetores } from '@/lib/setoresDosFiltros';
import type { VisaoFiltroAcordos } from './helpers';

export function useAlcanceAcordos(mesFiltro: string) {
  const { perfil } = useAuth();
  const { empresa } = useEmpresa();
  const { temPermissao } = useCargoPermissoes();

  const [visao, setVisao] = useState<VisaoFiltroAcordos>('setor');
  const [equipesDoSetor, setEquipesDoSetor] = useState<{ id: string; nome: string }[]>([]);
  /**
   * Setor em foco no filtro. `null` = todos.
   *
   * Só existe para quem tem `todos_setores`: quem enxerga um setor só já está
   * preso a ele pela própria consulta, e o seletor não teria o que oferecer.
   */
  const [filtroSetor, setFiltroSetor] = useState<string | null>(null);
  // As linhas de `setores` como vieram; o seletor recorta pelo mês olhado.
  const [setoresDisponiveis, setSetoresDisponiveis] = useState<
    { id: string; nome: string; ativo: boolean; tipo: string | null }[]
  >([]);

  // Memoizado porque desce como prop: `niveisLiberados` devolve um array novo
  // a cada chamada, e um array novo por render remontaria o filtro à toa.
  const niveis = useMemo(() => niveisLiberados('acordos', temPermissao), [temPermissao]);
  const podeVerSetor = niveis.includes('setor');
  const podeVerEquipe = niveis.includes('equipe');
  const verTodosSetores = niveis.includes('todos_setores');

  // A lista de setores do seletor. Só para quem tem `todos_setores`.
  useEffect(() => {
    if (!verTodosSetores || !empresa?.id) { setSetoresDisponiveis([]); return; }
    supabase.from('setores').select(COLUNAS_SETOR_DO_FILTRO)
      .eq('empresa_id', empresa.id).order('nome')
      .then(({ data }) => {
        setSetoresDisponiveis(
          (data as unknown as { id: string; nome: string; ativo: boolean; tipo: string | null }[] | null) ?? [],
        );
      });
  }, [verTodosSetores, empresa?.id]);

  /*
   * As equipes seguem o setor em foco — é a cascata do Dashboard. Sem ela,
   * quem tem `todos_setores` recebia as equipes da empresa inteira numa lista
   * só, sem dizer de que setor era cada uma.
   */
  useEffect(() => {
    if (!podeVerEquipe || !empresa?.id) return;
    const setorDaVez = verTodosSetores ? filtroSetor : (perfil?.setor_id ?? null);
    if (!setorDaVez && !verTodosSetores) return;
    let q = supabase
      .from('equipes')
      .select('id, nome')
      .eq('empresa_id', empresa.id);
    if (setorDaVez) q = q.eq('setor_id', setorDaVez);
    q.order('nome')
      .then(({ data }) => {
        setEquipesDoSetor((data as { id: string; nome: string }[]) ?? []);
      });
  }, [podeVerEquipe, perfil?.setor_id, empresa?.id, verTodosSetores, filtroSetor]);

  /*
   * Trocar de setor solta a equipe escolhida. Sem isto, escolher «Play 3» com a
   * equipe «Tauana» (do Play 5) marcada deixava a lista vazia e o seletor
   * mostrando uma equipe que não está mais entre as opções.
   */
  useEffect(() => {
    if (!visao.startsWith('equipe:')) return;
    const id = visao.replace('equipe:', '');
    if (equipesDoSetor.length > 0 && !equipesDoSetor.some(e => e.id === id)) {
      setVisao('setor');
    }
  }, [equipesDoSetor, visao]);

  // Sem setor de sistema, e sem inativo do mês corrente em diante — mês
  // passado mantém o setor que existia nele. Ver `lib/setoresDosFiltros`.
  const setoresDoFiltro = useMemo(
    () => listaDoFiltroDeSetores(setoresDisponiveis, null, { mes: mesFiltro }),
    [setoresDisponiveis, mesFiltro],
  );

  const equipeFiltroAtivo = visao.startsWith('equipe:') ? visao.replace('equipe:', '') : null;
  const isVisaoIndividual = visao === 'individual';

  return {
    niveis, podeVerSetor, podeVerEquipe, verTodosSetores,
    visao, setVisao, isVisaoIndividual, equipeFiltroAtivo,
    filtroSetor, setFiltroSetor, equipesDoSetor, setoresDoFiltro,
  };
}

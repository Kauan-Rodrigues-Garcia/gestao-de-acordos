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
import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from './useAuth';
import { useEmpresa } from './useEmpresa';
import { useCargoPermissoes } from './useCargoPermissoes';
import { niveisLiberados, type NivelEscopo } from '@/lib/permissoes-escopo';
import { aplicarOrdemSetores } from '@/lib/setores-ordem';

export interface SetorResumo { id: string; nome: string }

/** Equipe com o setor a que pertence — é o `setor_id` que faz o filtro ser
 *  dinâmico: sem ele não dá para mostrar só as equipes do setor escolhido. */
export interface EquipeResumo { id: string; nome: string; setor_id: string | null }

/** Referência estável para "lista vazia" — `[]` novo a cada chamada faria o
 *  consumidor re-renderizar à toa em todo `useMemo` que dependa da lista. */
const VAZIO: SetorResumo[] = [];
const VAZIO_EQUIPES: EquipeResumo[] = [];

export interface SetoresEquipes {
  /** Setores da empresa — só para quem pode filtrar entre eles. */
  setores: SetorResumo[];
  setorFiltro: string | null;
  setSetorFiltro: (id: string | null) => void;
  /**
   * Equipes do SETOR EM FOCO.
   *
   * Segue `setorFiltro`. Antes não seguia: com `ver_todos_setores` a lista
   * trazia as equipes da empresa inteira, então escolher o setor B e depois
   * uma equipe do setor A cruzava dois recortes impossíveis e devolvia tela
   * vazia — parecendo "não há dados" quando o filtro é que era contraditório.
   */
  equipesDoSetor: EquipeResumo[];
  /** Níveis que este cargo pode escolher NO DASHBOARD. */
  niveis: NivelEscopo[];
  /**
   * O alcance de equipe cobre TODAS as equipes do setor?
   *
   * `false` = só as equipes de que a pessoa participa, e `equipesDoSetor` já
   * vem recortado assim. Sai daqui, e não de cada tela, porque o
   * `<FiltroEscopo />` também precisa saber: com o alcance limitado à própria
   * equipe, o botão «Todas as equipes» ofereceria um recorte que a pessoa não
   * tem.
   */
  podeTodasEquipes: boolean;
  loading: boolean;
}

export function useSetoresEquipes(): SetoresEquipes {
  const { perfil }  = useAuth();
  const { empresa } = useEmpresa();
  const { temPermissao } = useCargoPermissoes();
  /*
   * Escopo DESTA aba. Antes as duas listas saíam de `ver_todos_setores` e de
   * testes por cargo (`isPerfilAdmin`, `isPerfilLider`, `isPerfilDiretoria`) —
   * a mesma chave global que decidia Acordos, Analítico e Recebimento, mais
   * uma lista de cargos escrita à mão que discordava dela em alguns casos.
   */
  /*
   * Memoizado de propósito: `niveisLiberados` devolve um ARRAY NOVO a cada
   * chamada, e este valor sai daqui para fora — vira prop de `FiltroEscopo` e
   * entra em `useEffect` do Dashboard. Sem o memo, cada render seria um array
   * diferente por identidade, com o mesmo conteúdo: efeito disparando sem
   * parar e uma consulta ao banco junto. `temPermissao` já é estável
   * (`useCallback` em `useCargoPermissoes`), então a dependência basta.
   */
  const niveis = useMemo(() => niveisLiberados('dashboard', temPermissao), [temPermissao]);
  const podeTodosSetores = niveis.includes('todos_setores');
  const podeEquipe = niveis.includes('equipe');
  /*
   * A chave decide sozinha, e é isso que ela promete no rótulo.
   *
   * A primeira versão desta linha era
   *
   *   niveis.includes('setor') || podeTodosSetores || temPermissao(...)
   *
   * com o argumento de que quem alcança o setor alcança todas as equipes dele
   * por definição. O argumento é verdadeiro sobre DADO e falso sobre esta
   * tela: desligar a chave num cargo que continua com `dashboard_escopo_setor`
   * não mudava nada, e a única forma de ver o efeito era desligar duas coisas.
   * Isso é um interruptor que liga e não acontece nada — o defeito que o painel
   * inteiro existe para não repetir.
   *
   * Agora a chave manda na LISTA de equipes do filtro, e o alcance de setor
   * segue mandando no que a pessoa soma quando não escolhe equipe nenhuma. São
   * duas perguntas, e cada uma tem o seu controle.
   */
  const podeTodasEquipes = temPermissao('dashboard_escopo_equipe_todas');

  const [setores, setSetores]               = useState<SetorResumo[]>(VAZIO);
  const [equipes, setEquipes] = useState<EquipeResumo[]>(VAZIO_EQUIPES);
  const [minhasEquipes, setMinhasEquipes]   = useState<ReadonlySet<string>>(() => new Set());
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
  const minhaEquipeId =
    (perfil as (typeof perfil & { equipe_id?: string | null }) | null)?.equipe_id ?? null;

  const carregar = useCallback(async () => {
    if (!cargo || !empresaId) { setLoading(false); return; }

    try {
      // A lista de setores só serve a quem pode escolher entre eles.
      if (podeTodosSetores) {
        const { data } = await supabase
          .from('setores').select('id, nome')
          .eq('empresa_id', empresaId).order('nome');
        // Ordem escolhida na aba Setores; o `order('nome')` acima vira só o
        // desempate de quem ainda não está na ordem salva.
        setSetores(aplicarOrdemSetores((data as SetorResumo[]) ?? [], empresaId));
      } else {
        setSetores(VAZIO);
      }

      // Equipes: da empresa toda para quem escolhe o setor; do próprio setor
      // para quem está travado nele. O recorte fino por setor em foco acontece
      // depois, sobre esta lista — ver `equipesDoSetor` no retorno.
      if (podeEquipe && (setorId || podeTodosSetores)) {
        let q = supabase.from('equipes').select('id, nome, setor_id').eq('empresa_id', empresaId);
        if (!podeTodosSetores && setorId) q = q.eq('setor_id', setorId);
        const { data } = await q.order('nome');
        setEquipes((data as EquipeResumo[]) ?? []);
      } else {
        setEquipes(VAZIO_EQUIPES);
      }

      /*
       * A MINHA equipe: a do cadastro, e só ela.
       *
       * Sem equipe cadastrada não aparece nenhuma; com uma, aparece uma. Quem
       * está CLONADO em outra equipe continua vendo só a de origem — o clone é
       * um empréstimo de mão de obra para o outro setor, não uma segunda casa,
       * e listar a equipe emprestada devolveria à pessoa exatamente o alcance
       * que esta chave veio tirar.
       *
       * Sai do próprio perfil, sem ida ao banco: `perfis` é `select('*')` no
       * `useAuth`, então `equipe_id` já está em mãos.
       */
      setMinhasEquipes(
        podeEquipe && !podeTodasEquipes && minhaEquipeId
          ? new Set([minhaEquipeId])
          : new Set(),
      );
    } catch (err) {
      console.warn('[useSetoresEquipes] erro ao carregar listas:', err);
    } finally {
      setLoading(false);
    }
  }, [cargo, setorId, empresaId, podeTodosSetores, podeEquipe, podeTodasEquipes,
      minhaEquipeId]);

  useEffect(() => { void carregar(); }, [carregar]);

  /*
   * O recorte que faz o filtro ser dinâmico: com um setor escolhido, só as
   * equipes DELE. Sem setor escolhido, a lista como veio — que para quem não
   * pode escolher setor já é a do próprio setor.
   */
  const equipesDoSetor = useMemo(() => {
    const doSetor = setorFiltro ? equipes.filter(e => e.setor_id === setorFiltro) : equipes;
    // Alcance limitado à própria equipe: o filtro lista só as minhas. Nada de
    // mostrar o botão de uma equipe cujo dado o banco vai negar.
    return podeTodasEquipes ? doSetor : doSetor.filter(e => minhasEquipes.has(e.id));
  }, [equipes, setorFiltro, podeTodasEquipes, minhasEquipes]);

  return {
    setores, setorFiltro, setSetorFiltro, equipesDoSetor, niveis,
    podeTodasEquipes, loading,
  };
}

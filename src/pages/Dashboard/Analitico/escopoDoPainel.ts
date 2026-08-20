/**
 * escopoDoPainel.ts — quem vê o quê no Painel do Líder, decidido uma vez.
 *
 * ## O defeito que este arquivo remove
 *
 * As três abas analíticas do painel (Desempenho Equipes, Quartis, Gráfico)
 * resolviam o setor cada uma do seu jeito, e as três discordavam:
 *
 *   • o PAI calculava `setorAbas = (!isAdmin && !verTodosSetores) ? setor : null`
 *     e passava `null` quando a pessoa enxerga tudo;
 *   • `DesempenhoEquipes` recebia esse `null` e fazia `setorId ?? perfil.setor_id`
 *     — caindo no setor do próprio perfil e mostrando UM setor à diretoria;
 *   • `QuartisOperadores` fazia o mesmo `??` e ainda tinha filtro próprio, com
 *     lista de cargo escrita à mão. A opção "Todos os setores" gravava `''`, e
 *     `filtroSetor || setorProprio` devolvia o setor da pessoa: escolher "todos"
 *     mostrava um;
 *   • o `Gráfico` não tinha filtro nenhum, e o escopo virava `null` sempre que
 *     não houvesse setor — somando a empresa toda sem como estreitar.
 *
 * Agora existe UM escopo, calculado aqui e passado pronto. `null` em `setorId`
 * significa "todos os setores" e nada mais o reinterpreta.
 *
 * ## A regra
 *
 * Quem enxerga mais de um setor ESCOLHE qual olhar (ou todos). Quem não enxerga
 * fica travado no próprio, e para essa pessoa o filtro nem aparece — um seletor
 * com uma opção só é ruído.
 *
 * Quem decide isso é `veTodosOsSetores` de `escopoAnalitico.ts`, a mesma função
 * que o dashboard e a aba Analítico usam. O cabeçalho dela conta que existiam
 * duas versões discordantes, uma por cargo e outra por permissão; repetir a
 * lista aqui recriaria o problema.
 */

import type { EquipeAnalitico } from '@/services/analitico/analitico.service';

export interface EntradaEscopoPainel {
  /** Cargo de quem está olhando. */
  cargo: string | null | undefined;
  /** `temPermissao` de `useCargoPermissoes`. */
  temPermissao: (chave: string) => boolean;
  /** Setor do próprio perfil. Nulo para a cúpula — ver `PERFIS_ESCOPO_EMPRESA`. */
  setorDoPerfil: string | null;
  /** Setor escolhido no filtro. `null` = "todos os setores". */
  setorEscolhido: string | null;
  /** Equipe escolhida no filtro. `null` = "todas as equipes". */
  equipeEscolhida: string | null;
  /** Equipes da empresa no mês, para validar a escolha e montar a lista. */
  equipes: readonly EquipeAnalitico[];
}

export interface EscopoPainel {
  /**
   * Setor que as abas devem usar. `null` = todos.
   *
   * Autoritativo: nenhum componente filho deve completar este valor com o setor
   * do próprio perfil. Era exatamente esse `??` que mostrava um setor à
   * diretoria quando o pai já havia dito "todos".
   */
  setorId: string | null;
  /** Equipe em foco. `null` = todas as equipes do setor em foco. */
  equipeId: string | null;
  /** Mostrar o seletor de setor? Falso para quem só enxerga o próprio. */
  podeFiltrarSetor: boolean;
  /** Equipes que cabem no seletor, já recortadas pelo setor em foco. */
  equipesDisponiveis: EquipeAnalitico[];
  /** Alguma restrição está ativa? Serve ao rótulo "limpar filtros". */
  temFiltroAtivo: boolean;
}

/**
 * Resolve o escopo do painel.
 *
 * Duas correções de coerência acontecem aqui, e não na tela:
 *
 * 1. **Equipe órfã.** Trocar o setor deixaria uma equipe do setor anterior
 *    selecionada, e o cruzamento devolveria lista vazia — parecendo "não há
 *    ninguém" quando o filtro é que estava impossível. A equipe que não pertence
 *    ao setor em foco é descartada.
 * 2. **Setor de quem não pode escolher.** Se a permissão for revogada enquanto a
 *    tela está aberta, o valor escolhido antes continuaria valendo. Quem não
 *    pode filtrar usa o próprio setor, ponto.
 */
export function resolverEscopoPainel(e: EntradaEscopoPainel): EscopoPainel {
  const { equipes, setorDoPerfil } = e;

  const podeFiltrarSetor = e.temPermissao('painel_lider_todos_setores');

  const setorId = podeFiltrarSetor ? e.setorEscolhido : setorDoPerfil;

  const equipesDisponiveis = equipes.filter(eq => !setorId || eq.setor_id === setorId);

  // A equipe só sobrevive se estiver entre as disponíveis.
  const equipeId = e.equipeEscolhida
      && equipesDisponiveis.some(eq => eq.id === e.equipeEscolhida)
    ? e.equipeEscolhida
    : null;

  return {
    setorId,
    equipeId,
    podeFiltrarSetor,
    equipesDisponiveis,
    // O setor só conta como filtro para quem tinha a opção de não filtrar: para
    // um líder travado no setor dele, "limpar filtros" não deveria oferecer
    // remover o próprio escopo.
    temFiltroAtivo: (podeFiltrarSetor && setorId !== null) || equipeId !== null,
  };
}

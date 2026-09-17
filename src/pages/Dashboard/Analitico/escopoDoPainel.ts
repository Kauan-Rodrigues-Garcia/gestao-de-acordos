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
 * Agora existe UM escopo, calculado aqui e passado pronto. Lista VAZIA em
 * `setorIds` significa "todos os setores" e nada mais o reinterpreta.
 *
 * ## Escolha múltipla (17/09/2026)
 *
 * O recorte deixou de ser "um setor OU todos". A liderança pediu para comparar
 * um punhado de setores — ou um punhado de equipes dentro deles — sem ter de
 * olhar um de cada vez e somar de cabeça. Por isso o escopo é um CONJUNTO:
 *
 *   • `setorIds` vazio  = todos os setores que a pessoa enxerga;
 *   • `setorIds` com N  = exatamente esses N, e nada além deles;
 *   • idem para `equipeIds`, sempre dentro do que os setores deixaram passar.
 *
 * O caso de um item continua existindo e continua valendo o que valia — é o
 * conjunto de tamanho 1. Nenhum consumidor deve completar uma lista vazia com
 * o setor do próprio perfil: era esse `??` que mostrava um setor à diretoria.
 *
 * ## A regra
 *
 * Quem enxerga mais de um setor ESCOLHE quais olhar (ou todos). Quem não
 * enxerga fica travado no próprio, e para essa pessoa o filtro nem aparece —
 * um seletor com uma opção só é ruído.
 *
 * Quem decide isso são as permissões DESTA aba, resolvidas por
 * `escopoEfetivo("painel_lider")`. Antes vinha de `veTodosOsSetores`, que
 * respondia por cargo (diretoria e admin sempre) ou pelas chaves globais
 * `ver_todos_setores` / `ver_analiticos_global` — as mesmas que decidiam
 * Dashboard, Analítico e Recebimento. Mexer no alcance de uma mexia em todas.
 *
 * A diretoria continua enxergando todos os setores: a migration ligou a chave
 * para ela. O que muda é que agora isso é configurável, em vez de escrito no
 * código — que era o pedido.
 */

import { escopoEfetivo } from '@/lib/permissoes-escopo';

import type { EquipeAnalitico } from '@/services/analitico/analitico.service';

export interface EntradaEscopoPainel {
  /**
   * Cargo de quem está olhando.
   *
   * Não decide mais nada aqui — o escopo saiu do cargo e foi para as chaves
   * da aba. Continua no tipo para quem chama não precisar mudar junto, e sai
   * quando a última tela parar de passá-lo.
   */
  cargo?: string | null;
  /** `temPermissao` de `useCargoPermissoes`. */
  temPermissao: (chave: string) => boolean;
  /** Setor do próprio perfil. Nulo para a cúpula — ver `PERFIS_ESCOPO_EMPRESA`. */
  setorDoPerfil: string | null;
  /** Setores marcados no filtro. Lista vazia = "todos os setores". */
  setoresEscolhidos: readonly string[];
  /** Equipes marcadas no filtro. Lista vazia = "todas as equipes". */
  equipesEscolhidas: readonly string[];
  /** Equipes da empresa no mês, para validar a escolha e montar a lista. */
  equipes: readonly EquipeAnalitico[];
}

export interface EscopoPainel {
  /**
   * Setores que as abas devem usar. Lista VAZIA = todos.
   *
   * Autoritativo: nenhum componente filho deve completar este valor com o setor
   * do próprio perfil. Era exatamente esse `??` que mostrava um setor à
   * diretoria quando o pai já havia dito "todos".
   */
  setorIds: string[];
  /** Equipes em foco. Lista VAZIA = todas as equipes dos setores em foco. */
  equipeIds: string[];
  /**
   * O setor em foco quando há EXATAMENTE um.
   *
   * Existe para o que é legítimo com um só: o nome no cabeçalho, o rótulo do
   * setor travado. Não serve de filtro — quem filtra usa `setorIds`, senão
   * "três setores" viraria "todos" pelo caminho.
   */
  setorUnico: string | null;
  /** Mostrar o seletor de setor? Falso para quem só enxerga o próprio. */
  podeFiltrarSetor: boolean;
  /** Equipes que cabem no seletor, já recortadas pelos setores em foco. */
  equipesDisponiveis: EquipeAnalitico[];
  /** Alguma restrição está ativa? Serve ao rótulo "limpar filtros". */
  temFiltroAtivo: boolean;
}

/** Sem repetições e sem `''`, preservando a ordem em que foram marcados. */
function limpar(ids: readonly string[]): string[] {
  return [...new Set(ids.filter(Boolean))];
}

/**
 * Resolve o escopo do painel.
 *
 * Duas correções de coerência acontecem aqui, e não na tela:
 *
 * 1. **Equipe órfã.** Trocar os setores deixaria equipes do recorte anterior
 *    selecionadas, e o cruzamento devolveria lista vazia — parecendo "não há
 *    ninguém" quando o filtro é que estava impossível. Equipe que não pertence
 *    a nenhum setor em foco é descartada.
 * 2. **Setor de quem não pode escolher.** Se a permissão for revogada enquanto a
 *    tela está aberta, o valor escolhido antes continuaria valendo. Quem não
 *    pode filtrar usa o próprio setor, ponto.
 */
export function resolverEscopoPainel(e: EntradaEscopoPainel): EscopoPainel {
  const { equipes, setorDoPerfil } = e;

  // Só as chaves do Painel Líder respondem por esta tela. Escopo amplo em
  // Acordos, Lixeira ou Pix não abre setor nenhum aqui.
  const podeFiltrarSetor = escopoEfetivo('painel_lider', e.temPermissao) === 'todos_setores';

  const setorIds = podeFiltrarSetor
    ? limpar(e.setoresEscolhidos)
    : (setorDoPerfil ? [setorDoPerfil] : []);

  const noFoco = new Set(setorIds);
  const equipesDisponiveis = equipes.filter(
    eq => noFoco.size === 0 || (eq.setor_id ? noFoco.has(eq.setor_id) : false),
  );

  // A equipe só sobrevive se estiver entre as disponíveis.
  const disponivel = new Set(equipesDisponiveis.map(eq => eq.id));
  const equipeIds = limpar(e.equipesEscolhidas).filter(id => disponivel.has(id));

  return {
    setorIds,
    equipeIds,
    setorUnico: setorIds.length === 1 ? setorIds[0] : null,
    podeFiltrarSetor,
    equipesDisponiveis,
    // O setor só conta como filtro para quem tinha a opção de não filtrar: para
    // um líder travado no setor dele, "limpar filtros" não deveria oferecer
    // remover o próprio escopo.
    temFiltroAtivo: (podeFiltrarSetor && setorIds.length > 0) || equipeIds.length > 0,
  };
}

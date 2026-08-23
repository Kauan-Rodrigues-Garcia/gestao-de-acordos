/**
 * rhAgregacao.ts — a hierarquia que o RH lê, montada em memória.
 *
 * ## Por que agregar aqui, e não no banco
 *
 * A visão consolidada do RH tem quatro níveis (cidade → setor → equipe →
 * operador) e, em cada um, um estado que é DERIVADO dos filhos. Uma RPC de
 * agregação teria de repetir a mesma máquina de estados que `rhEstados.ts` já
 * descreve — dois lugares para a mesma verdade, e o segundo envelhece.
 *
 * O volume permite: uma competência tem tantas linhas quantos operadores
 * ativos, na casa das centenas. É a mesma ordem de grandeza que a aba Quartis
 * já agrega no navegador todo dia.
 *
 * ## Não apresente uma tabela gigante primeiro
 *
 * A função existe para servir a exigência do pedido: o RH abre uma visão
 * consolidada, não uma lista de todos os operadores. Cada nó já vem com o
 * resumo pronto, então a tela desenha cartões sem recalcular nada.
 *
 * Puro, sem React e sem Supabase — com teste próprio.
 */

import { resumirGrupo, type ResumoGrupo, type StatusLancamento } from './rhEstados';

/** O mínimo que a agregação lê de um lançamento. */
export interface LinhaAgregavel {
  id: string;
  status: StatusLancamento;
  valor: number | null;
  celula_snapshot: string;
  setor_id_snapshot: string;
  setor_nome_snapshot: string;
  equipe_id_snapshot: string | null;
  equipe_nome_snapshot: string | null;
  tipo_remuneracao_snapshot: string;
}

export interface NoEquipe<T extends LinhaAgregavel> {
  /** `null` quando o operador não tem equipe — vira o balde «Sem equipe». */
  equipeId: string | null;
  equipeNome: string;
  linhas: T[];
  resumo: ResumoGrupo;
}

export interface NoSetor<T extends LinhaAgregavel> {
  setorId: string;
  setorNome: string;
  tipoRemuneracao: string;
  equipes: NoEquipe<T>[];
  resumo: ResumoGrupo;
}

export interface NoCelula<T extends LinhaAgregavel> {
  celula: string;
  /**
   * Tipo predominante da cidade — é o rótulo do cabeçalho («BIRIGUI —
   * PREMIAÇÃO»). Sai dos setores, e não de uma constante: se um dia um setor de
   * Birigui virar comissão, o cabeçalho deixa de mentir sozinho.
   */
  tipoRemuneracao: string;
  setores: NoSetor<T>[];
  resumo: ResumoGrupo;
}

export interface ArvoreRh<T extends LinhaAgregavel> {
  celulas: NoCelula<T>[];
  resumo: ResumoGrupo;
  /** Total por tipo, para os cartões «total de premiação» e «total de comissão». */
  totalPorTipo: Record<string, number>;
}

/** Identificador do balde de quem está sem equipe. */
export const SEM_EQUIPE = '__sem_equipe__';

/**
 * Monta a árvore inteira a partir das linhas.
 *
 * A ORDEM é estável e significativa: cidades e setores na ordem informada
 * (`ordemCelulas` vem de `rh_celulas.ordem`, que o RH configura), e o resto em
 * ordem alfabética. Ordem que muda a cada leitura faria a tela reordenar
 * sozinha e é justamente o que a atualização incremental existe para evitar.
 */
export function montarArvore<T extends LinhaAgregavel>(
  linhas: readonly T[],
  ordemCelulas: readonly string[] = [],
): ArvoreRh<T> {
  const porCelula = new Map<string, Map<string, Map<string, T[]>>>();

  for (const l of linhas) {
    const celula = l.celula_snapshot || 'Sem cidade';
    const equipe = l.equipe_id_snapshot ?? SEM_EQUIPE;

    let setores = porCelula.get(celula);
    if (!setores) { setores = new Map(); porCelula.set(celula, setores); }

    let equipes = setores.get(l.setor_id_snapshot);
    if (!equipes) { equipes = new Map(); setores.set(l.setor_id_snapshot, equipes); }

    const lista = equipes.get(equipe);
    if (lista) lista.push(l);
    else equipes.set(equipe, [l]);
  }

  const posicao = new Map(ordemCelulas.map((c, i) => [c, i]));
  const ordenarCelula = (a: string, b: string) => {
    const pa = posicao.get(a); const pb = posicao.get(b);
    if (pa != null && pb != null) return pa - pb;
    // Cidade que não está na configuração vai para o fim, e não some.
    if (pa != null) return -1;
    if (pb != null) return 1;
    return a.localeCompare(b, 'pt-BR');
  };

  const celulas: NoCelula<T>[] = [...porCelula.keys()]
    .sort(ordenarCelula)
    .map(celula => {
      const setoresMapa = porCelula.get(celula)!;

      const setores: NoSetor<T>[] = [...setoresMapa.entries()]
        .map(([setorId, equipesMapa]) => {
          const equipes: NoEquipe<T>[] = [...equipesMapa.entries()]
            .map(([equipeId, lista]) => ({
              equipeId: equipeId === SEM_EQUIPE ? null : equipeId,
              equipeNome: lista[0].equipe_nome_snapshot ?? 'Sem equipe',
              linhas: [...lista].sort((a, b) => nomeDe(a).localeCompare(nomeDe(b), 'pt-BR')),
              resumo: resumirGrupo(lista),
            }))
            .sort((a, b) => a.equipeNome.localeCompare(b.equipeNome, 'pt-BR'));

          const todas = equipes.flatMap(e => e.linhas);
          return {
            setorId,
            setorNome: todas[0]?.setor_nome_snapshot ?? '—',
            tipoRemuneracao: todas[0]?.tipo_remuneracao_snapshot ?? 'premiacao',
            equipes,
            resumo: resumirGrupo(todas),
          };
        })
        .sort((a, b) => a.setorNome.localeCompare(b.setorNome, 'pt-BR'));

      const todas = setores.flatMap(s => s.equipes.flatMap(e => e.linhas));
      return {
        celula,
        tipoRemuneracao: tipoPredominante(setores),
        setores,
        resumo: resumirGrupo(todas),
      };
    });

  const totalPorTipo: Record<string, number> = {};
  for (const l of linhas) {
    if (l.valor == null) continue;
    const t = l.tipo_remuneracao_snapshot;
    totalPorTipo[t] = (totalPorTipo[t] ?? 0) + (Number(l.valor) || 0);
  }

  return { celulas, resumo: resumirGrupo(linhas), totalPorTipo };
}

/** O nome exibido de uma linha, tolerando o tipo mínimo da agregação. */
function nomeDe(l: LinhaAgregavel): string {
  return (l as LinhaAgregavel & { nome_snapshot?: string }).nome_snapshot ?? '';
}

/**
 * O tipo que descreve a cidade.
 *
 * Vence o que tem mais OPERADORES, e não mais setores: uma cidade com cinco
 * setores de premiação minúsculos e um de comissão com cem pessoas é, na
 * prática, uma cidade de comissão. Empate devolve o primeiro em ordem — e o
 * cabeçalho é rótulo, não regra: cada setor carrega o próprio tipo.
 */
function tipoPredominante<T extends LinhaAgregavel>(setores: NoSetor<T>[]): string {
  const peso: Record<string, number> = {};
  for (const s of setores) {
    peso[s.tipoRemuneracao] = (peso[s.tipoRemuneracao] ?? 0) + s.resumo.total;
  }
  const entradas = Object.entries(peso).sort((a, b) => b[1] - a[1]);
  return entradas[0]?.[0] ?? 'premiacao';
}

/**
 * As equipes que aparecem na visão do líder, já com o resumo.
 *
 * A RLS entrega só o que ele lidera, então basta agrupar. Não há filtro por
 * equipe aqui de propósito: filtrar no cliente criaria uma segunda régua para
 * divergir de `fn_rh_lancamento_visivel`.
 */
export function equipesDoResultado<T extends LinhaAgregavel>(
  linhas: readonly T[],
): NoEquipe<T>[] {
  const { celulas } = montarArvore(linhas);
  return celulas
    .flatMap(c => c.setores)
    .flatMap(s => s.equipes)
    .sort((a, b) => a.equipeNome.localeCompare(b.equipeNome, 'pt-BR'));
}

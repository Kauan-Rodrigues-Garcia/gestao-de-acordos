/**
 * agregacaoFormas.ts — as contas do "Detalhamento por forma de pagamento".
 *
 * ## De onde vêm os números
 *
 * Da MESMA fonte do resto da aba: as linhas agregadas de
 * `fn_analitico_dashboard_mes_json` (dia × operador × setor × forma × tabulação),
 * já usadas pelo dashboard, pelo Painel Líder e pelo fechamento. Nada de uma
 * quarta consulta com uma quarta regra — o cartão de visita deste projeto é que
 * três contas para o mesmo dinheiro dão três números.
 *
 * A pergunta "esta linha conta no que estou olhando?" é de `escopoAnalitico.ts`
 * (carimbo do relatório no setor normal, soma dos usuários no alternativo e na
 * PaguePlay, origens tiradas do acumulado). Aqui só se soma o que ela aprovou.
 *
 * ## Por que é um módulo puro, e não `useMemo` dentro da tela
 *
 * Igual a `agregacaoLider.ts`: lógica que decide NÚMERO dentro de `useMemo` só é
 * exercitada montando a tela inteira, e por isso nunca teve teste. Entra dado,
 * sai número — e o teste alcança.
 *
 * ## O filtro de forma NÃO mora aqui
 *
 * A agregação devolve, em cada linha do dia / do operador / da equipe, o valor
 * quebrado por forma (`porForma`). Selecionar formas na tela é somar as chaves
 * escolhidas (`somaDasFormas`), não refazer a agregação: assim os cards por
 * forma continuam mostrando o recorte inteiro — é neles que se clica para
 * filtrar — e a soma das partes sempre fecha com o total.
 */

import type { AnaliticoDashboardLinha } from '@/lib/supabase';
import { linhaNoEscopo, type EscopoAnalitico } from '@/services/analitico/escopoAnalitico';
import { rotuloDaForma, ROTULO_SEM_OPERADOR } from '@/lib/formasPagamento';
import { diasNoMes, primeiroDiaDoMes, ultimoDiaDoMes } from '@/lib/mesReferencia';
import { formatBRL } from '@/lib/money';

/** Chave da linha órfã (sem operador cadastrado) nas quebras por grupo. */
export const CHAVE_SEM_OPERADOR = '__sem_operador__';

export type FiltroTabulacaoFormas = 'todas' | 'tabulado' | 'nao_tabulado' | 'divergente';

/**
 * O que a TELA recorta.
 *
 * Setor, equipe e operador NÃO estão aqui de propósito: eles já são um
 * `EscopoAnalitico` (`useEscopoAnalitico` monta com clones, setor alternativo e
 * origens tiradas do acumulado). Repetir a regra num filtro paralelo é como o
 * dashboard e a aba Analítico chegaram a discordar sobre o mesmo operador.
 */
export interface FiltroFormas {
  /** 'yyyy-MM-dd' inclusive. Vazio = desde o começo do mês. */
  inicio?: string | null;
  /** 'yyyy-MM-dd' inclusive. Vazio = até o fim do mês. */
  fim?: string | null;
  /** Recorte por situação da tabulação. Padrão: todas. */
  tabulacao?: FiltroTabulacaoFormas;
}

/** Como nomear operador e equipe nas quebras — resolvido por quem chama. */
export interface RotulosFormas {
  /** Nome de exibição do operador. */
  nomeOperador: (id: string) => string;
  /** Usuário/login do operador, para a segunda linha da tabela. */
  usuarioOperador?: (id: string) => string;
  /** Nome da equipe de ORIGEM do operador (ver `porEquipe` em DetalhamentoFormas). */
  equipeDoOperador: (id: string) => string;
}

export interface FatiaForma {
  rotulo: string;
  bruto: number;
  ho: number;
  qtd: number;
  /** Parte do recorte que ainda não tem acordo tabulado. */
  naoTabulado: number;
  /** Participação no recorte, 0..100 (uma casa decimal). */
  share: number;
  /** Valor médio por registro do relatório. */
  ticket: number;
}

export interface GrupoFormas {
  /** id do operador, `CHAVE_SEM_OPERADOR`, ou o nome da equipe. */
  chave: string;
  rotulo: string;
  /** Linha secundária (usuário do operador; vazio na quebra por equipe). */
  detalhe: string;
  bruto: number;
  ho: number;
  qtd: number;
  /** rótulo da forma → valor bruto. */
  porForma: Record<string, number>;
}

export interface DiaFormas {
  /** Dia do mês, 1..31. */
  dia: number;
  total: number;
  porForma: Record<string, number>;
}

export interface DetalhamentoFormas {
  /** Formas do recorte, da maior para a menor. */
  formas: FatiaForma[];
  /** Só os rótulos, na mesma ordem — a ordem das séries do gráfico e da tabela. */
  rotulos: string[];
  total: number;
  ho: number;
  qtd: number;
  ticket: number;
  naoTabulado: number;
  naoTabuladoQtd: number;
  /** Um item por dia da janela, inclusive os sem recebimento (ritmo do mês). */
  porDia: DiaFormas[];
  porOperador: GrupoFormas[];
  /**
   * Quebra por equipe de ORIGEM do operador.
   *
   * Operador clonado em outra equipe aparece só na de origem: aqui as partes
   * precisam fechar com o total, e um clone somado nas duas equipes faria a
   * soma das linhas passar do topo da tela. Para ver o que conta em CADA equipe
   * — inclusive o clone — existe o filtro de equipe, que usa
   * `operadoresDaEquipe` e é a mesma regra do card de setor.
   */
  porEquipe: GrupoFormas[];
  diasComRecebimento: number;
  operadoresComRecebimento: number;
}

/** Janela de dias que o gráfico desenha, sempre dentro do mês em foco. */
export function janelaDeDias(
  mes: string, inicio?: string | null, fim?: string | null,
): { de: number; ate: number } {
  const total = diasNoMes(mes);
  const doMes = (iso: string | null | undefined, padrao: number): number => {
    if (!iso || iso.slice(0, 7) !== mes) return padrao;
    const d = Number(iso.slice(8, 10));
    return Number.isFinite(d) && d >= 1 && d <= total ? d : padrao;
  };
  return { de: doMes(inicio, 1), ate: doMes(fim, total) };
}

/** O período selecionado é o mês inteiro? (o que autoriza comparar com o mês anterior) */
export function periodoEhMesTodo(
  mes: string, inicio?: string | null, fim?: string | null,
): boolean {
  const de  = !inicio || inicio === primeiroDiaDoMes(mes);
  const ate = !fim    || fim    === ultimoDiaDoMes(mes);
  return de && ate;
}

/** A linha passa pelos filtros da tela? (quem conta onde é `linhaNoEscopo`) */
function passaNoFiltro(l: AnaliticoDashboardLinha, f: FiltroFormas): boolean {
  if (f.inicio && l.dia < f.inicio) return false;
  if (f.fim    && l.dia > f.fim)    return false;
  if (f.tabulacao && f.tabulacao !== 'todas' && l.status_tabulacao !== f.tabulacao) return false;
  return true;
}

interface Acumulador {
  bruto: number;
  ho: number;
  qtd: number;
  porForma: Record<string, number>;
}

function novoAcumulador(): Acumulador {
  return { bruto: 0, ho: 0, qtd: 0, porForma: {} };
}

/**
 * Soma o recorte, quebrado por forma, por dia, por operador e por equipe.
 *
 * @param mes 'yyyy-MM' — define a janela de dias do gráfico. As linhas já vêm
 *   do mês (a RPC busca por mês), mas o eixo precisa dos dias VAZIOS também.
 */
export function agregarFormas(
  linhas: readonly AnaliticoDashboardLinha[],
  escopo: EscopoAnalitico,
  filtro: FiltroFormas,
  rotulos: RotulosFormas,
  mes: string,
): DetalhamentoFormas {
  const porForma     = new Map<string, { bruto: number; ho: number; qtd: number; naoTabulado: number }>();
  const porDiaMap    = new Map<number, Acumulador>();
  const porOperador  = new Map<string, Acumulador>();
  const porEquipe    = new Map<string, Acumulador>();

  let total = 0, ho = 0, qtd = 0, naoTabulado = 0, naoTabuladoQtd = 0;

  for (const l of linhas) {
    if (!linhaNoEscopo(l, escopo)) continue;
    if (!passaNoFiltro(l, filtro)) continue;

    const valor = Number(l.total) || 0;
    const valorHo = Number(l.total_ho) || 0;
    const registros = Number(l.qtd) || 0;
    const rotulo = rotuloDaForma(l.forma_pagamento, l.forma_detalhe);
    const semTabulacao = l.status_tabulacao === 'nao_tabulado';

    total += valor; ho += valorHo; qtd += registros;
    if (semTabulacao) { naoTabulado += valor; naoTabuladoQtd += registros; }

    const forma = porForma.get(rotulo)
      ?? { bruto: 0, ho: 0, qtd: 0, naoTabulado: 0 };
    forma.bruto += valor; forma.ho += valorHo; forma.qtd += registros;
    if (semTabulacao) forma.naoTabulado += valor;
    porForma.set(rotulo, forma);

    const dia = Number(l.dia.slice(8, 10));
    const doDia = porDiaMap.get(dia) ?? novoAcumulador();
    somar(doDia, rotulo, valor, valorHo, registros);
    porDiaMap.set(dia, doDia);

    const chaveOp = l.operador_id ?? CHAVE_SEM_OPERADOR;
    const doOp = porOperador.get(chaveOp) ?? novoAcumulador();
    somar(doOp, rotulo, valor, valorHo, registros);
    porOperador.set(chaveOp, doOp);

    const chaveEq = l.operador_id
      ? (rotulos.equipeDoOperador(l.operador_id) || 'Sem equipe')
      : ROTULO_SEM_OPERADOR;
    const daEq = porEquipe.get(chaveEq) ?? novoAcumulador();
    somar(daEq, rotulo, valor, valorHo, registros);
    porEquipe.set(chaveEq, daEq);
  }

  const formas: FatiaForma[] = [...porForma.entries()]
    .map(([rotulo, f]) => ({
      rotulo,
      bruto: f.bruto,
      ho: f.ho,
      qtd: f.qtd,
      naoTabulado: f.naoTabulado,
      share:  total > 0 ? Math.round((f.bruto / total) * 1000) / 10 : 0,
      ticket: f.qtd  > 0 ? f.bruto / f.qtd : 0,
    }))
    .sort((a, b) => b.bruto - a.bruto || a.rotulo.localeCompare(b.rotulo, 'pt-BR'));

  const { de, ate } = janelaDeDias(mes, filtro.inicio, filtro.fim);
  const porDia: DiaFormas[] = [];
  for (let d = de; d <= ate; d++) {
    const acc = porDiaMap.get(d);
    porDia.push({ dia: d, total: acc?.bruto ?? 0, porForma: acc?.porForma ?? {} });
  }

  return {
    formas,
    rotulos: formas.map(f => f.rotulo),
    total, ho, qtd,
    ticket: qtd > 0 ? total / qtd : 0,
    naoTabulado, naoTabuladoQtd,
    porDia,
    porOperador: grupos(porOperador, chave => ({
      rotulo:  chave === CHAVE_SEM_OPERADOR ? ROTULO_SEM_OPERADOR : rotulos.nomeOperador(chave),
      detalhe: chave === CHAVE_SEM_OPERADOR
        ? 'linhas sem operador cadastrado'
        : (rotulos.usuarioOperador?.(chave) ?? ''),
    })),
    porEquipe: grupos(porEquipe, chave => ({ rotulo: chave, detalhe: '' })),
    diasComRecebimento: [...porDiaMap.values()].filter(a => a.bruto > 0).length,
    operadoresComRecebimento: [...porOperador.keys()]
      .filter(k => k !== CHAVE_SEM_OPERADOR).length,
  };
}

function somar(
  acc: Acumulador, rotulo: string, valor: number, valorHo: number, registros: number,
): void {
  acc.bruto += valor;
  acc.ho    += valorHo;
  acc.qtd   += registros;
  acc.porForma[rotulo] = (acc.porForma[rotulo] ?? 0) + valor;
}

function grupos(
  mapa: Map<string, Acumulador>,
  nomear: (chave: string) => { rotulo: string; detalhe: string },
): GrupoFormas[] {
  return [...mapa.entries()]
    .map(([chave, a]) => ({ chave, ...nomear(chave), bruto: a.bruto, ho: a.ho, qtd: a.qtd, porForma: a.porForma }))
    .sort((x, y) => y.bruto - x.bruto || x.rotulo.localeCompare(y.rotulo, 'pt-BR'));
}

/**
 * Valor de uma quebra considerando só as formas selecionadas.
 *
 * Seleção vazia (ou `null`) significa "todas" — é o estado inicial da tela, e
 * tratá-lo como "nenhuma" mostraria zero em tudo antes do primeiro clique.
 */
export function somaDasFormas(
  porForma: Record<string, number>,
  selecionadas?: ReadonlySet<string> | null,
): number {
  if (!selecionadas || selecionadas.size === 0) {
    let s = 0;
    for (const v of Object.values(porForma)) s += v;
    return s;
  }
  let s = 0;
  for (const rotulo of selecionadas) s += porForma[rotulo] ?? 0;
  return s;
}

/** Reordena as quebras pelo valor das formas selecionadas, e tira as zeradas. */
export function ordenarGrupos(
  grupos: readonly GrupoFormas[],
  selecionadas?: ReadonlySet<string> | null,
): GrupoFormas[] {
  return grupos
    .filter(g => somaDasFormas(g.porForma, selecionadas) > 0)
    .sort((a, b) =>
      somaDasFormas(b.porForma, selecionadas) - somaDasFormas(a.porForma, selecionadas)
      || a.rotulo.localeCompare(b.rotulo, 'pt-BR'));
}

/**
 * Duas ou três frases de leitura rápida — o que um líder diria olhando o painel.
 *
 * Existe porque um mosaico de percentuais não responde sozinho "e daí?". Cada
 * frase sai de um número já na tela; nenhuma inventa recorte novo.
 */
export function insightsFormas(
  atual: DetalhamentoFormas,
  anterior?: DetalhamentoFormas | null,
): string[] {
  if (atual.total <= 0) return [];
  const frases: string[] = [];

  const lider = atual.formas[0];
  if (lider) {
    frases.push(
      `${lider.rotulo} lidera com ${formatarShare(lider.share)} do recebido `
      + `(${formatBRL(lider.bruto)} em ${lider.qtd.toLocaleString('pt-BR')} registro${lider.qtd !== 1 ? 's' : ''}).`,
    );
  }

  // Variação por forma contra o mês anterior. Só entra a forma que já existia
  // nos dois meses: "cresceu ∞%" sobre uma base zero não informa nada.
  if (anterior && anterior.total > 0) {
    const antes = new Map(anterior.formas.map(f => [f.rotulo, f.bruto]));
    let destaque: { rotulo: string; variacao: number } | null = null;
    for (const f of atual.formas) {
      const base = antes.get(f.rotulo);
      if (!base || base <= 0) continue;
      const variacao = ((f.bruto - base) / base) * 100;
      if (!destaque || Math.abs(variacao) > Math.abs(destaque.variacao)) {
        destaque = { rotulo: f.rotulo, variacao };
      }
    }
    if (destaque && Math.abs(destaque.variacao) >= 5) {
      const verbo = destaque.variacao > 0 ? 'cresceu' : 'caiu';
      frases.push(
        `${destaque.rotulo} ${verbo} ${Math.abs(Math.round(destaque.variacao))}% em relação ao mês anterior.`,
      );
    }
  }

  const semTabular = [...atual.formas].sort((a, b) => b.naoTabulado - a.naoTabulado)[0];
  if (semTabular && semTabular.naoTabulado > 0) {
    frases.push(
      `${formatBRL(semTabular.naoTabulado)} em ${semTabular.rotulo} ainda sem acordo tabulado.`,
    );
  }

  return frases.slice(0, 3);
}

/** 39.1 → "39,1%"; 13 → "13%". Percentual com casa só quando ela diz algo. */
export function formatarShare(share: number): string {
  const inteiro = Number.isInteger(share);
  return `${share.toLocaleString('pt-BR', {
    minimumFractionDigits: inteiro ? 0 : 1,
    maximumFractionDigits: 1,
  })}%`;
}

/** Texto do botão "Copiar resumo" — mesma leitura, fora da tela. */
export function montarTextoResumoFormas(params: {
  detalhe: DetalhamentoFormas;
  periodo: string;
  escopoLabel: string;
}): string {
  const { detalhe, periodo, escopoLabel } = params;
  const linhas: (string | null)[] = [
    `Recebido por forma de pagamento — ${periodo}`,
    escopoLabel ? `Recorte: ${escopoLabel}` : null,
    '',
    ...detalhe.formas.map(f =>
      `${f.rotulo}: ${formatBRL(f.bruto)} (${formatarShare(f.share)}) · `
      + `${f.qtd.toLocaleString('pt-BR')} registro${f.qtd !== 1 ? 's' : ''}`),
    '',
    `TOTAL: ${formatBRL(detalhe.total)} · ${detalhe.qtd.toLocaleString('pt-BR')} registros`,
    detalhe.naoTabulado > 0 ? `Sem tabulação: ${formatBRL(detalhe.naoTabulado)}` : null,
  ];
  return linhas.filter((l): l is string => l !== null).join('\n');
}

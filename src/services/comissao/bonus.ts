/**
 * bonus.ts — o bônus de comissão de uma pessoa no mês.
 *
 * ## As três formas (pedido de 16/09/2026)
 *
 *   meta      bater a Nª Meta dela — «R$ 200,00 se bater a 4ª Meta»;
 *   valor     chegar a um realizado — «mais R$ 200,00 se fizer R$ 200.000,00»;
 *   especial  fazer um valor dentro de um período do mês — «R$ 20.000,00 numa
 *             semana».
 *
 * O bônus é dinheiro fixo e NÃO entra no total da comissão: a tela mostra os
 * dois lado a lado. Quem o configura é a aba Comissão da tela de Metas; quem o
 * vê é o operador no Dashboard e a liderança na mesma aba.
 *
 * ## Unidade
 *
 * A mesma da comissão: o realizado chega na unidade (BookPlay bruto, PaguePlay
 * H.O.) e o alvo gravado em BRUTO passa pelo `fatorUnidade`, como as metas. O
 * valor do bônus é dinheiro e não converte.
 *
 * Sem React, sem fetch. Os casos estão em `bonus.test.ts`.
 */

export type TipoBonus = 'meta' | 'valor' | 'especial';

export interface BonusComissao {
  id: string;
  empresaId: string;
  setorId: string;
  ano: number;
  mes: number;
  tipo: TipoBonus;
  /** Só em `meta`: 1 = 1ª Meta. */
  metaOrdem: number | null;
  /** Em `valor` e `especial`, em BRUTO. */
  valorAlvo: number | null;
  /** Só em `especial`: `yyyy-MM-dd`. */
  periodoInicio: string | null;
  periodoFim: string | null;
  /** O dinheiro do bônus. */
  valorBonus: number;
  descricao: string | null;
  usuarioIds: string[];
}

/**
 * `aguardando` = o período da meta especial ainda não começou.
 * `sem_meta` = bônus da Nª Meta para quem não tem N metas no mês.
 */
export type SituacaoBonus = 'atingido' | 'em_andamento' | 'aguardando' | 'nao_atingido' | 'sem_meta';

export interface BonusCalculado {
  id: string;
  tipo: TipoBonus;
  metaOrdem: number | null;
  periodoInicio: string | null;
  periodoFim: string | null;
  descricao: string | null;
  valorBonus: number;
  /** O alvo na unidade da comissão. `null` em `sem_meta`. */
  alvo: number | null;
  /** O realizado que conta para este bônus. `null` = ainda sem o número. */
  realizado: number | null;
  /** Quanto falta. `null` quando atingido ou sem número. */
  falta: number | null;
  atingido: boolean;
  situacao: SituacaoBonus;
}

/** O mínimo de uma faixa que o bônus de meta lê. */
export interface DegrauBonus {
  ordem: number;
  /** Valor da meta, na unidade da comissão. */
  meta: number;
}

function centavos(valor: number): number {
  return Math.round(valor * 100);
}

function arredondar(valor: number): number {
  return centavos(valor) / 100;
}

/** Último dia do mês em `yyyy-MM-dd`. */
export function ultimoDiaDoMes(ano: number, mes: number): string {
  const dia = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/** A soma do realizado entre duas datas, inclusive. */
export function somarPeriodo(
  porDia: Readonly<Record<string, number>>,
  inicio: string,
  fim: string,
): number {
  let soma = 0;
  for (const [dia, valor] of Object.entries(porDia)) {
    if (dia >= inicio && dia <= fim) soma += Number(valor) || 0;
  }
  return arredondar(soma);
}

export function calcularBonus(params: {
  bonus: readonly BonusComissao[];
  /** As metas da pessoa, na unidade, em ordem. */
  degraus: readonly DegrauBonus[];
  /** O realizado do mês que as faixas medem, na unidade. */
  recebido: number;
  fatorUnidade: number;
  /** `yyyy-MM-dd` → realizado direto do dia, na unidade. `null` = ainda sem o número. */
  recebidoPorDia: Readonly<Record<string, number>> | null;
  /** `yyyy-MM-dd`. */
  hoje: string;
}): BonusCalculado[] {
  const { degraus, recebido, fatorUnidade, recebidoPorDia, hoje } = params;

  return [...params.bonus]
    .sort((a, b) => a.valorBonus - b.valorBonus || a.id.localeCompare(b.id))
    .map((b): BonusCalculado => {
      const base = {
        id: b.id,
        tipo: b.tipo,
        metaOrdem: b.metaOrdem,
        periodoInicio: b.periodoInicio,
        periodoFim: b.periodoFim,
        descricao: b.descricao,
        valorBonus: arredondar(Number(b.valorBonus) || 0),
      };

      let alvo: number | null = null;
      let realizado: number | null = null;
      let inicio = `${b.ano}-${String(b.mes).padStart(2, '0')}-01`;
      let fim = ultimoDiaDoMes(b.ano, b.mes);

      if (b.tipo === 'meta') {
        const degrau = degraus.find(d => d.ordem === b.metaOrdem);
        if (!degrau) {
          return { ...base, alvo: null, realizado: arredondar(recebido), falta: null, atingido: false, situacao: 'sem_meta' };
        }
        alvo = degrau.meta;
        realizado = arredondar(recebido);
      } else if (b.tipo === 'valor') {
        alvo = arredondar((Number(b.valorAlvo) || 0) * fatorUnidade);
        realizado = arredondar(recebido);
      } else {
        alvo = arredondar((Number(b.valorAlvo) || 0) * fatorUnidade);
        inicio = b.periodoInicio ?? inicio;
        fim = b.periodoFim ?? fim;
        realizado = recebidoPorDia ? somarPeriodo(recebidoPorDia, inicio, fim) : null;
      }

      const atingido = realizado !== null && alvo > 0 && centavos(realizado) >= centavos(alvo);
      // Sem o número, «não atingido» seria palpite: fica em andamento.
      const situacao: SituacaoBonus = atingido ? 'atingido'
        : hoje > fim && realizado !== null ? 'nao_atingido'
        : hoje < inicio ? 'aguardando'
        : 'em_andamento';

      return {
        ...base,
        alvo,
        realizado,
        falta: atingido || realizado === null ? null : arredondar(alvo - realizado),
        atingido,
        situacao,
      };
    });
}

/** Soma dos bônus já garantidos. */
export function totalDosBonus(bonus: readonly BonusCalculado[]): number {
  return arredondar(bonus.reduce((s, b) => (b.atingido ? s + b.valorBonus : s), 0));
}

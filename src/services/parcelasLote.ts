/**
 * parcelasLote.ts — planeja N parcelas antes de gravar.
 * ─────────────────────────────────────────────────────────────────────────────
 * O botão "Adicionar parcela" passou a aceitar QUANTAS parcelas o operador
 * quiser de uma vez, com a opção de personalizar o valor de cada uma.
 *
 * Lógica pura e fora do modal de propósito: é dinheiro e data de cobrança, e o
 * pedido foi explícito de que o que se digita seja exatamente o que se grava.
 * Uma função sem React dá para testar cada caso de borda sem montar tela.
 *
 * A regra de data é a de `lib/vencimentos.ts`, a mesma do reagendamento — a
 * primeira parcela usa o vencimento informado e as demais avançam de mês em
 * mês, mantendo o dia na BookPlay e caindo no fim do mês na PaguePlay.
 */
import { datasDoLote } from '@/lib/vencimentos';

export interface ParcelaPlanejada {
  /** Posição dentro do LOTE (1..N) — não é o numero_parcela final no grupo. */
  indice:     number;
  vencimento: string;
  valor:      number;
  tipo:       string;
  status:     string;
}

/** O que o operador pode sobrescrever por parcela quando personaliza. */
export interface AjustePersonalizado {
  valor?:      number | null;
  vencimento?: string | null;
  /** Forma de pagamento própria: a 2ª pode ser Pix num acordo de boleto. */
  tipo?:       string | null;
}

export interface PlanoParcelas {
  parcelas: ParcelaPlanejada[];
  /** Soma do lote — a tela mostra antes de confirmar. */
  total:    number;
}

/** Limite de segurança: 99 é o teto de parcelas do sistema (2 dígitos). */
export const MAX_PARCELAS_LOTE = 99;

/** Number seguro; devolve `padrao` para nulo, NaN ou negativo. */
function num(v: unknown, padrao: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : padrao;
}

/**
 * Monta o lote.
 *
 * `personalizadas[i]` sobrescreve a parcela de índice i. Campo ausente, nulo ou
 * inválido cai no valor base — assim uma linha deixada em branco na lista de
 * personalização não vira parcela de R$ 0 nem sem data.
 *
 * Personalizar o VENCIMENTO de uma parcela não desloca as seguintes: o operador
 * que abriu a lista está dizendo a data exata de cada uma, e recalcular por
 * cima desfaria justamente o que ele acabou de escolher.
 */
export function planejarParcelas(params: {
  quantidade:      number;
  vencimentoBase:  string;
  valorBase:       number;
  tipoBase:        string;
  statusBase:      string;
  isPaguePlay:     boolean;
  personalizadas?: readonly AjustePersonalizado[];
}): PlanoParcelas {
  const {
    quantidade, vencimentoBase, valorBase, tipoBase, statusBase,
    isPaguePlay, personalizadas,
  } = params;

  const qtd = Math.min(Math.max(1, Math.floor(num(quantidade, 1))), MAX_PARCELAS_LOTE);
  if (!vencimentoBase) return { parcelas: [], total: 0 };

  const datas = datasDoLote(vencimentoBase, qtd, isPaguePlay);

  const parcelas = datas.map((dataCalculada, i) => {
    const ajuste = personalizadas?.[i];
    return {
      indice:     i + 1,
      vencimento: ajuste?.vencimento || dataCalculada,
      valor:      Math.round(num(ajuste?.valor, valorBase) * 100) / 100,
      tipo:       ajuste?.tipo || tipoBase,
      status:     statusBase,
    };
  });

  const total = Math.round(
    parcelas.reduce((s, p) => s + Math.round(p.valor * 100), 0),
  ) / 100;

  return { parcelas, total };
}

/**
 * O lote está pronto para gravar?
 *
 * Devolve a primeira pendência em texto, ou `null` quando está tudo certo. É a
 * conferência que o pedido chamou de "deve ser verificado para que com certeza
 * fique da forma que eu coloquei": impede parcela sem data ou sem valor de
 * chegar ao banco, inclusive quando veio de uma linha personalizada em branco.
 */
export function validarPlano(plano: PlanoParcelas): string | null {
  if (plano.parcelas.length === 0) return 'Informe o vencimento da primeira parcela.';
  for (const p of plano.parcelas) {
    if (!p.vencimento) return `Parcela ${p.indice}: informe o vencimento.`;
    if (!(p.valor > 0)) return `Parcela ${p.indice}: informe um valor maior que zero.`;
  }
  return null;
}

/**
 * parcelasPP.ts — a regra de gravação do editor de parcelas da PaguePlay
 * (`ModalEditarParcelasPP`). Pura, para ser testada sem tela.
 *
 * Na parcela PAGA o dia escolhido vale para o registro inteiro: vai para
 * `data_pagamento` E para `vencimento`, como o «marcar pago» já faz — na
 * PaguePlay o recebimento é atribuído ao vencimento.
 */
import type { Acordo } from '@/lib/supabase';
import { parseCurrencyInput } from '@/lib/index';

export type LinhaParcelaPP = {
  id: string;
  numero: number;
  status: Acordo['status'];
  valor: string;
  /** Pago → dia do pagamento; senão → vencimento. */
  data: string;
  original: Acordo;
};

export function dataDaParcela(a: Acordo): string {
  return a.status === 'pago' ? (a.data_pagamento ?? a.vencimento) : a.vencimento;
}

export function paraLinha(a: Acordo): LinhaParcelaPP {
  return {
    id: a.id,
    numero: a.numero_parcela ?? 1,
    status: a.status,
    valor: Number(a.valor).toFixed(2).replace('.', ','),
    data: dataDaParcela(a) ?? '',
    original: a,
  };
}

/** O que mudou nesta linha, já no formato do `update`. Vazio = nada a gravar. */
export function mudancasDaParcela(l: LinhaParcelaPP): Record<string, unknown> {
  const o = l.original;
  const valorNum = parseCurrencyInput(l.valor);
  const mudouStatus = l.status !== o.status;
  const mudouValor  = Math.abs(valorNum - Number(o.valor)) > 0.004;
  const mudouData   = l.data !== (dataDaParcela(o) ?? '');
  if (!mudouStatus && !mudouValor && !mudouData) return {};

  const upd: Record<string, unknown> = { status: l.status, valor: valorNum };
  if (l.status === 'pago') {
    // Recebimento atribuído ao dia do pagamento — as duas colunas juntas.
    upd.data_pagamento = l.data;
    upd.vencimento     = l.data;
  } else {
    upd.vencimento     = l.data;
    // Deixou de ser pago: não sobra dia de pagamento pendurado.
    if (o.status === 'pago') upd.data_pagamento = null;
  }
  return upd;
}

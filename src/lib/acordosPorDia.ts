/**
 * A lista de acordos da cobrança separada por dia de vencimento.
 *
 * Pedido de 28/09/2026: o mesmo desenho da lista de Vendas — uma linha-título
 * por dia, e embaixo só os acordos daquele dia. A ORDEM não muda: a lista já
 * chega do servidor com os de hoje primeiro e o resto por vencimento, e o
 * agrupamento só corta essa fila em blocos, na ordem em que cada dia aparece.
 * Por isso o dia atual continua sempre em primeiro.
 *
 * A exceção é o acordo com CPF: ele vem acima de tudo (é dado pessoal que
 * precisa sair do sistema) e ganha um bloco próprio no topo, em vez de ficar
 * espalhado debaixo de um dia qualquer.
 */
import type { StatusAcordo } from '@/lib/supabase';

export interface GrupoDeAcordos<A> {
  /** Chave estável para o React: o dia, ou `cpf` para o bloco do topo. */
  chave: string;
  /** Vencimento do bloco. `null` no bloco dos acordos com CPF. */
  dia: string | null;
  acordos: A[];
}

export function agruparAcordosPorDia<A extends { vencimento: string }>(
  lista: readonly A[],
  temCpf: (a: A) => boolean,
): GrupoDeAcordos<A>[] {
  const comCpf: A[] = [];
  const porDia = new Map<string, A[]>();
  for (const a of lista) {
    if (temCpf(a)) { comCpf.push(a); continue; }
    const doDia = porDia.get(a.vencimento);
    if (doDia) doDia.push(a);
    else porDia.set(a.vencimento, [a]);
  }
  const grupos: GrupoDeAcordos<A>[] = [];
  if (comCpf.length) grupos.push({ chave: 'cpf', dia: null, acordos: comCpf });
  for (const [dia, acordos] of porDia) grupos.push({ chave: dia, dia, acordos });
  return grupos;
}

export interface ContagemDoDia {
  total: number;
  pendentes: number;
  pagos: number;
  naoPagos: number;
}

/** Só quantidades: o pedido foi explícito em deixar valor fora da linha-dia. */
export function contarPorStatus(acordos: readonly { status: StatusAcordo | string }[]): ContagemDoDia {
  let pagos = 0;
  let naoPagos = 0;
  for (const a of acordos) {
    if (a.status === 'pago') pagos++;
    else if (a.status === 'nao_pago') naoPagos++;
  }
  return { total: acordos.length, pendentes: acordos.length - pagos - naoPagos, pagos, naoPagos };
}

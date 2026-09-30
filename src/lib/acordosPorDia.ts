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

/**
 * Marcar o dia inteiro pela linha-título — pedido de 30/09/2026.
 *
 * Se o dia já está todo marcado, desmarca só ele; senão, junta os que faltam.
 * Os marcados de OUTROS dias ficam como estavam: escolher o 30/09 não pode
 * apagar o que a pessoa já tinha escolhido no 29/09.
 */
export function alternarSelecaoDoDia(selecionados: readonly string[], idsDoDia: readonly string[]): string[] {
  if (idsDoDia.length === 0) return [...selecionados];
  const marcados = new Set(selecionados);
  const todoMarcado = idsDoDia.every(id => marcados.has(id));
  if (todoMarcado) {
    const doDia = new Set(idsDoDia);
    return selecionados.filter(id => !doDia.has(id));
  }
  return [...selecionados, ...idsDoDia.filter(id => !marcados.has(id))];
}

export interface SelecaoDoDia {
  /** Quantos acordos do dia estão marcados. */
  marcados: number;
  /** Soma do valor dos marcados — o dia inteiro, quando o dia todo está marcado. */
  valor: number;
}

/**
 * O que a linha-título do dia mostra da seleção. O valor só aparece quando há
 * algo marcado: a linha continua só com quantidades para quem não escolheu nada.
 */
export function resumirSelecaoDoDia(
  acordos: readonly { id: string; valor?: number | string | null }[],
  selecionados: readonly string[],
): SelecaoDoDia {
  const marcadosSet = new Set(selecionados);
  let marcados = 0;
  let valor = 0;
  for (const a of acordos) {
    if (!marcadosSet.has(a.id)) continue;
    marcados++;
    valor += Number(a.valor) || 0;
  }
  // Centavos: somar floats de dinheiro acumula resto na 3ª casa.
  return { marcados, valor: Math.round(valor * 100) / 100 };
}

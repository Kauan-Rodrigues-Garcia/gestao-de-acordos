/**
 * ordenacao.ts — ordem da lista "em aberto" da aba de Solicitações.
 *
 * Vive fora do componente para poder ser testada: a regra tem três níveis e já
 * foi revista uma vez, então errar a precedência é fácil e silencioso.
 */
import type { SolicitacaoWhatsapp } from '@/services/solicitacoesWhatsapp.service';

/**
 * Faixa de prioridade. Quanto menor, mais alto na lista.
 *
 * 0 — **assumido por mim** e ainda pedindo ação (`pendente` ou `falta_info`).
 *     Sobe acima da fila inteira: é trabalho que já é meu e está parado.
 * 1 — o resto dos `pendente`: a fila por pegar.
 * 2 — todo o resto (`em_andamento`, e `falta_info` de outro).
 */
export function faixaPrioridade(
  s: Pick<SolicitacaoWhatsapp, 'status' | 'responsavel_id'>,
  usuarioId: string | null,
): 0 | 1 | 2 {
  const assumidoPorMim = !!usuarioId && s.responsavel_id === usuarioId;
  if (assumidoPorMim && (s.status === 'pendente' || s.status === 'falta_info')) return 0;
  if (s.status === 'pendente') return 1;
  return 2;
}

/**
 * Ordena a lista em aberto. A precedência é, nesta ordem:
 *
 *   1. faixa de prioridade (ver acima) — o que assumi vem antes da fila;
 *   2. o que me envolve (abri ou estou atendendo) antes do que é de outro;
 *   3. **o mais antigo primeiro** — o mais atrasado sobe.
 *
 * O tempo de espera é o ÚLTIMO critério, de propósito: o pedido de três dias de
 * outra pessoa não pode empurrar para baixo o que eu assumi hoje. Dentro de cada
 * faixa, aí sim o mais atrasado sobe, que é o que faz a cor do card servir.
 *
 * Inverte a ordem que a query devolve (`criado_em desc`).
 */
export function ordenarEmAberto(
  lista: SolicitacaoWhatsapp[],
  usuarioId: string | null,
): SolicitacaoWhatsapp[] {
  const meu = (s: SolicitacaoWhatsapp) =>
    !!usuarioId && (s.solicitante_id === usuarioId || s.responsavel_id === usuarioId);

  return [...lista].sort((a, b) => {
    const fa = faixaPrioridade(a, usuarioId);
    const fb = faixaPrioridade(b, usuarioId);
    if (fa !== fb) return fa - fb;

    const ma = meu(a) ? 0 : 1;
    const mb = meu(b) ? 0 : 1;
    if (ma !== mb) return ma - mb;

    return a.criado_em.localeCompare(b.criado_em);   // mais antigo primeiro
  });
}

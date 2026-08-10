/**
 * escopo.ts — para quem a comemoração EXPLODE na tela.
 *
 * Não confundir com quem pode LER: a RLS deixa líder+ enxergar todas as
 * comemorações da empresa, para acompanhar a agenda dos outros na aba. O popup
 * é mais estreito — só quem é do setor dos homenageados, mais quem criou.
 *
 * O filtro aqui é de exibição, não de segurança: quem chega a rodar esta
 * função já tem direito de ler a linha. Quem barra o resto é a policy.
 */

export interface ComemoracaoEscopo {
  criado_por?:   string | null;
  setores_alvo?: readonly string[] | null;
  /**
   * Recorte por equipe (20260810a). Vazio = não estreita, vale o setor.
   *
   * Quando tem equipe, ela SUBSTITUI o setor em vez de somar: o pedido é
   * "aparecer apenas para a equipe", e equipe já está dentro de um setor — a
   * checagem de setor passaria para o time vizinho de qualquer jeito.
   */
  equipes_alvo?: readonly string[] | null;
  /**
   * Meta de SETOR vale para a empresa inteira (20260801a).
   *
   * Não é atalho de implementação: setor batendo meta é notícia para todo
   * mundo, enquanto meta individual só interessa a quem trabalha com a pessoa.
   * Quem decide isso é o banco, na trigger do alvo — aqui só se obedece.
   */
  empresa_inteira?: boolean | null;
}

/**
 * A comemoração deve aparecer na MINHA tela?
 *
 * Quem criou vê sempre — inclusive o líder sem setor próprio (diretoria,
 * administração), que de outro jeito montaria a festa e não a veria acontecer.
 *
 * `minhasEquipes` são TODAS as minhas equipes, incluindo aquelas em que sou
 * clone: quem trabalha em dois times comemora com os dois.
 *
 * Filtro de EXIBIÇÃO, não de segurança: quem chega aqui já tem direito de ler a
 * linha. Quem barra o resto é a policy.
 */
export function deveExplodir(
  c: ComemoracaoEscopo,
  meuSetorId: string | null,
  meuUsuarioId: string | null,
  minhasEquipes: readonly string[] = [],
): boolean {
  if (c.empresa_inteira) return true;
  if (meuUsuarioId && c.criado_por === meuUsuarioId) return true;

  const equipes = c.equipes_alvo ?? [];
  if (equipes.length > 0) return minhasEquipes.some((e) => equipes.includes(e));

  if (!meuSetorId) return false;
  return (c.setores_alvo ?? []).includes(meuSetorId);
}

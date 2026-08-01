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
 * Filtro de EXIBIÇÃO, não de segurança: quem chega aqui já tem direito de ler a
 * linha. Quem barra o resto é a policy.
 */
export function deveExplodir(
  c: ComemoracaoEscopo,
  meuSetorId: string | null,
  meuUsuarioId: string | null,
): boolean {
  if (c.empresa_inteira) return true;
  if (meuUsuarioId && c.criado_por === meuUsuarioId) return true;
  if (!meuSetorId) return false;
  return (c.setores_alvo ?? []).includes(meuSetorId);
}

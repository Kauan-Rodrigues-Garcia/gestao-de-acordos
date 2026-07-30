/**
 * permissoes.ts — quem vê e quem edita a aba de Solicitações de WhatsApp.
 *
 * ⚠️  Estas listas ESPELHAM as policies da migration 20260730b. O front esconde
 * botões; quem garante é a RLS. Se divergirem, o botão aparece e o banco recusa
 * — foi o que aconteceu com as 12 permissões mortas do Admin → Cargos.
 */

/**
 * Cargos com visão geral das solicitações.
 * Espelha `fn_wpp_tem_visao_geral()` (parte dos cargos).
 *
 * `ouvidoria` fica de fora de propósito: nível 2 como o líder, mas outra trilha.
 */
export const PERFIS_VISAO_GERAL_WPP = [
  'lider', 'elite', 'gerencia', 'diretoria', 'administrador', 'super_admin',
] as const;

/**
 * Cargos que definem quem são os responsáveis.
 * Espelha a policy `atend_resp_insert` / `atend_resp_delete`.
 */
export const PERFIS_DEFINE_RESPONSAVEL_WPP = PERFIS_VISAO_GERAL_WPP;

/**
 * Gate de rollout da aba. `null` = aberta a todos os cargos.
 *
 * Ficou em `['administrador','super_admin']` durante o teste (30/07/2026) e foi
 * liberada depois. A RLS sempre esteve no formato final, então abrir o gate não
 * mudou regra de visibilidade nenhuma: o operador continua enxergando só os
 * próprios pedidos porque a policy `sol_wpp_select` decide isso, não esta lista.
 *
 * Para fechar de novo (rollback rápido), basta voltar um array de cargos aqui.
 */
export const PERFIS_ACESSO_ABA_WPP: readonly string[] | null = null;

/** Pode abrir a aba (gate de rollout + tenant são checados por quem chama). */
export function podeAcessarAbaWpp(perfil: string | null | undefined): boolean {
  if (!perfil) return false;
  if (PERFIS_ACESSO_ABA_WPP === null) return true;
  return PERFIS_ACESSO_ABA_WPP.includes(perfil);
}

/** Vê todas as solicitações por CARGO (ser responsável também dá, ver abaixo). */
export function temVisaoGeralPorCargo(perfil: string | null | undefined): boolean {
  return !!perfil && (PERFIS_VISAO_GERAL_WPP as readonly string[]).includes(perfil);
}

/** Pode nomear/remover responsáveis. */
export function podeDefinirResponsavel(perfil: string | null | undefined): boolean {
  return !!perfil && (PERFIS_DEFINE_RESPONSAVEL_WPP as readonly string[]).includes(perfil);
}

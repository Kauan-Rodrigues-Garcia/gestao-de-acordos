/**
 * Recorta a lista da Gestão de Pessoas pelos dois eixos independentes do painel:
 * alcance (setor x empresa) e exibição das contas administrativas.
 *
 * Manter esta regra pura evita que uma permissão de "quem aparece" pule o
 * recorte de "até onde aparece", que foi a regressão corrigida em 27/08/2026.
 */
export function filtrarUsuariosVisiveis<
  T extends { perfil: string; setor_id: string | null | undefined },
>(
  lista: T[],
  opcoes: {
    podeVerAdministradores: boolean;
    veTodosSetores: boolean;
    setorAtualId: string | null | undefined;
  },
): T[] {
  const { podeVerAdministradores, veTodosSetores, setorAtualId } = opcoes;
  const perfisAdmin = new Set(['administrador', 'super_admin']);

  const cargosPermitidos = podeVerAdministradores
    ? lista
    : lista.filter(usuario => !perfisAdmin.has(usuario.perfil));

  if (veTodosSetores) return cargosPermitidos;
  return cargosPermitidos.filter(usuario => usuario.setor_id === setorAtualId);
}

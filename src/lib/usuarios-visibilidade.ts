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

/**
 * As transferências que dizem respeito a quem olha.
 *
 * Com alcance de setor, só as que saem do setor ou entram nele: «Play 4 para
 * Play 5» não afeta o Play 1, e mostrá-la ali era ruído (pedido de 14/09/2026).
 * Com alcance de empresa, todas — é o mesmo eixo de `filtrarUsuariosVisiveis`,
 * lido da mesma chave, para as duas listas da aba não discordarem.
 *
 * É recorte de tela, não de segurança: a leitura em `perfis_transferencias`
 * continua sendo decidida pela RLS.
 */
export function filtrarTransferenciasVisiveis<
  T extends { origemSetorId: string | null; destinoSetorId: string | null },
>(
  lista: T[],
  opcoes: { veTodosSetores: boolean; setorAtualId: string | null | undefined },
): T[] {
  const { veTodosSetores, setorAtualId } = opcoes;
  if (veTodosSetores) return lista;
  if (!setorAtualId) return [];
  return lista.filter(t => t.origemSetorId === setorAtualId || t.destinoSetorId === setorAtualId);
}

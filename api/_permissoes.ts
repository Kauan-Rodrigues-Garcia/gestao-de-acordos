interface ResolverPermissaoParams {
  url: string;
  headers: Record<string, string>;
  usuarioId: string;
  empresaId?: string;
  cargo?: string;
  chave: string;
}

/** Resolve no servidor exatamente a mesma precedência da aplicação:
 * exceção individual > cargo > negado. */
export async function temPermissaoApi({
  url, headers, usuarioId, empresaId, cargo, chave,
}: ResolverPermissaoParams): Promise<boolean> {
  if (!empresaId || !cargo) return false;
  const [cargoResp, pessoaResp] = await Promise.all([
    fetch(`${url}/rest/v1/cargos_permissoes?empresa_id=eq.${empresaId}&cargo=eq.${encodeURIComponent(cargo)}&select=permissoes`, { headers }),
    fetch(`${url}/rest/v1/perfis_permissoes?empresa_id=eq.${empresaId}&usuario_id=eq.${usuarioId}&select=permissoes`, { headers }),
  ]);
  if (!cargoResp.ok || !pessoaResp.ok) return false;
  const cargoRows = await cargoResp.json() as Array<{ permissoes?: Record<string, boolean> }>;
  const pessoaRows = await pessoaResp.json() as Array<{ permissoes?: Record<string, boolean> }>;
  const mapa = { ...(cargoRows[0]?.permissoes ?? {}), ...(pessoaRows[0]?.permissoes ?? {}) };
  return mapa[chave] === true;
}

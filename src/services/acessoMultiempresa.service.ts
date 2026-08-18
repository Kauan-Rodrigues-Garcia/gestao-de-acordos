/**
 * acessoMultiempresa.service.ts — quem enxerga as duas empresas.
 *
 * ## O que isto administra
 *
 * `bookplay` e `pagueplay` compartilham o banco e são separadas por
 * `empresa_id` + RLS. Até a migration `20260818300000_acesso_multiempresa.sql`
 * o único cargo que atravessava era `super_admin`. Agora o super_admin pode
 * liberar nominalmente pessoas de `gerencia` ou `diretoria`.
 *
 * ## Por que tudo passa por RPC
 *
 * A tela precisa listar perfis das DUAS empresas — inclusive a que o super_admin
 * não está olhando no momento — e escrever numa coluna que `perfis` protege com
 * trigger. Uma consulta direta a `perfis` traria só metade da lista e o
 * `update` direto esbarraria no trigger. As três RPCs são `SECURITY DEFINER` e
 * conferem `fn_user_is_super_admin()` na primeira linha: quem não for
 * super_admin recebe lista vazia na leitura e `sem_permissao` na escrita.
 *
 * ## O cargo vale mais que a liberação
 *
 * `fn_user_acesso_multiempresa` exige a flag E o cargo atual em
 * (gerencia, diretoria). Quem for rebaixado perde o acesso na hora, sem
 * depender de alguém lembrar de revogar. Por isso a lista pode conter alguém
 * com a flag ligada que já não tem acesso de fato — `fn_multiempresa_listar`
 * aplica o mesmo filtro de cargo, então essa pessoa some da lista sozinha.
 */

import { rpcSemTipo } from '@/lib/supabaseSemTipo';

export interface AcessoMultiempresa {
  usuario_id:    string;
  nome:          string;
  email:         string | null;
  perfil:        string;
  foto_url:      string | null;
  empresa_nome:  string | null;
  /** Acesso que vem do cargo, e por isso não pode ser removido aqui. */
  e_super_admin: boolean;
  concedido_por: string | null;
  concedido_em:  string | null;
}

export interface CandidatoMultiempresa {
  usuario_id:   string;
  nome:         string;
  email:        string | null;
  perfil:       string;
  foto_url:     string | null;
  empresa_nome: string | null;
}

/** Mensagens do banco traduzidas. O `erro` cru nunca chega à tela. */
const MOTIVOS: Record<string, string> = {
  sem_sessao:            'Sessão expirada. Entre novamente.',
  sem_permissao:         'Só o super admin pode alterar o acesso às duas empresas.',
  usuario_nao_encontrado:'Usuário não encontrado.',
  super_admin_ja_tem:    'Super admin já enxerga as duas empresas pelo cargo.',
  cargo_nao_elegivel:    'Só gerência e diretoria podem receber acesso às duas empresas.',
};

/** Quem enxerga as duas empresas hoje: super_admins e os liberados. */
export async function listarAcessoMultiempresa(): Promise<AcessoMultiempresa[]> {
  const { data, error } = await rpcSemTipo<AcessoMultiempresa[]>('fn_multiempresa_listar', {});
  if (error) {
    console.warn('[acessoMultiempresa] listar:', error.message);
    return [];
  }
  return data ?? [];
}

/** Gerência e diretoria ativos, das duas empresas, que ainda não têm acesso. */
export async function listarCandidatosMultiempresa(): Promise<CandidatoMultiempresa[]> {
  const { data, error } = await rpcSemTipo<CandidatoMultiempresa[]>('fn_multiempresa_elegiveis', {});
  if (error) {
    console.warn('[acessoMultiempresa] elegiveis:', error.message);
    return [];
  }
  return data ?? [];
}

export type ResultadoDefinir =
  | { ok: true; liberado: boolean; nome: string }
  | { ok: false; erro: string };

/**
 * Liga ou desliga o acesso às duas empresas.
 *
 * Revogar vale para qualquer cargo — é assim que se limpa a flag de quem foi
 * rebaixado. Conceder exige gerência ou diretoria, e o banco confere de novo:
 * a lista da tela pode estar velha na hora do clique.
 */
export async function definirAcessoMultiempresa(
  usuarioId: string,
  liberado: boolean,
): Promise<ResultadoDefinir> {
  const { data, error } = await rpcSemTipo<{
    ok?: boolean; erro?: string; liberado?: boolean; nome?: string;
  }>('fn_multiempresa_definir', {
    p_usuario_id: usuarioId,
    p_liberado:   liberado,
  });

  if (error) {
    console.warn('[acessoMultiempresa] definir:', error.message);
    return { ok: false, erro: 'Não foi possível salvar. Tente novamente.' };
  }
  if (!data?.ok) {
    const chave = data?.erro ?? '';
    return { ok: false, erro: MOTIVOS[chave] ?? 'Não foi possível salvar.' };
  }
  return { ok: true, liberado: !!data.liberado, nome: data.nome ?? '' };
}

/**
 * O perfil enxerga as duas empresas?
 *
 * Espelha `fn_user_acesso_multiempresa` no cliente, e a regra tem que ser a
 * mesma dos dois lados: a flag sozinha não basta, o cargo atual decide junto.
 * É o que impede o seletor de empresa de aparecer para quem foi rebaixado e
 * ficou com a flag ligada — a tela mostraria o botão e o banco recusaria os
 * dados, que é a pior combinação possível.
 *
 * Não é barreira de segurança — essa é a RLS. É o que impede a tela de mentir.
 */
export function perfilVeDuasEmpresas(perfil: {
  perfil?: string | null;
  acesso_multiempresa?: boolean | null;
} | null | undefined): boolean {
  if (!perfil) return false;
  if (perfil.perfil === 'super_admin') return true;
  return !!perfil.acesso_multiempresa
      && (perfil.perfil === 'gerencia' || perfil.perfil === 'diretoria');
}

/**
 * src/services/direto_extra.service.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Serviço para a lógica "Direto e Extra".
 *
 * Regra de negócio:
 *   - Admin/lider/gerencia pode ATIVAR a lógica Direto e Extra para:
 *       escopo = 'setor'     → vale para todos os usuários do setor
 *       escopo = 'equipe'    → vale para todos os usuários da equipe
 *       escopo = 'usuario'   → vale apenas para um usuário individual
 *
 *   - Quando ATIVA para o usuário:
 *       - Pode cadastrar acordo de um NR/inscrição já tabulado por outro
 *         operador → o novo acordo entra como "extra".
 *       - O bloqueio por autorização do líder é desabilitado.
 *
 *   - Quando INATIVA mas o NR pertence a um operador com a lógica ATIVA:
 *       - Não é exigida autorização do líder: aparece apenas um aviso e, ao
 *         confirmar, o acordo é tabulado como DIRETO, rebaixando o acordo
 *         anterior (que pertencia ao operador com lógica ativa) a EXTRA.
 *
 * Implementação:
 *   A config é armazenada em `direto_extra_config` (ver migration SQL
 *   direto_extra_config_2026_04_20.sql). A resolução de "usuário X tem a
 *   lógica ativa?" é feita pelo hook useDiretoExtraConfig, que carrega
 *   em cache todas as configs + listas de setores/equipes/membros.
 */
import { supabase } from '@/lib/supabase';

// ─── Tipos ──────────────────────────────────────────────────────────────────

export type DiretoExtraEscopo = 'setor' | 'equipe' | 'usuario';

export interface DiretoExtraConfig {
  id:            string;
  empresa_id:    string;
  escopo:        DiretoExtraEscopo;
  referencia_id: string;
  ativo:         boolean;
  criado_em:     string;
  atualizado_em: string;
}

// ─── Queries ────────────────────────────────────────────────────────────────

export async function fetchDiretoExtraConfigs(empresaId: string): Promise<DiretoExtraConfig[]> {
  const { data, error } = await supabase
    .from('direto_extra_config')
    .select('*')
    .eq('empresa_id', empresaId);

  if (error) {
    console.warn('[direto_extra.service] fetch error:', error.message);
    return [];
  }
  return (data as DiretoExtraConfig[]) ?? [];
}

/**
 * Grava a config de um escopo — e alinha as exceções que a contradizem.
 *
 * ## O defeito que isto corrige
 *
 * Ativar a lógica para uma equipe de 4 pessoas pegava só para 1. Não era
 * aleatório: era a única sem config de `usuario`. As outras três tinham uma,
 * desligada, de semanas antes — e `resolverDiretoExtraAtivo` faz o mais
 * específico vencer, então a decisão antiga escondia a nova, em silêncio.
 *
 * Agora ligar a equipe apaga as configs de `usuario` **desligadas** dela;
 * desligar apaga as **ligadas**. Só o que contradiz é tocado. Para o setor, o
 * mesmo vale um nível acima: alcança as equipes e as pessoas dentro delas.
 *
 * A cascata não mudou — continua "o mais específico vence". O que mudou é que
 * um ato explícito do administrador sobre o escopo amplo deixa de ser anulado
 * por uma exceção anterior. A exceção continua possível, na ordem que a pessoa
 * espera: liga a equipe, depois desliga quem não deve ter.
 *
 * A escrita vai por RPC (`fn_direto_extra_definir`) porque precisa ser atômica
 * com o alinhamento — em duas chamadas haveria uma janela com a equipe ligada e
 * as exceções ainda no lugar — e porque ler `perfis` de terceiros e os clones é
 * coisa que a RLS não entrega ao líder por caminho direto.
 *
 * @returns `alinhados` = quantas exceções foram apagadas, para a tela dizer o
 *   que aconteceu em vez de o administrador descobrir sozinho.
 */
export async function setDiretoExtraConfig(params: {
  empresaId:    string;
  escopo:       DiretoExtraEscopo;
  referenciaId: string;
  ativo:        boolean;
}): Promise<{ ok: boolean; error?: string; alinhados?: number }> {
  const { empresaId, escopo, referenciaId, ativo } = params;

  const { data, error } = await supabase.rpc('fn_direto_extra_definir', {
    p_empresa_id:    empresaId,
    p_escopo:        escopo,
    p_referencia_id: referenciaId,
    p_ativo:         ativo,
  });

  if (error) {
    console.warn('[direto_extra.service] fn_direto_extra_definir:', error.message);
    return { ok: false, error: error.message };
  }

  const r = data as {
    ok?: boolean; erro?: string;
    alinhados_usuario?: number; alinhados_equipe?: number;
  } | null;

  if (!r?.ok) {
    return { ok: false, error: r?.erro ?? 'Não foi possível salvar a configuração.' };
  }
  return {
    ok: true,
    alinhados: (Number(r.alinhados_usuario) || 0) + (Number(r.alinhados_equipe) || 0),
  };
}

/**
 * Resolve se um usuário tem a lógica Direto e Extra ativada,
 * considerando as configs de usuário → equipe → setor (nessa ordem).
 *
 * Regra final:
 *   1. Se existe config escopo='usuario' e referencia_id=userId → usa ela (ativo/inativo)
 *   2. Senão, se existe config escopo='equipe' com referencia_id=userEquipeId → usa ela
 *   3. Senão, se existe config escopo='setor' com referencia_id=userSetorId  → usa ela
 *   4. Senão → inativo
 */
export function resolverDiretoExtraAtivo(params: {
  userId:      string;
  userSetorId: string | null | undefined;
  userEquipeId: string | null | undefined;
  configs:     DiretoExtraConfig[];
}): boolean {
  const { userId, userSetorId, userEquipeId, configs } = params;

  // 1. usuário individual
  const cfgUsuario = configs.find(c => c.escopo === 'usuario' && c.referencia_id === userId);
  if (cfgUsuario) return cfgUsuario.ativo;

  // 2. equipe
  if (userEquipeId) {
    const cfgEquipe = configs.find(c => c.escopo === 'equipe' && c.referencia_id === userEquipeId);
    if (cfgEquipe) return cfgEquipe.ativo;
  }

  // 3. setor
  if (userSetorId) {
    const cfgSetor = configs.find(c => c.escopo === 'setor' && c.referencia_id === userSetorId);
    if (cfgSetor) return cfgSetor.ativo;
  }

  return false;
}

/**
 * Resolve se um usuário tem a lógica ativa buscando diretamente no banco.
 * Usa RPC fn_direto_extra_ativo (SECURITY DEFINER) para contornar RLS na
 * tabela perfis quando consultamos dados de outro operador.
 * Fallback para query direta caso o RPC ainda não exista.
 */
export async function fetchIsDiretoExtraAtivo(params: {
  userId: string;
  empresaId: string;
}): Promise<boolean> {
  const { userId, empresaId } = params;

  const { data: rpcData, error: rpcError } = await supabase.rpc(
    'fn_direto_extra_ativo',
    { p_user_id: userId, p_empresa_id: empresaId },
  );

  if (!rpcError) return Boolean(rpcData);

  // Fallback: query direta (funciona se RLS de perfis permitir SELECT de outros usuários)
  console.warn('[direto_extra] RPC fn_direto_extra_ativo indisponível, usando fallback:', rpcError.message);
  const { data: perfil } = await supabase
    .from('perfis')
    .select('setor_id, equipe_id')
    .eq('id', userId)
    .maybeSingle();

  if (!perfil) return false;

  const configs = await fetchDiretoExtraConfigs(empresaId);
  return resolverDiretoExtraAtivo({
    userId,
    userSetorId: perfil.setor_id,
    userEquipeId: (perfil as any).equipe_id,
    configs,
  });
}

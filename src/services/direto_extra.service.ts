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
 * Ativa ou atualiza uma config. Se não existir, cria; se existir, atualiza `ativo`.
 */
export async function setDiretoExtraConfig(params: {
  empresaId:    string;
  escopo:       DiretoExtraEscopo;
  referenciaId: string;
  ativo:        boolean;
}): Promise<{ ok: boolean; error?: string }> {
  const { empresaId, escopo, referenciaId, ativo } = params;

  const { error } = await supabase
    .from('direto_extra_config')
    .upsert(
      {
        empresa_id:    empresaId,
        escopo,
        referencia_id: referenciaId,
        ativo,
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: 'empresa_id,escopo,referencia_id' },
    );

  if (error) {
    console.warn('[direto_extra.service] upsert error:', error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
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

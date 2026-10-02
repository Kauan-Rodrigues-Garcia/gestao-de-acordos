/**
 * equipeMembros — o espelho do banco, para teste.
 *
 * Desde a fase 5 (migration 20261002220000) quem lê o pertencimento a equipe
 * lê `equipe_membros`, e gatilhos no banco montam essa tabela a partir das
 * três antigas. Os testes que descrevem o cenário pelas tabelas antigas
 * (`perfis.equipe_id`, `equipe_lideres`, `equipe_operadores_clones`) usam
 * esta função para responder `equipe_membros` como o banco responderia.
 *
 * A regra é a dos gatilhos `fn_equipe_membros_espelho_*`: membro é o
 * `perfis.equipe_id` de quem não tem cargo `lider`.
 */
import type { VinculoDeEquipe } from '@/services/equipes/equipeMembros';

/** No cargo `lider` o `perfis.equipe_id` é resíduo (regra de 29/09/2026). */
const CARGO_DE_LIDERANCA = 'lider';

interface Fontes {
  perfis?: unknown;
  lideres?: unknown;
  clones?: unknown;
}

function linhas(x: unknown): Record<string, unknown>[] {
  return Array.isArray(x) ? (x as Record<string, unknown>[]) : [];
}

export function espelhoEquipeMembros({ perfis, lideres, clones }: Fontes): VinculoDeEquipe[] {
  const saida: VinculoDeEquipe[] = [];
  for (const p of linhas(perfis)) {
    if (!p.equipe_id || p.perfil === CARGO_DE_LIDERANCA) continue;
    saida.push({
      equipe_id: String(p.equipe_id), pessoa_id: String(p.id), papel: 'membro',
      conta_recebimento: true, criado_em: null,
    });
  }
  for (const l of linhas(lideres)) {
    saida.push({
      equipe_id: String(l.equipe_id), pessoa_id: String(l.lider_id), papel: 'lider',
      conta_recebimento: true, criado_em: (l.criado_em as string | undefined) ?? null,
    });
  }
  for (const c of linhas(clones)) {
    saida.push({
      equipe_id: String(c.equipe_id), pessoa_id: String(c.operador_id), papel: 'clone',
      conta_recebimento: c.conta_recebimento !== false,
      criado_em: (c.criado_em as string | undefined) ?? null,
    });
  }
  return saida;
}

/**
 * equipeMembros.ts — a porta única para «quem está em que equipe».
 *
 * Desde a fase 5 (migration 20261002220000) o banco guarda o pertencimento em
 * `equipe_membros`: uma linha por pessoa, equipe e papel.
 *
 *   membro  `perfis.equipe_id` de quem não tem cargo `lider`
 *   lider   `equipe_lideres`
 *   clone   `equipe_operadores_clones`, com `conta_recebimento`
 *
 * As telas de cadastro ainda gravam nas três tabelas antigas, e gatilhos
 * mantêm `equipe_membros` em espelho. Quem só LÊ o pertencimento lê daqui.
 *
 * Se a tabela não responder (migration ainda não aplicada no banco do
 * ambiente), monta as mesmas linhas a partir das três fontes antigas, com a
 * mesma regra de `equipesDaPessoa` (`equipeDoLider.ts`).
 */
import { supabase } from '@/lib/supabase';

export type PapelNaEquipe = 'membro' | 'lider' | 'clone';

export interface VinculoDeEquipe {
  equipe_id: string;
  pessoa_id: string;
  papel: PapelNaEquipe;
  /** Só o clone pode ser `false`. */
  conta_recebimento: boolean;
  criado_em: string | null;
}

export interface FiltroEquipeMembros {
  empresaId?: string;
  pessoaId?: string;
  papel?: PapelNaEquipe;
}

/** No cargo `lider` o `perfis.equipe_id` é resíduo (regra de 29/09/2026). */
const CARGO_DE_LIDERANCA = 'lider';

function porCriacao(a: VinculoDeEquipe, b: VinculoDeEquipe): number {
  return (a.criado_em ?? '').localeCompare(b.criado_em ?? '');
}

/**
 * Os vínculos de equipe que batem com o filtro, na ordem em que foram criados
 * (a primeira liderança dá o rótulo da linha da pessoa).
 */
export async function buscarEquipeMembros(filtro: FiltroEquipeMembros): Promise<VinculoDeEquipe[]> {
  let consulta = supabase
    .from('equipe_membros')
    .select('equipe_id, pessoa_id, papel, conta_recebimento, criado_em');
  if (filtro.empresaId) consulta = consulta.eq('empresa_id', filtro.empresaId);
  if (filtro.pessoaId) consulta = consulta.eq('pessoa_id', filtro.pessoaId);
  if (filtro.papel) consulta = consulta.eq('papel', filtro.papel);

  const { data, error } = await consulta;
  if (!error) return ((data ?? []) as VinculoDeEquipe[]).slice().sort(porCriacao);
  return buscarNasFontesAntigas(filtro);
}

async function buscarNasFontesAntigas(filtro: FiltroEquipeMembros): Promise<VinculoDeEquipe[]> {
  const quer = (p: PapelNaEquipe) => !filtro.papel || filtro.papel === p;
  const saida: VinculoDeEquipe[] = [];

  if (quer('membro')) {
    let q = supabase.from('perfis').select('id, perfil, equipe_id').not('equipe_id', 'is', null);
    if (filtro.empresaId) q = q.eq('empresa_id', filtro.empresaId);
    if (filtro.pessoaId) q = q.eq('id', filtro.pessoaId);
    const { data } = await q;
    for (const p of (data ?? []) as { id: string; perfil: string | null; equipe_id: string | null }[]) {
      if (!p.equipe_id || p.perfil === CARGO_DE_LIDERANCA) continue;
      saida.push({ equipe_id: p.equipe_id, pessoa_id: p.id, papel: 'membro', conta_recebimento: true, criado_em: null });
    }
  }

  if (quer('lider')) {
    let q = supabase.from('equipe_lideres').select('equipe_id, lider_id, criado_em');
    if (filtro.empresaId) q = q.eq('empresa_id', filtro.empresaId);
    if (filtro.pessoaId) q = q.eq('lider_id', filtro.pessoaId);
    const { data } = await q;
    for (const l of (data ?? []) as { equipe_id: string; lider_id: string; criado_em: string | null }[]) {
      saida.push({ equipe_id: l.equipe_id, pessoa_id: l.lider_id, papel: 'lider', conta_recebimento: true, criado_em: l.criado_em });
    }
  }

  if (quer('clone')) {
    let q = supabase.from('equipe_operadores_clones').select('equipe_id, operador_id, conta_recebimento, criado_em');
    if (filtro.empresaId) q = q.eq('empresa_id', filtro.empresaId);
    if (filtro.pessoaId) q = q.eq('operador_id', filtro.pessoaId);
    const { data } = await q;
    for (const c of (data ?? []) as { equipe_id: string; operador_id: string; conta_recebimento?: boolean | null; criado_em: string | null }[]) {
      saida.push({
        equipe_id: c.equipe_id, pessoa_id: c.operador_id, papel: 'clone',
        conta_recebimento: c.conta_recebimento !== false, criado_em: c.criado_em,
      });
    }
  }

  return saida.sort(porCriacao);
}

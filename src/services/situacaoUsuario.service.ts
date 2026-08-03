/**
 * situacaoUsuario.service.ts — situação operacional do usuário (item 5).
 *
 * ativo | ferias | desligado. Férias/desligado somem de ranking e quartil
 * (filtro na aplicação); o recebimento deles NÃO é filtrado, então os totais de
 * setor/equipe seguem inteiros. Desligado não loga (ativo=false + bloqueio no
 * useAuth) e é arquivado na virada do mês. Ver migration 20260723c.
 */
import { supabase } from '@/lib/supabase';
import type { SituacaoUsuario } from '@/lib/supabase';
import { ehMesAtual } from '@/lib/mesReferencia';
import { tabelaSemTipo } from '@/lib/supabaseSemTipo';

/**
 * Define a situação de um usuário, ajustando os efeitos colaterais:
 *   • desligado → ativo=false, desligado_em=now (bloqueia login) e os acordos
 *     dele perdem o vínculo Direto/Extra (ver desligamento.service).
 *   • ativo/ferias → ativo=true, desligado_em=null, arquivado=false
 *     (reativar traz de volta às listas e ao login).
 *
 * A liberação de vínculos é best-effort e roda DEPOIS do update: se ela
 * falhar, o desligamento em si continua valendo. Reverter o desligamento não
 * refaz os pareamentos — eles são desfeitos em definitivo.
 */
export async function definirSituacao(
  perfilId: string,
  situacao: SituacaoUsuario,
  /** Necessário para liberar os vínculos ao desligar. */
  contexto?: { empresaId?: string | null; isPaguePlay?: boolean },
): Promise<{ error: string | null }> {
  const patch: Record<string, unknown> = { situacao, atualizado_em: new Date().toISOString() };
  if (situacao === 'desligado') {
    patch.ativo = false;
    patch.desligado_em = new Date().toISOString();
  } else {
    patch.ativo = true;
    patch.desligado_em = null;
    patch.arquivado = false;
  }
  const { error } = await supabase.from('perfis').update(patch).eq('id', perfilId);
  if (error) return { error: error.message };

  if (situacao === 'desligado' && contexto?.empresaId) {
    try {
      const { liberarVinculosDeDesligado } = await import('@/services/desligamento.service');
      await liberarVinculosDeDesligado({
        perfilId,
        empresaId:   contexto.empresaId,
        isPaguePlay: contexto.isPaguePlay ?? false,
      });
    } catch (e) {
      console.warn('[situacaoUsuario] falha ao liberar vínculos do desligado', e);
    }
  }
  return { error: null };
}

/** Arquiva desligados de meses anteriores (some das listas). Best-effort. */
export async function arquivarDesligadosAnteriores(empresaId: string): Promise<number> {
  const { data, error } = await supabase.rpc('fn_arquivar_desligados_anteriores', { p_empresa_id: empresaId });
  if (error) return 0;
  return (data as number) ?? 0;
}

/**
 * Mapa operadorId → situacao para toda a empresa (sem filtrar por ativo, para
 * pegar desligados também). Usado para ocultar férias/desligado de ranking e
 * quartil sem afetar os totais.
 */
export async function buscarSituacaoOperadores(
  empresaId: string,
  mes?: string | null,
): Promise<Record<string, SituacaoUsuario>> {
  // Situação é um fato do MÊS, não de hoje: quem entrou de férias esta semana
  // trabalhou julho inteiro e não pode sumir do ranking de julho. Mês fechado
  // lê o retrato congelado (migration 20260803c); o corrente segue ao vivo.
  if (mes && !ehMesAtual(mes)) {
    const retrato = await tabelaSemTipo<{ operador_id: string; situacao: string | null }>('composicao_mes')
      .select('operador_id, situacao')
      .eq('empresa_id', empresaId).eq('mes', mes);
    if (!retrato.error && retrato.data?.length) {
      const doMes: Record<string, SituacaoUsuario> = {};
      for (const r of retrato.data) {
        doMes[r.operador_id] = (r.situacao as SituacaoUsuario) ?? 'ativo';
      }
      return doMes;
    }
    // Sem retrato (migration pendente ou mês antigo) → estado de hoje.
  }

  const { data, error } = await supabase
    .from('perfis')
    .select('id, situacao')
    .eq('empresa_id', empresaId);
  if (error || !data) return {};
  const out: Record<string, SituacaoUsuario> = {};
  for (const p of data as { id: string; situacao: string | null }[]) {
    out[p.id] = (p.situacao as SituacaoUsuario) ?? 'ativo';
  }
  return out;
}

/** IDs que devem sumir de ranking/quartil (situacao != 'ativo'). */
export function idsOcultosRankingQuartil(mapa: Record<string, SituacaoUsuario>): Set<string> {
  const s = new Set<string>();
  for (const [id, sit] of Object.entries(mapa)) if (sit !== 'ativo') s.add(id);
  return s;
}

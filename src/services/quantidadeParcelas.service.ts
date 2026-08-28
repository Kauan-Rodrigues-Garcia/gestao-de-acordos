/**
 * quantidadeParcelas.service.ts — grava o que `quantidadeParcelas.ts` planejou.
 * ─────────────────────────────────────────────────────────────────────────────
 * Separado do planejador porque aqui é tudo efeito colateral: ler as linhas do
 * grupo, inserir as que faltam, apagar as que sobram e deixar o contador `N/N`
 * igual em todas as linhas.
 *
 * A ordem importa. Criar vem ANTES de acertar o contador (a inserção já grava o
 * total novo nas linhas que entram) e apagar vem antes também — se o DELETE
 * falhar, o contador continua descrevendo o que existe de verdade, em vez de
 * anunciar um acordo menor do que o banco guarda.
 */
import { supabase, type Acordo } from '@/lib/supabase';
import { adicionarParcelasAoGrupo } from '@/services/parcelas.service';
import type { LinhaDoGrupo, PlanoQuantidade } from '@/services/quantidadeParcelas';

export type LinhasDoGrupoResultado =
  | { ok: true;  linhas: LinhaDoGrupo[] }
  | { ok: false; erro: string };

export type AplicarQuantidadeResultado =
  | { ok: true;  novoTotal: number; criadas: Acordo[]; removidas: string[] }
  | { ok: false; erro: string };

/** Linhas do grupo do acordo. Acordo sem grupo é um grupo de uma linha só. */
export async function carregarLinhasDoGrupo(acordo: Acordo): Promise<LinhasDoGrupoResultado> {
  if (!acordo?.id)        return { ok: false, erro: 'Acordo não informado' };
  if (!acordo.empresa_id) return { ok: false, erro: 'Acordo sem empresa vinculada' };

  if (!acordo.acordo_grupo_id) {
    return {
      ok: true,
      linhas: [{
        id:             acordo.id,
        numero_parcela: acordo.numero_parcela ?? 1,
        vencimento:     acordo.vencimento,
        valor:          Number(acordo.valor),
        status:         acordo.status,
      }],
    };
  }

  const { data, error } = await supabase
    .from('acordos')
    .select('id, numero_parcela, vencimento, valor, status')
    .eq('empresa_id', acordo.empresa_id)
    .eq('acordo_grupo_id', acordo.acordo_grupo_id)
    .order('numero_parcela', { ascending: true });
  if (error) return { ok: false, erro: `Erro ao consultar parcelas do acordo: ${error.message}` };

  const linhas = (data ?? []).map(l => ({
    id:             (l as LinhaDoGrupo).id,
    numero_parcela: (l as LinhaDoGrupo).numero_parcela ?? 1,
    vencimento:     (l as LinhaDoGrupo).vencimento,
    valor:          Number((l as LinhaDoGrupo).valor),
    status:         (l as LinhaDoGrupo).status,
  }));
  return { ok: true, linhas };
}

/**
 * Executa o plano.
 *
 * `camposDoGrupo` acompanha o UPDATE final e existe para o acordo com entrada:
 * mudar a quantidade muda o total (`entrada + demais × (N−1)`), e esse número
 * precisa cair em todas as linhas junto com o contador, não num segundo UPDATE
 * que pode falhar sozinho.
 */
export async function aplicarQuantidade(
  acordo: Acordo,
  plano: PlanoQuantidade,
  opts: { isPaguePlay: boolean; camposDoGrupo?: Record<string, unknown> },
): Promise<AplicarQuantidadeResultado> {
  if (plano.acao === 'bloqueado') return { ok: false, erro: plano.motivo };
  if (plano.acao === 'nada')      return { ok: true, novoTotal: acordo.parcelas ?? 1, criadas: [], removidas: [] };
  if (!acordo.empresa_id)         return { ok: false, erro: 'Acordo sem empresa vinculada' };

  const criadas: Acordo[]   = [];
  const removidas: string[] = [];

  if (plano.acao === 'criar') {
    // Aumentar 1→15 declara o total 15, mas materializa no máximo a próxima.
    // Com uma parcela pendente, nenhuma futura entra antes da hora.
    const r = await adicionarParcelasAoGrupo(acordo, plano.inputs, { isPaguePlay: opts.isPaguePlay });
    if ('erro' in r) return { ok: false, erro: r.erro };
    criadas.push(...r.novasParcelas);
  }

  if (plano.acao === 'remover') {
    const ids = plano.linhas.map(l => l.id);
    const { error } = await supabase
      .from('acordos')
      .delete()
      .eq('empresa_id', acordo.empresa_id)
      .in('id', ids);
    if (error) return { ok: false, erro: `Erro ao apagar parcelas: ${error.message}` };
    removidas.push(...ids);
  }

  const camposFinais = { parcelas: plano.novoTotal, ...(opts.camposDoGrupo ?? {}) };
  const alvo = supabase.from('acordos').update(camposFinais).eq('empresa_id', acordo.empresa_id);
  const { error: errTotal } = acordo.acordo_grupo_id
    ? await alvo.eq('acordo_grupo_id', acordo.acordo_grupo_id)
    : await alvo.eq('id', acordo.id);
  if (errTotal) return { ok: false, erro: `Erro ao atualizar o total de parcelas: ${errTotal.message}` };

  return { ok: true, novoTotal: plano.novoTotal, criadas, removidas };
}

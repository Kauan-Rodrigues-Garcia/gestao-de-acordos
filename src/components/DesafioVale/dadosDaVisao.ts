/**
 * Os dados que a gaveta do Desafio do Vale mostra, já com a visão de teste
 * aplicada (23/11/2026): com «dados fictícios» ligado no «Ver como», as
 * médias, os cupons e o time da aba Equipes são os de mentira; senão, os reais.
 * Os hooks reais continuam sendo chamados (regra dos hooks), só não buscam
 * nada sem pessoa.
 */
import { useMeusCupons, useMinhaMetaNoVale, useRankingDoVale, useSetorNoVale, type AlvoDoVale } from '@/hooks/useDesafioVale';
import type { DesafioVale } from '@/services/desafioVale/desafioVale.service';
import { cuponsFicticios, metaFicticia, rankingFicticio, setorFicticio } from '@/services/desafioVale/ficticio';
import { useVisaoDoVale } from './visao';

export function useMinhaMetaDaVisao(d: DesafioVale, aberta: boolean, alvo: AlvoDoVale | null, hoje: string) {
  const { ficticio } = useVisaoDoVale();
  const real = useMinhaMetaNoVale(d, aberta, alvo, hoje);
  if (!ficticio) return { data: real.data, isError: real.isError };
  // Com pessoa escolhida, usa a média real dela e troca só o quanto ela fez.
  if (alvo && !real.data && !real.isError) return { data: undefined, isError: false };
  return { data: metaFicticia(d, ficticio.medias, hoje, real.data), isError: false };
}

export function useMeusCuponsDaVisao(d: DesafioVale, aberta: boolean, operadorId: string | null) {
  const { ficticio } = useVisaoDoVale();
  const real = useMeusCupons(d, aberta, ficticio ? null : operadorId);
  if (!ficticio) return { data: real.data, isError: real.isError };
  return { data: cuponsFicticios(d, ficticio), isError: false };
}

export function useSetorDaVisao(d: DesafioVale, setorId: string | null, aberta: boolean, hoje: string) {
  const { ficticio } = useVisaoDoVale();
  const real = useSetorNoVale(d, ficticio ? null : setorId, aberta, hoje);
  if (!ficticio) return { data: real.data, isError: real.isError };
  return { data: setorFicticio(d, hoje), isError: false };
}

export function useRankingDaVisao(d: DesafioVale, setorId: string | null, aberta: boolean, ligado: boolean, verTodos: boolean) {
  const { ficticio } = useVisaoDoVale();
  const real = useRankingDoVale(d, setorId, aberta, ligado && !ficticio);
  if (!ficticio) return { data: real.data, isError: real.isError, isLoading: real.isLoading };
  const qtd = d.setores?.find(s => s.setor_id === setorId)?.cupom_ranking_qtd ?? d.meu_setor?.cupom_ranking_qtd ?? 2;
  return { data: rankingFicticio(d, qtd, verTodos), isError: false, isLoading: false };
}

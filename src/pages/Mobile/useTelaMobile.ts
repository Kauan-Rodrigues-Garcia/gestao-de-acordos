/**
 * useTelaMobile — os números da tela mínima do celular (`/m`).
 *
 * Nenhuma conta nova: cada número vem da MESMA fonte que o Dashboard usa.
 *
 *   • recebido, meta, faixas, recebido hoje ..... `usePainelMetas` (escopo «eu»)
 *   • comissão ................................... `useMinhaComissao` + `temCardComissao`
 *   • ranking .................................... `buscarResumoOperadoresAnalitico`
 *                                                   + `posicaoNoRanking`, como a aba Analítico
 *   • últimos pagamentos ......................... `buscarAnalitico` da própria pessoa
 *
 * Não usa `useAnalitico`: ele marca os pagamentos como vistos ao montar, e a
 * etiqueta «novo» da aba Analítico sumiria só porque a pessoa abriu o celular.
 * O «novo» daqui é do aparelho (`localStorage`).
 *
 * Sem canal Realtime próprio. `usePainelMetas` já escuta o sinal do analítico
 * (canal único por empresa); quando ele traz linhas novas, os pagamentos são
 * relidos. Fora isso: ao voltar para o app e quando chega um aviso.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { usePainelMetas } from '@/hooks/usePainelMetas';
import { useAnaliticoDashboard } from '@/hooks/useAnaliticoDashboard';
import { useTenant } from '@/lib/tenant-config';
import { getTodayISO } from '@/lib/index';
import type { AnaliticoRecebimento } from '@/lib/supabase';
import { buscarAnalitico, buscarResumoOperadoresAnalitico } from '@/services/analitico/analitico.service';
import { posicaoNoRanking, type PosicaoNoRanking } from '@/services/analitico/posicaoNoRanking';
import { buscarSituacaoOperadores, idsOcultosRankingQuartil } from '@/services/situacaoUsuario.service';
import { useMinhaComissao, type MinhaComissao } from '@/services/comissao/useMinhaComissao';
import { temCardComissao } from '@/services/comissao/temCardComissao';
import { ouvirAvisosDoServiceWorker } from '@/lib/mobile/sw';
import { degrausComAmanha, type DegrauComAmanha } from '@/lib/projecaoMetas';

const CHAVE_VISTO_ATE = 'mobile:visto-ate';

function lerVistoAte(): string | null {
  try { return localStorage.getItem(CHAVE_VISTO_ATE); } catch { return null; }
}
function gravarVistoAte(v: string): void {
  try { localStorage.setItem(CHAVE_VISTO_ATE, v); } catch { /* só nesta visita */ }
}

export interface Pagamento {
  id: string;
  cliente: string | null;
  /** NR do pagamento (`codigo` do analítico). */
  codigo: string | null;
  forma: AnaliticoRecebimento['forma_pagamento'];
  detalhe: string | null;
  /** Bruto — o que o cliente pagou (decisão da revisão da spec, 30/09/2026). */
  valor: number;
  data: string;
  novo: boolean;
}

export interface Faixa {
  ordem: number;
  valor: number;
  batida: boolean;
}

export interface TelaMobile {
  carregando: boolean;
  semRelatorio: boolean;
  nome: string;
  empresaNome: string;
  isPaguePlay: boolean;
  mes: string;

  recebidoMes: number;
  meta: number | null;
  faixas: Faixa[];
  /** Percentual da 1ª meta. `null` sem meta. */
  pctMeta: number | null;

  recebidoHoje: number;
  qtdHoje: number;

  /** `null` = não mostrar o card. */
  comissao: MinhaComissao | null;

  podeVerRanking: boolean;
  ranking: PosicaoNoRanking | null;

  pagamentos: Pagamento[];
  carregandoPagamentos: boolean;
  /**
   * Pagamentos que estavam na lista e sumiram numa atualização com o app
   * aberto — saíram do recebimento da pessoa (transferência, exclusão). Chave
   * natural (NR + dia + forma), não o id: limpar e reimportar troca os ids e
   * não pode parecer saída.
   */
  saidas: Pagamento[];
  dispensarSaidas: () => void;

  /** Faixa de quartil e quanto falta para cada uma, hoje e amanhã. `null` sem meta. */
  quartil: {
    atual: number | null;
    projecaoPct: number;
    degraus: DegrauComAmanha[];
  } | null;
  fotoUrl: string | null;

  recarregar: () => void;
}

/** A chave natural do pagamento — sobrevive a «limpar e reimportar». */
export function chavePagamento(p: Pick<Pagamento, 'codigo' | 'data' | 'forma'>): string {
  return `${p.codigo ?? ''}|${p.data}|${p.forma}`;
}

/** O que estava antes e não está agora, pela chave natural. */
export function pagamentosQueSairam(antes: readonly Pagamento[], agora: readonly Pagamento[]): Pagamento[] {
  const atuais = new Set(agora.map(chavePagamento));
  return antes.filter(p => !atuais.has(chavePagamento(p)));
}

export function useTelaMobile(): TelaMobile {
  const { perfil } = useAuth();
  const { empresa } = useEmpresa();
  const { temPermissao } = useCargoPermissoes();
  const tenant = useTenant();
  const queryClient = useQueryClient();

  const hoje = getTodayISO();
  const mes = hoje.slice(0, 7);
  const empresaId = empresa?.id ?? null;
  const perfilId = perfil?.id ?? null;

  // H.O. é o que a PaguePlay acompanha; a BookPlay ignora a unidade.
  const painel = usePainelMetas({
    mes,
    operadorId: perfilId,
    setorId: perfil?.setor_id ?? null,
    unidade: tenant.isPaguePlay ? 'ho' : 'bruto',
  });

  const comissaoHook = useMinhaComissao({ aberto: !painel.carregando, mes });
  const comissao = comissaoHook.podeVer && (temCardComissao(comissaoHook.resultado) || comissaoHook.erro)
    ? comissaoHook
    : null;

  // ── Últimos pagamentos ──────────────────────────────────────────────────
  const chavePagamentos = useMemo(
    () => ['mobile-pagamentos', empresaId, perfilId, mes] as const,
    [empresaId, perfilId, mes],
  );
  const pagamentosQuery = useQuery({
    queryKey: chavePagamentos,
    enabled: !!empresaId && !!perfilId,
    queryFn: async () => {
      const { data, error } = await buscarAnalitico({
        empresaId: empresaId as string, mes, operadorId: perfilId as string,
      });
      if (error) throw new Error(error);
      return data;
    },
  });

  // O «novo» compara com o que ESTE aparelho já viu. A marca antiga vale a
  // visita inteira (senão o destaque sumiria no primeiro render); a nova é
  // gravada assim que os pagamentos chegam.
  const [vistoAte] = useState<string | null>(() => lerVistoAte());
  const linhas = pagamentosQuery.data;
  useEffect(() => {
    if (!linhas?.length) return;
    const maisRecente = linhas.reduce((m, l) => (l.importado_em > m ? l.importado_em : m), '');
    if (maisRecente && (!vistoAte || maisRecente > vistoAte)) gravarVistoAte(maisRecente);
  }, [linhas, vistoAte]);

  const pagamentos = useMemo<Pagamento[]>(() => {
    if (!linhas) return [];
    return [...linhas]
      .sort((a, b) => (b.data_pagamento.localeCompare(a.data_pagamento)
        || b.importado_em.localeCompare(a.importado_em)))
      .map(l => ({
        id: l.id,
        cliente: l.nome_cliente,
        codigo: l.codigo ?? null,
        forma: l.forma_pagamento,
        detalhe: l.forma_detalhe ?? null,
        valor: Number(l.valor_recebido) || 0,
        data: l.data_pagamento,
        // 1ª visita neste aparelho: nada é «novo», senão o mês inteiro acenderia.
        novo: !!vistoAte && l.importado_em > vistoAte,
      }));
  }, [linhas, vistoAte]);

  // ── Saídas: o que sumiu da lista entre uma leitura e outra ─────────────
  const anteriores = useRef<Pagamento[] | null>(null);
  const [saidas, setSaidas] = useState<Pagamento[]>([]);
  useEffect(() => {
    if (!linhas) return;
    if (anteriores.current) {
      const sairam = pagamentosQueSairam(anteriores.current, pagamentos);
      if (sairam.length) setSaidas(s => [...sairam, ...s].slice(0, 5));
    }
    anteriores.current = pagamentos;
  }, [linhas, pagamentos]);
  const dispensarSaidas = useCallback(() => setSaidas([]), []);

  // Relatório novo chegou pelo sinal que `usePainelMetas` já escuta → relê a
  // lista. A primeira carga não conta: a lista já está buscando.
  const { linhas: linhasAgregadas } = useAnaliticoDashboard(true, mes);
  const primeiraAgregada = useRef(true);
  useEffect(() => {
    if (primeiraAgregada.current) { primeiraAgregada.current = false; return; }
    void queryClient.invalidateQueries({ queryKey: chavePagamentos });
  }, [linhasAgregadas, queryClient, chavePagamentos]);

  // ── Ranking ─────────────────────────────────────────────────────────────
  const podeVerRanking = temPermissao('analitico_sub_ranking');
  const rankingQuery = useQuery({
    queryKey: ['mobile-ranking', empresaId, mes],
    enabled: podeVerRanking && !!empresaId,
    queryFn: async () => {
      const [{ data, error }, situacao] = await Promise.all([
        buscarResumoOperadoresAnalitico(empresaId as string, mes),
        buscarSituacaoOperadores(empresaId as string, mes),
      ]);
      if (error) throw new Error(error);
      return { data, ocultos: idsOcultosRankingQuartil(situacao) };
    },
  });
  const ranking = rankingQuery.data && perfilId
    ? posicaoNoRanking(rankingQuery.data.data, rankingQuery.data.ocultos, perfilId)
    : null;

  // ── Recarregar: ao voltar para o app e quando chega aviso ───────────────
  const { recarregar: recarregarComissao } = comissaoHook;
  const recarregar = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['analitico-dashboard', empresaId, mes] });
    void queryClient.invalidateQueries({ queryKey: chavePagamentos });
    void queryClient.invalidateQueries({ queryKey: ['mobile-ranking', empresaId, mes] });
    recarregarComissao();
  }, [queryClient, empresaId, mes, chavePagamentos, recarregarComissao]);

  useEffect(() => {
    const aoVoltar = () => { if (document.visibilityState === 'visible') recarregar(); };
    document.addEventListener('visibilitychange', aoVoltar);
    const pararSw = ouvirAvisosDoServiceWorker(recarregar);
    return () => {
      document.removeEventListener('visibilitychange', aoVoltar);
      pararSw();
    };
  }, [recarregar]);

  // ── Meta e faixas ───────────────────────────────────────────────────────
  const recebidoMes = painel.totalRecebido;
  const faixas: Faixa[] = painel.meta
    ? [painel.meta, ...painel.metasExtras].map((valor, i) => ({
        ordem: i + 1, valor, batida: recebidoMes >= valor,
      }))
    : [];
  const pctMeta = painel.meta ? (recebidoMes / painel.meta) * 100 : null;

  // Quartil: a MESMA projeção do card «Progresso da meta» do Dashboard.
  const proj = painel.projecao;
  const quartil = proj ? {
    atual: proj.quartil?.quartil ?? null,
    projecaoPct: proj.projecaoPct,
    degraus: degrausComAmanha({
      recebido: painel.metaDupla.recebidoTotal,
      esperado: proj.esperado,
      metaDiaria: proj.metaDiaria,
      diasRestantes: painel.diasUteisRestantes,
      quartis: painel.quartis,
    }),
  } : null;

  const dia = Number(hoje.slice(8, 10));
  const doDia = painel.porDia[dia];
  const recebidoHoje = doDia ? (painel.unidade === 'ho' ? doDia.ho : doDia.bruto) : 0;

  return {
    carregando: painel.carregando,
    semRelatorio: painel.semRelatorio,
    nome: perfil?.nome ?? '',
    empresaNome: empresa?.nome ?? '',
    isPaguePlay: tenant.isPaguePlay,
    mes,
    recebidoMes,
    meta: painel.meta,
    faixas,
    pctMeta,
    recebidoHoje,
    qtdHoje: doDia?.qtd ?? 0,
    comissao,
    podeVerRanking,
    ranking,
    pagamentos,
    carregandoPagamentos: pagamentosQuery.isLoading,
    saidas,
    dispensarSaidas,
    quartil,
    fotoUrl: perfil?.foto_url ?? null,
    recarregar,
  };
}

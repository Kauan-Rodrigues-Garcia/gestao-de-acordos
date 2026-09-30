/**
 * useTelaEquipe — os dados da tela da equipe no celular (`/m/equipe`).
 *
 * Spec: docs/superpowers/specs/2026-09-30-mobile-lideranca-design.md §2.
 *
 * Busca as MESMAS fontes que o Painel do Líder busca (uma vez por empresa e
 * mês, em cache do react-query) e entrega a conta pronta por `montarEquipe`.
 * O gráfico e os pagamentos são outras consultas, feitas só quando a aba abre
 * (`useGraficoEquipe`, `usePagamentosEquipe`).
 *
 * Sem canal Realtime próprio: recarrega ao voltar para o app e quando chega
 * um aviso pelo service worker — o mesmo combinado da `/m`.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useTenant } from '@/lib/tenant-config';
import { useHoPercentual } from '@/lib/hoPercentual';
import { getTodayISO, PERFIS_QUE_CONTAM_NO_RECEBIMENTO } from '@/lib/index';
import { QUARTIS_PADRAO } from '@/lib/diasUteis';
import {
  buscarCreditosDeOrigem, buscarEquipesComOperadores, buscarResumoOperadoresAnalitico,
  buscarRecebidoPorDia, buscarAjustesComoLinhasDia, type LinhaRecebidaDia,
} from '@/services/analitico/analitico.service';
import { buscarResumoMensalDiario } from '@/services/diario/diario.service';
import { getMetasConfig } from '@/services/metas/metasConfig.service';
import { lerMetaIndiretaDaLinha } from '@/services/metas/metaIndireta';
import { buscarRecebimentoIndireto } from '@/services/metas/recebimentoIndireto.service';
import type { PerfilLider } from '@/pages/Dashboard/Analitico/lideresDaEquipe';
import type { PerfilOp } from '@/pages/Dashboard/Analitico/linhasQuartil';
import { equipesQueLidero } from '@/lib/mobile/equipesQueLidero';
import { ouvirAvisosDoServiceWorker } from '@/lib/mobile/sw';
import { montarEquipe, type EquipeNaTela, type FontesEquipe } from './montarEquipe';

const CHAVE_EQUIPE = 'mobile:equipe';

function lerEquipeLembrada(): string | null {
  try { return localStorage.getItem(CHAVE_EQUIPE); } catch { return null; }
}
function gravarEquipeLembrada(id: string): void {
  try { localStorage.setItem(CHAVE_EQUIPE, id); } catch { /* vale só nesta visita */ }
}

interface MetaRow {
  tipo: string; referencia_id: string; meta_valor: number;
  meta_indireta_ativa?: boolean | null; meta_indireta_valor?: number | null;
}

type Bruto = Omit<FontesEquipe, 'hojeISO' | 'emHO' | 'ho' | 'indiretoMap'> & {
  lideranca: {
    lideres: PerfilLider[];
    explicitos: { equipe_id: string; lider_id: string }[];
    clones: { equipe_id: string; operador_id: string }[];
  };
};

async function carregarFontes(empresaId: string, mes: string): Promise<Bruto> {
  const [ano, mesNum] = mes.split('-').map(Number);
  const [
    composicao, resumo, creditos, metasRes, cfg, equipesRes, lideresRes,
    explicitosRes, clonesRes, opsRes, setoresRes,
  ] = await Promise.all([
    buscarEquipesComOperadores(empresaId, mes),
    buscarResumoOperadoresAnalitico(empresaId, mes),
    buscarCreditosDeOrigem(empresaId, mes),
    // `select('*')`: as colunas da meta indireta podem não existir (ver
    // QuartisOperadores) — nomeá-las derrubaria a consulta inteira.
    supabase.from('metas').select('*')
      .eq('empresa_id', empresaId).eq('mes', mesNum).eq('ano', ano)
      .in('tipo', ['equipe', 'operador']),
    getMetasConfig(empresaId, mesNum, ano),
    supabase.from('equipes').select('id, treinamento, treinamento_inicio').eq('empresa_id', empresaId),
    supabase.from('perfis').select('id, nome, foto_url, equipe_id')
      .eq('empresa_id', empresaId).eq('perfil', 'lider'),
    supabase.from('equipe_lideres').select('equipe_id, lider_id').eq('empresa_id', empresaId),
    supabase.from('equipe_operadores_clones').select('equipe_id, operador_id').eq('empresa_id', empresaId),
    // A lista da aba Quartis: quem conta, ativo ou desligado no mês.
    supabase.from('perfis')
      .select('id, nome, foto_url, setor_id, equipe_id, situacao, arquivado, desligado_em, ferias_ate')
      .eq('empresa_id', empresaId)
      .in('perfil', [...PERFIS_QUE_CONTAM_NO_RECEBIMENTO])
      .or('ativo.eq.true,situacao.eq.desligado')
      .order('nome'),
    supabase.from('setores').select('id, nome').eq('empresa_id', empresaId),
  ]);
  if (resumo.error) throw new Error(resumo.error);

  const metasEquipe: Record<string, number> = {};
  const metasOperador: Record<string, number> = {};
  const metasIndiretas: Record<string, number> = {};
  for (const m of (metasRes.data as MetaRow[] | null) ?? []) {
    const v = Number(m.meta_valor) || 0;
    if (m.tipo === 'equipe' && v > 0) metasEquipe[m.referencia_id] = v;
    if (m.tipo === 'operador') {
      if (v > 0) metasOperador[m.referencia_id] = v;
      const ind = lerMetaIndiretaDaLinha(m);
      if (ind !== null) metasIndiretas[m.referencia_id] = ind;
    }
  }
  const treinoMap: Record<string, string | null> = {};
  for (const e of (equipesRes.data as { id: string; treinamento: boolean | null; treinamento_inicio: string | null }[] | null) ?? []) {
    if (e.treinamento) treinoMap[e.id] = e.treinamento_inicio ?? null;
  }
  const setores: Record<string, string> = {};
  for (const s of (setoresRes.data as { id: string; nome: string }[] | null) ?? []) setores[s.id] = s.nome;

  return {
    mes,
    equipes: composicao.equipes,
    operadorEquipeMap: composicao.operadorEquipeMap,
    equipesExtrasPorOperador: composicao.equipesExtrasPorOperador,
    resumos: resumo.data,
    creditosDeOrigem: creditos,
    metasEquipe, metasOperador, metasIndiretas,
    feriados: cfg.data?.feriados ?? [],
    contarHoje: cfg.data?.contar_dia_atual === true,
    quartis: cfg.data?.quartis ?? QUARTIS_PADRAO,
    treinoMap,
    operadores: (opsRes.data as unknown as PerfilOp[] | null) ?? [],
    setores,
    lideranca: {
      lideres: (lideresRes.data as PerfilLider[] | null) ?? [],
      explicitos: (explicitosRes.data as { equipe_id: string; lider_id: string }[] | null) ?? [],
      clones: (clonesRes.data as { equipe_id: string; operador_id: string }[] | null) ?? [],
    },
  };
}

export interface OpcaoEquipe { id: string; nome: string; setorNome: string | null }

export interface TelaEquipe {
  carregando: boolean;
  erro: string | null;
  mes: string;
  hojeISO: string;
  isPaguePlay: boolean;
  empresaId: string | null;
  /** Equipes que a pessoa lidera (o seletor do topo). */
  opcoes: OpcaoEquipe[];
  equipe: EquipeNaTela | null;
  escolherEquipe: (id: string) => void;
  recarregar: () => void;
}

export function useTelaEquipe(): TelaEquipe {
  const { perfil } = useAuth();
  const { empresa } = useEmpresa();
  const tenant = useTenant();
  // Converte a meta para H.O. (metaNaUnidade lê o percentual carregado aqui).
  const ho = useHoPercentual();
  const queryClient = useQueryClient();

  const hojeISO = getTodayISO();
  const mes = hojeISO.slice(0, 7);
  const empresaId = empresa?.id ?? null;
  const emHO = tenant.isPaguePlay;

  const chave = useMemo(() => ['mobile-equipe-fontes', empresaId, mes] as const, [empresaId, mes]);
  const fontesQuery = useQuery({
    queryKey: chave,
    enabled: !!empresaId,
    queryFn: () => carregarFontes(empresaId as string, mes),
    staleTime: 60_000,
  });
  const bruto = fontesQuery.data;

  // Meta indireta [PP]: só busca quando alguém tem a opção ligada.
  const alvosIndireta = useMemo(
    () => (bruto ? Object.keys(bruto.metasIndiretas) : []), [bruto],
  );
  const indiretaQuery = useQuery({
    queryKey: ['mobile-equipe-indireto', empresaId, mes, alvosIndireta.join(',')],
    enabled: tenant.isPaguePlay && !!empresaId && alvosIndireta.length > 0,
    queryFn: () => buscarRecebimentoIndireto({ empresaId: empresaId as string, mes, operadores: alvosIndireta }),
  });

  const opcoes = useMemo<OpcaoEquipe[]>(() => {
    if (!bruto || !perfil?.id) return [];
    const ids = equipesQueLidero({ id: perfil.id }, bruto.lideranca);
    return ids
      .map(id => bruto.equipes.find(e => e.id === id))
      .filter((e): e is NonNullable<typeof e> => !!e)
      .map(e => ({ id: e.id, nome: e.nome, setorNome: e.setor_id ? bruto.setores[e.setor_id] ?? null : null }))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [bruto, perfil?.id]);

  const [escolhida, setEscolhida] = useState<string | null>(() => lerEquipeLembrada());
  const equipeId = opcoes.some(o => o.id === escolhida) ? escolhida : opcoes[0]?.id ?? null;
  const escolherEquipe = useCallback((id: string) => {
    setEscolhida(id);
    gravarEquipeLembrada(id);
  }, []);

  const equipe = useMemo(() => {
    if (!bruto || !equipeId) return null;
    return montarEquipe({
      ...bruto, hojeISO, emHO, ho, indiretoMap: indiretaQuery.data ?? {},
    }, equipeId);
  }, [bruto, equipeId, hojeISO, emHO, ho, indiretaQuery.data]);

  const recarregar = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['mobile-equipe-fontes', empresaId, mes] });
    void queryClient.invalidateQueries({ queryKey: ['mobile-equipe-grafico', empresaId, mes] });
    void queryClient.invalidateQueries({ queryKey: ['mobile-equipe-pagamentos', empresaId, mes] });
  }, [queryClient, empresaId, mes]);

  useEffect(() => {
    const aoVoltar = () => { if (document.visibilityState === 'visible') recarregar(); };
    document.addEventListener('visibilitychange', aoVoltar);
    const pararSw = ouvirAvisosDoServiceWorker(recarregar);
    return () => {
      document.removeEventListener('visibilitychange', aoVoltar);
      pararSw();
    };
  }, [recarregar]);

  return {
    carregando: !empresaId || fontesQuery.isLoading,
    erro: fontesQuery.error ? 'Não foi possível carregar os números da equipe.' : null,
    mes, hojeISO,
    isPaguePlay: tenant.isPaguePlay,
    empresaId,
    opcoes,
    equipe,
    escolherEquipe,
    recarregar,
  };
}

/**
 * As linhas do mês por dia — a fonte do Gráfico do Painel: o analítico na
 * BookPlay; o recebimento diário + ajustes na PaguePlay. Só quando a aba abre.
 */
export function useGraficoEquipe(params: {
  empresaId: string | null; mes: string; isPaguePlay: boolean; ativo: boolean;
}) {
  const { empresaId, mes, isPaguePlay, ativo } = params;
  return useQuery({
    queryKey: ['mobile-equipe-grafico', empresaId, mes, isPaguePlay],
    enabled: ativo && !!empresaId,
    staleTime: 60_000,
    queryFn: async (): Promise<LinhaRecebidaDia[]> => {
      if (isPaguePlay) {
        const [diario, ajustes] = await Promise.all([
          buscarResumoMensalDiario(empresaId as string, mes),
          buscarAjustesComoLinhasDia(empresaId as string, mes),
        ]);
        if (diario.error) throw new Error(diario.error);
        return [...diario.linhasDia, ...ajustes];
      }
      const { data, error } = await buscarRecebidoPorDia(empresaId as string, mes);
      if (error) throw new Error(error);
      return data;
    },
  });
}

export interface PagamentoEquipe {
  id: string;
  operadorId: string | null;
  cliente: string | null;
  forma: string;
  detalhe: string | null;
  valor: number;
  data: string;
  importadoEm: string;
}

/**
 * Os pagamentos mais recentes da equipe, um a um.
 *
 * Consulta curta (20 linhas, só as colunas da lista) em vez de `buscarAnalitico`,
 * que pagina o mês inteiro da empresa. A RLS (`analitico_select`) decide o que
 * volta: sem alcance de equipe no analítico, vem vazio — e a aba Hoje fica só
 * com os agregados (spec §2.4).
 */
export function usePagamentosEquipe(params: {
  empresaId: string | null; mes: string; operadorIds: readonly string[]; ativo: boolean;
}) {
  const { empresaId, mes, operadorIds, ativo } = params;
  return useQuery({
    queryKey: ['mobile-equipe-pagamentos', empresaId, mes, [...operadorIds].sort().join(',')],
    enabled: ativo && !!empresaId && operadorIds.length > 0,
    queryFn: async (): Promise<PagamentoEquipe[]> => {
      const { data, error } = await supabase
        .from('analitico_recebimentos')
        .select('id, operador_id, nome_cliente, forma_pagamento, forma_detalhe, valor_recebido, data_pagamento, importado_em')
        .eq('empresa_id', empresaId as string)
        .in('operador_id', [...operadorIds])
        .gte('data_pagamento', `${mes}-01`)
        .order('data_pagamento', { ascending: false })
        .order('importado_em', { ascending: false })
        .limit(20);
      if (error) throw new Error(error.message);
      return ((data as {
        id: string; operador_id: string | null; nome_cliente: string | null;
        forma_pagamento: string; forma_detalhe: string | null; valor_recebido: number;
        data_pagamento: string; importado_em: string;
      }[] | null) ?? []).map(l => ({
        id: l.id, operadorId: l.operador_id, cliente: l.nome_cliente,
        forma: l.forma_pagamento, detalhe: l.forma_detalhe ?? null,
        valor: Number(l.valor_recebido) || 0, data: l.data_pagamento, importadoEm: l.importado_em,
      }));
    },
  });
}

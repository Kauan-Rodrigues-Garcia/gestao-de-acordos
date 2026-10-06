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
 * Tempo real: ouve o MESMO sinal do analítico que a `/m` e o Dashboard ouvem
 * (`assinarSinal`, um canal por empresa dividido entre quem assina — nenhum
 * canal novo) e, na PaguePlay, o do diário. Chegou importação, apagou ou
 * transferiu linha → relê. Também relê ao voltar para o app e quando chega um
 * aviso pelo service worker.
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
  buscarRecebidoPorDiaDosOperadores, buscarAjustesComoLinhasDia, buscarParesForaDoSetor,
  type LinhaRecebidaDia,
} from '@/services/analitico/analitico.service';
import { buscarResumoMensalDiario } from '@/services/diario/diario.service';
import { getMetasConfig } from '@/services/metas/metasConfig.service';
import { buscarPessoasDoRetrato, pessoasDoMes } from '@/services/analitico/pessoasDoMes';
import { lerMetaIndiretaDaLinha } from '@/services/metas/metaIndireta';
import { buscarRecebimentoIndireto } from '@/services/metas/recebimentoIndireto.service';
import type { PerfilLider } from '@/pages/Dashboard/Analitico/lideresDaEquipe';
import type { PerfilOp } from '@/pages/Dashboard/Analitico/linhasQuartil';
import { equipesDaVisao } from '@/lib/mobile/equipesQueLidero';
import { ouvirAvisosDoServiceWorker } from '@/lib/mobile/sw';
import { assinarSinal } from '@/lib/sinais';
import { montarEquipe, type EquipeNaTela, type FontesEquipe } from './montarEquipe';
import { useUnidadeApp } from '@/lib/mobile/unidadeApp';
import { ehGerencia } from '@/lib/mobile/visoes';

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

export async function carregarFontes(empresaId: string, mes: string): Promise<Bruto> {
  const [ano, mesNum] = mes.split('-').map(Number);
  const [
    composicao, resumo, creditos, metasRes, cfg, equipesRes, lideresRes,
    explicitosRes, clonesRes, opsRes, setoresRes, retratoPessoas,
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
    // Mês fechado: a lista DAQUELE mês (ver `pessoasDoMes.ts`).
    buscarPessoasDoRetrato(empresaId, mes),
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
    operadores: pessoasDoMes((opsRes.data as unknown as PerfilOp[] | null) ?? [], retratoPessoas, {
      cargos: PERFIS_QUE_CONTAM_NO_RECEBIMENTO, situacao: 'ou_desligado',
    }),
    setores,
    lideranca: {
      lideres: (lideresRes.data as PerfilLider[] | null) ?? [],
      explicitos: (explicitosRes.data as { equipe_id: string; lider_id: string }[] | null) ?? [],
      clones: (clonesRes.data as { equipe_id: string; operador_id: string }[] | null) ?? [],
    },
  };
}

/** A chave do cache das fontes — a `/m` usa para deixar a equipe pronta antes do toque. */
export function chaveFontesEquipe(empresaId: string | null, mes: string) {
  return ['mobile-equipe-fontes', empresaId, mes] as const;
}

export interface OpcaoEquipe { id: string; nome: string; setorNome: string | null }

export interface TelaEquipe {
  carregando: boolean;
  erro: string | null;
  mes: string;
  hojeISO: string;
  isPaguePlay: boolean;
  /** A unidade do interruptor (Cofen). */
  emHO: boolean;
  empresaId: string | null;
  /** Equipes que a pessoa lidera ou de que faz parte (o seletor do topo). */
  opcoes: OpcaoEquipe[];
  fotoUrl: string | null;
  nomePessoa: string;
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
  // Cofen abre em H.O. e troca no interruptor (06/10/2026).
  const { emHO } = useUnidadeApp(tenant.isPaguePlay);

  const chave = useMemo(() => chaveFontesEquipe(empresaId, mes), [empresaId, mes]);
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
    // Gerência: as equipes do setor dela (06/10/2026). Os demais: as que lideram
    // ou de que fazem parte.
    const ids = ehGerencia(perfil.perfil)
      ? bruto.equipes.filter(e => !!perfil.setor_id && e.setor_id === perfil.setor_id).map(e => e.id)
      : equipesDaVisao({ id: perfil.id }, bruto.lideranca, bruto);
    return ids
      .map(id => bruto.equipes.find(e => e.id === id))
      .filter((e): e is NonNullable<typeof e> => !!e)
      .map(e => ({ id: e.id, nome: e.nome, setorNome: e.setor_id ? bruto.setores[e.setor_id] ?? null : null }))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [bruto, perfil?.id, perfil?.perfil, perfil?.setor_id]);

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

  // O sinal do banco: um aviso por comando (importar, apagar, transferir).
  useEffect(() => {
    if (!empresaId) return;
    const ouvinte = { onMudou: recarregar, onReconectado: recarregar };
    const cancelarAnalitico = assinarSinal('analitico', empresaId, ouvinte, { minimoSoUpdateMs: 5 * 60_000 });
    const cancelarDiario = tenant.isPaguePlay ? assinarSinal('diario', empresaId, ouvinte) : () => {};
    return () => { cancelarAnalitico(); cancelarDiario(); };
  }, [empresaId, recarregar, tenant.isPaguePlay]);

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
    emHO,
    empresaId,
    opcoes,
    fotoUrl: perfil?.foto_url ?? null,
    nomePessoa: perfil?.nome ?? '',
    equipe,
    escolherEquipe,
    recarregar,
  };
}

/**
 * As linhas do mês por dia — a fonte do Gráfico do Painel, recortada na
 * equipe: em Nosso produto, só as linhas dos operadores da equipe (em vez do
 * mês inteiro da empresa — ver `buscarRecebidoPorDiaDosOperadores`); no Cofen,
 * o recebimento diário (já agregado por operador e dia) + ajustes.
 *
 * Nosso produto descarta a linha que caiu num setor onde a pessoa não está no
 * mês (`buscarParesForaDoSetor`, 05/10/2026). Sem isso o «Recebido hoje» e o
 * gráfico da equipe somavam mais que o card da equipe e que o aviso de equipe
 * — R$ 3 mil a mais numa equipe do Play 1 no dia da conferência.
 */
export function carregarGraficoEquipe(
  empresaId: string, mes: string, isPaguePlay: boolean, operadorIds: readonly string[],
): Promise<LinhaRecebidaDia[]> {
  return (async () => {
    if (isPaguePlay) {
      const [diario, ajustes] = await Promise.all([
        buscarResumoMensalDiario(empresaId, mes),
        buscarAjustesComoLinhasDia(empresaId, mes),
      ]);
      if (diario.error) throw new Error(diario.error);
      return [...diario.linhasDia, ...ajustes];
    }
    const [{ data, error }, fora] = await Promise.all([
      buscarRecebidoPorDiaDosOperadores(empresaId, mes, operadorIds),
      buscarParesForaDoSetor(empresaId, mes),
    ]);
    if (error) throw new Error(error);
    if (!fora.size) return data;
    return data.filter(l => !(l.operador_id && l.setor_id && fora.has(`${l.operador_id}|${l.setor_id}`)));
  })();
}

export function chaveGraficoEquipe(
  empresaId: string | null, mes: string, isPaguePlay: boolean, operadorIds: readonly string[],
) {
  return ['mobile-equipe-grafico', empresaId, mes, isPaguePlay, [...operadorIds].sort().join(',')] as const;
}

export function useGraficoEquipe(params: {
  empresaId: string | null; mes: string; isPaguePlay: boolean; operadorIds: readonly string[]; ativo: boolean;
}) {
  const { empresaId, mes, isPaguePlay, operadorIds, ativo } = params;
  return useQuery({
    queryKey: chaveGraficoEquipe(empresaId, mes, isPaguePlay, operadorIds),
    enabled: ativo && !!empresaId && operadorIds.length > 0,
    staleTime: 60_000,
    queryFn: () => carregarGraficoEquipe(empresaId as string, mes, isPaguePlay, operadorIds),
  });
}

export interface PagamentoEquipe {
  id: string;
  operadorId: string | null;
  cliente: string | null;
  /** NR (`codigo` do analítico). */
  codigo: string | null;
  forma: string;
  detalhe: string | null;
  valor: number;
  /** H.O. da linha (`total_ho`) — regra Cofen. */
  valorHO: number;
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
        .select('id, operador_id, codigo, nome_cliente, forma_pagamento, forma_detalhe, valor_recebido, total_ho, data_pagamento, importado_em')
        .eq('empresa_id', empresaId as string)
        .in('operador_id', [...operadorIds])
        .gte('data_pagamento', `${mes}-01`)
        .order('data_pagamento', { ascending: false })
        .order('importado_em', { ascending: false })
        .limit(20);
      if (error) throw new Error(error.message);
      return ((data as {
        id: string; operador_id: string | null; codigo: string | null; nome_cliente: string | null;
        forma_pagamento: string; forma_detalhe: string | null; valor_recebido: number; total_ho: number | null;
        data_pagamento: string; importado_em: string;
      }[] | null) ?? []).map(l => ({
        id: l.id, operadorId: l.operador_id, cliente: l.nome_cliente, codigo: l.codigo ?? null,
        forma: l.forma_pagamento, detalhe: l.forma_detalhe ?? null,
        valor: Number(l.valor_recebido) || 0, valorHO: Number(l.total_ho) || 0,
        data: l.data_pagamento, importadoEm: l.importado_em,
      }));
    },
  });
}

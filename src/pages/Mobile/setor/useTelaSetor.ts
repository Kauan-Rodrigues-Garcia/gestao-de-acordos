/**
 * useTelaSetor — os dados da tela do setor no celular (`/m/setor`).
 *
 * Desenho: docs/superpowers/specs/2026-10-06-app-celular-gerencia-design.md §2.
 *
 * As MESMAS fontes do Painel do Líder (o cache de `carregarFontes`, dividido com
 * a tela da equipe): cada equipe do setor sai de `montarEquipe`; o total do
 * setor sai de `carregarTotalDoSetor` (o card do setor no Painel; Cofen pela
 * conciliação); a meta é a do SETOR na aba Metas.
 *
 * O dia a dia:
 *   Nosso produto   as linhas do mês (`buscarRecebidoPorDia`) recortadas pelo
 *                   escopo do setor — o gráfico do Painel do Líder;
 *   Cofen           o setor pela conciliação dia a dia
 *                   (`fn_app_conciliacao_diaria`) e as pessoas pelo diário.
 */
import { useCallback, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { rpcSemTipo } from '@/lib/supabaseSemTipo';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useTenant } from '@/lib/tenant-config';
import { paraHO, useHoPercentual } from '@/lib/hoPercentual';
import { metaNaUnidade } from '@/lib/unidadeValor';
import { getTodayISO } from '@/lib/index';
import { useUnidadeApp } from '@/lib/mobile/unidadeApp';
import { ritmoDoConjunto, type RitmoDoConjunto } from '@/lib/mobile/ritmo';
import { ouvirAvisosDoServiceWorker } from '@/lib/mobile/sw';
import { assinarSinal } from '@/lib/sinais';
import {
  buscarRecebidoPorDia, mapaSetorDaEquipe, operadoresDoSetor, type LinhaRecebidaDia,
} from '@/services/analitico/analitico.service';
import { escopoDeSetor, type EscopoAnalitico } from '@/services/analitico/escopoAnalitico';
import { buscarRecebimentoIndireto } from '@/services/metas/recebimentoIndireto.service';
import { carregarFontes, carregarGraficoEquipe, chaveFontesEquipe } from '../equipe/useTelaEquipe';
import { montarEquipe, type EquipeNaTela } from '../equipe/montarEquipe';
import { carregarTotalDoSetor, type InfoDoSetorApp } from './totalDoSetor';

export interface TelaSetor {
  carregando: boolean;
  erro: string | null;
  semSetor: boolean;
  mes: string;
  hojeISO: string;
  empresaId: string | null;
  setor: InfoDoSetorApp | null;
  isPaguePlay: boolean;
  emHO: boolean;
  /** O total do setor na unidade da tela. `null` enquanto carrega. */
  recebido: number | null;
  ritmo: RitmoDoConjunto | null;
  /** Equipes do setor, do melhor para o pior % da meta. */
  equipes: EquipeNaTela[];
  /** Quem conta no setor (cadastro, liderança e clones). */
  operadorIds: string[];
  nomes: Record<string, string>;
  escopoSetor: EscopoAnalitico | null;
  /** Linhas do dia a dia na unidade da tela — do SETOR (série e total de hoje). */
  linhasSetor: LinhaRecebidaDia[] | undefined;
  /** Linhas por pessoa na unidade da tela (equipes e «quem recebeu»). */
  linhasPessoas: LinhaRecebidaDia[] | undefined;
  carregandoLinhas: boolean;
  erroLinhas: boolean;
  fotoUrl: string | null;
  nomePessoa: string;
  recarregar: () => void;
}

interface SetorCru { id: string; nome: string; regra: string | null; alternativo: boolean | null }

export function useTelaSetor(): TelaSetor {
  const { perfil } = useAuth();
  const { empresa } = useEmpresa();
  const tenant = useTenant();
  const ho = useHoPercentual();
  const queryClient = useQueryClient();

  const hojeISO = getTodayISO();
  const mes = hojeISO.slice(0, 7);
  const [ano, mesNum] = mes.split('-').map(Number);
  const empresaId = empresa?.id ?? null;
  const setorId = perfil?.setor_id ?? null;

  const setorQuery = useQuery({
    queryKey: ['mobile-setor-info', setorId],
    enabled: !!setorId,
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<InfoDoSetorApp> => {
      const { data, error } = await supabase.from('setores')
        .select('id, nome, regra, alternativo').eq('id', setorId as string).maybeSingle();
      if (error) throw new Error(error.message);
      // `regra` é de 03/10 e ainda não está em `database.types.ts`.
      const s = data as unknown as SetorCru | null;
      if (!s) throw new Error('Setor não encontrado');
      return { id: s.id, nome: s.nome, cofen: s.regra === 'cofen', alternativo: s.alternativo === true };
    },
  });
  const setor = setorQuery.data ?? null;
  const cofen = setor?.cofen ?? false;
  const { emHO } = useUnidadeApp(cofen);

  const fontesQuery = useQuery({
    queryKey: chaveFontesEquipe(empresaId, mes),
    enabled: !!empresaId,
    queryFn: () => carregarFontes(empresaId as string, mes),
    staleTime: 60_000,
  });
  const fontes = fontesQuery.data;

  const alvosIndireta = useMemo(() => (fontes ? Object.keys(fontes.metasIndiretas) : []), [fontes]);
  const indiretaQuery = useQuery({
    queryKey: ['mobile-equipe-indireto', empresaId, mes, alvosIndireta.join(',')],
    enabled: cofen && !!empresaId && alvosIndireta.length > 0,
    queryFn: () => buscarRecebimentoIndireto({ empresaId: empresaId as string, mes, operadores: alvosIndireta }),
  });

  const totalQuery = useQuery({
    queryKey: ['mobile-setor-total', empresaId, mes, setorId],
    enabled: !!empresaId && !!setor && !!fontes,
    staleTime: 60_000,
    queryFn: () => carregarTotalDoSetor({
      empresaId: empresaId as string, mes, setor: setor as InfoDoSetorApp,
      isPaguePlay: tenant.isPaguePlay, fontes: fontes as NonNullable<typeof fontes>,
    }),
  });

  const metaQuery = useQuery({
    queryKey: ['mobile-setor-meta', empresaId, mes, setorId],
    enabled: !!empresaId && !!setorId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<number | null> => {
      const { data, error } = await supabase.from('metas').select('meta_valor')
        .eq('empresa_id', empresaId as string).eq('tipo', 'setor').eq('referencia_id', setorId as string)
        .eq('mes', mesNum).eq('ano', ano).maybeSingle();
      if (error) throw new Error(error.message);
      const v = Number((data as { meta_valor: number } | null)?.meta_valor) || 0;
      return v > 0 ? v : null;
    },
  });

  // Quem conta no setor e o escopo do dia a dia — a régua do Painel.
  const { operadorIds, escopoSetor } = useMemo(() => {
    if (!fontes || !setor) return { operadorIds: [] as string[], escopoSetor: null };
    const setorDaEquipe = mapaSetorDaEquipe(fontes.equipes);
    const ops = operadoresDoSetor(setor.id, {
      setoresAlternativos: new Set(setor.alternativo ? [setor.id] : []),
      operadorEquipeMap: fontes.operadorEquipeMap,
      equipesExtrasPorOperador: fontes.equipesExtrasPorOperador,
      setorDaEquipe,
    });
    return {
      operadorIds: [...ops],
      escopoSetor: escopoDeSetor({
        setorId: setor.id, alternativo: setor.alternativo, operadores: ops,
        temCarimbo: !tenant.isPaguePlay,
        setorDoOperador: id => fontes.operadorEquipeMap[id]?.setor_id ?? null,
      }),
    };
  }, [fontes, setor, tenant.isPaguePlay]);

  const nomes = useMemo(() => {
    const m: Record<string, string> = {};
    for (const o of fontes?.operadores ?? []) m[o.id] = o.nome;
    return m;
  }, [fontes]);

  // O dia a dia: setor e pessoas.
  const linhasQuery = useQuery({
    queryKey: ['mobile-setor-linhas', empresaId, mes, setorId, cofen],
    enabled: !!empresaId && !!setor,
    staleTime: 60_000,
    queryFn: async (): Promise<{ setor: LinhaRecebidaDia[]; pessoas: LinhaRecebidaDia[]; setorEmHO: boolean }> => {
      if (!cofen) {
        const { data, error } = await buscarRecebidoPorDia(empresaId as string, mes);
        if (error) throw new Error(error);
        return { setor: data, pessoas: data, setorEmHO: false };
      }
      const pessoas = await carregarGraficoEquipe(empresaId as string, mes, true, []);
      const { data, error } = await rpcSemTipo<{ dia: number; bruto: number; ho: number; qtd: number }[]>(
        'fn_app_conciliacao_diaria', { p_empresa_id: empresaId, p_mes: mes });
      if (error || !Array.isArray(data)) {
        // Sem a função (migration pendente): o setor pelo diário, como antes.
        return { setor: pessoas, pessoas, setorEmHO: false };
      }
      // Uma linha por dia, já com o H.O. da conciliação guardado à parte.
      const setorLinhas = data.map(d => ({
        operador_id: null as string | null, setor_id: setor?.id ?? null, importado_por_id: null as string | null,
        valor_recebido: Number(d.bruto) || 0,
        valor_ho: Number(d.ho) || 0,
        data_pagamento: `${mes}-${String(d.dia).padStart(2, '0')}`,
      })) as (LinhaRecebidaDia & { valor_ho: number })[];
      return { setor: setorLinhas, pessoas, setorEmHO: true };
    },
  });

  const conv = useCallback((linhas: LinhaRecebidaDia[] | undefined, comHO: boolean) => {
    if (!linhas || !emHO) return linhas;
    return linhas.map(l => ({
      ...l,
      valor_recebido: comHO
        ? Number((l as LinhaRecebidaDia & { valor_ho?: number }).valor_ho) || 0
        : paraHO(Number(l.valor_recebido) || 0),
    }));
  }, [emHO]);
  const linhasSetor = useMemo(
    () => conv(linhasQuery.data?.setor, linhasQuery.data?.setorEmHO ?? false),
    [conv, linhasQuery.data],
  );
  const linhasPessoas = useMemo(() => conv(linhasQuery.data?.pessoas, false), [conv, linhasQuery.data]);

  const equipes = useMemo(() => {
    if (!fontes || !setor) return [];
    const f = { ...fontes, hojeISO, emHO, ho, indiretoMap: indiretaQuery.data ?? {} };
    return fontes.equipes
      .filter(e => e.setor_id === setor.id)
      .map(e => montarEquipe(f, e.id))
      .filter((e): e is EquipeNaTela => !!e)
      .sort((a, b) => {
        const pa = a.meta ? a.acumulado / a.meta : -1;
        const pb = b.meta ? b.acumulado / b.meta : -1;
        return pb - pa || b.acumulado - a.acumulado;
      });
  }, [fontes, setor, hojeISO, emHO, ho, indiretaQuery.data]);

  const total = totalQuery.data;
  const recebido = total ? (emHO ? total.ho : total.bruto) : null;
  const metaBruta = metaQuery.data ?? null;
  const ritmo = recebido === null ? null : ritmoDoConjunto({
    recebido, meta: emHO ? metaNaUnidade(metaBruta, 'ho') : metaBruta, mes, hojeISO,
    feriados: fontes?.feriados ?? [], contarHoje: fontes?.contarHoje ?? false,
  });

  const recarregar = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: chaveFontesEquipe(empresaId, mes) });
    void queryClient.invalidateQueries({ queryKey: ['mobile-setor-total', empresaId, mes] });
    void queryClient.invalidateQueries({ queryKey: ['mobile-setor-linhas', empresaId, mes] });
    void queryClient.invalidateQueries({ queryKey: ['mobile-equipe-pagamentos', empresaId, mes] });
  }, [queryClient, empresaId, mes]);

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
    carregando: !empresaId || (!!setorId && (setorQuery.isLoading || fontesQuery.isLoading)),
    erro: setorQuery.error || fontesQuery.error ? 'Não foi possível carregar os números do setor.' : null,
    semSetor: !!perfil && !setorId,
    mes, hojeISO, empresaId, setor,
    isPaguePlay: tenant.isPaguePlay,
    emHO,
    recebido,
    ritmo,
    equipes,
    operadorIds,
    nomes,
    escopoSetor,
    linhasSetor,
    linhasPessoas,
    carregandoLinhas: linhasQuery.isLoading,
    erroLinhas: linhasQuery.isError,
    fotoUrl: perfil?.foto_url ?? null,
    nomePessoa: perfil?.nome ?? '',
    recarregar,
  };
}

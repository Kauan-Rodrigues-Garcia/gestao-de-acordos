/**
 * O Desafio do Vale no Gestão (23/11/2026): o desafio (banco), as 9 médias
 * de quem olha (Analítico), os cupons do Pix dele (Pix Automático) e, para o
 * líder, o setor inteiro.
 *
 * Ao vivo pelo sinal `desafios:<empresa>` (tabela `desafio_vale*`, migration
 * 20261123120000). O Pix não tem sinal: com a gaveta aberta relê a cada 2 min.
 * Nada relê ao voltar para a aba (o pico de todos voltando já derrubou o banco).
 */
import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { assinarSinal } from '@/lib/sinais';
import { diasUteisDoSetor } from '@/lib/diasUteisDoSetor';
import { useAuth } from './useAuth';
import { useEmpresa } from './useEmpresa';
import { buscarAnaliticoPeriodo, somarPorDia } from '@/services/desempenhoDia/desempenhoDia.service';
import { getMetasConfig } from '@/services/metas/metasConfig.service';
import { buscarSetorNoDesafio } from '@/services/desafioCobranca/equipeNoDesafio';
import { buscarDesafioVale, buscarPixDoCupom, buscarRankingVale, buscarVistosVale, jaViArteVale, type DesafioVale, type SetorNoVale } from '@/services/desafioVale/desafioVale.service';
import { comProjecao, contarCupons, cuponsPorOperador, diasDoPeriodo, metaNoVale } from '@/services/desafioVale/regras';

const RELEITURA_MS = 5 * 60 * 1000;
const RELEITURA_PIX_MS = 2 * 60 * 1000;

export const ehSinalDoDesafioVale = (tabela: string) => tabela.startsWith('desafio_vale');

/** Relê as chaves dadas quando o banco avisa que o desafio mudou. */
export function useSinalDoDesafioVale(ativo: boolean, chaves: readonly (readonly unknown[])[]) {
  const { empresa } = useEmpresa();
  const qc = useQueryClient();
  const empresaId = empresa?.id ?? null;
  const assinatura = JSON.stringify(chaves);
  useEffect(() => {
    if (!ativo || !empresaId) return;
    const lista = JSON.parse(assinatura) as unknown[][];
    const reler = () => { for (const queryKey of lista) void qc.invalidateQueries({ queryKey }); };
    return assinarSinal('desafios', empresaId, {
      onMudou: (s) => { if (!s.tabela || ehSinalDoDesafioVale(s.tabela)) reler(); },
      onReconectado: reler,
    });
  }, [ativo, empresaId, assinatura, qc]);
}

export function useDesafioVale(ativo: boolean) {
  const { perfil } = useAuth();
  const habilitado = ativo && !!perfil?.id;
  useSinalDoDesafioVale(habilitado, [['desafio-vale']]);
  return useQuery({
    queryKey: ['desafio-vale', perfil?.id ?? null],
    queryFn: buscarDesafioVale,
    enabled: habilitado,
    refetchInterval: RELEITURA_MS,
    refetchOnWindowFocus: false,
    staleTime: 4 * 60 * 1000,
    retry: 1,
  });
}

async function buscarMetaDoMes(empresaId: string, operadorId: string, mes: number, ano: number): Promise<number> {
  const { data, error } = await supabase.from('metas')
    .select('meta_valor')
    .eq('empresa_id', empresaId).eq('tipo', 'operador').eq('referencia_id', operadorId)
    .eq('mes', mes).eq('ano', ano)
    .limit(1);
  if (error) throw new Error(error.message);
  return Number((data as { meta_valor: number | string | null }[] | null)?.[0]?.meta_valor) || 0;
}

/** Quem a gaveta mostra: a pessoa e o setor dela (a real, ou a da visão de teste). */
export interface AlvoDoVale { id: string; setorId: string | null }

/** As 9 médias de uma pessoa. Só busca com a gaveta aberta. */
export function useMinhaMetaNoVale(d: DesafioVale | null | undefined, aberto: boolean, alvo: AlvoDoVale | null, hoje: string) {
  const { empresa } = useEmpresa();
  const qc = useQueryClient();
  const empresaId = empresa?.id ?? null;

  useEffect(() => {
    if (!aberto || !empresaId) return;
    const reler = () => { void qc.invalidateQueries({ queryKey: ['desafio-vale-minha'] }); };
    return assinarSinal('analitico', empresaId, { onMudou: reler, onReconectado: reler }, { minimoSoUpdateMs: 2 * 60 * 1000 });
  }, [aberto, empresaId, qc]);

  return useQuery({
    queryKey: ['desafio-vale-minha', alvo?.id ?? null, alvo?.setorId ?? null, empresaId, d?.inicio, d?.fim, d?.medias, hoje],
    enabled: aberto && !!alvo?.id && !!empresaId && !!d,
    refetchInterval: aberto ? RELEITURA_MS : false,
    refetchOnWindowFocus: false,
    staleTime: 4 * 60 * 1000,
    queryFn: async () => {
      const operadorId = alvo!.id;
      const [ano, mes] = d!.fim.split('-').map(Number);
      const [analitico, config, metaMensal] = await Promise.all([
        buscarAnaliticoPeriodo({ empresaId: empresaId!, de: d!.inicio, ate: d!.fim, operadorId, escopo: { tipo: 'operador', operadorId } }),
        getMetasConfig(empresaId!, mes, ano),
        buscarMetaDoMes(empresaId!, operadorId, mes, ano),
      ]);
      if (analitico.erro) throw new Error(analitico.erro);
      const { bruto } = somarPorDia(analitico.linhas, { tipo: 'operador', operadorId });
      const feriados = diasUteisDoSetor(config, alvo!.setorId, operadorId).feriados;
      return metaNoVale(d!, metaMensal, bruto, feriados, hoje);
    },
  });
}

/** Os Pix do período dos cupons de uma pessoa. */
export function useMeusCupons(d: DesafioVale | null | undefined, aberto: boolean, operadorId: string | null) {
  const { empresa } = useEmpresa();
  const ligado = !!d?.cupom_ativo && !!d.cupom_inicio && !!d.cupom_fim;
  return useQuery({
    queryKey: ['desafio-vale-cupons', operadorId, empresa?.id ?? null, d?.cupom_inicio, d?.cupom_fim, d?.cupom_pix],
    enabled: aberto && ligado && !!operadorId && !!empresa?.id,
    refetchInterval: aberto ? RELEITURA_PIX_MS : false,
    refetchOnWindowFocus: false,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const linhas = await buscarPixDoCupom({ empresaId: empresa!.id, inicio: d!.cupom_inicio!, fim: d!.cupom_fim!, operadorId: operadorId! });
      return { linhas, ...contarCupons(linhas, d!.cupom_pix) };
    },
  });
}

/**
 * O setor inteiro, para o líder: as 9 médias de cada um e os cupons de cada um.
 * Passado o fim, as pessoas vêm do retrato do mês (quem mudou de setor na
 * virada conta onde estava).
 */
export function useSetorNoVale(d: DesafioVale | null | undefined, setorId: string | null, aberto: boolean, hoje: string) {
  const { empresa } = useEmpresa();
  const qc = useQueryClient();
  const empresaId = empresa?.id ?? null;
  const habilitado = aberto && !!empresaId && !!setorId && !!d;

  useEffect(() => {
    if (!habilitado || !empresaId) return;
    const reler = () => { void qc.invalidateQueries({ queryKey: ['desafio-vale-setor'] }); };
    return assinarSinal('analitico', empresaId, { onMudou: reler, onReconectado: reler }, { minimoSoUpdateMs: 2 * 60 * 1000 });
  }, [habilitado, empresaId, qc]);

  return useQuery({
    queryKey: ['desafio-vale-setor', empresaId, setorId, d?.inicio, d?.fim, d?.medias, d?.cupom_inicio, d?.cupom_fim, d?.cupom_ativo, d?.cupom_pix, hoje],
    enabled: habilitado,
    refetchInterval: aberto ? RELEITURA_PIX_MS : false,
    refetchOnWindowFocus: false,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const dias = diasDoPeriodo(d!.inicio, d!.fim);
      const i = dias.indexOf(hoje);
      const iHoje = i >= 0 ? i : hoje < d!.inicio ? 0 : dias.length - 1;
      const comCupom = d!.cupom_ativo && !!d!.cupom_inicio && !!d!.cupom_fim;
      const [setor, pix] = await Promise.all([
        buscarSetorNoDesafio({
          empresaId: empresaId!, setorId: setorId!, hoje: iHoje,
          retrato: hoje > d!.fim ? d!.fim.slice(0, 7) : undefined,
          regras: { dias, regra_medias: d!.medias, regra_medias_maior: d!.medias },
        }),
        comCupom
          ? buscarPixDoCupom({ empresaId: empresaId!, inicio: d!.cupom_inicio!, fim: d!.cupom_fim!, setorId: setorId! })
          : Promise.resolve([]),
      ]);
      return { setor, cupons: cuponsPorOperador(pix, d!.cupom_pix), pix };
    },
  });
}

/**
 * O ranking do setor sem Pix (a Manutenção, 23/11/2026): os N que mais recebem
 * no período dos cupons. `setorId` só vale para quem vê todos os setores.
 */
export function useRankingDoVale(d: DesafioVale | null | undefined, setorId: string | null, aberto: boolean, ligado: boolean) {
  const { empresa } = useEmpresa();
  const qc = useQueryClient();
  const empresaId = empresa?.id ?? null;
  const habilitado = aberto && ligado && !!d && !!empresaId;

  useEffect(() => {
    if (!habilitado || !empresaId) return;
    const reler = () => { void qc.invalidateQueries({ queryKey: ['desafio-vale-ranking'] }); };
    return assinarSinal('analitico', empresaId, { onMudou: reler, onReconectado: reler }, { minimoSoUpdateMs: 2 * 60 * 1000 });
  }, [habilitado, empresaId, qc]);

  return useQuery({
    queryKey: ['desafio-vale-ranking', empresaId, setorId, d?.cupom_inicio, d?.cupom_fim],
    enabled: habilitado,
    refetchInterval: aberto ? RELEITURA_MS : false,
    refetchOnWindowFocus: false,
    staleTime: 4 * 60 * 1000,
    queryFn: () => buscarRankingVale(setorId),
  });
}

/**
 * O desafio com o % de cada setor pela PROJEÇÃO do mês (23/11/2026): o
 * banco guarda o realizado (o 59 ÷ a meta); aqui, com o calendário do setor
 * (`getMetasConfig` + `diasUteisDoSetor`, o mesmo do Painel), vira onde o
 * setor fecha no ritmo de hoje. Manual e fechamento confirmado não mudam.
 */
export function useProjecaoDoVale<T extends DesafioVale>(d: T | null | undefined, hoje: string): T | null | undefined {
  const { empresa } = useEmpresa();
  const [ano, mes] = (d?.fim ?? '').split('-').map(Number);
  const cfg = useQuery({
    queryKey: ['desafio-vale-config-mes', empresa?.id ?? null, ano, mes],
    enabled: !!d && !!empresa?.id && !!ano,
    staleTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: () => getMetasConfig(empresa!.id, mes, ano),
  });
  return useMemo(() => {
    if (!d || !cfg.data) return d;
    const fechado = !!d.fechado_em;
    const projetar = (s: SetorNoVale): SetorNoVale => {
      const r = diasUteisDoSetor(cfg.data, s.setor_id);
      return comProjecao(s, { feriados: r.feriados, contarDiaAtual: r.contarDiaAtual }, d.fim, hoje, fechado);
    };
    const comTodos = 'todos_setores' in d
      ? { todos_setores: (d as unknown as { todos_setores: SetorNoVale[] }).todos_setores.map(projetar) } : {};
    return {
      ...d,
      setores: d.setores ? d.setores.map(projetar) : d.setores,
      meu_setor: d.meu_setor ? projetar(d.meu_setor) : d.meu_setor,
      ...comTodos,
    };
  }, [d, cfg.data, hoje]);
}

/** A pessoa já leu a arte (fechou com «Bora pra cima»)? Só pergunta com o desafio liberado. */
export function useJaViArteVale(desafioId: string | null) {
  const { perfil } = useAuth();
  return useQuery({
    queryKey: ['desafio-vale-ja-vi', desafioId, perfil?.id ?? null],
    enabled: !!desafioId && !!perfil?.id,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: 1,
    queryFn: () => jaViArteVale(desafioId!),
  });
}

/** Quantos viram a arte, por setor (super_admin/gerência: todos; líder: o dele). */
export function useVistosVale(ativo: boolean) {
  return useQuery({
    queryKey: ['desafio-vale-vistos'],
    enabled: ativo,
    refetchInterval: ativo ? 60 * 1000 : false,
    refetchOnWindowFocus: false,
    staleTime: 30 * 1000,
    queryFn: buscarVistosVale,
  });
}

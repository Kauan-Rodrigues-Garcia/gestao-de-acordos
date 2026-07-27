/**
 * useMetaOperador — fonte única do progresso pessoal do operador no mês.
 *
 * Extraído do MetaProgressoHeader para ser reusado também pelos cards do
 * dashboard do operador, garantindo que header e cards NUNCA divirjam. Busca
 * meta do operador + config do mês (dias úteis/quartis/feriados) + ranking, e
 * deriva projeção, quartil, meta diária, esperado, diferença, posição no
 * ranking, recebido hoje e "recebido na baixa anterior".
 *
 * Toda a matemática vem de lib/diasUteis e do relatório analítico
 * (useAnaliticoDashboard) — recalcula em realtime quando um novo relatório chega.
 */

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import type { MetasConfigMes, AnaliticoDashboardLinha } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useAnaliticoDashboard } from '@/hooks/useAnaliticoDashboard';
import { useTenant } from '@/lib/tenant-config';
import { getTodayISO } from '@/lib/index';
import { getMetasConfig } from '@/services/metas/metasConfig.service';
import {
  buscarResumoOperadoresAnalitico,
  type ResumoOperadorAnalitico,
} from '@/services/analitico/analitico.service';
import type { QuartilConfig } from '@/lib/supabase';
import {
  diasUteisDoMes, diasUteisDecorridos, ehDiaUtil,
  quartilAtual, proximoQuartil,
} from '@/lib/diasUteis';

const DIAS_SEMANA_PT = [
  'Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira',
  'Quinta-feira', 'Sexta-feira', 'Sábado',
];

function pct(realizado: number, base: number): number {
  if (!base || base <= 0) return 0;
  return Math.min(Math.round((realizado / base) * 100), 999);
}

function isoParaData(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function dataParaISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtDataBR(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export interface BaixaAnterior {
  valor: number;
  qtd: number;
  /** Ex.: "Sexta-feira, Sábado, Domingo" */
  labelDias: string;
  /** Ex.: "16/07/2026 a 18/07/2026" (ou uma só data) */
  periodo: string;
  /** ISOs cobertos (para debug/teste). */
  dias: string[];
}

/**
 * Dias da "baixa anterior": do último dia útil antes de hoje até ontem
 * (inclusive). Numa segunda: sexta, sábado, domingo. Numa quarta: terça.
 * Feriados NÃO quebram a janela — se ontem foi feriado, ele entra na baixa
 * mesmo assim (recebimento pode ter caído nele); o que define o início é o
 * último dia ÚTIL não-feriado anterior.
 */
export function diasBaixaAnterior(hojeISO: string, feriados: string[] = []): string[] {
  const fSet = new Set(feriados);
  const hoje = isoParaData(hojeISO);

  // Início = último dia útil (seg–sex, não-feriado) estritamente antes de hoje
  const inicio = new Date(hoje);
  do {
    inicio.setDate(inicio.getDate() - 1);
  } while (!(ehDiaUtil(dataParaISO(inicio)) && !fSet.has(dataParaISO(inicio))));

  const inicioISO = dataParaISO(inicio);
  const ontem = new Date(hoje);
  ontem.setDate(ontem.getDate() - 1);

  const dias: string[] = [];
  const cursor = new Date(inicio);
  while (dataParaISO(cursor) <= dataParaISO(ontem)) {
    dias.push(dataParaISO(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dias.length ? dias : [inicioISO];
}

export interface MetaOperador {
  ativo: boolean;
  carregado: boolean;
  dbAtiva: boolean;
  temMeta: boolean;

  metaValor: number | null;
  metasExtras: number[];
  config: MetasConfigMes | null;

  recebidoMes: number;
  recebidoHoje: number;
  baixaAnterior: BaixaAnterior;
  recebidoPorDia: { dia: number; valor: number }[];

  percMeta: number;
  metaDiaria: number;
  diasUteisTotais: number;
  diasUteisDecorridos: number;
  esperadoAteHoje: number;
  diferenca: number;
  projecaoPct: number;
  quartil: QuartilConfig | null;
  proximoQuartilCfg: QuartilConfig | null;
  paraSubirQuartil: number | null;

  metasBatidas: number;
  proximaMeta: number | null;
  totalMetas: number;

  posicaoRanking: number | null;
  acimaNome: string | null;
  gapParaAcima: number;
}

export function useMetaOperador(): MetaOperador {
  const { perfil }  = useAuth();
  const { empresa } = useEmpresa();
  const tenant = useTenant();
  const ativo = tenant.isPaguePlay || tenant.slug === 'bookplay';

  const hoje = new Date();
  const mes = hoje.getMonth() + 1;
  const ano = hoje.getFullYear();
  const mesStr = `${ano}-${String(mes).padStart(2, '0')}`;

  const [metaValor, setMetaValor] = useState<number | null>(null);
  const [metasExtras, setMetasExtras] = useState<number[]>([]);
  const [config, setConfig]       = useState<MetasConfigMes | null>(null);
  const [ranking, setRanking]     = useState<ResumoOperadorAnalitico[]>([]);
  const [treinoInicio, setTreinoInicio] = useState<string | null>(null);
  const [carregado, setCarregado] = useState(false);

  const analitico = useAnaliticoDashboard(ativo);

  // Meta do operador + config do mês
  useEffect(() => {
    let cancelado = false;
    async function carregar() {
      if (!ativo || !perfil?.id || !empresa?.id) { setCarregado(true); return; }
      try {
        const [{ data: metaRow }, cfg] = await Promise.all([
          supabase.from('metas').select('*')
            .eq('tipo', 'operador').eq('referencia_id', perfil.id)
            .eq('empresa_id', empresa.id).eq('mes', mes).eq('ano', ano)
            .maybeSingle(),
          getMetasConfig(empresa.id, mes, ano),
        ]);
        if (cancelado) return;
        const row = metaRow as { meta_valor: number; metas_extras?: number[] } | null;
        setMetaValor(row ? Number(row.meta_valor) || null : null);
        setMetasExtras(
          (Array.isArray(row?.metas_extras) ? row.metas_extras : [])
            .map(e => Number(e) || 0).filter(e => e > 0)
            .sort((a, b) => a - b),
        );
        setConfig(cfg.data);
      } catch {
        /* sem meta/config → dashboard cai no fallback */
      } finally {
        if (!cancelado) setCarregado(true);
      }
    }
    void carregar();
    return () => { cancelado = true; };
  }, [ativo, perfil?.id, empresa?.id, mes, ano]);

  // Ranking (mesma regra do MetaProgressoHeader — isolamento por equipe)
  useEffect(() => {
    let cancelado = false;
    async function carregar() {
      if (!ativo || !empresa?.id || metaValor == null) return;
      try {
        const { data } = await buscarResumoOperadoresAnalitico(empresa.id, mesStr);
        let lista = data;
        const cargo = String(perfil?.perfil ?? '').toLowerCase();
        const podeLerGrupo = cargo === 'lider' || cargo === 'administrador' || cargo === 'super_admin';
        const filtroCol: 'equipe_id' | 'setor_id' | null =
          perfil?.equipe_id ? 'equipe_id' : perfil?.setor_id ? 'setor_id' : null;
        const filtroVal = perfil?.equipe_id ?? perfil?.setor_id ?? null;
        if (podeLerGrupo && filtroCol && filtroVal) {
          const { data: doGrupo } = await supabase
            .from('perfis').select('id')
            .eq('empresa_id', empresa.id).eq(filtroCol, filtroVal);
          const ids = new Set(((doGrupo ?? []) as { id: string }[]).map(r => r.id));
          if (ids.size > 1) lista = data.filter(r => ids.has(r.operador_id));
        }
        if (!cancelado) setRanking(lista);
      } catch { /* ranking indisponível */ }
    }
    void carregar();
    return () => { cancelado = true; };
  }, [ativo, empresa?.id, mesStr, metaValor, analitico.linhas,
      perfil?.equipe_id, perfil?.setor_id, perfil?.perfil]);

  // Equipe de treinamento → dias úteis a partir do início
  useEffect(() => {
    let cancelado = false;
    void (async () => {
      if (!perfil?.equipe_id) { setTreinoInicio(null); return; }
      const { data, error } = await supabase.from('equipes')
        .select('treinamento, treinamento_inicio').eq('id', perfil.equipe_id).maybeSingle();
      if (cancelado || error || !data) return;
      const row = data as { treinamento: boolean | null; treinamento_inicio: string | null };
      setTreinoInicio(row.treinamento ? (row.treinamento_inicio ?? null) : null);
    })();
    return () => { cancelado = true; };
  }, [perfil?.equipe_id]);

  // Linhas do próprio operador (a RPC já escopa; filtro extra por segurança)
  const linhasSelf = useMemo<AnaliticoDashboardLinha[]>(() => {
    if (!perfil?.id) return [];
    return analitico.linhas.filter(l => l.operador_id === perfil.id);
  }, [analitico.linhas, perfil?.id]);

  const recebidoMes = useMemo(
    () => (perfil?.id ? analitico.total.porOperador[perfil.id]?.bruto ?? 0 : 0),
    [analitico.total, perfil?.id],
  );

  const recebidoHoje = useMemo(() => {
    const hojeISO = getTodayISO();
    return linhasSelf
      .filter(l => l.dia === hojeISO)
      .reduce((s, l) => s + (Number(l.total) || 0), 0);
  }, [linhasSelf]);

  const baixaAnterior = useMemo<BaixaAnterior>(() => {
    const dias = diasBaixaAnterior(getTodayISO(), config?.feriados ?? []);
    const set = new Set(dias);
    let valor = 0, qtd = 0;
    for (const l of linhasSelf) {
      if (set.has(l.dia)) { valor += Number(l.total) || 0; qtd += Number(l.qtd) || 0; }
    }
    const nomes = [...new Set(dias.map(d => DIAS_SEMANA_PT[isoParaData(d).getDay()]))];
    const periodo = dias.length === 1
      ? fmtDataBR(dias[0])
      : `${fmtDataBR(dias[0])} a ${fmtDataBR(dias[dias.length - 1])}`;
    return { valor, qtd, labelDias: nomes.join(', '), periodo, dias };
  }, [linhasSelf, config?.feriados]);

  // Recebido por dia do mês (para o gráfico "Sua Evolução Diária")
  const recebidoPorDia = useMemo<{ dia: number; valor: number }[]>(() => {
    const diasNoMes = new Date(ano, mes, 0).getDate();
    const arr = Array.from({ length: diasNoMes }, (_, i) => ({ dia: i + 1, valor: 0 }));
    for (const l of linhasSelf) {
      const d = Number(l.dia.slice(8, 10));
      if (d >= 1 && d <= diasNoMes) arr[d - 1].valor += Number(l.total) || 0;
    }
    return arr;
  }, [linhasSelf, ano, mes]);

  // Projeção / quartil / meta diária (idêntico ao MetaProgressoHeader)
  const derivado = useMemo(() => {
    if (!perfil?.id || metaValor == null || metaValor <= 0 || !config) return null;

    const inicioTreino = treinoInicio ?? undefined;
    const totalUteis = diasUteisDoMes(ano, mes, config.feriados, inicioTreino);
    if (totalUteis === 0) return null;
    const decorridos = diasUteisDecorridos(
      ano, mes, config.feriados, getTodayISO(), inicioTreino, config.contar_dia_atual === true,
    );
    const metaDiaria = metaValor / totalUteis;
    const esperado   = metaDiaria * Math.max(decorridos, 1);
    const projecao   = pct(recebidoMes, esperado);
    const quartil    = quartilAtual(projecao, config.quartis);
    const proximo    = proximoQuartil(quartil, config.quartis);
    const paraSubir  = proximo ? Math.max(0, (esperado * proximo.min_pct) / 100 - recebidoMes) : null;

    const todasMetas   = [metaValor, ...metasExtras];
    const idxNaoBatida = todasMetas.findIndex(m => recebidoMes < m);
    const metasBatidas = idxNaoBatida === -1 ? todasMetas.length : idxNaoBatida;
    const proximaMeta  = idxNaoBatida > 0 ? todasMetas[idxNaoBatida] : null;

    const idx   = ranking.findIndex(r => r.operador_id === perfil.id);
    const acima = idx > 0 ? ranking[idx - 1] : null;
    const gap   = acima ? Math.max(0, acima.total_recebido - recebidoMes) : 0;

    return {
      percMeta: pct(recebidoMes, metaValor),
      metaDiaria, totalUteis, decorridos, esperado,
      diferenca: recebidoMes - esperado,
      projecao, quartil, proximo, paraSubir,
      metasBatidas, proximaMeta, totalMetas: todasMetas.length,
      posicao: idx >= 0 ? idx + 1 : null,
      acimaNome: acima ? (acima.operador_nome ?? acima.operador_usuario) : null,
      gap,
    };
  }, [perfil?.id, metaValor, metasExtras, config, recebidoMes, ranking, ano, mes, treinoInicio]);

  return {
    ativo,
    carregado,
    dbAtiva: analitico.dbAtiva,
    temMeta: !!derivado,
    metaValor,
    metasExtras,
    config,
    recebidoMes,
    recebidoHoje,
    baixaAnterior,
    recebidoPorDia,
    percMeta: derivado?.percMeta ?? 0,
    metaDiaria: derivado?.metaDiaria ?? 0,
    diasUteisTotais: derivado?.totalUteis ?? 0,
    diasUteisDecorridos: derivado?.decorridos ?? 0,
    esperadoAteHoje: derivado?.esperado ?? 0,
    diferenca: derivado?.diferenca ?? 0,
    projecaoPct: derivado?.projecao ?? 0,
    quartil: derivado?.quartil ?? null,
    proximoQuartilCfg: derivado?.proximo ?? null,
    paraSubirQuartil: derivado?.paraSubir ?? null,
    metasBatidas: derivado?.metasBatidas ?? 0,
    proximaMeta: derivado?.proximaMeta ?? null,
    totalMetas: derivado?.totalMetas ?? 0,
    posicaoRanking: derivado?.posicao ?? null,
    acimaNome: derivado?.acimaNome ?? null,
    gapParaAcima: derivado?.gap ?? 0,
  };
}

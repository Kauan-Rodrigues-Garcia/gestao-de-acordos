/**
 * useRhGestao — tudo o que a tela do RH Gestão precisa, resolvido num lugar só.
 *
 * ## O que este hook decide, e o que ele NÃO decide
 *
 * Ele junta as peças (competências, lançamentos, crachás, configuração) e
 * resolve o percentual vivo. Ele **não** decide quem vê o quê: isso é da RLS,
 * que já entrega recortado — o líder recebe as equipes que lidera, a gerência o
 * setor, o RH a empresa. Filtrar de novo aqui criaria uma segunda régua para
 * divergir da primeira.
 *
 * ## O percentual: vivo antes de concluir, congelado depois
 *
 * Enquanto a equipe não foi concluída, a tela mostra o percentual CALCULADO
 * agora, com `calcularPercentualRh` — que por sua vez chama a mesma
 * `calcularProjecao` da aba Quartis. Depois de concluída, mostra o SNAPSHOT
 * gravado no lançamento.
 *
 * É o que cumpre as duas exigências ao mesmo tempo: não existe segundo cálculo
 * de «181%» no projeto, e o histórico não muda quando a meta de setembro for
 * corrigida em outubro.
 *
 * ## Bruto, e não H.O. — e por que dá no mesmo
 *
 * O percentual é `recebido ÷ esperado`, e `esperado` sai da meta. Desde a
 * migration `20260818280000`, `analitico_recebimentos.total_ho` é exatamente
 * 24,96% de `valor_recebido`, a mesma constante que `metaNaUnidade` aplica à
 * meta. Converter os dois lados multiplica e divide pelo mesmo número: a razão
 * não muda. Na BookPlay, `total_ho` é zero e só o bruto existe.
 *
 * Então o hook usa sempre o bruto. Não é uma escolha de unidade — é a única que
 * responde certo nas duas operações.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { MetasConfigMes } from '@/lib/supabase';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { niveisLiberados } from '@/lib/permissoes-escopo';
import { reconciliarLista, reconciliarItem, iguaisProfundo } from '@/lib/dadosVivos';
import { assinarTabela } from '@/lib/realtime';
import { getTodayISO } from '@/lib/index';
import { mesAtual, deslocarMes, normalizarMes, partesDoMes } from '@/lib/mesReferencia';
import { getMetasConfig } from '@/services/metas/metasConfig.service';
import { buscarResumoOperadoresAnalitico } from '@/services/analitico/analitico.service';
import { calcularPercentualRh, type PercentualRh } from '@/services/rh/rhPercentual';
import {
  listarCelulas, listarConfigSetores, listarFechamentos, listarLancamentos,
  listarCrachas,
  type RhCelulaRow, type RhConfigSetorRow, type RhFechamentoRow, type RhLancamento,
} from '@/services/rh/rhGestao.service';

export interface PermissoesRh {
  /** A aba está aberta e há ao menos um nível de alcance. */
  podeVer: boolean;
  /** Alcança as equipes que lidera. */
  escopoEquipe: boolean;
  /** Alcança o próprio setor — a visão da gerência. */
  escopoSetor: boolean;
  /** Alcança a empresa — a visão do RH. */
  escopoTodos: boolean;
  podePreencher: boolean;
  podeValidar: boolean;
  podeEnviar: boolean;
  podeAprovar: boolean;
  podeDevolver: boolean;
  podeGerenciarFechamento: boolean;
  podeReabrir: boolean;
  podeConfigurar: boolean;
  podeEditarCracha: boolean;
}

export interface EstadoRhGestao {
  carregando: boolean;
  /** Releitura em andamento com a tela cheia — sinal discreto, não esqueleto. */
  atualizando: boolean;
  permissoes: PermissoesRh;

  celulas: RhCelulaRow[];
  configSetores: RhConfigSetorRow[];
  fechamentos: RhFechamentoRow[];
  /** A competência em foco. `null` quando ainda não há nenhuma aberta. */
  fechamento: RhFechamentoRow | null;
  lancamentos: RhLancamento[];
  /** `operador_id` → crachá. Só o que o escopo permite ver. */
  crachas: Record<string, string | null>;

  /** `operador_id` → percentual calculado AGORA, para o mês de apuração. */
  percentuais: Record<string, PercentualRh>;

  selecionarFechamento: (id: string) => void;
  recarregar: () => Promise<void>;
}

/** Um lançamento com o percentual já resolvido — vivo ou congelado. */
export interface LancamentoComPercentual extends RhLancamento {
  /** O que a tela mostra: snapshot quando existe, cálculo vivo quando não. */
  percentualExibido: number | null;
  /** `true` quando o número exibido é a fotografia gravada. */
  percentualCongelado: boolean;
}

export function useRhGestao(): EstadoRhGestao {
  const { empresa } = useEmpresa();
  const { temPermissao, temPermissaoExplicita, loading: permLoading } = useCargoPermissoes();

  const empresaId = empresa?.id ?? null;

  const niveis = useMemo(() => niveisLiberados('rh', temPermissao), [temPermissao]);

  const permissoes = useMemo<PermissoesRh>(() => ({
    podeVer:        niveis.length > 0,
    escopoEquipe:   niveis.includes('equipe'),
    escopoSetor:    niveis.includes('setor'),
    escopoTodos:    niveis.includes('todos_setores'),
    podePreencher:  temPermissao('rh_preencher'),
    podeValidar:    temPermissao('rh_validar'),
    podeEnviar:     temPermissao('rh_enviar'),
    podeAprovar:    temPermissao('rh_aprovar'),
    podeDevolver:   temPermissao('rh_devolver'),
    podeGerenciarFechamento: temPermissao('rh_gerenciar_fechamento'),
    // Explícita: reabrir competência finalizada desfaz uma folha já paga, e o
    // acesso total do administrador não concede isso sozinho.
    podeReabrir:    temPermissaoExplicita('rh_reabrir_fechamento'),
    podeConfigurar: temPermissao('rh_configurar'),
    podeEditarCracha: temPermissao('rh_editar_cracha'),
  }), [niveis, temPermissao, temPermissaoExplicita]);

  const [celulas, setCelulas]           = useState<RhCelulaRow[]>([]);
  const [configSetores, setConfig]      = useState<RhConfigSetorRow[]>([]);
  const [fechamentos, setFechamentos]   = useState<RhFechamentoRow[]>([]);
  const [fechamentoId, setFechamentoId] = useState<string | null>(null);
  const [lancamentos, setLancamentos]   = useState<RhLancamento[]>([]);
  const [crachas, setCrachas]           = useState<Record<string, string | null>>({});
  const [carregando, setCarregando]     = useState(true);
  const [atualizando, setAtualizando]   = useState(false);

  // Peças do percentual, do mês de APURAÇÃO da competência em foco.
  const [metasOp, setMetasOp]       = useState<Record<string, number>>({});
  const [recebidoOp, setRecebidoOp] = useState<Record<string, number>>({});
  const [configMes, setConfigMes]   = useState<MetasConfigMes | null>(null);
  const [inicioEquipe, setInicioEquipe] = useState<Record<string, string | null>>({});

  const primeiraCarga = useRef(true);
  const vivo = useRef(true);
  useEffect(() => {
    vivo.current = true;
    return () => { vivo.current = false; };
  }, []);

  const fechamento = useMemo(
    () => fechamentos.find(f => f.id === fechamentoId) ?? null,
    [fechamentos, fechamentoId],
  );

  // ── Carga da moldura (competências e configuração) ────────────────────────
  const carregarMoldura = useCallback(async () => {
    if (!empresaId || !permissoes.podeVer) return;
    const [cel, cfg, fechs, crc] = await Promise.all([
      listarCelulas(empresaId),
      listarConfigSetores(empresaId),
      listarFechamentos(empresaId),
      listarCrachas(empresaId),
    ]);
    if (!vivo.current) return;

    setCelulas(a => reconciliarLista(a, cel, { chave: c => c.id }));
    setConfig(a => reconciliarLista(a, cfg, { chave: c => c.id, iguais: iguaisProfundo }));
    setFechamentos(a => reconciliarLista(a, fechs, { chave: f => f.id, iguais: iguaisProfundo }));

    const mapa: Record<string, string | null> = {};
    for (const c of crc) mapa[c.operador_id] = c.cracha;
    setCrachas(a => (iguaisProfundo(a, mapa) ? a : mapa));

    // Sem competência escolhida, abre a mais recente. É o que a pessoa quer ver
    // em 99% das visitas, e escolher à mão todo dia seria trabalho sem função.
    setFechamentoId(atual => atual && fechs.some(f => f.id === atual)
      ? atual
      : (fechs[0]?.id ?? null));
  }, [empresaId, permissoes.podeVer]);

  // ── Carga dos lançamentos da competência em foco ──────────────────────────
  const carregarLancamentos = useCallback(async () => {
    if (!fechamentoId) { setLancamentos([]); return; }
    const lista = await listarLancamentos(fechamentoId);
    if (!vivo.current) return;
    setLancamentos(a => reconciliarLista(a, lista, {
      chave: l => l.id, iguais: iguaisProfundo,
    }));
  }, [fechamentoId]);

  // ── Peças do percentual ───────────────────────────────────────────────────
  const mesApuracao = useMemo(() => {
    if (!fechamento) return null;
    // A coluna é DATE (`yyyy-MM-dd`); o resto do projeto fala `yyyy-MM`.
    return normalizarMes(String(fechamento.mes_apuracao).slice(0, 7));
  }, [fechamento]);

  const carregarPecasDoPercentual = useCallback(async () => {
    if (!empresaId || !mesApuracao) return;
    const { ano, mes } = partesDoMes(mesApuracao);

    const [metasRes, cfgRes, resumoRes, equipesRes] = await Promise.all([
      supabase.from('metas')
        .select('referencia_id, meta_valor')
        .eq('empresa_id', empresaId).eq('tipo', 'operador')
        .eq('mes', mes).eq('ano', ano),
      getMetasConfig(empresaId, mes, ano),
      buscarResumoOperadoresAnalitico(empresaId, mesApuracao),
      supabase.from('equipes')
        .select('id, treinamento, treinamento_inicio')
        .eq('empresa_id', empresaId),
    ]);
    if (!vivo.current) return;

    const metas: Record<string, number> = {};
    for (const m of (metasRes.data ?? []) as { referencia_id: string; meta_valor: number }[]) {
      metas[m.referencia_id] = Number(m.meta_valor) || 0;
    }
    setMetasOp(a => (iguaisProfundo(a, metas) ? a : metas));

    setConfigMes(a => reconciliarItem(a, cfgRes.data, iguaisProfundo));

    // BRUTO, e não H.O. — ver o cabeçalho do arquivo.
    const receb: Record<string, number> = {};
    for (const r of resumoRes.data) receb[r.operador_id] = Number(r.total_recebido) || 0;
    setRecebidoOp(a => (iguaisProfundo(a, receb) ? a : receb));

    const inicio: Record<string, string | null> = {};
    for (const e of (equipesRes.data ?? []) as
         { id: string; treinamento: boolean; treinamento_inicio: string | null }[]) {
      inicio[e.id] = e.treinamento ? e.treinamento_inicio : null;
    }
    setInicioEquipe(a => (iguaisProfundo(a, inicio) ? a : inicio));
  }, [empresaId, mesApuracao]);

  const recarregar = useCallback(async () => {
    const comEsqueleto = primeiraCarga.current;
    if (comEsqueleto) setCarregando(true);
    else setAtualizando(true);
    try {
      await carregarMoldura();
      await Promise.all([carregarLancamentos(), carregarPecasDoPercentual()]);
    } finally {
      if (vivo.current) {
        if (comEsqueleto) setCarregando(false);
        setAtualizando(false);
        primeiraCarga.current = false;
      }
    }
  }, [carregarMoldura, carregarLancamentos, carregarPecasDoPercentual]);

  // Moldura primeiro, e só uma vez por empresa.
  useEffect(() => {
    if (!empresaId || permLoading) return;
    if (!permissoes.podeVer) { setCarregando(false); return; }
    void recarregar();
    // `recarregar` embute as três cargas e muda quando a competência muda.
  }, [empresaId, permLoading, permissoes.podeVer, recarregar]);

  // Trocar de empresa é contexto novo: volta a merecer esqueleto.
  useEffect(() => { primeiraCarga.current = true; }, [empresaId]);

  /*
   * Tempo real: o líder preenche, a gerência valida e o RH decide ao mesmo
   * tempo. Sem isto, o RH aprovaria em cima de uma tela de cinco minutos atrás
   * — e as RPCs recusariam, com uma mensagem que ele não esperava.
   *
   * A releitura é silenciosa e reconciliada: só a linha que mudou é trocada.
   */
  useEffect(() => {
    if (!empresaId || !permissoes.podeVer) return;
    return assinarTabela(
      {
        topico: `rt-rh-${empresaId}`,
        escutas: [
          { tabela: 'rh_lancamentos', filtro: `empresa_id=eq.${empresaId}` },
          { tabela: 'rh_fechamentos', filtro: `empresa_id=eq.${empresaId}` },
        ],
      },
      {
        onEvento:      () => { void carregarLancamentos(); void carregarMoldura(); },
        onReconectado: () => { void recarregar(); },
      },
    );
  }, [empresaId, permissoes.podeVer, carregarLancamentos, carregarMoldura, recarregar]);

  // ── O percentual vivo ─────────────────────────────────────────────────────
  const percentuais = useMemo(() => {
    const saida: Record<string, PercentualRh> = {};
    if (!mesApuracao) return saida;

    const hoje = getTodayISO();
    for (const l of lancamentos) {
      const inicio = l.equipe_id_snapshot ? inicioEquipe[l.equipe_id_snapshot] : null;
      saida[l.operador_id] = calcularPercentualRh({
        mesApuracao,
        meta: metasOp[l.operador_id] ?? null,
        recebido: recebidoOp[l.operador_id] ?? 0,
        configMes,
        hojeISO: hoje,
        inicioEquipeISO: inicio,
      });
    }
    return saida;
  }, [lancamentos, mesApuracao, metasOp, recebidoOp, configMes, inicioEquipe]);

  const selecionarFechamento = useCallback((id: string) => {
    setFechamentoId(id);
  }, []);

  return {
    carregando: carregando || permLoading,
    atualizando,
    permissoes,
    celulas, configSetores, fechamentos, fechamento, lancamentos, crachas,
    percentuais,
    selecionarFechamento,
    recarregar,
  };
}

/**
 * O percentual que a linha mostra: o congelado quando existe, o vivo quando não.
 *
 * A troca acontece na CONCLUSÃO da equipe, e não na aprovação: é ali que a
 * fotografia é tirada, e é ela que a gerência e o RH conferem depois. Continuar
 * mostrando o número vivo faria a percentagem mudar por baixo de quem está
 * decidindo — inclusive depois de o mês virar.
 */
export function comPercentual(
  l: RhLancamento, percentuais: Record<string, PercentualRh>,
): LancamentoComPercentual {
  if (l.percentual_snapshot != null) {
    return { ...l, percentualExibido: Number(l.percentual_snapshot), percentualCongelado: true };
  }
  return {
    ...l,
    percentualExibido: percentuais[l.operador_id]?.percentual ?? null,
    percentualCongelado: false,
  };
}

/** A competência que o RH abriria agora: o mês corrente. */
export function competenciaSugerida(): string {
  return mesAtual();
}

/** O mês de apuração que combina com uma competência: o anterior. */
export function apuracaoSugerida(competencia: string): string {
  return deslocarMes(competencia, -1);
}

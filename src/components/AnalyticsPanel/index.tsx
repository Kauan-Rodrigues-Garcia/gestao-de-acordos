/**
 * AnalyticsPanel — v4 (Premium Redesign)
 * Substituição do PieChart de status pelo "Anel com Breakdown":
 *   • Anel central: % da meta de valor atingida (ou % dos acordos pagos se sem meta)
 *   • Ao expandir (clicar "Ver Breakdown"): mostra % por forma de pagamento
 */

import { useState, useMemo, useEffect } from 'react';
import { useAxisColors } from '@/hooks/useChartColors';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart2, TrendingUp, DollarSign, Calendar,
  ChevronDown, ChevronUp, RefreshCw, XCircle,
  Clock, Award, Percent, Target,
} from 'lucide-react';
import { useAnalytics } from '@/hooks/useAnalytics';
import { useAnaliticoDashboard, agregarAnalitico } from '@/hooks/useAnaliticoDashboard';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { supabase } from '@/lib/supabase';
import {
  formatCurrency, TIPO_LABELS, TIPO_LABELS_PAGUEPLAY, PP_HO_PERCENTUAL,
} from '@/lib/index';
import { useTenant } from '@/lib/tenant-config';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { MESES, MEDAL_STYLES, containerVariants, itemVariants } from './constants';
import { SkeletonCard, MetricCard, MiniSparkline } from './SubComponents';
import { PPMetrics } from './PPMetrics';
import { ChartsSection } from './ChartsSection';
import { CHART_RECEBIDO } from './constants';

// ─────────────────────────────────────────────────────────────────────────────

interface AnalyticsPanelProps {
  setorFiltro?: string | null;
  equipeFiltroExterno?: string | null;
  operadorFiltroExterno?: string | null;
  temLogicaDiretoExtra?: boolean;
}

export function AnalyticsPanel({
  setorFiltro: setorExterno,
  equipeFiltroExterno,
  operadorFiltroExterno,
  temLogicaDiretoExtra = false,
}: AnalyticsPanelProps = {}) {
  const { tickColor, gridColor } = useAxisColors();
  const { temPermissao } = useCargoPermissoes();
  const tenant = useTenant();
  const isPP = tenant.isPaguePlay;
  const mostraAgendadoRestante = tenant.slug === 'pagueplay' || tenant.slug === 'bookplay';
  const alwaysOpen = !isPP;
  const [open, setOpen] = useState(() => !isPP);

  const {
    valorRecebidoMes,
    valorAgendadoMes,
    valorNaoPago,
    valorAgendadoHoje,
    valorAgendadoRestanteMes,
    totalAgendadoRestanteMes,
    valorHOMes,
    valorHOAgendado,
    totalAcordosMes,
    totalPagosMes,
    totalNaoPagos,
    totalPendentes,
    meta,
    percMeta,
    porDia,
    porOperador,
    acordosMes,
    loading,
    refetch,
    setSetorFiltro,
    setEquipeFiltro,
    setOperadorFiltro,
  } = useAnalytics();

  const { valorRecebidoDireto, valorRecebidoExtra, valorHODireto, valorHOExtra, qtdDireto, qtdExtra } = useMemo(() => {
    if (!isPP) {
      return { valorRecebidoDireto: 0, valorRecebidoExtra: 0, valorHODireto: 0, valorHOExtra: 0, qtdDireto: 0, qtdExtra: 0 };
    }
    const pagos = (acordosMes ?? []).filter(a => a.status === 'pago');
    const direto = pagos.filter(a => a.tipo_vinculo !== 'extra');
    const extra  = pagos.filter(a => a.tipo_vinculo === 'extra');
    const vDireto = direto.reduce((s, a) => s + (Number(a.valor) || 0), 0);
    const vExtra  = extra.reduce((s, a) => s + (Number(a.valor) || 0), 0);
    return {
      valorRecebidoDireto: vDireto,
      valorRecebidoExtra:  vExtra,
      valorHODireto:  vDireto * PP_HO_PERCENTUAL,
      valorHOExtra:   vExtra  * PP_HO_PERCENTUAL,
      qtdDireto: direto.length,
      qtdExtra:  extra.length,
    };
  }, [acordosMes, isPP]);

  // ── Recebimento via relatório ANALÍTICO (fonte certeira — PP) ──────────────
  // O recebido no mês, o gráfico por dia, Pix/Cartão e a % da meta passam a
  // vir do analitico_recebimentos. Se a migration ainda não foi aplicada
  // (dbAtiva=false), tudo cai no comportamento antigo (tabulação).
  const analiticoDash = useAnaliticoDashboard(isPP);

  // Escopo dos filtros ativos (operador/equipe/setor) aplicado ao analítico.
  // Para o operador a RPC já devolve só as próprias linhas.
  const [opsEscopo, setOpsEscopo] = useState<Set<string> | string | null>(null);
  useEffect(() => {
    let cancelado = false;
    async function resolver() {
      if (!isPP) { setOpsEscopo(null); return; }
      if (operadorFiltroExterno) { setOpsEscopo(operadorFiltroExterno); return; }
      const eq = equipeFiltroExterno ?? null;
      const st = setorExterno ?? null;
      if (!eq && !st) { setOpsEscopo(null); return; }
      let q = supabase.from('perfis').select('id');
      q = eq ? q.eq('equipe_id', eq) : q.eq('setor_id', st!);
      const { data } = await q;
      if (!cancelado) setOpsEscopo(new Set(((data ?? []) as { id: string }[]).map(r => r.id)));
    }
    void resolver();
    return () => { cancelado = true; };
  }, [isPP, operadorFiltroExterno, equipeFiltroExterno, setorExterno]);

  const anal = useMemo(
    () => agregarAnalitico(analiticoDash.linhas, opsEscopo),
    [analiticoDash.linhas, opsEscopo],
  );
  const usarAnalitico = isPP && analiticoDash.dbAtiva;

  // % da meta: bruto do analítico × meta total (PP). Fallback: tabulação.
  const percMetaAnalitico = meta && meta.meta_valor > 0
    ? Math.min(Math.round((anal.bruto / meta.meta_valor) * 100), 999)
    : 0;
  const percMetaFinal = usarAnalitico && meta ? percMetaAnalitico : percMeta;

  const valorPrincipal  = isPP
    ? (usarAnalitico ? anal.ho : (temLogicaDiretoExtra ? valorHOMes : valorHODireto))
    : valorRecebidoMes;
  const porDiaChart = isPP
    ? porDia.map(d => ({
        ...d,
        recebido: usarAnalitico ? (anal.porDia[Number(d.dia)]?.ho ?? 0) : d.ho,
      }))
    : porDia;

  useEffect(() => {
    if (setorExterno !== undefined) setSetorFiltro(setorExterno ?? null);
  }, [setorExterno]);

  useEffect(() => {
    if (equipeFiltroExterno !== undefined) setEquipeFiltro(equipeFiltroExterno ?? null);
  }, [equipeFiltroExterno]);

  useEffect(() => {
    if (operadorFiltroExterno !== undefined) setOperadorFiltro(operadorFiltroExterno ?? null);
  }, [operadorFiltroExterno]);

  const isAdmin = temPermissao('ver_analiticos_global');
  // Visão de líder (métricas/KPIs do setor) exige ver_painel_lider E
  // ver_analiticos_setor. Padrão = true (espelha o acesso atual); desligar
  // ver_analiticos_setor reduz o usuário à visão individual.
  const isLider = temPermissao('ver_painel_lider') && temPermissao('ver_analiticos_setor');

  const { mes, ano } = useMemo(() => {
    const d = new Date();
    return { mes: d.getMonth() + 1, ano: d.getFullYear() };
  }, []);

  const porTipo = useMemo(() => {
    if (!acordosMes?.length) return [];
    const tipoLabels = isPP ? TIPO_LABELS_PAGUEPLAY : TIPO_LABELS;
    const map: Record<string, { label: string; acordos: number; valor: number }> = {};
    for (const a of acordosMes) {
      const tipo = (a as any).tipo as string;
      if (!tipo) continue;
      let key = tipo;
      let label: string;
      if (isPP && (tipo === 'boleto' || tipo === 'pix')) {
        key = 'boleto_pix';
        label = 'Boleto/PIX';
      } else if (isPP && tipo === 'cartao') {
        key = 'cartao';
        label = 'Cartão de Crédito';
      } else {
        label = tipoLabels[tipo] ?? tipo;
      }
      if (!map[key]) map[key] = { label, acordos: 0, valor: 0 };
      map[key].acordos++;
      map[key].valor += Number((a as any).valor) || 0;
    }
    const total = acordosMes.length || 1;
    return Object.values(map)
      .map(item => ({
        label: item.label,
        acordos: item.acordos,
        valor: item.valor,
        perc: Math.round((item.acordos / total) * 100),
      }))
      .sort((a, b) => b.acordos - a.acordos);
  }, [acordosMes, isPP]);

  const taxaConversao = totalAcordosMes > 0
    ? Math.round((totalPagosMes / totalAcordosMes) * 100)
    : 0;

  const ticketMedio = totalPagosMes > 0
    ? valorRecebidoMes / totalPagosMes
    : 0;

  const projecaoMes = useMemo(() => {
    const diaAtual = new Date().getDate();
    const diasTotais = new Date(ano, mes, 0).getDate();
    if (diaAtual === 0) return 0;
    return Math.round((valorRecebidoMes / diaAtual) * diasTotais);
  }, [valorRecebidoMes, mes, ano]);

  const donutColor = percMetaFinal >= 100
    ? '#22c55e'
    : percMetaFinal >= 70
    ? '#6366f1'
    : percMetaFinal >= 40
    ? '#f59e0b'
    : '#ef4444';

  const donutPercent = meta
    ? percMetaFinal
    : totalAcordosMes > 0
    ? Math.round((totalPagosMes / totalAcordosMes) * 100)
    : 0;

  const donutSublabel = meta ? 'da meta' : 'pagos';
  const sparklineData = porDiaChart.map(d => ({ value: d.recebido ?? 0 }));

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      {/* Header compacto sempre visível */}
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex items-center justify-between px-4 py-3 rounded-xl border border-border/70 bg-card shadow-sm"
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary/10 shrink-0">
              <BarChart2 className="w-3.5 h-3.5 text-primary" />
            </div>
            <div>
              <span className="text-sm font-semibold leading-none">Dados Analíticos</span>
              <p className="text-[11px] text-muted-foreground leading-none mt-0.5">
                {MESES[mes - 1]} {ano}
              </p>
            </div>
          </div>
          {!loading && sparklineData.length > 0 && (
            <div className="hidden lg:flex items-center gap-2 ml-2 pl-3 border-l border-border/60">
              <MiniSparkline data={sparklineData} color={CHART_RECEBIDO} />
              <span className="text-[11px] text-muted-foreground">ritmo</span>
            </div>
          )}
        </div>

        {!loading && (
          <div className="hidden md:flex items-center gap-5 text-xs">
            <div className="flex flex-col items-end">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                {isPP ? 'H.O.' : 'Recebido'}
              </span>
              <span className="font-bold text-emerald-500 tabular-nums font-mono">
                {formatCurrency(valorPrincipal)}
              </span>
            </div>
            {isPP && !temLogicaDiretoExtra && (
              <div className="flex flex-col items-end">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Bruto</span>
                <span className="font-semibold tabular-nums font-mono">
                  {formatCurrency(usarAnalitico ? anal.bruto : valorRecebidoMes)}
                </span>
              </div>
            )}
            {isPP && temLogicaDiretoExtra && (
              <>
                <div className="flex flex-col items-end">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wide">H.O Direto</span>
                  <span className="font-semibold tabular-nums font-mono text-emerald-500">{formatCurrency(valorHODireto)}</span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wide">H.O Extra</span>
                  <span className="font-semibold tabular-nums font-mono text-violet-500">{formatCurrency(valorHOExtra)}</span>
                </div>
              </>
            )}
            {!isPP && (
              <div className="flex flex-col items-end">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Agendado</span>
                <span className="font-semibold tabular-nums font-mono">{formatCurrency(valorAgendadoMes)}</span>
              </div>
            )}
            {meta && (
              <div className="flex flex-col items-end">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Meta</span>
                <span className="font-bold tabular-nums font-mono" style={{ color: donutColor }}>
                  {percMetaFinal}%
                </span>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 rounded-lg"
            onClick={refetch}
            disabled={loading}
            title="Atualizar dados"
          >
            <RefreshCw className={cn('w-3.5 h-3.5 text-muted-foreground', loading && 'animate-spin')} />
          </Button>
          {!alwaysOpen && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1.5 rounded-lg border-border/70"
              onClick={() => setOpen(v => !v)}
            >
              {open ? (
                <><ChevronUp className="w-3 h-3" /> Ocultar</>
              ) : (
                <><ChevronDown className="w-3 h-3" /> Ver Analíticos</>
              )}
            </Button>
          )}
        </div>
      </motion.div>

      {/* Painel expandido */}
      <AnimatePresence>
        {(open || alwaysOpen) && (
          <motion.div
            key="analytics-body"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.28, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="space-y-4 pt-1"
            >
              {/* Metric cards */}
              {loading ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
                </div>
              ) : isPP ? (
                <PPMetrics
                  temLogicaDiretoExtra={temLogicaDiretoExtra}
                  usarAnalitico={usarAnalitico}
                  analiticoBruto={anal.bruto}
                  analiticoHO={anal.ho}
                  analiticoQtd={anal.qtd}
                  pixBruto={anal.pixBruto}
                  pixHO={anal.pixHO}
                  cartaoBruto={anal.cartaoBruto}
                  cartaoHO={anal.cartaoHO}
                  naoTabuladoBruto={anal.naoTabuladoBruto}
                  naoTabuladoQtd={anal.naoTabuladoQtd}
                  valorHODireto={valorHODireto}
                  valorHOExtra={valorHOExtra}
                  valorHOMes={valorHOMes}
                  qtdDireto={qtdDireto}
                  qtdExtra={qtdExtra}
                  valorRecebidoDireto={valorRecebidoDireto}
                  valorRecebidoExtra={valorRecebidoExtra}
                  valorRecebidoMes={valorRecebidoMes}
                  totalAcordosMes={totalAcordosMes}
                  totalPagosMes={totalPagosMes}
                  totalPendentes={totalPendentes}
                  valorAgendadoMes={valorAgendadoMes}
                  valorHOAgendado={valorHOAgendado}
                  valorAgendadoRestanteMes={valorAgendadoRestanteMes}
                  totalAgendadoRestanteMes={totalAgendadoRestanteMes}
                  valorNaoPago={valorNaoPago}
                  totalNaoPagos={totalNaoPagos}
                />
              ) : (
                /* Bookplay metrics grid */
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <MetricCard
                    label="Recebido no mês"
                    icon={<DollarSign className="w-4 h-4" />}
                    accentColor="#22c55e"
                    gradientFrom="#22c55e"
                    trend="up"
                    value={<span className="text-emerald-500">{formatCurrency(valorRecebidoMes)}</span>}
                    sub={`${totalPagosMes} acordos pagos`}
                  />
                  <MetricCard
                    label="Agendado no mês"
                    icon={<Calendar className="w-4 h-4" />}
                    accentColor="#6366f1"
                    gradientFrom="#6366f1"
                    trend="neutral"
                    value={formatCurrency(valorAgendadoMes)}
                    sub={`${totalAcordosMes} acordos`}
                  />
                  <MetricCard
                    label="Não Pagos"
                    icon={<XCircle className="w-4 h-4" />}
                    accentColor="#ef4444"
                    gradientFrom="#ef4444"
                    trend={valorNaoPago > 0 ? 'down' : 'neutral'}
                    value={<span className="text-red-500">{formatCurrency(valorNaoPago)}</span>}
                    sub={`${totalNaoPagos} acordos`}
                  />
                  <MetricCard
                    label="Agendado hoje"
                    icon={<Clock className="w-4 h-4" />}
                    accentColor="#f59e0b"
                    gradientFrom="#f59e0b"
                    value={formatCurrency(valorAgendadoHoje)}
                  />
                  <MetricCard
                    label="Acordos no mês"
                    icon={<BarChart2 className="w-4 h-4" />}
                    accentColor="#3b82f6"
                    gradientFrom="#3b82f6"
                    value={String(totalAcordosMes)}
                    sub={`${totalPendentes} pendentes`}
                  />
                  {mostraAgendadoRestante && (
                    <MetricCard
                      label="Agendado restante no mês"
                      icon={<Clock className="w-4 h-4" />}
                      accentColor="#a855f7"
                      gradientFrom="#a855f7"
                      trend={valorAgendadoRestanteMes > 0 ? 'neutral' : 'up'}
                      value={<span className="text-purple-500">{formatCurrency(valorAgendadoRestanteMes)}</span>}
                      sub={`${totalAgendadoRestanteMes} pendente${totalAgendadoRestanteMes !== 1 ? 's' : ''} · exclui pago/não pago`}
                    />
                  )}
                </div>
              )}

              {/* Charts row */}
              {!loading && (
                <ChartsSection
                  isPP={isPP}
                  porDiaChart={porDiaChart}
                  porTipo={porTipo}
                  donutPercent={donutPercent}
                  donutColor={donutColor}
                  donutSublabel={donutSublabel}
                  meta={meta}
                  percMeta={percMetaFinal}
                  valorRecebidoMes={isPP && usarAnalitico ? anal.bruto : valorRecebidoMes}
                  tickColor={tickColor}
                  gridColor={gridColor}
                />
              )}

              {/* ROW 3 — Métricas adicionais */}
              {!loading && (
                <motion.div variants={itemVariants} className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <motion.div
                    variants={itemVariants}
                    whileHover={{ y: -2 }}
                    className={cn(
                      'relative flex flex-col gap-2 rounded-xl border p-4 overflow-hidden shadow-sm',
                      taxaConversao >= 70
                        ? 'border-emerald-500/30 bg-emerald-500/5'
                        : taxaConversao >= 40
                        ? 'border-amber-500/30 bg-amber-500/5'
                        : 'border-red-500/30 bg-red-500/5',
                    )}
                  >
                    <div
                      className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl"
                      style={{
                        background: taxaConversao >= 70 ? '#22c55e' : taxaConversao >= 40 ? '#f59e0b' : '#ef4444',
                      }}
                    />
                    <div className="flex items-center justify-between pl-1">
                      <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                        Taxa de conversão
                      </span>
                      <Percent
                        className="w-3.5 h-3.5"
                        style={{
                          color: taxaConversao >= 70 ? '#22c55e' : taxaConversao >= 40 ? '#f59e0b' : '#ef4444',
                        }}
                      />
                    </div>
                    <span
                      className="text-2xl font-extrabold tabular-nums font-mono pl-1"
                      style={{
                        color: taxaConversao >= 70 ? '#22c55e' : taxaConversao >= 40 ? '#f59e0b' : '#ef4444',
                      }}
                    >
                      {taxaConversao}%
                    </span>
                    <span className="text-[11px] text-muted-foreground pl-1">
                      {totalPagosMes} de {totalAcordosMes} pagos
                    </span>
                  </motion.div>

                  <motion.div
                    variants={itemVariants}
                    whileHover={{ y: -2 }}
                    className="relative flex flex-col gap-2 rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-4 overflow-hidden shadow-sm"
                  >
                    <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl bg-indigo-500" />
                    <div className="flex items-center justify-between pl-1">
                      <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                        Ticket médio
                      </span>
                      <TrendingUp className="w-3.5 h-3.5 text-indigo-500" />
                    </div>
                    <span className="text-xl font-bold tabular-nums font-mono text-indigo-500 pl-1 leading-tight">
                      {formatCurrency(ticketMedio)}
                    </span>
                    <span className="text-[11px] text-muted-foreground pl-1">por acordo pago</span>
                  </motion.div>

                  <motion.div
                    variants={itemVariants}
                    whileHover={{ y: -2 }}
                    className="relative flex flex-col gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 overflow-hidden shadow-sm"
                  >
                    <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl bg-amber-500" />
                    <div className="flex items-center justify-between pl-1">
                      <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                        Projeção do mês
                      </span>
                      <Target className="w-3.5 h-3.5 text-amber-500" />
                    </div>
                    <span className="text-xl font-bold tabular-nums font-mono text-amber-500 pl-1 leading-tight">
                      {formatCurrency(projecaoMes)}
                    </span>
                    <span className="text-[11px] text-muted-foreground pl-1">ritmo atual</span>
                  </motion.div>
                </motion.div>
              )}

              {/* ROW 4 — Ranking de Operadores (admin/líder) */}
              {!loading && (isAdmin || isLider) && porOperador && porOperador.length > 0 && (
                <motion.div variants={itemVariants}>
                  <Card className="border-border/70 bg-card shadow-sm overflow-hidden">
                    <CardHeader className="pb-3 pt-4 px-5">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <div className="flex items-center justify-center w-6 h-6 rounded-md bg-amber-400/15 shrink-0">
                          <Award className="w-3.5 h-3.5 text-amber-500" />
                        </div>
                        Ranking de Operadores
                        <span className="text-muted-foreground font-normal text-xs ml-1">
                          — {MESES[mes - 1]}/{ano}
                        </span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-5 pb-5">
                      {(() => {
                        const slice = porOperador.slice(0, 10);
                        const maxValor = Math.max(...slice.map(o => o.valor), 1);
                        return (
                          <div className="space-y-1.5">
                            {slice.map((op, i) => {
                              const medal = MEDAL_STYLES[i];
                              const barWidth = Math.max((op.valor / maxValor) * 100, 2);
                              const barColor =
                                i === 0 ? '#f59e0b'
                                : i === 1 ? '#94a3b8'
                                : i === 2 ? '#f97316'
                                : '#6366f1';

                              return (
                                <motion.div
                                  key={op.id}
                                  initial={{ opacity: 0, x: -10 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  transition={{ delay: i * 0.05, duration: 0.28 }}
                                  className="group flex items-center gap-3 py-2 px-3 rounded-xl hover:bg-muted/40 transition-colors duration-150"
                                >
                                  <div
                                    className={cn(
                                      'flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold border shrink-0',
                                      i < 3
                                        ? `${medal.bg} ${medal.text} ${medal.border}`
                                        : 'bg-muted/40 text-muted-foreground border-border/50',
                                    )}
                                  >
                                    {i + 1}
                                  </div>
                                  <div className="flex-1 min-w-0 space-y-1">
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="text-xs font-semibold truncate">{op.nome}</span>
                                      <div className="flex items-center gap-3 shrink-0">
                                        <span className="text-[11px] text-muted-foreground tabular-nums">
                                          {op.acordos} ac.
                                        </span>
                                        <span className="text-xs font-bold tabular-nums font-mono" style={{ color: barColor }}>
                                          {formatCurrency(op.valor)}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="h-1.5 w-full rounded-full bg-muted/50 overflow-hidden">
                                      <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${barWidth}%` }}
                                        transition={{ duration: 0.7, ease: 'easeOut', delay: i * 0.07 }}
                                        className="h-full rounded-full"
                                        style={{ background: `linear-gradient(90deg, ${barColor}99, ${barColor})` }}
                                      />
                                    </div>
                                    {op.meta > 0 && (
                                      <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                        <span className="text-[10px] text-muted-foreground">Meta:</span>
                                        <div className="flex-1 h-1 rounded-full bg-muted/40 overflow-hidden">
                                          <div
                                            className="h-full rounded-full bg-emerald-500/70"
                                            style={{ width: `${Math.min(op.perc, 100)}%` }}
                                          />
                                        </div>
                                        <span className="text-[10px] font-semibold text-emerald-500 tabular-nums">
                                          {op.perc}%
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </motion.div>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </CardContent>
                  </Card>
                </motion.div>
              )}

            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

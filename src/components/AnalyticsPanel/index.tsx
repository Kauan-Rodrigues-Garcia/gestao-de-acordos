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
  Clock, Percent, Target, CreditCard, QrCode,
} from 'lucide-react';
import { useAnalytics } from '@/hooks/useAnalytics';
import { useAnaliticoDashboard, agregarAnalitico } from '@/hooks/useAnaliticoDashboard';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { useEscopoAnalitico } from '@/hooks/useEscopoAnalitico';
import { veTodosOsSetores, ESCOPO_EMPRESA } from '@/services/analitico/escopoAnalitico';
import {
  buscarContribuicoesReceptivo, receptivoDoEscopo,
} from '@/services/analitico/contribuicaoReceptivo.service';
import {
  formatCurrency, TIPO_LABELS, TIPO_LABELS_PAGUEPLAY, PP_HO_PERCENTUAL,
  isPerfilAdminOuLider, isPerfilDiretoria,
} from '@/lib/index';
import { useTenant } from '@/lib/tenant-config';
import { diasDecorridos, diasNoMes, ehMesAtual, mesAtual } from '@/lib/mesReferencia';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { BREAKDOWN_COLORS, containerVariants, itemVariants } from './constants';
import { SeletorMes } from './SeletorMes';
import { SkeletonCard, MetricCard, MiniSparkline, BannerNaoTabulado } from './SubComponents';
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
  const { perfil } = useAuth();
  const { empresa } = useEmpresa();
  const { temPermissao } = useCargoPermissoes();
  const tenant = useTenant();
  const isPP = tenant.isPaguePlay;
  const isBookplay = tenant.slug === 'bookplay';
  const mostraAgendadoRestante = tenant.slug === 'pagueplay' || tenant.slug === 'bookplay';
  // Ambos os tenants importam relatório analítico (BookPlay sem H.O.)
  const temAnalitico = tenant.slug === 'pagueplay' || tenant.slug === 'bookplay';
  const alwaysOpen = !isPP;
  const [open, setOpen] = useState(() => !isPP);

  /**
   * Mês em análise. Nasce no corrente — quem não mexer no seletor vê exatamente
   * o mesmo painel de antes. Vale para os dois tenants: este componente é o
   * painel de métricas tanto da PaguePlay quanto da BookPlay.
   */
  const [mesAnalise, setMesAnalise] = useState<string>(() => mesAtual());
  const noMesAtual = ehMesAtual(mesAnalise);

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
    acordosMes,
    loading,
    refetch,
    setSetorFiltro,
    setEquipeFiltro,
    setOperadorFiltro,
  } = useAnalytics(mesAnalise);

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
  const analiticoDash = useAnaliticoDashboard(temAnalitico, mesAnalise);

  // ── Escopo do analítico ────────────────────────────────────────────────────
  // Quem enxerga a empresa toda. Mesma função da aba Analítico: as duas telas
  // discordavam (aba decidia por cargo, dashboard por permissão), e a diretoria
  // via a empresa numa e só o próprio setor na outra.
  const veTodosSetores = veTodosOsSetores(perfil?.perfil, temPermissao);
  // Sem visão global o painel fica travado no setor do usuário — os números de
  // um setor nunca somam nos do outro.
  const setorTravado = !veTodosSetores ? (perfil?.setor_id ?? null) : null;
  const setorEmFoco  = (setorExterno ?? null) || setorTravado;

  // Membros, clones que contam (`conta_recebimento`) e setores alternativos —
  // resolvidos pelo hook, que é o MESMO usado pelo Painel Diretoria. Enquanto
  // cada painel montava esse conjunto à mão, um somava clone com a caixinha
  // desligada e nenhum dos dois sabia da flag de setor alternativo.
  const { escopo, pendente: escopoPendente } = useEscopoAnalitico({
    ativo:       temAnalitico,
    empresaId:   empresa?.id,
    isPaguePlay: isPP,
    setorId:     setorEmFoco,
    equipeId:    equipeFiltroExterno,
    operadorId:  operadorFiltroExterno,
    mes:         mesAnalise,
    linhas:      analiticoDash.linhas,
  });

  const anal = useMemo(
    () => agregarAnalitico(analiticoDash.linhas, escopo ?? ESCOPO_EMPRESA),
    [analiticoDash.linhas, escopo],
  );
  const usarAnalitico = temAnalitico && analiticoDash.dbAtiva;

  // ── Contribuição Receptivo (BookPlay) ──────────────────────────────────────
  // Valor digitado à mão por setor (`contribuicao_receptivo`, 20260730a). Não
  // vem no relatório: soma POR CIMA do acumulado, como já faz o card de setor
  // do Painel Líder. O dashboard ignorava esse dinheiro por completo.
  const [receptivoPorSetor, setReceptivoPorSetor] = useState<Record<string, number>>({});
  useEffect(() => {
    if (isPP || !isBookplay || !empresa?.id) { setReceptivoPorSetor({}); return; }
    let cancelado = false;
    void buscarContribuicoesReceptivo(empresa.id, mesAnalise).then(({ porSetor }) => {
      if (cancelado) return;
      const mapa: Record<string, number> = {};
      for (const [sid, v] of Object.entries(porSetor)) mapa[sid] = v.acumulado;
      setReceptivoPorSetor(mapa);
    });
    return () => { cancelado = true; };
  }, [isPP, isBookplay, empresa?.id, mesAnalise]);

  /**
   * A tela mostra dados de mais gente do que o próprio usuário?
   *
   * `fn_analitico_dashboard_mes` devolve só as PRÓPRIAS linhas para um
   * operador e a empresa para líder+. O escopo, porém, fica travado no setor
   * do usuário mesmo quando ele é operador — então escopo 'setor' não
   * significa "estou vendo o setor". Sem esta distinção, o valor do card do
   * Receptivo era creditado no total pessoal de cada operador.
   */
  const veDadosDeOutros =
    isPerfilAdminOuLider(perfil?.perfil ?? '') || isPerfilDiretoria(perfil?.perfil ?? '');

  /** Quanto do Receptivo entra no que está na tela — ver `receptivoDoEscopo`. */
  const receptivoNoEscopo = useMemo(
    () => receptivoDoEscopo({ escopo, porSetor: receptivoPorSetor, veDadosDeOutros }),
    [escopo, receptivoPorSetor, veDadosDeOutros],
  );

  /**
   * O acumulado que a tela mostra: relatório + Receptivo.
   *
   * `anal.bruto` sozinho continua sendo o RELATÓRIO puro — é ele que o aviso de
   * "não tabulado" cita, porque só o que veio no arquivo pode ser tabulado.
   */
  const brutoComReceptivo = anal.bruto + receptivoNoEscopo;

  // % da meta: acumulado do analítico × meta total. Fallback: tabulação.
  // Usa o acumulado COM Receptivo — mesma decisão do card de setor no Painel
  // Líder: o Receptivo soma no realizado, a meta segue sendo a da aba Metas.
  const percMetaAnalitico = meta && meta.meta_valor > 0
    ? Math.min(Math.round((brutoComReceptivo / meta.meta_valor) * 100), 999)
    : 0;
  const percMetaFinal = usarAnalitico && meta ? percMetaAnalitico : percMeta;

  const valorPrincipal  = isPP
    ? (usarAnalitico ? anal.ho : (temLogicaDiretoExtra ? valorHOMes : valorHODireto))
    : (usarAnalitico ? brutoComReceptivo : valorRecebidoMes);
  // Linha verde do gráfico: valor total do analítico por dia (o toggle H.O./Total
  // da PP é resolvido dentro do ChartsSection usando o campo `ho`)
  const porDiaChart = usarAnalitico
    ? porDia.map(d => ({
        ...d,
        recebido: anal.porDia[Number(d.dia)]?.bruto ?? 0,
        ho:       anal.porDia[Number(d.dia)]?.ho ?? 0,
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

  /**
   * Ticket médio — do ANALÍTICO quando ele está no ar.
   *
   * Antes dividia sempre pela tabulação (`valorRecebidoMes ÷ acordos pagos`)
   * enquanto o card "Recebido no mês" logo acima já mostrava o analítico. Com a
   * tabulação atrasada em relação ao relatório — que é o normal, é justamente o
   * que o aviso de "não tabulado" denuncia — os dois números na mesma tela
   * contavam histórias diferentes.
   */
  const ticketMedio = usarAnalitico
    ? (anal.qtd > 0 ? anal.bruto / anal.qtd : 0)
    : (totalPagosMes > 0 ? valorRecebidoMes / totalPagosMes : 0);
  const ticketMedioSub = usarAnalitico ? 'por pagamento no analítico' : 'por acordo pago';

  /**
   * Projeção pelo ritmo: realizado ÷ dias corridos × dias do mês.
   *
   * Os "dias corridos" saem de `diasDecorridos`, que num mês FECHADO devolve o
   * mês inteiro. Sem isso, olhar julho no dia 02 de agosto dividiria o mês
   * inteiro por 2 e projetaria ~15× o valor real.
   *
   * A base é a mesma do card "Recebido no mês" — projetar a tabulação enquanto
   * a tela toda fala do analítico dava uma projeção sistematicamente menor.
   */
  const baseProjecao = usarAnalitico ? brutoComReceptivo : valorRecebidoMes;
  const projecaoMes = useMemo(() => {
    const decorridos = diasDecorridos(mesAnalise);
    if (decorridos <= 0) return 0;
    return Math.round((baseProjecao / decorridos) * diasNoMes(mesAnalise));
  }, [baseProjecao, mesAnalise]);

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

  /**
   * Esqueleto enquanto QUALQUER peça do número ainda falta.
   *
   * Inclui o escopo: sem ele, o painel renderizava com o filtro em branco — que
   * significa "empresa inteira" — e um líder via de relance o total da empresa
   * antes de cair para o do setor dele.
   */
  const carregando = loading || escopoPendente;

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
              <div className="mt-0.5 -ml-1.5">
                <SeletorMes mes={mesAnalise} onChange={setMesAnalise} desabilitado={carregando} />
              </div>
            </div>
          </div>
          {!carregando && sparklineData.length > 0 && (
            <div className="hidden lg:flex items-center gap-2 ml-2 pl-3 border-l border-border/60">
              <MiniSparkline data={sparklineData} color={CHART_RECEBIDO} />
              <span className="text-[11px] text-muted-foreground">ritmo</span>
            </div>
          )}
        </div>

        {!carregando && (
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
            disabled={carregando}
            title="Atualizar dados"
          >
            <RefreshCw className={cn('w-3.5 h-3.5 text-muted-foreground', carregando && 'animate-spin')} />
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
              {carregando ? (
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
                /* Bookplay metrics */
                <div className="space-y-3">
                {/* Aviso: recebimento do analítico ainda não tabulado */}
                {usarAnalitico && (
                  <BannerNaoTabulado
                    valor={anal.naoTabuladoBruto}
                    qtd={anal.naoTabuladoQtd}
                    totalAnalitico={anal.bruto}
                  />
                )}
                {/* Formas de pagamento do analítico (Pix, Boleto, Pix Automático, Cartão…) */}
                {usarAnalitico && Object.keys(anal.porForma).length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {Object.entries(anal.porForma)
                      .sort((a, b) => b[1].bruto - a[1].bruto)
                      .map(([forma, f], i) => {
                        const cor = BREAKDOWN_COLORS[i % BREAKDOWN_COLORS.length];
                        const Icone = /cart/i.test(forma) ? CreditCard : QrCode;
                        return (
                          <MetricCard
                            key={forma}
                            label={`${forma} (analítico)`}
                            icon={<Icone className="w-4 h-4" />}
                            accentColor={cor}
                            gradientFrom={cor}
                            value={<span style={{ color: cor }}>{formatCurrency(f.bruto)}</span>}
                            sub={`${f.qtd} pagamento${f.qtd !== 1 ? 's' : ''}`}
                          />
                        );
                      })}
                  </div>
                )}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <MetricCard
                    label="Recebido no mês"
                    icon={<DollarSign className="w-4 h-4" />}
                    accentColor="#22c55e"
                    gradientFrom="#22c55e"
                    trend="up"
                    value={
                      <span className="text-emerald-500">
                        {formatCurrency(usarAnalitico ? brutoComReceptivo : valorRecebidoMes)}
                      </span>
                    }
                    sub={usarAnalitico
                      ? `${anal.qtd} pgtos no analítico`
                        + (receptivoNoEscopo > 0 ? ` · + ${formatCurrency(receptivoNoEscopo)} receptivo` : '')
                      : `${totalPagosMes} acordos pagos`}
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
                  {/* "Hoje" só existe dentro do mês corrente. Num mês fechado
                      este card seria sempre R$ 0,00 — um zero que parece dado
                      real e não é. */}
                  {noMesAtual && (
                    <MetricCard
                      label="Agendado hoje"
                      icon={<Clock className="w-4 h-4" />}
                      accentColor="#f59e0b"
                      gradientFrom="#f59e0b"
                      value={formatCurrency(valorAgendadoHoje)}
                    />
                  )}
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
                </div>
              )}

              {/* Charts row */}
              {!carregando && (
                <ChartsSection
                  isPP={isPP}
                  porDiaChart={porDiaChart}
                  porTipo={porTipo}
                  donutPercent={donutPercent}
                  donutColor={donutColor}
                  donutSublabel={donutSublabel}
                  meta={meta}
                  percMeta={percMetaFinal}
                  valorRecebidoMes={usarAnalitico ? brutoComReceptivo : valorRecebidoMes}
                  tickColor={tickColor}
                  gridColor={gridColor}
                />
              )}

              {/* ROW 3 — Métricas adicionais */}
              {!carregando && (
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
                    <span className="text-[11px] text-muted-foreground pl-1">{ticketMedioSub}</span>
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

            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

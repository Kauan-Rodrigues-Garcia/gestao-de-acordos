import { useMemo, useState } from 'react';
import { useAxisColors } from '@/hooks/useChartColors';
import { motion } from 'framer-motion';
import {
  TrendingUp, DollarSign, BarChart3,
  Building2, RefreshCw, CreditCard,
  TrendingDown, Target, Activity, PieChart,
  AlertCircle, CheckCircle2, Clock, CalendarClock,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell,
  PieChart as RechartsPie, Pie, Legend,
} from 'recharts';
import { useAnalytics } from '@/hooks/useAnalytics';
import { useAnaliticoDashboard, agregarAnalitico } from '@/hooks/useAnaliticoDashboard';
import { useEscopoAnalitico } from '@/hooks/useEscopoAnalitico';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { PP_COREN_PERCENTUAL, PP_COFEN_PERCENTUAL } from '@/lib/index';
import { useTenant } from '@/lib/tenant-config';
import { formatBRL, safeNum, sumSafe } from '@/lib/money';
import {
  deslocarMes, diasDecorridos, diasNoMes as diasDoMes, mesAtual, rotuloDoMes,
} from '@/lib/mesReferencia';
import {
  operadoresDoSetor,
} from '@/services/analitico/analitico.service';
import {
  escopoDeSetor, setorSomaPorUsuarios, ESCOPO_EMPRESA,
} from '@/services/analitico/escopoAnalitico';
import { SeletorMes } from '@/components/AnalyticsPanel/SeletorMes';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

import { KpiCard, SectionLabel, KpiSkeletons, SetorRow, CustomTooltip, CustomPieTooltip } from './components';
import { useSetoresExtras } from './useSetoresExtras';
import { ReceitaDistribuicaoPP } from './ReceitaDistribuicaoPP';
import { MetaSection } from './MetaSection';
import { ExtrasSection } from './ExtrasSection';
import { corDaForma, iconeDaForma, EVOL_AGENDADO, EVOL_RECEBIDO } from './types';

/**
 * Painel Diretoria.
 *
 * ## De onde vem cada número
 *
 * **Relatório ANALÍTICO** — tudo que é dinheiro RECEBIDO: bruto, H.O., repasses
 * Coren/Cofen, a quebra por forma de pagamento (Pix × Cartão × Boleto), a linha
 * de recebido do gráfico diário, o recebido de cada setor, o ticket médio, a
 * projeção e o percentual da meta. O relatório é a fonte certeira: ele existe
 * mesmo quando o operador ainda não tabulou.
 *
 * **TABULAÇÃO (acordos)** — tudo que é compromisso, não caixa: agendado,
 * agendado restante, não pagos, pendentes, quantidade de acordos, taxa de
 * conversão, inadimplência e a distribuição por status.
 *
 * Antes o painel inteiro saía da tabulação, então ele mostrava menos dinheiro
 * do que a empresa recebeu — a diferença sendo exatamente o que ainda não foi
 * tabulado, que é justamente o que o dashboard já denunciava num aviso.
 */
export default function PainelDiretoria() {
  const { tickColor, gridColor } = useAxisColors();
  const { perfil } = useAuth();
  const tenant = useTenant();
  const isPP = tenant.isPaguePlay;
  /** Os dois tenants importam relatório analítico (BookPlay sem H.O.). */
  const temAnalitico = isPP || tenant.slug === 'bookplay';

  /** Mês em análise. Nasce no corrente; o seletor permite ver o mês fechado. */
  const [mesAnalise, setMesAnalise] = useState<string>(() => mesAtual());

  const {
    valorAgendadoMes, valorNaoPago,
    valorHOAgendado, valorHONaoPago,
    totalAcordosMes, totalPagosMes, totalNaoPagos, totalPendentes,
    valorAgendadoRestanteMes, totalAgendadoRestanteMes,
    porDia, porStatus,
    meta, percMeta, setores, setorFiltro, setSetorFiltro,
    valorRecebidoMes: recebidoTabulado,
    loading, refetch,
  } = useAnalytics(mesAnalise, 'diretoria');

  const { empresa } = useEmpresa();
  const {
    setoresDetalhes, loadingSetores, mesAnterior,
    extrasAcordos, extrasOperadoresMap, extrasOpEquipeMap, extrasEquipesMap, loadingExtras,
    reload: reloadSetoresExtras,
  } = useSetoresExtras(empresa?.id, isPP, mesAnalise);

  // ── Relatório analítico: o mês e o anterior (para o comparativo) ───────────
  const analiticoDash = useAnaliticoDashboard(temAnalitico, mesAnalise, 'diretoria');
  const analiticoPrev = useAnaliticoDashboard(
    temAnalitico,
    deslocarMes(mesAnalise, -1),
    'diretoria',
  );

  const {
    escopo, fontes, carimboDisponivel, exclusoes, setorDoOperador,
    pendente: escopoPendente,
  } = useEscopoAnalitico({
    ativo:       temAnalitico,
    empresaId:   empresa?.id,
    isPaguePlay: isPP,
    setorId:     setorFiltro,
    mes:         mesAnalise,
    linhas:      analiticoDash.linhas,
  });

  const anal = useMemo(
    () => agregarAnalitico(analiticoDash.linhas, escopo ?? ESCOPO_EMPRESA),
    [analiticoDash.linhas, escopo],
  );
  const analPrev = useMemo(
    () => agregarAnalitico(analiticoPrev.linhas, escopo ?? ESCOPO_EMPRESA),
    [analiticoPrev.linhas, escopo],
  );

  /** Relatório disponível? Sem ele tudo cai na tabulação, como era antes. */
  const usarAnalitico = temAnalitico && analiticoDash.dbAtiva;

  // ── Recebido: SEMPRE do relatório quando ele existe ───────────────────────
  const recebidoBruto = usarAnalitico ? anal.bruto : recebidoTabulado;
  // H.O. vem da coluna "Total HO" do próprio relatório, não de 24,96% aplicado
  // aqui: o ERP já faz a conta e é o número dele que a diretoria confere.
  const recebidoHO    = usarAnalitico ? anal.ho : recebidoTabulado * (1 - PP_COREN_PERCENTUAL - PP_COFEN_PERCENTUAL);
  const recebidoQtd   = usarAnalitico ? anal.qtd : totalPagosMes;
  const recebidoPrev  = usarAnalitico ? analPrev.bruto : (mesAnterior?.valorRecebido ?? 0);

  /**
   * Percentual da meta sobre o BRUTO recebido.
   *
   * `metas.meta_valor` guarda o campo "Meta R$" da aba Metas, que é o total —
   * o "Meta H.O. (24,96%)" ao lado é conversor de tela e não é persistido.
   * Com o relatório no ar, a base é o bruto DELE.
   */
  const percMetaFinal = usarAnalitico && meta && meta.meta_valor > 0
    ? Math.min(Math.round((recebidoBruto / meta.meta_valor) * 100), 999)
    : percMeta;

  const valorCorenMes = recebidoBruto * PP_COREN_PERCENTUAL;
  const valorCofenMes = recebidoBruto * PP_COFEN_PERCENTUAL;
  // Agendado é compromisso, não caixa: continua saindo da tabulação.
  const valorCorenAge = valorAgendadoMes * PP_COREN_PERCENTUAL;
  const valorCofenAge = valorAgendadoMes * PP_COFEN_PERCENTUAL;

  // Mês anterior, para o comparativo: recebido do RELATÓRIO daquele mês.
  const recebidoHOPrev = usarAnalitico
    ? analPrev.ho
    : recebidoPrev * (1 - PP_COREN_PERCENTUAL - PP_COFEN_PERCENTUAL);
  const valorHOAnteriorAgendado =
    (mesAnterior?.valorAgendado ?? 0) * (1 - PP_COREN_PERCENTUAL - PP_COFEN_PERCENTUAL);

  // ── Recebido por setor (relatório), com a MESMA regra da aba Analítico ────
  const recebidoPorSetor = useMemo(() => {
    const out: Record<string, number> = {};
    if (!usarAnalitico || !fontes) return out;
    for (const s of setoresDetalhes) {
      const escopoSetor = escopoDeSetor({
        setorId:     s.id,
        alternativo: setorSomaPorUsuarios({
          isPaguePlay: isPP,
          alternativo: fontes.setoresAlternativos.has(s.id),
        }),
        operadores:  operadoresDoSetor(s.id, fontes),
        temCarimbo:  carimboDisponivel,
        // As origens que o setor tirou do acumulado na aba Analítico. Sem isto
        // a diretoria leria um número e o líder outro, para o mesmo setor.
        origensExcluidas: exclusoes[s.id],
        setorDoOperador,
      });
      out[s.id] = agregarAnalitico(analiticoDash.linhas, escopoSetor).bruto;
    }
    return out;
  }, [usarAnalitico, fontes, setoresDetalhes, analiticoDash.linhas, isPP, carimboDisponivel,
      exclusoes, setorDoOperador]);

  const setoresAgendamento = useMemo(() => {
    return setoresDetalhes.map(s => {
      const acs = s.acordos;
      const totalAgendado = sumSafe(acs.map(a => a.valor));
      const naoPagos = acs.filter(a => a.status === 'nao_pago');
      const pendentes = acs.filter(a => a.status === 'verificar_pendente');
      // Recebido do RELATÓRIO. Sem relatório, cai no que está tabulado.
      const totalRecebido = usarAnalitico
        ? (recebidoPorSetor[s.id] ?? 0)
        : sumSafe(acs.filter(a => a.status === 'pago').map(a => a.valor));
      const totalNaoPago = sumSafe(naoPagos.map(a => a.valor));
      const totalPendente = sumSafe(pendentes.map(a => a.valor));
      const perc = totalAgendado > 0 ? Math.min(Math.round((totalRecebido / totalAgendado) * 100), 100) : 0;
      const porTipo: Record<string, { agendado: number; recebido: number; qtd: number }> = {};
      acs.forEach(a => {
        const tipo = a.tipo ?? 'sem_tipo';
        if (!porTipo[tipo]) porTipo[tipo] = { agendado: 0, recebido: 0, qtd: 0 };
        porTipo[tipo].agendado += safeNum(a.valor);
        porTipo[tipo].qtd++;
        if (a.status === 'pago') porTipo[tipo].recebido += safeNum(a.valor);
      });
      return { id: s.id, nome: s.nome, totalAgendado, totalRecebido, totalNaoPago, totalPendente, totalAcordos: acs.length, porTipo, perc };
    }).filter(s => s.totalAcordos > 0 || setoresDetalhes.length <= 10)
      .sort((a, b) => b.totalAgendado - a.totalAgendado);
  }, [setoresDetalhes, usarAnalitico, recebidoPorSetor]);

  const tiposPresentes = useMemo(() => {
    const set = new Set<string>();
    setoresAgendamento.forEach(s => Object.keys(s.porTipo).forEach(t => { if (s.porTipo[t].qtd > 0) set.add(t); }));
    return Array.from(set);
  }, [setoresAgendamento]);

  // ── Métricas de compromisso: seguem na TABULAÇÃO ──────────────────────────
  const txConversao = totalAcordosMes > 0 ? Math.round((totalPagosMes / totalAcordosMes) * 100) : 0;
  const inadimplencia = valorAgendadoMes > 0 ? Math.round((valorNaoPago / valorAgendadoMes) * 100) : 0;
  const deltaAgendado = mesAnterior && mesAnterior.valorAgendado > 0
    ? Math.round(((valorAgendadoMes - mesAnterior.valorAgendado) / mesAnterior.valorAgendado) * 100) : null;
  const deltaRecebido = recebidoPrev > 0
    ? Math.round(((recebidoBruto - recebidoPrev) / recebidoPrev) * 100) : null;

  /**
   * Ticket médio — do relatório: valor recebido ÷ pagamentos do analítico.
   * Dividir o recebido do relatório pelos acordos TABULADOS misturaria as duas
   * fontes e inflaria o ticket exatamente na proporção do que falta tabular.
   */
  const ticketMedio = recebidoQtd > 0 ? Math.round(recebidoBruto / recebidoQtd) : 0;

  // ── Distribuição por forma de pagamento (relatório) ───────────────────────
  const distribuicaoPorForma = useMemo(() => {
    return Object.entries(anal.porForma)
      .map(([forma, d]) => ({
        tipo: forma, name: forma, value: d.bruto, qtd: d.qtd, fill: corDaForma(forma),
      }))
      .filter(d => d.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [anal.porForma]);

  /**
   * Projeção pelo ritmo. `diasDecorridos` devolve o mês inteiro quando ele já
   * fechou — sem isso, olhar julho no dia 02 de agosto dividiria o mês inteiro
   * por 2 e projetaria ~15× o valor real.
   */
  const decorridos = diasDecorridos(mesAnalise);
  const totalDiasMes = diasDoMes(mesAnalise);
  const valorBaseProjecao = isPP ? recebidoHO : recebidoBruto;
  const projecaoMes = decorridos > 0 && valorBaseProjecao > 0
    ? Math.round((valorBaseProjecao / decorridos) * totalDiasMes) : 0;
  const projecaoBruta = decorridos > 0 && recebidoBruto > 0
    ? Math.round((recebidoBruto / decorridos) * totalDiasMes) : 0;

  // Linha verde do gráfico: recebido do relatório por dia; o agendado (azul)
  // continua vindo da tabulação, que é onde o compromisso existe.
  const porDiaChart = useMemo(() => (
    usarAnalitico
      ? porDia.map(d => ({ ...d, recebido: anal.porDia[Number(d.dia)]?.bruto ?? 0 }))
      : porDia
  ), [usarAnalitico, porDia, anal.porDia]);

  const totalAgendadoGeral = setoresAgendamento.reduce((s, x) => s + x.totalAgendado, 0);
  const mesNome = rotuloDoMes(mesAnalise);
  const agora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const carregando = loading || escopoPendente;

  if (!perfil) return null;

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-[1600px] mx-auto">

      {/* ── Cabeçalho ─────────────────────────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
        className="relative rounded-2xl border border-border/40 bg-card/80 backdrop-blur-sm overflow-hidden"
      >
        <div className="h-1 w-full bg-gradient-to-r from-primary via-chart-3 to-chart-5" />
        <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-1">
              <span className="font-semibold uppercase tracking-widest">Painel Executivo</span>
              <span className="opacity-40">›</span>
              <span className="capitalize font-medium text-foreground/70">{mesNome}</span>
            </div>
            <h1 className="text-2xl font-extrabold text-foreground flex items-center gap-2.5 tracking-tight">
              <div className="p-1.5 rounded-lg bg-primary/10 border border-primary/20">
                <TrendingUp className="w-5 h-5 text-primary" />
              </div>
              Painel Diretoria
            </h1>
            <div className="flex items-center gap-2 mt-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
              <p className="text-[11px] text-muted-foreground">Atualizado às <span className="font-semibold text-foreground/80">{agora}</span></p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="rounded-xl border border-border/50 bg-background/60 px-1.5 h-9 flex items-center">
              <SeletorMes mes={mesAnalise} onChange={setMesAnalise} desabilitado={carregando} />
            </div>
            {setores.length > 0 && (
              <Select value={setorFiltro ?? 'all'} onValueChange={v => setSetorFiltro(v === 'all' ? null : v)}>
                <SelectTrigger className="w-44 h-9 text-xs rounded-xl border-border/50 bg-background/60">
                  <Building2 className="w-3 h-3 mr-1 text-muted-foreground" />
                  <SelectValue placeholder="Todos os setores" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os setores</SelectItem>
                  {setores.map(s => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <Button variant="outline" size="sm"
              onClick={() => { refetch(); reloadSetoresExtras(); void analiticoDash.refetch(); }}
              disabled={carregando || loadingSetores || loadingExtras}
              className="rounded-xl h-9 border-border/50 bg-background/60 hover:bg-accent/40"
            >
              <RefreshCw className={cn('w-3.5 h-3.5 mr-1.5', (carregando || loadingSetores || loadingExtras) && 'animate-spin')} />
              Atualizar
            </Button>
          </div>
        </div>
      </motion.div>

      {/* ── KPIs principais ─────────────────────────────────────────────────────── */}
      <SectionLabel>Indicadores-chave do mês</SectionLabel>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        {carregando ? <KpiSkeletons count={5} /> : (
          <>
            {/* Recebido: relatório analítico. Agendado, restante, não pagos e
                conversão: tabulação — são compromisso, não caixa. */}
            <KpiCard label={isPP ? 'H.O. recebido no mês' : 'Recebido no mês'} value={isPP ? formatBRL(recebidoHO) : formatBRL(recebidoBruto)} sub={isPP ? `Bruto: ${formatBRL(recebidoBruto)} · ${recebidoQtd} pgtos` : `${recebidoQtd} pagamentos${usarAnalitico ? ' no analítico' : ''}`} icon={DollarSign} color="text-success" bg="bg-success/10" delta={deltaRecebido !== null ? { value: `${deltaRecebido > 0 ? '+' : ''}${deltaRecebido}%`, up: deltaRecebido >= 0 } : undefined} delay={0} />
            <KpiCard label={isPP ? 'H.O. agendado' : 'Total agendado'} value={isPP ? formatBRL(valorHOAgendado) : formatBRL(valorAgendadoMes)} sub={isPP ? `Bruto: ${formatBRL(valorAgendadoMes)} · ${totalAcordosMes} acordos` : `${totalAcordosMes} acordos no mês`} icon={TrendingUp} color="text-primary" bg="bg-primary/10" delta={deltaAgendado !== null ? { value: `${deltaAgendado > 0 ? '+' : ''}${deltaAgendado}%`, up: deltaAgendado >= 0 } : undefined} delay={0.06} />
            <KpiCard label="Agendado restante" value={formatBRL(valorAgendadoRestanteMes)} sub={`${totalAgendadoRestanteMes} pendentes no mês`} icon={CalendarClock} color="text-warning" bg="bg-warning/10" delay={0.12} />
            <KpiCard label="Não pagos" value={formatBRL(valorNaoPago)} sub={isPP ? `H.O. não pago: ${formatBRL(valorHONaoPago)}` : `${totalNaoPagos} acordos`} icon={AlertCircle} color="text-destructive" bg="bg-destructive/10" delay={0.18} />
            <KpiCard label="Taxa de conversão" value={`${txConversao}%`} sub={`${totalPagosMes} de ${totalAcordosMes} tabulados`} icon={CheckCircle2} color="text-chart-3" bg="bg-chart-3/10" delay={0.24} />
          </>
        )}
      </div>

      {/* ── Distribuição de receita PaguePlay ─────────────────────────────────── */}
      {isPP && !carregando && recebidoBruto > 0 && (
        <ReceitaDistribuicaoPP
          valorRecebidoMes={recebidoBruto} valorHOMes={recebidoHO} valorHOAgendado={valorHOAgendado}
          valorNaoPago={valorNaoPago} valorCorenMes={valorCorenMes} valorCofenMes={valorCofenMes}
          valorCorenAge={valorCorenAge} valorCofenAge={valorCofenAge} meta={meta} percMeta={percMetaFinal}
        />
      )}

      {/* ── KPIs secundários ─────────────────────────────────────────────────── */}
      {!carregando && (
        <>
          <SectionLabel>Métricas de performance</SectionLabel>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard label="Ticket médio" value={formatBRL(ticketMedio)} sub={usarAnalitico ? 'por pagamento no analítico' : 'por acordo pago'} icon={Activity} color="text-chart-1" bg="bg-chart-1/10" delay={0.22} />
            <KpiCard label="Índice de inadimplência" value={`${inadimplencia}%`} sub={`${formatBRL(valorNaoPago)} em atraso`} icon={TrendingDown} color={inadimplencia > 20 ? 'text-destructive' : 'text-warning'} bg={inadimplencia > 20 ? 'bg-destructive/10' : 'bg-warning/10'} delay={0.26} />
            <KpiCard label={isPP ? 'Projeção H.O./mês' : 'Projeção do mês'} value={projecaoMes > 0 ? formatBRL(projecaoMes) : '—'} sub={isPP && projecaoBruta > 0 ? `Bruto: ${formatBRL(projecaoBruta)} · ${decorridos}/${totalDiasMes} dias` : `Base: ${decorridos} de ${totalDiasMes} dias`} icon={Target} color="text-chart-5" bg="bg-chart-5/10" delay={0.30} />
            {/* Pendente é o agendado que ainda não virou pago nem não-pago —
                tudo tabulação. A versão anterior fazia
                `agendado − recebido − não pago` com o recebido de OUTRA fonte,
                o que passou a dar um número sem significado. */}
            <KpiCard label="Pendentes" value={String(totalPendentes)} sub={`≈ ${formatBRL(valorAgendadoRestanteMes)} a verificar`} icon={Clock} color="text-chart-4" bg="bg-chart-4/10" delay={0.34} />
          </div>
        </>
      )}

      {/* ── Meta do mês ─────────────────────────────────────────────────────── */}
      {meta && !carregando && (
        <MetaSection
          meta={meta} percMeta={percMetaFinal} isPP={isPP}
          valorHOMes={recebidoHO} valorRecebidoMes={recebidoBruto}
          valorCorenMes={valorCorenMes} valorCofenMes={valorCofenMes}
          projecaoMes={projecaoMes} mesNome={mesNome}
        />
      )}

      {/* ── Breakdown por setor ───────────────────────────────────────────────── */}
      <SectionLabel>Breakdown por setor</SectionLabel>
      <div className="rounded-2xl border border-border/40 bg-card/60 backdrop-blur-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-border/40 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-primary/10 border border-primary/20"><Building2 className="w-4 h-4 text-primary" /></div>
            <div>
              <h3 className="text-sm font-bold text-foreground">Agendado por setor no mês</h3>
              <p className="text-[11px] text-muted-foreground">
                Agendado da tabulação · recebido do {usarAnalitico ? 'relatório analítico' : 'que está tabulado'} · clique para expandir
              </p>
            </div>
          </div>
          {!loadingSetores && totalAgendadoGeral > 0 && (
            <div className="px-3 py-1 rounded-xl border border-primary/25 bg-primary/5 text-xs font-bold text-primary font-mono flex-shrink-0">{formatBRL(totalAgendadoGeral)}</div>
          )}
        </div>
        <div className="p-4 space-y-2">
          {loadingSetores ? (
            <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}</div>
          ) : setoresAgendamento.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">
              <div className="w-12 h-12 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-3"><Building2 className="w-6 h-6 opacity-30" /></div>
              <p className="text-sm font-medium">Nenhum dado de setor disponível</p>
            </div>
          ) : (
            setoresAgendamento.map((setor, i) => <SetorRow key={setor.id} setor={setor} index={i} tipos={tiposPresentes} />)
          )}
        </div>
      </div>

      {/* ── Distribuição por forma de pagamento (relatório analítico) ─────────── */}
      {/* Vem do relatório, não da tabulação: é dinheiro que ENTROU, e a forma
          real do pagamento é a que o ERP registrou, não a que foi tabulada. */}
      {!carregando && distribuicaoPorForma.length > 0 && (
        <>
          <SectionLabel>Recebido por forma de pagamento</SectionLabel>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="relative rounded-2xl border border-border/40 bg-card/80 backdrop-blur-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-border/30">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-chart-2/10 border border-chart-2/20"><PieChart className="w-3.5 h-3.5 text-chart-2" /></div>
                  <div>
                    <h3 className="text-sm font-bold text-foreground">Distribuição por forma</h3>
                    <p className="text-[11px] text-muted-foreground">
                      {usarAnalitico ? 'Relatório analítico' : 'Tabulação (relatório indisponível)'}
                    </p>
                  </div>
                </div>
              </div>
              <div className="p-4 relative">
                <ResponsiveContainer width="100%" height={240}>
                  <RechartsPie>
                    <Pie data={distribuicaoPorForma} cx="50%" cy="50%" innerRadius={65} outerRadius={95} paddingAngle={4} dataKey="value" nameKey="name" strokeWidth={0}>
                      {distribuicaoPorForma.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                    </Pie>
                    <Tooltip content={<CustomPieTooltip />} />
                    <Legend iconType="circle" iconSize={7} formatter={(v) => <span className="text-[11px] text-foreground">{v}</span>} />
                  </RechartsPie>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ top: '-10px' }}>
                  <div className="text-center">
                    <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">Recebido</p>
                    <p className="text-sm font-extrabold font-mono text-foreground leading-none mt-0.5">{formatBRL(distribuicaoPorForma.reduce((s, d) => s + d.value, 0))}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{distribuicaoPorForma.reduce((s, d) => s + d.qtd, 0)} pagamentos</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-border/40 bg-card/80 backdrop-blur-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-border/30">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-chart-3/10 border border-chart-3/20"><CreditCard className="w-3.5 h-3.5 text-chart-3" /></div>
                  <h3 className="text-sm font-bold text-foreground">Detalhamento por forma</h3>
                </div>
              </div>
              <div className="p-4 space-y-3">
                {distribuicaoPorForma.map((d, i) => {
                  const FormaIcon = iconeDaForma(d.tipo);
                  const totalValue = distribuicaoPorForma.reduce((s, x) => s + x.value, 0);
                  const sharePerc = totalValue > 0 ? Math.round((d.value / totalValue) * 100) : 0;
                  return (
                    <div key={d.tipo} className="group">
                      <div className="flex items-center gap-3 py-2.5 px-3 rounded-xl border border-border/30 bg-background/40 hover:border-border/60 hover:bg-background/70 transition-all">
                        <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 border" style={{ background: `${d.fill}15`, borderColor: `${d.fill}30` }}>
                          <FormaIcon className="w-4 h-4" style={{ color: d.fill }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <p className="text-xs font-bold text-foreground truncate">{d.name}</p>
                            <p className="text-xs font-mono font-extrabold text-foreground flex-shrink-0">{formatBRL(d.value)}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                              <motion.div className="h-full rounded-full" style={{ background: d.fill }} initial={{ width: 0 }} animate={{ width: `${sharePerc}%` }} transition={{ duration: 0.7, ease: 'easeOut', delay: i * 0.05 }} />
                            </div>
                            <span className="text-[10px] font-bold w-8 text-right tabular-nums text-muted-foreground">{sharePerc}%</span>
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{d.qtd} pagamento{d.qtd !== 1 ? 's' : ''} do recebido</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Evolução diária ───────────────────────────────────────────────────── */}
      <SectionLabel>Evolução diária</SectionLabel>
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
        className="rounded-2xl border border-border/40 bg-card/80 backdrop-blur-sm overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-border/30 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg border" style={{ background: `${EVOL_AGENDADO}18`, borderColor: `${EVOL_AGENDADO}30` }}>
              <Activity className="w-3.5 h-3.5" style={{ color: EVOL_AGENDADO }} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">Evolução diária — {mesNome}</h3>
              <p className="text-[11px] text-muted-foreground">
                Agendado da tabulação · recebido do {usarAnalitico ? 'relatório analítico' : 'que está tabulado'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="inline-block w-3.5 h-2 rounded-sm" style={{ background: EVOL_RECEBIDO, opacity: 0.7 }} />Recebido</span>
            <span className="flex items-center gap-1.5"><span className="inline-block w-3.5 h-2 rounded-sm" style={{ background: EVOL_AGENDADO, opacity: 0.7 }} />Agendado</span>
          </div>
        </div>
        <div className="p-4">
          {carregando ? <Skeleton className="h-[280px] w-full rounded-xl" /> : (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={porDiaChart} margin={{ top: 10, right: 8, left: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorRecDiretor" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={EVOL_RECEBIDO} stopOpacity={0.45} />
                    <stop offset="95%" stopColor={EVOL_RECEBIDO} stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="colorAgeDiretor" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={EVOL_AGENDADO} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={EVOL_AGENDADO} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} strokeOpacity={0.5} />
                <XAxis dataKey="dia" tick={{ fontSize: 10, fill: tickColor }} stroke="transparent" tickLine={false} dy={4} />
                <YAxis tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 10, fill: tickColor }} stroke="transparent" tickLine={false} width={52} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="agendado" name="Agendado" stroke={EVOL_AGENDADO} strokeWidth={1.5} fill="url(#colorAgeDiretor)" dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                <Area type="monotone" dataKey="recebido" name="Recebido" stroke={EVOL_RECEBIDO} strokeWidth={2.5} fill="url(#colorRecDiretor)" dot={false} activeDot={{ r: 5, strokeWidth: 0 }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </motion.div>

      {/* Performance por equipe e Ranking de operadores saíram desta tela
          (pedido da diretoria, 02/08/2026): os dois já existem no Painel Líder
          e na aba Analítico, com o recorte de setor/equipe que aqui não havia. */}

      {/* ── Extras (PaguePlay only) ──────────────────────────────────────────── */}
      {isPP && (
        <>
          <SectionLabel>Recebimentos Extra</SectionLabel>
          <ExtrasSection
            extrasAcordos={extrasAcordos} extrasOperadoresMap={extrasOperadoresMap}
            extrasOpEquipeMap={extrasOpEquipeMap} extrasEquipesMap={extrasEquipesMap}
            loadingExtras={loadingExtras} setores={setores}
          />
        </>
      )}

      {/* ── Comparativo mensal ───────────────────────────────────────────────── */}
      {mesAnterior && !carregando && (
        <>
          <SectionLabel>Comparativo mensal</SectionLabel>
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            className="rounded-2xl border border-border/40 bg-card/80 backdrop-blur-sm overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-border/30">
              <h3 className="text-sm font-bold text-foreground">Comparativo com mês anterior</h3>
            </div>
            <div className="p-5">
              <div className="grid grid-cols-2 gap-3">
                {/* Agendado compara tabulação com tabulação; Recebido compara
                    RELATÓRIO com RELATÓRIO. Antes o recebido anterior era a
                    tabulação do mês passado — sempre menor que o relatório —, o
                    que inflava o delta a favor do mês atual todo mês. */}
                {[
                  { label: 'Agendado', atual: isPP ? valorHOAgendado : valorAgendadoMes, anterior: isPP ? valorHOAnteriorAgendado : mesAnterior.valorAgendado, delta: deltaAgendado, totalAtual: totalAcordosMes, totalAnterior: mesAnterior.totalAcordos, labelAtual: isPP ? 'H.O. agendado atual' : 'Agendado atual', labelAnterior: isPP ? 'H.O. agendado anterior' : 'Agendado anterior', color: 'primary' as const },
                  { label: 'Recebido', atual: isPP ? recebidoHO : recebidoBruto, anterior: isPP ? recebidoHOPrev : recebidoPrev, delta: deltaRecebido, totalAtual: recebidoQtd, totalAnterior: null, labelAtual: isPP ? 'H.O. recebido atual' : 'Recebido atual', labelAnterior: isPP ? 'H.O. recebido anterior' : 'Recebido anterior', color: 'success' as const },
                ].map(({ label, atual, anterior, delta, totalAtual, totalAnterior, labelAtual, labelAnterior, color }) => (
                  <div key={label} className="space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 px-1">{label}</p>
                    <div className={cn('p-4 rounded-xl border', color === 'primary' ? 'border-primary/20 bg-primary/5' : 'border-success/20 bg-success/5')}>
                      <p className="text-[10px] text-muted-foreground font-medium mb-1">{labelAtual}</p>
                      <p className={cn('text-xl font-extrabold font-mono leading-none', color === 'primary' ? 'text-primary' : 'text-success')}>{formatBRL(atual)}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">{totalAtual} {label === 'Agendado' ? 'acordos' : 'pagamentos'}{isPP && label === 'Agendado' ? ` · bruto ${formatBRL(valorAgendadoMes)}` : ''}{isPP && label === 'Recebido' ? ` · bruto ${formatBRL(recebidoBruto)}` : ''}</p>
                    </div>
                    {delta !== null && (
                      <div className="flex items-center justify-center">
                        <div className={cn('flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full border', delta >= 0 ? 'text-success bg-success/10 border-success/25' : 'text-destructive bg-destructive/10 border-destructive/25')}>
                          {delta > 0 ? '+' : ''}{delta}%
                        </div>
                      </div>
                    )}
                    <div className="p-4 rounded-xl border border-border/30 bg-muted/20">
                      <p className="text-[10px] text-muted-foreground font-medium mb-1">{labelAnterior}</p>
                      <p className="text-xl font-extrabold font-mono text-muted-foreground leading-none">{formatBRL(anterior)}</p>
                      {totalAnterior !== null && <p className="text-[10px] text-muted-foreground mt-1">{totalAnterior} acordos</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </>
      )}

      {/* ── Status breakdown ──────────────────────────────────────────────────── */}
      {!carregando && porStatus.length > 0 && (
        <>
          <SectionLabel>Distribuição por status</SectionLabel>
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
            className="rounded-2xl border border-border/40 bg-card/80 backdrop-blur-sm overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-border/30 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-muted border border-border/40"><BarChart3 className="w-3.5 h-3.5 text-foreground/70" /></div>
                <h3 className="text-sm font-bold text-foreground">Acordos do mês por status</h3>
              </div>
              <div className="px-3 py-1 rounded-full bg-muted border border-border/30 text-[11px] font-semibold text-muted-foreground">
                {porStatus.reduce((s, e) => s + e.value, 0)} acordos
              </div>
            </div>
            <div className="p-5 space-y-4">
              {(() => {
                const total = porStatus.reduce((s, e) => s + e.value, 0);
                return (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-2">Composição total</p>
                    <div className="flex h-4 rounded-xl overflow-hidden gap-px bg-muted/30">
                      {porStatus.map((entry, i) => {
                        const pct = total > 0 ? (entry.value / total) * 100 : 0;
                        if (pct === 0) return null;
                        return <motion.div key={entry.name} className="h-full" style={{ background: entry.color, width: `${pct}%` }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5, delay: i * 0.1 }} title={`${entry.name}: ${Math.round(pct)}%`} />;
                      })}
                    </div>
                    <div className="flex gap-4 mt-2 flex-wrap">
                      {porStatus.map((entry) => {
                        const pct = total > 0 ? Math.round((entry.value / total) * 100) : 0;
                        return <span key={entry.name} className="flex items-center gap-1.5 text-[10px] text-muted-foreground"><span className="w-2 h-2 rounded-sm inline-block flex-shrink-0" style={{ background: entry.color }} />{entry.name} <span className="font-bold" style={{ color: entry.color }}>{pct}%</span></span>;
                      })}
                    </div>
                  </div>
                );
              })()}
              <div className="space-y-3 pt-2">
                {(() => {
                  const total = porStatus.reduce((s, e) => s + e.value, 0);
                  return porStatus.map((entry, idx) => {
                    const pct = total > 0 ? Math.round((entry.value / total) * 100) : 0;
                    const StatusIcon = entry.icon === 'check' ? CheckCircle2 : entry.icon === 'clock' ? Clock : AlertCircle;
                    return (
                      <div key={entry.name} className="group">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <StatusIcon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: entry.color }} />
                            <span className="text-sm font-semibold text-foreground">{entry.name}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-[11px] text-muted-foreground">{entry.value} acordos</span>
                            <span className="text-sm font-extrabold tabular-nums w-10 text-right" style={{ color: entry.color }}>{pct}%</span>
                          </div>
                        </div>
                        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                          <motion.div className="h-full rounded-full" style={{ background: entry.color }} initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.7, ease: 'easeOut', delay: idx * 0.08 }} />
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
              <div className="pt-3 border-t border-border/30">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-2">Comparativo visual</p>
                <ResponsiveContainer width="100%" height={110}>
                  <BarChart data={porStatus} margin={{ top: 4, right: 8, left: -20, bottom: 0 }} barCategoryGap="30%">
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: tickColor, fontWeight: 500 }} stroke="transparent" tickLine={false} />
                    <YAxis hide />
                    <Tooltip cursor={{ fill: 'rgba(148,163,184,0.06)', radius: 6 }}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0].payload;
                        const total = porStatus.reduce((s, e) => s + e.value, 0);
                        const pct = total > 0 ? Math.round((d.value / total) * 100) : 0;
                        return <div className="rounded-xl border border-border/60 bg-popover/95 backdrop-blur-sm p-2.5 shadow-xl text-xs"><p className="font-bold text-popover-foreground mb-1" style={{ color: d.color }}>{d.name}</p><p className="text-popover-foreground">{d.value} acordos <span className="text-muted-foreground">({pct}%)</span></p></div>;
                      }}
                    />
                    <Bar dataKey="value" radius={[8, 8, 0, 0]} maxBarSize={64}>
                      {porStatus.map((entry, i) => <Cell key={i} fill={entry.color} fillOpacity={0.85} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </div>
  );
}

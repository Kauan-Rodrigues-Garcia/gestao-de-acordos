/**
 * AnalyticsPanel — v4 (Premium Redesign)
 * Substituição do PieChart de status pelo "Anel com Breakdown":
 *   • Anel central: % da meta de valor atingida (ou % dos acordos pagos se sem meta)
 *   • Ao expandir (clicar "Ver Breakdown"): mostra % por forma de pagamento
 */

import { useState, useMemo, useEffect, useCallback, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart2, TrendingUp, Calendar,
  XCircle,
  Clock, Percent, Target,
} from 'lucide-react';
import { useAnalytics } from '@/hooks/useAnalytics';
import { useAnaliticoDashboard, agregarAnalitico } from '@/hooks/useAnaliticoDashboard';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { useEscopoAnalitico } from '@/hooks/useEscopoAnalitico';
import { useSetorDoDashboard } from '@/hooks/useSetorDoDashboard';
import { useLugarNoMes } from '@/hooks/useLugarNoMes';
import { ESCOPO_EMPRESA } from '@/services/analitico/escopoAnalitico';
import { niveisLiberados, veAlemDeSi } from '@/lib/permissoes-escopo';
import {
  buscarContribuicoesReceptivo, receptivoDoEscopo, receptivoSomaPorCima,
} from '@/services/analitico/contribuicaoReceptivo.service';
import { formatCurrency } from '@/lib/index';
import { useTenant } from '@/lib/tenant-config';
import { diasDecorridos, diasNoMes, ehMesAtual } from '@/lib/mesReferencia';
import { useMesGlobal } from '@/providers/MesProvider';
import { cn } from '@/lib/utils';
import { containerVariants, itemVariants } from './constants';
import { SeletorMes } from './SeletorMes';
import { SkeletonCard, MetricCard } from './SubComponents';
import { PainelMetas } from '@/components/PainelMetas';
import { SeletorUnidade } from '@/components/PainelMetas/SeletorUnidade';
import { BotaoFechamento } from '@/components/Fechamento/BotaoFechamento';
import {
  lerUnidade, gravarUnidade, type UnidadeValor,
} from '@/lib/unidadeValor';
// `ChartsSection` deixou de ser renderizado aqui: os dois gráficos que ele
// desenhava viraram a evolução diária e o donut do PainelMetas. O arquivo
// segue no repositório enquanto houver quem o importe.
import { PPMetrics } from './PPMetrics';
import { ValorAnimado } from '@/components/ValorAnimado';

import { corTexto } from '@/lib/temas';
import { useHoPercentualDoMes } from '@/hooks/useHoPercentualDoMes';
// ─────────────────────────────────────────────────────────────────────────────

interface AnalyticsPanelProps {
  setorFiltro?: string | null;
  equipeFiltroExterno?: string | null;
  operadorFiltroExterno?: string | null;
  /** Divisão do setor em foco (05/11/2026) — ver `services/setores/divisoes.ts`. */
  divisaoFiltroExterno?: string | null;
  temLogicaDiretoExtra?: boolean;
  /**
   * Onde os controles do painel (mês, H.O./Bruto, fechamento) são desenhados.
   * O Dashboard os entrega ao card do recorte; sem isto, saem soltos no topo.
   */
  renderFiltro?: (controles: ReactNode) => ReactNode;
}

export function AnalyticsPanel({
  setorFiltro: setorExterno,
  equipeFiltroExterno,
  operadorFiltroExterno,
  divisaoFiltroExterno,
  temLogicaDiretoExtra = false,
  renderFiltro,
}: AnalyticsPanelProps = {}) {
  // Direto/Extra pagos são ACORDOS: sem H.O. de relatório, converte.
  // O H.O. do mês olhado: no mês fechado, o do retrato (31/10/2026).
  const { mes: mesDoHo } = useMesGlobal();
  const ho = useHoPercentualDoMes(mesDoHo);
  const { perfil } = useAuth();
  const { empresa } = useEmpresa();
  const { temPermissao } = useCargoPermissoes();
  /*
   * Escopo DESTE painel, e de nenhum outro. Desce para `useAnalytics`, que
   * atende tambem o Painel Diretoria — memoizado porque `niveisLiberados`
   * devolve um array novo a cada chamada, e ele entra em dependencia de hook.
   */
  const niveisDashboard = useMemo(
    () => niveisLiberados('dashboard', temPermissao),
    [temPermissao],
  );
  const tenant = useTenant();
  const isPP = tenant.isPaguePlay;
  const isBookplay = tenant.slug === 'bookplay';
  const mostraAgendadoRestante = tenant.slug === 'pagueplay' || tenant.slug === 'bookplay';
  // Ambos os tenants importam relatório analítico (BookPlay sem H.O.)
  const temAnalitico = tenant.slug === 'pagueplay' || tenant.slug === 'bookplay';
  /*
   * O painel vem sempre aberto, nas duas regras. Na regra Cofen ele nascia
   * fechado, com um «Ocultar / Ver Analíticos»: a mesa de acordos ficava logo
   * abaixo dele no Dashboard e o painel recolhido dava espaço a ela. Desde
   * 05/11/2026 a mesa é a aba Acordos e o Dashboard é igual ao de Nosso
   * produto (Cleber): sem opção de minimizar.
   */

  /**
   * Mês em análise. Nasce no corrente — quem não mexer no seletor vê exatamente
   * o mesmo painel de antes. Vale para os dois tenants: este componente é o
   * painel de métricas tanto da PaguePlay quanto da BookPlay.
   */
  /*
   * O mês vem do `MesProvider`, não de um estado local: escolher agosto aqui
   * tem que valer também nos Acordos, no Analítico e no Pix, e continuar valendo
   * depois de trocar de página.
   */
  const { mes: mesAnalise, setMes: setMesAnalise } = useMesGlobal();

  /**
   * H.O. ou bruto — PaguePlay.
   *
   * O estado mora aqui, e não dentro do `PainelMetas`, porque o alternador fica
   * na faixa de cabeçalho junto do seletor de mês. Mesma razão pela qual o mês
   * também mora aqui.
   *
   * A preferência é lida na montagem e regravada a cada troca; a chave leva o
   * id do usuário para que máquina compartilhada não misture as escolhas.
   */
  const [unidade, setUnidade] = useState<UnidadeValor>(() => lerUnidade(perfil?.id));

  // O perfil chega depois da primeira renderização (a sessão resolve em
  // seguida). Sem isto, a preferência de quem escolheu "Bruto" era lida com a
  // chave do anônimo e voltava para H.O. em todo carregamento.
  useEffect(() => {
    if (perfil?.id) setUnidade(lerUnidade(perfil.id));
  }, [perfil?.id]);

  const trocarUnidade = useCallback((u: UnidadeValor) => {
    setUnidade(u);
    gravarUnidade(perfil?.id, u);
  }, [perfil?.id]);
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
    totalAcordosVencidos,
    totalPagosVencidos,
    acordosMes,
    loading,
    setSetorFiltro,
    setEquipeFiltro,
    setOperadorFiltro,
    setDivisaoFiltro,
  } = useAnalytics(mesAnalise, {
    niveis: niveisDashboard,
    // A chave decide sozinha — ver o comentário em `useSetoresEquipes`, que faz
    // a mesma leitura para a LISTA do filtro.
    podeTodasEquipes: temPermissao('dashboard_escopo_equipe_todas'),
  });

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
      valorHODireto:  vDireto * ho,
      valorHOExtra:   vExtra  * ho,
      qtdDireto: direto.length,
      qtdExtra:  extra.length,
    };
  }, [acordosMes, isPP, ho]);

  // ── Recebimento via relatório ANALÍTICO (fonte certeira — PP) ──────────────
  // O recebido no mês, o gráfico por dia, Pix/Cartão e a % da meta passam a
  // vir do analitico_recebimentos. Se a migration ainda não foi aplicada
  // (dbAtiva=false), tudo cai no comportamento antigo (tabulação).
  const analiticoDash = useAnaliticoDashboard(temAnalitico, mesAnalise);

  // ── Escopo do analítico ────────────────────────────────────────────────────
  // Quem enxerga a empresa toda. Mesma função da aba Analítico: as duas telas
  // discordavam (aba decidia por cargo, dashboard por permissão), e a diretoria
  // via a empresa numa e só o próprio setor na outra.
  // Escopo DESTE painel, e de nenhum outro. Antes vinha de `veTodosOsSetores`,
  // que respondia por cargo ou pelas chaves globais — as mesmas do Analítico,
  // do Recebimento e, até a fase 2, do Painel Líder.
  const veTodosSetores = niveisDashboard.includes('todos_setores');
  // Sem visão global o painel fica travado no setor do usuário — os números de
  // um setor nunca somam nos do outro.
  //
  // «Travado no setor» pressupõe alcance de setor. Para quem só alcança a
  // equipe, travar aqui somaria o SETOR INTEIRO num painel que o painel de
  // permissões limitou à equipe — e o banco, que agora obedece ao mesmo
  // alcance, entregaria só a equipe: o total na tela sairia menor que o
  // rótulo, exatamente a divergência que esta rodada veio consertar.
  const veSetor = niveisDashboard.includes('setor');
  // O setor do mês olhado: no mês fechado, o do retrato (decisão do Cleber,
  // 31/10/2026 — quem mudou de setor vê o mês onde estava).
  const lugar = useLugarNoMes(mesAnalise);
  const setorTravado = !veTodosSetores && veSetor ? lugar.setorId : null;
  const setorEmFoco  = (setorExterno ?? null) || setorTravado;

  // Membros, clones que contam (`conta_recebimento`) e setores alternativos —
  // resolvidos pelo hook, que é o MESMO usado pelo Painel Diretoria. Enquanto
  // cada painel montava esse conjunto à mão, um somava clone com a caixinha
  // desligada e nenhum dos dois sabia da flag de setor alternativo.
  const { escopo, pendente: escopoPendente, escopoSemDivisao } = useEscopoAnalitico({
    ativo:       temAnalitico,
    empresaId:   empresa?.id,
    isPaguePlay: isPP,
    setorId:     setorEmFoco,
    equipeId:    equipeFiltroExterno,
    operadorId:  operadorFiltroExterno,
    divisaoId:   divisaoFiltroExterno,
    mes:         mesAnalise,
    linhas:      analiticoDash.linhas,
  });

  /*
   * Divisão do setor (05/11/2026): os acordos (`useAnalytics`) recortam pelas
   * MESMAS pessoas que o escopo do analítico pôs na divisão — o recebido e o
   * agendado da tela falam do mesmo grupo.
   */
  const operadoresDaDivisaoChave = escopo?.tipo === 'divisao' && !escopo.resto
    ? [...escopo.operadores].sort().join(',')
    : '';
  useEffect(() => {
    if (escopo?.tipo === 'divisao' && !escopo.resto && divisaoFiltroExterno) {
      setDivisaoFiltro({
        id: divisaoFiltroExterno,
        operadores: operadoresDaDivisaoChave ? operadoresDaDivisaoChave.split(',') : [],
      });
    } else {
      setDivisaoFiltro(null);
    }
    // `escopo` entra pela chave: o objeto muda de identidade a cada leitura.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [divisaoFiltroExterno, operadoresDaDivisaoChave, escopo?.tipo, setDivisaoFiltro]);

  /** «Sem divisão»: o que é do setor e não cabe em divisão nenhuma. */
  const brutoSemDivisao = useMemo(
    () => (escopoSemDivisao ? agregarAnalitico(analiticoDash.linhas, escopoSemDivisao).bruto : 0),
    [analiticoDash.linhas, escopoSemDivisao],
  );

  const anal = useMemo(
    () => agregarAnalitico(analiticoDash.linhas, escopo ?? ESCOPO_EMPRESA),
    [analiticoDash.linhas, escopo],
  );
  const usarAnalitico = temAnalitico && analiticoDash.dbAtiva;

  // ── Contribuição Receptivo (BookPlay) ──────────────────────────────────────
  // O Integral que o Receptivo cobrou para cada setor. Desde 14/09/2026 o 59 a
  // grava nas linhas do setor (`contribuicao_59`): ela já chega em
  // `analiticoDash.linhas` e `linhaNoEscopo` decide onde conta — no setor sim,
  // na empresa não. Aqui sobra só o valor DIGITADO de setor fora do 59, que não
  // está em linha nenhuma e soma por cima no escopo de setor (`receptivoDoEscopo`).
  const [receptivoPorSetor, setReceptivoPorSetor] = useState<Record<string, number>>({});
  useEffect(() => {
    if (isPP || !isBookplay || !empresa?.id) { setReceptivoPorSetor({}); return; }
    let cancelado = false;
    void buscarContribuicoesReceptivo(empresa.id, mesAnalise).then(({ porSetor }) => {
      if (cancelado) return;
      const mapa: Record<string, number> = {};
      for (const [sid, v] of Object.entries(porSetor)) {
        // O do 59 já está nas linhas; somá-lo aqui dobraria.
        if (receptivoSomaPorCima(v)) mapa[sid] = v.acumulado;
      }
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
  // Sai dos níveis do Dashboard — o painel onde este componente vive. Era
  // `isPerfilAdminOuLider || isPerfilDiretoria`, escrito à mão aqui.
  const veDadosDeOutros = veAlemDeSi('dashboard', temPermissao);

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

  /*
   * Setor inteiro na tela: o total do card do setor no Painel do Líder — o
   * mesmo que o `PainelMetas` logo abaixo mostra (Cofen pela conciliação).
   * Só para quem vê além de si: o escopo do operador fica travado no setor
   * dele, e ali o número tem de ser o próprio.
   */
  const setorDoPainel = useSetorDoDashboard(
    veDadosDeOutros && escopo?.tipo === 'setor' ? setorEmFoco : null,
    mesAnalise,
  );
  const recebidoDoEscopo = setorDoPainel.dados?.bruto ?? brutoComReceptivo;
  // O H.O./Bruto, a % da meta e o ritmo que viviam aqui eram da faixa «Dados
  // Analíticos», removida em 05/11/2026: o PainelMetas já mostra os três.

  useEffect(() => {
    if (setorExterno !== undefined) setSetorFiltro(setorExterno ?? null);
  }, [setorExterno, setSetorFiltro]);

  useEffect(() => {
    if (equipeFiltroExterno !== undefined) setEquipeFiltro(equipeFiltroExterno ?? null);
  }, [equipeFiltroExterno, setEquipeFiltro]);

  useEffect(() => {
    if (operadorFiltroExterno !== undefined) setOperadorFiltro(operadorFiltroExterno ?? null);
  }, [operadorFiltroExterno, setOperadorFiltro]);

  // `porTipo` (distribuicao por forma de pagamento) saiu com o ChartsSection.
  // A leitura por forma agora e o breakdown do donut do PainelMetas, que sai do
  // ANALITICO e nao da tabulacao — e por isso responde ao alternador de unidade.

  /*
   * Sobre o que JÁ VENCEU, e não sobre o mês inteiro.
   *
   * Com a base cheia, os acordos ainda por vencer entravam como não
   * convertidos: no dia 5 a taxa media quase só quanto do mês já tinha
   * passado. A base agora é `vencimento <= hoje` — ver `useAnalytics`.
   */
  const taxaConversao = totalAcordosVencidos > 0
    ? Math.round((totalPagosVencidos / totalAcordosVencidos) * 100)
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
  const baseProjecao = usarAnalitico ? recebidoDoEscopo : valorRecebidoMes;
  const projecaoMes = useMemo(() => {
    const decorridos = diasDecorridos(mesAnalise);
    if (decorridos <= 0) return 0;
    return Math.round((baseProjecao / decorridos) * diasNoMes(mesAnalise));
  }, [baseProjecao, mesAnalise]);

  // `donutPercent` e `donutSublabel` saíram junto com o `ChartsSection`: o
  // donut da meta agora é o `CardMetaDonut`, dentro do PainelMetas, e calcula a
  // própria porcentagem a partir de recebido e meta na unidade em exibição.

  /**
   * Esqueleto enquanto QUALQUER peça do número ainda falta.
   *
   * Inclui o escopo: sem ele, o painel renderizava com o filtro em branco — que
   * significa "empresa inteira" — e um líder via de relance o total da empresa
   * antes de cair para o do setor dele.
   */
  const carregando = loading || escopoPendente;

  /**
   * PaguePlay: os 11 cards do painel antigo, recolhidos.
   *
   * Continuam sendo a leitura detalhada de H.O. por forma, vínculo e agendado —
   * o que eles não são é sobre META, e por isso saem da primeira dobra em vez
   * de competir com projeção e quartil. Mesmo destino que os cards da BookPlay
   * tiveram em `de5d5da`.
   */
  const ppSecundarios = isPP && !carregando ? (
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
  ) : null;

  /**
   * BookPlay: o que sobrou do painel antigo dela. Continua útil, mas não é
   * sobre meta. Entra recolhido para não competir com os números de projeção.
   */
  const bpSecundarios = !isPP && !carregando ? (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      <MetricCard
        label="Agendado no mês"
        icon={<Calendar className="w-4 h-4" />}
        accentColor="#6366f1"
        trend="neutral"
        value={<ValorAnimado valor={valorAgendadoMes} formatar={formatCurrency} />}
        sub={`${totalAcordosMes} acordos`}
      />
      <MetricCard
        label="Não Pagos"
        icon={<XCircle className="w-4 h-4" />}
        accentColor="#ef4444"
        trend={valorNaoPago > 0 ? 'down' : 'neutral'}
        value={<ValorAnimado valor={valorNaoPago} formatar={formatCurrency} className="text-red-500" />}
        sub={`${totalNaoPagos} acordos`}
      />
      {/* "Hoje" só existe dentro do mês corrente. Num mês fechado este card
          seria sempre R$ 0,00 — um zero que parece dado real e não é. */}
      {noMesAtual && (
        <MetricCard
          label="Agendado hoje"
          icon={<Clock className="w-4 h-4" />}
          accentColor="#f59e0b"
          value={<ValorAnimado valor={valorAgendadoHoje} formatar={formatCurrency} />}
        />
      )}
      <MetricCard
        label="Acordos no mês"
        icon={<BarChart2 className="w-4 h-4" />}
        accentColor="#3b82f6"
        value={String(totalAcordosMes)}
        sub={`${totalPendentes} pendentes`}
      />
      {mostraAgendadoRestante && (
        <MetricCard
          label="Agendado restante no mês"
          icon={<Clock className="w-4 h-4" />}
          accentColor="#a855f7"
          trend={valorAgendadoRestanteMes > 0 ? 'neutral' : 'up'}
          value={<ValorAnimado valor={valorAgendadoRestanteMes} formatar={formatCurrency} className="text-purple-500" />}
          sub={`${totalAgendadoRestanteMes} pendente${totalAgendadoRestanteMes !== 1 ? 's' : ''} · exclui pago/não pago`}
        />
      )}
      <MetricCard
        label="Taxa de conversão"
        icon={<Percent className="w-4 h-4" />}
        accentColor={taxaConversao >= 70 ? '#22c55e' : taxaConversao >= 40 ? '#f59e0b' : '#ef4444'}
        value={(
          <span style={{ color: corTexto(taxaConversao >= 70 ? '#22c55e' : taxaConversao >= 40 ? '#f59e0b' : '#ef4444') }}>
            {taxaConversao}%
          </span>
        )}
        sub={`${totalPagosVencidos} de ${totalAcordosVencidos} já vencidos`}
      />
      <MetricCard
        label="Ticket médio"
        icon={<TrendingUp className="w-4 h-4" />}
        accentColor="#6366f1"
        value={<ValorAnimado valor={ticketMedio} formatar={formatCurrency} className="text-indigo-500" />}
        sub={ticketMedioSub}
      />
    </div>
  ) : null;

  /** O bloco recolhível do painel, seja qual for a operação. */
  const cardsSecundarios = isPP ? ppSecundarios : bpSecundarios;

  /*
   * Os controles do painel — mês e, na regra Cofen, H.O. ⇄ Bruto.
   *
   * Até 05/11/2026 moravam numa faixa própria («Dados Analíticos»), com
   * título, ritmo, os totais de H.O./Bruto e o botão de atualizar. Os totais
   * repetiam o que o painel de metas logo abaixo já mostra, e a faixa era um
   * card inteiro para dois filtros. Pedido do Cleber: a faixa sai, e os dois
   * filtros vão para o card do recorte (Minha visão · equipe · setor), que é
   * onde a tela já pergunta «o que estou olhando?».
   *
   * O «Baixar fechamento» vai junto: só aparece em mês fechado e baixa o MÊS
   * escolhido aqui — separado do seletor, a pergunta «de qual mês?» volta.
   */
  const controles = (
    <div className="flex items-center gap-2 flex-wrap">
      <SeletorMes mes={mesAnalise} onChange={setMesAnalise} desabilitado={carregando} />
      {/* PaguePlay só: a BookPlay não tem H.O. */}
      {isPP && <SeletorUnidade valor={unidade} onChange={trocarUnidade} />}
      <BotaoFechamento
        mes={mesAnalise}
        setorId={setorEmFoco}
        temLogicaDiretoExtra={temLogicaDiretoExtra}
      />
    </div>
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      {renderFiltro ? renderFiltro(controles) : controles}

      {/* O painel: sempre aberto, nas duas regras (05/11/2026). */}
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        transition={{ duration: 0.28, ease: 'easeInOut' }}
        className="overflow-hidden"
      >
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="space-y-4 pt-1"
        >
          {/* Divisões do setor: o que ficou fora de todas (05/11/2026). */}
          {!carregando && brutoSemDivisao > 0.004 && (
            <p className="text-xs text-muted-foreground px-1">
              <span className="font-medium text-warning">Sem divisão:</span>{' '}
              {formatCurrency(brutoSemDivisao)} do setor não está em nenhuma divisão
              (contribuição, equipe ou login fora das divisões). Conta só no setor inteiro.
            </p>
          )}

          {/* Metric cards */}
          {carregando ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : (
            /* O corpo é o painel de metas nas DUAS operações.
               Ele SUBSTITUI os cards soltos e os gráficos que viviam aqui —
               o donut da meta e o Recebido vs Agendado foram absorvidos por
               ele, e o que sobrou virou o bloco recolhível `secundarios`.
               A PaguePlay entrou nesse caminho em 2026-08-15; o que a
               distingue é o alternador H.O./Bruto no cabeçalho. */
            <PainelMetas
              mes={mesAnalise}
              setorFiltro={setorEmFoco}
              equipeFiltroExterno={equipeFiltroExterno}
              operadorFiltroExterno={operadorFiltroExterno}
              divisaoFiltro={divisaoFiltroExterno}
              temLogicaDiretoExtra={temLogicaDiretoExtra}
              unidade={unidade}
              secundarios={cardsSecundarios}
            />
          )}

          {/* ROW 3 — Métricas adicionais. Só na PaguePlay: na BookPlay
              Taxa de conversão e Ticket médio foram para o bloco recolhível
              do PainelMetas, e "Projeção do mês" saiu de cena — o painel
              novo projeta contra a meta e os dias úteis, não contra dias
              corridos, e dois números chamados "projeção" na mesma tela
              discordariam por construção. */}
          {!carregando && isPP && (
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
                      color: corTexto(taxaConversao >= 70 ? '#22c55e' : taxaConversao >= 40 ? '#f59e0b' : '#ef4444'),
                    }}
                  />
                </div>
                <span
                  className="text-2xl font-extrabold tabular-nums font-mono pl-1"
                  style={{
                    color: corTexto(taxaConversao >= 70 ? '#22c55e' : taxaConversao >= 40 ? '#f59e0b' : '#ef4444'),
                  }}
                >
                  {taxaConversao}%
                </span>
                <span className="text-[11px] text-muted-foreground pl-1">
                  {totalPagosVencidos} de {totalAcordosVencidos} já vencidos
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
                  <Target className="w-3.5 h-3.5 text-amber-700 dark:text-amber-500" />
                </div>
                <span className="text-xl font-bold tabular-nums font-mono text-amber-700 dark:text-amber-500 pl-1 leading-tight" data-alvo-feitico="valor" data-nome-feitico="Projeção do mês">
                  {formatCurrency(projecaoMes)}
                </span>
                <span className="text-[11px] text-muted-foreground pl-1">ritmo atual</span>
              </motion.div>
            </motion.div>
          )}

        </motion.div>
      </motion.div>
    </div>
  );
}

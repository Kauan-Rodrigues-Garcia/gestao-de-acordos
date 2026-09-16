/**
 * PainelDiretoriaComercial — o Painel Diretoria, no desenho da BookPlay.
 *
 * ## O pedido de 16/09/2026
 *
 * «Painel diretoria também faça referente ao modelo da BookPlay, trocando a
 * lógica para prospecção e não contendo cobrança — porém a estética, o modelo
 * de informações entre outros siga a da BookPlay.»
 *
 * Então é o esqueleto de `pages/PainelDiretoria` com as abas que a BookPlay
 * abre para a diretoria — Visão geral, Setores e equipes, Por pessoa — e a
 * fonte trocada: onde lá se lê o recebimento do 59, aqui se lê o faturamento
 * das vendas **confirmadas e assinadas**, pelo dia da confirmação.
 *
 * ## A comparação é sempre no mesmo corte
 *
 * A regra da Visão geral da BookPlay vale inteira: todo número respeita o dia
 * de corte, e o mês anterior é medido até o MESMO dia. Comparar setembro até
 * o dia 16 com agosto inteiro mostra uma queda que é do calendário. O corte
 * nasce em hoje, e muda pelo mesmo botão (`FiltroDePeriodo`).
 *
 * ## O que ficou de fora, de propósito
 *
 * - **Conferência.** «A conta do setor fecha?» é o Fechamento do Setor, em
 *   Importar Vendas. Repetir aqui uma versão resumida criaria dois lugares
 *   onde a conta do setor é mostrada.
 * - **Cobrança.** Nada de recebido de acordo, agendado, H.O. ou quartil de
 *   recebimento. O quartil que aparece nos cards é o da projeção de VENDAS
 *   contra a meta de vendas, com as faixas padrão.
 *
 * ## A régua da meta manda na projeção, não no dinheiro
 *
 * Os valores da tela são sempre faturamento — é a leitura de diretoria. A
 * projeção e o quartil de cada card usam a régua que a meta escolheu: um
 * setor medido por quantidade é projetado em quantidade.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ResponsiveContainer, ComposedChart, Area, Bar, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import {
  TrendingUp, TrendingDown, RefreshCw, Building2, Users, Wallet, Activity,
  ShoppingBag, ArrowUpRight, ArrowLeft, ChevronRight, CheckCircle2, Target,
  CalendarClock, Bot, MapPin, Scale, Layers,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { SeletorMes } from '@/components/AnalyticsPanel/SeletorMes';
import { PontoDaLegenda } from '@/components/PainelMetas/PontoDaLegenda';
import { useAxisColors, useChartColors } from '@/hooks/useChartColors';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { useMesGlobal } from '@/providers/MesProvider';
import { useSubAbaUso } from '@/providers/RastreioUsoProvider';
import { useVendas } from '@/hooks/useVendas';
import { useVendasPlacar } from '@/hooks/useVendasPlacar';
import { formatBRL } from '@/lib/money';
import { ROUTE_PATHS } from '@/lib/index';
import {
  deslocarMes, diasDecorridos, diasNoMes, partesDoMes, primeiroDiaDoMes,
  rotuloDoMes, ultimoDiaDoMes,
} from '@/lib/mesReferencia';
import { diasUteisDoMes, diasUteisDecorridos, corProjecao, QUARTIS_PADRAO } from '@/lib/diasUteis';
import { calcularProjecao } from '@/lib/projecaoMetas';
import { agruparFormas, corDaForma } from '@/lib/formasPagamento';
import type { PropsTooltipGrafico } from '@/lib/recharts-tooltip';
import { cn } from '@/lib/utils';
import {
  GAVETA_LABELS, diaDaVenda, resumirVendas, type GavetaVenda, type ResumoVendas,
} from '@/lib/vendas';
import {
  equipeDaVenda, placarPorOperador, separarAutomacao, totalDoRecorte,
  vendasPorFormaDePagamento, vendasPorUF, type IndicePessoas, type LinhaDoPlacar,
} from '@/lib/vendasPlacar';
import {
  ajustarMetaPorPresenca, ehRegua, fatorDePresenca, REGUA_LABEL, type ReguaMeta,
} from '@/lib/vendasMeta';
import { COR_DA_GAVETA, ticketMedio } from '@/lib/vendasDashboard';
import { intensidadeDaBarra, variacao } from '@/services/mestre/diretoria.service';
import { buscarMetasDoMes, type MetaDeRecorte } from '@/services/vendas/metasVendas.service';
import { buscarVendas, type Venda } from '@/services/vendas/vendas.service';
import { SeloQuartil, SeloVariacao as Selo } from '@/pages/PainelDiretoria/components';
import { FiltroDePeriodo } from '@/pages/PainelDiretoria/FiltroDePeriodo';
import { Faixa } from './componentes';

/** Enquanto o tema não resolveu (primeiro quadro), a série usa isto. */
const FALLBACK_PRIMARIA = '#3b82f6';
const FALLBACK_ANTERIOR = '#94a3b8';

type AbaDoPainel = 'visao' | 'setores' | 'pessoas';

const pct1 = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const iniciais = (nome: string) =>
  nome.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();

/** O dia do mês (1..31) em que a venda conta — o da confirmação. */
const diaDe = (v: Venda) => Number(diaDaVenda(v, 'confirmacao').slice(8, 10));

// ─── O mês anterior, inteiro ──────────────────────────────────────────────────

/**
 * As vendas do mês anterior, linha a linha.
 *
 * `useVendasMesAnterior` devolve só o resumo do mês fechado, e aqui a
 * comparação é no MESMO corte — é preciso o dia de cada venda para cortar.
 */
function useVendasDoMesAnterior(empresaId: string | null, mes: string, versao: number) {
  const anterior = deslocarMes(mes, -1);
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    if (!empresaId) { setVendas([]); return; }
    let vivo = true;
    setCarregando(true);
    void buscarVendas({
      empresaId, de: primeiroDiaDoMes(anterior), ate: ultimoDiaDoMes(anterior), eixo: 'confirmacao',
    }).then(r => {
      if (!vivo) return;
      setVendas(r.disponivel ? r.vendas : []);
      setCarregando(false);
    });
    return () => { vivo = false; };
  }, [empresaId, anterior, versao]);

  return { mes: anterior, vendas, carregando };
}

// ─── Recortes ─────────────────────────────────────────────────────────────────

/** Um setor ou uma equipe, com o que os cards e o detalhe precisam. */
interface Recorte {
  tipo: 'setor' | 'equipe';
  id: string;
  nome: string;
  setorId: string | null;
  vendas: Venda[];
  vendasAnteriores: Venda[];
  resumo: ResumoVendas;
  resumoAnterior: ResumoVendas;
  /** Pessoas do cadastro no recorte, sem robô nem desligado. */
  pessoas: number;
  /**
   * Projeção contra a meta, na régua da meta. `alvo` é a meta já descontada a
   * ausência, e é contra ele que `pct` e `esperado` foram medidos.
   */
  projecao: {
    pct: number; quartil: number | null; esperado: number; regua: ReguaMeta; alvo: number;
  } | null;
}

function projecaoDoRecorte(params: {
  meta: MetaDeRecorte | undefined;
  fator: number | null;
  resumo: ResumoVendas;
  mes: string;
  corte: number;
}): Recorte['projecao'] {
  const { meta, fator, resumo, mes, corte } = params;
  if (!meta || !ehRegua(meta.regua)) return null;
  const ajustada = ajustarMetaPorPresenca(
    { regua: meta.regua, quantidade: meta.quantidade, valor: meta.valor }, fator,
  );
  const alvo = meta.regua === 'quantidade' ? ajustada.quantidade : ajustada.valor;
  if (alvo <= 0) return null;
  const { ano, mes: m } = partesDoMes(mes);
  const corteIso = `${mes}-${String(Math.max(1, corte)).padStart(2, '0')}`;
  const r = calcularProjecao({
    meta: alvo,
    recebido: meta.regua === 'quantidade' ? resumo.quantidade : resumo.valor,
    totalUteis: diasUteisDoMes(ano, m),
    decorridos: diasUteisDecorridos(ano, m, [], corteIso),
    quartis: QUARTIS_PADRAO,
  });
  return r ? {
    pct: r.projecaoPct, quartil: r.quartil?.quartil ?? null, esperado: r.esperado,
    regua: meta.regua, alvo,
  } : null;
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function PainelDiretoriaComercial() {
  const { empresa } = useEmpresa();
  const { temPermissao } = useCargoPermissoes();
  const { mes, setMes } = useMesGlobal();
  const [searchParams, setSearchParams] = useSearchParams();

  const empresaId = empresa?.id ?? null;
  const ativo = Boolean(empresaId);

  // O «Atualizar» do cabeçalho relê as três fontes por contador.
  const [versao, setVersao] = useState(0);
  const { vendas, carregando, disponivel, erro, recarregar } =
    useVendas({ empresaId, mes, eixo: 'confirmacao', ativo });
  const placar = useVendasPlacar({ empresaId, mes, ativo });
  const anterior = useVendasDoMesAnterior(empresaId, mes, versao);

  const [metas, setMetas] = useState<MetaDeRecorte[]>([]);
  useEffect(() => {
    if (!empresaId || !temPermissao('ver_metas_vendas')) { setMetas([]); return; }
    const { ano, mes: m } = partesDoMes(mes);
    void buscarMetasDoMes(empresaId, ano, m).then(r => setMetas(r.dado ?? []));
  }, [empresaId, mes, temPermissao, versao]);

  // ── Abas ────────────────────────────────────────────────────────────────
  const pedida = searchParams.get('tab');
  const aba: AbaDoPainel = pedida === 'setores' || pedida === 'pessoas' ? pedida : 'visao';
  useSubAbaUso(aba);
  const irPara = useCallback((k: AbaDoPainel) => {
    const p = new URLSearchParams(searchParams);
    p.set('tab', k);
    setSearchParams(p, { replace: true });
  }, [searchParams, setSearchParams]);

  // ── O corte ─────────────────────────────────────────────────────────────
  // Trocar de mês zera o corte: o dia 20 de agosto e o de setembro são pontos
  // diferentes do mês, e herdar o anterior mostraria um recorte que ninguém pediu.
  const [corteEscolhido, setCorteEscolhido] = useState<number | null>(null);
  useEffect(() => { setCorteEscolhido(null); }, [mes]);

  const totalDias = diasNoMes(mes);
  const corte = Math.min(totalDias, Math.max(1, corteEscolhido ?? diasDecorridos(mes)));
  const mesFechado = corte >= totalDias;
  // Com o mês inteiro, o anterior também vai inteiro — fevereiro não para no 28
  // de um março de 31 dias.
  const corteAnterior = mesFechado ? diasNoMes(anterior.mes) : Math.min(corte, diasNoMes(anterior.mes));

  const vendasNoCorte = useMemo(() => vendas.filter(v => diaDe(v) <= corte), [vendas, corte]);
  const anterioresNoCorte = useMemo(
    () => anterior.vendas.filter(v => diaDe(v) <= corteAnterior),
    [anterior.vendas, corteAnterior],
  );
  const temAnterior = anterior.vendas.length > 0;

  // ── Os recortes: setores e equipes ───────────────────────────────────────
  const recortes = useMemo(() => {
    const nomesSetor = new Map<string, string>();
    const equipes = new Map<string, { nome: string; setorId: string | null }>();
    for (const p of placar.pessoas) {
      if (p.setor_id && p.setor_nome) nomesSetor.set(p.setor_id, p.setor_nome);
      if (p.equipe_id && p.equipe_nome) equipes.set(p.equipe_id, { nome: p.equipe_nome, setorId: p.setor_id });
    }
    for (const m of metas) {
      if (m.tipo === 'setor') nomesSetor.set(m.referencia_id, m.nome);
      else if (!equipes.has(m.referencia_id)) equipes.set(m.referencia_id, { nome: m.nome, setorId: m.setor_id });
    }
    for (const v of [...vendasNoCorte, ...anterioresNoCorte]) {
      if (v.setor_id && !nomesSetor.has(v.setor_id)) nomesSetor.set(v.setor_id, 'Setor não cadastrado');
    }

    const gente = placar.pessoas.filter(p => !p.robo && p.situacao !== 'desligado');
    const montar = (
      tipo: Recorte['tipo'], id: string, nome: string, setorId: string | null,
      pertence: (v: Venda) => boolean,
    ): Recorte => {
      const doRecorte = vendasNoCorte.filter(pertence);
      const antes = anterioresNoCorte.filter(pertence);
      const resumo = resumirVendas(doRecorte);
      const presenca = placar.presencaPorRecorte.get(id);
      return {
        tipo, id, nome, setorId,
        vendas: doRecorte,
        vendasAnteriores: antes,
        resumo,
        resumoAnterior: resumirVendas(antes),
        pessoas: gente.filter(p => (tipo === 'setor' ? p.setor_id : p.equipe_id) === id).length,
        projecao: projecaoDoRecorte({
          meta: metas.find(m => m.tipo === tipo && m.referencia_id === id),
          fator: presenca ? fatorDePresenca(presenca) : null,
          resumo, mes, corte,
        }),
      };
    };

    const setores = [...nomesSetor]
      .map(([id, nome]) => montar('setor', id, nome, id, v => v.setor_id === id))
      .sort((a, b) => b.resumo.valor - a.resumo.valor);
    const equipesMontadas = [...equipes]
      .map(([id, e]) => montar('equipe', id, e.nome, e.setorId,
        v => equipeDaVenda(v, placar.indice) === id))
      .sort((a, b) => b.resumo.valor - a.resumo.valor);

    return { setores, equipes: equipesMontadas };
  }, [placar.pessoas, placar.indice, placar.presencaPorRecorte, metas, vendasNoCorte,
      anterioresNoCorte, mes, corte]);

  // ── Cabeçalho ───────────────────────────────────────────────────────────
  const agora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const atualizando = carregando || placar.carregando || anterior.carregando;
  const carregandoTudo = atualizando && vendas.length === 0 && placar.pessoas.length === 0;
  const atualizar = () => { recarregar(); placar.recarregar(); setVersao(v => v + 1); };

  if (!empresaId) return null;

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-[1600px] mx-auto">

      {/* ── Cabeçalho ─────────────────────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
        className="relative rounded-2xl border border-border/40 bg-card/95 shadow-sm overflow-hidden"
      >
        <div className="h-1 w-full bg-gradient-to-r from-primary via-chart-3 to-chart-5" />
        <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-1">
              <span className="font-semibold uppercase tracking-widest">Painel Executivo · Comercial</span>
              <span className="opacity-40">›</span>
              <span className="capitalize font-medium text-foreground/70">{rotuloDoMes(mes)}</span>
            </div>
            <h1 className="text-2xl font-extrabold text-foreground flex items-center gap-2.5 tracking-tight">
              <div className="p-1.5 rounded-lg bg-primary/10 border border-primary/20">
                <TrendingUp className="w-5 h-5 text-primary" />
              </div>
              Painel Diretoria
            </h1>
            <div className="flex items-center gap-2 mt-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
              <p className="text-[11px] text-muted-foreground">
                Atualizado às <span className="font-semibold text-foreground/80">{agora}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="rounded-xl border border-border/50 bg-background/60 px-1.5 h-9 flex items-center">
              <SeletorMes mes={mes} onChange={setMes} desabilitado={carregando} />
            </div>
            <Button variant="outline" size="sm" onClick={atualizar} disabled={atualizando}
              className="rounded-xl h-9 border-border/50 bg-background/60 hover:bg-accent/40"
            >
              <RefreshCw className={cn('w-3.5 h-3.5 mr-1.5', atualizando && 'animate-spin')} />
              Atualizar
            </Button>
          </div>
        </div>
      </motion.div>

      {/* ── Abas internas ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 border-b border-border/40 overflow-x-auto">
        {([
          { key: 'visao',   label: 'Visão geral',       Icon: TrendingUp },
          { key: 'setores', label: 'Setores e equipes', Icon: Building2 },
          { key: 'pessoas', label: 'Por pessoa',        Icon: Users },
        ] as const).map(({ key, label, Icon }) => (
          <button key={key} type="button" onClick={() => irPara(key)}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap',
              aba === key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
            )}
          >
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
      </div>

      {!disponivel && (
        <Faixa tom="alerta">
          A aba Vendas não respondeu. <strong>Recarregue a página</strong>; se persistir, confira
          se a migration <code className="mx-1 rounded bg-muted px-1 py-0.5 text-[11px]">
            20260915100000_vendas_fase1.sql</code> está aplicada.
        </Faixa>
      )}
      {erro && <Faixa tom="alerta">{erro}</Faixa>}

      {carregandoTudo ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[104px] rounded-xl" />)}
          </div>
          <Skeleton className="h-[340px] rounded-xl" />
        </div>
      ) : (
        <motion.div
          key={aba}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="space-y-4 pb-16"
        >
          {/* ── Barra de contexto: o que está sendo medido, e o filtro ───── */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              <span className="font-semibold text-foreground">
                {mesFechado ? `${rotuloDoMes(mes)} inteiro` : `1 a ${corte} de ${rotuloDoMes(mes)}`}
              </span>
              {temAnterior
                ? <> · comparado com o mesmo trecho de {rotuloDoMes(anterior.mes)}</>
                : <> · sem vendas de {rotuloDoMes(anterior.mes)} importadas para comparar</>}
              {' · '}vendas confirmadas e assinadas, pelo dia da confirmação
            </p>
            <FiltroDePeriodo
              mes={mes}
              corte={corte}
              diasNoMes={totalDias}
              escolhido={corteEscolhido}
              onEscolher={setCorteEscolhido}
            />
          </div>

          {aba === 'visao' && (
            <VisaoGeral
              mes={mes}
              mesAnterior={anterior.mes}
              corte={corte}
              corteAnterior={corteAnterior}
              mesFechado={mesFechado}
              vendas={vendasNoCorte}
              anteriores={anterioresNoCorte}
              temAnterior={temAnterior}
              indice={placar.indice}
              pessoasNoCadastro={placar.pessoas.filter(p => !p.robo && p.situacao !== 'desligado').length}
              setores={recortes.setores}
              equipes={recortes.equipes}
              metas={metas}
              podeVerMetas={temPermissao('ver_metas_vendas')}
              onAbrirSetores={() => irPara('setores')}
            />
          )}
          {aba === 'setores' && (
            <SetoresEEquipes
              mes={mes}
              mesAnterior={anterior.mes}
              corte={corte}
              corteAnterior={corteAnterior}
              temAnterior={temAnterior}
              setores={recortes.setores}
              equipes={recortes.equipes}
              indice={placar.indice}
            />
          )}
          {aba === 'pessoas' && (
            <PorPessoa
              vendas={vendasNoCorte}
              anteriores={anterioresNoCorte}
              temAnterior={temAnterior}
              indice={placar.indice}
            />
          )}
        </motion.div>
      )}
    </div>
  );
}

// ─── Peças pequenas ───────────────────────────────────────────────────────────

function Numero({
  rotulo, valor, sub, Icone, destaque,
}: {
  rotulo: string; valor: string; sub?: React.ReactNode;
  Icone: typeof Wallet; destaque?: boolean;
}) {
  return (
    <div className={cn(
      'rounded-xl border bg-card p-4 shadow-sm',
      destaque ? 'border-primary/40' : 'border-border/70',
    )}>
      <div className="flex items-center gap-2">
        <span className={cn(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
          destaque ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground',
        )}>
          <Icone className="h-3.5 w-3.5" />
        </span>
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {rotulo}
        </span>
      </div>
      <p className={cn(
        'mt-2 font-mono font-bold tabular-nums',
        destaque ? 'text-2xl text-foreground' : 'text-lg text-foreground',
      )}>
        {valor}
      </p>
      {sub && <div className="mt-1 text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function Barra({ valor, maior }: { valor: number; maior: number }) {
  const largura = maior ? Math.max(2, (valor / maior) * 100) : 0;
  return (
    <span className="hidden h-2 w-[22%] shrink-0 overflow-hidden rounded-full bg-muted/60 sm:block">
      <span
        className="block h-full rounded-full bg-primary"
        style={{ width: `${largura}%`, opacity: intensidadeDaBarra(valor, maior) }}
      />
    </span>
  );
}

// ─── O ritmo ──────────────────────────────────────────────────────────────────

function TooltipRitmo({ active, payload, label }: PropsTooltipGrafico) {
  if (!active || !payload?.length) return null;
  /* Por `name`, e não por índice: a ordem das séries segue a do JSX. */
  const atual    = Number(payload.find(p => p.name === 'Este mês')?.value ?? 0);
  const antes    = Number(payload.find(p => p.name === 'Mês anterior')?.value ?? 0);
  const v = variacao(atual, antes);
  return (
    <div className="min-w-[190px] rounded-xl border border-border/60 bg-popover/95 p-3 text-xs shadow-xl backdrop-blur-sm">
      <p className="mb-2 border-b border-border/40 pb-1.5 font-semibold text-foreground">Dia {label}</p>
      <p className="flex justify-between gap-4">
        <span className="text-muted-foreground">Este mês</span>
        <span className="font-mono font-bold text-foreground">{formatBRL(atual)}</span>
      </p>
      <p className="mt-1 flex justify-between gap-4">
        <span className="text-muted-foreground">Mês anterior</span>
        <span className="font-mono text-muted-foreground">{formatBRL(antes)}</span>
      </p>
      {v !== null && (
        <div className="mt-2 border-t border-border/40 pt-1.5"><Selo pct={v} /></div>
      )}
    </div>
  );
}

/**
 * «Acumulado» é uma corrida contra o mês passado: área preenchida. «Por dia» é
 * um evento por dia: barra. O mês anterior é a régua, tracejado nos dois — é o
 * mesmo gráfico da Visão geral da BookPlay, com vendas no lugar do 59.
 */
function GraficoRitmo({
  mes, mesAnterior, vendas, anteriores, corte, corteAnterior, titulo,
}: {
  mes: string; mesAnterior: string;
  vendas: readonly Venda[]; anteriores: readonly Venda[];
  corte: number; corteAnterior: number;
  titulo: string;
}) {
  const [modo, setModo] = useState<'acumulado' | 'dia'>('acumulado');
  const { tickColor, gridColor } = useAxisColors();
  const cores = useChartColors(['--azul-bookplay', '--muted-foreground']);
  const corAtual    = cores['--azul-bookplay']    ?? FALLBACK_PRIMARIA;
  const corAnterior = cores['--muted-foreground'] ?? FALLBACK_ANTERIOR;

  const serie = useMemo(() => {
    const dias = Math.max(diasNoMes(mes), corteAnterior);
    const somar = (lista: readonly Venda[]) => {
      const porDia = new Array<number>(dias + 1).fill(0);
      for (const v of lista) {
        if (!v.conta_na_meta) continue;
        const d = diaDe(v);
        if (d >= 1 && d <= dias) porDia[d] += Number(v.valor_total) || 0;
      }
      return porDia;
    };
    const a = somar(vendas);
    const b = somar(anteriores);
    let acA = 0, acB = 0;
    return Array.from({ length: dias }, (_, i) => {
      const dia = i + 1;
      acA += a[dia]; acB += b[dia];
      const dentro = dia <= corte;
      const dentroAnt = dia <= corteAnterior;
      return {
        dia,
        // Depois do corte não há dado: `null` interrompe a linha, e `0`
        // desenharia uma queda a pique até o fim do mês.
        valor: dentro ? (modo === 'acumulado' ? acA : a[dia]) : null,
        valorAnterior: dentroAnt ? (modo === 'acumulado' ? acB : b[dia]) : null,
      };
    });
  }, [vendas, anteriores, mes, corte, corteAnterior, modo]);

  const gradiente = `gradienteRitmoComercial-${titulo.replace(/\W+/g, '')}`;

  return (
    <section className="rounded-xl border border-border/70 bg-card p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{titulo}</h3>
          <p className="text-[11px] text-muted-foreground">
            Faturamento na régua e comparação com {rotuloDoMes(mesAnterior)}, no mesmo dia de corte.
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-border p-0.5">
          {([['acumulado', 'Acumulado'], ['dia', 'Por dia']] as const).map(([k, r]) => (
            <button
              key={k}
              type="button"
              onClick={() => setModo(k)}
              aria-pressed={modo === k}
              className={cn(
                'rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors',
                modo === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={serie} margin={{ top: 6, right: 8, bottom: 0, left: -6 }}>
            <defs>
              <linearGradient id={gradiente} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor={corAtual} stopOpacity={0.35} />
                <stop offset="100%" stopColor={corAtual} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
            <XAxis dataKey="dia" tick={{ fontSize: 10, fill: tickColor }} stroke={gridColor} tickLine={false} />
            <YAxis
              tick={{ fontSize: 10, fill: tickColor }} stroke={gridColor} tickLine={false} axisLine={false}
              width={52} tickFormatter={v => `${Math.round(Number(v) / 1000)}k`}
            />
            <Tooltip
              content={<TooltipRitmo />}
              cursor={modo === 'dia'
                ? { fill: corAtual, fillOpacity: 0.08 }
                : { stroke: corAtual, strokeWidth: 1, strokeDasharray: '4 4' }}
            />
            <Line
              type="monotone" dataKey="valorAnterior" name="Mês anterior"
              stroke={corAnterior} strokeWidth={1.5} strokeOpacity={0.7}
              strokeDasharray="5 4" dot={false} isAnimationActive={false}
            />
            {modo === 'dia' ? (
              <Bar dataKey="valor" name="Este mês" fill={corAtual} radius={[3, 3, 0, 0]}
                maxBarSize={22} isAnimationActive={false} />
            ) : (
              <Area type="monotone" dataKey="valor" name="Este mês" stroke={corAtual} strokeWidth={2.5}
                fill={`url(#${gradiente})`} dot={false} isAnimationActive={false} connectNulls={false} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-4 border-t border-border/50 pt-2.5 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <i className={cn('shrink-0', modo === 'dia' ? 'h-2.5 w-2.5 rounded-sm' : 'h-0.5 w-4 rounded-full')}
            style={{ background: corAtual }} />
          Este mês
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="h-0.5 w-4 rounded-full opacity-70"
            style={{ background: `repeating-linear-gradient(90deg, ${corAnterior} 0 4px, transparent 4px 7px)` }} />
          {rotuloDoMes(mesAnterior)}
        </span>
      </div>
    </section>
  );
}

// ─── Aba: Visão geral ─────────────────────────────────────────────────────────

const GAVETAS_FORA: readonly GavetaVenda[] = ['pendente_assinatura', 'aberta', 'devolvida', 'cancelada'];

function VisaoGeral({
  mes, mesAnterior, corte, corteAnterior, mesFechado, vendas, anteriores, temAnterior,
  indice, pessoasNoCadastro, setores, equipes, metas, podeVerMetas, onAbrirSetores,
}: {
  mes: string; mesAnterior: string; corte: number; corteAnterior: number; mesFechado: boolean;
  vendas: Venda[]; anteriores: Venda[]; temAnterior: boolean;
  indice: IndicePessoas; pessoasNoCadastro: number;
  setores: Recorte[]; equipes: Recorte[];
  metas: MetaDeRecorte[]; podeVerMetas: boolean;
  onAbrirSetores: () => void;
}) {
  const total = useMemo(() => totalDoRecorte(vendas, indice), [vendas, indice]);
  const resumo = total.resumo;
  const resumoAnterior = useMemo(() => resumirVendas(anteriores), [anteriores]);
  const [formaAberta, setFormaAberta] = useState<string | null>(null);
  const [formaSobre, setFormaSobre] = useState<string | null>(null);

  const varTotal = temAnterior ? variacao(resumo.valor, resumoAnterior.valor) : null;
  const varQtd = temAnterior ? variacao(resumo.quantidade, resumoAnterior.quantidade) : null;
  const diferenca = resumo.valor - resumoAnterior.valor;
  const ticket = ticketMedio(resumo);

  // A estimativa é por dia ÚTIL: venda acontece em dia de trabalho, e dividir
  // pelos corridos puxaria a projeção para baixo a cada fim de semana.
  const estimativa = useMemo(() => {
    if (mesFechado || resumo.valor <= 0) return null;
    const { ano, mes: m } = partesDoMes(mes);
    const corteIso = `${mes}-${String(corte).padStart(2, '0')}`;
    const feitos = diasUteisDecorridos(ano, m, [], corteIso);
    const uteis = diasUteisDoMes(ano, m);
    return feitos > 0 ? (resumo.valor / feitos) * uteis : null;
  }, [mesFechado, resumo.valor, mes, corte]);

  const equipeMaior = equipes.find(e => e.resumo.valor > 0);

  // Quem cresceu mais e quem caiu mais, entre as equipes. Só com base.
  const comVariacao = temAnterior
    ? equipes
        .map(e => ({ e, v: variacao(e.resumo.valor, e.resumoAnterior.valor) }))
        .filter((x): x is { e: Recorte; v: number } => x.v !== null)
    : [];
  const destaque = [...comVariacao].sort((a, b) => b.v - a.v)[0];
  const atencao  = [...comVariacao].sort((a, b) => a.v - b.v)[0];

  // ── A meta do setor ─────────────────────────────────────────────────────
  const setorDaMeta = setores.find(s => s.projecao !== null) ?? null;
  const metaDoSetor = setorDaMeta
    ? metas.find(m => m.tipo === 'setor' && m.referencia_id === setorDaMeta.id)
    : undefined;

  // ── Como o dinheiro chega ───────────────────────────────────────────────
  const grupos = useMemo(() => {
    const antes = new Map(vendasPorFormaDePagamento(anteriores).map(f => [f.chave, f.valor]));
    return agruparFormas(vendasPorFormaDePagamento(vendas).map(f => ({
      forma: f.rotulo, valor: f.valor, qtd: f.quantidade, valorAnterior: antes.get(f.chave) ?? 0,
    })));
  }, [vendas, anteriores]);
  const totalFormas = grupos.reduce((s, g) => s + g.valor, 0);
  const maiorGrupo = grupos[0];

  const ufs = useMemo(() => vendasPorUF(vendas), [vendas]);

  return (
    <>
      {/* ── Os quatro números ──────────────────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Numero
          destaque
          Icone={Wallet}
          rotulo="Faturamento no período"
          valor={formatBRL(resumo.valor)}
          sub={
            <span className="flex flex-wrap items-center gap-1.5">
              <Selo pct={varTotal} />
              <span>
                {mesFechado ? 'mês fechado' : `até o dia ${corte}`}
                {temAnterior && ` · ${formatBRL(resumoAnterior.valor)} antes`}
              </span>
            </span>
          }
        />
        <Numero
          Icone={Activity}
          rotulo={mesFechado ? 'Média por venda' : 'Fecha o mês em'}
          valor={mesFechado
            ? (ticket === null ? '—' : formatBRL(ticket))
            : (estimativa === null ? '—' : formatBRL(estimativa))}
          sub={mesFechado
            ? `${resumo.quantidade} vendas na régua`
            : 'mantendo o ritmo por dia útil · estimativa'}
        />
        <Numero
          Icone={ShoppingBag}
          rotulo="Vendas na régua"
          valor={resumo.quantidade.toLocaleString('pt-BR')}
          sub={
            <span className="flex flex-wrap items-center gap-1.5">
              <Selo pct={varQtd} />
              <span>ticket médio {ticket === null ? '—' : formatBRL(ticket)}</span>
            </span>
          }
        />
        <Numero
          Icone={Users}
          rotulo="Pessoas com venda"
          valor={`${total.pessoasQueVenderam}`}
          sub={<>
            de {pessoasNoCadastro} no cadastro
            {equipeMaior && <> · maior: <strong className="text-foreground">{equipeMaior.nome}</strong></>}
          </>}
        />
      </div>

      {/* ── A meta e o que ficou fora da régua ─────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-border/70 bg-card p-4 shadow-sm">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Target className="h-3.5 w-3.5 text-muted-foreground" /> Meta do mês
          </h3>
          {setorDaMeta?.projecao && metaDoSetor ? (() => {
            const p = setorDaMeta.projecao;
            const feito = p.regua === 'quantidade' ? setorDaMeta.resumo.quantidade : setorDaMeta.resumo.valor;
            const alvoCheio = p.regua === 'quantidade' ? metaDoSetor.quantidade : metaDoSetor.valor;
            // A barra e o texto medem contra a meta DESCONTADA, a mesma da
            // projeção ao lado. A cheia aparece junto quando as duas diferem —
            // meta que desce sem explicação se lê como defeito.
            const descontada = p.alvo < alvoCheio;
            const fmt = (n: number) => (p.regua === 'quantidade' ? `${Math.round(n)} vendas` : formatBRL(n));
            const cor = corProjecao(p.pct);
            return (
              <div className="mt-3 space-y-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-[11px] text-muted-foreground">
                    {setorDaMeta.nome} · {REGUA_LABEL[p.regua].toLowerCase()}
                  </span>
                  <span className="flex items-center gap-1.5">
                    {p.quartil !== null && <SeloQuartil quartil={p.quartil} />}
                    <span className="font-mono text-xl font-bold tabular-nums" style={{ color: cor }}>
                      {pct1(p.pct)}%
                    </span>
                    <span className="text-[10px] text-muted-foreground">da projeção</span>
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted/60">
                  <div className="h-full rounded-full transition-[width] duration-500"
                    style={{ width: `${Math.min(100, p.alvo > 0 ? (feito / p.alvo) * 100 : 0)}%`, background: cor }} />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  <span className="font-mono font-semibold text-foreground">{fmt(feito)}</span>
                  {' '}de {fmt(p.alvo)}
                  {descontada && <> (<span className="line-through">{fmt(alvoCheio)}</span>, descontada a ausência)</>}
                  {' '}· esperado até o dia {corte}: {fmt(p.esperado)}
                </p>
              </div>
            );
          })() : (
            <div className="mt-3 rounded-lg border border-dashed border-border bg-muted/20 px-3 py-2.5">
              <p className="text-[11px] leading-snug text-muted-foreground">
                Nenhum setor com meta de vendas configurada para {rotuloDoMes(mes)} — a projeção e o
                quartil aparecem assim que ela existir.{' '}
                {podeVerMetas && (
                  <Link to={`${ROUTE_PATHS.ADMIN_USUARIOS}?tab=metas`} className="font-medium text-primary hover:underline">
                    Configurar em Usuários › Metas
                  </Link>
                )}
              </p>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-border/70 bg-card p-4 shadow-sm">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Layers className="h-3.5 w-3.5 text-muted-foreground" /> Fora da régua no período
          </h3>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            O que foi vendido e não conta: não assinou, não confirmou, voltou ou caiu.
          </p>
          <ul className="mt-2 divide-y divide-border/40">
            {GAVETAS_FORA.map(g => (
              <li key={g} className="flex items-center gap-2 py-1.5 text-xs">
                <PontoDaLegenda cor={COR_DA_GAVETA[g]} />
                <span className="min-w-0 flex-1 truncate font-medium text-foreground">{GAVETA_LABELS[g]}</span>
                <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                  {resumo.porGaveta[g]}
                </span>
                <span className="w-[104px] shrink-0 text-right font-mono tabular-nums text-foreground">
                  {formatBRL(resumo.valorPorGaveta[g])}
                </span>
                <span className="hidden w-[92px] shrink-0 text-right font-mono text-[10px] tabular-nums text-muted-foreground sm:block">
                  {temAnterior ? `antes ${formatBRL(resumoAnterior.valorPorGaveta[g])}` : ''}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 border-t border-border/50 pt-2 text-[11px] text-muted-foreground">
            Devolução <strong className="text-foreground">
              {resumo.pctDevolucao === null ? '—' : `${pct1(resumo.pctDevolucao * 100)}%`}</strong>
            {' · '}cancelamento <strong className="text-foreground">
              {resumo.pctCancelamento === null ? '—' : `${pct1(resumo.pctCancelamento * 100)}%`}</strong>
            {' '}sobre o que foi confirmado.
          </p>
        </section>
      </div>

      {/* ── A automação, dita em voz alta ──────────────────────────────── */}
      {total.valorAutomacao > 0 && (
        <section className="rounded-xl border border-border/70 bg-card p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <Bot className="h-3.5 w-3.5 text-muted-foreground" /> Automação no período
              </h3>
              <p className="mt-0.5 max-w-[46rem] text-[11px] leading-relaxed text-muted-foreground">
                Vendas dos logins de automação. Elas <strong className="text-foreground">entram</strong> no
                faturamento acima e <strong className="text-foreground">não disputam</strong> o ranking
                por pessoa — foram confirmadas, assinadas e entraram no caixa do setor.
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="font-mono text-xl font-bold tabular-nums text-foreground">
                {formatBRL(total.valorAutomacao)}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {total.fracaoAutomacao !== null ? `${pct1(total.fracaoAutomacao * 100)}% do total · ` : ''}
                {total.quantidadeAutomacao} {total.quantidadeAutomacao === 1 ? 'venda' : 'vendas'}
              </p>
            </div>
          </div>
        </section>
      )}

      {/* ── Ritmo + leitura do período ─────────────────────────────────── */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <GraficoRitmo
          mes={mes} mesAnterior={mesAnterior}
          vendas={vendas} anteriores={anteriores}
          corte={corte} corteAnterior={corteAnterior}
          titulo="O ritmo das vendas"
        />

        <aside className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card p-4 shadow-sm">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            <Activity className="h-3 w-3" /> Leitura do período
          </span>

          {varTotal === null ? (
            <p className="text-sm text-muted-foreground">
              Sem vendas de {rotuloDoMes(mesAnterior)} importadas, não há comparação a fazer — só o
              valor deste mês.
            </p>
          ) : (
            <>
              <h4 className="text-lg font-bold leading-tight text-foreground">
                {varTotal >= 0 ? 'Acima do mês anterior.' : 'Abaixo do mês anterior.'}
              </h4>
              <p className="text-xs leading-relaxed text-muted-foreground">
                O faturamento está{' '}
                <strong className={varTotal >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
                  {formatBRL(Math.abs(diferenca))} {varTotal >= 0 ? 'acima' : 'abaixo'}
                </strong>{' '}
                do mesmo período de {rotuloDoMes(mesAnterior)}.
              </p>
            </>
          )}

          {destaque && (
            <div className="flex items-start gap-2 border-t border-border/50 pt-3">
              <TrendingUp className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
              <div className="text-xs">
                <p className="font-semibold text-foreground">{destaque.e.nome}</p>
                <p className="text-muted-foreground">
                  {destaque.v >= 0 ? 'cresceu' : 'caiu'} {pct1(Math.abs(destaque.v))}% contra o mês anterior.
                </p>
              </div>
            </div>
          )}

          {atencao && atencao.e.id !== destaque?.e.id && (
            <div className="flex items-start gap-2">
              {atencao.v < 0
                ? <TrendingDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                : <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />}
              <div className="text-xs">
                <p className="font-semibold text-foreground">{atencao.e.nome}</p>
                <p className="text-muted-foreground">
                  {atencao.v < 0 ? 'merece atenção: ' : 'segue no ritmo: '}
                  {pct1(Math.abs(atencao.v))}%{atencao.v < 0 ? ' abaixo' : ' acima'} do mês anterior.
                </p>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={onAbrirSetores}
            className="mt-auto inline-flex items-center gap-1 self-start text-xs font-semibold text-primary transition-opacity hover:opacity-80"
          >
            Explorar setores e equipes <ArrowUpRight className="h-3 w-3" />
          </button>
        </aside>
      </div>

      {/* ── Onde acontece + como o dinheiro chega ──────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="rounded-xl border border-border/70 bg-card p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Onde o resultado acontece</h3>
              <p className="text-[11px] text-muted-foreground">
                Faturamento por setor e pelas equipes de cada um
                {temAnterior && ' · variação contra o mês anterior'}.
              </p>
            </div>
            <Link to={`${ROUTE_PATHS.VENDAS_IMPORTAR}?tab=fechamento`}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:opacity-80">
              <Scale className="h-3 w-3" /> Conferir a conta do setor
            </Link>
          </div>
          <OndeAcontece setores={setores} equipes={equipes} temAnterior={temAnterior} />
        </section>

        <div className="space-y-4 self-start">
          <section className="rounded-xl border border-border/70 bg-card p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-foreground">Como o cliente paga</h3>
            <p className="text-[11px] text-muted-foreground">
              Participação no faturamento · clique para abrir as variações.
            </p>

            {grupos.length === 0 ? (
              <p className="mt-3 text-[11px] text-muted-foreground">Nenhuma venda na régua no período.</p>
            ) : (
              <>
                <div className="mt-3 flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full"
                  onMouseLeave={() => setFormaSobre(null)}>
                  {grupos.map(g => (
                    <span
                      key={g.chave}
                      title={`${g.rotulo}: ${formatBRL(g.valor)}`}
                      onMouseEnter={() => setFormaSobre(g.chave)}
                      style={{
                        width: `${totalFormas ? (g.valor / totalFormas) * 100 : 0}%`,
                        background: corDaForma(g.rotulo),
                        opacity: formaSobre === null || formaSobre === g.chave ? 1 : 0.3,
                      }}
                      className="transition-opacity"
                    />
                  ))}
                </div>

                <ul className="mt-3 divide-y divide-border/40">
                  {grupos.map(g => {
                    const abre = g.itens.length > 1;
                    const aberto = formaAberta === g.chave;
                    const parte = totalFormas ? (g.valor / totalFormas) * 100 : 0;
                    const cor = corDaForma(g.rotulo);
                    return (
                      <li key={g.chave}>
                        <button
                          type="button"
                          aria-disabled={!abre}
                          tabIndex={abre ? undefined : -1}
                          onClick={() => { if (abre) setFormaAberta(aberto ? null : g.chave); }}
                          onMouseEnter={() => setFormaSobre(g.chave)}
                          onMouseLeave={() => setFormaSobre(null)}
                          aria-expanded={abre ? aberto : undefined}
                          className={cn(
                            'flex w-full items-center gap-2 py-2 text-left text-xs transition-colors',
                            abre ? 'cursor-pointer hover:text-primary' : 'cursor-default',
                          )}
                        >
                          <ChevronRight className={cn('h-3 w-3 shrink-0 text-muted-foreground transition-transform',
                            !abre && 'invisible', aberto && 'rotate-90')} />
                          <i className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: cor }} />
                          <span className="min-w-0 flex-1 truncate font-medium text-foreground" title={g.rotulo}>
                            {g.rotulo}
                          </span>
                          <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                            {pct1(parte)}%
                          </span>
                          <span className="w-[92px] shrink-0 text-right font-mono tabular-nums text-foreground">
                            {formatBRL(g.valor)}
                          </span>
                        </button>
                        {abre && aberto && (
                          <ul className="mb-1.5 space-y-1 rounded-lg bg-muted/40 px-2 py-2">
                            {g.itens.map(f => (
                              <li key={f.forma} className="flex items-center gap-2 text-[11px]">
                                <span className="ml-3.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: cor, opacity: 0.6 }} />
                                <span className="min-w-0 flex-1 truncate text-muted-foreground" title={f.forma}>{f.forma}</span>
                                <span className="shrink-0 font-mono tabular-nums text-muted-foreground">
                                  {f.qtd.toLocaleString('pt-BR')}
                                </span>
                                <span className="w-[92px] shrink-0 text-right font-mono tabular-nums text-foreground">
                                  {formatBRL(f.valor)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>

                {maiorGrupo && totalFormas > 0 && (
                  <p className="mt-3 border-t border-border/50 pt-3 text-[11px] leading-relaxed text-muted-foreground">
                    <strong className="text-foreground">
                      {maiorGrupo.rotulo} representa {pct1((maiorGrupo.valor / totalFormas) * 100)}%
                    </strong>{' '}
                    do faturamento do período.
                  </p>
                )}
              </>
            )}
          </section>

          <section className="rounded-xl border border-border/70 bg-card p-4 shadow-sm">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <MapPin className="h-3.5 w-3.5 text-muted-foreground" /> Por estado
            </h3>
            {ufs.length === 0 ? (
              <p className="mt-2 text-[11px] text-muted-foreground">Nenhuma venda na régua no período.</p>
            ) : (
              <ul className="mt-2 space-y-1">
                {ufs.slice(0, 8).map(u => (
                  <li key={u.chave} className="flex items-center gap-2 text-xs">
                    <span className="w-14 shrink-0 truncate font-medium text-foreground">{u.rotulo}</span>
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted/60">
                      <span className="block h-full rounded-full bg-primary"
                        style={{ width: `${Math.max(2, u.fracao * 100)}%`, opacity: intensidadeDaBarra(u.fracao, 1) }} />
                    </span>
                    <span className="w-8 shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
                      {u.quantidade}
                    </span>
                    <span className="w-[92px] shrink-0 text-right font-mono tabular-nums text-foreground">
                      {formatBRL(u.valor)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {ufs.length > 8 && (
              <p className="mt-2 text-[11px] text-muted-foreground">e mais {ufs.length - 8} estados.</p>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

/** Setor por setor, com as equipes abertas no clique — como na BookPlay. */
function OndeAcontece({
  setores, equipes, temAnterior,
}: { setores: Recorte[]; equipes: Recorte[]; temAnterior: boolean }) {
  // Com um setor só, ele já nasce aberto: um clique para ver a única coisa
  // que há para ver é um clique a mais.
  const [abertos, setAbertos] = useState<Set<string>>(
    () => new Set(setores.length === 1 ? [setores[0].id] : []),
  );
  const maior = setores[0]?.resumo.valor ?? 0;

  if (setores.length === 0) {
    return <p className="text-[11px] text-muted-foreground">Nenhum setor com venda no período.</p>;
  }

  return (
    <div className="space-y-0.5">
      {setores.map(s => {
        const aberto = abertos.has(s.id);
        const doSetor = equipes.filter(e => e.setorId === s.id);
        const semEquipe = s.resumo.valor - doSetor.reduce((t, e) => t + e.resumo.valor, 0);
        return (
          <div key={s.id}>
            <button
              type="button"
              onClick={() => setAbertos(atual => {
                const novo = new Set(atual);
                if (novo.has(s.id)) novo.delete(s.id); else novo.add(s.id);
                return novo;
              })}
              aria-expanded={aberto}
              className="flex w-full items-center gap-3 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-muted/40"
            >
              <span className="flex min-w-0 flex-1 items-center gap-1.5">
                <ChevronRight className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', aberto && 'rotate-90')} />
                <span className="truncate text-xs font-semibold text-foreground" title={s.nome}>{s.nome}</span>
              </span>
              <Barra valor={s.resumo.valor} maior={maior} />
              <span className="w-[104px] shrink-0 text-right font-mono text-xs font-semibold tabular-nums text-foreground">
                {formatBRL(s.resumo.valor)}
              </span>
              <span className="w-[62px] shrink-0 text-right">
                <Selo pct={temAnterior ? variacao(s.resumo.valor, s.resumoAnterior.valor) : null} />
              </span>
            </button>

            {aberto && (
              <div className="mb-1 ml-5 border-l border-border/60 pl-2">
                {doSetor.length === 0 ? (
                  <p className="py-1 text-[11px] text-muted-foreground">Nenhuma equipe com venda no período.</p>
                ) : doSetor.map(e => (
                  <div key={e.id} className="flex items-center gap-3 rounded-md px-1.5 py-1 text-[11px]">
                    <span className="min-w-0 flex-1 truncate text-foreground">
                      {e.nome}
                      <span className="text-muted-foreground"> · {e.resumo.quantidade} {e.resumo.quantidade === 1 ? 'venda' : 'vendas'}</span>
                    </span>
                    <Barra valor={e.resumo.valor} maior={maior} />
                    <span className="w-[104px] shrink-0 text-right font-mono tabular-nums text-foreground">
                      {formatBRL(e.resumo.valor)}
                    </span>
                    <span className="w-[62px] shrink-0 text-right">
                      <Selo pct={temAnterior ? variacao(e.resumo.valor, e.resumoAnterior.valor) : null} />
                    </span>
                  </div>
                ))}
                {/* O que o setor tem e nenhuma equipe conta. Sem esta linha a
                    soma das equipes não fecha com o setor, e quem confere
                    conclui que um dos dois está errado. */}
                {semEquipe > 0.005 && (
                  <div className="flex items-center gap-3 rounded-md px-1.5 py-1 text-[11px]">
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">
                      sem equipe no cadastro · inclusive a automação
                    </span>
                    <Barra valor={semEquipe} maior={maior} />
                    <span className="w-[104px] shrink-0 text-right font-mono tabular-nums text-muted-foreground">
                      {formatBRL(semEquipe)}
                    </span>
                    <span className="w-[62px] shrink-0" />
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Aba: Setores e equipes ───────────────────────────────────────────────────

function SetoresEEquipes({
  mes, mesAnterior, corte, corteAnterior, temAnterior, setores, equipes, indice,
}: {
  mes: string; mesAnterior: string; corte: number; corteAnterior: number; temAnterior: boolean;
  setores: Recorte[]; equipes: Recorte[]; indice: IndicePessoas;
}) {
  const [alvo, setAlvo] = useState<{ tipo: Recorte['tipo']; id: string } | null>(null);
  // Trocar de mês fecha o detalhe: o recorte pode nem existir no outro mês.
  useEffect(() => { setAlvo(null); }, [mes]);

  const aberto = alvo
    ? (alvo.tipo === 'setor' ? setores : equipes).find(r => r.id === alvo.id) ?? null
    : null;

  if (aberto) {
    return (
      <DetalheDoRecorte
        recorte={aberto}
        mes={mes} mesAnterior={mesAnterior}
        corte={corte} corteAnterior={corteAnterior}
        temAnterior={temAnterior}
        indice={indice}
        onVoltar={() => setAlvo(null)}
      />
    );
  }

  const totalSetores = setores.reduce((s, r) => s + r.resumo.valor, 0);

  if (setores.length === 0 && equipes.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Nenhum setor ou equipe com venda ou meta em {rotuloDoMes(mes)}.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {setores.map(s => {
        const doSetor = equipes.filter(e => e.setorId === s.id);
        return (
          <div key={s.id} className="space-y-3">
            <p className="px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {s.nome}
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              <CardRecorte
                recorte={s}
                parte={totalSetores > 0 ? (s.resumo.valor / totalSetores) * 100 : null}
                temAnterior={temAnterior}
                sub="Setor · participação na empresa"
                onClick={() => setAlvo({ tipo: 'setor', id: s.id })}
              />
              {doSetor.map(e => (
                <CardRecorte
                  key={e.id}
                  recorte={e}
                  parte={s.resumo.valor > 0 ? (e.resumo.valor / s.resumo.valor) * 100 : null}
                  temAnterior={temAnterior}
                  sub="Equipe · participação no setor"
                  onClick={() => setAlvo({ tipo: 'equipe', id: e.id })}
                />
              ))}
            </div>
          </div>
        );
      })}
      <p className="text-[11px] text-muted-foreground">
        Faturamento de vendas confirmadas e assinadas até o dia {corte} · a projeção compara com a meta
        de vendas do recorte, já descontada a ausência, e com as faixas padrão de quartil · clique num
        card para ver o ritmo e as pessoas.
      </p>
    </div>
  );
}

function CardRecorte({
  recorte: r, parte, temAnterior, sub, onClick,
}: {
  recorte: Recorte; parte: number | null; temAnterior: boolean; sub: string; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col gap-2.5 rounded-xl border border-border/70 bg-card p-3.5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md"
    >
      <div className="flex items-start gap-2">
        <span className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border/60 text-[10px] font-semibold',
          r.tipo === 'setor' ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground',
        )}>
          {r.tipo === 'setor' ? <Building2 className="h-3.5 w-3.5" /> : iniciais(r.nome)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-foreground" title={r.nome}>{r.nome}</span>
          <span className="block truncate text-[10px] text-muted-foreground">{sub}</span>
        </span>
        <ChevronRight className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </div>

      <div className="flex items-baseline justify-between gap-2">
        <p className="font-mono text-lg font-bold tabular-nums leading-none text-foreground">
          {formatBRL(r.resumo.valor)}
        </p>
        <Selo pct={temAnterior ? variacao(r.resumo.valor, r.resumoAnterior.valor) : null} />
      </div>

      <div className="flex items-center gap-2">
        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted/60">
          <span className="block h-full rounded-full bg-primary"
            style={{ width: `${Math.max(2, parte ?? 0)}%`, opacity: intensidadeDaBarra(parte ?? 0, 100) }} />
        </span>
        <span className="shrink-0 font-mono text-[11px] font-semibold tabular-nums text-muted-foreground">
          {parte === null ? '—' : `${pct1(parte)}%`}
        </span>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border/50 pt-2">
        {r.projecao === null ? (
          <span className="text-[10px] font-medium text-muted-foreground">sem meta configurada</span>
        ) : (
          <span className="flex items-center gap-1.5">
            <Target className="h-3 w-3" style={{ color: corProjecao(r.projecao.pct) }} />
            <span className="font-mono text-xs font-bold tabular-nums" style={{ color: corProjecao(r.projecao.pct) }}>
              {pct1(r.projecao.pct)}%
            </span>
            <span className="text-[10px] text-muted-foreground">da projeção</span>
          </span>
        )}
        <span className="flex shrink-0 items-center gap-1.5">
          {r.projecao?.quartil != null && <SeloQuartil quartil={r.projecao.quartil} />}
          <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
            <ShoppingBag className="h-2.5 w-2.5" />{r.resumo.quantidade}
          </span>
          <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
            <Users className="h-2.5 w-2.5" />{r.pessoas}
          </span>
        </span>
      </div>
    </button>
  );
}

function DetalheDoRecorte({
  recorte: r, mes, mesAnterior, corte, corteAnterior, temAnterior, indice, onVoltar,
}: {
  recorte: Recorte; mes: string; mesAnterior: string; corte: number; corteAnterior: number;
  temAnterior: boolean; indice: IndicePessoas; onVoltar: () => void;
}) {
  const v = temAnterior ? variacao(r.resumo.valor, r.resumoAnterior.valor) : null;
  const ticket = ticketMedio(r.resumo);
  const fmtRegua = (n: number) => (r.projecao?.regua === 'quantidade' ? `${Math.round(n)} vendas` : formatBRL(n));

  return (
    <motion.div initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.2 }}
      className="space-y-4">
      <button type="button" onClick={onVoltar}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Voltar para os setores
      </button>

      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border/60 bg-muted text-[11px] font-semibold text-muted-foreground">
          {r.tipo === 'setor' ? <Building2 className="h-4 w-4" /> : iniciais(r.nome)}
        </span>
        <div className="min-w-0">
          <h2 className="text-xl font-bold tracking-tight text-foreground">{r.nome}</h2>
          <p className="text-[11px] text-muted-foreground">
            {r.tipo === 'setor' ? 'Setor' : 'Equipe'} ·{' '}
            {corte >= diasNoMes(mes) ? `${rotuloDoMes(mes)} inteiro` : `1 a ${corte} de ${rotuloDoMes(mes)}`}
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-primary/40 bg-card p-3.5 shadow-sm">
          <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            <Wallet className="h-3 w-3" /> Faturamento no período
          </span>
          <p className="mt-1.5 font-mono text-xl font-bold tabular-nums text-foreground">{formatBRL(r.resumo.valor)}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {r.resumo.quantidade} vendas · ticket {ticket === null ? '—' : formatBRL(ticket)}
          </p>
        </div>

        <div className="rounded-xl border border-border/70 bg-card p-3.5 shadow-sm">
          <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            <Target className="h-3 w-3" /> Projeção
          </span>
          {r.projecao ? (
            <>
              <p className="mt-1.5 font-mono text-xl font-bold tabular-nums" style={{ color: corProjecao(r.projecao.pct) }}>
                {pct1(r.projecao.pct)}%
              </p>
              <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                {r.projecao.quartil !== null && <SeloQuartil quartil={r.projecao.quartil} />}
                esperado {fmtRegua(r.projecao.esperado)}
              </p>
            </>
          ) : (
            <>
              <p className="mt-1.5 font-mono text-xl font-bold text-muted-foreground">—</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">sem meta configurada</p>
            </>
          )}
        </div>

        <div className="rounded-xl border border-border/70 bg-card p-3.5 shadow-sm">
          <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            <Users className="h-3 w-3" /> Pessoas
          </span>
          <p className="mt-1.5 font-mono text-xl font-bold tabular-nums text-foreground">{r.pessoas}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {new Set(r.vendas.filter(x => x.conta_na_meta && !indice.get(x.operador_id)?.robo)
              .map(x => x.operador_id)).size} com venda na régua
          </p>
        </div>

        <div className="rounded-xl border border-border/70 bg-card p-3.5 shadow-sm">
          <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            <CalendarClock className="h-3 w-3" /> Contra {rotuloDoMes(mesAnterior)}
          </span>
          {v !== null ? (
            <>
              <p className={cn('mt-1.5 font-mono text-xl font-bold tabular-nums',
                v >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')}>
                {v >= 0 ? '+' : '−'}{pct1(Math.abs(v))}%
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {formatBRL(r.resumoAnterior.valor)} no mesmo trecho
              </p>
            </>
          ) : (
            <>
              <p className="mt-1.5 font-mono text-xl font-bold text-muted-foreground">—</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">sem base no mês anterior</p>
            </>
          )}
        </div>
      </div>

      <GraficoRitmo
        mes={mes} mesAnterior={mesAnterior}
        vendas={r.vendas} anteriores={r.vendasAnteriores}
        corte={corte} corteAnterior={corteAnterior}
        titulo={`O ritmo de ${r.nome}`}
      />

      <section className="space-y-2">
        <h3 className="px-1 text-sm font-semibold text-foreground">As pessoas de {r.nome}</h3>
        <TabelaRanking vendas={r.vendas} anteriores={r.vendasAnteriores} temAnterior={temAnterior} indice={indice} />
      </section>
    </motion.div>
  );
}

// ─── Aba: Por pessoa ──────────────────────────────────────────────────────────

function PorPessoa({
  vendas, anteriores, temAnterior, indice,
}: { vendas: Venda[]; anteriores: Venda[]; temAnterior: boolean; indice: IndicePessoas }) {
  return (
    <div className="space-y-2">
      <p className="px-1 text-[11px] text-muted-foreground">
        Faturamento por pessoa, atravessando equipe e setor · a variação compara com a mesma pessoa no
        mesmo trecho do mês anterior.
      </p>
      <TabelaRanking vendas={vendas} anteriores={anteriores} temAnterior={temAnterior} indice={indice} />
    </div>
  );
}

function TabelaRanking({
  vendas, anteriores, temAnterior, indice,
}: { vendas: readonly Venda[]; anteriores: readonly Venda[]; temAnterior: boolean; indice: IndicePessoas }) {
  const { pessoas, automacao } = useMemo(
    () => separarAutomacao(placarPorOperador(vendas, indice, 'valor')),
    [vendas, indice],
  );
  const antes = useMemo(
    () => new Map(placarPorOperador(anteriores, indice, 'valor').map(l => [l.operadorId, l.resumo.valor])),
    [anteriores, indice],
  );
  const total = pessoas.reduce((s, l) => s + l.resumo.valor, 0) + automacao.reduce((s, l) => s + l.resumo.valor, 0);
  const maior = pessoas[0]?.resumo.valor ?? 0;

  if (pessoas.length === 0 && automacao.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma venda no período.</p>;
  }

  const linha = (l: LinhaDoPlacar, posicao: number | null) => {
    const r = l.resumo;
    const ticket = ticketMedio(r);
    const base = antes.get(l.operadorId) ?? 0;
    return (
      <tr key={l.operadorId} className="border-t border-border/50 hover:bg-muted/30">
        <td className="w-8 px-2 py-1.5 text-center font-mono text-[11px] tabular-nums text-muted-foreground">
          {posicao ?? <Bot className="mx-auto h-3 w-3" />}
        </td>
        <td className="px-2 py-1.5">
          <span className="block max-w-[200px] truncate font-medium text-foreground" title={l.nome}>{l.nome}</span>
        </td>
        <td className="hidden max-w-[140px] truncate px-2 py-1.5 text-muted-foreground md:table-cell">
          {l.equipeNome ?? '—'}
        </td>
        <td className="px-2 py-1.5 text-right font-mono tabular-nums">{r.quantidade}</td>
        <td className="px-2 py-1.5">
          <div className="flex items-center justify-end gap-2">
            {posicao !== null && <Barra valor={r.valor} maior={maior} />}
            <span className="w-[104px] shrink-0 text-right font-mono font-semibold tabular-nums">
              {r.quantidade === 0 ? '—' : formatBRL(r.valor)}
            </span>
          </div>
        </td>
        <td className="hidden px-2 py-1.5 text-right font-mono tabular-nums text-muted-foreground lg:table-cell">
          {ticket === null ? '—' : formatBRL(ticket)}
        </td>
        <td className="hidden px-2 py-1.5 text-right font-mono tabular-nums lg:table-cell">
          {r.porGaveta.pendente_assinatura > 0
            ? <span className="font-semibold text-amber-700 dark:text-amber-400">{r.porGaveta.pendente_assinatura}</span>
            : <span className="text-muted-foreground">—</span>}
        </td>
        <td className="hidden px-2 py-1.5 text-right font-mono tabular-nums text-muted-foreground xl:table-cell">
          {(r.pctDevolucao ?? 0) + (r.pctCancelamento ?? 0) > 0
            ? `${pct1((r.pctDevolucao ?? 0) * 100)}% · ${pct1((r.pctCancelamento ?? 0) * 100)}%`
            : '—'}
        </td>
        <td className="px-2 py-1.5 text-right font-mono tabular-nums text-muted-foreground">
          {total > 0 ? `${pct1((r.valor / total) * 100)}%` : '—'}
        </td>
        <td className="w-[70px] px-2 py-1.5 text-right">
          <Selo pct={temAnterior ? variacao(r.valor, base) : null} />
        </td>
      </tr>
    );
  };

  return (
    <div className="overflow-x-auto rounded-xl border border-border/70 bg-card shadow-sm">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
            <th className="px-2 py-2 text-center font-semibold">#</th>
            <th className="px-2 py-2 text-left font-semibold">Pessoa</th>
            <th className="hidden px-2 py-2 text-left font-semibold md:table-cell">Equipe</th>
            <th className="px-2 py-2 text-right font-semibold">Vendas</th>
            <th className="px-2 py-2 text-right font-semibold">Faturamento</th>
            <th className="hidden px-2 py-2 text-right font-semibold lg:table-cell">Ticket</th>
            <th className="hidden px-2 py-2 text-right font-semibold lg:table-cell"
              title="Confirmadas e ainda não assinadas">Sem assinar</th>
            <th className="hidden px-2 py-2 text-right font-semibold xl:table-cell">Dev · Canc</th>
            <th className="px-2 py-2 text-right font-semibold">Part.</th>
            <th className="px-2 py-2 text-right font-semibold">Vs. ant.</th>
          </tr>
        </thead>
        <tbody>
          {pessoas.map((l, i) => linha(l, i + 1))}
          {automacao.length > 0 && (
            <tr className="border-t border-border bg-muted/20">
              <td colSpan={10} className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Automação — soma no total, fora da disputa
              </td>
            </tr>
          )}
          {automacao.map(l => linha(l, null))}
        </tbody>
      </table>
    </div>
  );
}

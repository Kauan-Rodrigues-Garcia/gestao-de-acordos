/**
 * DiretoriaSetores — a segunda aba do Painel Diretoria: onde o resultado mora.
 *
 * A Visão Geral responde «a empresa está melhor ou pior». Esta responde «em
 * qual setor», e é a única da aba que cruza o 59 com o que o SISTEMA sabe:
 * meta, quartil e projeção.
 *
 * ## O detalhe abre NA PRÓPRIA ABA
 *
 * Clicar num setor troca a grade pelo detalhe dele, com um caminho de volta no
 * topo. Não é gaveta lateral nem modal: o detalhe tem gráfico, lista de equipes
 * e quebra por forma de pagamento — conteúdo que precisa da largura inteira, e
 * que numa gaveta viraria uma coluna estreita de números espremidos.
 *
 * ## O card não mostra evolução, de propósito
 *
 * Nada de «+12% contra o mês passado» na grade. Foi pedido assim, e a razão é
 * boa: com vinte cards lado a lado, vinte setas competindo pela atenção
 * escondem justamente a leitura que interessa — quem está no ritmo da meta. A
 * comparação com o mês anterior existe, e mora DENTRO do setor escolhido.
 *
 * ## Duas naturezas de card
 *
 * Setor vinculado tem meta, então tem quartil e projeção. Carteira ainda não
 * vinculada não tem — e não é falha dela: o sistema ainda não sabe de quem ela
 * é. Ela aparece assim mesmo, com o número do 59 e sem inventar percentual,
 * porque é dinheiro real e esconder daria um total que não fecha.
 *
 * ## O denominador da porcentagem
 *
 * `participacao` divide pela soma dos SETORES, nunca pelo total da empresa. Com
 * `Integral` cruzado os dois são diferentes de propósito — ver o serviço.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import { motion } from 'framer-motion';
import {
  ArrowLeft, AlertCircle, FileSpreadsheet, Users, Layers,
  Link2Off, CalendarClock, Target, ChevronRight, Wallet, CopyPlus,
} from 'lucide-react';
import type { PropsTooltipGrafico } from '@/lib/recharts-tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAxisColors, useChartColors } from '@/hooks/useChartColors';
import { supabase } from '@/lib/supabase';
import type { QuartilConfig } from '@/lib/supabase';
import { getMetasConfig } from '@/services/metas/metasConfig.service';
import { QUARTIS_PADRAO, COR_QUARTIL, corProjecao } from '@/lib/diasUteis';
import { partesDoMes, rotuloDoMes } from '@/lib/mesReferencia';
import { corDaForma, agruparFormas } from '@/lib/formasPagamento';
import { cn } from '@/lib/utils';
import { formatBRL } from '@/lib/money';
import { variacao, acumular, intensidadeDaBarra } from '@/services/mestre/diretoria.service';
import {
  buscarGradeDeSetores, buscarDetalheDoSetor, participacao, projecaoDoSetor,
  type GradeDeSetores, type DetalheDoSetor, type SetorDoPainel,
  type CarteiraSemSetor,
} from '@/services/mestre/diretoriaSetores.service';
import type { SetorAgregado } from './useSetoresExtras';

const FALLBACK_PRIMARIA = '#3b82f6';
const FALLBACK_ANTERIOR = '#94a3b8';

const pct1 = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const iniciais = (nome: string) =>
  nome.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();

/** O que está aberto na aba. `null` = a grade. */
type Alvo =
  | { tipo: 'setor';    id: string }
  | { tipo: 'carteira'; cod: string };

// ── Peças ───────────────────────────────────────────────────────────────────

function SeloQuartil({ quartil }: { quartil: number }) {
  const cor = COR_QUARTIL[quartil] ?? COR_QUARTIL[4];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
      style={{ background: `${cor}1f`, color: cor }}
      title={`Quartil ${quartil}`}
    >
      Q{quartil}
    </span>
  );
}

/**
 * Um card da grade.
 *
 * Sem projeção o card não fica vazio nem mostra 0%: ele diz por que não tem.
 * «Sem meta» e «0% da meta» são leituras opostas, e trocar uma pela outra faria
 * um setor bem configurado parecer o pior da empresa.
 */
function CardSetor({
  nome, fotoUrl, valor, parte, projecao, quartil, operadores, sub, aviso, onClick,
}: {
  nome: string;
  fotoUrl?: string | null;
  valor: number;
  parte: number | null;
  projecao: number | null;
  quartil: number | null;
  operadores: number;
  sub?: string;
  aviso?: string;
  /**
   * Ausente = card de leitura, sem clique.
   *
   * O setor alternativo é assim hoje: `fn_mestre_diretoria_setor` monta o
   * detalhe a partir das CARTEIRAS do setor, e o alternativo não tem nenhuma
   * — abrir mostraria um painel vazio. Card que não abre é melhor que clique
   * que leva a lugar nenhum.
   */
  onClick?: () => void;
}) {
  const Caixa = onClick ? 'button' : 'div';
  return (
    <Caixa
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      className={cn(
        'group flex flex-col gap-2.5 rounded-xl border border-border/70 bg-card p-3.5 text-left shadow-sm transition-colors',
        onClick && 'hover:border-primary/50 hover:bg-muted/30',
      )}
    >
      <div className="flex items-start gap-2">
        <Avatar className="h-8 w-8 shrink-0 border border-border/60">
          {fotoUrl && <AvatarImage src={fotoUrl} alt="" />}
          <AvatarFallback className="bg-muted text-[10px] font-semibold text-muted-foreground">
            {iniciais(nome)}
          </AvatarFallback>
        </Avatar>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-foreground" title={nome}>
            {nome}
          </span>
          {sub && <span className="block truncate text-[10px] text-muted-foreground">{sub}</span>}
        </span>
        <ChevronRight className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </div>

      <p className="font-mono text-lg font-bold tabular-nums leading-none text-foreground">
        {formatBRL(valor)}
      </p>

      {/* A barra é a participação, e a cor dela é a mesma grandeza: a leitura
          «quem é grande» tem que sobreviver a alguém ler só as cores. */}
      <div className="flex items-center gap-2">
        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted/60">
          <span
            className="block h-full rounded-full bg-primary"
            style={{
              width: `${Math.max(2, parte ?? 0)}%`,
              opacity: intensidadeDaBarra(parte ?? 0, 100),
            }}
          />
        </span>
        <span className="shrink-0 font-mono text-[11px] font-semibold tabular-nums text-muted-foreground">
          {parte === null ? '—' : `${pct1(parte)}%`}
        </span>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border/50 pt-2">
        {projecao === null ? (
          <span className="text-[10px] font-medium text-muted-foreground">
            {aviso ?? 'sem meta configurada'}
          </span>
        ) : (
          <span className="flex items-center gap-1.5">
            <Target className="h-3 w-3" style={{ color: corProjecao(projecao) }} />
            <span
              className="font-mono text-xs font-bold tabular-nums"
              style={{ color: corProjecao(projecao) }}
            >
              {pct1(projecao)}%
            </span>
            <span className="text-[10px] text-muted-foreground">da projeção</span>
          </span>
        )}
        <span className="flex shrink-0 items-center gap-1.5">
          {quartil !== null && <SeloQuartil quartil={quartil} />}
          <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
            <Users className="h-2.5 w-2.5" />{operadores}
          </span>
        </span>
      </div>
    </Caixa>
  );
}

function TooltipRitmoSetor({ active, payload, label }: PropsTooltipGrafico) {
  if (!active || !payload?.length) return null;
  const atual    = Number(payload.find(p => p.name === 'Este mês')?.value ?? 0);
  const anterior = Number(payload.find(p => p.name === 'Mês anterior')?.value ?? 0);
  const v = variacao(atual, anterior);
  return (
    <div className="min-w-[186px] rounded-xl border border-border/60 bg-popover/95 p-3 text-xs shadow-xl backdrop-blur-sm">
      <p className="mb-2 border-b border-border/40 pb-1.5 font-semibold text-foreground">Dia {label}</p>
      <p className="flex justify-between gap-4">
        <span className="text-muted-foreground">Este mês</span>
        <span className="font-mono font-bold text-foreground">{formatBRL(atual)}</span>
      </p>
      <p className="mt-1 flex justify-between gap-4">
        <span className="text-muted-foreground">Mês anterior</span>
        <span className="font-mono text-muted-foreground">{formatBRL(anterior)}</span>
      </p>
      {v !== null && (
        <p className="mt-1.5 border-t border-border/40 pt-1.5 text-[11px] text-muted-foreground">
          {v >= 0 ? 'acima' : 'abaixo'} em {pct1(Math.abs(v))}%
        </p>
      )}
    </div>
  );
}

// ── A aba ───────────────────────────────────────────────────────────────────

export function DiretoriaSetores({
  empresaId, mes, versao = 0, agendadoPorSetor = [],
}: {
  empresaId: string;
  mes: string;
  versao?: number;
  /**
   * Agendado por setor, vindo de `fn_diretoria_setores_do_mes` — a MESMA fonte
   * que o painel antigo usa. Chega por prop em vez de ser buscado aqui porque
   * é tabulação, não relatório: são bases diferentes, e uma segunda consulta
   * com outra régua faria esta aba discordar do resto do sistema.
   */
  agendadoPorSetor?: SetorAgregado[];
}) {
  const [grade, setGrade]   = useState<GradeDeSetores | null>(null);
  const [erro, setErro]     = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  const [alvo, setAlvo]     = useState<Alvo | null>(null);
  const [detalhe, setDetalhe] = useState<DetalheDoSetor | null>(null);
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false);
  const [erroDetalhe, setErroDetalhe] = useState<string | null>(null);
  const [modo, setModo] = useState<'acumulado' | 'dia'>('acumulado');

  /** Metas de setor do mês + config de quartis. Sem elas não há projeção. */
  const [metas, setMetas] = useState<Record<string, number>>({});
  const [feriados, setFeriados] = useState<string[]>([]);
  const [quartis, setQuartis]   = useState<QuartilConfig[]>(QUARTIS_PADRAO);
  const [contarDiaAtual, setContarDiaAtual] = useState(false);

  const { tickColor, gridColor } = useAxisColors();
  const cores = useChartColors(['--primary', '--muted-foreground']);
  const corAtual    = cores['--primary']          ?? FALLBACK_PRIMARIA;
  const corAnterior = cores['--muted-foreground'] ?? FALLBACK_ANTERIOR;

  // ── Carga da grade ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!empresaId) return;   // antes de ligar o esqueleto, senão ele fica aceso
    let vivo = true;
    setCarregando(true);
    setErro(null);
    void (async () => {
      try {
        const g = await buscarGradeDeSetores(empresaId, mes);
        if (vivo) setGrade(g);
      } catch (e) {
        if (vivo) setErro(e instanceof Error ? e.message : 'Falha ao carregar os setores.');
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => { vivo = false; };
  }, [empresaId, mes, versao]);

  // ── Metas e config: outra base, outra consulta ────────────────────────────
  useEffect(() => {
    let vivo = true;
    if (!empresaId) return;
    const { ano, mes: mesNum } = partesDoMes(mes);
    void (async () => {
      const [metasRes, config] = await Promise.all([
        supabase.from('metas')
          .select('referencia_id, meta_valor')
          .eq('tipo', 'setor')
          .eq('empresa_id', empresaId)
          .eq('mes', mesNum)
          .eq('ano', ano),
        getMetasConfig(empresaId, mesNum, ano),
      ]);
      if (!vivo) return;
      const mapa: Record<string, number> = {};
      for (const m of (metasRes.data ?? []) as { referencia_id: string; meta_valor: number | string | null }[]) {
        if (m.referencia_id) mapa[m.referencia_id] = Number(m.meta_valor) || 0;
      }
      setMetas(mapa);
      setFeriados(config.data?.feriados ?? []);
      setQuartis(config.data?.quartis?.length ? config.data.quartis : QUARTIS_PADRAO);
      setContarDiaAtual(config.data?.contar_dia_atual === true);
    })();
    return () => { vivo = false; };
  }, [empresaId, mes]);

  // Trocar de mês fecha o detalhe: o setor aberto em agosto não é a mesma
  // leitura em setembro, e manter aberto mostraria números novos sob um
  // cabeçalho que o usuário abriu por outro motivo.
  useEffect(() => { setAlvo(null); setDetalhe(null); }, [mes]);

  // ── Carga do detalhe ──────────────────────────────────────────────────────
  const carregarDetalhe = useCallback(async (a: Alvo, corte: number | null) => {
    setCarregandoDetalhe(true);
    setErroDetalhe(null);
    try {
      const d = await buscarDetalheDoSetor(
        empresaId, mes,
        a.tipo === 'setor' ? { setorId: a.id } : { codGrupo: a.cod },
        corte,
      );
      setDetalhe(d);
    } catch (e) {
      setErroDetalhe(e instanceof Error ? e.message : 'Falha ao carregar o setor.');
      setDetalhe(null);
    } finally {
      setCarregandoDetalhe(false);
    }
  }, [empresaId, mes]);

  useEffect(() => {
    if (!alvo) { setDetalhe(null); return; }
    void carregarDetalhe(alvo, grade?.diaCorte ?? null);
  }, [alvo, carregarDetalhe, grade?.diaCorte]);

  /** A projeção de cada setor, na régua do painel. */
  const projecoes = useMemo(() => {
    const r: Record<string, ReturnType<typeof projecaoDoSetor>> = {};
    // O alternativo entra: ele TEM meta configurada, e sem isto o card dele
    // mostraria «sem meta» ao lado de uma meta que existe.
    for (const s of [...(grade?.setores ?? []), ...(grade?.alternativos ?? [])]) {
      r[s.setorId] = projecaoDoSetor({
        meta: metas[s.setorId],
        recebido: s.valor,
        mes,
        diaCorte: grade?.diaCorte ?? 1,
        feriados, quartis, contarDiaAtual,
      });
    }
    return r;
  }, [grade, metas, mes, feriados, quartis, contarDiaAtual]);

  const agendadoDoSetor = useMemo(() => {
    const r: Record<string, SetorAgregado> = {};
    for (const s of agendadoPorSetor) if (s.id) r[s.id] = s;
    return r;
  }, [agendadoPorSetor]);

  const serieDetalhe = useMemo(() => {
    if (!detalhe) return [];
    const base = modo === 'acumulado' ? acumular(detalhe.serie) : detalhe.serie;
    return base.map(d => ({
      dia: d.dia,
      valor:         d.dentroDoCorte ? d.valor : null,
      valorAnterior: d.valorAnterior,
    }));
  }, [detalhe, modo]);

  const gruposDeForma = useMemo(
    () => agruparFormas(detalhe?.formas ?? []), [detalhe],
  );

  // ── Estados de borda ──────────────────────────────────────────────────────

  if (carregando) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-[150px] rounded-xl" />)}
      </div>
    );
  }

  if (erro) {
    return (
      <div className="flex items-start gap-2.5 rounded-xl border border-rose-500/40 bg-rose-500/5 px-4 py-3">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
        <div className="text-xs">
          <p className="font-semibold text-foreground">Não foi possível carregar os setores</p>
          <p className="mt-0.5 text-muted-foreground">{erro}</p>
        </div>
      </div>
    );
  }

  const vazio = !grade || (!grade.setores.length && !grade.carteirasSemSetor.length);
  if (vazio) {
    return (
      <div className="flex items-start gap-2.5 rounded-xl border border-border bg-muted/20 px-4 py-4">
        <FileSpreadsheet className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="text-xs leading-relaxed">
          <p className="font-semibold text-foreground">Nenhum relatório 59 promovido neste mês</p>
          <p className="text-muted-foreground">
            Importe o 59 na aba <strong className="text-foreground">Relatório 59</strong> para os
            setores aparecerem.
          </p>
        </div>
      </div>
    );
  }

  // ── O DETALHE, na própria aba ─────────────────────────────────────────────

  if (alvo) {
    const varSetor = detalhe?.temAnterior
      ? variacao(detalhe.recebido, detalhe.recebidoAnterior) : null;
    const agendado = alvo.tipo === 'setor' ? agendadoDoSetor[alvo.id] : undefined;
    const projecao = alvo.tipo === 'setor' ? projecoes[alvo.id] : null;
    const totalFormas = gruposDeForma.reduce((s, g) => s + g.valor, 0);
    const maiorEquipe = detalhe?.equipes[0]?.valor ?? 0;

    return (
      <motion.div
        initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.2 }}
        className="space-y-4 pb-16"
      >
        <button
          type="button"
          onClick={() => setAlvo(null)}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Voltar para os setores
        </button>

        {carregandoDetalhe && !detalhe ? (
          <div className="space-y-4">
            <Skeleton className="h-[104px] rounded-xl" />
            <Skeleton className="h-[300px] rounded-xl" />
          </div>
        ) : erroDetalhe ? (
          <div className="flex items-start gap-2.5 rounded-xl border border-rose-500/40 bg-rose-500/5 px-4 py-3">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
            <div className="text-xs">
              <p className="font-semibold text-foreground">Não foi possível abrir este setor</p>
              <p className="mt-0.5 text-muted-foreground">{erroDetalhe}</p>
            </div>
          </div>
        ) : detalhe && (
          <>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold tracking-tight text-foreground">
                  {detalhe.setorNome}
                </h2>
                <p className="text-[11px] text-muted-foreground">
                  {detalhe.diaCorte >= detalhe.diasNoMes
                    ? `${rotuloDoMes(detalhe.mes)} inteiro`
                    : `1 a ${detalhe.diaCorte} de ${rotuloDoMes(detalhe.mes)}`}
                  {!detalhe.vinculado && ' · carteira ainda sem setor vinculado'}
                </p>
              </div>
              {varSetor !== null && (
                <p className="text-xs text-muted-foreground">
                  <strong className={varSetor >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
                    {formatBRL(Math.abs(detalhe.recebido - detalhe.recebidoAnterior))}{' '}
                    {varSetor >= 0 ? 'acima' : 'abaixo'}
                  </strong>{' '}
                  do mesmo trecho de {rotuloDoMes(detalhe.mesAnterior)}
                </p>
              )}
            </div>

            {/* Números do setor */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-primary/40 bg-card p-3.5 shadow-sm">
                <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  <Wallet className="h-3 w-3" /> Recebido no período
                </span>
                <p className="mt-1.5 font-mono text-xl font-bold tabular-nums text-foreground">
                  {formatBRL(detalhe.recebido)}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {detalhe.linhas.toLocaleString('pt-BR')} pagamentos
                </p>
              </div>

              <div className="rounded-xl border border-border/70 bg-card p-3.5 shadow-sm">
                <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  <Target className="h-3 w-3" /> Projeção
                </span>
                {projecao ? (
                  <>
                    <p
                      className="mt-1.5 font-mono text-xl font-bold tabular-nums"
                      style={{ color: corProjecao(projecao.projecaoPct) }}
                    >
                      {pct1(projecao.projecaoPct)}%
                    </p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      {projecao.quartil && <SeloQuartil quartil={projecao.quartil.quartil} />}
                      esperado {formatBRL(projecao.esperado)}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="mt-1.5 font-mono text-xl font-bold text-muted-foreground">—</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {detalhe.vinculado ? 'sem meta configurada' : 'carteira sem setor vinculado'}
                    </p>
                  </>
                )}
              </div>

              <div className="rounded-xl border border-border/70 bg-card p-3.5 shadow-sm">
                <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  <CalendarClock className="h-3 w-3" /> Agendado do mês
                </span>
                {agendado ? (
                  <>
                    <p className="mt-1.5 font-mono text-xl font-bold tabular-nums text-foreground">
                      {formatBRL(agendado.totalAgendado)}
                    </p>
                    {/* Vem da TABULAÇÃO, não do 59. Dizer isso na tela evita a
                        pergunta inevitável de por que os dois não batem. */}
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {formatBRL(agendado.totalRestante)} ainda em aberto · da tabulação
                    </p>
                  </>
                ) : (
                  <>
                    <p className="mt-1.5 font-mono text-xl font-bold text-muted-foreground">—</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      sem acordos tabulados neste setor
                    </p>
                  </>
                )}
              </div>

              <div className="rounded-xl border border-border/70 bg-card p-3.5 shadow-sm">
                <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  <Users className="h-3 w-3" /> Operadores
                </span>
                <p className="mt-1.5 font-mono text-xl font-bold tabular-nums text-foreground">
                  {detalhe.operadores}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  em {detalhe.equipes.length} {detalhe.equipes.length === 1 ? 'equipe' : 'equipes'}
                </p>
              </div>
            </div>

            {/* Ritmo do setor */}
            <section className="rounded-xl border border-border/70 bg-card p-4 shadow-sm">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">O ritmo de {detalhe.setorNome}</h3>
                  <p className="text-[11px] text-muted-foreground">
                    Contra {rotuloDoMes(detalhe.mesAnterior)}, no mesmo dia de corte.
                  </p>
                </div>
                <div className="inline-flex rounded-lg border border-border p-0.5">
                  {([['acumulado', 'Acumulado'], ['dia', 'Por dia']] as const).map(([k, r]) => (
                    <button
                      key={k} onClick={() => setModo(k)} aria-pressed={modo === k}
                      className={cn(
                        'rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors',
                        modo === k ? 'bg-primary text-primary-foreground'
                                   : 'text-muted-foreground hover:text-foreground',
                      )}
                    >{r}</button>
                  ))}
                </div>
              </div>
              <div className="h-[240px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={serieDetalhe} margin={{ top: 6, right: 8, bottom: 0, left: -6 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                    <XAxis dataKey="dia" tick={{ fontSize: 10, fill: tickColor }} stroke={gridColor} tickLine={false} />
                    <YAxis
                      tick={{ fontSize: 10, fill: tickColor }} stroke={gridColor}
                      tickLine={false} axisLine={false} width={52}
                      tickFormatter={v => `${Math.round(Number(v) / 1000)}k`}
                    />
                    <Tooltip content={<TooltipRitmoSetor />} cursor={{ stroke: corAtual, strokeWidth: 1, strokeDasharray: '4 4' }} />
                    <Line
                      type="monotone" dataKey="valorAnterior" name="Mês anterior"
                      stroke={corAnterior} strokeWidth={1.5} strokeOpacity={0.7}
                      strokeDasharray="5 4" dot={false} isAnimationActive={false}
                    />
                    <Line
                      type="monotone" dataKey="valor" name="Este mês"
                      stroke={corAtual} strokeWidth={2.5} dot={false}
                      isAnimationActive={false} connectNulls={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>

            {/* Equipes + formas */}
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
              <section className="rounded-xl border border-border/70 bg-card p-4 shadow-sm">
                <div className="mb-3">
                  <h3 className="text-sm font-semibold text-foreground">As equipes</h3>
                  {/* A comparação com o mês anterior NÃO desce até a equipe: o
                      subgrupo do ERP muda de nome, e casar por nome inventaria
                      «equipe nova» e «equipe que sumiu» onde houve renomeação. */}
                  <p className="text-[11px] text-muted-foreground">
                    {detalhe.vinculado
                      ? 'Como estão configuradas no sistema. Sem comparação com o mês anterior — nome de equipe muda no ERP.'
                      : 'Direto do 59, sem vínculo aplicado.'}
                  </p>
                </div>
                <div className="space-y-0.5">
                  {detalhe.equipes.map(e => (
                    <div
                      key={`${e.codGrupo}|${e.nome}`}
                      className="flex items-center gap-3 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-muted/40"
                    >
                      {detalhe.vinculado && e.equipeId ? (
                        <Avatar className="h-7 w-7 shrink-0 border border-border/60">
                          {e.liderFoto && <AvatarImage src={e.liderFoto} alt="" />}
                          <AvatarFallback className="bg-muted text-[9px] font-semibold text-muted-foreground">
                            {iniciais(e.liderNome ?? e.equipeNome ?? e.nome)}
                          </AvatarFallback>
                        </Avatar>
                      ) : (
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-dashed border-border text-muted-foreground">
                          <Link2Off className="h-3 w-3" />
                        </span>
                      )}

                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium text-foreground">
                          {e.equipeNome ?? e.nome}
                        </span>
                        <span className="block truncate text-[10px] text-muted-foreground">
                          {e.liderNome ? `${e.liderNome} · ` : ''}
                          {e.operadores} {e.operadores === 1 ? 'operador' : 'operadores'}
                          {e.veioDeFora && ' · veio de outro setor'}
                          {/* O Integral cruzado conta aqui E na origem. Dizer
                              isso é o que impede alguém somar duas vezes na
                              mão e concluir que o painel está errado. */}
                          {e.eIntegral && ' · integral cobrado para cá'}
                        </span>
                      </span>

                      <span className="hidden h-2 w-[22%] shrink-0 overflow-hidden rounded-full bg-muted/60 sm:block">
                        <span
                          className="block h-full rounded-full bg-primary"
                          style={{
                            width: `${maiorEquipe ? Math.max(2, (e.valor / maiorEquipe) * 100) : 0}%`,
                            opacity: intensidadeDaBarra(e.valor, maiorEquipe),
                          }}
                        />
                      </span>
                      <span className="w-[104px] shrink-0 text-right font-mono text-xs tabular-nums text-foreground">
                        {formatBRL(e.valor)}
                      </span>
                    </div>
                  ))}
                  {!detalhe.equipes.length && (
                    <p className="py-3 text-center text-xs text-muted-foreground">
                      Nenhuma equipe com recebimento no período.
                    </p>
                  )}
                </div>
              </section>

              <section className="self-start rounded-xl border border-border/70 bg-card p-4 shadow-sm">
                <h3 className="text-sm font-semibold text-foreground">Como o dinheiro chega</h3>
                <p className="text-[11px] text-muted-foreground">Participação no recebido do setor.</p>

                <div className="mt-3 flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full">
                  {gruposDeForma.map(g => (
                    <span
                      key={g.chave}
                      title={`${g.rotulo}: ${formatBRL(g.valor)}`}
                      style={{
                        width: `${totalFormas ? (g.valor / totalFormas) * 100 : 0}%`,
                        background: corDaForma(g.rotulo),
                      }}
                    />
                  ))}
                </div>

                <ul className="mt-3 divide-y divide-border/40">
                  {gruposDeForma.map(g => (
                    <li key={g.chave} className="flex items-center gap-2 py-2 text-xs">
                      <i className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: corDaForma(g.rotulo) }} />
                      <span className="min-w-0 flex-1 truncate font-medium text-foreground">{g.rotulo}</span>
                      <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                        {totalFormas ? pct1((g.valor / totalFormas) * 100) : '0'}%
                      </span>
                      <span className="w-[92px] shrink-0 text-right font-mono tabular-nums text-foreground">
                        {formatBRL(g.valor)}
                      </span>
                    </li>
                  ))}
                </ul>

                {detalhe.carteiras.length > 1 && (
                  <div className="mt-3 border-t border-border/50 pt-3">
                    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Carteiras deste setor
                    </p>
                    {detalhe.carteiras.map(c => (
                      <p key={c.cod} className="flex items-center justify-between gap-2 py-0.5 text-[11px]">
                        <span className="min-w-0 flex-1 truncate text-muted-foreground">{c.nome}</span>
                        <span className="shrink-0 font-mono tabular-nums text-foreground">{formatBRL(c.valor)}</span>
                      </p>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </>
        )}
      </motion.div>
    );
  }

  // ── A GRADE ───────────────────────────────────────────────────────────────

  const diferencaIntegral = grade.totalSetores - grade.totalEmpresa;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-4 pb-16"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          <span className="font-semibold text-foreground">
            {grade.setores.length} {grade.setores.length === 1 ? 'setor' : 'setores'}
          </span>
          {' '}· {grade.diaCorte >= grade.diasNoMes
            ? `${rotuloDoMes(grade.mes)} inteiro`
            : `1 a ${grade.diaCorte} de ${rotuloDoMes(grade.mes)}`}
          {' '}· clique num card para abrir as equipes
        </p>
        {/* A soma dos setores passa do total da empresa quando há Integral
            cruzado. Dizer o valor exato aqui é o que separa «está certo» de
            «alguém vai abrir um chamado». */}
        {diferencaIntegral > 0.01 && (
          <p className="text-[10px] text-muted-foreground">
            soma dos setores {formatBRL(grade.totalSetores)} · empresa{' '}
            {formatBRL(grade.totalEmpresa)} — a diferença de{' '}
            {formatBRL(diferencaIntegral)} é o Integral que conta nos dois setores
          </p>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {grade.setores.map((s: SetorDoPainel) => {
          const p = projecoes[s.setorId];
          return (
            <CardSetor
              key={s.setorId}
              nome={s.setorNome}
              fotoUrl={s.fotoUrl}
              valor={s.valor}
              parte={participacao(s.valor, grade.totalSetores)}
              projecao={p ? p.projecaoPct : null}
              quartil={p?.quartil?.quartil ?? null}
              operadores={s.operadores}
              sub={`${s.carteiras} ${s.carteiras === 1 ? 'carteira' : 'carteiras'}`}
              onClick={() => setAlvo({ tipo: 'setor', id: s.setorId })}
            />
          );
        })}
      </div>

      {grade.carteirasSemSetor.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2 border-t border-border/50 pt-4">
            <Link2Off className="h-3.5 w-3.5 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">Ainda sem setor vinculado</h3>
            <span className="text-[11px] text-muted-foreground">
              {formatBRL(grade.semSetor.valor)} · sem meta, quartil ou projeção até o vínculo existir
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {grade.carteirasSemSetor.map((c: CarteiraSemSetor) => (
              <CardSetor
                key={c.cod}
                nome={c.nome || c.cod}
                valor={c.valor}
                parte={participacao(c.valor, grade.totalSetores)}
                projecao={null}
                quartil={null}
                operadores={c.operadores}
                sub={`carteira ${c.cod}`}
                aviso="vincule a um setor para ter meta"
                onClick={() => setAlvo({ tipo: 'carteira', cod: c.cod })}
              />
            ))}
          </div>
        </section>
      )}

      {grade.alternativos.length > 0 && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 border-t border-border/50 pt-4">
            <CopyPlus className="h-3.5 w-3.5 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">Setores alternativos</h3>
            {/*
              A frase não é enfeite. Estes números espelham dinheiro que outro
              setor já cobrou, e quem lê a tela precisa saber disso antes de
              somar de cabeça — senão o total «não fecha» e vira chamado.
            */}
            <span className="text-[11px] text-muted-foreground">
              clonam o recebimento de quem é de outros setores —{' '}
              <strong className="text-foreground">não somam</strong> no total da empresa
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {grade.alternativos.map((s: SetorDoPainel) => {
              const p = projecoes[s.setorId];
              const pessoas = s.pessoas ?? s.operadores;
              return (
                <CardSetor
                  key={s.setorId}
                  nome={s.setorNome}
                  fotoUrl={s.fotoUrl}
                  valor={s.valor}
                  /* `null` de propósito: participação num total do qual ele não
                     faz parte seria um número inventado. */
                  parte={null}
                  projecao={p ? p.projecaoPct : null}
                  quartil={p?.quartil?.quartil ?? null}
                  operadores={s.operadores}
                  sub={`${pessoas} ${pessoas === 1 ? 'pessoa' : 'pessoas'}`}
                />
              );
            })}
          </div>
        </section>
      )}

      {!grade.setores.length && (
        <div className="flex items-start gap-2.5 rounded-xl border border-border bg-muted/20 px-4 py-4">
          <Layers className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="text-xs leading-relaxed">
            <p className="font-semibold text-foreground">Nenhuma carteira vinculada a setor</p>
            <p className="text-muted-foreground">
              O 59 do mês está importado, mas as carteiras ainda não foram ligadas a setores.
              Faça o vínculo na aba <strong className="text-foreground">Relatório 59</strong> para
              meta, quartil e projeção aparecerem aqui.
            </p>
          </div>
        </div>
      )}
    </motion.div>
  );
}

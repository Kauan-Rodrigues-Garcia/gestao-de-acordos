/**
 * DiretoriaVisaoGeral — a primeira aba do Painel Diretoria, lendo o 59.
 *
 * O que um diretor precisa responder em cinco segundos: a empresa está melhor
 * ou pior que no mês passado, no MESMO ponto do mês? O resto da tela existe
 * para explicar essa resposta — onde o resultado aconteceu e por qual meio o
 * dinheiro entrou.
 *
 * ## Sem filtro de setor, de propósito
 *
 * É o total da cobrança inteira, como o 59 traz: inclui a carteira que não
 * pertence a setor nenhum e a equipe que conta só para o geral. Filtrar aqui
 * daria o número de uma parte da empresa com cara de número da empresa.
 *
 * ## A comparação é sempre no mesmo corte
 *
 * Todo número desta aba respeita o dia de corte, e o mês anterior é medido até
 * o MESMO dia. Comparar agosto inteiro com setembro até o dia 8 não compara
 * nada — e é o erro que uma tela de diretoria não pode cometer, porque ninguém
 * confere a régua de um número que já veio pronto.
 *
 * O padrão é o dia de HOJE e ele não pede confirmação de ninguém: quem abre a
 * aba quer o mês até agora. Mudar o corte é investigação («como estávamos no
 * dia 20?»), e por isso mora atrás de um botão, não numa barra sempre aberta.
 *
 * ## Cor de gráfico não pode vir de `hsl(var(--x))`
 *
 * As variáveis de tema deste projeto são `oklch(...)`. Envelopar isso em `hsl()`
 * produz cor inválida, e atributo SVG inválido não avisa: o recharts desenha a
 * linha com `stroke` nenhum e o gráfico aparece VAZIO, com eixo e grade no
 * lugar. É por isso que as cores saem de `useChartColors`/`useAxisColors`, que
 * resolvem a variável para `rgb()` e reagem à troca de tema.
 *
 * ## Tudo vem de UMA chamada
 *
 * `buscarVisaoGeralDiretoria` traz total, série, formas e carteiras juntos, do
 * mesmo lote e do mesmo corte. Ver o serviço para o porquê de não partir isso.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import { motion } from 'framer-motion';
import {
  TrendingUp, TrendingDown, Minus, Activity, Wallet, Users, Layers,
  ArrowUpRight, ArrowDownRight, AlertCircle, CheckCircle2, FileSpreadsheet,
  CalendarRange, ChevronRight, RotateCcw,
} from 'lucide-react';
import type { PropsTooltipGrafico } from '@/lib/recharts-tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useAxisColors, useChartColors } from '@/hooks/useChartColors';
import { cn } from '@/lib/utils';
import { formatBRL } from '@/lib/money';
import { rotuloDoMes } from '@/lib/mesReferencia';
import { corDaForma, agruparFormas } from '@/lib/formasPagamento';
import {
  buscarVisaoGeralDiretoria, variacao, acumular, estimativaDeFechamento,
  intensidadeDaBarra, type VisaoGeralDiretoria,
} from '@/services/mestre/diretoria.service';

/** Enquanto o tema não resolveu (primeiro quadro), a linha usa isto. */
const FALLBACK_PRIMARIA = '#3b82f6';
const FALLBACK_ANTERIOR = '#94a3b8';

const pct = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });

// ── Peças pequenas ──────────────────────────────────────────────────────────

/** Selo de variação. `null` não vira 0% — vira nada. Ver `variacao`. */
function Selo({ pct: p, className }: { pct: number | null; className?: string }) {
  if (p === null) return null;
  const positivo = p >= 0;
  const Icone = Math.abs(p) < 0.05 ? Minus : positivo ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn(
      'inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums',
      positivo ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
               : 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
      className,
    )}>
      <Icone className="h-3 w-3" />
      {pct(Math.abs(p))}%
    </span>
  );
}

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

/** Tooltip do gráfico: mês em foco, mês anterior e a diferença entre os dois. */
function TooltipRitmo({ active, payload, label }: PropsTooltipGrafico) {
  if (!active || !payload?.length) return null;
  /* Por `name`, e nao por indice: a ordem em que o recharts entrega as series
     segue a ordem de declaracao das <Line>, e trocar as duas de lugar no JSX
     inverteria os numeros do tooltip sem erro nenhum. */
  const atual    = Number(payload.find(p => p.name === 'Este mês')?.value ?? 0);
  const anterior = Number(payload.find(p => p.name === 'Mês anterior')?.value ?? 0);
  const v = variacao(atual, anterior);
  return (
    <div className="min-w-[190px] rounded-xl border border-border/60 bg-popover/95 p-3 text-xs shadow-xl backdrop-blur-sm">
      <p className="mb-2 border-b border-border/40 pb-1.5 font-semibold text-foreground">
        Dia {label}
      </p>
      <p className="flex justify-between gap-4">
        <span className="text-muted-foreground">Este mês</span>
        <span className="font-mono font-bold text-foreground">{formatBRL(atual)}</span>
      </p>
      <p className="mt-1 flex justify-between gap-4">
        <span className="text-muted-foreground">Mês anterior</span>
        <span className="font-mono text-muted-foreground">{formatBRL(anterior)}</span>
      </p>
      {v !== null && (
        <div className="mt-2 border-t border-border/40 pt-1.5">
          <Selo pct={v} />
        </div>
      )}
    </div>
  );
}

/**
 * O botão de período e o que ele abre.
 *
 * Duas maneiras de dizer a mesma coisa porque são dois gestos diferentes:
 * arrastar responde «e se fosse outro dia?» varrendo o mês; digitar a data
 * responde «quero exatamente o dia 12». Uma barra sozinha obriga a mirar o
 * pixel, e um campo de data sozinho não deixa varrer.
 *
 * `corte` é sempre o corte EFETIVO (o que o banco devolveu), não a escolha —
 * assim o botão mostra o dia real mesmo antes de alguém mexer em qualquer
 * coisa, que é o estado em que a tela quase sempre está.
 */
function FiltroDePeriodo({
  mes, corte, diasNoMes, escolhido, onEscolher,
}: {
  mes: string; corte: number; diasNoMes: number;
  escolhido: number | null; onEscolher: (dia: number | null) => void;
}) {
  const dataIso = `${mes}-${String(corte).padStart(2, '0')}`;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex h-8 items-center gap-2 rounded-lg border px-3 text-xs font-medium transition-colors',
            escolhido !== null
              ? 'border-primary/50 bg-primary/10 text-primary'
              : 'border-border/70 bg-card text-muted-foreground hover:text-foreground',
          )}
        >
          <CalendarRange className="h-3.5 w-3.5" />
          <span>
            {corte >= diasNoMes ? 'Mês inteiro' : `Até o dia ${corte}`}
          </span>
          {escolhido !== null && (
            <span className="rounded bg-primary/20 px-1 text-[9px] uppercase tracking-wide">
              filtrado
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[300px] space-y-3">
        <div>
          <p className="text-xs font-semibold text-foreground">Período analisado</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
            Do dia 1 até o dia escolhido — e o mês anterior é medido até esse
            mesmo dia.
          </p>
        </div>

        <label className="block">
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Analisar até
          </span>
          <input
            type="date"
            value={dataIso}
            min={`${mes}-01`}
            max={`${mes}-${String(diasNoMes).padStart(2, '0')}`}
            onChange={e => {
              const v = e.target.value;
              // Fora do mês em foco não é corte: o seletor de mês do cabeçalho
              // é quem troca de mês, e aceitar aqui deixaria a tela mostrando
              // um mês no título e outro nos números.
              if (!v.startsWith(`${mes}-`)) return;
              const dia = Number(v.slice(8, 10));
              if (Number.isFinite(dia) && dia >= 1) onEscolher(Math.min(dia, diasNoMes));
            }}
            className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-foreground"
          />
        </label>

        <div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Ou arraste pelo mês
            </span>
            <span className="font-mono text-xs font-bold tabular-nums text-foreground">
              dia {corte}
            </span>
          </div>
          <input
            type="range"
            min={1}
            max={diasNoMes}
            value={corte}
            onChange={e => onEscolher(Number(e.target.value))}
            aria-label="Comparar os dois meses até este dia"
            className="mt-1.5 h-1 w-full cursor-pointer accent-primary"
          />
        </div>

        {escolhido !== null && (
          <button
            type="button"
            onClick={() => onEscolher(null)}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-border px-2 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <RotateCcw className="h-3 w-3" /> Voltar para o dia de hoje
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ── A aba ───────────────────────────────────────────────────────────────────

export function DiretoriaVisaoGeral({
  empresaId, mes, versao = 0, onAbrirSetores,
}: {
  empresaId: string;
  mes: string;
  /** Muda quando o «Atualizar» do cabeçalho é clicado. Só isso força a recarga. */
  versao?: number;
  /** Leva para a aba de setores. Opcional: a aba funciona sozinha. */
  onAbrirSetores?: () => void;
}) {
  const [dados, setDados]       = useState<VisaoGeralDiretoria | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro]         = useState<string | null>(null);
  const [modo, setModo]         = useState<'acumulado' | 'dia'>('acumulado');
  /** `null` = o corte que o banco escolheu (hoje). Só vira número se alguém mexe. */
  const [corteEscolhido, setCorteEscolhido] = useState<number | null>(null);
  /** Grupo de forma de pagamento aberto pelo clique. Um por vez: a lista é curta. */
  const [formaAberta, setFormaAberta] = useState<string | null>(null);
  /** Grupo sob o cursor. Separado do aberto — realçar não é abrir. */
  const [formaSobre, setFormaSobre] = useState<string | null>(null);

  const { tickColor, gridColor } = useAxisColors();
  const cores = useChartColors(['--primary', '--muted-foreground']);
  const corAtual    = cores['--primary']          ?? FALLBACK_PRIMARIA;
  const corAnterior = cores['--muted-foreground'] ?? FALLBACK_ANTERIOR;

  const carregar = useCallback(async (corte: number | null) => {
    if (!empresaId) return;
    setErro(null);
    try {
      setDados(await buscarVisaoGeralDiretoria(empresaId, mes, corte));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao carregar a visão geral.');
    } finally {
      setCarregando(false);
    }
  }, [empresaId, mes]);

  // Trocar de mês zera o corte: o dia 20 de agosto e o dia 20 de setembro são
  // pontos diferentes do mês, e herdar o corte anterior mostraria um recorte
  // que ninguém pediu.
  useEffect(() => { setCorteEscolhido(null); setCarregando(true); }, [mes]);
  // `versao` entra nas dependências só para o «Atualizar» do cabeçalho poder
  // disparar a mesma busca sem esta aba precisar expor nada para cima.
  useEffect(() => { void carregar(corteEscolhido); }, [carregar, corteEscolhido, versao]);

  const serieGrafico = useMemo(() => {
    if (!dados) return [];
    const base = modo === 'acumulado' ? acumular(dados.serie) : dados.serie;
    // Depois do corte não há dado: `null` faz o recharts INTERROMPER a linha,
    // enquanto `0` desenharia uma queda a pique até o fim do mês.
    return base.map(d => ({
      dia: d.dia,
      valor:         d.dentroDoCorte ? d.valor : null,
      valorAnterior: d.valorAnterior,
    }));
  }, [dados, modo]);

  /** As formas em famílias — «Boleto», «Cartão», «Cartão recorrente». */
  const grupos = useMemo(() => agruparFormas(dados?.formas ?? []), [dados]);

  if (carregando) {
    return (
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[104px] rounded-xl" />)}
        </div>
        <Skeleton className="h-[340px] rounded-xl" />
      </div>
    );
  }

  if (erro) {
    return (
      <div className="flex items-start gap-2.5 rounded-xl border border-rose-500/40 bg-rose-500/5 px-4 py-3">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
        <div className="text-xs">
          <p className="font-semibold text-foreground">Não foi possível carregar a visão geral</p>
          <p className="mt-0.5 text-muted-foreground">{erro}</p>
        </div>
      </div>
    );
  }

  if (!dados?.temLote) {
    return (
      <div className="flex items-start gap-2.5 rounded-xl border border-border bg-muted/20 px-4 py-4">
        <FileSpreadsheet className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="text-xs leading-relaxed">
          <p className="font-semibold text-foreground">Nenhum relatório 59 promovido neste mês</p>
          <p className="text-muted-foreground">
            Este painel lê o relatório mestre. Importe o 59 do mês na aba{' '}
            <strong className="text-foreground">Relatório 59</strong> para os números aparecerem.
          </p>
        </div>
      </div>
    );
  }

  const varTotal   = dados.temLoteAnterior ? variacao(dados.recebido, dados.recebidoAnterior) : null;
  const estimativa = estimativaDeFechamento(dados.recebido, dados.diaCorte, dados.diasNoMes);
  const mesFechado = dados.diaCorte >= dados.diasNoMes;
  const diferenca  = dados.recebido - dados.recebidoAnterior;

  const totalFormas = grupos.reduce((s, g) => s + g.valor, 0);
  const maiorGrupo  = grupos[0];
  const maiorCarteira = dados.carteiras[0];

  // Quem cresceu mais e quem caiu mais, para a leitura do período. Só com mês
  // anterior: sem base, «puxa o crescimento» não significa nada.
  const comVariacao = dados.temLoteAnterior
    ? dados.carteiras
        .map(c => ({ ...c, v: variacao(c.valor, c.valorAnterior) }))
        .filter((c): c is typeof c & { v: number } => c.v !== null)
    : [];
  const destaque = [...comVariacao].sort((a, b) => b.v - a.v)[0];
  const atencao  = [...comVariacao].sort((a, b) => a.v - b.v)[0];

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-4 pb-16"
    >
      {/* ── Barra de contexto: o que está sendo medido, e o filtro ───────── */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          <span className="font-semibold text-foreground">
            {mesFechado
              ? `${rotuloDoMes(mes)} inteiro`
              : `1 a ${dados.diaCorte} de ${rotuloDoMes(mes)}`}
          </span>
          {dados.temLoteAnterior
            ? <> · comparado com o mesmo trecho de {rotuloDoMes(dados.mesAnterior)}</>
            : <> · sem mês anterior importado para comparar</>}
        </p>
        <FiltroDePeriodo
          mes={mes}
          corte={dados.diaCorte}
          diasNoMes={dados.diasNoMes}
          escolhido={corteEscolhido}
          onEscolher={setCorteEscolhido}
        />
      </div>

      {/* ── Os quatro números ────────────────────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Numero
          destaque
          Icone={Wallet}
          rotulo="Recebido no período"
          valor={formatBRL(dados.recebido)}
          sub={
            <span className="flex flex-wrap items-center gap-1.5">
              <Selo pct={varTotal} />
              <span>
                {mesFechado ? 'mês fechado' : `até o dia ${dados.diaCorte}`}
                {dados.temLoteAnterior && ` · ${formatBRL(dados.recebidoAnterior)} antes`}
              </span>
            </span>
          }
        />
        <Numero
          Icone={Activity}
          rotulo={mesFechado ? 'Média por dia' : 'Fecha o mês em'}
          valor={
            mesFechado
              ? formatBRL(dados.recebido / Math.max(1, dados.diasNoMes))
              : estimativa !== null ? formatBRL(estimativa) : '—'
          }
          sub={mesFechado
            ? `${dados.diasNoMes} dias corridos`
            : 'mantendo o ritmo até aqui · estimativa'}
        />
        <Numero
          Icone={Users}
          rotulo="Operadores com recebimento"
          valor={String(dados.operadores)}
          sub={`${dados.linhas.toLocaleString('pt-BR')} pagamentos no período`}
        />
        <Numero
          Icone={Layers}
          rotulo="Carteiras ativas"
          valor={String(dados.carteirasQtd)}
          sub={maiorCarteira
            ? <>maior: <strong className="text-foreground">{maiorCarteira.nome}</strong></>
            : undefined}
        />
      </div>

      {/* ── Ritmo + leitura do período ───────────────────────────────────── */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="rounded-xl border border-border/70 bg-card p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">O ritmo do recebimento</h3>
              <p className="text-[11px] text-muted-foreground">
                Realizado e comparação com {rotuloDoMes(dados.mesAnterior)}, no mesmo dia de corte.
              </p>
            </div>
            {/* Acumulado responde «vamos fechar bem?»; por dia responde «o que
                aconteceu no dia 12?». São perguntas diferentes, não estilos. */}
            <div className="inline-flex rounded-lg border border-border p-0.5">
              {([['acumulado', 'Acumulado'], ['dia', 'Por dia']] as const).map(([k, r]) => (
                <button
                  key={k}
                  onClick={() => setModo(k)}
                  aria-pressed={modo === k}
                  className={cn(
                    'rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors',
                    modo === k ? 'bg-primary text-primary-foreground'
                               : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={serieGrafico} margin={{ top: 6, right: 8, bottom: 0, left: -6 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                <XAxis
                  dataKey="dia" tick={{ fontSize: 10, fill: tickColor }}
                  stroke={gridColor} tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: tickColor }}
                  stroke={gridColor}
                  tickLine={false}
                  axisLine={false}
                  width={52}
                  tickFormatter={v => `${Math.round(Number(v) / 1000)}k`}
                />
                <Tooltip
                  content={<TooltipRitmo />}
                  cursor={{ stroke: corAtual, strokeWidth: 1, strokeDasharray: '4 4' }}
                />
                <Line
                  type="monotone" dataKey="valorAnterior" name="Mês anterior"
                  stroke={corAnterior} strokeWidth={1.5} strokeOpacity={0.7}
                  strokeDasharray="5 4" dot={false} isAnimationActive={false}
                />
                <Line
                  type="monotone" dataKey="valor" name="Este mês"
                  stroke={corAtual} strokeWidth={2.5}
                  dot={false} isAnimationActive={false}
                  /* Sem isto o recharts pula o buraco e liga o último dia com
                     dado ao primeiro depois dele, inventando um trecho. */
                  connectNulls={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-4 border-t border-border/50 pt-2.5 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <i className="h-0.5 w-4 rounded-full" style={{ background: corAtual }} />
              Este mês
            </span>
            <span className="inline-flex items-center gap-1.5">
              <i
                className="h-0.5 w-4 rounded-full opacity-70"
                style={{ background: `repeating-linear-gradient(90deg, ${corAnterior} 0 4px, transparent 4px 7px)` }}
              />
              {rotuloDoMes(dados.mesAnterior)}
            </span>
          </div>
        </section>

        <aside className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card p-4 shadow-sm">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            <Activity className="h-3 w-3" /> Leitura do período
          </span>

          {varTotal === null ? (
            <p className="text-sm text-muted-foreground">
              Sem o mês anterior importado, não há comparação a fazer — só o valor deste mês.
            </p>
          ) : (
            <>
              <h4 className="text-lg font-bold leading-tight text-foreground">
                {varTotal >= 0 ? 'Acima do mês anterior.' : 'Abaixo do mês anterior.'}
              </h4>
              <p className="text-xs leading-relaxed text-muted-foreground">
                O recebimento está{' '}
                <strong className={varTotal >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
                  {formatBRL(Math.abs(diferenca))} {varTotal >= 0 ? 'acima' : 'abaixo'}
                </strong>{' '}
                do mesmo período de {rotuloDoMes(dados.mesAnterior)}.
              </p>
            </>
          )}

          {destaque && (
            <div className="flex items-start gap-2 border-t border-border/50 pt-3">
              <TrendingUp className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
              <div className="text-xs">
                <p className="font-semibold text-foreground">{destaque.nome}</p>
                <p className="text-muted-foreground">
                  {destaque.v >= 0 ? 'cresceu' : 'caiu'} {pct(Math.abs(destaque.v))}%
                  {' '}contra o mês anterior.
                </p>
              </div>
            </div>
          )}

          {atencao && atencao.cod !== destaque?.cod && (
            <div className="flex items-start gap-2">
              {atencao.v < 0
                ? <TrendingDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                : <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />}
              <div className="text-xs">
                <p className="font-semibold text-foreground">{atencao.nome}</p>
                <p className="text-muted-foreground">
                  {atencao.v < 0 ? 'merece atenção: ' : 'segue no ritmo: '}
                  {pct(Math.abs(atencao.v))}%
                  {atencao.v < 0 ? ' abaixo' : ' acima'} do mês anterior.
                </p>
              </div>
            </div>
          )}

          {onAbrirSetores && (
            <button
              onClick={onAbrirSetores}
              className="mt-auto inline-flex items-center gap-1 self-start text-xs font-semibold text-primary transition-opacity hover:opacity-80"
            >
              Explorar setores e equipes <ArrowUpRight className="h-3 w-3" />
            </button>
          )}
        </aside>
      </div>

      {/* ── Setores alternativos ─────────────────────────────────────────
          Ficam ANTES do bloco de carteiras e depois dos números do mês, que é
          onde a pergunta «e o Treinamento?» aparece. A frase de que não somam
          não é enfeite: sem ela, quem lê tenta fechar o total de cabeça e abre
          chamado quando não fecha. */}
      {dados.alternativos.length > 0 && (
        <section className="rounded-xl border border-border/70 bg-card p-4 shadow-sm">
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-foreground">Setores alternativos</h3>
            <p className="text-[11px] text-muted-foreground">
              Clonam o recebimento de quem é de outros setores —{' '}
              <strong className="text-foreground">não somam</strong> no total acima.
            </p>
          </div>
          <div className="space-y-0.5">
            {dados.alternativos.map(a => (
              <div
                key={a.setorId}
                className="flex items-center gap-3 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-muted/40"
              >
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="truncate text-xs text-foreground" title={a.setorNome}>
                    {a.setorNome}
                  </span>
                  <span className="shrink-0 rounded border border-border px-1 text-[9px] uppercase text-muted-foreground">
                    {a.pessoas} {a.pessoas === 1 ? 'pessoa' : 'pessoas'}
                  </span>
                </span>
                <span className="w-[104px] shrink-0 text-right font-mono text-xs tabular-nums text-foreground">
                  {formatBRL(a.valor)}
                </span>
                <span className="w-[62px] shrink-0 text-right">
                  <Selo pct={dados.temLoteAnterior ? variacao(a.valor, a.valorAnterior) : null} />
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Onde acontece + como o dinheiro chega ────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="rounded-xl border border-border/70 bg-card p-4 shadow-sm">
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-foreground">Onde o resultado acontece</h3>
            <p className="text-[11px] text-muted-foreground">
              Recebimento por carteira do 59{dados.temLoteAnterior && ' · variação contra o mês anterior'}.
            </p>
          </div>
          {/* A barra é um DEGRADÊ da cor da empresa, não uma paleta por
              categoria: aqui a cor é grandeza, não rótulo. Quanto maior o
              recebimento, mais forte o tom — ver `intensidadeDaBarra` para o
              porquê da raiz quadrada. */}
          <div className="space-y-0.5">
            {dados.carteiras.map(c => {
              const largura = maiorCarteira?.valor
                ? Math.max(2, (c.valor / maiorCarteira.valor) * 100) : 0;
              const forca = intensidadeDaBarra(c.valor, maiorCarteira?.valor ?? 0);
              return (
                <div
                  key={c.cod}
                  className="flex items-center gap-3 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-muted/40"
                >
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="truncate text-xs text-foreground" title={c.nome}>{c.nome}</span>
                    {/* Carteira sem setor não é defeito: parte da cobrança não
                        pertence a setor nenhum, e o total da empresa a inclui. */}
                    {!c.setorId && (
                      <span className="shrink-0 rounded border border-border px-1 text-[9px] uppercase text-muted-foreground">
                        sem setor
                      </span>
                    )}
                  </span>
                  <span className="hidden h-2 w-[26%] shrink-0 overflow-hidden rounded-full bg-muted/60 sm:block">
                    <span
                      className="block h-full rounded-full bg-primary"
                      style={{ width: `${largura}%`, opacity: forca }}
                    />
                  </span>
                  <span className="w-[104px] shrink-0 text-right font-mono text-xs tabular-nums text-foreground">
                    {formatBRL(c.valor)}
                  </span>
                  <span className="w-[62px] shrink-0 text-right">
                    <Selo pct={dados.temLoteAnterior ? variacao(c.valor, c.valorAnterior) : null} />
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        {/* `self-start`: a lista de carteiras ao lado é muito mais alta, e um
            card esticado até lá teria o rodapé boiando sobre um vão vazio. */}
        <section className="self-start rounded-xl border border-border/70 bg-card p-4 shadow-sm">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Como o dinheiro chega</h3>
            <p className="text-[11px] text-muted-foreground">
              Participação no total recebido · clique para abrir as variações.
            </p>
          </div>

          {/* Barra empilhada em vez de rosca: com as variações do ERP as fatias
              de rosca viram lascas ilegíveis. A barra mantém a proporção e
              sobra espaço para o rótulo. */}
          {/* O realce é do HOVER, e abrir é do CLIQUE. Se passar o mouse já
              abrisse o grupo, a lista embaixo mudaria de altura ao varrer a
              barra e o alvo fugiria do cursor. */}
          <div
            className="mt-3 flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full"
            onMouseLeave={() => setFormaSobre(null)}
          >
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
              const abre  = g.itens.length > 1;
              const aberto = formaAberta === g.chave;
              const parte = totalFormas ? (g.valor / totalFormas) * 100 : 0;
              const cor   = corDaForma(g.rotulo);
              return (
                <li key={g.chave}>
                  <button
                    type="button"
                    /* `aria-disabled` e não `disabled`: botão desabilitado não
                       recebe evento de mouse em todo navegador, e o grupo de um
                       item só perderia o realce na barra ao passar o cursor. */
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
                    <ChevronRight
                      className={cn(
                        'h-3 w-3 shrink-0 text-muted-foreground transition-transform',
                        !abre && 'invisible',
                        aberto && 'rotate-90',
                      )}
                    />
                    <i className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: cor }} />
                    <span className="min-w-0 flex-1 truncate font-medium text-foreground" title={g.rotulo}>
                      {g.rotulo}
                    </span>
                    <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                      {pct(parte)}%
                    </span>
                    <span className="w-[92px] shrink-0 text-right font-mono tabular-nums text-foreground">
                      {formatBRL(g.valor)}
                    </span>
                  </button>

                  {abre && aberto && (
                    <ul className="mb-1.5 space-y-1 rounded-lg bg-muted/40 px-2 py-2">
                      {g.itens.map(f => (
                        <li key={f.forma} className="flex items-center gap-2 text-[11px]">
                          <span
                            className="ml-3.5 h-1.5 w-1.5 shrink-0 rounded-full"
                            style={{ background: cor, opacity: 0.6 }}
                          />
                          <span className="min-w-0 flex-1 truncate text-muted-foreground" title={f.forma}>
                            {f.forma}
                          </span>
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
                {maiorGrupo.rotulo} representa {pct((maiorGrupo.valor / totalFormas) * 100)}%
              </strong>{' '}
              do recebimento do período.
            </p>
          )}
        </section>
      </div>
    </motion.div>
  );
}

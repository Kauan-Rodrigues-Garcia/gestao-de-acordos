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
 * O corte sai do banco quando ninguém escolhe: hoje, no mês corrente; o último
 * dia, num mês fechado. O slider existe para investigar («como estávamos no dia
 * 20?»), não para configurar.
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
} from 'lucide-react';
import type { PropsTooltipGrafico } from '@/lib/recharts-tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { formatBRL } from '@/lib/money';
import {
  buscarVisaoGeralDiretoria, variacao, acumular, estimativaDeFechamento,
  type VisaoGeralDiretoria,
} from '@/services/mestre/diretoria.service';

/**
 * Cores das formas de pagamento.
 *
 * Por PREFIXO, e não por igualdade: o ERP escreve «CARTÃO», «CARTÃO DE
 * CRÉDITO» e «CARTÃO SITE PARCIAL + BOLETO», e as três são cartão. Uma lista
 * fechada obrigaria a mexer no código toda vez que o ERP inventasse um rótulo
 * — e, pior, a forma nova cairia no cinza sem ninguém perceber.
 */
const CORES_FORMA: { prefixo: string; cor: string }[] = [
  { prefixo: 'PIX AUTOM', cor: '#0ea5e9' },
  { prefixo: 'PIX',       cor: '#06b6d4' },
  { prefixo: 'CARTÃO',    cor: '#8b5cf6' },
  { prefixo: 'RECORRENTE', cor: '#a855f7' },
  { prefixo: 'BOLETO',    cor: '#f59e0b' },
];
const COR_OUTROS = '#64748b';

function corDaForma(forma: string): string {
  const f = forma.toUpperCase();
  return CORES_FORMA.find(c => f.startsWith(c.prefixo))?.cor ?? COR_OUTROS;
}

/** Paleta das barras de carteira. Cicla — 20 setores não precisam de 20 cores. */
const CORES_CARTEIRA = [
  '#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444',
  '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1',
];

// ── Peças pequenas ──────────────────────────────────────────────────────────

/** Selo de variação. `null` não vira 0% — vira nada. Ver `variacao`. */
function Selo({ pct, className }: { pct: number | null; className?: string }) {
  if (pct === null) return null;
  const positivo = pct >= 0;
  const Icone = Math.abs(pct) < 0.05 ? Minus : positivo ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn(
      'inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums',
      positivo ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
               : 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
      className,
    )}>
      <Icone className="h-3 w-3" />
      {Math.abs(pct).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
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

// ── A aba ───────────────────────────────────────────────────────────────────

export function DiretoriaVisaoGeral({
  empresaId, mes, onAbrirSetores,
}: {
  empresaId: string;
  mes: string;
  /** Leva para a aba de setores. Opcional: a aba funciona sozinha. */
  onAbrirSetores?: () => void;
}) {
  const [dados, setDados]       = useState<VisaoGeralDiretoria | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro]         = useState<string | null>(null);
  const [modo, setModo]         = useState<'acumulado' | 'dia'>('acumulado');
  /** `null` = o corte que o banco escolheu. Só vira número quando alguém mexe. */
  const [corteEscolhido, setCorteEscolhido] = useState<number | null>(null);

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
  useEffect(() => { void carregar(corteEscolhido); }, [carregar, corteEscolhido]);

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

  const totalFormas = dados.formas.reduce((s, f) => s + f.valor, 0);
  const maiorForma  = dados.formas[0];
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
      className="space-y-4"
    >
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
                Realizado e comparação com {dados.mesAnterior}, no mesmo dia de corte.
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

          <div className="h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={serieGrafico} margin={{ top: 6, right: 8, bottom: 0, left: -12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} vertical={false} />
                <XAxis dataKey="dia" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" tickLine={false} />
                <YAxis
                  tick={{ fontSize: 10 }}
                  stroke="hsl(var(--muted-foreground))"
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={v => `${Math.round(Number(v) / 1000)}k`}
                />
                <Tooltip content={<TooltipRitmo />} cursor={{ stroke: 'hsl(var(--primary))', strokeWidth: 1, strokeDasharray: '4 4' }} />
                <Line
                  type="monotone" dataKey="valorAnterior" name="Mês anterior"
                  stroke="hsl(var(--muted-foreground))" strokeWidth={1.5}
                  strokeDasharray="5 4" dot={false} isAnimationActive={false}
                />
                <Line
                  type="monotone" dataKey="valor" name="Este mês"
                  stroke="hsl(var(--primary))" strokeWidth={2.5}
                  dot={false} isAnimationActive={false}
                  /* Sem isto o recharts pula o buraco e liga o último dia com
                     dado ao primeiro depois dele, inventando um trecho. */
                  connectNulls={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* O corte é investigação, não configuração: mexer aqui responde
              «como estávamos no dia 20?» sem mudar nada para ninguém. */}
          <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-border/50 pt-3">
            <span className="text-[11px] font-medium text-muted-foreground">Comparar até o dia</span>
            <input
              type="range"
              min={1}
              max={dados.diasNoMes}
              value={dados.diaCorte}
              onChange={e => setCorteEscolhido(Number(e.target.value))}
              aria-label="Comparar os dois meses até este dia"
              className="h-1 min-w-[160px] flex-1 cursor-pointer accent-primary"
            />
            <span className="min-w-[2ch] font-mono text-sm font-bold tabular-nums text-foreground">
              {dados.diaCorte}
            </span>
            {corteEscolhido !== null && (
              <button
                onClick={() => setCorteEscolhido(null)}
                className="rounded-md border border-border px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
              >
                Voltar ao padrão
              </button>
            )}
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
                do mesmo período de {dados.mesAnterior}.
              </p>
            </>
          )}

          {destaque && (
            <div className="flex items-start gap-2 border-t border-border/50 pt-3">
              <TrendingUp className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
              <div className="text-xs">
                <p className="font-semibold text-foreground">{destaque.nome}</p>
                <p className="text-muted-foreground">
                  {destaque.v >= 0 ? 'cresceu' : 'caiu'}{' '}
                  {Math.abs(destaque.v).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
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
                  {Math.abs(atencao.v).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
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

      {/* ── Onde acontece + como o dinheiro chega ────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="rounded-xl border border-border/70 bg-card p-4 shadow-sm">
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-foreground">Onde o resultado acontece</h3>
            <p className="text-[11px] text-muted-foreground">
              Recebimento por carteira do 59{dados.temLoteAnterior && ' · variação contra o mês anterior'}.
            </p>
          </div>
          <div className="space-y-1.5">
            {dados.carteiras.map((c, i) => {
              const largura = maiorCarteira?.valor
                ? Math.max(2, (c.valor / maiorCarteira.valor) * 100) : 0;
              const cor = CORES_CARTEIRA[i % CORES_CARTEIRA.length];
              return (
                <div key={c.cod} className="flex items-center gap-3 rounded-lg px-1 py-1">
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <i className="h-2 w-2 shrink-0 rounded-full" style={{ background: cor }} />
                    <span className="truncate text-xs text-foreground" title={c.nome}>{c.nome}</span>
                    {/* Carteira sem setor não é defeito: parte da cobrança não
                        pertence a setor nenhum, e o total da empresa a inclui. */}
                    {!c.setorId && (
                      <span className="shrink-0 rounded border border-border px-1 text-[9px] uppercase text-muted-foreground">
                        sem setor
                      </span>
                    )}
                  </span>
                  <span className="hidden h-1.5 w-[26%] shrink-0 overflow-hidden rounded-full bg-muted sm:block">
                    <span className="block h-full rounded-full" style={{ width: `${largura}%`, background: cor }} />
                  </span>
                  <span className="w-[100px] shrink-0 text-right font-mono text-xs tabular-nums text-foreground">
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

        <section className="rounded-xl border border-border/70 bg-card p-4 shadow-sm">
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-foreground">Como o dinheiro chega</h3>
            <p className="text-[11px] text-muted-foreground">Participação no total recebido.</p>
          </div>

          {/* Barra empilhada em vez de rosca: com 8 formas e três variações de
              «CARTÃO», as fatias de rosca viram lascas ilegíveis. A barra
              mantém a proporção e sobra espaço para o rótulo. */}
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
            {dados.formas.map(f => (
              <span
                key={f.forma}
                title={`${f.forma}: ${formatBRL(f.valor)}`}
                style={{
                  width: `${totalFormas ? (f.valor / totalFormas) * 100 : 0}%`,
                  background: corDaForma(f.forma),
                }}
              />
            ))}
          </div>

          <div className="mt-3 space-y-1.5">
            {dados.formas.map(f => (
              <div key={f.forma} className="flex items-center gap-2 text-xs">
                <i className="h-2 w-2 shrink-0 rounded-full" style={{ background: corDaForma(f.forma) }} />
                <span className="min-w-0 flex-1 truncate text-foreground" title={f.forma}>{f.forma}</span>
                <span className="shrink-0 font-mono tabular-nums text-muted-foreground">
                  {totalFormas
                    ? ((f.valor / totalFormas) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })
                    : '0'}%
                </span>
                <span className="w-[92px] shrink-0 text-right font-mono tabular-nums text-foreground">
                  {formatBRL(f.valor)}
                </span>
              </div>
            ))}
          </div>

          {maiorForma && totalFormas > 0 && (
            <p className="mt-3 border-t border-border/50 pt-3 text-[11px] leading-relaxed text-muted-foreground">
              <strong className="text-foreground">
                {maiorForma.forma} representa{' '}
                {((maiorForma.valor / totalFormas) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
              </strong>{' '}
              do recebimento do período.
            </p>
          )}
        </section>
      </div>
    </motion.div>
  );
}

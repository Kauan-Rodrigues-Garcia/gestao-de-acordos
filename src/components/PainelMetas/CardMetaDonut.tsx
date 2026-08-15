/**
 * CardMetaDonut — o donut de meta do painel antigo, preservado, com breakdown.
 *
 * É o mesmo card que vivia no `ChartsSection` ("Meta — % Atingida"): cabeçalho
 * com ícone em quadrado tingido, anel de 180px e o rodapé "R$ recebido de R$
 * meta". Estrutura e proporções mantidas de propósito — ele é mais detalhado
 * que qualquer anel novo e o time já lê essa peça de relance.
 *
 * O breakdown por forma de pagamento (Pix, Boleto, Cartão…) mora AQUI, e não
 * numa fileira de cards soltos. Eram sete ou oito números disputando espaço com
 * meta e projeção, que é o que a tela veio dizer; dobrados atrás de um clique,
 * continuam a um passe de mouse sem custar atenção.
 *
 * As faixas de cor do anel são as MESMAS do card original (100 / 70 / 40), e
 * não as de quartil: aqui se mede a meta do mês, não a projeção contra o
 * esperado até hoje. Trocar a régua mudaria a cor de um número que não mudou.
 */

import { useState, type CSSProperties } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Target, ArrowUpRight, ChevronRight } from 'lucide-react';
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DonutChart } from '@/components/AnalyticsPanel/SubComponents';
import { BREAKDOWN_COLORS } from '@/components/AnalyticsPanel/constants';
import { formatBRL } from '@/lib/money';
import { pctLimitado } from '@/lib/projecaoMetas';

/** Faixas de cor do card original. */
export function corDaMeta(pct: number): string {
  if (pct >= 100) return '#22c55e';
  if (pct >= 70)  return '#6366f1';
  if (pct >= 40)  return '#f59e0b';
  return '#ef4444';
}

export interface FatiaForma {
  label: string;
  /**
   * Valor na unidade que o painel está exibindo — H.O. ou bruto.
   *
   * Chamava-se `bruto` quando só havia uma unidade possível. O nome neutro
   * evita a leitura errada de que a fatia é sempre o valor cheio: com o
   * alternador da PaguePlay em H.O., isto aqui é H.O.
   */
  valor: number;
  qtd: number;
  /** Participação no total recebido, em %. */
  perc: number;
}

/**
 * Ordena as formas e calcula a participação de cada uma.
 *
 * A % é sobre o VALOR, não sobre a quantidade de pagamentos: num painel de
 * recebimento, "40% veio de Pix" precisa querer dizer 40% do dinheiro. O
 * card antigo dividia por quantidade de acordos, o que fazia dez boletos
 * pequenos pesarem mais que um cartão grande.
 *
 * A participação é a mesma nas duas unidades — o H.O. é uma fração do bruto —,
 * então trocar o alternador reordena nada: só muda o valor impresso.
 */
export function fatiasDeForma(
  porForma: Record<string, { valor: number; qtd: number }>,
): FatiaForma[] {
  const entradas = Object.entries(porForma);
  const total = entradas.reduce((s, [, f]) => s + f.valor, 0);
  return entradas
    .map(([label, f]) => ({
      label,
      valor: f.valor,
      qtd: f.qtd,
      perc: total > 0 ? Math.round((f.valor / total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.valor - a.valor);
}

function formatarPct(v: number): string {
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
}

interface CardMetaDonutProps {
  recebido: number;
  meta: number;
  /** "individual" ou "da equipe" — só muda o rótulo do rodapé. */
  escopoRotulo: string;
  porForma: Record<string, { valor: number; qtd: number }>;
}

export function CardMetaDonut({
  recebido, meta, escopoRotulo, porForma,
}: CardMetaDonutProps) {
  const [breakdownAberto, setBreakdownAberto] = useState(false);
  const pct = pctLimitado(recebido, meta);
  const cor = corDaMeta(pct);
  const fatias = fatiasDeForma(porForma);

  return (
    <Card className="border-border/70 bg-card shadow-sm h-full">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <div
              className="flex items-center justify-center w-6 h-6 rounded-md shrink-0"
              style={{ background: cor + '22' }}
            >
              <Target className="w-3.5 h-3.5" style={{ color: cor }} />
            </div>
            Progresso da meta
          </CardTitle>
          {fatias.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[11px] gap-1 text-muted-foreground hover:text-foreground px-2 shrink-0"
              onClick={() => setBreakdownAberto(v => !v)}
            >
              {breakdownAberto ? 'Resumo' : 'Formas'}
              <ChevronRight
                className={`w-3 h-3 transition-transform duration-200 ${breakdownAberto ? 'rotate-90' : ''}`}
              />
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="pb-5">
        <AnimatePresence mode="wait">
          {!breakdownAberto ? (
            <motion.div
              key="donut-meta"
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.22 }}
              className="flex flex-col items-center gap-4"
            >
              <DonutChart
                percent={pct}
                label={`${pct}%`}
                sublabel="da meta"
                color={cor}
                size={180}
              />
              <div className="text-center space-y-1">
                <p className="text-xs text-muted-foreground">
                  <span className="font-mono tabular-nums font-semibold text-foreground">
                    {formatBRL(recebido)}
                  </span>
                  {' '}de{' '}
                  <span className="font-mono tabular-nums">{formatBRL(meta)}</span>
                </p>
                <p className="text-[11px] text-muted-foreground/80">meta {escopoRotulo}</p>
                {pct >= 100 && (
                  <p className="text-xs font-semibold text-emerald-500 flex items-center justify-center gap-1">
                    <ArrowUpRight className="w-3.5 h-3.5" />
                    Meta atingida!
                  </p>
                )}
              </div>

              {fatias.length > 0 && (
                <div className="w-full space-y-2 pt-3 border-t border-border/60">
                  <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide">
                    Top formas de pagamento
                  </p>
                  {fatias.slice(0, 2).map((f, i) => (
                    <LinhaForma key={f.label} fatia={f} indice={i} />
                  ))}
                  {fatias.length > 2 && (
                    <p className="text-[11px] text-muted-foreground pl-0.5">
                      +{fatias.length - 2} mais — clique em &quot;Formas&quot;
                    </p>
                  )}
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="donut-formas"
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.22 }}
              className="space-y-3"
            >
              <div className="flex flex-col items-center">
                <ResponsiveContainer width="100%" height={150}>
                  <PieChart>
                    <Pie
                      data={fatias}
                      cx="50%" cy="50%"
                      innerRadius={44}
                      outerRadius={68}
                      paddingAngle={3}
                      dataKey="valor"
                      isAnimationActive
                      animationBegin={60}
                      animationDuration={700}
                    >
                      {fatias.map((_, i) => (
                        <Cell
                          key={i}
                          fill={BREAKDOWN_COLORS[i % BREAKDOWN_COLORS.length]}
                          stroke="transparent"
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        borderRadius: '10px',
                        border: '1px solid rgba(148,163,184,0.2)',
                        background: 'var(--popover)',
                        color: 'var(--popover-foreground)',
                        fontSize: '11px',
                        padding: '6px 10px',
                      }}
                      formatter={(valor: number, _nome: string, props: { payload?: FatiaForma }) => [
                        `${formatBRL(valor)} (${formatarPct(props.payload?.perc ?? 0)}%)`,
                        props.payload?.label ?? '',
                      ]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="space-y-2">
                {fatias.map((f, i) => <LinhaForma key={f.label} fatia={f} indice={i} detalhado />)}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}

function LinhaForma({
  fatia, indice, detalhado = false,
}: { fatia: FatiaForma; indice: number; detalhado?: boolean }) {
  const cor = BREAKDOWN_COLORS[indice % BREAKDOWN_COLORS.length];
  return (
    <div className="flex items-center gap-2.5">
      <span
        className="w-2.5 h-2.5 rounded-full shrink-0 ring-2 ring-offset-1 ring-offset-card"
        style={{ background: cor, ringColor: cor + '55' } as CSSProperties}
      />
      <span className="text-xs flex-1 truncate font-medium">{fatia.label}</span>
      <div className="flex items-center gap-2 shrink-0">
        {detalhado && (
          <span className="text-[11px] text-muted-foreground tabular-nums font-mono">
            {formatBRL(fatia.valor)}
          </span>
        )}
        <span className="text-[11px] text-muted-foreground">
          {fatia.qtd} pgto{fatia.qtd !== 1 ? 's' : ''}
        </span>
        <span
          className="text-xs font-bold tabular-nums font-mono px-1.5 py-0.5 rounded"
          style={{ background: cor + '18', color: cor }}
        >
          {formatarPct(fatia.perc)}%
        </span>
      </div>
    </div>
  );
}

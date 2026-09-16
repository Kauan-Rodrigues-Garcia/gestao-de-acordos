/**
 * EvolucaoVendas — o mês do Comercial em uma leitura só.
 *
 * É a `EvolucaoDiaria` da cobrança com as três perguntas do Comercial no lugar
 * das três dela:
 *
 *   quanto entrou no DIA      → barras
 *   quanto o mês já somou     → linha do acumulado, no eixo da direita
 *   qual era o esperado/dia   → régua horizontal tracejada na meta diária
 *
 * ## Por que o acumulado tem eixo próprio
 *
 * Um dia bom do setor faz R$ 80 mil; o mês fecha em R$ 740 mil. No mesmo eixo,
 * a linha do acumulado achata todas as barras contra o chão e o gráfico perde
 * justamente a leitura de ritmo que ele veio dar. Dois eixos custam uma legenda
 * a mais e devolvem as duas leituras inteiras.
 *
 * A linha é a informação NOVA em relação à barra: ela mostra se o mês está
 * ganhando ou perdendo inclinação, que é a pergunta que ninguém consegue
 * responder olhando trinta barras soltas.
 *
 * ## As barras têm uma cor só, em dois pesos
 *
 * Cheia quando o dia alcançou a meta diária, esmaecida quando não — a mesma
 * regra e a mesma função (`opacidadeDaBarra`) do gráfico da cobrança. Duas
 * cores fortes brigando roubariam a atenção da régua de meta, e o peso já diz
 * tudo sem depender de quem distingue verde de azul.
 *
 * Sem meta configurada todos os dias pesam igual, porque não há com o que
 * comparar — e um gráfico que escurece dias ao acaso ensina a desconfiar dele.
 */
import { useMemo } from 'react';
import {
  ComposedChart, Bar, Line, Cell, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAxisColors } from '@/hooks/useChartColors';
import { formatBRL } from '@/lib/money';
import { cn } from '@/lib/utils';
import { CHART_RECEBIDO, CHART_AGENDADO } from '@/components/AnalyticsPanel/constants';
import { OPACIDADES, opacidadeDaBarra } from '@/components/PainelMetas/opacidadeBarra';
import type { PropsTooltipGrafico } from '@/lib/recharts-tooltip';
import type { PontoDoMes } from '@/lib/vendasDashboard';

/** A cor do acumulado. A mesma que a cobrança usa na série de apoio. */
const COR_ACUMULADO = CHART_AGENDADO;
/** A cor do dia. A mesma que a cobrança usa na série principal. */
const COR_DIA = CHART_RECEBIDO;

function formatYAxis(valor: number): string {
  if (valor >= 1_000_000) return `R$${(valor / 1_000_000).toFixed(1)}M`;
  if (valor >= 1_000)     return `R$${(valor / 1_000).toFixed(0)}k`;
  return `R$${valor}`;
}

/**
 * O tooltip deste gráfico.
 *
 * Mesma caixa e mesmas classes do `CustomTooltip` da cobrança — é a peça que dá
 * a identidade visual —, com uma linha a mais: a QUANTIDADE do dia. Ela não é
 * uma série do gráfico (duas barras por dia empilhariam leituras diferentes),
 * mas é a primeira coisa que se pergunta ao parar o mouse num dia bom.
 */
function TooltipDoDia({ active, payload, label }: PropsTooltipGrafico) {
  if (!active || !payload?.length) return null;
  const ponto = (payload[0] as { payload?: PontoDoMes }).payload;

  return (
    <div className="rounded-xl border border-border/80 bg-popover/95 backdrop-blur-sm px-3 py-2.5 shadow-xl text-xs text-popover-foreground">
      <p className="font-semibold mb-1.5 text-foreground">Dia {label}</p>
      <div className="space-y-1">
        {payload.map((entry, i) => (
          <div key={i} className="flex items-center gap-2">
            <span
              className="inline-block w-2 h-2 rounded-full shrink-0"
              style={{ background: entry.color }}
            />
            <span className="text-muted-foreground">{entry.name}:</span>
            <span className="font-semibold tabular-nums font-mono" style={{ color: entry.color }}>
              {formatBRL(entry.value ?? 0)}
            </span>
          </div>
        ))}
        {ponto && (
          <div className="flex items-center gap-2 border-t border-border/60 pt-1 text-muted-foreground">
            <span className="inline-block w-2" />
            {ponto.quantidade === 0
              ? 'nenhuma venda na régua'
              : `${ponto.quantidade} venda${ponto.quantidade === 1 ? '' : 's'} na régua`}
          </div>
        )}
      </div>
    </div>
  );
}

interface EvolucaoVendasProps {
  serie: readonly PontoDoMes[];
  /** `null` sem meta — some a régua e as barras ficam com peso único. */
  metaDiaria: number | null;
  /** Dia de hoje, ou `null` num mês fechado (não existe «hoje» no passado). */
  diaDeHoje: number | null;
  /** Só muda o subtítulo: o gráfico desenha o que a tela já recortou. */
  eixo: 'confirmacao' | 'venda';
}

export function EvolucaoVendas({ serie, metaDiaria, diaDeHoje, eixo }: EvolucaoVendasProps) {
  const { tickColor, gridColor } = useAxisColors();

  const { diasComVenda, total, melhorDia, vendas } = useMemo(() => {
    let dias = 0, soma = 0, melhor = 0, qtd = 0;
    for (const p of serie) {
      if (p.valor > 0) { dias++; soma += p.valor; }
      if (p.valor > melhor) melhor = p.valor;
      qtd += p.quantidade;
    }
    return { diasComVenda: dias, total: soma, melhorDia: melhor, vendas: qtd };
  }, [serie]);

  return (
    <Card className="border-border/70 bg-card shadow-sm">
      <CardHeader className="pb-1 pt-4 px-4">
        <div className="flex items-center justify-between flex-wrap gap-x-4 gap-y-1">
          <CardTitle className="text-sm font-semibold text-foreground">
            Evolução diária
            <span className="ml-2 text-[11px] font-normal text-muted-foreground">
              {eixo === 'confirmacao' ? 'pelo dia da confirmação' : 'pelo dia da venda'}
            </span>
          </CardTitle>
          <div className="flex items-center gap-3.5 text-[10px] text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-[2px]" style={{ background: COR_DIA }} />
              Faturado no dia
            </span>
            {metaDiaria !== null && (
              <span className="flex items-center gap-1.5">
                <span
                  className="inline-block w-2 h-2 rounded-[2px]"
                  style={{ background: COR_DIA, opacity: OPACIDADES.abaixo }}
                />
                Abaixo da meta
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block w-3.5 h-[2px] rounded-full"
                style={{ background: COR_ACUMULADO }}
              />
              Acumulado do mês
            </span>
            {metaDiaria !== null && (
              <span className="flex items-center gap-1.5">
                <span
                  className="inline-block w-3.5 border-t border-dashed"
                  style={{ borderColor: tickColor }}
                />
                Meta diária
              </span>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-2 pb-3">
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={serie as PontoDoMes[]} margin={{ top: 14, right: 4, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
            <XAxis
              dataKey="rotulo"
              tick={{ fontSize: 9, fill: tickColor }}
              stroke="transparent"
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              minTickGap={8}
            />
            <YAxis
              yAxisId="dia"
              tick={{ fontSize: 9, fill: tickColor }}
              stroke="transparent"
              tickLine={false}
              axisLine={false}
              tickFormatter={formatYAxis}
              width={50}
            />
            {/* O acumulado num eixo próprio, à direita: no mesmo do dia ele
                achataria todas as barras contra o chão. */}
            <YAxis
              yAxisId="acumulado"
              orientation="right"
              tick={{ fontSize: 9, fill: tickColor }}
              stroke="transparent"
              tickLine={false}
              axisLine={false}
              tickFormatter={formatYAxis}
              width={46}
            />
            <Tooltip
              content={<TooltipDoDia />}
              cursor={{ fill: gridColor, fillOpacity: 0.2 }}
            />

            {metaDiaria !== null && (
              <ReferenceLine
                yAxisId="dia"
                y={metaDiaria}
                stroke={tickColor}
                strokeDasharray="4 4"
                strokeWidth={1}
                strokeOpacity={0.55}
                label={{
                  value: formatBRL(metaDiaria),
                  position: 'insideTopRight',
                  fill: tickColor,
                  fontSize: 9,
                  opacity: 0.8,
                }}
              />
            )}

            <Bar
              yAxisId="dia" dataKey="valor" name="Faturado no dia"
              radius={[3, 3, 0, 0]} maxBarSize={22}
            >
              {serie.map(p => (
                <Cell
                  key={p.dia}
                  fill={COR_DIA}
                  fillOpacity={opacidadeDaBarra(p.valor, metaDiaria)}
                  // Hoje ganha contorno, não outra cor: trocar a cor perderia a
                  // informação de alcançou/não alcançou a meta.
                  stroke={p.dia === diaDeHoje ? COR_DIA : undefined}
                  strokeWidth={p.dia === diaDeHoje ? 1.5 : 0}
                />
              ))}
            </Bar>

            <Line
              yAxisId="acumulado"
              type="monotone"
              dataKey="acumulado"
              name="Acumulado do mês"
              stroke={COR_ACUMULADO}
              strokeWidth={1.8}
              dot={false}
              activeDot={{ r: 3, fill: COR_ACUMULADO, strokeWidth: 0 }}
            />
          </ComposedChart>
        </ResponsiveContainer>

        <div className="flex items-center justify-center gap-x-3 gap-y-1 flex-wrap px-2 text-[10px] text-muted-foreground">
          <span>{diasComVenda} dia{diasComVenda !== 1 ? 's' : ''} com venda</span>
          <span aria-hidden>·</span>
          <span>{vendas} venda{vendas !== 1 ? 's' : ''} na régua</span>
          <span aria-hidden>·</span>
          <span>Total <Forte>{formatBRL(total)}</Forte></span>
          {melhorDia > 0 && (
            <>
              <span aria-hidden>·</span>
              <span>Melhor dia <Forte>{formatBRL(melhorDia)}</Forte></span>
            </>
          )}
          {metaDiaria !== null && (
            <>
              <span aria-hidden>·</span>
              <span>Meta/dia <Forte>{formatBRL(metaDiaria)}</Forte></span>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Forte({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <strong className={cn('text-foreground tabular-nums font-mono', className)}>{children}</strong>
  );
}

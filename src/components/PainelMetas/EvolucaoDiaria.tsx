/**
 * EvolucaoDiaria — o mês em uma leitura só.
 *
 * Funde as duas perguntas que antes ficavam em gráficos separados:
 *
 *   quanto ENTROU por dia   → barras (analítico, a fonte certeira)
 *   quanto está AGENDADO    → linha fina (acordos, o que ainda pode entrar)
 *   qual era o esperado     → régua horizontal na meta diária
 *
 * ## Escolhas de desenho
 *
 * Uma cor só para as barras, em dois pesos: cheia quando o dia alcançou a meta
 * diária, esmaecida quando não. Duas cores fortes brigando (verde/azul) roubam
 * a atenção da linha de meta, que é a informação nova. O peso já diz tudo — e
 * continua legível para quem não distingue as duas cores.
 *
 * Sem rótulo em cima de cada barra: com 31 dias eles se sobrepõem e viram
 * ruído. O valor exato mora no tooltip, a um passe de mouse.
 *
 * A meta diária é a MESMA que os cards usam (`calcularProjecao`). Passar outra
 * daqui reabriria exatamente a divergência que este painel existe para fechar.
 */

import { useMemo } from 'react';
import {
  ComposedChart, Bar, Line, Cell, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAxisColors } from '@/hooks/useChartColors';
import { formatBRL } from '@/lib/money';
import { PP_HO_PERCENTUAL } from '@/lib/index';
import { diasNoMes } from '@/lib/mesReferencia';
import type { UnidadeValor } from '@/lib/unidadeValor';
import { CHART_RECEBIDO, CHART_AGENDADO } from '@/components/AnalyticsPanel/constants';
import { CustomTooltip } from '@/components/AnalyticsPanel/SubComponents';

/** Dia que alcançou a meta diária: barra cheia. */
const OPACIDADE_ACIMA = 1;
/** Dia abaixo da meta: mesma cor, menos peso. */
const OPACIDADE_ABAIXO = 0.32;
/** Sem meta cadastrada não há o que comparar — todos os dias pesam igual. */
const OPACIDADE_NEUTRA = 0.7;

export interface PontoAgendado {
  /** Dia do mês, 1..31. */
  dia: number;
  agendado: number;
}

interface EvolucaoDiariaProps {
  /** dia do mês → agregado do analítico, direto de `agregarAnalitico`. */
  porDia: Record<number, { bruto: number; ho: number; qtd: number }>;
  /**
   * Unidade do gráfico. Precisa ser a MESMA dos cards acima — barra em bruto
   * sob um card em H.O. faria a linha de meta diária cruzar no lugar errado.
   */
  unidade?: UnidadeValor;
  /** Agendado por dia (acordos). Vazio = a série simplesmente não aparece. */
  agendadoPorDia?: PontoAgendado[];
  mes: string;
  /** `null` sem meta — some a régua e as barras ficam com peso único. */
  metaDiaria: number | null;
  /** Dia de hoje, ou `null` num mês fechado (não existe "hoje" no passado). */
  diaDeHoje: number | null;
}

function formatYAxis(valor: number): string {
  if (valor >= 1_000_000) return `R$${(valor / 1_000_000).toFixed(1)}M`;
  if (valor >= 1_000)     return `R$${(valor / 1_000).toFixed(0)}k`;
  return `R$${valor}`;
}

/**
 * Peso da barra de um dia.
 *
 * Exportada porque é a regra que o teste precisa alcançar: o
 * `ResponsiveContainer` mede 0×0 em jsdom e não desenha `Cell` nenhuma, então
 * verificar isso pelo DOM renderizado seria verificar o vazio.
 *
 * A fronteira é `>=`: bater a meta exata conta como alcançada.
 */
export function opacidadeDaBarra(recebido: number, metaDiaria: number | null): number {
  if (metaDiaria === null) return OPACIDADE_NEUTRA;
  return recebido >= metaDiaria ? OPACIDADE_ACIMA : OPACIDADE_ABAIXO;
}

export const OPACIDADES = {
  acima: OPACIDADE_ACIMA,
  abaixo: OPACIDADE_ABAIXO,
  neutra: OPACIDADE_NEUTRA,
} as const;

export function EvolucaoDiaria({
  porDia, agendadoPorDia = [], mes, metaDiaria, diaDeHoje, unidade = 'bruto',
}: EvolucaoDiariaProps) {
  const { tickColor, gridColor } = useAxisColors();

  const agendadoMap = useMemo(() => {
    const m = new Map<number, number>();
    for (const p of agendadoPorDia) m.set(p.dia, p.agendado);
    return m;
  }, [agendadoPorDia]);

  const temAgendado = agendadoPorDia.some(p => p.agendado > 0);

  const dados = useMemo(() => {
    // Todos os dias entram no eixo, mesmo os sem recebimento: a sequência é o
    // que dá a leitura de ritmo. Dia zerado simplesmente não desenha barra.
    //
    // O AGENDADO sai de `acordos.valor`, que é sempre bruto — dinheiro que
    // ainda não entrou não tem linha no relatório, logo não tem `total_ho`
    // gravado. Em modo H.O. ele é estimado pela constante, que é a única
    // tradução possível. O recebido, esse, continua vindo da coluna real.
    const emHO = unidade === 'ho';
    return Array.from({ length: diasNoMes(mes) }, (_, i) => {
      const dia = i + 1;
      const agendadoBruto = agendadoMap.get(dia) ?? 0;
      return {
        dia: String(dia).padStart(2, '0'),
        diaNum: dia,
        recebido: (emHO ? porDia[dia]?.ho : porDia[dia]?.bruto) ?? 0,
        agendado: emHO ? agendadoBruto * PP_HO_PERCENTUAL : agendadoBruto,
      };
    });
  }, [porDia, agendadoMap, mes, unidade]);

  const { diasComRecebimento, totalMes, melhorDia } = useMemo(() => {
    let dias = 0, soma = 0, melhor = 0;
    for (const d of dados) {
      if (d.recebido > 0) { dias++; soma += d.recebido; }
      if (d.recebido > melhor) melhor = d.recebido;
    }
    return { diasComRecebimento: dias, totalMes: soma, melhorDia: melhor };
  }, [dados]);

  return (
    <Card className="border-border/70 bg-card shadow-sm">
      <CardHeader className="pb-1 pt-4 px-4">
        <div className="flex items-center justify-between flex-wrap gap-x-4 gap-y-1">
          <CardTitle className="text-sm font-semibold text-foreground">
            Evolução diária
          </CardTitle>
          <div className="flex items-center gap-3.5 text-[10px] text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-[2px]" style={{ background: CHART_RECEBIDO }} />
              Recebido
            </span>
            {metaDiaria !== null && (
              <span className="flex items-center gap-1.5">
                <span
                  className="inline-block w-2 h-2 rounded-[2px]"
                  style={{ background: CHART_RECEBIDO, opacity: OPACIDADE_ABAIXO }}
                />
                Abaixo da meta
              </span>
            )}
            {temAgendado && (
              <span className="flex items-center gap-1.5">
                <span
                  className="inline-block w-3.5 h-[2px] rounded-full"
                  style={{ background: CHART_AGENDADO }}
                />
                Agendado
              </span>
            )}
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
        <ResponsiveContainer width="100%" height={230}>
          <ComposedChart data={dados} margin={{ top: 14, right: 14, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
            <XAxis
              dataKey="dia"
              tick={{ fontSize: 9, fill: tickColor }}
              stroke="transparent"
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              minTickGap={8}
            />
            <YAxis
              tick={{ fontSize: 9, fill: tickColor }}
              stroke="transparent"
              tickLine={false}
              axisLine={false}
              tickFormatter={formatYAxis}
              width={50}
            />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{ fill: gridColor, fillOpacity: 0.2 }}
            />

            {/* Régua da meta: fina e tracejada, para marcar sem competir com
                as barras — é referência, não protagonista. */}
            {metaDiaria !== null && (
              <ReferenceLine
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
              dataKey="recebido"
              name="Recebido"
              radius={[3, 3, 0, 0]}
              maxBarSize={22}
              isAnimationActive
              animationDuration={700}
              animationEasing="ease-out"
            >
              {dados.map(d => (
                <Cell
                  key={d.dia}
                  fill={CHART_RECEBIDO}
                  fillOpacity={opacidadeDaBarra(d.recebido, metaDiaria)}
                  // Hoje ganha contorno, não outra cor: trocar a cor perderia
                  // a informação de alcançou/não alcançou a meta.
                  stroke={d.diaNum === diaDeHoje ? CHART_RECEBIDO : undefined}
                  strokeWidth={d.diaNum === diaDeHoje ? 1.5 : 0}
                />
              ))}
            </Bar>

            {temAgendado && (
              <Line
                type="monotone"
                dataKey="agendado"
                name="Agendado"
                stroke={CHART_AGENDADO}
                strokeWidth={1.5}
                strokeDasharray="3 3"
                dot={false}
                activeDot={{ r: 3, fill: CHART_AGENDADO, strokeWidth: 0 }}
                isAnimationActive
                animationDuration={700}
                animationEasing="ease-out"
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>

        <div className="flex items-center justify-center gap-x-3 gap-y-1 flex-wrap px-2 text-[10px] text-muted-foreground">
          <span>
            {diasComRecebimento} dia{diasComRecebimento !== 1 ? 's' : ''} com recebimento
          </span>
          <span aria-hidden>·</span>
          <span>Total <strong className="text-foreground tabular-nums font-mono">{formatBRL(totalMes)}</strong></span>
          {melhorDia > 0 && (
            <>
              <span aria-hidden>·</span>
              <span>Melhor dia <strong className="text-foreground tabular-nums font-mono">{formatBRL(melhorDia)}</strong></span>
            </>
          )}
          {metaDiaria !== null && (
            <>
              <span aria-hidden>·</span>
              <span>Meta/dia <strong className="text-foreground tabular-nums font-mono">{formatBRL(metaDiaria)}</strong></span>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

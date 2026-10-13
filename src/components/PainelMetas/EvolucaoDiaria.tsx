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
 *
 * ## Dia × Baixa
 *
 * «Baixa» é a régua da operação (coluna D.U.): uma barra por dia útil, com o
 * fim de semana e o feriado somados na baixa do dia útil anterior. Os feriados
 * são os MESMOS que tiram dia útil da meta, então o mês tem tantas baixas
 * quantos dias úteis a meta conta — e a régua da meta diária vale, sem conta
 * nenhuma, como meta por baixa.
 */

import { useMemo, useState } from 'react';
import {
  ComposedChart, Bar, Line, Cell, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAxisColors } from '@/hooks/useChartColors';
import { formatBRL } from '@/lib/money';
import { useHoPercentual } from '@/lib/hoPercentual';
import { diasNoMes } from '@/lib/mesReferencia';
import type { UnidadeValor } from '@/lib/unidadeValor';
import { CHART_RECEBIDO, CHART_AGENDADO } from '@/components/AnalyticsPanel/constants';
import { CustomTooltip } from '@/components/AnalyticsPanel/SubComponents';
import { OPACIDADES, opacidadeDaBarra } from './opacidadeBarra';
import { baixasDoMes } from '@/lib/baixasDoMes';
import { cn } from '@/lib/utils';

type Visao = 'dia' | 'baixa';
const CHAVE_VISAO = 'evolucao-diaria-visao';

/** A escolha fica no navegador de quem olha; sem armazenamento, abre por dia. */
function visaoSalva(): Visao {
  try { return localStorage.getItem(CHAVE_VISAO) === 'baixa' ? 'baixa' : 'dia'; } catch { return 'dia'; }
}

/** Padrão estável: `= []` na assinatura criaria um array novo a cada render. */
const SEM_FERIADOS: readonly string[] = [];

const SIGLA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
/** '2026-10-09' → 'sex 09/10'. */
function diaCurto(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number);
  return `${SIGLA[new Date(a, m - 1, d).getDay()]} ${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

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
  /** Feriados do mês ('yyyy-MM-dd') — os mesmos da meta. Fecham a régua de baixas. */
  feriados?: readonly string[];
}

function formatYAxis(valor: number): string {
  if (valor >= 1_000_000) return `R$${(valor / 1_000_000).toFixed(1)}M`;
  if (valor >= 1_000)     return `R$${(valor / 1_000).toFixed(0)}k`;
  return `R$${valor}`;
}

export function EvolucaoDiaria({
  porDia, agendadoPorDia = [], mes, metaDiaria, diaDeHoje, unidade = 'bruto', feriados = SEM_FERIADOS,
}: EvolucaoDiariaProps) {
  // O agendado é ACORDO: em H.O. converte pelo percentual configurado.
  const ho = useHoPercentual();
  const { tickColor, gridColor } = useAxisColors();
  const [visao, setVisaoState] = useState<Visao>(visaoSalva);
  const setVisao = (v: Visao) => {
    setVisaoState(v);
    try { localStorage.setItem(CHAVE_VISAO, v); } catch { /* fica só nesta tela */ }
  };
  const porBaixa = visao === 'baixa';

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
    const recebidoDe = (dia: number) => (emHO ? porDia[dia]?.ho : porDia[dia]?.bruto) ?? 0;
    const agendadoDe = (dia: number) => (agendadoMap.get(dia) ?? 0) * (emHO ? ho : 1);

    if (porBaixa) {
      const hojeISO = diaDeHoje ? `${mes}-${String(diaDeHoje).padStart(2, '0')}` : '';
      return baixasDoMes(mes, feriados, hojeISO).map(b => {
        const dias = b.dias.map(iso => Number(iso.slice(8, 10)));
        return {
          dia: String(b.numero),
          titulo: `Baixa ${b.numero} · ${diaCurto(b.diaUtil)}`,
          hoje: b.atual,
          recebido: dias.reduce((s, d) => s + recebidoDe(d), 0),
          agendado: dias.reduce((s, d) => s + agendadoDe(d), 0),
        };
      });
    }

    return Array.from({ length: diasNoMes(mes) }, (_, i) => {
      const dia = i + 1;
      return {
        dia: String(dia).padStart(2, '0'),
        titulo: `Dia ${String(dia).padStart(2, '0')}`,
        hoje: dia === diaDeHoje,
        recebido: recebidoDe(dia),
        agendado: agendadoDe(dia),
      };
    });
  }, [porDia, agendadoMap, mes, unidade, ho, porBaixa, feriados, diaDeHoje]);

  const tituloDe = useMemo(() => {
    const m = new Map(dados.map(d => [d.dia, d.titulo] as const));
    return (label: unknown) => m.get(String(label)) ?? String(label);
  }, [dados]);

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
          <div className="flex items-center gap-2.5">
            <CardTitle className="text-sm font-semibold text-foreground">
              Evolução diária
            </CardTitle>
            {/* Discreta de propósito: é um jeito de ler o mesmo gráfico, não
                outro gráfico — não pode competir com o título. */}
            <div role="group" aria-label="Agrupar por" className="inline-flex rounded-md bg-muted p-0.5">
              {(['dia', 'baixa'] as const).map(v => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setVisao(v)}
                  aria-pressed={visao === v}
                  className={cn(
                    'rounded-[5px] px-2 py-0.5 text-[10px] font-medium transition-colors',
                    visao === v
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {v === 'dia' ? 'Dia' : 'Baixa'}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3.5 text-[10px] text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-[2px]" style={{ background: CHART_RECEBIDO }} />
              Recebido
            </span>
            {metaDiaria !== null && (
              <span className="flex items-center gap-1.5">
                <span
                  className="inline-block w-2 h-2 rounded-[2px]"
                  style={{ background: CHART_RECEBIDO, opacity: OPACIDADES.abaixo }}
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
                {porBaixa ? 'Meta por baixa' : 'Meta diária'}
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
              content={<CustomTooltip titulo={tituloDe} />}
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

            <Bar dataKey="recebido" name="Recebido" radius={[3, 3, 0, 0]} maxBarSize={22}>
              {dados.map(d => (
                <Cell
                  key={d.dia}
                  fill={CHART_RECEBIDO}
                  fillOpacity={opacidadeDaBarra(d.recebido, metaDiaria)}
                  // Hoje ganha contorno, não outra cor: trocar a cor perderia
                  // a informação de alcançou/não alcançou a meta.
                  stroke={d.hoje ? CHART_RECEBIDO : undefined}
                  strokeWidth={d.hoje ? 1.5 : 0}
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
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>

        <div className="flex items-center justify-center gap-x-3 gap-y-1 flex-wrap px-2 text-[10px] text-muted-foreground">
          <span>
            {diasComRecebimento} {porBaixa ? 'baixa' : 'dia'}{diasComRecebimento !== 1 ? 's' : ''} com recebimento
            {porBaixa && ` de ${dados.length}`}
          </span>
          <span aria-hidden>·</span>
          <span>Total <strong className="text-foreground tabular-nums font-mono">{formatBRL(totalMes)}</strong></span>
          {melhorDia > 0 && (
            <>
              <span aria-hidden>·</span>
              <span>{porBaixa ? 'Melhor baixa' : 'Melhor dia'} <strong className="text-foreground tabular-nums font-mono">{formatBRL(melhorDia)}</strong></span>
            </>
          )}
          {metaDiaria !== null && (
            <>
              <span aria-hidden>·</span>
              <span>{porBaixa ? 'Meta/baixa' : 'Meta/dia'} <strong className="text-foreground tabular-nums font-mono">{formatBRL(metaDiaria)}</strong></span>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

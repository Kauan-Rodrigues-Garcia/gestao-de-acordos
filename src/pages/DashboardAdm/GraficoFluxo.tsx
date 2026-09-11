/**
 * GraficoFluxo — o que entrou, saiu e voltou ao Núcleo, dia a dia.
 *
 * ## Três linhas, e não cinco
 *
 * Cadastrados, liberados e retornos são o CAMINHO do número — entra, sai, volta
 * —, e as três cabem numa leitura. Ativações e banimentos são estado, e moram no
 * cartão de qualidade ao lado: pintar «banido» com uma cor de série faria o
 * vermelho de alerta virar só mais uma linha.
 *
 * ## As cores
 *
 * Passaram no validador de paleta (luminosidade, croma, separação para
 * daltonismo e contraste) nos dois temas, com passos próprios no escuro — não é
 * o mesmo hex reaproveitado. Os tons do tema (`--chart-*`) ficaram de fora
 * porque o verde e o vermelho deles são as cores de estado do sistema.
 *
 * ## A tabela ao lado
 *
 * Todo valor do gráfico também existe numa tabela, a um clique: o tooltip
 * enriquece, mas não pode ser o único jeito de ler um número.
 */
import { useState } from 'react';
import { useTheme } from 'next-themes';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { LineChart as IconeGrafico, Table2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAxisColors } from '@/hooks/useChartColors';
import { cn } from '@/lib/utils';
import type { PontoDoFluxo, TotaisDoFluxo } from './metricas';

type ChaveDaSerie = 'cadastrados' | 'liberados' | 'retornos';

/** Ordem fixa: a cor segue a série, nunca a posição. */
const SERIES: { chave: ChaveDaSerie; rotulo: string; claro: string; escuro: string }[] = [
  { chave: 'cadastrados', rotulo: 'Cadastrados',        claro: '#0075a9', escuro: '#0096c9' },
  { chave: 'liberados',   rotulo: 'Liberados ao setor', claro: '#d95800', escuro: '#da6600' },
  { chave: 'retornos',    rotulo: 'Voltaram ao Núcleo', claro: '#6262cc', escuro: '#7f76dc' },
];

/** O anel dos pontos: a cor da superfície do cartão, para o ponto não sumir na linha. */
const SUPERFICIE = { claro: '#f5f9fb', escuro: '#040d10' };

interface PropsTooltip {
  active?: boolean;
  label?: string;
  payload?: { dataKey?: string | number; name?: string; value?: number; color?: string }[];
}

/** O valor na frente, o nome depois: aqui a pessoa já sabe a série e quer o número. */
function TooltipFluxo({ active, label, payload }: PropsTooltip) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-lg">
      <p className="mb-1.5 text-muted-foreground">{label}</p>
      <ul className="space-y-1">
        {payload.map(p => (
          <li key={String(p.dataKey)} className="flex items-center gap-2">
            <span className="inline-block h-0.5 w-3 rounded-full" style={{ background: p.color }} aria-hidden />
            <span className="min-w-[1.5rem] font-semibold tabular-nums text-foreground">{p.value ?? 0}</span>
            <span className="text-muted-foreground">{p.name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface GraficoFluxoProps {
  serie: PontoDoFluxo[];
  totais: TotaisDoFluxo;
  /** Um período novo está chegando: o gráfico esmaece em vez de sumir. */
  atualizando: boolean;
}

export function GraficoFluxo({ serie, totais, atualizando }: GraficoFluxoProps) {
  const { resolvedTheme } = useTheme();
  const { tickColor, gridColor } = useAxisColors();
  const [verTabela, setVerTabela] = useState(false);

  const escuro = resolvedTheme === 'dark';
  const corDa = (s: typeof SERIES[number]) => (escuro ? s.escuro : s.claro);
  const vazio = totais.cadastrados + totais.liberados + totais.retornos === 0;

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0 pb-2">
        <div>
          <CardTitle className="text-base">Entradas e saídas do Núcleo</CardTitle>
          <p className="mt-0.5 text-xs text-muted-foreground">Por dia, no período escolhido.</p>
        </div>
        <Button
          size="sm" variant="ghost" className="h-8 gap-1.5 text-xs"
          onClick={() => setVerTabela(v => !v)} aria-pressed={verTabela}
        >
          {verTabela
            ? <IconeGrafico className="h-3.5 w-3.5" />
            : <Table2 className="h-3.5 w-3.5" />}
          {verTabela ? 'Ver gráfico' : 'Ver tabela'}
        </Button>
      </CardHeader>

      <CardContent className={cn('transition-opacity', atualizando && 'opacity-60')}>
        {/* A legenda leva o total do período: é o número que se procura primeiro,
            e a identidade de cada linha fica no traço ao lado, nunca na cor do texto. */}
        <ul className="mb-3 flex flex-wrap gap-x-5 gap-y-1.5">
          {SERIES.map(s => (
            <li key={s.chave} className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="inline-block h-0.5 w-4 rounded-full" style={{ background: corDa(s) }} aria-hidden />
              {s.rotulo}
              <span className="font-semibold text-foreground">{totais[s.chave].toLocaleString('pt-BR')}</span>
            </li>
          ))}
        </ul>

        {verTabela ? (
          <div className="max-h-64 overflow-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2 text-left font-medium">Dia</th>
                  {SERIES.map(s => (
                    <th key={s.chave} scope="col" className="px-3 py-2 text-right font-medium">{s.rotulo}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {[...serie].reverse().map(p => (
                  <tr key={p.chave}>
                    <th scope="row" className="px-3 py-1.5 text-left font-normal">{p.rotulo}</th>
                    {SERIES.map(s => (
                      <td key={s.chave} className="px-3 py-1.5 text-right tabular-nums">{p[s.chave]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : vazio ? (
          <p className="flex h-56 items-center justify-center text-center text-sm text-muted-foreground">
            Nenhum cadastro, liberação ou retorno neste período.
          </p>
        ) : (
          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={serie} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                <CartesianGrid stroke={gridColor} vertical={false} />
                <XAxis
                  dataKey="rotulo" tick={{ fontSize: 10, fill: tickColor }}
                  tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={16}
                />
                <YAxis
                  allowDecimals={false} tick={{ fontSize: 10, fill: tickColor }}
                  tickLine={false} axisLine={false} width={40}
                />
                <Tooltip
                  content={<TooltipFluxo />}
                  cursor={{ stroke: tickColor, strokeOpacity: 0.25, strokeWidth: 1 }}
                />
                {SERIES.map(s => (
                  <Line
                    key={s.chave} type="linear" dataKey={s.chave} name={s.rotulo}
                    stroke={corDa(s)} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
                    dot={false} isAnimationActive={false}
                    activeDot={{
                      r: 4, fill: corDa(s), strokeWidth: 2,
                      stroke: escuro ? SUPERFICIE.escuro : SUPERFICIE.claro,
                    }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

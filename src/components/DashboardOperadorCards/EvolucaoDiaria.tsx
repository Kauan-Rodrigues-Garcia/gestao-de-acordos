/**
 * EvolucaoDiaria — gráfico "Sua Evolução Diária" (barras por dia vs meta diária)
 * + "Projeção Diária" (meta por dia, esperado amanhã, necessário por dia).
 *
 * Inspirado no dashboard de referência, com a estética do Gestão de Acordos
 * (recharts + tokens de tema). Dados vêm por props (o hook é chamado uma vez no
 * componente pai para não duplicar as buscas).
 */

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine, LabelList,
} from 'recharts';
import { Card, CardContent } from '@/components/ui/card';
import { formatBRL } from '@/lib/money';

const VERDE = '#22c55e';
const AZUL  = '#3b82f6';
const META  = '#ef4444';

interface EvolucaoDiariaProps {
  recebidoPorDia: { dia: number; valor: number }[];
  metaDiaria: number;
  recebidoMes: number;
  metaValor: number | null;
  diasUteisTotais: number;
  diasUteisDecorridos: number;
}

function formatYAxis(v: number): string {
  if (v >= 1_000_000) return `R$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `R$${(v / 1_000).toFixed(0)}k`;
  return `R$${v}`;
}

export function EvolucaoDiaria({
  recebidoPorDia, metaDiaria, recebidoMes, metaValor,
  diasUteisTotais, diasUteisDecorridos,
}: EvolucaoDiariaProps) {
  const comValor = recebidoPorDia.filter(d => d.valor > 0);
  const total = comValor.reduce((s, d) => s + d.valor, 0);
  const media = comValor.length ? total / comValor.length : 0;

  // Projeção diária
  const amanhaDevera = metaDiaria * Math.min(diasUteisDecorridos + 1, diasUteisTotais);
  const diasRestantes = Math.max(0, diasUteisTotais - diasUteisDecorridos);
  const necessarioPorDia = diasRestantes > 0 && metaValor
    ? Math.max(0, (metaValor - recebidoMes) / diasRestantes)
    : 0;

  const larguraMin = Math.max(recebidoPorDia.length * 34, 320);

  return (
    <Card className="border-border">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <p className="text-sm font-semibold">Sua Evolução Diária</p>
            <p className="text-xs text-muted-foreground">Recebimento por dia (dados reais)</p>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: VERDE }} /> Acima da meta</span>
            <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: AZUL }} /> Abaixo da meta</span>
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-[2px]" style={{ background: META }} /> Meta diária</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <div style={{ minWidth: larguraMin }}>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={recebidoPorDia} margin={{ top: 20, right: 8, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.18)" vertical={false} />
                <XAxis
                  dataKey="dia"
                  tickFormatter={(d: number) => String(d).padStart(2, '0')}
                  tick={{ fontSize: 10 }} stroke="transparent" tickLine={false} axisLine={false} interval={0}
                />
                <YAxis tick={{ fontSize: 10 }} stroke="transparent" tickLine={false} axisLine={false}
                  tickFormatter={formatYAxis} width={52} />
                <Tooltip
                  contentStyle={{
                    borderRadius: '10px', border: '1px solid rgba(148,163,184,0.2)',
                    background: 'var(--popover)', color: 'var(--popover-foreground)',
                    fontSize: '12px', padding: '6px 10px',
                  }}
                  formatter={(v: number) => [formatBRL(v), 'Recebido']}
                  labelFormatter={(d: number) => `Dia ${String(d).padStart(2, '0')}`}
                  cursor={{ fill: 'rgba(148,163,184,0.08)' }}
                />
                {metaDiaria > 0 && (
                  <ReferenceLine y={metaDiaria} stroke={META} strokeWidth={1.5} strokeDasharray="4 3"
                    label={{ value: 'Meta', position: 'insideTopLeft', style: { fontSize: 9.5, fill: META, fontWeight: 600 } }} />
                )}
                <Bar dataKey="valor" radius={[3, 3, 0, 0]} isAnimationActive={false} maxBarSize={22}>
                  {recebidoPorDia.map((d, i) => (
                    <Cell key={i} fill={d.valor <= 0 ? 'transparent' : d.valor >= metaDiaria ? VERDE : AZUL} />
                  ))}
                  <LabelList dataKey="valor" position="top"
                    formatter={(v: number) => (v > 0 ? formatBRL(v) : '')}
                    style={{ fontSize: 8, fill: 'var(--muted-foreground)' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="flex items-center justify-between text-[11px] text-muted-foreground tabular-nums border-t border-border/60 pt-2">
          <span>Total: <strong className="text-foreground font-mono">{formatBRL(total)}</strong></span>
          <span>Média: <strong className="text-foreground font-mono">{formatBRL(media)}</strong></span>
          <span>{comValor.length} dia{comValor.length !== 1 ? 's' : ''} com recebimento</span>
        </div>

        {/* Projeção Diária */}
        {metaDiaria > 0 && (
          <div className="grid grid-cols-3 gap-3 rounded-xl bg-muted/40 border border-border/60 p-3">
            <div className="text-center">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Meta por dia</p>
              <p className="text-sm font-bold font-mono tabular-nums text-primary mt-0.5">{formatBRL(metaDiaria)}</p>
            </div>
            <div className="text-center border-x border-border/60">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Amanhã você deverá ter</p>
              <p className="text-sm font-bold font-mono tabular-nums text-primary mt-0.5">{formatBRL(amanhaDevera)}</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Necessário por dia</p>
              <p className="text-sm font-bold font-mono tabular-nums mt-0.5" style={{ color: necessarioPorDia > 0 ? '#f59e0b' : '#22c55e' }}>
                {formatBRL(necessarioPorDia)}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

import { motion } from 'framer-motion';
import { ArrowUpRight, ArrowDownRight, Minus, AlertTriangle } from 'lucide-react';
import { ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { formatCurrency } from '@/lib/index';
import { cn } from '@/lib/utils';
import { itemVariants } from './constants';
import { ValorAnimado } from '@/components/DesempenhoDia/ValorAnimado';
import { isValidElement, type CSSProperties, type ReactNode } from 'react';

// ── CustomTooltip ─────────────────────────────────────────────────────────────

export function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border/80 bg-popover/95 backdrop-blur-sm px-3 py-2.5 shadow-xl text-xs text-popover-foreground">
      <p className="font-semibold mb-1.5 text-foreground">Dia {label}</p>
      <div className="space-y-1">
        {payload.map((entry: any, i: number) => (
          <div key={i} className="flex items-center gap-2">
            <span
              className="inline-block w-2 h-2 rounded-full shrink-0"
              style={{ background: entry.color }}
            />
            <span className="text-muted-foreground">{entry.name}:</span>
            <span className="font-semibold tabular-nums font-mono" style={{ color: entry.color }}>
              {formatCurrency(entry.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── BannerNaoTabulado ─────────────────────────────────────────────────────────
// Aviso de recebimento do analítico ainda sem acordo tabulado (PP e BookPlay).

export function BannerNaoTabulado({
  valor, qtd, totalAnalitico,
}: { valor: number; qtd: number; totalAnalitico: number }) {
  if (valor <= 0) return null;
  return (
    <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl border border-amber-500/40 bg-amber-500/10">
      <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
      <div className="text-xs leading-relaxed">
        <p className="font-semibold text-foreground">
          {formatCurrency(valor)} do recebimento ainda não estão tabulados
        </p>
        <p className="text-muted-foreground">
          O relatório analítico registrou {formatCurrency(totalAnalitico)} no mês, mas{' '}
          {qtd} pagamento{qtd !== 1 ? 's' : ''} não{' '}
          {qtd !== 1 ? 'têm' : 'tem'} acordo tabulado. Acesse a aba{' '}
          <strong className="text-foreground">Analítico</strong> para tabular.
        </p>
      </div>
    </div>
  );
}

// ── SkeletonCard ──────────────────────────────────────────────────────────────

export function SkeletonCard() {
  return (
    <div className="rounded-xl border border-border bg-muted/20 p-4 animate-pulse overflow-hidden relative">
      <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl bg-muted/60" />
      <div className="h-3 w-20 rounded-md bg-muted mb-3" />
      <div className="h-7 w-28 rounded-md bg-muted mb-2" />
      <div className="h-2.5 w-16 rounded-md bg-muted/60" />
    </div>
  );
}

// ── MetricCard ────────────────────────────────────────────────────────────────

export type TrendDirection = 'up' | 'down' | 'neutral';

export interface MetricCardProps {
  label: string;
  value: ReactNode;
  icon: React.ReactNode;
  sub?: string;
  accentColor?: string;
  trend?: TrendDirection;
  gradientFrom?: string;
}

function textoPlano(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textoPlano).join('');
  if (isValidElement<{ children?: ReactNode }>(node)) return textoPlano(node.props.children);
  return '';
}

/** Converte os formatos usados nos cards (R$, inteiro, %, quartil) em um valor
 * numérico e um formatador equivalente, sem obrigar cada caller a duplicar a
 * configuração da animação. */
function decomporValor(node: ReactNode): {
  numero: number;
  formatar: (valor: number) => string;
  className?: string;
  style?: CSSProperties;
} | null {
  const texto = textoPlano(node);
  const match = texto.match(/^(.*?)(-?\d[\d.,]*)(.*)$/u);
  if (!match) return null;

  let prefixo = match[1];
  const token = match[2];
  const sufixo = match[3];
  const casas = token.includes(',') ? token.slice(token.lastIndexOf(',') + 1).length : 0;
  let numero = Number(token.replace(/\./g, '').replace(',', '.'));
  if (!Number.isFinite(numero)) return null;

  // Diferença para projeção usa o sinal tipográfico fora do token numérico.
  // Trazê-lo para o número permite contar corretamente ao atravessar o zero.
  let modoSinal: 'completo' | 'somente-negativo' | null = token.startsWith('-')
    ? 'somente-negativo'
    : null;
  if (/[+−-]\s*$/u.test(prefixo)) {
    const sinal = prefixo.match(/([+−-])\s*$/u)?.[1];
    prefixo = prefixo.replace(/[+−-]\s*$/u, '');
    numero = sinal === '+' ? Math.abs(numero) : -Math.abs(numero);
    modoSinal = 'completo';
  }

  const props = isValidElement<{ className?: string; style?: CSSProperties }>(node)
    ? node.props
    : undefined;
  const formatarNumero = (valor: number) => Math.abs(valor).toLocaleString('pt-BR', {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  });

  return {
    numero,
    formatar: valor => `${prefixo}${modoSinal === 'completo' ? (valor >= 0 ? '+ ' : '− ') : modoSinal === 'somente-negativo' && valor < 0 ? '−' : ''}${formatarNumero(valor)}${sufixo}`,
    className: props?.className,
    style: props?.style,
  };
}

export function MetricCard({
  label, value, icon, sub,
  accentColor = '#6366f1',
  trend, gradientFrom,
}: MetricCardProps) {
  const valorDecomposto = decomporValor(value);
  const TrendIcon =
    trend === 'up' ? ArrowUpRight : trend === 'down' ? ArrowDownRight : Minus;
  const trendColor =
    trend === 'up'
      ? 'text-emerald-500'
      : trend === 'down'
      ? 'text-red-400'
      : 'text-muted-foreground/60';

  return (
    <motion.div
      variants={itemVariants}
      whileHover={{ y: -2, transition: { duration: 0.18 } }}
      className="group relative flex flex-col gap-1.5 rounded-xl border border-border/70 bg-card overflow-hidden p-4 shadow-sm hover:shadow-md transition-shadow duration-200"
    >
      <div
        className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl"
        style={{ background: accentColor }}
      />
      {gradientFrom && (
        <div
          className="absolute inset-0 opacity-[0.035] pointer-events-none"
          style={{
            background: `radial-gradient(ellipse at top left, ${gradientFrom} 0%, transparent 70%)`,
          }}
        />
      )}
      <div className="flex items-center justify-between gap-2 pl-1">
        <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide truncate">
          {label}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {trend && (
            <TrendIcon className={cn('w-3.5 h-3.5', trendColor)} />
          )}
          <span
            className="text-muted-foreground/60 group-hover:text-muted-foreground transition-colors"
            style={{ color: accentColor + 'aa' }}
          >
            {icon}
          </span>
        </div>
      </div>
      <div className="text-xl font-bold leading-tight tracking-tight pl-1 font-mono tabular-nums">
        {valorDecomposto ? (
          <ValorAnimado
            valor={valorDecomposto.numero}
            formatar={valorDecomposto.formatar}
            className={valorDecomposto.className}
            style={valorDecomposto.style}
          />
        ) : value}
      </div>
      {sub && (
        <span className="text-[11px] text-muted-foreground pl-1 leading-snug">{sub}</span>
      )}
    </motion.div>
  );
}

// ── DonutChart ────────────────────────────────────────────────────────────────

export interface DonutChartProps {
  percent: number;
  label: string;
  sublabel?: string;
  color?: string;
  size?: number;
}

export function DonutChart({ percent, label, sublabel, color = '#6366f1', size = 180 }: DonutChartProps) {
  const clampedPerc = Math.min(percent, 100);
  const data = [
    { value: clampedPerc },
    { value: Math.max(100 - clampedPerc, 0) },
  ];

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%" cy="50%"
            innerRadius={size * 0.33}
            outerRadius={size * 0.46}
            startAngle={90}
            endAngle={-270}
            paddingAngle={0}
            dataKey="value"
            strokeWidth={0}
            isAnimationActive={true}
            animationBegin={80}
            animationDuration={900}
            animationEasing="ease-out"
          >
            <Cell fill={clampedPerc >= 100 ? '#22c55e' : color} />
            <Cell fill="rgba(148,163,184,0.15)" />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div
        className="absolute rounded-full"
        style={{
          width: size * 0.64,
          height: size * 0.64,
          boxShadow: `0 0 0 2px ${color}22 inset`,
        }}
      />
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="text-2xl font-extrabold leading-none tabular-nums tracking-tight">
          {percent > 0 ? `${Math.min(percent, 999)}%` : '—'}
        </span>
        {sublabel && (
          <span className="text-[11px] text-muted-foreground mt-1 text-center leading-tight max-w-[80px]">
            {sublabel}
          </span>
        )}
      </div>
    </div>
  );
}

// ── MiniSparkline ─────────────────────────────────────────────────────────────

export function MiniSparkline({ data, color }: { data: Array<{ value: number }>; color: string }) {
  if (!data?.length) return null;
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="flex items-end gap-0.5 h-5">
      {data.slice(-12).map((d, i) => (
        <div
          key={i}
          className="w-1 rounded-sm transition-all duration-300"
          style={{
            height: `${Math.max((d.value / max) * 100, 8)}%`,
            background: color,
            opacity: 0.4 + (i / 12) * 0.6,
          }}
        />
      ))}
    </div>
  );
}

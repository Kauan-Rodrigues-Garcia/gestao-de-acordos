// Réplicas das peças pequenas do app, com as mesmas classes:
// MetricCard e DonutChart (AnalyticsPanel/SubComponents), AnelProjecao
// (PainelMetas), selos de status e tipo (lib/index.ts) e o código NR copiável.
// Elas existem aqui porque as originais puxam framer-motion, recharts e hooks
// de dados; o desenho é o mesmo.

import { ArrowDownRight, ArrowUpRight, Hash, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Status, Tipo } from './dados';

/** O texto colorido do app: a cor de sinal presa na faixa de luminosidade do tema. */
export const corTexto = (cor: string) => `oklch(from ${cor} clamp(var(--sinal-l-min), l, var(--sinal-l-max)) c h)`;

export const COR_QUARTIL: Record<number, string> = { 1: '#22c55e', 2: '#6366f1', 3: '#f59e0b', 4: '#ef4444' };
export const corProjecao = (pct: number) => (pct >= 100 ? COR_QUARTIL[1] : pct >= 80 ? COR_QUARTIL[2] : pct >= 50 ? COR_QUARTIL[3] : COR_QUARTIL[4]);
export const corDaMeta = (pct: number) => (pct >= 100 ? '#22c55e' : pct >= 70 ? '#6366f1' : pct >= 40 ? '#f59e0b' : '#ef4444');

export const formatBRL = (n: number) =>
  'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type MetricCardProps = {
  label: string;
  value: React.ReactNode;
  icon: React.ReactNode;
  sub?: string;
  accentColor?: string;
  trend?: 'up' | 'down' | 'neutral';
  gradientFrom?: string;
  className?: string;
  style?: React.CSSProperties;
  alvo?: string;
};

export const MetricCard: React.FC<MetricCardProps> = ({ label, value, icon, sub, accentColor = '#6366f1', trend, gradientFrom, className, style, alvo }) => {
  const TrendIcon = trend === 'up' ? ArrowUpRight : trend === 'down' ? ArrowDownRight : Minus;
  const trendColor = trend === 'up' ? 'text-emerald-600' : trend === 'down' ? 'text-red-700' : 'text-muted-foreground/60';
  return (
    <div
      data-alvo={alvo}
      className={cn('group relative flex flex-col gap-1.5 rounded-xl border border-border/70 bg-card overflow-hidden p-4 shadow-sm', className)}
      style={style}
    >
      <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl" style={{ background: accentColor }} />
      {gradientFrom && (
        <div
          className="absolute inset-0 opacity-[0.035] pointer-events-none"
          style={{ background: `radial-gradient(ellipse at top left, ${gradientFrom} 0%, transparent 70%)` }}
        />
      )}
      <div className="flex items-center justify-between gap-2 pl-1">
        <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide truncate">{label}</span>
        <div className="flex items-center gap-1 shrink-0">
          {trend && <TrendIcon className={cn('w-3.5 h-3.5', trendColor)} />}
          <span style={{ color: accentColor + 'aa' }}>{icon}</span>
        </div>
      </div>
      <div className="text-xl font-bold leading-tight tracking-tight pl-1 font-mono tabular-nums">{value}</div>
      {sub && <span className="text-[11px] text-muted-foreground pl-1 leading-snug">{sub}</span>}
    </div>
  );
};

/** O donut da meta (recharts no app): anel de 0,33 a 0,46 do tamanho. */
export const DonutChart: React.FC<{ percent: number; sublabel?: string; color: string; size?: number }> = ({ percent, sublabel, color, size = 180 }) => {
  const r = size * ((0.33 + 0.46) / 2);
  const espessura = size * 0.13;
  const perimetro = 2 * Math.PI * r;
  const p = Math.min(percent, 100) / 100;
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(148,163,184,0.15)" strokeWidth={espessura} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={percent >= 100 ? '#22c55e' : color}
          strokeWidth={espessura}
          strokeDasharray={perimetro}
          strokeDashoffset={perimetro * (1 - p)}
        />
      </svg>
      <div className="absolute rounded-full" style={{ width: size * 0.64, height: size * 0.64, boxShadow: `0 0 0 2px ${color}22 inset` }} />
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="text-2xl font-extrabold leading-none tabular-nums tracking-tight">{percent > 0 ? `${Math.round(percent)}%` : '—'}</span>
        {sublabel && <span className="text-[11px] text-muted-foreground mt-1 text-center leading-tight max-w-[80px]">{sublabel}</span>}
      </div>
    </div>
  );
};

const RAIO = 42;
const PERIMETRO = 2 * Math.PI * RAIO;

export const AnelProjecao: React.FC<{ pct: number; cor: string; tamanho?: number }> = ({ pct, cor, tamanho = 84 }) => {
  const doArco = Math.max(0, Math.min(pct, 100));
  return (
    <div className="relative shrink-0" style={{ width: tamanho, height: tamanho }}>
      <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
        <circle cx="50" cy="50" r={RAIO} fill="none" stroke="currentColor" strokeWidth="9" className="text-muted-foreground/20" />
        <circle cx="50" cy="50" r={RAIO} fill="none" stroke={cor} strokeWidth="9" strokeLinecap="round" strokeDasharray={PERIMETRO} strokeDashoffset={PERIMETRO * (1 - doArco / 100)} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <span className="text-lg font-bold leading-none tabular-nums tracking-tight" style={{ color: corTexto(cor) }}>
          {Math.round(pct)}%
        </span>
      </div>
    </div>
  );
};

export const STATUS_LABELS: Record<Status, string> = { verificar_pendente: 'Verificar', pago: 'Pago', nao_pago: 'Não Pago' };
export const STATUS_COLORS: Record<Status, string> = {
  verificar_pendente: 'bg-warning/15 text-warning border-warning/30',
  pago: 'bg-success/15 text-success border-success/30',
  nao_pago: 'bg-destructive/15 text-destructive border-destructive/30',
};
export const TIPO_LABELS: Record<Tipo, string> = { boleto: 'Boleto', cartao_recorrente: 'Cartão Recorrente', pix_automatico: 'Pix automático', cartao: 'Cartão', pix: 'Pix' };
export const TIPO_COLORS: Record<Tipo, string> = {
  boleto: 'bg-chart-1/15 text-chart-1 border-chart-1/30',
  cartao_recorrente: 'bg-chart-3/15 text-chart-3 border-chart-3/30',
  pix_automatico: 'bg-chart-2/15 text-chart-2 border-chart-2/30',
  cartao: 'bg-chart-3/15 text-chart-3 border-chart-3/30',
  pix: 'bg-chart-2/15 text-chart-2 border-chart-2/30',
};

export const SeloStatus: React.FC<{ status: Status; style?: React.CSSProperties; alvo?: string }> = ({ status, style, alvo }) => (
  <span data-alvo={alvo} className={cn('inline-flex whitespace-nowrap px-2 py-0.5 rounded-full text-[10px] font-medium border', STATUS_COLORS[status])} style={style}>
    {STATUS_LABELS[status]}
  </span>
);

export const SeloTipo: React.FC<{ tipo: Tipo }> = ({ tipo }) => (
  <span className={cn('inline-flex max-w-full truncate px-2 py-0.5 rounded-full text-[10px] font-medium border', TIPO_COLORS[tipo])}>{TIPO_LABELS[tipo]}</span>
);

export const CodigoNR: React.FC<{ codigo: string }> = ({ codigo }) => (
  <span className="inline-flex items-center gap-1 rounded border border-primary/20 bg-primary/8 px-1.5 py-0.5 font-mono text-[11px] font-bold text-primary max-w-full">
    <Hash className="h-2.5 w-2.5 shrink-0" />
    <span className="truncate">{codigo}</span>
  </span>
);

/**
 * O anel suave que acende em volta do que a narração aponta. Não existe no
 * app: é a marca-texto do vídeo, na cor primária do tema.
 */
export const Destaque: React.FC<{ forca: number; raio?: number; folga?: number }> = ({ forca, raio = 12, folga = 6 }) => {
  if (forca <= 0.001) return null;
  return (
    <div
      className="pointer-events-none absolute"
      style={{
        inset: -folga,
        borderRadius: raio + folga,
        border: `2px solid color-mix(in oklch, var(--primary) ${Math.round(85 * forca)}%, transparent)`,
        boxShadow: `0 0 0 ${6 * forca}px color-mix(in oklch, var(--primary) ${Math.round(12 * forca)}%, transparent), 0 10px 30px color-mix(in oklch, var(--primary) ${Math.round(18 * forca)}%, transparent)`,
        zIndex: 5,
      }}
    />
  );
};

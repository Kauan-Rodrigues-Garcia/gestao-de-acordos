import { Skeleton } from '@/components/ui/skeleton';
import type { Acordo } from '@/lib/supabase';
import { formatCurrency, formatDate } from '@/lib/index';

export type VisaoFiltro = 'setor' | `equipe:${string}` | 'individual';

export const PER_PAGE = 60;
export const TIPOS_PARCELADOS_PP = ['boleto', 'pix'];
export const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07 } },
};
export const PIE_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ec4899', '#14b8a6'];

export function addMesesDash(dateStr: string, months: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const total = m - 1 + months;
  return `${y + Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function ensureAbsoluteUrl(url: string): string {
  if (!url) return '#';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return 'https://' + url;
}

export function saudacao(): string {
  const hora = new Date().getHours();
  if (hora >= 5 && hora < 12) return 'Bom dia';
  if (hora >= 12 && hora < 18) return 'Boa tarde';
  return 'Boa noite';
}

export function buildMensagem(a: Acordo): string {
  if (a.status === 'nao_pago') {
    return `Olá *${a.nome_cliente}*, identificamos que o seu acordo *NR ${a.nr_cliente}*, no valor de *${formatCurrency(a.valor)}*, com vencimento em *${formatDate(a.vencimento)}*, encontra-se em atraso. Por favor, entre em contato conosco o mais breve possível para regularizar sua situação. Estamos à disposição para ajudar.`;
  }
  return `Olá *${a.nome_cliente}*, passando para lembrar do seu acordo *NR ${a.nr_cliente}*, no valor de *${formatCurrency(a.valor)}*, com vencimento em *${formatDate(a.vencimento)}*. Qualquer dúvida, estamos à disposição.`;
}

export function getPageNumbers(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | '...')[] = [1];
  if (current > 3) pages.push('...');
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) pages.push(i);
  if (current < total - 2) pages.push('...');
  pages.push(total);
  return pages;
}

export function TableSkeleton() {
  return (
    <div className="divide-y divide-border/50">
      {[...Array(7)].map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="h-4 w-4 rounded shrink-0" />
          <Skeleton className="h-4 w-28 shrink-0" />
          <Skeleton className="h-4 w-10 shrink-0" />
          <Skeleton className="h-4 w-20 shrink-0 font-mono" />
          <Skeleton className="h-4 w-24 shrink-0 font-mono text-right" />
          <Skeleton className="h-5 w-16 rounded-full shrink-0" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-5 w-20 rounded-full shrink-0" />
          <div className="flex gap-1 shrink-0">
            <Skeleton className="h-8 w-8 rounded" />
            <Skeleton className="h-8 w-8 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

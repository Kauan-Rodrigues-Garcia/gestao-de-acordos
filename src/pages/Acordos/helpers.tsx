import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency, formatDate } from '@/lib/index';
import type { Acordo } from '@/lib/supabase';

export type VisaoFiltroAcordos = 'setor' | `equipe:${string}` | 'individual';
export type AbaAcordos = 'analitico' | 'todos' | 'pagos' | 'nao_pagos';

export function statusParaAbaAcordos(aba: AbaAcordos, statusManual?: string): string | undefined {
  if (statusManual && statusManual !== 'all') return statusManual;
  if (aba === 'analitico') return 'verificar_pendente';
  if (aba === 'pagos') return 'pago';
  if (aba === 'nao_pagos') return 'nao_pago';
  return undefined;
}

export const PER_PAGE = 60;

export function buildMensagem(a: Acordo): string {
  if (a.status === 'nao_pago') {
    return `Olá *${a.nome_cliente}*, identificamos que o seu acordo *NR ${a.nr_cliente}*, no valor de *${formatCurrency(a.valor)}*, com vencimento em *${formatDate(a.vencimento)}*, encontra-se em atraso. Por favor, entre em contato conosco o mais breve possível para regularizar sua situação. Estamos à disposição para ajudar.`;
  }
  return `Olá *${a.nome_cliente}*, passando para lembrar do seu acordo *NR ${a.nr_cliente}*, no valor de *${formatCurrency(a.valor)}*, com vencimento em *${formatDate(a.vencimento)}*. Qualquer dúvida, estamos à disposição.`;
}

export function TableSkeleton() {
  return (
    <div className="divide-y divide-border/50">
      {[...Array(7)].map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="h-4 w-4 rounded shrink-0" />
          <Skeleton className="h-4 w-14 shrink-0 font-mono" />
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-5 w-20 rounded-full shrink-0" />
          <Skeleton className="h-5 w-16 rounded-full shrink-0" />
          <Skeleton className="h-4 w-10 shrink-0" />
          <div className="flex gap-1 shrink-0">
            <Skeleton className="h-8 w-8 rounded" />
            <Skeleton className="h-8 w-8 rounded" />
            <Skeleton className="h-8 w-8 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
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

export function ensureAbsoluteUrl(url: string): string {
  if (!url) return '#';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return 'https://' + url;
}

export type VisaoFiltroAcordos = 'setor' | `equipe:${string}` | 'individual';

export const PER_PAGE = 60;

// A mensagem de WhatsApp saiu daqui em 28/09/2026: o texto de sempre virou
// `MENSAGEM_DO_SISTEMA` em `@/lib/mensagensWhatsapp`, e cada pessoa pode
// escrever as suas por status.

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

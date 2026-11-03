/** texto.ts — as continhas de texto do mural: as iniciais do avatar e o plural. */

export function iniciais(nome: string): string {
  const p = nome.trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase() || '?';
}

export const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

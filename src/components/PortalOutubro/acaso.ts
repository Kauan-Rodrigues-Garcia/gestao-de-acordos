/**
 * acaso.ts — o acaso com semente do portal (mulberry32): o mesmo número para
 * todo mundo, e o F5 não muda nada (a roleta, o desmanche, a chuva de Derry).
 */
export function sorteador(semente: number): () => number {
  let s = semente >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

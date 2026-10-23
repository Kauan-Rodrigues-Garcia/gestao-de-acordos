/**
 * cavaloDaGuerra.test.ts — o Cavalo da Guerra não sai cortado (23/10/2026). O
 * fogo do rabo e da crina passava da borda da grade e perdia pixels; agora a
 * grade tem margem em cima e atrás, e `EXTENSAO` diz até onde ele vai.
 */
import { describe, expect, it } from 'vitest';
import { CAVALEIROS, CCHAO, CH, CMEIO, CPIV, CW, EXTENSAO, construirCavalo } from './cavaloDaGuerra.js';

/** Um destino sem canvas: o teste só lê a grade de códigos. */
const destino = () => ({ cv: null, cx: { putImageData() {} }, img: { data: new Uint8ClampedArray(CW * CH * 4) }, g: new Uint8Array(CW * CH), d: new Uint8Array(CW * CH), I: new Float32Array(CW * CH) });
const MODOS = ['parado', 'anda', 'galope', 'empina'] as const;
/** O quanto ele gira em cada pose (a investida e o invocar empinam; a queda tomba para a frente). */
const GIROS: Record<(typeof MODOS)[number], number[]> = { parado: [-0.18, 0, 0.32], anda: [0], galope: [0], empina: [-0.5, -0.42, 0] };

describe('o Cavalo da Guerra inteiro', () => {
  const dest = destino();
  const poses: Array<{ modo: (typeof MODOS)[number]; p: number; t: number; furia: number; cab: number; jaw: number }> = [];
  for (const modo of MODOS) for (let p = 0; p < 1; p += 0.125) for (const t of [0, 0.35, 0.8, 1.7]) for (const furia of [0, 1]) for (const cab of [0, 1]) poses.push({ modo, p, t, furia, cab, jaw: furia });

  it('nenhuma pose encosta na borda da grade (o fogo do rabo e da crina não perde pixel)', () => {
    for (const o of poses) {
      construirCavalo({ ...o, by: -1.5, feridas: [], num: '12' }, CAVALEIROS.guerra, dest);
      for (let y = 0; y < CH; y++) for (const x of [0, CW - 1]) expect(dest.g[y * CW + x], `${o.modo} p=${o.p} t=${o.t} na coluna ${x}`).toBe(0);
      for (let x = 0; x < CW; x++) expect(dest.g[x], `${o.modo} p=${o.p} t=${o.t} na linha de cima`).toBe(0);
    }
  });

  it('EXTENSAO cobre todas as poses, girando como ele gira', () => {
    let tras = 0, frente = 0, alto = 0;
    for (const o of poses) {
      construirCavalo({ ...o, by: -1.5, feridas: [], num: '12' }, CAVALEIROS.guerra, dest);
      for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
        if (!dest.g[y * CW + x]) continue;
        const lx = x - CMEIO, ly = y - CCHAO;
        for (const rot of GIROS[o.modo]) {
          const rx = lx - CPIV, X = CPIV + rx * Math.cos(rot) - ly * Math.sin(rot), Y = rx * Math.sin(rot) + ly * Math.cos(rot);
          tras = Math.max(tras, -X); frente = Math.max(frente, X); alto = Math.max(alto, -Y);
        }
      }
    }
    expect(tras).toBeLessThanOrEqual(EXTENSAO.tras);
    expect(frente).toBeLessThanOrEqual(EXTENSAO.frente);
    expect(alto).toBeLessThanOrEqual(EXTENSAO.alto);
  });
});

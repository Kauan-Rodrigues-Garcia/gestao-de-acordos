// Cores e fontes do que está FORA do app (fundo, manchetes, abertura,
// fechamento). Tema claro, para combinar com o sistema no tema claro.
//
// As telas do app não usam isto: elas usam as classes do próprio app
// (Tailwind + src/index.css, copiado em src/estilo/app.css).

import { continueRender, delayRender } from 'remotion';
import './estilo/index.css';

export const FONTE = 'Inter, -apple-system, "Segoe UI", sans-serif';
export const FONTE_MONO = '"JetBrains Mono", "Courier New", monospace';

export const COR = {
  fundo: '#f3f6f9',
  texto: '#0f1b26',
  textoSuave: '#556270',
  textoFraco: '#8a96a3',
  borda: '#dfe5eb',
  /** O azul da BookPlay (Birigui) e o verde da PaguePlay (Marília). */
  azul: '#1f8fd1',
  azulClaro: '#38bdf8',
  verde: '#16a34a',
  verdeClaro: '#4ade80',
  branco: '#ffffff',
};

export const GRADIENTE_MARCA = 'linear-gradient(120deg, #16a34a 0%, #0ea5a4 45%, #1f8fd1 100%)';

/** Sombra de objeto flutuando sobre o fundo claro. */
export const SOMBRA_FLUTUA = '0 1px 2px rgba(15,27,38,0.06), 0 12px 28px rgba(15,27,38,0.10), 0 40px 80px rgba(15,27,38,0.10)';

// ── fontes: o quadro só é tirado depois que elas carregam ──────────────────
const PESOS: [string, string[]][] = [
  ['Inter', ['400', '500', '600', '700', '800']],
  ['JetBrains Mono', ['400', '500', '600', '700']],
  ['Caveat', ['600']],
  ['Figtree', ['400', '500', '600', '700']],
  ['Bricolage Grotesque', ['700']],
];

if (typeof document !== 'undefined') {
  const espera = delayRender('carregando fontes');
  Promise.all(PESOS.flatMap(([familia, pesos]) => pesos.map((p) => document.fonts.load(`${p} 16px "${familia}"`))))
    .catch(() => undefined)
    .then(() => continueRender(espera));
}

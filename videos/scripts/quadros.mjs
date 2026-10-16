// Tira quadros soltos para conferência: node scripts/quadros.mjs 690 780 1150 …
// `--escala 1` tira em 1920×1080 (o padrão é metade, mais rápido).
import path from 'node:path';
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import { ajustarWebpack } from '../webpack.mjs';

const raiz = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const iEscala = args.indexOf('--escala');
const escala = iEscala >= 0 ? Number(args[iEscala + 1]) : 0.5;
const iComp = args.indexOf('--comp');
const id = iComp >= 0 ? args[iComp + 1] : 'Operador';
const ignorar = new Set([iEscala, iEscala + 1, iComp, iComp + 1].filter((_, k) => (k < 2 ? iEscala : iComp) >= 0));
const quadros = args.filter((_, i) => !ignorar.has(i)).map(Number);
const serveUrl = await bundle({ entryPoint: path.join(raiz, 'src', 'index.ts'), webpackOverride: ajustarWebpack });
const composition = await selectComposition({ serveUrl, id });
for (const frame of quadros) {
  await renderStill({ serveUrl, composition, frame, output: path.join(raiz, 'out', 'quadros', `q${frame}.jpg`), imageFormat: 'jpeg', jpegQuality: 85, scale: escala });
  console.log('ok', frame);
}

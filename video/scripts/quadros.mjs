// Tira quadros soltos para conferência: node scripts/quadros.mjs 690 780 1150 …
import path from 'node:path';
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';

const raiz = path.resolve(import.meta.dirname, '..');
const quadros = process.argv.slice(2).map(Number);
const serveUrl = await bundle({ entryPoint: path.join(raiz, 'src', 'index.ts') });
const composition = await selectComposition({ serveUrl, id: 'Operador' });
for (const frame of quadros) {
  await renderStill({ serveUrl, composition, frame, output: path.join(raiz, 'out', 'quadros', `q${frame}.jpg`), imageFormat: 'jpeg', jpegQuality: 85, scale: 0.5 });
  console.log('ok', frame);
}

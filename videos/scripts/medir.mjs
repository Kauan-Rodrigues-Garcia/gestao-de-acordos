// Mede onde fica cada elemento clicável das telas (os `data-alvo`) e grava
// src/app/alvos.json — o mapa que o cursor e a câmera usam.
//
//   npm run medir
//
// Rode depois de mexer no desenho de uma tela. Tira um quadro pequeno a cada
// `PASSO` frames da parte do app e guarda, para cada alvo, as posições pelo
// tempo (só quando mudam).

import { writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { bundle } from '@remotion/bundler';
import { openBrowser, renderStill, selectComposition } from '@remotion/renderer';
import { ajustarWebpack } from '../webpack.mjs';

const raiz = path.resolve(import.meta.dirname, '..');
const PASSO = Number(process.env.PASSO ?? 6);
const INICIO = Number(process.env.INICIO ?? 640);
const FIM = Number(process.env.FIM ?? 4460);

const serveUrl = await bundle({ entryPoint: path.join(raiz, 'src', 'index.ts'), webpackOverride: ajustarWebpack });
const inputProps = { medir: true };
const navegador = await openBrowser('chrome');
const composition = await selectComposition({ serveUrl, id: 'Operador', inputProps, puppeteerInstance: navegador });

const porFrame = new Map();
const quadros = [];
for (let f = INICIO; f <= FIM; f += PASSO) quadros.push(f);

const paralelo = Math.max(1, Math.min(6, os.cpus().length - 1));
let feitos = 0;
async function trabalhador(fila) {
  while (fila.length) {
    const frame = fila.shift();
    await renderStill({
      serveUrl,
      composition,
      frame,
      inputProps,
      puppeteerInstance: navegador,
      output: path.join(os.tmpdir(), `medir-${process.pid}-${frame}.jpg`),
      imageFormat: 'jpeg',
      scale: 0.25,
      onBrowserLog: (log) => {
        const m = /^ALVOS\|(\d+)\|(.*)$/.exec(log.text);
        if (m && Number(m[1]) === frame) porFrame.set(frame, JSON.parse(m[2]));
      },
    });
    feitos++;
    if (feitos % 50 === 0) console.log(`${feitos}/${quadros.length}`);
  }
}
const fila = [...quadros];
await Promise.all(Array.from({ length: paralelo }, () => trabalhador(fila)));
await navegador.close({ silent: true });

// monta: alvo → [[frame, x, y, l, a], ...] só nas mudanças
const alvos = {};
for (const frame of [...porFrame.keys()].sort((a, b) => a - b)) {
  for (const [nome, r] of Object.entries(porFrame.get(frame))) {
    const lista = (alvos[nome] ??= []);
    const ult = lista[lista.length - 1];
    if (!ult || ult.slice(1).join() !== r.join()) lista.push([frame, ...r]);
  }
}
const destino = path.join(raiz, 'src', 'app', 'alvos.json');
writeFileSync(destino, JSON.stringify(alvos) + '\n');
console.log(`ok: ${Object.keys(alvos).length} alvos em ${porFrame.size} quadros → ${destino}`);

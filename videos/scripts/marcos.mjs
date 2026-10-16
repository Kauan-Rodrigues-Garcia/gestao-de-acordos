// Imprime em que frame cada cena e cada palavra caem (para conferir quadros).
import { readFileSync } from 'node:fs';
const d = JSON.parse(readFileSync(new URL('../src/duracoes.json', import.meta.url)));
const w = JSON.parse(readFileSync(new URL('../src/tempos.json', import.meta.url)));
const src = readFileSync(new URL('../src/linhaDoTempo.ts', import.meta.url), 'utf8');
const resp = Object.fromEntries([...src.matchAll(/'(cena-\d+)': \[([\d.]+), ([\d.]+)\]/g)].map((m) => [m[1], [+m[2], +m[3]]]));
const s = (x) => Math.round(x * 60);
let cur = 0;
for (const id of Object.keys(d)) {
  const [a, b] = resp[id];
  const voz = cur + s(a);
  const fim = voz + s(d[id] + b);
  console.log(`${id} inicio=${cur} voz=${voz} fim=${fim} | ` + w[id].map((p) => `${p.palavra}@${voz + Math.round(p.inicioMs * 0.06)}`).join(' '));
  cur = fim;
}
console.log('TOTAL', cur, (cur / 60).toFixed(1) + 's');

// Junta os quadros do screencast num mp4 de 60 fps constante, respeitando o
// instante de cada quadro.
import fs from 'node:fs'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
const [,, DIR, SAIDA] = process.argv;
const FF = 'C:/Users/multiplay/Documents/gestao-de-acordos-main/gestao-de-acordos-main/videos/node_modules/@remotion/compositor-win32-x64-msvc/ffmpeg.exe';
const log = JSON.parse(fs.readFileSync(path.join(DIR, 'log.json'), 'utf8'));
const fim = log.marcas.fim + 0.5;
const q = log.quadros;
let txt = '';
// O primeiro quadro cobre desde t=0.
for (let i = 0; i < q.length; i++) {
  const ini = i === 0 ? 0 : q[i];
  const ate = i + 1 < q.length ? q[i + 1] : fim;
  if (ate <= ini) continue;
  const nome = path.join(DIR, 'q', `${String(i).padStart(5, '0')}.jpg`).split(path.sep).join('/');
  txt += `file '${nome}'\nduration ${(ate - ini).toFixed(4)}\n`;
}
const last = path.join(DIR, 'q', `${String(q.length - 1).padStart(5, '0')}.jpg`).split(path.sep).join('/');
txt += `file '${last}'\n`;
fs.writeFileSync(path.join(DIR, 'lista.txt'), txt);
execFileSync(FF, ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(DIR, 'lista.txt'),
  '-fps_mode', 'cfr', '-r', '60', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-preset', 'medium', '-crf', '14', '-movflags', '+faststart', SAIDA], { stdio: 'inherit' });
console.log('ok', SAIDA, fim.toFixed(2) + 's');

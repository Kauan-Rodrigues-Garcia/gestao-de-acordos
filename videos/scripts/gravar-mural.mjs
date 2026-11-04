// Grava o MURAL de outubro (branch `feat/portal-outubro`, `PortalOutubro/Mural.tsx`)
// para o fim do vídeo de Natal (Cleber, 28/10): só o mural, com as peças já
// pregadas e TODOS os detalhes do original (a Coisa na porta atrás do balão,
// a aranha pendurada, os morcegos, as abóboras, as teias). A única coisa que
// se mexe são os bichinhos dentro das fotos das gincanas; o resto fica parado
// (o que tem fim, no fim; o que repete, num ponto fixo). Sem invasão, sem o
// bote da Coisa (nenhum mouse entra na página) e sem o botão de fechar.
//
// Roda na pasta da branch do mural (`gestao-de-acordos-portal`), com o dev
// server dela, e a página `_video-mural.html` de lá (que só monta o mural):
//   node scripts/gravar-mural.mjs [http://localhost:8081] [segundos]
//
// O relógio do navegador é do Playwright, como nos cavalos: cada quadro anda
// 1/60 s exato. Sai `public/natal/mural/mural.mp4` (1920×936, a proporção do vídeo).

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const raiz = path.resolve(import.meta.dirname, '..');
const servidor = process.argv[2] ?? 'http://localhost:8081';
/**
 * Quando a gravação começa: o chat do mês já recebeu as 4 mensagens (perto de
 * 10 s) e a Coisa já voltou para trás do balão (as poses de `coisa/NoMural.tsx`:
 * balão até 9 s, espia até 12,8 s, balão de novo até 20,8 s).
 */
const COMECA_MS = 13500;
/** Termina antes da próxima pose da Coisa (20,8 s). */
const SEGUNDOS = Number(process.argv[3] ?? 7.2);
const FPS = 60;
fs.mkdirSync(path.join(raiz, 'public', 'natal', 'mural'), { recursive: true });

const nav = await chromium.launch();
const ctx = await nav.newContext({ viewport: { width: 1920, height: 936 } });
await ctx.clock.install({ time: new Date('2026-10-30T16:00:00-03:00') });
const p = await ctx.newPage();
p.on('console', m => { if (m.type() === 'error') console.log('[página]', m.text().slice(0, 160)); });
await p.goto(`${servidor}/_video-mural.html`);
// O relógio para logo (a pose da Coisa conta dele) e a página carrega no tempo de verdade.
await p.clock.pauseAt((await p.evaluate(() => Date.now())) + 100);
await p.waitForTimeout(7000);

// Fora do vídeo: só o bote da Coisa (por garantia) e o botão de fechar.
await p.addStyleTag({ content: '.portal-fechar, .coisa-bote, .coisa-bote-clarao, .coisa-bote-frase { display: none !important; }' });
await p.clock.runFor(COMECA_MS);

/**
 * Só o que está dentro das fotos das gincanas anda (no relógio da gravação).
 * O resto fica parado: o que tem fim, no fim; o que repete, num ponto fixo
 * (aos 5 s: os morcegos ficam no meio do voo, não fora da tela).
 */
let relogio = 0;
const ajeitar = () => p.evaluate(ms => {
  for (const a of document.getAnimations()) {
    const alvo = a.effect?.target;
    a.pause();
    if (alvo && alvo.closest?.('.mural-foto-quadro')) { a.currentTime = ms; continue; }
    const fim = a.effect?.getComputedTiming().endTime;
    a.currentTime = Number.isFinite(fim) ? fim : 5000;
  }
}, relogio);

const ffmpeg = spawn('npx', ['remotion', 'ffmpeg', '-hide_banner', '-loglevel', 'error', '-y',
  '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
  '-vf', 'scale=1920:936:out_range=tv,format=yuv420p', '-c:v', 'libx264', '-crf', '14', '-preset', 'slow', '-pix_fmt', 'yuv420p',
  '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
  // Relativo à pasta do vídeo: com shell, o caminho com espaço («projeto gestão») quebraria.
  'public/natal/mural/mural.mp4'], { cwd: raiz, shell: true, stdio: ['pipe', 'inherit', 'inherit'] });

const N = Math.round(SEGUNDOS * FPS);
for (let n = 0; n < N; n++) {
  await p.clock.runFor(1000 / FPS); relogio += 1000 / FPS;
  await ajeitar();
  const png = await p.screenshot({ type: 'png' });
  if (!ffmpeg.stdin.write(png)) await new Promise(r => ffmpeg.stdin.once('drain', r));
  if (n % 120 === 0) console.log(`${(n / FPS).toFixed(0)} s`);
}
ffmpeg.stdin.end();
await new Promise(r => ffmpeg.on('close', r));
await nav.close();
console.log('pronto');

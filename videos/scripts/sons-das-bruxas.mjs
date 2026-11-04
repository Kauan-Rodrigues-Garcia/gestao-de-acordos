// Grava em WAV os sons ORIGINAIS da Caça às Bruxas para o vídeo de Natal: os
// dela (`bruxas/sons.ts`, o puf, a gargalhada, o grito, o ESPATIFA no chão).
// O tiro, o headshot e o baque são os dos zumbis (`sons-da-caca.mjs`).
//
// Igual ao dos zumbis, com uma diferença: `bruxas/sons.ts` usa o sintetizador
// de `../sons.ts`, que guarda o AudioContext do primeiro som. A página é
// recarregada a cada som, para cada um nascer num contexto novo.
//
// Precisa do `npm run dev` do app rodando:
//   node scripts/sons-das-bruxas.mjs [http://localhost:8080]

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const raiz = path.resolve(import.meta.dirname, '..');
const destino = path.join(raiz, 'public', 'natal', 'bruxas');
const servidor = process.argv[2] ?? 'http://localhost:8080';
const MODULO = '/arquivo-morto/caca-zumbis-bruxas/src/components/CacaAbobora/bruxas/sons.ts';

/** [arquivo, função, argumentos, duração máxima em s] */
const SONS = [
  ['puf', 'somPuf', [], 1.5],
  ['gargalhada', 'somGargalhada', [], 3],
  ['grito', 'somGrito', [], 2.5],
  ['espatifa', 'somEspatifa', [1], 1.5],
  ['vento', 'somVento', [], 2],
  ['chapeu', 'somChapeu', [], 1.5],
];

fs.mkdirSync(destino, { recursive: true });
const navegador = await chromium.launch();
const pagina = await navegador.newPage();
await pagina.goto(`${servidor}/lab-natal.html`);

for (const [nome, funcao, args, dur] of SONS) {
  await pagina.reload();
  const wav = await pagina.evaluate(async ({ modulo, funcao, args, dur }) => {
    const TAXA = 48000;
    let gravador;
    // O módulo guarda o contexto: cada som carrega uma cópia nova dele.
    window.AudioContext = class extends OfflineAudioContext {
      constructor() { super(2, Math.ceil(TAXA * dur), TAXA); gravador = this; }
    };
    const m = await import(`${modulo}?som=${funcao}-${Math.random()}`);
    m[funcao](...args);
    const buf = await gravador.startRendering();
    // Normaliza o pico em -1 dB: o volume de verdade é decidido no vídeo.
    const canais = [buf.getChannelData(0), buf.getChannelData(1)];
    let pico = 0;
    let fim = 0;
    for (const c of canais) for (let i = 0; i < c.length; i++) {
      const v = Math.abs(c[i]);
      if (v > pico) pico = v;
      if (v > 1e-4 && i > fim) fim = i;
    }
    const ganho = pico > 0 ? 0.89 / pico : 1;
    const n = Math.min(buf.length, fim + Math.round(TAXA * 0.05));
    // WAV PCM 16 bits, estéreo.
    const dados = new DataView(new ArrayBuffer(44 + n * 4));
    const escreve = (o, s) => { for (let i = 0; i < s.length; i++) dados.setUint8(o + i, s.charCodeAt(i)); };
    escreve(0, 'RIFF'); dados.setUint32(4, 36 + n * 4, true); escreve(8, 'WAVEfmt ');
    dados.setUint32(16, 16, true); dados.setUint16(20, 1, true); dados.setUint16(22, 2, true);
    dados.setUint32(24, TAXA, true); dados.setUint32(28, TAXA * 4, true); dados.setUint16(32, 4, true);
    dados.setUint16(34, 16, true); escreve(36, 'data'); dados.setUint32(40, n * 4, true);
    for (let i = 0; i < n; i++) for (let c = 0; c < 2; c++) {
      const v = Math.max(-1, Math.min(1, canais[c][i] * ganho));
      dados.setInt16(44 + (i * 2 + c) * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true);
    }
    let bin = '';
    const bytes = new Uint8Array(dados.buffer);
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return { base64: btoa(bin), segundos: n / TAXA, pico };
  }, { modulo: MODULO, funcao, args, dur });
  fs.writeFileSync(path.join(destino, `${nome}.wav`), Buffer.from(wav.base64, 'base64'));
  console.log(`${nome}.wav  ${wav.segundos.toFixed(2)} s  (pico original ${wav.pico.toFixed(3)})`);
}
await navegador.close();

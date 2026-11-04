// Grava os sons ORIGINAIS do Rei do Pop zumbi (o chefão da Caça) para o
// vídeo de Natal. No sistema publicado a pasta de vozes não existia, então
// todo mundo ouviu a versão sintetizada do `sons.ts` — é ela que vai aqui.
//
//   - os efeitos curtos: OfflineAudioContext, como `sons-da-caca.mjs`;
//   - a trilha (o funk de 8 bits): é agendada por timer contra o relógio do
//     áudio, o que offline não anda; grava em tempo real, com um gravador
//     ligado na saída, por `SEGUNDOS_DA_TRILHA`.
//
// Precisa do `npm run dev` do app rodando:
//   node scripts/sons-do-chefao.mjs [http://localhost:8080]

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { chromium } from 'playwright';

const raiz = path.resolve(import.meta.dirname, '..');
const destino = path.join(raiz, 'public', 'natal', 'chefao');
const servidor = process.argv[2] ?? 'http://localhost:8080';
const MODULO = '/arquivo-morto/caca-zumbis-bruxas/src/components/CacaAbobora/sons.ts';
const SEGUNDOS_DA_TRILHA = 16;

const SONS = [
  ['chega', 'somChefaoChega', [], 4],
  ['hee-hee', 'somHeeHee', [1, true], 1.2],
  ['acerto', 'somAcertoChefao', [false], 0.6],
  ['acerto-cabeca', 'somAcertoChefao', [true], 0.6],
  ['moonwalk', 'somMoonwalk', [], 0.5],
  ['pulo', 'somPulo', [], 0.6],
  ['pouso', 'somPouso', [], 0.6],
  ['furia', 'somFuria', [], 2],
  ['cai', 'somChefaoCai', [], 1.6],
  ['arranca', 'somArranca', [], 1],
];

fs.mkdirSync(destino, { recursive: true });
const navegador = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const pagina = await navegador.newPage();
await pagina.goto(`${servidor}/lab-natal.html`);

const wavDe = (canais, taxa, n) => {
  const dados = Buffer.alloc(44 + n * 4);
  dados.write('RIFF', 0); dados.writeUInt32LE(36 + n * 4, 4); dados.write('WAVEfmt ', 8);
  dados.writeUInt32LE(16, 16); dados.writeUInt16LE(1, 20); dados.writeUInt16LE(2, 22);
  dados.writeUInt32LE(taxa, 24); dados.writeUInt32LE(taxa * 4, 28); dados.writeUInt16LE(4, 32);
  dados.writeUInt16LE(16, 34); dados.write('data', 36); dados.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) for (let c = 0; c < 2; c++) {
    const v = Math.max(-1, Math.min(1, canais[c][i]));
    dados.writeInt16LE(Math.round(v < 0 ? v * 0x8000 : v * 0x7fff), 44 + (i * 2 + c) * 2);
  }
  return dados;
};

for (const [nome, funcao, args, dur] of SONS) {
  const r = await pagina.evaluate(async ({ modulo, funcao, args, dur }) => {
    const TAXA = 48000;
    let gravador;
    window.AudioContext = class extends OfflineAudioContext {
      constructor() { super(2, Math.ceil(TAXA * dur), TAXA); gravador = this; }
    };
    const m = await import(`${modulo}?som=${funcao}-${Math.random()}`);
    m[funcao](...args);
    const buf = await gravador.startRendering();
    const canais = [Array.from(buf.getChannelData(0)), Array.from(buf.getChannelData(1))];
    return { canais, taxa: TAXA };
  }, { modulo: MODULO, funcao, args, dur });
  let pico = 0, fim = 0;
  r.canais.forEach(c => c.forEach((v, i) => { const a = Math.abs(v); if (a > pico) pico = a; if (a > 1e-4 && i > fim) fim = i; }));
  const ganho = pico > 0 ? 0.89 / pico : 1;
  const n = Math.min(r.canais[0].length, fim + Math.round(r.taxa * 0.05));
  fs.writeFileSync(path.join(destino, `${nome}.wav`), wavDe(r.canais.map(c => c.map(v => v * ganho)), r.taxa, n));
  console.log(`${nome}.wav  ${(n / r.taxa).toFixed(2)} s`);
}

// A trilha, em tempo real: a saída do contexto passa por um gravador. A página
// recarrega antes — o AudioContext dela foi trocado pelo offline lá em cima.
await pagina.reload();
const webm = await pagina.evaluate(async ({ modulo, segundos }) => {
  const Real = window.AudioContext;
  let saida;
  window.AudioContext = class extends Real {
    constructor() {
      super();
      saida = this.createMediaStreamDestination();
      Object.defineProperty(this, 'destination', { get: () => saida });
    }
  };
  const m = await import(`${modulo}?trilha=${Math.random()}`);
  m.volumeDoChefao(true);
  const trilha = m.tocarTrilha();
  // O módulo cria o contexto na primeira chamada: espera a saída existir.
  while (!saida) await new Promise(ok => setTimeout(ok, 20));
  const rec = new MediaRecorder(saida.stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 192000 });
  const partes = [];
  rec.ondataavailable = e => partes.push(e.data);
  const pronto = new Promise(ok => { rec.onstop = ok; });
  rec.start();
  await new Promise(ok => setTimeout(ok, segundos * 1000));
  rec.stop(); trilha.parar();
  await pronto;
  const bytes = new Uint8Array(await new Blob(partes, { type: 'audio/webm' }).arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}, { modulo: MODULO, segundos: SEGUNDOS_DA_TRILHA });
const bruto = path.join(destino, 'trilha.webm');
fs.writeFileSync(bruto, Buffer.from(webm, 'base64'));
// webm → wav normalizado, pelo ffmpeg que vem com o Remotion.
// Entre aspas: o caminho do projeto tem espaço («projeto gestão atualizado»).
execSync(`npx remotion ffmpeg -y -i "${bruto}" -af "loudnorm=I=-16:TP=-1.5" -ar 48000 "${path.join(destino, 'trilha.wav')}"`, { cwd: raiz, stdio: 'ignore' });
fs.rmSync(bruto);
console.log(`trilha.wav  ~${SEGUNDOS_DA_TRILHA} s`);
await navegador.close();

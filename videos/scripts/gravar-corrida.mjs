// Grava uma Corrida das Almas para o vídeo de Natal, com o motor ORIGINAL
// (`src/components/Corrida/motor/motor.js`) — o mesmo `gravar` que o super
// admin usa no teste. Quem corre são as 13 pessoas que venceram uma corrida de
// bichinhos em outubro (`dados.ts`), cada uma com o bichinho dela
// (`bichinhoDe`). Sai em `public/natal/corrida/` a gravação empacotada
// (`gravacao.ts`, a mesma do banco) e o que o palco precisa para a caixa dos
// mapas.
//
// A festa em vídeo do fim não é gravada: sem ela, o motor desenha a festa ao
// vivo, como nas telas que não gravam vídeo.
//
// Precisa do `npm run dev` do app rodando:
//   node scripts/gravar-corrida.mjs [http://localhost:8080] [semente]

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const raiz = path.resolve(import.meta.dirname, '..');
const destino = path.join(raiz, 'public', 'natal', 'corrida');
const servidor = process.argv[2] ?? 'http://localhost:8080';
const semente = Number(process.argv[3] ?? 2026);

const CORREDORES = [
  'Eduardo Naia', 'Gabriel Martin', 'Ingrid Nascimento', 'Eduardo Melo', 'Camila Ribeiro', 'Tainara Fernanda', 'Gustavo Melo',
  'Layra Carini', 'Geovanna Raissa', 'Vitoria Grosso', 'Nayara Macedo', 'Rayane Estevan', 'Gabriela Gonçalves',
];

fs.mkdirSync(destino, { recursive: true });
const navegador = await chromium.launch();
const pagina = await navegador.newPage();
pagina.on('console', m => { if (m.type() === 'error') console.log('[página]', m.text()); });
await pagina.goto(`${servidor}/lab-natal.html`);

const saida = await pagina.evaluate(async ({ nomes, semente }) => {
  // O sorteio do mapa e da semente usa Math.random: com semente fixa, a mesma corrida sai sempre.
  let a = semente >>> 0;
  Math.random = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // Sem o codificador de vídeo, `gravaFestaVideo` devolve null (a festa fica ao vivo).
  window.VideoEncoder = undefined;
  const base = '/src/components/Corrida';
  const { criarMotor } = await import(`${base}/motor/motor.js`);
  const { bichinhoDe } = await import(`${base}/motor/bichinhos.js`);
  const { empacotarGravacao } = await import(`${base}/gravacao.ts`);
  const tela = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; c.style.cssText = `width:${w}px;height:${h}px`; document.body.appendChild(c); return c; };
  const motor = criarMotor({ pista: tela(560, 700), cerimonia: tela(560, 700), sons: { lobby: '', vitoria: '' } });
  const pessoas = nomes.map((nome, i) => ({ id: `p${i}`, nome, setor: null, foto: null, est: bichinhoDe(1, `p${i}`, null) }));
  const r = await motor.gravar({ pessoas, premio: null });
  motor.destruir();
  const bytes = empacotarGravacao(r.rec);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return {
    base64: btoa(bin),
    meta: { semente: r.semente, mapa: r.mapa, faixa: r.faixa, parada: r.parada, durShow: r.durShow, vencedor: r.rec.nomes[r.rec.vencedor], tVenc: r.rec.tVenc, dur: r.rec.dur },
  };
}, { nomes: CORREDORES, semente });

fs.writeFileSync(path.join(destino, 'gravacao.bin'), Buffer.from(saida.base64, 'base64'));
fs.writeFileSync(path.join(destino, 'gravacao.json'), JSON.stringify(saida.meta, null, 2) + '\n');
console.log(saida.meta);
await navegador.close();

// Grava o ensaio do Modo TV (lab-modo-tv.html) com screencast do CDP e anota
// cursor, cliques, teclas, marcas e retângulos para a montagem no Remotion.
import { chromium } from 'file:///C:/Users/multiplay/Documents/gestao-de-acordos-main/gestao-de-acordos-main/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';

const SAIDA = process.argv[2];
const W = 1760, H = 990, DSF = 2400 / 1760;
fs.rmSync(SAIDA, { recursive: true, force: true });
fs.mkdirSync(path.join(SAIDA, 'q'), { recursive: true });

const b = await chromium.launch({ headless: true, args: ['--hide-scrollbars'] });
const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: DSF });
p.on('pageerror', e => console.log('ERRO', String(e)));
await p.goto('http://localhost:8080/lab-modo-tv.html');
await p.waitForTimeout(2500);
await p.mouse.move(980, 640);

const log = { W, H, marcas: {}, cursor: [], cliques: [], teclas: [], vistas: [{ t: 0, v: 'mesa' }], rects: {}, rolagem: [] };
const quadros = [];
const cdp = await p.context().newCDPSession(p);
let T0wall = 0;
cdp.on('Page.screencastFrame', async f => {
  cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  const i = quadros.length;
  quadros.push(f.metadata.timestamp);
  fs.writeFile(path.join(SAIDA, 'q', `${String(i).padStart(5, '0')}.jpg`), Buffer.from(f.data, 'base64'), () => {});
});
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 2400, maxHeight: 1350, everyNthFrame: 1 });
T0wall = Date.now() / 1000;
const agora = () => +(Date.now() / 1000 - T0wall).toFixed(3);
const dormir = ms => new Promise(r => setTimeout(r, ms));
const marca = n => { log.marcas[n] = agora(); console.log(n, log.marcas[n]); };

let pos = { x: 980, y: 640 };
log.cursor.push({ t: 0, ...pos });
const curva = k => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
async function mover(x, y, ms = 700) {
  const de = { ...pos };
  const t0 = Date.now();
  const lado = Math.random() < 0.5 ? -1 : 1;
  const dist = Math.hypot(x - de.x, y - de.y) || 1;
  for (;;) {
    const k = Math.min(1, (Date.now() - t0) / ms);
    const e = curva(k);
    const arco = Math.sin(e * Math.PI) * Math.min(40, dist * 0.08) * lado;
    const nx = de.x + (x - de.x) * e + (-(y - de.y) / dist) * arco;
    const ny = de.y + (y - de.y) * e + ((x - de.x) / dist) * arco;
    await p.mouse.move(nx, ny);
    pos = { x: nx, y: ny };
    log.cursor.push({ t: agora(), x: +nx.toFixed(1), y: +ny.toFixed(1) });
    if (k >= 1) break;
    await dormir(12);
  }
}
async function centro(alvo) {
  const r = await alvo.boundingBox();
  if (!r) throw new Error('sem caixa: ' + alvo);
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}
async function clicar(alvo, { ms = 700, dx = 0, dy = 0, antes = 160 } = {}) {
  if (alvo.x === undefined) {
    const r = await alvo.boundingBox();
    if (r && (r.y < 0 || r.y + r.height > H)) {
      console.log('rolando para alcançar o alvo');
      await rolar(Math.round(r.y + r.height / 2 - H * 0.55));
    }
  }
  const c = alvo.x !== undefined ? alvo : await centro(alvo);
  await mover(c.x + dx, c.y + dy, ms);
  await dormir(antes);
  log.cliques.push(agora());
  await p.mouse.down();
  await dormir(70);
  await p.mouse.up();
}
async function digitar(texto, atraso = 55) {
  for (const ch of texto) {
    log.teclas.push(agora());
    if (ch === '\n') await p.keyboard.press('Shift+Enter'); else await p.keyboard.type(ch);
    await dormir(atraso + Math.random() * 30);
  }
}
async function tecla(t) { log.teclas.push(agora()); await p.keyboard.press(t); }
async function vista(v) { await p.evaluate(x => window.__labVer(x), v); log.vistas.push({ t: agora(), v }); }
async function rect(nome, alvo) {
  const r = await alvo.boundingBox();
  if (r) log.rects[nome] = { t: agora(), x: r.x, y: r.y, l: r.width, a: r.height };
}
async function rolar(dy, ms = 900) {
  const passos = Math.round(ms / 16);
  let feito = 0;
  const ini = agora();
  for (let i = 1; i <= passos; i++) {
    const alvo = Math.round(dy * curva(i / passos));
    await p.mouse.wheel(0, alvo - feito);
    feito = alvo;
    await dormir(14);
  }
  await dormir(200);
  log.rolagem.push({ de: ini, ate: agora(), dy });
}
const tvLab = (f, ...a) => p.evaluate(([f, a]) => window.__labTv[f](...a), [f, a]);

const previa = p.locator('div[style*="aspect-ratio"]').nth(0);
const noAr = p.locator('div[style*="aspect-ratio"]').nth(1);
const cenaBtn = nome => p.locator('aside button', { hasText: nome }).first();
const cortarBtn = p.getByRole('button', { name: /CORTAR PARA O AR|ATUALIZAR NO AR/ });

// ── 1. a mesa ────────────────────────────────────────────────────────────
await dormir(600);
marca('mesa');
await rect('previa', previa);
await rect('noar', noAr);
await rect('cenas', p.locator('aside').nth(0));
await rect('fontes', p.locator('aside').nth(1));
await rect('cortar', cortarBtn);
await mover(700, 420, 900);
await dormir(1600);
await mover(1180, 420, 800);
await dormir(1700);

// ── 2. cenas e corte ─────────────────────────────────────────────────────
marca('cenas');
await clicar(cenaBtn('Ranking do mês'), { ms: 900 });
await dormir(400);
marca('previaMudou');
await mover(840, 330, 700);
await dormir(900);
await mover(1300, 330, 700);
await dormir(1300);
await tvLab('atrasoCorte', 900);
await clicar(cortarBtn, { ms: 900 });
marca('corte1');
await dormir(150);
await vista('parede');
await dormir(3600);
await vista('mesa');
await dormir(700);

// ── 3. montar uma cena nova ──────────────────────────────────────────────
marca('montar');
await clicar(p.getByPlaceholder('Nova cena'), { ms: 900 });
await digitar('Campeões de outubro');
await dormir(250);
await tecla('Enter');
await dormir(500);
await clicar(cenaBtn('Campeões de outubro'), { ms: 600 });
await dormir(700);
marca('galeria');
await clicar(p.getByRole('button', { name: /Coisas interessantes/ }), { ms: 900 });
await dormir(600);
await rect('galeria', p.locator('[role=dialog] > div').first());
await dormir(900);
await clicar(p.locator('[role=dialog] nav button', { hasText: 'Ranking' }), { ms: 700 });
await dormir(700);
await clicar(p.locator('[role=dialog] button', { hasText: 'Pódio' }).first(), { ms: 800 });
await dormir(900);
marca('podio');
await rect('inspetor', p.locator('div.shadow-lg').first());
await dormir(900);
await clicar(p.getByRole('button', { name: 'Fundo', exact: true }), { ms: 800 });
await dormir(600);
await clicar(p.getByRole('button', { name: 'Texto', exact: true }), { ms: 600 });
await dormir(700);
// arrasta o texto para o alto da cena
marca('arrastar');
const caixaPrevia = await previa.boundingBox();
const textoNovo = previa.getByText('Novo texto');
const ct = await centro(textoNovo);
await mover(ct.x, ct.y, 800);
await dormir(250);
log.cliques.push(agora());
await p.mouse.down();
await dormir(200);
await mover(ct.x + 18, caixaPrevia.y + caixaPrevia.height * 0.16, 1300);
await dormir(250);
await p.mouse.up();
await dormir(500);
marca('editarTexto');
const campoTexto = p.locator('div.shadow-lg input').first();
await rect('inspetor2', p.locator('div.shadow-lg').first());
await clicar(campoTexto, { ms: 900 });
await p.keyboard.press('Control+A');
await digitar('CAMPEÕES DE OUTUBRO', 60);
await dormir(900);
// tira o foco do campo (Esc dentro do campo não vale) e solta a seleção
await clicar({ x: 760, y: 720 }, { ms: 800 });
await dormir(200);
await tecla('Escape');
await dormir(500);

// ── 4. mandar ao ar ──────────────────────────────────────────────────────
marca('noAr');
await rect('cortar', cortarBtn);
await mover((await centro(cortarBtn)).x, (await centro(cortarBtn)).y, 900);
await dormir(700);
await tvLab('atrasoCorte', 900);
await tecla('Enter');
marca('enter');
await dormir(150);
await vista('parede');
await dormir(3800);
await vista('mesa');
await dormir(600);

// ── 5. rotação ───────────────────────────────────────────────────────────
marca('rotacao');
await p.evaluate(() => { window.__labRotacaoS = 3.6; });
const chave = p.locator('aside').nth(0).getByRole('switch').first();
await rect('estaCena', p.locator('aside').nth(0).locator('div.rounded-md.border').first());
await clicar(chave, { ms: 900 });
await dormir(800);
await clicar(p.getByRole('button', { name: /Rotação/ }), { ms: 900 });
marca('rotacaoLigada');
await rect('rotacaoBtn', p.getByRole('button', { name: /Rotação/ }));
await dormir(500);
await clicar(p.locator('button[title="Ampliar no ar"]'), { ms: 900 });
await dormir(700);
await mover(1150, 380, 800);
await dormir(2900);
await vista('parede');
marca('rotacaoTv');
await dormir(6400);
await vista('mesa');
await clicar(p.locator('button[title="Voltar ao tamanho normal"]'), { ms: 700 });
await dormir(500);

// ── 6. alerta ao vivo ────────────────────────────────────────────────────
marca('alerta');
await rect('painelAlerta', p.locator('div.rounded-md.border', { hasText: 'Alerta ao vivo' }).first());
await clicar(p.getByPlaceholder('Fulano bateu a meta!'), { ms: 900 });
await digitar('Juliana bateu a meta! 🎉');
await clicar(p.getByPlaceholder('Mensagem (opcional)'), { ms: 450 });
await digitar('R$ 24.870 em outubro. Parabéns!');
await dormir(400);
await clicar(p.getByRole('button', { name: 'Disparar na parede' }), { ms: 700 });
marca('disparou');
await dormir(150);
await vista('parede');
await dormir(4300);
await vista('mesa');
await dormir(600);

// ── 7. jogos ─────────────────────────────────────────────────────────────
marca('jogos');
await clicar(cenaBtn('Roleta do café'), { ms: 1000 });
await dormir(600);
await clicar(cortarBtn, { ms: 900 });
marca('corteRoleta');
await dormir(900);
await mover(1500, 600, 600);
await rolar(520);
await rect('painelJogos', p.locator('div.rounded-md.border', { hasText: 'Jogos' }).first());
await clicar(p.getByPlaceholder('Título da roleta'), { ms: 800 });
await digitar('Roleta do café');
await clicar(p.locator('textarea'), { ms: 500 });
await digitar('Café por conta da casa\nFolga na sexta\nVale-lanche\nChocolate\nPix de R$ 20\nSair 1h mais cedo', 38);
await dormir(300);
await clicar(p.getByRole('button', { name: 'neon', exact: true }), { ms: 600 });
await dormir(300);
await clicar(p.getByRole('button', { name: /Abrir roleta/ }), { ms: 600 });
await dormir(800);
await rect('painelJogos2', p.locator('div.rounded-md.border', { hasText: 'Jogos' }).first());
await tvLab('proximoIndice', 1);
await clicar(p.getByRole('button', { name: /Girar/ }), { ms: 900 });
marca('girou');
await dormir(120);
await vista('parede');
await dormir(6300);
await vista('mesa');
await dormir(500);

// ── 8. todas as telas ────────────────────────────────────────────────────
marca('mosaico');
await rolar(900, 1100);
await rect('mosaico', p.locator('section', { hasText: 'Todas as telas' }).last());
await mover(900, 700, 800);
await dormir(1800);
await clicar(p.locator('section button', { hasText: 'TV da Recepção' }).first(), { ms: 900 });
await dormir(900);
await rolar(-1600, 1200);
marca('recepcao');
await dormir(2600);
marca('fim');

await cdp.send('Page.stopScreencast');
await dormir(800);
log.quadros = quadros.map(t => +(t - T0wall).toFixed(4));
fs.writeFileSync(path.join(SAIDA, 'log.json'), JSON.stringify(log, null, 1));
console.log('quadros', quadros.length, 'duração', agora());
await b.close();

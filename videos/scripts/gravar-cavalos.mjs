// Grava a Corrida de Cavalos ORIGINAL com a Guerra na Corrida
// (`corrida-cavalos.html` no «Testar só na minha tela» do laboratório, com o
// ensaio da guerra) para a montagem do vídeo de Natal, em três trechos:
//
//   cav-largada.mp4  a largada (na janela da corrida);
//   cav-guerra.mp4   a corrida chegando ao meio e a guerra estourando (na janela);
//   cav-chefe.webm   a janela estourando e o Cavalo da Guerra entrando na
//                    página — a tela inteira, com o fundo transparente.
//
// A página tem o próprio laço de desenho; para sair sem engasgo, o relógio do
// navegador é do Playwright (`clock`): cada quadro anda 1/60 s exato, e as
// animações de CSS são postas no mesmo ponto. Entre um trecho e outro o
// relógio avança sem gravar. Os nomes inventados do teste viram a gente da
// gincana, e o mapa fica fixo no de terra («manha»).
//
// Precisa do `npm run dev` do app rodando:
//   node scripts/gravar-cavalos.mjs [http://localhost:8080]

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const raiz = path.resolve(import.meta.dirname, '..');
const destino = path.join(raiz, 'public', 'natal', 'cavalos');
const servidor = process.argv[2] ?? 'http://localhost:8080';
const FPS = 60;
/** 1600×780 com zoom de 1,2: a tela do vídeo (1920×936, a proporção do navegador), como o app no vídeo. */
const ZOOM = 1.2;

fs.mkdirSync(destino, { recursive: true });
const nav = await chromium.launch();
const ctx = await nav.newContext({ viewport: { width: 1600, height: 780 }, deviceScaleFactor: ZOOM });
await ctx.clock.install({ time: new Date('2026-10-23T15:00:00-03:00') });
// Os nomes do modo teste são inventados (Daniel, Yasmin…), e o vídeo não mostra nome inventado:
// só nesta gravação, a lista da página vira a gente de verdade da gincana de outubro (`dados.ts`),
// a começar por quem venceu as corridas de cavalos. O arquivo da página não muda.
const REAIS = [
  'Gabriel Oliveira', 'Isabele Barros', 'Camila Ribeiro', 'Bianca Santera', 'Laura Playmix', 'Maria E Pereira',
  'Debora Portela', 'Gustavo Nunes', 'Eduardo Melo', 'Pedro Alves', 'Julia Caetano', 'Maria Bernabe', 'Emily Aquino',
  'Leonardo Keppler', 'Alexia Silva', 'Layra Carini', 'Gabriely Alves', 'Leticia Andrade', 'Igor Rocha', 'Heloisa Lima',
  'Kauane Azevedo', 'Helton Roldon', 'Nicole Pacheco', 'Caio Shimite', 'Mirian Barbosa', 'Pedro Verdinasse',
  'Erika Eduarda', 'Eduardo Naia', 'Tainara Fernanda', 'Gabriel Martin', 'Ingrid Nascimento', 'Gustavo Melo',
  'Geovanna Raissa', 'Vitoria Grosso', 'Nayara Macedo', 'Rayane Estevan', 'Gabriela Gonçalves', 'Maria Bernabe',
];
const NOME_INVENTADO = "`${NOMES[k % NOMES.length].split(' ')[0]} ${SOBRENOMES[Math.floor(r() * SOBRENOMES.length)]}`";
let trocou = false;
await ctx.route('**/corrida-cavalos.html*', async rota => {
  const resposta = await rota.fetch();
  let html = await resposta.text();
  // O Vite serve o script de dentro da página à parte (`?html-proxy`): troca onde a lista estiver.
  if (!/const NOMES = \[[^\]]*\];/.test(html)) return rota.fulfill({ response: resposta, body: html });
  if (!html.includes(NOME_INVENTADO)) throw new Error('o jeito de montar o nome mudou: confira o script');
  trocou = true;
  html = html.replace(/const NOMES = \[[^\]]*\];/, `const NOMES = ${JSON.stringify(REAIS)};`)
    // O nome inteiro; o sorteio do sobrenome continua sendo chamado, para o resto sair igual.
    .replace(NOME_INVENTADO, '(r(), NOMES[k % NOMES.length])')
    // O mapa de terra (o «Hipódromo da Manhã»): a poeira dele é a que cobre a tela depois.
    .replace("ST.mapa = 'aleatorio'; ST.lobby", "ST.mapa = 'manha'; ST.lobby");
  if (!html.includes("ST.mapa = 'manha'; ST.lobby")) throw new Error('não deu para fixar o mapa: confira o script');
  await rota.fulfill({ response: resposta, body: html });
});
const p = await ctx.newPage();
p.on('console', m => { if (m.type() === 'error') console.log('[página]', m.text().slice(0, 160)); });
await p.goto(`${servidor}/lab-guerra-gestao.html?abrir`);

/** Anda o relógio falso aos poucos, dando tempo de verdade para a rede e os módulos. */
const andar = async (ms, passo = 100) => { for (let t = 0; t < ms; t += passo) { await p.clock.runFor(passo); await p.waitForTimeout(15); } };
await andar(4000);
const c = p.frames().find(f => f.url().includes('corrida-cavalos'));
if (!c) throw new Error('a janela da corrida não abriu');
if (!trocou) throw new Error('os nomes inventados não foram trocados');

// Fora do vídeo: o Gestão de mentira do laboratório, a barra do teste e o balão da dica.
await p.addStyleTag({ content: '#root{visibility:hidden!important} body{background:#08071b!important}' });
await c.addStyleTag({ content: '#teste,#balao{display:none!important}' });

/** Clica pelo próprio elemento: a barra do teste está escondida (fora do vídeo), e o clique de script basta. */
const clicar = sel => c.evaluate(sel => document.querySelector(sel).click(), sel);
const pode = t => c.evaluate(t => !document.querySelector(`#teste [data-t="${t}"]`)?.disabled, t);
const status = () => c.evaluate(() => document.querySelector('#janStatus')?.textContent ?? '');
// A Guerra na Corrida ligada: o ensaio do laboratório faz a conta e a gente de mentira ataca junto.
await c.evaluate(() => { const g = document.querySelector('#tGuerra'); if (!g.checked) g.click(); });
await clicar('[data-t="gravar"]');
for (let i = 0; i < 300 && !(await pode('largar')); i++) await andar(200, 50);
await clicar('#ampliar');
await andar(800);
await clicar('[data-t="largar"]');
await andar(600);
// Daqui em diante o relógio só anda quando a gente manda (`install` sozinho segue o tempo de verdade).
const agoraFalso = await p.evaluate(() => Date.now());
await p.clock.pauseAt(agoraFalso + 3000);
await clicar('[data-t="pular"]');
for (let i = 0; i < 200 && !/ao vivo/i.test(await status()); i++) await andar(50, 50);

const caixa = await c.evaluate(() => {
  const r = document.querySelector('.jan-caixa').getBoundingClientRect();
  return { x: r.left, y: r.top, width: r.width, height: r.height };
});
const L = Math.round(caixa.width * ZOOM / 2) * 2, A = Math.round(caixa.height * ZOOM / 2) * 2;
console.log('janela', caixa, '→', L, 'x', A);

// As animações de CSS das duas páginas seguem o relógio falso.
let relogio = 0;
const sincronizar = f => f.evaluate(ms => { for (const a of document.getAnimations()) { a.pause(); a.currentTime = ms; } }, relogio);
/** Avança sem gravar (entre um trecho e outro). */
const avancar = async ms => { for (let t = 0; t < ms; t += 100) { await p.clock.runFor(100); relogio += 100; } };

/**
 * Grava um trecho. Na janela: recortado nela, em h264. Com `alfa`: a tela
 * inteira com o fundo transparente, em VP9 com transparência (o chefe na
 * página sai por cima do cenário do vídeo).
 */
async function trecho(nome, segundos, alfa = false) {
  // Relativo à pasta do vídeo: com shell, o caminho com espaço («projeto gestão») quebraria.
  const saida = `public/natal/cavalos/${nome}.${alfa ? 'webm' : 'mp4'}`;
  const codificar = alfa
    ? ['-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-deadline', 'good', '-cpu-used', '4', '-crf', '18', '-b:v', '0', '-auto-alt-ref', '0']
    : ['-vf', `scale=${L}:${A}:out_range=tv,format=yuv420p`, '-c:v', 'libx264', '-crf', '14', '-preset', 'slow', '-pix_fmt', 'yuv420p',
      '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709'];
  const ffmpeg = spawn('npx', ['remotion', 'ffmpeg', '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-', ...codificar, saida],
    { cwd: raiz, shell: true, stdio: ['pipe', 'inherit', 'inherit'] });
  const N = Math.round(segundos * FPS);
  for (let n = 0; n < N; n++) {
    await p.clock.runFor(1000 / FPS); relogio += 1000 / FPS;
    await sincronizar(p); await sincronizar(c);
    const png = await p.screenshot(alfa ? { type: 'png', omitBackground: true } : { clip: caixa, type: 'png' });
    if (!ffmpeg.stdin.write(png)) await new Promise(r => ffmpeg.stdin.once('drain', r));
    if (n % 120 === 0) console.log(`${nome} ${(n / FPS).toFixed(0)} s · ${await status()}`);
  }
  ffmpeg.stdin.end();
  await new Promise(r => ffmpeg.on('close', r));
}

// 1. A largada.
await trecho('cav-largada', 3.6);
// 2. A guerra: a corrida chegando aos 0:12, e a guerra estourando no meio dela (0:14).
for (let i = 0; i < 400 && !/0:1[2-9]/.test(await status()); i++) await avancar(200);
await trecho('cav-guerra', 9);
// 3. O chefe: o filme passa sem gravar; quando a janela estoura e o Cavalo da Guerra
// entra na página (o palco dele é um canvas no Gestão), grava a tela inteira, transparente.
const chefeNaPagina = () => p.evaluate(() => document.querySelectorAll('body > canvas, body > div canvas').length > 0);
for (let i = 0; i < 1200 && !(await chefeNaPagina()); i++) await avancar(200);
if (!(await chefeNaPagina())) throw new Error('o Cavalo da Guerra não apareceu');
await p.addStyleTag({ content: 'html,body{background:transparent!important}' });
await c.addStyleTag({ content: 'html,body{background:transparent!important}' });
await trecho('cav-chefe', 7, true);

fs.writeFileSync(path.join(destino, 'cavalos.json'), JSON.stringify({
  janela: { x: Math.round(caixa.x * ZOOM), y: Math.round(caixa.y * ZOOM), largura: L, altura: A },
  trechos: { largada: 3.6, guerra: 9, chefe: 7 }, fps: FPS,
}, null, 2) + '\n');
await nav.close();
console.log('pronto');

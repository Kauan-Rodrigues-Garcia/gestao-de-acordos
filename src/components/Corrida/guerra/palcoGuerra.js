/*
 * palcoGuerra.js — o Cavalo da Guerra na página do Gestão (Guerra na Corrida,
 * 23/10/2026). É o que roda depois que a janela da corrida estoura: o chefe
 * anda, ataca e leva tiro em cima do app inteiro.
 *
 * ## O que é de cada tela e o que é de todos
 *
 * Como na Bruxa do Pântano: o chefe andando, a cabeçada, o rastro de fogo, o
 * fogo nos acordos, os cavalos de fogo e os Quatro Cavaleiros são da tela de
 * cada um (cada página apanha do seu chefe). A VIDA, o anjo (a cura), a queda
 * e o prazo são do banco (`estado`, migration 20261023150000): iguais em toda
 * tela. Os tiros desta tela vão a cada `GUERRA.loteMs`, somados (`aoGolpear`).
 * O que os outros tiram aparece como faíscas no corpo dele.
 *
 * ## O Gestão não quebra de verdade
 *
 * Tudo que ele faz com a página passa por `alvos.js`: classe e atributo POR
 * CIMA dos alvos marcados com `data-alvo-feitico` (valor | aba | linha), e
 * tudo volta sozinho. O clique é um tiro em qualquer lugar MENOS no que estiver
 * dentro de `data-chefona-livre` (o menu lateral): quem precisa sair para
 * atender, sai. Modo leve (`leve`): sem halos, menos partículas, a página não
 * treme, e o chefe é redesenhado a no máximo 12 quadros por segundo.
 *
 * ## O anjo
 *
 * Quando o banco cura (o diretor de ritmo achou que a vida caiu rápido demais),
 * `estado.curas` sobe: um anjo desce num raio de luz, ele dá o bote, mastiga, e
 * a barra sobe enquanto ele come.
 *
 * Uso: `criarPalcoGuerra(opções)` → `{ atualizar(estado), destruir() }`. As
 * opções estão em `palcoGuerra.d.ts`.
 */
import './guerra.css';
import { assarFogo, sprites, chama as chamaF, luz as luzF, tremula as tremulaF, particula as particulaF, explosaoFogo, poda, ESCUDO } from './fogo.js';
import { CW, CH, CCHAO, CPIV, MAT, CAVALEIROS, criarDestino, construirCavalo, cabecaDo, pontaDaCabeca, noCavalo, naGrade, tipoDoAcerto } from './cavaloDaGuerra.js';
import { ATRIBUTO_ALVO, alvos, blocoDe, nomeDe, criarEfeitos } from './alvos.js';
import { cavalosDeFogo } from './cavaloDeFogo.js';
import { DANO, GUERRA } from './regras';
import { criarSomGuerra } from './som.js';

const PX = 3, T2 = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const entre = (a, b) => a + Math.random() * (b - a);
const sorteio = a => a[Math.floor(Math.random() * a.length)];
const suave = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const R = (x, c, X, Y, w, h) => { x.fillStyle = c; x.fillRect(X, Y, w, h); };
function bola(x, c, cx, cy, r) { cx = Math.round(cx); cy = Math.round(cy); r = Math.max(0, Math.round(r)); for (let y = -r; y <= r; y++) { const w = Math.floor(Math.sqrt(Math.max(0, r * r - y * y)) + 0.4); R(x, c, cx - w, cy + y, 2 * w + 1, 1); } }
function elip(x, c, cx, cy, rx, ry) { cx = Math.round(cx); cy = Math.round(cy); for (let y = -Math.round(ry); y <= Math.round(ry); y++) { const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y / Math.max(ry, 0.5)) ** 2))); if (w > 0) R(x, c, cx - w, cy + y, 2 * w + 1, 1); } }
function tela(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.imageSmoothingEnabled = false; return [c, x]; }
const [rasc, rascX] = tela(256, 256);
function tingido(img, cor, a) {
  rascX.clearRect(0, 0, 256, 256); rascX.globalCompositeOperation = 'source-over'; rascX.globalAlpha = 1; rascX.drawImage(img, 0, 0);
  rascX.globalCompositeOperation = 'source-atop'; rascX.globalAlpha = a; rascX.fillStyle = cor; rascX.fillRect(0, 0, img.width, img.height);
  rascX.globalCompositeOperation = 'source-over'; rascX.globalAlpha = 1; return rasc;
}
const TINGIDOS = new Map();
function tingidoFixo(img, cor, a) {
  let m = TINGIDOS.get(img); if (!m) TINGIDOS.set(img, m = new Map());
  const k = cor + a; let cv = m.get(k);
  if (!cv) { const [cc, cx] = tela(img.width, img.height); cx.drawImage(tingido(img, cor, a), 0, 0, img.width, img.height, 0, 0, img.width, img.height); m.set(k, cv = cc); }
  return cv;
}
const ms = iso => (iso ? Date.parse(iso) : null);
const curto = nome => { const p = String(nome || '').trim().split(/\s+/); return p.length > 1 ? `${p[0]} ${p[1][0]}.` : p[0] || 'Alguém'; };
const mmss = s => { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

/* ---------- o estilo do que o palco põe na tela (o que ele faz com a página está em guerra.css) ---------- */
const ESTILO = `
@font-face{font-family:GxPS2P;src:url(/fonts/press-start-2p.woff2) format('woff2');font-display:swap}
@font-face{font-family:GxPixelify;src:url(/fonts/pixelify-sans.woff2) format('woff2');font-display:swap}
.gx-palco{position:fixed;inset:0;z-index:90;pointer-events:none;overflow:hidden}
.gx-palco canvas.gx-arena{position:absolute;left:0;top:0;image-rendering:pixelated}
.gx-palco canvas.gx-trincas{position:absolute;inset:0;width:100%;height:100%}
.gx-sombra{position:absolute;inset:0;opacity:0;transition:opacity 1.2s;background:radial-gradient(ellipse at 50% 62%,rgba(40,8,20,.10),rgba(22,4,12,.42))}
.gx-sombra.on{opacity:1}.gx-sombra.apocalipse{opacity:1;background:radial-gradient(ellipse at 50% 55%,rgba(30,6,20,.2),rgba(8,2,8,.65))}
.gx-flash{position:absolute;inset:0;background:#fff;opacity:0}
.gx-hud{position:absolute;left:50%;top:10px;width:min(660px,70%);transform:translateX(-50%);opacity:0;transition:opacity .5s;background:#120818e6;padding:9px 14px 8px;border-radius:12px;border:1px solid #e3161b55;box-shadow:0 10px 30px #0006;font-family:GxPixelify,system-ui,sans-serif}
.gx-hud.on{opacity:1}
.gx-hud .gx-nome{display:flex;justify-content:space-between;align-items:end;font-family:GxPS2P,monospace;font-size:12px;color:#fff;text-shadow:0 2px 0 #000;margin-bottom:6px;gap:8px}
.gx-hud .gx-furia,.gx-hud .gx-escudo{font-style:normal;visibility:hidden;color:#ff3b1f}.gx-hud .gx-escudo{color:#ffb12e}
.gx-hud.furia .gx-furia,.gx-hud.escudo .gx-escudo{visibility:visible;animation:gx-pisca .5s steps(2) infinite}
@keyframes gx-pisca{50%{opacity:.35}}
.gx-hud .gx-barra{position:relative;height:22px;background:#1a0520;border:3px solid #000;border-radius:5px;overflow:hidden;box-shadow:0 0 0 2px #e3161b66}
.gx-hud .gx-barra i{display:block;height:100%;width:100%;background:linear-gradient(#ff7a52,#b81c1c 60%,#6e0a0e);transition:width .15s}
.gx-hud.furia .gx-barra i{background:linear-gradient(#fff0a0,#ff8a1f 50%,#c4161c)}
.gx-hud.cura .gx-barra{box-shadow:0 0 0 3px #fff3b0,0 0 22px #ffe07a}
.gx-hud.escudo .gx-barra{box-shadow:0 0 0 3px #ffb12e,0 0 18px #ff8a1f}
.gx-hud .gx-barra b{position:absolute;inset:0;display:grid;place-items:center;font-family:GxPS2P,monospace;font-size:10px;color:#fff;text-shadow:0 2px 0 #000}
.gx-hud .gx-tempo{text-align:center;font-family:GxPS2P,monospace;font-size:11px;margin-top:6px;color:#fff;text-shadow:0 2px 0 #000}
.gx-titulo{position:absolute;left:0;right:0;top:16%;text-align:center;opacity:0;transition:opacity .4s}
.gx-titulo.on{opacity:1}
.gx-titulo h1{margin:0;font-family:GxPS2P,monospace;font-size:clamp(20px,3.2vw,44px);color:#e3161b;text-shadow:0 4px 0 #000,0 0 26px #ff2a0a;animation:gx-treme-tit .12s infinite}
.gx-titulo p{margin:10px 0 0;font-family:GxPixelify,system-ui,sans-serif;font-size:clamp(14px,1.5vw,20px);color:#fff;text-shadow:0 2px 0 #000,0 0 8px #000}
@keyframes gx-treme-tit{0%{transform:translate(2px,0)}50%{transform:translate(-2px,1px)}100%{transform:translate(0,-1px)}}
.gx-legenda{position:absolute;left:10%;right:10%;bottom:5%;text-align:center;font-family:GxPixelify,system-ui,sans-serif;font-size:clamp(16px,1.7vw,24px);color:#fff;text-shadow:0 2px 0 #000,0 0 10px #000;opacity:0;transition:opacity .4s}
.gx-legenda.on{opacity:1}
.gx-feed{position:absolute;right:16px;bottom:16px;display:flex;flex-direction:column-reverse;gap:6px;font-family:GxPixelify,system-ui,sans-serif;font-size:15px;color:#fff}
.gx-feed div{background:#000b;border-left:4px solid #c4161c;padding:6px 10px;border-radius:5px;transition:opacity 1s}
.gx-feed div.sai{opacity:0}
.gx-num{position:absolute;transform:translate(-50%,-50%);font-family:GxPS2P,monospace;font-size:13px;color:#fff;text-shadow:0 2px 0 #000,0 0 4px #000;animation:gx-dano .8s ease-out forwards;white-space:nowrap}
.gx-num.crit{font-size:20px;color:#ffe14a}.gx-num.cabeca{font-size:16px;color:#ffb0e0}.gx-num.fogo{font-size:17px;color:#ff8a1f}
.gx-num.sim{font-size:9px;color:#ffffffaa}.gx-num.imune{font-size:11px;color:#ffb12e}.gx-num.erra{font-size:10px;color:#bbb}.gx-num.tink{font-size:10px;color:#c8d4ff}.gx-num.cav{font-size:13px;color:#e8fff0}.gx-num.cura{font-size:18px;color:#fff3b0}
@keyframes gx-dano{to{transform:translate(-50%,-260%);opacity:0}}
.gx-rotulo{position:absolute;transform:translate(-50%,-100%);text-align:center;font-family:GxPS2P,monospace;font-size:10px;color:var(--c);text-shadow:0 2px 0 #000,0 0 8px var(--c);white-space:nowrap}
.gx-rotulo i{display:block;width:76px;height:6px;margin:5px auto 0;background:#000b;border:1px solid var(--c);border-radius:3px;overflow:hidden}
.gx-rotulo s{display:block;height:100%;width:100%;background:var(--c);transition:width .12s}
.gx-rotulo.banido{animation:gx-sobe-some .9s forwards}
@keyframes gx-sobe-some{to{transform:translate(-50%,-190%);opacity:0}}
.gx-placar{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);min-width:320px;background:#120818f0;border:1px solid #e3161b88;border-radius:14px;padding:16px 20px;color:#fff;font-family:GxPixelify,system-ui,sans-serif;box-shadow:0 20px 60px #000a;opacity:0;transition:opacity .5s}
.gx-placar.on{opacity:1}
.gx-placar h2{margin:0 0 10px;font-family:GxPS2P,monospace;font-size:16px;color:#ffd24a;text-align:center}
.gx-placar ol{list-style:none;margin:0;padding:0}
.gx-placar li{display:flex;justify-content:space-between;gap:18px;padding:5px 8px;border-radius:6px;font-size:16px}
.gx-placar li.eu{background:#ffd24a33;outline:1px solid #ffd24a}
html.gx-mira,html.gx-mira *{cursor:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Ccircle cx='16' cy='16' r='9' fill='none' stroke='%23000' stroke-width='4'/%3E%3Ccircle cx='16' cy='16' r='9' fill='none' stroke='%23ff2a12' stroke-width='2'/%3E%3Cpath d='M16 1v9M16 22v9M1 16h9M22 16h9' stroke='%23000' stroke-width='4'/%3E%3Cpath d='M16 2v8M16 22v8M2 16h8M22 16h8' stroke='%23fff' stroke-width='2'/%3E%3C/svg%3E") 16 16,crosshair!important}
html.gx-mira [data-chefona-livre],html.gx-mira [data-chefona-livre] *{cursor:auto!important}
`;

const INFO_CAV = {
  peste: { nome: 'PESTE', icone: '☣', cor: '#8aff6a', chegou: 'A Peste infectou os acordos!', banido: 'A Peste foi banida!' },
  fome: { nome: 'FOME', icone: '⚖', cor: '#cf9cff', chegou: 'A Fome comeu o dinheiro do Gestão!', banido: 'A Fome foi banida!' },
  morte: { nome: 'MORTE', icone: '☠', cor: '#8ff6ec', chegou: 'A Morte levou os acordos!', banido: 'A Morte foi banida!' },
};
const K_CAV = 0.5;   // os cavaleiros vêm na metade do tamanho (metade exata: o pixel art não deforma)
const NOMES_SIM = ['Ana Paula', 'João Marcos', 'Bia Santos', 'Carlos Eduardo', 'Duda Lima', 'Fernanda Reis', 'Gabriel Costa', 'Helena Rocha', 'Igor Nunes', 'Júlia Mendes', 'Larissa Prado', 'Marcos Vinícius'];

/**
 * Monta o palco do chefe em `o.raiz` (um div solto no body) e devolve quem o controla.
 * Ver `palcoGuerra.d.ts`.
 */
export function criarPalcoGuerra(o) {
  assarFogo();
  const leve = !!o.leve;
  const pagina = o.pagina ?? document.body;
  const ALVOS = alvos(pagina);
  let vivo = true, raf = 0, antes = performance.now(), rel = 0;
  const timers = new Set();
  const depois = (msx, fn) => { const id = setTimeout(() => { timers.delete(id); if (vivo) fn(); }, msx); timers.add(id); };
  const EF = criarEfeitos((fn, msx) => depois(msx, fn));
  const Som = criarSomGuerra(o.volume ?? 1); Som.init();

  // ---- a tela
  if (!document.getElementById('gx-estilo')) { const st = document.createElement('style'); st.id = 'gx-estilo'; st.textContent = ESTILO; document.head.appendChild(st); }
  const raiz = o.raiz; raiz.classList.add('gx-palco');
  raiz.innerHTML = `<div class="gx-sombra"></div><canvas class="gx-trincas"></canvas><canvas class="gx-arena"></canvas><div class="gx-flash"></div>
    <div class="gx-hud"><div class="gx-nome"><span></span><span><i class="gx-escudo">ESCUDO DE FOGO</i> <i class="gx-furia">FÚRIA</i></span></div><div class="gx-barra"><i></i><b></b></div><div class="gx-tempo"></div></div>
    <div class="gx-titulo"><h1>O CAVALO DA GUERRA</h1><p></p></div><div class="gx-legenda"></div><div class="gx-feed"></div><div class="gx-nums"></div><div class="gx-cavs"></div>
    <div class="gx-placar"><h2></h2><ol></ol></div>`;
  const $ = s => raiz.querySelector(s);
  const arena = $('.gx-arena'), ax = arena.getContext('2d'), trincas = $('.gx-trincas'), tx = trincas.getContext('2d');
  let AW = 0, AH = 0, DPR = 1;
  function medir() {
    AW = Math.ceil(innerWidth / PX); AH = Math.ceil(innerHeight / PX);
    arena.width = AW; arena.height = AH; arena.style.width = AW * PX + 'px'; arena.style.height = AH * PX + 'px'; ax.imageSmoothingEnabled = false;
    DPR = devicePixelRatio || 1; trincas.width = Math.round(innerWidth * DPR); trincas.height = Math.round(innerHeight * DPR);
  }
  medir(); addEventListener('resize', medir);
  const yMinChefe = () => clamp(Math.round(AH * 0.5), 112, AH - 6);
  const naArena = el => { const r = el.getBoundingClientRect(); return { x: r.left / PX, y: r.top / PX, w: r.width / PX, h: r.height / PX }; };
  const legenda = (txt, msx = 0) => { const l = $('.gx-legenda'); clearTimeout(legenda.t); if (!txt) { l.classList.remove('on'); return; } l.textContent = txt; l.classList.add('on'); if (msx) legenda.t = setTimeout(() => l.classList.remove('on'), msx); };
  const feed = txt => { const box = $('.gx-feed'), el = document.createElement('div'); el.textContent = txt; box.prepend(el); while (box.children.length > 4) box.lastChild.remove(); depois(4200, () => el.classList.add('sai')); depois(5300, () => el.remove()); };
  const numero = (xA, yA, txt, cls = '') => { const box = $('.gx-nums'); if (box.children.length > 50) box.firstChild.remove(); const el = document.createElement('span'); el.className = 'gx-num ' + cls; el.textContent = txt; el.style.left = xA * PX + 'px'; el.style.top = yA * PX + 'px'; box.appendChild(el); depois(820, () => el.remove()); };
  const flashPag = (a = 1) => { const f = $('.gx-flash'); f.style.transition = 'none'; f.style.opacity = leve ? a * 0.5 : a; void f.offsetWidth; f.style.transition = 'opacity .5s'; f.style.opacity = 0; };
  const tremerPagina = () => { if (leve) return; pagina.classList.remove('gx-treme'); void pagina.offsetWidth; pagina.classList.add('gx-treme'); depois(520, () => pagina.classList.remove('gx-treme')); P.shake = Math.max(P.shake, 5); };
  const HUD_ANT = {};
  const hudTexto = (sel, v, larg = false) => { if (HUD_ANT[sel] === v) return; HUD_ANT[sel] = v; const el = $(sel); if (larg) el.style.width = v; else el.textContent = v; };
  const chama = (ctx, x, y, tier, off = 0, v = 0, pal = 'fogo') => chamaF(ctx, x, y, tier, rel, off, v, pal);
  const tremula = s => tremulaF(rel, s);
  const luz = (ctx, x, y, k, a, somar = false, pal = 'fogo') => { if (!leve) luzF(ctx, x, y, k, a, somar, pal); };
  const particula = (ctx, p) => particulaF(ctx, p, rel, 0);

  // ---- o estado
  let E = o.estado;
  const P = { parts: [], chamas: [], cavalosFogo: [], bolas: [], cacos: [], flashes: [], ondas: [], marcas: [], luzes: [], cavaleiros: [], espada: null, shake: 0, marcasMudou: true };
  const B = { x: AW / 2, y: Math.min(AH - 6, Math.round(AH * 0.7)), dir: 1, modo: 'parado', p: 0, by: 0, cab: 0, jaw: 0, rot: 0, flash: 0, furia: 0, escudo: false, atordoado: 0, acao: null, prox: 3, feridas: [], visivel: true, alvo: null, invocou: 0, cavaleiros: 0, rastro: null };
  let fase = 'entrada', faseT = 0, curasVistas = E.curas ?? 0, vidaTela = Number(E.vida ?? E.vida_max ?? 1), vidaSegura = null;
  const lote = { dano: 0, acertos: 0, bolas: 0, banidos: 0 };
  let minhaParte = 0;   // o que eu tirei desde o último estado (para saber quanto foi dos outros)
  const vidaMax = () => Number(E.vida_max || 1);

  // ---- o chefe: o quadro só é refeito quando algo que aparece muda
  const DEST = criarDestino(), bG = DEST.g;
  let chaveChefe = '', ultChefe = 0;
  function imagemChefe() {
    const tq = Math.floor(rel * 12) / 12, pq = Math.floor(B.p * 8) / 8, fq = Math.round(B.flash * 4) / 4;
    const k = B.modo + '|' + pq + '|' + tq + '|' + Math.round(B.jaw * 8) + '|' + Math.round(B.cab * 12) + '|' + Math.round(B.by) + '|' + (B.furia > 0.4 ? 1 : 0) + '|' + fq + '|' + B.feridas.length + '|' + B.dir;
    const agora = performance.now();
    if (k !== chaveChefe && (agora - ultChefe > (leve ? 80 : 32) || !chaveChefe)) { chaveChefe = k; ultChefe = agora; construirCavalo({ t: tq, by: B.by, p: pq, modo: B.modo, jaw: B.jaw, cab: B.cab, feridas: B.feridas, furia: B.furia, flash: fq, num: o.numero ?? '', espelho: B.dir < 0 }, CAVALEIROS.guerra, DEST); }
    return DEST.cv;
  }
  function desenharChefe() {
    const img = imagemChefe();
    ax.save(); ax.translate(Math.round(B.x), Math.round(B.y)); ax.scale(B.dir, 1); ax.translate(CPIV, 0); ax.rotate(B.rot); ax.translate(-CPIV, 0);
    ax.drawImage(img, 0, 0, CW, CH, -CW / 2, -CCHAO, CW, CH); ax.restore();
  }
  const noChefe = (gx, gy) => noCavalo(B, gx, gy);
  const QUADROS_CAV = { peste: [], fome: [], morte: [] };
  function quadroCavaleiro(nome, i) { const q = QUADROS_CAV[nome]; if (!q[i]) { const d = criarDestino(); construirCavalo({ t: i / 8, modo: 'galope', p: i / 8 }, CAVALEIROS[nome], d); q[i] = d.cv; } return q[i]; }
  function aquecerCavaleiros() { for (const nome in QUADROS_CAV) for (let i = 0; i < 8; i++) if (!QUADROS_CAV[nome][i]) { quadroCavaleiro(nome, i); return; } }
  const FOGO_Q = cavalosDeFogo();

  /* ---------- a entrada: a janela da corrida estoura ---------- */
  function estilhar() {
    const j = o.janela;
    if (j?.rect) {
      const r = { x: j.rect.left / PX, y: j.rect.top / PX, w: j.rect.width / PX, h: j.rect.height / PX };
      if (j.canvas) {
        const W = j.canvas.width, H = j.canvas.height, s = r.w / W, [foto, fx] = tela(W, H);
        try { fx.drawImage(j.canvas, 0, 0); } catch { /* sem a foto da pista, os cacos saem vazios */ }
        const cols = 7, lins = 4;
        for (let i = 0; i < cols; i++) for (let k = 0; k < lins; k++) for (let m = 0; m < 2; m++) {
          const x0 = i * W / cols, y0 = k * H / lins, x1 = x0 + W / cols, y1 = y0 + H / lins, jx = entre(-8, 8), jy = entre(-8, 8);
          const pts = m ? [[x0, y0], [x1 + jx, y0], [x0, y1 + jy]] : [[x1 + jx, y0], [x1, y1], [x0, y1 + jy]];
          const cx = (pts[0][0] + pts[1][0] + pts[2][0]) / 3, cy = (pts[0][1] + pts[1][1] + pts[2][1]) / 3, dx = cx - W / 2, dy = cy - H / 2, d = Math.hypot(dx, dy) || 1;
          P.cacos.push({ pts, cx, cy, x: r.x + cx * s, y: r.y + cy * s, vx: dx / d * entre(60, 160), vy: dy / d * entre(40, 120) - 60, rot: 0, vr: entre(-4, 4), vida: entre(1.2, 2), s, foto });
        }
      }
      B.x = r.x + r.w / 2; B.y = clamp(r.y + r.h - 4, yMinChefe(), AH - 6);
    }
    B.jaw = 1; $('.gx-sombra').classList.add('on');
    flashPag(0.9); tremerPagina(); Som.vidro(); Som.crash(); Som.relinchoChefe(2.2);
    P.ondas.push({ x: B.x, y: B.y, t: 0, r: 2, fogo: true });
    explosaoFogo(P.parts, B.x, B.y - 60, leve ? 1 : 2.2);
    $('.gx-titulo').classList.add('on');
    $('.gx-titulo p').textContent = `O segundo cavaleiro do Apocalipse. Era o #${o.numero ?? '?'}${o.dono ? `, de ${o.dono}` : ''} — agora ele quer o Gestão inteiro.`;
  }

  /* ---------- trincas e furos ---------- */
  function novaTrinca(x, y, tam) {
    const segs = [], raios = 9 + Math.floor(Math.random() * 5), pontas = [];
    for (let k = 0; k < raios; k++) {
      let a = k / raios * T2 + entre(-0.2, 0.2), px = x, py = y; const L = tam * entre(0.55, 1.1), pts = [[x, y]];
      for (let d = 0; d < L;) { const st = entre(8, 18); d += st; a += entre(-0.25, 0.25); px += Math.cos(a) * st; py += Math.sin(a) * st; pts.push([px, py]); }
      pontas.push(pts);
      for (let i = 0; i < pts.length - 1; i++) segs.push([...pts[i], ...pts[i + 1], Math.max(0.6, 2 - i * 0.25)]);
    }
    for (let r = 1; r <= 3; r++) for (let k = 0; k < raios; k++) { const A = pontas[k], Bp = pontas[(k + 1) % raios]; if (A.length > r && Bp.length > r && Math.random() < 0.75) segs.push([...A[r], ...Bp[r], 0.9]); }
    P.marcas.push({ tipo: 'trinca', segs, x, y, t: 0, vida: 14 }); P.marcasMudou = true;
  }
  const marcarFuro = (x, y) => { P.marcas.push({ tipo: 'furo', x, y, t: 0, vida: 7 }); if (P.marcas.length > 160) P.marcas.shift(); P.marcasMudou = true; };
  let marcasNaTela = false, marcasAcc = 0;
  function desenharMarcas(dt) {
    const L = P.marcas; for (const m of L) m.t += dt; poda(L, m => m.t < m.vida); marcasAcc += dt;
    if (!L.length) { if (marcasNaTela) { tx.setTransform(1, 0, 0, 1, 0, 0); tx.clearRect(0, 0, trincas.width, trincas.height); marcasNaTela = false; } return; }
    if (!P.marcasMudou && marcasAcc < 0.05) return;
    marcasAcc = 0; P.marcasMudou = false; marcasNaTela = true;
    tx.setTransform(DPR, 0, 0, DPR, 0, 0); tx.clearRect(0, 0, trincas.width, trincas.height);
    for (const m of L) {
      const a = clamp((m.vida - m.t) / 2, 0, 1);
      if (m.tipo === 'furo') { tx.fillStyle = `rgba(255,255,255,${0.7 * a})`; tx.beginPath(); tx.arc(m.x, m.y, 5, 0, T2); tx.fill(); tx.fillStyle = `rgba(20,20,24,${a})`; tx.beginPath(); tx.arc(m.x, m.y, 3.2, 0, T2); tx.fill(); continue; }
      tx.lineCap = 'round';
      for (const [x0, y0, x1, y1, w] of m.segs) { tx.strokeStyle = `rgba(0,0,0,${0.45 * a})`; tx.lineWidth = w + 1.6; tx.beginPath(); tx.moveTo(x0 + 1, y0 + 1); tx.lineTo(x1 + 1, y1 + 1); tx.stroke(); }
      for (const [x0, y0, x1, y1, w] of m.segs) { tx.strokeStyle = `rgba(255,255,255,${0.95 * a})`; tx.lineWidth = w; tx.beginPath(); tx.moveTo(x0, y0); tx.lineTo(x1, y1); tx.stroke(); }
      const g = tx.createRadialGradient(m.x, m.y, 0, m.x, m.y, 22); g.addColorStop(0, `rgba(255,255,255,${0.85 * a})`); g.addColorStop(1, 'rgba(255,255,255,0)'); tx.fillStyle = g; tx.beginPath(); tx.arc(m.x, m.y, 22, 0, T2); tx.fill();
    }
  }

  /* ---------- o que ele faz com o Gestão (tudo volta sozinho) ---------- */
  function impactoCabecada(el, xA, yA) {
    const yC = yA * PX, bloco = blocoDe(el), tipo = el.getAttribute(ATRIBUTO_ALVO), nome = nomeDe(el);
    novaTrinca(xA * PX, yC, 110); tremerPagina(); flashPag(0.25); Som.crash(); Som.vidro();
    EF.aplicar(bloco, { classes: ['gx-quebrado'], vars: { '--gx-rot': `${entre(-9, 9).toFixed(1)}deg`, '--gx-dx': `${entre(-14, 14).toFixed(0)}px`, '--gx-dy': `${entre(4, 16).toFixed(0)}px` } }, 12000);
    if (tipo === 'valor') EF.aplicar(el, { classes: ['gx-pifou'], texto: (el.textContent || '').replace(/[0-9]/g, () => sorteio(['▒', '#', '?', '█'])) }, 12000);
    if (tipo === 'aba') for (const a of ALVOS.abas()) {
      if (a === el) continue; const r = a.getBoundingClientRect(), d = Math.abs(r.top + r.height / 2 - yC);
      if (d < 110) EF.aplicar(a, { classes: ['gx-caiu'], vars: { '--gx-rot': `${entre(-40, 40).toFixed(0)}deg`, '--gx-dx': `${entre(-20, 30).toFixed(0)}px`, '--gx-dy': `${entre(40, 120).toFixed(0)}px` } }, 12000 + d * 10);
    }
    for (let k = 0; k < (leve ? 12 : 30); k++) P.parts.push({ x: xA, y: yA, vx: entre(-110, 110), vy: entre(-140, -20), g: 260, vida: entre(0.5, 1.1), max: 1.1, cor: sorteio(['#ffffff', '#dbe2ea', '#f3f6f9', '#c9d8e6']), tam: Math.random() < 0.4 ? 2 : 1 });
    feed(`💥 Cabeçada em “${nome}”!`);
  }
  function chamuscar(xA, yA) {
    for (const el of document.elementsFromPoint(xA * PX, yA * PX)) {
      if (raiz.contains(el)) continue;
      const alvo = el.closest(`[${ATRIBUTO_ALVO}], [data-bloco-feitico]`); if (!alvo || !pagina.contains(alvo)) continue;
      const b = blocoDe(alvo); if (!EF.tem(b, 'gx-chamuscado')) EF.aplicar(b, { classes: ['gx-chamuscado'] }, 10000);
      break;
    }
  }
  const PENDENTES = new WeakSet();
  function queimarLinha(tr, atraso) {
    if (PENDENTES.has(tr) || EF.tem(tr, 'gx-queimando') || EF.tem(tr, 'gx-cinza')) return false;
    PENDENTES.add(tr);
    depois(atraso, () => {
      PENDENTES.delete(tr); if (!tr.isConnected) return;
      EF.aplicar(tr, { classes: ['gx-queimando'] }, 0); Som.labareda();
      const r = naArena(tr); for (let x = r.x + 4; x < r.x + r.w; x += leve ? 16 : 9) { const vd = entre(1.3, 2); P.chamas.push({ x: x + entre(-3, 3), y: r.y + r.h - 1, vida: vd, max: vd, tier: sorteio([1, 2, 2, 3]), off: Math.random() * 8, v: Math.random() < 0.5 ? 1 : 0 }); }
      depois(1300, () => { EF.desfazer(tr, false); EF.aplicar(tr, { classes: ['gx-cinza'] }, 14000); });
    });
    return true;
  }

  /* ---------- os cavalos de fogo ---------- */
  function invocarCavalosFogo() {
    const n = clamp(4 + Math.round((o.sims ?? 6) / 3), 4, leve ? 6 : 10);
    for (let k = 0; k < n; k++) {
      const x = entre(40, AW - 40), y = entre(Math.max(50, AH * 0.25), AH - 6);
      P.cavalosFogo.push({ x, y, dir: sorteio([-1, 1]), v: entre(60, 95), fg: Math.random(), vida: 22, nasce: 0.5 + k * 0.12, alvoY: y, morto: false, sobe: 0, off: Math.random() * 6, passo: 0, pe: 1 });
    }
    B.escudo = true; Som.escudo();
    legenda('Ele invocou cavalos de fogo! ATIREM NELES — cada um que cai fere o chefe.', 5000);
    feed(`🔥 ${n} cavalos de fogo soltos na página`);
  }
  function estourarCavaloFogo(f, quem) {
    if (f.morto) return; f.morto = true;
    explosaoFogo(P.parts, f.x, f.y - 12, leve ? 0.7 : 1.2); P.luzes.push({ x: f.x, y: f.y - 16, k: 3, t: 0, dur: 0.45 });
    Som.estouro();
    if (quem && fase === 'luta') { const [bx, by2] = noChefe(108, 72); P.bolas.push({ x0: f.x, y0: f.y - 16, x1: bx, y1: by2, t: 0, dur: entre(0.5, 0.75), quem, tipo: 'bola' }); }
  }
  function quebrarEscudo() {
    B.escudo = false; B.atordoado = 4.5;
    P.ondas.push({ x: B.x, y: B.y - 60, t: 0, r: 2.4, fogo: true }); flashPag(0.4); Som.vidro(); Som.explosao(1.2);
    for (let k = 0; k < 18; k++) { const a = k / 18 * T2; P.parts.push({ x: B.x + Math.cos(a) * 84, y: B.y - 64 + Math.sin(a) * 70, vx: Math.cos(a) * 70, vy: Math.sin(a) * 55, g: 0, vida: 0.6, max: 0.6, cor: 'bola', tam: 2, cresce: 2, v: k & 1 }); }
    P.luzes.push({ x: B.x, y: B.y - 64, k: 5, t: 0, dur: 0.6 });
    legenda('ESCUDO QUEBRADO! Ele está tonto — atirem, o dano dobra!', 4000);
  }
  function acenderPortal(f) {
    Som.labareda();
    for (let k = 0; k < 14; k++) { const a = k / 14 * T2; P.chamas.push({ x: f.x + Math.cos(a) * 20, y: f.y + Math.sin(a) * 5, vida: entre(0.6, 0.9), max: 0.9, tier: k % 3 ? 1 : 2, off: k * 1.7, v: k & 1 }); }
    for (let k = 0; k < 6; k++) P.parts.push({ x: f.x + entre(-8, 8), y: f.y - 2, vx: entre(-10, 10), vy: entre(-80, -40), g: 0, vida: 0.6, max: 0.6, cor: 'bola', tam: 2, cresce: 2, v: k & 1 });
  }

  /* ---------- os Quatro Cavaleiros ---------- */
  function chamarCavaleiros() {
    const dir = B.x < AW / 2 ? 1 : -1, y0 = Math.max(112, Math.round(AH * 0.42)), y1 = AH - 8;
    ['peste', 'fome', 'morte'].forEach((nome, k) => {
      const info = INFO_CAV[nome], el = document.createElement('div'); el.className = 'gx-rotulo'; el.style.setProperty('--c', info.cor);
      el.innerHTML = `<b>${info.icone} ${info.nome}</b><i><s></s></i>`; $('.gx-cavs').appendChild(el);
      const hp = 14 + Math.round((o.sims ?? 6) / 2);
      P.cavaleiros.push({ nome, x: dir > 0 ? -50 - k * 45 : AW + 50 + k * 45, y: Math.round(lerp(y0, y1, k / 2)), dir, v: entre(88, 104), fg: Math.random(), hp, hpMax: hp, flash: 0, ecos: [], eco: 0, el, barra: el.querySelector('s'), fim: false });
    });
    Som.trombeta();
  }
  function acertarCavaleiro(c2, quem, sim = false) {
    if (c2.fim) return; c2.hp--; c2.flash = 1;
    if (!sim) { numero(c2.x, c2.y - 48, '−1', 'cav'); Som.acerto(); }
    if (c2.hp <= 0) banirCavaleiro(c2, quem);
  }
  function banirCavaleiro(c2, quem) {
    c2.fim = true; const info = INFO_CAV[c2.nome];
    explosaoFogo(P.parts, c2.x, c2.y - 30, leve ? 0.8 : 1.6, c2.nome); P.luzes.push({ x: c2.x, y: c2.y - 30, k: 4, t: 0, dur: 0.6, pal: c2.nome });
    Som.banido(); legenda(`${info.icone} ${info.banido}`, 2500); feed(`${info.icone} ${info.banido} (último tiro: ${quem === 'Você' ? 'você' : curto(quem)})`);
    if (fase === 'luta') { const [bx, by2] = noChefe(108, 72); P.bolas.push({ x0: c2.x, y0: c2.y - 30, x1: bx, y1: by2, t: 0, dur: 0.8, quem, tipo: 'banido', pal: c2.nome }); }
    c2.el.classList.add('banido'); const el = c2.el; depois(900, () => el.remove());
  }
  function maldicao(nome) {
    const info = INFO_CAV[nome]; legenda(`${info.icone} ${info.chegou}`, 3500); feed(`${info.icone} ${info.chegou} (volta em ~12 s)`); Som.maldicao(nome);
    if (nome === 'peste') ALVOS.linhas().forEach((tr, i) => depois(i * 120, () => EF.aplicar(tr, { classes: ['gx-peste'] }, 11000)));
    if (nome === 'morte') ALVOS.linhas().filter(() => Math.random() < 0.65).reverse().forEach((tr, i) => depois(i * 140, () => EF.aplicar(tr, { classes: ['gx-morte'] }, 12000)));
    if (nome === 'fome') for (const el of ALVOS.valores()) {
      const orig = (el.textContent || '').trim(), dinheiro = orig.includes('R$'), n = Number(orig.replace(/[^\d,]/g, '').replace(',', '.')) || 0;
      const fmt = v => (dinheiro ? 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : String(Math.round(v)));
      EF.aplicar(el, { classes: ['gx-fome'], texto: orig }, 12000);
      for (let k = 1; k <= 16; k++) depois(k * 90, () => EF.trocarTexto(el, fmt(k === 16 ? 0 : n * (1 - k / 16))));
    }
  }

  /* ---------- o anjo: desce, ele dá o bote e come (a cura do banco) ---------- */
  function chamarAnjo(vidaAntes) {
    const ladoX = B.x + B.dir * 70;
    B.acao = { tipo: 'anjo', t: 0, f: 'desce', feito: {}, ax: clamp(ladoX, 30, AW - 30), ay0: -40, ay1: B.y - 92, vidaAntes };
    vidaSegura = vidaAntes;   // a barra fica parada até ele engolir
    Som.coro(); legenda('😇 Um anjo desceu… e ele está com fome.', 3200);
  }
  /** O anjo em pixel art: túnica branca, cabelo dourado, auréola e as asas batendo. */
  function desenharAnjo(x, y, t, inteiro = 1) {
    x = Math.round(x); y = Math.round(y);
    const bate = Math.sin(t * 14) > 0;
    luz(ax, x, y, 3, 0.6 * inteiro);
    // as asas
    for (const s of [-1, 1]) {
      const wx = x + s * 4, top = bate ? y - 14 : y - 9;
      for (let k = 0; k < 6; k++) { R(ax, k < 2 ? '#ffffff' : k < 4 ? '#eef2ff' : '#c8d0e8', wx + s * k * 2, top + k * 2 + (bate ? 0 : k), 3, 6 - (k >> 1)); }
    }
    // a túnica e o corpo
    R(ax, '#f4f2ea', x - 3, y - 4, 7, 12); R(ax, '#ffffff', x - 3, y - 4, 2, 12); R(ax, '#d8d4c8', x + 2, y - 4, 2, 12); R(ax, '#e8c25a', x - 3, y + 1, 7, 1);
    R(ax, '#f4f2ea', x - 4, y + 6, 9, 3); R(ax, '#d8d4c8', x - 4, y + 8, 9, 1);
    // a cabeça, o cabelo e o rostinho em paz
    R(ax, '#f6d2b0', x - 2, y - 9, 5, 5); R(ax, '#f0c040', x - 3, y - 10, 7, 2); R(ax, '#f0c040', x - 3, y - 9, 1, 4); R(ax, '#f0c040', x + 3, y - 9, 1, 4);
    R(ax, '#8a6a50', x - 1, y - 7, 1, 1); R(ax, '#8a6a50', x + 1, y - 7, 1, 1); R(ax, '#e08a80', x, y - 5, 1, 1);
    // a auréola
    const hy = y - 13 + Math.round(Math.sin(t * 3));
    R(ax, '#fff3a0', x - 3, hy, 7, 1); R(ax, '#ffd24a', x - 4, hy + 1, 1, 1); R(ax, '#ffd24a', x + 4, hy + 1, 1, 1); R(ax, '#ffd24a', x - 3, hy + 2, 7, 1);
  }
  /** A auréola caindo, depois que ele come (um pedacinho só). */
  function desenharAureola(a) { const x = Math.round(a.x), y = Math.round(a.y); ax.save(); ax.globalAlpha = clamp(a.vida, 0, 1); R(ax, '#fff3a0', x - 3, y, 7, 1); R(ax, '#ffd24a', x - 4, y + 1, 1, 1); R(ax, '#ffd24a', x + 4, y + 1, 1, 1); R(ax, '#ffd24a', x - 3, y + 2, 7, 1); ax.restore(); }

  /* ---------- o chefe na luta ---------- */
  function escolherAcao(frac) {
    let tipo;
    if (frac < 0.55 && B.cavaleiros < 1) tipo = 'cavaleiros';
    else if ((frac < 0.78 && B.invocou < 1) || (frac < 0.3 && B.invocou < 2)) tipo = 'invocar';
    else {
      const ops = ['cabecada', 'cabecada', 'investida']; if (ALVOS.linhas().length) ops.push('sopro');
      if (B.furia > 0.5 && !B.escudo) ops.push('invocar'); if (B.furia > 0.5 && !P.cavaleiros.length) ops.push('cavaleiros');
      tipo = sorteio(ops);
    }
    iniciarAcao(tipo);
  }
  function iniciarAcao(tipo) {
    if (tipo === 'cabecada') {
      const cand = [...ALVOS.valores(), ...ALVOS.abas()].filter(el => !EF.tem(blocoDe(el), 'gx-quebrado') && !EF.tem(el, 'gx-caiu'));
      if (!cand.length) tipo = 'investida';
      else {
        const el = sorteio(cand), r = naArena(blocoDe(el)), T = { x: r.x + r.w / 2, y: r.y + r.h / 2 }, dir = T.x >= B.x ? 1 : -1;
        const yp = clamp(T.y + 84, 100, AH - 4), cab = clamp((96 - (yp - T.y)) / 25, 0, 1), [gx] = pontaDaCabeca(cab);
        B.acao = { tipo, t: 0, f: 'prepara', feito: {}, el, T, dir, cab, px: T.x - dir * (gx - CW / 2), py: yp };
        return;
      }
    }
    if (tipo === 'sopro') {
      const ls = ALVOS.linhas();
      if (!ls.length) tipo = 'investida';
      else {
        const r0 = naArena(ls[0]), r1 = naArena(ls[ls.length - 1]), tb = { x: r0.x, y: r0.y, w: r0.w, h: r1.y + r1.h - r0.y };
        const lado = B.x < tb.x + tb.w / 2 ? -1 : 1, px = lado < 0 ? Math.max(70, tb.x + 30) : Math.min(AW - 70, tb.x + tb.w - 30);
        B.acao = { tipo, t: 0, f: 'prepara', feito: {}, dir: -lado, px, py: clamp(tb.y + tb.h * 0.55 + 92, yMinChefe(), AH - 6) };
        return;
      }
    }
    B.acao = { tipo, t: 0, f: 'prepara', feito: {} };
    if (tipo === 'investida') Object.assign(B.acao, { dir: B.x < AW / 2 ? 1 : -1, yl: entre(yMinChefe(), AH - 6) });
  }
  function fimAcao() { B.acao = null; B.rot = 0; B.modo = 'anda'; B.prox = B.furia > 0.5 ? entre(2, 3.4) : entre(3.5, 5.5); }
  function rastro(passo, forte = false) {
    const a = B.rastro ??= { dist: 0, n: 0 }, esp = leve ? 13 : 7; a.dist += passo;
    while (a.dist > esp) {
      a.dist -= esp; a.n++;
      const vd = forte ? entre(3.5, 5.5) : 2.2;
      P.chamas.push({ x: B.x - B.dir * entre(10, 40), y: B.y + entre(-3, 2), vida: vd, max: vd, tier: forte ? sorteio([2, 3, 3, 4]) : 1, off: Math.random() * 8, v: Math.random() < 0.5 ? 1 : 0 });
      if (forte && a.n % 3 === 0) chamuscar(B.x - B.dir * 24, B.y - 4);
    }
  }
  function acaoChefe(dt) {
    const a = B.acao; a.t += dt; const t = a.t, uma = k => { if (a.feito[k]) return false; a.feito[k] = true; return true; };
    const galopar = (px, py, v) => { const dx = px - B.x, dy = py - B.y, d = Math.hypot(dx, dy); if (d < 3) return true; B.modo = 'galope'; B.p += dt * 3.2; B.x += dx / d * Math.min(d, v * dt); B.y += dy / d * Math.min(d, v * dt); B.dir = Math.abs(dx) > 2 ? Math.sign(dx) : B.dir; B.by = Math.round(-Math.sin(B.p * T2) * 1.5); if (B.furia > 0.4) rastro(dt * v); return false; };
    if (a.tipo === 'cabecada') {
      if (a.f === 'prepara') { B.modo = 'parado'; B.dir = Math.sign(a.T.x - B.x) || B.dir; B.rot = -0.12 * Math.sin(Math.min(1, t / 0.5) * Math.PI); if (uma('bufa')) Som.relinchoChefe(0.9); if (t > 0.55) { a.f = 'corre'; a.t = 0; } }
      else if (a.f === 'corre') { B.cab = Math.min(a.cab * 0.4, B.cab + dt); if (galopar(a.px - a.dir * 10, a.py, 230) || t > 3) { a.f = 'golpe'; a.t = 0; B.dir = a.dir; } }
      else if (a.f === 'golpe') {
        B.modo = 'parado'; B.by = 0; const u = clamp(t / 0.14, 0, 1); B.cab = lerp(a.cab * 0.4, a.cab, u); B.x += a.dir * 70 * dt * (u < 1 ? 1 : 0);
        if (u >= 1 && uma('pow') && a.el.isConnected) { const [gx, gy] = pontaDaCabeca(B.cab), [hx, hy] = noChefe(gx, gy); impactoCabecada(a.el, hx, hy); }
        if (t > 0.3) { a.f = 'volta'; a.t = 0; }
      } else { B.cab = Math.max(0, B.cab - dt * 2); B.x -= a.dir * 30 * dt; B.modo = 'anda'; B.p -= dt; if (t > 0.6) fimAcao(); }
    } else if (a.tipo === 'investida') {
      if (a.f === 'prepara') {
        B.modo = 'empina'; B.dir = a.dir; B.rot = -0.42 * Math.sin(Math.min(1, t / 0.8) * Math.PI); B.jaw = Math.min(1, t * 3);
        if (uma('r')) { Som.relinchoChefe(1.2); legenda('🔥 Ele vai disparar pela página!', 1800); }
        if (t > 0.85) { a.f = 'corre'; a.t = 0; B.rot = 0; Som.labareda(); }
      } else if (a.f === 'corre') {
        B.modo = 'galope'; B.p += dt * 3.6; B.dir = a.dir; B.jaw = 0.5; const v = 250;
        B.x += a.dir * v * dt; B.y += clamp(a.yl - B.y, -70 * dt, 70 * dt); B.by = Math.round(-Math.sin(B.p * T2) * 1.6);
        rastro(v * dt, true); if (!leve) P.shake = Math.max(P.shake, 1.5);
        if (B.x < -90 || B.x > AW + 90) { a.f = 'fora'; a.t = 0; }
      } else if (a.f === 'fora') { if (t > 0.6) { a.f = 'volta'; a.t = 0; B.dir = -a.dir; B.y = entre(yMinChefe(), AH - 6); } }
      else { if (galopar(a.dir > 0 ? AW - 100 : 100, B.y, 170) || t > 2.5) fimAcao(); }
    } else if (a.tipo === 'sopro') {
      if (a.f === 'prepara') { if (galopar(a.px, a.py, 200) || t > 3) { a.f = 'mira'; a.t = 0; B.dir = a.dir; B.modo = 'parado'; } }
      else if (a.f === 'mira') { B.cab = Math.min(0.15, B.cab + dt); B.jaw = Math.min(1, t * 3); B.rot = -0.08 * Math.min(1, t / 0.3); if (uma('r')) Som.relinchoChefe(0.8); if (t > 0.45) { a.f = 'sopra'; a.t = 0; Som.fogo(1.9); legenda('🔥 Ele está queimando os acordos!', 2200); } }
      else if (a.f === 'sopra') {
        B.jaw = 1; B.rot = -0.08;
        const [gx, gy] = cabecaDo(B).pt(23, 5.5), [mx, my] = noChefe(gx, gy);
        a.boca = [mx, my];
        for (let k = 0; k < (leve ? 3 : 7); k++) { const an = entre(-0.3, 0.3) + 0.2, v = entre(150, 260); P.parts.push({ x: mx + B.dir * 4, y: my, vx: B.dir * Math.cos(an) * v, vy: Math.sin(an) * v, g: -30, vida: entre(0.5, 0.85), max: 0.85, cor: 'bola', tam: k < 2 ? 2 : 1, cresce: 3.4, v: k & 1 }); }
        if (!leve && Math.random() < 0.5) P.parts.push({ x: mx + B.dir * 6, y: my + 4, vx: B.dir * entre(120, 180), vy: entre(-10, 30), g: -60, vida: 0.4, max: 0.4, cor: 'chama', tier: 2, off: Math.random() * 8, v: 0 });
        if (!leve) P.shake = Math.max(P.shake, 1);
        if (uma('linhas')) {
          let n = 0; for (const tr of ALVOS.linhas()) { const r = naArena(tr), cy = r.y + r.h / 2, cx = clamp(mx + B.dir * 120, r.x, r.x + r.w), dx = (cx - mx) * B.dir, dy = cy - my; if (dx > 0 && Math.abs(Math.atan2(dy, dx) - 0.2) < 0.55 && Math.hypot(dx, dy) < 330) { if (queimarLinha(tr, Math.hypot(dx, dy) * 3.2)) n++; } }
          if (n) feed(`🔥 ${n} acordos queimados (voltam em ~15 s)`);
        }
        if (Math.random() < dt * 14) { const d = entre(40, 260), an = entre(-0.3, 0.6); chamuscar(mx + B.dir * Math.cos(an) * d, my + Math.sin(an) * d); }
        if (t > 1.9) { a.f = 'fecha'; a.t = 0; a.boca = null; }
      } else { B.jaw = Math.max(0, B.jaw - dt * 3); B.rot *= 0.8; B.cab = Math.max(0, B.cab - dt); if (t > 0.5) fimAcao(); }
    } else if (a.tipo === 'invocar') {
      B.modo = 'empina'; B.rot = -0.5 * Math.sin(Math.min(1, t / 1.6) * Math.PI); B.jaw = t < 1.2 ? 1 : Math.max(0, B.jaw - dt * 2);
      if (uma('r')) { Som.relinchoChefe(1.8); P.ondas.push({ x: B.x, y: B.y, t: 0, r: 1.6, fogo: true }); }
      if (t > 0.8 && uma('solta')) { invocarCavalosFogo(); B.invocou++; tremerPagina(); }
      if (t > 1.7) fimAcao();
    } else if (a.tipo === 'cavaleiros') {
      B.modo = 'empina'; B.rot = -0.5 * Math.sin(Math.min(1, t / 1.9) * Math.PI); B.jaw = t < 1.4 ? 1 : Math.max(0, B.jaw - dt * 2);
      if (uma('r')) {
        Som.relinchoChefe(2); $('.gx-sombra').classList.add('apocalipse'); tremerPagina();
        legenda('☠ OS QUATRO CAVALEIROS! Derrubem a Peste, a Fome e a Morte antes que cruzem a página!', 5200);
        P.ondas.push({ x: B.x, y: B.y, t: 0, r: 2.2, fogo: true }); P.luzes.push({ x: B.x, y: B.y - 70, k: 5, t: 0, dur: 1.2 });
      }
      if (t > 0.9 && uma('chama')) { chamarCavaleiros(); B.cavaleiros++; }
      if (t > 2) fimAcao();
    } else if (a.tipo === 'anjo') {
      // 1. o anjo desce num raio de luz; 2. ele vira, empina e abre a boca; 3. o bote; 4. mastiga; 5. o arroto
      if (a.f === 'desce') { B.modo = 'parado'; B.dir = Math.sign(a.ax - B.x) || B.dir; a.ay = lerp(a.ay0, a.ay1, suave(t / 1.7)); if (t > 1.7) { a.f = 'mira'; a.t = 0; } }
      else if (a.f === 'mira') { B.modo = 'empina'; B.rot = -0.18 * suave(t / 0.35); B.jaw = suave(t / 0.35); a.ay = a.ay1 + Math.sin(rel * 3) * 2; if (t > 0.4) { a.f = 'bote'; a.t = 0; } }
      else if (a.f === 'bote') {
        B.modo = 'parado'; B.rot = lerp(-0.18, 0, suave(t / 0.2)); B.cab = 0.55 * suave(t / 0.2);
        const [gx, gy] = cabecaDo(B).pt(18, 4), [bx, by2] = noChefe(gx, gy); a.ax = lerp(a.ax, bx, 0.5); a.ay = lerp(a.ay, by2, 0.5);
        if (t > 0.2 && uma('engole')) {
          a.comido = true; Som.mastiga(); flashPag(0.2);
          for (let k = 0; k < (leve ? 14 : 34); k++) P.parts.push({ x: bx, y: by2, vx: entre(-90, 90), vy: entre(-110, 10), g: 50, vida: entre(0.8, 1.6), max: 1.6, cor: sorteio(['#ffffff', '#eef2ff', '#fff3b0']), tam: Math.random() < 0.3 ? 2 : 1 });
          P.aureola = { x: bx, y: by2 - 4, vx: B.dir * 40, vy: -90, vida: 2.2, rot: 0 };
        }
        if (t > 0.35) { a.f = 'mastiga'; a.t = 0; }
      } else if (a.f === 'mastiga') {
        B.modo = 'parado'; B.cab = 0.3; B.jaw = 0.5 + 0.5 * Math.sin(t * 16);
        if (Math.sin(t * 16) > 0.95) Som.mastiga();
        const [gx, gy] = cabecaDo(B).pt(20, 5), [mx, my] = noChefe(gx, gy);
        if (Math.random() < dt * (leve ? 8 : 24)) P.parts.push({ x: mx, y: my, vx: entre(-30, 30), vy: entre(-20, 30), g: 60, vida: 0.8, max: 0.8, cor: Math.random() < 0.6 ? '#ffffff' : '#fff3b0', tam: 1 });
        // a barra sobe enquanto ele come
        if (vidaSegura != null) vidaSegura = lerp(a.vidaAntes, Number(E.vida ?? a.vidaAntes), suave(t / 1.6));
        if (t > 1.7) { a.f = 'arroto'; a.t = 0; vidaSegura = null; Som.arroto(); numero(B.x, B.y - 130, `😇 +${Math.round(E.cura_vida ?? 0)} de vida`, 'cura'); feed(`😇 Ele devorou um anjo: +${Math.round(E.cura_vida ?? 0)} de vida`); }
      } else { B.jaw = Math.max(0, 1 - t * 2); B.cab = Math.max(0, B.cab - dt); if (t > 0.6) fimAcao(); }
    }
  }

  /* ---------- os tiros ---------- */
  function contarNoLote(dano, tipo) {
    if (tipo === 'bola') lote.bolas++; else if (tipo === 'banido') lote.banidos++; else { lote.dano += dano; lote.acertos++; }
  }
  /** O dano já sai da barra desta tela (o ritmo do banco é aplicado na estimativa); o estado novo acerta a conta. */
  function tirarDaTela(bruto) { const efetivo = bruto * Number(E.ritmo ?? 1); minhaParte += efetivo; vidaTela = Math.max(0, vidaTela - efetivo); }
  function baterChefe(quem, gx, gy, cd, sim = false) {
    if (fase !== 'luta') return;
    const tipo = tipoDoAcerto(cd); if (!tipo) return;
    let dano = DANO[tipo] + (tipo === 'corpo' && Math.random() < 0.4 ? 1 : 0);
    if (B.atordoado > 0) dano *= 2;
    const [x, y] = noChefe(gx, gy);
    if (!sim) { contarNoLote(dano, 'tiro'); if (dano) tirarDaTela(dano); }
    else if (o.aoGolpearSim) o.aoGolpearSim(quem, { dano, acertos: 1, bolas: 0, banidos: 0 });
    if (!sim) {
      if (tipo === 'armadura') { Som.tink(); numero(x, y, `TINK −${dano}`, 'tink'); for (let k = 0; k < 6; k++) P.parts.push({ x, y, vx: entre(-90, 90), vy: entre(-90, 10), g: 240, vida: 0.25, max: 0.25, cor: '#fff6c4', tam: 1 }); return; }
      if (tipo === 'fogo') { numero(x, y, 'só fogo', 'erra'); return; }
      B.flash = 1; Som.acerto(); numero(x, y, tipo === 'olho' ? `NO OLHO! −${dano}` : `−${dano}`, tipo === 'olho' ? 'crit' : tipo === 'cabeca' ? 'cabeca' : '');
      for (let k = 0; k < (tipo === 'corpo' ? 5 : 9); k++) P.parts.push({ x, y, vx: entre(-60, 60), vy: entre(-90, -10), g: 260, vida: 0.6, max: 0.6, cor: sorteio(['#b3161c', '#8e0f14', '#5e080c']), tam: 1 });
    } else if (dano && Math.random() < 0.25) numero(x, y, `−${dano}`, 'sim');
    if ((tipo === 'corpo' || tipo === 'cabeca') && B.feridas.length < 50 && Math.random() < (sim ? 0.12 : 0.5)) B.feridas.push({ x: gx, y: gy - Math.round(B.by), r: entre(0.8, 1.6) });
  }
  const faisca = (x, y, erro) => { for (let k = 0; k < 3; k++) P.parts.push({ x, y, vx: entre(-40, 40), vy: entre(-50, -10), g: 200, vida: 0.18, max: 0.18, cor: erro ? '#ffffff' : '#ffe07a', tam: 1 }); };
  function atirar(px, py) {
    if (fase !== 'luta') return;
    Som.init(); Som.arma(); P.flashes.push({ x: px, y: py, t: 0 });
    for (const c2 of P.cavaleiros) if (!c2.fim && Math.abs(px - c2.x) < 40 && py > c2.y - 66 && py < c2.y + 3) { faisca(px, py, false); acertarCavaleiro(c2, 'Você'); return; }
    for (const f of P.cavalosFogo) if (!f.morto && f.nasce <= 0 && Math.abs(px - f.x) < 24 && py > f.y - 32 && py < f.y + 3) { numero(px, py, 'ACERTOU!', 'fogo'); estourarCavaloFogo(f, 'Você'); return; }
    let [gx, gy] = naGrade(B, px, py), cd = (gx >= 0 && gy >= 0 && gx < CW && gy < CH) ? bG[gy * CW + gx] : 0;
    if (!cd) for (let k = 0; k < 10 && !cd; k++) { const a2 = gx + Math.round(entre(-2, 2)), b2 = gy + Math.round(entre(-2, 2)); if (a2 >= 0 && b2 >= 0 && a2 < CW && b2 < CH && bG[b2 * CW + a2]) { cd = bG[b2 * CW + a2]; gx = a2; gy = b2; } }
    if (cd) {
      if (B.escudo) { numero(px, py, 'IMUNE — atire nos cavalos de fogo', 'imune'); Som.imune(); for (let k = 0; k < 5; k++) P.parts.push({ x: px, y: py, vx: entre(-80, 80), vy: entre(-80, 0), g: 200, vida: 0.25, max: 0.25, cor: '#ffb12e', tam: 1 }); return; }
      baterChefe('Você', gx, gy, cd); return;
    }
    marcarFuro(px * PX, py * PX); numero(px, py, 'errou', 'erra');
  }
  // A gente de mentira (só no ensaio): atira com a mira ruim, nos cavaleiros, nos cavalos de fogo e nele.
  const sims = Array.from({ length: o.sims ?? 0 }, (_, k) => ({ nome: NOMES_SIM[k % NOMES_SIM.length], mira: entre(0.7, 1.5) }));
  function tiroSimulado(s) {
    const cavs = P.cavaleiros.filter(c2 => !c2.fim && c2.x > 0 && c2.x < AW);
    if (cavs.length && Math.random() < 0.55) { const c2 = sorteio(cavs); faisca(c2.x + entre(-30, 30), c2.y - entre(0, 60), true); if (Math.random() < 0.45 * s.mira) acertarCavaleiro(c2, s.nome, true); return; }
    const fogo = P.cavalosFogo.filter(f => !f.morto && f.nasce <= 0);
    if (fogo.length && Math.random() < 0.6) { const f = sorteio(fogo); faisca(f.x + entre(-30, 30), f.y - entre(0, 30), true); if (Math.random() < 0.28) estourarCavaloFogo(f, s.nome); return; }
    for (let k = 0; k < 16; k++) {
      const gx = Math.floor(Math.random() * CW), gy = Math.floor(Math.random() * CH), cd = bG[gy * CW + gx];
      if (cd) { const [x, y] = noChefe(gx, gy); if (Math.random() < 0.35 * s.mira) { faisca(x, y, false); if (!B.escudo) baterChefe(s.nome, gx, gy, cd, true); } else faisca(x + entre(-20, 20), y + entre(-20, 20), true); return; }
    }
  }
  // Na briga, todo clique na página é um tiro e não chega no Gestão — menos no menu lateral (`o.livre`).
  const livre = o.livre ?? '[data-chefona-livre]';
  const naBriga = e => fase === 'luta' && !(e.target instanceof Element && e.target.closest(livre));
  const aoApertar = e => { if (!naBriga(e)) return; e.preventDefault(); e.stopPropagation(); atirar(e.clientX / PX, e.clientY / PX); };
  const aoClicar = e => { if (naBriga(e)) { e.preventDefault(); e.stopPropagation(); } };
  document.addEventListener('pointerdown', aoApertar, true);
  document.addEventListener('click', aoClicar, true);
  // O lote: a cada segundo, os tiros somados desta tela. Freado (cedo demais), volta para o próximo.
  let mandando = false;
  const idLote = setInterval(async () => {
    if (mandando || !o.aoGolpear || (!lote.acertos && !lote.bolas && !lote.banidos)) return;
    const l = { ...lote }; lote.dano = lote.acertos = lote.bolas = lote.banidos = 0; mandando = true;
    try { const foi = await o.aoGolpear(l); if (foi === false) { lote.dano += l.dano; lote.acertos += l.acertos; lote.bolas += l.bolas; lote.banidos += l.banidos; } }
    catch { /* caiu a conexão: o próximo estado acerta a barra */ }
    finally { mandando = false; }
  }, GUERRA.loteMs);

  /* ---------- o estado do banco ---------- */
  function atualizar(e) {
    if (!e || (e.versao ?? 0) < (E.versao ?? 0)) return;
    const antes = E; E = e;
    const vidaNova = Number(e.vida ?? e.vida_max ?? 1), vidaVelha = Number(antes.vida ?? antes.vida_max ?? 1);
    // o que os outros tiraram desde o último estado: faíscas no corpo dele
    const dosOutros = Math.max(0, vidaVelha - vidaNova - minhaParte); minhaParte = 0;
    if (fase === 'luta' && dosOutros > 0) for (let k = 0; k < Math.min(leve ? 8 : 24, Math.ceil(dosOutros / 4)); k++) depois(Math.random() * 900, () => { const gx = Math.floor(entre(30, 150)), gy = Math.floor(entre(20, 120)); if (bG[gy * CW + gx]) { const [x, y] = noChefe(gx, gy); faisca(x, y, false); } });
    if ((e.curas ?? 0) > curasVistas && fase === 'luta') { curasVistas = e.curas; chamarAnjo(vidaTela); }
    curasVistas = Math.max(curasVistas, e.curas ?? 0);
    vidaTela = vidaNova;
  }

  /* ---------- o laço ---------- */
  function passo(dt) {
    rel += dt; faseT += dt;
    const agora = o.agora(), solta = ms(E.solta_em) ?? agora, expira = ms(E.expira_em) ?? agora + 1e9;
    if (fase === 'entrada') {
      B.jaw = 1; B.modo = 'parado'; P.shake = Math.max(P.shake, leve ? 0 : 2);
      if (agora >= solta) { fase = 'luta'; faseT = 0; $('.gx-titulo').classList.remove('on'); $('.gx-hud').classList.add('on'); document.documentElement.classList.add('gx-mira'); Som.musica('chefao'); legenda('ATIREM NELE! A armadura segura o tiro: mirem no olho, na cara, no pescoço e nas pernas.', 5500); }
    } else if (fase === 'luta') {
      aquecerCavaleiros();
      B.flash = Math.max(0, B.flash - dt * 8);
      const mostrada = vidaSegura ?? vidaTela, frac = clamp(mostrada / vidaMax(), 0, 1), fur = frac < 0.35;
      B.furia += ((fur ? 1 : 0) - B.furia) * Math.min(1, dt * 2);
      const hud = $('.gx-hud'); hud.classList.toggle('furia', fur); hud.classList.toggle('escudo', B.escudo); hud.classList.toggle('cura', vidaSegura != null);
      hudTexto('.gx-barra i', (100 * frac).toFixed(1) + '%', true);
      hudTexto('.gx-barra b', `${Math.ceil(mostrada).toLocaleString('pt-BR')} / ${Math.round(vidaMax()).toLocaleString('pt-BR')}`);
      hudTexto('.gx-tempo', '⏱ ' + mmss((expira - agora) / 1000) + (B.atordoado > 0 ? '   ·   💫 TONTO: DANO EM DOBRO' : ''));
      hudTexto('.gx-nome span', `CAVALO DA GUERRA · era o #${o.numero ?? '?'}`);
      for (const s of sims) if (Math.random() < 1.1 * dt) tiroSimulado(s);
      B.atordoado = Math.max(0, B.atordoado - dt);
      if (B.escudo && !P.cavalosFogo.some(f => !f.morto)) quebrarEscudo();
      if (B.atordoado > 0 && !B.acao) { B.modo = 'parado'; B.jaw = 0.3; B.cab = 0.3 + 0.1 * Math.sin(rel * 3); B.rot = 0.04 * Math.sin(rel * 5); }
      else if (!B.acao) {
        if (!B.alvo || Math.hypot(B.alvo.x - B.x, B.alvo.y - B.y) < 4) B.alvo = { x: entre(70, AW - 70), y: entre(yMinChefe(), AH - 6) };
        const dx = B.alvo.x - B.x, dy = B.alvo.y - B.y, d = Math.hypot(dx, dy) || 1, v = 26 * (1 + B.furia * 0.8);
        B.x += dx / d * Math.min(d, v * dt); B.y += dy / d * Math.min(d, v * dt); if (Math.abs(dx) > 6) B.dir = Math.sign(dx);
        B.modo = 'anda'; B.p += dt * 0.85 * (1 + B.furia * 0.6); B.jaw = Math.max(0, B.jaw - dt * 2); B.rot *= 0.85; B.cab = Math.max(0, B.cab - dt * 2);
        B.by = Math.sin(rel * 2.2) * 0.8;
        B.prox -= dt;
        if (B.prox <= 0) escolherAcao(frac);
      } else acaoChefe(dt);
      if (B.furia > 0.3) for (let r = 0; r < (leve ? 1 : 3); r++) if (Math.random() < dt * 30) { for (let k = 0; k < 10; k++) { const gx = Math.floor(entre(20, 160)), gy = Math.floor(entre(0, 110)), cd = bG[gy * CW + gx]; if (cd === MAT.CRINA || cd === MAT.RABO) { const [x, y] = noChefe(gx, gy); P.parts.push({ x, y: y + 2, vx: entre(-8, 8), vy: entre(-46, -22), g: 0, vida: entre(0.3, 0.55), max: 0.55, cor: 'chama', tier: sorteio([1, 1, 2, 2, 3]), off: Math.random() * 8, v: Math.random() < 0.5 ? 1 : 0 }); break; } } }
      if (Math.random() < dt * 3) { const [gx, gy] = cabecaDo(B).pt(22, 1.5), [x, y] = noChefe(gx, gy); P.parts.push({ x, y, vx: B.dir * entre(6, 16), vy: entre(-8, -2), g: -5, vida: 0.9, max: 0.9, cor: 'fumaca', tam: 1 }); }
      if (E.caiu_em) { fase = 'queda'; faseT = 0; sair(); Som.relinchoChefe(2.4); }
      else if (agora >= expira) { fase = 'fuga'; faseT = 0; sair(); Som.relinchoChefe(2); legenda('Ele escapou.', 3000); }
    } else if (fase === 'queda') {
      const t = faseT;
      if (t < 1.8) { B.acao = null; B.modo = 'parado'; B.jaw = 1; B.furia = Math.max(0, B.furia - dt); B.rot = Math.min(0.32, B.rot + dt * 0.18); B.flash = (Math.floor(t * 12) % 2) * 0.7; if (!leve) P.shake = Math.max(P.shake, 2 + t * 2); }
      if (t >= 1.8 && B.visivel) {
        flashPag(1); tremerPagina(); Som.explosao(2); Som.vidro();
        for (let k = 0; k < (leve ? 80 : 220); k++) { const gx = Math.floor(Math.random() * CW), gy = Math.floor(Math.random() * CH), cd = bG[gy * CW + gx]; if (!cd) continue; const [x, y] = noChefe(gx, gy), tp = tipoDoAcerto(cd); P.parts.push({ x, y, vx: entre(-170, 170), vy: entre(-220, -40), g: 280, vida: entre(0.8, 1.8), max: 1.8, cor: tp === 'fogo' ? sorteio(['#ff7a1c', '#ffc83e']) : tp === 'armadura' ? sorteio(['#25232e', '#3b3848', '#c88a22']) : sorteio(['#661316', '#93201d', '#bd3524']), tam: 2 }); }
        explosaoFogo(P.parts, B.x, B.y - 60, leve ? 1.5 : 3); P.luzes.push({ x: B.x, y: B.y - 60, k: 5, t: 0, dur: 1 });
        P.espada = { x: B.x - B.dir * 8, y: B.y - 2, rot: B.dir * 0.18, cai: 0, vida: 9 };
        B.visivel = false; legenda('O Cavalo da Guerra caiu. A espada dele ficou cravada no Gestão.', 3000);
        EF.desfazerTudo(true);
      }
      if (t >= 3.4) mostrarPlacar(true);
    } else if (fase === 'fuga') {
      const t = faseT;
      if (t < 0.8) { B.modo = 'empina'; B.rot = -0.4 * Math.sin(t / 0.8 * Math.PI); B.jaw = 1; }
      else { B.modo = 'galope'; B.rot = 0; B.p += dt * 3.4; B.x += B.dir * 260 * dt; B.by = Math.round(-Math.sin(B.p * T2) * 1.6); rastro(260 * dt, true); }
      if (t > 3.2 && B.visivel) { B.visivel = false; EF.desfazerTudo(true); mostrarPlacar(false); }
    } else if (fase === 'placar') {
      if (faseT > 6) { fase = 'fim'; o.aoFim?.(placarVenceu); }
    }
    efeitos(dt);
  }
  let placarVenceu = false;
  function sair() {
    $('.gx-hud').classList.remove('on', 'furia', 'escudo', 'cura'); document.documentElement.classList.remove('gx-mira'); Som.musica(null); legenda('');
    $('.gx-sombra').classList.remove('on', 'apocalipse');
    for (const f of P.cavalosFogo) estourarCavaloFogo(f, null);
    for (const c2 of P.cavaleiros) { c2.fim = true; c2.el.remove(); }
  }
  function mostrarPlacar(venceu) {
    fase = 'placar'; faseT = 0; placarVenceu = venceu;
    const box = $('.gx-placar'), lista = E.ranking ?? [];
    box.querySelector('h2').textContent = venceu ? '⚔ QUEM MAIS ACERTOU' : '☠ ELE ESCAPOU';
    box.querySelector('ol').innerHTML = lista.slice(0, 6).map((r, i) => `<li class="${r.usuario === o.eu ? 'eu' : ''}"><span><b>${i + 1}º</b> ${String(r.nome).replace(/[<>&]/g, '')}</span><span>${Number(r.dano).toLocaleString('pt-BR')}</span></li>`).join('') || '<li><span>Ninguém acertou.</span></li>';
    box.classList.add('on');
  }
  function efeitos(dt) {
    const cap = leve ? 320 : 900;
    for (const p of P.parts) { p.vida -= dt; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.cor === 'fumaca' || p.cor === 'vapor') p.tam += dt * 3; }
    poda(P.parts, p => p.vida > 0); if (P.parts.length > cap) P.parts.splice(0, P.parts.length - cap);
    for (const f of P.chamas) { f.vida -= dt; if (!leve && f.tier > 0 && Math.random() < dt * 3) P.parts.push({ x: f.x + entre(-2, 2), y: f.y - 8 - f.tier * 4, vx: entre(-3, 3), vy: entre(-26, -12), g: 0, vida: 0.9, max: 0.9, cor: Math.random() < 0.55 ? 'brasa' : 'fumaca', tam: 1.5 }); }
    poda(P.chamas, f => f.vida > 0); if (P.chamas.length > (leve ? 120 : 260)) P.chamas.splice(0, P.chamas.length - (leve ? 120 : 260));
    for (const s of P.cacos) { s.vida -= dt; s.vy += 260 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.rot += s.vr * dt; }
    poda(P.cacos, s => s.vida > 0);
    for (const f of P.flashes) f.t += dt; poda(P.flashes, f => f.t < 0.09);
    for (const w of P.ondas) w.t += dt; poda(P.ondas, w => w.t < 0.8);
    for (const L of P.luzes) L.t += dt; poda(P.luzes, L => L.t < L.dur);
    if (P.aureola) { const a = P.aureola; a.vy += 220 * dt; a.x += a.vx * dt; a.y += a.vy * dt; a.vida -= dt; if (a.vida <= 0) P.aureola = null; }
    for (const b of P.bolas) {
      b.t += dt; const u = Math.min(1, b.t / b.dur), x = lerp(b.x0, b.x1, u), y = lerp(b.y0, b.y1, u) - Math.sin(Math.PI * u) * 40;
      for (let k = 0; k < (leve ? 1 : 3); k++) { const q = Math.random(); P.parts.push({ x: lerp(b.x ?? x, x, q) + entre(-2, 2), y: lerp(b.y ?? y, y, q) + entre(-2, 2), vx: entre(-14, 14), vy: entre(-22, 4), g: -10, vida: entre(0.25, 0.45), max: 0.45, cor: 'bola', tam: k ? 0 : 1, cresce: 1.6, v: k & 1, pal: b.pal }); }
      b.x = x; b.y = y;
      if (u >= 1 && !b.fim) {
        b.fim = true;
        if (fase === 'luta') {
          const parte = b.tipo === 'banido' ? GUERRA.banidoFracao : GUERRA.bolaFracao, bruto = parte * vidaMax();
          if (b.quem === 'Você') { contarNoLote(bruto, b.tipo); tirarDaTela(bruto); numero(x, y, `🔥 −${Math.round(bruto * Number(E.ritmo ?? 1))}`, 'fogo'); }
          else if (o.aoGolpearSim) o.aoGolpearSim(b.quem, { dano: 0, acertos: 0, bolas: b.tipo === 'bola' ? 1 : 0, banidos: b.tipo === 'banido' ? 1 : 0 });
          B.flash = 1; Som.estouro();
        }
        explosaoFogo(P.parts, x, y, 0.6, b.pal); P.luzes.push({ x, y, k: 3, t: 0, dur: 0.35, pal: b.pal });
      }
    }
    poda(P.bolas, b => !b.fim);
    for (const f of P.cavalosFogo) {
      if (f.morto) continue;
      if (f.nasce > 0) { f.nasce -= dt; if (f.nasce <= 0) acenderPortal(f); continue; }
      f.sobe = Math.min(1, f.sobe + dt * 2.6);
      f.vida -= dt; f.fg += dt * f.v / 30; f.x += f.dir * f.v * dt * f.sobe;
      if (Math.random() < dt * 0.6) f.alvoY = entre(Math.max(50, AH * 0.25), AH - 6);
      f.y += clamp(f.alvoY - f.y, -30 * dt, 30 * dt);
      if (f.x < 20) f.dir = 1; if (f.x > AW - 20) f.dir = -1;
      if (Math.random() < dt * (leve ? 5 : 16)) P.parts.push({ x: f.x - f.dir * entre(-6, 20), y: f.y - entre(12, 30), vx: -f.dir * entre(8, 30), vy: entre(-40, -14), g: 0, vida: entre(0.4, 0.8), max: 0.8, cor: 'brasa', tam: 1 });
      if (!leve && Math.random() < dt * 2.5) P.parts.push({ x: f.x - f.dir * 14, y: f.y - 30, vx: -f.dir * 6, vy: -14, g: -2, vida: 1.2, max: 1.2, cor: 'fumaca', tam: 1 });
      f.passo -= dt;
      if (f.passo <= 0 && f.sobe >= 1) { f.passo = leve ? 0.26 : 0.13; f.pe = -f.pe; P.chamas.push({ x: f.x + f.pe * 9 * f.dir, y: f.y + 1, vida: 0.8, max: 0.8, tier: Math.random() < 0.3 ? 1 : 0, off: Math.random() * 8, v: f.pe > 0 ? 1 : 0 }); }
      if (f.vida <= 0) { const tr = sorteio(ALVOS.linhas()); if (tr) queimarLinha(tr, 0); f.morto = true; Som.estouro(); explosaoFogo(P.parts, f.x, f.y - 12, 1); }
    }
    poda(P.cavalosFogo, f => !f.morto);
    for (const c2 of P.cavaleiros) {
      if (c2.fim) continue;
      c2.x += c2.dir * c2.v * dt; c2.fg += dt * c2.v / 26; c2.flash = Math.max(0, c2.flash - dt * 6);
      c2.eco -= dt; if (c2.eco <= 0) { c2.eco = 0.05; c2.ecos.unshift([c2.x, c2.y, Math.floor(c2.fg * 8) % 8]); if (c2.ecos.length > (leve ? 1 : 3)) c2.ecos.length = leve ? 1 : 3; }
      if (Math.random() < dt * (leve ? 10 : 30)) P.parts.push({ x: c2.x - c2.dir * entre(6, 40), y: c2.y - entre(4, 46), vx: -c2.dir * entre(10, 40), vy: entre(-30, -8), g: 0, vida: entre(0.3, 0.6), max: 0.6, cor: Math.random() < 0.5 ? 'chama' : 'brasa', tier: 1, off: Math.random() * 8, pal: c2.nome });
      c2.el.style.left = c2.x * PX + 'px'; c2.el.style.top = (c2.y - 74) * PX + 'px'; c2.barra.style.width = (100 * c2.hp / c2.hpMax) + '%';
      if ((c2.dir > 0 && c2.x > AW + 60) || (c2.dir < 0 && c2.x < -60)) { c2.fim = true; c2.el.remove(); if (fase === 'luta') maldicao(c2.nome); }
    }
    poda(P.cavaleiros, c2 => !c2.fim);
    if (!P.cavaleiros.length) $('.gx-sombra').classList.remove('apocalipse');
    const e = P.espada;
    if (e) { e.vida -= dt; const a0 = e.cai; e.cai = Math.min(1, e.cai + dt * 3); if (a0 < 1 && e.cai >= 1) { tremerPagina(); Som.tink(); } if (e.vida <= 0) P.espada = null; }
    P.shake = Math.max(0, P.shake - dt * 10);
  }

  /* ---------- o desenho ---------- */
  function desenharChama(f) {
    const idade = f.max - f.vida, s = Math.min(1, idade * 6, (f.vida / f.max) * 2.4), tier = Math.min(f.tier, Math.floor(s * (f.tier + 0.99)));
    chama(ax, f.x, f.y, tier, f.off, f.v);
  }
  function desenharCavaloFogo(f) {
    if (f.nasce > 0) { if (f.nasce < 0.7) { const a = 1 - f.nasce / 0.7; for (let k = 0; k < 8; k++) { const an = k / 8 * T2 + rel * 2; chama(ax, f.x + Math.cos(an) * 18 * a, f.y + Math.sin(an) * 4.5 * a, 0, k * 1.3 + f.off, k & 1); } } return; }
    const fr = FOGO_Q.q[Math.floor(f.fg * 8) % 8][Math.floor(rel * 12 + f.off) % 6];
    luz(ax, f.x, f.y - 18, 2, 0.45 * tremula(f.off) * f.sobe);
    ax.save(); ax.translate(Math.round(f.x), Math.round(f.y));
    if (f.sobe < 1) { ax.beginPath(); ax.rect(-60, -80, 120, 81); ax.clip(); }
    ax.scale(f.dir, 1); ax.drawImage(fr, -FOGO_Q.SW / 2 - FOGO_Q.PL, -32 - FOGO_Q.PT + Math.round((1 - f.sobe) * 36)); ax.restore();
  }
  function anelEscudo(cy, frente) {
    const n = leve ? 14 : 28;
    for (let k = 0; k < n; k++) { const an = k / n * T2 + rel * 0.9, sn = Math.sin(an); if ((sn > 0) !== frente) continue; chama(ax, B.x + Math.cos(an) * 90, cy + sn * 74 + 8, k % 3 === 0 ? 2 : 1, k * 2.3, k & 1); }
  }
  function quadroCavNaTela(nome, q, x, y, dir, cor, a = 0.75) {
    let img = quadroCavaleiro(nome, q); if (cor) img = tingidoFixo(img, cor, a);
    ax.save(); ax.translate(Math.round(x), Math.round(y)); ax.scale(dir * K_CAV, K_CAV); ax.drawImage(img, 0, 0, CW, CH, -CW / 2, -CCHAO, CW, CH); ax.restore();
  }
  function desenharEspada() {
    const e = P.espada; if (!e) return;
    const y = lerp(e.y - 110, e.y, e.cai * e.cai);
    ax.save(); ax.globalAlpha = clamp(e.vida / 1.5, 0, 1); ax.translate(Math.round(e.x), Math.round(y)); ax.rotate(e.rot);
    R(ax, '#1c2028', -2, -40, 5, 40); R(ax, '#a6b0c4', -1, -40, 3, 38); R(ax, '#e6ecf8', 0, -40, 1, 32);
    R(ax, '#5c360c', -8, -45, 17, 4); R(ax, '#c88a22', -8, -45, 17, 3); R(ax, '#f0c050', -8, -45, 17, 1); R(ax, '#ff5a1a', -1, -44, 3, 2);
    R(ax, '#28140c', -1, -55, 3, 10); R(ax, '#5a321d', -1, -55, 1, 10); bola(ax, '#c88a22', 0, -57, 2);
    ax.restore();
  }
  function desenhar() {
    ax.setTransform(1, 0, 0, 1, 0, 0); ax.clearRect(0, 0, AW, AH);
    const sh = P.shake; ax.setTransform(1, 0, 0, 1, Math.round(entre(-sh, sh)), Math.round(entre(-sh, sh) * 0.6));
    for (const s of P.cacos) {
      ax.save(); ax.globalAlpha = clamp(s.vida * 1.5, 0, 1); ax.translate(s.x, s.y); ax.rotate(s.rot); ax.scale(s.s, s.s);
      ax.beginPath(); ax.moveTo(s.pts[0][0] - s.cx, s.pts[0][1] - s.cy); ax.lineTo(s.pts[1][0] - s.cx, s.pts[1][1] - s.cy); ax.lineTo(s.pts[2][0] - s.cx, s.pts[2][1] - s.cy); ax.closePath();
      ax.save(); ax.clip(); ax.drawImage(s.foto, -s.cx, -s.cy); ax.restore(); ax.strokeStyle = '#ffffffaa'; ax.lineWidth = 1 / s.s; ax.stroke(); ax.restore();
    }
    for (const L of P.luzes) luz(ax, L.x, L.y, L.k, 0.9 * (1 - L.t / L.dur), false, L.pal);
    for (const f of P.chamas) desenharChama(f);
    for (const f of P.cavalosFogo) desenharCavaloFogo(f);
    desenharEspada();
    const a = B.acao;
    const anjo = a?.tipo === 'anjo' && !a.comido && a.ay != null;
    if (anjo && !leve) { ax.globalAlpha = 0.2; R(ax, '#fff7c8', Math.round(a.ax) - 18, 0, 37, Math.round(a.ay) + 10); R(ax, '#ffffff', Math.round(a.ax) - 7, 0, 15, Math.round(a.ay) + 10); ax.globalAlpha = 1; }   // o raio de luz
    if (B.visivel) {
      elip(ax, 'rgba(20,0,10,.16)', B.x + B.dir * 6, B.y + 1, 50, 3);
      if (B.furia > 0.05) luz(ax, B.x, B.y - 70, 5, 0.45 * B.furia * tremula(3));
      const cy = B.y - 64;
      if (B.escudo && ESCUDO) { ax.globalAlpha = 0.75 + 0.25 * Math.sin(rel * 5); ax.drawImage(ESCUDO, Math.round(B.x - ESCUDO.width / 2), Math.round(cy - ESCUDO.height / 2)); ax.globalAlpha = 1; anelEscudo(cy, false); }
      desenharChefe();
      if (B.escudo) anelEscudo(cy, true);
      if (a?.boca) luz(ax, a.boca[0], a.boca[1], 3, 0.85 * tremula(5));
      if (B.atordoado > 0) { const [hx, hy] = noChefe(...cabecaDo(B).pt(2, -20)); for (let k = 0; k < 3; k++) { const an = rel * 5 + k * T2 / 3; R(ax, '#ffe14a', Math.round(hx + Math.cos(an) * 12), Math.round(hy + Math.sin(an) * 4), 2, 2); } }
    }
    // o anjo vem na frente dele (é ele que vai ser comido), no dobro do tamanho: tem que dar para ver
    if (anjo) { ax.save(); ax.translate(Math.round(a.ax), Math.round(a.ay)); ax.scale(2, 2); desenharAnjo(0, 0, rel); ax.restore(); }
    if (P.aureola) desenharAureola(P.aureola);
    for (const c2 of P.cavaleiros) {
      c2.ecos.forEach(([x, y, q], j) => { ax.globalAlpha = 0.3 - j * 0.09; quadroCavNaTela(c2.nome, q, x, y, c2.dir, INFO_CAV[c2.nome].cor, 0.85); });
      ax.globalAlpha = 0.92; quadroCavNaTela(c2.nome, Math.floor(c2.fg * 8) % 8, c2.x, c2.y, c2.dir, c2.flash > 0 ? '#ffffff' : null); ax.globalAlpha = 1;
    }
    for (const w of P.ondas) { if (w.t < 0) continue; const u = w.t / 0.8, rx = 10 + u * 90 * w.r, ry = rx * 0.3, al = 1 - u; for (let k = 0; k < 80; k++) { const an = k / 80 * T2; R(ax, w.fogo ? `rgba(255,${120 + (k % 3) * 50},30,${al})` : `rgba(255,240,220,${al})`, Math.round(w.x + Math.cos(an) * rx), Math.round(w.y + Math.sin(an) * ry), 2, 1); } }
    for (const p of P.parts) particula(ax, p);
    for (const b of P.bolas) { luz(ax, b.x, b.y, 2, 0.85, false, b.pal); const s = sprites(b.pal).bolas[3][0][0]; ax.drawImage(s, Math.round(b.x - s.width / 2), Math.round(b.y - s.height / 2)); }
    for (const f of P.flashes) { const r = f.t < 0.04 ? 4 : 2; R(ax, '#fff7c0', Math.round(f.x) - r, Math.round(f.y), 2 * r + 1, 1); R(ax, '#fff7c0', Math.round(f.x), Math.round(f.y) - r, 1, 2 * r + 1); }
  }
  let avisou = false;
  function quadro(agoraT) {
    if (!vivo) return;
    // o próximo quadro sai antes: um erro num quadro não congela o chefe
    raf = requestAnimationFrame(quadro);
    // o carimbo do rAF pode vir de antes do performance.now() da montagem: nada de tempo negativo
    const real = clamp((agoraT - antes) / 1000, 0, 0.05); antes = Math.max(antes, agoraT);
    try { passo(real); desenhar(); desenharMarcas(real); }
    catch (e) { if (!avisou) { avisou = true; console.error('[guerra] um quadro do chefe falhou', e); } }
  }

  // Quem chega depois da hora não vê a janela estourar: ele já está na página.
  if (o.agora() < (ms(E.solta_em) ?? 0)) estilhar(); else { B.x = AW / 2; B.y = clamp(Math.round(AH * 0.72), yMinChefe(), AH - 6); }
  raf = requestAnimationFrame(quadro);

  return {
    atualizar,
    destruir() {
      vivo = false; cancelAnimationFrame(raf); clearInterval(idLote); for (const id of timers) clearTimeout(id); timers.clear();
      document.removeEventListener('pointerdown', aoApertar, true); document.removeEventListener('click', aoClicar, true); removeEventListener('resize', medir);
      document.documentElement.classList.remove('gx-mira'); pagina.classList.remove('gx-treme');
      EF.desfazerTudo(false); Som.fechar(); raiz.innerHTML = ''; raiz.classList.remove('gx-palco');
    },
  };
}

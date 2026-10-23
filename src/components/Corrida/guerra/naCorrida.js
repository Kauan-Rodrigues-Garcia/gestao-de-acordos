/*
 * naCorrida.js — a Guerra na Corrida DENTRO da janela da corrida de cavalos
 * (`corrida-cavalos.html`, 23/10/2026): a transição do cenário, o botão
 * «ATACAR A CORRIDA!», os cavalos caindo, o filme (o luto pelo Pé de Pano, a
 * raiva, a transformação) e a volta, depois que o chefe cai na página.
 *
 * ## Quem manda no tempo
 *
 * A corrida é uma gravação; a guerra é uma PAUSA nela. Todo mundo para no mesmo
 * segundo da gravação (`tG`: o líder passa de `GUERRA.inicioFracao` da prova) e
 * volta junto (`fimMs`: o chefe caiu ou fugiu, mais `FIM_S`), pelos horários do
 * banco. `tempo(bruto)` traduz o segundo do relógio da corrida no segundo da
 * gravação; a página passa tudo por ele (o laço e o `seguirRelogio`). Depois da
 * guerra, o sobrevivente (o vencedor da gravação: o resultado não muda) volta a
 * correr do ponto da gravação onde ele está.
 *
 * ## O que é de cada tela
 *
 * As mortes saem da pressão (`regras.ts`): quantas, igual em toda tela; quem,
 * pela semente da corrida (`ordemDasMortes`); como (rajada, bomba, soldado,
 * avião, tanque), de cada tela. O filme é contado do `sobrou_em` do banco.
 *
 * ## A surpresa e o som
 *
 * Nada avisa antes: a corrida é normal até as explosões ao longe (a transição),
 * e só aí a tela cheia abre sozinha. No primeiro cavalo que cai entra o violino
 * da guerra (`VIOLINO`), a 10% do volume, subindo até 25% junto com a guerra;
 * no cessar-fogo ele sai. Tudo passa pela barrinha de volume da janela.
 *
 * ## A página manda
 *
 *   { tipo: 'guerra-atacar', cliques }     a cada `GUERRA.envioMs` na guerra (0 também: o relógio anda)
 *   { tipo: 'guerra-chefe', rect, numero, dono }   a janela estoura: o chefe vai para a página
 *   { tipo: 'guerra-volta' }               o chefe acabou: a janela volta
 *
 * e o sistema manda `{ tipo: 'guerra', guerra }` (o estado do banco, ou do ensaio).
 */
import { assarFogo, chama as chamaF, luz as luzF, tremula as tremulaF, particula as particulaF, explosaoFogo, poda, hash, ruido2 } from './fogo.js';
import { CW, CH, CCHAO, CMEIO, CPIV, CAVALEIROS, criarDestino, construirCavalo } from './cavaloDaGuerra.js';
import { pePanoCaido, PE_PANO_CHAO } from './pePano.js';
import { criarSomGuerra } from './som.js';
import { GUERRA, alvoDaGuerra, pressaoEfetiva, mortesPela, ordemDasMortes, parteDoFilme } from './regras';

const T2 = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const entre = (a, b) => a + Math.random() * (b - a);
const sorteio = a => a[Math.floor(Math.random() * a.length)];
const suave = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const ms = iso => (iso ? Date.parse(iso) : null);
const R = (x, c, X, Y, w, h) => { x.fillStyle = c; x.fillRect(X, Y, w, h); };
function bola(x, c, cx, cy, r) { cx = Math.round(cx); cy = Math.round(cy); r = Math.max(0, Math.round(r)); for (let y = -r; y <= r; y++) { const w = Math.floor(Math.sqrt(Math.max(0, r * r - y * y)) + 0.4); R(x, c, cx - w, cy + y, 2 * w + 1, 1); } }
function elip(x, c, cx, cy, rx, ry) { cx = Math.round(cx); cy = Math.round(cy); for (let y = -Math.round(ry); y <= Math.round(ry); y++) { const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y / Math.max(ry, 0.5)) ** 2))); if (w > 0) R(x, c, cx - w, cy + y, 2 * w + 1, 1); } }
function linha(x, c, x0, y0, x1, y1, e = 1) { const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0))); for (let i = 0; i <= n; i++) { const t = i / n; R(x, c, Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t), e, e); } }
function tela(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.imageSmoothingEnabled = false; return [c, x]; }
const hexRgb = h => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const tom = (h, f) => '#' + hexRgb(h).map(v => clamp(Math.round(v * f), 0, 255).toString(16).padStart(2, '0')).join('');
const curto = nome => { const p = String(nome || '').trim().split(/\s+/); return p.length > 1 ? `${p[0]} ${p[1][0]}.` : p[0] || 'alguém'; };
const esc = s => String(s ?? '').replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));

/**
 * Do chefe caído (ou fugido) até a corrida voltar: o placar da página (~9,5 s) e a volta — ele parado
 * um instante (`PARADO_S`) e depois indo devagar até a linha (`CAMINHA_S`), como no laboratório.
 */
export const VOLTA_S = 9.5, PARADO_S = 1.5, CAMINHA_S = 5, FIM_S = VOLTA_S + PARADO_S + CAMINHA_S;
/** A cena da volta: a câmera deixa a linha de chegada neste x da tela, e ele começa neste. */
const CHEGADA_NA_TELA = 352, VOLTA_NA_TELA = 150;
/** Onde o cenário começa a mudar (fração da prova do líder): um pouco antes do botão. */
const TRANSICAO_FRACAO = 0.47;
/** O quanto o cenário já mudou quando o botão aparece. */
const W_ATAQUE = 0.65;
/** O violino da guerra (Shape of Lies, Eternal Eclipse): do primeiro cavalo caído ao cessar-fogo, de 10% a 25% do volume. */
const VIOLINO = { url: '/sons/guerra/violino-da-guerra.mp3', de: 0.1, ate: 0.25, saiS: 2.5 };

/* ---------- o cenário da guerra (entra por cima do mapa, com a opacidade `w`) ---------- */
const GENTE = ['#e74c3c', '#3498db', '#f1c40f', '#2ecc71', '#9b59b6', '#e67e22', '#ecf0f1', '#34495e', '#ff7eb6', '#1abc9c', '#c0392b', '#2c3e50'];
const PELE = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac', '#a86b3c'];
const CORES = {
  ceu: ['#1e0a08', '#35110a', '#521a0c', '#74280f', '#943a16', '#b0521d'],
  arq: { telhado: ['#5a2a22', '#6e6258'], fundo: '#4a3e36', degrau: ['#4c4a48', '#3e3c3a'], pilar: '#6e6258', parede: '#5a5048', placas: ['#2a2622', '#3a1a16', '#2a2622', '#3a2a16'] },
  pista: { grama: '#5a4a2a', trilho: '#8a8580', sombra: '#3e2a1c', terra: ['#6d4a32', '#62422c', '#563924'], pinta: ['#3e2a1c', '#7e5a3e'], marca: '#4a3222' },
};
const ASSENTO = 8, FILEIRAS = [9, 19, 29];
function torcedor(x, px, py, cor, pele, topo, bracos) {
  const claro = tom(cor, 1.18), escuro = tom(cor, 0.8);
  R(x, cor, px, py + 4, 6, 5); R(x, claro, px, py + 4, 6, 1); R(x, escuro, px, py + 8, 6, 1);
  R(x, pele, px + 1, py, 4, 4); R(x, '#1d1410', px + 2, py + 2, 1, 1); R(x, '#1d1410', px + 3, py + 2, 1, 1);
  if (topo) R(x, topo, px + 1, py, 4, 1);
  if (bracos) { R(x, pele, px - 1, py + 1, 1, 4); R(x, pele, px + 6, py + 1, 1, 4); }
}
let BG = null;
function construirCenario(W, H) {
  if (BG) return BG;
  const fundo = (() => {
    const [c, x] = tela(W, H), cores = CORES.ceu, ate = 118;
    for (let y = 0; y < ate; y++) { const f = y / ate * (cores.length - 1), i = Math.floor(f), u = f - i; R(x, (u > (hash(y, 3) * 0.6 + 0.2)) && cores[i + 1] ? cores[i + 1] : cores[i], 0, y, W, 1); }
    bola(x, '#6a1e0c', 338, 26, 19); bola(x, '#9a2c10', 338, 26, 13); bola(x, '#d8461a', 338, 26, 9); bola(x, '#ff7a3a', 336, 24, 4);
    return c;
  })();
  const longe = (() => {
    const [c, x] = tela(512, 70);
    for (let i = 0; i < 512; i++) { const a = i / 512 * T2, y = Math.round(34 + 5 * Math.sin(a * 2 + 3) + 3 * Math.sin(a * 5 + 2)); R(x, '#4a3226', i, y, 1, 70 - y); R(x, '#5e4030', i, y, 1, 1); }
    for (let k = 0; k < 9; k++) {
      const X = Math.round(k * 57 + hash(k, 5) * 20), w = 10 + Math.floor(hash(k, 6) * 10), h = 8 + Math.floor(hash(k, 7) * 8), y = 46 - h;
      R(x, '#1c120e', X, y, w, h + 10); for (let j = 0; j < w; j++) if (hash(X + j, 8) < 0.45) R(x, '#1c120e', X + j, y - 1 - Math.floor(hash(X + j, 9) * 4), 1, 2);
      if (hash(k, 10) < 0.6) R(x, '#ff7a1a', X + 3, y + 3, 2, 2); if (hash(k, 11) < 0.5) R(x, '#ffb12e', X + w - 4, y + 5, 1, 2);
    }
    for (let i = 0; i < 512; i++) { const a = i / 512 * T2, y = Math.round(47 + 4 * Math.sin(a * 3 + 4) + 2 * Math.sin(a * 7)); R(x, '#3a261c', i, y, 1, 70 - y); R(x, '#4a3022', i, y, 1, 1); }
    return c;
  })();
  const meio = (() => {
    const [c, x] = tela(384, 70);
    for (let k = 0; k < 15; k++) {
      const cx = Math.round(k * 25.6 + hash(k, 3) * 10), r = 5 + Math.floor(hash(k, 4) * 4), cy = 64 - r;
      if (hash(k, 12) < 0.25) { R(x, '#1a100c', cx - 1, 60, 3, 10); R(x, '#ff6a1a', cx, 59, 1, 1); continue; }
      R(x, '#1e1410', cx - 1, cy - r + 2, 2, 70); linha(x, '#1e1410', cx, cy, cx - 4, cy - 4); linha(x, '#1e1410', cx, cy - 3, cx + 4, cy - 8); linha(x, '#1e1410', cx, cy + 3, cx + 3, cy + 1);
      if (hash(k, 13) < 0.3) { R(x, '#ff8a1f', cx - 1, cy - r + 1, 2, 2); R(x, '#ffd24a', cx, cy - r + 1, 1, 1); }
    }
    R(x, '#2e2018', 0, 66, 384, 4);
    return c;
  })();
  const arq = (() => {
    const a = CORES.arq, [c, x] = tela(256, 48);
    R(x, a.fundo, 0, 8, 256, 40);
    for (let i = 0; i < 256; i += 8) {
      if (hash(i, 901) < 0.3) { R(x, '#1a1210', i + 1, 0, 6, 4); R(x, '#2a1a14', i + 2, 4, 4, 3); continue; }
      const cor = (i / 8) % 2 ? a.telhado[1] : a.telhado[0]; R(x, cor, i, 0, 8, 7); R(x, cor, i + 1, 7, 6, 1); R(x, cor, i + 2, 8, 4, 1);
    }
    R(x, tom(a.telhado[0], 0.7), 0, 0, 256, 1); R(x, tom(a.fundo, 0.7), 0, 9, 256, 2);
    FILEIRAS.forEach((py, k) => { R(x, a.degrau[k % 2], 0, py + 9, 256, 2); R(x, tom(a.degrau[k % 2], 0.8), 0, py + 11, 256, 1); });
    for (let px = 0; px < 256; px += 64) { R(x, a.pilar, px, 8, 2, 34); R(x, tom(a.pilar, 0.75), px + 2, 8, 1, 34); }
    R(x, a.parede, 0, 42, 256, 6); R(x, tom(a.parede, 1.1), 0, 42, 256, 1);
    for (let px = 6, i = 0; px < 256; px += 32, i++) { R(x, a.placas[i % a.placas.length], px, 43, 22, 4); R(x, '#00000033', px + 2, 44, 10, 1); }
    for (let k = 0; k < 7; k++) { const X = Math.round(hash(k, 31) * 250), Y = 12 + Math.round(hash(k, 32) * 30), r = 3 + Math.round(hash(k, 33) * 4); bola(x, '#2e2219', X, Y, r + 2); bola(x, '#1a120e', X, Y, r); }
    return c;
  })();
  const pista = (() => {
    const p = CORES.pista, [c, x] = tela(256, 100), t = p.terra;
    R(x, p.grama, 0, 0, 256, 9); R(x, tom(p.grama, 1.1), 0, 0, 256, 1);
    R(x, t[0], 0, 9, 256, 16); R(x, t[1], 0, 25, 256, 45); R(x, t[2], 0, 70, 256, 30);
    for (let i = 0; i < 1100; i++) { const xx = Math.floor(hash(i, 11) * 256), yy = 11 + Math.floor(hash(i, 12) * 86); R(x, p.pinta[hash(i, 13) < 0.5 ? 0 : 1], xx, yy, hash(i, 14) < 0.3 ? 2 : 1, 1); }
    for (const gy of [32, 48, 62, 80]) for (let xx = 0; xx < 256; xx++) if (hash(xx >> 3, gy) < 0.6) R(x, p.marca, xx, gy, 1, 1);
    R(x, p.sombra, 0, 9, 256, 2);
    for (let px = 0; px < 256; px += 16) { if (hash(px, 71) < 0.3) continue; R(x, p.trilho, px, 2 + (hash(px, 72) < 0.3 ? 3 : 0), 2, 8); }
    for (let px = 0; px < 256; px += 16) if (hash(px, 73) < 0.6) R(x, p.trilho, px, 2 + Math.round(hash(px, 74) * 2), 16 - Math.round(hash(px, 75) * 7), 2);
    for (let k = 0; k < 10; k++) elip(x, '#3a2618', hash(k, 81) * 256, 20 + hash(k, 82) * 70, 6 + hash(k, 83) * 6, 2 + hash(k, 84) * 1.5);
    R(x, tom(t[2], 0.88), 0, 96, 256, 4);
    return c;
  })();
  const frente = (() => {
    const [c, x] = tela(320, 20);
    R(x, '#3a2a1a', 0, 5, 320, 15);
    for (let px = 0; px < 320; px += 32) R(x, '#2a1d14', px + 4, 0, 2, 8);
    for (let xx = 0; xx < 320; xx++) { const y = 2 + Math.round(Math.abs(((xx % 8) - 4)) / 2); R(x, '#8a8680', xx, y, 1, 1); if (xx % 8 === 3) R(x, '#b8b4ae', xx, y - 1, 1, 3); }
    for (let fila = 0; fila < 2; fila++) for (let px = (fila ? -6 : 0); px < 320; px += 13) { const y = 9 + fila * 5; elip(x, '#6e5a38', px + 6, y + 1, 6.5, 2.6); elip(x, '#a8905e', px + 6, y, 6, 2.2); R(x, '#c9b07a', px + 3, y - 2, 6, 1); }
    return c;
  })();
  const torcida = [];
  FILEIRAS.forEach((py, k) => { for (let px = 1; px < 256; px += ASSENTO) { if (hash(px, k * 7) < 0.14) continue; torcida.push({ px, py, cor: GENTE[Math.floor(hash(px, k + 50) * GENTE.length)], pele: PELE[Math.floor(hash(px, k + 90) * PELE.length)], topo: hash(px, k + 5) < 0.6 ? ['#2a1d17', '#4a2c1a', '#141414', '#8a5a2a', '#d9b26a'][Math.floor(hash(px, k + 6) * 5)] : null, fuga: hash(px, k + 77), fase: hash(px, k + 3) * T2 }); } });
  BG = {
    fundo, longe, meio, arq, pista, frente, torcida,
    nuvens: Array.from({ length: 6 }, (_, i) => ({ x: i * 80 + hash(i, 1) * 50, y: 6 + Math.floor(hash(i, 2) * 34), v: 2 + hash(i, 3) * 4, w: 40 + Math.floor(hash(i, 4) * 30) })),
    colunas: Array.from({ length: 7 }, (_, i) => ({ x: i * 70 + hash(i, 40) * 40, base: 50 + hash(i, 41) * 14, limiar: 0.1 + i * 0.1, larg: 1 + hash(i, 42) })),
  };
  return BG;
}
function azulejo(c, img, off, y, W) { const w = img.width; off = Math.round(off); for (let x = -(((off % w) + w) % w); x < W; x += w) c.drawImage(img, x, y); }
function nuvem(c, x, y, w, cores) {
  R(c, cores[1], x + 5, y + 12, w - 10, 4);
  for (let cx = 8, k = 0; cx < w - 8; k++) { const rr = 3 + Math.floor(hash(k, w) * 4); bola(c, cores[1], x + cx, y + 14 - rr, rr); bola(c, cores[0], x + cx, y + 13 - rr, rr); cx += rr + 2; }
}

const ESTILO = `
.gxc-ataque{position:absolute;left:50%;bottom:calc(var(--s)*4.4px);transform:translateX(-50%) scale(.4);opacity:0;pointer-events:none;transition:opacity .5s,transform .6s cubic-bezier(.2,1.6,.4,1);display:flex;align-items:center;gap:calc(var(--s)*4px);z-index:6}
.gxc-ataque.on{opacity:1;transform:translateX(-50%) scale(1);pointer-events:auto}
.gxc-bt{position:relative;white-space:nowrap;font-family:PS2P,monospace;font-size:calc(var(--s)*7px);color:#fff;padding:calc(var(--s)*4.8px) calc(var(--s)*8.8px);border:calc(var(--s)*1.6px) solid #ffd24a;border-radius:calc(var(--s)*4px);background:repeating-linear-gradient(-45deg,#d4161c 0 calc(var(--s)*5.6px),#a50d12 calc(var(--s)*5.6px) calc(var(--s)*11.2px));text-shadow:0 calc(var(--s)*1.2px) 0 #000;box-shadow:0 calc(var(--s)*2.8px) 0 #5a0508,0 0 0 calc(var(--s)*1.6px) #000,0 0 calc(var(--s)*12px) #ff3b1f88;cursor:pointer;animation:gxc-chama .7s ease-in-out infinite;touch-action:manipulation;user-select:none}
.gxc-bt:active{transform:translateY(calc(var(--s)*1.6px));box-shadow:0 calc(var(--s)*1px) 0 #5a0508,0 0 0 calc(var(--s)*1.6px) #000,0 0 calc(var(--s)*16px) #ff6a1fcc}
@keyframes gxc-chama{50%{filter:brightness(1.3)}}
.gxc-med{background:#000c;border-radius:calc(var(--s)*2.8px);padding:calc(var(--s)*2.4px) calc(var(--s)*4px);width:calc(var(--s)*118px);font-family:Pixelify,system-ui,sans-serif;color:#fff}
.gxc-med .l{display:flex;justify-content:space-between;align-items:baseline;font-size:calc(var(--s)*5.2px);gap:calc(var(--s)*4px);white-space:nowrap}
.gxc-med .l b{color:var(--acc,#ffd24a);font-weight:normal}
.gxc-med .nv{font-family:PS2P,monospace;font-size:calc(var(--s)*3.6px);color:#ff8a5a}
.gxc-med .br{height:calc(var(--s)*3.2px);background:#ffffff22;border-radius:calc(var(--s)*1.6px);overflow:hidden;margin-top:calc(var(--s)*2px)}
.gxc-med .br i{display:block;height:100%;width:0;background:linear-gradient(90deg,#ffd24a,#ff5a1a,#c4161c);transition:width .25s}
.gxc-leg{position:absolute;left:8%;right:8%;bottom:9%;text-align:center;font-family:Pixelify,system-ui,sans-serif;font-size:calc(var(--s)*9px);color:#fff;text-shadow:0 calc(var(--s)*1px) 0 #000,0 0 calc(var(--s)*4px) #000;opacity:0;transition:opacity .5s;pointer-events:none;font-style:italic;z-index:6}
.gxc-leg.on{opacity:1}
.gxc-etqs{position:absolute;inset:0;pointer-events:none;z-index:5}
.gxc-etq{position:absolute;transform:translate(-50%,-100%);font-family:Pixelify,system-ui,sans-serif;font-size:calc(var(--s)*4.8px);white-space:nowrap;background:#000c;color:#fff;padding:calc(var(--s)*1px) calc(var(--s)*2.4px);border-radius:calc(var(--s)*1.6px);border:calc(var(--s)*.5px) solid #ff5a4a;animation:gxc-etq 2.6s ease-out forwards}
@keyframes gxc-etq{0%{opacity:0;margin-top:calc(var(--s)*4px)}12%{opacity:1;margin-top:0}75%{opacity:1}100%{opacity:0;margin-top:calc(var(--s)*-8px)}}
.gxc-eu{position:absolute;bottom:calc(var(--s)*12px);width:calc(var(--s)*9px);height:calc(var(--s)*9px);border-radius:50%;display:grid;place-items:center;font-family:PS2P,monospace;font-size:calc(var(--s)*3px);color:#fff;background:#c4161c;border:calc(var(--s)*.6px) solid #fff;animation:gxc-sobe .9s ease-out forwards;pointer-events:none}
@keyframes gxc-sobe{to{transform:translateY(calc(var(--s)*-20px)) scale(.7);opacity:0}}
`;

/**
 * A guerra de uma página de corrida. `o` traz o que é da página:
 *   W, H, X0, L, PAD, SW, SH       as medidas da cena
 *   G()                            o jogo atual (G.cavalos, G.n, G.rec)
 *   laneY(i), quadros(cav), xRec(i, t)
 *   agora()                        o relógio do banco, em ms
 *   enviar(msg)                    para o sistema (avisarSistema)
 *   palco                          o #palco (botão, legenda e etiquetas vão nele)
 *   feed(html, cav), faixa(txt), flash(), tremer(forca, dur), abrir()
 *   musicaCorrida(nome)            a música da página (Som.musica)
 *   somLigado(), volume(), leve()
 *   retangulo()                    o retângulo do canvas da pista, na janela
 *   canvas                         o canvas da pista (os cacos são lidos dele)
 */
export function criarGuerraNaCorrida(o) {
  const { W, H, X0, L, PAD, SW, SH } = o;
  assarFogo();
  if (!document.getElementById('gxc-estilo')) { const st = document.createElement('style'); st.id = 'gxc-estilo'; st.textContent = ESTILO; document.head.appendChild(st); }
  const caixa = document.createElement('div'); caixa.className = 'gxc-ataque';
  caixa.innerHTML = '<button type="button" class="gxc-bt">💣 ATACAR A CORRIDA!</button><div class="gxc-med"><div class="l"><span class="p"><b>0</b> atacando</span><span class="nv">—</span><span class="c"><b>0</b> cliques/s</span></div><div class="br"><i></i></div></div>';
  const leg = document.createElement('div'); leg.className = 'gxc-leg';
  const etqs = document.createElement('div'); etqs.className = 'gxc-etqs';
  o.palco.append(etqs, leg, caixa);
  const $ = s => caixa.querySelector(s);
  let Som = null, violino = null;
  const som = () => { if (!Som) { Som = criarSomGuerra(o.volume()); Som.init(); } Som.volume(o.somLigado() ? o.volume() : 0); return Som; };
  /** O violino desce antes de precisar (a guerra está ligada nesta corrida); a primeira morte só dá o play. */
  const oViolino = () => (violino ??= som().arquivo(VIOLINO.url));
  function pararViolino(seg = VIOLINO.saiS) { violino?.parar(seg); }

  let E = null, rel = 0, recebeuEm = 0;
  let desde = performance.now();
  let S = null;
  function novo(g) {
    for (const e of S?.etiquetas ?? []) e.el.remove();
    S = {
      g, rec: g.rec, n: g.n, tT: null, tG: null, on: null, fase: 'paz', faseT: 0, w: 0, ini: null,
      cav: [], ordem: null, mortas: 0, proxMorte: 0, sob: null, corpos: [], caidos: [], pePano: null,
      parts: [], expl: [], tracos: [], crateras: [], fogos: [], soldados: [], corredores: [], avioes: [], bombas: [], tanque: null, cinzas: [], claroes: [], rachas: [], rachaJ: null, etiquetas: [],
      buffer: 0, voando: 0, cliques: [], envio: 0, comecouLocal: null, I: 0, cps: 0, evAcc: 0, pressaoAnt: null, cpsFora: 0,
      camAgora: 0, camG: null, shake: 0, flash: 0, preto: 0, lento: 0, ultLento: -9, feitos: new Set(), B: null, camFixa: null, camVolta: 0,
      fimMs: null, retomada: null, avisouChefe: false, avisouVolta: false, abortou: false, xSob: null,
    };
    leg.classList.remove('on'); caixa.classList.remove('on');
  }
  const uma = (k, fn) => { if (S.feitos.has(k)) return; S.feitos.add(k); fn(); };
  const legenda = txt => { if (!txt) { leg.classList.remove('on'); return; } leg.textContent = txt; leg.classList.add('on'); };
  const leve = () => !!o.leve();
  /** PC folgado (a página diz): um pouco mais de cinza, brasa e destroço. */
  const forte = () => !leve() && !!o.forte?.();
  const chama = (c, x, y, tier, off = 0, v = 0, pal = 'fogo') => chamaF(c, x, y, tier, rel, off, v, pal);
  const tremula = s => tremulaF(rel, s);
  const luz = (c, x, y, k, a, somar = false) => { if (!leve()) luzF(c, x, y, k, a, somar); };
  const nomeDe = cav => cav?.dono?.nome ?? null;

  /* ---------- as contas de tempo ---------- */
  /** A primeira vez que o líder passa da fração `f` da prova, no segundo da gravação. */
  function tempoDaFracao(rec, n, f) {
    const alvo = X0 + f * (L - X0);
    for (let k = 0; k < rec.frames; k++) for (let i = 0; i < n; i++) if (X0 + rec.X[k * n + i] / 4 >= alvo) return k / 30;
    return rec.tVenc;
  }
  function preparar() {
    const g = o.G(); if (!g?.rec) return false;
    if (!S || S.g !== g || S.rec !== g.rec) novo(g);
    if (S.tG == null) { S.tT = tempoDaFracao(S.rec, S.n, TRANSICAO_FRACAO); S.tG = tempoDaFracao(S.rec, S.n, GUERRA.inicioFracao); }
    return true;
  }
  const comecou = () => ms(E?.comecou_em) ?? S.comecouLocal;
  const ligada = () => !!E?.ligada;
  /** O segundo da gravação para o segundo do relógio da corrida. Igual para o laço e para o seguirRelogio. */
  function tempo(bruto) {
    if (!preparar() || bruto < S.tG) return bruto;
    if (S.on === false || (S.on == null && !ligada())) return bruto;
    if (S.ini == null) S.ini = o.agora() / 1000 - bruto;
    const fim = fimDaGuerra();
    if (fim == null || o.agora() < fim) return S.tG;
    return retomada() + (bruto - (fim / 1000 - S.ini));
  }
  /** Quando a corrida volta, no relógio do banco (ou nulo, se ainda não se sabe). */
  function fimDaGuerra() {
    if (S.fimMs != null) return S.fimMs;
    const f = ms(E?.caiu_em) ?? ms(E?.expira_em);
    if (f != null && (ms(E?.caiu_em) != null || o.agora() >= f)) return f + FIM_S * 1000;
    return null;
  }
  /** O segundo da gravação em que o sobrevivente está onde a guerra o deixou. */
  function retomada() { return S.rec.tVenc; }

  /* ---------- os cavalos na guerra (x é o da anca, como no laboratório: o focinho é x + 43) ---------- */
  function iniciarCavalos() {
    const lanes = Array.from({ length: S.n }, (_, i) => o.laneY(i));
    S.lanes = lanes;
    S.cav = o.G().cavalos.map((cav, i) => ({ cav, i, x: o.xRec(i, S.tG) - 43, y: lanes[i], ly: lanes[i], v: 40, fg: Math.random(), ritmo: Math.random() * 10, vivo: true, condenado: false, morte: null, dir: 1, pose: 'g', pulo: 0 }));
    S.ordem = ordemDasMortes(S.rec.seed >>> 0, S.n, S.rec.vencedor);
  }
  const vivos = () => S.cav.filter(h => h.vivo);
  function xAt(i, t) {
    if (!S || !S.cav.length || S.fase === 'paz' || S.fase === 'transicao') return o.xRec(i, t);
    const h = S.cav[i];
    if (S.fase === 'depois') {
      if (i === S.rec.vencedor) return o.xRec(i, t);
      const cp = S.corpos.find(c => c.cav === h.cav);
      return (cp ? cp.x : h.x) + 43;
    }
    return h.x + 43;
  }
  /** A câmera da guerra (nula: a da página). */
  function cam(t, daPagina) {
    let c = null;
    if (S?.cav.length) {
      if (S.fase === 'ataque' || (S.fase === 'filme' && !S.feitos.has('luto'))) c = S.camG;
      else if (S.fase === 'filme' || S.fase === 'chefe' || S.fase === 'final') c = S.camFixa;
      else if (S.fase === 'depois') { const alvo = clamp(o.xRec(S.rec.vencedor, t) - 248, 0, L - 300), u = suave(S.camVolta); c = lerp(S.camFixa ?? alvo, alvo, u); }
    }
    if (c == null) c = daPagina(t);
    if (S) S.camAgora = c;
    return c;
  }

  /* ---------- as mortes (o laboratório de 22/10/2026, segunda versão) ---------- */
  function poeira(x, y, w = 0, n = 1) { for (let k = 0; k < n; k++) S.parts.push({ x: x + entre(-3, 3), y: y - 1, vx: entre(-30, -6), vy: entre(-14, -4), g: 20, vida: entre(0.3, 0.6), max: 0.6, cor: w > 0.5 ? '#6e5640' : '#e2c398', tam: Math.random() < 0.4 ? 2 : 1 }); }
  function sangue(x, y, n) { for (let k = 0; k < n; k++) S.parts.push({ x, y, vx: entre(-50, 50), vy: entre(-90, -20), g: 260, vida: entre(0.4, 0.8), max: 0.8, cor: sorteio(['#b3161c', '#8e0f14', '#d42a2a']), tam: Math.random() < 0.3 ? 2 : 1, chao: y + 16 }); }
  function faisca(x, y) { for (let k = 0; k < 4; k++) S.parts.push({ x, y, vx: entre(-40, 40), vy: entre(-50, -10), g: 200, vida: 0.2, max: 0.2, cor: '#ffe07a', tam: 1 }); }
  function matar(h, tipo) {
    h.condenado = true; h.condT = rel;
    const msg = { tiro: '🔫 Uma rajada derrubou', morteiro: '💣 Um morteiro acertou', soldado: '🪖 Um soldado derrubou', aviao: '✈️ O bombardeio acertou', tanque: '💥 O tanque acertou' }[tipo];
    const dono = nomeDe(h.cav);
    h.msg = `${msg} o <b>#${h.cav.num}</b>${dono ? ` <i>(de ${esc(curto(dono))})</i>` : ''}`;
    if (tipo === 'tiro') { const ss = S.soldados.filter(s => !s.sai).slice(0, 3); ss.forEach(s => { s.alvoH = h; s.rajada = 0.45; }); som().rajada(6); if (!ss.length) morrer(h, 'rajada'); }
    if (tipo === 'morteiro') cair(h.x + 23, h.y, h);
    if (tipo === 'soldado') S.corredores.push({ x: clamp(h.x - S.camAgora + 10, 20, W - 20), y: 232, h, fase: 'corre', t: 0 });
    if (tipo === 'aviao') { S.avioes.push({ x: -30, y: entre(16, 34), v: 170, alvo: h, solto: false }); som().aviao(); }
    if (tipo === 'tanque') { if (S.tanque) S.tanque.alvoH = h; else cair(h.x + 23, h.y, h); }
  }
  function morrer(h, anim) {
    if (h.morte) return;
    h.morte = { anim, t: 0, rot: 0, yo: 0, giro: sorteio([-1, 1]), hits: 0, slide: 0, char: 0, pose: 'g', flash: 0 };
    som().relincho();
    if (rel - S.ultLento > 2.5) { S.lento = 0.55; S.ultLento = rel; }
    for (const v of vivos()) if (v !== h && !v.morte && Math.abs(v.x - h.x) < 50) { v.pulo = 1; v.ly = sorteio(S.lanes); }
    if (h.msg) o.feed(h.msg, h.cav);
  }
  function animarMorte(h, dt) {
    const m = h.morte; m.t += dt; const t = m.t; m.flash = Math.max(0, m.flash - dt);
    if (m.anim === 'rajada') {
      const TIROS = [0, 0.13, 0.27, 0.42];
      while (m.hits < TIROS.length && t >= TIROS[m.hits]) { m.hits++; h.x -= 2.5; m.flash = 0.06; sangue(h.x + entre(12, 34), h.y - entre(10, 22), 7); som().acerto(); }
      if (t < 1.0) {
        m.pose = 'g'; h.v = Math.max(30, h.v - 40 * dt); h.x += h.v * dt * 0.5; h.fg += dt * h.v / 30;
        const u = suave((t - 0.45) / 0.55); m.rot = 0.55 * u; m.yo = 5 * u;
        if (u > 0.3 && Math.random() < dt * 25) poeira(h.x + 36, h.y, 1);
      } else {
        if (!m.caiu) { m.caiu = true; m.slide = h.v * 0.9; poeira(h.x + 24, h.y, 1, 12); S.shake = Math.max(S.shake, 1.5); som().baque(); }
        m.pose = 'm'; m.slide = Math.max(0, m.slide - 70 * dt); h.x += m.slide * dt;
        const u = clamp((t - 1) / 0.3, 0, 1); m.rot = 0.2 * (1 - u); m.yo = -3 * Math.sin(Math.PI * u);
        if (m.slide > 5 && Math.random() < dt * 30) poeira(h.x + 6, h.y, 1);
        if (t >= 1.7) virarCorpo(h);
      }
    } else if (m.anim === 'explosao') {
      if (t < 1.0) {
        m.pose = 'g'; h.x += 30 * dt; m.rot = m.giro * T2 * 1.15 * t; m.yo = -(170 * t - 170 * t * t); m.char = Math.min(0.6, t * 0.9);
        if (Math.random() < dt * 30) S.parts.push({ x: h.x + 24, y: h.y - 16 + m.yo, vx: entre(-8, 8), vy: entre(-10, 0), g: -4, vida: 1, max: 1, cor: 'fumaca', tam: 2 });
        if (Math.random() < dt * 24) S.parts.push({ x: h.x + entre(12, 36), y: h.y - 16 + m.yo, vx: entre(-10, 10), vy: entre(-30, -10), g: 0, vida: 0.4, max: 0.4, cor: 'fogo', tam: 1 });
      } else {
        if (!m.caiu) { m.caiu = true; poeira(h.x + 24, h.y, 1, 14); S.shake = Math.max(S.shake, 3); som().baque(); }
        m.pose = 'm'; const u = clamp((t - 1) / 0.35, 0, 1); m.rot = m.giro * 0.25 * (1 - u); m.yo = -7 * Math.sin(Math.PI * u);
        if (t >= 1.5) virarCorpo(h, true);
      }
    } else {
      if (t < 0.35) { m.pose = 'g'; m.rot = -0.6 * suave(t / 0.35); h.fg += dt * 2; h.x += 10 * dt; if (!m.rel) { m.rel = true; som().relincho(true); } }
      else if (t < 0.8) { m.pose = 'g'; const u = suave((t - 0.35) / 0.45); m.rot = lerp(-0.6, 0.35, u); m.yo = 6 * u; }
      else {
        if (!m.caiu) { m.caiu = true; poeira(h.x + 24, h.y, 1, 12); S.shake = Math.max(S.shake, 2); som().baque(); }
        m.pose = 'm'; const u = clamp((t - 0.8) / 0.3, 0, 1); m.rot = 0.12 * (1 - u); m.yo = -3 * Math.sin(Math.PI * u);
        if (t >= 1.3) virarCorpo(h);
      }
    }
  }
  function virarCorpo(h, queimado = false, quieto = false) {
    h.vivo = false; h.morte = null;
    S.corpos.push({ cav: h.cav, x: h.x, y: h.y, poca: quieto ? 1 : 0, queimado, chamas: queimado ? 5 : 0, alma: quieto ? 99 : 0 }); S.caidos.push({ cav: h.cav, queimado });
    if (!quieto) etiqueta(h);
  }
  function etiqueta(h) {
    const el = document.createElement('div'); el.className = 'gxc-etq'; const dono = nomeDe(h.cav);
    el.textContent = `☠ #${h.cav.num}${dono ? ` · ${curto(dono)}` : ''}`;
    etqs.appendChild(el); S.etiquetas.push({ el, x: h.x + 24, y: h.y - 22, t: 0 });
  }
  function cair(x, y, h) { S.bombas.push({ x, y: -10, alvoY: y, vy: 60, h }); som().assobio(); }
  function atirar(s, tx, ty) { s.fogo = 0.08; const sx = s.x + 7 + S.camAgora, sy = s.y - 10; S.tracos.push({ x0: sx, y0: sy, x1: tx, y1: ty, t: 0 }); faisca(tx, ty); som().tiro(0.8); }
  function explodir(x, y, r = 1, h = null) {
    S.expl.push({ x, y, r, t: 0, dur: 0.75 + 0.3 * r });
    S.shake = Math.max(S.shake, 3 * r); som().explosao(0.6 + r * 0.6);
    if (y > 128) S.crateras.push({ x, y: y + 1, r: 5 + 5 * r });
    for (let k = 0; k < (leve() ? 5 : forte() ? 16 : 12) * r; k++) S.parts.push({ x, y: y - 3, vx: entre(-60, 60) * r, vy: entre(-120, -40) * r, g: 260, vida: entre(0.5, 1), max: 1, cor: sorteio(['#5a3a24', '#3a2618', '#7e5a3e']), tam: Math.random() < 0.3 ? 2 : 1 });
    explosaoFogo(S.parts, x, y, r * (leve() ? 0.5 : 0.8));
    if (Math.random() < 0.5) S.fogos.push({ x: x + entre(-4, 4), y: y + 1, vida: entre(3, 6) });
    for (const v of vivos()) if (!v.morte && Math.abs(v.x + 23 - x) < 30) { v.ly = sorteio(S.lanes); v.pulo = 1; }
    if (h && !h.morte) morrer(h, 'explosao');
  }
  function eventoAmbiente() {
    const vv = vivos().filter(h => !h.morte); if (!vv.length) return;
    const h = sorteio(vv), I = S.I, ex = h.x + 23 + sorteio([-1, 1]) * entre(16, 44), ey = clamp(h.y + entre(-14, 14), 132, 202), r = Math.random();
    if (I >= 0.45 && r < 0.18 && S.avioes.length < 2) { S.avioes.push({ x: -30, y: entre(14, 40), v: entre(140, 170), alvo: null, solto: false }); som().aviao(); return; }
    if (I >= 0.35 && r < 0.45) { cair(ex, ey, null); return; }
    if (I >= 0.2 && r < 0.7) { explodir(ex, ey, 0.55); return; }
    const s = sorteio(S.soldados.filter(s2 => !s2.sai && s2.y < 220)); if (s) atirar(s, ex, ey - 6);
  }

  /* ---------- o botão ---------- */
  $('.gxc-bt').addEventListener('pointerdown', e => {
    e.preventDefault();
    if (!S || S.fase !== 'ataque') return;
    S.buffer++; S.cliques.push(rel); som().tiro(0.6);
    const vv = vivos().filter(h => !h.morte); if (vv.length && S.soldados.length) { const s = sorteio(S.soldados.filter(x => !x.sai)); const h = sorteio(vv); if (s) atirar(s, h.x + 24 + entre(-14, 14), h.y - entre(0, 18)); }
    const el = document.createElement('span'); el.className = 'gxc-eu'; el.textContent = 'EU'; el.style.left = `${entre(4, 30)}%`; caixa.appendChild(el); setTimeout(() => el.remove(), 900);
  });
  const MED = {};
  const porNo = (sel, v, larg = false) => { if (MED[sel] === v) return; MED[sel] = v; const el = $(sel); if (larg) el.style.width = v; else el.innerHTML = v; };
  function medidor() {
    const pessoas = Math.max(E?.atacando ?? 0, S.cliques.length ? 1 : 0);
    porNo('.p', `<b>${pessoas}</b> atacando`);
    porNo('.c', `<b>${Math.round(S.cps)}</b> cliques/s`);
    porNo('.nv', S.cps < 0.5 ? 'calmaria' : S.I < 0.3 ? 'TIROTEIO' : S.I < 0.55 ? 'COMBATE' : S.I < 0.8 ? 'BOMBARDEIO' : 'GUERRA TOTAL');
    porNo('.br i', `${Math.round(100 * S.mortas / Math.max(1, S.n - 1))}%`, true);
  }
  function enviar(forcar = false) {
    if (S.fase !== 'ataque' && !forcar) return;
    const n = Math.min(GUERRA.maxCliquesPorEnvio, S.buffer); S.buffer -= n; S.voando += n;
    o.enviar({ tipo: 'guerra-atacar', cliques: n });
  }

  /* ---------- as fases ---------- */
  function mudar(f) {
    S.fase = f; S.faseT = 0;
    if (f === 'ataque') {
      S.comecouLocal = o.agora(); o.abrir(); o.musicaCorrida(null); som().musica('guerra');
      caixa.classList.add('on'); o.flash(); o.tremer(2.2, 0.6); som().explosao(1.4);
      o.faixa('⚠ A CORRIDA VIROU GUERRA!');
      const lider = S.cav.reduce((a, b) => (b.x > a.x ? b : a));
      explodir(lider.x + 70, lider.y - 4, 1.2);
      enviar(true); S.envio = rel;
      // quem chega atrasado: os que já caíram viram corpo na hora
      const ja = alvoDeMortes();
      if (ja > 2) for (; S.mortas < ja - 1; S.mortas++) { const h = S.cav[S.ordem[S.mortas]]; virarCorpo(h, Math.random() < 0.3, true); }
    }
    if (f === 'filme') { caixa.classList.remove('on'); }
    if (f === 'ataque' && S.mortas > 0) tocarViolino();
  }
  function alvoDeMortes() {
    if (E?.sobrou_em) return S.n - 1;
    const alvo = Number(E?.alvo) || alvoDaGuerra(S.n, 1), s = (o.agora() - comecou()) / 1000;
    return mortesPela(pressaoEfetiva(Number(E?.pressao ?? 0) + S.buffer + S.voando, alvo, s), alvo, S.n);
  }
  function montarLuto() {
    const base = Math.round(S.camFixa);
    // os últimos que caíram, em volta; o Pé de Pano no meio, de lado
    const pos = [[14, 152], [44, 198], [252, 150], [330, 194]];
    const ult = S.caidos.slice(-4);
    S.corpos = ult.map((cd, k) => ({ cav: cd.cav, x: base + pos[k][0], y: pos[k][1], poca: 1, queimado: cd.queimado, chamas: cd.queimado ? 99 : 0, alma: 99 }));
    S.pePano = { x: base + 128, y: 190 };
    S.crateras = [[40, 196, 9], [150, 205, 7], [250, 146, 8], [330, 188, 10], [100, 168, 6]].map(([x, y, r]) => ({ x: base + x, y, r }));
    S.fogos = [[44, 196], [262, 146], [336, 189], [8, 170]].map(([x, y]) => ({ x: base + x, y, vida: 999 }));
    S.expl = []; S.bombas = []; S.avioes = []; S.tracos = []; S.soldados = []; S.corredores = []; S.tanque = null;
    for (const e of S.etiquetas) e.el.remove(); S.etiquetas = [];
    const s = S.sob; s.x = base + 300; s.y = 184; s.dir = -1; s.v = 0; s.pose = 'a'; s.morte = null; s.manchas = true; s.vivo = true;
    for (const h of S.cav) if (h !== s) h.vivo = false;
  }
  /** O violino: entra no primeiro cavalo caído e sobe com a guerra (o tempo dela ou as mortes, o que andou mais). */
  function tocarViolino() { uma('violino', () => { som().musica(null); oViolino().tocar(VIOLINO.de); }); }
  function subirViolino() {
    if (!S.feitos.has('violino') || !violino) return;
    const u = clamp(Math.max((o.agora() - comecou()) / 1000 / GUERRA.maxS, S.mortas / Math.max(1, S.n - 1)), 0, 1);
    violino.nivel(lerp(VIOLINO.de, VIOLINO.ate, u));
  }
  /** A volta é perto da linha de chegada: a câmera vai para lá e leva junto o que estava no chão. */
  function irParaAChegada() {
    const nova = L - CHEGADA_NA_TELA, d = nova - (S.camFixa ?? nova);
    for (const lista of [S.corpos, S.crateras, S.fogos]) for (const k of lista) k.x += d;
    if (S.pePano) S.pePano.x += d;
    S.camFixa = nova;
  }
  function criarRachas() {
    const s = S.sob; S.rachas = [];
    for (let k = 0; k < 7; k++) {
      let x = s.x + 22, y = s.y + 1, a = (k / 7) * Math.PI + entre(-0.2, 0.2); const pts = [[x, y]];
      for (let j = 0; j < 9; j++) { a += entre(-0.5, 0.5); x += Math.cos(a) * entre(6, 12); y += Math.sin(a) * entre(1, 3) * (k < 3 ? -1 : 1) * 0.6; pts.push([x, clamp(y, 128, 214)]); }
      S.rachas.push(pts);
    }
  }
  function criarRachaJanela() {
    const cx = 200 + entre(-20, 20), cy = 70; S.rachaJ = [];
    for (let k = 0; k < 12; k++) { let a = k / 12 * T2 + entre(-0.2, 0.2), x = cx, y = cy; const pts = [[x, y]]; for (let j = 0; j < 8; j++) { a += entre(-0.3, 0.3); x += Math.cos(a) * entre(10, 22); y += Math.sin(a) * entre(10, 22); pts.push([x, y]); } S.rachaJ.push(pts); }
  }
  const novoChefe = () => ({ x: 0, y: 0, dir: 1, modo: 'parado', p: 0, by: 0, cab: 0, jaw: 0, rot: 0, flash: 0, furia: 0, feridas: [] });

  /** O laço: a página chama a cada quadro da corrida, com o segundo do relógio dela. */
  function passo(bruto, dt) {
    if (!preparar()) return;
    rel += dt; S.faseT += dt;
    if (S.on === false) return;
    if (ligada()) oViolino();
    if (S.on == null) {
      if (bruto < S.tT) return;
      // desligada de verdade só com o estado na mão (ou depois de esperar por ele)
      if (!ligada()) { if (bruto >= S.tG && (E != null || performance.now() - desde > 4000)) S.on = false; return; }
    }
    const agora = o.agora();
    if (S.ini == null && bruto >= S.tG) S.ini = agora / 1000 - bruto;
    // a transição: o cenário muda aos poucos, com a corrida ainda andando
    if (S.fase === 'paz') {
      // a surpresa: até aqui a corrida era normal; a tela cheia abre sozinha com as explosões ao longe
      S.on = true; uma('ampliar', () => o.ampliar?.());
      if (bruto < S.tG) S.fase = 'transicao'; else entrar(agora);
    }
    if (S.fase === 'transicao') {
      S.w = W_ATAQUE * suave((bruto - S.tT) / Math.max(1, S.tG - S.tT));
      if (S.w > 0.25) uma('t1', () => o.feed('💥 Explosões ao longe…'));
      if (Math.random() < dt * 0.8 * S.w) S.claroes.push({ x: Math.random() * W, y: 56 + Math.random() * 14, t: 0, r: entre(6, 14) });
      if (bruto >= S.tG) entrar(agora);
    }
    if (S.fase === 'ataque') {
      S.w = Math.min(1, S.w + dt * 0.08);
      // o ritmo: os meus cliques e os dos outros (a pressão do banco subindo)
      S.cliques = S.cliques.filter(k => rel - k < 2);
      S.cps = S.cliques.length / 2 + S.cpsFora;
      S.I = clamp(Math.sqrt(S.cps / 30), 0, 1);
      if (rel - S.envio >= GUERRA.envioMs / 1000) { S.envio = rel; enviar(); }
      if (S.cps > 0.3) S.evAcc += dt * (0.4 + 7 * S.I); else S.evAcc += dt * 0.25;
      while (S.evAcc >= 1) { S.evAcc--; eventoAmbiente(); }
      const quer = S.cps > 0.3 ? Math.round(2 + 7 * S.I) : 2, SLOTS = [26, 68, 112, 158, 204, 250, 296, 342, 384];
      while (S.soldados.filter(s => !s.sai).length < quer) { const livre = SLOTS.find(x => !S.soldados.some(s => s.slot === x && !s.sai)); if (livre === undefined) break; S.soldados.push({ slot: livre, x: livre, y: 238, alvoY: 214, cool: entre(0.3, 1.2), fogo: 0, dir: 1, sai: false }); }
      if (S.I >= 0.65 && !S.tanque) S.tanque = { x: -40, alvoX: entre(20, 60), cool: 1.5, recuo: 0 };
      // as mortes: quantas pela pressão (igual em toda tela), quem pela semente
      const alvoM = alvoDeMortes(), atraso = alvoM - S.mortas > 2 ? 0.45 : 1.1;
      if (S.mortas < alvoM && rel >= S.proxMorte) {
        const h = S.cav[S.ordem[S.mortas]]; S.mortas++; S.proxMorte = rel + atraso; tocarViolino();
        const tipos = S.I >= 0.45 ? ['tiro', 'morteiro', 'soldado', 'aviao', ...(S.tanque ? ['tanque', 'tanque'] : [])] : ['tiro', 'soldado', 'tiro', 'morteiro'];
        matar(h, sorteio(tipos));
      }
      for (const h of vivos()) if (h.condenado && !h.morte && rel - h.condT > 3) morrer(h, 'rajada');
      medidor(); subirViolino();
      // o banco disse que sobrou um: o filme começa
      const sobrou = ms(E?.sobrou_em);
      if (sobrou != null && agora >= sobrou) {
        for (const h of S.cav) if (h.i !== S.rec.vencedor && h.vivo && !h.condenado) matar(h, 'tiro');
        S.sob = S.cav[S.rec.vencedor]; S.camFixa = S.camG ?? S.camAgora;
        mudar('filme'); o.feed(`☠ Só o <b>#${S.sob.cav.num}</b> ficou de pé.`, S.sob.cav);
      } else if ((agora - comecou()) / 1000 > GUERRA.maxS + 12 && !S.abortou) {
        // o banco sumiu: a corrida não fica parada para sempre
        S.abortou = true; for (const h of S.cav) if (h.i !== S.rec.vencedor && h.vivo) virarCorpo(h, false, true);
        S.sob = S.cav[S.rec.vencedor]; S.camFixa = S.camG ?? S.camAgora; S.fimMs = agora + (PARADO_S + CAMINHA_S) * 1000; S.fase = 'final'; S.faseT = 0; caixa.classList.remove('on'); som().musica(null); pararViolino();
        irParaAChegada(); S.sob.x = S.camFixa + VOLTA_NA_TELA; S.sob.y = 192; S.sob.dir = 1; S.sob.pose = 'p';
        legenda('Cessar-fogo.');
      }
    }
    if (S.fase === 'filme') filme(agora, dt);
    if (S.fase === 'chefe') {
      const fim = ms(E?.caiu_em) ?? (ms(E?.expira_em) != null && agora >= ms(E.expira_em) ? ms(E.expira_em) : null);
      if (fim != null && agora >= fim + VOLTA_S * 1000) {
        S.fimMs = fim + FIM_S * 1000; S.fase = 'final'; S.faseT = 0;
        uma('volta', () => o.enviar({ tipo: 'guerra-volta' }));
        irParaAChegada();
        const s = S.sob; s.x = S.camFixa + VOLTA_NA_TELA; s.y = 192; s.dir = 1; s.pose = 'p'; s.verm = 0; s.tremor = 0; s.manchas = true; s.vivo = true; S.w = 0.75; S.rachaJ = null; S.rachas = []; S.B = null;
        legenda(E?.caiu_em ? 'A maldição se quebrou.' : 'Ele voltou a ser cavalo… por enquanto.');
        som().musica(null);
      }
    }
    if (S.fase === 'final') {
      S.preto = Math.max(0, 1 - S.faseT / 0.6);
      // parado um instante, e depois devagar até a linha: chega nela no segundo exato da volta (igual em toda tela)
      const s = S.sob, u = clamp((S.faseT - PARADO_S) / CAMINHA_S, 0, 1), x0 = S.camFixa + VOLTA_NA_TELA, x1 = L - 43;
      if (u > 0) { const x = lerp(x0, x1, u); s.fg += Math.max(0, x - s.x) / 14; s.x = x; s.pose = u < 1 ? 'a' : 'p'; uma('cruza', () => legenda(`O #${s.cav.num} vai até a linha. Sozinho.`)); }
      S.w = Math.max(0.3, S.w - dt * 0.08);
      if (S.fimMs != null && agora >= S.fimMs) {
        S.fase = 'depois'; S.faseT = 0; S.camVolta = 0; legenda('');
        o.musicaCorrida('corrida'); o.faixa(`#${S.sob.cav.num} VOLTA A CORRER!`);
      }
    }
    if (S.fase === 'depois') { S.camVolta = Math.min(1, S.camVolta + dt); S.w = Math.max(0, S.w - dt * 0.25); if (S.w <= 0 && S.faseT > 6) Som?.musica(null); }
    andar(dt);
    seguirComCamera(dt);
    efeitos(dt);
  }
  /** Na guerra a câmera vai com o pelotão (sem o fim da pista); no cessar-fogo, com quem sobrou. */
  function seguirComCamera(dt) {
    if (!(S.fase === 'ataque' || (S.fase === 'filme' && !S.feitos.has('luto')))) return;
    const vv = S.cav.filter(h => h.vivo && !h.morte);
    if (!vv.length) return;
    const alvo = S.fase === 'ataque' ? vv.reduce((s, h) => s + h.x, 0) / vv.length - 180 : (S.sob ?? vv[0]).x - 220;
    S.camG = S.camG == null ? S.camAgora : S.camG + (alvo - S.camG) * Math.min(1, dt * 2.5);
  }
  /**
   * A guerra começa nesta tela. Quem chega com ela andando entra no ponto dela: no
   * filme, no chefe (a janela vai direto para a página) ou depois (a corrida segue).
   */
  function entrar(agora) {
    iniciarCavalos(); S.w = W_ATAQUE; S.comecouLocal = agora;
    const fim = fimDaGuerra(), sobrou = ms(E?.sobrou_em), solta = ms(E?.solta_em);
    const quietos = () => { for (const h of S.cav) if (h.i !== S.rec.vencedor && h.vivo) virarCorpo(h, Math.random() < 0.3, true); S.mortas = S.n - 1; S.sob = S.cav[S.rec.vencedor]; S.camFixa = S.camAgora; };
    if (fim != null && agora >= fim) { quietos(); S.fase = 'depois'; S.faseT = 0; S.camVolta = 1; S.w = 0.3; S.xSob = null; return; }
    if (solta != null && agora >= solta) { quietos(); montarLuto(); for (const k of ['cessar', 'luto', 'l2', 'l3', 'raiva', 'r1', 'transforma', 'revela']) S.feitos.add(k); S.fase = 'filme'; chefe(); return; }
    if (sobrou != null && agora >= sobrou) { quietos(); S.feitos.add('cessar'); S.fase = 'filme'; S.faseT = 0; o.abrir(); o.musicaCorrida(null); uma('ampliar', () => o.ampliar?.()); return; }
    mudar('ataque');
  }
  function filme(agora, dt) {
    const sf = (agora - ms(E.sobrou_em)) / 1000, parte = parteDoFilme(sf), s = S.sob;
    if (parte === 'cessar') {
      uma('cessar', () => { som().musica(null); pararViolino(); legenda('Cessar-fogo.'); S.soldados.forEach(x => { x.sai = true; }); });
      // os que ainda estavam caindo terminam; quem sobrou para
      for (const h of S.cav) if (h !== s && h.vivo && !h.morte && rel - h.condT > 1.2) morrer(h, 'rajada');
    }
    if (sf >= 3.1) uma('luto', () => { for (const h of S.cav) if (h !== s && h.vivo) virarCorpo(h, false, true); S.camFixa = S.camG ?? S.camAgora; montarLuto(); som().musica('luto'); legenda(`Só o #${s.cav.num} ficou de pé.`); });
    if (parte === 'luto') {
      const t = sf - 3.1, base = Math.round(S.camFixa); S.preto = Math.max(0, 1 - t / 0.8);
      if (t < 3) { s.pose = 'a'; const alvo = base + 190; if (s.x > alvo) { s.x -= 34 * dt; s.fg += dt * 30 / 14; } }
      else if (t < 5.6) { s.pose = 'c'; s.x = base + 190; if (Math.random() < dt * 2.2) S.parts.push({ x: s.x + 6, y: s.y - 12, vx: 0, vy: 10, g: 60, vida: 0.7, max: 0.7, cor: '#7fc8ff', tam: 1, chao: s.y }); if (Math.random() < dt * 0.6) som().choro(); }
      else s.pose = 'p';
      if (t > 3.1) uma('l2', () => legenda('Ele cutuca o Pé de Pano. Nada.'));
      if (t > 5.6) uma('l3', () => legenda('…'));
    }
    if (parte === 'raiva') {
      const t = sf - 10.3;
      uma('raiva', () => { som().musica(null); legenda('Ele não vai perdoar ninguém.'); som().rumor(3.6); criarRachas(); s.dir = 1; });
      s.pose = 'p'; s.verm = clamp(t / 3.2, 0, 0.75); s.tremor = 0.3 + t * 0.6; S.shake = Math.max(S.shake, t * 0.9);
      if (Math.random() < dt * 8) S.parts.push({ x: s.x + 46, y: s.y - 24, vx: entre(4, 14), vy: entre(-14, -6), g: -6, vida: 0.8, max: 0.8, cor: 'vapor', tam: 1.5 });
      if (Math.random() < dt * 1.5 * t) S.claroes.push({ x: Math.random() * W, y: entre(10, 60), t: 0, r: entre(10, 20), raio: true });
      if (t > 1.4) uma('r1', () => som().relincho(true));
    }
    if (parte === 'transforma') {
      uma('transforma', () => { legenda(''); som().brilho(3); S.B = novoChefe(); });
      const t = sf - 13.9; S.shake = Math.max(S.shake, 2 + t * 2);
      for (let k = 0; k < (leve() ? 1 : 3); k++) { const a = Math.random() * T2, r = entre(40, 90), cx = s.x + 24, cy = s.y - 30; S.parts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r * 0.6, vx: -Math.cos(a) * r * 1.6, vy: -Math.sin(a) * r, g: 0, vida: 0.6, max: 0.6, cor: Math.random() < 0.5 ? '#ff5a1a' : '#ffd24a', tam: 1 }); }
    }
    if (parte === 'revela') {
      uma('revela', () => { S.B ??= novoChefe(); S.B.jaw = 1; som().relinchoChefe(1.4); criarRachaJanela(); });
      const t = sf - 16.9; S.B.p += dt; S.shake = Math.max(S.shake, 2 + t * 3);
      if (sf >= 18.05) chefe();
    }
    if (parte === 'chefe') chefe();
  }
  function chefe() {
    if (S.avisouChefe) return;
    S.avisouChefe = true; S.fase = 'chefe'; S.faseT = 0; legenda(''); som().musica(null);
    const r = o.retangulo(), dono = nomeDe(S.sob.cav);
    o.enviar({ tipo: 'guerra-chefe', rect: { left: r.left, top: r.top, width: r.width, height: r.height }, numero: S.sob.cav.num, dono: dono ? curto(dono) : null });
  }
  function andar(dt) {
    const F = S.fase;
    if (F !== 'ataque' && F !== 'filme') return;
    for (const h of S.cav) {
      if (!h.vivo) continue;
      if (h.morte) { animarMorte(h, dt); continue; }
      if (F === 'filme' && S.feitos.has('luto')) { if (h.pose === 'a') h.fg += 0; continue; }
      let alvo;
      // Na guerra eles continuam correndo (o mapa não acaba: a linha de chegada some até a volta).
      if (F === 'ataque') alvo = 55 + 18 * Math.sin(rel * 1.3 + h.ritmo);
      else alvo = h === S.sob ? Math.max(0, 55 - S.faseT * 30) : 0;
      h.v += clamp(alvo - h.v, -90 * dt, 90 * dt);
      h.x += h.v * dt;
      if (F === 'ataque') { if (Math.random() < dt * 0.5) h.ly = sorteio(S.lanes) + entre(-2, 2); h.y += clamp(h.ly - h.y, -22 * dt, 22 * dt); }
      if (h.pulo > 0) h.pulo = Math.max(0, h.pulo - dt * 4);
      if (Math.abs(h.v) > 22) { h.pose = 'g'; h.fg += dt * Math.abs(h.v) / 22; } else if (Math.abs(h.v) > 3) { h.pose = 'a'; h.fg += dt * Math.abs(h.v) / 14; } else h.pose = 'p';
      if (Math.abs(h.v) > 20 && Math.random() < dt * 6) poeira(h.x + 6, h.y, S.w);
    }
  }
  function efeitos(dt) {
    const camA = S.camAgora ?? 0;
    for (const p of S.parts) { p.vida -= dt; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.chao && p.y > p.chao) { p.y = p.chao; p.vx = 0; p.vy = 0; p.g = 0; } if (p.cor === 'fumaca' || p.cor === 'vapor') p.tam += dt * 3; }
    poda(S.parts, p => p.vida > 0); const cap = leve() ? 260 : 700; if (S.parts.length > cap) S.parts.splice(0, S.parts.length - cap);
    for (const e of S.expl) e.t += dt; poda(S.expl, e => e.t < e.dur);
    for (const t of S.tracos) t.t += dt; poda(S.tracos, t => t.t < 0.07);
    for (const f of S.fogos) { f.vida -= dt; if (!leve() && Math.random() < dt * 6) S.parts.push({ x: f.x + entre(-2, 2), y: f.y - 3, vx: entre(-3, 3), vy: entre(-25, -12), g: 0, vida: 0.5, max: 0.5, cor: 'brasa', tam: 1 }); }
    poda(S.fogos, f => f.vida > 0);
    for (const cp of S.corpos) {
      cp.poca = Math.min(1, cp.poca + dt * 0.5); cp.alma += dt;
      if (cp.chamas > 0) { cp.chamas -= dt; if (!leve() && Math.random() < dt * 10) S.parts.push({ x: cp.x + entre(8, 40), y: cp.y - 6, vx: entre(-4, 4), vy: entre(-26, -10), g: 0, vida: 0.5, max: 0.5, cor: Math.random() < 0.5 ? 'brasa' : 'fumaca', tam: 1.5 }); }
    }
    for (const e of S.etiquetas) { e.t += dt; e.el.style.left = `${(e.x - camA) / W * 100}%`; e.el.style.top = `${e.y / H * 100}%`; if (e.t > 2.7) e.el.remove(); }
    poda(S.etiquetas, e => e.t <= 2.7);
    if (S.crateras.length > 40) S.crateras.splice(0, S.crateras.length - 40);
    for (const b of S.bombas) { b.vy += 240 * dt; b.y += b.vy * dt; if (b.h && !b.h.morte && b.h.vivo) { b.x = b.h.x + 23; b.alvoY = b.h.y; } if (b.y >= b.alvoY) { b.fim = true; explodir(b.x, b.alvoY, b.h ? 1.1 : 0.9, b.h?.vivo ? b.h : null); } }
    poda(S.bombas, b => !b.fim);
    for (const a of S.avioes) {
      a.x += a.v * dt;
      const alvoX = a.alvo ? a.alvo.x + 23 - camA + 30 : 200;
      if (!a.solto && a.x + 11 >= alvoX) { a.solto = true; const wx = a.alvo ? a.alvo.x + 23 : a.x + 11 + camA; S.bombas.push({ x: wx, y: a.y + 4, alvoY: a.alvo ? a.alvo.y : entre(140, 200), vy: 20, h: a.alvo }); som().assobio(); }
    }
    poda(S.avioes, a => a.x < W + 40);
    for (const s of S.soldados) {
      s.fogo = Math.max(0, s.fogo - dt);
      if (s.sai) { s.y += 30 * dt; continue; }
      s.y += clamp(s.alvoY - s.y, -40 * dt, 40 * dt);
      if (s.rajada > 0 && s.alvoH) { s.rajada -= dt; if (Math.random() < dt * 14) atirar(s, s.alvoH.x + 24 + entre(-4, 4), s.alvoH.y - 14 + entre(-3, 3)); if (s.rajada <= 0 && !s.alvoH.morte && s.alvoH.vivo) morrer(s.alvoH, 'rajada'); continue; }
      s.cool -= dt;
      if (s.cool <= 0 && S.fase === 'ataque') {
        s.cool = entre(0.35, 1.4) / (0.3 + S.I);
        const vv = vivos().filter(h => !h.morte); if (vv.length) { const h = sorteio(vv); atirar(s, h.x + 24 + sorteio([-1, 1]) * entre(10, 26), h.y - entre(0, 16)); }
      }
    }
    poda(S.soldados, s => s.y < 245);
    for (const r of S.corredores) {
      r.t += dt; const h = r.h, hx = h.x - camA + 22, hy = h.y;
      if (r.fase === 'corre') { const dx = hx - r.x, dy = hy - r.y, d = Math.hypot(dx, dy); if (d < 6) { r.fase = 'bate'; r.t = 0; } else { r.x += dx / d * 120 * dt; r.y += dy / d * 120 * dt; } }
      else if (r.fase === 'bate') { r.x = hx - 4; r.y = hy; if (r.t > 0.25) { r.fase = 'volta'; if (!h.morte && h.vivo) morrer(h, 'golpe'); som().baque(); } }
      else { r.y += 110 * dt; r.x -= 30 * dt; }
    }
    poda(S.corredores, r => r.y < 240);
    const T = S.tanque;
    if (T) {
      T.x += clamp(T.alvoX - T.x, -30 * dt, 30 * dt); T.recuo = Math.max(0, T.recuo - dt * 20); T.cool -= dt;
      if (S.fase !== 'ataque') T.alvoX = -60;
      else if (T.alvoH && !T.alvoH.morte && T.alvoH.vivo) { T.recuo = 3; S.parts.push({ x: T.x + 36 + camA, y: 116, vx: 0, vy: -6, g: 0, vida: 0.9, max: 0.9, cor: 'fumaca', tam: 3 }); explodir(T.alvoH.x + 23, T.alvoH.y, 1.1, T.alvoH); T.alvoH = null; T.cool = 1.5; }
      else if (T.cool <= 0 && S.cps > 0.3) { T.cool = entre(1.6, 2.6); T.recuo = 3; const vv = vivos().filter(h => !h.morte); if (vv.length) { const h = sorteio(vv); explodir(h.x + 23 + sorteio([-1, 1]) * entre(18, 40), clamp(h.y + entre(-10, 10), 134, 202), 0.9); } }
      if (T.x < -55 && S.fase !== 'ataque') S.tanque = null;
    }
    const querCinza = Math.round((leve() ? 30 : forte() ? 120 : 80) * S.w);
    while (S.cinzas.length < querCinza) S.cinzas.push({ x: Math.random() * W, y: Math.random() * H, vx: entre(-14, -4), vy: entre(6, 16), brasa: Math.random() < 0.25, f: Math.random() * T2 });
    if (S.cinzas.length > querCinza) S.cinzas.length = querCinza;
    for (const a of S.cinzas) { a.x += (a.vx + Math.sin(rel * 2 + a.f) * 4) * dt; a.y += (a.brasa ? -a.vy * 0.6 : a.vy) * dt; if (a.x < -2) a.x = W + 1; if (a.y > H) a.y = -1; if (a.y < -2) a.y = H; }
    if (S.w > 0.3 && Math.random() < dt * 2.5 * S.w) S.claroes.push({ x: Math.random() * W, y: 56 + Math.random() * 14, t: 0, r: entre(6, 14) });
    for (const k of S.claroes) k.t += dt; poda(S.claroes, k => k.t < 0.25);
    S.shake = Math.max(0, S.shake - dt * 14); S.flash = Math.max(0, S.flash - dt * 1.6);
  }

  /* ---------- o desenho (no quadro da página, pelos ganchos do desenharCena) ---------- */
  const MANCHADO = new Map();
  function manchado(fr, sem) {
    let m = MANCHADO.get(fr); if (m) return m;
    if (!fr.dados) return fr;
    const [cv, cx] = tela(SW, SH), src = fr.dados.data, img = cx.createImageData(SW, SH), d = img.data; d.set(src);
    for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
      const k = (y * SW + x) * 4; if (!src[k + 3]) continue;
      if (src[k] === 0x14 && src[k + 1] === 0x0c && src[k + 2] === 0x09) continue;   // o contorno fica
      const n = ruido2(x / 3.2, y / 2.6, sem);
      if (n > 0.66) { const escuro = n > 0.76; d[k] = escuro ? 110 : 168; d[k + 1] = escuro ? 8 : 18; d[k + 2] = escuro ? 14 : 24; }
    }
    cx.putImageData(img, 0, 0); MANCHADO.set(fr, cv); return cv;
  }
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
  function desenharCavalo(c, h, camF, op = {}) {
    const q = o.quadros(h.cav); let fr;
    const pose = op.pose ?? h.pose ?? 'g';
    if (pose === 'g') fr = q.g[Math.floor(h.fg * 8) % 8];
    else if (pose === 'a') fr = q.a[Math.floor(h.fg * 8) % 8];
    else if (pose === 'c') fr = q.c[0];
    else if (pose === 'm') fr = q.m[0];
    else fr = q.p[Math.floor(rel * 1.5) % 4];
    let img = h.manchas ? manchado(fr, h.cav.sem ?? 1) : fr;
    if (op.cor) img = tingido(img, op.cor, op.a ?? 1);
    else if (h.verm > 0) img = tingido(img, '#ff1a0a', h.verm);
    const tr = h.tremor ? [Math.round(entre(-h.tremor, h.tremor)), Math.round(entre(-h.tremor, h.tremor) * 0.5)] : [0, 0];
    const pulo = h.pulo ? -Math.round(Math.sin(Math.PI * (1 - h.pulo)) * 4) : 0;
    const left = Math.round(h.x - camF) - PAD + tr[0], top = Math.round(h.y) - (pose === 'm' ? 22 : 32) + tr[1] + Math.round(op.yo ?? 0) + pulo;
    c.save(); c.translate(left + SW / 2, top + SH / 2); if (op.rot) c.rotate(op.rot); c.scale(h.dir ?? 1, 1);
    c.drawImage(img, 0, 0, SW, SH, -SW / 2, -SH / 2, SW, SH); c.restore();
    if (h.verm > 0.2) { const k = Math.floor(rel * 1.5) % 4, ex = (h.dir ?? 1) > 0 ? 41 : SW - 1 - 41, ey = 5 + [0, 0, 1, 1][k]; bola(c, `rgba(255,40,20,${0.35 * h.verm})`, left + ex, top + ey, 2); R(c, '#ff2a12', left + ex, top + ey, 1, 1); }
  }
  function desenharCorpo(c, cp, camF) {
    const x = Math.round(cp.x - camF), y = Math.round(cp.y);
    if (x < -60 || x > W + 10) return;
    const rx = 4 + 13 * cp.poca; elip(c, '#5e080c', x + 24, y + 1, rx, 1.5 + 2 * cp.poca); elip(c, '#8e1016', x + 22, y, rx * 0.7, 1 + 1.2 * cp.poca);
    const fr = o.quadros(cp.cav).m[0], left = x - PAD, top = y - 22;
    c.drawImage(cp.queimado ? tingidoFixo(fr, '#24120a', 0.55) : fr, 0, 0, SW, SH, left, top, SW, SH);
    const ex = left + 38 + PAD, ey = top + 18;
    for (const [dx, dy] of [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]]) R(c, '#120a08', ex + dx, ey + dy, 1, 1);
    if (cp.chamas > 0) { const a = Math.min(1, cp.chamas); luz(c, x + 24, y - 6, 1, 0.55 * a * tremula(cp.x), true); chama(c, x + 15, y - 1, cp.chamas > 1.5 ? 1 : 0, cp.x, 0); chama(c, x + 29, y - 2, cp.chamas > 3 ? 1 : 0, cp.x + 3, 1); }
    if (cp.alma < 2.4) {   // a alma sai do corpo, sobe e some
      const u = cp.alma / 2.4, fa = o.quadros(cp.cav).p[0];
      c.globalAlpha = 0.45 * (1 - u); c.drawImage(tingidoFixo(fa, '#eaf6ff', 0.9), 0, 0, SW, SH, left + Math.round(Math.sin(cp.alma * 3) * 2), top - 10 - Math.round(u * 34), SW, SH); c.globalAlpha = 1;
    }
  }
  function desenharPePano(c, camF) {
    const pp = S.pePano; if (!pp) return;
    const img = pePanoCaido(), x = Math.round(pp.x - camF), y = Math.round(pp.y);
    elip(c, '#5e080c', x + 34, y + 1, 18, 2.5); elip(c, '#8e1016', x + 30, y, 11, 1.6);
    c.drawImage(img, x, y - PE_PANO_CHAO);
  }
  function soldado(c, x, y, dir, q, fogo, corpoTodo = false, bate = 0) {
    const X = Math.round(x), Y = Math.round(y), pe = q % 2;
    if (corpoTodo) { R(c, '#2d331c', X - 2 + pe, Y - 4, 2, 4); R(c, '#2d331c', X + 1 - pe, Y - 4, 2, 4); R(c, '#1a1a14', X - 2, Y - 1, 2, 1); R(c, '#1a1a14', X + 1, Y - 1, 2, 1); }
    R(c, '#55633a', X - 2, Y - 9, 5, 5); R(c, '#6b7a48', X - 2, Y - 9, 5, 1); R(c, '#3a4426', X - 2, Y - 5, 5, 1);
    R(c, '#c68642', X - 1, Y - 11, 3, 2); R(c, '#1d1410', X + dir, Y - 11, 1, 1);
    R(c, '#3d4a26', X - 2, Y - 13, 5, 2); R(c, '#4f5e31', X - 1, Y - 14, 3, 1); R(c, '#3d4a26', X - 3, Y - 12, 7, 1);
    const tx2 = X + dir * 8, ty = bate ? Y - 16 : Y - 11;
    linha(c, '#1d1a14', X + dir, Y - 7, tx2, ty); R(c, '#8a8680', tx2, ty - 1, 1, 1);
    if (fogo) { bola(c, '#fff3a0', tx2 + dir, ty, 1); R(c, '#ffb12e', tx2 + dir * 2, ty - 1, 2, 2); }
  }
  function aviao(c, a) {
    const x = Math.round(a.x), y = Math.round(a.y);
    R(c, '#2a2e33', x - 1, y - 4, 4, 5); R(c, '#3a3f45', x, y, 22, 4); R(c, '#55606a', x, y, 22, 1); R(c, '#2a2e33', x, y + 3, 22, 1);
    R(c, '#3a3f45', x + 21, y + 1, 3, 2); R(c, '#4a525a', x + 7, y + 1, 9, 2); R(c, '#22262b', x + 6, y + 2, 11, 1);
    bola(c, '#b81c1c', x + 4, y + 1, 1);
    if (Math.floor(rel * 30) % 2) R(c, '#cccccc', x + 24, y - 2, 1, 8); else R(c, '#888888', x + 24, y + 1, 1, 2);
  }
  function tanque(c, T) {
    const x = Math.round(T.x), y = 127, rc = Math.round(T.recuo);
    R(c, '#1e2214', x, y - 4, 30, 4); for (let k = 0; k < 6; k++) bola(c, '#33381f', x + 3 + k * 5, y - 2, 1);
    R(c, '#4a5530', x + 2, y - 9, 26, 5); R(c, '#5e6b3c', x + 2, y - 9, 26, 1);
    R(c, '#3e4828', x + 9, y - 13, 12, 4); R(c, '#55623a', x + 9, y - 13, 12, 1);
    R(c, '#2a3018', x + 21 - rc, y - 12, 13, 2);
    if (rc > 1) bola(c, '#ffd24a', x + 35, y - 11, 2);
  }
  // O chefe dentro da janela (a transformação e o «revela»): o mesmo desenho da página.
  const DEST = criarDestino();
  let chaveChefe = '';
  function desenharChefeEm(c, B, x, y, k, op = {}) {
    const tq = Math.floor(rel * 12) / 12, pq = Math.floor(B.p * 8) / 8, kk = B.modo + pq + '|' + tq + '|' + B.jaw + '|' + B.dir;
    if (kk !== chaveChefe) { chaveChefe = kk; construirCavalo({ t: tq, by: 0, p: pq, modo: B.modo, jaw: B.jaw, cab: 0, feridas: [], furia: 0, flash: 0, num: S.sob?.cav.num ?? '', espelho: B.dir < 0 }, CAVALEIROS.guerra, DEST); }
    let img = DEST.cv; if (op.cor) img = tingido(img, op.cor, op.a ?? 1);
    c.save(); c.translate(Math.round(x), Math.round(y)); c.scale(B.dir * k, k); c.translate(CPIV, 0); c.rotate(B.rot); c.translate(-CPIV, 0);
    c.drawImage(img, 0, 0, CW, CH, -CMEIO, -CCHAO, CW, CH); c.restore();
  }
  const ativa = () => !!S && S.on === true && S.fase !== 'paz';
  const camada = (c, desenha) => { if (S.w <= 0) return; c.globalAlpha = S.w; desenha(); c.globalAlpha = 1; };
  /** Gancho 1: depois do fundo do mapa (céu, morros, arquibancada, pista), antes dos cavalos. */
  function fundo(c, camR, camF) {
    if (!ativa() || S.w <= 0 || S.fase === 'chefe') return;
    const bg = construirCenario(W, H), w = S.w;
    camada(c, () => c.drawImage(bg.fundo, 0, 0, W, 118, 0, 0, W, 118));
    for (const n of bg.nuvens) { const per = W + 100, x = Math.round((((n.x - camR * 0.04 - rel * n.v) % per) + per) % per) - 70; c.globalAlpha = w; nuvem(c, x, n.y + 4, n.w + 16, ['#3a2a26', '#241815']); }
    c.globalAlpha = 1;
    for (const k of S.claroes) { const a = 1 - k.t / 0.25; if (k.raio) { R(c, `rgba(255,90,60,${0.18 * a})`, 0, 0, W, 118); linha(c, `rgba(255,230,220,${a})`, k.x, 0, k.x + 6, k.y * 0.5); linha(c, `rgba(255,230,220,${a})`, k.x + 6, k.y * 0.5, k.x - 2, k.y); } else bola(c, `rgba(255,190,90,${0.55 * a})`, k.x, k.y, k.r); }
    camada(c, () => azulejo(c, bg.longe, camR * 0.08, 0, W));
    for (const col of bg.colunas) {
      if (w <= col.limiar) continue;
      const a = clamp((w - col.limiar) / 0.25, 0, 1), per = W + 80, x = Math.round((((col.x - camR * 0.1) % per) + per) % per) - 40;
      for (let k = 0; k < (leve() ? 4 : 9); k++) { const sub = (rel * 7 * col.larg + k * 9) % 72, y = col.base - sub, r = 2 + sub * 0.13 * col.larg; bola(c, `rgba(40,30,28,${0.5 * a * (1 - sub / 80)})`, x + Math.sin(sub * 0.08) * 5 + sub * 0.25, y, r); }
      R(c, `rgba(255,120,40,${0.6 * a})`, x - 1, col.base, 3, 2);
    }
    camada(c, () => azulejo(c, bg.meio, camR * 0.25, 0, W));
    const off = Math.round(camR * 0.55), x0 = -(((off % 256) + 256) % 256), fuga = clamp((w - 0.12) / 0.5, 0, 1.05);
    camada(c, () => { for (let x = x0; x < W; x += 256) c.drawImage(bg.arq, x, 68); });
    c.globalAlpha = w;
    for (let x = x0; x < W; x += 256) for (const p of bg.torcida) { if (p.fuga < fuga) continue; const pula = Math.sin(rel * 14 + p.fase) > 0.3 ? 1 : 0; torcedor(c, x + p.px, 68 + p.py - pula, p.cor, p.pele, p.topo, pula); }
    c.globalAlpha = 1;
    if (w > 0.6) { const a = clamp((w - 0.6) / 0.25, 0, 1); for (let x = x0; x < W; x += 256) for (let k = 0; k < 5; k++) { const fx = x + 20 + k * 50, fy = 80 + (k % 3) * 12; luz(c, fx, fy - 4, 1, 0.55 * a * tremula(k), true); if (a > 0.3) chama(c, fx, fy, k % 2 ? 1 : 2, k * 3, k & 1); } }
    camada(c, () => azulejo(c, bg.pista, camR, 112, W));
    if (S.tanque) tanque(c, S.tanque);
    for (const cr of S.crateras) { const x = Math.round(cr.x - camF); if (x < -20 || x > W + 20) continue; elip(c, '#2a1a10', x, cr.y, cr.r, cr.r * 0.32); elip(c, '#1a0f08', x, cr.y + 0.5, cr.r * 0.6, cr.r * 0.2); R(c, '#7e5a3e', x - Math.round(cr.r * 0.6), Math.round(cr.y - cr.r * 0.32) - 1, Math.round(cr.r * 1.2), 1); }
    for (const r of S.rachas) { const n = Math.floor(r.length * clamp(S.fase === 'filme' && !S.B ? S.faseT / 2.6 : 1, 0, 1)); for (let j = 0; j < n - 1; j++) { linha(c, '#120804', r[j][0] - camF, r[j][1], r[j + 1][0] - camF, r[j + 1][1], 2); linha(c, '#ff5a1a', r[j][0] - camF, r[j][1], r[j + 1][0] - camF, r[j + 1][1]); } }
  }
  /** Gancho 2: no laço dos cavalos. Verdadeiro: a guerra desenhou (a página pula este). */
  function cavalo(c, i, camF) {
    if (!ativa() || S.fase === 'transicao' || !S.cav.length) return false;
    if (S.fase === 'depois') {
      if (i === S.rec.vencedor) return false;
      if (i === 0) { for (const cp of S.corpos) desenharCorpo(c, cp, camF); desenharPePano(c, camF); }
      return true;
    }
    if (i !== 0) return true;
    if (S.fase === 'chefe') return true;
    const cena = [];
    for (const cp of S.corpos) cena.push({ y: cp.y - 1, f: () => desenharCorpo(c, cp, camF) });
    if (S.pePano) cena.push({ y: S.pePano.y - 2, f: () => desenharPePano(c, camF) });
    const transformando = S.feitos.has('transforma') && S.fase === 'filme';
    if (!transformando) for (const h of S.cav) if (h.vivo) cena.push({ y: h.y, f: () => {
      const m = h.morte; if (!m || m.pose !== 'm' || m.yo < -1) elip(c, `rgba(30,15,5,${0.22 + 0.15 * S.w})`, Math.round(h.x - camF) + 21, h.y, 12, 1.6);
      if (m) desenharCavalo(c, h, camF, { rot: m.rot, yo: m.yo, pose: m.pose, cor: m.flash > 0 ? '#ffffff' : m.char > 0 ? '#24120a' : null, a: m.flash > 0 ? 1 : m.char });
      else desenharCavalo(c, h, camF, h.condenado && Math.random() < 0.2 ? { cor: '#ffffff' } : {});
    } });
    for (const r of S.corredores) cena.push({ y: r.y, f: () => soldado(c, r.x, r.y, 1, Math.floor(rel * 10), false, true, r.fase === 'bate') });
    cena.sort((a, b) => a.y - b.y).forEach(x => x.f());
    for (const f of S.fogos) { const x = f.x - camF; if (x < -20 || x > W + 20) continue; luz(c, x, f.y - 4, 1, 0.6 * tremula(f.x), true); chama(c, x, f.y + 1, 1, f.x, Math.round(f.x) & 1); }
    // a transformação: as duas silhuetas, piscando cada vez mais rápido; depois, ele inteiro
    const sf = E?.sobrou_em ? (o.agora() - ms(E.sobrou_em)) / 1000 : 0;
    if (transformando && sf < 16.9) {
      const t = sf - 13.9, s = S.sob, ritmo = 2 + t * 5, vezB = Math.sin(t * ritmo * Math.PI) > 0;
      if (vezB && t > 0.5) { const B = S.B; B.dir = 1; B.rot = 0; desenharChefeEm(c, B, s.x - camF + 24, s.y + 2, 0.3 + 0.55 * (t / 3), { cor: '#ffffff' }); }
      else desenharCavalo(c, s, camF, { cor: t < 0.5 ? '#ff6a4a' : '#ffffff', a: 1 });
    } else if (S.fase === 'filme' && sf >= 16.9 && S.B) { const B = S.B; B.dir = 1; B.rot = -0.12 * Math.sin(Math.min(1, (sf - 16.9) / 0.8) * Math.PI); desenharChefeEm(c, B, 200, 214, 0.85); }
    return true;
  }
  /** Gancho 3: por cima da grama da frente. */
  function frente(c, camR) {
    if (!ativa() || S.w <= 0 || S.fase === 'chefe') return;
    const bg = construirCenario(W, H); camada(c, () => azulejo(c, bg.frente, camR * 1.35, 205, W));
  }
  /** Gancho 4: no fim da cena — explosões, tiros, aviões, a cor da guerra, as trincas. */
  function depois(c, camF) {
    if (!ativa() || S.fase === 'chefe') return;
    for (const e of S.expl) { const x = e.x - camF, y = e.y - 6 * e.r, u = e.t / e.dur; luz(c, x, y, e.r > 0.8 ? 4 : 3, 0.9 * (1 - u) * (1 - u), true); if (e.t < 0.06) { bola(c, '#fff6c4', x, y, 9 * e.r); bola(c, '#ffffff', x, y, 5 * e.r); } }
    for (const p of S.parts) particulaF(c, p, rel, camF);
    for (const t of S.tracos) linha(c, '#ffe9a0', t.x0 - camF, t.y0, t.x1 - camF, t.y1);
    for (const b of S.bombas) { const x = Math.round(b.x - camF), y = Math.round(b.y); R(c, '#1a1a1a', x - 1, y - 3, 3, 6); R(c, '#3a3a3a', x - 2, y - 4, 5, 1); }
    for (const a of S.avioes) aviao(c, a);
    for (const s of S.soldados) soldado(c, s.x, s.y, 1, 0, s.fogo > 0);
    for (const a of S.cinzas) R(c, a.brasa ? (Math.sin(rel * 8 + a.f) > 0 ? '#ffb12e' : '#ff5a1a') : '#8a807a', Math.round(a.x), Math.round(a.y), 1, 1);
    if (S.rachaJ) { const sf = (o.agora() - ms(E?.sobrou_em)) / 1000, n = Math.ceil(8 * clamp((sf - 16.9) / 1.1, 0, 1)); for (const pts of S.rachaJ) for (let j = 0; j < Math.min(n, pts.length - 1); j++) { linha(c, 'rgba(0,0,0,.5)', pts[j][0] + 1, pts[j][1] + 1, pts[j + 1][0] + 1, pts[j + 1][1] + 1); linha(c, '#ffffff', pts[j][0], pts[j][1], pts[j + 1][0], pts[j + 1][1]); } }
    if (S.w > 0) {
      c.globalCompositeOperation = 'multiply'; c.fillStyle = `rgba(255,160,110,${0.4 * S.w})`; c.fillRect(0, 0, W, H); c.globalCompositeOperation = 'source-over';
      if (!leve()) { const vg = c.createRadialGradient(W / 2, H / 2, 90, W / 2, H / 2, 250); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, `rgba(20,0,0,${0.55 * S.w})`); c.fillStyle = vg; c.fillRect(0, 0, W, H); }
    }
    if (S.flash > 0) R(c, `rgba(255,255,255,${S.flash})`, 0, 0, W, H);
    if (S.preto > 0) R(c, `rgba(0,0,0,${S.preto})`, 0, 0, W, H);
  }
  /** O tremor da câmera da guerra (a página soma no deslocamento do quadro). */
  const tremor = () => (ativa() && S.shake > 0.2 ? [Math.round(entre(-S.shake, S.shake)), Math.round(entre(-S.shake, S.shake) * 0.6)] : null);

  return {
    /** O estado do banco (ou do ensaio). */
    estado(e) {
      if (!e || typeof e !== 'object') return;
      if (E && E.ligada && e.ligada && (E.versao ?? 0) > (e.versao ?? 0)) return;
      if (E?.pressao != null && e.pressao != null && S) { const dtE = Math.max(0.5, (performance.now() - recebeuEm) / 1000); S.cpsFora = Math.max(0, (e.pressao - E.pressao - S.voando) / dtE) * 0.6 + S.cpsFora * 0.4; S.voando = 0; }
      E = e; recebeuEm = performance.now();
    },
    /** Já sabe se esta corrida tem guerra (o sistema mandou o estado, ou passou o tempo de esperar). */
    sabe: () => E != null || performance.now() - desde > 4000,
    ligada,
    /** Esta corrida teve guerra (sobrou um): o fim é só o vencedor, escuro, sem replay e sem o Rei do Gado. */
    houve: () => !!E?.ligada && !!E?.sobrou_em,
    /** Quem acertou o chefe, do maior dano para o menor (depois que ele cai, todo mundo). */
    ranking: () => (Array.isArray(E?.ranking) ? E.ranking : []),
    tempo, passo, xAt, cam, tremor,
    /** A janela está escondida (o chefe está na página): a página não precisa desenhar. */
    escondida: () => !!S && S.fase === 'chefe',
    morto: i => !!S?.cav[i] && S.on === true && !S.cav[i].vivo,
    /** A pista não tem fim na guerra: sem a linha de chegada e sem as barreiras (eles correm por cima). */
    semChegada: () => !!S && S.on === true && (S.fase === 'ataque' || S.fase === 'filme' || S.fase === 'chefe'),
    /** A gravação está parada pela guerra (a página não narra nem derruba vara). */
    pausada: () => !!S && S.on === true && ['ataque', 'filme', 'chefe', 'final'].includes(S.fase),
    ganchos: { fundo, cavalo, frente, depois },
    /** As barrinhas do som da guerra agora (`n` faixas de 0 a 1): a página junta com as dela. */
    barras: n => (Som ? Som.barras(n) : new Array(n).fill(0)),
    /** Uma largada nova do teste: esquece o estado e a guerra de antes. */
    limpar() { E = null; desde = performance.now(); if (S) { for (const e of S.etiquetas) e.el.remove(); caixa.classList.remove('on'); leg.classList.remove('on'); } S = null; Som?.musica(null); pararViolino(0.4); },
    fechar() { Som?.fechar(); Som = null; violino = null; },
  };
}

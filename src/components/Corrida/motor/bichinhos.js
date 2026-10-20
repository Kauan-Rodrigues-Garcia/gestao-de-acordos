/**
 * bichinhos.js — os bichinhos da Corrida da Sorte: os modelos, as cores, os
 * acessórios, o desenho no canvas e o sorteio dos três de cada pessoa.
 *
 * JavaScript puro (sem TypeScript) como o resto do motor (`motor.js`): é
 * código de desenho em canvas, portado da página de demonstração. O contrato
 * fica em `bichinhos.d.ts`. Também é usado fora da corrida (a escolha do
 * bichinho e o card de divulgação), por isso não depende do motor.
 */
export const CALMO = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

/* ================= cores, estilos, utilidades ================= */
const CORES = [
  ['#ff8a2b', 'Abóbora'], ['#ff6fb5', 'Rosa'], ['#a77bf3', 'Roxo'], ['#8fe36b', 'Gosma'], ['#7fd3ff', 'Azul fantasma'],
  ['#ff4d5e', 'Vermelho'], ['#ffd84d', 'Amarelo vela'], ['#f1e7d3', 'Osso'], ['#4a4366', 'Meia-noite'], ['#5ff0c8', 'Menta'],
];
const MODELOS = [['classica', 'Gotinha'], ['abobora', 'Abóbora'], ['caveira', 'Caveirinha'], ['fantasma', 'Fantasminha'], ['olho', 'Olhão'], ['morcego', 'Morceguinho'], ['gato', 'Gatinho'], ['coelho', 'Coelhinho'], ['urso', 'Ursinho'], ['polvo', 'Polvinho']];
const ACESSORIOS = [['nenhum', 'Nenhum', 'sem acessório'], ['oculos', 'Óculos', 'de óculos'], ['escuros', 'Óculos escuros', 'de óculos escuros'], ['bruxa', 'Chapéu de bruxa', 'de chapéu de bruxa'], ['cartola', 'Cartola', 'de cartola'], ['laco', 'Laço', 'de laço'], ['coroa', 'Coroa', 'de coroa'], ['chifres', 'Chifrinhos', 'de chifrinhos'], ['fones', 'Fones', 'de fones'], ['aureola', 'Auréola', 'de auréola'], ['bone', 'Boné', 'de boné'], ['flor', 'Flor', 'de flor']];
const nomeDe = (lista, id) => (lista.find(l => l[0] === id) || lista[0])[1];
const descreve = est => ({ modelo: nomeDe(MODELOS, est.modelo), cor: nomeDe(CORES, est.cor), acessorio: (ACESSORIOS.find(a => a[0] === est.acessorio) || ACESSORIOS[0])[2] });

const hexRgb = h => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const toHex = (r, g, b) => '#' + [r, g, b].map(v => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
const mixHex = (a, b, p) => { const A = hexRgb(a), B = hexRgb(b); return toHex(A[0] + (B[0] - A[0]) * p, A[1] + (B[1] - A[1]) * p, A[2] + (B[2] - A[2]) * p); };
const tom = (h, p) => mixHex(h, p < 0 ? '#000000' : '#ffffff', Math.abs(p));
const rgba = (h, a) => { const [r, g, b] = hexRgb(h); return `rgba(${r},${g},${b},${a})`; };
function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hashStr(s) { let h = 2166136261; for (const ch of s) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r); c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h); c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r); c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath(); }
const elip = (c, x, y, a, b) => { c.beginPath(); c.ellipse(x, y, a, b, 0, 0, Math.PI * 2); };
const circ = (c, x, y, r) => { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); };
const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);

/* ================= a alma (o bichinho) ================= */
const TINTA = '#1a1020';
const ANIMAIS = ['gato', 'coelho', 'urso', 'polvo'];
function desenhaAlma(c, x, y, r, est, st) {
  const s = r / 12, cor = est.cor, m = est.modelo, tt = st.t || 0, ex = st.expr || 'normal';
  const lx = st.lx || 0, ly = st.ly || 0, pisca = !!st.pisca;
  c.save(); c.translate(x, y); if (st.inc) c.rotate(st.inc); c.scale(s, s);
  if (m === 'morcego') {
    const fl = Math.sin(tt * 18) * 5;
    c.fillStyle = tom(cor, -0.5);
    for (const sg of [-1, 1]) {
      c.beginPath(); c.moveTo(sg * 7, -3);
      c.quadraticCurveTo(sg * 15, -12 - fl, sg * 22, -7 - fl);
      c.quadraticCurveTo(sg * 19, -2 - fl * .5, sg * 20, 2 - fl * .3);
      c.quadraticCurveTo(sg * 16, 0, sg * 15, 4);
      c.quadraticCurveTo(sg * 12, 2, sg * 7, 5); c.closePath(); c.fill();
    }
    c.fillStyle = tom(cor, -0.25);
    for (const sg of [-1, 1]) { c.beginPath(); c.moveTo(sg * 3, -8); c.lineTo(sg * 8, -16); c.lineTo(sg * 9.5, -6); c.closePath(); c.fill(); }
  }
  if (m === 'classica') {
    const fx = -lx * 5, fl = Math.sin(tt * 11) * 1.6;
    c.fillStyle = rgba(cor, 0.45);
    c.beginPath(); c.moveTo(-7.5, -7); c.quadraticCurveTo(-4 + fx * .5, -17 + fl, 1 + fx, -26 + fl); c.quadraticCurveTo(1 + fx * .3, -16, 7.5, -7); c.closePath(); c.fill();
    c.fillStyle = rgba(tom(cor, 0.35), 0.8);
    c.beginPath(); c.moveTo(-4, -9); c.quadraticCurveTo(-1 + fx * .4, -15 - fl, 2 + fx * .7, -19 - fl); c.quadraticCurveTo(2, -13, 4, -9); c.closePath(); c.fill();
  }
  if (m === 'gato') {
    for (const sg of [-1, 1]) {
      c.fillStyle = tom(cor, -0.12); c.beginPath(); c.moveTo(sg * 3, -10.5); c.lineTo(sg * 10.5, -17.5 + Math.sin(tt * 3 + sg) * .5); c.lineTo(sg * 11.2, -4.5); c.closePath(); c.fill();
      c.fillStyle = 'rgba(255,150,180,.75)'; c.beginPath(); c.moveTo(sg * 5, -9.6); c.lineTo(sg * 9.6, -14.4); c.lineTo(sg * 9.9, -7.4); c.closePath(); c.fill();
    }
  }
  if (m === 'coelho') {
    for (const sg of [-1, 1]) {
      c.save(); c.translate(sg * 4.6, -9); c.rotate(sg * 0.2 + Math.sin(tt * 4 + sg) * 0.06);
      c.fillStyle = tom(cor, -0.08); elip(c, 0, -9, 3.8, 9.5); c.fill();
      c.fillStyle = 'rgba(255,150,180,.7)'; elip(c, 0, -8.4, 1.9, 6.6); c.fill(); c.restore();
    }
  }
  if (m === 'urso') { for (const sg of [-1, 1]) { c.fillStyle = tom(cor, -0.22); circ(c, sg * 8.4, -8.6, 4.6); c.fill(); c.fillStyle = tom(cor, 0.3); circ(c, sg * 8.4, -8.6, 2.3); c.fill(); } }
  if (m === 'polvo') {
    c.strokeStyle = tom(cor, -0.18); c.lineWidth = 3.4; c.lineCap = 'round';
    for (let k = 0; k < 5; k++) {
      const x0 = -8.4 + k * 4.2, w = Math.sin(tt * 6 + k * 1.3) * 2.2;
      c.beginPath(); c.moveTo(x0, 5); c.quadraticCurveTo(x0 + w, 10, x0 - w * .6 + (k - 2) * 1.2, 14.5); c.stroke();
    }
  }
  const base = m === 'caveira' ? mixHex(cor, '#ffffff', 0.55) : m === 'fantasma' ? mixHex(cor, '#ffffff', 0.5) : m === 'olho' ? '#f6efe4' : cor;
  const g = c.createRadialGradient(-4, -5, 1, 0, 0, 14);
  g.addColorStop(0, tom(base, 0.4)); g.addColorStop(0.55, base); g.addColorStop(1, tom(base, -0.35));
  c.fillStyle = g;
  if (m === 'classica') { circ(c, 0, 0, 12); c.fill(); }
  else if (m === 'morcego') { circ(c, 0, 0, 10.5); c.fill(); }
  else if (m === 'gato' || m === 'coelho' || m === 'urso') { circ(c, 0, 0, 11.6); c.fill(); }
  else if (m === 'polvo') { c.beginPath(); c.moveTo(-11.5, 5); c.bezierCurveTo(-13, -14, 13, -14, 11.5, 5); c.quadraticCurveTo(0, 8, -11.5, 5); c.closePath(); c.fill(); }
  else if (m === 'abobora') {
    elip(c, 0, 0.5, 13, 11.2); c.fill();
    c.strokeStyle = rgba(tom(cor, -0.5), 0.55); c.lineWidth = 1;
    elip(c, 0, 0.5, 5, 11); c.stroke(); elip(c, 0, 0.5, 9.5, 11.1); c.stroke();
    c.fillStyle = '#5c7a2e'; c.save(); c.translate(0.5, -10.5); c.rotate(0.18); c.fillRect(-1.5, -4, 3, 5); c.restore();
    c.fillStyle = '#7da23f'; elip(c, 3.5, -11, 2.6, 1.2); c.fill();
  } else if (m === 'caveira') {
    circ(c, 0, -1.5, 11); c.fill(); rr(c, -6.5, 4, 13, 7, 2.5); c.fill();
    c.fillStyle = '#1d1420';
    elip(c, -4.4, -1.8, 3.3, 3.6); c.fill(); elip(c, 4.4, -1.8, 3.3, 3.6); c.fill();
    c.beginPath(); c.moveTo(0, 2); c.lineTo(-1.4, 4.6); c.lineTo(1.4, 4.6); c.closePath(); c.fill();
    c.strokeStyle = rgba('#1d1420', 0.7); c.lineWidth = 0.8;
    for (const tx of [-3.2, -1.1, 1.1, 3.2]) { c.beginPath(); c.moveTo(tx, 6); c.lineTo(tx, 10); c.stroke(); }
  } else if (m === 'fantasma') {
    c.beginPath(); c.moveTo(-11, 0); c.arc(0, -1, 11, Math.PI, 0); c.lineTo(11, 9);
    for (let i = 0; i < 3; i++) { const x0 = 11 - i * 7.33, ph = Math.sin(tt * 7 + i * 1.7) * 1.8; c.quadraticCurveTo(x0 - 3.66, 14 + ph, x0 - 7.33, 9); }
    c.closePath(); c.fill();
  } else if (m === 'olho') {
    circ(c, 0, 0, 12); c.fill();
    c.strokeStyle = 'rgba(205,55,70,.55)'; c.lineWidth = 0.6;
    for (const a of [0.4, 1.9, 2.8, 4.1, 5.3]) {
      c.beginPath(); c.moveTo(Math.cos(a) * 11.6, Math.sin(a) * 11.6);
      c.quadraticCurveTo(Math.cos(a + .2) * 9.5, Math.sin(a + .2) * 9.5, Math.cos(a - .05) * 7.6, Math.sin(a - .05) * 7.6); c.stroke();
    }
  }
  const animal = ANIMAIS.includes(m);
  if (m === 'classica' || m === 'morcego' || (animal && m !== 'polvo')) { c.strokeStyle = rgba(tom(cor, -0.5), 0.6); c.lineWidth = 0.8; circ(c, 0, 0, m === 'morcego' ? 10.5 : m === 'classica' ? 12 : 11.6); c.stroke(); }
  if (m !== 'olho' && m !== 'caveira') { c.save(); c.rotate(-0.55); c.fillStyle = 'rgba(255,255,255,.42)'; elip(c, -1.5, -8.2, 3.4, 1.7); c.fill(); c.restore(); }

  const EY = m === 'abobora' ? -2 : m === 'polvo' ? -3 : -1.6, EX = [-4.3, 4.3];
  const tinta = m === 'caveira' ? tom(cor, 0.2) : TINTA;
  if (m === 'olho') {
    const ix = lx * 2.6, iy = ly * 2.6;
    c.fillStyle = cor; circ(c, ix, iy, 6.2); c.fill();
    c.strokeStyle = tom(cor, -0.45); c.lineWidth = 1; c.stroke();
    if (ex === 'tonta') {
      c.strokeStyle = '#0b0710'; c.lineWidth = 0.9; c.beginPath();
      for (let a = 0; a <= 12; a += 0.4) { const q = a * 0.42; c.lineTo(ix + Math.cos(a + tt * 8) * q, iy + Math.sin(a + tt * 8) * q); }
      c.stroke();
    } else {
      c.fillStyle = '#0b0710'; circ(c, ix, iy, ex === 'medo' ? 1.3 : 2.7); c.fill();
      c.fillStyle = 'rgba(255,255,255,.9)'; circ(c, ix - 2, iy - 2.2, 1.2); c.fill();
    }
    const lid = pisca ? 26 : ex === 'sono' ? 12.5 : ex === 'grudada' ? 8 : 0;
    c.save(); circ(c, 0, 0, 12); c.clip(); c.fillStyle = '#d9a49c';
    if (lid) { c.fillRect(-13, -13, 26, lid); c.strokeStyle = '#a5736c'; c.lineWidth = 1; c.beginPath(); c.moveTo(-13, -13 + lid); c.lineTo(13, -13 + lid); c.stroke(); }
    if (ex === 'feliz') { c.beginPath(); c.moveTo(-13, 13); c.lineTo(-13, 6); c.quadraticCurveTo(0, 1, 13, 6); c.lineTo(13, 13); c.closePath(); c.fill(); }
    c.restore();
  } else {
    if (m === 'urso') { c.fillStyle = tom(cor, 0.45); elip(c, 0, 4.4, 4.6, 3.4); c.fill(); c.fillStyle = TINTA; elip(c, 0, 2.5, 1.6, 1.1); c.fill(); }
    if (m === 'gato') { c.fillStyle = '#ff8fb0'; c.beginPath(); c.moveTo(-1.2, 1.4); c.lineTo(1.2, 1.4); c.lineTo(0, 2.8); c.closePath(); c.fill(); }
    c.fillStyle = tinta; c.strokeStyle = tinta; c.lineCap = 'round';
    const exr = (pisca && ex === 'normal') ? 'pisca' : ex;
    for (let i = 0; i < 2; i++) {
      const e = EX[i], sg = i ? 1 : -1;
      if (exr === 'pisca' || exr === 'sono') { c.lineWidth = 1.3; c.beginPath(); c.moveTo(e - 2.2, EY); c.lineTo(e + 2.2, EY); c.stroke(); }
      else if (exr === 'normal') {
        if (m === 'abobora') { c.fillStyle = '#ffcf5a'; c.beginPath(); c.moveTo(e - 2.6, EY + 1.8); c.lineTo(e + 2.6, EY + 1.8); c.lineTo(e + lx * .8, EY - 2.4); c.closePath(); c.fill(); c.fillStyle = tinta; }
        else if (m === 'caveira') { c.fillStyle = tinta; circ(c, e + lx * 1.2, EY - 0.2 + ly * 1.2, 1.1); c.fill(); }
        else { elip(c, e + lx * .9, EY + ly * .9, 1.8, 2.6); c.fill(); c.fillStyle = 'rgba(255,255,255,.85)'; circ(c, e + lx * .9 - .6, EY + ly * .9 - 1, .7); c.fill(); c.fillStyle = tinta; }
      } else if (exr === 'medo') {
        if (m !== 'caveira') { c.fillStyle = '#fff'; circ(c, e, EY, 3.1); c.fill(); c.lineWidth = .6; c.stroke(); }
        c.fillStyle = tinta; circ(c, e + lx * 1.1, EY + ly * 1.1, m === 'caveira' ? .8 : 1.1); c.fill();
      } else if (exr === 'tonta') {
        c.lineWidth = .85; c.beginPath();
        for (let a = 0; a <= 12; a += 0.4) { const q = a * 0.24; c.lineTo(e + Math.cos(a * sg + tt * 9) * q, EY + Math.sin(a * sg + tt * 9) * q); }
        c.stroke();
      } else if (exr === 'feliz') { c.lineWidth = 1.5; c.beginPath(); c.arc(e, EY + 1.2, 2.3, Math.PI * 1.15, Math.PI * 1.85); c.stroke(); }
      else if (exr === 'grudada') { c.lineWidth = 1.3; c.beginPath(); c.moveTo(e - 2 * sg, EY - 2); c.lineTo(e + 1.6 * sg, EY); c.lineTo(e - 2 * sg, EY + 2); c.stroke(); }
    }
    c.lineWidth = 1.1;
    const MY = m === 'polvo' ? -1.4 : 0;
    c.save(); c.translate(0, MY);
    if (m === 'abobora' && (ex === 'normal' || ex === 'feliz')) {
      c.fillStyle = '#ffcf5a'; c.beginPath(); c.moveTo(-6, 3.5); c.lineTo(-3.5, 5); c.lineTo(-2, 3.8); c.lineTo(0, 5.4); c.lineTo(2, 3.8); c.lineTo(3.5, 5); c.lineTo(6, 3.5);
      c.quadraticCurveTo(0, ex === 'feliz' ? 11 : 9, -6, 3.5); c.fill();
    } else if (m === 'caveira') {
      if (ex === 'medo') { c.fillStyle = '#1d1420'; elip(c, 0, 8.6, 2.4, 1.8); c.fill(); }
    } else if (ex === 'medo') { c.fillStyle = tinta; elip(c, 0, 5.2, 1.8, 2.4); c.fill(); }
    else if (ex === 'feliz') { c.fillStyle = tinta; c.beginPath(); c.moveTo(-4, 3.4); c.quadraticCurveTo(0, 9.5, 4, 3.4); c.closePath(); c.fill(); c.fillStyle = '#ff7f9c'; elip(c, 0, 6, 1.6, 1); c.fill(); }
    else if (ex === 'tonta') { c.strokeStyle = tinta; c.beginPath(); c.moveTo(-4, 5); c.quadraticCurveTo(-2, 3, 0, 5); c.quadraticCurveTo(2, 7, 4, 5); c.stroke(); }
    else if (ex === 'sono') { c.fillStyle = tinta; circ(c, 0.5, 5, 1.2); c.fill(); }
    else if (ex === 'grudada') { c.strokeStyle = tinta; c.beginPath(); c.moveTo(-3.5, 5.6); c.lineTo(3.5, 4.6); c.stroke(); }
    else if (m === 'fantasma') { c.fillStyle = tinta; elip(c, 0, 4.6, 1.4, 1.9); c.fill(); }
    else if (m === 'gato') { c.strokeStyle = tinta; c.beginPath(); c.arc(-1.6, 3.2, 1.6, 0.2, Math.PI - 0.2); c.arc(1.6, 3.2, 1.6, 0.2, Math.PI - 0.2); c.stroke(); }
    else if (m === 'urso') { c.strokeStyle = tinta; c.beginPath(); c.moveTo(0, 3.4); c.lineTo(0, 4.6); c.arc(-1.4, 4.6, 1.4, 0, Math.PI * .8); c.moveTo(0, 4.6); c.arc(1.4, 4.6, 1.4, Math.PI, Math.PI * .2, true); c.stroke(); }
    else { c.strokeStyle = tinta; c.beginPath(); c.arc(0, 2.6, 3.2, Math.PI * .22, Math.PI * .78); c.stroke(); }
    if (m === 'coelho' && (ex === 'normal' || ex === 'feliz')) { c.fillStyle = '#fff'; rr(c, -1.5, ex === 'feliz' ? 3.6 : 5.2, 3, 2.4, .6); c.fill(); c.strokeStyle = 'rgba(0,0,0,.3)'; c.lineWidth = .4; c.stroke(); }
    c.restore();
    if (m === 'morcego' && ex !== 'medo') { c.fillStyle = '#fff'; c.beginPath(); c.moveTo(-2.2, 4.6); c.lineTo(-1.2, 7); c.lineTo(-.4, 4.8); c.closePath(); c.moveTo(2.2, 4.6); c.lineTo(1.2, 7); c.lineTo(.4, 4.8); c.closePath(); c.fill(); }
    if ((m === 'classica' || m === 'fantasma' || animal) && (ex === 'normal' || ex === 'feliz')) { c.fillStyle = 'rgba(255,120,150,.35)'; elip(c, -7, 2.6 + MY, 2, 1.2); c.fill(); elip(c, 7, 2.6 + MY, 2, 1.2); c.fill(); }
    if (m === 'gato') { c.strokeStyle = rgba(TINTA, .55); c.lineWidth = .5; for (const sg of [-1, 1]) { c.beginPath(); c.moveTo(sg * 6.5, 2.4); c.lineTo(sg * 13.5, 1); c.moveTo(sg * 6.5, 3.6); c.lineTo(sg * 13.5, 4.6); c.stroke(); } }
  }
  if (ex === 'sono') { c.fillStyle = '#efe6d4'; c.font = '600 7px "IBM Plex Mono", monospace'; c.fillText('z', 9, -12 - Math.sin(tt * 3) * 2); c.font = '600 5px "IBM Plex Mono", monospace'; c.fillText('z', 14, -18 - Math.sin(tt * 3 + 1) * 2); }

  const a = est.acessorio;
  if (a === 'oculos') {
    if (m === 'olho') { c.strokeStyle = '#d8b45a'; c.lineWidth = 1.3; circ(c, lx * 2.6, ly * 2.6, 8); c.stroke(); c.lineWidth = .6; c.beginPath(); c.moveTo(lx * 2.6 + 6, ly * 2.6 + 5.5); c.quadraticCurveTo(10, 14, 6, 16); c.stroke(); }
    else { c.strokeStyle = '#1a1020'; c.lineWidth = 1.2; circ(c, -4.3, EY, 3.7); c.stroke(); circ(c, 4.3, EY, 3.7); c.stroke(); c.beginPath(); c.moveTo(-.7, EY - .6); c.quadraticCurveTo(0, EY - 1.4, .7, EY - .6); c.stroke(); c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = .6; c.beginPath(); c.arc(-4.3, EY, 2.6, 3.6, 4.4); c.stroke(); c.beginPath(); c.arc(4.3, EY, 2.6, 3.6, 4.4); c.stroke(); }
  } else if (a === 'escuros') {
    c.fillStyle = '#0b0a10';
    if (m === 'olho') { elip(c, 0, -0.5, 9.5, 6.5); c.fill(); c.strokeStyle = '#0b0a10'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(-12, -2); c.lineTo(12, -2); c.stroke(); }
    else { rr(c, -8.6, EY - 2.6, 7.6, 5.2, 2); c.fill(); rr(c, 1, EY - 2.6, 7.6, 5.2, 2); c.fill(); c.fillRect(-1.5, EY - 2, 3, 1.1); }
    c.strokeStyle = 'rgba(255,255,255,.5)'; c.lineWidth = .7; c.beginPath(); c.moveTo(-7, EY - 1.3); c.lineTo(-4.5, EY - 1.3); c.moveTo(2.6, EY - 1.3); c.lineTo(5.1, EY - 1.3); c.stroke();
  } else if (a === 'bruxa') {
    c.fillStyle = '#231a30';
    c.beginPath(); c.moveTo(-7.5, -10.5); c.quadraticCurveTo(-3, -21, 5, -30); c.quadraticCurveTo(3, -20, 7.5, -10.5); c.closePath(); c.fill();
    elip(c, 0, -10.5, 13.5, 3.1); c.fill();
    c.fillStyle = '#8a55e0'; c.beginPath(); c.moveTo(-7.3, -11); c.lineTo(7.3, -11); c.lineTo(6.6, -14.2); c.lineTo(-6.4, -14.2); c.closePath(); c.fill();
    c.fillStyle = '#ffcf3d'; c.fillRect(-1.6, -14, 3.2, 3);
  } else if (a === 'cartola') {
    c.fillStyle = '#15121c'; c.fillRect(-6.5, -26, 13, 15.5); elip(c, 0, -10.8, 11, 2.6); c.fill(); elip(c, 0, -26, 6.5, 1.6); c.fill();
    c.fillStyle = '#c4313f'; c.fillRect(-6.5, -15, 13, 3);
    c.fillStyle = 'rgba(255,255,255,.12)'; c.fillRect(-4.8, -25, 1.6, 10);
  } else if (a === 'laco') {
    c.fillStyle = '#ff4f9a';
    c.beginPath(); c.moveTo(6, -10); c.lineTo(0.5, -15); c.lineTo(0.8, -5.5); c.closePath(); c.moveTo(6, -10); c.lineTo(11.5, -15); c.lineTo(11.2, -5.5); c.closePath(); c.fill();
    c.fillStyle = '#c92f73'; circ(c, 6, -10, 1.8); c.fill();
  } else if (a === 'coroa') {
    c.fillStyle = '#ffcf3d';
    c.beginPath(); c.moveTo(-7, -9.5); c.lineTo(-7.5, -17); c.lineTo(-3.5, -13); c.lineTo(0, -19.5); c.lineTo(3.5, -13); c.lineTo(7.5, -17); c.lineTo(7, -9.5); c.closePath(); c.fill();
    c.strokeStyle = '#b8901c'; c.lineWidth = .6; c.stroke();
    c.fillStyle = '#ff4d5e'; circ(c, 0, -12.5, 1.3); c.fill(); c.fillStyle = '#7fd3ff'; circ(c, -4.3, -11.5, .9); c.fill(); circ(c, 4.3, -11.5, .9); c.fill();
  } else if (a === 'chifres') {
    c.fillStyle = '#e0303f';
    for (const sg of [-1, 1]) { c.beginPath(); c.moveTo(sg * 8.5, -7); c.quadraticCurveTo(sg * 12, -14, sg * 7.5, -19); c.quadraticCurveTo(sg * 7.5, -13, sg * 3.6, -10); c.closePath(); c.fill(); }
  } else if (a === 'fones') {
    c.strokeStyle = '#22202b'; c.lineWidth = 2.4; c.beginPath(); c.arc(0, -1, 13.5, Math.PI * 1.08, Math.PI * 1.92); c.stroke();
    c.fillStyle = '#2b2838'; rr(c, -16, -5, 5, 10, 2); c.fill(); rr(c, 11, -5, 5, 10, 2); c.fill();
    c.fillStyle = tom(cor, 0.2); c.fillRect(-15, -3, 1.4, 6); c.fillRect(13.6, -3, 1.4, 6);
  } else if (a === 'aureola') {
    const yy = -18 - Math.sin(tt * 3) * 1.2;
    c.strokeStyle = 'rgba(255,214,90,.35)'; c.lineWidth = 4; elip(c, 0, yy, 7.5, 2.3); c.stroke();
    c.strokeStyle = '#ffd65a'; c.lineWidth = 1.6; elip(c, 0, yy, 7.5, 2.3); c.stroke();
  } else if (a === 'bone') {
    const bc = cor === '#4a4366' ? '#e0503a' : '#2f4fb0';
    c.fillStyle = bc; c.beginPath(); c.arc(0, -7.5, 10.6, Math.PI * 1.04, Math.PI * 1.96); c.closePath(); c.fill();
    c.fillStyle = tom(bc, -0.3); c.beginPath(); c.ellipse(9.5, -8.4, 8.4, 2.3, -0.1, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(255,255,255,.25)'; c.beginPath(); c.arc(0, -7.5, 10.6, Math.PI * 1.25, Math.PI * 1.5); c.lineTo(0, -7.5); c.closePath(); c.fill();
    c.fillStyle = tom(bc, 0.4); circ(c, 0, -18, 1.5); c.fill();
  } else if (a === 'flor') {
    c.fillStyle = '#ff9fd0';
    for (let k = 0; k < 5; k++) { const an = k * 1.2566 + tt * .3; circ(c, 7 + Math.cos(an) * 2.7, -9 + Math.sin(an) * 2.7, 2.3); c.fill(); }
    c.fillStyle = '#ffd84d'; circ(c, 7, -9, 1.7); c.fill();
    c.fillStyle = '#6cc24a'; elip(c, 2.8, -7.4, 2.2, 1); c.fill();
  }
  c.restore();
}
const altoDemais = est => est.acessorio === 'cartola' || est.acessorio === 'bruxa' || est.modelo === 'coelho';
function thumb(est, size, expr) {
  const c = document.createElement('canvas'); c.width = c.height = size * 2;
  const x = c.getContext('2d'); x.scale(2, 2);
  desenhaAlma(x, size / 2, size * (altoDemais(est) ? 0.62 : 0.56), size * 0.25, est, { expr: expr || 'normal', lx: .25, ly: .15, t: 0.4 });
  return c.toDataURL();
}
const avatarCache = new Map();
const avatar = est => { const k = est.cor + est.modelo + est.acessorio; if (!avatarCache.has(k)) avatarCache.set(k, thumb(est, 28)); return avatarCache.get(k); };

/* três bichinhos sorteados para uma pessoa: modelos sempre diferentes entre si */
function tresBichinhos(rng) {
  const mods = MODELOS.map(m => m[0]);
  for (let i = mods.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [mods[i], mods[j]] = [mods[j], mods[i]]; }
  const cores = CORES.map(c => c[0]);
  for (let i = cores.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [cores[i], cores[j]] = [cores[j], cores[i]]; }
  return [0, 1, 2].map(k => ({ modelo: mods[k], cor: cores[k], acessorio: rng() < 0.15 ? 'nenhum' : ACESSORIOS[1 + Math.floor(rng() * (ACESSORIOS.length - 1))][0] }));
}

/** Os três bichinhos que a pessoa pode escolher nesta corrida: sempre os mesmos para a mesma pessoa na mesma corrida. */
export const opcoesDe = (corridaId, usuario) => tresBichinhos(mulberry32(hashStr(String(usuario) + '#' + corridaId)));
/** O bichinho que corre: o escolhido ou, se a pessoa não escolheu, um dos três (sempre o mesmo). */
export const bichinhoDe = (corridaId, usuario, escolha) => {
  const ops = opcoesDe(corridaId, usuario);
  return ops[escolha != null && escolha >= 0 && escolha <= 2 ? escolha : hashStr(String(usuario) + corridaId) % 3];
};

export {
  clamp, CORES, MODELOS, ACESSORIOS, descreve, hexRgb, mixHex, tom, rgba, mulberry32, hashStr, rr, elip, circ, esc,
  desenhaAlma, desenhaAlma as desenhaBichinho, altoDemais, thumb, avatar, tresBichinhos,
};

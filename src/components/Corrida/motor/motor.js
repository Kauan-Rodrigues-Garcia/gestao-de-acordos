/**
 * motor.js — a Corrida da Sorte desenhada no canvas: os seis mapas, a física,
 * o lobby (o estádio com a arquibancada em volta), a contagem, a caixa dos
 * mapas, a abertura, a corrida, a festa de quem venceu e a gravação dela em
 * vídeo.
 *
 * É JavaScript puro, portado da página de demonstração que o Cleber aprovou
 * (artefato «Corrida das Almas», out/2026): código de desenho com muito estado
 * de quadro, que não ganha nada com tipos linha a linha. O contrato que o
 * React usa está em `motor.d.ts`, e é só por ele que o resto do app fala com
 * o motor.
 *
 * Como fica em sincronia: o React passa o relógio do banco (`setRelogio`) e a
 * corrida (`setCorrida`, com `abertaEm` e `iniciaEm`). Tudo o que aparece na
 * tela é conta de `agora - iniciaEm` (`linhaDoTempo`), então todo mundo vê o
 * mesmo segundo e quem chega atrasado entra no ponto certo. A corrida em si
 * é a gravação feita uma vez no navegador do super admin (`gravar`), e as
 * telas só a reproduzem.
 */
import { Muxer, ArrayBufferTarget } from 'webm-muxer';
import { CALMO, clamp, CORES, MODELOS, ACESSORIOS, descreve, hexRgb, mixHex, tom, rgba, mulberry32, hashStr, rr, elip, circ, esc, desenhaAlma, altoDemais, thumb, avatar, tresBichinhos } from './bichinhos.js';

export function criarMotor(opcoes) {
const calmo = CALMO;


/* ================= a pista: peças que se encaixam ================= */
const W = 560, R = 11, G = 1050, SUB = 5, STEP = 1 / 60, DT = STEP / SUB, FPS = 30;
const REST = 0.3, REST_PEG = 0.5, FRIC = 0.004, REST_BOLA = 0.55, F_R = 54, GP = 700;
const PORTAO_Y = 235, DIV_X = 280, ALC_CICLO = 4.2, PORTAO_MAX = 10, CALD_MAX = 9, LONGE_ = -1e9;
let H = 8300, CHEGADA = 8000, DIV_Y0 = LONGE_, DIV_Y1 = LONGE_, ALC_Y = LONGE_, CALD_Y = LONGE_, FANT_Y = [LONGE_, LONGE_], TEIA_Y = [LONGE_, LONGE_];
let MOINHO = { x: 280, y: LONGE_ }, CORVO = { x: 314, y: LONGE_ };
let TRECHOS = [], PANTANO = [], BRUXAS = [], FANTASMAS = [], RETRATOS = [], SAIDA = { x: 280, y: 0 };
/* peças novas: zonas de força (gravidade zero, correnteza, bolhas, gêiser) e a chuva de lava */
let ZONAS = [], GEISERES = [], CHUVA = null, MODO_PORTAO = 'contagem', MODO_CALD = 'contagem';
const RITMO_PORTAO = 5.2, ABERTO_PORTAO = 1.6, RITMO_CALD = 3.4;
const segs = [], pegs = [], spins = [], maos = [], teias = [], morcegosPousados = [];
let MAPA = null, SK = null;
const naFilaDoPortao = b => b.y > ALC_Y - 110 && b.y < ALC_Y && Math.abs(b.x - W / 2) < 245;
const seg = (x1, y1, x2, y2, tipo, e) => segs.push({ x1, y1, x2, y2, tipo, e: e || 3 });
const peg = (x, y, r, tipo, extra) => pegs.push(Object.assign({ x, y, r, tipo, brilho: 0 }, extra || {}));
const galho = (cx, cy, dir, L) => { L = L || 80; const h = L * 0.17; seg(cx - L / 2, cy - dir * h, cx + L / 2, cy + dir * h, 'galho', 4); };
// rampa com buracos: cada furo tem 34 px de vão, na fração indicada
function ponte(xa, ya, xb, yb, furos) {
  const L = Math.abs(xb - xa), meio = 17 / L; let u0 = 0;
  for (const f of furos) { const u1 = f - meio; seg(xa + (xb - xa) * u0, ya + (yb - ya) * u0, xa + (xb - xa) * u1, ya + (yb - ya) * u1, 'ponte', 4); u0 = f + meio; }
  seg(xa + (xb - xa) * u0, ya + (yb - ya) * u0, xb, yb, 'ponte', 4);
}
const trecho = (y, tipo) => TRECHOS.push({ y, tipo });

/* cada peça monta a partir do y onde começa; devolve onde o portal de «volta» pode soltar uma alma */
const BLOCOS = {
  // campo de pinos com agarradores; as peças da ponta encostam na parede, sem corredor livre
  lapides: { len: 740, monta(y0) {
    trecho(y0, 'lapides');
    const ep = SK.epitafios, GRANDES = { '2,2': ep[0], '4,6': ep[1], '6,1': ep[2], '8,5': ep[3], '10,3': ep[4], '12,7': ep[5] }, MAOS = { '3,7': 1, '5,4': 1, '9,1': 1 };
    for (let i = 0; i < 13; i++) {
      const y = y0 + 30 + 56 * i, xs = [];
      if (i % 2) for (let x = 40; x <= W; x += 64) xs.push(x); else { for (let x = 0; x <= 512; x += 64) xs.push(x); xs.push(W); }
      xs.forEach((x, j) => {
        const key = i + ',' + j;
        if (GRANDES[key]) peg(x, y, 18, 'lapideG', { txt: GRANDES[key] });
        else if (MAOS[key]) { maos.push({ x, y }); peg(x, y + 5, 7, 'monte'); }
        else peg(x, y, 8, 'lapide');
      });
    }
    return y0 + 400;
  } },
  // encruzilhada com a gangorra e os dois caminhos, com duas atiradoras
  forquilha: { len: 1880, monta(y0) {
    trecho(y0, 'encruzilhada'); trecho(y0 + 150, 'caminhos');
    seg(0, y0 + 10, W / 2 - 46, y0 + 90, 'ferro'); seg(W, y0 + 10, W / 2 + 46, y0 + 90, 'ferro');
    spins.push({ tipo: 'gangorra', cx: W / 2, cy: y0 + 122, L: 44, amp: 0.55, f: 3.2 });
    CORVO = { x: W / 2 + 34, y: y0 + 52 };
    DIV_Y0 = y0 + 150; DIV_Y1 = y0 + 1870;
    seg(DIV_X, DIV_Y0, DIV_X, y0 + 590, 'muro', 4); seg(DIV_X, y0 + 660, DIV_X, y0 + 1040, 'muro', 4); seg(DIV_X, y0 + 1110, DIV_X, y0 + 1490, 'muro', 4); seg(DIV_X, y0 + 1560, DIV_X, DIV_Y1, 'muro', 4);
    seg(170, y0 + 590, 266, y0 + 640, 'raiz', 4); seg(395, y0 + 1040, 294, y0 + 1090, 'raiz', 4); seg(170, y0 + 1490, 266, y0 + 1540, 'raiz', 4);
    for (let k = 0, y = y0 + 190; y <= y0 + 1840; y += 62, k++) for (const x of (k % 2 ? [0, 70, 140, 210] : [35, 105, 175, 243])) peg(x, y, 8, 'osso');
    PANTANO = [{ x: 140, y: y0 + 440, r: 46 }, { x: 150, y: y0 + 870, r: 46 }, { x: 110, y: y0 + 1290, r: 40 }, { x: 160, y: y0 + 1710, r: 44 }];
    for (let k = 0, y = y0 + 205; y <= y0 + 1830; y += 95, k++) {
      if (k % 2 === 0) { galho(360, y, -1); galho(480, y, -1); }
      else { galho(420, y, k % 4 === 1 ? 1 : -1); peg(286, y + 10, 8, 'osso'); peg(335, y + 10, 8, 'osso'); peg(W, y + 10, 8, 'osso'); }
    }
    BRUXAS.push({ base: y0 + 440, faixa: [y0 + 160, y0 + 1020], vel: 0.5 }, { base: y0 + 1340, faixa: [y0 + 1020, y0 + 1880], vel: 0.62 });
    return y0 + 400;
  } },
  // portão que segura quem chega cedo
  portao: { len: 160, monta(y0) {
    trecho(y0, 'portao');
    ALC_Y = y0 + 110;
    seg(0, y0 + 40, W / 2 - 60, ALC_Y, 'ferro'); seg(W, y0 + 40, W / 2 + 60, ALC_Y, 'ferro');
    seg(W / 2 - 60, ALC_Y, W / 2 + 60, ALC_Y, 'alcapao', 4);
    return y0 + 20;
  } },
  // salão de para-choques com empurradores
  salao: { len: 1090, monta(y0) {
    trecho(y0, 'salao');
    for (let k = 0; k <= 11; k++) {
      const y = y0 + 30 + 85 * k;
      for (const x of (k % 2 ? [48, 144, 240, 336, 432, 518] : [0, 96, 192, 288, 384, 480, W])) peg(x, y, 13, 'cristal', { bumper: k % 3 === 2 && x >= 180 && x <= 380, kick: 420 });
    }
    FANTASMAS = [90, 280, 510, 770].map((b, i) => ({ base: y0 + b, ax: 170 + i * 12, wx: 0.8 + i * 0.13 }));
    FANT_Y = [y0 - 10, y0 + 1060];
    RETRATOS = [[6, 50], [W - 46, 220], [6, 400], [W - 46, 580], [6, 760], [W - 46, 930]].map(([x, y]) => [x, y0 + y]);
    seg(0, y0 + 1010, 150, y0 + 1060, 'pedra'); seg(W, y0 + 1010, W - 150, y0 + 1060, 'pedra');
    return y0 + 560;
  } },
  // rampas compridas com buracos
  ponte: { len: 890, monta(y0) {
    trecho(y0, 'ponte');
    for (let i = 0; i < 6; i++) {
      const y = y0 + 50 + i * 150, furos = i % 2 ? [0.3, 0.64] : [0.36, 0.7];
      if (i % 2 === 0) ponte(0, y, W - 70, y + 38, furos); else ponte(W, y, 70, y + 38, furos);
    }
    return y0 + 160;
  } },
  // o moinho que carrega as almas entre as pás, e duas foices
  moinho: { len: 770, monta(y0) {
    trecho(y0, 'moinho');
    seg(0, y0 + 20, 200, y0 + 80, 'pedra');
    MOINHO = { x: 280, y: y0 + 230 };
    spins.push({ tipo: 'moinho', cx: MOINHO.x, cy: MOINHO.y, L: 140, w: 1.0, grupo: 0, off: 0 }, { tipo: 'moinho', cx: MOINHO.x, cy: MOINHO.y, L: 140, w: 1.0, grupo: 0, off: Math.PI / 2 });
    for (let k = 0, y = y0 + 110; y <= y0 + 410; y += 60, k++) for (const x of (k % 2 ? [40, 102] : [8, 70])) { peg(x, y, 8, 'osso'); peg(W - x, y, 8, 'osso'); }
    spins.push({ tipo: 'foice', cx: 150, cy: y0 + 530, L: 85, w: 2.6, grupo: 1, off: 0 }, { tipo: 'foice', cx: 395, cy: y0 + 640, L: 80, w: -2.9, grupo: 2, off: 0 });
    [[330, 20], [410, 42], [490, 20], [522, 600], [W, 610]].forEach(([x, y]) => peg(x, y0 + y, 8, 'osso'));
    for (let k = 0, y = y0 + 440; y <= y0 + 760; y += 64, k++) for (let x = k % 2 ? 40 : 0; x <= W; x += 80) peg(x, y, 8, 'osso');
    return y0 + 460;
  } },
  // o embaralhador: segura as almas e cospe em ordem sorteada
  caldeirao: { len: 490, monta(y0) {
    trecho(y0, 'caldeirao');
    CALD_Y = y0 + 232;
    seg(0, y0 + 30, W / 2 - 70, CALD_Y - 2, 'ferro'); seg(W, y0 + 30, W / 2 + 70, CALD_Y - 2, 'ferro');
    return y0 + 470;
  } },
  // zonas que seguram (teias, algas, neve...)
  teias: { len: 800, monta(y0) {
    trecho(y0, 'teias');
    teias.push({ x: 140, y: y0 + 130, r: 62 }, { x: 410, y: y0 + 240, r: 62 }, { x: 220, y: y0 + 400, r: 62 }, { x: 440, y: y0 + 540, r: 56 }, { x: 120, y: y0 + 650, r: 50 });
    TEIA_Y = [y0 + 40, y0 + 720];
    for (let k = 0, y = y0 + 50; y <= y0 + 710; y += 70, k++) for (let x = k % 2 ? 40 : 0; x <= W; x += 80) peg(x, y, 8, 'osso');
    return y0 + 300;
  } },
  // fliperama final com a atiradora da reta e a foice grande; termina na chegada
  fliper: { len: 1210, monta(y0) {
    trecho(y0, 'fliper');
    spins.push({ tipo: 'foice', cx: 280, cy: y0 + 470, L: 105, w: 2.2, grupo: 3, off: 0 });
    for (let k = 0; k <= 8; k++) { const y = y0 + 50 + 95 * k; for (const x of (k % 2 ? [48, 144, 240, 336, 432, 518] : [0, 96, 192, 288, 384, 480, W])) peg(x, y, 13, 'abobora', { bumper: true, kick: 300 }); }
    BRUXAS.push({ base: y0 + 210, faixa: [y0 - 30, y0 + 890], vel: 0.55 });
    CHEGADA = y0 + 910; H = y0 + 1210;
    seg(0, y0 + 1150, W, y0 + 1150, 'pedra', 4);
    return y0 + 300;
  } },
  // blocos-mola: plataformas curtas e inclinadas que lançam a alma para cima e para o lado
  molas: { len: 760, monta(y0) {
    trecho(y0, 'molas');
    for (let k = 0; k < 6; k++) {
      const y = y0 + 70 + 115 * k, xs = k % 2 ? [190, 370] : [95, 280, 465];
      xs.forEach((x, j) => { const inc = ((j + k) % 2 ? 1 : -1) * 13; seg(x - 32, y - inc, x + 32, y + inc, 'mola', 4); segs[segs.length - 1].kick = 540; });
      for (const x of (k % 2 ? [0, 95, 280, 465, W] : [190, 370])) peg(x, y + 58, 8, 'osso');
    }
    return y0 + 380;
  } },
  // plataformas que andam de um lado para o outro
  plataformas: { len: 820, monta(y0) {
    trecho(y0, 'plataformas');
    for (let k = 0; k < 5; k++) {
      const y = y0 + 80 + 150 * k, f = 1.05 + k * 0.17;
      spins.push({ tipo: 'barra', cx: 150, cy: y, L: 62, A: 105, f, fase: k * 1.3 });
      spins.push({ tipo: 'barra', cx: 410, cy: y + 18, L: 62, A: 105, f: f * 0.9, fase: k * 1.3 + Math.PI });
      for (const x of [0, 280, W]) peg(x, y + 78, 8, 'osso');
    }
    return y0 + 420;
  } },
  // correnteza: faixas que empurram de lado e trocam de sentido; colunas de bolhas seguram a queda
  correntes: { len: 860, monta(y0) {
    trecho(y0, 'correntes');
    for (let k = 0; k < 4; k++) ZONAS.push({ tipo: 'corrente', x0: 0, x1: W, y0: y0 + 40 + k * 200, y1: y0 + 200 + k * 200, dir: k % 2 ? -1 : 1, fase: k * 1.7 });
    for (const x of [140, 420]) ZONAS.push({ tipo: 'bolhas', x0: x - 24, x1: x + 24, y0: y0 + 60, y1: y0 + 820 });
    for (let k = 0; k < 4; k++) for (const x of (k % 2 ? [70, 280, 490] : [210, 350])) peg(x, y0 + 140 + k * 200, 8, 'lapide');
    return y0 + 420;
  } },
  // gravidade zero: a alma flutua devagar e um redemoinho leva de um lado para o outro
  orbita: { len: 900, monta(y0) {
    trecho(y0, 'orbita');
    ZONAS.push({ tipo: 'orbita', x0: 0, x1: W, y0: y0 + 40, y1: y0 + 860 });
    [[90, 170], [300, 260], [470, 180], [180, 420], [400, 470], [80, 640], [290, 700], [490, 650]].forEach(([x, y]) => peg(x, y0 + y, 9, 'lapide'));
    [[200, 300], [380, 580]].forEach(([x, y]) => peg(x, y0 + y, 13, 'cristal', { bumper: true, kick: 360 }));
    return y0 + 450;
  } },
  // esteiras (o rio do templo): rampas que puxam para um lado e trocam de sentido
  esteiras: { len: 820, monta(y0) {
    trecho(y0, 'esteiras');
    for (let i = 0; i < 5; i++) {
      const y = y0 + 60 + i * 150;
      if (i % 2 === 0) seg(0, y, 390, y + 34, 'esteira', 4); else seg(W, y, W - 390, y + 34, 'esteira', 4);
      Object.assign(segs[segs.length - 1], { vel: 300, fase: i * 1.9 });
      peg(i % 2 ? 110 : 450, y + 90, 8, 'osso');
    }
    return y0 + 380;
  } },
  // lâminas de pêndulo
  pendulos: { len: 780, monta(y0) {
    trecho(y0, 'pendulos');
    for (let k = 0; k < 4; k++) {
      const y = y0 + 40 + 180 * k, x = k % 2 ? 380 : 180;
      spins.push({ tipo: 'pendulo', cx: x, cy: y, L: 125, A: 1.05, f: 1.9 + k * 0.15, fase: k * 1.1 });
      if (k % 2) seg(0, y + 30, 120, y + 60, 'pedra'); else seg(W, y + 30, W - 120, y + 60, 'pedra');
    }
    return y0 + 380;
  } },
  // chuva de lava: bolas de fogo caem do alto do trecho, sem mirar em ninguém
  chuva: { len: 780, monta(y0) {
    trecho(y0, 'chuva');
    CHUVA = { y0: y0 + 10, y1: y0 + 760 };
    for (let i = 0; i < 9; i++) {
      const y = y0 + 70 + 80 * i, xs = [];
      if (i % 2) for (let x = 60; x <= W; x += 110) xs.push(x); else for (let x = 5; x <= W; x += 110) xs.push(x);
      xs.forEach(x => peg(x, y, 9, 'lapide'));
    }
    return y0 + 400;
  } },
  // gêiseres: jatos que ligam de tempo em tempo e jogam a alma para cima
  geiseres: { len: 780, monta(y0) {
    trecho(y0, 'geiseres');
    [[110, 230], [420, 290], [260, 450], [90, 600], [470, 640], [290, 740]].forEach(([x, y], i) => {
      GEISERES.push({ x, y: y0 + y, alt: 165, fase: i * 0.97 });
      ZONAS.push({ tipo: 'geiser', g: GEISERES.length - 1, x0: x - 26, x1: x + 26, y0: y0 + y - 165, y1: y0 + y });
    });
    for (let k = 0; k < 7; k++) for (const x of (k % 2 ? [40, 190, 340, 500] : [115, 265, 415])) peg(x, y0 + 120 + k * 95, 8, 'osso');
    return y0 + 380;
  } },
};

function distSeg(x, y, s) { const dx = s.x2 - s.x1, dy = s.y2 - s.y1; let u = ((x - s.x1) * dx + (y - s.y1) * dy) / (dx * dx + dy * dy); u = clamp(u, 0, 1); return Math.hypot(x - (s.x1 + u * dx), y - (s.y1 + u * dy)); }
let PECAS = [];
function carregaMapa(id) {
  MAPA = MAPAS.find(m => m.id === id) || MAPAS[0]; SK = SKINS[MAPA.id];
  for (const a of [segs, pegs, spins, maos, teias, morcegosPousados]) a.length = 0;
  DIV_Y0 = DIV_Y1 = ALC_Y = CALD_Y = LONGE_; FANT_Y = [LONGE_, LONGE_]; TEIA_Y = [LONGE_, LONGE_]; MOINHO = { x: 280, y: LONGE_ }; CORVO = { x: 314, y: LONGE_ };
  TRECHOS = [{ y: -200, tipo: 'largada' }]; PANTANO = []; BRUXAS = []; FANTASMAS = []; RETRATOS = []; ZONAS = []; GEISERES = []; CHUVA = null;
  MODO_PORTAO = (MAPA.modos && MAPA.modos.portao) || 'contagem'; MODO_CALD = (MAPA.modos && MAPA.modos.cald) || 'contagem';
  seg(0, PORTAO_Y, W, PORTAO_Y, 'portao', 4);
  let y = 270; PECAS = [];
  for (const nome of MAPA.blocos) { const b = BLOCOS[nome], volta = b.monta(y); PECAS.push({ nome, y0: y, len: b.len, volta }); y += b.len; }
  seg(0, -600, 0, H, 'parede'); seg(W, -600, W, H, 'parede');
  // o embaralhador solta as almas logo abaixo dele, sem portal: ninguém pula nem volta trecho
  const cp = PECAS.find(p => p.nome === 'caldeirao');
  SAIDA = { x: W / 2, y: cp ? cp.y0 + 452 : LONGE_ };
  // limpeza: nada pode deixar um vão menor que uma alma (ela entalaria)
  for (let i = pegs.length - 1; i >= 0; i--) {
    const p = pegs[i]; let fora = false;
    for (const s of segs) { if (s.tipo === 'portao') continue; const gap = distSeg(p.x, p.y, s) - p.r - s.e, encosta = s.tipo === 'parede' || s.tipo === 'muro'; if (encosta ? (gap > 0 && gap < 2 * R + 2) : gap < 2 * R + 2) { fora = true; break; } }
    for (const s of spins) {
      if (s.tipo === 'barra') { if (Math.abs(p.y - s.cy) < p.r + 2 * R + 10 && Math.abs(p.x - s.cx) < s.A + s.L + p.r + 2 * R) fora = true; }
      else if (s.tipo !== 'gangorra' && Math.hypot(p.x - s.cx, p.y - s.cy) < s.L + p.r + 2 * R + 4) fora = true;
    }
    for (const g of GEISERES) if (Math.abs(p.x - g.x) < 26 + p.r + R && p.y > g.y - g.alt - 10 && p.y < g.y + 20) fora = true;
    if (fora) pegs.splice(i, 1);
  }
  for (const s of segs) if (s.tipo === 'galho') { for (const f of [0.35, 0.7]) morcegosPousados.push({ x: s.x1 + (s.x2 - s.x1) * f, y: s.y1 + (s.y2 - s.y1) * f + 9 }); }
  morcegosPousados.splice(0, morcegosPousados.length, ...morcegosPousados.filter((_, i) => i % 3 === 0));
  TRECHOS = TRECHOS.map(tr => { const n = SK.nomes[tr.tipo]; return Object.assign(tr, { nome: n[0], curto: n[1], prep: n[2], bg: SK.bg[tr.tipo] }); });
  aranhas = teias.map(w => ({ y: w.y - w.r - 30 }));
  coruja.y = DIV_Y0 + 40;
  fantasmaBu = FANTASMAS.map(() => -9);
  LONGE = TRECHOS.map((tr, i) => { const r = mulberry32(1000 + i); return Array.from({ length: 14 }, () => [r(), r(), r()]); });
}

/* funções de tempo dos obstáculos: as mesmas na gravação e na reprodução */
function anguloSpin(s, T, fz) {
  if (s.tipo === 'gangorra') { const ph = T * s.f + fz.gangorra; return [s.amp * Math.sin(ph), s.amp * s.f * Math.cos(ph)]; }
  return [fz.spins[s.grupo] + s.off + s.w * T, s.w];
}
/* onde está cada peça que se mexe: as mesmas contas na gravação e no desenho */
function geoSpin(s, T, fz) {
  const ex = fz.extra || 0;
  if (s.tipo === 'barra') { const ph = T * s.f + s.fase + ex, x = s.cx + s.A * Math.sin(ph); return { x1: x - s.L, y1: s.cy, x2: x + s.L, y2: s.cy, w: 0, cx: x, cy: s.cy, tvx: s.A * s.f * Math.cos(ph), tvy: 0, a: 0 }; }
  if (s.tipo === 'pendulo') { const ph = T * s.f + s.fase + ex, a = s.A * Math.sin(ph), w = s.A * s.f * Math.cos(ph); return { x1: s.cx, y1: s.cy, x2: s.cx + Math.sin(a) * s.L, y2: s.cy + Math.cos(a) * s.L, w: -w, cx: s.cx, cy: s.cy, tvx: 0, tvy: 0, a }; }
  const [a, w] = anguloSpin(s, T, fz), dx = Math.cos(a) * s.L, dy = Math.sin(a) * s.L;
  return { x1: s.cx - dx, y1: s.cy - dy, x2: s.cx + dx, y2: s.cy + dy, w, cx: s.cx, cy: s.cy, tvx: 0, tvy: 0, a };
}
const velEsteira = (s, T, fz) => s.vel * Math.tanh(4 * Math.sin(T * 1.25 + s.fase + (fz.extra || 0)));
const forcaCorrente = (z, T, fz) => z.dir * Math.tanh(3 * Math.sin(T * 1.1 + z.fase + (fz.extra || 0)));
const geiserFase = (g, T, fz) => (T + g.fase + (fz.extra || 0) * 0.37) % 2.6;
const geiserAtivo = (g, T, fz) => geiserFase(g, T, fz) < 0.5;
const fasePortao = (T, fz) => (T + fz.alcapao) % RITMO_PORTAO;
const faseCald = (T, fz) => (T + (fz.cald || 0)) % RITMO_CALD;
const posFantasma = (f, i, T, fz) => [W / 2 + f.ax * Math.sin(T * f.wx + fz.fantasmas[i]), f.base + 34 * Math.sin(T * 1.6 + fz.fantasmas[i] * 1.7)];
const posBruxa = (b, i, T, fz) => [W / 2 + (W / 2 - 60) * Math.sin(T * b.vel + fz.bruxas[i]), b.base + 40 * Math.sin(T * 1.3 + fz.bruxas[i] * 2)];
const altMao = (i, T, fz) => { const ci = (T + fz.maos[i]) % 3.4; return ci < 0.25 ? ci / 0.25 : ci < 1.35 ? 1 : ci < 1.65 ? 1 - (ci - 1.35) / 0.3 : 0; };
const portaoEm = T => { if (!rec) return false; for (const [a, b] of rec.alcapao) if (T >= a && T < b) return true; return false; };
const portaoAngEm = T => { if (!rec) return 0; for (const [a, b] of rec.alcapao) { if (T >= a && T < b) return Math.min(1, (T - a) / 0.18); if (T >= b && T < b + 0.15) return 1 - (T - b) / 0.15; } return 0; };
const pantanoNivel = (i, T, fz) => clamp((Math.sin(T * 0.9 + fz.pantano[i]) + 0.1) / 0.25, 0, 1);

/* ================= gravação ================= */
function criarGravacao(seed, pessoas) {
  const rng = mulberry32(seed), r2 = mulberry32(seed ^ 0x9e3779b9), TX = SK.txt;
  const fz = { spins: [0, 1, 2, 3].map(() => rng() * Math.PI), maos: maos.map(() => rng() * 3.4), bruxas: BRUXAS.map(() => rng() * 6.28), fantasmas: FANTASMAS.map(() => rng() * 6.28), gangorra: rng() * 6.28, alcapao: rng() * ALC_CICLO, pantano: PANTANO.map(() => rng() * 6.28) };
  fz.extra = rng() * 20; fz.cald = rng() * RITMO_CALD; const rChuva = mulberry32(seed ^ 0x3c6ef372);
  const lista = [];
  pessoas.forEach((p, i) => p.estilos.forEach(est => lista.push({ dono: i, est })));
  for (let i = lista.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [lista[i], lista[j]] = [lista[j], lista[i]]; }
  const n = lista.length;
  const PN = Math.max(1, Math.min(16, Math.round(n * 0.38))), CN = Math.max(1, Math.min(18, Math.round(n * 0.42)));
  const bolas = lista.map((l, idx) => ({
    x: 30 + (idx % 13) * 41.5 + (rng() - .5) * 6, y: 200 - Math.floor(idx / 13) * 34 + (rng() - .5) * 6,
    vx: (rng() - .5) * 40, vy: 0, dono: l.dono, est: l.est, fim: 0, tFim: 0, parado: 0, chutes: 0, preso: false, sumido: -1, imune: 0, tonta: 0, grudada: 0, medo: 0, voltas: 0,
    toqueY: 0, lado: 0, molaT: -9,
  }));
  const raios = []; for (let x = 6 + r2() * 5; x < 260; x += 7 + r2() * 9) raios.push({ t: x, px: r2(), seed: Math.floor(r2() * 1e6) });
  const rec = {
    seed, mapa: MAPA.id, fps: FPS, n, dono: bolas.map(b => b.dono), est: bolas.map(b => b.est), nomes: pessoas.map(p => p.nome), setores: pessoas.map(p => p.setor || ''), voce: pessoas.findIndex(p => p.voce), portaoN: PN, caldN: CN, portaoModo: MODO_PORTAO, caldModo: MODO_CALD,
    fz, raios, X: [], Y: [], F: [], frames: 0, tFim: new Float32Array(n), ordem: new Int16Array(n), tAbre: 3, vencedor: -1, tVenc: 0, foto: null,
    pocoes: [], gosmas: [], eventos: [], narr: [], alcapao: [], caldeirao: [], corvoT: Infinity, morcegoT: morcegosPousados.map(() => Infinity), dur: 0,
    metricas: { maxQueda: 0, ondeQueda: 0, presos: 0, quedas: [], presosPos: [], lideres: [], ordens: [] },
  };
  let t = 0, passoN = 0, estado = 'contagem', ordem = 0, tFim = 0, acabou = false;
  let pocoes = [], gosmas = [], donosChegados = [], posCache = new Map(), liderAnt = -1, ultLider = -9, top3Ant = [], ultTop3 = -9, trechoLider = 0, ultimoCheck = 0, ultEvento = -9, ciclAnt = -1, viuForquilha = false, proxChuva = 0, geiserAnt = GEISERES.map(() => false), viuRitmo = false, portaoAberto = false, portaoAte = 0, portaoDesde = -1, cald = [], caldDesde = -1;
  const maosEst = maos.map(() => ({ segura: -1, ate: 0 }));
  const proxBruxa = BRUXAS.map(() => 4 + rng() * 3);
  const nome = i => pessoas[i].nome;
  const ehVoce = i => pessoas[i].voce && pessoas[i].nome === 'Você';
  const alma = i => `o bichinho de ${pessoas[i].nome}`;
  const naAlma = i => `o bichinho de ${pessoas[i].nome}`;
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const destaque = i => !donosChegados.includes(i) && ((posCache.get(i) ?? 99) < 6 || pessoas[i].voce);
  const podeNarrar = () => { if (t - ultEvento < 1.6) return false; ultEvento = t; return true; };
  const narrar = txt => rec.narr.push({ t, txt });
  const ev = (tipo, x, y, o) => rec.eventos.push(Object.assign({ t, tipo, x, y }, o || {}));
  const ativa = b => !b.preso && b.sumido <= t;
  const toca = b => { if (estado === 'corrida' && b.y - b.toqueY > 150) rec.metricas.quedas.push([Math.round(b.x), Math.round(b.toqueY), Math.round(b.y)]); b.toqueY = b.y; };
  const ladoNome = x => SK.lados[x < DIV_X ? 0 : 1];

  function bateSeg(b, x1, y1, x2, y2, e, w, cx, cy, tvx = 0, tvy = 0, fric = FRIC) {
    const dx = x2 - x1, dy = y2 - y1, len2 = dx * dx + dy * dy;
    let u = ((b.x - x1) * dx + (b.y - y1) * dy) / len2; u = u < 0 ? 0 : u > 1 ? 1 : u;
    const px = x1 + u * dx, py = y1 + u * dy;
    let nx = b.x - px, ny = b.y - py; const d2 = nx * nx + ny * ny, rr2 = R + e;
    if (d2 >= rr2 * rr2 || d2 === 0) return -1;
    const d = Math.sqrt(d2); nx /= d; ny /= d;
    b.x = px + nx * rr2; b.y = py + ny * rr2;
    let svx = tvx, svy = tvy; if (w) { svx += -w * (py - cy); svy += w * (px - cx); }
    let rvx = b.vx - svx, rvy = b.vy - svy;
    const vn = rvx * nx + rvy * ny;
    if (vn < 0) {
      rvx -= (1 + REST) * vn * nx; rvy -= (1 + REST) * vn * ny;
      const tx = -ny, ty = nx, vt = rvx * tx + rvy * ty;
      rvx -= vt * fric * tx; rvy -= vt * fric * ty;
    } else if (fric > FRIC) { const tx = -ny, ty = nx, vt = rvx * tx + rvy * ty; rvx -= vt * fric * 0.25 * tx; rvy -= vt * fric * 0.25 * ty; }
    b.vx = rvx + svx; b.vy = rvy + svy; toca(b);
    return vn < 0 ? -vn : 0;
  }

  function subpasso(ts) {
    const geos = spins.map(s => geoSpin(s, ts, fz)), gAtivo = GEISERES.map(g => geiserAtivo(g, ts, fz)), corr = ZONAS.map(z => z.tipo === 'corrente' ? forcaCorrente(z, ts, fz) : 0);
    const fant = FANTASMAS.map((f, i) => posFantasma(f, i, ts, fz));
    const alc = portaoAberto;
    const pant = PANTANO.map((_, i) => pantanoNivel(i, ts, fz) >= 1);
    for (const b of bolas) {
      if (!ativa(b)) continue;
      b.vy += G * DT; b.vx *= 0.9996;
      for (let zi = 0; zi < ZONAS.length; zi++) {
        const z = ZONAS[zi]; if (b.y < z.y0 || b.y > z.y1 || b.x < z.x0 || b.x > z.x1) continue;
        if (z.tipo === 'orbita') { b.vy -= G * 0.72 * DT; b.vx += 300 * Math.sin(b.y * 0.011 + ts * 0.9 + fz.extra) * DT; b.vx *= 0.9975; b.vy *= 0.9975; }
        else if (z.tipo === 'corrente') { b.vx += 820 * corr[zi] * DT; }
        else if (z.tipo === 'bolhas') { b.vy -= 760 * DT; b.vy *= 0.998; }
        else if (z.tipo === 'geiser' && gAtivo[z.g]) { b.vy -= 3600 * DT; b.vx += (b.x < (z.x0 + z.x1) / 2 ? -1 : 1) * 240 * DT; b.tonta = t + 0.6; toca(b); }
      }
      if (b.y > FANT_Y[0] && b.y < FANT_Y[1]) for (const [fx, fy] of fant) {
        const dx = b.x - fx, dy = b.y - fy, d2 = dx * dx + dy * dy;
        if (d2 < F_R * F_R && d2 > 1) { const d = Math.sqrt(d2), k2 = (1 - d / F_R) * 3600 * DT; b.vx += dx / d * k2; b.vy += dy / d * k2; b.medo = t + 0.7; toca(b); }
      }
      for (const g of gosmas) { const dx = b.x - g.x, dy = b.y - g.y; if (dx * dx + dy * dy < g.r * g.r) { b.vx *= 0.985; b.vy *= 0.985; b.grudada = t + 0.4; toca(b); } }
      if (b.y > DIV_Y0 && b.y < DIV_Y1 && b.x < DIV_X) PANTANO.forEach((p, i) => { if (!pant[i]) return; const dx = b.x - p.x, dy = b.y - p.y; if (dx * dx + dy * dy < p.r * p.r) { b.vx *= 0.986; b.vy *= 0.986; b.grudada = t + 0.4; toca(b); } });
      if (b.y > TEIA_Y[0] && b.y < TEIA_Y[1]) for (const w of teias) { const dx = b.x - w.x, dy = b.y - w.y; if (dx * dx + dy * dy < w.r * w.r) { b.vx *= 0.982; b.vy *= 0.982; toca(b); } }
      const v2 = b.vx * b.vx + b.vy * b.vy; if (v2 > 1e6) { const f = 1000 / Math.sqrt(v2); b.vx *= f; b.vy *= f; }
      b.x += b.vx * DT; b.y += b.vy * DT;
      for (const s of segs) {
        if ((s.tipo === 'portao' && estado !== 'contagem') || (s.tipo === 'alcapao' && alc)) continue;
        if (b.y < Math.min(s.y1, s.y2) - 16 || b.y > Math.max(s.y1, s.y2) + 16) continue;
        if (s.tipo === 'esteira') { const L = Math.hypot(s.x2 - s.x1, s.y2 - s.y1), v = velEsteira(s, ts, fz); bateSeg(b, s.x1, s.y1, s.x2, s.y2, s.e, 0, 0, 0, (s.x2 - s.x1) / L * v, (s.y2 - s.y1) / L * v, 0.22); continue; }
        const imp = bateSeg(b, s.x1, s.y1, s.x2, s.y2, s.e, 0, 0, 0);
        // mola: joga para cima e para o meio da pista (nunca contra a parede); cada alma gasta no máximo 8 pulos
        if (s.tipo === 'mola' && imp >= 0 && (b.molaN || 0) < 8) {
          const L = Math.hypot(s.x2 - s.x1, s.y2 - s.y1); let nx = -(s.y2 - s.y1) / L, ny = (s.x2 - s.x1) / L; if (ny > 0) { nx = -nx; ny = -ny; }
          if (nx * (W / 2 - (s.x1 + s.x2) / 2) < 0) nx = -nx;
          const vn = b.vx * nx + b.vy * ny; if (vn < s.kick) { b.vx += (s.kick - vn) * nx; b.vy += (s.kick - vn) * ny; }
          if (t - b.molaT > 0.3) { b.molaT = t; b.molaN = (b.molaN || 0) + 1; ev('mola', (s.x1 + s.x2) / 2, (s.y1 + s.y2) / 2); }
        }
      }
      for (const p of pegs) {
        if (Math.abs(p.y - b.y) > 32) continue;
        let nx = b.x - p.x, ny = b.y - p.y; const rr2 = R + p.r, d2 = nx * nx + ny * ny;
        if (d2 >= rr2 * rr2 || d2 === 0) continue;
        const d = Math.sqrt(d2); nx /= d; ny /= d;
        b.x = p.x + nx * rr2; b.y = p.y + ny * rr2; toca(b);
        const vn = b.vx * nx + b.vy * ny;
        if (vn < 0) {
          b.vx -= (1 + REST_PEG) * vn * nx; b.vy -= (1 + REST_PEG) * vn * ny;
          if (p.bumper) { const vo = b.vx * nx + b.vy * ny; if (vo < p.kick) { b.vx += (p.kick - vo) * nx; b.vy += (p.kick - vo) * ny; } ev('bumper', p.x, p.y, { tipoP: p.tipo, pi: pegs.indexOf(p) }); }
          else if (-vn > 280) ev(p.tipo === 'lapide' || p.tipo === 'lapideG' ? 'poeira' : 'toque', p.x + nx * p.r, p.y + ny * p.r);
        }
      }
      spins.forEach((s, i) => {
        const g = geos[i]; if (b.y < Math.min(g.y1, g.y2) - 20 || b.y > Math.max(g.y1, g.y2) + 20) return;
        const imp = bateSeg(b, g.x1, g.y1, g.x2, g.y2, s.tipo === 'moinho' || s.tipo === 'barra' || s.tipo === 'pendulo' ? 5 : 3, g.w, g.cx, g.cy, g.tvx, g.tvy);
        if (imp > 200 && (s.tipo === 'foice' || s.tipo === 'pendulo')) { b.tonta = t + 1.1; ev('faisca', b.x, b.y); }
      });
    }
    const ord = bolas.filter(ativa).sort((a, b) => a.y - b.y);
    for (let i = 0; i < ord.length; i++) {
      const a = ord[i];
      for (let j = i + 1; j < ord.length; j++) {
        const b = ord[j], dy = b.y - a.y; if (dy >= 2 * R) break;
        const dx = b.x - a.x, d2 = dx * dx + dy * dy; if (d2 >= 4 * R * R || d2 === 0) continue;
        const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, sob = (2 * R - d) / 2;
        a.x -= nx * sob; a.y -= ny * sob; b.x += nx * sob; b.y += ny * sob;
        const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rv < 0) { const imp = -(1 + REST_BOLA) * rv / 2; a.vx -= imp * nx; a.vy -= imp * ny; b.vx += imp * nx; b.vy += imp * ny; }
        toca(a); toca(b);
      }
    }
  }

  function estoura(p) {
    let atingiu = -1;
    if (p.tipo === 'explosao') {
      for (const b of bolas) {
        if (!ativa(b) || b.fim) continue;
        const dx = b.x - p.x, dy = b.y - p.y, d = Math.hypot(dx, dy);
        if (d < 85) { const f = 1 - d / 85, nx = d ? dx / d : 0, ny = d ? dy / d : -1; b.vx += nx * 480 * f; b.vy += ny * 480 * f - 160 * f; b.tonta = t + 1.1; toca(b); if (atingiu < 0 || destaque(b.dono)) atingiu = b.dono; }
      }
      ev('explosao', p.x, p.y);
      if (atingiu >= 0 && destaque(atingiu) && podeNarrar()) narrar(TX.explosao(cap(alma(atingiu))));
    } else {
      const g = { x: p.x, y: p.y, r: 50, ate: t + 5, nasce: t, ph: rng() * 6 };
      gosmas.push(g); rec.gosmas.push(g);
      for (const b of bolas) { if (!ativa(b) || b.fim) continue; if (Math.hypot(b.x - p.x, b.y - p.y) < 50) { b.vx *= 0.3; b.vy *= 0.3; if (atingiu < 0 || destaque(b.dono)) atingiu = b.dono; } }
      ev('gosma', p.x, p.y);
      if (atingiu >= 0 && destaque(atingiu) && podeNarrar()) narrar(TX.gosma(cap(alma(atingiu))));
    }
    p.reg.tm = t;
  }

  function ranking() {
    const melhor = new Map();
    for (const b of bolas) { const p = b.fim ? 1e6 - b.fim : b.y, at = melhor.get(b.dono); if (!at || at.p < p) melhor.set(b.dono, { p, b }); }
    return [...melhor.entries()].sort((a, b) => b[1].p - a[1].p).map(([dono, v]) => ({ dono, b: v.b }));
  }
  const FRASES = [n => `${n} assumiu a liderança`, n => `${n} passou para a frente`, n => `Agora quem manda é ${n}`, n => `${n} tomou a ponta`];
  function checar() {
    ultimoCheck = t;
    const rk = ranking(); posCache = new Map(rk.map((r, i) => [r.dono, i]));
    if (rec.vencedor >= 0) return;
    const lider = rk[0].dono, lb = rk[0].b;
    rec.metricas.lideres.push([t, lider, rk.length]); rec.metricas.ordens.push(rk.map(r => r.dono));
    if (lider !== liderAnt && t - ultLider > 1.4) { if (liderAnt >= 0) narrar(FRASES[Math.floor(rng() * FRASES.length)](nome(lider))); liderAnt = lider; ultLider = t; }
    const top3 = rk.slice(0, 3).map(r => r.dono);
    if (t - ultTop3 > 2.6 && top3Ant.length) { const novo = top3.find(d => !top3Ant.includes(d) && d !== lider); if (novo !== undefined) { narrar(`${nome(novo)} entrou no top 3`); ultTop3 = t; } }
    top3Ant = top3;
    let tr = 0; TRECHOS.forEach((p, i) => { if (lb.y >= p.y) tr = i; });
    if (tr > trechoLider) {
      trechoLider = tr;
      if (TRECHOS[tr].tipo === 'caminhos' && !viuForquilha) { viuForquilha = true; narrar(TX.gangorra(nome(lider), ladoNome(lb.x))); }
      else if (tr > 1 && TRECHOS[tr].tipo !== 'caminhos') narrar(`${nome(lider)} chega primeiro ${TRECHOS[tr].prep} ${TRECHOS[tr].nome}`);
    }
    const cic = rec.alcapao.length;
    if (MODO_PORTAO === 'contagem' && !portaoAberto && cic !== ciclAnt && naFilaDoPortao(lb)) { ciclAnt = cic; narrar(TX.portaoEspera(nome(lider))); }
  }

  function passo() {
    t += STEP; passoN++;
    if (estado === 'contagem' && t >= 3) { estado = 'corrida'; narrar(TX.abriu()); ev('portao', W / 2, PORTAO_Y); }
    // agarradores
    maos.forEach((m, mi) => {
      const alt = altMao(mi, t, fz), me = maosEst[mi];
      if (me.segura >= 0) {
        const b = bolas[me.segura];
        if (t >= me.ate) { b.preso = false; b.vx = (rng() < .5 ? -1 : 1) * (140 + rng() * 120); b.vy = -260; b.imune = t + 1.5; b.tonta = t + 0.8; me.segura = -1; ev('terra', m.x, m.y); toca(b); }
        else { b.x = m.x; b.y = m.y - 13 - alt * 5; b.vx = b.vy = 0; toca(b); }
      } else if (alt > 0.9 && estado === 'corrida') {
        for (let i = 0; i < n; i++) {
          const b = bolas[i]; if (!ativa(b) || b.imune > t || b.fim) continue;
          if ((b.x - m.x) ** 2 + (b.y - (m.y - 10)) ** 2 < (R + 14) ** 2) {
            me.segura = i; me.ate = t + 0.75; b.preso = true; ev('terra', m.x, m.y);
            if (destaque(b.dono) && podeNarrar()) narrar(TX.mao(alma(b.dono)));
            break;
          }
        }
      }
    });
    // atiradoras
    if (estado === 'corrida') BRUXAS.forEach((w, wi) => {
      if (t < proxBruxa[wi]) return;
      proxBruxa[wi] = t + 2.2 + rng() * 2.2;
      let alvo = -1, maxY = -1;
      for (let i = 0; i < n; i++) { const b = bolas[i]; if (!ativa(b) || b.fim) continue; if (b.y > w.faixa[0] - 40 && b.y < w.faixa[1] + 80 && b.y > maxY) { maxY = b.y; alvo = i; } }
      if (alvo < 0) return;
      const [wx, wy] = posBruxa(w, wi, t, fz);
      const b = bolas[alvo], T = 0.85, tx = clamp(b.x + b.vx * T * 0.5, 20, W - 20), ty = b.y + b.vy * T * 0.4;
      const reg = { t0: t, x0: wx, y0: wy + 4, vx: (tx - wx) / T, vy: (ty - wy) / T - 0.5 * GP * T, tipo: rng() < 0.55 ? 'gosma' : 'explosao', tm: Infinity, bruxa: wi };
      rec.pocoes.push(reg);
      pocoes.push({ x: reg.x0, y: reg.y0, vx: reg.vx, vy: reg.vy, tipo: reg.tipo, vida: 0, reg });
      if (destaque(b.dono) && podeNarrar()) narrar(TX.mira(naAlma(b.dono)));
    });
    // portão: só abre com PN almas esperando, ou depois de PORTAO_MAX segundos
    if (estado === 'corrida' && ALC_Y > 0 && MODO_PORTAO === 'ritmo') {
      const aberto = fasePortao(t, fz) < ABERTO_PORTAO;
      if (aberto && !portaoAberto) { portaoAberto = true; rec.alcapao.push([t, Infinity]); ev('alcapao', W / 2, ALC_Y); if (!viuRitmo) { viuRitmo = true; narrar(TX.portaoRitmo ? TX.portaoRitmo() : 'O portão abre sozinho de tempo em tempo'); } }
      else if (!aberto && portaoAberto) { portaoAberto = false; rec.alcapao[rec.alcapao.length - 1][1] = t; }
    } else if (estado === 'corrida' && ALC_Y > 0) {
      const esperando = bolas.filter(b => ativa(b) && !b.fim && naFilaDoPortao(b)).length;
      if (portaoAberto) { if (t >= portaoAte) { portaoAberto = false; rec.alcapao[rec.alcapao.length - 1][1] = t; portaoDesde = esperando ? t : -1; } }
      else {
        if (!esperando) portaoDesde = -1; else if (portaoDesde < 0) portaoDesde = t;
        if (esperando >= PN || (portaoDesde >= 0 && t - portaoDesde >= PORTAO_MAX)) {
          portaoAberto = true; portaoAte = t + 1.5; rec.alcapao.push([t, Infinity]); ev('alcapao', W / 2, ALC_Y);
          narrar(esperando >= PN ? TX.portaoJuntou(esperando) : TX.portaoCansou(esperando));
        }
      }
    }

    GEISERES.forEach((g, i) => { const at = geiserAtivo(g, t, fz); if (at && !geiserAnt[i]) ev('geiser', g.x, g.y); geiserAnt[i] = at; });
    if (CHUVA && estado === 'corrida' && t >= proxChuva) {
      proxChuva = t + 0.45 + rChuva() * 0.5;
      if (bolas.some(b => ativa(b) && !b.fim && b.y > CHUVA.y0 - 150 && b.y < CHUVA.y1)) {
        const reg = { t0: t, x0: 30 + rChuva() * (W - 60), y0: CHUVA.y0, vx: (rChuva() - .5) * 60, vy: 120, tipo: 'explosao', tm: Infinity, bruxa: -1 };
        rec.pocoes.push(reg); pocoes.push({ x: reg.x0, y: reg.y0, vx: reg.vx, vy: reg.vy, tipo: reg.tipo, vida: 0, reg });
      }
    }
    for (let i = 0; i < SUB; i++) subpasso(t - STEP + (i + 1) * DT);

    for (const p of pocoes) {
      p.vy += GP * STEP; p.x += p.vx * STEP; p.y += p.vy * STEP; p.vida += STEP;
      let bate = p.vida > 2.4 || p.x < 6 || p.x > W - 6;
      if (!bate) for (const b of bolas) { if (!ativa(b) || b.fim) continue; if ((b.x - p.x) ** 2 + (b.y - p.y) ** 2 < (R + 6) ** 2) { bate = true; break; } }
      if (!bate) for (const s of segs) { if (s.tipo === 'parede' || s.tipo === 'portao') continue; if (p.y < Math.min(s.y1, s.y2) - 10 || p.y > Math.max(s.y1, s.y2) + 10) continue; if (distSeg(p.x, p.y, s) < s.e + 4) { bate = true; break; } }
      if (bate) { p.morta = true; estoura(p); }
    }
    pocoes = pocoes.filter(p => !p.morta);
    gosmas = gosmas.filter(g => g.ate > t);

    for (const b of bolas) {
      if (!ativa(b) || b.fim) continue;
      // janelas entre os caminhos
      if (b.y > DIV_Y0 && b.y < DIV_Y1) {
        const lado = b.x < DIV_X ? -1 : 1;
        if (b.lado && lado !== b.lado && destaque(b.dono) && podeNarrar()) narrar(TX.janela(cap(alma(b.dono)), SK.lados[lado < 0 ? 0 : 1]));
        b.lado = lado;
      }
      // embaralhador: a alma fica lá dentro até ele encher
      if (b.y > CALD_Y - 8 && b.y < CALD_Y + 80 && Math.abs(b.x - W / 2) < 80) {
        ev('engole', b.x, CALD_Y, { cor: b.est.cor });
        b.sumido = Infinity; b.x = W / 2 + (rng() - .5) * 116; b.y = CALD_Y + 40; b.vx = b.vy = 0;
        cald.push(b);
        if (caldDesde < 0) { caldDesde = t; if (podeNarrar()) narrar(MODO_CALD === 'ritmo' && TX.caldRitmo ? TX.caldRitmo(cap(alma(b.dono))) : TX.caldPrimeiro(cap(alma(b.dono)), CN)); }
      }
    }
    const erupcao = MODO_CALD === 'ritmo' && faseCald(t, fz) < faseCald(t - STEP, fz);
    if (cald.length && (MODO_CALD === 'ritmo' ? erupcao : (cald.length >= CN || t - caldDesde >= CALD_MAX))) {
      for (let i = cald.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [cald[i], cald[j]] = [cald[j], cald[i]]; }
      const nn = cald.length;
      cald.forEach((b, i) => {
        const s = { x: W / 2 + (rng() - .5) * 30, y: SAIDA.y, vx: (rng() - .5) * 220, vy: 140, tipo: 'normal' };
        s.quando = t + 0.35 + i * 0.16; b.saida = s;
        rec.eventos.push({ t: s.quando, tipo: 'cospe', x: s.x, y: s.y, cor: b.est.cor });
      });
      rec.caldeirao.push([caldDesde, t, nn]);
      narrar(TX.caldFerveu(nn, MODO_CALD === 'ritmo' || nn >= CN));
      cald = []; caldDesde = -1;
    }
    for (const b of bolas) if (b.saida && t >= b.saida.quando) {
      const s = b.saida; b.x = s.x; b.y = s.y; b.vx = s.vx; b.vy = s.vy; b.sumido = t; b.toqueY = b.y; b.saida = null;
    }
    for (const b of bolas) {
      if (!b.fim && b.y > CHEGADA) {
        b.fim = ++ordem; b.tFim = t - (b.y - CHEGADA) / Math.max(60, b.vy);
        if (!donosChegados.includes(b.dono)) {
          donosChegados.push(b.dono);
          const pos = donosChegados.length;
          if (pos === 1) {
            rec.vencedor = b.dono; rec.tVenc = b.tFim;
            rec.foto = { t1: b.tFim, d1: b.dono, t2: 0, d2: -1, almas: bolas.filter(o => o === b || (!o.fim && o.y > CHEGADA - 170 && ativa(o))).map(o => ({ x: o.x, dy: o.y - CHEGADA, est: o.est, vence: o === b })) };
            narrar(`${nome(b.dono)} cruzou a chegada em primeiro!`); ev('chegada', b.x, CHEGADA);
          } else if (pos === 2) { rec.foto.t2 = b.tFim; rec.foto.d2 = b.dono; narrar(`${nome(b.dono)} chega em 2º, ${(b.tFim - rec.foto.t1).toFixed(3).replace('.', ',')} s depois`); }
          else if (pos === 3) narrar(`${nome(b.dono)} completa o pódio`);
        }
      }
      if (estado === 'corrida' && !b.fim && ativa(b)) {
        const queda = b.y - b.toqueY;
        if (queda > rec.metricas.maxQueda) { rec.metricas.maxQueda = queda; rec.metricas.ondeQueda = b.y; }
        const naFila = naFilaDoPortao(b);
        if (b.vx * b.vx + b.vy * b.vy < 64) b.parado += STEP; else b.parado = 0;
        if (b.parado > 1.6 && !naFila) { b.chutes++; b.vx += (rng() - .5) * 260 + (b.chutes > 2 ? (W / 2 - b.x) * 2 : 0); b.vy -= 120 + rng() * 80; b.parado = 0; }
      }
    }
    if (estado === 'corrida' && t - ultimoCheck >= 0.4) checar();
    if (ordem === n && !tFim) tFim = t;
    if ((tFim && t - tFim > 3) || t > 260) acabou = true;

    if (passoN % 2 === 0) {
      for (const b of bolas) {
        rec.X.push(Math.round(b.x * 4)); rec.Y.push(Math.round(b.y * 2));
        rec.F.push((b.preso ? 1 : 0) | (b.sumido > t ? 2 : 0) | (b.tonta > t ? 4 : 0) | (b.grudada > t ? 8 : 0) | (b.medo > t ? 16 : 0) | (b.parado > 0.7 ? 32 : 0));
      }
      rec.frames++;
      if (rec.corvoT === Infinity && bolas.some(b => Math.abs(b.x - CORVO.x) < 90 && Math.abs(b.y - CORVO.y) < 70)) rec.corvoT = t;
      morcegosPousados.forEach((m, i) => { if (rec.morcegoT[i] === Infinity && bolas.some(b => Math.abs(b.x - m.x) < 40 && b.y < m.y && m.y - b.y < 60)) rec.morcegoT[i] = t; });
    }
    if (acabou) {
      rec.dur = t; rec.metricas.presos = bolas.filter(b => !b.fim).length; rec.metricas.presosPos = bolas.filter(b => !b.fim).map(b => [Math.round(b.x), Math.round(b.y)]);
      bolas.forEach((b, i) => { rec.tFim[i] = b.fim ? b.tFim : 0; rec.ordem[i] = b.fim; });
      rec.X = Int16Array.from(rec.X); rec.Y = Int16Array.from(rec.Y); rec.F = Uint8Array.from(rec.F);
      rec.eventos.sort((a, b) => a.t - b.t);
      rec.bytes = rec.frames * n * 5;
    }
  }
  return {
    rec,
    rodar(max) { for (let i = 0; i < max && !acabou; i++) passo(); return acabou; },
    progresso() { const my = Math.max(...bolas.map(b => b.y)); return clamp(my / CHEGADA * 0.6 + ordem / n * 0.4, 0, 1); },
  };
}

/* ================= reprodução ================= */
let rec = null, T = 0, tocando = false, vel = 1, seguir = -1, modoCam = 'pista', gravador = null, aposGravar = null;
const vb = []; // estado das almas no instante T
function amostra() {
  const n = rec.n, f = T * rec.fps; let k = Math.floor(f); if (k > rec.frames - 2) k = Math.max(0, rec.frames - 2);
  const u = clamp(f - k, 0, 1), k2 = Math.min(k + 1, rec.frames - 1);
  for (let i = 0; i < n; i++) {
    const a = k * n + i, b = k2 * n + i;
    const x0 = rec.X[a] / 4, y0 = rec.Y[a] / 2, x1 = rec.X[b] / 4, y1 = rec.Y[b] / 2;
    const salto = Math.abs(x1 - x0) + Math.abs(y1 - y0) > 60;
    const o = vb[i] || (vb[i] = { i, rastro: [] });
    o.x = salto ? (u < .5 ? x0 : x1) : x0 + (x1 - x0) * u; o.y = salto ? (u < .5 ? y0 : y1) : y0 + (y1 - y0) * u;
    o.vx = salto ? 0 : (x1 - x0) * rec.fps; o.vy = salto ? 0 : (y1 - y0) * rec.fps;
    o.f = u < .5 ? rec.F[a] : rec.F[b];
    o.fim = rec.tFim[i] > 0 && T >= rec.tFim[i] ? rec.ordem[i] : 0;
    o.dono = rec.dono[i]; o.est = rec.est[i];
  }
  vb.length = n;
}
const ativaV = o => !(o.f & 3);
function rankingV() {
  const melhor = new Map();
  for (const o of vb) { const p = o.fim ? 1e6 - o.fim : o.y, at = melhor.get(o.dono); if (!at || at.p < p) melhor.set(o.dono, { p, o }); }
  return [...melhor.entries()].sort((a, b) => b[1].p - a[1].p).map(([dono, v]) => ({ dono, b: v.o }));
}
const trechoDe = y => { let k = 0; TRECHOS.forEach((p, i) => { if (y >= p.y) k = i; }); return k; };
const ondeDe = o => { const k = trechoDe(o.y); if (TRECHOS[k].tipo === 'caminhos') return SK.ladosCurtos[o.x < DIV_X ? 0 : 1]; return TRECHOS[k].curto; };

/* ================= o placar (o React desenha o painel) ================= */
const fmtC = s => { s = Math.max(0, s); return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`; };
const fmt = s => { s = Math.max(0, s); const m = Math.floor(s / 60), r = s - m * 60; return `${m}:${r < 10 ? '0' : ''}${r.toFixed(3).replace('.', ',')}`; };
let narrN = -1, somT = 0;
const setTocando = v => { tocando = v; };


/* ================= os seis mapas ================= */
const MAPAS = [
  { id: 'halloween', nome: 'Noite Assombrada', tema: 'Halloween', desc: 'O clássico: cemitério, mansão dos fantasmas, moinho do Ceifador, e o portão e o caldeirão que juntam a turma antes de soltar.', blocos: ['lapides', 'forquilha', 'portao', 'salao', 'ponte', 'moinho', 'caldeirao', 'teias', 'fliper'] },
  { id: 'pixel', nome: 'Caça Pixelada', tema: 'Pixel art', desc: 'Oito bits, com os zumbis e as bruxas da caça. Sem nenhuma espera: blocos-mola que jogam o bichinho para cima e plataformas que andam de um lado para o outro.', blocos: ['lapides', 'molas', 'ponte', 'forquilha', 'plataformas', 'salao', 'moinho', 'fliper'], pixel: true },
  { id: 'mar', nome: 'Naufrágio', tema: 'Fundo do mar', desc: 'Uma correnteza que empurra de lado e troca de sentido, colunas de bolhas que seguram a queda, águas-vivas e a concha gigante.', blocos: ['lapides', 'correntes', 'salao', 'forquilha', 'caldeirao', 'teias', 'moinho', 'fliper'] },
  { id: 'espaco', nome: 'Estação Cósmica', tema: 'Espaço', desc: 'Um trecho de gravidade zero, onde os bichinhos flutuam e um redemoinho leva de um lado para o outro, e satélites que andam. Sem espera.', blocos: ['lapides', 'forquilha', 'orbita', 'plataformas', 'salao', 'moinho', 'fliper'] },
  { id: 'templo', nome: 'Templo Perdido', tema: 'Selva', desc: 'O rio puxa os bichinhos e troca de sentido, lâminas de pêndulo balançam e a porta de pedra abre sozinha a cada 5 segundos, sem esperar ninguém.', blocos: ['lapides', 'esteiras', 'forquilha', 'pendulos', 'portao', 'salao', 'teias', 'fliper'], modos: { portao: 'ritmo' } },
  { id: 'vulcao', nome: 'Vulcão do Dragão', tema: 'Vulcão', desc: 'Chuva de lava, gêiseres que jogam os bichinhos para o alto, dragõezinhos cuspindo fogo e uma cratera que entra em erupção a cada 3 segundos.', blocos: ['lapides', 'chuva', 'forquilha', 'geiseres', 'moinho', 'caldeirao', 'ponte', 'fliper'], modos: { cald: 'ritmo' } },
];

/* ================= desenho: peças comuns a todos os mapas ================= */
const SOMBRA = 'rgba(0,0,0,.34)', SX = 5, SY = 6;
function linhaSeg(c, s, w, cor) { c.strokeStyle = cor; c.lineWidth = w; c.beginPath(); c.moveTo(s.x1, s.y1); c.lineTo(s.x2, s.y2); c.stroke(); }
function luz(c, x, y, r, cor, a) { const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, rgba(cor, a)); g.addColorStop(1, rgba(cor, 0)); c.fillStyle = g; circ(c, x, y, r); c.fill(); }
const brilho = (c, fn) => { c.globalCompositeOperation = 'lighter'; fn(); c.globalCompositeOperation = 'source-over'; };
const pontoEm = (s, f) => [s.x1 + (s.x2 - s.x1) * f, s.y1 + (s.y2 - s.y1) * f];
function lapidePath(c, x, y, r) { c.moveTo(x - r, y + r); c.lineTo(x - r, y - r * .1); c.arc(x, y - r * .1, r, Math.PI, 0); c.lineTo(x + r, y + r); c.closePath(); }
function estrela(c, x, y, r1, r2, n, rot) { c.beginPath(); for (let i = 0; i < n * 2; i++) { const a = rot + i * Math.PI / n, r = i % 2 ? r2 : r1; c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } c.closePath(); }

/* segmento padrão: borda, corpo e um fio de brilho, nas cores do mapa */
function segPadrao(c, s) {
  const k = SK.segCores[s.tipo] || SK.segCores.pedra, w = k[3] || 8;
  c.lineCap = 'round';
  linhaSeg(c, s, w, k[0]); linhaSeg(c, s, w - 3, k[1]);
  c.strokeStyle = k[2]; c.lineWidth = 1.2; c.beginPath(); c.moveTo(s.x1, s.y1 - 1.8); c.lineTo(s.x2, s.y2 - 1.8); c.stroke();
  if (SK.segExtra) SK.segExtra(c, s);
}
/* portão da largada (duas folhas que abrem) e portão do meio (alçapão) */
function portaoLargada(c) {
  const ang = T < 3 ? 0 : Math.min(1, (T - 3) / 0.35) * 1.4, k = SK.cor.portao;
  for (const sg of [1, -1]) {
    c.save(); c.translate(sg > 0 ? 0 : W, PORTAO_Y); c.rotate(sg * ang);
    const x0 = sg > 0 ? 0 : -W / 2;
    c.fillStyle = k[0]; c.fillRect(x0, -4, W / 2, 8);
    c.strokeStyle = k[1]; c.lineWidth = 1; for (let x = x0 + 8; x < x0 + W / 2; x += 16) { c.beginPath(); c.moveTo(x, -4); c.lineTo(x, 4); c.stroke(); }
    c.fillStyle = k[2]; circ(c, sg > 0 ? 6 : -6, 0, 2.4); c.fill();
    c.restore();
  }
}
function alcapao(c) {
  const ang = portaoAngEm(T) * 1.3, half = 60, k = SK.cor.alcapao;
  for (const sg of [1, -1]) {
    c.save(); c.translate(W / 2 - sg * half, ALC_Y); c.rotate(sg * ang);
    c.fillStyle = k[0]; c.fillRect(sg > 0 ? 0 : -half, -4, half, 8);
    c.strokeStyle = k[1]; c.fillStyle = k[1]; c.lineWidth = 1.4; for (let x = 6; x < half; x += 10) { const xx = sg > 0 ? x : -x; c.beginPath(); c.moveTo(xx, -4); c.lineTo(xx, -12); c.stroke(); c.beginPath(); c.moveTo(xx - 2, -12); c.lineTo(xx, -16); c.lineTo(xx + 2, -12); c.fill(); }
    c.restore();
  }
}
/* pilares e placa do portão do meio: conta quem já chegou */
function placaPortao(c, comTexto) {
  const aberto = portaoEm(T), N = rec.portaoN, fila = vb.filter(o => ativaV(o) && !o.fim && naFilaDoPortao(o)).length, k = SK.cor;
  const ritmo = rec.portaoModo === 'ritmo', fp = fasePortao(T, rec.fz), falta = RITMO_PORTAO - fp;
  const cic = aberto ? 1 : ritmo ? clamp((fp - ABERTO_PORTAO) / (RITMO_PORTAO - ABERTO_PORTAO), 0, 1) : Math.min(1, fila / N);
  if (!comTexto) {
    for (const px of [W / 2 - 66, W / 2 + 66]) { c.fillStyle = SOMBRA; c.fillRect(px - 7 + SX, ALC_Y - 70 + SY, 14, 70); c.fillStyle = k.pilar[0]; c.fillRect(px - 7, ALC_Y - 70, 14, 70); c.fillStyle = k.pilar[1]; c.fillRect(px - 9, ALC_Y - 76, 18, 8); brilho(c, () => luz(c, px, ALC_Y - 84, 30, k.chama, 0.25 + 0.05 * Math.sin(T * 11 + px))); c.fillStyle = k.chama; circ(c, px, ALC_Y - 84, 2.4); c.fill(); }
    c.fillStyle = SOMBRA; rr(c, W / 2 - 38 + SX, ALC_Y - 104 + SY, 76, 30, 4); c.fill(); c.fillStyle = k.placa[0]; rr(c, W / 2 - 38, ALC_Y - 104, 76, 30, 4); c.fill();
    c.fillStyle = 'rgba(239,230,212,.15)'; c.fillRect(W / 2 - 30, ALC_Y - 82, 60, 4); c.fillStyle = aberto ? '#8fe36b' : SK.cor.destaque; c.fillRect(W / 2 - 30, ALC_Y - 82, 60 * cic, 4);
  }
  if (comTexto !== false) { c.fillStyle = k.placa[2]; c.font = `600 ${SK.pixel ? 6 : 9}px ${SK.fonteMini}`; c.textAlign = 'center'; c.fillText(aberto ? 'ABERTO' : ritmo ? `ABRE EM ${Math.ceil(falta)}s` : `${fila}/${N} NA FILA`, W / 2, ALC_Y - 89); c.textAlign = 'left'; }
}
function placaCaldeirao(c, dentro, comTexto) {
  const N = rec.caldN, k = SK.cor, ritmo = rec.caldModo === 'ritmo', fc = faseCald(T, rec.fz), cic = ritmo ? fc / RITMO_CALD : Math.min(1, dentro.length / N);
  if (!comTexto) {
    c.fillStyle = SOMBRA; rr(c, W / 2 - 44 + SX, CALD_Y - 58 + SY, 88, 26, 4); c.fill(); c.fillStyle = k.caldPlaca[0]; rr(c, W / 2 - 44, CALD_Y - 58, 88, 26, 4); c.fill(); c.strokeStyle = k.caldPlaca[1]; c.lineWidth = 1; c.stroke();
    c.fillStyle = 'rgba(239,230,212,.15)'; c.fillRect(W / 2 - 36, CALD_Y - 40, 72, 3); c.fillStyle = k.caldPlaca[1]; c.fillRect(W / 2 - 36, CALD_Y - 40, 72 * cic, 3);
  }
  if (comTexto !== false) { c.fillStyle = k.caldPlaca[2]; c.font = `600 ${SK.pixel ? 6 : 8.5}px ${SK.fonteMini}`; c.textAlign = 'center'; c.fillText(ritmo ? `${SK.caldRitmoTxt || 'ERUPÇÃO'} EM ${Math.ceil(RITMO_CALD - fc)}s` : `${dentro.length}/${N} ${SK.caldTxt}`, W / 2, CALD_Y - 45); c.textAlign = 'left'; }
}
function placaTrecho(c, txt, px, py) {
  const k = SK.cor.placaT, fs = (SK.pixel ? 8 : 13) / Math.max(kk, .7); c.font = `${fs}px ${SK.fontePlaca}`;
  const tw = c.measureText(txt).width, ph = fs * (SK.pixel ? 2 : 1.5);
  c.strokeStyle = k[3]; c.lineWidth = 1; c.beginPath(); c.moveTo(px + 6, py - 14); c.lineTo(px + 6, py); c.moveTo(px + tw + 8, py - 14); c.lineTo(px + tw + 8, py); c.stroke();
  c.fillStyle = SOMBRA; rr(c, px + 3, py + 4, tw + 14, ph, 2); c.fill();
  c.fillStyle = k[0]; rr(c, px, py, tw + 14, ph, 2); c.fill(); c.strokeStyle = k[1]; c.stroke();
  c.fillStyle = k[2]; c.fillText(txt, px + 7, py + ph * (SK.pixel ? 0.68 : 0.72));
}
function placasTrechos(c, vis) {
  for (const tr of TRECHOS) { if (tr.y < 200 || tr.y < vis.y0 - 30 || tr.y > vis.y1) continue; if (tr.tipo === 'caminhos') { placaTrecho(c, '← ' + SK.ladosPlaca[0], 8, tr.y + 6); placaTrecho(c, SK.ladosPlaca[1] + ' →', DIV_X + 12, tr.y + 6); } else placaTrecho(c, tr.nome, 8, tr.y + 4); }
}
/* chegada: faixa quadriculada, mastros e bandeirinhas nas cores do mapa */
function chegadaPadrao(c) {
  const k = SK.cor.chegada;
  for (let x = 0, i = 0; x < W; x += 14, i++) { c.fillStyle = i % 2 ? k[0] : k[1]; c.fillRect(x, CHEGADA, 14, 7); c.fillStyle = i % 2 ? k[1] : k[0]; c.fillRect(x, CHEGADA + 7, 14, 7); }
  c.strokeStyle = k[4]; c.lineWidth = 4; c.beginPath(); c.moveTo(6, CHEGADA); c.lineTo(6, CHEGADA - 70); c.moveTo(W - 6, CHEGADA); c.lineTo(W - 6, CHEGADA - 70); c.stroke();
  c.strokeStyle = rgba(k[0], .5); c.lineWidth = 1; c.beginPath(); c.moveTo(6, CHEGADA - 66); c.quadraticCurveTo(W / 2, CHEGADA - 40, W - 6, CHEGADA - 66); c.stroke();
  for (let i = 1; i < 14; i++) { const f = i / 14, x = 6 + (W - 12) * f, y = CHEGADA - 66 + 26 * 4 * f * (1 - f); c.fillStyle = i % 2 ? k[2] : k[3]; c.beginPath(); c.moveTo(x - 6, y); c.lineTo(x + 6, y); c.lineTo(x, y + 12 + Math.sin(T * 5 + i) * 1.5); c.closePath(); c.fill(); }
  c.fillStyle = k[2]; c.font = SK.pixel ? '14px "Press Start 2P", monospace' : `30px ${SK.fonte}`; c.textAlign = 'center'; c.fillText(SK.chegadaTxt, W / 2, CHEGADA - 18); c.textAlign = 'left';
}
/* zonas que seguram: o pântano dos caminhos e as manchas das atiradoras */
function zonaPadrao(c, p, nv, i) {
  const k = SK.cor.zona;
  c.fillStyle = rgba(k[0], 0.12 + 0.3 * nv); c.beginPath();
  for (let q = 0; q <= 16; q++) { const an = q / 16 * Math.PI * 2, r3 = p.r * (0.3 + 0.6 * nv) * (0.85 + 0.12 * Math.sin(an * 3 + T * 2 + i)); q ? c.lineTo(p.x + Math.cos(an) * r3, p.y + Math.sin(an) * r3) : c.moveTo(p.x + Math.cos(an) * r3, p.y + Math.sin(an) * r3); }
  c.fill();
  for (let q = 0; q < 3; q++) { const ph = (T * (1 + nv) + q * .33 + i) % 1; c.strokeStyle = rgba(k[1], (1 - ph) * (0.25 + nv * 0.5)); c.lineWidth = 1; circ(c, p.x + Math.cos(q * 2.1 + i) * p.r * .4, p.y + Math.sin(q * 2.1 + i) * p.r * .3 - ph * 6, 1.5 + ph * 3); c.stroke(); }
}
function manchaPadrao(c, gz, a) {
  c.fillStyle = rgba(SK.cor.mancha, 0.38 * a); c.beginPath();
  for (let i = 0; i <= 16; i++) { const an = i / 16 * Math.PI * 2, r3 = gz.r * (0.82 + 0.14 * Math.sin(an * 3 + T * 3 + gz.ph)); i ? c.lineTo(gz.x + Math.cos(an) * r3, gz.y + Math.sin(an) * r3) : c.moveTo(gz.x + Math.cos(an) * r3, gz.y + Math.sin(an) * r3); }
  c.fill();
}
function portalPadrao(c, p) {
  const k = SK.cor.portal;
  c.save(); c.translate(p.x, p.y);
  brilho(c, () => {
    const g = c.createRadialGradient(0, 0, 1, 0, 0, p.r * 2.2); g.addColorStop(0, rgba(k[0], .45)); g.addColorStop(1, rgba(k[1], 0));
    c.fillStyle = g; circ(c, 0, 0, p.r * 2.2); c.fill();
    c.lineWidth = 2;
    for (let i = 0; i < 3; i++) { c.strokeStyle = rgba(i % 2 ? k[1] : k[0], .85); c.beginPath(); c.arc(0, 0, p.r * (0.45 + i * 0.25), T * (2 + i) + i, T * (2 + i) + i + 3.6); c.stroke(); }
  });
  c.restore();
  if (p.tipo !== 'normal') {
    const sx = p.tipo === 'volta' ? (p.x < W / 2 ? p.x + 12 : p.x - 50) : p.x - 20, sy = p.y - p.r - 26, pk = SK.cor.placaT;
    c.fillStyle = pk[0]; rr(c, sx, sy, 38, 13, 2); c.fill(); c.fillStyle = pk[1]; c.fillRect(sx + 18, sy + 13, 2, 8);
    c.fillStyle = pk[2]; c.font = `600 ${SK.pixel ? 5 : 7}px ${SK.fonteMini}`; c.textAlign = 'center'; c.fillText(p.tipo === 'volta' ? 'VOLTA' : 'ATALHO', sx + 19, sy + 9.3); c.textAlign = 'left';
  }
}
/* cenário distante: cada trecho tem o seu, andando mais devagar que a pista */
let LONGE = [];
function longeLoop(c, camY, viewH) {
  const cy = camY + viewH * 0.5;
  TRECHOS.forEach((tr, i) => {
    const prox = TRECHOS[i + 1], ya = Math.max(tr.y, -200), yb = prox ? prox.y : H;
    let peso = 1; if (cy < ya) peso = clamp(1 - (ya - cy) / 300, 0, 1); else if (cy > yb) peso = clamp(1 - (cy - yb) / 300, 0, 1);
    if (peso <= 0) return;
    const off = -(cy - ya) * 0.12, base = ch * 0.78 + off;
    c.save(); c.globalAlpha = peso; c.fillStyle = SK.cor.longe; c.strokeStyle = SK.cor.longe;
    SK.longe(c, tr.tipo, base, off, LONGE[i] || [], i);
    c.restore();
  });
}
/* luzes da largada (velas, tochas, lanternas...), que se inclinam quando uma alma passa */
function luzesLargada(c, desenhaLuz) {
  for (const [vx, vy] of [[12, 70], [12, 170], [W - 12, 70], [W - 12, 170]]) {
    let lean = 0; for (const o of vb) { const d = Math.hypot(o.x - vx, o.y - vy); if (d < 70) lean += o.vx / 500 * (1 - d / 70) + (o.x < vx ? 0.25 : -0.25) * (1 - d / 70) * Math.min(1, Math.hypot(o.vx, o.vy) / 200); }
    desenhaLuz(c, vx, vy, clamp(lean, -0.9, 0.9));
  }
}
function tituloLargada(c, cor, corSub) {
  c.fillStyle = cor; c.font = SK.pixel ? '18px "Press Start 2P", monospace' : `38px ${SK.fonte}`; c.textAlign = 'center'; c.fillText('Corrida da Sorte', W / 2, -44);
  c.fillStyle = corSub; c.font = `500 ${SK.pixel ? 6 : 9}px ${SK.fonteMini}`; c.fillText(`${MAPA.nome.toUpperCase()}  ·  ${rec.n} ${rec.n === 1 ? 'BICHINHO' : 'BICHINHOS'} NA PISTA`, W / 2, -22); c.textAlign = 'left';
}

/* ================= Halloween: Noite Assombrada ================= */
function desenhaMao(c, m, alt, fecha, fase) {
  c.fillStyle = '#3d2c20'; elip(c, m.x, m.y + 7, 13, 4.5); c.fill();
  c.fillStyle = '#54402f'; elip(c, m.x - 3, m.y + 5.5, 6, 2.2); c.fill();
  if (alt <= 0.02) return;
  const h = 18 * alt;
  c.save(); c.translate(m.x, m.y + 6); c.rotate(Math.sin(T * 5 + fase) * 0.12);
  c.fillStyle = '#7f9a6a'; rr(c, -3.6, -h, 7.2, h, 2.5); c.fill();
  c.fillStyle = '#6b6158'; c.fillRect(-4.4, -5, 8.8, 5);
  c.fillStyle = '#8fae78'; circ(c, 0, -h, 5); c.fill();
  c.strokeStyle = '#8fae78'; c.lineWidth = 2.2; c.lineCap = 'round';
  for (let i = 0; i < 4; i++) { const a = -Math.PI / 2 + (i - 1.5) * (fecha ? 0.28 : 0.5), L = fecha ? 4 : 7; c.beginPath(); c.moveTo(Math.cos(a) * 3.5, -h + Math.sin(a) * 3.5); c.lineTo(Math.cos(a) * (3.5 + L), -h + Math.sin(a) * (3.5 + L) + (fecha ? 2.5 : 0)); c.stroke(); }
  c.beginPath(); c.moveTo(-4, -h + 1); c.lineTo(-8, -h - 2 + (fecha ? 3 : 0)); c.stroke();
  c.restore();
}
function desenhaSegHalloween(c, s) {
  c.lineCap = 'round';
  if (s.tipo === 'galho' || s.tipo === 'raiz') {
    linhaSeg(c, s, 10, s.tipo === 'raiz' ? '#1d140c' : '#24170f'); linhaSeg(c, s, 7, s.tipo === 'raiz' ? '#3e2c1c' : '#4c3424');
    c.strokeStyle = 'rgba(170,130,90,.5)'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(s.x1, s.y1 - 2.2); c.lineTo(s.x2, s.y2 - 2.2); c.stroke();
    const dx = s.x2 - s.x1, dy = s.y2 - s.y1;
    for (const [f, sg, L] of [[0.25, 1, 12], [0.7, -1, 10]]) {
      const px = s.x1 + dx * f, py = s.y1 + dy * f;
      c.strokeStyle = '#3a271b'; c.lineWidth = 2.2; c.beginPath(); c.moveTo(px, py); c.quadraticCurveTo(px + 5, py + sg * L * .4, px + 8, py + sg * L); c.stroke();
      if (s.tipo === 'galho') { c.fillStyle = sg > 0 ? '#c0581c' : '#d98a2b'; elip(c, px + 8, py + sg * L + 2 * sg, 3, 1.8); c.fill(); }
    }
  } else if (s.tipo === 'ferro') {
    linhaSeg(c, s, 8, '#2b2733'); linhaSeg(c, s, 5, '#5b5468');
    const L = Math.hypot(s.x2 - s.x1, s.y2 - s.y1), nn = Math.floor(L / 34); c.fillStyle = '#8c84a0';
    for (let i = 1; i < nn; i++) { const f = i / nn; circ(c, s.x1 + (s.x2 - s.x1) * f, s.y1 + (s.y2 - s.y1) * f, 1.4); c.fill(); }
  } else if (s.tipo === 'ponte') {
    linhaSeg(c, s, 9, '#3a3128'); linhaSeg(c, s, 6, '#d9cdb4');
    const L = Math.hypot(s.x2 - s.x1, s.y2 - s.y1), nn = Math.max(1, Math.floor(L / 16)), nx = -(s.y2 - s.y1) / L, ny = (s.x2 - s.x1) / L;
    c.strokeStyle = 'rgba(90,70,50,.55)'; c.lineWidth = 1;
    for (let i = 1; i < nn; i++) { const [px, py] = pontoEm(s, i / nn); c.beginPath(); c.moveTo(px - nx * 3, py - ny * 3); c.lineTo(px + nx * 3, py + ny * 3); c.stroke(); }
    c.fillStyle = '#e8ddc6'; for (const [px, py] of [[s.x1, s.y1], [s.x2, s.y2]]) { if (px <= 0 || px >= W) continue; circ(c, px, py, 4.2); c.fill(); }
  } else if (s.tipo === 'muro') {
    linhaSeg(c, s, 10, '#2a2430'); linhaSeg(c, s, 7, '#5e5668');
    c.strokeStyle = 'rgba(20,15,25,.6)'; c.lineWidth = 1; for (let y = s.y1 + 14; y < s.y2; y += 18) { c.beginPath(); c.moveTo(s.x1 - 3.5, y); c.lineTo(s.x1 + 3.5, y); c.stroke(); }
    c.fillStyle = 'rgba(110,150,80,.6)'; for (let y = s.y1 + 40; y < s.y2; y += 130) { elip(c, s.x1 + 2, y, 3, 6); c.fill(); }
  } else {
    linhaSeg(c, s, 8, '#2a2430'); linhaSeg(c, s, 5, '#6f6578');
    c.strokeStyle = 'rgba(220,210,230,.25)'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(s.x1, s.y1 - 1.8); c.lineTo(s.x2, s.y2 - 1.8); c.stroke();
  }
}
function gangorraPadrao(c, s, a, cores) {
  c.save(); c.translate(s.cx, s.cy); c.rotate(a);
  c.fillStyle = cores[0]; rr(c, -s.L, -3.5, s.L * 2, 7, 3); c.fill(); c.fillStyle = cores[1]; c.fillRect(-s.L + 3, -3, s.L * 2 - 6, 1.4);
  c.restore();
  c.fillStyle = cores[2]; c.beginPath(); c.moveTo(s.cx, s.cy); c.lineTo(s.cx - 9, s.cy + 16); c.lineTo(s.cx + 9, s.cy + 16); c.closePath(); c.fill();
  c.fillStyle = cores[3]; circ(c, s.cx, s.cy, 2.4); c.fill();
}
function rastroFoice(c, s, w) {
  const dir = Math.sign(w);
  c.strokeStyle = 'rgba(255,255,255,.07)'; c.lineWidth = 16;
  c.beginPath(); c.arc(0, 0, s.L, -dir * 0.55, 0, dir > 0); c.stroke();
  c.beginPath(); c.arc(0, 0, s.L, Math.PI - dir * 0.55, Math.PI, dir > 0); c.stroke();
}
function desenhaSpinHalloween(c, s, a, w) {
  if (s.tipo === 'gangorra') return gangorraPadrao(c, s, a, ['#4c3424', 'rgba(170,130,90,.45)', '#2b2733', '#8c84a0']);
  if (s.tipo === 'moinho') {
    c.save(); c.translate(s.cx, s.cy); c.rotate(a);
    c.fillStyle = '#3b2a1e'; rr(c, -s.L, -5, s.L * 2, 10, 4); c.fill();
    c.fillStyle = 'rgba(220,200,170,.16)'; for (const sg of [-1, 1]) { c.save(); c.scale(sg, 1); c.fillRect(30, 5, s.L - 34, 16); c.strokeStyle = 'rgba(220,200,170,.2)'; c.lineWidth = 1; for (let x = 40; x < s.L; x += 16) { c.beginPath(); c.moveTo(x, 5); c.lineTo(x, 21); c.stroke(); } c.restore(); }
    c.fillStyle = 'rgba(170,130,90,.4)'; c.fillRect(-s.L + 3, -4, s.L * 2 - 6, 1.6);
    c.restore();
    if (s.off === 0) { c.fillStyle = '#1a1420'; circ(c, s.cx, s.cy, 12); c.fill(); c.strokeStyle = '#a99db5'; c.lineWidth = 2; c.stroke(); c.fillStyle = '#ff5a3c'; circ(c, s.cx, s.cy, 3); c.fill(); }
    return;
  }
  const dir = Math.sign(w);
  c.save(); c.translate(s.cx, s.cy); c.rotate(a);
  rastroFoice(c, s, w);
  c.lineCap = 'round';
  c.strokeStyle = '#2a1c12'; c.lineWidth = 7; c.beginPath(); c.moveTo(-s.L, 0); c.lineTo(s.L, 0); c.stroke();
  c.strokeStyle = '#6b4e33'; c.lineWidth = 4.5; c.stroke();
  for (const sg of [1, -1]) {
    c.save(); c.translate(sg * s.L, 0); c.scale(sg, sg * dir);
    const g = c.createLinearGradient(0, 0, 8, 26); g.addColorStop(0, '#f4f1ff'); g.addColorStop(1, '#8a86a0');
    c.fillStyle = g; c.beginPath(); c.moveTo(-2, 0); c.quadraticCurveTo(14, 4, 12, 28); c.quadraticCurveTo(6, 12, -6, 6); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = .8; c.beginPath(); c.moveTo(-2, 0); c.quadraticCurveTo(14, 4, 12, 28); c.stroke();
    c.restore();
  }
  c.fillStyle = '#1a1420'; circ(c, 0, 0, 7); c.fill(); c.strokeStyle = '#a99db5'; c.lineWidth = 1.6; c.stroke();
  c.restore();
}
let fantasmaBu = [];
function balaoBu(c, fx, fy, i, txt, cor) {
  const bu = T - fantasmaBu[i];
  if (bu >= 0 && bu < 0.9) { c.save(); c.globalAlpha = 1 - bu / 0.9; c.fillStyle = cor; c.font = SK.pixel ? `${8 + bu * 4}px "Press Start 2P", monospace` : `${16 + bu * 10}px ${SK.fonte}`; c.textAlign = 'center'; c.fillText(txt, fx + 18, fy - 24 - bu * 22); c.restore(); }
}
function desenhaFantasma(c, fx, fy, fase, alvo, i) {
  const dx = alvo ? alvo.x - fx : 0, dy = alvo ? alvo.y - fy : 0, d = Math.hypot(dx, dy) || 1, lx = dx / d, ly = dy / d;
  const perto = d < 62, pulse = 1 + Math.sin(T * 3 + fase) * 0.04 + (perto ? 0.08 : 0);
  if (d < 46 && T - fantasmaBu[i] > 2.4) fantasmaBu[i] = T;
  const g = c.createRadialGradient(fx, fy, 2, fx, fy, 48); g.addColorStop(0, 'rgba(210,230,255,.22)'); g.addColorStop(1, 'rgba(210,230,255,0)');
  c.fillStyle = g; circ(c, fx, fy, 48); c.fill();
  c.save(); c.translate(fx, fy); c.scale(pulse, pulse); c.globalAlpha = 0.9;
  c.fillStyle = '#eef3ff';
  c.beginPath(); c.moveTo(-17, 2); c.arc(0, -2, 17, Math.PI, 0); c.lineTo(17, 15);
  for (let k = 0; k < 4; k++) { const x0 = 17 - k * 8.5, ph = Math.sin(T * 7 + k + fase) * 2.6; c.quadraticCurveTo(x0 - 4.25, 22 + ph, x0 - 8.5, 15); }
  c.closePath(); c.fill();
  c.fillStyle = '#dfe7fb'; elip(c, -18 + Math.sin(T * 4 + fase) * 1.5, 4, 4, 2.4); c.fill(); elip(c, 18 - Math.sin(T * 4 + fase) * 1.5, 4, 4, 2.4); c.fill();
  c.globalAlpha = 1;
  c.fillStyle = '#141020'; elip(c, -6, -4, 3.2, 4.6); c.fill(); elip(c, 6, -4, 3.2, 4.6); c.fill();
  c.fillStyle = '#fff'; circ(c, -6 + lx * 1.6, -5 + ly * 1.8, 1.2); c.fill(); circ(c, 6 + lx * 1.6, -5 + ly * 1.8, 1.2); c.fill();
  c.fillStyle = '#141020'; if (perto) { elip(c, 0, 7, 3.6, 4.8); c.fill(); } else { elip(c, 0, 5.5, 2, 1.4); c.fill(); }
  if (perto) { c.fillStyle = 'rgba(255,140,170,.45)'; elip(c, -10, 3, 2.4, 1.4); c.fill(); elip(c, 10, 3, 2.4, 1.4); c.fill(); }
  c.restore();
  balaoBu(c, fx, fy, i, 'BU!', '#eef3ff');
}
function textoRiso(c, wx, wy, riso, txt, cor) {
  const dr = T - riso;
  if (dr >= 0 && dr < 1.2) { c.save(); c.globalAlpha = 1 - dr / 1.2; c.fillStyle = cor; c.font = `600 ${SK.pixel ? 6 : 10}px ${SK.fonteMini}`; c.textAlign = 'center'; c.fillText(txt, wx, wy - 40 - dr * 14); c.restore(); }
}
function desenhaBruxa(c, wx, wy, dir, riso) {
  c.save(); c.translate(wx, wy); c.scale(dir, 1);
  const cape = Math.sin(T * 10) * 3;
  for (let i = 0; i < 3; i++) { c.fillStyle = `rgba(255,214,120,${0.35 - i * 0.1})`; circ(c, -46 - i * 9 + Math.sin(T * 20 + i) * 2, 6 + Math.sin(T * 13 + i) * 3, 1.6 - i * .3); c.fill(); }
  c.fillStyle = '#c9a35e'; c.beginPath(); c.moveTo(-26, 4); c.lineTo(-42, -1); c.lineTo(-44, 6); c.lineTo(-42, 13); c.closePath(); c.fill();
  c.strokeStyle = '#a07e40'; c.lineWidth = .7; for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(-27, 5); c.lineTo(-43, 1 + i * 3.6); c.stroke(); }
  c.strokeStyle = '#6e4c2e'; c.lineWidth = 2.6; c.lineCap = 'round'; c.beginPath(); c.moveTo(-26, 5.5); c.lineTo(24, 1.5); c.stroke();
  c.fillStyle = '#0d0a10'; elip(c, -19, 0, 5, 3.4); c.fill(); circ(c, -14.5, -4, 3); c.fill();
  c.beginPath(); c.moveTo(-16.5, -6); c.lineTo(-16, -9.5); c.lineTo(-14.6, -6.6); c.moveTo(-13.6, -6.6); c.lineTo(-12.4, -9.5); c.lineTo(-12.4, -5.6); c.fill();
  c.strokeStyle = '#0d0a10'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(-23.5, 0); c.quadraticCurveTo(-29, -4 + Math.sin(T * 4) * 2, -26, -10); c.stroke();
  c.fillStyle = '#ffd84d'; circ(c, -15.4, -4.4, .6); c.fill(); circ(c, -13.4, -4.4, .6); c.fill();
  c.fillStyle = '#24152f'; c.beginPath(); c.moveTo(-2, -11); c.quadraticCurveTo(-14, -4, -24 + cape, 2 + cape * .4); c.lineTo(-6, 3); c.closePath(); c.fill();
  c.fillStyle = '#3d2353'; c.beginPath(); c.moveTo(-6, -11); c.lineTo(6, -11); c.lineTo(9, 3); c.lineTo(-7, 3); c.closePath(); c.fill();
  c.fillStyle = '#1a1020'; rr(c, 4, 2, 7, 3, 1.2); c.fill();
  c.strokeStyle = '#ff7a2b'; c.lineWidth = 1.2; for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(-1, -17 + i); c.quadraticCurveTo(-6, -12 + i + cape * .3, -9 + i, -5 + i); c.stroke(); }
  c.fillStyle = '#8fd16a'; circ(c, 2, -15.5, 5); c.fill();
  c.beginPath(); c.moveTo(6, -16); c.lineTo(11, -13.5); c.lineTo(6, -12.6); c.closePath(); c.fill();
  c.fillStyle = '#1a1020'; circ(c, 4, -17, .9); c.fill();
  c.strokeStyle = '#1a1020'; c.lineWidth = .8; c.beginPath(); c.arc(3.6, -13.6, 2, 0.2, 1.6); c.stroke();
  c.fillStyle = '#1d1328'; elip(c, 1, -19.5, 9.5, 2.2); c.fill();
  c.beginPath(); c.moveTo(-4.5, -20); c.lineTo(5.5, -20); c.quadraticCurveTo(0, -28, -8, -35); c.closePath(); c.fill();
  c.fillStyle = '#8a55e0'; c.fillRect(-4, -23, 9, 2);
  c.restore();
  textoRiso(c, wx, wy, riso, 'hihihi', '#c9a2ff');
}
function pocaoHalloween(c, x, y, tipo, ang) {
  const cor = tipo === 'gosma' ? '#8fe36b' : '#b08af5';
  brilho(c, () => luz(c, x, y, 16, cor, .5));
  c.save(); c.translate(x, y); c.rotate(ang);
  c.fillStyle = cor; circ(c, 0, 1.5, 4.6); c.fill(); c.fillStyle = 'rgba(220,240,255,.75)'; c.fillRect(-1.6, -6, 3.2, 4); c.fillStyle = '#8a6a44'; c.fillRect(-1.8, -7.6, 3.6, 2);
  c.fillStyle = 'rgba(255,255,255,.6)'; circ(c, -1.6, 0, 1.2); c.fill();
  c.restore();
}
function desenhaCaldeirao(c, dentro) {
  const cx = W / 2, top = CALD_Y;
  for (let i = 0; i < 6; i++) {
    const x = cx - 55 + i * 22, h = 16 + Math.sin(T * 12 + i * 2.1) * 5 + Math.sin(T * 7.3 + i) * 3;
    const g = c.createLinearGradient(x, top + 165, x, top + 165 - h); g.addColorStop(0, '#ffcf5a'); g.addColorStop(1, 'rgba(255,90,30,0)');
    c.fillStyle = g; c.beginPath(); c.moveTo(x - 9, top + 166); c.quadraticCurveTo(x - 4, top + 160 - h * .5, x + Math.sin(T * 9 + i) * 3, top + 166 - h); c.quadraticCurveTo(x + 4, top + 160 - h * .5, x + 9, top + 166); c.fill();
  }
  c.fillStyle = '#3a2a20'; for (let i = 0; i < 5; i++) { rr(c, cx - 60 + i * 26, top + 162, 24, 7, 3); c.fill(); }
  c.fillStyle = '#131017'; c.fillRect(cx - 74, top + 120, 9, 38); c.fillRect(cx + 65, top + 120, 9, 38);
  const g = c.createLinearGradient(cx - 110, 0, cx + 110, 0); g.addColorStop(0, '#0d0b10'); g.addColorStop(0.3, '#2c2633'); g.addColorStop(1, '#0d0b10');
  c.fillStyle = g; c.beginPath(); c.moveTo(cx - 80, top + 4); c.bezierCurveTo(cx - 122, top + 40, cx - 106, top + 140, cx, top + 146); c.bezierCurveTo(cx + 106, top + 140, cx + 122, top + 40, cx + 80, top + 4); c.closePath(); c.fill();
  c.strokeStyle = 'rgba(255,255,255,.08)'; c.lineWidth = 3; c.beginPath(); c.moveTo(cx - 92, top + 30); c.quadraticCurveTo(cx - 100, top + 80, cx - 60, top + 120); c.stroke();
  const lg = c.createRadialGradient(cx, top + 2, 4, cx, top + 2, 80); lg.addColorStop(0, '#d6ffb8'); lg.addColorStop(0.5, '#7fd14f'); lg.addColorStop(1, '#2f6a22');
  c.fillStyle = lg; elip(c, cx, top + 3, 76, 9); c.fill();
  almasBoiando(c, dentro, cx, top, 62);
  if (dentro.length) { c.fillStyle = lg; c.beginPath(); c.ellipse(cx, top + 3, 76, 9, 0, 0, Math.PI); c.lineTo(cx - 76, top + 3); c.closePath(); c.fill(); c.fillRect(cx - 74, top + 3, 148, 6); }
  for (let i = 0; i < 5 + dentro.length; i++) { const ph = (T * 1.3 + i * 0.37) % 1, bx = cx - 50 + i * 25 + Math.sin(i * 7) * 6; c.strokeStyle = `rgba(214,255,184,${1 - ph})`; c.lineWidth = 1.2; circ(c, bx, top + 2 - ph * 4, 2 + ph * 4); c.stroke(); }
  c.strokeStyle = '#4a4156'; c.lineWidth = 5; elip(c, cx, top + 2, 84, 11); c.stroke();
  c.strokeStyle = 'rgba(255,255,255,.18)'; c.lineWidth = 1.2; c.beginPath(); c.ellipse(cx, top + 1, 84, 11, 0, Math.PI * 1.1, Math.PI * 1.6); c.stroke();
  brilho(c, () => { const gl = c.createRadialGradient(cx, top, 10, cx, top, 160); gl.addColorStop(0, 'rgba(120,220,90,.22)'); gl.addColorStop(1, 'rgba(120,220,90,0)'); c.fillStyle = gl; circ(c, cx, top, 160); c.fill(); });
}
function almasBoiando(c, dentro, cx, top, larg) {
  dentro.forEach((o, i) => desenhaAlma(c, clamp(o.x, cx - larg, cx + larg), top - 1 + Math.sin(T * 3 + i * 1.7) * 1.6, 8, o.est, { expr: i % 3 ? 'grudada' : 'medo', t: T + i, lx: Math.sin(T + i), ly: 0, inc: Math.sin(T * 2 + i) * 0.2 }));
}
function desenhaTeia(c, w, presa, ar) {
  const pull = (px, py) => { if (!presa) return [px, py]; const dx = presa.x - px, dy = presa.y - py, d = Math.hypot(dx, dy), f = Math.max(0, 1 - d / 70) * 0.35; return [px + dx * f, py + dy * f]; };
  c.strokeStyle = 'rgba(230,232,245,.42)'; c.lineWidth = .8;
  const N = 10;
  for (let i = 0; i < N; i++) { const a = i / N * Math.PI * 2; c.beginPath(); for (let k = 0; k <= 5; k++) { const [px, py] = pull(w.x + Math.cos(a) * w.r * k / 5, w.y + Math.sin(a) * w.r * k / 5); k ? c.lineTo(px, py) : c.moveTo(px, py); } c.stroke(); }
  for (let ring = 1; ring <= 5; ring++) { c.beginPath(); for (let i = 0; i <= N; i++) { const a = i / N * Math.PI * 2, rr2 = w.r * ring / 5.3; const [px, py] = pull(w.x + Math.cos(a) * rr2, w.y + Math.sin(a) * rr2); i ? c.lineTo(px, py) : c.moveTo(px, py); } c.stroke(); }
  const top = w.y - w.r - 110;
  c.strokeStyle = 'rgba(230,232,245,.35)'; c.beginPath(); c.moveTo(w.x + 8, top); c.lineTo(w.x + 8, ar.y); c.stroke();
  c.save(); c.translate(w.x + 8, ar.y);
  c.strokeStyle = '#0c0910'; c.lineWidth = 1.2;
  for (const sg of [-1, 1]) for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(0, 2); c.quadraticCurveTo(sg * (5 + i), -3 + i * 2.5, sg * (8 + i), 2 + i * 3 + Math.sin(T * 8 + i) * .8); c.stroke(); }
  c.fillStyle = '#0c0910'; circ(c, 0, 0, 3.4); c.fill(); circ(c, 0, 6, 5); c.fill();
  c.fillStyle = '#d6303f'; c.beginPath(); c.moveTo(-1.4, 4.6); c.lineTo(1.4, 4.6); c.lineTo(0, 6.4); c.lineTo(1.4, 8.2); c.lineTo(-1.4, 8.2); c.lineTo(0, 6.4); c.closePath(); c.fill();
  c.fillStyle = '#ff5a5a'; circ(c, -1.1, -1, .55); c.fill(); circ(c, 1.1, -1, .55); c.fill();
  c.restore();
}
function desenhaRetrato(c, x, y, olhar) {
  c.fillStyle = SOMBRA; c.fillRect(x - 3 + SX, y - 3 + SY, 46, 58);
  c.fillStyle = '#7d5f24'; c.fillRect(x - 3, y - 3, 46, 58); c.fillStyle = '#b8923f'; c.fillRect(x - 1.5, y - 1.5, 43, 55);
  c.fillStyle = '#23151f'; c.fillRect(x + 2, y + 2, 36, 48);
  c.fillStyle = '#2f2030'; c.beginPath(); c.moveTo(x + 5, y + 50); c.quadraticCurveTo(x + 20, y + 28, x + 35, y + 50); c.fill();
  c.fillStyle = '#b9a58a'; elip(c, x + 20, y + 22, 8, 10); c.fill();
  c.fillStyle = '#3a2418'; c.beginPath(); c.ellipse(x + 20, y + 15, 9, 6, 0, Math.PI, 0); c.fill();
  const dx = olhar.x - (x + 20), dy = olhar.y - (y + 21), d = Math.hypot(dx, dy) || 1;
  c.fillStyle = '#f2ead8'; elip(c, x + 16.5, y + 21, 2.2, 1.6); c.fill(); elip(c, x + 23.5, y + 21, 2.2, 1.6); c.fill();
  c.fillStyle = '#180e10'; circ(c, x + 16.5 + dx / d * 1.2, y + 21 + dy / d * .7, .95); c.fill(); circ(c, x + 23.5 + dx / d * 1.2, y + 21 + dy / d * .7, .95); c.fill();
  c.strokeStyle = '#6a4a3a'; c.lineWidth = .7; c.beginPath(); c.moveTo(x + 17, y + 27); c.lineTo(x + 23, y + 27); c.stroke();
}
function desenhaCeifador(c, olhar) {
  const cx = W / 2, top = MOINHO.y - 210;
  c.save(); c.globalAlpha = 0.5;
  c.fillStyle = 'rgba(0,0,0,.55)';
  c.beginPath(); c.moveTo(cx - 190, top + 1240); c.quadraticCurveTo(cx - 210, top + 710, cx, top); c.quadraticCurveTo(cx + 210, top + 710, cx + 190, top + 1240); c.closePath(); c.fill();
  c.fillStyle = 'rgba(0,0,0,.7)'; elip(c, cx, top + 170, 70, 90); c.fill();
  c.globalAlpha = 1;
  const dx = olhar.x - cx, dy = olhar.y - (top + 160), d = Math.hypot(dx, dy) || 1;
  c.globalCompositeOperation = 'lighter';
  for (const sg of [-1, 1]) {
    const ex = cx + sg * 24 + dx / d * 7, ey = top + 160 + dy / d * 5;
    const g = c.createRadialGradient(ex, ey, 0, ex, ey, 16); g.addColorStop(0, 'rgba(255,60,50,.95)'); g.addColorStop(0.3, 'rgba(255,40,30,.4)'); g.addColorStop(1, 'rgba(255,40,30,0)');
    c.fillStyle = g; circ(c, ex, ey, 16); c.fill();
  }
  c.restore();
}
function desenhaMorcego(c, x, y, s, fl, voa) {
  c.save(); c.translate(x, y); c.scale(s, s); c.fillStyle = '#0c0910';
  if (!voa) { elip(c, 0, 0, 3, 5); c.fill(); c.beginPath(); c.moveTo(-2, -4.5); c.lineTo(0, -7); c.lineTo(2, -4.5); c.fill(); c.fillStyle = '#ff5a3c'; circ(c, -1, 2.4, .5); c.fill(); circ(c, 1, 2.4, .5); c.fill(); }
  else { const f = Math.sin(fl) * 5; c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(-6, -6 - f, -12, -2 - f); c.quadraticCurveTo(-9, 0, -8, 3); c.quadraticCurveTo(-5, 1, 0, 3); c.quadraticCurveTo(5, 1, 8, 3); c.quadraticCurveTo(9, 0, 12, -2 - f); c.quadraticCurveTo(6, -6 - f, 0, 0); c.fill(); elip(c, 0, 1, 2.4, 3); c.fill(); }
  c.restore();
}
const coruja = { x: 26, y: 0, ang: 0 };
const retratoOlho = { x: W / 2, y: 0 };
let aranhas = [];
function bichosHalloween(c, vis) {
  // corvo da encruzilhada
  const dtc = T - rec.corvoT;
  if (CORVO.y > vis.y0 - 60 && CORVO.y < vis.y1 + 60 && dtc < 6) {
    const voa = dtc >= 0, x = voa ? CORVO.x + 70 * dtc : CORVO.x, y = voa ? CORVO.y - 90 * dtc + 10 * dtc * dtc : CORVO.y;
    c.save(); c.translate(x, y); c.fillStyle = '#07050a';
    if (!voa) { elip(c, 0, 0, 6, 4.5); c.fill(); circ(c, 5, -4, 3.2); c.fill(); c.beginPath(); c.moveTo(7.5, -4); c.lineTo(12, -3); c.lineTo(7.5, -2.4); c.fill(); c.beginPath(); c.moveTo(-5, 1); c.lineTo(-11, 3); c.lineTo(-5, 3); c.fill(); c.fillStyle = '#e8d07a'; circ(c, 5.8, -4.6, .7); c.fill(); }
    else { const f = Math.sin(dtc * 20) * 6; c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(-7, -7 - f, -15, -3 - f); c.quadraticCurveTo(-8, 1, 0, 2); c.quadraticCurveTo(8, 1, 15, -3 - f); c.quadraticCurveTo(7, -7 - f, 0, 0); c.fill(); }
    c.restore();
  }
  // coruja que segue a alma mais próxima
  if (coruja.y > vis.y0 - 30 && coruja.y < vis.y1) {
    let perto = null, dm = 1e9; for (const o of vb) { const d = Math.hypot(o.x - coruja.x, o.y - coruja.y); if (d < dm) { dm = d; perto = o; } }
    const alvoA = perto && dm < 400 ? clamp(Math.atan2(perto.y - coruja.y, perto.x - coruja.x) * 0.35, -0.5, 0.5) : 0;
    coruja.ang += (alvoA - coruja.ang) * 0.08;
    const { x, y } = coruja;
    c.fillStyle = '#3b2a1e'; c.fillRect(0, y + 13, 30, 4);
    c.fillStyle = '#5a4434'; elip(c, x, y + 4, 8, 10); c.fill(); c.fillStyle = '#c7ad86'; elip(c, x, y + 6, 5, 6.5); c.fill();
    c.save(); c.translate(x, y - 7); c.rotate(coruja.ang);
    c.fillStyle = '#6b5240'; circ(c, 0, 0, 8); c.fill(); c.beginPath(); c.moveTo(-7, -4); c.lineTo(-6, -11); c.lineTo(-2, -6); c.moveTo(7, -4); c.lineTo(6, -11); c.lineTo(2, -6); c.fill();
    const pis = (T % 4) < 0.15;
    c.fillStyle = '#ffd84d'; if (!pis) { circ(c, -3.4, -.5, 2.8); c.fill(); circ(c, 3.4, -.5, 2.8); c.fill(); c.fillStyle = '#100a08'; circ(c, -3.4, -.5, 1.3); c.fill(); circ(c, 3.4, -.5, 1.3); c.fill(); }
    else { c.strokeStyle = '#100a08'; c.lineWidth = 1; c.beginPath(); c.moveTo(-6, -.5); c.lineTo(-1, -.5); c.moveTo(1, -.5); c.lineTo(6, -.5); c.stroke(); }
    c.fillStyle = '#e09a3a'; c.beginPath(); c.moveTo(-1.2, 2); c.lineTo(1.2, 2); c.lineTo(0, 4.4); c.fill();
    c.restore();
  }
  morcegosPousados.forEach((m, i) => {
    if (m.y < vis.y0 - 40 || m.y > vis.y1 + 40) return;
    const dtm = T - rec.morcegoT[i];
    if (dtm < 0) desenhaMorcego(c, m.x, m.y, 1, 0, false);
    else if (dtm < 4) { const r3 = mulberry32(i * 7 + 1), vx = (r3() - .5) * 160, vy = -60 - r3() * 60; desenhaMorcego(c, m.x + vx * dtm, m.y + vy * dtm - 5 * dtm * dtm, .9, dtm * 22, true); }
  });
}
function pegsHalloween(c, vis, dtR) {
  c.beginPath(); for (const p of pegs) if (p.tipo === 'lapide' && p.y > vis.y0 && p.y < vis.y1) lapidePath(c, p.x, p.y, p.r);
  c.fillStyle = '#6a6075'; c.fill(); c.strokeStyle = '#8c809a'; c.lineWidth = 1; c.stroke();
  for (const p of pegs) {
    if (p.y < vis.y0 - 30 || p.y > vis.y1 + 30) continue;
    if (p.tipo === 'lapide') { c.fillStyle = 'rgba(110,150,80,.6)'; elip(c, p.x - 3, p.y + p.r - 1, 3, 1.4); c.fill(); }
    else if (p.tipo === 'lapideG') {
      const gg = c.createLinearGradient(p.x - p.r, 0, p.x + p.r, 0); gg.addColorStop(0, '#5d546a'); gg.addColorStop(.4, '#8d8299'); gg.addColorStop(1, '#4e4659');
      c.fillStyle = gg; c.beginPath(); lapidePath(c, p.x, p.y, p.r); c.fill(); c.strokeStyle = '#a89db5'; c.lineWidth = 1; c.stroke();
      c.fillStyle = '#2a2232'; c.textAlign = 'center';
      c.font = '9px "Pirata One", Georgia, serif'; c.fillText('R.I.P.', p.x, p.y - 7);
      c.font = '600 4.3px "IBM Plex Mono", monospace'; c.fillText(p.txt[0], p.x, p.y + 1.5); c.fillText(p.txt[1], p.x, p.y + 6.8);
      c.textAlign = 'left';
      c.strokeStyle = 'rgba(30,20,30,.45)'; c.lineWidth = .7; c.beginPath(); c.moveTo(p.x + 8, p.y - 14); c.lineTo(p.x + 5, p.y - 9); c.lineTo(p.x + 7, p.y - 6); c.stroke();
      c.fillStyle = 'rgba(110,150,80,.7)'; elip(c, p.x - 9, p.y + p.r - 1, 5, 2); c.fill(); elip(c, p.x + 10, p.y + p.r - 1, 3, 1.5); c.fill();
    } else if (p.tipo === 'cristal') {
      p.brilho = Math.max(0, p.brilho - dtR * 2.5);
      c.fillStyle = '#2a1f2e'; c.beginPath(); c.moveTo(p.x - 8, p.y + 11); c.lineTo(p.x + 8, p.y + 11); c.lineTo(p.x + 12, p.y + 19); c.lineTo(p.x - 12, p.y + 19); c.closePath(); c.fill();
      const gg = c.createRadialGradient(p.x - 4, p.y - 5, 1, p.x, p.y, p.r); gg.addColorStop(0, '#f1e4ff'); gg.addColorStop(.45, p.bumper ? '#c58cff' : '#9a6fe0'); gg.addColorStop(1, '#3a1f66');
      c.fillStyle = gg; circ(c, p.x, p.y, p.r); c.fill();
      if (p.bumper) { c.strokeStyle = `rgba(255,214,255,${0.5 + p.brilho * 0.5})`; c.lineWidth = 2 + p.brilho * 2; circ(c, p.x, p.y, p.r + 1.5 + p.brilho * 3); c.stroke(); }
      c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 1.2; c.beginPath(); c.arc(p.x, p.y, p.r * .55, T * 2 + p.x, T * 2 + p.x + 2.2); c.stroke();
      if (p.brilho > 0 || p.bumper) brilho(c, () => luz(c, p.x, p.y, 34, '#b08af5', 0.12 + p.brilho * 0.3));
    } else if (p.tipo === 'osso') {
      c.fillStyle = '#e4dccb'; circ(c, p.x, p.y - 1, p.r); c.fill(); rr(c, p.x - 4.5, p.y + 3, 9, 5, 1.5); c.fill();
      c.fillStyle = '#2a2232'; elip(c, p.x - 3, p.y - 1.5, 2.2, 2.6); c.fill(); elip(c, p.x + 3, p.y - 1.5, 2.2, 2.6); c.fill();
    } else if (p.tipo === 'abobora') {
      const perto = pertoDeAlguem(p);
      p.brilho = Math.max(perto, p.brilho - dtR * 0.8);
      brilho(c, () => luz(c, p.x, p.y, 34 + p.brilho * 22, '#ffaa3c', 0.1 + 0.2 * p.brilho));
      desenhaAlma(c, p.x, p.y, p.r, { cor: '#e0640f', modelo: 'abobora', acessorio: 'nenhum' }, { expr: p.brilho > .5 ? 'feliz' : 'normal', t: T });
    }
  }
}
function pertoDeAlguem(p) { for (const o of vb) { if (Math.abs(o.y - p.y) < 46 && Math.hypot(o.x - p.x, o.y - p.y) < 46) return 1; } return 0; }
function tijolos(c, cor) {
  c.strokeStyle = cor; c.lineWidth = 1;
  for (let y = -100, row = 0; y < PORTAO_Y; y += 24, row++) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); for (let x = row % 2 ? 24 : 0; x < W; x += 48) { c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + 24); c.stroke(); } }
}
function vela(c, vx, vy, lean) {
  c.fillStyle = '#e9dfc8'; c.fillRect(vx - 2.5, vy, 5, 14); c.fillStyle = '#4a4054'; c.fillRect(vx - 5, vy + 14, 10, 3);
  c.save(); c.translate(vx, vy); c.rotate(lean + Math.sin(T * 13 + vx) * 0.08);
  const fg = c.createRadialGradient(0, -4, 0, 0, -4, 6); fg.addColorStop(0, '#fff6c8'); fg.addColorStop(.5, '#ffb347'); fg.addColorStop(1, 'rgba(255,120,30,0)');
  c.fillStyle = fg; elip(c, 0, -5, 3.4, 6); c.fill(); c.restore();
  brilho(c, () => luz(c, vx, vy - 4, 60, '#ffb45a', 0.16));
}
/* céu padrão: estrelas, lua e nuvem; a lua pisca para o vencedor */
function luaPadrao(c, info, cor) {
  const mx = cw - 80, my = 78 - Math.min(info.camY, 5000) * 0.004;
  const lg = c.createRadialGradient(mx, my, 10, mx, my, 90); lg.addColorStop(0, rgba(cor, .18)); lg.addColorStop(1, rgba(cor, 0));
  c.fillStyle = lg; circ(c, mx, my, 90); c.fill();
  c.fillStyle = cor; circ(c, mx, my, 36); c.fill();
  c.fillStyle = 'rgba(160,140,110,.35)'; circ(c, mx - 12, my - 10, 7); c.fill(); circ(c, mx + 14, my + 12, 5); c.fill(); circ(c, mx + 8, my - 16, 3.5); c.fill();
  c.strokeStyle = 'rgba(90,70,50,.55)'; c.fillStyle = 'rgba(90,70,50,.55)'; c.lineWidth = 2; c.lineCap = 'round';
  circ(c, mx - 10, my - 2, 2.4); c.fill();
  if (info.piscaLua) { c.beginPath(); c.moveTo(mx + 6, my - 2); c.lineTo(mx + 14, my - 2); c.stroke(); } else { circ(c, mx + 10, my - 2, 2.4); c.fill(); }
  c.beginPath(); c.arc(mx, my + 6, info.venceu ? 8 : 6, 0.25, Math.PI - 0.25); c.stroke();
  return [mx, my];
}
const ESTRELAS = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), r: Math.random() * 1.2 + .3, f: Math.random() * 6 }));
function estrelasPadrao(c, info, cor, quadrada) {
  for (const e of ESTRELAS) {
    c.fillStyle = rgba(cor, 0.25 + Math.sin(T * 2 + e.f) * 0.2); const x = e.x * cw, y = ((e.y * ch - info.camY * 0.04) % ch + ch) % ch;
    if (quadrada) c.fillRect(Math.round(x / 2) * 2, Math.round(y / 2) * 2, 2, 2); else { circ(c, x, y, e.r); c.fill(); }
  }
}
function ceuHalloween(c, info) {
  estrelasPadrao(c, info, '#efe6d4');
  let flash = 0;
  for (const r of info.raios) {
    const d = T - r.t; if (d < 0 || d > 0.55) continue;
    flash = Math.max(flash, d < 0.07 ? 0.5 : d < 0.12 ? 0.08 : d < 0.2 ? 0.35 : 0.35 * (1 - (d - 0.2) / 0.35));
    if (d < 0.22) { const r3 = mulberry32(r.seed); let x = r.px * cw, y = 0; c.strokeStyle = 'rgba(235,225,255,.85)'; c.lineWidth = 2; c.beginPath(); c.moveTo(x, y); while (y < ch * 0.7) { x += (r3() - .5) * 60; y += 20 + r3() * 30; c.lineTo(x, y); } c.stroke(); }
  }
  const [, my] = luaPadrao(c, info, '#efe3c4');
  const nuv = ((T * 8) % (cw + 300)) - 150;
  c.fillStyle = 'rgba(40,30,50,.55)'; elip(c, nuv + 40, my + 18, 60, 10); c.fill(); elip(c, nuv + 70, my + 10, 40, 10); c.fill();
  return flash;
}
function longeHalloween(c, tipo, base, off, rs) {
  if (tipo === 'largada') { for (let k = 0; k < 5; k++) { const x = (k + .5) / 5 * cw; c.fillRect(x - 14, base - 220, 28, 400); c.beginPath(); c.arc(x + cw / 10, base - 220, cw / 10 - 14, Math.PI, 0); c.lineWidth = 16; c.stroke(); } }
  else if (tipo === 'lapides' || tipo === 'portao') {
    const i = tipo === 'portao' ? 4 : 1;
    c.beginPath(); c.moveTo(0, base + 300); c.lineTo(0, base); for (let x = 0; x <= cw; x += 20) c.lineTo(x, base - 18 * Math.sin(x / cw * 6 + i)); c.lineTo(cw, base + 300); c.fill();
    rs.forEach(([a], k) => { const x = a * cw, y = base - 18 * Math.sin(a * 6 + i); if (k % 2) { c.fillRect(x - 2, y - 26, 4, 26); c.fillRect(x - 9, y - 19, 18, 4); } else { rr(c, x - 7, y - 18, 14, 20, 6); c.fill(); } });
    if (tipo === 'portao') { c.fillRect(0, base - 70, cw, 4); for (let x = 6; x < cw; x += 14) { c.beginPath(); c.moveTo(x - 2, base - 66); c.lineTo(x - 2, base - 92); c.lineTo(x, base - 98); c.lineTo(x + 2, base - 92); c.lineTo(x + 2, base - 66); c.fill(); } }
  } else if (tipo === 'encruzilhada' || tipo === 'caminhos') {
    rs.forEach(([a, b, d]) => { const x = a * cw, h = 120 + b * 160, y = base + 40; c.beginPath(); c.moveTo(x, y - h); c.lineTo(x - 24 - d * 14, y); c.lineTo(x + 24 + d * 14, y); c.closePath(); c.fill(); });
    c.fillRect(0, base + 38, cw, 400);
  } else if (tipo === 'salao') {
    const mx = cw * 0.55; c.beginPath(); c.moveTo(mx - 170, base + 80); c.lineTo(mx - 170, base - 90); c.lineTo(mx - 120, base - 150); c.lineTo(mx - 70, base - 90); c.lineTo(mx - 70, base - 120); c.lineTo(mx, base - 200); c.lineTo(mx + 70, base - 120); c.lineTo(mx + 70, base - 90); c.lineTo(mx + 140, base - 160); c.lineTo(mx + 190, base - 90); c.lineTo(mx + 190, base + 80); c.closePath(); c.fill();
    c.fillRect(0, base + 70, cw, 400);
    rs.slice(0, 9).forEach((_, k) => { const on = Math.sin(T * 0.7 + k * 2.3) > -0.4; if (!on) return; c.fillStyle = `rgba(255,200,110,${0.25 + 0.15 * Math.sin(T * 9 + k)})`; c.fillRect(mx - 150 + (k % 5) * 70, base - 70 + Math.floor(k / 5) * 60 - (k === 2 ? 70 : 0), 16, 22); });
  } else if (tipo === 'ponte') {
    const mx = cw * 0.25, my = base - 40;
    c.beginPath(); c.moveTo(mx - 40, base + 60); c.lineTo(mx - 22, my - 90); c.lineTo(mx + 22, my - 90); c.lineTo(mx + 40, base + 60); c.fill();
    c.save(); c.translate(mx, my - 100); c.rotate(T * 0.6); for (let k = 0; k < 4; k++) { c.rotate(Math.PI / 2); c.fillRect(-6, 0, 12, 130); c.fillRect(-14, 30, 28, 90); } c.restore();
    c.beginPath(); c.moveTo(0, base + 60); for (let x = 0; x <= cw; x += 30) c.lineTo(x, base + 30 - 30 * Math.sin(x / cw * 4)); c.lineTo(cw, base + 400); c.lineTo(0, base + 400); c.fill();
  } else if (tipo === 'moinho') {
    c.beginPath(); c.moveTo(cw * 0.7 - 60, base + 40); c.lineTo(cw * 0.7 - 60, base - 30); c.lineTo(cw * 0.7, base - 80); c.lineTo(cw * 0.7 + 60, base - 30); c.lineTo(cw * 0.7 + 60, base + 40); c.fill();
    c.fillStyle = `rgba(150,230,110,${0.25 + 0.1 * Math.sin(T * 3)})`; c.fillRect(cw * 0.7 - 10, base - 20, 20, 18); c.fillStyle = SK.cor.longe;
    c.fillRect(0, base + 40, cw, 400);
  } else if (tipo === 'caldeirao') {
    c.lineWidth = 1.2; c.strokeStyle = 'rgba(220,220,240,.10)';
    for (const [cx2, sg] of [[0, 1], [cw, -1]]) { for (let k = 0; k < 7; k++) { c.beginPath(); c.moveTo(cx2, off * .5); c.lineTo(cx2 + sg * Math.cos(k / 6 * Math.PI / 2) * 220, off * .5 + Math.sin(k / 6 * Math.PI / 2) * 220); c.stroke(); } for (let rr3 = 40; rr3 < 220; rr3 += 36) { c.beginPath(); c.arc(cx2, off * .5, rr3, sg > 0 ? 0 : Math.PI / 2, sg > 0 ? Math.PI / 2 : Math.PI); c.stroke(); } }
  } else if (tipo === 'teias') {
    c.beginPath(); c.moveTo(0, base + 40); for (let x = 0; x <= cw; x += 24) c.lineTo(x, base + 20 - 16 * Math.sin(x / cw * 5)); c.lineTo(cw, base + 400); c.lineTo(0, base + 400); c.fill();
    rs.forEach(([a], k) => { const x = a * cw, y = base + 20 - 16 * Math.sin(a * 5) - 6; c.fillStyle = 'rgba(0,0,0,.32)'; elip(c, x, y, 10, 7); c.fill(); c.fillStyle = `rgba(255,170,60,${0.22 + 0.15 * Math.sin(T * 4 + k)})`; c.fillRect(x - 4, y - 2, 3, 3); c.fillRect(x + 1, y - 2, 3, 3); c.fillRect(x - 4, y + 2, 8, 2); });
    c.fillStyle = 'rgba(0,0,0,.32)'; const sx = cw * 0.2; c.fillRect(sx - 2, base - 90, 4, 100); c.fillRect(sx - 30, base - 70, 60, 4); circ(c, sx, base - 100, 10); c.fill(); c.beginPath(); c.moveTo(sx - 16, base - 104); c.lineTo(sx + 16, base - 104); c.lineTo(sx, base - 128); c.fill();
  } else if (tipo === 'fliper') {
    rs.slice(0, 8).forEach(([a, b], k) => { const x = a * cw, y = base + 30 + b * 40; elip(c, x, y, 18, 14); c.fill(); });
    c.fillRect(0, base + 50, cw, 400);
  }
}
function fundoHalloween(c, vis, alvo, rk) {
  if (vis.y1 > MOINHO.y - 220 && vis.y0 < MOINHO.y + 560) desenhaCeifador(c, alvo);
  if (vis.y1 > FANT_Y[0] && vis.y0 < FANT_Y[1]) {
    c.fillStyle = 'rgba(255,200,220,.025)';
    for (let y = FANT_Y[0] + 30; y < FANT_Y[1]; y += 40) for (let x = 20; x < W; x += 40) { if (y < vis.y0 - 40 || y > vis.y1) continue; c.beginPath(); c.moveTo(x, y - 8); c.lineTo(x + 6, y); c.lineTo(x, y + 8); c.lineTo(x - 6, y); c.closePath(); c.fill(); }
    retratoOlho.x += (rk[0].b.x - retratoOlho.x) * 0.1; retratoOlho.y += (rk[0].b.y - retratoOlho.y) * 0.1;
    for (const [px, py] of RETRATOS) if (py > vis.y0 - 60 && py < vis.y1) desenhaRetrato(c, px, py, retratoOlho);
  }
}
function ambienteHalloween(vis, dt) {
  const y0 = vis.y0, y1 = vis.y1;
  if (y1 > DIV_Y0 && y0 < DIV_Y1 && Math.random() < dt * 6) solta(1, DIV_X + 20 + Math.random() * 260, y0 + 10, { v: 20, vx: -20 + Math.random() * 40, vy: 40, vida: 4, cor: ['#c0581c', '#d98a2b', '#8a4a1a'], tam: 2.4, forma: 'q', arr: .995 });
  if (y1 > DIV_Y0 && y0 < DIV_Y1 && Math.random() < dt * 5) solta(1, Math.random() * DIV_X, y0 + Math.random() * (y1 - y0), { v: 14, vida: 2.5, cor: '#d8ff7a', tam: 1.4, luz: true, arr: .99 });
  if (y1 > CALD_Y - 200 && y0 < CALD_Y + 180 && Math.random() < dt * 14) solta(1, W / 2 - 60 + Math.random() * 120, CALD_Y + 160, { v: 10, vy: -50, vida: 1.6, cor: ['#ffb347', '#ff7a1a'], tam: 1.3, luz: true, arr: .99 });
  if (y0 < PORTAO_Y && Math.random() < dt * 4) solta(1, Math.random() * W, y0 + Math.random() * (PORTAO_Y - y0), { v: 6, vida: 3, cor: 'rgba(239,230,212,.5)', tam: 1, arr: .995 });
}
const TXT_PADRAO = {
  abriu: () => 'O alçapão abriu. Boa sorte, bichinhos.',
  explosao: a => `Poção roxa! ${a} voou longe`,
  gosma: a => `${a} ficou preso na gosma verde`,
  mira: a => `A bruxa mirou ${a}...`,
  mao: a => `Uma mão de zumbi agarrou ${a}!`,
  portaoEspera: n => `${n} chegou primeiro ao portão... e vai ter que esperar a turma`,
  portaoJuntou: k => `Juntaram ${k} bichinhos: o portão abriu!`,
  portaoCansou: k => `O portão cansou de esperar e abriu com ${k} ${k > 1 ? 'bichinhos' : 'bichinho'}`,
  janela: (a, lado) => `${a} pulou a janela para ${lado}`,
  gangorra: (n, lado) => `A gangorra mandou ${n} para ${lado}`,
  caldPrimeiro: (a, N) => `${a} caiu primeiro no caldeirão. Ele só ferve com ${N}`,
  caldFerveu: (k, cheio) => cheio ? `O caldeirão ferveu! ${k} bichinhos saem em ordem sorteada` : `O caldeirão ferveu com ${k} ${k > 1 ? 'bichinhos' : 'bichinho'}`,
  portaoRitmo: () => 'O portão abre sozinho de tempo em tempo. Não espera ninguém.',
  caldRitmo: a => `${a} caiu primeiro. A erupção vem em segundos`,
  atalho: a => `O caldeirão mandou ${a} por um atalho!`,
  volta: a => `O caldeirão devolveu ${a} lá para trás`,
};
const CORES_PADRAO = {
  portao: ['#3b3443', '#5b5468', '#8c84a0'], alcapao: ['#2b2733', '#8c84a0'], pilar: ['#4a4254', '#6a6175'], chama: '#ffd27a', placa: ['#2b2431', '', '#efe6d4'],
  caldPlaca: ['#1f2a1c', '#8fe36b', '#d6ffb8'], placaT: ['#5a3d28', '#3a2618', '#f1e2c4', '#6b6158'], chegada: ['#efe6d4', '#100c15', '#ff8a2b', '#8a55e0', '#3a2f44'],
  zona: ['#6eaa46', '#c8f096'], mancha: '#82dc5a', portal: ['#aa82ff', '#8fe36b'], longe: 'rgba(0,0,0,.32)', parede: ['#1a1520', '#2b2433'], destaque: '#ff8a2b',
  lider: '#ff8a2b', explosao: ['#c9a2ff', '#8a55e0', '#ffffff', '#ff6fb5'], gosma: ['#a6f07f', '#6cc24a', '#d6ffb8'], anelExplosao: '#c9a2ff', anelGosma: '#a6f07f',
  bumper: { cristal: ['#e3ccff', '#b08af5'], abobora: ['#ffcf5a', '#ff8a2b'] }, chegadaConfete: ['#ff8a2b', '#b08af5', '#8fe36b', '#ffd84d', '#ff6fb5'], engole: ['#a6f07f', '#d6ffb8'], cospe: ['#b08af5', '#8fe36b', '#ffffff'],
  poeira: 'rgba(170,160,180,0.55)', terra: ['#5b4330', '#3e2d20', '#7a5c40'], faisca: ['#fff6cf', '#ffd27a', '#ffffff'], fumaca: ['rgba(170,160,180,.6)', 'rgba(120,110,130,.6)'],
};
const NOMES_PADRAO = {
  largada: ['Cripta', 'Cripta', 'à'], lapides: ['Campo das Lápides', 'Lápides', 'ao'], encruzilhada: ['Encruzilhada', 'Encruzilhada', 'à'], caminhos: ['Os dois caminhos', 'Caminhos', 'aos'],
  portao: ['Portão do Cemitério', 'Portão', 'ao'], salao: ['Mansão dos Fantasmas', 'Mansão', 'à'], ponte: ['Ponte Quebrada', 'Ponte', 'à'], moinho: ['Moinho do Ceifador', 'Moinho', 'ao'],
  caldeirao: ['Caldeirão', 'Caldeirão', 'ao'], teias: ['Teias da Aranha', 'Teias', 'às'], fliper: ['Labirinto de Abóboras', 'Abóboras', 'ao'],
};
const SKINS = {};
SKINS.halloween = {
  fonte: '"Pirata One", Georgia, serif', fontePlaca: '"Pirata One", Georgia, serif', fonteMini: '"IBM Plex Mono", monospace',
  nomes: NOMES_PADRAO, lados: ['a Trilha do Pântano', 'a Floresta das Bruxas'], ladosCurtos: ['Pântano', 'Floresta'], ladosPlaca: ['Trilha do Pântano', 'Floresta das Bruxas'],
  bg: { largada: ['#1d1a28', '#0e0c15'], lapides: ['#231936', '#110c1b'], encruzilhada: ['#1c2030', '#0c0e16'], caminhos: ['#132a22', '#08120e'], portao: ['#1f1a2c', '#0d0b14'], salao: ['#2d1424', '#13080f'], ponte: ['#1e1a16', '#0d0b09'], moinho: ['#2a0e10', '#0c0506'], caldeirao: ['#0f2a1b', '#06110b'], teias: ['#202029', '#0c0c11'], fliper: ['#2f1a0a', '#120904'] },
  epitafios: [['BOLETO', 'VENCIDO'], ['META DE', 'SETEMBRO'], ['PROMESSA', 'DE PAGTO.'], ['3ª PARCELA', 'DO ACORDO'], ['JUROS', 'DE MORA'], ['CPF', 'INVÁLIDO']],
  txt: TXT_PADRAO, cor: CORES_PADRAO, caldTxt: 'FERVENDO', chegadaTxt: 'Chegada', esperando: 'Os bichinhos olham para o alçapão.', bu: 'BU!', neblina: true,
  ceu: ceuHalloween, longe: longeHalloween, fundo: fundoHalloween, bichos: bichosHalloween, pegs: pegsHalloween, seg: desenhaSegHalloween, spin: desenhaSpinHalloween,
  mao: desenhaMao, fantasma: desenhaFantasma, bruxa: desenhaBruxa, pocao: pocaoHalloween, caldeirao: desenhaCaldeirao, teia: desenhaTeia, zona: zonaPadrao, mancha: manchaPadrao, portal: portalPadrao, chegada: chegadaPadrao, ambiente: ambienteHalloween,
  largada(c) { tijolos(c, 'rgba(255,255,255,.035)'); tituloLargada(c, '#ff8a2b', '#a99db5'); luzesLargada(c, vela); },
};
/* um mapa novo herda tudo do Halloween e troca o que for dele */
const skin = o => Object.assign({}, SKINS.halloween, { bichos: () => { }, fundo: () => { }, neblina: false, seg: segPadrao }, o, { cor: Object.assign({}, CORES_PADRAO, o.cor || {}), nomes: Object.assign({}, NOMES_PADRAO, o.nomes || {}), txt: Object.assign({}, TXT_PADRAO, o.txt || {}) });


/* ================= Caça Pixelada: os zumbis e as bruxas da caça em 8 bits ================= */
const SPR = new Map();
function sprite(chave, linhas, pal) {
  if (SPR.has(chave)) return SPR.get(chave);
  const w = Math.max(...linhas.map(l => l.length)), h = linhas.length;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const x = cv.getContext('2d');
  linhas.forEach((l, j) => { for (let i = 0; i < l.length; i++) { const k = l[i]; if (!pal[k]) continue; x.fillStyle = pal[k]; x.fillRect(i, j, 1, 1); } });
  SPR.set(chave, cv); return cv;
}
function pinta(c, cv, x, y, px, flip) {
  c.save(); c.imageSmoothingEnabled = false; c.translate(x, y); if (flip) c.scale(-1, 1);
  c.drawImage(cv, -cv.width * px / 2, -cv.height * px / 2, cv.width * px, cv.height * px); c.restore();
}
const CABECA_ZUMBI = ['.....ooooooo..', '...oo4443333o.', '..o444nr33333o', '..o44rR333332o', '..o4333322322o', '.o3233321y21yo', '.o21333321322o', '.o12332332oooo', '..o322332otmto', '...o22232ommto', '....oo1222ooo.', '......ooooo...'];
const ZUMBI = [
  'o3o..............o3o', 'o33o............o33o', 'o3o..............o3o', 'oao..............oao', 'oao..............oao',
  ...CABECA_ZUMBI.map(l => 'oao' + l + 'oao'),
  ...[0, 1, 2].map(() => 'oao' + '..oabbbbbbbao.' + 'oao'),
];
const PAL_ZUMBI = { o: '#1a1124', 1: '#2c4a3c', 2: '#4c7845', 3: '#78a24e', 4: '#b3cf6a', y: '#ffe14d', m: '#3a0a16', t: '#e9dfbc', r: '#6e0a12', R: '#c8202a', n: '#efe6cc', a: '#3b2f5c', b: '#5a4a8a' };
const BRUXA_PX = [
  '...............ooo........', '..............okkko.......', '.............okkkkko......', '............okkksko......', '..........ooooooooooooo...',
  '............o4444o........', '............o4y44oo.......', '...........hho444o4o......', '..........hhho44oo........', '..........ohaaaaao........',
  'qqq.......oaaaaaaao.......', 'qqqqvvvvvvvvvvvvvvvvvvvv..', 'qqq.....oaaaaaaao.........', '.........oaaaao...........', '..........gg.gg...........',
];
const PAL_BRUXA = { o: '#120c16', k: '#2a1a3a', s: '#8a55e0', 4: '#8fd16a', y: '#ffe14d', h: '#ff7a2b', a: '#3d2353', q: '#c9a35e', v: '#6e4c2e', g: '#1a1020' };
const PAL_CHEFONA = { o: '#07040a', k: '#07040a', s: '#07040a', 4: '#07040a', y: '#ff3b3b', h: '#07040a', a: '#07040a', q: '#07040a', v: '#07040a', g: '#07040a' };
const FANT_PX = [['...oooooo...', '..owwwwwwo..', '.owwwwwwwwo.', 'owwwwwwwwwwo', 'owwkkwwkkwwo', 'owwkkwwkkwwo', 'owwwwwwwwwwo', 'owwwwmmwwwwo', 'owwwwmmwwwwo', 'owwwwwwwwwwo', 'owwwwwwwwwwo', 'owwwowwwowwo', '.ooo.ooo.oo.'],
  ['...oooooo...', '..owwwwwwo..', '.owwwwwwwwo.', 'owwwwwwwwwwo', 'owwkkwwkkwwo', 'owwkkwwkkwwo', 'owwwwwwwwwwo', 'owwwwwwwwwwo', 'owwwwmmwwwwo', 'owwwwwwwwwwo', 'owwwwwwwwwwo', 'owwowwwowwwo', '.oo.ooo.ooo.']];
const PAL_FANT = { o: '#6a6a9a', w: '#eef3ff', k: '#141020', m: '#141020' };
const ABOBORA_PX = ['.....oo......', '......og.....', '...ooooooo...', '..oPPpPPpPo..', '.oPPpPPpPPPo.', 'oPPeePPPeePPo', 'oPPeePPPeePPo', 'oPPPPPPPPPPPo', 'oPPmPmPmPmPPo', '.oPPmmmmmPPo.', '..oPPPPPPPo..', '...ooooooo...'];
const PAL_ABO = { o: '#3a1a08', g: '#5c7a2e', P: '#ff8a2b', p: '#c25a12', e: '#3a1a08', m: '#3a1a08' };
const PAL_ABO_ACESA = Object.assign({}, PAL_ABO, { e: '#ffe14d', m: '#ffe14d', P: '#ffa040' });
const CAVEIRA_PX = ['.oooooo.', 'owwwwwwo', 'owwwwwwo', 'okkwwkko', 'okkwwkko', 'owwwkwwo', '.owkwko.', '..oooo..'];
const PAL_CAV = { o: '#6a5a70', w: '#e4dccb', k: '#2a2232' };
const TUMBA_PX = ['..oooo..', '.oggggo.', 'oggggggo', 'oggxgggo', 'ogxxxggo', 'oggxgggo', 'oggggggo', 'oggggggo', 'oooooooo'];
const PAL_TUMBA = { o: '#2a2232', g: '#7a6e8a', x: '#4a4054' };
const RIP = [['11.', '1', '11.'], ['1.1', '1', '1.1'], ['11.', '1', '11.'], ['1.1', '1', '1..'], ['1.1', '1', '1..']];
const TUMBA_G = ['....oooooo....', '..oogggggggoo.', '.oggggggggggo.', 'oggggggggggggo',
  ...RIP.map(([r, i, p]) => 'og' + r.replace(/\./g, 'g') + 'g' + i + 'g' + p.replace(/\./g, 'g') + 'ggo'),
  'oggggggggggggo', 'ogggxggggggggo', 'oggggggggxgggo', 'oggggggggggggo', 'oggggggggggggo', 'oooooooooooooo'];
const PAL_TUMBA_G = { o: '#2a2232', g: '#8a7e9a', x: '#5a5068', 1: '#2a2232' };
const ORBE_PX = ['...oooooo...', '..oLLmmmmo..', '.oLLmmmmmmo.', 'oLLmmmmmmmdo', 'oLmmmmmmmmdo', 'ommmmmmmmmdo', 'ommmmmmmmddo', 'ommmmmmmmddo', '.ommmmmmddo.', '.oddmmmdddo.', '..odddddoo..', '...oooooo...'];
const PAL_ORBE = { o: '#1e0f3a', L: '#f1e4ff', m: '#9a6fe0', d: '#5a3aa0' };
const PAL_ORBE_B = { o: '#1e0f3a', L: '#fff0ff', m: '#c58cff', d: '#7a4ac0' };

SKINS.pixel = skin({
  pixel: true, fonte: '"Press Start 2P", monospace', fontePlaca: '"Press Start 2P", monospace', fonteMini: '"Press Start 2P", monospace',
  nomes: { largada: ['Tela de Início', 'Início', 'à'], lapides: ['Cemitério 8-bit', 'Cemitério', 'ao'], encruzilhada: ['Bifurcação', 'Bifurcação', 'à'], caminhos: ['Os dois mundos', 'Mundos', 'aos'], portao: ['Portão do Castelo', 'Portão', 'ao'], salao: ['Castelo Assombrado', 'Castelo', 'ao'], ponte: ['Ponte de Blocos', 'Ponte', 'à'], moinho: ['Moinho Quadrado', 'Moinho', 'ao'], caldeirao: ['Caldeirão da Chefona', 'Caldeirão', 'ao'], fliper: ['Abóboras Saltitantes', 'Abóboras', 'às'], molas: ['Blocos-mola', 'Molas', 'aos'], plataformas: ['Plataformas Móveis', 'Plataformas', 'às'] },
  lados: ['o Brejo dos Zumbis', 'a Torre das Bruxas'], ladosCurtos: ['Brejo', 'Torre'], ladosPlaca: ['Brejo dos Zumbis', 'Torre das Bruxas'],
  bg: { largada: ['#1b1033', '#0a0618'], lapides: ['#24124a', '#0e0822'], encruzilhada: ['#152a4a', '#081226'], caminhos: ['#0f3a2a', '#061a12'], portao: ['#2a1650', '#100a24'], salao: ['#3a1240', '#16061a'], ponte: ['#1a2a4a', '#0a1022'], moinho: ['#401018', '#16060a'], caldeirao: ['#0f3a24', '#06180e'], teias: ['#202040', '#0c0c1c'], fliper: ['#4a2208', '#1a0c04'], molas: ['#3a1446', '#160822'], plataformas: ['#142a48', '#081224'] },
  epitafios: [['GAME', 'OVER'], ['META', 'BATIDA'], ['BOLETO', 'PAGO'], ['ACORDO', 'FECHADO'], ['1UP', ''], ['CONTINUE', '?']],
  txt: { abriu: () => 'START! Boa sorte, bichinhos.', explosao: a => `Feitiço roxo! ${a} voou longe`, gosma: a => `${a} ficou preso no slime`, mira: a => `A bruxa de 8 bits mirou ${a}...`, mao: a => `Um zumbi agarrou ${a}!`, caldPrimeiro: (a, N) => `${a} caiu no caldeirão da Chefona. Ele só ferve com ${N}`, atalho: a => `O caldeirão mandou ${a} por uma passagem secreta!` },
  cor: { placaT: ['#2a1a4a', '#8a6adf', '#ffe14d', '#5a4a7a'], chegada: ['#ffe14d', '#1a0e30', '#ffe14d', '#ff4d5e', '#5a4a7a'], placa: ['#1a0e30', '', '#ffe14d'], portal: ['#ff6fb5', '#5ff0c8'], zona: ['#4cd04c', '#c8ff96'], mancha: '#5cff5c', destaque: '#ffe14d', parede: ['#140c22', '#2a1a40'], longe: 'rgba(0,0,0,.4)' },
  segCores: { ferro: ['#120a20', '#6a5a9a', '#b8a8ff', 9], galho: ['#1a0e08', '#7a4a20', '#d08a40', 9], raiz: ['#0e1a08', '#3a7a20', '#7ad040', 9], muro: ['#120a20', '#5a4a7a', '#9a8aca', 11], ponte: ['#2a1408', '#c06a20', '#ffb050', 10], pedra: ['#120a20', '#6a6a8a', '#aaaacc', 9] },
  segExtra(c, s) {
    if (s.tipo !== 'ponte' && s.tipo !== 'muro') return;
    const L = Math.hypot(s.x2 - s.x1, s.y2 - s.y1), n = Math.floor(L / 10);
    c.fillStyle = 'rgba(0,0,0,.45)';
    for (let i = 1; i < n; i++) { const [x, y] = pontoEm(s, i / n); c.fillRect(Math.round(x) - 1, Math.round(y) - 4, 2, 8); }
  },
  caldTxt: 'FERVENDO', chegadaTxt: 'FIM DE FASE', esperando: 'Os bichinhos esperam o START.', bu: 'BU!',
  ceu(c, info) {
    estrelasPadrao(c, info, '#ffe9b0', true);
    const mx = cw - 90, my = 82 - Math.min(info.camY, 5000) * 0.004;
    brilho(c, () => luz(c, mx, my, 110, '#ff9a3c', 0.22));
    pinta(c, sprite(info.piscaLua ? 'luaPisca' : 'lua', ABOBORA_PX, info.piscaLua ? PAL_ABO : PAL_ABO_ACESA), mx, my, 6);
    const per = cw + 500, x = ((T * 34) % per) - 250, y = 150 + Math.sin(T * 0.8) * 26;
    pinta(c, sprite('chefona', BRUXA_PX, PAL_CHEFONA), x, y, 7, false);
    return 0;
  },
  longe(c, tipo, base, off, rs) {
    const bloco = (x, y, w, h) => c.fillRect(Math.round(x / 6) * 6, Math.round(y / 6) * 6, Math.round(w / 6) * 6, Math.round(h / 6) * 6);
    for (let x = 0; x < cw; x += 24) { const h = 30 + 24 * Math.abs(Math.sin(x * 0.013 + base * 0.002)); bloco(x, base - h, 24, 400); }
    if (tipo === 'salao' || tipo === 'portao') {
      const mx = cw * 0.58; bloco(mx - 120, base - 150, 240, 300); bloco(mx - 150, base - 210, 48, 360); bloco(mx + 102, base - 210, 48, 360); bloco(mx - 30, base - 260, 60, 360);
      for (const xx of [mx - 150, mx - 126, mx + 102, mx + 126, mx - 30, mx - 6, mx + 18]) bloco(xx, (xx > mx - 40 && xx < mx + 40 ? base - 278 : base - 228), 12, 18);
      c.fillStyle = `rgba(255,214,90,${0.3 + 0.15 * Math.sin(T * 6)})`; bloco(mx - 66, base - 90, 18, 24); bloco(mx + 48, base - 90, 18, 24); bloco(mx - 12, base - 210, 24, 30);
    } else if (tipo === 'caminhos' || tipo === 'encruzilhada' || tipo === 'lapides') {
      rs.slice(0, 8).forEach(([a, b]) => { const x = a * cw, h = 60 + b * 80; bloco(x - 6, base - h, 12, h); bloco(x - 24, base - h, 48, 18); bloco(x - 18, base - h - 18, 36, 18); bloco(x - 12, base - h - 36, 24, 18); });
    } else {
      rs.slice(0, 7).forEach(([a, b]) => { const x = a * cw, y = base - 40 - b * 30; bloco(x - 12, y, 24, 30); bloco(x - 6, y - 12, 12, 12); });
    }
  },
  largada(c) {
    c.fillStyle = 'rgba(255,255,255,.04)';
    for (let y = -100, row = 0; y < PORTAO_Y; y += 20, row++) for (let x = row % 2 ? 0 : -20; x < W; x += 40) c.fillRect(x + 1, y + 1, 38, 18);
    tituloLargada(c, '#ffe14d', '#b8a8ff');
    luzesLargada(c, (c2, vx, vy, lean) => {
      c2.fillStyle = '#6a5a9a'; c2.fillRect(vx - 4, vy + 2, 8, 14);
      const f = (Math.floor(T * 8 + vx) % 2) ? 0 : 1; c2.fillStyle = '#ff7a2b'; c2.fillRect(vx - 4 + lean * 4, vy - 6 - f * 2, 8, 8); c2.fillStyle = '#ffe14d'; c2.fillRect(vx - 2 + lean * 4, vy - 4 - f * 2, 4, 4);
      brilho(c2, () => luz(c2, vx, vy - 4, 56, '#ffb45a', 0.16));
    });
  },
  mao(c, m, alt, fecha, fase) {
    c.fillStyle = '#3a2414'; c.fillRect(m.x - 15, m.y + 3, 30, 7); c.fillStyle = '#6b4a30'; c.fillRect(m.x - 10, m.y + 1, 20, 3);
    if (alt <= 0.02) return;
    const cv = sprite('zumbi', ZUMBI, PAL_ZUMBI), px = 1.5, hh = cv.height * px;
    c.save(); c.beginPath(); c.rect(m.x - 30, m.y - 70, 60, 73); c.clip();
    pinta(c, cv, m.x + (fecha ? 0 : Math.round(Math.sin(T * 6 + fase))), m.y + 3 - hh * alt + hh / 2, px);
    c.restore();
  },
  fantasma(c, fx, fy, fase, alvo, i) {
    const d = alvo ? Math.hypot(alvo.x - fx, alvo.y - fy) : 99;
    if (d < 46 && T - fantasmaBu[i] > 2.4) fantasmaBu[i] = T;
    brilho(c, () => luz(c, fx, fy, 46, '#d2e6ff', 0.2));
    pinta(c, sprite('fant' + (Math.floor(T * 4 + fase) % 2), FANT_PX[Math.floor(T * 4 + fase) % 2], PAL_FANT), fx, fy, 2.8, alvo && alvo.x < fx);
    balaoBu(c, fx, fy, i, 'BU!', '#ffffff');
  },
  bruxa(c, wx, wy, dir, riso) {
    for (let i = 0; i < 4; i++) { c.fillStyle = `rgba(255,214,90,${0.6 - i * 0.14})`; c.fillRect(wx - dir * (30 + i * 8) - 2, wy + 6 + ((Math.floor(T * 10) + i) % 3) * 2, 3, 3); }
    pinta(c, sprite('bruxa', BRUXA_PX, PAL_BRUXA), wx, wy, 2, dir < 0);
    textoRiso(c, wx, wy, riso, 'hihihi', '#ff9fd0');
  },
  pocao(c, x, y, tipo) {
    const cor = tipo === 'gosma' ? '#5cff5c' : '#c58cff';
    brilho(c, () => luz(c, x, y, 16, cor, .5));
    c.fillStyle = '#120a20'; c.fillRect(x - 5, y - 3, 10, 9); c.fillStyle = cor; c.fillRect(x - 4, y - 2, 8, 7);
    c.fillStyle = '#dfe8ff'; c.fillRect(x - 2, y - 7, 4, 4); c.fillStyle = '#8a6a44'; c.fillRect(x - 2, y - 9, 4, 2); c.fillStyle = '#fff'; c.fillRect(x - 3, y - 1, 2, 2);
  },
  pegs(c, vis, dtR) {
    for (const p of pegs) {
      if (p.y < vis.y0 - 30 || p.y > vis.y1 + 30) continue;
      if (p.tipo === 'lapide') pinta(c, sprite('tumba', TUMBA_PX, PAL_TUMBA), p.x, p.y + 1, 2.1);
      else if (p.tipo === 'osso') pinta(c, sprite('caveira', CAVEIRA_PX, PAL_CAV), p.x, p.y, 2.1);
      else if (p.tipo === 'monte') { c.fillStyle = '#4a3020'; c.fillRect(p.x - 9, p.y - 2, 18, 8); c.fillStyle = '#6b4a30'; c.fillRect(p.x - 6, p.y - 5, 12, 4); }
      else if (p.tipo === 'lapideG') pinta(c, sprite('tumbaG', TUMBA_G, PAL_TUMBA_G), p.x, p.y + 1, 2.7);
      else if (p.tipo === 'cristal') {
        p.brilho = Math.max(0, p.brilho - dtR * 2.5);
        pinta(c, sprite(p.bumper ? 'orbeB' : 'orbe', ORBE_PX, p.bumper ? PAL_ORBE_B : PAL_ORBE), p.x, p.y, 2.3);
        if (p.bumper) { c.strokeStyle = `rgba(255,214,255,${0.5 + p.brilho * 0.5})`; c.lineWidth = 2 + p.brilho * 2; c.strokeRect(p.x - p.r - 3, p.y - p.r - 3, p.r * 2 + 6, p.r * 2 + 6); }
        if (p.brilho > 0 || p.bumper) brilho(c, () => luz(c, p.x, p.y, 34, '#b08af5', 0.1 + p.brilho * 0.3));
      } else if (p.tipo === 'abobora') {
        p.brilho = Math.max(pertoDeAlguem(p), p.brilho - dtR * 0.8);
        if (p.brilho > .1) brilho(c, () => luz(c, p.x, p.y, 34 + p.brilho * 20, '#ffaa3c', 0.1 + 0.2 * p.brilho));
        pinta(c, sprite(p.brilho > .5 ? 'aboA' : 'abo', ABOBORA_PX, p.brilho > .5 ? PAL_ABO_ACESA : PAL_ABO), p.x, p.y, 2.2);
      }
    }
  },
  ambiente(vis, dt) {
    if (Math.random() < dt * 5) solta(1, Math.random() * W, vis.y1, { v: 6, vy: -40, vida: 3, cor: ['#ff7a2b', '#ffe14d', '#b8a8ff'], tam: 1.6, forma: 'q', arr: .995 });
  },
});


/* ================= Naufrágio: fundo do mar ================= */
function raiosDeLuz(c, cor, n) {
  for (let i = 0; i < n; i++) {
    const x = ((i + 0.5) / n + Math.sin(T * 0.15 + i * 2.1) * 0.06) * cw, w = 40 + 30 * Math.sin(i * 3.3);
    const g = c.createLinearGradient(0, 0, 0, ch); g.addColorStop(0, rgba(cor, 0.12)); g.addColorStop(1, rgba(cor, 0));
    c.fillStyle = g; c.beginPath(); c.moveTo(x - w * .3, 0); c.lineTo(x + w * .3, 0); c.lineTo(x + w * 1.6 - 120, ch); c.lineTo(x - w * 1.6 - 120, ch); c.closePath(); c.fill();
  }
}
function peixe(c, x, y, s, dir, cor) { c.save(); c.translate(x, y); c.scale(s * dir, s); c.fillStyle = cor; elip(c, 0, 0, 10, 5); c.fill(); c.beginPath(); c.moveTo(-8, 0); c.lineTo(-15, -5); c.lineTo(-15, 5); c.closePath(); c.fill(); c.restore(); }
function tentaculo(c, x0, y0, h, curva, larg, cor, ventosa) {
  const n = 10; let px = x0, py = y0;
  for (let i = 1; i <= n; i++) {
    const f = i / n, x = x0 + Math.sin(f * 2.4 + curva) * 6 * f + (f > .75 ? (f - .75) * 4 * curva * 6 : 0), y = y0 - h * f;
    c.strokeStyle = cor; c.lineWidth = larg * (1 - f * .75); c.lineCap = 'round'; c.beginPath(); c.moveTo(px, py); c.lineTo(x, y); c.stroke();
    if (ventosa && i % 2 === 0 && i < n) { c.fillStyle = ventosa; circ(c, x + larg * .3, y, larg * .18 * (1 - f * .6)); c.fill(); }
    px = x; py = y;
  }
}
SKINS.mar = skin({
  nomes: { largada: ['Convés', 'Convés', 'ao'], lapides: ['Campo de Corais', 'Corais', 'ao'], encruzilhada: ['Bifurcação da Corrente', 'Corrente', 'à'], caminhos: ['Os dois caminhos', 'Caminhos', 'aos'], portao: ['Comporta do Navio', 'Comporta', 'à'], salao: ['Casco Assombrado', 'Casco', 'ao'], ponte: ['Tábuas Soltas', 'Tábuas', 'às'], moinho: ['Hélice do Navio', 'Hélice', 'à'], caldeirao: ['Concha Gigante', 'Concha', 'à'], teias: ['Floresta de Algas', 'Algas', 'à'], fliper: ['Jardim de Estrelas', 'Estrelas', 'ao'], correntes: ['Correnteza', 'Correnteza', 'à'] },
  lados: ['o Recife de Coral', 'a Gruta Escura'], ladosCurtos: ['Recife', 'Gruta'], ladosPlaca: ['Recife de Coral', 'Gruta Escura'],
  bg: { largada: ['#0e3a52', '#06202e'], lapides: ['#0c4a5e', '#052636'], encruzilhada: ['#0a3e58', '#041e30'], caminhos: ['#08465a', '#03202c'], portao: ['#0a3450', '#041a2a'], salao: ['#14304a', '#081624'], ponte: ['#0a2c44', '#04141f'], moinho: ['#0a2238', '#040e1a'], caldeirao: ['#102a40', '#050f1c'], teias: ['#0a3a32', '#041a16'], fliper: ['#0a1a34', '#040a16'], correntes: ['#0a5066', '#03222e'] },
  epitafios: [['ACORDO', 'À VISTA'], ['META', 'NO RUMO'], ['BOLETO', 'À DERIVA'], ['PARCELA', 'AFUNDADA'], ['JUROS', 'DE MAR'], ['SINAL', 'PERDIDO']],
  txt: {
    abriu: () => 'A escotilha abriu. Boa sorte, bichinhos.', explosao: a => `Bolha! ${a} voou longe`, gosma: a => `${a} levou um jato de tinta da lula`, mira: a => `A lula mirou ${a}...`, mao: a => `Um tentáculo agarrou ${a}!`,
    portaoEspera: n => `${n} chegou primeiro à comporta... e vai ter que esperar a turma`, portaoJuntou: k => `Juntaram ${k} bichinhos: a comporta abriu!`, portaoCansou: k => `A comporta cansou de esperar e abriu com ${k} ${k > 1 ? 'bichinhos' : 'bichinho'}`,
    janela: (a, l) => `${a} atravessou para ${l}`, gangorra: (n, l) => `A corrente mandou ${n} para ${l}`, caldPrimeiro: (a, N) => `${a} caiu primeiro na concha. Ela só abre com ${N}`,
    caldFerveu: (k, cheio) => cheio ? `A concha abriu! ${k} bichinhos saem em ordem sorteada` : `A concha abriu com ${k} ${k > 1 ? 'bichinhos' : 'bichinho'}`, atalho: a => `A concha mandou ${a} por um atalho!`, volta: a => `A concha devolveu ${a} lá para trás`,
  },
  caldTxt: 'NA CONCHA', chegadaTxt: 'Tesouro', esperando: 'Os bichinhos esperam a escotilha abrir.',
  cor: {
    placaT: ['#6a4a2a', '#3a2414', '#f6e7c8', '#4a3a2a'], chegada: ['#f6e7c8', '#0a2238', '#ffcf5a', '#3ec7c7', '#4a3a2a'], zona: ['#c2a46a', '#f0e0b0'], mancha: '#7a4ac0', portal: ['#7fd3ff', '#5ff0c8'],
    longe: 'rgba(0,12,24,.38)', destaque: '#ffcf5a', lider: '#ffcf5a', explosao: ['#e8fbff', '#9fe6ff', '#ffffff'], gosma: ['#3a2a5a', '#6a4a9a', '#1a1030'], anelExplosao: '#bff2ff', anelGosma: '#8a6aca',
    bumper: { cristal: ['#ffffff', '#e0f0ff'], abobora: ['#ffcf5a', '#ff8a5b'] }, chegadaConfete: ['#ffcf5a', '#ffe8a0', '#7fd3ff', '#ff8fb0'], engole: ['#bff2ff', '#ffffff'], cospe: ['#7fd3ff', '#ffffff', '#5ff0c8'],
    poeira: 'rgba(200,230,240,.5)', terra: ['#c2a46a', '#a08450', '#e0c890'], faisca: ['#e8fbff', '#ffffff', '#9fe6ff'], fumaca: ['rgba(200,240,255,.5)', 'rgba(150,200,220,.5)'],
    portao: ['#5a3a1e', '#8a6a3e', '#c8a060'], alcapao: ['#4a3a2a', '#c8a060'], pilar: ['#4a3a2a', '#6a5a4a'], chama: '#bff2ff', placa: ['#2a1c10', '', '#f6e7c8'], caldPlaca: ['#1a2a3a', '#7fd3ff', '#dff6ff'], parede: ['#0a1c28', '#14303e'],
  },
  segCores: { ferro: ['#2a1808', '#7a5030', '#c89060', 8], galho: ['#5a1a2a', '#e0607a', '#ffb0c0', 8], raiz: ['#0a2a14', '#3a8a4a', '#8ad09a', 8], muro: ['#0a1a24', '#3a5a6a', '#7a9aaa', 10], ponte: ['#2a1808', '#9a6a3a', '#d8a870', 9], pedra: ['#0a1a24', '#4a6a7a', '#8aaaba', 8] },
  segExtra(c, s) {
    const L = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
    if (s.tipo === 'galho') { for (const f of [0.2, 0.5, 0.8]) { const [x, y] = pontoEm(s, f); c.fillStyle = '#ff8fa8'; circ(c, x, y - 5, 3.2); c.fill(); circ(c, x + 4, y - 8, 2.2); c.fill(); } }
    else if (s.tipo === 'ponte') { const n = Math.floor(L / 18); c.fillStyle = '#3a2410'; for (let i = 1; i < n; i++) { const [x, y] = pontoEm(s, i / n); c.fillRect(x - .6, y - 4, 1.2, 8); circ(c, x + 3, y, .9); c.fill(); } }
    else if (s.tipo === 'muro') { c.fillStyle = 'rgba(230,220,200,.5)'; for (let y = s.y1 + 20; y < s.y2; y += 47) { circ(c, s.x1 + (y % 3) - 1, y, 1.6); c.fill(); } }
  },
  ceu(c, info) {
    raiosDeLuz(c, '#bfefff', 5);
    if (info.camY < 700) { c.strokeStyle = `rgba(200,240,255,${0.25 * (1 - info.camY / 700)})`; c.lineWidth = 2; c.beginPath(); for (let x = 0; x <= cw; x += 10) c.lineTo(x, 26 + Math.sin(x * .03 + T * 2) * 4); c.stroke(); }
    for (let i = 0; i < 6; i++) { const x = ((T * (18 + i * 3) + i * 220) % (cw + 200)) - 100, y = ch * (0.25 + i * 0.1) + Math.sin(T + i) * 8; peixe(c, i % 2 ? cw - x : x, y, 0.8, i % 2 ? -1 : 1, 'rgba(0,20,40,.35)'); }
    return 0;
  },
  longe(c, tipo, base, off, rs) {
    c.beginPath(); c.moveTo(0, base + 300); for (let x = 0; x <= cw; x += 30) c.lineTo(x, base - 10 - 30 * Math.abs(Math.sin(x * .011 + rs.length))); c.lineTo(cw, base + 300); c.closePath(); c.fill();
    rs.slice(0, 7).forEach(([a, b]) => { const x = a * cw, h = 60 + b * 90; c.lineWidth = 5; c.beginPath(); c.moveTo(x, base); c.quadraticCurveTo(x + Math.sin(T + a * 9) * 14, base - h / 2, x + Math.sin(T * 1.2 + a * 7) * 10, base - h); c.stroke(); });
    if (tipo === 'salao' || tipo === 'portao') { const mx = cw * 0.5; c.beginPath(); c.moveTo(mx - 220, base - 20); c.lineTo(mx + 180, base - 70); c.lineTo(mx + 230, base - 10); c.lineTo(mx - 200, base + 40); c.closePath(); c.fill(); c.fillRect(mx - 20, base - 230, 8, 180); c.fillRect(mx - 60, base - 200, 90, 6); c.fillStyle = `rgba(150,230,255,${0.12 + .06 * Math.sin(T * 2)})`; for (let k = 0; k < 5; k++) { circ(c, mx - 140 + k * 60, base - 20 - k * 8, 7); c.fill(); } }
    else if (tipo === 'fliper' || tipo === 'teias') { const x = ((T * 10) % (cw + 600)) - 300, y = base - 160; c.beginPath(); c.ellipse(x, y, 140, 34, -0.05, 0, Math.PI * 2); c.fill(); c.beginPath(); c.moveTo(x - 130, y); c.lineTo(x - 200, y - 40); c.lineTo(x - 190, y + 30); c.closePath(); c.fill(); }
    else if (tipo === 'moinho') { c.save(); c.translate(cw * 0.72, base - 120); c.rotate(T * 0.5); for (let k = 0; k < 3; k++) { c.rotate(Math.PI * 2 / 3); elip(c, 0, 50, 22, 50); c.fill(); } c.restore(); }
  },
  largada(c) {
    c.strokeStyle = 'rgba(255,220,170,.06)'; c.lineWidth = 1; for (let y = -100; y < PORTAO_Y; y += 22) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
    for (const x of [140, 280, 420]) { c.strokeStyle = '#8a6a3e'; c.lineWidth = 4; circ(c, x, 120, 22); c.stroke(); c.fillStyle = 'rgba(120,200,240,.12)'; circ(c, x, 120, 20); c.fill(); }
    tituloLargada(c, '#ffcf5a', '#9fd6e8');
    luzesLargada(c, (c2, vx, vy, lean) => {
      c2.fillStyle = '#5a3a1e'; c2.fillRect(vx - 4, vy - 10, 8, 3); c2.fillRect(vx - 4, vy + 8, 8, 3);
      c2.save(); c2.translate(vx, vy); c2.rotate(lean * .5); c2.fillStyle = 'rgba(200,240,255,.85)'; rr(c2, -3.5, -7, 7, 15, 2); c2.fill(); c2.restore();
      brilho(c2, () => luz(c2, vx, vy, 58, '#bff2ff', 0.18));
    });
  },
  mao(c, m, alt, fecha, fase) {
    c.fillStyle = '#c2a46a'; elip(c, m.x, m.y + 7, 14, 4.5); c.fill(); c.fillStyle = '#a08450'; elip(c, m.x, m.y + 6, 5, 2); c.fill();
    if (alt <= 0.02) return;
    tentaculo(c, m.x, m.y + 6, 30 * alt, (fecha ? 2.2 : 0.6) + Math.sin(T * 4 + fase) * .3, 8, '#b0508a', '#ffc0dc');
  },
  fantasma(c, fx, fy, fase, alvo, i) {
    const dx = alvo ? alvo.x - fx : 0, dy = alvo ? alvo.y - fy : 0, d = Math.hypot(dx, dy) || 1, lx = dx / d, ly = dy / d, perto = d < 62;
    if (d < 46 && T - fantasmaBu[i] > 2.4) fantasmaBu[i] = T;
    brilho(c, () => luz(c, fx, fy, 50, '#ff9fd0', 0.22));
    const pul = Math.sin(T * 3 + fase);
    c.strokeStyle = 'rgba(255,170,220,.55)'; c.lineWidth = 1.6;
    for (let k = 0; k < 5; k++) { const x0 = fx - 12 + k * 6; c.beginPath(); c.moveTo(x0, fy + 6); c.bezierCurveTo(x0 + Math.sin(T * 3 + k) * 6, fy + 16, x0 - Math.sin(T * 3 + k + 1) * 6, fy + 26, x0 + Math.sin(T * 2 + k) * 4, fy + 34); c.stroke(); }
    c.save(); c.translate(fx, fy); c.scale(1 + pul * .05, 1 - pul * .05);
    c.fillStyle = 'rgba(255,150,210,.62)'; c.beginPath(); c.moveTo(-18, 6); c.bezierCurveTo(-20, -20, 20, -20, 18, 6);
    for (let k = 0; k < 6; k++) c.quadraticCurveTo(18 - k * 6 - 3, 10, 18 - (k + 1) * 6, 6); c.closePath(); c.fill();
    c.fillStyle = 'rgba(255,230,245,.5)'; elip(c, -6, -8, 6, 3); c.fill();
    c.fillStyle = '#2a1030'; elip(c, -6, -1, 2.6, 3.4); c.fill(); elip(c, 6, -1, 2.6, 3.4); c.fill();
    c.fillStyle = '#fff'; circ(c, -6 + lx * 1.2, -2 + ly * 1.4, 1); c.fill(); circ(c, 6 + lx * 1.2, -2 + ly * 1.4, 1); c.fill();
    c.fillStyle = '#2a1030'; if (perto) { elip(c, 0, 5, 2.4, 3); c.fill(); } else { c.strokeStyle = '#2a1030'; c.lineWidth = 1; c.beginPath(); c.arc(0, 3, 2.4, 0.3, Math.PI - 0.3); c.stroke(); }
    c.restore();
    balaoBu(c, fx, fy, i, 'BLUB!', '#ffd0ea');
  },
  bruxa(c, wx, wy, dir, riso) {
    c.save(); c.translate(wx, wy); c.scale(dir, 1);
    for (let k = 0; k < 6; k++) { const yy = -6 + k * 2.4, w = Math.sin(T * 8 + k) * 3; c.strokeStyle = '#d0503a'; c.lineWidth = 2.4; c.lineCap = 'round'; c.beginPath(); c.moveTo(-8, yy); c.quadraticCurveTo(-20, yy + w, -32 - (k % 2) * 6, yy + w * 1.4); c.stroke(); }
    const g = c.createLinearGradient(0, -10, 0, 10); g.addColorStop(0, '#ff9a7a'); g.addColorStop(1, '#d0503a');
    c.fillStyle = g; c.beginPath(); c.moveTo(-10, -9); c.quadraticCurveTo(18, -12, 30, 0); c.quadraticCurveTo(18, 12, -10, 9); c.closePath(); c.fill();
    c.fillStyle = '#e06a50'; c.beginPath(); c.moveTo(22, -4); c.lineTo(32, -12); c.lineTo(28, 0); c.lineTo(32, 12); c.lineTo(22, 4); c.closePath(); c.fill();
    c.fillStyle = 'rgba(255,255,255,.5)'; for (const [x, y] of [[4, -4], [12, 3], [18, -2]]) { circ(c, x, y, 1.3); c.fill(); }
    c.fillStyle = '#fff'; circ(c, -4, -2, 4.2); c.fill(); c.fillStyle = '#1a1020'; circ(c, -3, -2, 2.2); c.fill(); c.fillStyle = '#fff'; circ(c, -2.4, -3, .8); c.fill();
    c.restore();
    textoRiso(c, wx, wy, riso, 'glub glub', '#bff2ff');
  },
  pocao(c, x, y, tipo) {
    if (tipo === 'gosma') { c.fillStyle = '#2a1840'; circ(c, x, y, 5.5); c.fill(); circ(c, x - 3, y + 4, 2.4); c.fill(); c.fillStyle = 'rgba(160,120,220,.6)'; circ(c, x - 1.6, y - 1.8, 1.4); c.fill(); }
    else { brilho(c, () => luz(c, x, y, 14, '#bff2ff', .4)); c.strokeStyle = 'rgba(220,250,255,.9)'; c.lineWidth = 1.4; circ(c, x, y, 5.5); c.stroke(); c.fillStyle = 'rgba(255,255,255,.8)'; circ(c, x - 2, y - 2, 1.4); c.fill(); }
  },
  caldeirao(c, dentro) {
    const cx = W / 2, top = CALD_Y, ab = 0.45 + 0.2 * Math.sin(T * 2.2) + Math.min(0.3, dentro.length * 0.03);
    brilho(c, () => luz(c, cx, top + 10, 150, '#ffe8f5', 0.18));
    c.fillStyle = '#3a1830'; elip(c, cx, top + 6, 86, 18); c.fill();
    almasBoiando(c, dentro, cx, top, 64);
    const g = c.createLinearGradient(0, top, 0, top + 90); g.addColorStop(0, '#ffd8c8'); g.addColorStop(1, '#c87a7a');
    c.fillStyle = g; c.beginPath(); c.moveTo(cx - 92, top + 6);
    for (let k = 0; k <= 12; k++) { const a = Math.PI - k / 12 * Math.PI; c.lineTo(cx + Math.cos(a) * 92, top + 6 + Math.sin(a) * 80 + (k % 2) * 4); }
    c.closePath(); c.fill();
    c.strokeStyle = 'rgba(140,60,70,.45)'; c.lineWidth = 1.4; for (let k = 1; k < 9; k++) { const a = Math.PI - k / 9 * Math.PI; c.beginPath(); c.moveTo(cx, top + 82); c.lineTo(cx + Math.cos(a) * 88, top + 8 + Math.sin(a) * 30); c.stroke(); }
    c.save(); c.translate(cx, top + 4); c.scale(1, -1);
    const g2 = c.createLinearGradient(0, 0, 0, 90); g2.addColorStop(0, '#ffe6da'); g2.addColorStop(1, '#d88a8a');
    c.fillStyle = g2; c.beginPath(); c.moveTo(-92, 26 * ab);
    for (let k = 0; k <= 12; k++) { const a = Math.PI - k / 12 * Math.PI; c.lineTo(Math.cos(a) * 92, 26 * ab + Math.sin(a) * 74 + (k % 2) * 4); }
    c.closePath(); c.fill();
    c.strokeStyle = 'rgba(140,60,70,.4)'; for (let k = 1; k < 9; k++) { const a = Math.PI - k / 9 * Math.PI; c.beginPath(); c.moveTo(0, 26 * ab + 70); c.lineTo(Math.cos(a) * 88, 26 * ab + 4 + Math.sin(a) * 26); c.stroke(); }
    c.restore();
    c.fillStyle = '#fff'; const pg = c.createRadialGradient(cx - 6, top + 40, 2, cx, top + 44, 16); pg.addColorStop(0, '#ffffff'); pg.addColorStop(1, '#d8c8f0'); c.fillStyle = pg; circ(c, cx, top + 44, 13); c.fill();
  },
  teia(c, w, presa) {
    for (let k = 0; k < 9; k++) {
      const x0 = w.x - w.r + k * w.r / 4, h = w.r * (1.4 + (k % 3) * .3), sway = Math.sin(T * 1.6 + k) * 10;
      let tx = x0 + sway, ty = w.y + w.r - h;
      if (presa) { const d = Math.hypot(presa.x - x0, presa.y - w.y); if (d < 70) { tx += (presa.x - tx) * .3; ty += (presa.y - ty) * .2; } }
      c.strokeStyle = k % 2 ? '#3a9a4a' : '#5ab85a'; c.lineWidth = 5; c.lineCap = 'round'; c.beginPath(); c.moveTo(x0, w.y + w.r); c.quadraticCurveTo(x0 - sway * .6, w.y + w.r - h * .5, tx, ty); c.stroke();
    }
    const cx = w.x + Math.sin(T * .8 + w.x) * w.r * .6, cy = w.y + w.r + 2;
    c.fillStyle = '#e0503a'; elip(c, cx, cy, 6, 4); c.fill(); for (const sg of [-1, 1]) { circ(c, cx + sg * 8, cy - 3, 2.6); c.fill(); }
    c.fillStyle = '#fff'; circ(c, cx - 2, cy - 4, 1.2); c.fill(); circ(c, cx + 2, cy - 4, 1.2); c.fill();
  },
  pegs(c, vis, dtR) {
    for (const p of pegs) {
      if (p.y < vis.y0 - 30 || p.y > vis.y1 + 30) continue;
      const h = hashStr(p.x + ',' + p.y) % 4;
      if (p.tipo === 'lapide') { const cor = ['#ff7a8a', '#ff9a5a', '#e070c0', '#ff8fa8'][h]; c.fillStyle = tom(cor, -.25); circ(c, p.x, p.y + 2, p.r); c.fill(); c.fillStyle = cor; circ(c, p.x - 2, p.y, p.r * .75); c.fill(); circ(c, p.x + 4, p.y - 3, p.r * .5); c.fill(); c.fillStyle = 'rgba(255,255,255,.5)'; for (const [x, y] of [[-3, -2], [1, 2], [4, -4]]) { circ(c, p.x + x, p.y + y, .9); c.fill(); } }
      else if (p.tipo === 'osso') { c.save(); c.translate(p.x, p.y); c.fillStyle = ['#f2d8c0', '#ffc8b0', '#e8d0f0', '#fff0d8'][h]; c.beginPath(); c.moveTo(0, 7); for (let k = 0; k <= 8; k++) { const a = Math.PI * (1.1 + k * .1); c.lineTo(Math.cos(a) * 9, 3 + Math.sin(a) * 10); } c.closePath(); c.fill(); c.strokeStyle = 'rgba(150,100,90,.5)'; c.lineWidth = .8; for (let k = 1; k < 8; k++) { const a = Math.PI * (1.1 + k * .1); c.beginPath(); c.moveTo(0, 7); c.lineTo(Math.cos(a) * 8, 3 + Math.sin(a) * 9); c.stroke(); } c.restore(); }
      else if (p.tipo === 'monte') { c.fillStyle = '#c2a46a'; elip(c, p.x, p.y + 3, 10, 4.5); c.fill(); c.fillStyle = '#7a6440'; elip(c, p.x, p.y + 2, 3, 1.4); c.fill(); }
      else if (p.tipo === 'lapideG') {
        c.fillStyle = '#c8a060'; circ(c, p.x, p.y, p.r); c.fill(); c.strokeStyle = '#7a5a2a'; c.lineWidth = 1.4; c.stroke();
        c.fillStyle = '#f6e7c8'; circ(c, p.x, p.y, p.r - 4); c.fill(); c.fillStyle = '#7a5a2a'; for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; circ(c, p.x + Math.cos(a) * (p.r - 2), p.y + Math.sin(a) * (p.r - 2), 1); c.fill(); }
        c.fillStyle = '#3a2a1a'; c.textAlign = 'center'; c.font = '600 4.6px "IBM Plex Mono", monospace'; c.fillText(p.txt[0], p.x, p.y - 1); c.fillText(p.txt[1], p.x, p.y + 5); c.textAlign = 'left';
      } else if (p.tipo === 'cristal') {
        p.brilho = Math.max(0, p.brilho - dtR * 2.5);
        c.fillStyle = '#d8a8a8'; c.beginPath(); c.moveTo(p.x - 13, p.y + 6); c.quadraticCurveTo(p.x, p.y + 22, p.x + 13, p.y + 6); c.closePath(); c.fill();
        const gg = c.createRadialGradient(p.x - 4, p.y - 5, 1, p.x, p.y, p.r); gg.addColorStop(0, '#ffffff'); gg.addColorStop(.6, p.bumper ? '#e8f4ff' : '#e8e0f0'); gg.addColorStop(1, '#a8a0c8');
        c.fillStyle = gg; circ(c, p.x, p.y, p.r - 1); c.fill();
        if (p.bumper) { c.strokeStyle = `rgba(160,240,255,${0.5 + p.brilho * 0.5})`; c.lineWidth = 2 + p.brilho * 2; circ(c, p.x, p.y, p.r + 1.5 + p.brilho * 3); c.stroke(); }
        if (p.brilho > 0 || p.bumper) brilho(c, () => luz(c, p.x, p.y, 34, '#bff2ff', 0.1 + p.brilho * 0.3));
      } else if (p.tipo === 'abobora') {
        p.brilho = Math.max(pertoDeAlguem(p), p.brilho - dtR * 0.8);
        if (p.brilho > .1) brilho(c, () => luz(c, p.x, p.y, 30 + p.brilho * 20, '#ffcf5a', 0.1 + 0.25 * p.brilho));
        c.fillStyle = p.brilho > .5 ? '#ffb05a' : '#ff8a5b'; estrela(c, p.x, p.y, p.r + 3, p.r * .45, 5, -Math.PI / 2 + Math.sin(T + p.x) * .1); c.fill();
        c.fillStyle = 'rgba(255,240,200,.6)'; for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + k * Math.PI * 2 / 5; circ(c, p.x + Math.cos(a) * 7, p.y + Math.sin(a) * 7, 1.1); c.fill(); }
        c.fillStyle = '#3a1a08'; circ(c, p.x - 2.4, p.y - 1, 1.1); c.fill(); circ(c, p.x + 2.4, p.y - 1, 1.1); c.fill(); c.strokeStyle = '#3a1a08'; c.lineWidth = .9; c.beginPath(); c.arc(p.x, p.y + .6, p.brilho > .5 ? 2.4 : 1.6, .3, Math.PI - .3); c.stroke();
      }
    }
  },
  spin(c, s, a, w) {
    if (s.tipo === 'gangorra') return gangorraPadrao(c, s, a, ['#8a5a30', 'rgba(255,220,170,.4)', '#4a3a2a', '#c8a060']);
    c.save(); c.translate(s.cx, s.cy); c.rotate(a);
    if (s.tipo === 'moinho') {
      c.fillStyle = '#6a4a20'; rr(c, -s.L, -4, s.L * 2, 8, 4); c.fill();
      for (const sg of [-1, 1]) { const g = c.createLinearGradient(0, -14, 0, 14); g.addColorStop(0, '#f0c070'); g.addColorStop(1, '#a87028'); c.fillStyle = g; c.beginPath(); c.ellipse(sg * s.L * .58, 0, s.L * .42, 13, sg * .12, 0, Math.PI * 2); c.fill(); c.strokeStyle = 'rgba(80,50,20,.5)'; c.lineWidth = 1; c.stroke(); }
      c.restore();
      if (s.off === 0) { c.fillStyle = '#c8a060'; circ(c, s.cx, s.cy, 14); c.fill(); c.fillStyle = '#7a5a2a'; circ(c, s.cx, s.cy, 6); c.fill(); }
      return;
    }
    rastroFoice(c, s, w);
    c.strokeStyle = '#3a3a44'; c.lineWidth = 5; c.lineCap = 'round'; c.beginPath(); c.moveTo(-s.L, 0); c.lineTo(s.L, 0); c.stroke();
    c.strokeStyle = '#7a7a88'; c.lineWidth = 1.6; for (let x = -s.L + 6; x < s.L - 4; x += 9) { elip(c, x, 0, 4, 2.4); c.stroke(); }
    for (const sg of [1, -1]) {
      c.save(); c.translate(sg * s.L, 0); c.rotate(sg > 0 ? Math.PI / 2 : -Math.PI / 2);
      c.strokeStyle = '#5a5a68'; c.lineWidth = 4; c.beginPath(); c.moveTo(0, -4); c.lineTo(0, 16); c.stroke();
      c.beginPath(); c.arc(0, 8, 11, 0.15, Math.PI - 0.15); c.stroke();
      c.fillStyle = '#5a5a68'; for (const sx of [-1, 1]) { c.beginPath(); c.moveTo(sx * 11, 10); c.lineTo(sx * 15, 4); c.lineTo(sx * 8, 7); c.closePath(); c.fill(); }
      c.strokeStyle = '#5a5a68'; c.lineWidth = 2.4; c.beginPath(); c.moveTo(-6, -1); c.lineTo(6, -1); c.stroke();
      c.restore();
    }
    c.fillStyle = '#2a2a34'; circ(c, 0, 0, 6); c.fill(); c.strokeStyle = '#9aa0b0'; c.lineWidth = 1.4; c.stroke();
    c.restore();
  },
  ambiente(vis, dt) {
    if (Math.random() < dt * 9) solta(1, Math.random() * W, vis.y1 + 10, { v: 6, vy: -70 - Math.random() * 40, vida: 5, cor: 'rgba(220,250,255,.7)', tam: 1.5 + Math.random() * 2.5, forma: 'b', arr: 1 });
  },
});

/* ================= Estação Cósmica: espaço ================= */
const NEBULOSAS = [[0.2, 0.3, '#ff6fb5'], [0.75, 0.55, '#5ff0f0'], [0.45, 0.85, '#8a55e0']];
function asteroide(c, x, y, r, sem, cor) {
  const rg = mulberry32(sem); c.fillStyle = cor; c.beginPath();
  for (let k = 0; k < 9; k++) { const a = k / 9 * Math.PI * 2, rr2 = r * (0.78 + rg() * 0.3); c.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2); }
  c.closePath(); c.fill();
  c.fillStyle = 'rgba(0,0,0,.25)'; circ(c, x + r * .25, y - r * .2, r * .25); c.fill(); circ(c, x - r * .3, y + r * .25, r * .16); c.fill();
  c.fillStyle = 'rgba(255,255,255,.18)'; circ(c, x - r * .35, y - r * .35, r * .2); c.fill();
}
SKINS.espaco = skin({
  nomes: { largada: ['Plataforma de Lançamento', 'Plataforma', 'à'], lapides: ['Cinturão de Asteroides', 'Asteroides', 'ao'], encruzilhada: ['Desvio Orbital', 'Desvio', 'ao'], caminhos: ['As duas órbitas', 'Órbitas', 'às'], portao: ['Eclusa', 'Eclusa', 'à'], salao: ['Sistema dos Planetas', 'Planetas', 'ao'], ponte: ['Trilhos de Luz', 'Trilhos', 'aos'], moinho: ['Estação Giratória', 'Estação', 'à'], caldeirao: ['Buraco de Minhoca', 'Buraco', 'ao'], teias: ['Nebulosa', 'Nebulosa', 'à'], fliper: ['Campo de Estrelas', 'Estrelas', 'ao'], orbita: ['Gravidade Zero', 'Gravidade zero', 'à'], plataformas: ['Satélites em Órbita', 'Satélites', 'aos'] },
  lados: ['o Anel de Saturno', 'a Rota dos Cometas'], ladosCurtos: ['Anel', 'Cometas'], ladosPlaca: ['Anel de Saturno', 'Rota dos Cometas'],
  bg: { largada: ['#0a0a1e', '#04040e'], lapides: ['#140a2a', '#06040f'], encruzilhada: ['#0a1430', '#040814'], caminhos: ['#1a0a2e', '#08040f'], portao: ['#0a1a2a', '#040a10'], salao: ['#200a30', '#0a0412'], ponte: ['#0a0a24', '#04040c'], moinho: ['#0a1a20', '#03080c'], caldeirao: ['#1a0830', '#060210'], teias: ['#2a0a2a', '#0c030c'], fliper: ['#141030', '#050410'], orbita: ['#1a0a3a', '#06021a'], plataformas: ['#0a1838', '#030816'] },
  epitafios: [['META', 'NA LUA'], ['BOLETO', 'ORBITAL'], ['ACORDO', 'ESTELAR'], ['PARCELA', 'PERDIDA'], ['JUROS', 'CÓSMICOS'], ['SINAL', 'FRACO']],
  txt: {
    abriu: () => 'Lançamento! Boa sorte, bichinhos.', explosao: a => `Meteoro! ${a} voou longe`, gosma: a => `${a} grudou na gosma alienígena`, mira: a => `O disco voador mirou ${a}...`, mao: a => `A garra robótica pegou ${a}!`,
    portaoEspera: n => `${n} chegou primeiro à eclusa... e vai ter que esperar a turma`, portaoJuntou: k => `Juntaram ${k} bichinhos: a eclusa abriu!`, portaoCansou: k => `A eclusa cansou de esperar e abriu com ${k} ${k > 1 ? 'bichinhos' : 'bichinho'}`,
    janela: (a, l) => `${a} mudou de órbita para ${l}`, gangorra: (n, l) => `O desvio mandou ${n} para ${l}`, caldPrimeiro: (a, N) => `${a} caiu primeiro no buraco de minhoca. Ele só abre com ${N}`,
    caldFerveu: (k, cheio) => cheio ? `O buraco de minhoca se abriu! ${k} bichinhos saem em ordem sorteada` : `O buraco de minhoca se abriu com ${k} ${k > 1 ? 'bichinhos' : 'bichinho'}`, atalho: a => `O buraco de minhoca mandou ${a} por um atalho!`, volta: a => `O buraco de minhoca devolveu ${a} lá para trás`,
  },
  caldTxt: 'EM ÓRBITA', chegadaTxt: 'Base Lunar', esperando: 'Contagem regressiva para o lançamento.',
  cor: {
    placaT: ['#14203a', '#5ff0f0', '#dff6ff', '#3a4a6a'], chegada: ['#dff6ff', '#0a0a1e', '#5ff0f0', '#ff6fb5', '#3a4a6a'], zona: ['#7cff5a', '#d0ffb0'], mancha: '#7cff5a', portal: ['#5ff0f0', '#ff6fb5'],
    longe: 'rgba(0,0,0,.42)', destaque: '#5ff0f0', lider: '#5ff0f0', explosao: ['#ffb347', '#ff6a2a', '#ffffff', '#ffe14d'], gosma: ['#7cff5a', '#3acc3a', '#d0ffb0'], anelExplosao: '#ffb347', anelGosma: '#7cff5a',
    bumper: { cristal: ['#ffffff', '#9fe6ff'], abobora: ['#ffe14d', '#ffffff'] }, chegadaConfete: ['#5ff0f0', '#ff6fb5', '#ffe14d', '#ffffff'], engole: ['#b08af5', '#5ff0f0'], cospe: ['#b08af5', '#5ff0f0', '#ffffff'],
    poeira: 'rgba(180,180,200,.5)', terra: ['#6a6a7a', '#4a4a5a', '#9a9aaa'], faisca: ['#9fe6ff', '#ffffff', '#5ff0f0'], fumaca: ['rgba(180,200,255,.5)', 'rgba(120,140,200,.5)'],
    portao: ['#2a3448', '#5a6a88', '#5ff0f0'], alcapao: ['#2a3448', '#5ff0f0'], pilar: ['#2a3448', '#4a5a78'], chama: '#5ff0f0', placa: ['#0a1428', '', '#dff6ff'], caldPlaca: ['#1a0a30', '#b08af5', '#e8d8ff'], parede: ['#0a0e1a', '#1a2236'],
  },
  segCores: { ferro: ['#12182a', '#5a6a88', '#a8b8d8', 8], galho: ['#0a1430', '#2a4a9a', '#7a9aff', 9], raiz: ['#2a2a34', '#7a7a8a', '#c0c0d0', 8], muro: ['#0e1424', '#3a4a68', '#7a8ab0', 11], ponte: ['#0a2a3a', '#2ad0e0', '#d0ffff', 7], pedra: ['#12182a', '#4a5a78', '#9aaaca', 8] },
  segExtra(c, s) {
    const L = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
    if (s.tipo === 'ponte') brilho(c, () => { c.strokeStyle = 'rgba(80,230,255,.22)'; c.lineWidth = 14; c.beginPath(); c.moveTo(s.x1, s.y1); c.lineTo(s.x2, s.y2); c.stroke(); });
    else if (s.tipo === 'galho') { const n = Math.floor(L / 10); c.strokeStyle = 'rgba(150,180,255,.5)'; c.lineWidth = .8; for (let i = 1; i < n; i++) { const [x, y] = pontoEm(s, i / n); c.beginPath(); c.moveTo(x, y - 4); c.lineTo(x, y + 4); c.stroke(); } }
    else if (s.tipo === 'muro') { for (let y = s.y1 + 30; y < s.y2; y += 60) { const on = Math.sin(T * 3 + y) > 0; c.fillStyle = on ? '#ff4d5e' : '#5a2030'; circ(c, s.x1, y, 1.8); c.fill(); } }
    else if (s.tipo === 'ferro') { const n = Math.floor(L / 20); c.fillStyle = '#c8d4f0'; for (let i = 1; i < n; i++) { const [x, y] = pontoEm(s, i / n); circ(c, x, y, 1.1); c.fill(); } }
  },
  ceu(c, info) {
    for (const [x, y, cor] of NEBULOSAS) { const nx = x * cw + Math.sin(T * .05 + x * 9) * 40, ny = ((y * ch - info.camY * .03) % (ch * 1.4) + ch * 1.4) % (ch * 1.4) - ch * .2; const g = c.createRadialGradient(nx, ny, 0, nx, ny, cw * .45); g.addColorStop(0, rgba(cor, .13)); g.addColorStop(1, rgba(cor, 0)); c.fillStyle = g; c.fillRect(0, 0, cw, ch); }
    estrelasPadrao(c, info, '#ffffff');
    const mx = cw - 90, my = 86 - Math.min(info.camY, 5000) * 0.004;
    const g = c.createRadialGradient(mx - 12, my - 12, 4, mx, my, 34); g.addColorStop(0, '#ffd9a0'); g.addColorStop(1, '#b0603a'); c.fillStyle = g; circ(c, mx, my, 32); c.fill();
    c.strokeStyle = 'rgba(255,220,170,.7)'; c.lineWidth = 3; c.beginPath(); c.ellipse(mx, my, 58, 12, -0.3, 0, Math.PI * 2); c.stroke();
    if (info.piscaLua) brilho(c, () => luz(c, mx, my, 80, '#ffe14d', .3));
    const ce = (T * 0.37) % 6; if (ce < 0.8) { const x = cw * (0.1 + (T * 0.13 % 0.7)) + ce * 300, y = 40 + ce * 120; c.strokeStyle = `rgba(255,255,255,${0.8 * (1 - ce / 0.8)})`; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x, y); c.lineTo(x - 50, y - 20); c.stroke(); }
    return 0;
  },
  longe(c, tipo, base, off, rs) {
    rs.slice(0, 5).forEach(([a, b, d], k) => { const x = a * cw, y = base - 120 - b * 200, r = 10 + d * 34; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); if (k % 2) { c.lineWidth = 3; c.beginPath(); c.ellipse(x, y, r * 1.7, r * .35, -.3, 0, Math.PI * 2); c.stroke(); } });
    if (tipo === 'moinho' || tipo === 'salao' || tipo === 'portao') { const x = cw * 0.68, y = base - 150; c.lineWidth = 10; c.beginPath(); c.arc(x, y, 90, 0, Math.PI * 2); c.stroke(); c.save(); c.translate(x, y); c.rotate(T * .1); for (let k = 0; k < 4; k++) { c.rotate(Math.PI / 2); c.fillRect(-4, 0, 8, 90); } c.restore(); circ(c, x, y, 18); c.fill(); }
    if (tipo === 'lapides' || tipo === 'fliper') rs.slice(5, 13).forEach(([a, b], k) => { c.beginPath(); c.arc(a * cw, base - 40 - b * 120, 4 + (k % 4) * 3, 0, Math.PI * 2); c.fill(); });
  },
  largada(c) {
    c.strokeStyle = 'rgba(140,180,255,.07)'; c.lineWidth = 1; for (let y = -100; y < PORTAO_Y; y += 40) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); } for (let x = 0; x < W; x += 70) { c.beginPath(); c.moveTo(x, -100); c.lineTo(x, PORTAO_Y); c.stroke(); }
    tituloLargada(c, '#5ff0f0', '#a8b8d8');
    luzesLargada(c, (c2, vx, vy) => {
      const verde = T >= 3, on = verde || Math.floor(T * 2) % 2 === 0, cor = verde ? '#7cff5a' : '#ff4d5e';
      c2.fillStyle = '#2a3448'; rr(c2, vx - 6, vy - 6, 12, 12, 3); c2.fill(); c2.fillStyle = on ? cor : '#3a2030'; circ(c2, vx, vy, 3.6); c2.fill();
      if (on) brilho(c2, () => luz(c2, vx, vy, 50, cor, 0.25));
    });
  },
  mao(c, m, alt, fecha, fase) {
    c.fillStyle = '#4a4a5a'; elip(c, m.x, m.y + 7, 14, 4.5); c.fill(); c.fillStyle = '#1a1a24'; elip(c, m.x, m.y + 6.5, 9, 2.6); c.fill();
    if (alt <= 0.02) return;
    const h = 22 * alt;
    c.save(); c.translate(m.x, m.y + 6); c.rotate(Math.sin(T * 3 + fase) * 0.1);
    c.fillStyle = '#8a92a8'; c.fillRect(-2.6, -h, 5.2, h); c.fillStyle = '#5a6278'; for (let y = -h + 4; y < 0; y += 6) c.fillRect(-3.2, y, 6.4, 1.6);
    c.fillStyle = '#c0c8dc'; circ(c, 0, -h, 3.6); c.fill(); c.fillStyle = '#ff4d5e'; circ(c, 0, -h, 1.4); c.fill();
    const ab = fecha ? 0.15 : 0.6;
    c.strokeStyle = '#c0c8dc'; c.lineWidth = 2.4; c.lineCap = 'round';
    for (const sg of [-1, 1]) { c.beginPath(); c.moveTo(0, -h); c.lineTo(sg * Math.sin(ab) * 8, -h - Math.cos(ab) * 8); c.lineTo(sg * Math.sin(ab) * 4, -h - 12); c.stroke(); }
    c.restore();
  },
  fantasma(c, fx, fy, fase, alvo, i) {
    const dx = alvo ? alvo.x - fx : 0, dy = alvo ? alvo.y - fy : 0, d = Math.hypot(dx, dy) || 1, lx = dx / d, ly = dy / d, perto = d < 62;
    if (d < 46 && T - fantasmaBu[i] > 2.4) fantasmaBu[i] = T;
    brilho(c, () => luz(c, fx, fy, 48, '#7cff5a', 0.18));
    const bob = Math.sin(T * 3 + fase) * 2;
    c.save(); c.translate(fx, fy + bob);
    c.strokeStyle = '#5ac83a'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(0, -16); c.quadraticCurveTo(4, -22, 2 + Math.sin(T * 4) * 2, -26); c.stroke();
    c.fillStyle = perto ? '#ff6fb5' : '#ffe14d'; circ(c, 2 + Math.sin(T * 4) * 2, -27, 2.6); c.fill();
    const g = c.createRadialGradient(-5, -6, 2, 0, 0, 20); g.addColorStop(0, '#c8ff9a'); g.addColorStop(1, '#3a9a2a');
    c.fillStyle = g; c.beginPath(); c.moveTo(-16, 8); c.bezierCurveTo(-18, -20, 18, -20, 16, 8); c.quadraticCurveTo(10, 14, 6, 8); c.quadraticCurveTo(0, 14, -6, 8); c.quadraticCurveTo(-10, 14, -16, 8); c.closePath(); c.fill();
    c.fillStyle = '#fff'; elip(c, 0, -3, 8, 8); c.fill(); c.fillStyle = '#1a1020'; circ(c, lx * 3.4, -3 + ly * 3.4, perto ? 2.2 : 3.6); c.fill(); c.fillStyle = '#fff'; circ(c, lx * 3.4 - 1.2, -4.4 + ly * 3.4, 1); c.fill();
    c.restore();
    balaoBu(c, fx, fy, i, 'ZAP!', '#c8ff9a');
  },
  bruxa(c, wx, wy, dir, riso) {
    const g = c.createLinearGradient(wx, wy + 6, wx, wy + 70); g.addColorStop(0, 'rgba(180,255,200,.22)'); g.addColorStop(1, 'rgba(180,255,200,0)');
    c.fillStyle = g; c.beginPath(); c.moveTo(wx - 10, wy + 6); c.lineTo(wx + 10, wy + 6); c.lineTo(wx + 30, wy + 70); c.lineTo(wx - 30, wy + 70); c.closePath(); c.fill();
    c.save(); c.translate(wx, wy); c.rotate(dir * 0.08);
    c.fillStyle = 'rgba(160,230,255,.45)'; c.beginPath(); c.arc(0, -4, 11, Math.PI, 0); c.fill();
    c.fillStyle = '#7cff5a'; circ(c, 0, -6, 4.6); c.fill(); c.fillStyle = '#1a1020'; elip(c, -1.8, -6.6, 1.2, 1.8); c.fill(); elip(c, 1.8, -6.6, 1.2, 1.8); c.fill();
    const gs = c.createLinearGradient(0, -6, 0, 8); gs.addColorStop(0, '#d8deec'); gs.addColorStop(1, '#6a7288'); c.fillStyle = gs; elip(c, 0, 0, 30, 7.5); c.fill();
    c.fillStyle = '#4a5268'; elip(c, 0, 3, 16, 3.4); c.fill();
    for (let k = 0; k < 7; k++) { const x = -24 + k * 8, on = Math.floor(T * 6 + k) % 3 === 0; c.fillStyle = on ? ['#ff6fb5', '#ffe14d', '#5ff0f0'][k % 3] : '#3a4258'; circ(c, x, 0.5, 1.8); c.fill(); }
    c.restore();
    textoRiso(c, wx, wy, riso, 'bip bip', '#c8ff9a');
  },
  pocao(c, x, y, tipo) {
    if (tipo === 'gosma') { brilho(c, () => luz(c, x, y, 14, '#7cff5a', .5)); c.fillStyle = '#7cff5a'; circ(c, x, y, 5); c.fill(); c.fillStyle = '#d0ffb0'; circ(c, x - 1.6, y - 1.6, 1.6); c.fill(); }
    else { const g = c.createLinearGradient(x, y - 22, x, y); g.addColorStop(0, 'rgba(255,120,40,0)'); g.addColorStop(1, 'rgba(255,200,80,.85)'); c.fillStyle = g; c.beginPath(); c.moveTo(x - 4, y); c.lineTo(x + 4, y); c.lineTo(x, y - 24); c.closePath(); c.fill(); asteroide(c, x, y, 5.5, 7, '#8a6a5a'); }
  },
  caldeirao(c, dentro) {
    const cx = W / 2, cy = CALD_Y + 40;
    brilho(c, () => { luz(c, cx, cy, 170, '#8a55e0', .28); luz(c, cx, cy, 90, '#5ff0f0', .2); });
    for (let k = 0; k < 7; k++) { c.strokeStyle = k % 2 ? 'rgba(95,240,240,.55)' : 'rgba(176,138,245,.65)'; c.lineWidth = 3 - k * .3; const r = 96 - k * 12; c.beginPath(); c.ellipse(cx, cy, r, r * .5, 0, T * (1 + k * .3) + k, T * (1 + k * .3) + k + 4.2); c.stroke(); }
    c.fillStyle = '#05020a'; elip(c, cx, cy, 22, 11); c.fill();
    dentro.forEach((o, i) => { const a = T * 2.4 + i * 2.39, r = 30 + (i * 13) % 50; desenhaAlma(c, cx + Math.cos(a) * r, cy + Math.sin(a) * r * .5, 7, o.est, { expr: 'tonta', t: T + i, inc: a }); });
    c.strokeStyle = 'rgba(220,240,255,.5)'; c.lineWidth = 2; elip(c, cx, CALD_Y + 2, 84, 8); c.stroke();
  },
  teia(c, w, presa) {
    const px = presa ? (presa.x - w.x) * .2 : 0, py = presa ? (presa.y - w.y) * .2 : 0;
    const g = c.createRadialGradient(w.x + px, w.y + py, 4, w.x, w.y, w.r * 1.15); g.addColorStop(0, 'rgba(255,111,181,.32)'); g.addColorStop(.6, 'rgba(138,85,224,.22)'); g.addColorStop(1, 'rgba(138,85,224,0)');
    c.fillStyle = g; circ(c, w.x, w.y, w.r * 1.15); c.fill();
    for (let k = 0; k < 7; k++) { const a = k * 2.4 + T * .3, r = w.r * (0.3 + (k % 3) * .25); c.fillStyle = `rgba(255,255,255,${0.4 + 0.4 * Math.sin(T * 3 + k)})`; circ(c, w.x + Math.cos(a) * r, w.y + Math.sin(a) * r, 1.1); c.fill(); }
  },
  pegs(c, vis, dtR) {
    for (const p of pegs) {
      if (p.y < vis.y0 - 30 || p.y > vis.y1 + 30) continue;
      const h = hashStr(p.x + ',' + p.y);
      if (p.tipo === 'lapide' || p.tipo === 'osso') asteroide(c, p.x, p.y, p.r + 1, h, ['#6a6478', '#7a6a62', '#5a5a6a', '#807888'][h % 4]);
      else if (p.tipo === 'monte') { c.strokeStyle = '#5a5a6a'; c.lineWidth = 2; elip(c, p.x, p.y + 3, 9, 3.5); c.stroke(); c.fillStyle = '#1a1a24'; elip(c, p.x, p.y + 3, 7, 2.4); c.fill(); }
      else if (p.tipo === 'lapideG') {
        const g = c.createRadialGradient(p.x - 6, p.y - 6, 2, p.x, p.y, p.r); g.addColorStop(0, '#9fe6ff'); g.addColorStop(1, '#2a5a9a'); c.fillStyle = g; circ(c, p.x, p.y, p.r); c.fill();
        c.fillStyle = 'rgba(10,20,40,.55)'; c.fillRect(p.x - p.r + 1, p.y - 5, p.r * 2 - 2, 12);
        c.fillStyle = '#dff6ff'; c.textAlign = 'center'; c.font = '600 4.4px "IBM Plex Mono", monospace'; c.fillText(p.txt[0], p.x, p.y); c.fillText(p.txt[1], p.x, p.y + 5); c.textAlign = 'left';
      } else if (p.tipo === 'cristal') {
        p.brilho = Math.max(0, p.brilho - dtR * 2.5);
        const hue = ['#ff6fb5', '#5ff0f0', '#ffb347', '#a77bf3', '#7cff5a'][h % 5];
        const g = c.createRadialGradient(p.x - 4, p.y - 5, 1, p.x, p.y, p.r); g.addColorStop(0, tom(hue, .5)); g.addColorStop(1, tom(hue, -.45)); c.fillStyle = g; circ(c, p.x, p.y, p.r); c.fill();
        c.strokeStyle = rgba(tom(hue, .3), .7); c.lineWidth = 1.6; c.beginPath(); c.ellipse(p.x, p.y, p.r * 1.6, p.r * .38, -.35, 0, Math.PI * 2); c.stroke();
        if (p.bumper) { c.strokeStyle = `rgba(200,250,255,${0.5 + p.brilho * 0.5})`; c.lineWidth = 2 + p.brilho * 2; circ(c, p.x, p.y, p.r + 2 + p.brilho * 3); c.stroke(); }
        if (p.brilho > 0 || p.bumper) brilho(c, () => luz(c, p.x, p.y, 34, hue, 0.1 + p.brilho * 0.3));
      } else if (p.tipo === 'abobora') {
        p.brilho = Math.max(pertoDeAlguem(p), p.brilho - dtR * 0.8);
        brilho(c, () => luz(c, p.x, p.y, 26 + p.brilho * 24, '#ffe14d', 0.14 + 0.25 * p.brilho));
        c.fillStyle = p.brilho > .5 ? '#fff6b0' : '#ffd84d'; estrela(c, p.x, p.y, p.r + 3, p.r * .5, 5, -Math.PI / 2 + T * .5 + p.x); c.fill();
        c.fillStyle = '#5a3a08'; circ(c, p.x - 2.6, p.y - 1, 1.1); c.fill(); circ(c, p.x + 2.6, p.y - 1, 1.1); c.fill(); c.strokeStyle = '#5a3a08'; c.lineWidth = .9; c.beginPath(); c.arc(p.x, p.y + .8, p.brilho > .5 ? 2.6 : 1.6, .3, Math.PI - .3); c.stroke();
      }
    }
  },
  spin(c, s, a, w) {
    if (s.tipo === 'gangorra') return gangorraPadrao(c, s, a, ['#5a6a88', 'rgba(200,220,255,.5)', '#2a3448', '#5ff0f0']);
    c.save(); c.translate(s.cx, s.cy); c.rotate(a);
    const trelica = L => { c.strokeStyle = '#8a96b4'; c.lineWidth = 2; c.beginPath(); c.moveTo(-L, -4); c.lineTo(L, -4); c.moveTo(-L, 4); c.lineTo(L, 4); for (let x = -L; x < L; x += 10) { c.moveTo(x, -4); c.lineTo(x + 5, 4); c.lineTo(x + 10, -4); } c.stroke(); };
    if (s.tipo === 'moinho') {
      trelica(s.L - 16);
      for (const sg of [-1, 1]) { c.fillStyle = '#c8d0e4'; rr(c, sg * s.L - 18, -10, 36, 20, 6); c.fill(); c.fillStyle = '#5ff0f0'; for (let k = 0; k < 3; k++) { circ(c, sg * s.L - 9 + k * 9, 0, 2.2); c.fill(); } }
      c.restore();
      if (s.off === 0) { brilho(c, () => luz(c, s.cx, s.cy, 40, '#5ff0f0', .35)); c.fillStyle = '#2a3448'; circ(c, s.cx, s.cy, 14); c.fill(); c.strokeStyle = '#5ff0f0'; c.lineWidth = 2; c.stroke(); }
      return;
    }
    rastroFoice(c, s, w);
    trelica(s.L - 4);
    for (const sg of [-1, 1]) { c.fillStyle = '#2a4a9a'; c.fillRect(sg * s.L - 10, -15, 20, 30); c.strokeStyle = '#9fb8ff'; c.lineWidth = .8; c.strokeRect(sg * s.L - 10, -15, 20, 30); c.beginPath(); c.moveTo(sg * s.L, -15); c.lineTo(sg * s.L, 15); c.moveTo(sg * s.L - 10, 0); c.lineTo(sg * s.L + 10, 0); c.stroke(); }
    c.fillStyle = '#c8d0e4'; circ(c, 0, 0, 7); c.fill(); c.fillStyle = '#ff4d5e'; circ(c, 0, 0, 2.4); c.fill();
    c.restore();
  },
  ambiente(vis, dt) {
    if (Math.random() < dt * 6) solta(1, Math.random() * W, vis.y0 + Math.random() * (vis.y1 - vis.y0), { v: 4, vida: 2.5, cor: ['#ffffff', '#9fe6ff', '#ff9fd0'], tam: 1, luz: true, arr: 1 });
  },
});


/* ================= Templo Perdido: selva ================= */
function folha(c, x, y, a, L, cor) { c.save(); c.translate(x, y); c.rotate(a); c.fillStyle = cor; c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(L * .5, -L * .35, L, 0); c.quadraticCurveTo(L * .5, L * .35, 0, 0); c.fill(); c.restore(); }
SKINS.templo = skin({
  nomes: { largada: ['Entrada do Templo', 'Entrada', 'à'], lapides: ['Escadaria de Pedra', 'Escadaria', 'à'], encruzilhada: ['Bifurcação do Rio', 'Bifurcação', 'à'], caminhos: ['Os dois caminhos', 'Caminhos', 'aos'], portao: ['Porta de Pedra', 'Porta', 'à'], salao: ['Câmara dos Ídolos', 'Câmara', 'à'], ponte: ['Ponte de Corda', 'Ponte', 'à'], moinho: ['Roda d’Água', 'Roda', 'à'], caldeirao: ['Poço do Ídolo', 'Poço', 'ao'], teias: ['Cipoal', 'Cipoal', 'ao'], fliper: ['Pátio dos Totens', 'Totens', 'ao'], esteiras: ['Correnteza do Rio', 'Rio', 'à'], pendulos: ['Lâminas do Templo', 'Lâminas', 'às'] },
  lados: ['a Margem do Rio', 'a Trilha dos Macacos'], ladosCurtos: ['Rio', 'Macacos'], ladosPlaca: ['Margem do Rio', 'Trilha dos Macacos'],
  bg: { largada: ['#1a2a1e', '#0a140c'], lapides: ['#1a3a22', '#0a1a0e'], encruzilhada: ['#143a2a', '#081a12'], caminhos: ['#0e4030', '#041a12'], portao: ['#2a2a1a', '#12120a'], salao: ['#2a1e10', '#120c06'], ponte: ['#163a26', '#081a10'], moinho: ['#0e3a3a', '#041a1a'], caldeirao: ['#2a1a0e', '#120a04'], teias: ['#1a3a1a', '#0a1a0a'], fliper: ['#3a2a0a', '#1a1004'], esteiras: ['#0e3a40', '#041a1e'], pendulos: ['#2a2412', '#121006'] },
  epitafios: [['ACORDO', 'ANTIGO'], ['META', 'SAGRADA'], ['BOLETO', 'PERDIDO'], ['PARCELA', 'MALDITA'], ['JUROS', 'ETERNOS'], ['CPF', 'EM RUÍNA']],
  txt: {
    abriu: () => 'A porta do templo abriu. Boa sorte, bichinhos.', explosao: a => `Coco! ${a} voou longe`, gosma: a => `${a} atolou na lama`, mira: a => `A arara mirou ${a}...`, mao: a => `Uma planta carnívora abocanhou ${a}!`,
    portaoEspera: n => `${n} chegou primeiro à porta de pedra... e vai ter que esperar a turma`, portaoJuntou: k => `Juntaram ${k} bichinhos: a porta de pedra abriu!`, portaoCansou: k => `A porta de pedra cansou de esperar e abriu com ${k} ${k > 1 ? 'bichinhos' : 'bichinho'}`,
    portaoRitmo: () => 'A porta de pedra abre sozinha a cada 5 segundos. Não espera ninguém.',
    janela: (a, l) => `${a} pulou para ${l}`, gangorra: (n, l) => `O tronco mandou ${n} para ${l}`, caldPrimeiro: (a, N) => `${a} caiu primeiro no poço do ídolo. Ele só transborda com ${N}`,
    caldFerveu: (k, cheio) => cheio ? `O poço transbordou! ${k} bichinhos saem em ordem sorteada` : `O poço transbordou com ${k} ${k > 1 ? 'bichinhos' : 'bichinho'}`, atalho: a => `O ídolo mandou ${a} por um atalho!`, volta: a => `O ídolo devolveu ${a} lá para trás`,
  },
  caldTxt: 'NO POÇO', chegadaTxt: 'Tesouro do Templo', esperando: 'Os bichinhos esperam a porta do templo abrir.',
  cor: {
    placaT: ['#5a4a2a', '#3a2a14', '#f2e2b0', '#4a3a20'], chegada: ['#f2d26a', '#2a1e0a', '#f2d26a', '#3ab07a', '#4a3a20'], zona: ['#b08a4a', '#e8d0a0'], mancha: '#8a6a3a', portal: ['#5ae0a0', '#f2d26a'],
    longe: 'rgba(0,10,4,.42)', destaque: '#f2d26a', lider: '#f2d26a', explosao: ['#8a5a2a', '#c8a060', '#f2e2b0'], gosma: ['#6a4a2a', '#8a6a3a', '#4a3018'], anelExplosao: '#f2d26a', anelGosma: '#a07a4a',
    bumper: { cristal: ['#bfffe0', '#5ae0a0'], abobora: ['#fff0a0', '#f2d26a'] }, chegadaConfete: ['#f2d26a', '#5ae0a0', '#ff6a4a', '#ffffff'], engole: ['#f2d26a', '#ffffff'], cospe: ['#f2d26a', '#5ae0a0', '#ffffff'],
    poeira: 'rgba(200,180,140,.5)', terra: ['#5a4020', '#3a2a14', '#7a5a30'], faisca: ['#fff0c0', '#f2d26a', '#ffffff'], fumaca: ['rgba(200,180,140,.5)', 'rgba(150,130,100,.5)'],
    portao: ['#5a5040', '#8a7a60', '#c8b080'], alcapao: ['#4a4030', '#c8b080'], pilar: ['#5a5040', '#7a6a50'], chama: '#ffb347', placa: ['#2a2014', '', '#f2e2b0'], caldPlaca: ['#2a2014', '#f2d26a', '#fff0c0'], parede: ['#141a10', '#262e1e'],
  },
  segCores: { ferro: ['#2a3a14', '#8ab040', '#d0e890', 8], galho: ['#2a1a0c', '#6a4a28', '#a88050', 9], raiz: ['#1a1008', '#5a3a1a', '#8a6a40', 9], muro: ['#1a1a10', '#6a6a50', '#a8a888', 11], ponte: ['#2a1a08', '#9a7040', '#d8b070', 8], pedra: ['#1a1a10', '#7a7a60', '#b0b098', 8] },
  segExtra(c, s) {
    const L = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
    if (s.tipo === 'ferro') { const n = Math.floor(L / 22); c.strokeStyle = '#4a6a1a'; c.lineWidth = 2; for (let i = 1; i < n; i++) { const [x, y] = pontoEm(s, i / n); c.beginPath(); c.moveTo(x, y - 4); c.lineTo(x, y + 4); c.stroke(); } }
    else if (s.tipo === 'galho') { for (const f of [0.15, 0.45, 0.8]) { const [x, y] = pontoEm(s, f); folha(c, x, y - 2, -1.2 + f, 14, '#3a8a3a'); folha(c, x, y + 2, 1 + f, 11, '#2a6a2a'); } }
    else if (s.tipo === 'ponte') { c.strokeStyle = '#c8a870'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(s.x1, s.y1 - 8); c.quadraticCurveTo((s.x1 + s.x2) / 2, (s.y1 + s.y2) / 2 - 3, s.x2, s.y2 - 8); c.stroke(); const n = Math.floor(L / 12); c.strokeStyle = '#5a3a18'; c.lineWidth = 1; for (let i = 1; i < n; i++) { const [x, y] = pontoEm(s, i / n); c.beginPath(); c.moveTo(x, y - 4); c.lineTo(x, y + 4); c.stroke(); } }
    else if (s.tipo === 'muro') { c.fillStyle = 'rgba(30,30,20,.55)'; for (let y = s.y1 + 24; y < s.y2; y += 44) { c.fillRect(s.x1 - 2.5, y, 5, 2); c.fillRect(s.x1 - 1, y - 3, 2, 8); } c.fillStyle = 'rgba(90,150,60,.6)'; for (let y = s.y1 + 60; y < s.y2; y += 110) { elip(c, s.x1 + 2, y, 3, 7); c.fill(); } }
  },
  ceu(c, info) {
    estrelasPadrao(c, info, '#fff0c8');
    luaPadrao(c, info, '#f2e2b0');
    for (let k = 0; k < 3; k++) { c.fillStyle = 'rgba(160,220,170,.05)'; const y = ch * (0.45 + k * 0.17) + Math.sin(T * .3 + k) * 10; c.fillRect(0, y, cw, 24); }
    return 0;
  },
  longe(c, tipo, base, off, rs) {
    if (tipo === 'salao' || tipo === 'portao' || tipo === 'caldeirao') {
      const mx = cw * 0.6; for (let k = 0; k < 6; k++) c.fillRect(mx - 170 + k * 26, base - 30 - k * 34, 340 - k * 52, 40);
      c.fillRect(mx - 22, base - 250, 44, 50); c.fillStyle = `rgba(255,180,80,${0.25 + .1 * Math.sin(T * 4)})`; c.fillRect(mx - 9, base - 236, 18, 30); c.fillStyle = SK.cor.longe;
    }
    if (tipo === 'moinho' || tipo === 'ponte') { c.fillRect(cw * 0.2 - 60, base - 260, 120, 300); c.fillStyle = 'rgba(200,240,255,.08)'; for (let k = 0; k < 5; k++) c.fillRect(cw * 0.2 - 30 + k * 13, base - 250 + ((T * 90 + k * 40) % 40), 6, 280); c.fillStyle = SK.cor.longe; }
    rs.forEach(([a, b], k) => { const x = a * cw, r = 30 + b * 40; circ(c, x, base - 20 - (k % 3) * 18, r); c.fill(); });
    c.fillRect(0, base, cw, 400);
    rs.slice(0, 4).forEach(([a, b]) => { const x = a * cw, h = 120 + b * 80; c.fillRect(x - 3, base - h, 6, h); for (let k = 0; k < 5; k++) folha(c, x, base - h, -2.6 + k * 0.55 + Math.sin(T + a * 9) * .05, 46, SK.cor.longe); });
  },
  largada(c) {
    c.strokeStyle = 'rgba(220,210,170,.06)'; c.lineWidth = 1;
    for (let y = -100, row = 0; y < PORTAO_Y; y += 30, row++) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); for (let x = row % 2 ? 35 : 0; x < W; x += 70) { c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + 30); c.stroke(); } }
    tituloLargada(c, '#f2d26a', '#bfd8a8');
    luzesLargada(c, (c2, vx, vy, lean) => {
      c2.fillStyle = '#5a3a1a'; c2.fillRect(vx - 2, vy, 4, 18); c2.fillStyle = '#7a5a2a'; c2.fillRect(vx - 4, vy - 2, 8, 4);
      c2.save(); c2.translate(vx, vy - 2); c2.rotate(lean + Math.sin(T * 13 + vx) * 0.1);
      const fg = c2.createRadialGradient(0, -6, 0, 0, -6, 9); fg.addColorStop(0, '#fff6c8'); fg.addColorStop(.5, '#ff8a2b'); fg.addColorStop(1, 'rgba(255,80,20,0)'); c2.fillStyle = fg; elip(c2, 0, -7, 5, 9); c2.fill(); c2.restore();
      brilho(c2, () => luz(c2, vx, vy - 6, 64, '#ff9a3c', 0.18));
    });
  },
  mao(c, m, alt, fecha, fase) {
    folha(c, m.x, m.y + 6, Math.PI + .3, 14, '#2a6a2a'); folha(c, m.x, m.y + 6, -.3, 14, '#3a8a3a');
    if (alt <= 0.02) return;
    const h = 20 * alt;
    c.save(); c.translate(m.x, m.y + 6); c.rotate(Math.sin(T * 4 + fase) * 0.15);
    c.strokeStyle = '#3a8a3a'; c.lineWidth = 3; c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(3, -h * .5, 0, -h); c.stroke();
    const ab = fecha ? 0.05 : 0.55 + Math.sin(T * 6 + fase) * .1;
    for (const sg of [-1, 1]) {
      c.save(); c.translate(0, -h); c.rotate(sg * ab);
      c.fillStyle = '#5ab04a'; c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(sg * 2, -12, 0, -15); c.quadraticCurveTo(sg * 10, -10, sg * 9, 0); c.closePath(); c.fill();
      c.fillStyle = '#d0304a'; c.beginPath(); c.moveTo(0, -1); c.quadraticCurveTo(sg * 3, -10, 0, -12); c.quadraticCurveTo(sg * 7, -8, sg * 6, -1); c.closePath(); c.fill();
      c.fillStyle = '#fff'; for (let k = 0; k < 4; k++) { c.beginPath(); c.moveTo(sg * 8.6, -2 - k * 3.2); c.lineTo(sg * 11, -3.4 - k * 3.2); c.lineTo(sg * 8.4, -4 - k * 3.2); c.fill(); }
      c.restore();
    }
    c.restore();
  },
  fantasma(c, fx, fy, fase, alvo, i) {
    const dx = alvo ? alvo.x - fx : 0, dy = alvo ? alvo.y - fy : 0, d = Math.hypot(dx, dy) || 1, lx = dx / d, ly = dy / d, perto = d < 62;
    if (d < 46 && T - fantasmaBu[i] > 2.4) fantasmaBu[i] = T;
    brilho(c, () => luz(c, fx, fy, 48, '#ffb347', 0.16));
    c.save(); c.translate(fx, fy + Math.sin(T * 2.6 + fase) * 2); c.rotate(Math.sin(T * 1.7 + fase) * .08);
    for (let k = 0; k < 5; k++) { folha(c, 0, -16, -Math.PI / 2 - .8 + k * .4, 14 + (k % 2) * 4, ['#d0304a', '#2a9ad0', '#f2d26a', '#3ab05a', '#d0304a'][k]); }
    const g = c.createLinearGradient(-16, 0, 16, 0); g.addColorStop(0, '#5a3a1a'); g.addColorStop(.5, '#9a6a3a'); g.addColorStop(1, '#4a2a10');
    c.fillStyle = g; rr(c, -15, -18, 30, 38, 12); c.fill();
    c.strokeStyle = 'rgba(40,20,8,.6)'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(-12, -10); c.lineTo(12, -10); c.moveTo(-12, 12); c.lineTo(12, 12); c.stroke();
    c.fillStyle = '#1a0e04'; elip(c, -6, -3, 5, 4); c.fill(); elip(c, 6, -3, 5, 4); c.fill();
    c.fillStyle = perto ? '#ff6a4a' : '#ffd84d'; circ(c, -6 + lx * 2, -3 + ly * 1.5, 2); c.fill(); circ(c, 6 + lx * 2, -3 + ly * 1.5, 2); c.fill();
    c.fillStyle = '#1a0e04'; rr(c, -8, 4, 16, perto ? 9 : 6, 2); c.fill(); c.fillStyle = '#f2e2b0'; for (let k = 0; k < 4; k++) c.fillRect(-7 + k * 4, 4, 2.4, 2.6);
    c.restore();
    balaoBu(c, fx, fy, i, 'UH!', '#f2d26a');
  },
  bruxa(c, wx, wy, dir, riso) {
    c.save(); c.translate(wx, wy); c.scale(dir, 1);
    c.fillStyle = '#2a6ad0'; for (let k = 0; k < 3; k++) { c.beginPath(); c.moveTo(-10, 2); c.lineTo(-34 - k * 4, 6 + k * 4); c.lineTo(-30 - k * 4, 2 + k * 4); c.closePath(); c.fill(); }
    c.fillStyle = '#d0304a'; elip(c, 0, 0, 14, 8); c.fill(); circ(c, 12, -5, 7); c.fill();
    c.fillStyle = '#f2e2b0'; c.beginPath(); c.moveTo(17, -6); c.quadraticCurveTo(24, -6, 22, 1); c.quadraticCurveTo(19, -1, 17, -1); c.closePath(); c.fill();
    c.fillStyle = '#fff'; circ(c, 13, -7, 2.4); c.fill(); c.fillStyle = '#1a1020'; circ(c, 13.6, -7, 1.2); c.fill();
    const fl = Math.sin(T * 14);
    c.fillStyle = '#2a9ad0'; c.beginPath(); c.moveTo(-4, -3); c.quadraticCurveTo(-2, -16 - fl * 8, 6, -22 - fl * 10); c.quadraticCurveTo(6, -10, 6, -3); c.closePath(); c.fill();
    c.fillStyle = '#f2d26a'; c.beginPath(); c.moveTo(-2, -3); c.quadraticCurveTo(0, -11 - fl * 5, 4, -14 - fl * 6); c.lineTo(4, -3); c.closePath(); c.fill();
    c.restore();
    textoRiso(c, wx, wy, riso, 'crá crá!', '#f2d26a');
  },
  pocao(c, x, y, tipo, ang) {
    if (tipo === 'gosma') { c.fillStyle = '#6a4a2a'; circ(c, x, y, 5.5); c.fill(); circ(c, x + 3, y + 3, 2.6); c.fill(); c.fillStyle = 'rgba(200,160,110,.5)'; circ(c, x - 2, y - 2, 1.4); c.fill(); }
    else { c.save(); c.translate(x, y); c.rotate(ang); c.fillStyle = '#6a4220'; circ(c, 0, 0, 5.6); c.fill(); c.strokeStyle = '#9a6a3a'; c.lineWidth = .8; for (let k = 0; k < 6; k++) { c.beginPath(); c.moveTo(Math.cos(k) * 3, Math.sin(k) * 3); c.lineTo(Math.cos(k) * 5.4, Math.sin(k) * 5.4); c.stroke(); } c.fillStyle = '#2a1a0a'; for (const a of [0, 2.1, 4.2]) { circ(c, Math.cos(a) * 2, Math.sin(a) * 2 - 1, .9); c.fill(); } c.restore(); }
  },
  caldeirao(c, dentro) {
    const cx = W / 2, top = CALD_Y;
    brilho(c, () => luz(c, cx, top + 6, 150, '#5ae0a0', 0.2));
    c.fillStyle = '#5a5444'; rr(c, cx - 96, top - 2, 192, 150, 10); c.fill();
    c.fillStyle = '#6e6854'; for (let k = 0; k < 4; k++) for (let j = 0; j < 5; j++) { rr(c, cx - 92 + j * 37 + (k % 2) * 18, top + 30 + k * 30, 34, 26, 3); c.fill(); }
    c.fillStyle = '#3e3a2e'; rr(c, cx - 40, top + 50, 80, 70, 8); c.fill();
    c.fillStyle = '#f2d26a'; elip(c, cx - 20, top + 70, 8, 6); c.fill(); elip(c, cx + 20, top + 70, 8, 6); c.fill();
    brilho(c, () => { luz(c, cx - 20, top + 70, 22, '#f2d26a', .5); luz(c, cx + 20, top + 70, 22, '#f2d26a', .5); });
    c.fillStyle = '#1a1408'; rr(c, cx - 22, top + 90, 44, 18, 4); c.fill(); c.fillStyle = '#f2d26a'; for (let k = 0; k < 5; k++) c.fillRect(cx - 19 + k * 8.6, top + 90, 5, 5);
    const g = c.createRadialGradient(cx, top + 4, 4, cx, top + 4, 84); g.addColorStop(0, '#bfffe0'); g.addColorStop(.6, '#3ab07a'); g.addColorStop(1, '#1a5a3a');
    c.fillStyle = g; elip(c, cx, top + 4, 84, 11); c.fill();
    almasBoiando(c, dentro, cx, top, 64);
    c.strokeStyle = '#8a8470'; c.lineWidth = 6; elip(c, cx, top + 3, 90, 13); c.stroke();
  },
  teia(c, w, presa, ar) {
    for (let k = 0; k < 5; k++) {
      const x0 = w.x - w.r * .8 + k * w.r * .4, y0 = w.y - w.r - 30, sway = Math.sin(T * 1.2 + k + w.x) * 8;
      let ex = x0 + sway, ey = w.y + w.r * (0.5 + (k % 2) * .4);
      if (presa) { const d = Math.hypot(presa.x - ex, presa.y - ey); if (d < 80) { ex += (presa.x - ex) * .35; ey += (presa.y - ey) * .25; } }
      c.strokeStyle = '#3a7a2a'; c.lineWidth = 2.4; c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo(x0 + sway * 1.4, (y0 + ey) / 2, ex, ey); c.stroke();
      for (let j = 1; j < 4; j++) { const f = j / 4; folha(c, x0 + (ex - x0) * f + sway * (1 - f) * .7, y0 + (ey - y0) * f, (j % 2 ? 0.4 : 2.7), 9, '#4aa03a'); }
    }
    const sx = w.x + 8, sy = ar.y;
    c.strokeStyle = '#3aa04a'; c.lineWidth = 3; c.beginPath(); c.moveTo(sx, w.y - w.r - 60); for (let y = w.y - w.r - 60; y < sy; y += 6) c.lineTo(sx + Math.sin(y * .15 + T * 3) * 3, y); c.stroke();
    c.fillStyle = '#4ac05a'; elip(c, sx, sy + 3, 4.6, 6); c.fill(); c.fillStyle = '#ffd84d'; circ(c, sx - 2, sy + 4, 1); c.fill(); circ(c, sx + 2, sy + 4, 1); c.fill();
    c.strokeStyle = '#d0304a'; c.lineWidth = .8; c.beginPath(); c.moveTo(sx, sy + 9); c.lineTo(sx, sy + 12); c.lineTo(sx - 1.4, sy + 13.4); c.moveTo(sx, sy + 12); c.lineTo(sx + 1.4, sy + 13.4); c.stroke();
  },
  pegs(c, vis, dtR) {
    for (const p of pegs) {
      if (p.y < vis.y0 - 30 || p.y > vis.y1 + 30) continue;
      const h = hashStr(p.x + ',' + p.y);
      if (p.tipo === 'lapide') { c.fillStyle = ['#7a7a68', '#6a6a5a', '#8a8470'][h % 3]; rr(c, p.x - p.r, p.y - p.r, p.r * 2, p.r * 2, 4); c.fill(); c.fillStyle = '#4a8a3a'; rr(c, p.x - p.r, p.y - p.r, p.r * 2, 4, 2); c.fill(); c.fillStyle = 'rgba(30,30,20,.4)'; c.fillRect(p.x - 3, p.y - 1, 6, 1.4); c.fillRect(p.x - .7, p.y - 3, 1.4, 6); }
      else if (p.tipo === 'osso') { if (h % 2) { c.fillStyle = '#6a4220'; circ(c, p.x, p.y, p.r); c.fill(); c.fillStyle = '#2a1a0a'; for (const a of [-.5, .5, 1.57]) { circ(c, p.x + Math.cos(a - 1.57) * 3, p.y + Math.sin(a - 1.57) * 3, 1.1); c.fill(); } } else { c.fillStyle = '#8a8470'; circ(c, p.x, p.y, p.r); c.fill(); c.fillStyle = '#4a8a3a'; c.beginPath(); c.arc(p.x, p.y, p.r, Math.PI * 1.1, Math.PI * 1.9); c.fill(); } }
      else if (p.tipo === 'monte') { folha(c, p.x - 8, p.y + 4, -.2, 12, '#2a6a2a'); folha(c, p.x + 8, p.y + 4, Math.PI + .2, 12, '#3a8a3a'); }
      else if (p.tipo === 'lapideG') {
        c.fillStyle = '#8a8470'; rr(c, p.x - p.r, p.y - p.r, p.r * 2, p.r * 2, 5); c.fill(); c.strokeStyle = '#5a5444'; c.lineWidth = 1.2; c.stroke();
        c.fillStyle = '#f2d26a'; c.textAlign = 'center'; c.font = '600 4.4px "IBM Plex Mono", monospace'; c.fillText(p.txt[0], p.x, p.y + 1); c.fillText(p.txt[1], p.x, p.y + 6.4); c.textAlign = 'left';
        c.strokeStyle = '#f2d26a'; c.lineWidth = .8; c.beginPath(); c.arc(p.x, p.y - 9, 3.4, 0, Math.PI * 2); c.moveTo(p.x - 6, p.y - 9); c.lineTo(p.x + 6, p.y - 9); c.stroke();
        c.fillStyle = '#4a8a3a'; elip(c, p.x - 9, p.y + p.r - 1, 5, 2); c.fill();
      } else if (p.tipo === 'cristal') {
        p.brilho = Math.max(0, p.brilho - dtR * 2.5);
        const g = c.createRadialGradient(p.x - 4, p.y - 5, 1, p.x, p.y, p.r); g.addColorStop(0, '#d8ffe8'); g.addColorStop(.5, p.bumper ? '#3ad08a' : '#2aa070'); g.addColorStop(1, '#0a4a2a'); c.fillStyle = g; circ(c, p.x, p.y, p.r); c.fill();
        c.strokeStyle = '#c8a050'; c.lineWidth = 1.6; circ(c, p.x, p.y, p.r); c.stroke();
        if (p.bumper) { c.strokeStyle = `rgba(190,255,224,${0.5 + p.brilho * 0.5})`; c.lineWidth = 2 + p.brilho * 2; circ(c, p.x, p.y, p.r + 2 + p.brilho * 3); c.stroke(); }
        if (p.brilho > 0 || p.bumper) brilho(c, () => luz(c, p.x, p.y, 34, '#5ae0a0', 0.1 + p.brilho * 0.3));
      } else if (p.tipo === 'abobora') {
        p.brilho = Math.max(pertoDeAlguem(p), p.brilho - dtR * 0.8);
        if (p.brilho > .1) brilho(c, () => luz(c, p.x, p.y, 30 + p.brilho * 20, '#f2d26a', 0.12 + 0.25 * p.brilho));
        const g = c.createRadialGradient(p.x - 4, p.y - 4, 1, p.x, p.y, p.r); g.addColorStop(0, '#fff0a0'); g.addColorStop(1, '#a87a1a'); c.fillStyle = g; circ(c, p.x, p.y, p.r); c.fill();
        c.strokeStyle = '#6a4a0a'; c.lineWidth = 1; for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; c.beginPath(); c.moveTo(p.x + Math.cos(a) * (p.r - 2.5), p.y + Math.sin(a) * (p.r - 2.5)); c.lineTo(p.x + Math.cos(a) * p.r, p.y + Math.sin(a) * p.r); c.stroke(); }
        c.fillStyle = '#5a3a08'; c.fillRect(p.x - 5, p.y - 3, 3.4, 2.4); c.fillRect(p.x + 1.6, p.y - 3, 3.4, 2.4); c.fillRect(p.x - 3.4, p.y + 2.4, 6.8, p.brilho > .5 ? 3 : 1.6);
      }
    }
  },
  spin(c, s, a, w) {
    if (s.tipo === 'gangorra') return gangorraPadrao(c, s, a, ['#6a4a28', 'rgba(220,190,140,.4)', '#4a4030', '#c8b080']);
    if (s.tipo === 'moinho') {
      if (s.off === 0) { c.strokeStyle = '#4a3018'; c.lineWidth = 6; circ(c, s.cx, s.cy, s.L - 4); c.stroke(); c.strokeStyle = '#7a5a30'; c.lineWidth = 3; c.stroke(); }
      c.save(); c.translate(s.cx, s.cy); c.rotate(a);
      c.fillStyle = '#6a4a28'; rr(c, -s.L, -4, s.L * 2, 8, 3); c.fill();
      for (const sg of [-1, 1]) { c.fillStyle = '#8a6a3a'; c.fillRect(sg * s.L - 4, -16, 8, 32); c.strokeStyle = '#4a3018'; c.lineWidth = 1; c.strokeRect(sg * s.L - 4, -16, 8, 32); }
      c.restore();
      if (s.off === 0) { c.fillStyle = '#5a5444'; circ(c, s.cx, s.cy, 14); c.fill(); c.fillStyle = '#f2d26a'; circ(c, s.cx, s.cy, 4); c.fill(); brilho(c, () => { const g = c.createRadialGradient(s.cx, s.cy + s.L, 0, s.cx, s.cy + s.L, 60); g.addColorStop(0, 'rgba(180,230,255,.15)'); g.addColorStop(1, 'rgba(180,230,255,0)'); c.fillStyle = g; circ(c, s.cx, s.cy + s.L, 60); c.fill(); }); }
      return;
    }
    c.save(); c.translate(s.cx, s.cy); c.rotate(a);
    rastroFoice(c, s, w);
    c.strokeStyle = '#3a2410'; c.lineWidth = 7; c.lineCap = 'round'; c.beginPath(); c.moveTo(-s.L, 0); c.lineTo(s.L, 0); c.stroke(); c.strokeStyle = '#7a5a30'; c.lineWidth = 4.5; c.stroke();
    for (const sg of [1, -1]) {
      c.save(); c.translate(sg * s.L, 0);
      const g = c.createLinearGradient(-14, 0, 14, 0); g.addColorStop(0, '#b0aa94'); g.addColorStop(1, '#6a6450');
      c.fillStyle = g; c.beginPath(); c.moveTo(-6, -6); c.quadraticCurveTo(0, -24, 16 * sg, -16); c.quadraticCurveTo(10 * sg, 0, 16 * sg, 16); c.quadraticCurveTo(0, 24, -6, 6); c.closePath(); c.fill();
      c.strokeStyle = 'rgba(255,255,240,.5)'; c.lineWidth = 1; c.beginPath(); c.moveTo(16 * sg, -16); c.quadraticCurveTo(10 * sg, 0, 16 * sg, 16); c.stroke();
      c.restore();
    }
    c.fillStyle = '#5a5444'; circ(c, 0, 0, 7); c.fill(); c.fillStyle = '#f2d26a'; circ(c, 0, 0, 2.4); c.fill();
    c.restore();
  },
  ambiente(vis, dt) {
    if (Math.random() < dt * 6) solta(1, Math.random() * W, vis.y0 + Math.random() * (vis.y1 - vis.y0), { v: 12, vida: 2.4, cor: '#f2ff8a', tam: 1.4, luz: true, arr: .99 });
    if (Math.random() < dt * 3) solta(1, Math.random() * W, vis.y0 + 10, { v: 16, vx: -10 + Math.random() * 20, vy: 36, vida: 5, cor: ['#3a8a3a', '#5ab04a', '#8ac04a'], tam: 2.6, forma: 'q', arr: .995 });
  },
});


/* ================= Vulcão do Dragão ================= */
function rochaBrasa(c, x, y, r, sem, quente) {
  const rg = mulberry32(sem); c.fillStyle = quente ? '#3a2018' : '#2a1a16'; c.beginPath();
  for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2, rr2 = r * (0.82 + rg() * 0.26); c.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2); }
  c.closePath(); c.fill();
  c.strokeStyle = `rgba(255,${110 + Math.round(40 * Math.sin(T * 3 + sem))},40,${quente ? .95 : .7})`; c.lineWidth = 1.1;
  c.beginPath(); c.moveTo(x - r * .5, y - r * .2); c.lineTo(x - r * .1, y + r * .1); c.lineTo(x + r * .2, y - r * .3); c.moveTo(x - r * .1, y + r * .1); c.lineTo(x + r * .05, y + r * .55); c.stroke();
  c.fillStyle = 'rgba(255,255,255,.08)'; circ(c, x - r * .35, y - r * .4, r * .25); c.fill();
}
function chama(c, x, y, s, fase, cores) {
  const fl = Math.sin(T * 14 + fase) * .12;
  c.save(); c.translate(x, y); c.scale(s, s);
  cores.forEach((cor, k) => { const e = 1 - k * 0.3; c.fillStyle = cor; c.beginPath(); c.moveTo(-7 * e, 0); c.quadraticCurveTo(-8 * e, -10 * e, (fl * 10) * e, -20 * e); c.quadraticCurveTo(8 * e, -10 * e, 7 * e, 0); c.quadraticCurveTo(0, 5 * e, -7 * e, 0); c.fill(); });
  c.restore();
}
SKINS.vulcao = skin({
  nomes: { largada: ['Boca da Caverna', 'Caverna', 'à'], lapides: ['Campo de Rochas', 'Rochas', 'ao'], encruzilhada: ['Bifurcação de Lava', 'Bifurcação', 'à'], caminhos: ['Os dois caminhos', 'Caminhos', 'aos'], portao: ['Portão de Obsidiana', 'Portão', 'ao'], salao: ['Câmara das Chamas', 'Câmara', 'à'], ponte: ['Ponte Rachada', 'Ponte', 'à'], moinho: ['Roda da Mina', 'Roda', 'à'], caldeirao: ['Cratera', 'Cratera', 'à'], teias: ['Rio de Lava', 'Rio', 'ao'], fliper: ['Pátio de Brasas', 'Brasas', 'ao'], chuva: ['Chuva de Lava', 'Chuva de lava', 'à'], geiseres: ['Campo de Gêiseres', 'Gêiseres', 'ao'] },
  lados: ['o Túnel de Magma', 'a Trilha das Cinzas'], ladosCurtos: ['Magma', 'Cinzas'], ladosPlaca: ['Túnel de Magma', 'Trilha das Cinzas'],
  bg: { largada: ['#2a0c08', '#120404'], lapides: ['#2e1008', '#140604'], encruzilhada: ['#30100a', '#140504'], caminhos: ['#2a0a0a', '#120404'], portao: ['#1e0a18', '#0c040a'], salao: ['#3a1206', '#160602'], ponte: ['#26100c', '#100604'], moinho: ['#2a140a', '#120804'], caldeirao: ['#3a0e04', '#180402'], teias: ['#3a1404', '#180602'], fliper: ['#2a1a10', '#120a06'], chuva: ['#3a1006', '#160402'], geiseres: ['#2a1a10', '#120a06'] },
  epitafios: [['META', 'EM BRASA'], ['BOLETO', 'QUENTE'], ['ACORDO', 'DE FERRO'], ['PARCELA', 'DERRETIDA'], ['JUROS', 'VULCÂNICOS'], ['CPF', 'EM CINZAS']],
  txt: {
    abriu: () => 'A caverna abriu. Boa sorte, bichinhos.', explosao: a => `Bola de fogo! ${a} voou longe`, gosma: a => `${a} afundou na lava grossa`, mira: a => `O dragãozinho mirou ${a}...`, mao: a => `Uma mão de magma agarrou ${a}!`,
    portaoEspera: n => `${n} chegou primeiro ao portão de obsidiana... e vai ter que esperar a turma`, portaoJuntou: k => `Juntaram ${k} bichinhos: o portão de obsidiana abriu!`, portaoCansou: k => `O portão cansou de esperar e abriu com ${k} ${k > 1 ? 'bichinhos' : 'bichinho'}`,
    janela: (a, l) => `${a} pulou para ${l}`, gangorra: (n, l) => `A pedra mandou ${n} para ${l}`, caldPrimeiro: (a, N) => `${a} caiu primeiro na cratera. Ela só entra em erupção com ${N}`,
    caldRitmo: a => `${a} caiu na cratera. A próxima erupção vem em segundos`,
    caldFerveu: k => `A cratera entrou em erupção! ${k} ${k > 1 ? 'bichinhos saem' : 'bichinho sai'} em ordem sorteada`,
  },
  caldTxt: 'NA CRATERA', chegadaTxt: 'Saída da Caverna', esperando: 'Os bichinhos esperam a caverna abrir.',
  cor: {
    placaT: ['#3a1a10', '#1a0a06', '#ffd8a0', '#2a1a10'], chegada: ['#ffd8a0', '#2a0a04', '#ff8a2b', '#ff3b3b', '#2a1a10'], zona: ['#ff6a1a', '#ffd070'], mancha: '#ff5a10', portal: ['#ff8a2b', '#ff3b3b'],
    longe: 'rgba(10,0,0,.45)', destaque: '#ff8a2b', lider: '#ffb347', explosao: ['#ffe14d', '#ff8a2b', '#ff3b1b', '#ffffff'], gosma: ['#ff8a2b', '#ff5a10', '#ffd070'], anelExplosao: '#ffb347', anelGosma: '#ff6a1a',
    bumper: { cristal: ['#e0b0ff', '#ff8a2b'], abobora: ['#ffffff', '#ffd070'] }, chegadaConfete: ['#ff8a2b', '#ffd84d', '#ff3b3b', '#ffffff'], engole: ['#ff8a2b', '#ffd070'], cospe: ['#ff8a2b', '#ffe14d', '#ffffff'],
    poeira: 'rgba(120,100,90,.6)', terra: ['#3a2018', '#2a1610', '#5a3a2a'], faisca: ['#fff6cf', '#ffb347', '#ffffff'], fumaca: ['rgba(90,80,80,.6)', 'rgba(60,50,50,.6)'],
    portao: ['#1a1220', '#4a3a5a', '#ff8a2b'], alcapao: ['#1a1220', '#8a6aaa'], pilar: ['#2a1a2a', '#4a3a4a'], chama: '#ffb347', placa: ['#1a0a06', '', '#ffd8a0'], caldPlaca: ['#2a0a04', '#ff8a2b', '#ffe0b0'], parede: ['#140806', '#2a1410'],
  },
  segCores: { ferro: ['#120a08', '#4a2a20', '#8a5a40', 8], galho: ['#140806', '#3a2018', '#6a4a3a', 9], raiz: ['#2a0a04', '#8a2a0a', '#ff9a3a', 9], muro: ['#0a0610', '#2a1a30', '#6a4a8a', 11], ponte: ['#140a08', '#5a3a2a', '#a87a5a', 9], pedra: ['#140a08', '#4a3a30', '#8a7a6a', 8] },
  segExtra(c, s) {
    const L = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
    if (s.tipo === 'galho' || s.tipo === 'raiz') brilho(c, () => { c.strokeStyle = `rgba(255,120,30,${0.35 + 0.15 * Math.sin(T * 3 + s.x1)})`; c.lineWidth = 2; c.setLineDash([6, 5]); c.beginPath(); c.moveTo(s.x1, s.y1); c.lineTo(s.x2, s.y2); c.stroke(); c.setLineDash([]); });
    else if (s.tipo === 'ponte') { const n = Math.floor(L / 22); c.strokeStyle = 'rgba(255,120,40,.7)'; c.lineWidth = 1; for (let i = 1; i < n; i++) { const [x, y] = pontoEm(s, i / n); c.beginPath(); c.moveTo(x - 2, y - 4); c.lineTo(x + 1, y); c.lineTo(x - 1, y + 4); c.stroke(); } }
    else if (s.tipo === 'muro') { c.fillStyle = 'rgba(200,160,255,.5)'; for (let y = s.y1 + 26; y < s.y2; y += 61) { c.beginPath(); c.moveTo(s.x1 - 2, y); c.lineTo(s.x1, y - 6); c.lineTo(s.x1 + 2, y); c.fill(); } }
  },
  ceu(c, info) {
    const g = c.createRadialGradient(cw * .5, ch * 1.1, 20, cw * .5, ch * 1.1, ch * .9); g.addColorStop(0, 'rgba(255,90,20,.28)'); g.addColorStop(1, 'rgba(255,90,20,0)'); c.fillStyle = g; c.fillRect(0, 0, cw, ch);
    for (let k = 0; k < 4; k++) { const x = ((T * (6 + k * 3) + k * 300) % (cw + 400)) - 200, y = 40 + k * 46; c.fillStyle = 'rgba(30,20,20,.45)'; elip(c, x, y, 120, 16); c.fill(); elip(c, x + 60, y - 8, 70, 14); c.fill(); }
    const mx = cw - 80, my = 78 - Math.min(info.camY, 5000) * 0.004;
    brilho(c, () => luz(c, mx, my, 90, '#ff5a2a', 0.25)); c.fillStyle = '#c8442a'; circ(c, mx, my, 30); c.fill(); c.fillStyle = 'rgba(80,10,0,.35)'; circ(c, mx - 9, my - 6, 6); c.fill(); circ(c, mx + 10, my + 9, 4); c.fill();
    if (info.piscaLua) brilho(c, () => luz(c, mx, my, 70, '#ffd070', .4));
    return 0;
  },
  longe(c, tipo, base, off, rs) {
    c.beginPath(); c.moveTo(0, base + 300); for (let x = 0; x <= cw; x += 26) c.lineTo(x, base - 20 - 50 * Math.abs(Math.sin(x * .009 + rs.length)) - (x % 52 ? 0 : 18)); c.lineTo(cw, base + 300); c.closePath(); c.fill();
    if (tipo === 'salao' || tipo === 'caldeirao' || tipo === 'moinho' || tipo === 'fliper') {
      const mx = cw * .62; c.beginPath(); c.moveTo(mx - 240, base + 40); c.lineTo(mx - 50, base - 200); c.lineTo(mx + 50, base - 200); c.lineTo(mx + 240, base + 40); c.closePath(); c.fill();
      brilho(c, () => { luz(c, mx, base - 200, 80, '#ff6a1a', 0.35 + 0.1 * Math.sin(T * 2)); c.strokeStyle = 'rgba(255,110,30,.35)'; c.lineWidth = 4; for (const d of [-1, 1]) { c.beginPath(); c.moveTo(mx + d * 30, base - 196); c.quadraticCurveTo(mx + d * 70, base - 120, mx + d * 110, base - 30); c.stroke(); } });
      c.fillStyle = 'rgba(40,30,30,.35)'; for (let k = 0; k < 4; k++) { const y = base - 230 - ((T * 20 + k * 40) % 160); elip(c, mx + Math.sin(T + k) * 20, y, 30 + k * 6, 14); c.fill(); }
      c.fillStyle = SK.cor.longe;
    }
    brilho(c, () => { const gl = c.createLinearGradient(0, base + 20, 0, base + 60); gl.addColorStop(0, 'rgba(255,80,10,.2)'); gl.addColorStop(1, 'rgba(255,80,10,0)'); c.fillStyle = gl; c.fillRect(0, base + 20, cw, 40); });
  },
  largada(c) {
    c.fillStyle = 'rgba(255,255,255,.025)'; for (let k = 0; k < 40; k++) { const r3 = mulberry32(k * 13 + 3); elip(c, r3() * W, -90 + r3() * 310, 20 + r3() * 30, 12 + r3() * 16); c.fill(); }
    tituloLargada(c, '#ff8a2b', '#d8a890');
    luzesLargada(c, (c2, vx, vy, lean) => {
      c2.fillStyle = '#3a2a2a'; c2.beginPath(); c2.moveTo(vx - 9, vy); c2.lineTo(vx + 9, vy); c2.lineTo(vx + 5, vy + 8); c2.lineTo(vx - 5, vy + 8); c2.closePath(); c2.fill();
      c2.save(); c2.translate(vx, vy); c2.rotate(lean); chama(c2, 0, 0, .7, vx, ['#ff5a10', '#ffb347', '#fff6c8']); c2.restore();
      brilho(c2, () => luz(c2, vx, vy - 6, 64, '#ff7a2a', 0.2));
    });
  },
  mao(c, m, alt, fecha, fase) {
    brilho(c, () => luz(c, m.x, m.y + 7, 20, '#ff6a1a', .4));
    c.fillStyle = '#ff7a1a'; elip(c, m.x, m.y + 7, 13, 4.5); c.fill(); c.fillStyle = '#ffd070'; elip(c, m.x, m.y + 7, 6, 2); c.fill();
    if (alt <= 0.02) return;
    const h = 19 * alt;
    c.save(); c.translate(m.x, m.y + 6); c.rotate(Math.sin(T * 4 + fase) * 0.1);
    c.fillStyle = '#2a1a16'; rr(c, -4, -h, 8, h, 2.5); c.fill();
    c.fillStyle = '#3a2420'; circ(c, 0, -h, 5.4); c.fill();
    c.strokeStyle = '#3a2420'; c.lineWidth = 2.6; c.lineCap = 'round';
    for (let i = 0; i < 4; i++) { const a = -Math.PI / 2 + (i - 1.5) * (fecha ? 0.28 : 0.5), L = fecha ? 4 : 7.5; c.beginPath(); c.moveTo(Math.cos(a) * 3.8, -h + Math.sin(a) * 3.8); c.lineTo(Math.cos(a) * (3.8 + L), -h + Math.sin(a) * (3.8 + L) + (fecha ? 2.5 : 0)); c.stroke(); }
    brilho(c, () => { c.strokeStyle = 'rgba(255,130,40,.9)'; c.lineWidth = 1; c.beginPath(); c.moveTo(-1.5, -2); c.lineTo(1, -h * .5); c.lineTo(-1, -h + 2); c.stroke(); });
    c.restore();
  },
  fantasma(c, fx, fy, fase, alvo, i) {
    const dx = alvo ? alvo.x - fx : 0, dy = alvo ? alvo.y - fy : 0, d = Math.hypot(dx, dy) || 1, lx = dx / d, ly = dy / d, perto = d < 62;
    if (d < 46 && T - fantasmaBu[i] > 2.4) fantasmaBu[i] = T;
    brilho(c, () => luz(c, fx, fy, 52, '#ff7a1a', 0.3));
    chama(c, fx, fy + 16, 1.9, fase, ['#ff3b1b', '#ff8a2b', '#ffd070']);
    c.fillStyle = '#2a0a04'; elip(c, fx - 5.5, fy - 2, 2.6, 3.4); c.fill(); elip(c, fx + 5.5, fy - 2, 2.6, 3.4); c.fill();
    c.fillStyle = '#fff6c8'; circ(c, fx - 5.5 + lx * 1.1, fy - 3 + ly * 1.2, 1); c.fill(); circ(c, fx + 5.5 + lx * 1.1, fy - 3 + ly * 1.2, 1); c.fill();
    c.fillStyle = '#2a0a04'; if (perto) { elip(c, fx, fy + 5, 2.6, 3.2); c.fill(); } else { c.strokeStyle = '#2a0a04'; c.lineWidth = 1.1; c.beginPath(); c.arc(fx, fy + 3, 2.6, 0.3, Math.PI - 0.3); c.stroke(); }
    balaoBu(c, fx, fy, i, 'FUU!', '#ffd070');
  },
  bruxa(c, wx, wy, dir, riso) {
    c.save(); c.translate(wx, wy); c.scale(dir, 1);
    const fl = Math.sin(T * 12);
    c.fillStyle = '#7a1a10'; c.beginPath(); c.moveTo(-6, -2); c.quadraticCurveTo(-4, -18 - fl * 8, 8, -22 - fl * 9); c.quadraticCurveTo(4, -10, 6, -2); c.closePath(); c.fill();
    c.strokeStyle = '#c8302a'; c.lineWidth = 3; c.lineCap = 'round'; c.beginPath(); c.moveTo(-12, 2); c.quadraticCurveTo(-24, 4 + Math.sin(T * 5) * 3, -30, -2); c.stroke();
    c.fillStyle = '#c8302a'; c.beginPath(); c.moveTo(-30, -2); c.lineTo(-36, -6); c.lineTo(-33, 2); c.closePath(); c.fill();
    c.fillStyle = '#d8402a'; elip(c, 0, 0, 13, 7.5); c.fill(); c.fillStyle = '#ffb05a'; elip(c, 1, 3, 9, 3.4); c.fill();
    c.fillStyle = '#d8402a'; circ(c, 13, -5, 6.6); c.fill(); elip(c, 19, -3.5, 5, 3.4); c.fill();
    c.fillStyle = '#ffe0a0'; c.beginPath(); c.moveTo(10, -10); c.lineTo(8, -16); c.lineTo(13, -11); c.closePath(); c.fill();
    c.fillStyle = '#fff'; circ(c, 14, -7, 2.4); c.fill(); c.fillStyle = '#1a0806'; circ(c, 14.8, -7, 1.2); c.fill();
    c.fillStyle = '#5a1008'; circ(c, 22, -4.4, .8); c.fill();
    c.fillStyle = '#e8503a'; c.beginPath(); c.moveTo(-4, 2); c.quadraticCurveTo(-2, -12 + fl * 9, 10, -18 + fl * 10); c.quadraticCurveTo(8, -6, 8, 2); c.closePath(); c.fill();
    const dr = T - riso; if (dr >= 0 && dr < 0.6) { c.globalAlpha = 1 - dr / .6; chama(c, 30, -4, .8, 0, ['#ff5a10', '#ffd070']); c.globalAlpha = 1; }
    c.restore();
    textoRiso(c, wx, wy, riso, 'grrr!', '#ffd070');
  },
  pocao(c, x, y, tipo) {
    if (tipo === 'gosma') { brilho(c, () => luz(c, x, y, 14, '#ff6a1a', .6)); c.fillStyle = '#ff7a1a'; circ(c, x, y, 5); c.fill(); c.fillStyle = '#ffd070'; circ(c, x - 1.4, y - 1.4, 2); c.fill(); }
    else { brilho(c, () => luz(c, x, y, 18, '#ffb347', .7)); const g = c.createLinearGradient(x, y - 20, x, y); g.addColorStop(0, 'rgba(255,90,20,0)'); g.addColorStop(1, 'rgba(255,200,80,.9)'); c.fillStyle = g; c.beginPath(); c.moveTo(x - 5, y); c.lineTo(x + 5, y); c.lineTo(x, y - 22); c.closePath(); c.fill(); c.fillStyle = '#fff6c8'; circ(c, x, y, 4.4); c.fill(); }
  },
  caldeirao(c, dentro) {
    const cx = W / 2, top = CALD_Y;
    brilho(c, () => luz(c, cx, top + 10, 170, '#ff5a10', 0.3));
    c.fillStyle = '#2a1612'; c.beginPath(); c.moveTo(cx - 130, top + 170); c.quadraticCurveTo(cx - 110, top + 30, cx - 82, top + 4); c.lineTo(cx + 82, top + 4); c.quadraticCurveTo(cx + 110, top + 30, cx + 130, top + 170); c.closePath(); c.fill();
    brilho(c, () => { c.strokeStyle = 'rgba(255,110,30,.6)'; c.lineWidth = 3; for (const d of [-1, 1]) { c.beginPath(); c.moveTo(cx + d * 60, top + 10); c.quadraticCurveTo(cx + d * 90, top + 80, cx + d * 100, top + 160); c.stroke(); } });
    const lg = c.createRadialGradient(cx, top + 4, 4, cx, top + 4, 84); lg.addColorStop(0, '#fff2b0'); lg.addColorStop(.5, '#ff8a2b'); lg.addColorStop(1, '#b02a08');
    c.fillStyle = lg; elip(c, cx, top + 4, 80, 10); c.fill();
    almasBoiando(c, dentro, cx, top, 62);
    for (let i = 0; i < 6; i++) { const ph = (T * 1.6 + i * .3) % 1; c.fillStyle = `rgba(255,${180 - ph * 100},60,${1 - ph})`; circ(c, cx - 55 + i * 22, top + 2 - ph * 14, 2 + ph * 3); c.fill(); }
    c.strokeStyle = '#4a2a20'; c.lineWidth = 6; elip(c, cx, top + 3, 86, 12); c.stroke();
  },
  teia(c, w, presa) {
    brilho(c, () => luz(c, w.x, w.y, w.r * 1.2, '#ff5a10', .3));
    const g = c.createRadialGradient(w.x, w.y, 4, w.x, w.y, w.r); g.addColorStop(0, 'rgba(255,170,60,.55)'); g.addColorStop(.7, 'rgba(220,70,10,.4)'); g.addColorStop(1, 'rgba(220,70,10,0)'); c.fillStyle = g; circ(c, w.x, w.y, w.r); c.fill();
    const px = presa ? (presa.x - w.x) * .15 : 0, py = presa ? (presa.y - w.y) * .15 : 0;
    for (let k = 0; k < 6; k++) { const a = k * 1.05 + T * .25, r = w.r * (0.35 + (k % 3) * .18); c.fillStyle = 'rgba(40,20,14,.8)'; c.beginPath(); c.ellipse(w.x + Math.cos(a) * r + px, w.y + Math.sin(a) * r * .8 + py, 10, 6, a, 0, Math.PI * 2); c.fill(); }
  },
  pegs(c, vis, dtR) {
    for (const p of pegs) {
      if (p.y < vis.y0 - 30 || p.y > vis.y1 + 30) continue;
      const h = hashStr(p.x + ',' + p.y);
      if (p.tipo === 'lapide' || p.tipo === 'osso') rochaBrasa(c, p.x, p.y, p.r + 1, h, p.tipo === 'osso');
      else if (p.tipo === 'monte') { c.fillStyle = '#4a3a34'; elip(c, p.x, p.y + 3, 10, 4.5); c.fill(); c.fillStyle = '#ff7a1a'; circ(c, p.x, p.y + 2, 1.4); c.fill(); }
      else if (p.tipo === 'lapideG') {
        rochaBrasa(c, p.x, p.y, p.r, h, true);
        c.fillStyle = '#ffd070'; c.textAlign = 'center'; c.font = '600 4.4px "IBM Plex Mono", monospace'; c.fillText(p.txt[0], p.x, p.y + 1); c.fillText(p.txt[1], p.x, p.y + 6.4); c.textAlign = 'left';
      } else if (p.tipo === 'cristal') {
        p.brilho = Math.max(0, p.brilho - dtR * 2.5);
        c.fillStyle = '#1a1024'; c.beginPath(); for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2 + .3; c.lineTo(p.x + Math.cos(a) * p.r, p.y + Math.sin(a) * p.r); } c.closePath(); c.fill();
        c.fillStyle = 'rgba(160,120,220,.55)'; c.beginPath(); c.moveTo(p.x, p.y - p.r); c.lineTo(p.x + p.r * .5, p.y); c.lineTo(p.x, p.y + p.r * .3); c.lineTo(p.x - p.r * .4, p.y - p.r * .1); c.closePath(); c.fill();
        if (p.bumper) { c.strokeStyle = `rgba(255,140,40,${0.5 + p.brilho * 0.5})`; c.lineWidth = 2 + p.brilho * 2; circ(c, p.x, p.y, p.r + 2 + p.brilho * 3); c.stroke(); }
        if (p.brilho > 0 || p.bumper) brilho(c, () => luz(c, p.x, p.y, 34, '#ff8a2b', 0.1 + p.brilho * 0.3));
      } else if (p.tipo === 'abobora') {
        p.brilho = Math.max(pertoDeAlguem(p), p.brilho - dtR * 0.8);
        c.fillStyle = '#3a2a24'; elip(c, p.x, p.y + 3, p.r, p.r * .75); c.fill(); c.fillStyle = '#ff7a1a'; elip(c, p.x, p.y, p.r * .55, p.r * .35); c.fill();
        if (p.brilho > .1) { brilho(c, () => luz(c, p.x, p.y, 30 + p.brilho * 20, '#ffd070', 0.15 + 0.25 * p.brilho)); c.fillStyle = `rgba(240,240,240,${0.5 * p.brilho})`; for (let k = 0; k < 3; k++) { elip(c, p.x + Math.sin(T * 5 + k) * 3, p.y - 8 - k * 8 - (T * 30 % 8), 4 + k * 2, 3 + k); c.fill(); } }
      }
    }
  },
  spin(c, s, a, w) {
    if (s.tipo === 'gangorra') return gangorraPadrao(c, s, a, ['#4a3a34', 'rgba(255,140,60,.4)', '#2a1a16', '#ff8a2b']);
    if (s.tipo === 'moinho') {
      if (s.off === 0) { c.strokeStyle = '#3a2a24'; c.lineWidth = 5; circ(c, s.cx, s.cy, s.L - 6); c.stroke(); }
      c.save(); c.translate(s.cx, s.cy); c.rotate(a);
      c.fillStyle = '#4a4040'; rr(c, -s.L, -4, s.L * 2, 8, 3); c.fill(); c.fillStyle = 'rgba(255,255,255,.15)'; c.fillRect(-s.L + 3, -3, s.L * 2 - 6, 1.4);
      for (const sg of [-1, 1]) { c.fillStyle = '#5a4a3a'; c.fillRect(sg * s.L - 9, -8, 18, 16); c.fillStyle = '#ff8a2b'; c.fillRect(sg * s.L - 7, -6, 14, 4); }
      c.restore();
      if (s.off === 0) { c.fillStyle = '#2a1a16'; circ(c, s.cx, s.cy, 14); c.fill(); c.strokeStyle = '#ff8a2b'; c.lineWidth = 2; c.stroke(); }
      return;
    }
    c.save(); c.translate(s.cx, s.cy); c.rotate(a);
    rastroFoice(c, s, w);
    c.strokeStyle = '#2a2020'; c.lineWidth = 7; c.lineCap = 'round'; c.beginPath(); c.moveTo(-s.L, 0); c.lineTo(s.L, 0); c.stroke(); c.strokeStyle = '#5a4a44'; c.lineWidth = 4; c.stroke();
    for (const sg of [1, -1]) { c.save(); c.translate(sg * s.L, 0); const g = c.createLinearGradient(-10, 0, 10, 0); g.addColorStop(0, '#5a4a44'); g.addColorStop(1, '#ff6a1a'); c.fillStyle = g; rr(c, -10, -14, 20, 28, 4); c.fill(); brilho(c, () => luz(c, 0, 0, 22, '#ff6a1a', .4)); c.restore(); }
    c.fillStyle = '#2a1a16'; circ(c, 0, 0, 7); c.fill(); c.fillStyle = '#ff8a2b'; circ(c, 0, 0, 2.4); c.fill();
    c.restore();
  },
  ambiente(vis, dt) {
    if (Math.random() < dt * 10) solta(1, Math.random() * W, vis.y1 + 10, { v: 8, vy: -60 - Math.random() * 50, vida: 3, cor: ['#ff8a2b', '#ffb347', '#ff5a10'], tam: 1.2, luz: true, arr: .995 });
    if (Math.random() < dt * 6) solta(1, Math.random() * W, vis.y0 - 10, { v: 4, vx: -6 + Math.random() * 12, vy: 25, vida: 6, cor: 'rgba(120,110,110,.6)', tam: 1.4, arr: 1 });
  },
});


/* ================= desenho das peças novas (molas, plataformas, esteiras, pêndulos, zonas) ================= */
const PECA_PADRAO = {
  mola: ['#ff8a2b', '#ffd84d', '#6a6a7a'], barra: ['#2a2430', '#8a7aa0', '#d8c8f0'], esteira: ['#1a1a24', '#3a3a4a', '#ffd84d'],
  pendulo: ['#3a3040', '#a99db5', '#d8d0e0'], corrente: '#bff2ff', geiser: ['rgba(255,245,230,.95)', 'rgba(255,245,230,0)', '#3a3030'], orbita: '#b08af5',
};
const pc = k => (SK.peca && SK.peca[k]) || PECA_PADRAO[k];
function desenhaMola(c, s) {
  const k = pc('mola'), L = Math.hypot(s.x2 - s.x1, s.y2 - s.y1), nx = -(s.y2 - s.y1) / L, ny = (s.x2 - s.x1) / L, sg = ny > 0 ? 1 : -1;
  c.strokeStyle = k[2]; c.lineWidth = 2; c.lineCap = 'round';
  for (const f of [0.25, 0.75]) {
    const [x, y] = pontoEm(s, f); c.beginPath(); c.moveTo(x, y);
    for (let i = 1; i <= 5; i++) c.lineTo(x + (i % 2 ? 4 : -4) + nx * sg * i * 2.6, y + ny * sg * i * 2.6);
    c.stroke();
  }
  linhaSeg(c, s, 9, tom(k[0], -0.35)); linhaSeg(c, s, 6, k[0]);
  c.strokeStyle = k[1]; c.lineWidth = 1.4; c.beginPath(); c.moveTo(s.x1 + 3, s.y1 - 2); c.lineTo(s.x2 - 3, s.y2 - 2); c.stroke();
}
function desenhaEsteira(c, s, v, vMax) {
  const k = pc('esteira'), L = Math.hypot(s.x2 - s.x1, s.y2 - s.y1), ux = (s.x2 - s.x1) / L, uy = (s.y2 - s.y1) / L, sg = Math.sign(v) || 1, forca = Math.abs(v) / vMax;
  c.lineCap = 'round'; linhaSeg(c, s, 12, k[0]); linhaSeg(c, s, 8, k[1]);
  const passo = 18, off = ((T * v * 0.35) % passo + passo) % passo;
  c.strokeStyle = rgba(k[2], 0.25 + 0.6 * forca); c.lineWidth = 1.8;
  for (let d = off; d < L - 4; d += passo) {
    const x = s.x1 + ux * d, y = s.y1 + uy * d;
    c.beginPath(); c.moveTo(x - ux * 4 * sg - uy * 3, y - uy * 4 * sg + ux * 3); c.lineTo(x, y); c.lineTo(x - ux * 4 * sg + uy * 3, y - uy * 4 * sg - ux * 3); c.stroke();
  }
  c.fillStyle = k[0]; for (const [x, y] of [[s.x1, s.y1], [s.x2, s.y2]]) { if (x <= 0 || x >= W) continue; circ(c, x, y, 6); c.fill(); c.fillStyle = k[1]; circ(c, x, y, 3); c.fill(); c.fillStyle = k[0]; }
}
function desenhaBarra(c, s, g) {
  const k = pc('barra');
  c.strokeStyle = rgba(k[2], 0.14); c.lineWidth = 2; c.setLineDash([4, 6]); c.beginPath(); c.moveTo(s.cx - s.A - s.L, s.cy); c.lineTo(s.cx + s.A + s.L, s.cy); c.stroke(); c.setLineDash([]);
  if (SK.barra) return SK.barra(c, s, g);
  c.fillStyle = SOMBRA; rr(c, g.x1 + SX, g.y1 - 5 + SY, g.x2 - g.x1, 10, 4); c.fill();
  c.fillStyle = k[0]; rr(c, g.x1, g.y1 - 6, g.x2 - g.x1, 12, 5); c.fill(); c.fillStyle = k[1]; rr(c, g.x1 + 2, g.y1 - 4, g.x2 - g.x1 - 4, 8, 4); c.fill();
  c.fillStyle = k[2]; for (const f of [0.15, 0.5, 0.85]) { circ(c, g.x1 + (g.x2 - g.x1) * f, g.y1, 1.6); c.fill(); }
}
function desenhaPendulo(c, s, g) {
  const k = pc('pendulo');
  c.strokeStyle = rgba(k[2], 0.08); c.lineWidth = 14; c.beginPath(); c.arc(s.cx, s.cy, s.L, Math.PI / 2 - s.A, Math.PI / 2 + s.A); c.stroke();
  c.strokeStyle = SOMBRA; c.lineWidth = 5; c.beginPath(); c.moveTo(g.x1 + SX, g.y1 + SY); c.lineTo(g.x2 + SX, g.y2 + SY); c.stroke();
  c.strokeStyle = k[0]; c.lineWidth = 5; c.lineCap = 'round'; c.beginPath(); c.moveTo(g.x1, g.y1); c.lineTo(g.x2, g.y2); c.stroke();
  c.strokeStyle = k[1]; c.lineWidth = 2; c.stroke();
  if (SK.pendulo) SK.pendulo(c, s, g);
  else { c.fillStyle = k[1]; circ(c, g.x2, g.y2, 12); c.fill(); c.fillStyle = k[2]; circ(c, g.x2 - 3, g.y2 - 3, 4); c.fill(); }
  c.fillStyle = k[0]; circ(c, s.cx, s.cy, 7); c.fill(); c.fillStyle = k[2]; circ(c, s.cx, s.cy, 2.4); c.fill();
}
function desenhaZonas(c, vis, fz) {
  for (const z of ZONAS) {
    if (z.y1 < vis.y0 || z.y0 > vis.y1) continue;
    if (z.tipo === 'orbita') {
      const cor = pc('orbita');
      c.fillStyle = rgba(cor, 0.07); c.fillRect(z.x0, z.y0, z.x1 - z.x0, z.y1 - z.y0);
      c.strokeStyle = rgba(cor, 0.45); c.lineWidth = 1.5; c.setLineDash([8, 8]);
      for (const y of [z.y0, z.y1]) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
      c.setLineDash([]);
      for (let k = 0; k < 22; k++) {
        const y = z.y0 + ((k * 61.7 + T * 18) % (z.y1 - z.y0)), d = Math.sin(y * 0.011 + T * 0.9 + fz.extra), x = (k * 131.3 + T * 40 * d) % W;
        c.strokeStyle = rgba(cor, 0.12 + 0.18 * Math.abs(d)); c.lineWidth = 1.4; c.beginPath(); c.moveTo((x + W) % W, y); c.lineTo((x + W) % W - 26 * d, y + 3); c.stroke();
      }
      c.fillStyle = rgba(cor, 0.7); c.font = '600 9px "IBM Plex Mono", monospace'; c.fillText('GRAVIDADE ZERO', 18, z.y0 + 16);
    } else if (z.tipo === 'corrente') {
      const f = forcaCorrente(z, T, fz), cor = pc('corrente'), sg = Math.sign(f) || 1;
      for (let k = 0; k < 9; k++) {
        const y = z.y0 + 14 + (k * 17.3) % (z.y1 - z.y0 - 20), x = (((k * 97 + T * f * 180) % (W + 80)) + W + 80) % (W + 80) - 40;
        c.strokeStyle = rgba(cor, 0.1 + 0.3 * Math.abs(f)); c.lineWidth = 2; c.beginPath(); c.moveTo(x, y); c.lineTo(x - sg * 46 * Math.abs(f), y); c.stroke();
        c.beginPath(); c.moveTo(x - sg * 5, y - 4); c.lineTo(x, y); c.lineTo(x - sg * 5, y + 4); c.stroke();
      }
    } else if (z.tipo === 'bolhas') {
      const cx = (z.x0 + z.x1) / 2, alto = z.y1 - z.y0;
      c.fillStyle = 'rgba(190,240,255,.05)'; c.fillRect(z.x0, z.y0, z.x1 - z.x0, alto);
      for (let k = 0; k < 14; k++) { const y = z.y1 - ((T * 110 + k * 61) % alto), x = cx + Math.sin(T * 3 + k) * 9; c.strokeStyle = 'rgba(220,250,255,.55)'; c.lineWidth = 1; circ(c, x, y, 2 + (k % 3) * 1.5); c.stroke(); }
    }
  }
  const k = pc('geiser');
  for (const g of GEISERES) {
    if (g.y + 20 < vis.y0 || g.y - g.alt > vis.y1) continue;
    const f = geiserFase(g, T, fz), ativo = f < 0.5, aviso = f > 2.05;
    if (ativo) {
      const h = g.alt * Math.min(1, f / 0.1), gr = c.createLinearGradient(0, g.y, 0, g.y - h); gr.addColorStop(0, k[0]); gr.addColorStop(1, k[1]);
      c.fillStyle = gr; c.beginPath(); c.moveTo(g.x - 10, g.y); c.quadraticCurveTo(g.x - 26, g.y - h * 0.6, g.x - 18 + Math.sin(T * 30) * 3, g.y - h); c.lineTo(g.x + 18 + Math.sin(T * 27) * 3, g.y - h); c.quadraticCurveTo(g.x + 26, g.y - h * 0.6, g.x + 10, g.y); c.closePath(); c.fill();
    } else if (aviso) { for (let i = 0; i < 3; i++) { const ph = (T * 3 + i * .33) % 1; c.fillStyle = rgba('#ffffff', 0.35 * (1 - ph)); circ(c, g.x + (i - 1) * 7, g.y - 6 - ph * 18, 3 + ph * 4); c.fill(); } }
    c.fillStyle = k[2]; elip(c, g.x, g.y + 2, 22, 8); c.fill(); c.fillStyle = ativo || aviso ? k[0] : 'rgba(0,0,0,.6)'; elip(c, g.x, g.y, 9, 3.4); c.fill();
  }
}

/* cada mapa veste as peças novas do seu jeito */
SKINS.pixel.peca = { mola: ['#5cff5c', '#c8ff96', '#b8a8ff'], barra: ['#120a20', '#6a5a9a', '#ffe14d'] };
SKINS.mar.peca = { corrente: '#bff2ff' };
SKINS.espaco.peca = { barra: ['#12182a', '#5a6a88', '#5ff0f0'], orbita: '#b08af5' };
SKINS.espaco.barra = (c, s, g) => {
  c.strokeStyle = '#8a96b4'; c.lineWidth = 2; c.beginPath(); c.moveTo(g.x1 + 14, g.y1); c.lineTo(g.x2 - 14, g.y2); c.stroke();
  for (const sg of [-1, 1]) { const x = sg < 0 ? g.x1 + 10 : g.x2 - 10; c.fillStyle = '#2a4a9a'; c.fillRect(x - 12, g.y1 - 9, 24, 18); c.strokeStyle = '#9fb8ff'; c.lineWidth = .8; c.strokeRect(x - 12, g.y1 - 9, 24, 18); c.beginPath(); c.moveTo(x, g.y1 - 9); c.lineTo(x, g.y1 + 9); c.stroke(); }
  c.fillStyle = '#c8d0e4'; rr(c, g.cx - 10, g.y1 - 7, 20, 14, 4); c.fill(); c.fillStyle = Math.floor(T * 3) % 2 ? '#ff4d5e' : '#5ff0f0'; circ(c, g.cx, g.y1, 2.4); c.fill();
};
SKINS.templo.peca = { esteira: ['#143a4a', '#2a6a9a', '#d8f4ff'], pendulo: ['#4a3018', '#8a6a3a', '#c8b080'] };
SKINS.templo.pendulo = (c, s, g) => {
  c.save(); c.translate(g.x2, g.y2); c.rotate(-g.a);
  const gr = c.createLinearGradient(-18, 0, 18, 0); gr.addColorStop(0, '#b0aa94'); gr.addColorStop(1, '#6a6450');
  c.fillStyle = gr; c.beginPath(); c.moveTo(-20, -4); c.quadraticCurveTo(0, 22, 20, -4); c.quadraticCurveTo(0, 4, -20, -4); c.closePath(); c.fill();
  c.strokeStyle = 'rgba(255,255,240,.6)'; c.lineWidth = 1; c.beginPath(); c.moveTo(-20, -4); c.quadraticCurveTo(0, 22, 20, -4); c.stroke();
  c.restore();
};
SKINS.vulcao.peca = { geiser: ['rgba(255,200,110,.95)', 'rgba(255,90,20,0)', '#2a1612'], barra: ['#1a0e0a', '#5a3a2a', '#ff8a2b'] };
SKINS.halloween.peca = {};


/* ================= efeitos (partículas) ================= */
let parts = [], aneis = [], evPtr = 0, shake = 0, escala = 1;
function buscar(novoT) {
  T = clamp(novoT, 0, rec ? rec.dur : 0);
  parts = []; aneis = []; shake = 0;
  evPtr = 0; if (rec) while (evPtr < rec.eventos.length && rec.eventos[evPtr].t <= T) evPtr++;
  narrN = -1; vb.forEach(o => { o.rastro = []; });
  pegs.forEach(p => { p.brilho = 0; });
  somT = T;
}
function solta(nn, x, y, o) {
  for (let i = 0; i < nn && parts.length < 900; i++) {
    const a = Math.random() * Math.PI * 2, v = (o.v || 100) * (0.3 + Math.random() * 0.9);
    parts.push({ x, y, vx: Math.cos(a) * v + (o.vx || 0), vy: Math.sin(a) * v + (o.vy || 0), vida: 0, max: (o.vida || .6) * (0.6 + Math.random() * 0.8), cor: Array.isArray(o.cor) ? o.cor[Math.floor(Math.random() * o.cor.length)] : o.cor, tam: (o.tam || 2) * (0.6 + Math.random() * 0.8), g: o.g || 0, luz: !!o.luz, arr: o.arr || 0.985, forma: o.forma || 'c', rot: Math.random() * 6 });
  }
}
function efeitos(vis) {
  if (!rec) return;
  const k = SK.cor, dentro = (x, y) => y > vis.y0 - 80 && y < vis.y1 + 80;
  while (evPtr < rec.eventos.length && rec.eventos[evPtr].t <= T) {
    const e = rec.eventos[evPtr++];
    if (tocando) som.evento(e);
    if (!dentro(e.x, e.y)) continue;
    if (e.tipo === 'faisca') solta(7, e.x, e.y, { v: 220, vida: .35, cor: k.faisca, tam: 1.5, g: 500, luz: true });
    else if (e.tipo === 'poeira') solta(5, e.x, e.y, { v: 50, vida: .7, cor: k.poeira, tam: 3, g: -30, arr: .95 });
    else if (e.tipo === 'toque') solta(3, e.x, e.y, { v: 60, vida: .4, cor: k.destaque, tam: 1.4, luz: true });
    else if (e.tipo === 'bumper') { const p = pegs[e.pi]; if (p) p.brilho = 1; solta(6, e.x, e.y, { v: 120, vida: .4, cor: k.bumper[e.tipoP] || k.bumper.cristal, tam: 1.8, luz: true }); }
    else if (e.tipo === 'explosao') { solta(46, e.x, e.y, { v: 300, vida: .7, cor: k.explosao, tam: 2.4, g: 120, luz: true }); aneis.push({ x: e.x, y: e.y, t0: T, cor: k.anelExplosao }); shake = Math.max(shake, 7); }
    else if (e.tipo === 'gosma') { solta(30, e.x, e.y, { v: 220, vida: .8, cor: k.gosma, tam: 2.6, g: 700 }); aneis.push({ x: e.x, y: e.y, t0: T, cor: k.anelGosma }); shake = Math.max(shake, 3); }
    else if (e.tipo === 'engole') solta(16, e.x, e.y, { v: 90, vy: -170, vida: .7, cor: [...k.engole, e.cor], tam: 2.4, g: 520 });
    else if (e.tipo === 'cospe') { solta(22, e.x, e.y, { v: 160, vida: .6, cor: [...k.cospe, e.cor], tam: 2.2, luz: true }); aneis.push({ x: e.x, y: e.y, t0: T, cor: k.cospe[1] }); }
    else if (e.tipo === 'terra') solta(10, e.x, e.y, { v: 90, vy: -60, vida: .6, cor: k.terra, tam: 2.2, g: 600 });
    else if (e.tipo === 'portao') solta(40, e.x, e.y, { v: 240, vida: .9, cor: k.fumaca, tam: 3.5, g: 80, arr: .94 });
    else if (e.tipo === 'alcapao') { solta(14, e.x, e.y, { v: 120, vida: .6, cor: [k.fumaca[0]], tam: 3, g: 60, arr: .94 }); shake = Math.max(shake, 2); }
    else if (e.tipo === 'mola') solta(10, e.x, e.y, { v: 160, vy: -140, vida: .45, cor: pc('mola').slice(0, 2), tam: 2, g: 400, luz: true });
    else if (e.tipo === 'geiser') { solta(26, e.x, e.y - 10, { v: 120, vy: -420, vida: .8, cor: [pc('geiser')[0], k.poeira], tam: 2.6, g: 500, arr: .96 }); shake = Math.max(shake, 2); }
    else if (e.tipo === 'chegada') solta(80, e.x, e.y, { v: 360, vy: -200, vida: 1.4, cor: k.chegadaConfete, tam: 2.8, g: 420, forma: 'q', arr: .97 });
  }
}

/* ================= desenho da corrida ================= */
const cv = opcoes.pista; let ctx = cv.getContext('2d');
const baixa = document.createElement('canvas'), bctx = baixa.getContext('2d'), PX = 2;
let cw = 0, ch = 0, dpr = 1, kBase = 1, kk = 0, camX = 0, camY = -90, viewW = W, viewH = 500;
function medir() {
  const r = cv.getBoundingClientRect(); dpr = Math.min(2, window.devicePixelRatio || 1);
  cw = r.width; ch = r.height; cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
  baixa.width = Math.ceil(cw / PX); baixa.height = Math.ceil(ch / PX);
  kBase = Math.min(cw / W, 1.35); if (!kk) kk = kBase;
  medirCerimonia();
}
function corFundo(y) {
  let i = 0; for (let k = 0; k < TRECHOS.length; k++) if (y >= TRECHOS[k].y) i = k;
  const a = TRECHOS[i], b = TRECHOS[Math.min(i + 1, TRECHOS.length - 1)];
  const p = b === a ? 0 : clamp((y - (b.y - 260)) / 260, 0, 1);
  return [mixHex(a.bg[0], b.bg[0], p), mixHex(a.bg[1], b.bg[1], p)];
}
const NEBLINA = Array.from({ length: 7 }, () => ({ x: Math.random(), y: 0.55 + Math.random() * 0.45, r: 120 + Math.random() * 160, v: 0.006 + Math.random() * 0.012, a: 0.035 + Math.random() * 0.03 }));
function expressao(o, lider) {
  if (o.f & 1) return 'medo';
  if (o.f & 4) return 'tonta';
  if (o.f & 8) return 'grudada';
  if (o.fim) return 'feliz';
  if (o.f & 16) return 'medo';
  if (T >= 3 && o.dono === lider) return 'feliz';
  if (T >= 3 && o.vy > 650) return 'medo';
  if (T >= 3 && (o.f & 32)) return 'sono';
  return 'normal';
}

function desenhar(dtR) {
  if (!cw || !rec) return;
  const fz = rec.fz, px = !!SK.pixel, c = px ? bctx : ctx, E = px ? 1 / PX : dpr;
  amostra();
  const rk = rankingV(), lider = rk[0].dono;
  let alvo = rk[0].b;
  if (seguir >= 0) { const m = rk.find(r => r.dono === seguir); if (m) alvo = m.b; }
  const kAlvo = modoCam === 'perto' ? kBase * 1.9 : kBase;
  kk += (kAlvo - kk) * 0.1; viewW = cw / kk; viewH = ch / kk;
  const camXA = viewW >= W ? (W - viewW) / 2 : clamp(alvo.x - viewW / 2, 0, W - viewW);
  const camYA = T < 3 ? -90 : clamp(alvo.y - viewH * 0.42, -90, H - viewH);
  const salto = Math.abs(camYA - camY) > viewH * 2;
  camX += (camXA - camX) * (salto ? 1 : 0.14); camY += (camYA - camY) * (salto ? 1 : 0.09);
  const vis = { x0: camX, x1: camX + viewW, y0: camY - 40, y1: camY + viewH + 40 };
  efeitos(vis); if (tocando && !calmo) SK.ambiente(vis, dtR);
  shake *= 0.86;
  const shx = (Math.random() - .5) * shake, shy = (Math.random() - .5) * shake;
  const venceu = rec.vencedor >= 0 && T >= rec.tVenc, piscaLua = venceu && ((T - rec.tVenc) % 2.2) < 0.5;

  // céu e cenário distante
  c.setTransform(E, 0, 0, E, 0, 0);
  const [b0, b1] = corFundo(camY + viewH / 2);
  const g = c.createLinearGradient(0, 0, 0, ch); g.addColorStop(0, b0); g.addColorStop(1, b1);
  c.fillStyle = g; c.fillRect(0, 0, cw, ch);
  const flash = SK.ceu(c, { camY, raios: rec.raios, venceu, piscaLua }) || 0;
  longeLoop(c, camY, viewH);

  // mundo
  const mundo = cc => cc.setTransform((cc === bctx ? E : dpr) * kk, 0, 0, (cc === bctx ? E : dpr) * kk, (-camX * kk + shx) * (cc === bctx ? E : dpr), (-camY * kk + shy) * (cc === bctx ? E : dpr));
  mundo(c);
  const kp = SK.cor.parede;
  if (camX < 0) { c.fillStyle = '#0b0910'; c.fillRect(camX, vis.y0, -camX, vis.y1 - vis.y0); c.fillRect(W, vis.y0, -camX, vis.y1 - vis.y0); }
  c.fillStyle = kp[0]; c.fillRect(-14, vis.y0, 14, vis.y1 - vis.y0); c.fillRect(W, vis.y0, 14, vis.y1 - vis.y0);
  c.strokeStyle = kp[1]; c.lineWidth = 1;
  for (let y = Math.floor(vis.y0 / 22) * 22; y < vis.y1; y += 22) { c.beginPath(); c.moveTo(-14, y); c.lineTo(0, y); c.moveTo(W, y); c.lineTo(W + 14, y); c.stroke(); }
  if (vis.y0 < PORTAO_Y + 20) SK.largada(c, vis);
  SK.fundo(c, vis, alvo, rk);
  if (!px) placasTrechos(c, vis);
  if (CHEGADA > vis.y0 - 80 && CHEGADA < vis.y1 + 40) SK.chegada(c);

  // zonas que seguram, manchas das atiradoras, teias
  PANTANO.forEach((p, i) => { if (p.y + p.r < vis.y0 || p.y - p.r > vis.y1) return; SK.zona(c, p, pantanoNivel(i, T, fz), i); });
  for (const gz of rec.gosmas) {
    if (T < gz.nasce || T >= gz.ate || gz.y < vis.y0 - 60 || gz.y > vis.y1 + 60) continue;
    SK.mancha(c, gz, clamp((gz.ate - T) / 1, 0, 1) * clamp((T - gz.nasce) / .2, 0, 1));
  }
  teias.forEach((w, i) => {
    if (w.y + w.r < vis.y0 - 120 || w.y - w.r - 120 > vis.y1) return;
    const presa = vb.find(o => ativaV(o) && Math.hypot(o.x - w.x, o.y - w.y) < w.r);
    const alvoY = presa ? Math.min(presa.y - 26, w.y - 10) : w.y - w.r - 30;
    aranhas[i].y += (alvoY - aranhas[i].y) * 0.05;
    SK.teia(c, w, presa, aranhas[i]);
  });
  desenhaZonas(c, vis, fz);

  // sombras na parede do fundo
  c.lineCap = 'round';
  for (const s of segs) {
    if (Math.max(s.y1, s.y2) < vis.y0 || Math.min(s.y1, s.y2) > vis.y1 || s.tipo === 'parede' || s.tipo === 'portao' || (s.tipo === 'alcapao' && portaoEm(T))) continue;
    c.strokeStyle = SOMBRA; c.lineWidth = 8; c.beginPath(); c.moveTo(s.x1 + SX, s.y1 + SY); c.lineTo(s.x2 + SX, s.y2 + SY); c.stroke();
  }
  c.fillStyle = SOMBRA;
  for (const p of pegs) { if (p.y < vis.y0 - 30 || p.y > vis.y1 + 30) continue; circ(c, p.x + SX, p.y + SY, p.r); c.fill(); }
  spins.forEach(s => { if (s.cy + s.L < vis.y0 || s.cy - s.L > vis.y1 || s.tipo === 'barra' || s.tipo === 'pendulo') return; const g = geoSpin(s, T, fz); c.strokeStyle = SOMBRA; c.lineWidth = s.tipo === 'moinho' ? 12 : 7; c.beginPath(); c.moveTo(g.x1 + SX, g.y1 + SY); c.lineTo(g.x2 + SX, g.y2 + SY); c.stroke(); });

  // pista
  for (const s of segs) {
    if (Math.max(s.y1, s.y2) < vis.y0 || Math.min(s.y1, s.y2) > vis.y1 || s.tipo === 'parede') continue;
    if (s.tipo === 'portao') { portaoLargada(c); continue; }
    if (s.tipo === 'alcapao') { alcapao(c); continue; }
    if (s.tipo === 'mola') { desenhaMola(c, s); continue; }
    if (s.tipo === 'esteira') { desenhaEsteira(c, s, velEsteira(s, T, fz), s.vel); continue; }
    SK.seg(c, s);
  }
  if (ALC_Y > vis.y0 - 120 && ALC_Y < vis.y1 + 60) placaPortao(c, px ? false : undefined);
  SK.bichos(c, vis);
  SK.pegs(c, vis, dtR);
  maos.forEach((m, i) => { if (m.y < vis.y0 - 40 || m.y > vis.y1 + 40) return; const fecha = vb.some(o => (o.f & 1) && Math.abs(o.x - m.x) < 2 && Math.abs(o.y - m.y) < 30); SK.mao(c, m, altMao(i, T, fz), fecha, fz.maos[i]); });
  spins.forEach(s => {
    if (s.cy + s.L < vis.y0 || s.cy - s.L > vis.y1) return; const g = geoSpin(s, T, fz);
    if (s.tipo === 'barra') desenhaBarra(c, s, g); else if (s.tipo === 'pendulo') desenhaPendulo(c, s, g); else SK.spin(c, s, g.a, g.w);
  });

  // almas
  const vivos = rk.filter(r => !r.b.fim), ultimo = T >= 3 && vivos.length > 3 ? vivos[vivos.length - 1] : null;
  c.fillStyle = 'rgba(0,0,0,.32)';
  for (const o of vb) { if (!ativaV(o) && !(o.f & 1)) continue; if (o.y < vis.y0 || o.y > vis.y1) continue; elip(c, o.x + SX * .8, o.y + SY * .9, R * .95, R * .8); c.fill(); }
  c.globalCompositeOperation = 'lighter';
  for (const o of vb) {
    if (o.f & 2) { o.rastro = []; continue; }
    const ult = o.rastro[o.rastro.length - 1];
    if (ult && Math.hypot(ult.x - o.x, ult.y - o.y) > 80) o.rastro = [];
    if (!ult || Math.hypot(ult.x - o.x, ult.y - o.y) > 2) { o.rastro.push({ x: o.x, y: o.y }); if (o.rastro.length > 9) o.rastro.shift(); }
    if (o.y < vis.y0 || o.y > vis.y1 || o.rastro.length < 2) continue;
    for (let i = 1; i < o.rastro.length; i++) {
      const f = i / o.rastro.length; c.strokeStyle = rgba(o.dono === lider && T >= 3 ? SK.cor.lider : o.est.cor, 0.22 * f);
      c.lineWidth = R * 1.3 * f; c.lineCap = 'round'; c.beginPath(); c.moveTo(o.rastro[i - 1].x, o.rastro[i - 1].y); c.lineTo(o.rastro[i].x, o.rastro[i].y); c.stroke();
    }
  }
  c.globalCompositeOperation = 'source-over';
  for (const o of vb) {
    if ((o.f & 2) || o.y < vis.y0 || o.y > vis.y1 || o.x < vis.x0 - 30 || o.x > vis.x1 + 30) continue;
    if (o.dono === lider && T >= 3) brilho(c, () => luz(c, o.x, o.y, 26, SK.cor.lider, 0.35));
    if (o.dono === seguir || o.dono === rec.voce) { c.strokeStyle = o.dono === rec.voce ? '#ffffff' : '#c9adff'; c.lineWidth = 1.6; c.setLineDash([3, 3]); circ(c, o.x, o.y, R + 5); c.stroke(); c.setLineDash([]); }
    const sp = Math.hypot(o.vx, o.vy);
    const olha = T < 3 ? { x: 0, y: -1 } : sp > 30 ? { x: o.vx / sp, y: o.vy / sp } : { x: 0, y: 0 };
    const ph = o.i * 1.37;
    desenhaAlma(c, o.x, o.y, R, o.est, { expr: expressao(o, lider), lx: olha.x, ly: olha.y, t: T + ph, inc: clamp(o.vx / 1000, -0.35, 0.35), pisca: ((T + ph) % 3.3) < 0.11 });
    if (ultimo && ultimo.b === o) {
      c.strokeStyle = '#6b6158'; c.lineWidth = .8; c.beginPath(); c.moveTo(o.x + 7, o.y - 7); c.lineTo(o.x + 14, o.y + 1); c.stroke();
      brilho(c, () => luz(c, o.x + 14, o.y + 5, 16, '#ff5a3c', 0.5));
      c.fillStyle = '#2b2433'; c.fillRect(o.x + 11, o.y + 1, 6, 8); c.fillStyle = '#ff6a4a'; c.fillRect(o.x + 12, o.y + 2.5, 4, 5);
    }
  }

  // empurradores, atiradoras, projéteis, embaralhador
  FANTASMAS.forEach((f, i) => {
    const [fx, fy] = posFantasma(f, i, T, fz); if (fy < vis.y0 - 60 || fy > vis.y1 + 60) return;
    let perto = null, dm = 1e9; for (const o of vb) { if (!ativaV(o)) continue; const d = Math.hypot(o.x - fx, o.y - fy); if (d < dm) { dm = d; perto = o; } }
    SK.fantasma(c, fx, fy, fz.fantasmas[i], perto, i);
  });
  BRUXAS.forEach((w, i) => {
    const [wx, wy] = posBruxa(w, i, T, fz); if (wy < vis.y0 - 60 || wy > vis.y1 + 60) return;
    const [wx2] = posBruxa(w, i, T + 0.05, fz);
    let riso = -9; for (const p of rec.pocoes) { if (p.bruxa === i && p.t0 <= T) riso = p.t0; }
    SK.bruxa(c, wx, wy, wx2 >= wx ? 1 : -1, riso);
  });
  for (const p of rec.pocoes) {
    if (T < p.t0 || T >= p.tm) continue;
    const nS = Math.floor((T - p.t0) / STEP), x = p.x0 + p.vx * nS * STEP, y = p.y0 + p.vy * nS * STEP + GP * STEP * STEP * nS * (nS + 1) / 2;
    if (y < vis.y0 - 20 || y > vis.y1 + 20) continue;
    SK.pocao(c, x, y, p.tipo, (T - p.t0) * 12);
  }
  let dentro = [];
  if (CALD_Y + 170 > vis.y0 && CALD_Y - 150 < vis.y1) {
    dentro = vb.filter(o => (o.f & 2) && Math.abs(o.y - (CALD_Y + 40)) < 2);
    SK.caldeirao(c, dentro);
    placaCaldeirao(c, dentro, px ? false : undefined);
  }

  // partículas
  for (const p of parts) {
    p.vida += dtR; p.vx *= p.arr; p.vy = p.vy * p.arr + p.g * dtR; p.x += p.vx * dtR; p.y += p.vy * dtR; p.rot += dtR * 8;
    const a = 1 - p.vida / p.max; if (a <= 0) continue;
    c.globalCompositeOperation = p.luz ? 'lighter' : 'source-over'; c.globalAlpha = a; c.fillStyle = p.cor;
    if (p.forma === 'q') { c.save(); c.translate(p.x, p.y); c.rotate(px ? 0 : p.rot); c.fillRect(-p.tam, -p.tam * .5, p.tam * 2, p.tam); c.restore(); }
    else if (p.forma === 'b') { c.strokeStyle = p.cor; c.lineWidth = .9; circ(c, p.x + Math.sin(p.vida * 4 + p.rot) * 2, p.y, p.tam); c.stroke(); }
    else { circ(c, p.x, p.y, p.tam); c.fill(); }
  }
  c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  parts = parts.filter(p => p.vida < p.max);
  for (const an of aneis) { const d = T - an.t0; if (d < 0 || d > 0.5) continue; c.strokeStyle = rgba(an.cor, 0.6 * (1 - d / 0.5)); c.lineWidth = 3 * (1 - d / 0.5); circ(c, an.x, an.y, 10 + d * 160); c.stroke(); }
  aneis = aneis.filter(an => T - an.t0 <= 0.5 && T >= an.t0);

  // no mapa em pixel, a cena pequena é ampliada sem suavizar; nomes e placas ficam nítidos por cima
  if (px) {
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = false;
    ctx.drawImage(baixa, 0, 0, baixa.width, baixa.height, 0, 0, baixa.width * PX * dpr, baixa.height * PX * dpr);
    mundo(ctx);
    placasTrechos(ctx, vis);
    if (ALC_Y > vis.y0 - 120 && ALC_Y < vis.y1 + 60) placaPortao(ctx, true);
    if (CALD_Y + 170 > vis.y0 && CALD_Y - 150 < vis.y1) placaCaldeirao(ctx, dentro, true);
  }
  const cx2 = ctx;
  mundo(cx2);
  const realce = new Set(rk.slice(0, 3).map(r => r.b)); vb.forEach(o => { if (o.dono === seguir || o.dono === rec.voce) realce.add(o); });
  cx2.font = `600 ${11 / kk}px "IBM Plex Mono", monospace`; cx2.textAlign = 'center'; cx2.textBaseline = 'bottom';
  for (const o of realce) {
    if ((o.f & 2) || o.y < vis.y0 || o.y > vis.y1) continue;
    const pos = rk.findIndex(r => r.b === o), txt = (pos >= 0 && pos < 3 && T >= 3 ? `${pos + 1}º ` : '') + rec.nomes[o.dono];
    const tw = cx2.measureText(txt).width, by = o.y - R - 10 - (altoDemais(o.est) ? 12 : 0);
    cx2.fillStyle = 'rgba(16,12,21,.82)'; rr(cx2, o.x - tw / 2 - 4 / kk, by - 14 / kk, tw + 8 / kk, 15 / kk, 3 / kk); cx2.fill();
    cx2.fillStyle = o.dono === rec.voce ? '#ffffff' : pos === 0 ? SK.cor.lider : '#efe6d4';
    cx2.fillText(txt, o.x, by);
  }
  cx2.textAlign = 'left'; cx2.textBaseline = 'alphabetic';

  // tela
  const c3 = ctx;
  c3.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (SK.neblina) for (const nb of NEBLINA) {
    const x = ((nb.x + T * nb.v) % 1.4 - 0.2) * cw, y = nb.y * ch - (camY * 0.05 % 60);
    const gg = c3.createRadialGradient(x, y, 0, x, y, nb.r); gg.addColorStop(0, `rgba(200,190,220,${nb.a})`); gg.addColorStop(1, 'rgba(200,190,220,0)');
    c3.fillStyle = gg; c3.fillRect(x - nb.r, y - nb.r, nb.r * 2, nb.r * 2);
  }
  const vg = c3.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.35, cw / 2, ch / 2, Math.max(cw, ch) * 0.75); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.45)');
  c3.fillStyle = vg; c3.fillRect(0, 0, cw, ch);
  if (px) { c3.fillStyle = 'rgba(0,0,0,.12)'; for (let y = 0; y < ch; y += 3) c3.fillRect(0, y, cw, 1); }
  const mmx = cw - 14, mt = 18, mb = ch - 18, mh = mb - mt, my2 = y => mt + clamp(y / H, 0, 1) * mh;
  c3.strokeStyle = 'rgba(239,230,212,.14)'; c3.lineWidth = 3; c3.lineCap = 'round'; c3.beginPath(); c3.moveTo(mmx, mt); c3.lineTo(mmx, mb); c3.stroke();
  for (const tr of TRECHOS) { if (tr.y < 200) continue; c3.fillStyle = 'rgba(239,230,212,.3)'; c3.fillRect(mmx - 4, my2(tr.y), 8, 1); }
  c3.fillStyle = 'rgba(176,138,245,.25)'; c3.fillRect(mmx - 6, my2(camY), 12, Math.max(6, viewH / H * mh));
  c3.fillStyle = SK.cor.destaque; c3.fillRect(mmx - 7, my2(CHEGADA) - 1, 14, 2);
  for (const o of vb) { if (o.f & 2) continue; c3.fillStyle = o.est.cor; circ(c3, mmx, my2(o.y), o.dono === rec.voce ? 3.4 : 2.3); c3.fill(); if (o.dono === rec.voce) { c3.strokeStyle = '#fff'; c3.lineWidth = 1; c3.stroke(); } }
  const hud = px ? '"Press Start 2P", monospace' : '"IBM Plex Mono", monospace';
  if (T >= 3) {
    const ttxt = fmt((venceu ? rec.tVenc : T) - 3).slice(0, -2);
    c3.font = `600 ${px ? 11 : 13}px ${hud}`; const tw = c3.measureText(ttxt).width;
    c3.fillStyle = 'rgba(16,12,21,.7)'; rr(c3, 12, 12, tw + 18, 26, 6); c3.fill(); c3.fillStyle = '#efe6d4'; c3.fillText(ttxt, 21, 30);
    const tr = TRECHOS[trechoDe(alvo.y)];
    c3.font = `500 ${px ? 8 : 10}px ${hud}`; c3.fillStyle = '#c8bcd6'; c3.fillText((tr.tipo === 'caminhos' ? SK.ladosPlaca[alvo.x < DIV_X ? 0 : 1] : tr.nome).toUpperCase(), 14, 54);
  }
  c3.font = `500 ${px ? 7 : 10}px ${hud}`; c3.fillStyle = 'rgba(239,230,212,.55)'; c3.textAlign = 'right'; c3.fillText(MAPA.nome.toUpperCase(), cw - 28, ch - 14); c3.textAlign = 'left';
  if (escala < 0.6) {
    c3.font = `600 ${px ? 9 : 12}px ${hud}`; c3.textAlign = 'center'; c3.fillStyle = 'rgba(16,12,21,.75)'; rr(c3, cw / 2 - 74, 14, 148, 24, 12); c3.fill();
    c3.fillStyle = SK.cor.destaque; c3.fillText('● CÂMERA LENTA', cw / 2, 30); c3.textAlign = 'left';
    c3.fillStyle = 'rgba(0,0,0,.25)'; c3.fillRect(0, 0, cw, 22); c3.fillRect(0, ch - 22, cw, 22);
  }
  const fonteGrande = n => px ? `${n * 0.5}px "Press Start 2P", monospace` : `${n}px ${SK.fonte}`;
  if (T < 3) {
    const nn = Math.ceil(3 - T), frac = 1 - ((3 - T) % 1);
    c3.fillStyle = 'rgba(16,12,21,.45)'; c3.fillRect(0, ch / 2 - 66, cw, 132);
    c3.textAlign = 'center'; c3.textBaseline = 'middle';
    c3.font = fonteGrande(tocando ? 100 + frac * 30 : 80); c3.fillStyle = SK.cor.destaque;
    c3.globalAlpha = tocando ? 1 - frac * 0.6 : 1;
    c3.fillText(tocando || T > 0 ? String(Math.max(1, nn)) : 'Prontos?', cw / 2, ch / 2 + 4); c3.globalAlpha = 1;
    c3.textAlign = 'left'; c3.textBaseline = 'alphabetic';
  } else if (T - 3 < 0.8) {
    c3.globalAlpha = 1 - (T - 3) / 0.8; c3.textAlign = 'center'; c3.textBaseline = 'middle'; c3.font = fonteGrande(120); c3.fillStyle = SK.cor.destaque;
    c3.fillText('Já!', cw / 2, ch / 2); c3.globalAlpha = 1; c3.textAlign = 'left'; c3.textBaseline = 'alphabetic';
  }
  if (venceu && T - rec.tVenc < 8) {
    const a = Math.min(1, (T - rec.tVenc) * 3); c3.globalAlpha = a;
    c3.fillStyle = 'rgba(16,12,21,.88)'; c3.fillRect(0, 70, cw, 110);
    let wi = -1; for (let i = 0; i < rec.n; i++) if (rec.dono[i] === rec.vencedor && rec.tFim[i] > 0 && (wi < 0 || rec.tFim[i] < rec.tFim[wi])) wi = i;
    const est = rec.est[wi];
    c3.fillStyle = est.cor; c3.fillRect(0, 70, cw, 3); c3.fillRect(0, 177, cw, 3);
    const ax = Math.max(60, cw / 2 - 150);
    desenhaAlma(c3, ax, 128, 30, est, { expr: 'feliz', t: T, lx: 0, ly: 0 });
    c3.font = px ? `${Math.min(22, cw / 26)}px "Press Start 2P", monospace` : `${Math.min(50, cw / 10)}px ${SK.fonte}`; c3.fillStyle = '#efe6d4'; c3.textBaseline = 'middle';
    c3.fillText(`${rec.nomes[rec.vencedor]} venceu!`, ax + 46, 118);
    c3.font = '500 11px "IBM Plex Mono", monospace'; c3.fillStyle = '#c8bcd6';
    c3.fillText(`${MAPA.nome.toUpperCase()} · ${fmt(rec.tVenc - 3)} · ${rec.setores[rec.vencedor].toUpperCase()}`, ax + 48, 152);
    c3.textBaseline = 'alphabetic'; c3.globalAlpha = 1;
  }
  const foto = rec.foto;
  if (foto && foto.d2 >= 0 && foto.t2 - foto.t1 < 1 && T >= foto.t2 && T - foto.t2 < 9 && T - rec.tVenc > 1.2) {
    const a = Math.min(1, (T - foto.t2) * 3), bw = Math.min(cw - 32, 380), bh = 150, bx = 16, by = ch - bh - 16;
    c3.globalAlpha = a;
    c3.fillStyle = '#d9c8a2'; rr(c3, bx, by, bw, bh, 8); c3.fill(); c3.strokeStyle = '#6b5638'; c3.lineWidth = 2; c3.stroke();
    c3.save(); rr(c3, bx + 8, by + 26, bw * 0.55, bh - 34, 4); c3.clip();
    c3.fillStyle = '#b9a47c'; c3.fillRect(bx + 8, by + 26, bw * 0.55, bh - 34);
    const ly = by + 26 + (bh - 34) * 0.62, es = 1.9, x0 = bx + 8, ww = bw * 0.55;
    c3.fillStyle = '#4a3a26'; c3.fillRect(x0, ly, ww, 2);
    try { c3.filter = 'grayscale(1) sepia(.65) contrast(1.15)'; } catch (e) { }
    const vx = (foto.almas.find(o => o.vence) || { x: W / 2 }).x;
    for (const o of foto.almas) desenhaAlma(c3, x0 + ww / 2 + (o.x - vx) * es, ly + o.dy * es, R * es, o.est, { expr: o.vence ? 'feliz' : 'medo', t: T, lx: 0, ly: 1 });
    try { c3.filter = 'none'; } catch (e) { }
    c3.restore();
    c3.fillStyle = '#3a2c1a'; c3.font = '600 10px "IBM Plex Mono", monospace'; c3.fillText('FOTO DA CHEGADA', bx + 10, by + 17);
    const tx = bx + bw * 0.55 + 18;
    c3.font = '22px "Pirata One", Georgia, serif'; c3.fillText(`1º ${rec.nomes[foto.d1]}`, tx, by + 50);
    c3.font = '500 11px "IBM Plex Mono", monospace'; c3.fillText(fmt(foto.t1 - 3), tx, by + 66);
    c3.font = '22px "Pirata One", Georgia, serif'; c3.fillText(`2º ${rec.nomes[foto.d2]}`, tx, by + 98);
    c3.font = '500 11px "IBM Plex Mono", monospace'; c3.fillText(`+${(foto.t2 - foto.t1).toFixed(3).replace('.', ',')} s`, tx, by + 114);
    c3.globalAlpha = 1;
  }
  if (flash > 0) { c3.fillStyle = `rgba(235,228,255,${flash})`; c3.fillRect(0, 0, cw, ch); }
}


/* ================= letras de cada mapa ================= */
Object.assign(SKINS.mar, { fonte: '"Pirata One", Georgia, serif', fontePlaca: '"Pirata One", Georgia, serif' });
Object.assign(SKINS.espaco, { fonte: '"Orbitron", "IBM Plex Mono", sans-serif', fontePlaca: '"Orbitron", "IBM Plex Mono", sans-serif' });
Object.assign(SKINS.templo, { fonte: '"Cinzel Decorative", Georgia, serif', fontePlaca: '"Cinzel Decorative", Georgia, serif' });
Object.assign(SKINS.vulcao, { fonte: '"Metal Mania", Georgia, serif', fontePlaca: '"Metal Mania", Georgia, serif' });
const TIMBRE = { halloween: 'triangle', pixel: 'square', mar: 'sine', espaco: 'sawtooth', templo: 'triangle', vulcao: 'square' };
const RARIDADE = { halloween: '#ff8a2b', pixel: '#b08af5', mar: '#4cb8ff', espaco: '#ff4fd8', templo: '#ffd84d', vulcao: '#ff3b3b' };

/* ================= som (sintetizado na hora, sem arquivos) ================= */
const som = {
  ac: null, ligado: true, mestre: null, buf: null, ult: {},
  liga() {
    if (!this.ligado) return;
    try {
      if (!this.ac) {
        const A = window.AudioContext || window.webkitAudioContext; if (!A) return;
        this.ac = opcoes.audio || new A(); this.mestre = this.ac.createGain(); this.mestre.gain.value = 0.55; this.mestre.connect(this.ac.destination);
        const n = this.ac.sampleRate * 2, b = this.ac.createBuffer(1, n, this.ac.sampleRate), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; this.buf = b;
      }
      if (this.ac.state === 'suspended') this.ac.resume();
    } catch (e) { }
  },
  quieto: false,
  ok() { return !this.quieto && this.ligado && this.ac && this.ac.state === 'running'; },
  filtro(o, t, dur) { const f = this.ac.createBiquadFilter(); f.type = o.tipo || 'lowpass'; f.frequency.setValueAtTime(o.f, t); if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + dur); f.Q.value = o.q || 0.8; return f; },
  env(t, dur, v, atk) { const g = this.ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(v, 0.0002), t + atk); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); return g; },
  tom(f, dur, o = {}) {
    if (!this.ok()) return; const a = this.ac, t = o.at != null ? o.at : a.currentTime + (o.q || 0);
    const os = a.createOscillator(); os.type = o.tipo || 'sine'; os.frequency.setValueAtTime(f, t); if (o.f2) os.frequency.exponentialRampToValueAtTime(o.f2, t + dur);
    const g = this.env(t, dur, o.vol ?? 0.2, o.atk ?? 0.005); let no = os; if (o.filtro) { const fl = this.filtro(o.filtro, t, dur); os.connect(fl); no = fl; }
    no.connect(g); g.connect(o.dest || this.mestre); os.start(t); os.stop(t + dur + 0.05);
  },
  ruido(dur, o = {}) {
    if (!this.ok()) return; const a = this.ac, t = o.at != null ? o.at : a.currentTime + (o.q || 0);
    const s = a.createBufferSource(); s.buffer = this.buf; s.loop = true;
    const g = this.env(t, dur, o.vol ?? 0.15, o.atk ?? 0.005); let no = s; if (o.filtro) { const fl = this.filtro(o.filtro, t, dur); s.connect(fl); no = fl; }
    no.connect(g); g.connect(o.dest || this.mestre); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  },
  notas(lista, passo, o) { lista.forEach((f, i) => this.tom(f, o.dur || passo * 1.6, Object.assign({}, o, { q: (o.q || 0) + i * passo }))); },
  evento(e) {
    if (!this.ok() || vel > 2) return;
    const agora = performance.now(), lim = { bumper: 70, cospe: 90, faisca: 120, terra: 200, toque: 9e9, poeira: 9e9, engole: 120 }[e.tipo] ?? 60;
    if (agora - (this.ult[e.tipo] || 0) < lim) return; this.ult[e.tipo] = agora;
    const tb = TIMBRE[MAPA.id];
    if (e.tipo === 'bumper') this.tom(820 + Math.random() * 500, 0.07, { tipo: tb, vol: 0.045 });
    else if (e.tipo === 'explosao') { this.ruido(0.55, { vol: 0.22, filtro: { f: 1200, f2: 120 } }); this.tom(120, 0.35, { f2: 45, vol: 0.2 }); }
    else if (e.tipo === 'gosma') this.tom(260, 0.3, { f2: 80, vol: 0.12 });
    else if (e.tipo === 'cospe') this.tom(420, 0.1, { f2: 980, vol: 0.05, tipo: tb });
    else if (e.tipo === 'engole') this.tom(700, 0.12, { f2: 200, vol: 0.05 });
    else if (e.tipo === 'faisca') this.tom(2600, 0.08, { vol: 0.04, tipo: 'triangle' });
    else if (e.tipo === 'terra') this.ruido(0.18, { vol: 0.07, filtro: { f: 500 } });
    else if (e.tipo === 'portao' || e.tipo === 'alcapao') this.ruido(e.tipo === 'portao' ? 0.9 : 0.5, { vol: 0.12, filtro: { tipo: 'bandpass', f: 260, f2: 900, q: 6 } });
    else if (e.tipo === 'mola') this.tom(240, 0.18, { f2: 760, vol: 0.06, tipo: 'triangle' });
    else if (e.tipo === 'geiser') this.ruido(0.6, { vol: 0.12, atk: 0.04, filtro: { tipo: 'highpass', f: 900, f2: 2600 } });
    else if (e.tipo === 'chegada') this.notas([523, 659, 784, 1047, 784, 1047], 0.11, { tipo: tb, vol: 0.09, dur: 0.3 });
  },
  contagem(n) {
    if (n > 3) { this.tom(520, 0.1, { tipo: 'square', vol: 0.05 }); this.tom(95, 0.3, { f2: 50, vol: 0.22 }); }
    else if (n > 0) { this.tom(780, 0.2, { tipo: 'square', vol: 0.08 }); this.tom(85, 0.45, { f2: 42, vol: 0.35 }); this.ruido(0.3, { vol: 0.08, filtro: { f: 900 } }); }
    else { this.ruido(1.1, { vol: 0.18, atk: 0.4, filtro: { tipo: 'bandpass', f: 300, f2: 3000, q: 1 } }); this.notas([392, 523, 659, 784], 0.06, { tipo: 'triangle', vol: 0.07, dur: 0.9 }); }
  },
  torcida() { this.ruido(1.8, { vol: 0.09, atk: 0.35, filtro: { tipo: 'bandpass', f: 900, q: 0.6 } }); },
  pop() { this.tom(880 + Math.random() * 400, 0.06, { tipo: 'triangle', vol: 0.03 }); },
  bip(final) { const tb = TIMBRE[MAPA.id]; if (final) { this.tom(880, 0.5, { tipo: tb, vol: 0.14 }); this.tom(1320, 0.5, { tipo: 'sine', vol: 0.07 }); } else this.tom(587, 0.16, { tipo: tb, vol: 0.12 }); },
  tique(k) { this.tom(1400 + (k % 2) * 300, 0.035, { tipo: 'square', vol: 0.05 }); this.ruido(0.025, { vol: 0.05, filtro: { tipo: 'highpass', f: 3000 } }); },
  pouso() { this.tom(110, 0.6, { f2: 48, vol: 0.32 }); this.ruido(0.7, { vol: 0.18, filtro: { f: 2400, f2: 200 } }); this.notas([392, 523, 659, 784], 0.05, { tipo: 'triangle', vol: 0.07, dur: 1.1 }); },
};
const SOM_INTRO = {
  halloween() {
    som.ruido(2.8, { q: 0.25, vol: 0.42, atk: 0.02, filtro: { f: 700, f2: 70 } }); som.ruido(1.4, { q: 0.55, vol: 0.2, atk: 0.02, filtro: { f: 1200, f2: 100 } });
    for (const f of [110, 220, 261.6, 329.6]) som.tom(f, 3.4, { tipo: 'sawtooth', vol: 0.045, atk: 0.9, filtro: { f: 900 } });
    for (let k = 0; k < 7; k++) som.tom(760 - k * 30, 0.09, { q: 1.3 + k * 0.11, tipo: 'square', vol: 0.025, f2: 520 - k * 20 });
  },
  pixel() {
    som.notas([523, 659, 784, 1047], 0.1, { q: 0.62, tipo: 'square', vol: 0.06, dur: 0.12 });
    for (const f of [523, 659, 784]) som.tom(f, 0.6, { q: 1.05, tipo: 'square', vol: 0.04 });
    som.notas([988, 1319], 0.08, { q: 2.6, tipo: 'square', vol: 0.05, dur: 0.25 });
  },
  mar() {
    for (let k = 0; k < 16; k++) { const f = 280 + Math.random() * 520; som.tom(f, 0.13, { q: Math.random() * 1.8, f2: f * 2.4, vol: 0.05 }); }
    som.ruido(1.8, { vol: 0.14, atk: 0.6, filtro: { tipo: 'bandpass', f: 200, f2: 1600, q: 1.2 } });
    som.tom(150, 2.4, { q: 1.1, f2: 95, vol: 0.08, atk: 0.6 });
  },
  espaco() {
    som.tom(60, 1.25, { f2: 1500, tipo: 'sawtooth', vol: 0.06, atk: 0.3, filtro: { f: 400, f2: 5000 } });
    som.tom(80, 1, { q: 1.2, f2: 30, vol: 0.32 }); som.ruido(1.1, { q: 1.2, vol: 0.2, filtro: { f: 3000, f2: 100 } });
    som.notas([1047, 1319, 1568, 2093], 0.07, { q: 1.35, vol: 0.045, dur: 0.6 });
    som.tom(1800, 0.25, { q: 2.3, f2: 300, tipo: 'square', vol: 0.035 });
  },
  templo() {
    for (const q of [0, 0.3, 0.6, 1.0, 1.15, 2.6]) { som.tom(95, 0.42, { q, f2: 44, vol: 0.38 }); som.ruido(0.05, { q, vol: 0.08, filtro: { tipo: 'highpass', f: 2000 } }); }
    som.ruido(1.5, { q: 0.6, vol: 0.2, atk: 0.2, filtro: { f: 240 } });
    som.notas([587, 659, 784, 880, 784], 0.22, { q: 1.9, tipo: 'triangle', vol: 0.06, dur: 0.35 });
  },
  vulcao() {
    som.ruido(1.4, { vol: 0.3, atk: 0.4, filtro: { f: 160 } });
    som.tom(60, 1.3, { q: 1.2, f2: 28, vol: 0.42 }); som.ruido(1.5, { q: 1.2, vol: 0.3, filtro: { f: 2500, f2: 80 } });
    som.tom(240, 0.9, { q: 1.6, f2: 90, tipo: 'sawtooth', vol: 0.07, filtro: { f: 900 } });
    for (let k = 0; k < 12; k++) som.ruido(0.03, { q: 1.2 + Math.random() * 2, vol: 0.06, filtro: { tipo: 'highpass', f: 2000 } });
  },
};

/* ================= cartões dos mapas (a roleta e a galeria usam os mesmos) ================= */
const CARTOES = {};
function cartao(id, w, h) {
  const out = document.createElement('canvas'); out.width = w; out.height = h;
  const salvo = { SK, cw, ch, T, pegs: pegs.slice() }, sk = SKINS[id], px = sk.pixel;
  const alvo = px ? document.createElement('canvas') : out; if (px) { alvo.width = Math.ceil(w / 3); alvo.height = Math.ceil(h / 3); }
  const c = alvo.getContext('2d'); if (px) c.scale(1 / 3, 1 / 3);
  SK = sk; cw = w; ch = h; T = 4.2;
  try {
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, sk.bg.salao[0]); g.addColorStop(1, sk.bg.caminhos[1]); c.fillStyle = g; c.fillRect(0, 0, w, h);
    sk.ceu(c, { camY: 0, raios: [], venceu: false, piscaLua: false });
    const rs = (() => { const r = mulberry32(77 + id.length); return Array.from({ length: 14 }, () => [r(), r(), r()]); })();
    c.save(); c.fillStyle = sk.cor.longe; c.strokeStyle = sk.cor.longe; sk.longe(c, 'salao', h * 0.9, 0, rs, 5); c.restore();
    const k = w / 400; c.save(); c.scale(k, k);
    pegs.length = 0;
    pegs.push({ x: 50, y: 214, r: 13, tipo: 'cristal', bumper: true, brilho: .6 }, { x: 352, y: 204, r: 13, tipo: 'cristal', brilho: 0 }, { x: 196, y: 226, r: 13, tipo: 'abobora', bumper: true, brilho: 1 }, { x: 122, y: 236, r: 8, tipo: 'lapide', brilho: 0 }, { x: 282, y: 238, r: 8, tipo: 'osso', brilho: 0 }, { x: 34, y: 118, r: 18, tipo: 'lapideG', txt: sk.epitafios[1], brilho: 0 });
    const vbSalvo = vb.slice(); vb.length = 0;
    sk.pegs(c, { y0: -999, y1: 9999 }, 0);
    vb.push(...vbSalvo);
    sk.mao(c, { x: 330, y: 236 }, 1, false, 0);
    sk.bruxa(c, 300, 66, -1, -9);
    fantasmaBu[0] = -9; sk.fantasma(c, 110, 84, 0, { x: 160, y: 150 }, 0);
    const mods = [{ cor: '#ff6fb5', modelo: 'gato', acessorio: 'laco' }, { cor: '#7fd3ff', modelo: 'classica', acessorio: 'oculos' }, { cor: '#ffd84d', modelo: 'coelho', acessorio: 'nenhum' }, { cor: '#8fe36b', modelo: 'polvo', acessorio: 'coroa' }];
    [[170, 156, 'feliz'], [214, 128, 'medo'], [248, 170, 'normal'], [140, 190, 'tonta']].forEach(([x, y, expr], i) => desenhaAlma(c, x, y, 13, mods[i], { expr, t: i, lx: .4, ly: .3 }));
    c.restore();
  } catch (e) { }
  pegs.length = 0; pegs.push(...salvo.pegs); SK = salvo.SK; cw = salvo.cw; ch = salvo.ch; T = salvo.T;
  if (px) { const o = out.getContext('2d'); o.imageSmoothingEnabled = false; o.drawImage(alvo, 0, 0, w, h); }
  const v = out.getContext('2d'), vg = v.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, w * 0.7); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.45)'); v.fillStyle = vg; v.fillRect(0, 0, w, h);
  return out;
}
const cartaoDe = id => CARTOES[id] || (CARTOES[id] = cartao(id, 480, 300));

/* ================= a cerimônia: roleta de mapas e a abertura do sorteado ================= */
const ovl = opcoes.cerimonia;
let cerimonia = true, cparts = [], octx = ovl.getContext('2d');
function medirCerimonia() { ovl.width = Math.round(cw * dpr); ovl.height = Math.round(ch * dpr); }
const easeOut4 = u => 1 - Math.pow(1 - clamp(u, 0, 1), 4);
const easeInOut = u => { u = clamp(u, 0, 1); return u < .5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2; };
const easeBack = u => { u = clamp(u, 0, 1); const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2); };
// Sem contagem desde 20/10/2026 (pedido do Cleber): a largada do lobby já é a contagem, e a roleta do mapa entra direto.
const DUR = { contagem: 0, caixa: 7.2, pouso: 1.9, intro: 3.8, saida: 0.55 };
const fonteMapa = (id, px) => SKINS[id].pixel ? `${Math.round(px * 0.48)}px "Press Start 2P", monospace` : `${Math.round(px)}px ${SKINS[id].fonte}`;
function capa(c, img, w, h, z, a) {
  const s = Math.max(w / img.width, h / img.height) * z, iw = img.width * s, ih = img.height * s;
  c.globalAlpha = a; c.drawImage(img, (w - iw) / 2, (h - ih) / 2, iw, ih); c.globalAlpha = 1;
}
function soltaC(n, x, y, o) {
  for (let i = 0; i < n; i++) { const a = o.ang != null ? o.ang + (Math.random() - .5) * (o.abre || 6.28) : Math.random() * 6.28, v = o.v * (0.3 + Math.random()); cparts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v + (o.vy || 0), g: o.g || 0, vida: 0, max: o.vida * (0.6 + Math.random() * .8), cor: o.cor[Math.floor(Math.random() * o.cor.length)], tam: o.tam * (0.6 + Math.random() * .8), forma: o.forma || 'c', rot: Math.random() * 6, arr: o.arr || 0.99 }); }
}
function desenhaCParts(c, dt) {
  for (const p of cparts) {
    p.vida += dt; p.vx *= p.arr; p.vy = p.vy * p.arr + p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += dt * 6;
    const a = 1 - p.vida / p.max; if (a <= 0) continue; c.globalAlpha = a; c.fillStyle = p.cor;
    if (p.forma === 'q') { c.save(); c.translate(p.x, p.y); c.rotate(p.rot); c.fillRect(-p.tam, -p.tam / 2, p.tam * 2, p.tam); c.restore(); }
    else if (p.forma === 'b') { c.strokeStyle = p.cor; c.lineWidth = 1.4; circ(c, p.x, p.y, p.tam); c.stroke(); }
    else if (p.forma === 'e') { estrela(c, p.x, p.y, p.tam, p.tam * .4, 4, p.rot); c.fill(); }
    else { circ(c, p.x, p.y, p.tam); c.fill(); }
  }
  c.globalAlpha = 1; cparts = cparts.filter(p => p.vida < p.max);
}
function luzes(c, w, h, fase, cores) {
  const n = Math.max(10, Math.floor(w / 30));
  for (const y of [h * 0.1, h * 0.9]) for (let k = 0; k < n; k++) {
    const x = (k + 0.5) / n * w, on = (k + Math.floor(fase)) % 3 === 0, cor = cores[k % cores.length];
    c.fillStyle = on ? cor : rgba(cor, .18); circ(c, x, y, 4.2); c.fill();
    if (on) { c.globalCompositeOperation = 'lighter'; luz(c, x, y, 16, cor, .45); c.globalCompositeOperation = 'source-over'; }
  }
}
/* as aberturas: uma para cada mapa */
const rFixo = mulberry32(2026);
const BATS = Array.from({ length: 26 }, () => ({ a: rFixo() * 6.28, v: 120 + rFixo() * 260, s: 1.2 + rFixo() * 1.6, f: rFixo() * 6 }));
const BOLHAS = Array.from({ length: 80 }, () => ({ x: rFixo(), v: 160 + rFixo() * 380, r: 3 + rFixo() * 14, d: rFixo() * 0.8, f: rFixo() * 6 }));
const WARP = Array.from({ length: 180 }, () => ({ a: rFixo() * 6.28, r0: 10 + rFixo() * 60 }));
function tituloIntro(c, w, h, id, t0, t, o = {}) {
  const u = clamp((t - t0) / 0.5, 0, 1); if (u <= 0) return;
  const m = MAPAS.find(x => x.id === id);
  let tam = Math.min(w / (SKINS[id].pixel ? 9 : 8.2), 92);
  c.save(); c.font = fonteMapa(id, tam); const larg = c.measureText(m.nome).width; if (larg > w * 0.86) tam *= w * 0.86 / larg;
  tam *= easeBack(u);
  c.globalAlpha = (o.alfa ?? 1) * clamp(u * 2, 0, 1); c.textAlign = 'center'; c.textBaseline = 'middle';
  c.font = fonteMapa(id, Math.max(1, tam));
  if (o.cromatico) { c.globalCompositeOperation = 'lighter'; c.fillStyle = 'rgba(255,60,180,.7)'; c.fillText(m.nome, w / 2 - 4, h * .46); c.fillStyle = 'rgba(60,240,255,.7)'; c.fillText(m.nome, w / 2 + 4, h * .46); c.globalCompositeOperation = 'source-over'; }
  c.shadowColor = o.brilho || SKINS[id].cor.destaque; c.shadowBlur = 28;
  c.fillStyle = o.cor || '#fff6e6';
  if (o.letras) { const lt = [...m.nome], tw = c.measureText(m.nome).width; let x = w / 2 - tw / 2; c.textAlign = 'left'; lt.forEach((ch2, i) => { c.fillText(ch2, x, h * .46 + o.letras(i)); x += c.measureText(ch2).width; }); }
  else c.fillText(m.nome, w / 2, h * .46);
  c.shadowBlur = 0;
  c.font = '600 12px "IBM Plex Mono", monospace'; c.fillStyle = 'rgba(239,230,212,.85)'; c.fillText(`MAPA SORTEADO · ${m.tema.toUpperCase()}`, w / 2, h * .46 + tam * 0.75);
  c.restore();
}
function prontas(c, w, h, t, id) {
  if (t < DUR.intro - 1.1) return;
  const on = Math.floor(t * 4) % 2 === 0; if (!on) return;
  c.textAlign = 'center'; c.fillStyle = SKINS[id].cor.destaque; c.font = SKINS[id].pixel ? '12px "Press Start 2P", monospace' : '600 13px "IBM Plex Mono", monospace';
  c.fillText(SKINS[id].pixel ? 'PRONTO?' : 'PREPARE-SE PARA A LARGADA', w / 2, h * 0.86); c.textAlign = 'left';
}
const INTRO = {
  halloween(c, w, h, t, img, dt) {
    c.fillStyle = '#050307'; c.fillRect(0, 0, w, h);
    capa(c, img, w, h, 1.04 + t * 0.03, clamp((t - 0.25) / 0.6, 0, 1));
    c.fillStyle = 'rgba(5,3,8,.45)'; c.fillRect(0, 0, w, h);
    for (const b of BATS) { const d = Math.max(0, t - 0.3) * b.v; if (d <= 0) continue; desenhaMorcego(c, w / 2 + Math.cos(b.a) * d, h * .45 + Math.sin(b.a) * d * .7, b.s, t * 22 + b.f, true); }
    let fl = 0; for (const [a, b] of [[0.25, 0.36], [0.55, 0.63]]) if (t >= a && t < b) fl = 0.8 * (1 - (t - a) / (b - a));
    if (t >= 0.25 && t < 0.4) { const r3 = mulberry32(5); let x = w * .72, y = 0; c.strokeStyle = 'rgba(240,230,255,.95)'; c.lineWidth = 3; c.beginPath(); c.moveTo(x, y); while (y < h * .75) { x += (r3() - .5) * 70; y += 24 + r3() * 30; c.lineTo(x, y); } c.stroke(); }
    const pis = t > 0.3 && t < 0.9 ? (Math.sin(t * 60) > 0 ? 1 : 0.3) : 1;
    tituloIntro(c, w, h, 'halloween', 0.3, t, { cor: '#ff8a2b', brilho: '#ff8a2b', alfa: pis });
    if (fl) { c.fillStyle = `rgba(235,228,255,${fl})`; c.fillRect(0, 0, w, h); }
    prontas(c, w, h, t, 'halloween');
  },
  pixel(c, w, h, t, img) {
    c.fillStyle = '#0a0618'; c.fillRect(0, 0, w, h);
    const tam = 24, cols = Math.ceil(w / tam), rows = Math.ceil(h / tam), u = clamp((t - 0.05) / 0.55, 0, 1);
    c.save(); c.beginPath(); for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { if ((hashStr(i + ':' + j) % 1000) / 1000 < u) c.rect(i * tam, j * tam, tam, tam); } c.clip();
    c.imageSmoothingEnabled = false; capa(c, img, w, h, 1.02 + t * 0.02, 1); c.restore();
    c.fillStyle = 'rgba(10,6,24,.5)'; c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(0,0,0,.25)'; for (let y = 0; y < h; y += 3) c.fillRect(0, y, w, 1);
    const ch2 = sprite('chefona', BRUXA_PX, PAL_CHEFONA); pinta(c, ch2, -150 + t * (w + 300) / DUR.intro, h * .22 + Math.sin(t * 3) * 10, 6, false);
    pinta(c, sprite('zumbi', ZUMBI, PAL_ZUMBI), w * .14, h * .7 + Math.round(Math.sin(t * 8)) * 3, 4);
    pinta(c, sprite('bruxa', BRUXA_PX, PAL_BRUXA), w * .86, h * .3 + Math.round(Math.sin(t * 5)) * 4, 4, true);
    const nome = 'CAÇA PIXELADA', n = clamp(Math.floor((t - 0.65) / 0.07), 0, nome.length);
    if (n !== INTRO.pixel.n) { if (n > (INTRO.pixel.n || 0)) som.tom(880 + n * 30, 0.04, { tipo: 'square', vol: 0.04 }); INTRO.pixel.n = n; }
    const fs = Math.min(w / 15, 40); c.font = `${fs}px "Press Start 2P", monospace`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = '#3a1a08'; c.fillText(nome.slice(0, n), w / 2 + 4, h * .46 + 4); c.fillStyle = '#ffe14d'; c.fillText(nome.slice(0, n), w / 2, h * .46);
    if (n === nome.length && Math.floor(t * 3) % 2 === 0) { c.font = '12px "Press Start 2P", monospace'; c.fillStyle = '#ffffff'; c.fillText('MAPA SORTEADO · PIXEL ART', w / 2, h * .46 + fs * 1.4); }
    c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    prontas(c, w, h, t, 'pixel');
  },
  mar(c, w, h, t, img) {
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#0e4a66'); g.addColorStop(1, '#04121e'); c.fillStyle = g; c.fillRect(0, 0, w, h);
    capa(c, img, w, h, 1.12 - t * 0.02, clamp((t - 0.4) / 0.9, 0, 1));
    c.fillStyle = 'rgba(4,30,50,.35)'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 5; i++) { const x = ((i + .5) / 5 + Math.sin(t * .4 + i * 2) * .05) * w; const gg = c.createLinearGradient(0, 0, 0, h); gg.addColorStop(0, 'rgba(190,240,255,.16)'); gg.addColorStop(1, 'rgba(190,240,255,0)'); c.fillStyle = gg; c.beginPath(); c.moveTo(x - 20, 0); c.lineTo(x + 20, 0); c.lineTo(x + 120, h); c.lineTo(x - 80, h); c.closePath(); c.fill(); }
    for (const b of BOLHAS) { const y = h + 40 - (t - b.d) * b.v; if (t < b.d || y < -40) continue; c.strokeStyle = 'rgba(220,250,255,.75)'; c.lineWidth = 1.5; circ(c, b.x * w + Math.sin(t * 3 + b.f) * 8, y, b.r); c.stroke(); c.fillStyle = 'rgba(255,255,255,.6)'; circ(c, b.x * w - b.r * .35 + Math.sin(t * 3 + b.f) * 8, y - b.r * .35, b.r * .2); c.fill(); }
    tituloIntro(c, w, h, 'mar', 0.7, t, { cor: '#ffe8a0', brilho: '#7fd3ff', letras: i => Math.sin(t * 4 + i * 0.7) * 7 });
    prontas(c, w, h, t, 'mar');
  },
  espaco(c, w, h, t, img) {
    c.fillStyle = '#020208'; c.fillRect(0, 0, w, h);
    if (t > 1.15) capa(c, img, w, h, 1.35 - easeOut4((t - 1.15) / 1.2) * 0.3, clamp((t - 1.15) / 0.4, 0, 1));
    c.fillStyle = 'rgba(2,2,8,.35)'; c.fillRect(0, 0, w, h);
    const vw = Math.pow(clamp(t / 1.2, 0, 1), 2.4) * Math.max(w, h);
    if (t < 1.5) for (const s of WARP) { const r = s.r0 + vw * (0.4 + s.r0 / 70), r2 = r * (1 + clamp(t / 1.2, 0, 1) * 0.6); const a = t < 1.2 ? 1 : 1 - (t - 1.2) / 0.3; c.strokeStyle = `rgba(200,240,255,${0.8 * a})`; c.lineWidth = 1.4; c.beginPath(); c.moveTo(w / 2 + Math.cos(s.a) * r, h / 2 + Math.sin(s.a) * r); c.lineTo(w / 2 + Math.cos(s.a) * r2, h / 2 + Math.sin(s.a) * r2); c.stroke(); }
    if (t >= 1.15 && t < 1.6) { c.fillStyle = `rgba(220,250,255,${0.85 * (1 - (t - 1.15) / 0.45)})`; c.fillRect(0, 0, w, h); }
    if (t > 1.2) tituloIntro(c, w, h, 'espaco', 1.2, t, { cor: '#eaffff', brilho: '#5ff0f0', cromatico: true });
    prontas(c, w, h, t, 'espaco');
  },
  templo(c, w, h, t, img) {
    c.fillStyle = '#0a0804'; c.fillRect(0, 0, w, h);
    capa(c, img, w, h, 1.1 - t * 0.02, 1);
    c.fillStyle = 'rgba(10,8,4,.35)'; c.fillRect(0, 0, w, h);
    tituloIntro(c, w, h, 'templo', 1.3, t, { cor: '#f2d26a', brilho: '#ff9a3c' });
    const ab = easeInOut((t - 0.6) / 1.3) * (w / 2 + 20), tremor = t > 0.6 && t < 1.9 ? (Math.random() - .5) * 3 : 0;
    for (const sg of [-1, 1]) {
      c.save(); c.translate(sg < 0 ? -ab + tremor : w / 2 + ab + tremor, 0);
      const g = c.createLinearGradient(0, 0, w / 2, 0); g.addColorStop(0, sg < 0 ? '#5a5444' : '#6e6854'); g.addColorStop(1, sg < 0 ? '#6e6854' : '#4a4436'); c.fillStyle = g; c.fillRect(0, 0, w / 2, h);
      c.strokeStyle = 'rgba(20,16,8,.5)'; c.lineWidth = 2; for (let y = 40; y < h; y += 60) { c.beginPath(); c.moveTo(0, y); c.lineTo(w / 2, y); c.stroke(); }
      for (let k = 0; k < 5; k++) { c.strokeRect(20 + (k % 2) * 40, 60 + k * 70, 30, 30); }
      c.fillStyle = '#c8a050'; c.beginPath(); c.arc(sg < 0 ? w / 2 : 0, h / 2, Math.min(w, h) * 0.16, sg < 0 ? Math.PI / 2 : -Math.PI / 2, sg < 0 ? Math.PI * 1.5 : Math.PI / 2); c.fill();
      c.fillStyle = '#7a5a20'; c.beginPath(); c.arc(sg < 0 ? w / 2 : 0, h / 2, Math.min(w, h) * 0.09, sg < 0 ? Math.PI / 2 : -Math.PI / 2, sg < 0 ? Math.PI * 1.5 : Math.PI / 2); c.fill();
      c.restore();
    }
    if (t > 0.6 && t < 2) soltaC(2, w / 2 + (Math.random() - .5) * ab * 2, 0, { v: 40, vy: 160, g: 200, vida: 1.2, cor: ['#c8b080', '#8a7a60'], tam: 2 });
    for (const x of [w * .06, w * .94]) { c.fillStyle = '#4a3018'; c.fillRect(x - 4, h * .3, 8, 40); const fg = c.createRadialGradient(x, h * .28, 0, x, h * .28, 18); fg.addColorStop(0, '#fff6c8'); fg.addColorStop(.5, '#ff8a2b'); fg.addColorStop(1, 'rgba(255,80,20,0)'); c.fillStyle = fg; elip(c, x + Math.sin(t * 20) * 2, h * .28, 10, 18); c.fill(); }
    prontas(c, w, h, t, 'templo');
  },
  vulcao(c, w, h, t, img) {
    const rg = mulberry32(Math.floor(t * 30) + 7), forca = t < 1.25 ? t * 4 : Math.max(0, 6 - (t - 1.25) * 6), sx = (rg() - .5) * forca, sy = (rg() - .5) * forca;
    c.save(); c.translate(sx, sy);
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#1a0604'); g.addColorStop(1, '#3a0e04'); c.fillStyle = g; c.fillRect(-10, -10, w + 20, h + 20);
    capa(c, img, w, h, 1.12 - t * 0.02, clamp((t - 1.3) / 0.6, 0, 1));
    c.fillStyle = 'rgba(20,4,2,.35)'; c.fillRect(-10, -10, w + 20, h + 20);
    const vx = w / 2, vy = h * 0.98, topo = h * 0.62;
    c.fillStyle = '#120604'; c.beginPath(); c.moveTo(vx - w * .45, vy); c.lineTo(vx - 50, topo); c.lineTo(vx + 50, topo); c.lineTo(vx + w * .45, vy); c.closePath(); c.fill();
    c.globalCompositeOperation = 'lighter'; luz(c, vx, topo, 120 + forca * 20, '#ff5a10', 0.5); c.globalCompositeOperation = 'source-over';
    for (let k = 0; k < 6; k++) { const y = topo - 20 - ((t * 60 + k * 30) % 200); c.fillStyle = 'rgba(40,30,30,.5)'; elip(c, vx + Math.sin(t + k) * 24, y, 34 + k * 5, 16); c.fill(); }
    if (t >= 1.2 && !INTRO.vulcao.estourou) { INTRO.vulcao.estourou = true; soltaC(120, vx, topo, { v: 720, g: 700, vida: 2.4, cor: ['#ff8a2b', '#ffd070', '#ff3b1b', '#fff2b0'], tam: 5, ang: -Math.PI / 2, abre: 1.6 }); }
    c.restore();
    if (t >= 1.2 && t < 1.55) { c.fillStyle = `rgba(255,150,60,${0.7 * (1 - (t - 1.2) / 0.35)})`; c.fillRect(0, 0, w, h); }
    const fogo = c.createLinearGradient(0, h * .38, 0, h * .54); fogo.addColorStop(0, '#fff2b0'); fogo.addColorStop(.5, '#ff8a2b'); fogo.addColorStop(1, '#c8201a');
    tituloIntro(c, w, h, 'vulcao', 1.35, t, { cor: fogo, brilho: '#ff5a10' });
    prontas(c, w, h, t, 'vulcao');
  },
};

/* ================= o que vem do sistema: a corrida, as pessoas e o relógio do banco ================= */
let agoraFn = () => performance.now() / 1000;
/** Segundos no relógio do banco (o React acerta a diferença com o `agora` de cada resposta). */
const agoraS = () => agoraFn();
let GENTE = [], PESSOA = new Map(), EU = null;
const CORRIDA = { id: 0, premio: '', estado: 'nada', abertaEm: 0, iniciaEm: null, entrou: new Map(), escolhidoEm: new Map() };
let VIDEOS = null;      // { festa, loop, cues, dur } — os vídeos do fim, já baixados
let entrei = false;     // a pessoa clicou em «Assistir» (o som só toca depois de um clique)
const corredores = () => GENTE.filter(p => p.corre);
const chamados = () => GENTE;
const ordemSetores = () => [...new Set(GENTE.map(p => p.setor))];
const CORES_GENTE = ['#e0603a', '#3a8ad0', '#3ab07a', '#a05ad0', '#d0a03a', '#d04a7a', '#4ab0b0', '#7a6ad8', '#c87a3a', '#5a9a3a'];
const corPessoa = p => CORES_GENTE[hashStr(p.nome + p.setor) % CORES_GENTE.length];
const iniciais = nome => {
  const partes = String(nome || '?').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().split(/\s+/);
  return ((partes[0] || '?')[0] + (partes.length > 1 ? partes[partes.length - 1][0] : (partes[0][1] || ''))).toUpperCase();
};
const COR_SETOR = {};
function narraLobby() { /* o painel do sistema mostra quem entrou; aqui não há lista */ }

/* as fotos de perfil: cada uma vira uma bolinha pronta (desenhada uma vez), com as iniciais enquanto a foto não chega */
const fotos = new Map();
function fotoDe(url) {
  if (!url) return null;
  let f = fotos.get(url);
  if (!f) {
    const img = new Image(); img.crossOrigin = 'anonymous'; img.decoding = 'async';
    f = { img, ok: false, erro: false, espera: [] };
    img.onload = () => { f.ok = true; sprites.clear(); f.espera.splice(0).forEach(r => r(true)); };
    img.onerror = () => { f.erro = true; f.espera.splice(0).forEach(r => r(false)); };
    img.src = url; fotos.set(url, f);
  }
  return f;
}
/** Espera a foto carregar (até `ms`): a festa gravada em vídeo precisa da foto de quem venceu. */
function esperaFoto(url, ms) {
  const f = fotoDe(url); if (!f || f.ok || f.erro) return Promise.resolve(!!(f && f.ok));
  return Promise.race([new Promise(r => f.espera.push(r)), new Promise(r => setTimeout(() => r(false), ms))]);
}
const sprites = new Map();
function spriteAvatar(p, r) {
  const k = `${p.id}|${Math.round(r * 2)}|${p.voce ? 1 : 0}|${Math.round(dpr * 2)}`;
  let s = sprites.get(k); if (s) return s;
  const f = fotoDe(p.foto), comFoto = f && f.ok, E = Math.max(1, dpr), lado = Math.ceil((r * 2 + 6) * E);
  s = document.createElement('canvas'); s.width = s.height = lado;
  const c = s.getContext('2d'); c.scale(E, E); c.translate(r + 3, r + 3);
  if (comFoto) {
    c.save(); circ(c, 0, 0, r); c.clip();
    const im = f.img, lado2 = Math.min(im.naturalWidth || im.width, im.naturalHeight || im.height) || 1;
    try { c.drawImage(im, ((im.naturalWidth || im.width) - lado2) / 2, ((im.naturalHeight || im.height) - lado2) / 2, lado2, lado2, -r, -r, r * 2, r * 2); } catch (e) { c.fillStyle = corPessoa(p); c.fillRect(-r, -r, r * 2, r * 2); }
    c.restore();
  } else {
    c.fillStyle = corPessoa(p); circ(c, 0, 0, r); c.fill();
    c.fillStyle = 'rgba(255,255,255,.18)'; c.beginPath(); c.arc(0, 0, r, Math.PI * 1.1, Math.PI * 1.9); c.fill();
    c.fillStyle = '#fff'; c.font = `600 ${Math.max(6, r * 0.78)}px Rubik, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(iniciais(p.nome), 0, 0.5);
  }
  c.strokeStyle = p.voce ? '#ffd84d' : 'rgba(255,255,255,.45)'; c.lineWidth = p.voce ? 2.4 : 1.2; circ(c, 0, 0, r); c.stroke();
  // quando a foto chega, `sprites.clear()` (no onload) troca as iniciais por ela
  sprites.set(k, s);
  return s;
}
function desenhaAvatar(c, x, y, r, p, escala) {
  if (escala <= 0.01) return;
  c.save(); c.translate(x, y); c.scale(escala, escala);
  c.fillStyle = 'rgba(0,0,0,.35)'; elip(c, 1.5, r * .9, r * .9, r * .3); c.fill();
  c.drawImage(spriteAvatar(p, r), -r - 3, -r - 3, r * 2 + 6, r * 2 + 6);
  c.restore();
}

/* ================= o fim: replay da chegada e a festa do vencedor ================= */
let festa = null, festaFeita = false;
const N_ROTINAS = 8;
const VEL_REPLAY = 0.6, SEG_ROTINA = 2.8, ENTRADA = 0.9, N_SHOW = 5;
const fimAoVivo = () => rec.tVenc + 2;
function podio() {
  const melhor = new Map();
  for (let i = 0; i < rec.n; i++) { const t = rec.tFim[i]; if (t > 0) { const d = rec.dono[i]; if (!melhor.has(d) || melhor.get(d).t > t) melhor.set(d, { t, i }); } }
  return [...melhor.entries()].sort((a, b) => a[1].t - b[1].t).slice(0, 3).map(([d, v]) => ({ dono: d, est: rec.est[v.i], t: v.t }));
}
function novaFesta(t0) {
  const rg = mulberry32(rec.seed ^ 0x2f6b), ordem = Array.from({ length: N_ROTINAS }, (_, i) => i);
  for (let i = ordem.length - 1; i > 0; i--) { const j = Math.floor(rg() * (i + 1)); [ordem[i], ordem[j]] = [ordem[j], ordem[i]]; }
  return { fase: 'replay', t0, T0: Math.max(3, rec.tVenc - 3.5), T1: rec.tVenc + 0.6, rotinas: ordem.slice(0, N_SHOW), salvo: { seguir, modoCam }, pod: podio(), giro: rg() < .5 ? 1 : -1, seg: -1, premio: CORRIDA.premio, pessoa: PESSOA.get((rec.ids || [])[rec.vencedor]) || { id: 'vencedor', nome: rec.nomes[rec.vencedor], setor: rec.setores[rec.vencedor] } };
}
function replayQuadro(agora, dt) {
  const el = (agora - festa.t0) / 1000;
  T = Math.min(festa.T1, festa.T0 + el * VEL_REPLAY);
  desenhar(dt * VEL_REPLAY);
  const c = ctx; c.setTransform(dpr, 0, 0, dpr, 0, 0);
  const faixa = Math.round(ch * 0.07); c.fillStyle = 'rgba(0,0,0,.85)'; c.fillRect(0, 0, cw, faixa); c.fillRect(0, ch - faixa, cw, faixa);
  c.fillStyle = Math.floor(el * 2) % 2 ? '#ff4d5e' : '#7a1a24'; circ(c, 22, faixa / 2, 6); c.fill();
  c.fillStyle = '#fff6e6'; c.font = '600 14px "IBM Plex Mono", monospace'; c.textBaseline = 'middle'; c.fillText('REPLAY', 36, faixa / 2 + 1);
  c.textAlign = 'right'; c.fillStyle = '#a99db5'; c.font = '500 11px "IBM Plex Mono", monospace'; c.fillText(`CÂMERA LENTA · ${Math.round(VEL_REPLAY * 100)}%`, cw - 16, faixa / 2 + 1);
  c.textAlign = 'center'; c.fillStyle = '#efe6d4'; c.font = `${Math.min(22, cw / 26)}px "Pirata One", Georgia, serif`; c.fillText(`A chegada de ${rec.nomes[rec.vencedor]}`, cw / 2, ch - faixa / 2);
  c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  if (T >= festa.T1) { festa.fase = 'festa'; festa.t1 = agora; somFesta('pouso'); soltaC(140, cw / 2, ch * .62, { v: 620, g: 520, vida: 2.2, cor: [RARIDADE[MAPA.id], '#ffd84d', '#ffffff', '#b08af5', '#8fe36b'], tam: 4.5, forma: 'q' }); }
}
/* cada rotina começa e termina no centro do palco; u vai de 0 a 1 */
function pose(i, u, C, L, R, G, r, h, giro) {
  const p = { x: C, y: G, rot: 0, s: 1, sx: 1, sy: 1, flip: false, expr: 'feliz', lx: 0.6 };
  const pulinho = a => Math.abs(Math.sin(u * Math.PI * a));
  if (i === 0) { const ph = u * Math.PI * 4; p.x = C + Math.sin(ph) * (R - C); const v = Math.cos(ph); p.flip = v < 0; p.lx = 0.9; p.y = G - pulinho(16) * r * 0.35; p.rot = 0.18; }
  else if (i === 1) { const a = Math.sin(u * Math.PI); p.y = G - a * h * 0.22; p.rot = easeInOut(clamp((u - 0.15) / 0.7, 0, 1)) * Math.PI * 2 * giro; p.sy = u < 0.12 ? 1 - Math.sin(u / 0.12 * Math.PI) * 0.25 : 1; p.sx = 2 - p.sy; p.expr = u > 0.3 && u < 0.7 ? 'tonta' : 'feliz'; }
  else if (i === 2) { const ph = u * Math.PI * 10; p.x = C + Math.sin(ph / 2) * r * 1.1; p.rot = Math.sin(ph / 2) * 0.35; p.sy = 1 + 0.13 * Math.sin(ph); p.sx = 2 - p.sy; p.y = G - pulinho(10) * r * 0.15; p.lx = Math.sin(ph / 2); }
  else if (i === 3) { const ph = u * Math.PI * 2; p.x = C + Math.sin(ph) * (R - C) * 0.95; p.rot = (p.x - C) / r; p.y = G - r * 0.15; p.expr = 'tonta'; }
  else if (i === 4) { const b = pulinho(3), alto = h * 0.18 * (1 - u * 0.35); p.y = G - b * alto; const chao = 1 - clamp(b * 5, 0, 1); p.sy = 1 - chao * 0.32; p.sx = 1 + chao * 0.28; p.expr = b > 0.6 ? 'feliz' : 'normal'; }
  else if (i === 5) { const ph = u * Math.PI; p.x = C - Math.sin(ph) * (C - L) * 0.9; p.lx = 0.9; p.rot = -0.22; p.y = G - pulinho(12) * r * 0.08; p.expr = 'normal'; }
  else if (i === 6) { const a = Math.sin(u * Math.PI); p.s = 1 + a * 0.7 + (a > 0.9 ? Math.sin(u * 60) * 0.04 : 0); p.y = G - (p.s - 1) * r * 0.9; p.expr = a > 0.7 ? 'feliz' : 'normal'; }
  else if (i === 7) { const a = u * Math.PI * 2 * giro; p.x = C + Math.sin(a) * (R - C) * 0.55; p.y = G - (1 - Math.cos(a)) * h * 0.12; p.rot = a; }
  return p;
}
const FIM_SHOW = ENTRADA + SEG_ROTINA * N_SHOW, CICLO = 6;
function poseEm(t, C, L, R, G, r, h) {
  if (t < ENTRADA) { const u = easeOut4(t / ENTRADA); return { x: -r * 2 + (C + r * 2) * u, y: G - Math.abs(Math.sin(t * 20)) * r * 0.3, rot: 0.2 * (1 - u), s: 1, sx: 1, sy: 1, flip: false, expr: 'feliz', lx: 0.9, k: -1 }; }
  if (t >= FIM_SHOW) {
    // depois das animações, fica paradinho: respira, balança de leve e pisca
    // tudo aqui se repete a cada CICLO segundos: é isso que deixa o vídeo do fim rodar em loop sem emenda
    const q = t - FIM_SHOW, w = 2 * Math.PI / CICLO, resp = Math.sin(q * w * 2);
    return { x: C, y: G - Math.abs(Math.sin(q * w)) * r * 0.06, rot: Math.sin(q * w) * 0.06, s: 1, sx: 1 - resp * 0.03, sy: 1 + resp * 0.03, flip: false, expr: (q % CICLO) > CICLO * 0.8 ? 'normal' : 'feliz', lx: Math.sin(q * w) * 0.6, k: N_SHOW, pisca: (q % (CICLO / 2)) < 0.12 };
  }
  const tt = t - ENTRADA, k = Math.floor(tt / SEG_ROTINA), i = festa.rotinas[k], u = (tt - k * SEG_ROTINA) / SEG_ROTINA;
  return Object.assign(pose(i, u, C, L, R, G, r, h, festa.giro), { k });
}
function desenhaFesta(agora, dt) {
  const c = octx, w = cw, h = ch, t = (agora - festa.t1) / 1000, cor = RARIDADE[MAPA.id], sk = SKINS[MAPA.id], calmo = CALMO && !gravandoVideo;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, sk.bg.fliper[0]); g.addColorStop(1, '#07050b'); c.fillStyle = g; c.fillRect(0, 0, w, h);
  const cx = w / 2, cy = h * 0.66;
  c.save(); c.translate(cx, cy); c.rotate(calmo ? 0 : t * Math.PI / 12);
  for (let k = 0; k < 16; k++) { c.rotate(Math.PI / 8); c.fillStyle = rgba(cor, k % 2 ? 0.05 : 0.13); c.beginPath(); c.moveTo(0, 0); c.lineTo(-w * 0.09, -w); c.lineTo(w * 0.09, -w); c.closePath(); c.fill(); }
  c.restore();
  c.globalCompositeOperation = 'lighter'; luz(c, cx, cy, Math.min(w, h) * 0.45, cor, 0.25); c.globalCompositeOperation = 'source-over';
  const r = Math.min(w, h) * 0.095, G = h * 0.72, L = w * 0.16, R = w * 0.84, calmoAgora = t > FIM_SHOW;
  c.fillStyle = 'rgba(0,0,0,.35)'; elip(c, cx, G + r * 1.2, w * 0.42, r * 0.38); c.fill();
  c.strokeStyle = rgba(cor, .5); c.lineWidth = 2; elip(c, cx, G + r * 1.2, w * 0.42, r * 0.38); c.stroke();
  if (!calmo && calmoAgora) confeteParado(c, t - FIM_SHOW, w, h, cor);
  else if (!calmo && Math.random() < dt * 3) soltaC(14, Math.random() * w, -10, { v: 120, vy: 140, g: 260, vida: 3, cor: [cor, '#ffd84d', '#ffffff', '#ff6fb5', '#8fe36b'], tam: 3.4, forma: 'q' });
  let wi = -1; for (let i = 0; i < rec.n; i++) if (rec.dono[i] === rec.vencedor && rec.tFim[i] > 0 && (wi < 0 || rec.tFim[i] < rec.tFim[wi])) wi = i;
  const est = rec.est[wi], tt = calmo ? FIM_SHOW + 1 : t;
  const desenha = (pp, alfa) => {
    c.save(); c.globalAlpha = alfa; c.translate(pp.x, pp.y); if (pp.flip) c.scale(-1, 1); c.scale(pp.sx * pp.s, pp.sy * pp.s);
    desenhaAlma(c, 0, 0, r, est, { expr: pp.expr, t: tt, lx: pp.lx, ly: -0.2, inc: pp.rot, pisca: pp.pisca }); c.restore();
  };
  const atual = poseEm(tt, cx, L, R, G, r, h);
  if (!calmoAgora) for (const [d, a] of [[0.09, 0.12], [0.05, 0.22]]) { const ant = poseEm(Math.max(0, tt - d), cx, L, R, G, r, h); if (Math.hypot(ant.x - atual.x, ant.y - atual.y) > r * 0.25) desenha(ant, a); }
  const alt = clamp((G - atual.y) / (h * 0.3), 0, 1); c.fillStyle = `rgba(0,0,0,${0.35 * (1 - alt * 0.7)})`; elip(c, atual.x, G + r * 1.05, r * (1 - alt * 0.5) * atual.s, r * 0.22); c.fill();
  desenha(atual, 1);
  if (atual.k !== festa.seg) { festa.seg = atual.k; if (atual.k >= 0 && atual.k < N_SHOW) { soltaC(18, atual.x, atual.y - r, { v: 260, g: 200, vida: 1, cor: ['#ffffff', '#ffd84d', cor], tam: 4, forma: 'e' }); somFesta('rotina'); } }
  if (calmoAgora && !calmo) brilhoParado(c, t - FIM_SHOW, atual, r);
  // em cima: a foto de perfil, o nome de quem ganhou e o prêmio
  const ap = easeBack(clamp(t / 0.55, 0, 1)), fr = Math.min(w, h) * 0.065, fy = h * 0.11;
  c.save(); c.translate(cx, fy); c.scale(ap, ap);
  c.globalCompositeOperation = 'lighter'; luz(c, 0, 0, fr * 2.2, cor, 0.35); c.globalCompositeOperation = 'source-over';
  desenhaAvatar(c, 0, 0, fr, festa.pessoa, 1);
  c.strokeStyle = '#ffd84d'; c.lineWidth = 3; circ(c, 0, 0, fr + 3); c.stroke();
  c.fillStyle = '#ffd84d'; c.beginPath(); c.moveTo(-fr * .55, -fr - 4); c.lineTo(-fr * .55, -fr - 16); c.lineTo(-fr * .28, -fr - 9); c.lineTo(0, -fr - 20); c.lineTo(fr * .28, -fr - 9); c.lineTo(fr * .55, -fr - 16); c.lineTo(fr * .55, -fr - 4); c.closePath(); c.fill();
  c.restore();
  c.textAlign = 'center'; c.textBaseline = 'alphabetic';
  const nome = rec.nomes[rec.vencedor], tw0 = easeBack(clamp((t - 0.15) / 0.5, 0, 1));
  c.save(); c.translate(cx, fy + fr + 44); c.scale(tw0, tw0); c.shadowColor = cor; c.shadowBlur = 26; c.fillStyle = '#fff6e6';
  let fs = Math.min(50, w / 11); c.font = fonteMapa(MAPA.id, fs); const lg = c.measureText(`${nome} venceu!`).width; if (lg > w * 0.9) { fs *= w * 0.9 / lg; c.font = fonteMapa(MAPA.id, fs); }
  c.fillText(`${nome} venceu!`, 0, 0); c.restore();
  c.fillStyle = '#d8cce6'; c.font = '600 11px "IBM Plex Mono", monospace'; c.fillText(`${rec.setores[rec.vencedor].toUpperCase()} · ${MAPA.nome.toUpperCase()} · ${fmt(rec.tVenc - 3)}`, cx, fy + fr + 66);
  if (festa.premio) {
    const pa = easeBack(clamp((t - 0.45) / 0.5, 0, 1)), py = fy + fr + 98;
    c.save(); c.translate(cx, py); c.scale(pa, pa); c.font = `600 ${Math.min(20, w / 22)}px Rubik, sans-serif`;
    const txt = `Prêmio: ${festa.premio}`, pw = c.measureText(txt).width + 36;
    c.fillStyle = '#ffd84d'; rr(c, -pw / 2, -17, pw, 34, 17); c.fill();
    c.fillStyle = '#c8a020'; c.beginPath(); c.moveTo(-pw / 2 - 12, -10); c.lineTo(-pw / 2 + 4, -10); c.lineTo(-pw / 2 + 4, 14); c.lineTo(-pw / 2 - 12, 14); c.lineTo(-pw / 2 - 5, 2); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(pw / 2 + 12, -10); c.lineTo(pw / 2 - 4, -10); c.lineTo(pw / 2 - 4, 14); c.lineTo(pw / 2 + 12, 14); c.lineTo(pw / 2 + 5, 2); c.closePath(); c.fill();
    c.fillStyle = '#1b0f05'; c.textBaseline = 'middle'; c.fillText(txt, 0, 1); c.restore(); c.textBaseline = 'alphabetic';
  }
  const pod = festa.pod.slice(1);
  if (pod.length) {
    const y = h - 26, larg = Math.min(w - 40, 340), x0 = cx - larg / 2;
    pod.forEach((pp, k) => { const x = x0 + (k + 0.5) * larg / pod.length; desenhaAlma(c, x - 34, y - 4, 11, pp.est, { expr: 'feliz', t, lx: .3 }); c.textAlign = 'left'; c.fillStyle = '#efe6d4'; c.font = '600 12px Rubik, sans-serif'; c.fillText(`${k + 2}º ${rec.nomes[pp.dono]}`, x - 18, y - 2); c.fillStyle = '#a99db5'; c.font = '500 10px "IBM Plex Mono", monospace'; c.fillText(`+${(pp.t - festa.pod[0].t).toFixed(2).replace('.', ',')} s`, x - 18, y + 12); });
  }
  desenhaCParts(c, dt);
  c.textAlign = 'left';
}
/* parado, o confete e o brilho são contas do tempo (sem sorteio): o último trecho repete igual a cada CICLO segundos */
const CONF_CORES = ['#ffd84d', '#ffffff', '#ff6fb5', '#8fe36b'];
function confeteParado(c, q, w, h, cor) {
  const fase = q / CICLO, a0 = clamp(q / 1.2, 0, 1);
  for (let j = 0; j < 16; j++) {
    const v = 1 + (j % 2), y = -20 + (h + 40) * (((fase * v + j * 0.37) % 1 + 1) % 1), x = w * ((j * 0.618 + 0.1) % 1) + Math.sin(fase * 2 * Math.PI * v + j) * 12;
    c.save(); c.globalAlpha = a0 * 0.9; c.translate(x, y); c.rotate(fase * 2 * Math.PI * (j % 3 + 1) + j); c.fillStyle = j % 5 ? CONF_CORES[j % 4] : cor; c.fillRect(-3.4, -1.7, 6.8, 3.4); c.restore();
  }
}
function brilhoParado(c, q, p, r) {
  for (let j = 0; j < 3; j++) {
    const ph = ((q / (CICLO / 4) + j / 3) % 1 + 1) % 1, x = p.x + Math.sin(j * 2.1 + 0.5) * r * 0.9, y = p.y - r * 1.2 - ph * r * 0.8;
    c.globalAlpha = Math.sin(ph * Math.PI) * 0.9; c.fillStyle = j ? '#ffd84d' : '#ffffff'; estrela(c, x, y, 3.2, 1.3, 4, ph * 3); c.fill();
  }
  c.globalAlpha = 1;
}


/* ================= o fim vira vídeo: o PC do super admin desenha uma vez, as telas só reproduzem ================= */
/* Os dois vídeos sobem para o bucket `corridas` junto com a gravação; as telas só baixam e tocam. */
const VID = { W: 800, H: 700, E: 1.2, FPS: 30, FOLGA: 4.5, CRUZA: 0.5 };
let gravandoVideo = false, videoT = 0, cuesVideo = null;
const podeGravarVideo = () => typeof VideoEncoder === 'function' && typeof VideoFrame === 'function';
/* os sons da festa: ao vivo tocam na hora; na gravação viram marcas de tempo, tocadas junto com o vídeo */
function somFesta(qual) {
  if (gravandoVideo) { cuesVideo.push([videoT, qual]); return; }
  if (qual === 'pouso') som.pouso(); else som.tom(990, 0.12, { tipo: 'triangle', vol: 0.03 });
}
/* troca o estado da tela ao vivo pelo estado do vídeo (e volta), sem um atrapalhar o outro */
const CHAVES_VIDEO = ['ctx', 'octx', 'cw', 'ch', 'dpr', 'kBase', 'kk', 'camX', 'camY', 'viewW', 'viewH', 'T', 'seguir', 'modoCam', 'festa', 'cparts', 'parts', 'aneis', 'evPtr', 'shake', 'escala', 'tocando'];
function lerEstado() { return { ctx, octx, cw, ch, dpr, kBase, kk, camX, camY, viewW, viewH, T, seguir, modoCam, festa, cparts, parts, aneis, evPtr, shake, escala, tocando, bw: baixa.width, bh: baixa.height }; }
function porEstado(e) {
  ctx = e.ctx; octx = e.octx; cw = e.cw; ch = e.ch; dpr = e.dpr; kBase = e.kBase; kk = e.kk; camX = e.camX; camY = e.camY; viewW = e.viewW; viewH = e.viewH;
  T = e.T; seguir = e.seguir; modoCam = e.modoCam; festa = e.festa; cparts = e.cparts; parts = e.parts; aneis = e.aneis; evPtr = e.evPtr; shake = e.shake; escala = e.escala; tocando = e.tocando;
  if (baixa.width !== e.bw) baixa.width = e.bw; if (baixa.height !== e.bh) baixa.height = e.bh;
}
function noVideo(job, fn) {
  const vivo = lerEstado(); porEstado(job.estado); gravandoVideo = true; som.quieto = true;
  try { return fn(); } finally { job.estado = lerEstado(); gravandoVideo = false; som.quieto = false; porEstado(vivo); }
}
async function gravaFestaVideo(cancelado, aoProgresso) {
  const pw = Math.round(VID.W * VID.E), ph = Math.round(VID.H * VID.E);
  const cfg = { codec: 'vp8', width: pw, height: ph, bitrate: 3500000, framerate: VID.FPS };
  if (!podeGravarVideo() || rec.vencedor < 0) return null;
  try { const sup = await VideoEncoder.isConfigSupported(cfg); if (!sup.supported) return null; } catch (e) { return null; }
  const tela1 = document.createElement('canvas'), tela2 = document.createElement('canvas');
  tela1.width = tela2.width = pw; tela1.height = tela2.height = ph;
  const c1 = tela1.getContext('2d'), c2 = tela2.getContext('2d');
  const kB = Math.min(VID.W / W, 1.35);
  const job = { estado: { ctx: c1, octx: c1, cw: VID.W, ch: VID.H, dpr: VID.E, kBase: kB, kk: kB, camX: 0, camY: 0, viewW: VID.W / kB, viewH: VID.H / kB, T: 0, seguir: rec.vencedor, modoCam: 'perto', festa: novaFesta(0), cparts: [], parts: [], aneis: [], evPtr: 0, shake: 0, escala: 1, tocando: false, bw: Math.ceil(VID.W / PX), bh: Math.ceil(VID.H / PX) } };
  cuesVideo = [];
  noVideo(job, () => { buscar(festa.T0); const v = vb.find(o => o.dono === rec.vencedor); camY = v ? clamp(v.y - viewH * 0.42, -90, H - viewH) : 0; });
  // dois vídeos: o principal (replay + festa + um respiro) e o trecho parado, que repete em loop
  const fazer = async (quadros, desenha, nome) => {
    let erro = null; const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: 'V_VP8', width: pw, height: ph, frameRate: VID.FPS } });
    const enc = new VideoEncoder({ output: (ch2, meta) => muxer.addVideoChunk(ch2, meta), error: e => { erro = e; } });
    enc.configure(cfg);
    for (let i = 0; quadros(i); ) {
      if (cancelado()) { try { enc.close(); } catch (e) { } return null; }
      const ate = performance.now() + 22;
      while (quadros(i) && performance.now() < ate && enc.encodeQueueSize < 6) {
        videoT = i / VID.FPS;
        noVideo(job, () => desenha(i));
        const fr = new VideoFrame(tela1, { timestamp: Math.round(i * 1e6 / VID.FPS), duration: Math.round(1e6 / VID.FPS) });
        enc.encode(fr, { keyFrame: i % (VID.FPS * 2) === 0 }); fr.close(); i++;
        aoProgresso(nome === 'loop' ? 0.85 + 0.15 * job.prog(i) : 0.85 * job.prog(i));
      }
      if (erro) throw erro;
      await new Promise(r => setTimeout(r, 0));
    }
    await enc.flush(); enc.close(); muxer.finalize();
    return new Blob([muxer.target.buffer], { type: 'video/webm' });
  };
  try {
    // 1) replay em câmera lenta e a festa inteira, até o bichinho ficar paradinho e o confete da festa assentar
    const dtV = 1 / VID.FPS, fimPrincipal = FIM_SHOW + VID.FOLGA;
    let acabou = false, nPrincipal = 0;
    job.prog = i => Math.min(1, i / ((festa0().T1 - festa0().T0) / VEL_REPLAY * VID.FPS + fimPrincipal * VID.FPS));
    function festa0() { return job.estado.festa; }
    const principal = await fazer(i => !acabou, i => {
      const agora = i * 1000 / VID.FPS;
      if (festa.fase === 'replay') replayQuadro(agora, dtV);
      else { desenhaFesta(agora, dtV); if ((agora - festa.t1) / 1000 >= fimPrincipal - dtV / 2) { acabou = true; nPrincipal = i + 1; } }
    }, 'principal');
    if (!principal) return null;
    // 2) o trecho parado: CICLO segundos que continuam de onde o principal parou; no fim, funde com o começo
    const t1 = job.estado.festa.t1, q0 = fimPrincipal, nLoop = Math.round(CICLO * VID.FPS);
    job.estado.cparts = [];
    job.prog = i => i / nLoop;
    const loop = await fazer(i => i < nLoop, i => {
      const q = q0 + i / VID.FPS, cruza = ((i + 1) / VID.FPS - (CICLO - VID.CRUZA)) / VID.CRUZA; // no último quadro já é o que vem antes do primeiro
      desenhaFesta(t1 + q * 1000, 0);
      if (cruza > 0) { octx = c2; desenhaFesta(t1 + (q - CICLO) * 1000, 0); octx = c1; c1.setTransform(1, 0, 0, 1, 0, 0); c1.globalAlpha = cruza; c1.drawImage(tela2, 0, 0); c1.globalAlpha = 1; }
    }, 'loop');
    if (!loop) return null;
    return { festa: principal, loop, cues: cuesVideo, dur: nPrincipal / VID.FPS };
  } catch (e) {
    console.warn('[corrida] o vídeo da festa não gravou; a festa vai ser desenhada ao vivo', e);
    return null;
  }
}


/* ================= desenho: pista padrão, arquibancadas e lobby ================= */
let mouse = null, hits = [], bolhasL = [], posVoce = null;
const aoMouse = e => { const r = ovl.getBoundingClientRect(); mouse = { x: e.clientX - r.left, y: e.clientY - r.top }; }, foraMouse = () => { mouse = null; };
ovl.addEventListener('mousemove', aoMouse); ovl.addEventListener('mouseleave', foraMouse);
function bolhaFala(c, b, agora) {
  const d = agora - b.t0; if (d < 0 || d > 2.2) return;
  const a = d < 0.2 ? d / 0.2 : d > 1.6 ? 1 - (d - 1.6) / 0.6 : 1, y = b.y - d * 22;
  c.save(); c.globalAlpha = a; c.font = '600 11px Rubik, sans-serif'; const tw = c.measureText(b.txt).width;
  c.fillStyle = b.cor || '#fff6e6'; rr(c, b.x - tw / 2 - 7, y - 24, tw + 14, 18, 9); c.fill();
  c.beginPath(); c.moveTo(b.x - 4, y - 6); c.lineTo(b.x, y); c.lineTo(b.x + 4, y - 6); c.fill();
  c.fillStyle = '#1b0f05'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(b.txt, b.x, y - 15); c.restore();
}
/* O lobby é um Grande Prêmio: estádio no fim de tarde, uma arquibancada por setor e o grid de largada.
   Tudo o que não se mexe (céu, estádio, pista, boxes do grid) é desenhado uma vez numa imagem guardada;
   a cada quadro só entram as pessoas, os bichinhos, as falas e as luzes. Assim fica leve em qualquer PC. */
const FONTE_GP = '"Racing Sans One", Rubik, sans-serif', FONTE_GPC = '"Saira Condensed", Rubik, sans-serif';
const barraLobby = w => w < 640 ? 94 : 52; // a faixa de baixo, onde ficam as reações e a música (no celular, uma embaixo da outra)
let lobbyCache = null;
function xadrez(c, x, y, w, h, q) { for (let i = 0; i * q < w; i++) for (let j = 0; j * q < h; j++) { c.fillStyle = (i + j) % 2 ? '#15171c' : '#f4f1ea'; c.fillRect(x + i * q, y + j * q, Math.min(q, w - i * q), Math.min(q, h - j * q)); } }
function textoInclinado(c, txt, x, y, inc) { c.save(); c.translate(x, y); c.transform(1, 0, -inc, 1, 0, 0); c.fillText(txt, 0, 0); c.restore(); }
function bandeira(c, x, y, q) { xadrez(c, x, y, q * 4, q * 3, q); c.fillStyle = '#c8ccd4'; c.fillRect(x - 2, y - 1, 2, q * 3 + 10); }

/* onde fica cada coisa; muda só quando muda o tamanho, quem corre ou quem assiste */
/* a arena: a pista no meio e a arquibancada em volta toda, como um estádio visto de cima.
   Cada setor ganha um trecho da volta do tamanho da sua turma; quem entra senta da primeira fileira para trás,
   do meio do trecho para as pontas, então a arquibancada vai lotando conforme o pessoal chega. */
const PALETA_SETOR = ['#ff8a2b', '#b08af5', '#4cb8ff', '#ffd84d', '#5ff0c8', '#ff6fb5', '#8fe36b', '#ff5a5a', '#6f8cff', '#e6a3ff', '#ffb36b', '#4de0e0', '#c8e86b', '#ff9e9e'];
function coresDosSetores(setores) {
  const out = {}, usadas = new Set();
  for (const s of setores) if (COR_SETOR[s]) { out[s] = COR_SETOR[s]; usadas.add(COR_SETOR[s]); }
  const livres = PALETA_SETOR.filter(c => !usadas.has(c)); let k = 0;
  for (const s of setores) if (!out[s]) out[s] = livres.length ? livres[k++ % livres.length] : PALETA_SETOR[k++ % PALETA_SETOR.length];
  return out;
}
/* o contorno da pista afastado `d` px para fora; `u` (0..1) anda no sentido do relógio, a partir do canto de cima à esquerda */
function anel(I, rc, d) {
  const lx = I.w - 2 * rc, ly = I.h - 2 * rc, R = rc + d, qa = Math.PI / 2 * R, P = 2 * lx + 2 * ly + 4 * qa;
  const x0 = I.x, y0 = I.y, x1 = I.x + I.w, y1 = I.y + I.h;
  const arco = (cx, cy, a0, s) => { const t = a0 + s / R; return { x: cx + Math.cos(t) * R, y: cy + Math.sin(t) * R, a: t + Math.PI / 2 }; };
  return {
    P, d, ponto(u) {
      let s = (((u % 1) + 1) % 1) * P;
      if (s < lx) return { x: x0 + rc + s, y: y0 - d, a: 0 }; s -= lx;
      if (s < qa) return arco(x1 - rc, y0 + rc, -Math.PI / 2, s); s -= qa;
      if (s < ly) return { x: x1 + d, y: y0 + rc + s, a: Math.PI / 2 }; s -= ly;
      if (s < qa) return arco(x1 - rc, y1 - rc, 0, s); s -= qa;
      if (s < lx) return { x: x1 - rc - s, y: y1 + d, a: Math.PI }; s -= lx;
      if (s < qa) return arco(x0 + rc, y1 - rc, Math.PI / 2, s); s -= qa;
      if (s < ly) return { x: x0 - d, y: y1 - rc - s, a: -Math.PI / 2 }; s -= ly;
      return arco(x0 + rc, y0 + rc, Math.PI, s);
    },
  };
}
const caminhoAnel = (c, I, rc, d) => { c.beginPath(); c.roundRect ? c.roundRect(I.x - d, I.y - d, I.w + 2 * d, I.h + 2 * d, rc + d) : rr(c, I.x - d, I.y - d, I.w + 2 * d, I.h + 2 * d, rc + d); };
const textoReto = a => { let r = a; while (r > Math.PI / 2) r -= Math.PI; while (r < -Math.PI / 2) r += Math.PI; return r; };

/* onde fica cada coisa; muda só quando muda o tamanho, quem corre ou quem assiste */
function layoutLobby(w, h, prep) {
  const lay = { w, h, prep, cab: w < 520 ? 98 : 74, setores: [], slots: [] };
  const A = { x: 4, y: lay.cab + 2, w: w - 8, h: h - barraLobby(w) - lay.cab - 4 };
  const gente = chamados(), nomes = ordemSetores(), cores = coresDosSetores(nomes);
  let geo = null;
  if (!prep && nomes.length) {
    const grupos = nomes.map(s => ({ setor: s, cor: cores[s], membros: gente.filter(p => p.setor === s) })), N = gente.length, placa = 14, rotulo = 20;
    // o maior rosto que cabe com a pista ainda folgada no meio
    for (let r = w < 520 ? 8 : 13; r >= 3.5 && !geo; r -= 0.5) {
      const pitch = r * 2 + Math.max(2.5, r * 0.5), rc = Math.max(20, Math.min(A.w, A.h) * 0.09);
      for (let rows = 2; rows <= 8; rows++) {
        const esp = placa + rows * pitch + rotulo, I = { x: A.x + esp, y: A.y + esp, w: A.w - 2 * esp, h: A.h - 2 * esp };
        if (I.w < A.w * 0.52 || I.h < A.h * 0.4) break;
        const fileiras = Array.from({ length: rows }, (_, k) => anel(I, rc, placa + (k + 0.5) * pitch));
        const corredor = pitch * 1.2 / fileiras[0].P, livre = 1 - corredor * grupos.length;
        let u = 0; const faixas = grupos.map(g => { const f = livre * g.membros.length / N, fx = { a: u + corredor / 2, b: u + corredor / 2 + f }; u += f + corredor; return fx; });
        const lugares = grupos.map(() => []);
        fileiras.forEach((an, k) => { const n = Math.floor(an.P / pitch); for (let j = 0; j < n; j++) { const uu = (j + 0.5) / n, gi = faixas.findIndex(fx => uu >= fx.a && uu < fx.b); if (gi >= 0) lugares[gi].push(Object.assign({ k, u: uu, r }, an.ponto(uu))); } });
        if (grupos.every((g, i) => lugares[i].length >= g.membros.length)) { geo = { r, pitch, rc, rows, I, placa, grupos, faixas, lugares }; break; }
      }
    }
    if (geo) {
      const fora = anel(geo.I, geo.rc, geo.placa + geo.rows * geo.pitch + 10);
      geo.grupos.forEach((g, i) => {
        const fx = geo.faixas[i], meio = (fx.a + fx.b) / 2;
        // a ordem de sentar: primeira fileira primeiro, do meio do trecho para as pontas
        geo.lugares[i].sort((p, q) => p.k - q.k || Math.abs(p.u - meio) - Math.abs(q.u - meio));
        const lab = fora.ponto(meio);
        lay.setores.push(Object.assign(g, { faixa: fx, lugares: geo.lugares[i], rotulo: { x: lab.x, y: lab.y, a: textoReto(lab.a), larg: Math.min(fora.P * (fx.b - fx.a) * 0.92, 150) } }));
      });
      lay.geo = geo; lay.pista = geo.I;
    }
  }
  if (!lay.pista) lay.pista = { x: A.x + 10, y: A.y + 8, w: A.w - 20, h: A.h - 16 };
  lay.rc = geo ? geo.rc : 16;
  // o grid de largada: faixas escalonadas, olhando para a linha de largada (à direita)
  const ps = corredores(), n = ps.length, P = lay.pista, larg = P.x + P.w - 52, ini = P.x + 12, aw = larg - ini, ah = P.h - 26;
  lay.largada = larg + 6;
  let melhor = null;
  // cada box tem o bichinho, a posição e o nome embaixo; escolhe o número de faixas que deixa o bichinho maior
  for (let L = 1; L <= 14; L++) { const C = Math.ceil(n / L) + 0.5, sx = aw / C, sy = ah / L, r = Math.min(sx / 2.7, (sy - 15) / 2.45, 21), nomes2 = r >= 8 && sx >= 40; const r2 = nomes2 ? r : Math.min(sx / 2.7, sy / 2.4, 21); if (!melhor || r2 + (nomes2 ? 2 : 0) > melhor.peso) melhor = { L, sx, sy, r: r2, nomes: nomes2, peso: r2 + (nomes2 ? 2 : 0) }; }
  const { L, sx, sy, r, nomes: comNome } = melhor || { L: 1, sx: aw, sy: ah, r: 16, nomes: false };
  lay.grid = { L, sx, sy, r, nomes: comNome };
  ps.forEach((p, i) => {
    const col = Math.floor(i / L), faixa = i % L;
    lay.slots.push({ p, i, x: larg - 12 - (col + 0.5) * sx - (faixa % 2) * sx * 0.5, y: P.y + 13 + (faixa + 0.5) * sy - (comNome ? 7 : 0), r });
  });
  return lay;
}

/* a camada parada, desenhada uma vez */
function pintaFundoLobby(c, lay) {
  const { w, h } = lay, rnd = mulberry32(7), P = lay.pista, geo = lay.geo;
  // a noite em volta do estádio
  const g = c.createRadialGradient(w / 2, h * 0.55, 40, w / 2, h * 0.55, Math.max(w, h) * 0.75); g.addColorStop(0, '#1b2748'); g.addColorStop(1, '#070a16');
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  // a estrutura da arquibancada: concreto em degraus, e os corredores entre os setores
  if (geo) {
    const { I, rc, placa, rows, pitch } = geo;
    for (let k = rows; k >= 0; k--) { caminhoAnel(c, I, rc, placa + k * pitch + (k === rows ? 6 : 0)); c.fillStyle = k === rows ? '#141a2e' : k % 2 ? '#26304c' : '#2c385a'; c.fill(); }
    for (const s of lay.setores) {
      // o trecho do setor ganha um fundo na cor dele
      for (let k = 0; k < rows; k++) {
        const an = anel(I, rc, placa + (k + 0.5) * pitch), passos = Math.max(4, Math.ceil(an.P * (s.faixa.b - s.faixa.a) / 6));
        c.strokeStyle = rgba(s.cor, 0.1 + 0.05 * (k % 2)); c.lineWidth = pitch - 1; c.lineCap = 'butt'; c.beginPath();
        for (let j = 0; j <= passos; j++) { const p = an.ponto(s.faixa.a + (s.faixa.b - s.faixa.a) * j / passos); j ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y); }
        c.stroke();
      }
      for (const l of s.lugares) { c.fillStyle = rgba(s.cor, 0.3); c.save(); c.translate(l.x, l.y); c.rotate(l.a); rr(c, -l.r * 0.75, -l.r * 0.05, l.r * 1.5, l.r * 0.75, 2.5); c.fill(); c.restore(); }
    }
    // as escadinhas dos corredores
    for (const s of lay.setores) for (const u of [s.faixa.a - 0.0005]) {
      const a = anel(I, rc, placa).ponto(u), b = anel(I, rc, placa + rows * pitch).ponto(u);
      c.strokeStyle = 'rgba(200,210,235,.25)'; c.lineWidth = 2; c.setLineDash([2, 3]); c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke(); c.setLineDash([]);
    }
    // as placas de publicidade em volta da pista
    caminhoAnel(c, I, rc, placa / 2 + 1); c.strokeStyle = '#0b0f1c'; c.lineWidth = placa - 2; c.stroke();
    c.font = `${Math.min(11, placa - 3)}px ${FONTE_GP}`; c.textBaseline = 'middle'; c.textAlign = 'left';
    const frases = ['CORRIDA DA SORTE', 'GRANDE PRÊMIO', CORRIDA.premio ? `PRÊMIO ${CORRIDA.premio.toUpperCase()}` : 'BOA SORTE'], cores = lay.setores.map(s => s.cor);
    for (const [y0, sentido] of [[I.y - placa / 2 - 1, 1], [I.y + I.h + placa / 2 + 1, 1]]) {
      for (let x = I.x + rc, k = sentido; x < I.x + I.w - rc - 20; k++) { const t = frases[k % frases.length], tw = c.measureText(t).width; if (x + tw > I.x + I.w - rc) break; c.fillStyle = cores[k % cores.length] || '#ffd84d'; c.fillText(t, x, y0 + 0.5); x += tw + 22; }
    }
    // torres de luz nos quatro cantos
    c.globalCompositeOperation = 'lighter';
    const cantos = [[6, lay.cab + 6], [w - 6, lay.cab + 6], [6, h - barraLobby(w) - 6], [w - 6, h - barraLobby(w) - 6]];
    for (const [x, y] of cantos) { const gl = c.createRadialGradient(x, y, 2, x, y, Math.min(w, h) * 0.55); gl.addColorStop(0, 'rgba(255,245,220,.16)'); gl.addColorStop(1, 'rgba(255,245,220,0)'); c.fillStyle = gl; c.fillRect(0, 0, w, h); }
    c.globalCompositeOperation = 'source-over';
    for (const [x, y] of cantos) { const sx = x < w / 2 ? 1 : -1, sy = y < h / 2 ? 1 : -1; c.fillStyle = '#2a3150'; rr(c, x - (sx < 0 ? 22 : 0), y - (sy < 0 ? 14 : 0), 22, 14, 3); c.fill(); for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) { c.fillStyle = '#fff8e0'; circ(c, x + sx * (5 + i * 6), y + sy * (4 + j * 6), 2); c.fill(); } }
  }
  // o asfalto, com a borda branca e a zebra
  c.save(); caminhoAnel(c, P, lay.rc, 0); c.clip();
  const ga = c.createLinearGradient(0, P.y, 0, P.y + P.h); ga.addColorStop(0, '#343944'); ga.addColorStop(1, '#25282f'); c.fillStyle = ga; c.fillRect(P.x, P.y, P.w, P.h);
  for (let k = 0; k < P.w * P.h / 240; k++) { c.fillStyle = rnd() < .5 ? 'rgba(255,255,255,.035)' : 'rgba(0,0,0,.12)'; c.fillRect(P.x + rnd() * P.w, P.y + rnd() * P.h, 1.4, 1.4); }
  c.restore();
  caminhoAnel(c, P, lay.rc, -3); c.strokeStyle = 'rgba(244,241,234,.8)'; c.lineWidth = 2; c.stroke();
  caminhoAnel(c, P, lay.rc, 1.5); c.strokeStyle = '#e2343f'; c.lineWidth = 3; c.setLineDash([10, 10]); c.stroke(); c.strokeStyle = '#f4f1ea'; c.lineDashOffset = 10; c.stroke(); c.setLineDash([]); c.lineDashOffset = 0;
  // a linha de largada
  xadrez(c, lay.largada, P.y + 6, 14, P.h - 12, 7);
  // os boxes do grid: o colchete branco, a posição e o nome de quem larga ali
  const G = lay.grid;
  for (const s of lay.slots) {
    const bx = s.x + s.r * 1.25, bw = G.sx * 0.9, top = s.y - s.r * 1.1, bot = s.y + s.r * 1.1;
    c.strokeStyle = 'rgba(244,241,234,.75)'; c.lineWidth = 2; c.beginPath(); c.moveTo(bx - bw * 0.55, top); c.lineTo(bx, top); c.lineTo(bx, bot); c.lineTo(bx - bw * 0.55, bot); c.stroke();
    c.fillStyle = 'rgba(244,241,234,.55)'; c.font = `600 ${Math.max(8, Math.min(11, s.r * 0.6))}px ${FONTE_GPC}`; c.textAlign = 'right'; c.textBaseline = 'top';
    c.fillText(`P${s.i + 1}`, bx - 3, top + 2);
    if (G.nomes) { const nm = s.p.voce ? 'VOCÊ' : s.p.nome.toUpperCase(); c.textAlign = 'center'; c.fillStyle = s.p.voce ? '#ffd84d' : 'rgba(244,241,234,.8)'; c.font = `600 ${Math.min(11, G.sx / 5.4)}px ${FONTE_GPC}`; c.fillText(nm.length > 9 ? nm.slice(0, 8) + '.' : nm, s.x, bot + 3); }
  }
  // cabeçalho
  const pequeno = w < 520, fs = pequeno ? 21 : Math.min(32, w / 22);
  c.fillStyle = 'rgba(5,8,18,.7)'; c.fillRect(0, 0, w, lay.cab - 6);
  xadrez(c, 0, lay.cab - 6, w, 6, 6);
  bandeira(c, 16, 15, pequeno ? 4 : 5);
  c.font = `${fs}px ${FONTE_GP}`; c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  c.fillStyle = '#ff4d5e'; textoInclinado(c, 'CORRIDA DA SORTE', (pequeno ? 40 : 46) + 2, (pequeno ? 34 : 38) + 2, 0.12);
  c.fillStyle = '#fff6e6'; textoInclinado(c, 'CORRIDA DA SORTE', pequeno ? 40 : 46, pequeno ? 34 : 38, 0.12);
  c.font = `600 ${pequeno ? 11 : 13}px ${FONTE_GPC}`; c.fillStyle = '#9fb0d8';
  const ps = corredores(), feitas = ps.filter(p => !!p.est).length;
  c.fillText(lay.prep ? `TREINO LIVRE · ${feitas} DE ${ps.length} ESCOLHERAM${pequeno ? '' : ' O BICHINHO'}` : `GRANDE PRÊMIO · ${ps.length} NO GRID · ${lay.setores.length} ${lay.setores.length === 1 ? 'SETOR' : 'SETORES'}${pequeno ? '' : ' NA ARQUIBANCADA'}`, pequeno ? 40 : 46, pequeno ? 54 : 58);
  // a mureta de baixo, onde ficam os botões
  c.fillStyle = '#0b0e18'; c.fillRect(0, h - barraLobby(w), w, barraLobby(w));
  for (let x = 0, k = 0; x < w; x += 20, k++) { c.fillStyle = k % 2 ? '#e2343f' : '#f4f1ea'; c.fillRect(x, h - barraLobby(w), 20, 4); }
}

/* a ola: sai de um lugar e dá uma volta inteira no estádio */
let ola = null, proximaOla = 0;
const VOLTA_OLA = 5.5;
function alturaOla(u, t) {
  if (!ola) return 0;
  const frente = (t - ola.t0) / VOLTA_OLA, atras = ((u - ola.u0) % 1 + 1) % 1, d = frente - atras;
  return d > -0.035 && d < 0.07 ? Math.sin((d + 0.035) / 0.105 * Math.PI) : 0;
}
function puxaOla(u0, agora) { ola = { t0: agora, u0 }; proximaOla = agora + 40 + Math.random() * 30; if (!calmo) som.torcida(); }

function setoresVivos(c, lay, t, agora, ex) {
  if (ola && (t - ola.t0) / VOLTA_OLA > 1.15) ola = null;
  for (const s of lay.setores) {
    const dentro = s.membros.filter(p => CORRIDA.entrou.has(p.id)).sort((p, q) => CORRIDA.entrou.get(p.id) - CORRIDA.entrou.get(q.id));
    dentro.forEach((p, i) => {
      const l = s.lugares[i]; if (!l) return;
      const desde = agora - CORRIDA.entrou.get(p.id), esc2 = calmo ? 1 : easeBack(clamp(desde / 0.45, 0, 1));
      const sobe = calmo ? 0 : alturaOla(l.u, t), nx = Math.sin(l.a), ny = -Math.cos(l.a); // para fora do estádio
      const pulo = calmo ? 0 : (Math.sin(t * (2 + ex * 4) + i * 1.7 + hashStr(p.nome) % 7) * (0.8 + ex * 3)) - (ex > 0.5 ? Math.abs(Math.sin(t * 9 + i)) * ex * 2 : 0);
      const x = l.x + nx * sobe * l.r * 0.6, y = l.y + pulo - sobe * l.r * 1.2;
      desenhaAvatar(c, x, y, l.r * (1 + sobe * 0.25), p, esc2);
      if (sobe > 0.5) { c.strokeStyle = corPessoa(p); c.lineWidth = Math.max(1.4, l.r * 0.22); c.lineCap = 'round'; c.beginPath(); c.moveTo(x - l.r * 0.8, y - l.r * 0.2); c.lineTo(x - l.r * 1.1, y - l.r * 1.3); c.moveTo(x + l.r * 0.8, y - l.r * 0.2); c.lineTo(x + l.r * 1.1, y - l.r * 1.3); c.stroke(); }
      hits.push({ tipo: 'gente', id: p.id, u: l.u, x, y, r: l.r, txt: `${p.nome} · ${p.setor}` });
      if (p.voce) posVoce = { x, y: y - l.r, r: l.r, u: l.u };
    });
    // a plaquinha do setor, por fora da arquibancada, com quantos já chegaram
    const rt = s.rotulo, txt = s.setor.toUpperCase(), cont = `${dentro.length}/${s.membros.length}`;
    c.save(); c.translate(rt.x, rt.y); c.rotate(rt.a);
    let fsz = lay.w < 520 ? 10 : 12; c.font = `700 ${fsz}px ${FONTE_GPC}`;
    let tw = c.measureText(txt).width; const cw2 = c.measureText(cont).width + 8;
    if (tw + cw2 + 14 > rt.larg) { fsz *= Math.max(0.6, (rt.larg - cw2 - 14) / tw); c.font = `700 ${fsz}px ${FONTE_GPC}`; tw = c.measureText(txt).width; }
    const pw = tw + cw2 + 14;
    c.fillStyle = s.cor; rr(c, -pw / 2, -9, pw, 18, 9); c.fill();
    c.fillStyle = '#10131c'; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText(txt, -pw / 2 + 7, 0.5);
    c.fillStyle = 'rgba(16,19,28,.65)'; c.font = `600 ${Math.min(fsz, 10)}px ${FONTE_GPC}`; c.fillText(cont, -pw / 2 + 7 + tw + 6, 0.5);
    c.restore();
  }
  // a plaquinha «VOCÊ» em cima do seu lugar, para se achar rápido
  if (posVoce) {
    const yv = posVoce.y - 4; c.font = `700 10px ${FONTE_GPC}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = '#ffd84d'; rr(c, posVoce.x - 17, yv - 15, 34, 13, 6.5); c.fill(); c.beginPath(); c.moveTo(posVoce.x - 3, yv - 2.5); c.lineTo(posVoce.x, yv + 1); c.lineTo(posVoce.x + 3, yv - 2.5); c.fill();
    c.fillStyle = '#1b1405'; c.fillText('VOCÊ', posVoce.x, yv - 8);
  }
  // de vez em quando alguém puxa a ola sozinho
  if (!calmo && !ola && lay.setores.length && CORRIDA.entrou.size > 6) {
    if (!proximaOla) proximaOla = agora + 25 + Math.random() * 20;
    if (agora > proximaOla) { const gente = hits.filter(x => x.tipo === 'gente' && !(PESSOA.get(x.id) || {}).voce), hh = gente[Math.floor(Math.random() * gente.length)]; if (hh) { puxaOla(hh.u, agora); bolhasL.push({ x: hh.x, y: hh.y - hh.r, txt: 'Olaaa!', t0: agora }); } }
  }
}

const pulosL = new Map();
function gridVivo(c, lay, t, agora, prep) {
  const G = lay.grid;
  for (const s of lay.slots) {
    const p = s.p, est = PESSOA.get(p.id)?.est || null, r = s.r;
    if (!est) {
      c.strokeStyle = 'rgba(244,241,234,.45)'; c.setLineDash([3, 3]); c.lineWidth = 1.2; circ(c, s.x, s.y, r * 0.8); c.stroke(); c.setLineDash([]);
      c.fillStyle = 'rgba(244,241,234,.7)'; c.font = `600 ${r * 0.8}px Rubik, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('?', s.x, s.y + 1);
      hits.push({ tipo: 'alma', id: p.id, x: s.x, y: s.y, r, txt: `${p.nome} · ainda escolhendo` });
      continue;
    }
    const desde = agora - (CORRIDA.escolhidoEm.get(p.id) || 0), e2 = prep && !calmo ? easeBack(clamp(desde / 0.4, 0, 1)) : 1;
    const ph = s.i * 1.37 + t, sobre = mouse && Math.hypot(mouse.x - s.x, mouse.y - s.y) < r * 1.3;
    const pl = pulosL.get(p.id), dp = pl != null ? agora - pl : 9, pulo = !calmo && dp >= 0 && dp < 0.5 ? Math.sin(dp / 0.5 * Math.PI) * r * 0.7 : 0;
    const olhaArq = Math.floor(ph / 4.2) % 5 === 2;
    const expr = sobre || dp < 1.4 ? 'feliz' : (Math.floor(ph / 3.1) % 9 === 5 ? 'sono' : 'normal');
    c.fillStyle = 'rgba(0,0,0,.3)'; elip(c, s.x + 2, s.y + r * 0.95, r * (0.85 - pulo / r * 0.25), r * 0.25); c.fill();
    // o motor esquentando: risquinhos atrás de quem está se mexendo
    if (!calmo && (Math.floor(ph / 2.2) % 6 === 1 || dp < 0.6)) { c.strokeStyle = 'rgba(244,241,234,.35)'; c.lineWidth = 1.4; for (let k = 0; k < 3; k++) { const yy = s.y - r * 0.4 + k * r * 0.4, xx = s.x - r * 1.2 - ((t * 60 + k * 9) % 10); c.beginPath(); c.moveTo(xx, yy); c.lineTo(xx - r * 0.6, yy); c.stroke(); } }
    desenhaAlma(c, s.x, s.y - pulo + (calmo ? 0 : Math.sin(t * 2.2 + s.i) * 1.2), r * e2, est, { expr, lx: olhaArq ? -0.2 : 0.75, ly: olhaArq ? -0.8 : Math.cos(t * .5 + s.i) * .25, t: ph, pisca: (ph % 3.4) < .12, inc: pulo ? 0.15 : 0.06 });
    if (p.voce) { c.strokeStyle = '#ffd84d'; c.lineWidth = 1.6; c.setLineDash([3, 3]); circ(c, s.x, s.y - pulo, r + 4); c.stroke(); c.setLineDash([]); if (!G.nomes) { c.fillStyle = '#ffd84d'; c.font = `700 10px ${FONTE_GPC}`; c.textAlign = 'center'; c.textBaseline = 'bottom'; c.fillText('VOCÊ', s.x, s.y - r - 6 - pulo); } }
    hits.push({ tipo: 'alma', id: p.id, x: s.x, y: s.y - pulo, r, txt: `${p.nome} · ${descreve(est).modelo}` });
  }
}

/* o pórtico: as cinco luzes ficam em espera, piscando de leve, até o super admin dar a largada */
/* o pórtico: as cinco luzes, em pé ao lado da linha de largada, ficam em espera piscando de leve até o super admin dar a largada */
function porticoLobby(c, lay, t) {
  const P = lay.pista, n = 5, q = Math.min(9, (P.h - 30) / 12), x = lay.largada + 18, bh = n * q * 2.2 + 8, y = P.y + P.h / 2 - bh / 2;
  c.fillStyle = '#0d0f16'; rr(c, x, y, q * 2 + 6, bh, 5); c.fill(); c.strokeStyle = '#3a4058'; c.lineWidth = 1; c.stroke();
  for (let i = 0; i < n; i++) {
    const cx = x + q + 3, cy = y + 4 + q * 1.1 + i * q * 2.2, onda = calmo ? 0.3 : 0.25 + 0.25 * Math.max(0, Math.sin(t * 2.4 - i * 0.6));
    c.fillStyle = '#1e1013'; circ(c, cx, cy, q * 0.85); c.fill();
    c.fillStyle = `rgba(255,60,70,${onda})`; circ(c, cx, cy, q * 0.62); c.fill();
  }
}

function cabecalhoVivo(c, lay, agora) {
  const { w } = lay, pequeno = w < 520;
  // o prêmio, num troféu dourado, e quantos estão assistindo
  const x = w - 14;
  c.font = `700 ${pequeno ? 13 : 15}px ${FONTE_GPC}`; c.textBaseline = 'middle'; c.textAlign = 'right';
  if (CORRIDA.premio) {
    const txt = `PRÊMIO ${CORRIDA.premio.toUpperCase()}`, tw = c.measureText(txt).width, bw = tw + 38, y = pequeno ? 78 : 22, xr = pequeno ? 16 + bw : x;
    const gd = c.createLinearGradient(0, y - 13, 0, y + 13); gd.addColorStop(0, '#ffe68a'); gd.addColorStop(1, '#e0a92a');
    c.fillStyle = gd; rr(c, xr - bw, y - 13, bw, 26, 13); c.fill();
    c.fillStyle = '#5a3a06'; c.beginPath(); c.moveTo(xr - bw + 11, y - 7); c.lineTo(xr - bw + 23, y - 7); c.lineTo(xr - bw + 21, y + 1); c.quadraticCurveTo(xr - bw + 17, y + 4, xr - bw + 13, y + 1); c.closePath(); c.fill(); c.fillRect(xr - bw + 16, y + 2, 2, 4); c.fillRect(xr - bw + 12.5, y + 6, 9, 2);
    c.fillStyle = '#2a1a02'; c.fillText(txt, xr - 11, y + 1);
  }
  if (!lay.prep) {
    const y = pequeno ? 78 : 52, txt = `${CORRIDA.entrou.size} ASSISTINDO`;
    c.font = `600 ${pequeno ? 11 : 12}px ${FONTE_GPC}`; c.fillStyle = '#d8e0f4'; c.fillText(txt, x, y);
    const tw = c.measureText(txt).width, pis = calmo ? 1 : 0.55 + 0.45 * Math.sin(agora * 5);
    c.fillStyle = `rgba(255,77,94,${pis})`; circ(c, x - tw - 9, y, 4); c.fill();
  }
}

const GRITOS = ['Bora!', 'Uhuu!', 'Boa sorte!', '♥', 'Que mapa vai ser?', 'Tô torcendo!', 'Vamo!', 'Vai dar bom!'];
const GRITOS_PISTA = ['Vrum vrum!', 'Tô pronto!', 'Partiu!', 'Hoje é meu!', 'Bora!', 'Vou na frente!', 'Segura essa!', 'Ninguém me pega!'];
function desenhaLobby(c, w, h, t, agora, ex, modo) {
  hits = []; posVoce = null;
  const prep = modo === 'preparo', ps = corredores();
  const chave = [w, h, dpr, prep, ps.map(p => p.id).join(','), GENTE.map(p => p.id + (p.est ? p.est.modelo + p.est.cor : '')).join(','), CORRIDA.premio, prep ? ps.filter(p => !!p.est).length : 0].join('|');
  if (!lobbyCache || lobbyCache.chave !== chave) {
    const lay = layoutLobby(w, h, prep), cv2 = lobbyCache && lobbyCache.cv || document.createElement('canvas');
    cv2.width = Math.round(w * dpr); cv2.height = Math.round(h * dpr);
    const c2 = cv2.getContext('2d'); c2.setTransform(dpr, 0, 0, dpr, 0, 0); pintaFundoLobby(c2, lay);
    lobbyCache = { chave, cv: cv2, lay };
  }
  const lay = lobbyCache.lay;
  c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(lobbyCache.cv, 0, 0); c.restore();
  cabecalhoVivo(c, lay, agora);
  setoresVivos(c, lay, t, agora, ex);
  porticoLobby(c, lay, t);
  gridVivo(c, lay, t, agora, prep);
  if (!prep && !calmo && hits.length) {
    // de vez em quando alguém da arquibancada grita, e alguém no grid responde
    if (Math.random() < (1 / 60) * (1.1 + ex * 4)) {
      const gente = hits.filter(x => x.tipo === 'gente' && !(PESSOA.get(x.id) || {}).voce), hh = gente[Math.floor(Math.random() * gente.length)];
      if (hh) { let txt = GRITOS[Math.floor(Math.random() * GRITOS.length)]; if (Math.random() < .3 && ps.length) txt = `Vai, ${ps[Math.floor(Math.random() * ps.length)].nome}!`; bolhasL.push({ x: hh.x, y: hh.y - hh.r, txt, t0: agora }); }
    }
    if (Math.random() < (1 / 60) * 0.45) {
      const almas = hits.filter(x => x.tipo === 'alma'), hh = almas[Math.floor(Math.random() * almas.length)];
      if (hh && !bolhasL.some(b => b.id === hh.id && agora - b.t0 < 2.2)) { bolhasL.push({ id: hh.id, x: hh.x, y: hh.y - hh.r, txt: GRITOS_PISTA[Math.floor(Math.random() * GRITOS_PISTA.length)], t0: agora, cor: '#e8f1ff' }); pulosL.set(hh.id, agora); }
    }
  }
  bolhasL = bolhasL.filter(b => agora - b.t0 < 2.2); bolhasL.forEach(b => bolhaFala(c, b, agora));
  if (mouse) { const hh = hits.find(x => Math.hypot(mouse.x - x.x, mouse.y - x.y) < x.r + 2); if (hh) { c.font = '500 12px Rubik, sans-serif'; const tw = c.measureText(hh.txt).width, tx = clamp(mouse.x - tw / 2 - 8, 4, w - tw - 20); c.fillStyle = 'rgba(10,14,26,.94)'; rr(c, tx, mouse.y - 34, tw + 16, 22, 6); c.fill(); c.fillStyle = '#eef2fb'; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText(hh.txt, tx + 8, mouse.y - 23); } }
  c.textAlign = 'left'; c.textBaseline = 'alphabetic';
}
function reagir(tipo) {
  const b = { dataset: { reacao: tipo } }; if (!posVoce || bolhasL.length > 40) return; // teto de falas: clicar sem parar não derruba o FPS
  const agora = agoraS(), txt = { palmas: 'Clap clap!', torcer: 'Vaaai!', coracao: '♥ ♥ ♥', ola: 'Olaaa!' }[b.dataset.reacao];
  if (b.dataset.reacao === 'ola') { som.liga(); if (!ola) puxaOla(posVoce.u, agora); bolhasL.push({ x: posVoce.x, y: posVoce.y, txt, t0: agora, cor: '#ffd84d' }); return; }
  bolhasL.push({ x: posVoce.x, y: posVoce.y, txt, t0: agora, cor: '#ffd84d' });
  const minhaAlma = hits.find(x => x.tipo === 'alma' && x.id === EU); if (minhaAlma) { bolhasL.push({ id: minhaAlma.id, x: minhaAlma.x, y: minhaAlma.y - minhaAlma.r, txt: b.dataset.reacao === 'coracao' ? '♥' : 'Bora!', t0: agora + 0.15, cor: '#e8f1ff' }); pulosL.set(minhaAlma.id, agora + 0.15); }
  const gente = hits.filter(x => x.tipo === 'gente');
  for (let k = 0; k < 4; k++) { const hh = gente[Math.floor(Math.random() * gente.length)]; if (hh) bolhasL.push({ x: hh.x, y: hh.y - hh.r, txt: b.dataset.reacao === 'coracao' ? '♥' : txt, t0: agora + 0.25 + k * 0.18 }); }
  som.liga(); b.dataset.reacao === 'palmas' ? som.ruido(0.5, { vol: 0.12, filtro: { tipo: 'highpass', f: 1800 } }) : som.pop();
}

/* ================= a contagem e a caixa dos mapas ================= */
const CAIXA_N = 64, CAIXA_WIN = 54;
function geraFaixa(rg, mapa) { const f = []; for (let i = 0; i < CAIXA_N; i++) f.push(MAPAS[Math.floor(rg() * MAPAS.length)].id); f[CAIXA_WIN] = mapa; return f; }
function desenhaContagem(c, w, h, t, agora) {
  desenhaLobby(c, w, h, agora, agora, Math.min(1, 0.3 + t / 10), 'lobby');
  c.fillStyle = 'rgba(5,3,8,.6)'; c.fillRect(0, 0, w, h);
  const n = Math.max(1, Math.ceil(DUR.contagem - t)), frac = (DUR.contagem - t) - (n - 1), R = Math.min(w, h) * 0.2, cx = w / 2, cy = h * 0.5;
  c.lineWidth = 10; c.strokeStyle = 'rgba(239,230,212,.12)'; circ(c, cx, cy, R); c.stroke();
  c.strokeStyle = n <= 3 ? '#ff4d5e' : '#ffd84d'; c.lineCap = 'round'; c.beginPath(); c.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac); c.stroke();
  const pulso = calmo ? 1 : 1 + 0.28 * Math.pow(frac, 6);
  c.save(); c.translate(cx, cy); c.scale(pulso, pulso); c.textAlign = 'center'; c.textBaseline = 'middle';
  c.shadowColor = n <= 3 ? '#ff4d5e' : '#ffd84d'; c.shadowBlur = 30; c.fillStyle = '#fff6e6'; c.font = `${R * 1.15}px ${FONTE_GP}`; c.fillText(String(n), 0, R * 0.06); c.restore();
  c.textAlign = 'center'; c.fillStyle = '#efe6d4'; c.font = `${Math.min(30, w / 18)}px ${FONTE_GP}`; c.fillText('O mapa vai ser sorteado em', cx, cy - R - 26);
  c.font = `700 13px ${FONTE_GPC}`; c.fillStyle = '#9fb0d8'; c.fillText(n === 1 ? 'SEGUNDO' : 'SEGUNDOS', cx, cy + R + 30); c.textAlign = 'left';
}
const easeCaixa = u => 1 - Math.pow(1 - clamp(u, 0, 1), 4.6);
function itemCaixa(c, x, y, iw, ih, id) {
  const cor = RARIDADE[id], m = MAPAS.find(q => q.id === id), imgH = ih * 0.68;
  c.fillStyle = '#16101e'; rr(c, x, y, iw, ih, 8); c.fill();
  c.save(); rr(c, x, y, iw, ih, 8); c.clip();
  const img = cartaoDe(id), s = Math.max(iw / img.width, imgH / img.height); c.drawImage(img, x + (iw - img.width * s) / 2, y + (imgH - img.height * s) / 2, img.width * s, img.height * s);
  const gg = c.createLinearGradient(0, y + imgH * .45, 0, y + imgH); gg.addColorStop(0, rgba(cor, 0)); gg.addColorStop(1, rgba(cor, .55)); c.fillStyle = gg; c.fillRect(x, y, iw, imgH);
  c.fillStyle = '#120c18'; c.fillRect(x, y + imgH, iw, ih - imgH);
  c.fillStyle = cor; c.fillRect(x, y + ih - 5, iw, 5);
  c.restore();
  c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#fff6e6';
  let fs = iw * 0.11; c.font = fonteMapa(id, fs); const lg = c.measureText(m.nome).width; if (lg > iw * 0.9) { fs *= iw * 0.9 / lg; c.font = fonteMapa(id, fs); }
  c.fillText(m.nome, x + iw / 2, y + imgH + (ih - imgH) * 0.4);
  c.font = '500 8.5px "IBM Plex Mono", monospace'; c.fillStyle = rgba(cor, .95); c.fillText(m.tema.toUpperCase(), x + iw / 2, y + imgH + (ih - imgH) * 0.75);
  c.textAlign = 'left'; c.textBaseline = 'alphabetic';
}
function desenhaCaixa(c, w, h, u, sh, foco, agora) {
  const g = c.createRadialGradient(w / 2, h * .5, 20, w / 2, h * .5, w * .8); g.addColorStop(0, '#1b2748'); g.addColorStop(1, '#070a16'); c.fillStyle = g; c.fillRect(0, 0, w, h);
  c.strokeStyle = 'rgba(255,255,255,.025)'; c.lineWidth = 1; for (let x = -h; x < w; x += 18) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x + h, h); c.stroke(); }
  luzes(c, w, h, agora * (foco ? 6 : 2 + (1 - u) * 14), ['#ff8a2b', '#b08af5', '#ffd84d']);
  c.textAlign = 'center'; c.fillStyle = '#ffd84d'; c.font = `${Math.min(42, w / 14)}px ${FONTE_GP}`; c.fillText(foco ? 'Mapa sorteado!' : 'Caixa dos Mapas', w / 2, h * 0.2 + 6);
  c.font = `700 13px ${FONTE_GPC}`; c.fillStyle = '#9fb0d8'; c.fillText(foco ? MAPAS.find(m => m.id === sh.mapa).tema.toUpperCase() : 'SORTEIO DO MAPA DA CORRIDA', w / 2, h * 0.2 + 26); c.textAlign = 'left';
  const iw = clamp(w * 0.24, 118, 196), ih = iw * 0.86, gap = 6, passo = iw + gap, cy = h * 0.54, y0 = cy - ih / 2;
  const alvo = CAIXA_WIN * passo + iw * sh.parada - w / 2, off = alvo * easeCaixa(u);
  const k = Math.floor((off + w / 2) / passo); if (k !== sh.tique && !foco) { sh.tique = k; som.tique(k); sh.tiqueEm = agora; }
  c.fillStyle = 'rgba(0,0,0,.5)'; c.fillRect(0, y0 - 14, w, ih + 28); c.fillStyle = 'rgba(255,216,77,.22)'; c.fillRect(0, y0 - 14, w, 1.5); c.fillRect(0, y0 + ih + 12.5, w, 1.5);
  const i0 = Math.max(0, Math.floor(off / passo) - 1), i1 = Math.min(CAIXA_N - 1, Math.ceil((off + w) / passo) + 1);
  for (let i = i0; i <= i1; i++) {
    const x = i * passo - off; if (i === CAIXA_WIN && foco) continue;
    itemCaixa(c, x, y0, iw, ih, sh.faixa[i]);
    if (foco) { c.fillStyle = `rgba(7,5,11,${0.72 * foco})`; rr(c, x, y0, iw, ih, 8); c.fill(); }
  }
  if (foco) {
    const x = CAIXA_WIN * passo - off, s = 1 + 0.1 * foco, cor = RARIDADE[sh.mapa];
    c.save(); c.translate(x + iw / 2, cy); c.scale(s, s); c.shadowColor = cor; c.shadowBlur = 40 * foco; c.fillStyle = cor; rr(c, -iw / 2 - 3, -ih / 2 - 3, iw + 6, ih + 6, 10); c.fill(); c.shadowBlur = 0;
    itemCaixa(c, -iw / 2, -ih / 2, iw, ih, sh.mapa); c.restore();
  }
  const fade = (x0, x1) => { const gr = c.createLinearGradient(x0, 0, x1, 0); gr.addColorStop(0, 'rgba(7,5,11,.95)'); gr.addColorStop(1, 'rgba(7,5,11,0)'); c.fillStyle = gr; c.fillRect(Math.min(x0, x1), y0 - 14, Math.abs(x1 - x0), ih + 28); };
  fade(0, w * 0.14); fade(w, w * 0.86);
  if (!foco) {
    const tr = 1 - clamp((agora - (sh.tiqueEm || 0)) / 0.12, 0, 1);
    c.fillStyle = '#ffd84d'; c.shadowColor = '#ffd84d'; c.shadowBlur = 12; c.fillRect(w / 2 - 1.5, y0 - 18, 3, ih + 36); c.shadowBlur = 0;
    c.beginPath(); c.moveTo(w / 2 - 10, y0 - 26 - tr * 3); c.lineTo(w / 2 + 10, y0 - 26 - tr * 3); c.lineTo(w / 2, y0 - 12); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(w / 2 - 10, y0 + ih + 26 + tr * 3); c.lineTo(w / 2 + 10, y0 + ih + 26 + tr * 3); c.lineTo(w / 2, y0 + ih + 12); c.closePath(); c.fill();
  }
}

/* ================= a linha do tempo: tudo é conta do relógio do banco ================= */
/* A largada (`inicia_em`) é a mesma para todo mundo: a contagem, a caixa, a abertura do mapa, a corrida e
   a festa saem de `agora - inicia_em`. Quem chega atrasado cai no ponto certo; ninguém «pula» nada. */
const SHOW = (() => { let t = 0; const fases = []; for (const f of ['contagem', 'caixa', 'pouso', 'intro', 'saida']) { fases.push({ f, t0: t }); t += DUR[f]; } return { fases, total: t }; })();
const FESTA_MUSICA = 77; // o Tema da Vitória tem 77 s; depois dele a festa fica no último quadro, parada
function janelaLenta() { const f = rec && rec.foto; return f && f.d2 >= 0 && f.t2 - f.t1 < 1 ? [Math.max(0, f.t1 - 1.3), f.t2 + 0.15] : null; }
/** Segundos de relógio desde a largada da pista → T da gravação (a câmera lenta da foto de chegada a 30%). */
function tDaCorrida(e) {
  const j = janelaLenta(); if (!j || e <= j[0]) return e;
  const el = (j[1] - j[0]) / 0.3; return e - j[0] <= el ? j[0] + (e - j[0]) * 0.3 : j[1] + (e - j[0] - el);
}
function eDaCorrida(t) {
  const j = janelaLenta(); if (!j || t <= j[0]) return t;
  return t <= j[1] ? j[0] + (t - j[0]) / 0.3 : j[0] + (j[1] - j[0]) / 0.3 + (t - j[1]);
}
function linhaDoTempo(agora) {
  if (!CORRIDA.id || CORRIDA.estado === 'nada') return { tela: 'nada' };
  if (CORRIDA.estado === 'cancelada') return { tela: 'cancelada' };
  if (CORRIDA.estado === 'preparando') return { tela: 'preparo' };
  if (CORRIDA.iniciaEm == null || agora < CORRIDA.iniciaEm) return { tela: 'lobby' };
  const t = agora - CORRIDA.iniciaEm;
  if (t < SHOW.total) { let k = 0; while (k + 1 < SHOW.fases.length && t >= SHOW.fases[k + 1].t0) k++; return { tela: 'show', fase: SHOW.fases[k].f, tf: t - SHOW.fases[k].t0, t }; }
  if (!rec || rec.seed !== CORRIDA.semente) return { tela: 'carregando', t };
  const e = t - SHOW.total, festaE = eDaCorrida(rec.tVenc + 2);
  if (e < festaE) return { tela: 'corrida', e, T: tDaCorrida(e) };
  return { tela: VIDEOS ? 'video' : 'festa', ef: e - festaE, festaE };
}

/* ================= a cerimônia (contagem, caixa, abertura), desenhada a partir da linha do tempo ================= */
let showSons = { chave: '', num: -1, pouso: false, intro: false, tique: -1 };
function desenhaShow(tl, agora, dt) {
  const c = octx, w = cw, h = ch, sh = SHOW_ATUAL, aS = agora;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (showSons.chave !== CORRIDA.id + ':' + CORRIDA.iniciaEm) showSons = { chave: CORRIDA.id + ':' + CORRIDA.iniciaEm, num: -1, pouso: tl.t > DUR.contagem + DUR.caixa + 0.3, intro: tl.t > SHOW.fases[3].t0 + 0.3, tique: -1 };
  const t = tl.tf;
  if (tl.fase === 'contagem') {
    const n = Math.max(0, Math.ceil(DUR.contagem - t)); if (n !== showSons.num) { const antes = showSons.num; showSons.num = n; if (antes !== -1 && n > 0) som.contagem(n); if (n === 10) som.torcida(); }
    desenhaContagem(c, w, h, t, aS);
    return;
  }
  if (showSons.num !== 0 && tl.fase === 'caixa' && t < 0.4) { showSons.num = 0; som.contagem(0); }
  if (tl.fase === 'caixa') { desenhaCaixa(c, w, h, t / DUR.caixa, sh, 0, aS); return; }
  if (tl.fase === 'pouso') {
    if (!showSons.pouso) { showSons.pouso = true; som.pouso(); som.torcida(); soltaC(120, w / 2, h * .54, { v: 560, g: 520, vida: 1.9, cor: [RARIDADE[sh.mapa], '#ffd84d', '#ffffff', '#b08af5'], tam: 4, forma: 'q' }); }
    desenhaCaixa(c, w, h, 1, sh, easeBack(clamp(t / 0.5, 0, 1)), aS);
    desenhaCParts(c, dt);
    return;
  }
  if (tl.fase === 'intro') {
    if (!showSons.intro) { showSons.intro = true; if (SOM_INTRO[sh.mapa]) SOM_INTRO[sh.mapa](); }
    INTRO[sh.mapa](c, w, h, t, cartaoDe(sh.mapa), dt);
    desenhaCParts(c, dt);
    return;
  }
  INTRO[sh.mapa](c, w, h, DUR.intro, cartaoDe(sh.mapa), 0);
  c.fillStyle = `rgba(5,3,8,${clamp(t / DUR.saida, 0, 1)})`; c.fillRect(0, 0, w, h);
}
let SHOW_ATUAL = { mapa: 'halloween', faixa: [], parada: 0.5, tique: -1 };

/* ================= a música: o lobby (15 s depois de abrir, 10% subindo rápido até 20%) e o Tema da Vitória ================= */
const LOBBY_ATRASO = 15, LOBBY_SUBIDA = 6, VOL_TETO = 0.2;
const volVitoria = s => s < 15 ? 0.25 : s < 17 ? 0.25 - 0.10 * (s - 15) / 2 : 0.15;
let prefs = { max: VOL_TETO, mudo: false };
try { const p = JSON.parse(localStorage.getItem('corrida-volume') || 'null'); if (p && typeof p.max === 'number') prefs = { max: clamp(p.max, 0, VOL_TETO), mudo: !!p.mudo }; } catch (e) { }
const salvaPrefs = () => { try { localStorage.setItem('corrida-volume', JSON.stringify(prefs)); } catch (e) { } };
const musica = {
  lobby: null, vitoria: null, ganhoL: null, ganhoV: null, analisador: null, bins: null, ligada: false,
  criar() {
    if (this.lobby) return;
    this.lobby = new Audio(); this.lobby.preload = 'auto'; this.lobby.loop = true; this.lobby.src = opcoes.sons.lobby;
    this.vitoria = new Audio(); this.vitoria.preload = 'auto'; this.vitoria.src = opcoes.sons.vitoria;
  },
  /* chamado dentro do clique: o volume vai por um GainNode (o Safari do iPhone ignora o volume do elemento)
     e o analisador fica antes do volume, para as barrinhas mostrarem a música e não o volume */
  ligar() {
    this.criar();
    if (this.ligada || !som.ac) return;
    try {
      const ac = som.ac;
      this.ganhoL = ac.createGain(); this.ganhoL.gain.value = 0;
      this.analisador = ac.createAnalyser(); this.analisador.fftSize = 256; this.analisador.smoothingTimeConstant = 0.78;
      this.bins = new Uint8Array(this.analisador.frequencyBinCount);
      ac.createMediaElementSource(this.lobby).connect(this.analisador).connect(this.ganhoL).connect(ac.destination);
      this.ganhoV = ac.createGain(); this.ganhoV.gain.value = 0;
      ac.createMediaElementSource(this.vitoria).connect(this.ganhoV).connect(ac.destination);
      this.ligada = true;
    } catch (e) { this.ligada = false; }
    // os dois tocam um instante no clique: fica liberado para tocar depois, sem outro clique
    for (const a of [this.lobby, this.vitoria]) { const p = a.play(); if (p) p.then(() => { if (!this.querendo(a)) a.pause(); }).catch(() => { }); }
  },
  querendo(a) { return a === this.lobby ? this.estadoL.toca : this.estadoV.toca; },
  estadoL: { toca: false, vol: 0, pos: 0 }, estadoV: { toca: false, vol: 0, pos: 0 },
  ajusta(a, ganho, alvo, pos, dur) {
    if (!a) return;
    if (alvo.toca) {
      const p = dur > 0 ? pos % dur : pos;
      if (a.paused) { try { a.currentTime = p; } catch (e) { } const pr = a.play(); if (pr) pr.catch(() => { }); }
      else if (Math.abs(a.currentTime - p) > 0.6 && !(dur > 0 && Math.abs(a.currentTime - p) > dur - 1)) { try { a.currentTime = p; } catch (e) { } }
    } else if (!a.paused && (!ganho || ganho.gain.value < 0.003)) a.pause();
    const v = alvo.toca && entrei && !prefs.mudo && som.ligado ? alvo.vol : 0;
    if (ganho && som.ac) ganho.gain.setTargetAtTime(v, som.ac.currentTime, 0.12); else a.volume = clamp(v, 0, 1);
  },
  tick(tl, agora) {
    const L = this.estadoL, V = this.estadoV;
    const pL = agora - (CORRIDA.abertaEm + LOBBY_ATRASO);
    const naLobby = entrei && CORRIDA.abertaEm && (tl.tela === 'lobby' || (tl.tela === 'show' && tl.t < 2.5));
    L.toca = !!naLobby && pL >= 0;
    const rampa = Math.min(prefs.max, 0.10 + 0.10 * clamp(pL / LOBBY_SUBIDA, 0, 1));
    L.vol = tl.tela === 'show' ? rampa * clamp(1 - tl.t / 2.5, 0, 1) : rampa;
    const naFesta = entrei && (tl.tela === 'video' || tl.tela === 'festa') && tl.ef < FESTA_MUSICA;
    V.toca = !!naFesta; V.vol = naFesta ? volVitoria(tl.ef) * (prefs.max / VOL_TETO) : 0;
    if (!this.lobby && (L.toca || V.toca)) this.criar();
    this.ajusta(this.lobby, this.ganhoL, L, Math.max(0, pL), this.lobby && isFinite(this.lobby.duration) ? this.lobby.duration : 0);
    this.ajusta(this.vitoria, this.ganhoV, V, naFesta ? tl.ef : 0, 0);
  },
  /** o que o player mostra: qual música, se está tocando e o volume de agora (já com a subida) */
  painel(tl) {
    if (this.estadoV.toca) return { qual: 'vitoria', tocando: true, pct: prefs.mudo ? 0 : this.estadoV.vol };
    if (tl.tela === 'lobby' || tl.tela === 'show') return { qual: 'lobby', tocando: this.estadoL.toca, pct: prefs.mudo ? 0 : this.estadoL.vol };
    return { qual: null, tocando: false, pct: 0 };
  },
  barras(n) {
    if (!this.analisador || !this.estadoL.toca || prefs.mudo || !this.lobby || this.lobby.paused) return null;
    this.analisador.getByteFrequencyData(this.bins);
    // As barras acompanham o volume escolhido (20/10/2026): som baixo, barras baixas.
    const nivel = 0.25 + 0.75 * clamp(this.estadoL.vol / VOL_TETO, 0, 1);
    const lo = 1, hi = Math.floor(this.bins.length * 0.72);
    return Array.from({ length: n }, (_, i) => {
      const a = Math.floor(lo * Math.pow(hi / lo, i / n)), b = Math.max(a + 1, Math.floor(lo * Math.pow(hi / lo, (i + 1) / n)));
      let m = 0; for (let k = a; k < b; k++) m += this.bins[k];
      // a média da faixa, sem o «chão» que a música sempre tem: só o que pulsa acima dele sobe a barra
      const v = Math.max(0, (m / (b - a) / 255 - 0.3) / 0.6);
      return Math.min(1, Math.pow(v, 1.5) * nivel);
    });
  },
  parar() { for (const a of [this.lobby, this.vitoria]) if (a) { a.pause(); a.removeAttribute('src'); try { a.load(); } catch (e) { } } },
};
let eqBarras = [], eqParado = true, eqPulo = false;
function mexeEq() {
  if (!eqBarras.length) return;
  eqPulo = !eqPulo; if (eqPulo) return;
  const v = CALMO ? null : musica.barras(eqBarras.length);
  if (!v) { if (!eqParado) { eqParado = true; for (const b of eqBarras) b.style.transform = ''; if (eqBarras[0].parentElement) eqBarras[0].parentElement.classList.remove('tocando'); } return; }
  if (eqParado) { eqParado = false; if (eqBarras[0].parentElement) eqBarras[0].parentElement.classList.add('tocando'); }
  for (let i = 0; i < eqBarras.length; i++) eqBarras[i].style.transform = `scaleY(${0.1 + v[i] * 0.9})`;
}

/* ================= os vídeos do fim (gravados pelo super admin), tocados no mesmo segundo para todo mundo ================= */
const vFesta = opcoes.videoFesta || null, vLoop = opcoes.videoLoop || null;
let ultEf = -1, videoFalhou = false;
function mostraVideo(qual) {
  if (vFesta) vFesta.hidden = qual !== 'festa';
  if (vLoop) vLoop.hidden = qual !== 'loop';
  if (qual !== 'festa' && vFesta && !vFesta.paused) vFesta.pause();
  if (qual !== 'loop' && vLoop && !vLoop.paused) vLoop.pause();
}
function sincVideo(v, pos) {
  if (!v) return;
  if (Math.abs(v.currentTime - pos) > 0.45) { try { v.currentTime = pos; } catch (e) { } }
  if (v.paused) { const p = v.play(); if (p) p.catch(() => { }); }
}
function quadroVideo(tl) {
  if (!VIDEOS || !vFesta || !vLoop) return;
  if (vFesta.dataset.src !== VIDEOS.festa) { vFesta.dataset.src = VIDEOS.festa; vFesta.src = VIDEOS.festa; vFesta.muted = true; vFesta.playsInline = true; }
  if (vLoop.dataset.src !== VIDEOS.loop) { vLoop.dataset.src = VIDEOS.loop; vLoop.src = VIDEOS.loop; vLoop.muted = true; vLoop.playsInline = true; vLoop.loop = true; }
  const ef = tl.ef;
  if (ef < VIDEOS.dur) { mostraVideo('festa'); sincVideo(vFesta, ef); }
  else {
    mostraVideo('loop');
    const d = isFinite(vLoop.duration) && vLoop.duration > 0 ? vLoop.duration : CICLO;
    const pos = (ef - VIDEOS.dur) % d;
    if (vLoop.paused || Math.abs(vLoop.currentTime - pos) > 0.6 && Math.abs(vLoop.currentTime - pos) < d - 0.6) sincVideo(vLoop, pos); else if (vLoop.paused) vLoop.play().catch(() => { });
  }
  // os sons da festa (o pouso, o «pling» de cada comemoração) entram na mesma marca do vídeo
  if (ultEf >= 0 && ef > ultEf && ef - ultEf < 1) for (const [t, q] of VIDEOS.cues || []) if (t > ultEf && t <= ef) somFesta(q);
  ultEf = ef;
}

/* ================= a festa ao vivo (quando o vídeo não existe ou não toca neste navegador) ================= */
let festaViva = null;
function quadroFestaViva(tl, agora, dt) {
  const t0 = (agora - tl.ef) * 1000;
  if (!festaViva || festaViva.chave !== CORRIDA.iniciaEm) {
    festa = novaFesta(t0); festa.salvo = { seguir, modoCam };
    seguir = rec.vencedor; modoCam = 'perto'; buscar(festa.T0);
    festaViva = { chave: CORRIDA.iniciaEm };
  }
  const ms = agora * 1000;
  ovl.hidden = festa.fase === 'replay';
  if (festa.fase === 'replay') { replayQuadro(ms, dt); if (festa.fase === 'festa') festa.t1 = t0 + (festa.T1 - festa.T0) / VEL_REPLAY * 1000; }
  else desenhaFesta(ms, dt);
}

/* ================= o laço ================= */
let rodando = true, raf = 0, ultimoQ = performance.now(), ultPainel = 0, ultLobby = 0, telaAnt = '', ultT = -1;
let pararGravacao = false;
let lobbyVisivel = true; // com um cenário novo por cima (LobbyNovo), o lobby daqui não é desenhado
function quadro() {
  if (!rodando) return;
  const agoraMs = performance.now(), dtR = Math.min(0.05, (agoraMs - ultimoQ) / 1000); ultimoQ = agoraMs;
  const agora = agoraS(), tl = linhaDoTempo(agora);
  try {
    if (tl.tela !== telaAnt) mudouTela(tl);
    musica.tick(tl, agora);
    if (tl.tela === 'lobby' || tl.tela === 'preparo') {
      // o lobby fica parado a maior parte do tempo: 30 quadros por segundo bastam e deixam o PC folgado
      if (lobbyVisivel && agoraMs - ultLobby > 28) { ultLobby = agoraMs; octx.setTransform(dpr, 0, 0, dpr, 0, 0); desenhaLobby(octx, cw, ch, agora, agora, 0, tl.tela === 'preparo' ? 'preparo' : 'lobby'); }
      mexeEq();
    } else if (tl.tela === 'show') {
      desenhaShow(tl, agora, dtR); mexeEq();
    } else if (tl.tela === 'carregando') {
      octx.setTransform(dpr, 0, 0, dpr, 0, 0); desenhaCarregando(octx, cw, ch, agora);
    } else if (tl.tela === 'corrida') {
      const novoT = tl.T;
      escala = janelaLenta() && novoT > janelaLenta()[0] && novoT < janelaLenta()[1] ? 0.3 : 1;
      if (ultT < 0 || Math.abs(novoT - ultT) > 0.5 || novoT < ultT) buscar(novoT);
      const antes = T; T = novoT; ultT = novoT;
      for (const k of [1, 2]) if (antes < k && T >= k) som.bip(false);
      if (antes < 3 && T >= 3) som.bip(true);
      desenhar(Math.max(0, T - antes));
    } else if (tl.tela === 'video') {
      quadroVideo(tl);
    } else if (tl.tela === 'festa') {
      quadroFestaViva(tl, agora, dtR);
    }
  } catch (e) { console.error('[corrida] quadro', e); }
  if (agoraMs - ultPainel > 250) { ultPainel = agoraMs; avisaPainel(tl); }
  raf = requestAnimationFrame(quadro);
}
function mudouTela(tl) {
  const antes = telaAnt; telaAnt = tl.tela;
  ovl.hidden = tl.tela === 'corrida' || tl.tela === 'video';
  if (tl.tela !== 'video') mostraVideo(null);
  if (tl.tela === 'corrida') { setTocando(true); seguir = seguirPedido; modoCam = 'pista'; ultT = -1; }
  else setTocando(false);
  if (tl.tela !== 'festa' && festa) { festa = null; festaViva = null; cparts = []; }
  if (tl.tela === 'video') { ultEf = -1; }
  if (antes === 'video' || antes === 'festa') { seguir = seguirPedido; modoCam = 'pista'; }
  if (tl.tela === 'show' || tl.tela === 'corrida' || tl.tela === 'festa') {
    if (CORRIDA.mapa && (!MAPA || MAPA.id !== CORRIDA.mapa)) carregaMapa(CORRIDA.mapa);
  }
}
function desenhaCarregando(c, w, h, agora) {
  const g = c.createRadialGradient(w / 2, h / 2, 20, w / 2, h / 2, w * .8); g.addColorStop(0, '#1b2748'); g.addColorStop(1, '#070a16'); c.fillStyle = g; c.fillRect(0, 0, w, h);
  c.textAlign = 'center'; c.fillStyle = '#fff6e6'; c.font = `${Math.min(30, w / 16)}px ${FONTE_GP}`; c.fillText('Carregando a corrida…', w / 2, h / 2 - 8);
  c.font = `600 13px ${FONTE_GPC}`; c.fillStyle = '#9fb0d8'; c.fillText('Ela começa no ponto em que todo mundo está', w / 2, h / 2 + 18);
  const k = Math.floor(agora * 4) % 4; for (let i = 0; i < 3; i++) { c.fillStyle = i < k ? '#ffd84d' : 'rgba(255,216,77,.25)'; circ(c, w / 2 - 14 + i * 14, h / 2 + 40, 4); c.fill(); }
  c.textAlign = 'left';
}

/* ================= o painel do lado (placar e narração) e o player ================= */
let seguirPedido = -1, aoPainel = opcoes.aoPainel || (() => { });
function avisaPainel(tl) {
  const base = { tela: tl.tela, musica: musica.painel(tl), volume: { max: prefs.max, mudo: prefs.mudo } };
  if ((tl.tela === 'corrida' || tl.tela === 'festa' || tl.tela === 'video') && rec && vb.length) {
    const rk = rankingV().slice(0, 8);
    base.placar = rk.map((r, i) => ({ pos: i + 1, id: (rec.ids || [])[r.dono] || null, nome: rec.nomes[r.dono], setor: rec.setores[r.dono], onde: r.b.fim ? 'chegou' : T < 3 ? 'largada' : ondeDe(r.b), est: r.b.est, voce: r.dono === rec.voce }));
    let k = 0; while (k < rec.narr.length && rec.narr[k].t <= T) k++;
    base.narracao = rec.narr.slice(Math.max(0, k - 10), k).reverse().map(nn => ({ t: nn.t - 3, txt: nn.txt }));
    base.tempo = Math.max(0, T - 3);
    if (rec.vencedor >= 0 && T >= rec.tVenc) base.vencedor = { id: (rec.ids || [])[rec.vencedor] || null, nome: rec.nomes[rec.vencedor] };
  }
  if (tl.tela === 'video' || tl.tela === 'festa') base.festa = { ef: tl.ef, acabou: tl.ef > FESTA_MUSICA };
  if (tl.tela === 'show') base.show = { fase: tl.fase, t: tl.t };
  aoPainel(base);
}

/* ================= ler e preparar a gravação de uma corrida ================= */
function prepararGravacao(r, extra) {
  if (!r) { rec = null; return; }
  if (!MAPA || MAPA.id !== r.mapa) carregaMapa(r.mapa);
  rec = r; rec.voce = (rec.ids || []).indexOf(EU);
  CORRIDA.semente = r.seed; CORRIDA.mapa = r.mapa;
  SHOW_ATUAL = { mapa: r.mapa, faixa: extra.faixa, parada: extra.parada, tique: -1 };
  vb.length = 0; buscar(0); ultT = -1; festaViva = null;
}

/* ================= a gravação (no navegador do super admin) ================= */
const pausa = () => new Promise(r => setTimeout(r, 0));
async function gravar({ pessoas, premio, aoProgresso = () => { }, cancelado = () => false }) {
  if (!pessoas || pessoas.length < 2) throw new Error('A corrida precisa de pelo menos 2 pessoas correndo.');
  pararGravacao = false;
  const semente = 1000 + Math.floor(Math.random() * 99000), rg = mulberry32(semente ^ 0x5bd1e995);
  const mapa = MAPAS[Math.floor(rg() * MAPAS.length)].id, faixa = geraFaixa(rg, mapa), parada = 0.16 + rg() * 0.68;
  carregaMapa(mapa);
  // a narração é a mesma para todo mundo: ninguém é «você» na gravação
  const lista = pessoas.map(p => ({ nome: p.nome, setor: p.setor || 'Sem setor', almas: 1, estilos: [p.est], voce: false }));
  const g = criarGravacao(semente, lista);
  while (!g.rodar(240)) {
    if (cancelado()) return null;
    aoProgresso(0.5 * g.progresso());
    await pausa();
  }
  const r = g.rec; r.ids = pessoas.map(p => p.id);
  delete r.metricas;
  // a festa do fim, em vídeo: a foto de quem venceu precisa estar carregada antes
  const venc = pessoas[r.vencedor];
  if (venc && venc.foto) await esperaFoto(venc.foto, 6000);
  const salvoPessoa = PESSOA.get(venc && venc.id);
  if (venc && !salvoPessoa) PESSOA.set(venc.id, { id: venc.id, nome: venc.nome, setor: venc.setor || 'Sem setor', foto: venc.foto, voce: false });
  const premioAntes = CORRIDA.premio; CORRIDA.premio = premio || '';
  const recAntes = rec; rec = r;
  let video = null;
  try { video = await gravaFestaVideo(cancelado, f => aoProgresso(0.5 + 0.5 * f)); }
  finally { rec = recAntes; CORRIDA.premio = premioAntes; if (venc && !salvoPessoa) PESSOA.delete(venc.id); }
  if (cancelado()) return null;
  aoProgresso(1);
  return { rec: r, semente, mapa, faixa, parada, video, vencedor: venc ? venc.id : null, durShow: SHOW.total };
}

/* ================= a API ================= */
const resize = () => medir();
const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
if (ro) ro.observe(cv);
medir();
raf = requestAnimationFrame(quadro);

return {
  /** O relógio do banco, em segundos. */
  setRelogio(fn) { agoraFn = fn; },
  /** Quem é «você» (o id do perfil). */
  setEu(id) { EU = id; for (const p of GENTE) p.voce = p.id === id; if (rec) rec.voce = (rec.ids || []).indexOf(id); sprites.clear(); lobbyCache = null; },
  /** A corrida: `{ id, premio, estado, abertaEm, iniciaEm }` (segundos no relógio do banco). */
  setCorrida(c) {
    if (!c) { CORRIDA.id = 0; CORRIDA.estado = 'nada'; return; }
    const mudouPremio = CORRIDA.premio !== (c.premio || '');
    CORRIDA.id = c.id; CORRIDA.premio = c.premio || ''; CORRIDA.estado = c.estado; CORRIDA.abertaEm = c.abertaEm || 0; CORRIDA.iniciaEm = c.iniciaEm == null ? null : c.iniciaEm;
    if (mudouPremio) lobbyCache = null;
  },
  /** As pessoas: `{ id, nome, setor, foto, corre, assiste, est, entrouEm, escolhidaEm }`. */
  setPessoas(lista) {
    GENTE = lista.map(p => ({ id: p.id, nome: p.nome || 'Alguém', setor: p.setor || 'Sem setor', foto: p.foto || null, corre: !!p.corre, assiste: !!p.assiste, est: p.est || null, voce: p.id === EU }));
    PESSOA = new Map(GENTE.map(p => [p.id, p]));
    CORRIDA.entrou = new Map(lista.filter(p => p.entrouEm != null).map(p => [p.id, p.entrouEm]));
    CORRIDA.escolhidoEm = new Map(lista.filter(p => p.escolhidaEm != null).map(p => [p.id, p.escolhidaEm]));
  },
  /** Alguém entrou no lobby agora (o aviso da sala). */
  entrou(id, quando) { if (!CORRIDA.entrou.has(id)) { CORRIDA.entrou.set(id, quando); if (entrei && linhaDoTempo(agoraS()).tela === 'lobby') som.pop(); } },
  /** A gravação já lida (`rec` + faixa e parada da caixa) e os vídeos do fim já baixados (URLs). */
  setGravacao(r, extra) { prepararGravacao(r, extra || { faixa: [], parada: 0.5 }); },
  setVideos(v) { VIDEOS = v && v.festa && v.loop ? v : null; videoFalhou = false; },
  /** Chamado DENTRO do clique em «Assistir»: libera o som. */
  entrar() { entrei = true; som.liga(); musica.ligar(); },
  sair() { entrei = false; },
  reagir(tipo) { reagir(tipo); },
  /** Liga ou desliga o desenho do lobby (o som e a linha do tempo seguem). */
  setLobbyVisivel(v) { lobbyVisivel = !!v; if (!v) { octx.setTransform(1, 0, 0, 1, 0, 0); octx.clearRect(0, 0, ovl.width, ovl.height); } else lobbyCache = null; },
  /** O player: o teto do volume (0 a 20%) e o mudo. */
  volume(max, mudo) { if (typeof max === 'number') prefs.max = clamp(max, 0, VOL_TETO); if (typeof mudo === 'boolean') prefs.mudo = mudo; salvaPrefs(); },
  ligarEq(elementos) { eqBarras = Array.from(elementos || []); eqParado = true; },
  /** A câmera da corrida: seguir uma pessoa (id) ou o líder (null). */
  seguir(id) { const i = id && rec ? (rec.ids || []).indexOf(id) : -1; seguirPedido = i; if (!festa) seguir = i; },
  gravar,
  podeGravarVideo,
  /** As fontes chegaram: redesenha o que estava guardado com a fonte provisória. */
  fontesProntas() { lobbyCache = null; for (const k in CARTOES) delete CARTOES[k]; sprites.clear(); },
  destruir() {
    rodando = false; cancelAnimationFrame(raf); if (ro) ro.disconnect(); musica.parar(); mostraVideo(null);
    try { if (som.ac && som.ac !== opcoes.audio) som.ac.close(); } catch (e) { }
  },
};

}

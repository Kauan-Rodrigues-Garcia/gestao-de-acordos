/**
 * cena.ts — o núcleo dos lobbies novos da Corrida da Sorte (pedido do Cleber,
 * 20/10/2026): um canvas próprio, separado do motor, onde cada tema desenha um
 * cenário inteiro dele (nada do estádio antigo). Só os bichinhos são os mesmos,
 * porque são os personagens que o pessoal escolhe.
 *
 * Aqui ficam o laço (30 quadros por segundo), o tamanho (altura fixa de 540 e a
 * largura que a janela der), as fotos, o clique do palpite, as reações que sobem
 * e o que todo tema usa: rosto, bichinho, «VOCÊ» e a ficha do palpite.
 */
import { CALMO, desenhaBichinho, hashStr, mulberry32, type Estilo } from '../motor/bichinhos';

export type TemaLobby = 'atual' | 'f1' | 'hipodromo' | 'tv';

export const TEMAS: Array<{ id: TemaLobby; nome: string }> = [
  { id: 'f1', nome: 'A · Pit lane noturno' },
  { id: 'hipodromo', nome: 'B · Tarde no hipódromo' },
  { id: 'tv', nome: 'C · Estúdio ao vivo' },
  { id: 'atual', nome: 'Estádio de hoje' },
];

export interface Gente {
  id: string; nome: string; setor: string; foto: string | null;
  est: Estilo | null; entrou: number | null; voce: boolean;
}

/** O palpite: `quem` é, para cada corredor, quem apostou nele (ids, na ordem em que chegaram). */
export interface Palpite { ativo: boolean; meu: string | null; votos: Record<string, number>; quem: Record<string, string[]> }

export interface Estado {
  corredores: Gente[];          // no grid (já escolheram o bichinho)
  plateia: Gente[];             // quem entrou e assiste, na ordem de chegada
  premio: string | null;
  iniciaEm: number | null;      // segundos no relógio do banco
  palpite: Palpite;
  /** Quem apostou em cada corredor, já como gente (rosto e nome), para a ficha e a lista do lobby. */
  apostas: Record<string, Gente[]>;
}

export const H = 540;
export const calmo = CALMO;

/** O que cada quadro recebe para desenhar. */
export interface Quadro {
  c: CanvasRenderingContext2D;
  W: number; H: number;
  /** Tempo da animação (s) e o relógio do banco (s). */
  t: number; agora: number;
  e: Estado;
  /** Segundos até a largada (null sem largada marcada). */
  falta: number | null;
  /** O ponteiro, em coordenadas da cena. */
  mouse: { x: number; y: number } | null;
  /** Registra um corredor clicável (o palpite). */
  alvo(g: Gente, x: number, y: number, r: number): void;
  /** Onde está «você» (as reações saem dali). */
  souEu(x: number, y: number): void;
  /** Onde estão algumas pessoas da plateia (as reações respondem dali). */
  lugar(x: number, y: number): void;
}

/**
 * Um tema: `fundo` desenha o que não se mexe (céu, prédios, arquitetura, pista) numa imagem guardada,
 * refeita só quando muda a `chave` (tamanho, quem corre, o prêmio); `quadro` desenha por cima, a cada
 * quadro, só o que se mexe. É o que deixa o lobby leve em PC fraco.
 */
export interface DesenhaTema {
  chave(q: Quadro): string;
  fundo(q: Quadro): void;
  quadro(q: Quadro): void;
}

// ── fotos ─────────────────────────────────────────────────────────────────
const FOTOS = new Map<string, HTMLImageElement | null>();
function foto(url: string): HTMLImageElement | null {
  if (FOTOS.has(url)) return FOTOS.get(url)!;
  const img = new Image(); img.crossOrigin = 'anonymous'; img.referrerPolicy = 'no-referrer';
  FOTOS.set(url, null);
  img.onload = () => FOTOS.set(url, img);
  img.src = url;
  return null;
}

const CORES_ROSTO = ['#e0603a', '#3a8ad0', '#3ab07a', '#a05ad0', '#d0a03a', '#d04a7a', '#4ab0b0', '#7a6ad8'];
export const corDe = (s: string) => CORES_ROSTO[hashStr(s) % CORES_ROSTO.length];
export const iniciais = (nome: string) => nome.split(/\s+/).filter(Boolean).map(s => s[0]).slice(0, 2).join('').toUpperCase() || '?';
export const primeiroNome = (g: Gente) => (g.voce ? 'VOCÊ' : g.nome.split(/\s+/)[0] || 'Alguém');

/** O rosto de uma pessoa: a foto do cadastro num círculo, ou as iniciais. */
export function rosto(c: CanvasRenderingContext2D, x: number, y: number, r: number, g: Gente, borda?: string) {
  const img = g.foto ? foto(g.foto) : null;
  c.save();
  c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.closePath();
  if (img) { c.clip(); c.drawImage(img, x - r, y - r, r * 2, r * 2); }
  else {
    c.fillStyle = corDe(g.nome + g.setor); c.fill();
    c.fillStyle = '#fff'; c.font = `700 ${Math.max(6, r * 0.85)}px Rubik, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(iniciais(g.nome), x, y + r * 0.05);
  }
  c.restore();
  if (borda) { c.strokeStyle = borda; c.lineWidth = Math.max(1, r * 0.16); c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.stroke(); }
}

/**
 * A foto do cadastro embaixo do nome do corredor (pedido do Cleber, 21/10/2026). Só para quem tem foto:
 * sem foto, nada (as iniciais ali só fariam barulho). Desenhada a cada quadro, porque a foto chega depois.
 */
export function fotoDoCorredor(c: CanvasRenderingContext2D, x: number, y: number, r: number, g: Gente, borda: string) {
  if (!g.foto || !foto(g.foto)) return;
  c.save(); c.shadowColor = 'rgba(0,0,0,.55)'; c.shadowBlur = 6; c.fillStyle = borda; c.beginPath(); c.arc(x, y, r + 1.5, 0, Math.PI * 2); c.fill(); c.restore();
  rosto(c, x, y, r, g, borda);
}

/** O bichinho de quem corre, respirando, piscando e olhando em volta. */
export function bicho(c: CanvasRenderingContext2D, x: number, y: number, r: number, g: Gente, t: number, extra: { pulo?: number; feliz?: boolean; olha?: number } = {}) {
  if (!g.est) return;
  const ph = (hashStr(g.id) % 100) / 13 + t;
  const resp = calmo ? 0 : Math.sin(ph * 2.1) * r * 0.05;
  desenhaBichinho(c, x, y - (extra.pulo ?? 0) + resp, r, g.est, {
    expr: extra.feliz ? 'feliz' : Math.floor(ph / 3.3) % 11 === 6 ? 'sono' : 'normal',
    lx: extra.olha ?? Math.sin(ph * 0.6) * 0.6, ly: Math.cos(ph * 0.4) * 0.25,
    t: ph, pisca: (ph % 3.7) < 0.12, inc: calmo ? 0 : Math.sin(ph * 1.3) * 0.05,
  });
}

/** A setinha «VOCÊ» em cima de alguém. */
export function marcaVoce(c: CanvasRenderingContext2D, x: number, y: number, t: number, cor = '#ffd84d', tinta = '#1b1405') {
  const b = calmo ? 0 : Math.sin(t * 4) * 2.5, yy = y - 6 + b;
  c.font = '700 11px "Saira Condensed", Rubik, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillStyle = cor; c.beginPath(); c.roundRect(x - 19, yy - 20, 38, 15, 7.5); c.fill();
  c.beginPath(); c.moveTo(x - 4, yy - 5.5); c.lineTo(x, yy); c.lineTo(x + 4, yy - 5.5); c.fill();
  c.fillStyle = tinta; c.fillText('VOCÊ', x, yy - 12);
}

/** A ficha do palpite em cima de um corredor: quantos apostaram, e o seu brilha. */
export function fichaPalpite(c: CanvasRenderingContext2D, q: Quadro, g: Gente, x: number, y: number, r: number, cor: string) {
  const p = q.e.palpite; if (!p.ativo) return;
  const n = p.votos[g.id] ?? 0, meu = p.meu === g.id;
  const sobre = q.mouse && Math.hypot(q.mouse.x - x, q.mouse.y - (y + r)) < r * 1.4;
  if (meu || sobre) {
    c.save(); c.globalAlpha = meu ? 0.9 : 0.45; c.strokeStyle = meu ? '#ffd84d' : '#fff'; c.lineWidth = 2.5;
    c.setLineDash([5, 4]); c.lineDashOffset = -q.t * 20; c.beginPath(); c.ellipse(x, y + r * 1.75, r * 1.25, r * 0.4, 0, 0, Math.PI * 2); c.stroke(); c.restore();
  }
  if (!n && !meu) return;
  // os rostinhos de quem apostou (até 3) e o total: dá para ver quem aposta em quem (Cleber, 21/10/2026)
  const gente = (q.e.apostas[g.id] ?? []).slice(0, 3), fr = 6.5, passoR = 9;
  const txt = String(n); c.font = '700 11px "Saira Condensed", Rubik, sans-serif';
  const tw = c.measureText(txt).width, caras = gente.length ? fr * 2 + (gente.length - 1) * passoR : 9;
  const fw = 6 + caras + 4 + tw + 7, fy = y - 2, x0 = x - fw / 2;
  c.save();
  c.fillStyle = meu ? '#ffd84d' : cor; c.beginPath(); c.roundRect(x0, fy - 10, fw, 18, 9); c.fill();
  if (gente.length) gente.forEach((p, i) => rosto(c, x0 + 6 + fr + i * passoR, fy - 1, fr, p, meu ? '#ffd84d' : cor));
  else { c.fillStyle = meu ? '#7a5200' : 'rgba(0,0,0,.35)'; c.beginPath(); c.arc(x0 + 10, fy - 1, 4.5, 0, Math.PI * 2); c.fill(); }
  c.fillStyle = meu ? '#1b1405' : '#fff'; c.font = '700 11px "Saira Condensed", Rubik, sans-serif'; c.textAlign = 'left'; c.textBaseline = 'middle';
  c.fillText(txt, x0 + 6 + caras + 4, fy - 0.5);
  c.restore();
}

/** O cartão com os nomes de quem apostou no corredor sob o ponteiro. */
function cartaoApostas(c: CanvasRenderingContext2D, W: number, x: number, y: number, alvo: Gente | undefined, gente: Gente[]) {
  if (!gente.length) return;
  const MAX = 6, linhas = gente.slice(0, MAX), resto = gente.length - linhas.length;
  const titulo = `${gente.length} ${gente.length === 1 ? 'aposta' : 'apostas'}${alvo ? ` em ${primeiroNome(alvo)}` : ''}`;
  c.save();
  c.font = '700 12px "Saira Condensed", Rubik, sans-serif';
  let w = c.measureText(titulo).width + 24;
  c.font = '600 12px Rubik, sans-serif';
  for (const p of linhas) w = Math.max(w, c.measureText(p.voce ? 'Você' : p.nome).width + 44);
  w = Math.min(w, 240);
  const h = 28 + linhas.length * 20 + (resto > 0 ? 16 : 0) + 6;
  const bx = Math.max(8, Math.min(W - w - 8, x - w / 2)), by = Math.max(8, y - h - 14);
  c.fillStyle = 'rgba(8,10,22,.94)'; c.strokeStyle = 'rgba(255,216,77,.6)'; c.lineWidth = 1.5;
  c.beginPath(); c.roundRect(bx, by, w, h, 10); c.fill(); c.stroke();
  c.textAlign = 'left'; c.textBaseline = 'middle';
  c.fillStyle = '#ffd84d'; c.font = '700 12px "Saira Condensed", Rubik, sans-serif'; c.fillText(`🪙 ${titulo}`, bx + 10, by + 15);
  linhas.forEach((p, i) => {
    const ly = by + 36 + i * 20;
    rosto(c, bx + 19, ly, 8, p);
    c.fillStyle = p.voce ? '#ffd84d' : '#e8eefc'; c.font = '600 12px Rubik, sans-serif';
    let nm = p.voce ? 'Você' : p.nome; while (nm.length > 3 && c.measureText(nm).width > w - 44) nm = nm.slice(0, -2) + '…';
    c.fillText(nm, bx + 33, ly + 0.5);
  });
  if (resto > 0) { c.fillStyle = 'rgba(232,238,252,.6)'; c.font = '600 11px Rubik, sans-serif'; c.fillText(`e mais ${resto}`, bx + 33, by + 36 + linhas.length * 20 - 2); }
  c.restore();
}

/** Assentos em fileiras: devolve até `n` lugares, do centro da primeira fileira para fora e para trás. */
export function fileiras(n: number, filas: Array<{ y: number; x0: number; x1: number }>, passoMax: number, passoMin = 14) {
  for (let passo = passoMax; passo >= passoMin; passo -= 1) {
    const lugares: Array<{ x: number; y: number; fila: number; r: number }> = [];
    filas.forEach((f, k) => {
      const q = Math.floor((f.x1 - f.x0) / passo), meio = (f.x0 + f.x1) / 2;
      const ordem = Array.from({ length: q }, (_, i) => i).sort((a, b) => Math.abs(a - (q - 1) / 2) - Math.abs(b - (q - 1) / 2));
      for (const i of ordem) lugares.push({ x: meio + (i - (q - 1) / 2) * passo, y: f.y, fila: k, r: passo * 0.42 });
    });
    if (lugares.length >= n || passo === passoMin) return lugares.slice(0, Math.max(n, 0));
  }
  return [];
}

// ── as reações que sobem ─────────────────────────────────────────────────
const EMOJI: Record<string, string> = { palmas: '👏', torcer: '📣', coracao: '❤️', ola: '🎉' };
/** Teto de emojis na tela ao mesmo tempo: além disso, a reação é ignorada (o FPS não cai). */
const MAX_PARTICULAS = 90;
interface Particula { x: number; y: number; vx: number; vy: number; t0: number; txt: string; tam: number }

export interface Cena {
  setEstado(e: Estado): void;
  setTema(d: DesenhaTema): void;
  reagir(tipo: string): void;
  destruir(): void;
}

/** Liga o canvas a um tema. `aoPalpite` recebe o corredor clicado. */
export function criarCena(cv: HTMLCanvasElement, desenha: DesenhaTema, agora: () => number, aoPalpite: (id: string) => void): Cena {
  const c = cv.getContext('2d')!;
  let tema = desenha, estado: Estado = { corredores: [], plateia: [], premio: null, iniciaEm: null, palpite: { ativo: false, meu: null, votos: {}, quem: {} }, apostas: {} };
  let W = 960, k = 1, dpr = 1, vivo = true, raf = 0, ult = 0;
  let mouse: { x: number; y: number } | null = null;
  let alvos: Array<{ id: string; x: number; y: number; r: number }> = [];
  let eu: { x: number; y: number } | null = null, lugares: Array<{ x: number; y: number }> = [];
  let parts: Particula[] = [];
  const t0 = performance.now(), rnd = mulberry32(99);
  const fundoCv = document.createElement('canvas'); let fundoChave = '';
  // 30 quadros por segundo; se o quadro passa de 12 ms (PC fraco), cai para 20 e volta quando folga.
  let intervalo = 32, custo = 0;

  const medir = () => {
    const r = cv.getBoundingClientRect(); dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.max(1, Math.round(r.width * dpr)); cv.height = Math.max(1, Math.round(r.height * dpr));
    k = r.height / H; W = Math.max(640, Math.min(1400, r.width / k));
  };
  const ro = new ResizeObserver(medir); ro.observe(cv); medir();

  const paraCena = (ev: PointerEvent) => { const r = cv.getBoundingClientRect(); return { x: (ev.clientX - r.left) / k - (r.width / k - W) / 2, y: (ev.clientY - r.top) / k }; };
  const acha = (p: { x: number; y: number }) => alvos.find(a => Math.hypot(p.x - a.x, p.y - a.y) < a.r * 1.35);
  const mover = (ev: PointerEvent) => { mouse = paraCena(ev); cv.style.cursor = estado.palpite.ativo && acha(mouse) ? 'pointer' : 'default'; };
  const sair = () => { mouse = null; };
  const clicar = (ev: PointerEvent) => {
    const a = acha(paraCena(ev)); if (!a || !estado.palpite.ativo) return;
    aoPalpite(a.id);
    if (parts.length > MAX_PARTICULAS) return;
    // a moeda voa de baixo até o corredor
    for (let i = 0; i < 5; i++) parts.push({ x: W / 2 + (rnd() - 0.5) * 60, y: H + 10, vx: (a.x - W / 2) / 0.7, vy: (a.y - H) / 0.7, t0: performance.now() / 1000 + i * 0.06, txt: '🪙', tam: 20 });
  };
  cv.addEventListener('pointermove', mover); cv.addEventListener('pointerleave', sair); cv.addEventListener('pointerdown', clicar);

  const quadro = (ms: number) => {
    if (!vivo) return;
    raf = requestAnimationFrame(quadro);
    if (ms - ult < intervalo) return; ult = ms;
    const t = (ms - t0) / 1000, ag = agora();
    const m: [number, number, number, number, number, number] = [dpr * k, 0, 0, dpr * k, dpr * k * ((cv.width / dpr / k - W) / 2), 0];
    alvos = []; eu = null; lugares = [];
    const q: Quadro = {
      c, W, H, t, agora: ag, e: estado, mouse,
      falta: estado.iniciaEm == null ? null : estado.iniciaEm - ag,
      alvo: (g, x, y, r) => alvos.push({ id: g.id, x, y, r }),
      souEu: (x, y) => { eu = { x, y }; },
      lugar: (x, y) => { if (lugares.length < 80) lugares.push({ x, y }); },
    };
    const ini = performance.now();
    try {
      const chave = `${cv.width}x${cv.height}:${W}:${tema.chave(q)}`;
      if (chave !== fundoChave) {
        fundoCv.width = cv.width; fundoCv.height = cv.height;
        const fc = fundoCv.getContext('2d')!; fc.setTransform(...m);
        tema.fundo({ ...q, c: fc }); fundoChave = chave;
      }
      c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, cv.width, cv.height); c.drawImage(fundoCv, 0, 0);
      c.setTransform(...m);
      tema.quadro(q);
      // por cima de tudo: quem apostou no corredor sob o ponteiro
      const sob = mouse && acha(mouse);
      if (sob) cartaoApostas(c, W, sob.x, sob.y - sob.r * 2.2, estado.corredores.find(g => g.id === sob.id), estado.apostas[sob.id] ?? []);
    } catch (err) { console.error('[corrida] lobby novo', err); }
    const d0 = performance.now() - ini;
    custo = custo ? custo * 0.9 + d0 * 0.1 : d0;
    intervalo = custo > 12 ? 48 : custo < 7 ? 32 : intervalo;
    // Só no localhost: quanto cada quadro custa (o teste de desempenho lê daqui).
    if (import.meta.env.DEV) { const m = (window as unknown as { __cdsCena?: { n: number; ms: number; pior: number } }); const d = performance.now() - ini; m.__cdsCena = m.__cdsCena ?? { n: 0, ms: 0, pior: 0 }; m.__cdsCena.n++; m.__cdsCena.ms += d; m.__cdsCena.pior = Math.max(m.__cdsCena.pior, d); }
    // as reações
    const agoraS = ms / 1000;
    parts = parts.filter(p => agoraS - p.t0 < 1.6);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    for (const p of parts) {
      const d = agoraS - p.t0; if (d < 0) continue;
      const voa = p.txt === '🪙', u = voa ? Math.min(1, d / 0.7) : d;
      const x = voa ? p.x + p.vx * 0.7 * u : p.x + p.vx * d, y = voa ? p.y + p.vy * 0.7 * u - Math.sin(u * Math.PI) * 60 : p.y + p.vy * d;
      c.globalAlpha = voa ? (u >= 1 ? Math.max(0, 1 - (d - 0.7) * 3) : 1) : Math.max(0, 1 - d / 1.6);
      c.font = `${p.tam}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`; c.fillText(p.txt, x, y);
    }
    c.globalAlpha = 1;
    // de vez em quando a plateia reage sozinha
    if (!calmo && lugares.length > 3 && parts.length < MAX_PARTICULAS / 2 && rnd() < 0.03) {
      const l = lugares[Math.floor(rnd() * lugares.length)], tipos = Object.values(EMOJI);
      parts.push({ x: l.x, y: l.y - 10, vx: (rnd() - 0.5) * 20, vy: -45, t0: agoraS, txt: tipos[Math.floor(rnd() * tipos.length)], tam: 13 });
    }
  };
  raf = requestAnimationFrame(quadro);

  return {
    setEstado(e) { estado = e; },
    setTema(d) { tema = d; fundoChave = ''; },
    reagir(tipo) {
      if (parts.length > MAX_PARTICULAS) return;
      const txt = EMOJI[tipo] ?? '🎉', agoraS = performance.now() / 1000, de = eu ?? { x: W / 2, y: H * 0.6 };
      for (let i = 0; i < 6; i++) parts.push({ x: de.x + (rnd() - 0.5) * 16, y: de.y - 8, vx: (rnd() - 0.5) * 50, vy: -60 - rnd() * 50, t0: agoraS + i * 0.08, txt, tam: 18 + rnd() * 8 });
      for (let i = 0; i < 4 && lugares.length; i++) { const l = lugares[Math.floor(rnd() * lugares.length)]; parts.push({ x: l.x, y: l.y - 8, vx: 0, vy: -50, t0: agoraS + 0.3 + i * 0.15, txt, tam: 14 }); }
    },
    destruir() {
      vivo = false; cancelAnimationFrame(raf); ro.disconnect();
      cv.removeEventListener('pointermove', mover); cv.removeEventListener('pointerleave', sair); cv.removeEventListener('pointerdown', clicar);
    },
  };
}

/** Texto com contorno, para títulos em cima de cenário. */
export function texto(c: CanvasRenderingContext2D, s: string, x: number, y: number, fonte: string, cor: string, contorno?: string, larg = 3) {
  c.font = fonte; c.textBaseline = 'middle';
  if (contorno) { c.lineJoin = 'round'; c.strokeStyle = contorno; c.lineWidth = larg; c.strokeText(s, x, y); }
  c.fillStyle = cor; c.fillText(s, x, y);
}

/** Um gerador de números com semente, para cenário que não muda de um quadro para o outro. */
export const semente = (n: number) => mulberry32(n);

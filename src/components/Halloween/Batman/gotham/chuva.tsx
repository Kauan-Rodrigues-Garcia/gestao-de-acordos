/**
 * A chuva da abertura do filme («Medo é uma ferramenta»), analisada quadro a
 * quadro: fina e quase invisível no escuro — ela só aparece contra a luz.
 * Postes de sódio com o cone cheio de gotas, letreiros de neon desfocados,
 * névoa, o asfalto molhado refletindo, respingos no chão e, de vez em quando,
 * um raio: o céu clareia em pulsos e por um instante toda a chuva aparece.
 *
 * Um canvas só, em meia resolução, 30 quadros por segundo. O cenário parado
 * (luzes, halos, reflexos) é pintado uma vez; a luz de cada ponto vai numa
 * grade de 12 px, e a gota só consulta a célula dela. A névoa NÃO é pintada no
 * canvas (eram manchas enormes repintadas a cada quadro): são camadas de CSS que
 * só deslizam (`.gt-nevoa`), trabalho do compositor.
 *
 * No modo Batman quem manda na densidade, nos raios e no volume do trovão é a
 * música (`ritmo`, lido a cada quadro — ver `regente.ts`): as gotas são criadas
 * uma vez para a densidade máxima e só uma parte delas cai.
 */
import { useEffect, useRef } from 'react';
import { contextoDeAudio } from './audio';

type RGB = [number, number, number];

/** Uma fonte de luz, em px do palco. `cor` em RGB 0–255. */
export interface Luz { x: number; y: number; r: number; cor: [number, number, number]; forca: number }

/** O que muda a cada quadro: vem da música. */
export interface Ritmo { densidade: number; raios: number; trovao: number; gatilhoRaio: number }

interface Props {
  /** Densidade máxima (as gotas são criadas para ela). */
  densidade: number;
  /** Lido a cada quadro; sem ele, valem `densidade`, `raios` e `trovao`. */
  ritmo?: () => Ritmo;
  /** As luzes da cidade (postes, neon, bokeh); 0 = sem cidade. */
  cidade: number;
  /** Quanto a gota acende na luz. */
  brilho: number;
  vento: number;
  neblina: number;
  respingos: boolean;
  /** Frequência dos raios (0 = nunca, 1 = a cada ~10–20 s). */
  raios: number;
  /** Volume do trovão (0 = mudo). */
  trovao: number;
  /** Muda de valor = cai um raio agora. */
  gatilhoRaio?: number;
  ceu: boolean;
  fontes?: () => Luz[];
  /**
   * Luzes que mudam a cada quadro (a polícia piscando, as lanternas): lidas em
   * todo quadro, sem passar pela grade, e acendem as gotas caindo perto.
   */
  reflexos?: () => Luz[];
  fator?: () => number;
  /** Onde a chuva escreve, a cada quadro, o clarão do raio (0 a 1) — para o vidro (`vidro.tsx`) clarear junto. */
  relampago?: { current: number };
  /** Cor da névoa quando não há postes (padrão: sépia, a do Analítico). */
  tomNevoa?: RGB;
}

const CELULA = 12;
const SODIO: RGB = [255, 168, 78];
const NEON: RGB[] = [[70, 220, 255], [255, 60, 170], [255, 48, 40], [90, 255, 150], [235, 240, 255], [255, 200, 80]];
const acaso = (min: number, max: number) => min + Math.random() * (max - min);
const rgba = ([r, g, b]: RGB, a: number) => `rgba(${r},${g},${b},${a.toFixed(3)})`;

/** Os pulsos do raio (ms desde o início, intensidade): clarão, quase apaga, volta, tremula. */
const PULSOS: [number, number][] = [[0, 1], [60, 0.25], [120, 0.9], [210, 0.15], [280, 0.6], [360, 0.1], [460, 0.3], [700, 0]];
function nivelDoRaio(t: number): number {
  if (t < 0 || t > PULSOS[PULSOS.length - 1][0]) return 0;
  for (let i = 1; i < PULSOS.length; i++) {
    const [t1, v1] = PULSOS[i], [t0, v0] = PULSOS[i - 1];
    if (t <= t1) return v0 + (v1 - v0) * ((t - t0) / (t1 - t0));
  }
  return 0;
}

/** O trovão, feito na hora: ruído grave rolando, com estalo no começo se for perto. */
function trovejar(volume: number, perto: number) {
  const c = contextoDeAudio();
  if (!c || volume <= 0) return;
  void c.resume();
  const t = c.currentTime + 0.02, dur = 2.6 + (1 - perto) * 1.5;
  const buf = c.createBuffer(1, Math.round(c.sampleRate * (dur + 0.5)), c.sampleRate);
  const d = buf.getChannelData(0);
  let ultimo = 0;
  for (let i = 0; i < d.length; i++) { ultimo = ultimo * 0.97 + (Math.random() * 2 - 1) * 0.03; d[i] = ultimo * 6; }
  const fonte = c.createBufferSource(); fonte.buffer = buf;
  const filtro = c.createBiquadFilter(); filtro.type = 'lowpass';
  filtro.frequency.setValueAtTime(300 + perto * 900, t); filtro.frequency.exponentialRampToValueAtTime(90, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(volume * (0.5 + perto * 0.5), t + 0.08 + (1 - perto) * 0.4);
  // Rola: cai, volta um pouco, cai de novo.
  g.gain.exponentialRampToValueAtTime(volume * 0.25, t + dur * 0.35);
  g.gain.exponentialRampToValueAtTime(volume * 0.4, t + dur * 0.5);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  fonte.connect(filtro).connect(g).connect(c.destination);
  fonte.start(t); fonte.stop(t + dur + 0.1);
  // O contexto é compartilhado (`audio.ts`): não fecha.
}

export function ChuvaDeGotham(p: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const props = useRef(p);
  props.current = p;

  useEffect(() => {
    const cv = ref.current, cx = cv?.getContext('2d');
    if (!cv || !cx) return;
    type Gota = { x: number; y: number; v: number; c: number; z: number; plano: number };
    type Pingo = { x: number; y: number; vx: number; vy: number; vida: number };
    type Poste = { x: number; y: number; r: number; forca: number };
    type Letreiro = { x: number; y: number; w: number; h: number; cor: RGB; forca: number };
    type Bolha = { x: number; y: number; r: number; cor: RGB; a: number };
    let w = 1, h = 1, gotas: Gota[] = [], pingos: Pingo[] = [];
    let postes: Poste[] = [], letreiros: Letreiro[] = [], bolhas: Bolha[] = [];
    let fundo: HTMLCanvasElement | null = null;
    let grade = new Float32Array(0), gx = 0, gy = 0, chaveLuz = '', densAntes = -1, quadro = 0;
    let raio: { t0: number; pts: [number, number][][]; perto: number } | null = null, proximoRaio = 0, gatilhoAntes = props.current.ritmo?.().gatilhoRaio ?? props.current.gatilhoRaio ?? 0;

    const novaGota = (qualquer: boolean): Gota => {
      const plano = Math.floor(Math.random() * 4), z = (plano + Math.random()) / 4;
      const v = 13 + z * 17;
      return { x: acaso(-60, w + 60), y: qualquer ? acaso(-20, h) : -acaso(20, 160), v, c: v * acaso(0.9, 1.3), z, plano };
    };
    const povoar = () => {
      const d = props.current.densidade;
      densAntes = d;
      gotas = Array.from({ length: Math.round(Math.min(3200, (w * h / 600) * d)) }, () => novaGota(true));
    };

    /** O cenário da cidade, pintado uma vez: postes com halo, neon desfocado, bokeh e o reflexo no chão molhado. */
    const pintarCidade = () => {
      postes = Array.from({ length: 4 }, (_, i) => ({ x: w * (0.1 + i * 0.27 + acaso(-0.05, 0.05)), y: h * acaso(0.3, 0.46), r: acaso(5, 8), forca: acaso(0.75, 1) }));
      letreiros = Array.from({ length: 11 }, () => {
        const vertical = Math.random() < 0.6;
        return { x: acaso(0, w), y: h * acaso(0.12, 0.62), w: vertical ? acaso(4, 9) : acaso(14, 34), h: vertical ? acaso(16, 40) : acaso(4, 8), cor: NEON[Math.floor(Math.random() * NEON.length)], forca: acaso(0.5, 1) };
      });
      bolhas = Array.from({ length: 18 }, () => ({ x: acaso(0, w), y: h * acaso(0.35, 0.95), r: acaso(4, 14), cor: Math.random() < 0.5 ? SODIO : NEON[Math.floor(Math.random() * NEON.length)], a: acaso(0.12, 0.3) }));
      const f = document.createElement('canvas');
      f.width = w; f.height = h;
      const fx = f.getContext('2d');
      if (!fx) return;
      fx.globalCompositeOperation = 'lighter';
      // Reflexo no chão molhado: um risco vertical borrado embaixo de cada luz.
      fx.filter = 'blur(6px)';
      for (const l of [...postes.map(p => ({ x: p.x, cor: SODIO, a: 0.22 * p.forca, lg: 6 })), ...letreiros.map(l => ({ x: l.x, cor: l.cor, a: 0.14 * l.forca, lg: Math.max(4, l.w * 0.6) }))]) {
        const g = fx.createLinearGradient(0, h * 0.78, 0, h);
        g.addColorStop(0, rgba(l.cor, 0)); g.addColorStop(0.3, rgba(l.cor, l.a)); g.addColorStop(1, rgba(l.cor, l.a * 0.4));
        fx.fillStyle = g; fx.fillRect(l.x - l.lg / 2, h * 0.78, l.lg, h * 0.22);
      }
      // Neon desfocado.
      fx.filter = 'blur(5px)';
      for (const l of letreiros) { fx.fillStyle = rgba(l.cor, 0.55 * l.forca); fx.fillRect(l.x, l.y, l.w, l.h); }
      fx.filter = 'blur(14px)';
      for (const l of letreiros) { fx.fillStyle = rgba(l.cor, 0.3 * l.forca); fx.fillRect(l.x - l.w, l.y - l.h * 0.5, l.w * 3, l.h * 2); }
      // Bokeh.
      fx.filter = 'blur(3px)';
      for (const b of bolhas) { fx.fillStyle = rgba(b.cor, b.a); fx.beginPath(); fx.arc(b.x, b.y, b.r, 0, 6.2832); fx.fill(); }
      // Postes: o halo na névoa e o cone de luz descendo.
      fx.filter = 'none';
      for (const p of postes) {
        const halo = fx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 7);
        halo.addColorStop(0, rgba([255, 236, 200], 0.9 * p.forca)); halo.addColorStop(0.12, rgba(SODIO, 0.55 * p.forca)); halo.addColorStop(1, rgba(SODIO, 0));
        fx.fillStyle = halo; fx.beginPath(); fx.arc(p.x, p.y, p.r * 7, 0, 6.2832); fx.fill();
        const alt = h - p.y, abre = alt * 0.42;
        const cone = fx.createLinearGradient(0, p.y, 0, h);
        cone.addColorStop(0, rgba(SODIO, 0.16 * p.forca)); cone.addColorStop(1, rgba(SODIO, 0.02));
        fx.fillStyle = cone; fx.filter = 'blur(8px)';
        fx.beginPath(); fx.moveTo(p.x - 2, p.y); fx.lineTo(p.x + 2, p.y); fx.lineTo(p.x + abre, h); fx.lineTo(p.x - abre, h); fx.closePath(); fx.fill();
        fx.filter = 'none';
      }
      fundo = f;
    };

    const ajustar = () => {
      w = cv.width = Math.max(1, Math.round(cv.clientWidth / 2));
      h = cv.height = Math.max(1, Math.round(cv.clientHeight / 2));
      // A cidade daqui (postes, neon) usa `filter: blur`, caro: só pinta se for aparecer.
      if (props.current.cidade > 0.01) pintarCidade(); else { fundo = null; postes = []; letreiros = []; bolhas = []; }
      chaveLuz = '';
      povoar();
    };

    /** A grade de luz: halos, cones dos postes, neon e as luzes de fora (o bat-sinal). */
    const montarGrade = (cidade: number, fora: Luz[]) => {
      gx = Math.ceil(w / CELULA); gy = Math.ceil(h / CELULA);
      grade = new Float32Array(gx * gy * 3);
      const somar = (k: number, cor: RGB, I: number) => { grade[k] += (cor[0] / 255) * I; grade[k + 1] += (cor[1] / 255) * I; grade[k + 2] += (cor[2] / 255) * I; };
      for (let j = 0; j < gy; j++) for (let i = 0; i < gx; i++) {
        const px = (i + 0.5) * CELULA, py = (j + 0.5) * CELULA, k = (j * gx + i) * 3;
        if (cidade > 0.01) {
          for (const p of postes) {
            const d2 = (px - p.x) ** 2 + (py - p.y) ** 2, s = p.r * 4;
            somar(k, SODIO, cidade * p.forca * 1.2 * Math.exp(-d2 / (2 * s * s)));
            const dy = py - p.y;
            if (dy > 0) {
              const abre = dy * 0.42 + 3, dx = Math.abs(px - p.x);
              if (dx < abre) somar(k, SODIO, cidade * p.forca * 0.75 * Math.pow(1 - dx / abre, 0.7) * Math.exp(-dy / (h * 0.8)));
            }
          }
          for (const l of letreiros) {
            const cxl = l.x + l.w / 2, cyl = l.y + l.h / 2, s = Math.max(l.w, l.h) * 1.4;
            const d2 = (px - cxl) ** 2 + (py - cyl) ** 2;
            if (d2 < 9 * s * s) somar(k, l.cor, cidade * l.forca * 0.7 * Math.exp(-d2 / (2 * s * s)));
          }
        }
        for (const l of fora) {
          const s = l.r * 1.4, d2 = (px - l.x) ** 2 + (py - l.y) ** 2;
          if (d2 < 9 * s * s) somar(k, l.cor, l.forca * Math.exp(-d2 / (2 * s * s)));
        }
      }
    };
    const luzEm = (x: number, y: number): RGB | null => {
      const i = Math.min(gx - 1, Math.max(0, Math.floor(x / CELULA))), j = Math.min(gy - 1, Math.max(0, Math.floor(y / CELULA)));
      const k = (j * gx + i) * 3;
      return grade[k] + grade[k + 1] + grade[k + 2] > 0.02 ? [grade[k], grade[k + 1], grade[k + 2]] : null;
    };

    /**
     * As luzes que piscam, na chuva: cada gota perto dela pega a cor (puxada para o
     * branco, é água).
     */
    const refletir = (luzes: Luz[], ativas: number) => {
      cx.globalCompositeOperation = 'lighter';
      cx.lineCap = 'round';
      for (const L of luzes) {
        if (L.forca < 0.03) continue;
        const x0 = L.x / 2, y0 = L.y / 2, s = L.r / 2, alcance = 9 * s * s, dois = 2 * s * s;
        const cor = `rgb(${L.cor.map(c => Math.round(c * 0.7 + 76)).join(',')})`;
        cx.strokeStyle = cor; cx.fillStyle = cor;
        for (let i = 0; i < ativas; i++) {
          const g = gotas[i], d2 = (g.x - x0) ** 2 + (g.y - y0) ** 2;
          if (d2 > alcance) continue;
          const I = L.forca * Math.exp(-d2 / dois) * (0.3 + g.z * 0.7);
          if (I < 0.04) continue;
          cx.globalAlpha = Math.min(0.8, I * 0.8); cx.lineWidth = 0.3 + g.z * 0.6;
          cx.beginPath(); cx.moveTo(g.x, g.y); cx.lineTo(g.x - g.c * props.current.vento, g.y - g.c); cx.stroke();
        }
      }
      cx.globalCompositeOperation = 'source-over';
    };

    /** O raio: um tronco que desce torto, com galhos. */
    const novoRaio = (agora: number, vol: number) => {
      const tronco: [number, number][] = [];
      let x = acaso(w * 0.1, w * 0.9), y = -5;
      const fim = h * acaso(0.35, 0.6), galhos: [number, number][][] = [];
      tronco.push([x, y]);
      while (y < fim) {
        y += acaso(5, 14); x += acaso(-9, 9); tronco.push([x, y]);
        if (Math.random() < 0.18) {
          const g: [number, number][] = [[x, y]]; let gx2 = x, gy2 = y;
          const lado = Math.random() < 0.5 ? -1 : 1;
          for (let n = 0; n < 5; n++) { gx2 += lado * acaso(3, 10); gy2 += acaso(4, 10); g.push([gx2, gy2]); }
          galhos.push(g);
        }
      }
      const perto = Math.random();
      raio = { t0: agora, pts: [tronco, ...galhos], perto };
      if (vol > 0) window.setTimeout(() => trovejar(vol, perto), 400 + (1 - perto) * 2200);
    };

    ajustar();
    // Redimensionar: espera a janela parar de mudar (e ignora o aviso inicial, de mesmo tamanho).
    let espera: ReturnType<typeof setTimeout> | undefined;
    const obs = new ResizeObserver(() => {
      if (Math.round(cv.clientWidth / 2) === w && Math.round(cv.clientHeight / 2) === h) return;
      clearTimeout(espera); espera = setTimeout(ajustar, 200);
    });
    obs.observe(cv);
    let ultimo = 0, vivo = true;
    const passo = (agora: number) => {
      if (!vivo) return;
      if (agora - ultimo < 32) { requestAnimationFrame(passo); return; }
      ultimo = agora;
      const o = props.current;
      if (o.densidade !== densAntes) povoar();
      const ritmo = o.ritmo?.() ?? { densidade: o.densidade, raios: o.raios, trovao: o.trovao, gatilhoRaio: o.gatilhoRaio ?? 0 };
      // Só uma parte das gotas cai: a que a música pede agora.
      const ativas = Math.round(gotas.length * Math.max(0, Math.min(1, ritmo.densidade / Math.max(0.01, o.densidade))));
      if (quadro++ % 10 === 0) {
        const fora = (o.fontes?.() ?? []).map(f => ({ ...f, x: f.x / 2, y: f.y / 2, r: f.r / 2 }));
        const chave = `${o.cidade.toFixed(2)}|` + fora.map(l => `${l.x | 0},${l.y | 0},${l.r | 0},${l.forca.toFixed(2)}`).join('|');
        if (chave !== chaveLuz) { chaveLuz = chave; montarGrade(o.cidade, fora); }
      }
      // Raios: sorteados pela frequência, ou na hora pelo botão.
      if (ritmo.gatilhoRaio !== gatilhoAntes) { gatilhoAntes = ritmo.gatilhoRaio; novoRaio(agora, ritmo.trovao); }
      if (ritmo.raios > 0.01 && !raio) {
        if (!proximoRaio) proximoRaio = agora + acaso(6000, 20000) / ritmo.raios;
        if (agora >= proximoRaio) { novoRaio(agora, ritmo.trovao); proximoRaio = 0; }
      } else if (ritmo.raios <= 0.01) proximoRaio = 0;
      const lampejo = raio ? nivelDoRaio(agora - raio.t0) : 0;
      if (o.relampago) o.relampago.current = lampejo;
      if (raio && agora - raio.t0 > 800) raio = null;
      const fator = o.fator?.() ?? 1;
      cx.clearRect(0, 0, w, h);

      // A cidade parada (a névoa é CSS, ver o cabeçalho).
      if (o.cidade > 0.01 && fundo) { cx.globalAlpha = Math.min(1, o.cidade); cx.drawImage(fundo, 0, 0); cx.globalAlpha = 1; }
      // O clarão do raio no céu e o raio em si.
      if (lampejo > 0.01) {
        const g = cx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, `rgba(205,215,255,${(0.42 * lampejo).toFixed(3)})`); g.addColorStop(1, `rgba(205,215,255,${(0.1 * lampejo).toFixed(3)})`);
        cx.fillStyle = g; cx.fillRect(0, 0, w, h);
        if (raio && agora - raio.t0 < 380) {
          cx.strokeStyle = `rgba(240,245,255,${Math.min(1, lampejo * 1.2).toFixed(2)})`;
          cx.shadowColor = 'rgba(190,205,255,.9)'; cx.shadowBlur = 8;
          raio.pts.forEach((linha, i) => {
            cx.lineWidth = i === 0 ? 1.4 : 0.6;
            cx.beginPath(); linha.forEach(([x, y], n) => (n ? cx.lineTo(x, y) : cx.moveTo(x, y))); cx.stroke();
          });
          cx.shadowBlur = 0;
        }
      }

      if (o.ceu) {
        const vento = o.vento;
        for (let i = 0; i < ativas; i++) {
          const g = gotas[i];
          g.y += g.v; g.x += g.v * vento;
          if (g.y - g.c > h) {
            // Bateu no chão: respingo (só perto, embaixo).
            if (o.respingos && g.z > 0.5 && pingos.length < 260) {
              const yc = h * acaso(0.86, 0.99);
              for (let n = 0; n < 2; n++) pingos.push({ x: g.x, y: yc, vx: acaso(-1.2, 1.2), vy: -acaso(0.8, 2.2), vida: acaso(4, 8) });
            }
            Object.assign(g, novaGota(false));
          }
        }
        cx.lineCap = 'round';
        // No escuro, a gota quase não existe: um lote fraquinho por plano.
        cx.strokeStyle = 'rgb(200,205,215)';
        for (let pl = 0; pl < 4; pl++) {
          const z = (pl + 0.5) / 4;
          cx.globalAlpha = (0.02 + z * 0.045) + lampejo * (0.25 + z * 0.35); cx.lineWidth = 0.3 + z * 0.55;
          cx.beginPath();
          for (let i = 0; i < ativas; i++) { const g = gotas[i]; if (g.plano === pl) { cx.moveTo(g.x, g.y); cx.lineTo(g.x - g.c * vento, g.y - g.c); } }
          cx.stroke();
        }
        // Contra a luz ela aparece: pega a cor da luz, puxada para o branco (é água).
        cx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < ativas; i++) {
          const g = gotas[i];
          const l = luzEm(g.x, g.y);
          if (!l) continue;
          const m = Math.max(l[0], l[1], l[2]);
          const I = m * o.brilho * fator * (0.3 + g.z * 0.7);
          if (I < 0.04) continue;
          const r = (l[0] / m) * 0.65 + 0.35, gg = (l[1] / m) * 0.65 + 0.35, b = (l[2] / m) * 0.65 + 0.35;
          cx.strokeStyle = `rgb(${(255 * r) | 0},${(255 * gg) | 0},${(255 * b) | 0})`;
          cx.globalAlpha = Math.min(0.85, I * 0.9); cx.lineWidth = 0.3 + g.z * 0.6;
          cx.beginPath(); cx.moveTo(g.x, g.y); cx.lineTo(g.x - g.c * vento, g.y - g.c); cx.stroke();
        }
        // Respingos.
        pingos = pingos.filter(pg => (pg.vida -= 1) > 0);
        for (const pg of pingos) {
          pg.x += pg.vx; pg.y += pg.vy; pg.vy += 0.35;
          const l = luzEm(pg.x, pg.y);
          const I = (l ? Math.max(l[0], l[1], l[2]) * o.brilho : 0.05) + lampejo * 0.5;
          cx.globalAlpha = Math.min(0.8, I * 0.7); cx.fillStyle = 'rgb(235,230,220)';
          cx.fillRect(pg.x, pg.y, 0.8, 0.8);
        }
        cx.globalCompositeOperation = 'source-over';
      }

      const reflexos = o.reflexos?.();
      if (reflexos?.length && o.ceu) refletir(reflexos, ativas);
      cx.globalAlpha = 1;
      requestAnimationFrame(passo);
    };
    requestAnimationFrame(passo);
    return () => { vivo = false; obs.disconnect(); clearTimeout(espera); };
  }, []);

  const tom = p.tomNevoa ?? (p.cidade > 0.01 ? [120, 90, 80] : [150, 130, 100]);
  return (
    <>
      {p.neblina > 0.01 && (
        <div className="gt-nevoa" style={{ opacity: Math.min(1, p.neblina), ['--nevoa' as string]: tom.join(' ') }}>
          <i /><i /><i />
        </div>
      )}
      <canvas ref={ref} className="gt-chuva" />
    </>
  );
}

/**
 * Nevasca — o que acontece quando o vídeo do presente acaba (Cleber, 29/10/2026).
 *
 *   cinza  — o vídeo volta para dentro do presente e o sistema atrás fica
 *            cinza e apagado: outubro acabou.
 *   solta  — o presente estoura e solta uma nevasca. A frente da neve corre
 *            em roda a partir dele e, por onde passa, o cinza sai e o sistema
 *            aparece com o Natal já ligado: o tema muda aos poucos, levado
 *            pela neve. Depois a nevasca acalma em neve mansa.
 *   acalma — a pessoa entrou no Natal: a neve para de cair e tudo some.
 *
 * A frente leva junto o «de mágica» (Cleber, 04/11/2026): brilhos dourados que
 * piscam e somem na borda que avança, e flocos grandes de cristal girando no
 * meio da neve redonda.
 *
 * O cinza é um véu com `backdrop-filter`; o buraco no véu é um `clip-path`
 * (polígono com `evenodd`) com a borda irregular, refeito a cada quadro. A
 * neve é um canvas só, em resolução 1:1, com um floco pré-desenhado: cabe na
 * máquina fraca da operação.
 */
import { useEffect, useRef } from 'react';

export type FaseNevasca = 'cinza' | 'solta' | 'acalma';

/** Quanto a frente da neve leva para cobrir a tela toda. */
const DURACAO_MS = 5200;
/** Com «Entrar no Natal» antes da hora, o resto da frente corre neste tempo. */
const PRESSA_MS = 500;
const PONTOS_DA_FRENTE = 56;
/** Quanto a borda do buraco ondula; a névoa da frente é mais larga que isso, e a cobre. */
const BORDA_MAX = 32;
const NEVOA = 70;
const MAXIMO_DE_FLOCOS = 1100;

/** `tipo`: 0 floco redondo, 1 cristal girando, 2 brilho dourado (vive `dura` segundos). */
type Floco = { x: number; y: number; vx: number; vy: number; s: number; a: number; fase: number; onda: number; rajada: boolean; tipo: 0 | 1 | 2; giro: number; vgiro: number; vida: number; dura: number };

const acaso = (min: number, max: number) => min + Math.random() * (max - min);

/** O floco: miolo branco e uma borda azulada, para aparecer também no fundo claro. */
function desenharFloco(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.45, 'rgba(255,255,255,.95)');
  r.addColorStop(0.7, 'rgba(196,214,236,.55)');
  r.addColorStop(1, 'rgba(196,214,236,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 32, 32);
  return c;
}

/** O cristal de seis pontas, com os galhinhos, para os flocos grandes. */
function desenharCristal(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.translate(32, 32);
  g.strokeStyle = 'rgba(255,255,255,.95)';
  g.lineCap = 'round';
  g.shadowColor = 'rgba(150,185,225,.9)';
  g.shadowBlur = 4;
  for (let i = 0; i < 6; i++) {
    g.save();
    g.rotate((i * Math.PI) / 3);
    g.lineWidth = 3;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -27); g.stroke();
    g.lineWidth = 2;
    for (const [y, l] of [[-11, 7], [-19, 6]]) {
      g.beginPath(); g.moveTo(0, y); g.lineTo(-l, y - l); g.moveTo(0, y); g.lineTo(l, y - l); g.stroke();
    }
    g.restore();
  }
  g.fillStyle = '#fff';
  g.beginPath(); g.arc(0, 0, 3.5, 0, Math.PI * 2); g.fill();
  return c;
}

/** O brilho dourado da mágica: miolo branco, halo de ouro e quatro raios. */
function desenharBrilho(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 48;
  const g = c.getContext('2d')!;
  const halo = g.createRadialGradient(24, 24, 0, 24, 24, 24);
  halo.addColorStop(0, 'rgba(255,255,255,1)');
  halo.addColorStop(0.18, 'rgba(255,236,150,.95)');
  halo.addColorStop(0.5, 'rgba(244,197,66,.35)');
  halo.addColorStop(1, 'rgba(244,197,66,0)');
  g.fillStyle = halo;
  g.fillRect(0, 0, 48, 48);
  g.fillStyle = 'rgba(255,250,225,.95)';
  g.beginPath();
  g.moveTo(24, 2); g.quadraticCurveTo(25.5, 22.5, 46, 24); g.quadraticCurveTo(25.5, 25.5, 24, 46);
  g.quadraticCurveTo(22.5, 25.5, 2, 24); g.quadraticCurveTo(22.5, 22.5, 24, 2);
  g.fill();
  return c;
}

export function Nevasca({ fase, origem }: { fase: FaseNevasca; origem: { x: number; y: number } }) {
  const veu = useRef<HTMLDivElement>(null);
  const tela = useRef<HTMLCanvasElement>(null);
  const faseAtual = useRef(fase);
  useEffect(() => { faseAtual.current = fase; }, [fase]);
  const soltou = fase !== 'cinza';

  useEffect(() => {
    if (!soltou) return;
    const cv = tela.current, v = veu.current;
    const cx = cv?.getContext('2d');
    if (!cv || !v || !cx) return;
    const floco = desenharFloco(), cristal = desenharCristal(), brilho = desenharBrilho();
    let w = 0, h = 0, raioFinal = 0;
    const ajustar = () => {
      w = window.innerWidth; h = window.innerHeight;
      cv.width = w; cv.height = h;
      raioFinal = Math.max(
        Math.hypot(origem.x, origem.y), Math.hypot(w - origem.x, origem.y),
        Math.hypot(origem.x, h - origem.y), Math.hypot(w - origem.x, h - origem.y),
      ) + 90;
    };
    ajustar();
    window.addEventListener('resize', ajustar);

    const flocos: Floco[] = [];
    const novo = (f: Partial<Floco>): Floco => ({
      x: 0, y: 0, vx: 0, vy: 0, s: acaso(2, 6), a: acaso(0.55, 1), fase: acaso(0, Math.PI * 2), onda: acaso(0.6, 1.6), rajada: false,
      tipo: 0, giro: acaso(0, Math.PI * 2), vgiro: acaso(-1.2, 1.2), vida: 0, dura: 0, ...f,
    });
    // O estouro do presente: tudo sai dele de uma vez, em roda.
    for (let i = 0; i < 340; i++) {
      const ang = acaso(0, Math.PI * 2), vel = acaso(3, 19), perto = Math.random() < 0.06;
      flocos.push(novo({ x: origem.x, y: origem.y, vx: Math.cos(ang) * vel, vy: Math.sin(ang) * vel, s: perto ? acaso(10, 18) : acaso(2, 7), a: perto ? 0.5 : acaso(0.6, 1), rajada: true }));
    }
    for (let i = 0; i < 40; i++) {
      const ang = acaso(0, Math.PI * 2), vel = acaso(4, 15), ouro = i % 2 === 0;
      flocos.push(novo({
        x: origem.x, y: origem.y, vx: Math.cos(ang) * vel, vy: Math.sin(ang) * vel, rajada: true,
        tipo: ouro ? 2 : 1, s: ouro ? acaso(12, 26) : acaso(16, 30), a: ouro ? 1 : acaso(0.75, 0.95), dura: ouro ? acaso(0.9, 1.8) : 0,
        vgiro: acaso(-2.5, 2.5),
      }));
    }

    let progresso = 0, antes = performance.now(), t = 0, quadro = 0, raioAntes = 0, veuFora = false;
    const passo = (agora: number) => {
      const dt = Math.min(50, agora - antes);
      antes = agora; t += dt / 1000;
      const f = dt / 16.67;
      const acalmando = faseAtual.current === 'acalma';
      progresso = Math.min(1, progresso + dt / (acalmando ? PRESSA_MS : DURACAO_MS));
      // Rápido no estouro, devagar no fim: a frente vai perdendo força.
      const raio = raioFinal * (1 - Math.pow(1 - progresso, 1.7));
      const velocidadeDaFrente = Math.max(0, raio - raioAntes);
      raioAntes = raio;

      // ── O véu cinza, com o buraco da frente ──
      if (!veuFora) {
        if (progresso >= 1) { v.style.visibility = 'hidden'; veuFora = true; }
        else {
          const borda = Math.min(BORDA_MAX, raio * 0.14);
          const pts: string[] = [];
          for (let i = 0; i <= PONTOS_DA_FRENTE; i++) {
            const k = i % PONTOS_DA_FRENTE, ang = (k / PONTOS_DA_FRENTE) * Math.PI * 2;
            const r = raio + borda * (0.5 * Math.sin(k * 0.9 + t * 1.7) + 0.3 * Math.sin(k * 2.3 - t * 2.9) + 0.2 * Math.sin(k * 5.1 + t * 4.1));
            pts.push(`${(origem.x + Math.cos(ang) * r).toFixed(1)}px ${(origem.y + Math.sin(ang) * r).toFixed(1)}px`);
          }
          v.style.clipPath = `polygon(evenodd, 0 0, ${w}px 0, ${w}px ${h}px, 0 ${h}px, 0 0, ${pts.join(', ')}, 0 0)`;
        }
      }

      // ── Neve nova ──
      if (!acalmando) {
        // Na frente: a neve que «leva» o tema, saindo junto com ela.
        if (progresso < 1) {
          for (let i = 0; i < 22; i++) {
            const ang = acaso(0, Math.PI * 2), r = raio + acaso(-30, 14), sai = velocidadeDaFrente / f + acaso(0, 2.5);
            flocos.push(novo({ x: origem.x + Math.cos(ang) * r, y: origem.y + Math.sin(ang) * r, vx: Math.cos(ang) * sai - Math.sin(ang) * 1.4, vy: Math.sin(ang) * sai + Math.cos(ang) * 1.4, s: acaso(2.5, 9), rajada: true }));
          }
          // A mágica na borda: brilhos que acendem onde a frente passa e apagam ali.
          for (let i = 0; i < 4; i++) {
            const ang = acaso(0, Math.PI * 2), r = raio + acaso(-24, 6);
            flocos.push(novo({
              x: origem.x + Math.cos(ang) * r, y: origem.y + Math.sin(ang) * r,
              vx: Math.cos(ang) * acaso(0.3, 1.4), vy: Math.sin(ang) * acaso(0.3, 1.4) - 0.3,
              tipo: 2, s: acaso(9, 24), a: 1, dura: acaso(0.6, 1.3), rajada: false,
            }));
          }
          if (Math.random() < 0.5) {
            const ang = acaso(0, Math.PI * 2), r = raio + acaso(-30, 10), sai = velocidadeDaFrente / f;
            flocos.push(novo({
              x: origem.x + Math.cos(ang) * r, y: origem.y + Math.sin(ang) * r,
              vx: Math.cos(ang) * sai, vy: Math.sin(ang) * sai, tipo: 1, s: acaso(14, 28), a: acaso(0.7, 0.95), rajada: true, vgiro: acaso(-2, 2),
            }));
          }
        }
        // O vento da nevasca: forte no meio da frente, manso depois que ela passou.
        const alvo = progresso < 1 ? 220 + 260 * Math.sin(Math.PI * progresso) : 120;
        const ambientes = flocos.reduce((n, fl) => n + (fl.rajada || fl.tipo === 2 ? 0 : 1), 0);
        const vento = progresso < 1 ? 1 : 0.25;
        for (let i = 0; i < Math.min(8, alvo - ambientes); i++) {
          const doLado = Math.random() < 0.45 * vento;
          flocos.push(novo({
            x: doLado ? -20 : acaso(-w * 0.2 * vento, w), y: doLado ? acaso(0, h) : -20,
            vx: acaso(2.5, 7) * vento + 0.3, vy: acaso(1.2, 3.2) * (0.6 + 0.4 * vento),
          }));
        }
      }

      // ── Movimento e desenho ──
      cx.clearRect(0, 0, w, h);
      // A névoa da frente: uma parede de neve fina em cima da borda do buraco.
      if (progresso < 1 && raio > 4) {
        const dentro = Math.max(0, raio - NEVOA), fora = raio + NEVOA * 0.6;
        const nevoa = cx.createRadialGradient(origem.x, origem.y, dentro, origem.x, origem.y, fora);
        const forca = Math.min(1, raio / 120) * (1 - progresso * 0.5);
        nevoa.addColorStop(0, 'rgba(255,255,255,0)');
        nevoa.addColorStop(0.45, `rgba(244,248,253,${(0.5 * forca).toFixed(3)})`);
        nevoa.addColorStop(0.68, `rgba(255,255,255,${(0.78 * forca).toFixed(3)})`);
        nevoa.addColorStop(1, 'rgba(255,255,255,0)');
        cx.fillStyle = nevoa;
        cx.beginPath();
        cx.arc(origem.x, origem.y, fora, 0, Math.PI * 2);
        cx.arc(origem.x, origem.y, dentro, 0, Math.PI * 2, true);
        cx.fill();
      }
      for (let i = flocos.length - 1; i >= 0; i--) {
        const fl = flocos[i];
        if (fl.rajada) {
          // A rajada perde força e o vento e o peso tomam conta.
          const freio = Math.pow(0.975, f);
          fl.vx = fl.vx * freio + 0.04 * f;
          fl.vy = fl.vy * freio + 0.035 * f;
        }
        fl.x += (fl.vx + Math.sin(t * fl.onda + fl.fase) * 0.6) * f;
        fl.y += fl.vy * f;
        if (acalmando) fl.a *= Math.pow(0.95, f);
        if (fl.tipo === 2) {
          fl.vida += dt / 1000;
          if (fl.vida >= fl.dura) { flocos.splice(i, 1); continue; }
        }
        if (fl.x > w + 40 || fl.y > h + 40 || fl.x < -80 || fl.y < -80 || fl.a < 0.03) { flocos.splice(i, 1); continue; }
        if (fl.tipo === 0) {
          cx.globalAlpha = fl.a;
          cx.drawImage(floco, fl.x - fl.s / 2, fl.y - fl.s / 2, fl.s, fl.s);
        } else {
          // O cristal gira; o brilho gira devagar, cresce, pisca e apaga.
          fl.giro += fl.vgiro * (dt / 1000);
          const k = fl.tipo === 2 ? fl.vida / fl.dura : 0;
          const s = fl.tipo === 2 ? fl.s * Math.sin(Math.PI * k) * (0.85 + 0.15 * Math.sin(fl.fase + fl.vida * 22)) : fl.s;
          if (s <= 0.5) continue;
          cx.globalAlpha = fl.tipo === 2 ? fl.a * Math.sin(Math.PI * k) : fl.a;
          cx.setTransform(Math.cos(fl.giro), Math.sin(fl.giro), -Math.sin(fl.giro), Math.cos(fl.giro), fl.x, fl.y);
          cx.drawImage(fl.tipo === 1 ? cristal : brilho, -s / 2, -s / 2, s, s);
          cx.setTransform(1, 0, 0, 1, 0, 0);
        }
      }
      if (flocos.length > MAXIMO_DE_FLOCOS) flocos.splice(0, flocos.length - MAXIMO_DE_FLOCOS);
      cx.globalAlpha = 1;
      quadro = requestAnimationFrame(passo);
    };
    quadro = requestAnimationFrame(passo);
    return () => { cancelAnimationFrame(quadro); window.removeEventListener('resize', ajustar); };
  }, [soltou, origem]);

  return (
    <div className={`np-nevasca np-nevasca-${fase}`}>
      <div ref={veu} className="np-nevasca-veu" aria-hidden />
      <div className="np-nevasca-vinheta" aria-hidden />
      <canvas ref={tela} className="np-nevasca-neve" aria-hidden />
    </div>
  );
}

/**
 * A água no vidro da janela do Analítico, como numa janela de verdade na chuva
 * (pedido de 06/10/2026, com foto de referência). Gotas de todos os tamanhos, em
 * forma de gota (mais largas embaixo), muitas em fileiras verticais: as contas
 * que sobraram de quem escorreu antes. De vez em quando uma gota grande perde o
 * apoio e desce aos trancos (para, escorrega, para), engolindo as que encontra,
 * largando contas pelo caminho e deixando o rastro molhado, que seca devagar.
 *
 * Cada gota é uma lente: a borda escura embaixo, a luz juntando no fundo e um
 * brilho pequeno em cima. No escuro quase some; perto de luz (o bat-sinal, a
 * polícia, as lanternas) acende na cor dela. Com a chuva lá fora (a música),
 * chegam gotas novas; no relâmpago o vidro inteiro clareia.
 *
 * Um canvas em resolução cheia, 30 quadros por segundo. As gotas paradas vão
 * para duas folhas à parte (a gota e o brilho do sinal), refeitas só quando
 * mudam; por quadro: as folhas, as que descem, os rastros e as luzes que piscam.
 */
import { useEffect, useRef } from 'react';
import type { Luz } from './chuva';

interface Props {
  /** Quanta água: 1 = normal; mais = vidro encharcado. */
  agua: number;
  /** A chuva lá fora agora (0 a 1): gotas novas chegam nesse ritmo. */
  chuva: () => number;
  /** As luzes paradas atrás do vidro (o sinal). */
  fontes?: () => Luz[];
  /** As que mudam a cada quadro (polícia, lanternas). */
  reflexos?: () => Luz[];
  /** A luz do sinal falhando (0 a 1). */
  fator?: () => number;
  /** O clarão do raio agora (escrito pela chuva). */
  relampago?: { current: number };
}

type RGB = [number, number, number];
/** Uma gota parada: centro, raio na largura, quanto ela é comprida (1 = redonda) e qual desenho. */
interface Gota { x: number; y: number; r: number; forma: number }
/** Uma gota descendo. `parada`: segundos até escorregar de novo. */
interface Desce { x: number; y: number; r: number; v: number; parada: number; deriva: number; andou: number; rastro: number[] }
/** O caminho molhado que ficou. */
interface Rastro { pts: number[]; largura: number; nasceu: number }

const acaso = (min: number, max: number) => min + Math.random() * (max - min);
/** O comprimento de cada desenho de gota (altura/largura). */
const ALONGA = [1.05, 1.15, 1.3, 1.45, 1.6];
/** Raio de referência dos desenhos (px); cada gota é o desenho reduzido. */
const REF = 14;
const SECA_S = 12;
/** Quantos níveis de brilho no lote das luzes que piscam. */
const LOTES = 5;

/** O contorno de uma gota: ponta em cima, barriga embaixo. */
function contorno(c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number) {
  c.beginPath();
  c.moveTo(x, y - ry);
  c.bezierCurveTo(x + rx * 0.55, y - ry * 0.75, x + rx, y - ry * 0.1, x + rx, y + ry * 0.3);
  c.bezierCurveTo(x + rx, y + ry * 0.8, x + rx * 0.55, y + ry, x, y + ry);
  c.bezierCurveTo(x - rx * 0.55, y + ry, x - rx, y + ry * 0.8, x - rx, y + ry * 0.3);
  c.bezierCurveTo(x - rx, y - ry * 0.1, x - rx * 0.55, y - ry * 0.75, x, y - ry);
  c.closePath();
}

/** Os desenhos de gota, feitos uma vez: sombra embaixo, corpo de lente, luz no fundo e o brilho. */
function desenharGotas(): HTMLCanvasElement[] {
  return ALONGA.map(al => {
    const rx = REF, ry = REF * al, cv = document.createElement('canvas');
    cv.width = Math.ceil(rx * 2 + 6); cv.height = Math.ceil(ry * 2 + 6);
    const c = cv.getContext('2d');
    if (!c) return cv;
    const x = cv.width / 2, y = cv.height / 2;
    // A borda escura: a gota desvia a luz de trás, e a beirada de baixo fica preta.
    contorno(c, x, y + 1.6, rx * 1.03, ry * 1.02);
    c.fillStyle = 'rgba(0,0,0,.5)'; c.fill();
    contorno(c, x, y, rx, ry);
    const corpo = c.createRadialGradient(x, y + ry * 0.2, 0, x, y + ry * 0.2, ry * 1.05);
    corpo.addColorStop(0, 'rgba(255,246,230,.07)'); corpo.addColorStop(0.7, 'rgba(255,246,230,.13)'); corpo.addColorStop(1, 'rgba(255,246,230,.32)');
    c.fillStyle = corpo; c.fill();
    c.save(); c.clip();
    // A luz que junta no fundo da gota.
    const fundo = c.createRadialGradient(x, y + ry * 0.62, 0, x, y + ry * 0.62, rx * 0.75);
    fundo.addColorStop(0, 'rgba(255,240,215,.42)'); fundo.addColorStop(1, 'rgba(255,240,215,0)');
    c.fillStyle = fundo; c.fillRect(0, 0, cv.width, cv.height);
    c.restore();
    // O brilho em cima, à esquerda.
    c.fillStyle = 'rgba(255,255,255,.6)';
    c.beginPath(); c.ellipse(x - rx * 0.36, y - ry * 0.22, rx * 0.17, ry * 0.12, -0.4, 0, 6.2832); c.fill();
    return cv;
  });
}

export function VidroMolhado(p: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const props = useRef(p);
  props.current = p;

  useEffect(() => {
    const cv = ref.current, cx = cv?.getContext('2d');
    if (!cv || !cx) return;
    const sprites = desenharGotas();
    const base = document.createElement('canvas'), acesas = document.createElement('canvas');
    const bx = base.getContext('2d'), ax = acesas.getContext('2d');
    if (!bx || !ax) return;

    let W = 1, H = 1, gotas: Gota[] = [], descem: Desce[] = [], rastros: Rastro[] = [];
    let alvo = 0, sujo = true, ultimaFolha = 0, chaveFontes = '', fontes: Luz[] = [];

    const tamanho = (g: Gota) => ({ rx: g.r, ry: g.r * ALONGA[g.forma] });
    const formaPara = (r: number) => (r < 2.2 ? Math.floor(acaso(0, 2)) : r < 5 ? Math.floor(acaso(0, 4)) : Math.floor(acaso(1, 5)));
    /** Uma gota solta, de chuva que bateu: quase sempre pequena, às vezes grande. */
    const novaSolta = (x = acaso(0, W), y = acaso(0, H)): Gota => {
      const s = Math.random(), r = s < 0.55 ? acaso(1.4, 3) : s < 0.92 ? acaso(3, 6) : acaso(6, 10);
      return { x, y, r, forma: formaPara(r) };
    };

    /** O vidro de começo: fileiras de contas (rastros antigos) e gotas soltas. */
    const povoar = () => {
      alvo = Math.round((W * H / 520) * props.current.agua);
      const inicial = Math.round(alvo * (0.3 + 0.7 * Math.min(1, props.current.chuva())));
      gotas = [];
      // Fileiras: contas pequenas em fila vertical, com falhas.
      while (gotas.length < inicial * 0.55) {
        const x0 = acaso(0, W), ini = acaso(-0.1, 0.7) * H, fim = ini + acaso(0.15, 0.7) * H;
        for (let y = ini; y < fim; y += acaso(6, 24)) {
          const r = acaso(1.2, 3.4);
          gotas.push({ x: x0 + acaso(-1.6, 1.6), y, r, forma: formaPara(r) });
        }
      }
      while (gotas.length < inicial) gotas.push(novaSolta());
      descem = []; rastros = [];
      sujo = true;
    };

    /** A luz parada que bate em (x, y): soma dos halos das fontes. */
    const luzParada = (x: number, y: number): [number, RGB] | null => {
      let I = 0, cor: RGB = [255, 240, 215];
      for (const f of fontes) {
        const s = f.r * 1.1, d2 = (x - f.x) ** 2 + (y - f.y) ** 2;
        if (d2 > 9 * s * s) continue;
        const v = f.forca * Math.exp(-d2 / (2 * s * s));
        if (v > I) cor = f.cor;
        I += v;
      }
      return I > 0.04 ? [I, cor] : null;
    };
    const corDaAgua = (c: RGB) => `rgb(${Math.round(c[0] * 0.7 + 76)},${Math.round(c[1] * 0.7 + 76)},${Math.round(c[2] * 0.7 + 76)})`;
    /** A gota acesa por uma luz: a lente brilha no fundo, o brilho de cima acende e a borda pega a cor. */
    const acender = (c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, I: number) => {
      c.globalAlpha = Math.min(0.85, I * 0.55);
      c.beginPath(); c.ellipse(x, y + ry * 0.5, rx * 0.62, ry * 0.36, 0, 0, 6.2832); c.fill();
      c.globalAlpha = Math.min(1, I * 1.1);
      c.beginPath(); c.ellipse(x - rx * 0.36, y - ry * 0.22, Math.max(0.5, rx * 0.2), Math.max(0.4, ry * 0.14), -0.4, 0, 6.2832); c.fill();
      if (rx > 2.5) { c.globalAlpha = Math.min(0.6, I * 0.35); c.lineWidth = 0.8; contorno(c, x, y, rx, ry); c.stroke(); }
    };
    const pintarGota = (c: CanvasRenderingContext2D, g: Gota) => {
      const s = sprites[g.forma], k = g.r / REF;
      c.drawImage(s, g.x - (s.width / 2) * k, g.y - (s.height / 2) * k, s.width * k, s.height * k);
    };
    const pintarAcesa = (g: Gota) => {
      const l = luzParada(g.x, g.y);
      if (!l) return;
      const { rx, ry } = tamanho(g), cor = corDaAgua(l[1]);
      ax.globalCompositeOperation = 'lighter'; ax.fillStyle = cor; ax.strokeStyle = cor;
      acender(ax, g.x, g.y, rx, ry, l[0]);
    };
    /** Refaz as duas folhas das gotas paradas. */
    const refazerFolhas = () => {
      bx.clearRect(0, 0, W, H); ax.clearRect(0, 0, W, H);
      for (const g of gotas) { pintarGota(bx, g); pintarAcesa(g); }
      ax.globalAlpha = 1;
      sujo = false;
    };
    /** Uma gota nova sem refazer tudo: pinta por cima das folhas. */
    const somar = (g: Gota) => { gotas.push(g); pintarGota(bx, g); pintarAcesa(g); ax.globalAlpha = 1; };

    const ajustar = () => {
      W = cv.width = base.width = acesas.width = Math.max(1, cv.clientWidth);
      H = cv.height = base.height = acesas.height = Math.max(1, cv.clientHeight);
      chaveFontes = '';
      povoar();
    };
    ajustar();
    let espera: ReturnType<typeof setTimeout> | undefined;
    const obs = new ResizeObserver(() => {
      if (cv.clientWidth === W && cv.clientHeight === H) return;
      clearTimeout(espera); espera = setTimeout(ajustar, 200);
    });
    obs.observe(cv);

    /** Uma gota grande perde o apoio e começa a descer. */
    const soltarUma = () => {
      const grandes = gotas.filter(g => g.r >= 6 && g.y < H * 0.8);
      let g: Gota;
      if (grandes.length) { g = grandes[Math.floor(Math.random() * grandes.length)]; gotas.splice(gotas.indexOf(g), 1); sujo = true; }
      else g = { x: acaso(0, W), y: acaso(-10, H * 0.3), r: acaso(6, 9), forma: 3 };
      descem.push({ x: g.x, y: g.y, r: Math.max(6, g.r), v: 0, parada: acaso(0.1, 0.8), deriva: acaso(-0.12, 0.12), andou: 0, rastro: [g.x, g.y] });
    };

    let ultimo = 0, vivo = true, quadro = 0;
    const passo = (agora: number) => {
      if (!vivo) return;
      if (agora - ultimo < 32) { requestAnimationFrame(passo); return; }
      const dt = ultimo ? Math.min(0.1, (agora - ultimo) / 1000) : 0.033;
      ultimo = agora;
      const o = props.current, chuva = Math.max(0, Math.min(1, o.chuva()));

      // O sinal mudou de lugar (redimensionou): refaz o brilho. Medido a cada 10 quadros,
      // como na chuva — medir a página logo depois de escrever estilo obriga a recalcular.
      if (quadro++ % 10 === 0) {
        const fs = o.fontes?.() ?? [];
        const chave = fs.map(f => `${f.x | 0},${f.y | 0},${f.r | 0},${f.forca.toFixed(2)}`).join('|');
        if (chave !== chaveFontes) { chaveFontes = chave; fontes = fs; sujo = true; }
      }

      // Chuva lá fora: chegam gotas novas até o vidro encher.
      if (gotas.length < alvo) {
        const vem = (alvo / 45) * chuva * dt;
        for (let n = Math.floor(vem) + (Math.random() < vem % 1 ? 1 : 0); n > 0; n--) somar(novaSolta());
      }
      // As que descem: até 2 a 5, conforme a chuva.
      if (descem.length < 2 + Math.round(3 * chuva * o.agua) && Math.random() < dt * (0.15 + 0.35 * chuva)) soltarUma();
      for (let i = descem.length - 1; i >= 0; i--) {
        const d = descem[i];
        if (d.parada > 0) { d.parada -= dt; continue; }
        // Escorrega: acelera, e de vez em quando prende de novo.
        d.v = Math.min(d.v + 260 * dt, 30 + d.r * 16);
        const dy = d.v * dt;
        d.y += dy; d.x += d.deriva * dy + Math.sin(d.y * 0.05) * 0.15; d.andou += dy;
        if (Math.random() < dt * 0.9) { d.parada = acaso(0.15, 1.3); d.v = 0; }
        if (d.andou > 7) { d.andou = 0; d.rastro.push(d.x, d.y - d.r * 0.5); if (d.rastro.length > 400) d.rastro.splice(0, 2); }
        // Engole as que encontra no caminho.
        for (let k = gotas.length - 1; k >= 0; k--) {
          const g = gotas[k];
          if (Math.abs(g.y - d.y) > d.r * 1.6 + g.r || Math.abs(g.x - d.x) > d.r + g.r) continue;
          d.r = Math.min(12, Math.sqrt(d.r * d.r + g.r * g.r * 0.6)); d.v += 25;
          gotas.splice(k, 1); sujo = true;
        }
        // Larga contas pelo caminho e vai afinando.
        if (Math.random() < dy / 30) { const r = d.r * acaso(0.25, 0.42); somar({ x: d.x + acaso(-1, 1), y: d.y - d.r * 1.4, r, forma: formaPara(r) }); d.r *= 0.97; }
        d.r -= dt * 0.12;
        if (d.y - d.r > H || d.r < 3.5) {
          if (d.y - d.r <= H) somar({ x: d.x, y: d.y, r: d.r, forma: 2 });
          rastros.push({ pts: d.rastro, largura: d.r * 0.6, nasceu: agora });
          descem.splice(i, 1);
        }
      }
      rastros = rastros.filter(r => agora - r.nasceu < SECA_S * 1000);
      // Refaz as folhas no máximo três vezes por segundo.
      if (sujo && agora - ultimaFolha > 330) { refazerFolhas(); ultimaFolha = agora; }

      cx.clearRect(0, 0, W, H);
      // Os rastros molhados: a borda escura e o meio claro, secando.
      cx.lineCap = 'round'; cx.lineJoin = 'round';
      const trilhas = [...rastros.map(r => ({ pts: r.pts, w: r.largura, a: 1 - (agora - r.nasceu) / (SECA_S * 1000) })),
        ...descem.map(d => ({ pts: [...d.rastro, d.x, d.y - d.r * 0.5], w: d.r * 0.6, a: 1 }))];
      for (const t of trilhas) {
        if (t.pts.length < 4) continue;
        cx.beginPath(); cx.moveTo(t.pts[0], t.pts[1]);
        for (let k = 2; k < t.pts.length; k += 2) cx.lineTo(t.pts[k], t.pts[k + 1]);
        cx.globalAlpha = 0.22 * t.a; cx.strokeStyle = 'rgb(0,0,0)'; cx.lineWidth = t.w + 1.6; cx.stroke();
        cx.globalAlpha = 0.09 * t.a; cx.strokeStyle = 'rgb(255,244,226)'; cx.lineWidth = t.w; cx.stroke();
      }
      cx.globalAlpha = 1;
      // As gotas paradas e, por cima, as que o sinal acende (falhando com ele).
      cx.drawImage(base, 0, 0);
      const fator = o.fator?.() ?? 1;
      if (fator > 0.02) { cx.globalAlpha = Math.min(1, fator); cx.drawImage(acesas, 0, 0); cx.globalAlpha = 1; }
      // As que descem.
      for (const d of descem) pintarGota(cx, { x: d.x, y: d.y, r: d.r, forma: 3 });
      cx.globalCompositeOperation = 'lighter';
      for (const d of descem) {
        const l = luzParada(d.x, d.y);
        if (!l) continue;
        const c = corDaAgua(l[1]); cx.fillStyle = c; cx.strokeStyle = c;
        acender(cx, d.x, d.y, d.r, d.r * ALONGA[3], l[0] * fator);
      }
      // No relâmpago, o vidro inteiro aparece.
      const lampejo = o.relampago?.current ?? 0;
      if (lampejo > 0.02) { cx.globalAlpha = Math.min(1, lampejo * 1.4); cx.drawImage(base, 0, 0); }
      // As luzes que piscam: a gota perto pega a cor delas. Em lote: as gotas vão para
      // cinco caminhos por intensidade e cada caminho é preenchido uma vez (gota por gota,
      // com a viatura cobrindo o vidro inteiro, eram milhares de preenchimentos por quadro).
      for (const L of o.reflexos?.() ?? []) {
        if (L.forca < 0.03) continue;
        const s = L.r * 0.8, alcance = 9 * s * s, dois = 2 * s * s;
        const fundos = Array.from({ length: LOTES }, () => new Path2D()), brilhos = Array.from({ length: LOTES }, () => new Path2D());
        const marcar = (x: number, y: number, rx: number, ry: number) => {
          const d2 = (x - L.x) ** 2 + (y - L.y) ** 2;
          if (d2 > alcance) return;
          const I = L.forca * Math.exp(-d2 / dois);
          if (I < 0.05) return;
          const k = Math.min(LOTES - 1, Math.floor(I * LOTES));
          fundos[k].moveTo(x + rx * 0.62, y + ry * 0.5); fundos[k].ellipse(x, y + ry * 0.5, rx * 0.62, ry * 0.36, 0, 0, 6.2832);
          const bx2 = x - rx * 0.36, by2 = y - ry * 0.22, br = Math.max(0.6, rx * 0.2);
          brilhos[k].moveTo(bx2 + br, by2); brilhos[k].ellipse(bx2, by2, br, Math.max(0.5, ry * 0.14), 0, 0, 6.2832);
        };
        for (const g of gotas) marcar(g.x, g.y, g.r, g.r * ALONGA[g.forma]);
        for (const d of descem) marcar(d.x, d.y, d.r, d.r * ALONGA[3]);
        cx.fillStyle = corDaAgua(L.cor);
        for (let k = 0; k < LOTES; k++) {
          const I = (k + 0.5) / LOTES;
          cx.globalAlpha = Math.min(0.85, I * 0.55); cx.fill(fundos[k]);
          cx.globalAlpha = Math.min(1, I * 1.1); cx.fill(brilhos[k]);
        }
      }
      cx.globalCompositeOperation = 'source-over'; cx.globalAlpha = 1;
      requestAnimationFrame(passo);
    };
    requestAnimationFrame(passo);
    return () => { vivo = false; obs.disconnect(); clearTimeout(espera); };
  }, []);

  return <canvas ref={ref} className="gt-vidro" />;
}

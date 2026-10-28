/**
 * pintarMortes.ts — como o jogo pinta as mortes, para a invasão do mural
 * (pedido de 28/10/2026: «não tem a animação do Gestão ao morrer, quero que
 * pegue do Gestão»).
 *
 *   zumbi   a física é a do jogo (`Insignias/desenhos/fisica.ts`): cada morte
 *           tem o seu palco em pixel da arte, e aqui só se copia para a tela;
 *   bruxa   a queda é a do jogo (`Insignias/desenhos/bruxas/queda.ts`), e a
 *           pintura abaixo é a do palco da caça às bruxas
 *           (`arquivo-morto/.../bruxas/palco.ts`: `pintarChaoNovo`,
 *           `desenharQueda`, `desenharTontura`), copiada sem mudar a conta.
 */
import {
  APAGA_S, DURACAO_S, ORIGEM_X, ORIGEM_Y, PALCO_A, PALCO_L, acabou, avancar as avancarMorte, criarMorte, desenhar,
  type Morte as MorteDoZumbi, type Tiro,
} from '@/components/Insignias/desenhos/fisica';
import { ZUMBIS } from '@/components/Insignias/desenhos/zumbis';
import { FLASH_S, cabecaDaQueda, poseDoOsso, type Queda } from '@/components/Insignias/desenhos/bruxas/queda';
import { girado } from '@/components/Insignias/desenhos/bruxas/pixels';

// ── O zumbi ─────────────────────────────────────────────────────────────────

export interface ZumbiMorrendo {
  m: MorteDoZumbi;
  cv: HTMLCanvasElement;
  buf: Uint32Array;
  img: ImageData;
}

/** A morte do zumbi `qual`, no quadro absoluto `quadro` (o de `TODOS_OS_QUADROS`), com o tiro no pixel `impacto`. */
export function matarZumbi(qual: number, quadro: number, tiro: Tiro, impacto: { x: number; y: number }): ZumbiMorrendo {
  const m = criarMorte(ZUMBIS[qual], quadro, tiro, impacto);
  const cv = document.createElement('canvas');
  cv.width = PALCO_L; cv.height = PALCO_A;
  const buf = new Uint32Array(PALCO_L * PALCO_A);
  return { m, cv, buf, img: new ImageData(new Uint8ClampedArray(buf.buffer), PALCO_L, PALCO_A) };
}

/** Anda a morte e pinta na tela: `x`, `y` é o canto do sprite na tela; `esc`, o pixel; `espelho`, se ele olhava para a esquerda. */
export function pintarZumbiMorrendo(c: CanvasRenderingContext2D, z: ZumbiMorrendo, dt: number, x: number, y: number, esc: number, espelho: boolean) {
  avancarMorte(z.m, dt);
  z.m.eventos.length = 0;
  desenhar(z.m, z.buf);
  z.cv.getContext('2d')?.putImageData(z.img, 0, 0);
  const l = PALCO_L * esc, a = PALCO_A * esc;
  const x0 = x - ORIGEM_X * esc, y0 = y - ORIGEM_Y * esc;
  c.save();
  // Apaga no fim, como no jogo (`APAGA_S`).
  c.globalAlpha = z.m.t < APAGA_S ? 1 : Math.max(0, 1 - (z.m.t - APAGA_S) / (DURACAO_S - APAGA_S));
  if (espelho) { c.translate(x0 + l, y0); c.scale(-1, 1); c.drawImage(z.cv, 0, 0, l, a); }
  else c.drawImage(z.cv, x0, y0, l, a);
  c.restore();
}

export const zumbiAcabou = (z: ZumbiMorrendo) => acabou(z.m);

// ── A bruxa ─────────────────────────────────────────────────────────────────

const css = new Map<number, string>();
/** Cor do `ImageData` (ABGR) para o canvas. */
function corCss(u: number): string {
  let s = css.get(u);
  if (!s) {
    s = `rgb(${u & 255},${(u >>> 8) & 255},${(u >>> 16) & 255})`;
    css.set(u, s);
  }
  return s;
}

/** O que o chão de uma queda já tem pintado (para só pintar o que chegou). */
export interface ChaoDaQueda { raios: number[]; sujou: boolean }

/** Pinta no chão o que mudou: as poças (que só crescem) e as manchas novas. */
export function pintarChaoNovo(c: CanvasRenderingContext2D, q: Queda, ja: ChaoDaQueda): void {
  let raioMudou = q.pocas.length !== ja.raios.length;
  for (let i = 0; i < q.pocas.length && !raioMudou; i++) raioMudou = Math.round(q.pocas[i].r) !== ja.raios[i];
  const repinta = raioMudou || ja.sujou;
  if (repinta) ja.raios = q.pocas.map(p => Math.round(p.r));
  for (const p of repinta ? q.pocas : []) {
    const r = Math.round(p.r);
    if (r < 1) continue;
    const ry = Math.max(1, Math.round(r * 0.3));
    for (let j = -ry; j <= ry; j++) {
      const meia = Math.round(r * Math.sqrt(Math.max(0, 1 - (j / (ry + 0.5)) ** 2)));
      c.fillStyle = corCss(p.borda);
      c.fillRect(p.cx - meia, p.cy + j, meia * 2 + 1, 1);
      if (meia > 1 && Math.abs(j) < ry) {
        c.fillStyle = corCss(p.cor);
        c.fillRect(p.cx - meia + 1, p.cy + j, meia * 2 - 1, 1);
      }
    }
    // O brilho da poça molhada, no alto à esquerda (a luz da arte toda).
    if (r >= 5) {
      c.fillStyle = '#ff6b6b';
      c.fillRect(p.cx - Math.round(r * 0.4), p.cy - Math.max(0, ry - 1), r >= 9 ? 2 : 1, 1);
    }
  }
  ja.sujou = q.novas.length > 0;
  for (const k of q.novas) {
    const cor = q.manchas.get(k);
    if (cor === undefined) continue;
    c.fillStyle = corCss(cor);
    c.fillRect(k % 4096, Math.floor(k / 4096), 1, 1);
  }
  q.novas.length = 0;
}

/** O corpo caindo (ou no chão): os ossos girados, o que se soltou e as gotas no ar. */
export function desenharQueda(c: CanvasRenderingContext2D, q: Queda, ids: Set<number>): void {
  if (q.t < FLASH_S && q.flash) {
    const g = girado(q.flash.rec, 0, 0, 0);
    ids.add(q.flash.rec.id);
    c.drawImage(g.canvas, q.flash.x, q.flash.y);
    return;
  }
  for (const o of q.ossos) {
    if (!o.vivo) continue;
    const p = poseDoOsso(q, o);
    const g = girado(o.rec, o.ax, o.ay, p.giro);
    ids.add(o.rec.id);
    c.drawImage(g.canvas, Math.round(p.x) + g.ox, Math.round(p.y) + g.oy);
  }
  for (const s of q.soltos) {
    const g = girado(s.rec, s.rec.w / 2, s.rec.h / 2, s.ang);
    ids.add(s.rec.id);
    c.drawImage(g.canvas, Math.round(s.cx) + g.ox, Math.round(s.cy) + g.oy);
  }
  for (const gt of q.gotas) {
    c.fillStyle = corCss(gt.cor);
    c.fillRect(Math.round(gt.x), Math.round(gt.y), gt.tam, gt.tam);
  }
}

/**
 * As estrelinhas rodando em cima da cabeça de quem desmaiou (os fofos): três,
 * numa elipse achatada, a de trás mais apagada.
 */
const ESTRELA_TONTA = ['..y..', '.yyy.', 'yywyy', '.yyy.', '..y..'];
export function desenharTontura(c: CanvasRenderingContext2D, q: Queda, agora: number): void {
  const cab = cabecaDaQueda(q);
  if (!cab) return;
  const t = agora / 1000;
  for (let i = 0; i < 3; i++) {
    const a = t * 3.2 + (i * Math.PI * 2) / 3;
    const x = Math.round(cab.x + Math.cos(a) * 9) - 2;
    const y = Math.round(cab.y - 9 + Math.sin(a) * 3) - 2;
    const atras = Math.sin(a) < 0;
    for (let j = 0; j < 5; j++) for (let k = 0; k < 5; k++) {
      const ch = ESTRELA_TONTA[j][k];
      if (ch === '.') continue;
      c.fillStyle = ch === 'w' ? '#ffffff' : atras ? '#c8a020' : '#ffd34d';
      c.fillRect(x + k, y + j, 1, 1);
    }
  }
}

/**
 * O arremesso do boneco de neve (Cleber, 05/11/2026): quem levar a bola até
 * ele vê o boneco esticar os bracinhos; entregando, ele se prepara e arremessa
 * na cesta — com chance de errar.
 *
 * A pose do arremesso mora AQUI, numa função só (`poseDoArremesso`): o boneco
 * se desenha com ela e a bola usa a mesma conta para ficar nas mãos dele
 * (`bolaNaPose`). Assim a bola nunca descola das mãos, nem com o agachar, o
 * pulo e o corpo inclinando.
 *
 * Unidades: as do desenho do boneco (o viewBox 72×76). A base do montinho,
 * em volta da qual o corpo pula, amassa e inclina, é `ORIGEM`.
 */

export type Lado = 1 | -1;
type Ponto = { x: number; y: number };

/** O SVG do boneco é 72×76 desenhado em 54×57 px. */
export const ESCALA_BONECO = 0.75;
export const ORIGEM = { x: 36, y: 72 };
/** Onde a bola fica no colo dele: baixinha, na barriga, para não tapar a boca. */
export const COLO = { x: 36, y: 61 };

/** A linha do tempo do arremesso, em ms desde que ele pegou a bola. */
export const T_PEGA = 260;     // a bola assenta nas mãos (com um amassadinho)
export const T_MIRA = 780;     // olha para a cesta, sobe a bola para o peito
export const T_AGACHA = 1080;  // agacha, inclinando para trás (o embalo)
export const T_SOLTA = 1270;   // pula esticando os braços: a bola sai aqui
export const T_POUSA = 1530;   // ainda no ar, braços seguindo o arremesso
export const T_FIM = 1960;     // pousa amassando e relaxa os braços

export type FaseDoArremesso = 'pegando' | 'mirando' | 'agachando' | 'subindo' | 'seguindo' | 'pousando' | 'pronto';

export interface Pose {
  fase: FaseDoArremesso;
  /** Pulo (para cima é negativo) e o amassado do corpo todo, em volta da base. */
  y: number; sx: number; sy: number;
  /** Inclinação do corpo (graus, horário). */
  inclina: number;
  /** Giro dos braços em volta do ombro (graus, horário) e o quanto esticam. */
  bracoE: number; bracoD: number; estica: number;
  /** O centro da bola, no desenho do corpo (antes do pulo, do amassado e da inclinação). */
  bola: Ponto;
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const prender = (k: number) => Math.min(1, Math.max(0, k));
const suave = (k: number) => k * k * (3 - 2 * k);
const sai = (k: number) => 1 - Math.pow(1 - k, 3);
const entra = (k: number) => k * k;
/** Passa do ponto e volta: a mão pegando a bola. */
const passaEVolta = (k: number) => { const c = 1.9; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };

/** Os braços esperando a bola (o mesmo meio do balanço do CSS `bn-pede`). */
const ESPERA = { e: 22, d: -22 };
/** Abraçando a bola na barriga. */
const ABRACO = { e: -78, d: 78 };
const PEITO = { x: 36, y: 58 };

export function poseDoArremesso(t: number, lado: Lado): Pose {
  const cima = { e: 30 + 10 * lado, d: -30 + 10 * lado };
  // Lá em cima a bola sobe acima dos olhos (o rosto aparece na hora do arremesso).
  const topo = { x: 36 + 6 * lado, y: 4 };
  const base: Pose = { fase: 'pronto', y: 0, sx: 1, sy: 1, inclina: 0, bracoE: 0, bracoD: 0, estica: 1, bola: { ...COLO } };

  if (t < T_PEGA) {
    const k = prender(t / T_PEGA), s = Math.sin(Math.PI * k), b = passaEVolta(k);
    return { ...base, fase: 'pegando', sx: 1 + 0.07 * s, sy: 1 - 0.09 * s,
      bracoE: lerp(ESPERA.e, ABRACO.e, b), bracoD: lerp(ESPERA.d, ABRACO.d, b) };
  }
  if (t < T_MIRA) {
    const k = suave(prender((t - T_PEGA) / (T_MIRA - T_PEGA)));
    return { ...base, fase: 'mirando', inclina: 3 * lado * k, bracoE: ABRACO.e, bracoD: ABRACO.d,
      bola: { x: lerp(COLO.x, PEITO.x, k), y: lerp(COLO.y, PEITO.y, k) } };
  }
  if (t < T_AGACHA) {
    const k = suave(prender((t - T_MIRA) / (T_AGACHA - T_MIRA)));
    return { ...base, fase: 'agachando', sx: 1 + 0.1 * k, sy: 1 - 0.15 * k, inclina: lado * lerp(3, -2, k),
      bracoE: ABRACO.e - 6 * k, bracoD: ABRACO.d + 6 * k, bola: { ...PEITO } };
  }
  if (t < T_SOLTA) {
    const k = prender((t - T_AGACHA) / (T_SOLTA - T_AGACHA)), e = sai(k), m = suave(k);
    // A bola sobe pela frente do corpo, puxada pelas mãos, num arco curto para o lado da cesta.
    const u = suave(k);
    const ctrl = { x: 36 - 3 * lado, y: 32 };
    const bola = {
      x: (1 - u) * (1 - u) * PEITO.x + 2 * (1 - u) * u * ctrl.x + u * u * topo.x,
      y: (1 - u) * (1 - u) * PEITO.y + 2 * (1 - u) * u * ctrl.y + u * u * topo.y,
    };
    return { ...base, fase: 'subindo', y: -15 * e, sx: lerp(1.1, 0.94, e), sy: lerp(0.85, 1.1, e),
      inclina: lado * lerp(-2, 7, e), bracoE: lerp(ABRACO.e - 6, cima.e, m), bracoD: lerp(ABRACO.d + 6, cima.d, m),
      estica: 1 + 0.3 * m, bola };
  }
  if (t < T_POUSA) {
    const k = prender((t - T_SOLTA) / (T_POUSA - T_SOLTA)), e = sai(k);
    const volta = prender(k / 0.8);
    // O pulso segue a bola: os braços tombam para o lado da cesta e ficam lá.
    return { ...base, fase: 'seguindo', y: -15 * (1 - entra(k)), sx: lerp(0.94, 1, volta), sy: lerp(1.1, 1, volta),
      inclina: lado * lerp(7, 4, e), bracoE: cima.e + 14 * lado * e, bracoD: cima.d + 14 * lado * e,
      estica: lerp(1.3, 1.08, e), bola: { ...topo } };
  }
  if (t < T_FIM) {
    const k = prender((t - T_POUSA) / (T_FIM - T_POUSA)), m = suave(k);
    const s = k < 0.4 ? Math.sin(Math.PI * k / 0.4) : 0;
    return { ...base, fase: 'pousando', sx: 1 + 0.09 * s, sy: 1 - 0.1 * s, inclina: lado * 4 * (1 - m),
      bracoE: lerp(cima.e + 14 * lado, 0, m), bracoD: lerp(cima.d + 14 * lado, 0, m), estica: lerp(1.08, 1, m),
      bola: { ...topo } };
  }
  return base;
}

/**
 * Onde a bola está no desenho do boneco, já com a pose aplicada: inclina em
 * volta da base, depois o pulo e o amassado (a mesma ordem dos grupos no SVG:
 * `bn-salto` por fora, `bn-inclina` por dentro).
 */
export function bolaNaPose(p: Pose): Ponto {
  const a = (p.inclina * Math.PI) / 180;
  const rx = p.bola.x - ORIGEM.x, ry = p.bola.y - ORIGEM.y;
  const ix = rx * Math.cos(a) - ry * Math.sin(a), iy = rx * Math.sin(a) + ry * Math.cos(a);
  return { x: ORIGEM.x + ix * p.sx, y: ORIGEM.y + p.y + iy * p.sy };
}

// ── A mira ───────────────────────────────────────────────────────────────────

export interface Voo { gravidade: number; /** Fração da velocidade que sobra a cada segundo. */ ar: number }

/**
 * A velocidade para a bola sair de `de` e cruzar `alvo` descendo, passando
 * por um ponto alto `folga` px acima do mais alto dos dois (sem subir além de
 * `teto`, o alto da área). A conta já leva o freio do ar em conta: é a mesma
 * física da bola solta, e a bola chega aonde a conta diz.
 *
 * `quadro` (s) é a duração do quadro da bola: ela soma a gravidade antes de
 * andar, o que equivale a meio quadro de gravidade a mais na partida — e
 * isso descontado aqui (sem descontar, errava ~15 px num arremesso longo).
 */
export function mirar(de: Ponto, alvo: Ponto, folga: number, teto: number, voo: Voo, quadro = 0): { vx: number; vy: number } {
  const v = mirarContinuo(de, alvo, folga, teto, voo);
  return { vx: v.vx, vy: v.vy - (voo.gravidade * quadro) / 2 };
}

function mirarContinuo(de: Ponto, alvo: Ponto, folga: number, teto: number, voo: Voo): { vx: number; vy: number } {
  const g = voo.gravidade;
  let alto = Math.max(teto, Math.min(de.y, alvo.y) - folga);
  alto = Math.min(alto, de.y - 8, alvo.y - 8);
  const T = Math.sqrt((2 * (de.y - alto)) / g) + Math.sqrt((2 * (alvo.y - alto)) / g);
  const dx = alvo.x - de.x, dy = alvo.y - de.y;
  const k = -Math.log(voo.ar);
  if (k < 1e-4) return { vx: dx / T, vy: (dy - 0.5 * g * T * T) / T };
  const f = k / (1 - Math.exp(-k * T));
  return { vx: dx * f, vy: (dy - (g / k) * T) * f + g / k };
}

/**
 * O erro do boneco, em px no aro (de lado): quase sempre perto do meio, às
 * vezes longe. A física decide o resto — bater no aro e entrar, ou sair.
 */
export function sortearErro(sorte: () => number = Math.random): number {
  const longe = sorte() < 0.25;
  // Normal pelo método de Box-Muller.
  const n = Math.sqrt(-2 * Math.log(Math.max(1e-9, sorte()))) * Math.cos(2 * Math.PI * sorte());
  return n * (longe ? 75 : 28);
}

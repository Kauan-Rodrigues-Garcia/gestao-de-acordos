/*
 * A física da aranha, sem DOM — para dar para testar.
 *
 * Tudo em pixels da tela e em «quadros» de 60 por segundo: `dt = 1` é um
 * quadro, `dt = 0.5` é meio. Quem chama converte o tempo do rAF e divide em
 * passos pequenos, que a mola do fio não aguenta passo grande.
 *
 * Dois corpos:
 *   - presa ao fio: um pêndulo elástico. O fio só puxa (esticado além do
 *     comprimento de repouso); frouxo, não empurra — é linha, não vareta.
 *   - solta: queda livre com ar, giro e as paredes laterais da tela. O chão
 *     não segura: passou da borda de baixo, perdeu a aranha.
 */

export interface Ponto { x: number; y: number }
export interface Corpo extends Ponto { vx: number; vy: number }
export interface CorpoLivre extends Corpo { rot: number; vr: number }

export const FISICA = {
  /** px/quadro². O morcego cai com 0,32; a aranha é mais pesada. */
  gravidade: 0.42,
  /** Rigidez do fio quando esticado. Alta o bastante para não virar elástico de borracha. */
  rigidez: 0.14,
  /** Perda por quadro no balanço — some em uns 5 segundos. */
  atrito: 0.993,
  /** Freio só no eixo do fio: tira o «boing» sem matar o balanço. */
  freioDoFio: 0.12,
  /** Quanto o fio estica além do comprimento, puxando com a mão, antes de estourar. */
  limite: 170,
  /** Quanto do puxão o fio devolve ao ser solto — o resto ele cede. */
  folga: 30,
  /** Resistência do ar, solta. */
  ar: 0.997,
  /** Quanto da velocidade sobra ao bater na lateral da tela. */
  quique: 0.55,
  /** Teto da velocidade do arremesso, px/quadro — senão some num piscar. */
  velocidadeMaxima: 40,
  /** Meio tamanho da aranha, para a parede bater no corpo e não no centro. */
  raio: 13,
} as const;

/** Distância entre dois pontos. */
export function distancia(a: Ponto, b: Ponto): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Inclinação da aranha pendurada, em graus no sentido do CSS (positivo =
 * horário): a cabeça aponta para a âncora. Pendurada reta embaixo = 0.
 */
export function anguloNoFio(p: Ponto, ancora: Ponto): number {
  return (-Math.atan2(p.x - ancora.x, p.y - ancora.y) * 180) / Math.PI;
}

/**
 * Soltou o fio esticado: ele cede e fica deste tamanho.
 *
 * Mola perfeita devolveria toda a energia do puxão — com 150 px de puxão a
 * aranha sai disparada como de estilingue. Fio de aranha cede: fica do
 * tamanho que foi puxado, menos uma sobra (`FISICA.folga`) que dá o quique
 * antes do balanço. Puxou longe, balança de longe.
 */
export function comprimentoAoSoltar(p: Ponto, ancora: Ponto, comprimento: number): number {
  return Math.max(comprimento, distancia(p, ancora) - FISICA.folga);
}

/** Puxou além do limite: o fio estoura. */
export function estourou(p: Ponto, ancora: Ponto, comprimento: number): boolean {
  return distancia(p, ancora) > comprimento + FISICA.limite;
}

/** Um passo do pêndulo elástico. Muda `c` no lugar. */
export function passoNoFio(c: Corpo, ancora: Ponto, comprimento: number, dt: number): void {
  c.vy += FISICA.gravidade * dt;
  const dx = c.x - ancora.x, dy = c.y - ancora.y;
  const d = Math.hypot(dx, dy);
  if (d > comprimento && d > 0) {
    const ux = dx / d, uy = dy / d;
    const puxa = FISICA.rigidez * (d - comprimento) * dt;
    c.vx -= puxa * ux; c.vy -= puxa * uy;
    // Só a componente ao longo do fio é freada: o vai-e-vem lateral continua.
    const radial = c.vx * ux + c.vy * uy;
    const freio = Math.min(1, FISICA.freioDoFio * dt) * radial;
    c.vx -= freio * ux; c.vy -= freio * uy;
  }
  const perda = Math.pow(FISICA.atrito, dt);
  c.vx *= perda; c.vy *= perda;
  c.x += c.vx * dt; c.y += c.vy * dt;
}

/** Um passo solta no ar. Muda `c` no lugar; bate e volta nas laterais. */
export function passoLivre(c: CorpoLivre, larguraDaTela: number, dt: number): void {
  c.vy += FISICA.gravidade * dt;
  const perda = Math.pow(FISICA.ar, dt);
  c.vx *= perda; c.vy *= perda;
  c.x += c.vx * dt; c.y += c.vy * dt;
  c.rot += c.vr * dt;
  c.vr *= Math.pow(0.995, dt);
  const min = FISICA.raio, max = larguraDaTela - FISICA.raio;
  if (c.x < min) { c.x = min; c.vx = Math.abs(c.vx) * FISICA.quique; c.vr *= -0.6; }
  else if (c.x > max) { c.x = max; c.vx = -Math.abs(c.vx) * FISICA.quique; c.vr *= -0.6; }
}

/** Caiu pela borda de baixo: perdeu a aranha. */
export function saiuDaTela(c: Ponto, alturaDaTela: number): boolean {
  return c.y > alturaDaTela + 40;
}

export interface Amostra extends Ponto { t: number }

/**
 * A velocidade da mão, para o arremesso: do toque mais recente ao de uns
 * 60 ms antes, em px/quadro, com teto. Mão parada há mais de 100 ms = largou
 * parada, velocidade zero.
 */
export function velocidadeDaMao(amostras: readonly Amostra[], agora: number): { vx: number; vy: number } {
  const ultima = amostras[amostras.length - 1];
  if (!ultima || agora - ultima.t > 100) return { vx: 0, vy: 0 };
  let base = amostras[0];
  for (let i = amostras.length - 2; i >= 0; i--) {
    base = amostras[i];
    if (ultima.t - base.t >= 60) break;
  }
  const quadros = (ultima.t - base.t) / (1000 / 60);
  if (quadros <= 0) return { vx: 0, vy: 0 };
  let vx = (ultima.x - base.x) / quadros, vy = (ultima.y - base.y) / quadros;
  const v = Math.hypot(vx, vy);
  if (v > FISICA.velocidadeMaxima) { vx *= FISICA.velocidadeMaxima / v; vy *= FISICA.velocidadeMaxima / v; }
  return { vx, vy };
}

/** Ângulo em graus, trazido para (-180, 180]. */
export function normalizarAngulo(graus: number): number {
  const r = ((graus % 360) + 360) % 360;
  return r > 180 ? r - 360 : r;
}

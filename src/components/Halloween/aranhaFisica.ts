/*
 * A física da aranha, sem DOM — para dar para testar.
 *
 * Tudo em pixels da tela e em «quadros» de 60 por segundo: `dt = 1` é um
 * quadro, `dt = 0.5` é meio. Quem chama converte o tempo do rAF e divide em
 * passos pequenos, que a mola do fio não aguenta passo grande.
 *
 * Três corpos:
 *   - presa ao fio: um pêndulo elástico. O fio só puxa (esticado além do
 *     comprimento de repouso); frouxo, não empurra — é linha, não vareta.
 *   - na mão: segue a mão por uma mola com atraso, e não colada ao cursor. É
 *     o que dá peso: ela demora a acompanhar, passa do ponto e pende.
 *   - solta: queda livre com ar, giro e as paredes laterais da tela. O chão
 *     não segura: passou da borda de baixo, perdeu a aranha.
 *
 * E o fio em si (`Fio`): uma corrente de nós (Verlet) entre a âncora e a
 * aranha. Frouxo, faz barriga e ondula quando ela mexe; esticado, fica reto.
 * Só desenho — quem segura a aranha é o pêndulo, que já foi testado. Estourado,
 * o pedaço de cima recolhe para a teia chicoteando, e um toco fica pendurado
 * na aranha.
 */

export interface Ponto { x: number; y: number }
export interface Corpo extends Ponto { vx: number; vy: number }
export interface CorpoLivre extends Corpo { rot: number; vr: number }

export const FISICA = {
  /** px/quadro². O morcego cai com 0,32; a aranha pesa mais. */
  gravidade: 0.5,
  /** Rigidez do fio quando esticado. Alta o bastante para não virar elástico de borracha. */
  rigidez: 0.14,
  /** Perda por quadro no balanço — some em uns 5 segundos. */
  atrito: 0.993,
  /** Freio só no eixo do fio: tira o «boing» sem matar o balanço. */
  freioDoFio: 0.12,
  /** Quanto o fio estica além do comprimento, puxando com a mão, antes de estourar. */
  limite: 230,
  /**
   * Quanto mais esticado, mais o fio segura: a aranha fica para trás da mão.
   * Com 2,5 × o limite, a mão precisa ir uns 380 px além do comprimento para
   * o fio esticar os 230 e estourar.
   */
  resistencia: 575,
  /** Quanto do puxão o fio devolve ao ser solto — o resto ele cede. */
  folga: 36,
  /** Resistência do ar, solta. */
  ar: 0.996,
  /** Quanto da velocidade sobra ao bater na lateral da tela. */
  quique: 0.5,
  /** Teto da velocidade medida da mão, px/quadro. */
  velocidadeMaxima: 40,
  /** Meio tamanho da aranha, para a parede bater no corpo e não no centro. */
  raio: 13,

  // ── O peso na mão ──
  /** Mola entre a mão e a aranha. Baixa = demora a acompanhar. */
  molaDaMao: 0.16,
  /** Perda por quadro da velocidade na mão. Abaixo do crítico: passa um tico do ponto e volta. */
  amortecimentoDaMao: 0.42,
  /** Quanto da velocidade dela vira arremesso ao largar. */
  lancamento: 0.7,
  /** Teto do arremesso, px/quadro. Jogar para cima com força sobe uns 500 px, não 1.500. */
  lancamentoMaximo: 24,

  // ── O desenho do fio ──
  /** Nós da corrente. Mais = mais macio. */
  nosDoFio: 18,
  /** Voltas da correção por passo. */
  iteracoesDoFio: 10,
  /** Seda pesa quase nada: cai bem menos que a aranha. */
  gravidadeDoFio: 0.18,
  /** Perda por quadro do movimento dos nós — tira o tremor sem matar a onda. */
  amortecimentoDoFio: 0.97,
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

/**
 * Onde a aranha quer ficar enquanto a mão puxa o fio. Até o comprimento, onde
 * a mão está. Além dele, na mesma direção, mas esticando menos do que a mão
 * puxou — o fio segura cada vez mais (`FISICA.resistencia`).
 */
export function alvoNoFio(ancora: Ponto, mao: Ponto, comprimento: number): Ponto {
  const d = distancia(ancora, mao);
  if (d <= comprimento || d === 0) return { x: mao.x, y: mao.y };
  const puxou = d - comprimento;
  const estica = puxou / (1 + puxou / FISICA.resistencia);
  const k = (comprimento + estica) / d;
  return { x: ancora.x + (mao.x - ancora.x) * k, y: ancora.y + (mao.y - ancora.y) * k };
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

/**
 * Um passo na mão: a aranha é puxada para `alvo` por uma mola, com o próprio
 * peso puxando para baixo. Muda `c` no lugar. Parada, pende uns 3 px abaixo
 * do dedo; mão rápida, ela fica para trás e depois alcança.
 */
export function passoNaMao(c: Corpo, alvo: Ponto, dt: number): void {
  c.vx += (alvo.x - c.x) * FISICA.molaDaMao * dt;
  c.vy += ((alvo.y - c.y) * FISICA.molaDaMao + FISICA.gravidade) * dt;
  const perda = Math.pow(1 - FISICA.amortecimentoDaMao, dt);
  c.vx *= perda; c.vy *= perda;
  c.x += c.vx * dt; c.y += c.vy * dt;
}

/** A velocidade com que ela sai ao ser largada no ar: uma parte da dela, com teto. */
export function arremesso(c: Corpo): { vx: number; vy: number } {
  let vx = c.vx * FISICA.lancamento, vy = c.vy * FISICA.lancamento;
  const v = Math.hypot(vx, vy);
  if (v > FISICA.lancamentoMaximo) { vx *= FISICA.lancamentoMaximo / v; vy *= FISICA.lancamentoMaximo / v; }
  return { vx, vy };
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
 * A velocidade da mão: do toque mais recente ao de uns 60 ms antes, em
 * px/quadro, com teto. Mão parada há mais de 100 ms = largou parada,
 * velocidade zero.
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

// ── O fio desenhado ───────────────────────────────────────────────────────────

/** Um nó da corrente: onde está e onde estava no passo anterior (Verlet). */
export interface No extends Ponto { ax: number; ay: number }
export interface Fio { nos: No[]; repouso: number }

/** Uma corrente reta de `a` até `b`, parada, de comprimento de repouso `repouso`. */
export function criarFio(a: Ponto, b: Ponto, repouso: number, n: number = FISICA.nosDoFio): Fio {
  const nos: No[] = [];
  for (let i = 0; i < n; i++) {
    const k = i / (n - 1);
    const x = a.x + (b.x - a.x) * k, y = a.y + (b.y - a.y) * k;
    nos.push({ x, y, ax: x, ay: y });
  }
  return { nos, repouso };
}

/**
 * Um passo da corrente. O primeiro nó fica preso em `a`; o último, em `b` —
 * ou solto, com `b = null` (pedaço estourado, toco na aranha). Muda `f` no
 * lugar.
 *
 * Cada trecho só puxa quando passa do tamanho de repouso: frouxo, a corrente
 * cai e faz barriga; esticada além do total, fica reta entre as pontas.
 */
export function passoDoFio(f: Fio, a: Ponto, b: Ponto | null, dt: number): void {
  const nos = f.nos, n = nos.length;
  if (n < 2) return;
  const perda = Math.pow(FISICA.amortecimentoDoFio, dt);
  const g = FISICA.gravidadeDoFio * dt * dt;
  for (let i = 1; i < n; i++) {
    if (i === n - 1 && b) continue;
    const p = nos[i];
    const vx = (p.x - p.ax) * perda, vy = (p.y - p.ay) * perda;
    p.ax = p.x; p.ay = p.y;
    p.x += vx; p.y += vy + g;
  }
  const prender = () => {
    nos[0].x = a.x; nos[0].y = a.y; nos[0].ax = a.x; nos[0].ay = a.y;
    if (b) { const u = nos[n - 1]; u.x = b.x; u.y = b.y; u.ax = b.x; u.ay = b.y; }
  };
  prender();
  const trecho = f.repouso / (n - 1);
  for (let it = 0; it < FISICA.iteracoesDoFio; it++) {
    for (let i = 0; i < n - 1; i++) {
      const p = nos[i], q = nos[i + 1];
      const dx = q.x - p.x, dy = q.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d <= trecho || d === 0) continue;
      const pesoP = i === 0 ? 0 : 1;
      const pesoQ = i + 1 === n - 1 && b ? 0 : 1;
      const soma = pesoP + pesoQ;
      if (!soma) continue;
      const corr = (d - trecho) / d / soma;
      p.x += dx * corr * pesoP; p.y += dy * corr * pesoP;
      q.x -= dx * corr * pesoQ; q.y -= dy * corr * pesoQ;
    }
    prender();
  }
}

/**
 * O fio esticado treme quando está perto de estourar: empurra os nós do meio
 * de lado, um tanto que cresce com a tensão (0 a 1). Muda `f` no lugar.
 */
export function tremerFio(f: Fio, tensao: number, t: number): void {
  if (tensao <= 0.7) return;
  const nos = f.nos, n = nos.length;
  const a = nos[0], b = nos[n - 1];
  const d = distancia(a, b) || 1;
  const nx = -(b.y - a.y) / d, ny = (b.x - a.x) / d;
  const forca = (tensao - 0.7) * 5;
  for (let i = 1; i < n - 1; i++) {
    const meio = Math.sin((i / (n - 1)) * Math.PI);
    const onda = Math.sin(t / 14 + i * 1.7) * forca * meio;
    nos[i].x += nx * onda; nos[i].y += ny * onda;
  }
}

/** O caminho SVG que passa suave pelos nós (curvas pelos pontos médios). */
export function caminhoDoFio(nos: readonly Ponto[]): string {
  if (nos.length < 2) return '';
  const f = (v: number) => v.toFixed(1);
  let d = `M${f(nos[0].x)} ${f(nos[0].y)}`;
  for (let i = 1; i < nos.length - 1; i++) {
    const mx = (nos[i].x + nos[i + 1].x) / 2, my = (nos[i].y + nos[i + 1].y) / 2;
    d += ` Q${f(nos[i].x)} ${f(nos[i].y)} ${f(mx)} ${f(my)}`;
  }
  const u = nos[nos.length - 1];
  return `${d} L${f(u.x)} ${f(u.y)}`;
}

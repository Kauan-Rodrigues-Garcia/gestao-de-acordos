/**
 * O trilho de uma aba — a geometria, sem desenho nem DOM.
 *
 * Pistas retas, sem curva (Cleber, 04/11/2026). Dashboard e Acordos têm
 * uma pista só, no pé da página — no Dashboard, saindo da estação; o
 * Analítico tem uma no alto e outra no pé, que acaba no para-choque do fim da
 * linha (`PISTAS_DA_ABA`, em `rota.ts`):
 *
 *   Dashboard  (pé)    [estação] ───────────────────────▶ sai pela direita
 *   Acordos    (pé)    entra ───────────────────────────▶ sai
 *   Analítico  (alto)  entra ───────────────────────────▶ sai pela direita
 *              (pé)    [para-choque] ◀───────────────── entra pela direita
 *
 * As pistas ficam nas faixas que o `Layout` abre (`Faixas.tsx`), junto com a
 * estação, o fim da linha e as atrações (o sinal de passagem, o vilarejo, o
 * boneco de neve). O trem passa NA FRENTE do conteúdo.
 *
 * Tempo: cada pista leva `segundosPorPista` (`SEGUNDOS_POR_PISTA`, em
 * `horario.ts`), em qualquer tela — o trem entra e sai das abas no mesmo
 * instante para todo mundo; dentro da pista anda sempre na mesma velocidade.
 * Entre uma pista e a outra (no Analítico), o salto é fora da tela. Saída e
 * chegada aceleram e freiam em `RAMPA_S`.
 *
 * O trem é posicionado pelo CENTRO: cada carro fica a uma distância fixa do
 * centro, ao longo do trilho. Antes do começo e depois do fim o trilho
 * continua reto (para o trem sair da tela por inteiro).
 */

/** Quanto dura a aceleração na saída e a freada na chegada. */
export const RAMPA_S = 2.5;
/** Passo da amostragem do caminho, em px. */
const PASSO = 4;
/** Na estação, quanto as atrações ficam depois do trem parado (o aviso e o bilhete do sorteio ficam ali). */
const DEPOIS_DO_AVISO = 470;
/** De quanto em quanto vai um enfeite na beira do trilho. */
const PASSO_ENFEITE = 150;
/** O espaço de cada atração na faixa. */
const LARGURA_ATRACAO = 120;

export type TipoDeTrecho = 'faixa' | 'fora';

export interface MedidasDoTrilho {
  /** Largura do conteúdo (a área que rola). */
  largura: number;
  /** Altura do eixo do trilho na faixa do alto (só onde há pista no alto) e na do pé. */
  yTopo?: number;
  yFim: number;
  /** Comprimento do trem na tela, em px. */
  comprimentoTrem: number;
  /** Onde o CENTRO do trem fica parado na estação (só o Dashboard). */
  xEstacao?: number;
  /** Onde o CENTRO do trem para no fim da linha (só a última aba). */
  xFimDaLinha?: number;
  /** Trechos de faixa já ocupados (o iglu do urso): ali não vai enfeite nem atração. */
  reservas?: readonly { x0: number; x1: number; y: number }[];
}

/** Um ponto do trilho; `rumo`: 0 andando para a direita, π para a esquerda (na ida). */
interface Amostra { x: number; y: number; s: number; tipo: TipoDeTrecho; rumo: number }

export type TipoDeAtracao = 'sinal' | 'vilarejo' | 'boneco' | 'pinheiros';
/** Uma atração ao lado do trilho, numa faixa. `s`: o ponto do trilho em frente a ela. */
export interface Atracao { tipo: TipoDeAtracao; x: number; y: number; s: number }

/** Os enfeites baixinhos da beira do trilho (cabem até embaixo do bilhete do sorteio). */
export type TipoDeEnfeite = 'bengala' | 'presentinho' | 'montinho';
export interface Enfeite { tipo: TipoDeEnfeite; x: number; y: number }
/** Um pisca-pisca ao longo de uma pista, de `x0` a `x1`. */
export interface PiscaPisca { y: number; x0: number; x1: number }

export interface Trilho {
  /** O caminho em SVG, para desenhar: uma reta por pista. */
  d: string;
  comprimento: number;
  amostras: Amostra[];
  /** Distância → segundos de movimento, uma por pista (sem as rampas). */
  trechos: { s0: number; s1: number; t0: number; t1: number }[];
  /** Quantos segundos o trem leva para andar o trilho todo, sem as rampas. */
  duracao: number;
  /** Largura da página. */
  largura: number;
  /** A altura de cada pista, na ordem da ida. */
  linhas: number[];
  atracoes: Atracao[];
  enfeites: Enfeite[];
  piscas: PiscaPisca[];
}

export function montarTrilho(m: MedidasDoTrilho, segundosPorPista: number): Trilho {
  const W = m.largura;
  const fora = m.comprimentoTrem / 2 + 24;       // centro do trem com ele todo fora da tela
  const linhas = m.yTopo !== undefined ? [m.yTopo, m.yFim] : [m.yFim];
  const ultima = linhas.length - 1;

  // As amostras, pista por pista; entre uma e a outra, um salto fora da tela (mesmo `s`).
  const amostras: Amostra[] = [];
  const trechos: Trilho['trechos'] = [];
  let s = 0;
  linhas.forEach((y, k) => {
    const indo = k % 2 === 0 ? 1 : -1;            // a primeira para a direita, a segunda de volta
    const de = k === 0 ? (m.xEstacao ?? -fora) : W + fora;
    const ate = k === ultima ? (m.xFimDaLinha ?? (indo > 0 ? W + fora : -fora)) : W + fora;
    const L = Math.abs(ate - de);
    const n = Math.max(1, Math.ceil(L / PASSO));
    const s0 = s;
    for (let i = 0; i <= n; i++) {
      const x = de + ((ate - de) * i) / n;
      if (i) s += L / n;
      const foraDaTela = x < -m.comprimentoTrem / 2 || x > W + m.comprimentoTrem / 2;
      amostras.push({ x, y, s, tipo: foraDaTela ? 'fora' : 'faixa', rumo: indo > 0 ? 0 : Math.PI });
    }
    trechos.push({ s0, s1: s, t0: k * segundosPorPista, t1: (k + 1) * segundosPorPista });
  });

  // As atrações: o sinal de passagem na pista do alto (ou no meio da única), o vilarejo, o boneco e os pinheiros no pé.
  const atracoes: Atracao[] = [];
  const pos = (tipo: TipoDeAtracao, y: number, x: number) => {
    const perto = amostras.reduce((b, p) => (p.y === y && p.tipo !== 'fora' && Math.abs(p.x - x) < Math.abs(b.x - x) ? p : b), amostras[0]);
    atracoes.push({ tipo, x, y, s: perto.s });
  };
  /** Algum trecho reservado (o iglu) perto deste ponto da pista `y`? */
  const reservado = (x: number, y: number, folga: number) =>
    (m.reservas ?? []).some(r => Math.abs(r.y - y) < 90 && x > r.x0 - folga && x < r.x1 + folga);
  const livre = (parada?: number, depois = 70, y?: number) => {
    let a = parada !== undefined ? parada + m.comprimentoTrem / 2 + depois : 120;
    const naPista = (m.reservas ?? []).filter(r => y !== undefined && Math.abs(r.y - y) < 90);
    // Com a plaquinha na ponta esquerda (Cleber, 05/11/2026: «não fique nada na
    // frente da placa»), a pista começa depois dela; com o iglu na direita, acaba onde ele começa.
    for (const r of naPista) if (r.x1 < W / 2) a = Math.max(a, r.x1 + 40);
    const b = Math.min(W - 120, ...naPista.filter(r => r.x1 >= W / 2).map(r => r.x0 - 40));
    return { a, b, L: b - a };
  };
  // Na estação, o aviso e o bilhete do sorteio ficam logo depois do trem parado: as atrações vão além deles.
  const pe = m.xEstacao !== undefined ? livre(m.xEstacao, DEPOIS_DO_AVISO, m.yFim) : livre(m.xFimDaLinha, 70, m.yFim);
  if (m.yTopo !== undefined) {
    const alto = livre(undefined, 70, m.yTopo);
    if (alto.L > LARGURA_ATRACAO * 2) pos('sinal', m.yTopo, alto.a + alto.L * 0.5);
    if (pe.L > LARGURA_ATRACAO * 3) {
      pos('vilarejo', m.yFim, pe.a + pe.L * 0.15);
      pos('boneco', m.yFim, pe.a + pe.L * 0.55);
      pos('pinheiros', m.yFim, pe.a + pe.L * 0.9);
    }
  } else if (pe.L > LARGURA_ATRACAO * 4) {
    pos('vilarejo', m.yFim, pe.a + pe.L * 0.12);
    pos('sinal', m.yFim, pe.a + pe.L * 0.42);
    pos('boneco', m.yFim, pe.a + pe.L * 0.68);
    pos('pinheiros', m.yFim, pe.a + pe.L * 0.92);
  }

  // Os enfeites: um a cada `PASSO_ENFEITE`, desviando das atrações e de onde o trem fica parado.
  const TIPOS: TipoDeEnfeite[] = ['bengala', 'presentinho', 'montinho', 'presentinho', 'bengala', 'montinho'];
  const enfeites: Enfeite[] = [];
  const piscas: PiscaPisca[] = [];
  linhas.forEach((y, k) => {
    const parada = k === 0 && m.xEstacao !== undefined ? m.xEstacao : k === ultima ? m.xFimDaLinha : undefined;
    const x0 = parada !== undefined ? parada - m.comprimentoTrem / 2 - 20 : 0;
    piscas.push({ y, x0: Math.max(0, x0), x1: W });
    const ocupado = (x: number) =>
      atracoes.some(a => a.y === y && Math.abs(a.x - x) < 75)
      || (parada !== undefined && Math.abs(x - parada) < m.comprimentoTrem / 2 + 30)
      || reservado(x, y, 20);
    let n = k * 2;
    for (let x = Math.max(40, x0 + 40); x < W - 30; x += PASSO_ENFEITE) {
      if (ocupado(x)) continue;
      enfeites.push({ tipo: TIPOS[n++ % TIPOS.length], x, y });
    }
  });

  // O desenho: só o pedaço de cada pista que cabe na página (e o trecho atrás do trem parado).
  const f = (n: number) => n.toFixed(1);
  const d = linhas.map((y, k) => {
    const comeco = k === 0 && m.xEstacao !== undefined ? m.xEstacao - m.comprimentoTrem / 2 - 22
      : k === ultima && m.xFimDaLinha !== undefined ? m.xFimDaLinha - m.comprimentoTrem / 2 - 12
      : -8;
    return `M${f(Math.max(-8, comeco))} ${f(y)} H${f(W + 8)}`;
  }).join(' ');

  return { d, comprimento: s, amostras, trechos, largura: W, duracao: linhas.length * segundosPorPista, linhas, atracoes, enfeites, piscas };
}

/** Segundos de movimento (0 a `duracao`) → distância no trilho. */
export function distanciaNoTempo(trilho: Trilho, segundos: number): number {
  const t = Math.min(trilho.duracao, Math.max(0, segundos));
  const ult = trilho.trechos[trilho.trechos.length - 1];
  for (const tr of trilho.trechos) {
    if (t <= tr.t1 || tr === ult) {
      const dt = tr.t1 - tr.t0;
      const k = dt > 0 ? Math.min(1, Math.max(0, (t - tr.t0) / dt)) : 1;
      return tr.s0 + (tr.s1 - tr.s0) * k;
    }
  }
  return trilho.comprimento;
}

/**
 * Onde o trem está, `segundos` depois de entrar no trecho desta aba. Na ida
 * ele anda do começo do trilho para o fim; na volta, do fim para o começo.
 * `partindo`: sai parado (acelera); `chegando`: para no fim (freia). Depois de
 * andar tudo, fica no fim do trecho — fora da tela, ou parado.
 */
export function distanciaNoTrecho(
  trilho: Trilho, segundos: number, o: { volta: boolean; partindo: boolean; chegando: boolean },
): number {
  const D = trilho.duracao;
  const A = RAMPA_S;
  let tau = segundos;
  if (o.partindo) tau = segundos < A ? (segundos * segundos) / (2 * A) : segundos - A / 2;
  if (o.chegando) {
    const fim = (o.partindo ? D + A : D + A / 2);
    const base = o.partindo ? tau : segundos;
    tau = segundos >= fim ? D : segundos > fim - A ? D - ((fim - segundos) ** 2) / (2 * A) : base;
  }
  tau = Math.min(D, Math.max(0, tau));
  return distanciaNoTempo(trilho, o.volta ? D - tau : tau);
}

/**
 * Ponto e direção (radianos, no sentido de `s` crescente) a uma distância do
 * começo. As linhas são retas: a direção é a da linha onde o ponto cai.
 */
export function pontoNoTrilho(trilho: Trilho, s: number): { x: number; y: number; angulo: number; tipo: TipoDeTrecho } {
  const a = trilho.amostras;
  if (a.length < 2) return { x: a[0]?.x ?? 0, y: a[0]?.y ?? 0, angulo: 0, tipo: 'faixa' };
  // Fora das pontas, o trilho segue reto.
  if (s <= 0) {
    const ang = a[0].rumo;
    return { x: a[0].x + Math.cos(ang) * s, y: a[0].y, angulo: ang, tipo: 'faixa' };
  }
  const ult = a[a.length - 1];
  if (s >= ult.s) {
    const ang = ult.rumo;
    return { x: ult.x + Math.cos(ang) * (s - ult.s), y: ult.y, angulo: ang, tipo: 'faixa' };
  }
  // A última amostra com `s` <= o pedido (no salto entre linhas, fica a da linha nova).
  let lo = 0, hi = a.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (a[mid].s <= s) lo = mid; else hi = mid; }
  const p = a[lo], q = a[hi];
  const ang = p.rumo;
  if (q.y !== p.y) return { x: p.x, y: p.y, angulo: ang, tipo: p.tipo };
  const k = (s - p.s) / (q.s - p.s || 1);
  return { x: p.x + (q.x - p.x) * k, y: p.y, angulo: ang, tipo: p.tipo };
}

/**
 * De que lado do trilho fica o corpo do carro: o trem é visto de lado e as
 * linhas são retas — andando para a direita, o desenho normal (+1); para a
 * esquerda, espelhado (-1).
 */
export function ladoDoCorpo(rumo: number): number {
  return Math.cos(rumo) >= 0 ? 1 : -1;
}

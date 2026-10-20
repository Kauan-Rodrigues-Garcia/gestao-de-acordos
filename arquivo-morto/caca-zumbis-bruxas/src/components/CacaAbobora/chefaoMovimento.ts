/**
 * chefaoMovimento.ts — como o chefão anda, desvia, pula e entra na Fúria.
 *
 * Puro (sem DOM): a cena (`cenaChefao.tsx`) chama `mover` a cada quadro e
 * pinta o que ele diz. Os testes rodam o laço sem navegador.
 *
 * ## A física (09/10/2026 — «animações mais funcionais, com física»)
 *
 * - Andando, ele tem INÉRCIA: a velocidade vai até a do passo aos poucos
 *   (`SUAVE_MS`), e para do mesmo jeito. O moonwalk desliza liso, sem degrau.
 * - O desvio é uma AÇÃO com começo e fim:
 *     pulo      um arco (sobe e desce em parábola), girando no ar, e amassa
 *               ao cair (`achata`), levantando poeira;
 *     deslize   um tiro reto e rápido, deixando rastro;
 *     passinho  o desvio curtinho da Fúria: pula de lado e volta a dançar.
 * - A FÚRIA DO REI: os olhos acendem, ele para um instante (`ACENDE_MS`) e
 *   então dança mais rápido, só os passos de pista, desviando de TUDO.
 * - O BANQUETE (09/10/2026): uma pessoa entra andando; ele segue dançando
 *   até `ve`, quando PARA e a encara; em `corre` CORRE até ela (com inércia,
 *   como sempre), dá o BOTE (um pulo em cima dela) e fica curvado comendo até
 *   o fim (`comecarCura`). A cena decide onde ela está; aqui só se anda até lá.
 */
import {
  BANQUETE, CORRIDA, PASSOS_DA_FURIA, PASSO_POR_ID, proximoPasso, type Passo, type QuadroDanca, type Transforma,
} from './chefaoArte';

export type TipoAcao = 'pulo' | 'deslize' | 'passinho';

export interface Acao {
  tipo: TipoAcao;
  x0: number; y0: number;
  x1: number; y1: number;
  t0: number;
  dur: number;
  /** Altura do arco, em px da tela (0 = rente ao chão). */
  altura: number;
}

/** O banquete: de quando a quando, e onde ele tem de chegar (o canto da caixa). */
export interface Cura {
  /** A imunidade: de quando a quando (a janela inteira do banco). */
  de: number;
  ate: number;
  /** Quando ele a vê (para de dançar e encara) e quando sai correndo. */
  ve: number;
  corre: number;
  /** Já a viu (o evento `viu` saiu). */
  viu: boolean;
  x: number;
  y: number;
  /** Para que lado a vítima está, quando ele chegar. */
  lado: 1 | -1;
  /** Já deu o bote. */
  pulou: boolean;
  /** Já está em cima dela, comendo. */
  chegou: boolean;
  /** O relógio das mordidas. */
  mordida: number;
}

export interface Movimento {
  /** Canto de cima da caixa, em px do palco, com os pés no chão. */
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Quanto está no ar agora (o pulo), em px. */
  ar: number;
  lado: 1 | -1;
  passo: Passo;
  qi: number;
  acc: number;
  volta: number;
  alvo: { x: number; y: number };
  acao: Acao | null;
  /** Quando caiu do último pulo (o amasso). */
  pousouEm: number;
  entraAte: number;
  fugindo: boolean;
  /** A Fúria do Rei: de quando a quando. 0 = sem fúria. */
  furiaDe: number;
  furiaAte: number;
  /** O passo da fúria em que está (índice em `PASSOS_DA_FURIA`). */
  furiaPasso: number;
  /** Um tranco de dor (os machucados): até quando, e para que lado. */
  trancoAte: number;
  trancoLado: number;
  /** O banquete em andamento (ou marcado). */
  cura: Cura | null;
}

/** Tamanho da caixa do chefão, em px da tela. */
export interface Caixa { largura: number; altura: number }

/** Quanto tempo a velocidade leva para chegar perto da do passo. */
const SUAVE_MS = 140;
/** O amasso da aterrissagem. */
export const ACHATA_MS = 160;
/** A Fúria: o instante parado com os olhos acesos, e quanto dura. */
export const ACENDE_MS = 650;
export const FURIA_MS = 6_500;
/** Na Fúria, os quadros passam mais rápido. */
const FURIA_RITMO = 0.62;
/** Os machucados: a dança fica mais lenta no fim. */
const RITMO_POR_ESTAGIO = [1, 1, 1.08, 1.18] as const;

const DUR: Readonly<Record<TipoAcao, number>> = { pulo: 420, deslize: 260, passinho: 170 };
const DIST: Readonly<Record<TipoAcao, readonly [number, number]>> = {
  pulo: [130, 230], deslize: [120, 210], passinho: [36, 70],
};
const ALTURA: Readonly<Record<TipoAcao, readonly [number, number]>> = {
  pulo: [70, 120], deslize: [0, 0], passinho: [10, 20],
};

const entre = ([a, b]: readonly [number, number], sorte: number) => a + sorte * (b - a);

/** Onde ele pode ficar: abaixo do placar de cima, longe das bordas. */
export function limites(largura: number, altura: number, caixa: Caixa) {
  const topo = Math.min(84, Math.max(0, altura - caixa.altura));
  return {
    x0: 8, x1: Math.max(8, largura - caixa.largura - 8),
    y0: topo, y1: Math.max(topo, altura - caixa.altura - 8),
  };
}

export function alvoNovo(largura: number, altura: number, caixa: Caixa, rnd: () => number = Math.random) {
  const b = limites(largura, altura, caixa);
  return { x: b.x0 + rnd() * (b.x1 - b.x0), y: b.y0 + rnd() * (b.y1 - b.y0) };
}

export function criarMovimento(largura: number, altura: number, caixa: Caixa, agora: number, entradaMs: number,
  rnd: () => number = Math.random): Movimento {
  const inicio = alvoNovo(largura, altura, caixa, rnd);
  return {
    ...inicio, vx: 0, vy: 0, ar: 0, lado: rnd() < 0.5 ? -1 : 1,
    passo: PASSO_POR_ID.garras, qi: 0, acc: 0, volta: 0,
    alvo: alvoNovo(largura, altura, caixa, rnd), acao: null, pousouEm: -Infinity,
    entraAte: agora + entradaMs, fugindo: false,
    furiaDe: 0, furiaAte: 0, furiaPasso: 0, trancoAte: 0, trancoLado: 1, cura: null,
  };
}

export const naFuria = (m: Movimento, agora: number) => m.furiaAte > 0 && agora >= m.furiaDe && agora < m.furiaAte;
/** O instante do começo da Fúria: parado, os olhos acendendo. */
export const acendendo = (m: Movimento, agora: number) =>
  m.furiaAte > 0 && agora >= m.furiaDe && agora < m.furiaDe + ACENDE_MS;

/** Na fuga: o moonwalk, mais depressa, até sair pela borda mais perto. */
export const FUGA: Passo = { ...PASSO_POR_ID.moonwalk, id: 'fuga', velocidade: 150, voltas: Infinity, esquiva: 1 };

export function comecarFuria(m: Movimento, agora: number): void {
  m.furiaDe = agora;
  m.furiaAte = agora + FURIA_MS;
  m.furiaPasso = 0;
  m.acao = null;
  m.passo = PASSO_POR_ID[PASSOS_DA_FURIA[0]];
  m.qi = 0;
  m.volta = 0;
}

/** Correndo, ele pula em cima dela quando chega a esta distância — ou quando o tempo de correr acaba. */
const BOTE_DIST = 150;
export const CORRE_ATE_MS = 2_600;
const BOTE_MS = 480;
const BOTE_ALTURA = 90;
/** De quanto em quanto tempo ele dá uma mordida (a cena espirra sangue e sobe o «+N»). */
export const MORDIDA_MS = 420;

/** Comendo (ou indo comer): imune. */
export const emCura = (m: Movimento, agora: number) => !!m.cura && agora >= m.cura.de && agora < m.cura.ate;

/**
 * Marca o banquete: imune de `de` a `ate`; dança distraído até `ve`, encara
 * até `corre`, e então corre para (`x`, `y`). A cena pode mudar `x`, `y` e
 * `lado` no evento `viu` (ele já andou dançando). Os tempos podem estar no
 * passado (quem chega no meio): o tempo de correr já gasto vale, e ele dá o
 * bote direto. A Fúria acaba aqui.
 */
export function comecarCura(
  m: Movimento, de: number, ate: number, x: number, y: number, lado: 1 | -1, ve = de, corre = ve,
): void {
  m.cura = { de, ate, ve, corre, viu: false, x, y, lado, pulou: false, chegou: false, mordida: 0 };
  m.furiaAte = 0;
}

export function comecarFuga(m: Movimento, largura: number, caixa: Caixa): void {
  m.cura = null;
  m.fugindo = true;
  m.acao = null;
  m.furiaAte = 0;
  m.passo = FUGA;
  m.qi = 0;
  m.volta = 0;
  const pelaEsquerda = m.x + caixa.largura / 2 < largura / 2;
  m.alvo = { x: pelaEsquerda ? -caixa.largura * 3 : largura + caixa.largura * 2, y: m.y };
}

/**
 * Desvia: sai do lado do tiro (`deQueLado` = para onde fugir) com a ação
 * escolhida. Perto da parede, vai para o outro lado. Devolve onde vai cair.
 */
export function desviar(
  m: Movimento, tipo: TipoAcao, deQueLado: number, agora: number,
  largura: number, altura: number, caixa: Caixa, rnd: () => number = Math.random,
): { x: number; y: number } {
  const b = limites(largura, altura, caixa);
  const dist = entre(DIST[tipo], rnd());
  let dir = deQueLado >= 0 ? 1 : -1;
  if ((dir > 0 && m.x + dist > b.x1) || (dir < 0 && m.x - dist < b.x0)) dir = -dir;
  const x1 = Math.min(b.x1, Math.max(b.x0, m.x + dir * dist));
  const dy = tipo === 'passinho' ? (rnd() - 0.5) * 30 : (rnd() - 0.5) * 160;
  const y1 = Math.min(b.y1, Math.max(b.y0, m.y + dy));
  m.acao = { tipo, x0: m.x, y0: m.y, x1, y1, t0: agora, dur: DUR[tipo], altura: entre(ALTURA[tipo], rnd()) };
  m.vx = 0;
  m.vy = 0;
  // No deslize ele vai de costas (é um moonwalk relâmpago); no pulo, olha para onde vai.
  m.lado = tipo === 'deslize' ? (dir > 0 ? -1 : 1) : (dir > 0 ? 1 : -1);
  if (!naFuria(m, agora)) m.alvo = alvoNovo(largura, altura, caixa, rnd);
  return { x: x1, y: y1 };
}

export type EventoMovimento =
  | { tipo: 'passo'; passo: Passo }
  | { tipo: 'pousou'; x: number; y: number }
  | { tipo: 'pe' }
  | { tipo: 'furiaAcabou' }
  | { tipo: 'viu' }
  | { tipo: 'bote' }
  | { tipo: 'chegouNaVitima' }
  | { tipo: 'mordida' }
  | { tipo: 'curaAcabou' };

/** O quadro na tela agora, e o que o corpo inteiro faz por cima dele. */
export interface Agora { qd: QuadroDanca; t: Transforma; achata: number }

export function quadroAtual(m: Movimento, agora: number): Agora {
  let qd: QuadroDanca;
  if (m.acao) {
    // No ar ou deslizando: o giro (no pulo) ou o moonwalk (no deslize), pelo relógio.
    const passo = m.cura?.pulou ? BANQUETE : m.acao.tipo === 'deslize' ? PASSO_POR_ID.moonwalk : PASSO_POR_ID.giro;
    qd = passo.quadros[Math.floor(agora / 60) % passo.quadros.length];
  } else if (acendendo(m, agora)) {
    qd = PASSO_POR_ID.ponta.quadros[1];
  } else {
    qd = m.passo.quadros[m.qi % m.passo.quadros.length];
  }
  let t = qd.transforma;
  if (agora < m.trancoAte) t = { ...t, gira: t.gira + 7 * m.trancoLado };
  const desdeQueCaiu = agora - m.pousouEm;
  const achata = desdeQueCaiu >= 0 && desdeQueCaiu < ACHATA_MS ? 1 - desdeQueCaiu / ACHATA_MS : 0;
  return { qd, t, achata };
}

/**
 * Um passo do laço: `dt` em ms. Devolve o que aconteceu (para a cena tocar
 * som, soltar poeira ou o letreiro do passo).
 */
export function mover(
  m: Movimento, dt: number, agora: number, largura: number, altura: number, caixa: Caixa,
  estagio: 0 | 1 | 2 | 3 = 0, rnd: () => number = Math.random,
): EventoMovimento[] {
  const eventos: EventoMovimento[] = [];
  const b = limites(largura, altura, caixa);
  const furia = naFuria(m, agora);

  if (m.furiaAte > 0 && agora >= m.furiaAte && !m.fugindo) {
    m.furiaAte = 0;
    m.passo = proximoPasso('giro', 0);
    m.qi = 0;
    m.volta = 0;
    eventos.push({ tipo: 'furiaAcabou' });
  }

  if (m.cura && agora >= m.cura.ate && !m.fugindo) {
    m.cura = null;
    m.acao = null;
    m.ar = 0;
    m.passo = proximoPasso('banquete', rnd());
    m.qi = 0;
    m.volta = 0;
    m.alvo = alvoNovo(largura, altura, caixa, rnd);
    eventos.push({ tipo: 'curaAcabou' });
  }
  // Antes de `ve` ele segue dançando, distraído (mas já imune).
  const cura = m.cura && agora >= m.cura.ve ? m.cura : null;

  if (cura && agora >= m.entraAte && !m.acao) {
    if (!cura.viu) {
      cura.viu = true;
      m.acao = null;
      m.ar = 0;
      eventos.push({ tipo: 'viu' });
    }
    if (!cura.chegou) {
      const dx = cura.x - m.x, dy = cura.y - m.y;
      const d = Math.hypot(dx, dy);
      if (Math.abs(dx) > 2) m.lado = dx >= 0 ? 1 : -1;
      if (agora < cura.corre) {
        // Viu: para, as garras para cima, encarando.
        m.vx = 0;
        m.vy = 0;
        if (m.passo !== PASSO_POR_ID.garras) { m.passo = PASSO_POR_ID.garras; m.qi = 0; }
      } else if (d <= BOTE_DIST || agora - cura.corre >= CORRE_ATE_MS) {
        // Perto (ou sem tempo de correr): o bote.
        cura.pulou = true;
        m.acao = { tipo: 'pulo', x0: m.x, y0: m.y, x1: cura.x, y1: cura.y, t0: agora, dur: BOTE_MS, altura: d < 20 ? 30 : BOTE_ALTURA };
        m.vx = 0;
        m.vy = 0;
        eventos.push({ tipo: 'bote' });
      } else {
        // Correndo até ela.
        if (m.passo !== CORRIDA) { m.passo = CORRIDA; m.qi = 0; m.volta = 0; }
        const k = 1 - Math.exp(-dt / SUAVE_MS);
        m.vx += ((dx / d) * CORRIDA.velocidade - m.vx) * k;
        m.vy += ((dy / d) * CORRIDA.velocidade - m.vy) * k;
        m.x += (m.vx * dt) / 1000;
        m.y += (m.vy * dt) / 1000;
      }
    } else {
      // Em cima dela: comendo, parado, olhando para ela.
      m.vx = 0;
      m.vy = 0;
      m.lado = cura.lado;
      cura.mordida += dt;
      while (cura.mordida >= MORDIDA_MS) { cura.mordida -= MORDIDA_MS; eventos.push({ tipo: 'mordida' }); }
    }
  } else if (agora >= m.entraAte && !acendendo(m, agora)) {
    if (m.acao) {
      const a = m.acao;
      const p = Math.min(1, (agora - a.t0) / a.dur);
      const e = a.tipo === 'pulo' ? p : 1 - (1 - p) ** 3;
      m.x = a.x0 + (a.x1 - a.x0) * e;
      m.y = a.y0 + (a.y1 - a.y0) * e;
      m.ar = Math.sin(Math.PI * p) * a.altura;
      if (p >= 1) {
        m.acao = null;
        m.ar = 0;
        if (a.altura > 0) {
          m.pousouEm = agora;
          eventos.push({ tipo: 'pousou', x: m.x, y: m.y });
        }
        if (m.cura?.pulou && !m.cura.chegou) {
          m.cura.chegou = true;
          m.lado = m.cura.lado;
          m.passo = BANQUETE;
          m.qi = 0;
          eventos.push({ tipo: 'chegouNaVitima' });
        }
      }
    } else {
      // A velocidade que o passo quer, e a inércia até ela.
      let qx = 0, qy = 0;
      const vel = m.passo.velocidade * (furia ? 1.5 : 1);
      if (m.passo.anda === 'frente' || m.passo.anda === 'tras') {
        const dx = m.alvo.x - m.x, dy = m.alvo.y - m.y;
        const d = Math.hypot(dx, dy);
        if (d < 8 && !m.fugindo) m.alvo = alvoNovo(largura, altura, caixa, rnd);
        else if (d > 0) {
          qx = (dx / d) * vel;
          qy = (dy / d) * vel * 0.7;
          const vai: 1 | -1 = dx >= 0 ? 1 : -1;
          // No moonwalk ele olha para o lado contrário de onde vai.
          if (Math.abs(dx) > 2) m.lado = m.passo.anda === 'frente' ? vai : (-vai as 1 | -1);
        }
      } else if (m.passo.anda === 'lado') {
        const n = m.passo.quadros.length;
        qx = (m.qi < n / 2 ? 1 : -1) * vel;
      }
      const k = 1 - Math.exp(-dt / SUAVE_MS);
      m.vx += (qx - m.vx) * k;
      m.vy += (qy - m.vy) * k;
      m.x += (m.vx * dt) / 1000;
      m.y += (m.vy * dt) / 1000;
    }
  }
  if (!m.fugindo) {
    m.x = Math.min(b.x1, Math.max(b.x0, m.x));
    m.y = Math.min(b.y1, Math.max(b.y0, m.y));
  }

  // Os quadros: na Fúria mais rápidos; machucado, mais lentos.
  if (!acendendo(m, agora)) {
    const ritmo = (furia ? FURIA_RITMO : 1) * RITMO_POR_ESTAGIO[estagio];
    const ms = m.passo.msPorQuadro * ritmo;
    m.acc += dt;
    while (m.acc >= ms) {
      m.acc -= ms;
      m.qi += 1;
      // O moonwalk troca de pé no meio e no fim: o «shh» do deslize.
      if (m.passo.anda === 'tras' && m.qi % (m.passo.quadros.length / 2) === 0) eventos.push({ tipo: 'pe' });
      if (m.qi >= m.passo.quadros.length) {
        m.qi = 0;
        m.volta += 1;
        const voltas = furia ? Math.max(1, Math.ceil(m.passo.voltas / 2)) : m.passo.voltas;
        if (m.volta >= voltas && !m.fugindo && !(m.cura && agora >= m.cura.ve)) {
          if (furia) {
            m.furiaPasso = (m.furiaPasso + 1) % PASSOS_DA_FURIA.length;
            m.passo = PASSO_POR_ID[PASSOS_DA_FURIA[m.furiaPasso]];
          } else {
            m.passo = proximoPasso(m.passo.id, rnd());
          }
          m.volta = 0;
          if (m.passo.anda !== 'parado' && m.passo.anda !== 'lado') m.alvo = alvoNovo(largura, altura, caixa, rnd);
          eventos.push({ tipo: 'passo', passo: m.passo });
        }
      }
    }
  }
  return eventos;
}

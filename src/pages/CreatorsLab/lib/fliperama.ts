/**
 * fliperama.ts — o jogo da máquina, sem React, sem canvas, sem relógio.
 * ─────────────────────────────────────────────────────────────────────────────
 * Um quebra-blocos. Tudo aqui é função pura: recebe estado + tempo decorrido +
 * o que a pessoa fez, devolve o estado seguinte. Quem desenha é
 * `sections/ArcadeCabinet.tsx`; quem conta o tempo é o `requestAnimationFrame`
 * de lá.
 *
 * ## Por que separado assim
 *
 * Física de jogo é onde bug se esconde: a bola atravessa o tijolo em um quadro
 * lento, a raquete devolve sempre no mesmo ângulo e a partida vira infinita, a
 * vitória cai antes de quebrar o último bloco. Nenhuma dessas coisas dá para
 * testar olhando a tela — mas todas dão para testar chamando `avancar` com os
 * números certos.
 *
 * ## Unidades
 *
 * O campo é fixo em 240×320 "pixels de jogo". O canvas desenha nessa resolução
 * e o CSS estica com `image-rendering: pixelated`, então o jogo se comporta
 * igual em qualquer tela — de 320 px a 4K — e ganha a serrilha certa de graça.
 *
 * Velocidade em pixels de jogo por SEGUNDO. `avancar` recebe `dt` em segundos.
 */

export const LARGURA = 240;
export const ALTURA  = 320;

export const RAIO_BOLA        = 3;
export const LARGURA_RAQUETE  = 46;
export const ALTURA_RAQUETE   = 6;
export const Y_RAQUETE        = ALTURA - 22;

export const VIDAS_INICIAIS = 3;

export const COLUNAS         = 8;
export const LINHAS          = 5;
export const MARGEM_X        = 8;
export const TOPO_TIJOLOS    = 40;
export const ALTURA_TIJOLO   = 12;
export const ESPACO          = 2;
export const LARGURA_TIJOLO  =
  (LARGURA - MARGEM_X * 2 - ESPACO * (COLUNAS - 1)) / COLUNAS;

/** Velocidade da bola no saque e o teto que ela nunca passa. */
export const VELOCIDADE_BASE = 108;
export const VELOCIDADE_MAX  = 216;
/** Quanto a bola acelera a cada rebatida na raquete. */
export const ACELERACAO_POR_REBATIDA = 5;

/**
 * Teto do passo de integração.
 *
 * Sem isto, uma aba que ficou 4 segundos em segundo plano volta com `dt = 4` e
 * a bola anda 800 px de uma vez — atravessa a parede, o tijolo e o chão sem
 * tocar em nada. Com o teto, o pior caso é um quadro lento, não um jogo
 * quebrado.
 */
export const DT_MAX = 1 / 30;

/** Pontos por linha: a de cima vale mais, como manda a tradição. */
export function pontosDaLinha(linha: number): number {
  return (LINHAS - linha) * 10;
}

export interface Tijolo {
  x: number; y: number;
  l: number; a: number;
  linha: number;
  vivo: boolean;
}

export interface Bola { x: number; y: number; vx: number; vy: number }

export type FaseJogo =
  | 'pronto'    // bola presa na raquete, esperando o saque
  | 'jogando'
  | 'fim'       // acabaram as vidas
  | 'venceu';   // limpou o campo

export interface EstadoJogo {
  fase: FaseJogo;
  bola: Bola;
  /** Centro da raquete no eixo X. */
  raqueteX: number;
  tijolos: Tijolo[];
  vidas: number;
  pontos: number;
  /** Rebatidas na raquete desde o começo da partida — é o que acelera a bola. */
  rebatidas: number;
  recorde: number;
}

export interface Entrada {
  /** Para onde a raquete deve ir, em pixels de jogo. */
  alvoRaquete?: number;
  /** Soltar a bola, ou recomeçar depois do fim. */
  acionar?: boolean;
}

export function montarTijolos(): Tijolo[] {
  const tijolos: Tijolo[] = [];
  for (let linha = 0; linha < LINHAS; linha++) {
    for (let col = 0; col < COLUNAS; col++) {
      tijolos.push({
        x: MARGEM_X + col * (LARGURA_TIJOLO + ESPACO),
        y: TOPO_TIJOLOS + linha * (ALTURA_TIJOLO + ESPACO),
        l: LARGURA_TIJOLO,
        a: ALTURA_TIJOLO,
        linha,
        vivo: true,
      });
    }
  }
  return tijolos;
}

/** Bola encostada na raquete, parada, pronta para o saque. */
function bolaNaRaquete(raqueteX: number): Bola {
  return { x: raqueteX, y: Y_RAQUETE - RAIO_BOLA - 1, vx: 0, vy: 0 };
}

export function novoJogo(recorde = 0): EstadoJogo {
  const raqueteX = LARGURA / 2;
  return {
    fase: 'pronto',
    bola: bolaNaRaquete(raqueteX),
    raqueteX,
    tijolos: montarTijolos(),
    vidas: VIDAS_INICIAIS,
    pontos: 0,
    rebatidas: 0,
    recorde,
  };
}

export function limitar(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/** A velocidade escalar atual, em função das rebatidas já dadas. */
export function velocidadeAtual(rebatidas: number): number {
  return Math.min(VELOCIDADE_BASE + rebatidas * ACELERACAO_POR_REBATIDA, VELOCIDADE_MAX);
}

/**
 * Saque: sempre para cima, com uma inclinação pequena para o lado.
 *
 * O sinal alterna com o número de rebatidas em vez de sortear: partida
 * reproduzível é partida testável, e ninguém percebe a diferença jogando.
 */
function sacar(estado: EstadoJogo): Bola {
  const v = velocidadeAtual(estado.rebatidas);
  const paraDireita = estado.rebatidas % 2 === 0;
  return {
    x: estado.raqueteX,
    y: Y_RAQUETE - RAIO_BOLA - 1,
    vx: (paraDireita ? 1 : -1) * v * 0.45,
    vy: -v * 0.89,
  };
}

/** Abertura máxima da devolução, medida a partir da vertical. */
export const ANGULO_MAX = Math.PI / 3;      // 60°

/**
 * Abertura MÍNIMA da devolução.
 *
 * Existe por causa de um empate que a simulação encontrou e o olho não
 * encontraria tão cedo: com a raquete exatamente sob a bola, o desvio é zero,
 * a devolução é perfeitamente vertical, e a bola passa a subir e descer na
 * mesma coluna para sempre. Ela limpa aquela coluna, bate no teto, volta ao
 * centro da raquete, sobe de novo — e a partida nunca acaba, porque nada mais
 * é tocado.
 *
 * Não é caso de laboratório: quem joga com o mouse acompanhando a bola cai
 * nesse estado sem querer. Dez graus de abertura mínima bastam para a bola
 * sempre acabar cruzando o campo, e são poucos o bastante para ninguém sentir
 * que a raquete "desobedeceu".
 */
export const ANGULO_MIN = Math.PI / 18;     // 10°

/**
 * Ângulo de devolução da raquete.
 *
 * Onde bateu decide para onde vai: perto do meio sobe quase reto, na ponta sai
 * quase deitada. É isso que transforma "esperar a bola" em "posicionar a
 * raquete", e é o que separa o jogo de um salva-tela.
 *
 * `vxAtual` só serve para desempatar a batida bem no centro: a bola continua
 * indo para o lado em que já ia, em vez de escolher um lado do nada.
 */
export function devolverDaRaquete(
  bolaX: number, raqueteX: number, velocidade: number, vxAtual = 0,
): { vx: number; vy: number } {
  const desvio = limitar((bolaX - raqueteX) / (LARGURA_RAQUETE / 2), -1, 1);
  const bruto  = desvio * ANGULO_MAX;

  // Para que lado, quando a batida foi no centro exato dos dois.
  const lado = bruto !== 0 ? Math.sign(bruto) : (vxAtual !== 0 ? Math.sign(vxAtual) : 1);
  const angulo = Math.abs(bruto) < ANGULO_MIN ? lado * ANGULO_MIN : bruto;

  return {
    vx:  Math.sin(angulo) * velocidade,
    vy: -Math.cos(angulo) * velocidade,
  };
}

/** Quantos tijolos ainda de pé. */
export function tijolosVivos(tijolos: Tijolo[]): number {
  return tijolos.reduce((n, t) => n + (t.vivo ? 1 : 0), 0);
}

/**
 * A bola encosta neste tijolo?
 *
 * Círculo contra retângulo pelo ponto mais próximo — mais barato que a conta
 * exata e, num campo com tijolos encostados, indistinguível dela.
 */
function encosta(b: Bola, t: Tijolo): boolean {
  const px = limitar(b.x, t.x, t.x + t.l);
  const py = limitar(b.y, t.y, t.y + t.a);
  const dx = b.x - px;
  const dy = b.y - py;
  return dx * dx + dy * dy <= RAIO_BOLA * RAIO_BOLA;
}

/**
 * Por qual lado a bola entrou no tijolo.
 *
 * Compara o quanto ela penetrou em cada eixo: quem penetrou menos é o lado por
 * onde ela entrou, e é esse eixo que inverte. Sem isso, uma bola que raspa a
 * lateral do tijolo é devolvida para cima e some pelo teto.
 */
export function eixoDoImpacto(b: Bola, t: Tijolo): 'x' | 'y' {
  const penX = Math.min(
    Math.abs(b.x + RAIO_BOLA - t.x),
    Math.abs(t.x + t.l - (b.x - RAIO_BOLA)),
  );
  const penY = Math.min(
    Math.abs(b.y + RAIO_BOLA - t.y),
    Math.abs(t.y + t.a - (b.y - RAIO_BOLA)),
  );
  return penX < penY ? 'x' : 'y';
}

/**
 * Um passo do jogo.
 *
 * `dt` em segundos, limitado por `DT_MAX`. Nada aqui lê relógio, sorteia ou
 * escreve fora do estado devolvido.
 */
export function avancar(estado: EstadoJogo, dt: number, entrada: Entrada = {}): EstadoJogo {
  const passo = limitar(dt, 0, DT_MAX);

  // A raquete responde mesmo com o jogo parado — dá para se posicionar antes
  // do saque, e a bola parada acompanha.
  const raqueteX = entrada.alvoRaquete === undefined
    ? estado.raqueteX
    : limitar(entrada.alvoRaquete, LARGURA_RAQUETE / 2, LARGURA - LARGURA_RAQUETE / 2);

  if (estado.fase === 'fim' || estado.fase === 'venceu') {
    if (entrada.acionar) return novoJogo(Math.max(estado.recorde, estado.pontos));
    return { ...estado, raqueteX };
  }

  if (estado.fase === 'pronto') {
    if (entrada.acionar) {
      return { ...estado, raqueteX, fase: 'jogando', bola: sacar({ ...estado, raqueteX }) };
    }
    return { ...estado, raqueteX, bola: bolaNaRaquete(raqueteX) };
  }

  // ── A partir daqui: jogando ──────────────────────────────────────────────
  let { x, y, vx, vy } = estado.bola;
  let pontos    = estado.pontos;
  let rebatidas = estado.rebatidas;
  let tijolos   = estado.tijolos;

  x += vx * passo;
  y += vy * passo;

  // Paredes laterais e teto. Reposiciona além de inverter: uma bola que parou
  // dentro da parede inverteria toda vez e ficaria tremendo lá dentro.
  if (x < RAIO_BOLA)            { x = RAIO_BOLA;            vx = Math.abs(vx); }
  if (x > LARGURA - RAIO_BOLA)  { x = LARGURA - RAIO_BOLA;  vx = -Math.abs(vx); }
  if (y < RAIO_BOLA)            { y = RAIO_BOLA;            vy = Math.abs(vy); }

  // Tijolos: no máximo um por quadro. Dois tijolos no mesmo passo inverteriam
  // o mesmo eixo duas vezes e a bola sairia seguindo em frente.
  for (let i = 0; i < tijolos.length; i++) {
    const t = tijolos[i];
    if (!t.vivo || !encosta({ x, y, vx, vy }, t)) continue;

    if (eixoDoImpacto({ x, y, vx, vy }, t) === 'x') vx = -vx;
    else                                            vy = -vy;

    tijolos = tijolos.map((o, j) => (j === i ? { ...o, vivo: false } : o));
    pontos += pontosDaLinha(t.linha);
    break;
  }

  // Raquete. Só conta descendo: subindo, a bola já passou e voltar seria
  // prendê-la dentro da raquete.
  const topoRaquete = Y_RAQUETE;
  const dentroDaFaixa = y + RAIO_BOLA >= topoRaquete && y - RAIO_BOLA <= topoRaquete + ALTURA_RAQUETE;
  const dentroDaLargura = Math.abs(x - raqueteX) <= LARGURA_RAQUETE / 2 + RAIO_BOLA;

  if (vy > 0 && dentroDaFaixa && dentroDaLargura) {
    rebatidas += 1;
    const devolvida = devolverDaRaquete(x, raqueteX, velocidadeAtual(rebatidas), vx);
    vx = devolvida.vx;
    vy = devolvida.vy;
    y  = topoRaquete - RAIO_BOLA - 0.5;
  }

  // Limpou o campo.
  if (tijolosVivos(tijolos) === 0) {
    return {
      ...estado, raqueteX, tijolos, pontos, rebatidas,
      bola: { x, y, vx, vy },
      fase: 'venceu',
      recorde: Math.max(estado.recorde, pontos),
    };
  }

  // Caiu.
  if (y - RAIO_BOLA > ALTURA) {
    const vidas = estado.vidas - 1;
    if (vidas <= 0) {
      return {
        ...estado, raqueteX, tijolos, pontos, rebatidas, vidas: 0,
        bola: bolaNaRaquete(raqueteX),
        fase: 'fim',
        recorde: Math.max(estado.recorde, pontos),
      };
    }
    return {
      ...estado, raqueteX, tijolos, pontos, vidas,
      // Perder uma vida devolve a velocidade ao saque: a bola não continua
      // rápida de uma vida que já acabou.
      rebatidas: 0,
      bola: bolaNaRaquete(raqueteX),
      fase: 'pronto',
    };
  }

  return {
    ...estado, raqueteX, tijolos, pontos, rebatidas,
    bola: { x, y, vx, vy },
    fase: 'jogando',
  };
}

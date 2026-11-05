/**
 * A física da cesta de Natal — a brincadeira da bola da saudação (Cleber,
 * 05/11/2026). Funções puras, para testar sem tela.
 *
 * A cesta é vista de FRENTE: o aro é uma linha com duas pontas, e só as
 * pontas batem na bola (o meio é o buraco). Vale cesta quando a bola, solta,
 * cruza a linha do aro de cima para baixo por dentro das pontas.
 *
 * O que NÃO vale (pedido do Cleber: «não conta ficar segurando a bola e
 * passando ela entre o aro sem soltar»):
 *   - passar segurando: quem chama só confere com a bola solta;
 *   - largar a bola logo em cima do aro (`largouDeLonge`);
 *   - subir pelo buraco por baixo e cair de volta (`subiuPeloAro` anula o
 *     arremesso: a rede não deixaria).
 * E um arremesso vale uma cesta só: depois de contar, só um novo lançamento.
 */

export interface Paredes { esq: number; dir: number; cima: number; baixo: number }
/** O centro do aro na tela, a meia abertura (até o meio de cada ponta) e o raio da ponta. */
export interface Aro { x: number; y: number; meia: number; ponta: number }
export interface Corpo { x: number; y: number; vx: number; vy: number }

/*
 * Jogabilidade (Cleber, 05/11/2026: «tá mais difícil do que parece»): aro um
 * pouco mais largo, pontas que devolvem menos (a bola que bate no aro tende a
 * cair, não a voar longe), uma ajuda de mira bem de leve perto do aro e a
 * rede que segura a bola quando ela passa.
 */
export const MEIA_ABERTURA = 44;
export const RAIO_DA_PONTA = 3.5;
/** O aro é «amigo»: devolve menos que a parede. */
export const QUIQUE_NO_ARO = 0.4;
/** A ajuda de mira: até onde ela alcança acima do aro e para os lados, e a força. */
export const AJUDA = { altura: 110, lado: 26, forca: 16 };
/** A fundura da rede (do aro para baixo). */
export const FUNDO_DA_REDE = 58;
/** Em cima do aro, colado nele: soltar aqui é largar dentro, não arremessar. */
export const ZONA_DE_LARGAR = { lado: 62, altura: 120 };

/** Onde a cesta fica: à direita da área do conteúdo, um pouco acima do meio. */
export function posicaoDoAro(p: Paredes): Aro {
  const largura = p.dir - p.esq;
  const altura = p.baixo - p.cima;
  const x = p.dir - Math.max(100, Math.min(190, largura * 0.14));
  // A tabela sobe ~130 px acima do aro: não deixa ela sair por cima.
  const y = p.cima + Math.max(175, Math.min(altura * 0.45, altura - 150));
  return { x, y, meia: MEIA_ABERTURA, ponta: RAIO_DA_PONTA };
}

/**
 * A bola contra uma ponta do aro (um círculo pequeno). Tira a bola de dentro
 * e rebate a velocidade na direção da batida. Devolve a força da batida
 * (px/s, zero se não bateu ou se já estava se afastando).
 */
export function baterNaPonta(c: Corpo, px: number, py: number, raio: number, ponta: number, quique = QUIQUE_NO_ARO): number {
  const dx = c.x - px, dy = c.y - py;
  const d = Math.hypot(dx, dy), encosta = raio + ponta;
  if (d >= encosta) return 0;
  // Bem em cima da ponta: empurra para cima.
  const nx = d > 1e-6 ? dx / d : 0, ny = d > 1e-6 ? dy / d : -1;
  c.x = px + nx * encosta;
  c.y = py + ny * encosta;
  const vn = c.vx * nx + c.vy * ny;
  if (vn >= 0) return 0;
  c.vx -= (1 + quique) * vn * nx;
  c.vy -= (1 + quique) * vn * ny;
  return -vn;
}

const dentroDasPontas = (x: number, aro: Aro) => Math.abs(x - aro.x) < aro.meia - aro.ponta;

/**
 * A ajuda de mira: a bola descendo logo acima do aro é puxada de leve para o
 * meio. Só perto e só descendo — de longe, a mira é de quem arremessou.
 */
export function ajudarNaMira(c: Corpo, aro: Aro, dt: number) {
  const dx = aro.x - c.x;
  if (c.vy <= 0 || c.y >= aro.y || c.y < aro.y - AJUDA.altura || Math.abs(dx) > aro.meia + AJUDA.lado) return;
  c.vx += dx * AJUDA.forca * dt;
}

/** Dentro da rede, a bola perde o embalo e vai para o meio (o «chuá»). */
export function frearNaRede(c: Corpo, aro: Aro, dt: number) {
  if (c.y <= aro.y || c.y > aro.y + FUNDO_DA_REDE || Math.abs(c.x - aro.x) > aro.meia) return;
  c.vx = c.vx * Math.exp(-8 * dt) + (aro.x - c.x) * 10 * dt;
  if (c.vy > 520) c.vy = 520;
}

/** Cruzou a linha do aro descendo, por dentro das pontas. */
export function passouPeloAro(yAntes: number, c: Corpo, aro: Aro): boolean {
  return c.vy > 0 && yAntes < aro.y && c.y >= aro.y && dentroDasPontas(c.x, aro);
}

/** Cruzou a linha do aro subindo, por dentro (entrou pela rede, por baixo). */
export function subiuPeloAro(yAntes: number, c: Corpo, aro: Aro): boolean {
  return c.vy < 0 && yAntes > aro.y && c.y <= aro.y && dentroDasPontas(c.x, aro);
}

/** Por onde o mouse passou (tela, `performance.now()`), para medir o arremesso. */
export interface Amostra { x: number; y: number; t: number }
/** O arremesso mede só o fim do gesto: o que o mouse fez nesses últimos ms antes do último movimento. */
export const JANELA_DO_ARREMESSO_MS = 80;
/** Sem mexer o mouse por mais que isso antes de soltar: é largar, não arremessar. */
export const PARADO_MS = 100;

/**
 * A velocidade com que a bola sai da mão: a do mouse no fim do gesto, com o
 * teto aplicado no TAMANHO (a direção do gesto não muda). Mouse parado antes
 * de soltar = a bola só cai.
 *
 * A janela conta a partir do ÚLTIMO movimento, não do soltar, e sempre pega
 * pelo menos o último trecho: num computador lento os eventos do mouse chegam
 * espaçados, e a janela contada do soltar ficava vazia (a bola saía parada).
 */
export function velocidadeDoArremesso(amostras: readonly Amostra[], agora: number, teto: number): { vx: number; vy: number } {
  const n = amostras.length;
  if (n < 2) return { vx: 0, vy: 0 };
  const ate = amostras[n - 1];
  if (agora - ate.t > PARADO_MS) return { vx: 0, vy: 0 };
  let i = n - 2;
  while (i > 0 && ate.t - amostras[i - 1].t <= JANELA_DO_ARREMESSO_MS) i--;
  const de = amostras[i];
  const dt = Math.max(0.016, (ate.t - de.t) / 1000);
  let vx = (ate.x - de.x) / dt, vy = (ate.y - de.y) / dt;
  const v = Math.hypot(vx, vy);
  if (v > teto) { vx *= teto / v; vy *= teto / v; }
  return { vx, vy };
}

/** Soltou longe do aro (ou abaixo dele)? Se soltou colado em cima, não vale. */
export function largouDeLonge(x: number, y: number, aro: Aro): boolean {
  const emCima = Math.abs(x - aro.x) < ZONA_DE_LARGAR.lado && y < aro.y && y > aro.y - ZONA_DE_LARGAR.altura;
  return !emCima;
}

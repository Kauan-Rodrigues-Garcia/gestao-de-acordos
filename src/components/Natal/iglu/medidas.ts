/** As medidas do iglu e do lugar do urso no lago (px do desenho, `LARGURA` × `ALTURA` em `IgluDoUrso`). */
export const CHAO = 126;
/** O lago e a plaquinha foram desenhados com o chão em 92 e descem até o chão de agora. */
export const DESCE = CHAO - 92;
/** Onde o urso senta (na beira do lago) e onde fica a porta. */
export const X_SENTADO = 104;
export const X_PORTA = 163;
/** O buraco no gelo, onde vai a boia. */
export const BURACO = { x: 76, y: 89.6 + DESCE };

/** Um brilhinho de quatro pontas. */
export const ESTRELINHA = 'M0 -3.2 L0.8 -0.8 L3.2 0 L0.8 0.8 L0 3.2 L-0.8 0.8 L-3.2 0 L-0.8 -0.8 Z';

export const limitar = (v: number) => Math.max(0, Math.min(1, v));
export const suave = (t: number) => t * t * (3 - 2 * t);

/**
 * coracoes.ts — a barra de vida da chefona em CORAÇÕES (pedido do Kauan,
 * 15/10/2026: «em corações como no Minecraft, porém adaptado pois é um boss»).
 *
 * Os corações são os do jogo (`texturasMC.ts`), no estilo do modo hardcore, o
 * de quem não tem segunda chance: o de chefe. A adaptação é a escala: uma
 * pessoa tem 10 corações; ela tem `TOTAL` (uma fileira de 20 — eram duas até
 * 16/10/2026, o Cleber pediu uma só e menor), e cada coração é uma fração da
 * vida máxima (com 3.000 de vida, cada um vale 150).
 *
 * Como no jogo:
 *
 *   - apanhou, os corações PISCAM (a borda branca) um instante;
 *   - com pouca vida (`TREME_ABAIXO`), eles TREMEM;
 *   - na Regeneração do totem, um coração por vez dá um pulinho, em onda;
 *   - a Absorção vira corações DOURADOS, numa fileira por cima;
 *   - a Poção de Cura que ela está bebendo aparece como corações rosados à
 *     frente da vida (o que ela vai ganhar no último gole);
 *   - na FÚRIA, os corações pulsam entre o vermelho e o seco (o do Wither).
 *
 * Aqui só as contas (puras, testadas sem navegador). O desenho é do palco.
 */

/** Corações por fileira, e quantos ela tem ao todo. */
export const POR_FILEIRA = 20;
export const TOTAL = 20;
/** O passo entre um coração e outro (px da textura), e o tamanho de um. */
export const PASSO = 8;
export const LADO = 9;
/** O passo entre fileiras (px da textura). */
export const PASSO_FILEIRA = 10;
/** Abaixo desta fração da vida, os corações tremem. */
export const TREME_ABAIXO = 0.2;

export type Coracao = 'cheio' | 'metade' | 'vazio' | 'cura' | 'cura-metade';

/**
 * Os `TOTAL` corações da vida, da esquerda para a direita. Cada coração é duas
 * metades; vida acima de zero mostra pelo menos meio (como no jogo, que
 * arredonda para cima). A cura a caminho pinta os vazios logo depois da vida.
 */
export function coracoesDaVida(vida: number, vidaMax: number, cura = 0): Coracao[] {
  const max = Math.max(1, vidaMax);
  const metades = vida <= 0 ? 0 : Math.min(TOTAL * 2, Math.ceil((vida / max) * TOTAL * 2));
  const comCura = cura <= 0 ? metades : Math.min(TOTAL * 2, Math.ceil(((vida + cura) / max) * TOTAL * 2));
  return Array.from({ length: TOTAL }, (_, i) => {
    const a = i * 2;
    if (a + 2 <= metades) return 'cheio';
    if (a + 1 === metades) return 'metade';
    if (a + 2 <= comCura) return 'cura';
    if (a + 1 === comCura) return 'cura-metade';
    return 'vazio';
  });
}

/** Os corações dourados da Absorção (na mesma régua da vida), no máximo uma fileira. */
export function coracoesDeOuro(absorcao: number, vidaMax: number): ('cheio' | 'metade')[] {
  if (absorcao <= 0) return [];
  const metades = Math.min(POR_FILEIRA * 2, Math.ceil((absorcao / Math.max(1, vidaMax)) * TOTAL * 2));
  return Array.from({ length: Math.ceil(metades / 2) }, (_, i) => (i * 2 + 2 <= metades ? 'cheio' : 'metade'));
}

/** Onde fica o coração `i` (px da textura), com a fileira de ouro por cima quando há. */
export function posicaoDoCoracao(i: number, comOuro: boolean): { x: number; y: number } {
  return { x: (i % POR_FILEIRA) * PASSO, y: (Math.floor(i / POR_FILEIRA) + (comOuro ? 1 : 0)) * PASSO_FILEIRA };
}

/** O tamanho do desenho todo (px da textura). */
export function tamanhoDosCoracoes(comOuro: boolean): { largura: number; altura: number } {
  const fileiras = TOTAL / POR_FILEIRA + (comOuro ? 1 : 0);
  return { largura: (POR_FILEIRA - 1) * PASSO + LADO, altura: (fileiras - 1) * PASSO_FILEIRA + LADO };
}

/** Qual coração dá o pulinho da Regeneração agora (uma onda que corre pela barra), ou −1. */
export function pulinhoDaRegeneracao(segundos: number, regenerando: boolean): number {
  return regenerando ? Math.floor(segundos * 18) % TOTAL : -1;
}

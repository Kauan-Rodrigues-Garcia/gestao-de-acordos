/**
 * Onde o fantasma espia: por cima, por baixo ou por um dos lados de uma
 * tabela, num ponto sorteado — mas só entre os que o usuário está vendo.
 *
 * Função pura, em coordenadas da janela (as de `getBoundingClientRect`), para
 * dar para testar sem DOM. Quem chama converte para a camada que rola.
 */

export type Lado = 'cima' | 'baixo' | 'esq' | 'dir';
export interface Caixa { left: number; top: number; right: number; bottom: number }
export interface Esconderijo { lado: Lado; left: number; top: number; largura: number; altura: number }

/** Tamanho do fantasma na escala 1. */
export const FANTASMA = { largura: 40, altura: 46 };
const FOLGA = 6;

export function tamanhoDoEsconderijo(lado: Lado, escala: number) {
  const w = FANTASMA.largura * escala, h = FANTASMA.altura * escala;
  return lado === 'cima' || lado === 'baixo'
    ? { largura: w + 8, altura: h + 18 }
    : { largura: w + 18, altura: h + 6 };
}

/**
 * Sorteia tabela, lado e ponto. `null` quando nenhuma tabela visível tem uma
 * borda com espaço para o fantasma aparecer inteiro na tela.
 */
export function sortearEsconderijo(tabelas: Caixa[], tela: Caixa, escala: number, acaso: () => number = Math.random): Esconderijo | null {
  type Opcao = { lado: Lado; de: number; ate: number; fixo: number };
  const opcoes: Opcao[] = [];
  for (const r of tabelas) {
    if (r.right - r.left < 120) continue;
    // Faixa da borda que está dentro da tela
    const xDe = Math.max(r.left, tela.left), xAte = Math.min(r.right, tela.right);
    const yDe = Math.max(r.top, tela.top), yAte = Math.min(r.bottom, tela.bottom);
    if (xAte <= xDe || yAte <= yDe) continue; // tabela fora da tela

    const v = tamanhoDoEsconderijo('cima', escala);
    const xMin = xDe + FOLGA, xMax = xAte - v.largura - FOLGA;
    if (xMax > xMin) {
      if (r.top - v.altura >= tela.top + FOLGA && r.top <= tela.bottom - FOLGA) opcoes.push({ lado: 'cima', de: xMin, ate: xMax, fixo: r.top - v.altura });
      if (r.bottom >= tela.top + FOLGA && r.bottom + v.altura <= tela.bottom - FOLGA) opcoes.push({ lado: 'baixo', de: xMin, ate: xMax, fixo: r.bottom });
    }

    const l = tamanhoDoEsconderijo('esq', escala);
    const yMin = yDe + FOLGA, yMax = yAte - l.altura - FOLGA;
    // De lado só aparece a parte que passa da borda: precisa de espaço para ela
    const espaco = FANTASMA.largura * escala * 0.85;
    if (yMax > yMin) {
      if (r.left - tela.left >= espaco) opcoes.push({ lado: 'esq', de: yMin, ate: yMax, fixo: r.left - l.largura });
      if (tela.right - r.right >= espaco) opcoes.push({ lado: 'dir', de: yMin, ate: yMax, fixo: r.right });
    }
  }
  if (!opcoes.length) return null;
  const o = opcoes[Math.min(opcoes.length - 1, Math.floor(acaso() * opcoes.length))];
  const ponto = o.de + acaso() * (o.ate - o.de);
  const { largura, altura } = tamanhoDoEsconderijo(o.lado, escala);
  return o.lado === 'cima' || o.lado === 'baixo'
    ? { lado: o.lado, left: ponto, top: o.fixo, largura, altura }
    : { lado: o.lado, left: o.fixo, top: ponto, largura, altura };
}

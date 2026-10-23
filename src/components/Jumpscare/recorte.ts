/**
 * recorte.ts — a conta do editor de recorte do jumpscare (23/10/2026).
 *
 * A moldura tem o formato da tela; a imagem fica por baixo, sempre cobrindo a
 * moldura inteira (nunca sobra faixa vazia). Arrastar move a imagem, o zoom
 * amplia em torno do centro da moldura. O que está na moldura é o que vai para
 * a tela de todo mundo: o recorte é gravado como uma imagem nova.
 *
 * Tudo em px da moldura, com `x, y` = canto superior esquerdo da imagem
 * relativo à moldura (≤ 0).
 */

export interface Medidas {
  /** Moldura, em px na tela do editor. */
  molduraL: number; molduraA: number;
  /** Imagem original, em px. */
  imagemL: number; imagemA: number;
}

export interface Posicao { x: number; y: number; zoom: number }

export const ZOOM_MIN = 1;
export const ZOOM_MAX = 5;

/** A escala em que a imagem cobre a moldura exata (zoom 1). */
export function escalaBase(m: Medidas): number {
  return Math.max(m.molduraL / m.imagemL, m.molduraA / m.imagemA);
}

/** Prende a posição: zoom na faixa e imagem sempre cobrindo a moldura. */
export function limitar(m: Medidas, p: Posicao): Posicao {
  const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number.isFinite(p.zoom) ? p.zoom : 1));
  const s = escalaBase(m) * zoom;
  const minX = m.molduraL - m.imagemL * s;
  const minY = m.molduraA - m.imagemA * s;
  return {
    zoom,
    x: Math.min(0, Math.max(minX, Number.isFinite(p.x) ? p.x : 0)),
    y: Math.min(0, Math.max(minY, Number.isFinite(p.y) ? p.y : 0)),
  };
}

/** A imagem centrada na moldura, sem zoom. */
export function centrado(m: Medidas): Posicao {
  const s = escalaBase(m);
  return limitar(m, {
    zoom: 1,
    x: (m.molduraL - m.imagemL * s) / 2,
    y: (m.molduraA - m.imagemA * s) / 2,
  });
}

/** Troca o zoom mantendo parado o ponto da imagem que está no centro da moldura. */
export function zoomNoCentro(m: Medidas, p: Posicao, novoZoom: number): Posicao {
  const sAntes = escalaBase(m) * p.zoom;
  const cx = (m.molduraL / 2 - p.x) / sAntes;
  const cy = (m.molduraA / 2 - p.y) / sAntes;
  const z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, novoZoom));
  const sDepois = escalaBase(m) * z;
  return limitar(m, { zoom: z, x: m.molduraL / 2 - cx * sDepois, y: m.molduraA / 2 - cy * sDepois });
}

/** O pedaço da imagem original (em px dela) que está dentro da moldura. */
export function areaDoRecorte(m: Medidas, p: Posicao): { sx: number; sy: number; sl: number; sa: number } {
  const s = escalaBase(m) * p.zoom;
  return { sx: -p.x / s, sy: -p.y / s, sl: m.molduraL / s, sa: m.molduraA / s };
}

/** Largura máxima da imagem gravada: tela cheia comum, sem passar de 2 MB. */
export const LARGURA_SAIDA_MAX = 1920;

/** O tamanho da imagem gravada: o do recorte, nunca ampliado, até 1920 de largura. */
export function tamanhoDaSaida(sl: number, proporcao: number): { l: number; a: number } {
  const l = Math.max(1, Math.round(Math.min(LARGURA_SAIDA_MAX, sl)));
  return { l, a: Math.max(1, Math.round(l / proporcao)) };
}

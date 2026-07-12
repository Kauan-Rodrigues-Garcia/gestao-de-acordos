/**
 * Pré-processa um frame capturado para melhorar a leitura do OCR.
 *
 * - Faz upscale (texto de UI costuma ser pequeno para o Tesseract).
 * - Converte para tons de cinza com leve aumento de contraste.
 *
 * Evita binarização agressiva (threshold puro), que pode apagar texto
 * com anti-aliasing dependendo do tema do ERP.
 */
export function preprocessarParaOcr(
  src: HTMLCanvasElement,
  escala = 2,
): HTMLCanvasElement {
  const largura = Math.round(src.width * escala);
  const altura = Math.round(src.height * escala);

  const out = document.createElement('canvas');
  out.width = largura;
  out.height = altura;

  const ctx = out.getContext('2d');
  if (!ctx) return src;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, largura, altura);

  const img = ctx.getImageData(0, 0, largura, altura);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const cinza = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
    // aumento de contraste em torno do meio-tom (128)
    const contraste = Math.min(255, Math.max(0, (cinza - 128) * 1.25 + 128));
    d[i] = contraste;
    d[i + 1] = contraste;
    d[i + 2] = contraste;
  }
  ctx.putImageData(img, 0, 0);

  return out;
}

/** Calcula o limiar de Otsu a partir de um histograma de 256 níveis. */
function limiarOtsu(hist: number[], total: number): number {
  let soma = 0;
  for (let i = 0; i < 256; i++) soma += i * hist[i];
  let somaB = 0, pesoB = 0, varMax = 0, limiar = 127;
  for (let t = 0; t < 256; t++) {
    pesoB += hist[t];
    if (pesoB === 0) continue;
    const pesoF = total - pesoB;
    if (pesoF === 0) break;
    somaB += t * hist[t];
    const mediaB = somaB / pesoB;
    const mediaF = (soma - somaB) / pesoF;
    const entre = pesoB * pesoF * (mediaB - mediaF) * (mediaB - mediaF);
    if (entre > varMax) { varMax = entre; limiar = t; }
  }
  return limiar;
}

/**
 * Escala adaptativa: o Tesseract lê melhor com texto "grande" (~300dpi).
 * Prints de UI vêm em ~96dpi, então ampliamos mais quando a imagem é pequena.
 */
function escalaAdaptativa(largura: number): number {
  if (largura < 900) return 3;
  if (largura < 1500) return 2.5;
  if (largura < 2200) return 2;
  return 1.5;
}

export type ModoPreprocess = 'binarizar' | 'contraste';

/**
 * Pré-processamento FORTE para leitura de acordos (prints do sistema e
 * planilhas). Comparado ao `preprocessarParaOcr`:
 *  - upscale adaptativo (até 3x) — texto pequeno de tabela fica legível;
 *  - normaliza tema escuro (texto claro em fundo escuro → inverte p/ preto no branco);
 *  - `binarizar`: limiar de Otsu (texto nítido, ótimo p/ tabelas);
 *  - `contraste`: realce forte sem binarizar (bom p/ texto anti-aliased).
 *
 * Rodamos as duas variantes e escolhemos a que extrai mais campos (multipass).
 */
export function preprocessarParaOcrForte(
  src: HTMLCanvasElement,
  modo: ModoPreprocess = 'binarizar',
): HTMLCanvasElement {
  const escala = escalaAdaptativa(src.width);
  const largura = Math.round(src.width * escala);
  const altura = Math.round(src.height * escala);

  const out = document.createElement('canvas');
  out.width = largura;
  out.height = altura;
  const ctx = out.getContext('2d');
  if (!ctx) return src;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, largura, altura);

  const img = ctx.getImageData(0, 0, largura, altura);
  const d = img.data;
  const n = largura * altura;

  // 1) Escala de cinza + histograma + média de luminância
  const cinza = new Uint8ClampedArray(n);
  const hist = new Array(256).fill(0);
  let somaLum = 0;
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const g = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
    cinza[p] = g;
    hist[g]++;
    somaLum += g;
  }

  // 2) Tema escuro? (fundo predominante escuro) → inverte p/ texto preto no branco
  const inverter = somaLum / n < 115;
  if (inverter) {
    for (let p = 0; p < n; p++) cinza[p] = 255 - cinza[p];
    // recalcula histograma invertido
    hist.fill(0);
    for (let p = 0; p < n; p++) hist[cinza[p]]++;
  }

  if (modo === 'binarizar') {
    const limiar = limiarOtsu(hist, n);
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      const v = cinza[p] > limiar ? 255 : 0;
      d[i] = d[i + 1] = d[i + 2] = v;
    }
  } else {
    // Realce de contraste forte em torno do meio-tom
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      const v = Math.min(255, Math.max(0, (cinza[p] - 128) * 1.7 + 128));
      d[i] = d[i + 1] = d[i + 2] = v;
    }
  }

  ctx.putImageData(img, 0, 0);
  return out;
}

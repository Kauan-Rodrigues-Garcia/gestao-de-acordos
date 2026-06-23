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

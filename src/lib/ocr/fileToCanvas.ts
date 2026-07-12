/**
 * Utilitários para transformar imagens enviadas pelo usuário (upload, colar ou
 * arrastar-e-soltar) em `HTMLCanvasElement` — a mesma entrada que a captura de
 * tela do ERP produz — e em Data URLs otimizadas para envio à IA de visão.
 */

/** Decodifica um `File`/`Blob` de imagem em um canvas no tamanho natural. */
export async function fileParaCanvas(file: Blob): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Não foi possível carregar a imagem.'));
      el.src = url;
    });

    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (!w || !h) throw new Error('Imagem com dimensões inválidas.');

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D indisponível neste navegador.');
    ctx.drawImage(img, 0, 0);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Converte um canvas em `File` PNG (ex.: para uma captura de tela virar upload). */
export async function canvasParaFile(
  src: HTMLCanvasElement,
  nome = 'captura.png',
): Promise<File> {
  const blob = await new Promise<Blob | null>((res) => src.toBlob(res, 'image/png'));
  if (!blob) throw new Error('Não foi possível gerar a imagem da captura.');
  return new File([blob], nome, { type: 'image/png' });
}

/**
 * Converte um canvas em Data URL JPEG, reduzindo a maior dimensão para no
 * máximo `maxDim` px. Mantém o payload da IA pequeno (custo e limite de body
 * da Vercel) sem perder legibilidade de texto de UI.
 */
export function canvasParaDataUrl(
  src: HTMLCanvasElement,
  maxDim = 1600,
  quality = 0.85,
): string {
  const maior = Math.max(src.width, src.height);
  if (maior <= maxDim) return src.toDataURL('image/jpeg', quality);

  const escala = maxDim / maior;
  const out = document.createElement('canvas');
  out.width = Math.round(src.width * escala);
  out.height = Math.round(src.height * escala);
  const ctx = out.getContext('2d');
  if (!ctx) return src.toDataURL('image/jpeg', quality);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, out.width, out.height);
  return out.toDataURL('image/jpeg', quality);
}

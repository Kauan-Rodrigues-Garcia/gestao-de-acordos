/**
 * A foto do chat encolhida antes de subir (28/10/2026).
 *
 * O balde do chat guardava a foto do jeito que saiu do celular: média de
 * 589 kB por imagem, com casos de 4,3 MB, para uma miniatura de 240×160 e um
 * visualizador que cabe na tela. Abrir uma conversa com fotos era esperar o
 * download de cada original. Encolhida para 1920 px no lado maior, a mesma
 * foto fica em 150–350 kB e continua nítida no visualizador.
 *
 * WebP quando o navegador sabe gravar (mantém a transparência de print de
 * tela); senão JPEG sobre fundo branco. Nunca piora: GIF (animação), SVG e o
 * que já é pequeno sobem como vieram, e se o resultado não ficar menor vale o
 * original. Qualquer falha também devolve o original — encolher é economia,
 * não condição para enviar.
 */

/** O lado maior da foto depois de encolhida. */
export const LADO_MAXIMO = 1920;
/** Abaixo disto a foto sobe como veio: não vale o custo de recodificar. */
export const TAMANHO_SEM_COMPRESSAO = 300 * 1024;
const QUALIDADE = 0.82;

const TIPOS_COMPRIMIVEIS = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

/** Esta foto passa pela compressão? */
export function deveComprimir(arquivo: { type: string; size: number }): boolean {
  return TIPOS_COMPRIMIVEIS.has(arquivo.type.toLowerCase()) && arquivo.size > TAMANHO_SEM_COMPRESSAO;
}

/** As medidas finais: cabe em `lado` x `lado` sem distorcer, e nunca aumenta. */
export function medidasAlvo(largura: number, altura: number, lado = LADO_MAXIMO): { largura: number; altura: number } {
  const maior = Math.max(largura, altura);
  if (!maior || maior <= lado) return { largura, altura };
  const escala = lado / maior;
  return { largura: Math.max(1, Math.round(largura * escala)), altura: Math.max(1, Math.round(altura * escala)) };
}

/** «foto.png» com a extensão do formato novo: «foto.webp». */
export function nomeComExtensao(nome: string, tipo: string): string {
  const ext = tipo === 'image/webp' ? 'webp' : 'jpg';
  const base = nome.replace(/\.[^./\\]+$/, '') || 'imagem';
  return `${base}.${ext}`;
}

function gerarBlob(canvas: HTMLCanvasElement, tipo: string): Promise<Blob | null> {
  return new Promise(resolve => canvas.toBlob(resolve, tipo, QUALIDADE));
}

export async function comprimirImagem(arquivo: File): Promise<File> {
  if (!deveComprimir(arquivo) || typeof document === 'undefined' || typeof createImageBitmap !== 'function') {
    return arquivo;
  }
  try {
    // `from-image`: a foto de celular deitada pelo EXIF sai em pé.
    const bitmap = await createImageBitmap(arquivo, { imageOrientation: 'from-image' });
    const { largura, altura } = medidasAlvo(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = largura;
    canvas.height = altura;
    const ctx = canvas.getContext('2d');
    if (!ctx) { bitmap.close(); return arquivo; }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, largura, altura);

    // O Safari antigo ignora o pedido de WebP e devolve PNG: aí vai JPEG, e o
    // JPEG não tem transparência, então o fundo é pintado de branco antes.
    let blob = await gerarBlob(canvas, 'image/webp');
    if (!blob || blob.type !== 'image/webp') {
      ctx.globalCompositeOperation = 'destination-over';
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, largura, altura);
      blob = await gerarBlob(canvas, 'image/jpeg');
    }
    bitmap.close();
    if (!blob || blob.size >= arquivo.size) return arquivo;
    return new File([blob], nomeComExtensao(arquivo.name, blob.type), {
      type: blob.type, lastModified: arquivo.lastModified,
    });
  } catch {
    return arquivo;
  }
}

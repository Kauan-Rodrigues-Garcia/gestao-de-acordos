import type { Worker } from 'tesseract.js';
import { preprocessarParaOcr } from '@/lib/ocr/preprocessImage';
import { extrairDadosPrintPP, type DadosExtraidosPP } from './printParser';

// O Tesseract é pesado (~MB de wasm + traineddata). Carregamos sob demanda
// e reutilizamos o mesmo worker entre capturas (importante para alto volume).
let workerPromise: Promise<Worker> | null = null;

async function obterWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import('tesseract.js');
      return createWorker('por');
    })();
  }
  return workerPromise;
}

/**
 * Inicia o download do modelo OCR em segundo plano.
 * Chame no mount do componente para que a primeira captura seja imediata.
 */
export function preaquecerOcr(): void {
  obterWorker().catch(() => {/* falha silenciosa no pré-aquecimento */});
}

/** Encerra o worker do Tesseract e libera memória. */
export async function encerrarOcr(): Promise<void> {
  if (!workerPromise) return;
  const pendente = workerPromise;
  workerPromise = null;
  try {
    const worker = await pendente;
    await worker.terminate();
  } catch {
    // worker já encerrado ou nunca inicializado — nada a fazer
  }
}

/**
 * Roda OCR no frame capturado da janela do Mundial ERP e extrai os campos
 * do acordo Pagueplay.
 */
export async function lerPrintMundialErp(
  canvas: HTMLCanvasElement,
): Promise<DadosExtraidosPP> {
  const worker = await obterWorker();
  const imagem = preprocessarParaOcr(canvas);
  const { data } = await worker.recognize(imagem);
  return extrairDadosPrintPP(data.text);
}

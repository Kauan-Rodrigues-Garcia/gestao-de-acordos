import type { Worker } from 'tesseract.js';
import { fileParaCanvas } from '@/lib/ocr/fileToCanvas';
import { preprocessarParaOcrForte, type ModoPreprocess } from '@/lib/ocr/preprocessImage';
import { extrairDadosBookplay, mesclarDadosBookplay } from './parserBookplay';
import { sanitizarDadosAcordo } from './sanitizar';
import { contarCamposPreenchidos, type DadosExtraidosAcordo } from './types';

/**
 * Leitura de acordo por imagem (BookPlay): OCR local (Tesseract), no próprio
 * navegador. A imagem não sai da máquina.
 *
 * Até 10/11/2026 havia antes um caminho por IA de visão
 * (`/api/ler-acordo-imagem`), que mandava o print a um provedor externo.
 * Removido por decisão do Cleber: não será usado, e tirá-lo encurta a lista de
 * terceiros que recebem dado pessoal (LGPD).
 */

// ── OCR local (Tesseract) — worker reaproveitado entre leituras ───────────
let workerPromise: Promise<Worker> | null = null;

function obterWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker, PSM } = await import('tesseract.js');
      const worker = await createWorker('por');
      // Bloco uniforme de texto (bom p/ prints e tabelas); preserva o
      // espaçamento entre colunas para a extração por registro.
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
        preserve_interword_spaces: '1',
      });
      return worker;
    })();
  }
  return workerPromise;
}

const MODOS_PREPROCESS: ModoPreprocess[] = ['binarizar', 'contraste'];

/** Inicia o download do modelo OCR em segundo plano (chame no mount). */
export function preaquecerOcrAcordo(): void {
  obterWorker().catch(() => {/* pré-aquecimento silencioso */});
}

/** Encerra o worker do Tesseract e libera memória. */
export async function encerrarOcrAcordo(): Promise<void> {
  if (!workerPromise) return;
  const pendente = workerPromise;
  workerPromise = null;
  try {
    const worker = await pendente;
    await worker.terminate();
  } catch {
    /* já encerrado */
  }
}

// ── Caminho OCR local ───────────────────────────────────────────────────────
async function lerViaOcr(files: File[]): Promise<DadosExtraidosAcordo> {
  const worker = await obterWorker();
  const parciais: DadosExtraidosAcordo[] = [];

  for (const f of files) {
    const canvas = await fileParaCanvas(f);

    // Multipass: roda cada variante de pré-processamento e fica com a que
    // extraiu MAIS campos (layouts diferentes respondem melhor a modos diferentes).
    let melhor: DadosExtraidosAcordo | null = null;
    let melhorScore = -1;
    for (const modo of MODOS_PREPROCESS) {
      const imagem = preprocessarParaOcrForte(canvas, modo);
      const { data } = await worker.recognize(imagem);
      const parcial = extrairDadosBookplay(data.text);
      parcial._textoOcr = data.text;
      const score = contarCamposPreenchidos(parcial);
      if (score > melhorScore) { melhorScore = score; melhor = parcial; }
    }

    if (melhor) parciais.push(melhor);
  }

  const dados = sanitizarDadosAcordo(mesclarDadosBookplay(parciais));
  dados._fonte = 'ocr';
  return dados;
}

/**
 * Lê 1+ imagens de acordo BookPlay e devolve os campos extraídos.
 * @throws se nenhuma imagem for passada ou o OCR falhar.
 */
export async function lerImagensAcordoBP(
  files: File[],
): Promise<DadosExtraidosAcordo> {
  if (!files.length) throw new Error('Nenhuma imagem selecionada.');
  return lerViaOcr(files);
}

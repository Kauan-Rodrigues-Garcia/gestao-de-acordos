import type { Worker } from 'tesseract.js';
import { fileParaCanvas, canvasParaDataUrl } from '@/lib/ocr/fileToCanvas';
import { preprocessarParaOcrForte, type ModoPreprocess } from '@/lib/ocr/preprocessImage';
import { extrairDadosBookplay, mesclarDadosBookplay } from './parserBookplay';
import { sanitizarDadosAcordo } from './sanitizar';
import { contarCamposPreenchidos, type DadosExtraidosAcordo } from './types';

/**
 * Motor híbrido de leitura de acordo por imagem (BookPlay).
 *
 *   1. Tenta a IA de visão via `/api/ler-acordo-imagem` (robusta, entende
 *      múltiplos prints de reparcelamento de uma vez).
 *   2. Se a IA não estiver configurada (sem chave), indisponível ou o endpoint
 *      não existir (ex.: `npm run dev` puro, sem `vercel dev`), cai para o
 *      OCR local Tesseract — offline e sem custo.
 *
 * O formulário consome sempre o mesmo `DadosExtraidosAcordo`, sem saber qual
 * motor respondeu (`_fonte` indica a origem).
 */

const ENDPOINT_IA = '/api/ler-acordo-imagem';

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

// ── Caminho IA ────────────────────────────────────────────────────────────
async function lerViaIa(files: File[]): Promise<DadosExtraidosAcordo | null> {
  // Reduz cada imagem antes de enviar (custo + limite de body da Vercel).
  const imagens = await Promise.all(
    files.map(async (f) => canvasParaDataUrl(await fileParaCanvas(f))),
  );

  let resp: Response;
  try {
    resp = await fetch(ENDPOINT_IA, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ origem: 'bookplay', imagens }),
    });
  } catch {
    // Sem rede ou endpoint inexistente (vite dev) → deixa o OCR assumir.
    return null;
  }

  // 404: endpoint não servido (vite puro). 501/503: IA não configurada.
  if (resp.status === 404 || resp.status === 501 || resp.status === 503) return null;
  if (!resp.ok) {
    const msg = await resp.text().catch(() => '');
    throw new Error(`Falha na IA de visão (${resp.status}). ${msg}`.trim());
  }

  const json = (await resp.json()) as { configured?: boolean; dados?: DadosExtraidosAcordo };
  if (!json?.configured || !json.dados) return null;

  const dados = sanitizarDadosAcordo(json.dados);
  dados._fonte = 'ia';
  return dados;
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
 * @throws se nenhuma imagem for passada ou ambos os motores falharem.
 */
export async function lerImagensAcordoBP(
  files: File[],
): Promise<DadosExtraidosAcordo> {
  if (!files.length) throw new Error('Nenhuma imagem selecionada.');

  try {
    const viaIa = await lerViaIa(files);
    if (viaIa) return viaIa;
  } catch (err) {
    // IA configurada mas falhou: registra e tenta o OCR local como rede de segurança.
    console.warn('[acordo-visao] IA indisponível, usando OCR local:', err);
  }

  return lerViaOcr(files);
}

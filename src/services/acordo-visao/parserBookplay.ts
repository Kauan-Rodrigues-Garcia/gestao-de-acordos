import { parseBRL } from '@/lib/money';
import type { DadosExtraidosAcordo, StatusBookplay, TipoBookplay } from './types';

/**
 * Extrator heurístico (OCR) de acordos BookPlay — motor de FALLBACK usado
 * enquanto a IA de visão não está configurada.
 *
 * Estratégia em duas camadas, para tolerar layouts DIVERSOS:
 *   1. Por REGISTRO (linha): numa planilha/lista, cada linha tem os campos de
 *      um acordo lado a lado (nome, NR, valor, parcelas, data, telefone, forma,
 *      status). Extraímos a linha inteira de uma vez → campos coerentes entre si
 *      (evita misturar dados de linhas diferentes).
 *   2. Por RÓTULO (texto): num print de detalhe de um único acordo, os campos
 *      vêm rotulados ("NR:", "Vencimento:"…). Preenche o que a camada 1 não achou.
 *
 * Diferente do PaguePlay, o `valor` aqui é POR PARCELA.
 */

/** Normaliza "1 590,40" → "1.590,40" (OCR troca separador de milhar por espaço). */
function norm(s: string): string {
  return s.replace(/(\d)\s(\d{3}),/, '$1.$2,');
}

/** Formata número → string BR "1.590,40" com 2 casas. */
function formatBR(n: number): string {
  return n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Converte um texto de valor tolerante ("199", "224,1", "1.590,40") → "199,00". */
function normalizarValor(bruto: string): string | undefined {
  const n = parseBRL(norm(bruto));
  return Number.isFinite(n) && n > 0 ? formatBR(n) : undefined;
}

function detectarTipo(t: string): TipoBookplay | undefined {
  // `autom[aá]t` e `recorren` (em vez da palavra inteira) toleram ruído de OCR no fim.
  if (/\bpix\s*autom[aá]t/i.test(t)) return 'pix_automatico';
  if (/recorren/i.test(t)) return 'cartao_recorrente';
  if (/\bcart[aã]o\b/i.test(t)) return 'cartao';
  if (/\bboleto\b|\bbolepix\b/i.test(t)) return 'boleto';
  if (/\bpix\b/i.test(t)) return 'pix';
  return undefined;
}

function detectarStatus(t: string): StatusBookplay | undefined {
  if (/\bn[ãa]o\s*pago\b|\bem\s*aberto\b|\binadimplente\b/i.test(t)) return 'nao_pago';
  if (/\bpago\b|\bquitado\b|\bliquidado\b/i.test(t)) return 'pago';
  if (/\bpendente\b|\bverificar\b|\baguardando\b|\bem\s*an[aá]lise\b/i.test(t)) return 'verificar_pendente';
  return undefined;
}

const RE_TELEFONE = /\(?\d{2}\)?\s?\d{4,5}[-\s.]?\d{4}/;
const RE_DATA = /(\d{2})\/(\d{2})\/(\d{4})/;
const RE_PARCELAS = /\b(\d{1,2})\s*x\b/i;

/**
 * Extrai os campos de UMA linha (um registro), na ordem: remove telefone, data
 * e parcelas primeiro (para não confundir com NR/valor), então pega o NR
 * (7–9 dígitos) e o valor (número monetário restante).
 */
function parseLinhaRegistro(linha: string): DadosExtraidosAcordo {
  const out: DadosExtraidosAcordo = {};
  let resto = ` ${linha} `;

  const mTel = resto.match(RE_TELEFONE);
  if (mTel) { out.whatsapp = mTel[0].trim(); resto = resto.replace(mTel[0], ' '); }

  const mData = resto.match(RE_DATA);
  if (mData) { out.vencimento = `${mData[3]}-${mData[2]}-${mData[1]}`; resto = resto.replace(mData[0], ' '); }

  const mParc = resto.match(RE_PARCELAS);
  if (mParc) {
    const p = parseInt(mParc[1], 10);
    if (p >= 1 && p <= 60) out.parcelas = String(p);
    resto = resto.replace(mParc[0], ' ');
  }

  // NR: código de 7 a 9 dígitos (sem rótulo, como nas células da planilha).
  const mNr = resto.match(/(?<![\d/-])(\d{7,9})(?![\d/-])/);
  if (mNr) { out.nr_cliente = mNr[1]; resto = resto.replace(mNr[1], ' '); }

  // Valor por parcela: número monetário no que sobrou (aceita 0/1/2 casas).
  const mVal = resto.match(/\b(\d{1,3}(?:[.\s]\d{3})*(?:,\d{1,2})?|\d{1,6},\d{1,2})\b/);
  if (mVal) out.valor = normalizarValor(mVal[1]);

  // Nome: sequência de letras no início da linha (antes do NR).
  const mNome = linha.match(/^[\s|]*([A-ZÀ-Ú][A-Za-zÀ-ú][A-Za-zÀ-ú .]{4,60}?)(?=\s{2,}|\s*\d|\s*\||$)/);
  if (mNome) out.nome_cliente = mNome[1].trim().replace(/\s{2,}/g, ' ');

  out.tipo = detectarTipo(linha);
  out.status = detectarStatus(linha);
  return out;
}

/** Extração por rótulos (print de detalhe de um único acordo). */
function extrairPorRotulos(t: string): DadosExtraidosAcordo {
  const out: DadosExtraidosAcordo = {};

  const mNr =
    t.match(/\bnr\b[^\d\n]{0,15}(\d{3,})/i) ||
    t.match(/c[oó]digo(?:\s+do\s+acordo)?[^\d\n]{0,15}(\d{4,})/i) ||
    t.match(/n[uú]mero\s+do\s+registro[^\d\n]{0,15}(\d{3,})/i);
  if (mNr) out.nr_cliente = mNr[1];

  out.tipo = detectarTipo(t);
  out.status = detectarStatus(t);

  // Tabela de parcelas "valor  dd/mm/aaaa" (uma linha por parcela).
  const linhasParc = [...t.matchAll(/(\d{1,3}(?:[.\s]\d{3})*,\d{2})\s+(\d{2}\/\d{2}\/\d{4})/g)];
  if (linhasParc.length >= 1 && linhasParc.length <= 60) {
    out.parcelas = String(linhasParc.length);
    out.valor = normalizarValor(linhasParc[0][1]);
  }
  if (!out.parcelas) {
    const mParc = t.match(RE_PARCELAS) || t.match(/parcelas?\s*[:-]?\s*(\d{1,2})/i);
    if (mParc) {
      const p = parseInt(mParc[1], 10);
      if (p >= 1 && p <= 60) out.parcelas = String(p);
    }
  }

  const mVenc =
    t.match(/(?:primeiro\s+vencimento|vencimento|1[º°]?\s*vencimento)\s*[:-]?\s*(\d{2})\/(\d{2})\/(\d{4})/i) ||
    t.match(RE_DATA);
  if (mVenc) out.vencimento = `${mVenc[3]}-${mVenc[2]}-${mVenc[1]}`;

  if (!out.valor) {
    const mValor =
      t.match(/valor\s+(?:da\s+)?parcela[^\d\n]{0,20}(\d{1,3}(?:[.\s]\d{3})*,\d{2})/i) ||
      t.match(/\bvalor\b[^\d\n]{0,20}(\d{1,3}(?:[.\s]\d{3})*,\d{2})/i);
    if (mValor) out.valor = normalizarValor(mValor[1]);
  }

  const mNome = t.match(/(?:cliente|nome|devedor|sacado)\s*[:-]?\s*([A-ZÀ-Ú][A-Za-zÀ-ú ]{3,60})/i);
  if (mNome) out.nome_cliente = mNome[1].trim().replace(/\s{2,}/g, ' ');

  const mTel = t.match(/(?:whatsapp|telefone|celular|tel|fone|contato)\s*[:-]?\s*(\(?\d{2}\)?\s?\d{4,5}[-\s]?\d{4})/i);
  if (mTel) out.whatsapp = mTel[1].trim();

  return out;
}

/** Preenche em `alvo` só os campos ainda vazios, a partir de `fonte`. */
function preencherVazios(alvo: DadosExtraidosAcordo, fonte: DadosExtraidosAcordo): void {
  (Object.keys(fonte) as (keyof DadosExtraidosAcordo)[]).forEach((k) => {
    const v = fonte[k];
    if (v != null && v !== '' && (alvo[k] == null || alvo[k] === '')) {
      // @ts-expect-error atribuição homogênea entre chaves do mesmo tipo
      alvo[k] = v;
    }
  });
}

export function extrairDadosBookplay(textoOcr: string): DadosExtraidosAcordo {
  if (!textoOcr) return {};
  const t = norm(textoOcr.replace(/[\u00A0\u202F]/g, ' '));

  // Camada 1 — registros por linha. Um registro "bom" tem NR e valor juntos.
  const linhas = t.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 3);
  const registros = linhas.map(parseLinhaRegistro);
  const registroBom = registros.find((r) => r.nr_cliente && r.valor)
    ?? registros.find((r) => r.nr_cliente || r.valor);

  const out: DadosExtraidosAcordo = registroBom ? { ...registroBom } : {};

  // Camada 2 — rótulos preenchem o que faltou (ou tudo, se não houver registro).
  preencherVazios(out, extrairPorRotulos(t));

  return out;
}

/**
 * Mescla dados de múltiplas imagens do MESMO acordo (reparcelamento em telas
 * separadas): identidade = primeiro valor definido; PARCELAS = soma; valor =
 * primeiro definido (por parcela).
 */
export function mesclarDadosBookplay(
  parciais: DadosExtraidosAcordo[],
): DadosExtraidosAcordo {
  const out: DadosExtraidosAcordo = {};
  const primeiro = <K extends keyof DadosExtraidosAcordo>(k: K) => {
    for (const p of parciais) {
      const v = p[k];
      if (v != null && v !== '') return v;
    }
    return undefined;
  };

  out.nr_cliente = primeiro('nr_cliente');
  out.nome_cliente = primeiro('nome_cliente');
  out.whatsapp = primeiro('whatsapp');
  out.vencimento = primeiro('vencimento');
  out.valor = primeiro('valor');
  out.tipo = primeiro('tipo') as TipoBookplay | undefined;
  out.status = primeiro('status') as StatusBookplay | undefined;
  out.instituicao = primeiro('instituicao');

  const totalParcelas = parciais.reduce((acc, p) => {
    const n = p.parcelas ? parseInt(p.parcelas, 10) : 0;
    return acc + (Number.isFinite(n) ? n : 0);
  }, 0);
  if (totalParcelas > 0) out.parcelas = String(totalParcelas);

  const textos = parciais.map((p) => p._textoOcr).filter(Boolean);
  if (textos.length) out._textoOcr = textos.join('\n\n──────────\n\n');

  return out;
}

export const _formatBR = formatBR;

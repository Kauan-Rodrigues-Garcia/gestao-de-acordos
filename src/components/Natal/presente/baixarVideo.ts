/**
 * baixarVideo.ts — o vídeo da abertura só abre inteiro (Cleber, 09/11/2026).
 *
 * «Só permite abrir o vídeo quando terminar o download inteiro. Enquanto isso,
 * fica ali um símbolo de que já vai abrir.» Tocando direto do endereço, o vídeo
 * começava com o arquivo pela metade e, na rede da operação, parava no meio
 * para carregar — parecia que o Gestão tinha travado.
 *
 * Aqui o arquivo desce inteiro por `fetch` (com a porcentagem, para o cartão
 * mostrar) e vira um `blob:` na memória; o `<video>` só recebe o endereço
 * dele no fim. Um download por vídeo na página: quem deixa para depois e volta
 * não baixa de novo. `soltarVideo` devolve a memória (são ~35 MB) quando a
 * abertura acaba.
 */

export type EstadoDoDownload =
  | { tipo: 'baixando'; fracao: number | null }
  | { tipo: 'pronto'; url: string }
  | { tipo: 'erro' };

interface Download {
  estado: EstadoDoDownload;
  promessa: Promise<string>;
  ouvintes: Set<(e: EstadoDoDownload) => void>;
}

const downloads = new Map<string, Download>();

function mudar(d: Download, estado: EstadoDoDownload) {
  d.estado = estado;
  for (const o of d.ouvintes) {
    try { o(estado); } catch { /* quem ouve não derruba o download */ }
  }
}

async function descer(src: string, d: Download): Promise<string> {
  const resposta = await fetch(src, { cache: 'force-cache' });
  if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
  const total = Number(resposta.headers.get('content-length')) || 0;
  const tipo = resposta.headers.get('content-type') || 'video/mp4';

  // Sem leitor (navegador antigo): baixa inteiro de uma vez, sem porcentagem.
  if (!resposta.body || typeof resposta.body.getReader !== 'function') {
    return URL.createObjectURL(await resposta.blob());
  }

  const leitor = resposta.body.getReader();
  const pedacos: Uint8Array[] = [];
  let recebido = 0, ultimoAviso = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    pedacos.push(value);
    recebido += value.byteLength;
    // Avisa a cada 1% (não a cada pedaço: são milhares).
    const fracao = total ? Math.min(1, recebido / total) : null;
    if (fracao === null || fracao - ultimoAviso >= 0.01) {
      ultimoAviso = fracao ?? 0;
      mudar(d, { tipo: 'baixando', fracao });
    }
  }
  if (total && recebido < total) throw new Error('download incompleto');
  return URL.createObjectURL(new Blob(pedacos as BlobPart[], { type: tipo }));
}

/** Começa (ou reaproveita) o download do vídeo. */
export function baixarVideo(src: string): Download {
  const existente = downloads.get(src);
  if (existente && existente.estado.tipo !== 'erro') return existente;

  const d: Download = {
    estado: { tipo: 'baixando', fracao: 0 },
    promessa: Promise.resolve(''),
    ouvintes: existente?.ouvintes ?? new Set(),
  };
  d.promessa = descer(src, d).then(
    url => { mudar(d, { tipo: 'pronto', url }); return url; },
    (erro: unknown): never => { mudar(d, { tipo: 'erro' }); throw erro; },
  );
  d.promessa.catch((): void => undefined);
  downloads.set(src, d);
  mudar(d, d.estado);
  return d;
}

/** Ouve o andamento; avisa já com o estado de agora. Devolve o cancelamento. */
export function ouvirDownload(src: string, ouvinte: (e: EstadoDoDownload) => void): () => void {
  const d = downloads.get(src);
  if (!d) return () => undefined;
  d.ouvintes.add(ouvinte);
  ouvinte(d.estado);
  return () => { d.ouvintes.delete(ouvinte); };
}

/** O estado de agora (ou `null`: ainda não começou). */
export function estadoDoDownload(src: string): EstadoDoDownload | null {
  return downloads.get(src)?.estado ?? null;
}

/** A abertura acabou: devolve a memória do vídeo. */
export function soltarVideo(src: string): void {
  const d = downloads.get(src);
  if (!d) return;
  if (d.estado.tipo === 'pronto') URL.revokeObjectURL(d.estado.url);
  downloads.delete(src);
}

/**
 * youtube.ts — a busca de músicas do Som ambiente.
 *
 * Fala com a YouTube Data API v3 direto do navegador. A chave (`VITE_YOUTUBE_API_KEY`)
 * vai no bundle, como toda `VITE_*`: restrinja-a por referenciador (o domínio do
 * sistema) e só à «YouTube Data API v3» no Google Cloud — assim, copiada, ela
 * não serve para mais nada.
 *
 * ## A cota é o limite
 *
 * Cada busca custa 100 das 10.000 unidades diárias da chave: ~100 buscas por
 * dia para todo mundo junto. Por isso:
 *   - a busca só dispara no «Enter» / botão, nunca a cada tecla;
 *   - o resultado fica 24 h no navegador e 10 min na memória, por termo;
 *   - só vídeos embutíveis (`videoEmbeddable`) e da categoria Música.
 *
 * O som sai do player do YouTube que o motor já usa (`links.ts` + `motor.ts`):
 * aqui só se acha o vídeo. Puro, fora a chamada `fetch` e o cache.
 */

export interface ResultadoYoutube {
  /** O id do vídeo (11 caracteres). */
  video: string;
  titulo: string;
  canal: string;
  /** Miniatura em `i.ytimg.com`, 320×180. */
  capa: string;
}

export class ErroBusca extends Error {
  constructor(mensagem: string, readonly motivo: 'sem_chave' | 'cota' | 'chave' | 'rede' | 'outro') {
    super(mensagem);
  }
}

const ENTIDADES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** A API devolve o título com entidades HTML («&amp;», «&#39;»). */
export function desescapar(texto: string): string {
  return texto.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (inteiro, c: string) => {
    if (c[0] === '#') {
      const n = c[1].toLowerCase() === 'x' ? parseInt(c.slice(2), 16) : parseInt(c.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : inteiro;
    }
    return ENTIDADES[c.toLowerCase()] ?? inteiro;
  });
}

const ID_VIDEO = /^[A-Za-z0-9_-]{11}$/;
const CAPA_OK = /^https:\/\/i\.ytimg\.com\//;

/** O canal de uma gravadora vem como «Artista - Topic»: fica só o artista. */
export function limparCanal(canal: string): string {
  return canal.replace(/\s+-\s+Topic$/i, '').trim();
}

/** A resposta crua da API → o que o painel mostra. Ignora o que vier torto. */
export function lerResposta(json: unknown): ResultadoYoutube[] {
  const itens = (json as { items?: unknown } | null)?.items;
  if (!Array.isArray(itens)) return [];
  const saida: ResultadoYoutube[] = [];
  for (const item of itens) {
    const o = item as { id?: { videoId?: unknown }; snippet?: Record<string, unknown> } | null;
    const video = o?.id?.videoId;
    const s = o?.snippet;
    if (typeof video !== 'string' || !ID_VIDEO.test(video) || !s) continue;
    const titulo = typeof s.title === 'string' ? desescapar(s.title).trim() : '';
    if (!titulo) continue;
    const miniaturas = (s.thumbnails ?? {}) as Record<string, { url?: unknown } | undefined>;
    const capaBruta = miniaturas.medium?.url ?? miniaturas.high?.url ?? miniaturas.default?.url;
    const capa = typeof capaBruta === 'string' && CAPA_OK.test(capaBruta)
      ? capaBruta
      : `https://i.ytimg.com/vi/${video}/mqdefault.jpg`;
    const canal = typeof s.channelTitle === 'string' ? limparCanal(desescapar(s.channelTitle)) : '';
    saida.push({ video, titulo: titulo.slice(0, 120), canal: canal.slice(0, 80), capa });
  }
  return saida;
}

/** O endereço que `lerLink` entende — é o que a lista guarda. */
export const urlDoVideo = (video: string) => `https://www.youtube.com/watch?v=${video}`;

// ── Cache ────────────────────────────────────────────────────────────────────

const MEMORIA_MS = 10 * 60 * 1000;
const DISCO_MS = 24 * 60 * 60 * 1000;
const memoria = new Map<string, { t: number; itens: ResultadoYoutube[] }>();
const chaveDisco = (termo: string) => `som-ambiente:yt:${termo}`;

const normalizarTermo = (t: string) => t.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();

function doCache(termo: string): ResultadoYoutube[] | null {
  const agora = Date.now();
  const m = memoria.get(termo);
  if (m && agora - m.t < MEMORIA_MS) return m.itens;
  try {
    const bruto = localStorage.getItem(chaveDisco(termo));
    if (!bruto) return null;
    const o = JSON.parse(bruto) as { t?: unknown; itens?: unknown };
    if (typeof o.t !== 'number' || agora - o.t > DISCO_MS) { localStorage.removeItem(chaveDisco(termo)); return null; }
    // Relê pelo mesmo filtro: o que foi gravado não é confiável de novo.
    const itens = lerResposta({
      items: (Array.isArray(o.itens) ? o.itens : []).map((i: ResultadoYoutube) => ({
        id: { videoId: i?.video }, snippet: { title: i?.titulo, channelTitle: i?.canal, thumbnails: { medium: { url: i?.capa } } },
      })),
    });
    memoria.set(termo, { t: o.t, itens });
    return itens;
  } catch {
    return null;
  }
}

function guardar(termo: string, itens: ResultadoYoutube[]) {
  const t = Date.now();
  memoria.set(termo, { t, itens });
  try { localStorage.setItem(chaveDisco(termo), JSON.stringify({ t, itens })); } catch { /* cheio ou modo privado */ }
}

// ── Busca ────────────────────────────────────────────────────────────────────

/** Há chave configurada neste build? Sem ela o painel explica em vez de falhar. */
export function buscaConfigurada(): boolean {
  return !!(import.meta.env.VITE_YOUTUBE_API_KEY as string | undefined)?.trim();
}

export async function buscarMusicas(texto: string, sinal?: AbortSignal): Promise<ResultadoYoutube[]> {
  const termo = normalizarTermo(texto).slice(0, 100);
  if (termo.length < 2) return [];
  const guardado = doCache(termo);
  if (guardado) return guardado;

  const itens = lerResposta(await pedirYoutube('search', {
    part: 'snippet', type: 'video', videoCategoryId: '10', videoEmbeddable: 'true',
    maxResults: '10', q: termo,
  }, sinal));
  guardar(termo, itens);
  return itens;
}

/**
 * Uma chamada à Data API (`search`, `playlistItems`, `videos`…), já com a
 * chave e os erros traduzidos. A rádio também usa (`radio/importar.ts`).
 */
export async function pedirYoutube(recurso: string, params: Record<string, string>, sinal?: AbortSignal): Promise<unknown> {
  const chave = (import.meta.env.VITE_YOUTUBE_API_KEY as string | undefined)?.trim();
  if (!chave) throw new ErroBusca('A busca do YouTube ainda não foi configurada neste ambiente.', 'sem_chave');

  const p = new URLSearchParams({ ...params, key: chave });
  let resposta: Response;
  try {
    resposta = await fetch(`https://www.googleapis.com/youtube/v3/${recurso}?${p}`, { signal: sinal });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new ErroBusca('Sem conexão com o YouTube. Confira a internet.', 'rede');
  }
  if (!resposta.ok) {
    let razao = '';
    try {
      const corpo = await resposta.json() as { error?: { errors?: { reason?: string }[] } };
      razao = corpo.error?.errors?.[0]?.reason ?? '';
    } catch { /* sem corpo */ }
    if (razao === 'quotaExceeded' || razao === 'rateLimitExceeded' || razao === 'dailyLimitExceeded') {
      throw new ErroBusca('O limite diário de buscas do YouTube acabou. Volta amanhã — ou toque algo que já está na lista.', 'cota');
    }
    if (razao === 'playlistNotFound') {
      throw new ErroBusca('Essa playlist não existe ou é privada. Deixe-a pública ou não listada.', 'outro');
    }
    if (resposta.status === 400 || resposta.status === 403) {
      throw new ErroBusca('A chave do YouTube foi recusada. Confira a chave e o domínio liberado nela.', 'chave');
    }
    throw new ErroBusca('O YouTube não respondeu. Tente de novo em instantes.', 'outro');
  }
  return resposta.json();
}

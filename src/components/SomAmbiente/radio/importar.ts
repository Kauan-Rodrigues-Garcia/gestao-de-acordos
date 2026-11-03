/**
 * importar.ts — as músicas de um estilo da rádio, lidas de uma playlist do
 * YouTube.
 *
 * Cada estilo é uma playlist (pública ou não listada). O painel lê a lista
 * pela Data API e manda tudo de uma vez para `fn_radio_importar`. Custa pouco
 * da cota (10.000 unidades por dia): 1 unidade a cada 50 músicas da lista,
 * mais 1 a cada 50 para ler duração e se pode tocar fora do YouTube. Uma
 * playlist de 200 músicas gasta 8 — contra 100 de UMA busca.
 *
 * Fica de fora o que a rádio não toca: vídeo privado ou apagado, que não deixa
 * tocar fora do YouTube, bloqueado no Brasil, ao vivo, ou com mais de
 * `DURACAO_MAX_S` (mix de 1 hora derrubaria a votação).
 */
import { lerLink } from '../links';
import { desescapar, limparCanal, pedirYoutube } from '../youtube';

export interface MusicaImportada {
  video: string;
  titulo: string;
  canal: string;
  capa: string | null;
  duracao_s: number;
}

/** Até quantas músicas lê de uma playlist (o banco aceita 500). */
export const LIMITE_PLAYLIST = 300;
export const DURACAO_MIN_S = 30;
export const DURACAO_MAX_S = 600;

/** O id da playlist num link colado («…?list=PL…»). `null` se não é playlist. */
export function idDaPlaylist(texto: string): string | null {
  const link = lerLink(texto);
  if (link?.plataforma === 'youtube' && link.tipo === 'playlist') return link.id;
  // O id puro também serve.
  const puro = texto.trim();
  return /^(PL|OL|UU|FL|LL)[A-Za-z0-9_-]{8,62}$/.test(puro) ? puro : null;
}

/** «PT3M25S» → 205. Vazio, «P0D» (ao vivo) ou torto → 0. */
export function segundosDaDuracao(iso: unknown): number {
  if (typeof iso !== 'string') return 0;
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(iso);
  if (!m) return 0;
  const [, d, h, min, s] = m.map(x => Number(x ?? 0));
  return d * 86400 + h * 3600 + min * 60 + s;
}

/** Os ids de vídeo de uma página de `playlistItems`. */
export function idsDaPagina(json: unknown): { ids: string[]; proxima: string | null } {
  const o = json as { items?: unknown; nextPageToken?: unknown } | null;
  const ids: string[] = [];
  for (const item of Array.isArray(o?.items) ? o.items : []) {
    const id = (item as { contentDetails?: { videoId?: unknown } } | null)?.contentDetails?.videoId;
    if (typeof id === 'string' && /^[A-Za-z0-9_-]{11}$/.test(id) && !ids.includes(id)) ids.push(id);
  }
  return { ids, proxima: typeof o?.nextPageToken === 'string' ? o.nextPageToken : null };
}

/** Uma resposta de `videos` → as que a rádio toca, na ordem que vieram. */
export function musicasDosVideos(json: unknown): { musicas: MusicaImportada[]; fora: number } {
  const itens = (json as { items?: unknown } | null)?.items;
  const musicas: MusicaImportada[] = [];
  let fora = 0;
  for (const item of Array.isArray(itens) ? itens : []) {
    const v = item as {
      id?: unknown;
      snippet?: { title?: unknown; channelTitle?: unknown; liveBroadcastContent?: unknown; thumbnails?: Record<string, { url?: unknown } | undefined> };
      contentDetails?: { duration?: unknown; regionRestriction?: { allowed?: unknown; blocked?: unknown } };
      status?: { embeddable?: unknown; privacyStatus?: unknown };
    } | null;
    const id = v?.id;
    const titulo = typeof v?.snippet?.title === 'string' ? desescapar(v.snippet.title).trim() : '';
    const duracao = segundosDaDuracao(v?.contentDetails?.duration);
    const regiao = v?.contentDetails?.regionRestriction;
    const bloqueado = (Array.isArray(regiao?.blocked) && regiao.blocked.includes('BR'))
      || (Array.isArray(regiao?.allowed) && !regiao.allowed.includes('BR'));
    const ok = typeof id === 'string' && /^[A-Za-z0-9_-]{11}$/.test(id) && titulo
      && v?.status?.embeddable !== false
      && (v?.status?.privacyStatus === 'public' || v?.status?.privacyStatus === 'unlisted')
      && v?.snippet?.liveBroadcastContent !== 'live' && v?.snippet?.liveBroadcastContent !== 'upcoming'
      && !bloqueado
      && duracao >= DURACAO_MIN_S && duracao <= DURACAO_MAX_S;
    if (!ok) { fora++; continue; }
    const mini = v?.snippet?.thumbnails ?? {};
    const capaBruta = mini.medium?.url ?? mini.high?.url ?? mini.default?.url;
    const canal = typeof v?.snippet?.channelTitle === 'string' ? limparCanal(desescapar(v.snippet.channelTitle)) : '';
    musicas.push({
      video: id as string,
      titulo: titulo.slice(0, 120),
      canal: canal.slice(0, 80),
      capa: typeof capaBruta === 'string' && capaBruta.startsWith('https://i.ytimg.com/') ? capaBruta : null,
      duracao_s: duracao,
    });
  }
  return { musicas, fora };
}

/** Lê a playlist inteira (até `LIMITE_PLAYLIST`). `fora`: as que ficaram de fora. */
export async function lerPlaylist(id: string, sinal?: AbortSignal): Promise<{ musicas: MusicaImportada[]; fora: number }> {
  const ids: string[] = [];
  let pagina: string | null = null;
  do {
    const json = await pedirYoutube('playlistItems', {
      part: 'contentDetails', maxResults: '50', playlistId: id, ...(pagina ? { pageToken: pagina } : {}),
    }, sinal);
    const lida = idsDaPagina(json);
    for (const x of lida.ids) if (!ids.includes(x)) ids.push(x);
    pagina = lida.proxima;
  } while (pagina && ids.length < LIMITE_PLAYLIST);

  const musicas: MusicaImportada[] = [];
  let fora = 0;
  const lote = ids.slice(0, LIMITE_PLAYLIST);
  for (let i = 0; i < lote.length; i += 50) {
    const json = await pedirYoutube('videos', {
      part: 'snippet,contentDetails,status', id: lote.slice(i, i + 50).join(','), maxResults: '50',
    }, sinal);
    const r = musicasDosVideos(json);
    musicas.push(...r.musicas);
    // Vídeo apagado nem volta em `videos`: conta como fora também.
    fora += r.fora + Math.max(0, Math.min(50, lote.length - i) - r.musicas.length - r.fora);
  }
  return { musicas, fora };
}

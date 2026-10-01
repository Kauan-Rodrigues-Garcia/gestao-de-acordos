/**
 * links.ts — o que a pessoa cola em «Minhas playlists» vira um player.
 *
 * Aceita Spotify (playlist, álbum, música, artista, podcast) e YouTube /
 * YouTube Music (playlist ou vídeo). Qualquer outra coisa volta `null` e o
 * painel explica o que serve — não existe «tenta abrir e vê no que dá».
 *
 * Puro, sem DOM: o motor e os testes usam igual.
 */

export type Plataforma = 'spotify' | 'youtube';

export interface LinkExterno {
  plataforma: Plataforma;
  /** Spotify: playlist | album | track | artist | show | episode. YouTube: playlist | video. */
  tipo: string;
  /** O id na plataforma. No YouTube com vídeo E lista, é o da lista. */
  id: string;
  /** Vídeo de partida quando o link do YouTube traz os dois. */
  video?: string;
  /** Nome que aparece na lista enquanto a pessoa não dá um. */
  rotulo: string;
}

const TIPOS_SPOTIFY = ['playlist', 'album', 'track', 'artist', 'show', 'episode'] as const;
const ROTULO_SPOTIFY: Record<string, string> = {
  playlist: 'Playlist', album: 'Álbum', track: 'Música', artist: 'Artista', show: 'Podcast', episode: 'Episódio',
};

const ID_SPOTIFY = /^[A-Za-z0-9]{10,40}$/;
const ID_LISTA_YT = /^[A-Za-z0-9_-]{10,64}$/;
const ID_VIDEO_YT = /^[A-Za-z0-9_-]{11}$/;

function spotify(tipo: string, id: string): LinkExterno | null {
  if (!(TIPOS_SPOTIFY as readonly string[]).includes(tipo) || !ID_SPOTIFY.test(id)) return null;
  return { plataforma: 'spotify', tipo, id, rotulo: `Spotify · ${ROTULO_SPOTIFY[tipo]}` };
}

function youtube(lista: string | null, video: string | null, musica: boolean): LinkExterno | null {
  const nome = musica ? 'YouTube Music' : 'YouTube';
  // Listas automáticas («RD…», o «Mix») não abrem no player embutido.
  if (lista && ID_LISTA_YT.test(lista) && !lista.startsWith('RD')) {
    return {
      plataforma: 'youtube', tipo: 'playlist', id: lista,
      ...(video && ID_VIDEO_YT.test(video) ? { video } : {}),
      rotulo: `${nome} · Playlist`,
    };
  }
  if (video && ID_VIDEO_YT.test(video)) {
    return { plataforma: 'youtube', tipo: 'video', id: video, rotulo: `${nome} · Vídeo` };
  }
  return null;
}

/** Lê o link colado. `null` quando não é Spotify nem YouTube que dê para tocar. */
export function lerLink(texto: string): LinkExterno | null {
  const bruto = texto.trim();
  if (!bruto) return null;

  // spotify:playlist:37i9dQZF1DX8Uebhn9wzrS — o «Copiar URI» do app.
  const uri = /^spotify:([a-z]+):([A-Za-z0-9]+)$/.exec(bruto);
  if (uri) return spotify(uri[1], uri[2]);

  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(bruto) ? bruto : `https://${bruto}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '');

  if (host === 'open.spotify.com' || host === 'play.spotify.com') {
    // /intl-pt/playlist/ID, /embed/playlist/ID, /playlist/ID
    const partes = url.pathname.split('/').filter(Boolean)
      .filter(p => !p.startsWith('intl-') && p !== 'embed');
    if (partes.length < 2) return null;
    return spotify(partes[0], partes[1]);
  }

  if (host === 'youtu.be') {
    const video = url.pathname.split('/').filter(Boolean)[0] ?? null;
    return youtube(url.searchParams.get('list'), video, false);
  }

  if (host === 'youtube.com' || host === 'music.youtube.com' || host === 'youtube-nocookie.com') {
    const musica = host === 'music.youtube.com';
    const lista = url.searchParams.get('list');
    let video = url.searchParams.get('v');
    const partes = url.pathname.split('/').filter(Boolean);
    if (!video && (partes[0] === 'embed' || partes[0] === 'shorts' || partes[0] === 'live') && partes[1]
      && partes[1] !== 'videoseries') {
      video = partes[1];
    }
    return youtube(lista, video, musica);
  }

  return null;
}

/** Mesma coisa? Dois links para a mesma playlist não entram duas vezes. */
export function chaveDoLink(link: LinkExterno): string {
  return `${link.plataforma}:${link.tipo}:${link.id}`;
}

/** Endereço do player do YouTube, com a API de mensagens ligada. */
export function enderecoYoutube(link: LinkExterno, origem: string): string {
  const p = new URLSearchParams({
    enablejsapi: '1',
    autoplay: '1',
    loop: '1',
    rel: '0',
    playsinline: '1',
    origin: origem,
  });
  if (link.tipo === 'playlist') {
    p.set('list', link.id);
    p.set('listType', 'playlist');
    const base = link.video ? `/embed/${link.video}` : '/embed/videoseries';
    return `https://www.youtube-nocookie.com${base}?${p}`;
  }
  // Vídeo sozinho repete com `playlist=` apontando para ele mesmo.
  p.set('playlist', link.id);
  return `https://www.youtube-nocookie.com/embed/${link.id}?${p}`;
}

/** URI que o player do Spotify entende. */
export function uriSpotify(link: LinkExterno): string {
  return `spotify:${link.tipo}:${link.id}`;
}

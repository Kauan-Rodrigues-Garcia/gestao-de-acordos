import { describe, expect, it } from 'vitest';
import { chaveDoLink, enderecoYoutube, lerLink, uriSpotify } from './links';

describe('lerLink', () => {
  it('lê playlist do Spotify, com e sem /intl-pt e parâmetros', () => {
    for (const url of [
      'https://open.spotify.com/playlist/37i9dQZF1DX8Uebhn9wzrS',
      'https://open.spotify.com/intl-pt/playlist/37i9dQZF1DX8Uebhn9wzrS?si=abc123',
      'open.spotify.com/playlist/37i9dQZF1DX8Uebhn9wzrS',
      'https://open.spotify.com/embed/playlist/37i9dQZF1DX8Uebhn9wzrS',
      'spotify:playlist:37i9dQZF1DX8Uebhn9wzrS',
    ]) {
      expect(lerLink(url), url).toMatchObject({ plataforma: 'spotify', tipo: 'playlist', id: '37i9dQZF1DX8Uebhn9wzrS' });
    }
  });

  it('lê álbum e música do Spotify', () => {
    expect(lerLink('https://open.spotify.com/album/4aawyAB9vmqN3uQ7FjRGTy')).toMatchObject({ tipo: 'album', rotulo: 'Spotify · Álbum' });
    expect(lerLink('https://open.spotify.com/track/11dFghVXANMlKmJXsNCbNl')).toMatchObject({ tipo: 'track', rotulo: 'Spotify · Música' });
  });

  it('lê playlist do YouTube e do YouTube Music', () => {
    const lista = 'PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG';
    expect(lerLink(`https://www.youtube.com/playlist?list=${lista}`)).toMatchObject({ plataforma: 'youtube', tipo: 'playlist', id: lista });
    expect(lerLink(`https://music.youtube.com/playlist?list=${lista}`)).toMatchObject({ rotulo: 'YouTube Music · Playlist' });
    // Vídeo dentro da lista: toca a lista, a partir do vídeo.
    expect(lerLink(`https://www.youtube.com/watch?v=jfKfPfyJRdk&list=${lista}`))
      .toMatchObject({ tipo: 'playlist', id: lista, video: 'jfKfPfyJRdk' });
  });

  it('lê vídeo sozinho do YouTube em todos os formatos', () => {
    for (const url of [
      'https://www.youtube.com/watch?v=jfKfPfyJRdk',
      'https://youtu.be/jfKfPfyJRdk',
      'https://m.youtube.com/watch?v=jfKfPfyJRdk',
      'https://www.youtube.com/live/jfKfPfyJRdk',
      'https://www.youtube.com/embed/jfKfPfyJRdk',
    ]) {
      expect(lerLink(url), url).toMatchObject({ plataforma: 'youtube', tipo: 'video', id: 'jfKfPfyJRdk' });
    }
  });

  it('o «Mix» automático do YouTube cai para o vídeo', () => {
    expect(lerLink('https://www.youtube.com/watch?v=jfKfPfyJRdk&list=RDjfKfPfyJRdk'))
      .toMatchObject({ tipo: 'video', id: 'jfKfPfyJRdk' });
  });

  it('recusa o que não toca', () => {
    for (const texto of [
      '', '   ', 'chuva', 'https://google.com', 'https://open.spotify.com/',
      'https://open.spotify.com/user/abc', 'https://www.youtube.com/', 'https://soundcloud.com/x/y',
      'javascript:alert(1)', 'https://open.spotify.com/playlist/<script>',
    ]) {
      expect(lerLink(texto), texto).toBeNull();
    }
  });
});

describe('endereços dos players', () => {
  it('a mesma playlist em links diferentes tem a mesma chave', () => {
    const a = lerLink('https://open.spotify.com/intl-pt/playlist/37i9dQZF1DX8Uebhn9wzrS?si=1')!;
    const b = lerLink('spotify:playlist:37i9dQZF1DX8Uebhn9wzrS')!;
    expect(chaveDoLink(a)).toBe(chaveDoLink(b));
    expect(uriSpotify(a)).toBe('spotify:playlist:37i9dQZF1DX8Uebhn9wzrS');
  });

  it('YouTube: lista em laço, API de mensagens ligada e sem cookie', () => {
    const lista = lerLink('https://www.youtube.com/playlist?list=PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG')!;
    const url = new URL(enderecoYoutube(lista, 'https://gestao.exemplo'));
    expect(url.hostname).toBe('www.youtube-nocookie.com');
    expect(url.pathname).toBe('/embed/videoseries');
    expect(url.searchParams.get('list')).toBe('PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG');
    expect(url.searchParams.get('enablejsapi')).toBe('1');
    expect(url.searchParams.get('loop')).toBe('1');
    expect(url.searchParams.get('origin')).toBe('https://gestao.exemplo');

    const video = lerLink('https://youtu.be/jfKfPfyJRdk')!;
    const uv = new URL(enderecoYoutube(video, 'https://gestao.exemplo'));
    expect(uv.pathname).toBe('/embed/jfKfPfyJRdk');
    // Vídeo sozinho só repete com `playlist=` apontando para ele.
    expect(uv.searchParams.get('playlist')).toBe('jfKfPfyJRdk');
  });
});

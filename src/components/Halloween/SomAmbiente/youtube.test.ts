import { describe, it, expect } from 'vitest';
import { desescapar, lerResposta, limparCanal, urlDoVideo } from './youtube';
import { lerLink, chaveDoLink } from './links';

describe('youtube.ts', () => {
  it('desescapa as entidades que a API devolve no título', () => {
    expect(desescapar('Marília &amp; Maiara - Don&#39;t &quot;stop&quot; &#x41;')).toBe('Marília & Maiara - Don\'t "stop" A');
    expect(desescapar('&inexistente; fica')).toBe('&inexistente; fica');
  });

  it('tira o «- Topic» do canal das gravadoras', () => {
    expect(limparCanal('Hungria - Topic')).toBe('Hungria');
    expect(limparCanal('Hungria Hip Hop')).toBe('Hungria Hip Hop');
  });

  it('lê a resposta, descartando o que vier torto', () => {
    const itens = lerResposta({
      items: [
        {
          id: { videoId: 'jfKfPfyJRdk' },
          snippet: {
            title: 'Lo-fi &amp; chill', channelTitle: 'Lofi Girl - Topic',
            thumbnails: { medium: { url: 'https://i.ytimg.com/vi/jfKfPfyJRdk/mqdefault.jpg' } },
          },
        },
        { id: { videoId: 'curto' }, snippet: { title: 'id ruim' } },
        { id: {}, snippet: { title: 'sem id' } },
        { id: { videoId: 'AAAAAAAAAAA' }, snippet: { title: '  ' } },
        { id: { videoId: 'BBBBBBBBBBB' }, snippet: { title: 'capa de fora', thumbnails: { medium: { url: 'https://evil.example/x.jpg' } } } },
        null,
      ],
    });
    expect(itens).toEqual([
      { video: 'jfKfPfyJRdk', titulo: 'Lo-fi & chill', canal: 'Lofi Girl', capa: 'https://i.ytimg.com/vi/jfKfPfyJRdk/mqdefault.jpg' },
      { video: 'BBBBBBBBBBB', titulo: 'capa de fora', canal: '', capa: 'https://i.ytimg.com/vi/BBBBBBBBBBB/mqdefault.jpg' },
    ]);
    expect(lerResposta(null)).toEqual([]);
    expect(lerResposta({ items: 'x' })).toEqual([]);
  });

  it('o endereço guardado é um link que o motor sabe tocar', () => {
    const link = lerLink(urlDoVideo('jfKfPfyJRdk'))!;
    expect(chaveDoLink(link)).toBe('youtube:video:jfKfPfyJRdk');
  });
});

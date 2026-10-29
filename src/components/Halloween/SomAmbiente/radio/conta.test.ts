import { describe, expect, it } from 'vitest';
import { chances, ehMaisNova, fase, janela, lerEstado, posicao, proximaVirada, type EstadoRadio } from './conta';
import { idDaPlaylist, idsDaPagina, musicasDosVideos, segundosDaDuracao } from './importar';
import { pontoDeSincronia } from '../motor';

const T0 = Date.parse('2026-10-29T15:00:00Z');
const m = (video: string, duracao_s = 180) => ({ video, titulo: video, canal: 'C', capa: null, duracao_s, estilo: 'Funk' });
const estado = (duracao_s = 180, candidatas = [m('bbbbbbbbbbb'), m('ccccccccccc'), m('ddddddddddd')]): EstadoRadio => ({
  no_ar: true, no_ar_desde: null,
  rodada: 4, atual: m('aaaaaaaaaaa', duracao_s), inicia_em: new Date(T0).toISOString(), candidatas, anterior: null,
});

describe('rádio — a conta', () => {
  it('a posição sai do relógio e fica entre 0 e a duração', () => {
    const e = estado();
    expect(posicao(e, T0 - 5000)).toBe(0);
    expect(posicao(e, T0 + 42_500)).toBe(42.5);
    expect(posicao(e, T0 + 999_000)).toBe(180);
    expect(posicao(null, T0)).toBe(0);
  });

  it('a votação abre 60 s antes do fim e fecha 5 s antes (a mesma do banco)', () => {
    const e = estado();
    expect(janela(e)).toEqual({ abre: T0 + 120_000, fecha: T0 + 175_000 });
    expect(fase(e, T0 + 119_000)).toBe('tocando');
    expect(fase(e, T0 + 121_000)).toBe('votando');
    expect(fase(e, T0 + 176_000)).toBe('encerrada');
    expect(fase(e, T0 + 999_000)).toBe('encerrada');
  });

  it('música curta: a votação abre no começo', () => {
    expect(janela(estado(40))?.abre).toBe(T0);
  });

  it('sem música, vazia; sem candidatas, só toca', () => {
    expect(fase(null, T0)).toBe('vazia');
    expect(fase({ ...estado(), atual: null, inicia_em: null }, T0)).toBe('vazia');
    expect(fase(estado(180, []), T0 + 150_000)).toBe('tocando');
  });

  it('desligada pelo super_admin vence tudo', () => {
    expect(fase({ ...estado(), no_ar: false }, T0 + 150_000)).toBe('desligada');
    expect(lerEstado({ rodada: 1 })?.no_ar).toBe(false);
    expect(lerEstado({ rodada: 1, no_ar: true, no_ar_desde: '2026-10-29T08:00:00Z' })).toMatchObject({ no_ar: true, no_ar_desde: '2026-10-29T08:00:00Z' });
  });

  it('o timer marca a próxima virada: abre, fecha, fim — e depois nada', () => {
    const e = estado();
    expect(proximaVirada(e, T0)).toBe(T0 + 120_000);
    expect(proximaVirada(e, T0 + 130_000)).toBe(T0 + 175_000);
    expect(proximaVirada(e, T0 + 177_000)).toBe(T0 + 180_000);
    expect(proximaVirada(e, T0 + 181_000)).toBeNull();
  });

  it('a chance é 1 + votos sobre o total', () => {
    expect(chances([0, 0, 0])).toEqual([1 / 3, 1 / 3, 1 / 3]);
    expect(chances([2, 0, 0])).toEqual([0.6, 0.2, 0.2]);
  });

  it('aviso de rodada velha não passa por cima', () => {
    expect(ehMaisNova({ ...estado(), rodada: 3 }, estado())).toBe(false);
    expect(ehMaisNova({ ...estado(), rodada: 5 }, estado())).toBe(true);
    expect(ehMaisNova(estado(), null)).toBe(true);
  });

  it('lê o que vem do banco sem confiar: capa de fora e vídeo torto saem', () => {
    const e = lerEstado({
      rodada: 2,
      atual: { video: 'aaaaaaaaaaa', titulo: 'A', canal: 'C', capa: 'https://malicioso/x.jpg', duracao_s: 100, estilo: 'Trap' },
      inicia_em: '2026-10-29T15:00:00Z',
      candidatas: [{ video: 'curto', duracao_s: 100 }, m('bbbbbbbbbbb')],
      anterior: { rodada: 1, motivo: 'pular', sorteada: 'aaaaaaaaaaa', votos: 3, candidatas: [{ ...m('aaaaaaaaaaa'), votos: 3 }] },
    });
    expect(e?.atual?.capa).toBeNull();
    expect(e?.candidatas.map(c => c.video)).toEqual(['bbbbbbbbbbb']);
    expect(e?.anterior).toMatchObject({ motivo: 'pular', votos: 3, candidatas: [{ votos: 3 }] });
    expect(lerEstado(null)).toBeNull();
    expect(lerEstado({ rodada: 'x' })).toBeNull();
  });
});

describe('rádio — sincronia', () => {
  it('só pula quando o player está mais de 3 s fora, e nunca no fim da música', () => {
    expect(pontoDeSincronia(50, 51.5, 180)).toBeNull();
    expect(pontoDeSincronia(40, 51, 180)).toBe(51);
    expect(pontoDeSincronia(60, 51, 180)).toBe(51);
    expect(pontoDeSincronia(null, 51, 180)).toBeNull();
    expect(pontoDeSincronia(100, 179, 180)).toBeNull();
  });
});

describe('rádio — importar playlist', () => {
  it('acha o id da playlist no link ou puro', () => {
    expect(idDaPlaylist('https://www.youtube.com/playlist?list=PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG')).toBe('PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG');
    expect(idDaPlaylist('https://music.youtube.com/playlist?list=OLAK5uy_abcdefghij')).toBe('OLAK5uy_abcdefghij');
    expect(idDaPlaylist('PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG')).toBe('PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG');
    expect(idDaPlaylist('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(idDaPlaylist('funk')).toBeNull();
  });

  it('lê a duração ISO 8601', () => {
    expect(segundosDaDuracao('PT3M25S')).toBe(205);
    expect(segundosDaDuracao('PT1H2M3S')).toBe(3723);
    expect(segundosDaDuracao('PT45S')).toBe(45);
    expect(segundosDaDuracao('P0D')).toBe(0);
    expect(segundosDaDuracao('xyz')).toBe(0);
    expect(segundosDaDuracao(undefined)).toBe(0);
  });

  it('a página da playlist dá os ids e a próxima página', () => {
    expect(idsDaPagina({
      nextPageToken: 'CDIQAA',
      items: [{ contentDetails: { videoId: 'aaaaaaaaaaa' } }, { contentDetails: { videoId: 'aaaaaaaaaaa' } }, { contentDetails: {} }],
    })).toEqual({ ids: ['aaaaaaaaaaa'], proxima: 'CDIQAA' });
    expect(idsDaPagina(null)).toEqual({ ids: [], proxima: null });
  });

  it('fica de fora o que a rádio não toca', () => {
    const v = (id: string, extra: Record<string, unknown> = {}) => ({
      id,
      snippet: { title: 'Música &amp; cia', channelTitle: 'Artista - Topic', thumbnails: { medium: { url: `https://i.ytimg.com/vi/${id}/mq.jpg` } } },
      contentDetails: { duration: 'PT3M' },
      status: { embeddable: true, privacyStatus: 'public' },
      ...extra,
    });
    const r = musicasDosVideos({
      items: [
        v('aaaaaaaaaaa'),
        v('bbbbbbbbbbb', { status: { embeddable: false, privacyStatus: 'public' } }),
        v('ccccccccccc', { status: { embeddable: true, privacyStatus: 'private' } }),
        v('ddddddddddd', { contentDetails: { duration: 'PT1H' } }),
        v('eeeeeeeeeee', { contentDetails: { duration: 'PT3M', regionRestriction: { blocked: ['BR'] } } }),
        v('fffffffffff', { contentDetails: { duration: 'PT3M', regionRestriction: { allowed: ['US'] } } }),
        v('ggggggggggg', { snippet: { title: 'Ao vivo', liveBroadcastContent: 'live' } }),
      ],
    });
    expect(r.fora).toBe(6);
    expect(r.musicas).toEqual([{
      video: 'aaaaaaaaaaa', titulo: 'Música & cia', canal: 'Artista', capa: 'https://i.ytimg.com/vi/aaaaaaaaaaa/mq.jpg', duracao_s: 180,
    }]);
  });
});

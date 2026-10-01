import { beforeEach, describe, expect, it } from 'vitest';
import {
  LIMITE_PLAYLISTS, PADRAO, VOLUME_PADRAO, gravarPreferencias, lerPreferencias, normalizar,
} from './preferencias';

const SPOTIFY = 'https://open.spotify.com/playlist/37i9dQZF1DX8Uebhn9wzrS';

describe('preferências do Som ambiente', () => {
  beforeEach(() => localStorage.clear());

  it('quem nunca abriu: tema do Halloween, volume baixo, não toca sozinho, em sequência', () => {
    expect(lerPreferencias('p1')).toEqual(PADRAO);
    expect(PADRAO.volume).toBe(VOLUME_PADRAO);
    expect(VOLUME_PADRAO).toBeLessThanOrEqual(25);
    expect(PADRAO.tocarAoEntrar).toBe(false);
    expect(PADRAO.repetir).toBe(false);
  });

  it('grava e lê por pessoa', () => {
    gravarPreferencias('p1', { faixa: 'candyman', volume: 55, tocarAoEntrar: true, repetir: true, playlists: [] });
    expect(lerPreferencias('p1')).toMatchObject({ faixa: 'candyman', volume: 55, tocarAoEntrar: true, repetir: true });
    expect(lerPreferencias('p2')).toEqual(PADRAO);
  });

  it('JSON quebrado volta ao padrão', () => {
    localStorage.setItem('som-ambiente:p1', '{quebrado');
    expect(lerPreferencias('p1')).toEqual(PADRAO);
  });

  it('prende o volume entre 0 e 100', () => {
    expect(normalizar({ volume: 180 }).volume).toBe(100);
    expect(normalizar({ volume: -3 }).volume).toBe(0);
    expect(normalizar({ volume: 'alto' }).volume).toBe(VOLUME_PADRAO);
  });

  it('faixa que não existe mais (playlist removida ou som antigo) volta para o padrão', () => {
    expect(normalizar({ faixa: 'spotify:playlist:sumiu' }).faixa).toBe('halloween');
    expect(normalizar({ faixa: 'chuva' }).faixa).toBe('halloween');
    expect(normalizar({ faixa: 'veigh' }).faixa).toBe('veigh');
  });

  it('playlists: descarta link ruim, repetido e o que passa do limite', () => {
    const muitas = Array.from({ length: LIMITE_PLAYLISTS + 5 }, (_, i) => ({
      url: `https://www.youtube.com/playlist?list=PLlista${String(i).padStart(10, '0')}`, nome: `L${i}`,
    }));
    const p = normalizar({
      playlists: [{ url: SPOTIFY, nome: '' }, { url: `${SPOTIFY}?si=x`, nome: 'dup' }, { url: 'lixo' }, 7, ...muitas],
    });
    expect(p.playlists).toHaveLength(LIMITE_PLAYLISTS);
    expect(p.playlists[0]).toEqual({ id: 'spotify:playlist:37i9dQZF1DX8Uebhn9wzrS', url: SPOTIFY, nome: 'Spotify · Playlist' });
  });

  it('mantém a playlist escolhida quando ela está salva', () => {
    const p = normalizar({ faixa: 'spotify:playlist:37i9dQZF1DX8Uebhn9wzrS', playlists: [{ url: SPOTIFY, nome: 'Foco' }] });
    expect(p.faixa).toBe('spotify:playlist:37i9dQZF1DX8Uebhn9wzrS');
    expect(p.playlists[0].nome).toBe('Foco');
  });
});

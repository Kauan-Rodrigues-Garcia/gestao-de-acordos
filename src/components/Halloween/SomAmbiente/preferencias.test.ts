import { beforeEach, describe, expect, it } from 'vitest';
import {
  BATMAN_LIGADO, LIMITE_PLAYLISTS, PADRAO, VOLUME_PADRAO, esquecerPosicao, gravarPosicao, gravarPreferencias, lerPosicao,
  lerPreferencias, normalizar,
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

  it('o padrão é 15%; quem ficou no padrão antigo (20, gravado antes da versão 2) desce junto', () => {
    expect(VOLUME_PADRAO).toBe(15);
    localStorage.setItem('som-ambiente:p1', JSON.stringify({ faixa: 'halloween', volume: 20 }));
    expect(lerPreferencias('p1').volume).toBe(15);
    // Escolheu outro volume: fica.
    localStorage.setItem('som-ambiente:p2', JSON.stringify({ faixa: 'halloween', volume: 35 }));
    expect(lerPreferencias('p2').volume).toBe(35);
    // Escolheu 20 já na versão nova: fica.
    gravarPreferencias('p3', { ...PADRAO, volume: 20 });
    expect(lerPreferencias('p3').volume).toBe(20);
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
    expect(normalizar({ faixa: 'pecadores' }).faixa).toBe('pecadores');
  });

  it('o tema do Batman está desligado: quem o tinha escolhido volta ao padrão', () => {
    expect(BATMAN_LIGADO).toBe(false);
    expect(normalizar({ faixa: 'batman' }).faixa).toBe('halloween');
  });

  it('a posição da música volta no F5: por pessoa, e só de faixa que existe', () => {
    gravarPosicao('p1', { faixa: 'candyman', t: 83.27 });
    expect(lerPosicao('p1')).toEqual({ faixa: 'candyman', t: 83.3 });
    expect(lerPosicao('p2')).toBeNull();
    esquecerPosicao('p1');
    expect(lerPosicao('p1')).toBeNull();
    localStorage.setItem('som-ambiente-posicao:p1', JSON.stringify({ faixa: 'sumiu', t: 10 }));
    expect(lerPosicao('p1')).toBeNull();
    localStorage.setItem('som-ambiente-posicao:p1', '{quebrado');
    expect(lerPosicao('p1')).toBeNull();
    localStorage.setItem('som-ambiente-posicao:p1', JSON.stringify({ faixa: 'sexta13', t: -5 }));
    expect(lerPosicao('p1')).toEqual({ faixa: 'sexta13', t: 0 });
    // Faixa desligada (o Batman) não volta no F5.
    localStorage.setItem('som-ambiente-posicao:p1', JSON.stringify({ faixa: 'batman', t: 10 }));
    expect(lerPosicao('p1')).toBeNull();
  });

  it('quem tinha a música do Veigh que saiu fica com «Puxa o Lança»', () => {
    expect(normalizar({ faixa: 'veigh' }).faixa).toBe('puxalanca');
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

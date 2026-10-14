import { describe, expect, it } from 'vitest';
import {
  VOLUME_MAX_ENXUTO, dentroDosLimites, ganhoDoVolume, ordemDasFaixas, proximaEmbutida, vizinha, volumeDaFaixa,
} from './motor';
import { FAIXAS_EMBUTIDAS, GANHO, MUSICAS, PADRAO, TEMAS_DE_TERROR } from './preferencias';

describe('motor do Som ambiente', () => {
  it('volume: 0 cala, 100 é cheio, e o padrão fica baixo', () => {
    expect(ganhoDoVolume(0)).toBe(0);
    expect(ganhoDoVolume(100)).toBe(1);
    expect(ganhoDoVolume(PADRAO.volume)).toBeLessThan(0.15);
    expect(ganhoDoVolume(150)).toBe(1);
    expect(ganhoDoVolume(-1)).toBe(0);
    expect(ganhoDoVolume(60)).toBeGreaterThan(ganhoDoVolume(40));
  });

  it('próxima e anterior dão a volta pela lista, com as playlists no fim', () => {
    const prefs = { ...PADRAO, playlists: [{ id: 'youtube:playlist:X', url: '', nome: 'X' }] };
    expect(ordemDasFaixas(prefs)).toEqual([
      'saw', 'deadsilence', 'it', 'halloween', 'stranger',
      'provavelmente', 'doiwannaknow', 'novobalanco', 'raindance', 'leao',
      'poesiaacustica', 'vidachique', 'malvadinho', 'infiel', 'innerbloom', 'deixemeir', 'somebody',
      'youtube:playlist:X',
    ]);
    expect(vizinha(prefs, 'somebody', 1)).toBe('youtube:playlist:X');
    expect(vizinha(prefs, 'youtube:playlist:X', 1)).toBe('saw');
    expect(vizinha(prefs, 'saw', -1)).toBe('youtube:playlist:X');
    expect(vizinha(prefs, 'sumiu', 1)).toBe('saw');
  });

  it('enxuto: sem playlists na lista e no anterior/próxima', () => {
    const prefs = { ...PADRAO, playlists: [{ id: 'youtube:playlist:X', url: '', nome: 'X' }] };
    expect(ordemDasFaixas(prefs, false)).toEqual([
      'saw', 'deadsilence', 'it', 'halloween', 'stranger',
      'provavelmente', 'doiwannaknow', 'novobalanco', 'raindance', 'leao',
      'poesiaacustica', 'vidachique', 'malvadinho', 'infiel', 'innerbloom', 'deixemeir', 'somebody',
    ]);
    expect(vizinha(prefs, 'somebody', 1, false)).toBe('saw');
  });

  it('enxuto: volume até 50 e faixa de fábrica; completo não muda nada', () => {
    const salvas = { ...PADRAO, volume: 90, faixa: 'youtube:playlist:X', playlists: [{ id: 'youtube:playlist:X', url: '', nome: 'X' }] };
    expect(VOLUME_MAX_ENXUTO).toBe(50);
    expect(dentroDosLimites(salvas, false)).toMatchObject({ volume: 50, faixa: 'halloween' });
    // As playlists continuam guardadas — só não tocam.
    expect(dentroDosLimites(salvas, false).playlists).toHaveLength(1);
    expect(dentroDosLimites(salvas, true)).toBe(salvas);
    expect(dentroDosLimites({ ...PADRAO, volume: 30 }, false).volume).toBe(30);
  });

  it('no fim de uma faixa de fábrica, a sequência fica no grupo dela e dá a volta', () => {
    expect(proximaEmbutida('halloween')).toBe('stranger');
    expect(proximaEmbutida('raindance')).toBe('leao');
    expect(proximaEmbutida('leao')).toBe('poesiaacustica');
    // A última música volta à primeira música, não cai nos temas (14/10/2026).
    expect(proximaEmbutida('somebody')).toBe('provavelmente');
    expect(proximaEmbutida(MUSICAS[MUSICAS.length - 1])).toBe(MUSICAS[0]);
    // E o último tema volta ao primeiro tema.
    expect(proximaEmbutida(TEMAS_DE_TERROR[TEMAS_DE_TERROR.length - 1])).toBe(TEMAS_DE_TERROR[0]);
  });

  it('cada faixa tem o seu ganho, e o volume final nunca passa de 1', () => {
    for (const f of FAIXAS_EMBUTIDAS) {
      // «Leão» veio a -7,0 LUFS: o menor ganho, exatamente 0,5.
      expect(GANHO[f]).toBeGreaterThanOrEqual(0.5);
      // «Somebody That I Used To Know» veio a -22,1 LUFS: o maior ganho, 2,86.
      expect(GANHO[f]).toBeLessThan(3);
    }
    // A mais baixa sobe, a mais alta desce, no mesmo controle.
    expect(volumeDaFaixa(40, 'it')).toBeGreaterThan(volumeDaFaixa(40, 'leao'));
    expect(volumeDaFaixa(100, 'it')).toBe(1);
    expect(volumeDaFaixa(0, 'it')).toBe(0);
    expect(volumeDaFaixa(40, null)).toBe(ganhoDoVolume(40));
  });
});

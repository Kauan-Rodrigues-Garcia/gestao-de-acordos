import { describe, expect, it } from 'vitest';
import { ganhoDoVolume, ordemDasFaixas, proximaEmbutida, vizinha } from './motor';
import { PADRAO } from './preferencias';

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
    expect(ordemDasFaixas(prefs)).toEqual(['halloween', 'sexta13', 'candyman', 'veigh', 'youtube:playlist:X']);
    expect(vizinha(prefs, 'veigh', 1)).toBe('youtube:playlist:X');
    expect(vizinha(prefs, 'youtube:playlist:X', 1)).toBe('halloween');
    expect(vizinha(prefs, 'halloween', -1)).toBe('youtube:playlist:X');
    expect(vizinha(prefs, 'sumiu', 1)).toBe('halloween');
  });

  it('no fim de uma faixa de fábrica, a sequência segue só pelas quatro', () => {
    expect(proximaEmbutida('halloween')).toBe('sexta13');
    expect(proximaEmbutida('veigh')).toBe('halloween');
  });
});

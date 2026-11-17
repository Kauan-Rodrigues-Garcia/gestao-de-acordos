import { describe, expect, it } from 'vitest';
import { faixaDaPosicao, nomeDoArquivo, parteDoDano, tituloDaPosicao, TITULOS_TROPA } from './carta';
import { agruparGuerras, type LinhaDaGuerra } from './banco';

describe('cartas da Guerra', () => {
  it('a arte muda no 4º e no 11º', () => {
    expect([1, 2, 3, 4, 10, 11, 80].map(faixaDaPosicao)).toEqual(['lenda', 'lenda', 'lenda', 'frente', 'frente', 'tropa', 'tropa']);
  });

  it('cada lugar tem título, e do 11º em diante eles se revezam', () => {
    expect(tituloDaPosicao(1)).toBe('Lenda da Guerra');
    expect(tituloDaPosicao(10)).toBe('Muralha Viva');
    expect(tituloDaPosicao(11)).toBe(TITULOS_TROPA[0]);
    expect(tituloDaPosicao(11 + TITULOS_TROPA.length)).toBe(TITULOS_TROPA[0]);
  });

  it('a parte do dano tem uma casa e não some quando é pequena', () => {
    expect(parteDoDano(137, 1000)).toBe('13,7%');
    expect(parteDoDano(1, 5000)).toBe('< 0,1%');
    expect(parteDoDano(5, 0)).toBe('—');
  });

  it('o arquivo leva o lugar com zeros e tira o que o Windows não aceita', () => {
    expect(nomeDoArquivo({ posicao: 3, nome: 'Maria: Silva?', participantes: 120 })).toBe('003 - Maria Silva.png');
  });

  it('uma guerra por corrida, a mais nova primeiro, na ordem do ranking', () => {
    const l = (usuario: string, dano: number, corrida_id: number, caiu_em: string): LinhaDaGuerra => ({ usuario, nome: usuario, foto: null, dano, corrida_id, caiu_em });
    const gs = agruparGuerras([
      l('b', 50, 7, '2026-10-23T16:00:00Z'), l('a', 50, 7, '2026-10-23T16:00:00Z'), l('c', 90, 7, '2026-10-23T16:00:00Z'),
      l('z', 0, 7, '2026-10-23T16:00:00Z'), l('x', 10, 9, '2026-10-24T16:00:00Z'),
    ]);
    expect(gs.map(g => g.corrida)).toEqual([9, 7]);
    expect(gs[1].linhas.map(x => x.usuario)).toEqual(['c', 'a', 'b']);
  });
});

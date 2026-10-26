import { describe, expect, it } from 'vitest';
import { montarAlbuns, type LinhaCaca, type LinhaGolpe } from './insignias';
import { INSIGNIAS_SEM_GRUPO, detalhar, explicar, ordenarPorPontos, pontos } from './pontuacao';

const caca = (p: Partial<LinhaCaca>): LinhaCaca => ({
  achada_por: 'ana', achada_por_nome: 'Ana', achada_por_foto: null, achada_por_setor: null,
  achada_em: '2026-10-10T15:00:00Z', tema: 'zumbis', zumbi: 2, bruxa: null, ...p,
});
const bruxa = (p: Partial<LinhaCaca>) => caca({ tema: 'bruxas', zumbi: null, bruxa: 1, ...p });
const golpe = (p: Partial<LinhaGolpe>): LinhaGolpe => ({
  usuario: 'ana', nome: 'Ana', foto: null, dano: 120, rodada_id: 1,
  derrotado_em: '2026-10-09T18:00:00Z', golpe_final_por: null, ...p,
});

describe('pontuação das medalhas', () => {
  it('toda insígnia está num grupo (caça ou chefe)', () => {
    expect(INSIGNIAS_SEM_GRUPO).toEqual([]);
  });

  it('soma insígnias, pegos, tiros na cabeça, chefes e golpe final', () => {
    const a = montarAlbuns(
      [caca({ headshot: true }), caca({}), bruxa({ tiro: 'cabeca' })],
      [golpe({ rodada_id: 1 }), golpe({ rodada_id: 2, golpe_final_por: 'ana' })],
      [],
      [golpe({ rodada_id: 9 })],
    ).get('ana')!;
    expect(detalhar(a)).toEqual({ insignias: 4, pegos: 3, naCabeca: 2, chefesDerrotados: 3, golpesFinais: 1 });
    // 4×100 + 3×5 + 2×10 + 3×20 + 1×50
    expect(pontos(a)).toBe(545);
    expect(explicar(a)).toBe(
      'Insígnias 4 × 100 = 400 · Zumbis e bruxas 3 × 5 = 15 · Na cabeça 2 × 10 = 20 · Chefes derrotados 3 × 20 = 60 · Golpe final 1 × 50 = 50 · Total 545');
  });

  it('sem nada é zero', () => {
    expect(pontos({ conquistas: {} })).toBe(0);
    expect(explicar({ conquistas: {} })).toBe('Total 0');
  });

  it('desempata as cinco insígnias pelo que cada um fez nelas', () => {
    const tudo = (u: string, extraZumbis: number) => [
      ...Array.from({ length: 1 + extraZumbis }, () => caca({ achada_por: u, achada_por_nome: u })),
      bruxa({ achada_por: u, achada_por_nome: u }),
    ];
    const chefes = (u: string) => [golpe({ usuario: u, nome: u })];
    const albuns = montarAlbuns(
      [...tudo('bia', 0), ...tudo('caio', 4)],
      [...chefes('bia'), ...chefes('caio')],
      [...chefes('bia'), ...chefes('caio')],
      [...chefes('bia'), ...chefes('caio')],
    );
    expect(ordenarPorPontos(albuns.values()).map(a => a.usuario)).toEqual(['caio', 'bia']);
  });

  it('empate de pontos: quem completou antes', () => {
    const albuns = montarAlbuns([
      caca({ achada_por: 'a', achada_por_nome: 'A', achada_em: '2026-10-09T00:00:00Z' }),
      caca({ achada_por: 'b', achada_por_nome: 'B', achada_em: '2026-10-08T00:00:00Z' }),
    ], [], []);
    expect(ordenarPorPontos(albuns.values()).map(a => a.usuario)).toEqual(['b', 'a']);
  });
});

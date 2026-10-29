import { describe, expect, it } from 'vitest';
import {
  INSIGNIAS, TOTAL_INSIGNIAS, albumGuardado, albumLiberado, guardarAlbum, insigniaDaCaca, montarAlbuns, novasInsignias, ordenarAlbuns, quantas,
  type LinhaCaca, type LinhaGolpe,
} from './insignias';

const caca = (p: Partial<LinhaCaca>): LinhaCaca => ({
  achada_por: 'ana', achada_por_nome: 'Ana Souza', achada_por_foto: null, achada_por_setor: null,
  achada_em: '2026-10-10T15:00:00Z', tema: 'zumbis', zumbi: 2, bruxa: null, ...p,
});
const golpe = (p: Partial<LinhaGolpe>): LinhaGolpe => ({
  usuario: 'ana', nome: 'Ana Souza', foto: null, dano: 120, rodada_id: 1,
  derrotado_em: '2026-10-09T18:00:00Z', golpe_final_por: null, ...p,
});

describe('super admin: todas liberadas', () => {
  it('completa o álbum sem mexer no que ele ganhou de verdade', () => {
    const ana = montarAlbuns([caca({ zumbi: 3 })], [], []).get('ana')!;
    const liberado = albumLiberado(ana, 'ana', '2026-10-29T12:00:00Z');
    expect(quantas(liberado)).toBe(TOTAL_INSIGNIAS);
    expect(liberado.conquistas.zumbi).toEqual(ana.conquistas.zumbi);
    expect(liberado.conquistas.guerra?.primeiraEm).toBe('2026-10-29T12:00:00Z');
    expect(quantas(ana)).toBe(1);
    expect(quantas(albumLiberado(null, 'cleber', 'x'))).toBe(TOTAL_INSIGNIAS);
  });
});

describe('álbum de insígnias', () => {
  it('são cinco: as quatro das gincanas e a do Cavalo da Guerra', () => {
    expect(TOTAL_INSIGNIAS).toBe(5);
    expect(INSIGNIAS.map(i => i.id)).toEqual(['zumbi', 'reiDoPop', 'bruxas', 'pantano', 'guerra']);
  });

  it('o Cavalo da Guerra conta como os chefes: dano numa luta em que ele caiu', () => {
    const a = montarAlbuns([], [], [], [
      golpe({ rodada_id: 7, dano: 340, derrotado_em: '2026-10-23T18:00:00Z' }),
      golpe({ rodada_id: 9, dano: 90, derrotado_em: '2026-10-24T18:00:00Z' }),
      golpe({ rodada_id: 11, dano: 50, derrotado_em: null }),   // fugiu: não conta
    ]).get('ana')!;
    expect(a.conquistas.guerra).toMatchObject({ vezes: 2, maiorDano: 340, primeiraEm: '2026-10-23T18:00:00Z' });
    expect(quantas(a)).toBe(1);
  });

  it('zumbi conta só com o desenho (a abóbora de antes de 07/10 não)', () => {
    expect(insigniaDaCaca({ tema: 'zumbis', zumbi: 0 })).toBe('zumbi');
    expect(insigniaDaCaca({ tema: 'zumbis', zumbi: null })).toBeNull();
    expect(insigniaDaCaca({ tema: 'bruxas', zumbi: null })).toBe('bruxas');
  });

  it('soma as vezes, guarda a primeira data e o desenho mais recente', () => {
    const a = montarAlbuns([
      caca({ achada_em: '2026-10-12T10:00:00Z', zumbi: 5 }),
      caca({ achada_em: '2026-10-08T10:00:00Z', zumbi: 1 }),
      caca({ achada_em: '2026-10-05T10:00:00Z', zumbi: null }), // abóbora
      caca({ tema: 'bruxas', zumbi: null, bruxa: 3, achada_em: '2026-10-15T10:00:00Z' }),
    ], [], []).get('ana')!;
    expect(a.conquistas.zumbi).toMatchObject({ vezes: 2, primeiraEm: '2026-10-08T10:00:00Z', desenho: 5 });
    expect(a.conquistas.bruxas).toMatchObject({ vezes: 1, desenho: 3 });
    expect(quantas(a)).toBe(2);
  });

  it('conta os tiros na cabeça e guarda o tempo mais rápido', () => {
    const a = montarAlbuns([
      caca({ headshot: true, ms: 9000 }),
      caca({ headshot: false, ms: 4200 }),
      caca({ tema: 'bruxas', zumbi: null, bruxa: 1, tiro: 'cabeca', ms: null }),
      caca({ tema: 'bruxas', zumbi: null, bruxa: 1, tiro: 'vassoura', ms: 3100 }),
    ], [], []).get('ana')!;
    expect(a.conquistas.zumbi).toMatchObject({ headshots: 1, melhorMs: 4200 });
    expect(a.conquistas.bruxas).toMatchObject({ headshots: 1, melhorMs: 3100 });
  });

  it('chefe: só rodada derrotada e com dano; golpe final e maior dano', () => {
    const albuns = montarAlbuns([], [
      golpe({ rodada_id: 1, dano: 80 }),
      golpe({ rodada_id: 2, dano: 300, golpe_final_por: 'ana', derrotado_em: '2026-10-11T18:00:00Z' }),
      golpe({ usuario: 'bia', nome: 'Bia', dano: 0 }),
      golpe({ usuario: 'caio', nome: 'Caio', derrotado_em: null }),
    ], [golpe({ usuario: 'bia', nome: 'Bia Lima', derrotado_em: '2026-10-17T19:00:00Z' })]);
    expect(albuns.get('ana')!.conquistas.reiDoPop).toMatchObject({ vezes: 2, golpeFinal: true, maiorDano: 300 });
    expect(albuns.get('bia')!.conquistas).toEqual({ pantano: expect.objectContaining({ vezes: 1 }) });
    expect(albuns.has('caio')).toBe(false);
  });

  it('nome e foto: os mais recentes que a gincana gravou', () => {
    const a = montarAlbuns([
      caca({ achada_por_nome: 'Ana', achada_em: '2026-10-08T10:00:00Z' }),
      caca({ achada_por_nome: 'Ana Souza Lima', achada_por_foto: 'f.jpg', achada_em: '2026-10-12T10:00:00Z' }),
    ], [], []).get('ana')!;
    expect(a).toMatchObject({ nome: 'Ana Souza Lima', foto: 'f.jpg' });
  });

  it('ordena por quem tem mais, depois por quem completou antes', () => {
    const albuns = montarAlbuns([
      caca({ achada_por: 'a', achada_por_nome: 'A', achada_em: '2026-10-09T00:00:00Z' }),
      caca({ achada_por: 'b', achada_por_nome: 'B', achada_em: '2026-10-08T00:00:00Z' }),
      caca({ achada_por: 'c', achada_por_nome: 'C', tema: 'bruxas', zumbi: null, bruxa: 0 }),
    ], [golpe({ usuario: 'c', nome: 'C' })], []);
    expect(ordenarAlbuns(albuns.values()).map(a => a.usuario)).toEqual(['c', 'b', 'a']);
  });

  it('insígnia nova: a que tem e não viu; álbum nunca aberto = todas', () => {
    expect(novasInsignias(['zumbi', 'bruxas'], ['zumbi'])).toEqual(['bruxas']);
    expect(novasInsignias(['zumbi'], null)).toEqual(['zumbi']);
    expect(novasInsignias([], null)).toEqual([]);
  });
});

describe('álbum guardado no navegador (as medalhas aparecem na hora)', () => {
  it('guarda e devolve o álbum da pessoa', () => {
    const a = montarAlbuns([caca({})], [], []).get('ana')!;
    guardarAlbum('ana', a);
    expect(albumGuardado('ana')?.conquistas.zumbi?.vezes).toBe(1);
  });

  it('sem insígnia também é resposta: mostra só as «?» na hora', () => {
    guardarAlbum('bia', null);
    expect(albumGuardado('bia')).toMatchObject({ usuario: 'bia', conquistas: {} });
  });

  it('ignora o que estiver estragado, de outra pessoa ou de insígnia que não existe', () => {
    localStorage.setItem('insignias:album:v1:caio', '{não é json');
    expect(albumGuardado('caio')).toBeNull();
    localStorage.setItem('insignias:album:v1:davi', JSON.stringify({ usuario: 'outro', conquistas: {} }));
    expect(albumGuardado('davi')).toBeNull();
    localStorage.setItem('insignias:album:v1:eva', JSON.stringify({ usuario: 'eva', conquistas: { zumbi: { vezes: 1, primeiraEm: 'x' }, fantasma: { vezes: 1, primeiraEm: 'x' } } }));
    expect(Object.keys(albumGuardado('eva')!.conquistas)).toEqual(['zumbi']);
  });
});

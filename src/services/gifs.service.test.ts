/**
 * gifs.service.test.ts — as buscas salvas de GIF.
 *
 * O que se perde se isto quebrar: a mesma busca gastando chamada do GIPHY toda
 * vez, ou um GIF de fora do GIPHY entrando pela lista guardada.
 */
import { describe, it, expect } from 'vitest';
import {
  MAX_BUSCAS_LOCAIS, VALIDADE_BUSCA_MS, buscaFresca, gifsDoJson, mesclarBuscas, normalizarTermo,
  type BuscaSalva,
} from './gifs.service';

describe('normalizarTermo', () => {
  it('"  Meta   BATIDA " e "meta batida" são a mesma busca', () => {
    expect(normalizarTermo('  Meta   BATIDA ')).toBe('meta batida');
    expect(normalizarTermo('PARABÉNS')).toBe('parabéns');
  });

  it('corta em 60 caracteres', () => {
    expect(normalizarTermo('a'.repeat(100))).toHaveLength(60);
  });
});

describe('buscaFresca', () => {
  const agora = Date.parse('2026-10-15T12:00:00Z');
  it('vale por 7 dias', () => {
    expect(buscaFresca(new Date(agora - VALIDADE_BUSCA_MS + 60_000).toISOString(), agora)).toBe(true);
    expect(buscaFresca(new Date(agora - VALIDADE_BUSCA_MS - 60_000).toISOString(), agora)).toBe(false);
  });
  it('data ruim conta como vencida', () => {
    expect(buscaFresca('ontem', agora)).toBe(false);
  });
});

describe('gifsDoJson', () => {
  it('fica só com GIFs do GIPHY', () => {
    const lista = gifsDoJson([
      { id: '1', url: 'https://media.giphy.com/a.gif', previa: 'https://media.giphy.com/a.webp', largura: 200, altura: 100 },
      { id: '2', url: 'https://outro.site/b.gif' },
      null,
      'lixo',
    ]);
    expect(lista).toHaveLength(1);
    expect(lista[0].id).toBe('1');
  });

  it('prévia de fora cai na URL principal', () => {
    const [g] = gifsDoJson([{ id: '1', url: 'https://media.giphy.com/a.gif', previa: 'https://x.y/z.gif' }]);
    expect(g.previa).toBe('https://media.giphy.com/a.gif');
  });

  it('não-array vira lista vazia', () => {
    expect(gifsDoJson({})).toEqual([]);
    expect(gifsDoJson(null)).toEqual([]);
  });
});

describe('mesclarBuscas', () => {
  const b = (termo: string): BuscaSalva => ({ termo, gifs: [], atualizado_em: '2026-10-15T00:00:00Z' });

  it('mais nova primeiro, sem repetir termo', () => {
    expect(mesclarBuscas([b('a'), b('b')], b('b')).map((x) => x.termo)).toEqual(['b', 'a']);
  });

  it('respeita o teto', () => {
    const muitas = Array.from({ length: MAX_BUSCAS_LOCAIS }, (_, i) => b(`t${i}`));
    const r = mesclarBuscas(muitas, b('nova'));
    expect(r).toHaveLength(MAX_BUSCAS_LOCAIS);
    expect(r[0].termo).toBe('nova');
  });
});

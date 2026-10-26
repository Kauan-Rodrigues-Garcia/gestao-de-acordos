/**
 * O «Entrou agora» do desafio do dia (26/10/2026): uma comparação por desafio,
 * compartilhada pelas telas.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { PlacarDoDia } from '@/services/desafios/desafioDoDia';
import { COMPARACAO_MAX_MS, LOTES_NO_FEED, feedDoDesafio, registrarLeitura, zerarEntradas } from '../entradasDoDia';

const MIN = 60_000;

function placar(totais: Record<string, number>, receptivo = 0): PlacarDoDia {
  return {
    suportado: true, regraSetor: 'nosso_produto', publico: 'setor',
    total: 0, qtd: 0,
    contribuintes: Object.entries(totais).map(([id, total]) => ({
      id, nome: `Pessoa ${id}`, fotoUrl: null, equipe: null, total, qtd: 1, ultima: null,
    })),
    contribuicaoReceptivo: { total: receptivo, qtd: receptivo ? 1 : 0 },
    semOperador: { total: 0, qtd: 0 },
    ultimaChegada: null, metaMes: null, feriados: [], participo: true, acompanho: false,
  };
}

beforeEach(() => zerarEntradas());

describe('entradasDoDia', () => {
  it('a primeira leitura é o placar que já existia, não entrada', () => {
    registrarLeitura('d1', placar({ ana: 500 }), 1_000);
    expect(feedDoDesafio('d1')).toEqual([]);
  });

  it('o que subiu entre duas leituras vira um lote, o mais novo primeiro', () => {
    registrarLeitura('d1', placar({ ana: 500 }), 0);
    registrarLeitura('d1', placar({ ana: 650, bia: 200 }), 5 * MIN);
    registrarLeitura('d1', placar({ ana: 650, bia: 200 }, 300), 10 * MIN);
    const feed = feedDoDesafio('d1');
    expect(feed).toHaveLength(2);
    expect(feed[0].entradas.map(e => e.id)).toEqual(['setor:receptivo']);
    expect(feed[1].entradas.map(e => [e.id, e.valor])).toEqual([['bia', 200], ['ana', 150]]);
  });

  it('a mesma leitura vista por duas telas (mesmo cache) conta uma vez só', () => {
    registrarLeitura('d1', placar({ ana: 500 }), 0);
    const nova = placar({ ana: 800 });
    registrarLeitura('d1', nova, 5 * MIN);   // a pílula
    registrarLeitura('d1', nova, 5 * MIN);   // a gaveta, com o mesmo cache
    expect(feedDoDesafio('d1')).toHaveLength(1);
  });

  it('depois de um buraco longo não anuncia o acumulado como «agora»', () => {
    registrarLeitura('d1', placar({ ana: 500 }), 0);
    registrarLeitura('d1', placar({ ana: 5_000 }), COMPARACAO_MAX_MS + 1);
    expect(feedDoDesafio('d1')).toEqual([]);
  });

  it('um desafio não se compara com outro', () => {
    registrarLeitura('d1', placar({ ana: 500 }), 0);
    registrarLeitura('d2', placar({ bia: 9_000, caio: 3_000 }), 5 * MIN);
    expect(feedDoDesafio('d2')).toEqual([]);
    expect(feedDoDesafio('d1')).toEqual([]);
  });

  it('quem só lê ao abrir atualiza a comparação mas não anuncia', () => {
    registrarLeitura('d1', placar({ ana: 500 }), 0, false);
    registrarLeitura('d1', placar({ ana: 900 }), 30 * MIN, false);
    expect(feedDoDesafio('d1')).toEqual([]);
    registrarLeitura('d1', placar({ ana: 1_000 }), 35 * MIN, true);
    expect(feedDoDesafio('d1')[0].entradas[0].valor).toBe(100);
  });

  it('estorno não é anunciado, e o card guarda só os últimos lotes', () => {
    registrarLeitura('d1', placar({ ana: 500 }), 0);
    registrarLeitura('d1', placar({ ana: 380 }), MIN);
    expect(feedDoDesafio('d1')).toEqual([]);
    for (let i = 1; i <= LOTES_NO_FEED + 2; i++) registrarLeitura('d1', placar({ ana: 380 + i * 10 }), (i + 1) * MIN);
    expect(feedDoDesafio('d1')).toHaveLength(LOTES_NO_FEED);
  });
});

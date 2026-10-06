/**
 * metaBatida.test.ts — quem aparece em verde, e o que o pre-save diz.
 *
 * O que se perde se isto quebrar: alguém que bateu a meta não aparece para o
 * líder, ou aparece quem não bateu — e o modelo pronto sai com texto estourado.
 */
import { describe, it, expect } from 'vitest';
import { cruzarMetas, presetMetaBatida, jaComemoradosNoMes } from './metaBatida';

const pessoas = [
  { id: 'a', nome: 'Ana Paula Souza', foto_url: null },
  { id: 'b', nome: 'Bruno', foto_url: null },
  { id: 'c', nome: 'Carla de Lima', foto_url: null },
];

describe('cruzarMetas', () => {
  it('marca quem chegou na meta, inclusive exatamente nela', () => {
    const r = cruzarMetas(
      [{ referencia_id: 'a', meta_valor: 1000 }, { referencia_id: 'b', meta_valor: 2000 }],
      [{ operador_id: 'a', total_recebido: 1000 }, { operador_id: 'b', total_recebido: '1500' }],
      pessoas,
    );
    expect(r.map((o) => [o.id, o.bateu, o.pct])).toEqual([['a', true, 100], ['b', false, 75]]);
  });

  it('quem bateu vem primeiro, e entre eles a maior %', () => {
    const r = cruzarMetas(
      [
        { referencia_id: 'a', meta_valor: 1000 },
        { referencia_id: 'b', meta_valor: 1000 },
        { referencia_id: 'c', meta_valor: 1000 },
      ],
      [
        { operador_id: 'a', total_recebido: 1100 },
        { operador_id: 'b', total_recebido: 900 },
        { operador_id: 'c', total_recebido: 1500 },
      ],
      pessoas,
    );
    expect(r.map((o) => o.id)).toEqual(['c', 'a', 'b']);
  });

  it('ignora meta zerada e gente fora da lista visível', () => {
    const r = cruzarMetas(
      [{ referencia_id: 'a', meta_valor: 0 }, { referencia_id: 'x', meta_valor: 500 }],
      [{ operador_id: 'x', total_recebido: 900 }],
      pessoas,
    );
    expect(r).toEqual([]);
  });

  it('sem recebido conta zero, não some', () => {
    const r = cruzarMetas([{ referencia_id: 'b', meta_valor: 500 }], [], pessoas);
    expect(r[0]).toMatchObject({ id: 'b', recebido: 0, pct: 0, bateu: false });
  });
});

describe('presetMetaBatida', () => {
  it('uma pessoa: nome curto e % só quando passou de 100', () => {
    expect(presetMetaBatida([{ nome: 'Ana Paula Souza', pct: 118 }], 'Outubro').mensagem)
      .toBe('Ana Paula bateu 118% da meta de outubro! Dedicação que inspira o time todo. 🏆');
    expect(presetMetaBatida([{ nome: 'Carla de Lima', pct: 100 }], 'Outubro').mensagem)
      .toMatch(/^Carla bateu a meta de outubro!/);
  });

  it('cabe nos limites do formulário', () => {
    const p = presetMetaBatida([{ nome: 'X'.repeat(200), pct: 999 }], 'Setembro');
    expect(p.titulo.length).toBeLessThanOrEqual(40);
    expect(p.mensagem.length).toBeLessThanOrEqual(140);
  });

  it('várias pessoas: mensagem coletiva', () => {
    expect(presetMetaBatida([{ nome: 'A' }, { nome: 'B' }], 'Outubro').mensagem)
      .toMatch(/^Meta de outubro batida!/);
  });
});

describe('jaComemoradosNoMes', () => {
  it('conta só o mês e ignora as canceladas', () => {
    const ids = jaComemoradosNoMes([
      { inicia_em: '2026-10-05T15:00:00Z', cancelada_em: null, homenageados: [{ id: 'a' }] },
      { inicia_em: '2026-10-05T15:00:00Z', cancelada_em: '2026-10-05T15:01:00Z', homenageados: [{ id: 'b' }] },
      { inicia_em: '2026-09-15T15:00:00Z', cancelada_em: null, homenageados: [{ id: 'c' }] },
    ], '2026-10');
    expect([...ids]).toEqual(['a']);
  });
});

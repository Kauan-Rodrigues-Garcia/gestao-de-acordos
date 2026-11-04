import { describe, expect, it } from 'vitest';
import { TOLERANCIA_MS, proximoToque, resumoDosDias, type Agendamento } from './horario';

/** Um instante em São Paulo (UTC−3). */
const sp = (dia: number, h: number, m = 0) => Date.UTC(2026, 9, dia, h + 3, m);

const ag = (over: Partial<Agendamento> = {}): Agendamento => ({
  id: 'a', hora: '09:00', dias: [1, 2, 3, 4, 5], cor: 'azul', duracao_s: 10, descricao: null, volume: 50, ...over,
});

describe('proximoToque', () => {
  it('toca hoje às 9h de São Paulo (qui 29/10)', () => {
    const t = proximoToque([ag()], sp(29, 8));
    expect(t).toMatchObject({ quando: sp(29, 9), chave: 'a:2026-10-29', cor: 'azul', duracaoMs: 10_000, volume: 50 });
  });

  it('passou da hora (fora da tolerância): vai para o próximo dia da semana', () => {
    expect(proximoToque([ag()], sp(29, 10))?.quando).toBe(sp(30, 9));
    // sexta 10h → segunda 2/11, 9h (pula o fim de semana)
    expect(proximoToque([ag()], sp(30, 10))?.quando).toBe(Date.UTC(2026, 10, 2, 12));
  });

  it('ainda dentro da tolerância, o de hoje vale', () => {
    expect(proximoToque([ag()], sp(29, 9) + TOLERANCIA_MS - 1)?.quando).toBe(sp(29, 9));
  });

  it('o que já tocou nesta aba é pulado', () => {
    expect(proximoToque([ag()], sp(29, 9) + 1000, new Set(['a:2026-10-29']))?.quando).toBe(sp(30, 9));
  });

  it('escolhe o mais cedo entre vários horários, cada um com a sua cor', () => {
    const t = proximoToque([ag({ id: 'b', hora: '14:00', cor: 'verde' }), ag()], sp(29, 11));
    expect(t).toMatchObject({ quando: sp(29, 14), cor: 'verde' });
  });

  it('perto da meia-noite de São Paulo, o dia é o de lá (não o UTC)', () => {
    // qui 29/10 22h em SP = sex 01h UTC; um horário só de quinta às 23h ainda vale hoje
    expect(proximoToque([ag({ hora: '23:00', dias: [4] })], sp(29, 22))?.quando).toBe(sp(29, 23));
  });
});

describe('resumoDosDias', () => {
  it('nomeia os conjuntos comuns', () => {
    expect(resumoDosDias([1, 2, 3, 4, 5])).toBe('Seg a Sex');
    expect(resumoDosDias([0, 1, 2, 3, 4, 5, 6])).toBe('Todos os dias');
    expect(resumoDosDias([5, 1, 3])).toBe('Seg, Qua, Sex');
  });
});

describe('volume', () => {
  it('vai junto no toque e fica entre 0 e 100', () => {
    expect(proximoToque([ag({ volume: 80 })], sp(29, 8))?.volume).toBe(80);
    expect(proximoToque([ag({ volume: 250 })], sp(29, 8))?.volume).toBe(100);
    expect(proximoToque([ag({ volume: -5 })], sp(29, 8))?.volume).toBe(0);
  });
});

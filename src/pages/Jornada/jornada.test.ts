import { describe, expect, it } from 'vitest';
import {
  contagem, diaDaSemana, diaPorExtenso, diasDoMesAte, iniciais, lerMetas, nomesCurtos,
  percentual, situacaoMetas, somarDias,
} from './jornada';

describe('jornada — contas da aba Acesso/Retenção', () => {
  it('percentual corta, não arredonda', () => {
    expect(percentual(99, 100)).toBe(99);
    expect(percentual(199, 200)).toBe(99);
    expect(percentual(100, 100)).toBe(100);
    expect(percentual(130, 100)).toBe(130);
    expect(percentual(10, null)).toBeNull();
    expect(percentual(10, 0)).toBeNull();
  });

  it('dias do mês param no limite (hoje)', () => {
    expect(diasDoMesAte('2026-11-15', '2026-11-04')).toEqual([
      '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04',
    ]);
    expect(diasDoMesAte('2026-02-10', '2026-12-31')).toHaveLength(28);
  });

  it('anda dias atravessando o mês', () => {
    expect(somarDias('2026-11-01', -1)).toBe('2026-10-31');
    expect(somarDias('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('textos', () => {
    expect(contagem(1, 'acesso')).toBe('1 acesso');
    expect(contagem(1200, 'retencao')).toBe('1.200 retenções');
    expect(diaDaSemana('2026-11-04')).toBe('qua');
    expect(diaPorExtenso('2026-11-04')).toBe('quarta, 04 de novembro');
    expect(iniciais('Ana Paula Souza')).toBe('AS');
    expect(iniciais('kauan')).toBe('K');
  });
});


describe('jornada — até quatro metas no mês', () => {
  it('diz quantas bateu e qual é a próxima', () => {
    expect(situacaoMetas(50, [100, 120, 140, 160])).toEqual({ batidas: 0, alvo: 100, indiceAlvo: 0, faltam: 50, todas: false });
    expect(situacaoMetas(125, [100, 120, 140, 160])).toEqual({ batidas: 2, alvo: 140, indiceAlvo: 2, faltam: 15, todas: false });
    expect(situacaoMetas(170, [100, 120, 140, 160])).toEqual({ batidas: 4, alvo: 160, indiceAlvo: 3, faltam: 0, todas: true });
    expect(situacaoMetas(10, [])).toEqual({ batidas: 0, alvo: null, indiceAlvo: 0, faltam: 0, todas: false });
  });

  it('uma meta só continua funcionando como antes', () => {
    expect(situacaoMetas(100, [100])).toMatchObject({ batidas: 1, alvo: 100, todas: true });
  });

  it('lê as metas digitadas: em ordem, sem pular, crescentes', () => {
    expect(lerMetas(['100', '120', '', ''])).toEqual({ metas: [100, 120], erro: null });
    expect(lerMetas(['', '', '', ''])).toEqual({ metas: [], erro: null });
    expect(lerMetas(['100', '', '140', '']).erro).toMatch(/sem pular/);
    expect(lerMetas(['100', '90', '', '']).erro).toMatch(/2ª meta tem de ser maior/);
    expect(lerMetas(['0', '', '', '']).erro).toMatch(/de 1 a/);
  });

  it('tag do NR: primeiro nome; repetido ganha a inicial do sobrenome', () => {
    const t = nomesCurtos([
      { id: 'a', nome: 'Maryanne Souza Lima' },
      { id: 'b', nome: 'Maria Silva' },
      { id: 'c', nome: 'maria Pereira' },
      { id: 'd', nome: null },
    ]);
    expect(t.get('a')).toBe('Maryanne');
    expect(t.get('b')).toBe('Maria S.');
    expect(t.get('c')).toBe('maria P.');
    expect(t.get('d')).toBe('?');
  });
});

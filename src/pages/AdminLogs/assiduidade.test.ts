/**
 * assiduidade.test.ts
 *
 * O «percentual de uso» que a gerência pediu: em quantos dos dias de trabalho
 * do período a pessoa apareceu.
 *
 * Os casos travam as três decisões que fazem o número ser honesto — janela que
 * não cobra o futuro, denominador de dia útil com feriado, e acesso em fim de
 * semana que não vira zero.
 */
import { describe, it, expect } from 'vitest';
import { calcularAssiduidade, faixaAssiduidade, mesesDaJanela } from './assiduidade';

describe('calcularAssiduidade', () => {
  // 2026-08-03 a 07 = seg a sex; 08 e 09 = fim de semana.
  const base = { desde: '2026-08-03', ate: '2026-08-07', hoje: '2026-08-31' };

  it('conta os dias úteis do período e os dias em que a pessoa apareceu', () => {
    const r = calcularAssiduidade({
      ...base, diasComAcesso: ['2026-08-03', '2026-08-05', '2026-08-07'],
    });
    expect(r.diasUteis).toBe(5);
    expect(r.diasComAcesso).toBe(3);
    expect(r.percentual).toBe(60);
  });

  it('feriado sai do denominador — a mesma régua da meta', () => {
    const r = calcularAssiduidade({
      ...base, diasComAcesso: ['2026-08-03'], feriados: ['2026-08-05'],
    });
    expect(r.diasUteis).toBe(4);
    expect(r.percentual).toBe(25);
  });

  it('NÃO cobra dias que ainda não aconteceram', () => {
    // Numa janela de 30 dias aberta na segunda-feira, cobrar o mês inteiro
    // faria todo mundo aparecer com 3% — o defeito clássico de percentual com
    // janela futura.
    const r = calcularAssiduidade({
      desde: '2026-08-03', ate: '2026-08-31', hoje: '2026-08-05',
      diasComAcesso: ['2026-08-03', '2026-08-04', '2026-08-05'],
    });
    expect(r.diasUteis).toBe(3);
    expect(r.percentual).toBe(100);
  });

  it('acesso em fim de semana conta à parte, e não derruba a fração', () => {
    // Sem isto, quem entrou só no sábado marcaria 0 de 5 e apareceria como
    // quem nunca acessou.
    const r = calcularAssiduidade({
      ...base, desde: '2026-08-03', ate: '2026-08-09',
      diasComAcesso: ['2026-08-04', '2026-08-08'],
    });
    expect(r.diasComAcesso).toBe(1);
    expect(r.diasForaDoUtil).toBe(1);
    expect(r.percentual).toBe(20);
  });

  it('dia repetido conta uma vez', () => {
    const r = calcularAssiduidade({
      ...base, diasComAcesso: ['2026-08-03', '2026-08-03', '2026-08-03'],
    });
    expect(r.diasComAcesso).toBe(1);
  });

  it('ignora acesso fora da janela', () => {
    const r = calcularAssiduidade({
      ...base, diasComAcesso: ['2026-07-31', '2026-08-04', '2026-08-20'],
    });
    expect(r.diasComAcesso).toBe(1);
  });

  it('sem dia útil para dividir devolve null, e não 0%', () => {
    // `0%` afirmaria ausência; `null` diz que não há base. São coisas
    // diferentes para quem vai cobrar a pessoa.
    const r = calcularAssiduidade({
      desde: '2026-08-08', ate: '2026-08-09', hoje: '2026-08-31', diasComAcesso: [],
    });
    expect(r.diasUteis).toBe(0);
    expect(r.percentual).toBeNull();
  });

  it('janela inteiramente no futuro não cobra nada', () => {
    const r = calcularAssiduidade({
      desde: '2026-09-01', ate: '2026-09-30', hoje: '2026-08-24', diasComAcesso: [],
    });
    expect(r.diasUteis).toBe(0);
    expect(r.percentual).toBeNull();
  });

  it('tolera timestamp no lugar da data', () => {
    const r = calcularAssiduidade({
      ...base, diasComAcesso: ['2026-08-03T00:00:00.000Z'],
    });
    expect(r.diasComAcesso).toBe(1);
  });
});

describe('faixaAssiduidade', () => {
  it('separa em faixas, e «sem base» não é a pior faixa', () => {
    expect(faixaAssiduidade(90).rotulo).toBe('assíduo');
    expect(faixaAssiduidade(60).rotulo).toBe('regular');
    expect(faixaAssiduidade(30).rotulo).toBe('esporádico');
    expect(faixaAssiduidade(5).rotulo).toBe('raro');
    expect(faixaAssiduidade(null).rotulo).toBe('sem base');
  });
});

describe('mesesDaJanela', () => {
  it('lista os meses que a janela atravessa', () => {
    // Feriado é cadastrado por mês; sem varrer todos, o do meio não entraria na
    // conta e aquele dia seria cobrado como dia de trabalho.
    expect(mesesDaJanela('2026-06-15', '2026-08-24')).toEqual(['2026-06', '2026-07', '2026-08']);
  });

  it('janela dentro de um mês devolve um mês', () => {
    expect(mesesDaJanela('2026-08-01', '2026-08-31')).toEqual(['2026-08']);
  });

  it('atravessa a virada do ano', () => {
    expect(mesesDaJanela('2026-12-20', '2027-01-10')).toEqual(['2026-12', '2027-01']);
  });
});

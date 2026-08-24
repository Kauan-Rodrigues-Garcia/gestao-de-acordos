/**
 * serieDiaria.test.ts
 *
 * O defeito: «Atividade por dia não funciona».
 *
 * As RPCs devolvem só os dias COM uso, e o gráfico desenhava uma barra por
 * linha recebida. Sete dias com uso em dois viravam duas barras coladas — a
 * tela mostrava uso constante onde havia uso esporádico. No detalhe de uma
 * pessoa era pior: o bloco só aparecia com mais de um dia, então quem usou num
 * único dia via a seção sumir.
 *
 * Os casos abaixo travam o eixo completo, o zero no lugar da ausência, e o fuso
 * — que é o jeito mais fácil de a série inteira andar um dia para trás.
 */
import { describe, it, expect } from 'vitest';
import {
  montarSerieDiaria, somarDias, diasEntre, rotuloCurto, tendencia,
} from './serieDiaria';

describe('somarDias', () => {
  it('soma e subtrai sem passar por fuso', () => {
    expect(somarDias('2026-08-24', 1)).toBe('2026-08-25');
    expect(somarDias('2026-08-24', -1)).toBe('2026-08-23');
  });

  it('atravessa a virada do mês e do ano', () => {
    expect(somarDias('2026-08-31', 1)).toBe('2026-09-01');
    expect(somarDias('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('atravessa 29 de fevereiro em ano bissexto', () => {
    expect(somarDias('2028-02-28', 1)).toBe('2028-02-29');
    expect(somarDias('2027-02-28', 1)).toBe('2027-03-01');
  });
});

describe('diasEntre', () => {
  it('conta os dias, e é negativo quando a ordem inverte', () => {
    expect(diasEntre('2026-08-01', '2026-08-08')).toBe(7);
    expect(diasEntre('2026-08-08', '2026-08-01')).toBe(-7);
    expect(diasEntre('2026-08-08', '2026-08-08')).toBe(0);
  });
});

describe('rotuloCurto', () => {
  it('vira dia/mês, sem `new Date`', () => {
    // `new Date('2026-08-24')` é meia-noite UTC; em São Paulo isso é 21h do dia
    // 23, e o rótulo sairia «23/08».
    expect(rotuloCurto('2026-08-24')).toBe('24/08');
    expect(rotuloCurto('2026-01-01')).toBe('01/01');
  });
});

describe('montarSerieDiaria', () => {
  const linhas = [
    { dia: '2026-08-03', segundos: 600, aberturas: 4, pessoas: 2 },
    { dia: '2026-08-07', segundos: 300, aberturas: 2, pessoas: 1 },
  ];

  it('o eixo é o PERÍODO, e não o que voltou do banco', () => {
    // Era este o defeito: duas linhas viravam duas barras, e os cinco dias sem
    // uso desapareciam do gráfico.
    const serie = montarSerieDiaria(linhas, '2026-08-01', '2026-08-07');
    expect(serie).toHaveLength(7);
    expect(serie.map(p => p.dia)).toEqual([
      '2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04',
      '2026-08-05', '2026-08-06', '2026-08-07',
    ]);
  });

  it('dia sem uso vale ZERO e se declara vazio', () => {
    const serie = montarSerieDiaria(linhas, '2026-08-01', '2026-08-07');
    expect(serie[0]).toMatchObject({ segundos: 0, aberturas: 0, pessoas: 0, vazio: true });
    expect(serie[2]).toMatchObject({ segundos: 600, aberturas: 4, pessoas: 2, vazio: false });
  });

  it('UM único dia de uso continua sendo uma série — a seção não some', () => {
    const serie = montarSerieDiaria(
      [{ dia: '2026-08-05', segundos: 120, aberturas: 1, pessoas: 1 }],
      '2026-08-01', '2026-08-07',
    );
    expect(serie).toHaveLength(7);
    expect(serie.filter(p => !p.vazio)).toHaveLength(1);
  });

  it('período sem nenhum uso devolve o eixo inteiro zerado', () => {
    // A resposta honesta para «como foi a semana» é sete zeros, não uma tela em
    // branco que parece defeito.
    const serie = montarSerieDiaria([], '2026-08-01', '2026-08-07');
    expect(serie).toHaveLength(7);
    expect(serie.every(p => p.vazio && p.segundos === 0)).toBe(true);
  });

  it('tolera número em texto, que é como o PostgREST devolve bigint', () => {
    const serie = montarSerieDiaria(
      [{ dia: '2026-08-01', segundos: '600', aberturas: '4', pessoas: '2' }],
      '2026-08-01', '2026-08-01',
    );
    expect(serie[0].segundos).toBe(600);
    expect(serie[0].aberturas).toBe(4);
  });

  it('recusa janela invertida ou absurda em vez de gerar um array gigante', () => {
    expect(montarSerieDiaria([], '2026-08-07', '2026-08-01')).toEqual([]);
    expect(montarSerieDiaria([], '2020-01-01', '2030-01-01')).toEqual([]);
  });

  it('ignora a hora quando o banco devolve timestamp em vez de date', () => {
    const serie = montarSerieDiaria(
      [{ dia: '2026-08-02T00:00:00.000Z', segundos: 90 }],
      '2026-08-01', '2026-08-03',
    );
    expect(serie[1].segundos).toBe(90);
  });
});

describe('tendencia', () => {
  const serie = (valores: number[]) =>
    montarSerieDiaria(
      valores.map((v, i) => ({ dia: somarDias('2026-08-01', i), segundos: v })),
      '2026-08-01', somarDias('2026-08-01', valores.length - 1),
    );

  it('compara a primeira metade com a segunda', () => {
    expect(tendencia(serie([10, 10, 30, 30]))).toEqual({ variacao: 200, direcao: 'subindo' });
    expect(tendencia(serie([30, 30, 10, 10]))).toEqual({ variacao: -67, direcao: 'caindo' });
  });

  it('variação pequena é ESTÁVEL — ±10% é ruído de amostragem', () => {
    // Chamar 5% de «queda» faria o painel gritar toda semana.
    expect(tendencia(serie([100, 100, 103, 102]))?.direcao).toBe('estavel');
  });

  it('sair do zero é «subindo», e não infinito por cento', () => {
    expect(tendencia(serie([0, 0, 50, 50]))).toEqual({ variacao: 100, direcao: 'subindo' });
  });

  it('sem dados nas duas metades não afirma nada', () => {
    // `0%` ali seria lido como «estável», que é uma afirmação sobre nada.
    expect(tendencia(serie([0, 0, 0, 0]))).toBeNull();
  });

  it('série curta demais não tem tendência', () => {
    expect(tendencia(serie([10, 20]))).toBeNull();
  });
});

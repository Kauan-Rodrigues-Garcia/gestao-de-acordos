import { describe, expect, it } from 'vitest';
import { curvaHoraAHora, diaDoDesafio, esperadoAteODia, hojeEmSaoPaulo, horasSemRetrato, metaDoDia, minutosSemO59, pct, porSetorNoDia } from './regras';
import type { SetorDoDesafio } from './desafioCobranca.service';

const DIAS = ['2026-11-16', '2026-11-17', '2026-11-18'];
const P = { meta_geral: 1_900_000, dias: DIAS };

const setor = (id: string, soma: boolean, nome = id): SetorDoDesafio => ({ setor_id: id, nome, cidade: 'Birigui', regra: null, soma, ve: true });

describe('regras do Desafio Cobrança', () => {
  it('a parte do dia e o ponto do fim de cada dia', () => {
    expect(metaDoDia(P)).toBe(633_000);
    expect(esperadoAteODia(P, 0)).toBe(633_000);
    expect(esperadoAteODia(P, 1)).toBe(1_266_000);
    expect(esperadoAteODia(P, 2)).toBe(1_900_000);   // o último é a meta inteira
  });

  it('o dia do desafio: antes, durante e depois', () => {
    expect(diaDoDesafio(DIAS, '2026-11-14')).toEqual({ indice: 0, fase: 'antes' });
    expect(diaDoDesafio(DIAS, '2026-11-17')).toEqual({ indice: 1, fase: 'durante' });
    expect(diaDoDesafio(DIAS, '2026-11-19')).toEqual({ indice: 2, fase: 'depois' });
  });

  it('hoje é o dia de São Paulo, não o UTC', () => {
    expect(hojeEmSaoPaulo(new Date('2026-11-17T01:30:00Z'))).toBe('2026-11-16');
  });

  it('o % é cortado', () => {
    expect(pct(1_899_999, 1_900_000)).toBe(99);
    expect(pct(2_000_000, 1_900_000)).toBe(100);
  });

  it('a curva hora a hora soma só quem soma, e o ajuste entra a partir da hora dele', () => {
    const t1 = '2026-11-16T12:07:00+00:00';
    const t2 = '2026-11-16T13:07:00+00:00';
    const curva = curvaHoraAHora({
      leituras: [t2, t1],
      horas: [
        { lido_em: t1, dia: DIAS[0], setor_id: 'play1', valor: 1000 },
        { lido_em: t1, dia: DIAS[0], setor_id: 'jornada', valor: 300 },
        { lido_em: t2, dia: DIAS[0], setor_id: 'play1', valor: 1800 },
        { lido_em: t2, dia: DIAS[0], setor_id: null, cod: '72', valor: 900 },
        { lido_em: t2, dia: DIAS[0], setor_id: null, cod: '61', valor: 70 },
      ],
      ajustes: [
        { id: 'a', dia: DIAS[0], setor_id: null, valor: 50, motivo: 'x', criado_em: '2026-11-16T12:30:00Z', criado_por: null, removido_em: null },
      ],
      setores: [setor('play1', true), setor('jornada', false)],
      avulsos: ['61'],
      dia: DIAS[0],
    });
    // 1.800 + avulso 61 70 + ajuste 50. O 72 (sem setor, não marcado) fica fora.
    expect(curva).toEqual([
      { lido_em: t1, total: 1000, dia: 1000 },
      { lido_em: t2, total: 1920, dia: 1920 },
    ]);
  });

  it('fonte manual: a curva é a dos lançamentos; o 59 não entra; a remoção desce', () => {
    const curva = curvaHoraAHora({
      leituras: ['2026-11-16T15:16:00Z'],
      horas: [{ lido_em: '2026-11-16T15:16:00Z', dia: DIAS[0], setor_id: 'play1', valor: 93_808.31 }],
      ajustes: [
        { id: 'a', dia: DIAS[0], setor_id: null, valor: 100_000, motivo: 'fechamento 12h', criado_em: '2026-11-16T15:05:00Z', criado_por: null, removido_em: null },
        { id: 'b', dia: DIAS[0], setor_id: null, valor: 50_000, motivo: 'fechamento 14h', criado_em: '2026-11-16T17:05:00Z', criado_por: null, removido_em: '2026-11-16T17:30:00Z' },
        { id: 'c', dia: DIAS[0], setor_id: 'jornada', valor: 9_000, motivo: 'Jornada', criado_em: '2026-11-16T17:10:00Z', criado_por: null, removido_em: null },
      ],
      setores: [setor('play1', true), setor('jornada', false)],
      fonte: 'manual',
      dia: DIAS[0],
    });
    expect(curva.map(p => [p.lido_em.slice(11, 16), p.total])).toEqual([
      ['15:05', 100_000],
      ['17:05', 150_000],
      ['17:10', 150_000],   // o da Jornada não soma
      ['17:30', 100_000],   // removido
    ]);
  });

  // 16/11/2026: retratos às 09:10, 10:07, 11:07, 12:16 — o das 13h não veio.
  const RETRATOS = ['2026-11-16T12:10:00Z', '2026-11-16T13:07:00Z', '2026-11-16T14:07:00Z', '2026-11-16T15:16:00Z'];

  it('hora sem retrato: às 13:55 o das 13h faltou', () => {
    expect(horasSemRetrato(RETRATOS, DIAS[0], new Date('2026-11-16T16:55:00Z'))).toEqual([13]);
  });

  it('hora sem retrato: às 13:20 ainda espera (o robô pode chegar até a meia hora)', () => {
    expect(horasSemRetrato(RETRATOS, DIAS[0], new Date('2026-11-16T16:20:00Z'))).toEqual([]);
  });

  it('hora sem retrato: buraco no meio do dia, e dia que já passou', () => {
    const comBuraco = [RETRATOS[0], RETRATOS[3], '2026-11-16T17:07:00Z'];
    expect(horasSemRetrato(comBuraco, DIAS[0], new Date('2026-11-18T12:00:00Z'))).toEqual([10, 11, 13]);
  });

  it('59 atrasado: só passa de 75 min, e só no expediente', () => {
    expect(minutosSemO59('2026-11-16T15:16:00Z', new Date('2026-11-16T16:55:00Z'))).toBe(99);
    expect(minutosSemO59('2026-11-16T15:16:00Z', new Date('2026-11-16T16:20:00Z'))).toBeNull();
    expect(minutosSemO59('2026-11-16T21:07:00Z', new Date('2026-11-17T09:00:00Z'))).toBeNull(); // 06:00, fora do expediente
  });

  it('por setor no dia: soma, fora, grupo solto e avulso que soma', () => {
    const linhas = porSetorNoDia([
      { dia: DIAS[0], cod: '25', nome: 'COB PLAY 1', setor_id: 'play1', pagamentos: 3, valor: 1500 },
      { dia: DIAS[0], cod: '76', nome: 'JORNADAPLAY', setor_id: 'jornada', pagamentos: 1, valor: 300 },
      { dia: DIAS[0], cod: '61', nome: 'COB PLAY - EM DIA', setor_id: null, pagamentos: 2, valor: 70 },
      { dia: DIAS[0], cod: '72', nome: 'MARILIA - COFEN', setor_id: null, pagamentos: 4, valor: 900 },
      { dia: DIAS[1], cod: '25', nome: 'COB PLAY 1', setor_id: 'play1', pagamentos: 9, valor: 9999 },
    ], [setor('play1', true, 'Play 1'), setor('jornada', false, 'Jornada Play')], DIAS[0], ['61']);
    expect(linhas.map(l => [l.nome, l.valor, l.situacao])).toEqual([
      ['Play 1', 1500, 'soma'],
      ['MARILIA - COFEN', 900, 'solto'],
      ['Jornada Play', 300, 'fora'],
      ['COB PLAY - EM DIA', 70, 'avulso'],
    ]);
  });
});

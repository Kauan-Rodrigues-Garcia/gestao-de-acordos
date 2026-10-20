/**
 * O 58 num mês que já é do 59 (19/10/2026).
 *
 * A sincronização do 59 só preserva, das linhas do 58, as de HOJE e de ONTEM
 * cujo NR+dia ela ainda não trouxe (20260928200000). Gravar o resto era
 * trabalho jogado fora e criava linha que a reconciliação zerava: no Play 1, em
 * 19/10, 94 inseridas e 64 zeradas na hora, com ~4.700 linhas relidas.
 *
 * Fixa a regra do recorte e o dia de referência em São Paulo.
 */
import { describe, expect, it } from 'vitest';
import { linhasDo58NoMesDo59, diaLocalSP } from './analitico.service';
import { parseRelatorioBookplayRows } from '@/services/bookplay/bookplayRecebimentoParser';

const l = (codigo: string, data: string, mes = '2026-10-01') =>
  ({ codigo, data_pagamento: data, mes_referencia: mes });

const OUT = new Set(['2026-10-01']);
const ONTEM = '2026-10-18';

describe('linhasDo58NoMesDo59', () => {
  it('mês do 59: fica só ontem em diante', () => {
    const r = linhasDo58NoMesDo59(
      [l('1', '2026-10-01'), l('2', '2026-10-17'), l('3', '2026-10-18'), l('4', '2026-10-19')],
      OUT, ONTEM, new Set(),
    );
    expect(r.map(x => x.codigo)).toEqual(['3', '4']);
  });

  it('mês do 59: NR+dia que o 59 já tem não entra', () => {
    const r = linhasDo58NoMesDo59(
      [l('10', '2026-10-19'), l('11', '2026-10-19'), l('10', '2026-10-18')],
      OUT, ONTEM, new Set(['10::2026-10-19']),
    );
    // O mesmo NR em OUTRO dia continua: a chave é NR+dia, como na sincronização.
    expect(r).toEqual([l('11', '2026-10-19'), l('10', '2026-10-18')]);
  });

  it('mês do 58 (ex.: setembro fechado no mesmo arquivo) entra inteiro', () => {
    const set = l('9', '2026-09-03', '2026-09-01');
    expect(linhasDo58NoMesDo59([set], OUT, ONTEM, new Set(['9::2026-09-03']))).toEqual([set]);
  });

  it('sem mês do 59, nada muda', () => {
    const linhas = [l('1', '2026-10-01'), l('2', '2026-10-19')];
    expect(linhasDo58NoMesDo59(linhas, new Set(), ONTEM, new Set())).toEqual(linhas);
  });

  /*
   * O caso de 20/10/2026, do arquivo ao recorte: entrada de R$ 200 em 19/10 (o
   * 59 já tem) e R$ 544 em 20/10 (o 59 ainda não). Com o NR numa linha só, a
   * data era 19/10 e o recorte levava os R$ 744 embora.
   */
  it('do 58 da BookPlay: o pagamento de hoje entra mesmo com a entrada de ontem no 59', () => {
    const CAB = ['Cobradora', 'Cliente', 'NrDocumento', 'TpDoc', 'DtPgto', 'Recebido'];
    const pg = (tp: string, data: string, valor: number) =>
      ['isabelle_moreira', '11264600 - CLIENTE', '10812488', tp, data, valor];
    const { analitico } = parseRelatorioBookplayRows([
      CAB,
      pg('PIX', '19/10/2026', 200),
      ...[93, 93, 93, 93, 93, 79].map(v => pg('BOLETO NEGOCIAÇÃO', '20/10/2026', v)),
    ]);
    const linhas = analitico.map(a => ({
      codigo: a.codigo,
      data_pagamento: `2026-10-${String(a.data_pagamento.getDate()).padStart(2, '0')}`,
      mes_referencia: '2026-10-01',
      valor: a.valor_recebido,
    }));

    const r = linhasDo58NoMesDo59(linhas, OUT, '2026-10-19', new Set(['10812488::2026-10-19']));
    expect(r).toEqual([{ codigo: '10812488', data_pagamento: '2026-10-20', mes_referencia: '2026-10-01', valor: 544 }]);
  });
});

describe('diaLocalSP', () => {
  it('usa o dia de São Paulo, não o UTC', () => {
    // 02:30 UTC de 20/10 ainda é 23:30 de 19/10 em São Paulo.
    const agora = new Date('2026-10-20T02:30:00Z');
    expect(diaLocalSP(0, agora)).toBe('2026-10-19');
    expect(diaLocalSP(-1, agora)).toBe('2026-10-18');
  });

  it('atravessa a virada do mês', () => {
    expect(diaLocalSP(-1, new Date('2026-11-01T15:00:00Z'))).toBe('2026-10-31');
  });
});

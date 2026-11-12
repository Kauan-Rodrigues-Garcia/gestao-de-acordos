import { describe, expect, it } from 'vitest';
import { extrairQuitacoes, resumoPorOperador } from './relatorioQuitacao';

const CAB = ['Cód. Acordo', 'Num. Parc. Acordo', 'Operador', 'Dt. Pgto', 'Recebido', 'Situação', 'Valor Acordo', 'Situação Atual', 'Data da quitação'];
const d = (s: string) => new Date(`${s}T00:00:00`);
/** `recebido`: o que a linha (a parcela) pagou no mês; por padrão, o acordo inteiro. */
const linha = (cod: string, op: string, pgto: string, valor: number, atual: string, quitou: string | null, parc = 1, recebido = valor) =>
  [cod, parc, op, d(pgto), recebido, 'Quitação', valor, atual, quitou ? d(quitou) : null];

describe('relatório mensal de parcelas pagas → acordos quitados no mês', () => {
  it('conta só «Situação Atual» = Quitação, com a quitação dentro do mês do arquivo', () => {
    const r = extrairQuitacoes([
      CAB,
      linha('1', 'ANA', '2026-09-02', 500, 'Quitação', '2026-09-02'),
      // Duas parcelas do mesmo acordo: conta uma vez, com a soma do recebido.
      linha('2', 'ANA', '2026-09-05', 900, 'Quitação', '2026-09-20', 1, 450),
      linha('2', 'ANA', '2026-09-20', 900, 'Quitação', '2026-09-20', 2, 450),
      // «Situação» diz Quitação, mas o acordo ainda está parcelando.
      linha('3', 'BIA', '2026-09-03', 2000, 'Parcelamento', null),
      // Quitou em outubro: fica para o relatório de outubro.
      linha('4', 'BIA', '2026-09-10', 300, 'Quitação', '2026-10-05'),
      linha('5', 'BIA', '2026-09-11', 1200, 'Quitação', '2026-09-11'),
    ]);
    expect(r.erros).toEqual([]);
    expect(r.mes).toBe('2026-09-01');
    expect(r.linhasLidas).toBe(6);
    expect(r.quitadosForaDoMes).toBe(1);
    expect(r.acordos.map(a => a.cod_acordo).sort()).toEqual(['1', '2', '5']);
    expect(r.acordos.find(a => a.cod_acordo === '2')).toMatchObject({ valor_acordo: 900, data_quitacao: '2026-09-20' });
  });

  it('o ranking da prévia é por valor, desempate pela quantidade', () => {
    const r = extrairQuitacoes([
      CAB,
      linha('1', 'ANA', '2026-09-02', 500, 'Quitação', '2026-09-02'),
      linha('2', 'ANA', '2026-09-03', 400, 'Quitação', '2026-09-03'),
      linha('3', 'BIA', '2026-09-04', 1200, 'Quitação', '2026-09-04'),
    ]);
    expect(resumoPorOperador(r.acordos)).toEqual([
      { operador: 'BIA', quitacoes: 1, valor: 1200 },
      { operador: 'ANA', quitacoes: 2, valor: 900 },
    ]);
  });

  it('arquivo errado: diz quais colunas faltam', () => {
    const r = extrairQuitacoes([['Operador', 'Valor Recebido'], ['ANA', 10]]);
    expect(r.acordos).toEqual([]);
    expect(r.erros[0]).toContain('Situação Atual');
    expect(r.erros[0]).toContain('Data da quitação');
  });

  describe('Junção', () => {
    const CAB_JUNCAO = ['Cód. Acordo', 'Nr. Documento', 'Operador', 'Dt. Pgto', 'Recebido', 'Valor Acordo', 'Valor Restante', 'Situação Atual', 'Data da quitação'];
    const j = (cod: string, nr: string, op: string, valor: number, restante: number, atual: string, quitou: string | null, recebido = valor) =>
      [cod, nr, op, d('2026-10-07'), recebido, valor, restante, atual, quitou ? d(quitou) : null];

    it('conta a Junção que quitou o contrato (saldo zerado e data da quitação)', () => {
      const r = extrairQuitacoes([
        CAB_JUNCAO,
        // Troca de plano: juntou as parcelas até o fim do contrato.
        j('10', '900', 'TAIS', 1671.6, 0, 'Junção', '2026-10-08'),
        // Junção das parcelas atrasadas: saldo zerado, mas o contrato não quitou.
        j('11', '901', 'TAIS', 1393, 0, 'Junção', null),
        // Junção ainda pagando.
        j('12', '902', 'TAIS', 1481.55, 781.55, 'Junção', null),
      ]);
      expect(r.acordos).toEqual([{ cod_acordo: '10', operador_usuario: 'TAIS', valor_acordo: 1671.6, data_quitacao: '2026-10-08', tipo: 'juncao' }]);
      expect(r.quitadosPorJuncao).toBe(1);
    });

    it('pagamento desmembrado (Pix Quitação + cartão Junção) é uma quitação, com a soma', () => {
      const r = extrairQuitacoes([
        CAB_JUNCAO,
        j('5846977', '13008491', 'TAIS', 2800, 0, 'Junção', '2026-10-07', 1400),
        j('5846977', '13008491', 'TAIS', 2800, 0, 'Junção', '2026-10-07', 1400),
        j('5847011', '13008491', 'TAIS', 700, 0, 'Quitação', '2026-10-07'),
      ]);
      expect(r.acordos).toEqual([{ cod_acordo: '5847011', operador_usuario: 'TAIS', valor_acordo: 3500, data_quitacao: '2026-10-07', tipo: 'quitacao' }]);
      expect(resumoPorOperador(r.acordos)).toEqual([{ operador: 'TAIS', quitacoes: 1, valor: 3500 }]);
    });

    it('sem «Nr. Documento» nem «Valor Restante»: Junção vale com a data, cada acordo sozinho', () => {
      const r = extrairQuitacoes([
        CAB,
        linha('20', 'ANA', '2026-09-02', 1643.4, 'Junção', '2026-09-09'),
        linha('21', 'ANA', '2026-09-02', 1306, 'Junção', null),
        linha('22', 'ANA', '2026-09-02', 500, 'Quitação', '2026-09-09'),
      ]);
      expect(r.acordos.map(a => a.cod_acordo).sort()).toEqual(['20', '22']);
    });
  });

  describe('quitação que completa um Parcelamento', () => {
    const CAB_NR = ['Cód. Acordo', 'Nr. Documento', 'Operador', 'Dt. Pgto', 'Recebido', 'Valor Acordo', 'Valor Restante', 'Situação Atual', 'Data da quitação'];
    /** Por padrão o recebido no mês é o que o acordo já pagou (Valor Acordo − Valor Restante). */
    const p = (cod: string, nr: string, valor: number, restante: number, atual: string, quitou = '2026-10-20', recebido = valor - restante) =>
      [cod, nr, 'LUIZ', d('2026-10-20'), recebido, valor, restante, atual, d(quitou)];

    it('NR 12800154: pagou R$ 1.095 do Parcelamento e o saldo com R$ 648 + R$ 50 — quitação de R$ 1.793', () => {
      const r = extrairQuitacoes([
        CAB_NR,
        p('5863453', '12800154', 648, 0, 'Quitação'),
        p('5863434', '12800154', 50, 0, 'Parcela única'),
        p('5863389', '12800154', 1793, 698, 'Parcelamento'),
      ]);
      expect(r.acordos).toEqual([{ cod_acordo: '5863453', operador_usuario: 'LUIZ', valor_acordo: 1793, data_quitacao: '2026-10-20', tipo: 'quitacao' }]);
      expect(r.quitadosCompletandoParcelamento).toBe(1);
    });

    it('fecha com até R$ 1,00 de diferença (arredondamento do ERP), e soma o que foi pago', () => {
      const r = extrairQuitacoes([
        CAB_NR,
        p('1', '700', 687, 0, 'Quitação', '2026-10-01'),
        p('2', '700', 1586, 686, 'Parcelamento', '2026-10-01'),
      ]);
      expect(r.acordos[0].valor_acordo).toBe(1587);
    });

    it('não soma quando o saldo não fecha com o que a quitação pagou', () => {
      const r = extrairQuitacoes([
        CAB_NR,
        p('1', '701', 300, 0, 'Quitação'),
        p('2', '701', 2000, 900, 'Parcelamento'),
      ]);
      expect(r.acordos[0].valor_acordo).toBe(300);
      expect(r.quitadosCompletandoParcelamento).toBe(0);
    });

    it('Parcelamento já pago por inteiro no mesmo contrato e data soma o recebido (decisão de 04/11)', () => {
      const r = extrairQuitacoes([
        CAB_NR,
        p('1', '702', 1817, 0, 'Quitação'),
        p('2', '702', 500, 0, 'Parcelamento'),
      ]);
      expect(r.acordos).toHaveLength(1);
      expect(r.acordos[0].valor_acordo).toBe(2317);
      expect(r.quitadosCompletandoParcelamento).toBe(0);
    });

    it('NR 13022960: Junção (parcelas 5–8) + Parcelamento (1–4), saldo 0, mesmo dia — R$ 1.936,80', () => {
      const r = extrairQuitacoes([
        CAB_NR,
        p('5881970', '13022960', 936.8, 0, 'Junção', '2026-10-20'),
        p('5881442', '13022960', 1000, 0, 'Parcelamento', '2026-10-20'),
      ]);
      expect(r.acordos).toEqual([{ cod_acordo: '5881970', operador_usuario: 'LUIZ', valor_acordo: 1936.8, data_quitacao: '2026-10-20', tipo: 'juncao' }]);
    });

    it('peça paga só em parte no mês soma só o que recebeu no mês', () => {
      const r = extrairQuitacoes([
        CAB_NR,
        p('1', '704', 800, 0, 'Quitação'),
        p('2', '704', 3000, 0, 'Parcelamento', '2026-10-20', 250),
      ]);
      expect(r.acordos[0].valor_acordo).toBe(1050);
    });

    it('outro contrato ou outra data não entram na conta', () => {
      const r = extrairQuitacoes([
        CAB_NR,
        p('1', '703', 698, 0, 'Quitação'),
        p('2', '704', 1793, 698, 'Parcelamento'),
        p('3', '703', 1793, 698, 'Parcelamento', '2026-10-19'),
      ]);
      expect(r.acordos[0].valor_acordo).toBe(698);
    });
  });

  describe('saldo zerado quita, qualquer que seja o rótulo', () => {
    const CAB_NR = ['Cód. Acordo', 'Nr. Documento', 'Operador', 'Dt. Pgto', 'Recebido', 'Valor Acordo', 'Valor Restante', 'Situação Atual', 'Data da quitação'];
    const s = (cod: string, nr: string, valor: number, restante: number, atual: string, quitou: string | null = '2026-10-27') =>
      [cod, nr, 'TAIS', d('2026-10-27'), valor, valor, restante, atual, quitou ? d(quitou) : null];

    it('NR 12552080: Parcelamento 1/1, saldo 0 e data da quitação — conta', () => {
      const r = extrairQuitacoes([CAB_NR, s('5871579', '12552080', 955.8, 0, 'Parcelamento')]);
      expect(r.acordos).toEqual([{ cod_acordo: '5871579', operador_usuario: 'TAIS', valor_acordo: 955.8, data_quitacao: '2026-10-27', tipo: 'saldo_zerado' }]);
    });

    it('sem a data da quitação, ou com saldo, não conta', () => {
      const r = extrairQuitacoes([
        CAB_NR,
        s('1', '800', 500, 0, 'Parcelamento', null),
        s('2', '801', 900, 300, 'Parcelamento'),
      ]);
      expect(r.acordos).toEqual([]);
    });
  });

  describe('o valor é o RECEBIDO no mês, não o Valor Acordo (pedido de 04/11/2026)', () => {
    const CAB_REC = ['Cód. Acordo', 'Nr. Documento', 'Operador', 'Dt. Pgto', 'Recebido', 'Valor Acordo', 'Valor Restante', 'Situação Atual', 'Data da quitação'];
    const r_ = (cod: string, nr: string, op: string, pgto: string, recebido: number, valor: number, restante: number, atual: string, quitou: string | null) =>
      [cod, nr, op, d(pgto), recebido, valor, restante, atual, quitou ? d(quitou) : null];

    it('NR 12604078 (eduardo_naia): boleto de 16 parcelas, quitou a última — conta R$ 420,30, não R$ 6.723,00', () => {
      const r = extrairQuitacoes([
        CAB_REC,
        r_('5207121', '12604078', 'eduardo_naia', '2026-11-03', 420.3, 6723, 0, 'Quitação', '2026-11-03'),
        r_('5848653', '12915693', 'eduardo_naia', '2026-11-03', 1000, 1300, 0, 'Quitação', '2026-11-03'),
        // Parcela única sem data da quitação: recebeu, mas não quitou contrato — fora do ranking.
        r_('5882125', '12547048', 'eduardo_naia', '2026-11-03', 350, 350, 0, 'Parcela única', null),
      ]);
      expect(resumoPorOperador(r.acordos)).toEqual([{ operador: 'eduardo_naia', quitacoes: 2, valor: 1420.3 }]);
    });

    it('pagamento de outro mês na mesma planilha não entra no valor', () => {
      const r = extrairQuitacoes([
        CAB_REC,
        r_('1', '900', 'ANA', '2026-11-03', 300, 600, 0, 'Quitação', '2026-11-03'),
        r_('1', '900', 'ANA', '2026-11-04', 200, 600, 0, 'Quitação', '2026-11-03'),
        r_('1', '900', 'ANA', '2026-10-30', 100, 600, 0, 'Quitação', '2026-11-03'),
      ]);
      expect(r.acordos[0].valor_acordo).toBe(500);
    });

    it('sem a coluna «Recebido» o arquivo é recusado, em vez de contar errado', () => {
      const r = extrairQuitacoes([
        ['Cód. Acordo', 'Operador', 'Dt. Pgto', 'Valor Acordo', 'Situação Atual', 'Data da quitação'],
        ['1', 'ANA', d('2026-11-03'), 600, 'Quitação', d('2026-11-03')],
      ]);
      expect(r.acordos).toEqual([]);
      expect(r.erros[0]).toContain('Recebido');
    });
  });

  it('aceita datas como número serial do Excel e valor em texto pt-BR', () => {
    // 46267 = 2026-09-02.
    const r = extrairQuitacoes([CAB, ['9', 1, 'ANA', 46267, '1.234,50', 'Quitação', '1.234,50', 'Quitação', 46267]]);
    expect(r.acordos).toEqual([{ cod_acordo: '9', operador_usuario: 'ANA', valor_acordo: 1234.5, data_quitacao: '2026-09-02', tipo: 'quitacao' }]);
  });
});

describe('última parcela de carnê não é quitação (12/11/2026)', () => {
  const CAB_CARNE = ['Cód. Acordo', 'Num. Parc. Acordo', 'Tp. Doc', 'Nr. Documento', 'Operador', 'Dt. Pgto', 'Recebido',
    'Valor Acordo', 'Qtd. Parcelas Acordo', 'Valor Restante', 'Situação Atual', 'Data da quitação'];
  const c = (cod: string, nr: string, tp: string, parc: number, de: number, valor: number, recebido: number, atual = 'Quitação', restante = 0) =>
    [cod, parc, tp, nr, 'ANA', d('2026-11-03'), recebido, valor, de, restante, atual, d('2026-11-03')];

  it('boleto 18/18 e recorrente 20/20 saem; boleto à vista, cartão parcelado e Pix ficam', () => {
    const r = extrairQuitacoes([
      CAB_CARNE,
      // NR 12696562: o fim de um boleto de 18 — entrou R$ 275 de R$ 4.950.
      c('5115699', '12696562', 'Boleto', 18, 18, 4950, 275),
      c('5062373', '12852536', 'Recorrente', 20, 20, 2975, 148.75),
      // Boleto à vista: o boleto paga tudo.
      c('5895010', '12779516', 'Boleto', 1, 1, 275, 275),
      // Cartão em 15x: o cartão paga o acordo inteiro de uma vez.
      c('5883991', '12918254', 'Cartão', 15, 15, 2448, 2448),
      c('5898644', '12783104', 'Pix', 1, 1, 800, 800),
    ]);
    expect(r.acordos.map(a => a.cod_acordo).sort()).toEqual(['5883991', '5895010', '5898644']);
    expect(r.ultimasParcelasDeCarne).toBe(2);
  });

  it('o carnê que terminou não vira quitação pelo saldo zerado nem soma em outra', () => {
    const r = extrairQuitacoes([
      CAB_CARNE,
      // Rotulado Parcelamento, saldo 0 e data: seria «saldo zerado quita».
      c('1', '900', 'Boleto', 6, 6, 1200, 200, 'Parcelamento'),
      // Mesmo contrato, Pix Quitação no mesmo dia: conta sozinha, sem o boleto.
      c('2', '901', 'Boleto', 4, 4, 800, 200),
      c('3', '901', 'Pix', 1, 1, 300, 300),
    ]);
    expect(r.acordos).toEqual([{ cod_acordo: '3', operador_usuario: 'ANA', valor_acordo: 300, data_quitacao: '2026-11-03', tipo: 'quitacao' }]);
    expect(r.ultimasParcelasDeCarne).toBe(2);
  });

  it('sem «Tp. Doc» e «Qtd. Parcelas Acordo»: lê como antes e avisa (null)', () => {
    const r = extrairQuitacoes([
      CAB,
      linha('5115699', 'ANA', '2026-11-03', 4950, 'Quitação', '2026-11-03', 18, 275),
    ]);
    expect(r.acordos.map(a => a.cod_acordo)).toEqual(['5115699']);
    expect(r.ultimasParcelasDeCarne).toBeNull();
  });
});

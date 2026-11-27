/**
 * Junção pela parcela de nota (27/11/2026): atrasadas pelo que falta pagar
 * nelas (a parcial pelo que sobrou) + a próxima pelo valor de nota, com o %
 * sobre a junção inteira. O Valor Atualizado (com juros) não entra.
 */
import { describe, expect, it } from 'vitest';
import { CampaignCore, type RawRecord } from './lib/campaign-core';
import { corrigirJuncaoComJuros, juncaoComJuros } from './detalheDasVariaveis';

function registro(v: { atraso: string; valor: string; aberto: string; atualizado?: string }): RawRecord {
  const values: Record<string, string> = {
    Nome: 'MARIA DA SILVA', CPF: '123', Contrato: '999', 'Parcelas em atraso': v.atraso, Protesto: '0',
    Valor: v.valor, 'Valor Aberto': v.aberto, 'Valor Atualizado': v.atualizado ?? '99999', 'Tp. Venda': 'PRO',
    'Whats Titular': '18999999999',
  };
  const normalized = Object.fromEntries(Object.entries(values).map(([k, x]) => [CampaignCore.normalizeHeader(k), x]));
  return { rowNumber: 2, values, normalized, sourceType: 'report-247', financialDataAvailable: true };
}

const comJuncao = (pct: number) => ({ ...CampaignCore.DEFAULT_DISCOUNTS, bundle: pct });

describe('parcelaDeNota', () => {
  it('sem parcial: a média, quando o que falta vencer fecha em parcelas dela', () => {
    expect(CampaignCore.parcelaDeNota(2, 336, 504)).toEqual({ parcela: 168, aVencer: true });
    expect(CampaignCore.parcelaDeNota(1, 159, 318)).toEqual({ parcela: 159, aVencer: true });
  });

  it('uma atrasada parcial: acha a parcela cheia (168 + 28, uma a vencer)', () => {
    expect(CampaignCore.parcelaDeNota(2, 196, 364)).toEqual({ parcela: 168, aVencer: true });
  });

  it('NR 13039938: 3 × 199 + 29,85 em atraso e 24 × 199 a vencer', () => {
    expect(CampaignCore.parcelaDeNota(4, 626.85, 5402.85)).toEqual({ parcela: 199, aVencer: true });
  });

  it('nada a vencer: a parcela só sai se as atrasadas forem iguais', () => {
    expect(CampaignCore.parcelaDeNota(2, 336, 336)).toEqual({ parcela: 168, aVencer: false });
    expect(CampaignCore.parcelaDeNota(2, 196.01, 196.01)).toEqual({ parcela: null, aVencer: false });
  });

  it('conta que não fecha com um valor só: não achada', () => {
    // 1 atrasada de 28 e 168 a vencer: fecha como parcela cheia de 28 — é o que o arquivo diz.
    expect(CampaignCore.parcelaDeNota(1, 28, 196).parcela).toBe(28);
    // Nenhum valor fecha: 2 atrasadas somando 100,01 e 37,37 a vencer.
    expect(CampaignCore.parcelaDeNota(2, 100.01, 137.38)).toEqual({ parcela: null, aVencer: true });
  });
});

describe('a «1 parcela» das outras contas também é a de nota', () => {
  const d = { ...CampaignCore.DEFAULT_DISCOUNTS, overdue: 10, annual: 25, pix_automatico: 5, cartao_recorrente: 5 };

  it('168 + 28 parcial: anual, 1 parcela e Pix/Cartão na parcela partem de 168 (a média dava 98)', () => {
    const item = CampaignCore.deriveRecord(registro({ atraso: '2', valor: '196', aberto: '364' }), d);
    expect(item.noteValue).toBe(168);
    expect(item.annual).toBe(1512); // 168 × 12 × 0,75
    expect(item.overdueOneDiscounted).toBe(152); // 151,20
    expect(item.pixAutoParcela).toBe(160); // 159,60
    expect(item.cardRecurringParcela).toBe(160);
  });

  it('não fecha: a média e «Revisar» só quando a mensagem cita essas variáveis', () => {
    const rec = registro({ atraso: '2', valor: '100,01', aberto: '137,38' });
    const [comAnual] = CampaignCore.buildCampaign([rec], { template: 'Anual {{anual}}', senders: ['Ana'] });
    expect(comAnual.noteFound).toBe(false);
    expect(comAnual.issues).toContain(CampaignCore.PARCELA_SEM_VALOR_DE_NOTA);
    const [semAnual] = CampaignCore.buildCampaign([rec], { template: 'Quitação {{quitacao}}', senders: ['Ana'] });
    expect(semAnual.issues).not.toContain(CampaignCore.PARCELA_SEM_VALOR_DE_NOTA);
  });
});

describe('trava: junção com o valor com juros', () => {
  it('pega o {{valor_com_juros}} na linha que fala de junção', () => {
    expect(juncaoComJuros('2️⃣ Junção das parcelas em atraso: {{valor_com_juros}}')).toBe(true);
    expect(juncaoComJuros('Regularizar a juncao por *{{ valor_com_juros }}*')).toBe(true);
  });

  it('não trava o saldo com juros em outra linha, nem a junção certa', () => {
    expect(juncaoComJuros('1️⃣ Junção: {{juncao}}\n2️⃣ Saldo com juros: {{valor_com_juros}}')).toBe(false);
    expect(juncaoComJuros('Junção {{juncao}} com {{pct_juncao}} OFF')).toBe(false);
  });

  it('o «Corrigir» troca só na linha da junção', () => {
    expect(corrigirJuncaoComJuros('Junção: {{valor_com_juros}}\nSaldo: {{valor_com_juros}}'))
      .toBe('Junção: {{juncao}}\nSaldo: {{valor_com_juros}}');
  });
});

describe('junção', () => {
  it('sem parcial: 168 × 3 − 12% = 444', () => {
    const item = CampaignCore.deriveRecord(registro({ atraso: '2', valor: '336', aberto: '504' }), comJuncao(12));
    expect(item.bundle).toBe(444); // 443,52
  });

  it('com parcial: 168 + 28 + 168 − 12% = 321 (antes, a média: 259)', () => {
    const item = CampaignCore.deriveRecord(registro({ atraso: '2', valor: '196', aberto: '364' }), comJuncao(12));
    expect(item.bundleNext).toBe(168);
    expect(item.bundle).toBe(321); // 320,32
  });

  it('NR 13039938: (626,85 + 199) − 25% = 620 (saiu 588 pela média)', () => {
    const item = CampaignCore.deriveRecord(registro({ atraso: '4', valor: '626,85', aberto: '5402,85', atualizado: '5436,55' }), comJuncao(25));
    expect(item.bundle).toBe(620); // 619,39
  });

  it('Beatriz (NR 12830058) continua 280: o % é sobre a junção inteira', () => {
    const item = CampaignCore.deriveRecord(registro({ atraso: '1', valor: '159', aberto: '318' }), comJuncao(12));
    expect(item.bundle).toBe(280);
  });

  it('o Valor Atualizado não muda a junção', () => {
    const a = CampaignCore.deriveRecord(registro({ atraso: '2', valor: '196', aberto: '364', atualizado: '400' }), comJuncao(12));
    const b = CampaignCore.deriveRecord(registro({ atraso: '2', valor: '196', aberto: '364', atualizado: '9000' }), comJuncao(12));
    expect(a.bundle).toBe(b.bundle);
  });

  it('parcela de nota que não fecha: a média e «Revisar» quando a mensagem cita a junção', () => {
    const rec = registro({ atraso: '2', valor: '100,01', aberto: '137,38' });
    const [comJ] = CampaignCore.buildCampaign([rec], { template: 'Junção {{juncao}}', senders: ['Ana'] });
    expect(comJ.bundleNoteFound).toBe(false);
    expect(comJ.issues).toContain(CampaignCore.JUNCAO_SEM_PARCELA_DE_NOTA);
    expect(comJ.status).toBe('Revisar');
    const [semJ] = CampaignCore.buildCampaign([rec], { template: 'Quitação {{quitacao}}', senders: ['Ana'] });
    expect(semJ.issues).not.toContain(CampaignCore.JUNCAO_SEM_PARCELA_DE_NOTA);
  });
});

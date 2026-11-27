/**
 * Junção pela parcela de nota (27/11/2026): atrasadas pelo que falta pagar
 * nelas (a parcial pelo que sobrou) + a próxima pelo valor de nota, com o %
 * sobre a junção inteira. O Valor Atualizado (com juros) não entra.
 */
import { describe, expect, it } from 'vitest';
import { CampaignCore, type RawRecord } from './lib/campaign-core';

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
    expect(CampaignCore.parcelaDeNota(2, 336, 504)).toEqual({ proxima: 168, identificada: true });
    expect(CampaignCore.parcelaDeNota(1, 159, 318)).toEqual({ proxima: 159, identificada: true });
  });

  it('uma atrasada parcial: acha a parcela cheia (168 + 28, uma a vencer)', () => {
    expect(CampaignCore.parcelaDeNota(2, 196, 364)).toEqual({ proxima: 168, identificada: true });
  });

  it('NR 13039938: 3 × 199 + 29,85 em atraso e 24 × 199 a vencer', () => {
    expect(CampaignCore.parcelaDeNota(4, 626.85, 5402.85)).toEqual({ proxima: 199, identificada: true });
  });

  it('nada a vencer: a junção é só das atrasadas', () => {
    expect(CampaignCore.parcelaDeNota(2, 196, 196)).toEqual({ proxima: 0, identificada: true });
  });

  it('conta que não fecha com um valor só: não identificada', () => {
    // 1 atrasada de 28 e 168 a vencer: 28 pode ser parcela cheia (6 a vencer) ou parcial.
    // Fecha como parcela cheia, então fica a média — é o que o arquivo diz.
    expect(CampaignCore.parcelaDeNota(1, 28, 196).identificada).toBe(true);
    // Nenhum valor fecha: 2 atrasadas somando 100,01 e 37,37 a vencer.
    expect(CampaignCore.parcelaDeNota(2, 100.01, 137.38)).toEqual({ proxima: null, identificada: false });
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

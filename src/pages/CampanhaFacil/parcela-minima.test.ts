/**
 * Parcela mínima de R$ 30 (26/10/2026) e as pendências por tipo.
 */
import { describe, expect, it } from 'vitest';
import { CampaignCore, type RawRecord } from './lib/campaign-core';
import {
  PARCELA_MINIMA, PENDENCIA_PARCELA_MINIMA, mensagemAindaTemParcelaBaixa, parcelasBaixasDoItem,
  sugestaoDeParcelas, variaveisParceladasDoModelo,
} from './parcela-minima';
import { agruparPendencias, linhasComPendencia } from './pendencias';
import { VARIABLE_LABELS } from './VariaveisMensagem';

function registro(rowNumber: number, valorAberto: string, extra: Record<string, string> = {}): RawRecord {
  const values: Record<string, string> = {
    Nome: 'MARIA DA SILVA', CPF: '123', Contrato: String(rowNumber), 'Parcelas em atraso': '3', Protesto: '0',
    Valor: '300', 'Valor Aberto': valorAberto, 'Valor Atualizado': '9999', 'Tp. Venda': 'BOOK',
    'Whats Titular': '18999999999', ...extra,
  };
  const normalized = Object.fromEntries(Object.entries(values).map(([k, v]) => [CampaignCore.normalizeHeader(k), v]));
  return { rowNumber, values, normalized, sourceType: 'report-247', financialDataAvailable: true };
}

const D = CampaignCore.DEFAULT_DISCOUNTS;

describe('parcela mínima', () => {
  it('é R$ 30', () => {
    expect(PARCELA_MINIMA).toBe(30);
  });

  it('cobre toda variável parcelada (Nx) que a mensagem pode usar', () => {
    const parceladas = Object.keys(VARIABLE_LABELS).filter((v) => /_\d+x$/.test(v) || v === 'cartao_quitacao' || v === 'cartao_anual');
    const corpo = parceladas.map((v) => `{{${v}}}`).join(' ');
    expect(variaveisParceladasDoModelo(corpo).map((v) => v.variavel).sort()).toEqual(parceladas.sort());
  });

  it('valor à vista e a parcela do contrato não contam', () => {
    expect(variaveisParceladasDoModelo('{{quitacao}} {{juncao}} {{anual}} {{parcela_desconto}} {{pix_automatico_parcela}}')).toEqual([]);
  });

  it('Pix Automático 21x de R$ 15 trava; 21x de R$ 30 passa', () => {
    const variaveis = variaveisParceladasDoModelo('Pix em 21x de {{pix_automatico_21x}}');
    const baixo = CampaignCore.deriveRecord(registro(2, '315'), D);   // 315 / 21 = 15
    const ok = CampaignCore.deriveRecord(registro(3, '630'), D);      // 630 / 21 = 30
    const [b] = parcelasBaixasDoItem(baixo, variaveis, D);
    expect(b).toMatchObject({ variavel: 'pix_automatico_21x', vezes: 21, parcela: 15, total: 315 });
    expect(b.sugestao).toEqual({ vezes: 10, parcela: 32 });           // 315 / 10 = 31,50 → 32
    expect(parcelasBaixasDoItem(ok, variaveis, D)).toEqual([]);
  });

  it('só olha as variáveis que a mensagem usa', () => {
    const item = CampaignCore.deriveRecord(registro(2, '315'), D);
    expect(parcelasBaixasDoItem(item, variaveisParceladasDoModelo('Quitação: {{quitacao}}'), D)).toEqual([]);
  });

  it('sugestão: menos de R$ 60 não cabe nem em 2x', () => {
    expect(sugestaoDeParcelas(59)).toBeNull();
    expect(sugestaoDeParcelas(60)).toEqual({ vezes: 2, parcela: 30 });
  });

  it('mensagem editada sem o valor baixo passa; sem mexer, continua travada', () => {
    const item = CampaignCore.deriveRecord(registro(2, '315'), D);
    const baixas = parcelasBaixasDoItem(item, variaveisParceladasDoModelo('{{pix_automatico_21x}}'), D);
    const original = CampaignCore.renderTemplate('Pix em 21x de {{pix_automatico_21x}}', CampaignCore.variablesFor(item, D));
    expect(mensagemAindaTemParcelaBaixa(original, baixas)).toBe(true);
    expect(mensagemAindaTemParcelaBaixa('Pix em 10x de R$ 32,00', baixas)).toBe(false);
  });
});

describe('pendências por tipo', () => {
  it('conta cada tipo à parte, sem a de «quem encaminhará», e tira por tipo ou todas', () => {
    const itens = CampaignCore.buildCampaign([
      registro(2, '1000', { 'Whats Titular': '' }),
      registro(3, '1000', { 'Whats Titular': '' }),
      registro(4, '1000', { Nome: '' }),
      registro(5, '1000'),
    ], { discounts: D, senders: [], template: 'Olá {{nome}}' });
    itens[0].issues.push(PENDENCIA_PARCELA_MINIMA);
    const grupos = agruparPendencias(itens);
    expect(grupos.map((g) => [g.motivo, g.quantidade])).toEqual([
      [PENDENCIA_PARCELA_MINIMA, 1],
      ['WhatsApp ausente', 2],
      ['Nome ausente', 1],
    ]);
    expect(grupos[0].trava).toBe(true);
    expect(linhasComPendencia(itens, 'WhatsApp ausente')).toEqual([2, 3]);
    expect(linhasComPendencia(itens)).toEqual([2, 3, 4]);
  });
});

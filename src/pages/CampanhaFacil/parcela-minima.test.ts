/**
 * Parcela mínima de R$ 30 (26/10/2026) e as pendências por tipo.
 */
import { describe, expect, it } from 'vitest';
import { CampaignCore, type RawRecord } from './lib/campaign-core';
import {
  PARCELA_MINIMA, PENDENCIA_PARCELA_MANTIDA, PENDENCIA_PARCELA_MINIMA, aplicarParcelaMinima,
  mensagemAindaTemParcelaBaixa, parcelasBaixasDoItem, sugestaoDeParcelas, variaveisParceladasDoModelo,
} from './parcela-minima';
import { corrigirVezesRepetidas, vezesRepetidas } from './detalheDasVariaveis';
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
    const parceladas = VARIABLE_LABELS.map(([v]) => v).filter((v) => /_\d+x$/.test(v) || v === 'cartao_quitacao' || v === 'cartao_anual');
    expect(parceladas).toContain('cartao_recorrente_desconto_21x');
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

describe('recalcular e manter mesmo assim (27/10/2026)', () => {
  const montar = (corpo: string, ...linhas: RawRecord[]) =>
    CampaignCore.buildCampaign(linhas, { discounts: D, senders: ['Ana'], template: corpo });
  const SEM = { recalcular: false, manter: false, editadas: new Map<number, string>() };
  /** O «R$» do formatador tem espaço não separável. */
  const vz = (n: number, v: number) => `${n}x de ${CampaignCore.formatCurrency(v)}`;

  it('as variáveis parceladas saem com as vezes', () => {
    const [item] = montar('Pix em {{pix_automatico_21x}}', registro(2, '315'));
    expect(item.message).toBe(`Pix em ${vz(21, 15)}`);
  });

  it('recalcular troca as vezes e o valor juntos, sem mudar o total, e destrava', () => {
    const itens = montar('Pix em {{pix_automatico_21x}}', registro(2, '315'));
    const { travadas, contagem } = aplicarParcelaMinima(itens, 'Pix em {{pix_automatico_21x}}', D, { ...SEM, recalcular: true });
    expect(itens[0].message).toBe(`Pix em ${vz(10, 32)}`);          // 315 ÷ 10 = 31,50 → 32
    expect(travadas.size).toBe(0);
    expect(contagem).toMatchObject({ recalculaveis: 1, recalculadas: 1 });
    // As variáveis que vão ao banco (para refazer o texto) levam o recálculo.
    expect(CampaignCore.variablesFor(itens[0], D).pix_automatico_21x).toBe(vz(10, 32));
  });

  it('sem recalcular, a parcela baixa trava e mostra que tem conserto', () => {
    const itens = montar('Pix em {{pix_automatico_21x}}', registro(2, '315'));
    const { travadas, contagem } = aplicarParcelaMinima(itens, 'Pix em {{pix_automatico_21x}}', D, SEM);
    expect(travadas.has(2)).toBe(true);
    expect(itens[0].issues).toContain(PENDENCIA_PARCELA_MINIMA);
    expect(contagem).toMatchObject({ recalculaveis: 1, recalculadas: 0, rigidas: 1, mantiveis: 0 });
  });

  it('manter libera cartão de crédito, mas não Pix Automático nem Cartão Recorrente', () => {
    // Valor Aberto 300 com 30% na quitação = 210; ÷ 12 = 17,50 → 18. E < 60 do Pix: sem conserto.
    const corpo = 'Cartão: {{cartao_quitacao}}';
    const cartao = montar(corpo, registro(2, '300'));
    const r1 = aplicarParcelaMinima(cartao, corpo, D, { ...SEM, manter: true });
    expect(r1.travadas.size).toBe(0);
    expect(cartao[0].issues).toContain(PENDENCIA_PARCELA_MANTIDA);
    expect(cartao[0].issues).not.toContain(PENDENCIA_PARCELA_MINIMA);
    expect(r1.contagem.mantidas).toBe(1);

    for (const v of ['pix_automatico_21x', 'cartao_recorrente_desconto_21x']) {
      const c = `Parcele: {{${v}}}`;
      const itens = montar(c, registro(3, '50'));                    // não cabe nem em 2x
      const r = aplicarParcelaMinima(itens, c, D, { recalcular: true, manter: true, editadas: new Map() });
      expect(r.travadas.has(3)).toBe(true);
      expect(r.contagem).toMatchObject({ rigidas: 1, mantidas: 0, recalculadas: 0 });
    }
  });

  it('a mensagem editada à mão não é recalculada', () => {
    const corpo = 'Pix em {{pix_automatico_21x}}';
    const itens = montar(corpo, registro(2, '315'));
    const editadas = new Map([[2, 'Pix em 21x de R$ 15,00, combinado']]);
    const { travadas } = aplicarParcelaMinima(itens, corpo, D, { recalcular: true, manter: false, editadas });
    expect(itens[0].message).toBe('Pix em 21x de R$ 15,00, combinado');
    expect(travadas.has(2)).toBe(true);
  });
});

describe('as vezes repetidas antes da variável', () => {
  it('acha e corrige «12x de {{cartao_quitacao}}», guardando o negrito', () => {
    expect(vezesRepetidas('em até 12x de *{{cartao_quitacao}}* ou 21x {{pix_automatico_21x}}'))
      .toEqual(['cartao_quitacao', 'pix_automatico_21x']);
    expect(corrigirVezesRepetidas('em até *12x de {{cartao_quitacao}}*')).toBe('em até *{{cartao_quitacao}}*');
    expect(corrigirVezesRepetidas('em até *12x de *{{cartao_quitacao}}*')).toBe('em até *{{cartao_quitacao}}*');
    expect(corrigirVezesRepetidas('em 12 vezes: {{cartao_quitacao}}')).toBe('em {{cartao_quitacao}}');
    expect(corrigirVezesRepetidas('12x de R$ {{cartao_quitacao}}')).toBe('{{cartao_quitacao}}');
  });

  it('número diferente do da variável não é tocado', () => {
    const t = 'em até 12x {{juncao_6x}} e 20x de {{cartao_quitacao}}';
    expect(vezesRepetidas(t)).toEqual([]);
    expect(corrigirVezesRepetidas(t)).toBe(t);
  });

  it('nenhum modelo padrão repete as vezes', () => {
    for (const t of CampaignCore.TEMPLATES) expect([t.id, vezesRepetidas(t.body)]).toEqual([t.id, []]);
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

/**
 * Variáveis de 16/10/2026: 12x, 20x e 21x em todas as modalidades parceladas,
 * e os dados do cliente que vêm do mailing (endereço, cidade, local de
 * trabalho, ocupação e tempo de atraso).
 */
import { describe, expect, it } from 'vitest';
import { CampaignCore, type RawRecord } from './lib/campaign-core';
import { mensagemUsaValores } from './regras-mensagem';
import { SECOES, VARIABLE_GROUPS, VARIABLE_LABELS } from './VariaveisMensagem';

function registro(extra: Record<string, string> = {}): RawRecord {
  const values: Record<string, string> = {
    Nome: 'MARIA DA SILVA', CPF: '123', Contrato: '999', 'Parcelas em atraso': '2', Protesto: '0',
    Valor: '400', 'Valor Aberto': '2000', 'Valor Atualizado': '2100', 'Tp. Venda': 'PRO',
    'Whats Titular': '18999999999', ...extra,
  };
  const normalized = Object.fromEntries(Object.entries(values).map(([k, v]) => [CampaignCore.normalizeHeader(k), v]));
  return { rowNumber: 2, values, normalized, sourceType: 'report-247', financialDataAvailable: true };
}

/** As parceladas saem com as vezes (27/10/2026): «12x de R$ 117,00». */
const vezes = (n: number, valor: number) => `${n}x de ${CampaignCore.formatCurrency(valor)}`;

describe('parcelamentos em 12x, 20x e 21x', () => {
  const descontos = { ...CampaignCore.DEFAULT_DISCOUNTS, settlement: 30, annual: 25, pix_automatico: 5 };
  const item = CampaignCore.deriveRecord(registro(), descontos);
  const v = CampaignCore.variablesFor(item, descontos);

  it('cartão: quitação e anual, o total ÷ n arredondado para cima', () => {
    expect(item.settlement).toBe(1400); // 2000 × 0,70
    expect(v.cartao_quitacao).toBe(vezes(12, 117)); // 1400 / 12 = 116,67
    expect(v.cartao_quitacao_20x).toBe(vezes(20, 70));
    expect(v.cartao_quitacao_21x).toBe(vezes(21, 67)); // 66,67
    expect(item.annual).toBe(1800); // 200 × 12 × 0,75
    expect(v.cartao_anual_20x).toBe(vezes(20, 90));
    expect(v.cartao_anual_21x).toBe(vezes(21, 86)); // 85,71
  });

  it('Pix Automático: do Valor Aberto, com e sem desconto (21/10/2026)', () => {
    expect(v.pix_automatico_12x).toBe(vezes(12, 167)); // 2000 / 12 = 166,67
    expect(v.pix_automatico_20x).toBe(vezes(20, 100));
    expect(v.pix_automatico_21x).toBe(vezes(21, 96)); // 95,24
    expect(v.pix_automatico_desconto_12x).toBe(vezes(12, 159)); // 1900 / 12 = 158,33
    expect(v.pix_automatico_desconto_20x).toBe(vezes(20, 95));
    expect(v.pix_automatico_desconto_21x).toBe(vezes(21, 91)); // 90,48
  });

  it('Cartão Recorrente: o Pix Automático clonado, com o próprio % (27/10/2026)', () => {
    const d = { ...descontos, cartao_recorrente: 10 };
    const r = CampaignCore.variablesFor(CampaignCore.deriveRecord(registro(), d), d);
    expect(r.cartao_recorrente_12x).toBe(vezes(12, 167));
    expect(r.cartao_recorrente_21x).toBe(vezes(21, 96));
    expect(r.cartao_recorrente_desconto_12x).toBe(vezes(12, 150)); // 1800 / 12
    expect(r.cartao_recorrente_desconto_21x).toBe(vezes(21, 86)); // 1800 / 21 = 85,71
    expect(r.cartao_recorrente_parcela).toBe(CampaignCore.formatCurrency(180)); // 200 − 10%
    expect(r.pct_cartao_recorrente).toBe('10%');
    // O % do Pix não mexe no Cartão Recorrente.
    expect(r.pix_automatico_desconto_21x).toBe(vezes(21, 91));
    expect(mensagemUsaValores('x {{cartao_recorrente_desconto_21x}} y')).toBe(true);
  });

  it('as variáveis novas de valor travam no relatório sem valores', () => {
    for (const k of ['cartao_quitacao_20x', 'cartao_anual_21x', 'pix_automatico_12x', 'pix_automatico_desconto_20x']) {
      expect(mensagemUsaValores(`x {{${k}}} y`)).toBe(true);
    }
  });
});

describe('junção parcelada em 6x e 12x (20/10/2026)', () => {
  // 2 parcelas em atraso de 200: junção = 200 × 3 × (1 − 15%) = 510.
  const item = CampaignCore.deriveRecord(registro(), CampaignCore.DEFAULT_DISCOUNTS);
  const v = CampaignCore.variablesFor(item, CampaignCore.DEFAULT_DISCOUNTS);

  it('o valor da junção ÷ n, arredondado para cima, como o cartão', () => {
    expect(item.bundle).toBe(510);
    expect(v.juncao_6x).toBe(vezes(6, 85));
    expect(v.juncao_12x).toBe(vezes(12, 43)); // 42,50
  });

  it('a mensagem do exemplo sai com a junção e a parcela', () => {
    // As vezes vêm na variável (27/10/2026): a mensagem não escreve «12x de».
    const texto = CampaignCore.renderTemplate('aproveitando a {{juncao}} em até {{juncao_12x}}', v);
    expect(texto).toBe(`aproveitando a ${CampaignCore.formatCurrency(510)} em até 12x de ${CampaignCore.formatCurrency(43)}`);
  });

  it('sem parcela em atraso, zero, como a junção', () => {
    const semAtraso = CampaignCore.deriveRecord(registro({ 'Parcelas em atraso': '0' }), CampaignCore.DEFAULT_DISCOUNTS);
    expect(semAtraso.installments.bundle[6]).toBe(0);
    expect(semAtraso.installments.bundle[12]).toBe(0);
  });

  it('são valor: travam no relatório sem valores', () => {
    expect(mensagemUsaValores('x {{juncao_6x}} y')).toBe(true);
    expect(mensagemUsaValores('x {{juncao_12x}} y')).toBe(true);
  });
});

describe('dados do mailing', () => {
  it('pelo nome da coluna, ou pelo pedaço do nome', () => {
    const item = CampaignCore.deriveRecord(registro({
      'Endereço': 'Rua das Flores, 10', 'Cidade': 'Birigui', 'Local Trabalho Cliente': 'Hospital Central',
      'Profissão': 'Enfermeira', 'Dias de Atraso': '45',
    }));
    const v = CampaignCore.variablesFor(item, CampaignCore.DEFAULT_DISCOUNTS);
    expect(v.endereco).toBe('Rua das Flores, 10');
    expect(v.cidade).toBe('Birigui');
    expect(v.local_trabalho).toBe('Hospital Central');
    expect(v.ocupacao).toBe('Enfermeira');
    expect(v.tempo_atraso).toBe('45 dias');
  });

  it('«Endereço de e-mail» não vira endereço; «Parcelas em atraso» não vira tempo de atraso', () => {
    const item = CampaignCore.deriveRecord(registro({ 'Endereço de E-mail': 'ana@x.com' }));
    expect(item.mailing.endereco).toBe('');
    expect(item.mailing.tempo_atraso).toBe('');
  });

  it('não são valor: servem ao relatório 245, que traz o «Atraso» em dias', () => {
    expect(mensagemUsaValores('{{cidade}} {{tempo_atraso}} {{endereco}}')).toBe(false);
    const CAB = ['Grupo', 'Usuário', 'Dt.Pagamento', 'Cód.Cliente', 'Cliente', 'Nr.Documento', 'Empresa',
      'Valor Aberto', 'DDD 1', 'Telefone 1', 'Atraso', 'Cidade'];
    const linha = ['COB PLAY 1', 'ANA', '', '1', 'ANA SOUZA', '123', 'BOOKPLAY', '9', '18', '999999999', '1', 'Marília'];
    const r = CampaignCore.parseReport245([CAB, linha]);
    const item = CampaignCore.deriveRecord(r.records[0]);
    expect(item.mailing.tempo_atraso).toBe('1 dia');
    expect(item.mailing.cidade).toBe('Marília');
  });

  it('mensagem que cita um dado ausente pede revisão, sem travar', () => {
    const [item] = CampaignCore.buildCampaign([registro()], { template: 'Olá {{primeiro_nome}} de {{cidade}}', senders: ['Ana'] });
    expect(item.issues).toContain('Cidade ausente no mailing');
    expect(item.status).toBe('Revisar');
    expect(item.hasBlockingIssues).toBe(false);
  });
});

describe('os botões das variáveis, por categoria', () => {
  it('nome e empresa (sem valor) ficam separados dos valores', () => {
    const grupo = (k: string) => VARIABLE_GROUPS.find((g) => g.itens.some(([v]) => v === k))?.titulo;
    expect(grupo('nome')).toBe(grupo('empresa'));
    expect(grupo('quitacao')).not.toBe(grupo('nome'));
    expect(grupo('cidade')).toBe('Do mailing');
  });

  const doGrupo = (k: string) => VARIABLE_GROUPS.find((g) => g.itens.some(([v]) => v === k));

  it('cada forma de pagamento no seu bloco: Pix Automático só com Pix Automático (21/10/2026)', () => {
    const pix = VARIABLE_GROUPS.filter((g) => g.secao === 'pix_automatico').flatMap((g) => g.itens.map(([v]) => v));
    expect(pix.sort()).toEqual([
      'pix_automatico_12x', 'pix_automatico_20x', 'pix_automatico_21x',
      'pix_automatico_desconto_12x', 'pix_automatico_desconto_20x', 'pix_automatico_desconto_21x',
      'pix_automatico_parcela',
    ]);
    for (const k of ['quitacao', 'cartao_quitacao', 'cartao_quitacao_20x', 'cartao_quitacao_21x']) {
      expect(doGrupo(k)?.secao).toBe('quitacao');
    }
    for (const k of ['anual', 'cartao_anual', 'cartao_anual_20x', 'cartao_anual_21x']) {
      expect(doGrupo(k)?.secao).toBe('anual');
    }
    for (const k of ['parcela_desconto', 'juncao', 'juncao_6x', 'juncao_12x']) {
      expect(doGrupo(k)?.secao).toBe('atraso');
    }
    const recorrente = VARIABLE_GROUPS.filter((g) => g.secao === 'cartao_recorrente').flatMap((g) => g.itens.map(([v]) => v));
    expect(recorrente.sort()).toEqual([
      'cartao_recorrente_12x', 'cartao_recorrente_20x', 'cartao_recorrente_21x',
      'cartao_recorrente_desconto_12x', 'cartao_recorrente_desconto_20x', 'cartao_recorrente_desconto_21x',
      'cartao_recorrente_parcela',
    ]);
    expect(SECOES.map((s) => s.id)).toEqual(['cliente', 'pix_automatico', 'cartao_recorrente', 'quitacao', 'atraso', 'anual', 'juros', 'percentuais']);
  });

  it('dentro do bloco, sem desconto e com desconto em grupos separados', () => {
    for (const k of ['valor_com_juros', 'pix_automatico_12x', 'pix_automatico_20x', 'pix_automatico_21x']) {
      expect(doGrupo(k)?.desconto).toBe(false);
    }
    for (const k of ['parcela_desconto', 'pix_automatico_parcela', 'juncao', 'juncao_12x', 'quitacao',
      'cartao_quitacao', 'anual', 'cartao_anual_21x', 'pix_automatico_desconto_21x']) {
      expect(doGrupo(k)?.desconto).toBe(true);
    }
    // Nenhum grupo mistura: o sem desconto é sempre rosa, o com desconto sempre verde.
    for (const g of VARIABLE_GROUPS.filter((x) => x.desconto !== undefined)) {
      expect(g.tom).toBe(g.desconto ? 'verde' : 'rosa');
    }
  });

  it('toda variável que a mensagem conhece tem botão, e nenhuma aparece duas vezes', () => {
    const item = CampaignCore.deriveRecord(registro());
    const conhecidas = Object.keys(CampaignCore.variablesFor(item, CampaignCore.DEFAULT_DISCOUNTS)).filter((k) => k !== 'telefone');
    const botoes = VARIABLE_LABELS.map(([k]) => k);
    expect(new Set(botoes).size).toBe(botoes.length);
    expect([...conhecidas].sort()).toEqual([...botoes].sort());
  });
});

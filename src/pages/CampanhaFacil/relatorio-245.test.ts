/**
 * relatorio-245.test.ts — as regras da campanha PREVENTIVA.
 *
 * O 245 é o relatório cadastral: sem valores, sem cálculo, só o contato. Cada
 * caso aqui corresponde a uma regra que o usuário conferiu na operação, e
 * quatro delas estavam erradas quando este arquivo nasceu — em especial os
 * filtros, que não existiam e deixavam a campanha sair para setor de
 * Manutenção, Marília-COFEN, Jornada e para quem já tinha pagado.
 */
import { describe, it, expect } from 'vitest';
import { CampaignCore } from './lib/campaign-core';

/** Cabeçalho do 245 com as colunas que a operação exporta. */
const CABECALHO = [
  'Cód.Cliente', 'Cliente', 'Nr.Documento', 'Empresa', 'Grupo', 'Usuário',
  'Dt.Pagamento', 'DDD 1', 'Telefone 1',
];

function linha(over: Partial<Record<string, string>> = {}): string[] {
  const base: Record<string, string> = {
    'Cód.Cliente': '5009294',
    'Cliente':     'MARIA SILVA',
    'Nr.Documento': 'CT-1234',
    'Empresa':     'PAGUE PLAY',
    'Grupo':       'COBRANCA GERAL',
    'Usuário':     'PAGUEPLAY',
    'Dt.Pagamento': '',
    'DDD 1':       '14',
    'Telefone 1':  '997654321',
    ...over,
  };
  return CABECALHO.map((c) => base[c] ?? '');
}

function planilha(linhas: string[][]): unknown[][] {
  return [CABECALHO, ...linhas];
}

describe('detecção do relatório 245', () => {
  it('reconhece o arquivo e o marca como campanha preventiva', () => {
    const r = CampaignCore.parseReport245(planilha([linha()]));
    expect(r.sourceType).toBe('report-245');
    expect(r.reportCode).toBe('245');
    // Era 'pagueplay-unpaid-discounts' — o 245 não é campanha de desconto.
    expect(r.campaignPurpose).toBe('preventivo');
    expect(r.financialDataAvailable).toBe(false);
  });

  it('não é confundido com o relatório de cobrança', () => {
    expect(CampaignCore.isReport245Rows(planilha([linha()]))).toBe(true);
    expect(CampaignCore.isCollectionsReportRows(planilha([linha()]))).toBe(false);
  });
});

describe('dados usados', () => {
  it('usa nome, documento e empresa; zera todo campo financeiro', () => {
    const r = CampaignCore.parseReport245(planilha([linha()]));
    const v = r.records[0].values;
    expect(v['Nome']).toBe('MARIA SILVA');
    expect(v['Contratos']).toBe('CT-1234');
    expect(v['Tp. Venda']).toBe('PAGUE PLAY');
    for (const campo of ['Valor', 'Valor Aberto', 'Valor Atualizado', 'Parcelas em atraso', 'Protesto']) {
      expect(v[campo]).toBe('');
    }
  });

  it('monta o WhatsApp por DDD 1 + Telefone 1', () => {
    const r = CampaignCore.parseReport245(planilha([linha()]));
    expect(r.records[0].values['1']).toBe('14997654321');
  });

  it('telefone já com DDD embutido não é duplicado', () => {
    const r = CampaignCore.parseReport245(planilha([linha({ 'Telefone 1': '14997654321' })]));
    expect(r.records[0].values['1']).toBe('14997654321');
  });
});

describe('filtros automáticos', () => {
  const casos: [string, Record<string, string>, string][] = [
    ['Manutenção',      { 'Grupo': 'MANUTENCAO SP' },                    'maintenance'],
    ['Marília-COFEN',   { 'Grupo': 'MARILIA COFEN' },                    'cofen'],
    ['Jornada',         { 'Grupo': 'JORNADA' },                          'jornada'],
    ['Cobrança Geral de outro usuário', { 'Grupo': 'COBRANCA GERAL', 'Usuário': 'OUTRO' }, 'general-user'],
    ['já pagou',        { 'Dt.Pagamento': '31/07/2026' },                'paid'],
    ['sem cliente',     { 'Cliente': '' },                               'invalid-registration'],
    ['sem contrato',    { 'Nr.Documento': '' },                          'invalid-registration'],
  ];

  for (const [nome, campos, motivo] of casos) {
    it(`remove ${nome}`, () => {
      const r = CampaignCore.parseReport245(planilha([linha(), linha(campos)]));
      expect(r.records).toHaveLength(1);
      expect(r.filterStats?.removed).toBe(1);
      expect(r.excludedRecords?.[0].reasonCode).toBe(motivo);
    });
  }

  it('Cobrança Geral do próprio Pagueplay fica', () => {
    const r = CampaignCore.parseReport245(planilha([
      linha({ 'Grupo': 'COBRANCA GERAL', 'Usuário': 'PAGUEPLAY' }),
    ]));
    expect(r.records).toHaveLength(1);
    expect(r.filterStats?.removed).toBe(0);
  });

  it('conta o total e os incluídos', () => {
    const r = CampaignCore.parseReport245(planilha([
      linha(), linha(), linha({ 'Grupo': 'JORNADA' }),
    ]));
    expect(r.filterStats?.total).toBe(3);
    expect(r.filterStats?.included).toBe(2);
    expect(r.filterStats?.removed).toBe(1);
  });

  it('arquivo sem as colunas de filtro não perde ninguém', () => {
    // O cadastral pode vir sem Grupo/Usuário/Dt.Pagamento. Coluna ausente não
    // pode excluir a linha — senão o filtro apagaria a campanha inteira.
    const cabecalhoCurto = ['Cliente', 'Nr.Documento', 'Empresa', 'DDD 1', 'Telefone 1'];
    const r = CampaignCore.parseReport245([
      cabecalhoCurto,
      ['MARIA SILVA', 'CT-1', 'PAGUE PLAY', '14', '997654321'],
      ['JOAO SOUZA',  'CT-2', 'PAGUE PLAY', '14', '997654322'],
    ]);
    expect(r.records).toHaveLength(2);
    expect(r.filterStats?.removed).toBe(0);
  });

  it('todas removidas vira erro legível, não campanha vazia', () => {
    expect(() => CampaignCore.parseReport245(planilha([linha({ 'Grupo': 'JORNADA' })])))
      .toThrow(/filtros autom/i);
  });
});

describe('mensagem de preventivo', () => {
  const preventivo = CampaignCore.TEMPLATES.find((t) => t.id === 'preventivo')!;

  it('existe e se chama MENSAGEM DE PREVENTIVO', () => {
    expect(preventivo.name).toBe('MENSAGEM DE PREVENTIVO');
  });

  it('NÃO afirma que o pagamento está agendado para hoje', () => {
    // O 245 não traz data de pagamento: afirmar o agendamento era inventar um
    // fato, e o cliente respondia dizendo que não tinha agendado nada.
    expect(preventivo.body).not.toMatch(/agendado para/i);
  });

  it('preenche nome, contrato e empresa sozinha', () => {
    expect(preventivo.body).toContain('{{nome}}');
    expect(preventivo.body).toContain('{{contrato}}');
    expect(preventivo.body).toContain('{{empresa}}');
  });

  it('não usa nenhum valor financeiro', () => {
    expect(CampaignCore.templateRequiresFinancialData(preventivo.body)).toBe(false);
  });
});

describe('campanha montada', () => {
  function montar(senders: string[] = ['Bianca', 'Rafaela']) {
    const parsed = CampaignCore.parseReport245(planilha([linha(), linha({ 'Cliente': 'JOAO SOUZA' })]));
    const preventivo = CampaignCore.TEMPLATES.find((t) => t.id === 'preventivo')!;
    return CampaignCore.buildCampaign(parsed.records, { senders, template: preventivo.body });
  }

  it('mensagem sai com nome, contrato e empresa trocados', () => {
    const [item] = montar();
    // O nome vai formatado ("MARIA SILVA" → "Maria Silva") e a empresa
    // normalizada ("PAGUE PLAY" → "Pagueplay"): o relatório vem em caixa alta e
    // gritar com o cliente na mensagem não é o objetivo.
    expect(item.message).toContain('Maria Silva');
    expect(item.message).toContain('CT-1234');
    expect(item.message).toContain(item.company);
    expect(item.message).not.toContain('{{');
  });

  it('"Encaminhada por" usa só os nomes digitados, em rodízio', () => {
    const itens = montar(['Bianca', 'Rafaela']);
    expect(itens.map((i) => i.sender)).toEqual(['Bianca', 'Rafaela']);
  });

  it('sem nome digitado, marca para revisão em vez de inventar responsável', () => {
    const [item] = montar([]);
    expect(item.sender).toBe('');
    expect(item.status).toBe('Revisar');
  });

  it('nenhum valor financeiro é calculado', () => {
    const [item] = montar();
    expect(item.financialDataAvailable).toBe(false);
    for (const v of [item.value, item.openValue, item.settlement, item.annual, item.cardSettlement]) {
      expect(v).toBeNull();
    }
  });
});

describe('exportação', () => {
  function itens() {
    const parsed = CampaignCore.parseReport245(planilha([linha()]));
    const preventivo = CampaignCore.TEMPLATES.find((t) => t.id === 'preventivo')!;
    return CampaignCore.buildCampaign(parsed.records, { senders: ['Bianca'], template: preventivo.body });
  }

  it('CSV sem campos financeiros, com WhatsApp, mensagem e responsável', () => {
    const csv = CampaignCore.campaignToCsv(itens());
    const cabecalho = csv.split('\r\n')[0];

    expect(cabecalho).toContain('NOME');
    expect(cabecalho).toContain('NR. DOCUMENTO');
    expect(cabecalho).toContain('EMPRESA');
    // O número é o que torna a campanha enviável — faltava.
    expect(cabecalho).toContain('WHATSAPP');
    expect(cabecalho).toContain('MENSAGEM');
    expect(cabecalho).toContain('ENCAMINHADA POR');

    for (const financeiro of ['QUITACAO', 'PARCELA', 'JUNCAO', 'ANUAL', 'CARTAO', 'VALOR']) {
      expect(cabecalho).not.toContain(financeiro);
    }
    expect(csv).toContain('14997654321');
  });
});

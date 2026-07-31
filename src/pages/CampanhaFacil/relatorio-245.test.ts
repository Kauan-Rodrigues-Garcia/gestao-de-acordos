/**
 * relatorio-245.test.ts — os DOIS relatórios da aba, com os cabeçalhos reais.
 *
 * Os cabeçalhos abaixo foram copiados dos arquivos que a operação usa
 * (conferidos em 31/07/2026), e é isso que dá valor a este arquivo: a detecção
 * já esteve certa "no papel" e errada na prática — o 245 real caía no parser de
 * cobrança e saía com desconto calculado sobre valor zerado.
 *
 *   245 → .xls de ligações. TEM colunas de valor, mas a campanha preventiva as
 *         ignora. É onde os filtros de setor fazem sentido.
 *   247 → .csv separado por pipe, em Windows-1252. É a campanha COM valores.
 */
import { describe, it, expect } from 'vitest';
import { CampaignCore } from './lib/campaign-core';

// ── 245: cabeçalho real do .xls ─────────────────────────────────────────────
const CAB_245 = [
  'CodGrupo', 'Grupo', 'SubGrupo', 'Usuário', 'Dt.Ult.Ligação', 'Hr. Ult. Ligação',
  'Dt.Prev.Pgto.', 'Dt.Pagamento', 'Cód.Cliente', 'Cliente', 'Vencimento', 'Atraso',
  'Nr.Documento', 'Empresa', 'Valor Aberto', 'Valor a Vencer', 'Valor Original',
  'Valor Recebido', 'Email', 'DDD 1', 'Telefone 1', 'DDD 2', 'Telefone 2',
];

function linha245(over: Partial<Record<string, string>> = {}): string[] {
  const base: Record<string, string> = {
    'CodGrupo': '25', 'Grupo': 'COB PLAY 1 - PAOLA', 'SubGrupo': 'ARIANA',
    'Usuário': 'MAURO_SANTOS', 'Dt.Ult.Ligação': '7/21/26', 'Hr. Ult. Ligação': '13:53:19',
    'Dt.Prev.Pgto.': '7/22/26', 'Dt.Pagamento': '', 'Cód.Cliente': '2170',
    'Cliente': 'ANA MARIA DOS SANTOS', 'Vencimento': '7/20/26', 'Atraso': '7',
    'Nr.Documento': '12841463', 'Empresa': 'BOOKPLAY', 'Valor Aberto': '9.00',
    'Valor a Vencer': '1,330.00', 'Valor Original': '190.00', 'Valor Recebido': '190.00',
    'Email': 'ana@exemplo.com', 'DDD 1': '37', 'Telefone 1': '999176351',
    'DDD 2': '', 'Telefone 2': '',
    ...over,
  };
  return CAB_245.map((c) => base[c] ?? '');
}

const planilha245 = (linhas: string[][]) => [CAB_245, ...linhas];

// ── 247: cabeçalho real do .csv (recorte das colunas que importam) ──────────
const CAB_247 = [
  'Código', 'Nome', 'CPF', 'Aniversariante', 'Grupo', 'Instituição', 'Contratos',
  'Parcelas em atraso', 'Protesto', 'Valor', 'Valor Aberto', 'Valor Atualizado',
  'Tp. Venda', 'Operador', 'DDD1', '1', 'Whats Titular',
];

function csv247(linhas: string[][]): string {
  return [CAB_247, ...linhas].map((l) => l.join('|')).join('\r\n');
}

const LINHA_247 = [
  '35188030', 'MAXMYLIANO DE SOUSA MOURAO', '029.742.012-70', 'Não',
  'COB PLAY 1 - PAOLA', 'FaculdadeBookplay', '13002180', '1', '.00',
  '225.00', '4725.00', '4729.07', 'PEC', 'juliana_spereira',
  '99', '(99)98111-8335', '(99)98111-8335',
];

// ════════════════════════════════════════════════════════════════════════════

describe('detecção dos dois relatórios', () => {
  it('reconhece o 245 pelo cabeçalho real do .xls', () => {
    expect(CampaignCore.isReport245Rows(planilha245([linha245()]))).toBe(true);
  });

  it('245 vira campanha preventiva, sem valores', () => {
    const r = CampaignCore.parseReport245(planilha245([linha245()]));
    expect(r.sourceType).toBe('report-245');
    expect(r.reportCode).toBe('245');
    expect(r.campaignPurpose).toBe('preventivo');
    expect(r.financialDataAvailable).toBe(false);
  });

  it('247 é reconhecido no CSV com pipe', () => {
    const r = CampaignCore.parseMailing(csv247([LINHA_247]));
    expect(r.sourceType).toBe('report-247');
    expect(r.reportCode).toBe('247');
    expect(r.delimiter).toBe('|');
    expect(r.financialDataAvailable).toBe(true);
  });

  it('CSV de contatos sem colunas de valor não vira 247', () => {
    const texto = 'Nome|Contratos|DDD1|1\nJOAO|CT-1|11|(11)99999-9999';
    expect(CampaignCore.parseMailing(texto).sourceType).toBeUndefined();
  });

  it('245 não é confundido com o 247', () => {
    // O 245 TEM Valor Aberto, então detectá-lo pela ausência de colunas
    // financeiras — como já se tentou — nunca funcionaria.
    const r = CampaignCore.parseReport245(planilha245([linha245()]));
    expect(r.sourceType).not.toBe('report-247');
  });
});

describe('245 — dados usados', () => {
  it('usa nome, documento, empresa e telefone; zera todo campo financeiro', () => {
    const r = CampaignCore.parseReport245(planilha245([linha245()]));
    const v = r.records[0].values;
    expect(v['Nome']).toBe('ANA MARIA DOS SANTOS');
    expect(v['Contratos']).toBe('12841463');
    expect(v['Tp. Venda']).toBe('BOOKPLAY');
    // O arquivo traz 9.00 / 190.00 — a campanha preventiva não usa.
    for (const campo of ['Valor', 'Valor Aberto', 'Valor Atualizado', 'Parcelas em atraso', 'Protesto']) {
      expect(v[campo]).toBe('');
    }
  });

  it('monta o WhatsApp por DDD 1 + Telefone 1', () => {
    const r = CampaignCore.parseReport245(planilha245([linha245()]));
    expect(r.records[0].values['1']).toBe('37999176351');
  });

  it('o item derivado não tem NENHUM valor calculado', () => {
    // Era o pior sintoma: desconto de 30% sobre zero virava "R$ 0,00" na
    // mensagem enviada ao cliente.
    const r = CampaignCore.parseReport245(planilha245([linha245()]));
    const item = CampaignCore.deriveRecord(r.records[0], CampaignCore.DEFAULT_DISCOUNTS);
    expect(item.financialDataAvailable).toBe(false);
    for (const v of [item.value, item.openValue, item.settlement, item.annual, item.cardSettlement]) {
      expect(v).toBeNull();
    }
  });
});

describe('245 — filtros automáticos', () => {
  const casos: [string, Record<string, string>, string][] = [
    ['Manutenção',    { 'Grupo': 'MANUTENCAO SP' },                         'maintenance'],
    ['Marília-COFEN', { 'Grupo': 'MARILIA - COFEN' },                       'cofen'],
    ['Jornada',       { 'Grupo': 'JORNADAPLAY' },                           'jornada'],
    ['Cobrança Geral de outro usuário', { 'Grupo': 'COBRANÇA - GERAL', 'Usuário': 'OUTRO' }, 'general-user'],
    ['já pagou',      { 'Dt.Pagamento': '7/24/26' },                        'paid'],
    ['sem cliente',   { 'Cliente': '' },                                    'invalid-registration'],
    ['sem contrato',  { 'Nr.Documento': '' },                               'invalid-registration'],
  ];

  for (const [nome, campos, motivo] of casos) {
    it(`remove ${nome}`, () => {
      const r = CampaignCore.parseReport245(planilha245([linha245(), linha245(campos)]));
      expect(r.records).toHaveLength(1);
      expect(r.filterStats?.removed).toBe(1);
      expect(r.excludedRecords?.[0].reasonCode).toBe(motivo);
    });
  }

  it('Cobrança Geral do próprio Pagueplay fica', () => {
    const r = CampaignCore.parseReport245(planilha245([
      linha245({ 'Grupo': 'COBRANÇA - GERAL', 'Usuário': 'PAGUEPLAY' }),
    ]));
    expect(r.records).toHaveLength(1);
    expect(r.filterStats?.removed).toBe(0);
  });

  it('conta total, incluídos e removidos', () => {
    const r = CampaignCore.parseReport245(planilha245([
      linha245(), linha245(), linha245({ 'Grupo': 'JORNADAPLAY' }),
    ]));
    expect(r.filterStats?.total).toBe(3);
    expect(r.filterStats?.included).toBe(2);
    expect(r.filterStats?.removed).toBe(1);
  });

  it('todas removidas vira erro legível, não campanha vazia', () => {
    expect(() => CampaignCore.parseReport245(planilha245([linha245({ 'Grupo': 'JORNADAPLAY' })])))
      .toThrow(/filtros autom/i);
  });
});

describe('247 — mantém os valores', () => {
  it('calcula os descontos a partir do arquivo', () => {
    const r = CampaignCore.parseMailing(csv247([LINHA_247]));
    const item = CampaignCore.deriveRecord(r.records[0], CampaignCore.DEFAULT_DISCOUNTS);
    expect(item.financialDataAvailable).toBe(true);
    expect(item.openValue).toBeGreaterThan(0);
    expect(item.settlement).toBeGreaterThan(0);
    expect(item.name).toBe('MAXMYLIANO DE SOUSA MOURAO');
    expect(item.contract).toBe('13002180');
  });

  it('lê acento em Windows-1252 sem quebrar', () => {
    // O arquivo real vem em Latin-1: "Instituição", "Código".
    const texto = csv247([LINHA_247]);
    const bytes = new Uint8Array(texto.length);
    for (let i = 0; i < texto.length; i += 1) bytes[i] = texto.charCodeAt(i) & 0xff;
    const r = CampaignCore.parseMailing(bytes.buffer);
    expect(r.records).toHaveLength(1);
    expect(r.sourceType).toBe('report-247');
  });
});

describe('mensagem de preventivo', () => {
  const preventivo = CampaignCore.TEMPLATES.find((t) => t.id === 'preventivo')!;

  it('existe e se chama MENSAGEM DE PREVENTIVO', () => {
    expect(preventivo.name).toBe('MENSAGEM DE PREVENTIVO');
  });

  it('NÃO afirma que o pagamento está agendado para hoje', () => {
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

describe('campanha do preventivo', () => {
  function montar(senders: string[] = ['Bianca', 'Rafaela']) {
    const parsed = CampaignCore.parseReport245(planilha245([
      linha245(), linha245({ 'Cliente': 'JOAO SOUZA', 'Cód.Cliente': '2171' }),
    ]));
    const preventivo = CampaignCore.TEMPLATES.find((t) => t.id === 'preventivo')!;
    return CampaignCore.buildCampaign(parsed.records, { senders, template: preventivo.body });
  }

  it('mensagem sai com nome, contrato e empresa trocados', () => {
    const [item] = montar();
    // Nome vai formatado e empresa normalizada: o relatório vem em caixa alta,
    // e gritar com o cliente na mensagem não é o objetivo.
    expect(item.message).toContain('Ana Maria Dos Santos');
    expect(item.message).toContain('12841463');
    expect(item.message).toContain(item.company);
    expect(item.message).not.toContain('{{');
  });

  it('"Encaminhada por" usa só os nomes digitados, em rodízio', () => {
    expect(montar(['Bianca', 'Rafaela']).map((i) => i.sender)).toEqual(['Bianca', 'Rafaela']);
  });

  it('sem nome digitado, marca para revisão em vez de inventar responsável', () => {
    const [item] = montar([]);
    expect(item.sender).toBe('');
    expect(item.status).toBe('Revisar');
  });

  it('mensagem que usa valores é barrada com pendência', () => {
    const parsed = CampaignCore.parseReport245(planilha245([linha245()]));
    const comValores = CampaignCore.TEMPLATES.find((t) => t.id === 'garanta-desconto')!;
    const [item] = CampaignCore.buildCampaign(parsed.records, {
      senders: ['Bianca'], template: comValores.body,
    });
    expect(item.status).toBe('Revisar');
    expect(item.hasBlockingIssues).toBe(true);
  });
});

describe('exportação do preventivo', () => {
  function itens() {
    const parsed = CampaignCore.parseReport245(planilha245([linha245()]));
    const preventivo = CampaignCore.TEMPLATES.find((t) => t.id === 'preventivo')!;
    return CampaignCore.buildCampaign(parsed.records, { senders: ['Bianca'], template: preventivo.body });
  }

  it('CSV sem campos financeiros, com WhatsApp, mensagem e responsável', () => {
    const csv = CampaignCore.campaignToCsv(itens());
    const cabecalho = csv.split('\r\n')[0];

    for (const coluna of ['NOME', 'NR. DOCUMENTO', 'EMPRESA', 'WHATSAPP', 'MENSAGEM', 'ENCAMINHADA POR']) {
      expect(cabecalho).toContain(coluna);
    }
    for (const financeiro of ['QUITACAO', 'PARCELA', 'JUNCAO', 'ANUAL', 'CARTAO', 'VALOR']) {
      expect(cabecalho).not.toContain(financeiro);
    }
    expect(csv).toContain('37999176351');
  });
});

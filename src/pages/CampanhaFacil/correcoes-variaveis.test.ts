/**
 * Correções de 25/10/2026 (documento «Campanha Fácil — mailing e variáveis»):
 * a mensagem prometia uma coisa e a variável entregava outra.
 *
 *   - {{parcela_desconto}} é a soma das atrasadas; {{uma_parcela_desconto}} é uma só.
 *   - Os modelos prontos citam o % da aba ({{pct_*}}), e não um número escrito à mão.
 *   - Pix Automático nos modelos usa a variável do Pix, não a das atrasadas.
 *   - Tp. Venda desconhecido, link e CPF vazios pedem revisão.
 */
import { describe, expect, it } from 'vitest';
import { CampaignCore, type RawRecord } from './lib/campaign-core';
import { mensagemUsaValores } from './regras-mensagem';
import { VARIABLE_LABELS } from './VariaveisMensagem';

function registro(extra: Record<string, string> = {}, fonte: Partial<RawRecord> = {}): RawRecord {
  const values: Record<string, string> = {
    Nome: 'MARIA DA SILVA', CPF: '12345678900', Contrato: '999', 'Parcelas em atraso': '2', Protesto: '0',
    Valor: '400', 'Valor Aberto': '2000', 'Valor Atualizado': '2100', 'Tp. Venda': 'PRO',
    'Whats Titular': '18999999999', ...extra,
  };
  const normalized = Object.fromEntries(Object.entries(values).map(([k, v]) => [CampaignCore.normalizeHeader(k), v]));
  return { rowNumber: 2, values, normalized, sourceType: 'report-247', financialDataAvailable: true, ...fonte };
}

const campanha = (template: string, extra: Record<string, string> = {}, discounts = {}) =>
  CampaignCore.buildCampaign([registro(extra)], { template, senders: ['Ana'], discounts })[0];

describe('{{uma_parcela_desconto}}: uma parcela, e não a soma', () => {
  // 2 parcelas em atraso somando R$ 400 → parcela de R$ 200.
  const item = CampaignCore.deriveRecord(registro(), CampaignCore.DEFAULT_DISCOUNTS);
  const v = CampaignCore.variablesFor(item, CampaignCore.DEFAULT_DISCOUNTS);

  it('uma parcela com o % da parcela; a soma continua no {{parcela_desconto}}', () => {
    expect(v.uma_parcela_desconto).toBe(CampaignCore.formatCurrency(186)); // 200 × 0,93
    expect(v.parcela_desconto).toBe(CampaignCore.formatCurrency(372));     // 400 × 0,93
  });

  it('sem parcela em atraso, zero — como a junção', () => {
    const r = CampaignCore.deriveRecord(registro({ 'Parcelas em atraso': '0' }), CampaignCore.DEFAULT_DISCOUNTS);
    expect(r.overdueOneDiscounted).toBe(0);
  });

  it('exige valores e tem botão no editor', () => {
    expect(mensagemUsaValores('Parcela: {{uma_parcela_desconto}}')).toBe(true);
    expect(new Map(VARIABLE_LABELS).has('uma_parcela_desconto')).toBe(true);
  });
});

describe('modelos prontos', () => {
  const corpos = CampaignCore.TEMPLATES.map((t) => [t.id, t.body] as const);

  it('nenhum percentual de desconto escrito à mão', () => {
    // O cashback não é o desconto da conta; fica de fora.
    for (const [id, body] of corpos) {
      const semCashback = body.replace(/cashback \d+% OFF/gi, '');
      expect(semCashback, id).not.toMatch(/\d+ ?%/);
    }
  });

  it('o texto acompanha o % configurado na aba', () => {
    const ultimo = CampaignCore.templateById('ultimo-aviso').body;
    const item = campanha(ultimo, {}, { settlement: 40, bundle: 20, pix_automatico: 8 });
    expect(item.message).toContain('(40% OFF)');
    expect(item.message).toContain('(20% OFF)');
    expect(item.message).toContain('(8% OFF)');
  });

  it('Pix Automático nunca sai com o valor das atrasadas', () => {
    for (const [id, body] of corpos) {
      for (const linha of body.split('\n').filter((l) => /pix autom[aá]tico/i.test(l))) {
        expect(linha, id).not.toContain('{{parcela_desconto}}');
      }
    }
  });

  it('sem valor fixo de mentira, nem opção repetida', () => {
    for (const [id, body] of corpos) {
      expect(body, id).not.toContain('R$ 00,00');
      const opcoes = body.split('\n').filter((l) => /^\d️⃣/.test(l)).map((l) => l.replace(/^\d️⃣\s*-?\s*/, ''));
      expect(new Set(opcoes).size, id).toBe(opcoes.length);
    }
  });

  it('«parcela em atraso» não acompanha o valor de todas as atrasadas', () => {
    for (const [id, body] of corpos) {
      for (const linha of body.split('\n').filter((l) => l.includes('{{parcela_desconto}}'))) {
        expect(linha, id).not.toMatch(/\b(?:a |da )?parcela (?:em atraso|vencida)/i);
      }
    }
  });
});

describe('avisos de revisão', () => {
  it('Tp. Venda desconhecido, quando a mensagem cita a empresa ou o 0800', () => {
    const item = campanha('A {{empresa}} liberou', { 'Tp. Venda': 'BOOK' });
    expect(item.status).toBe('Revisar');
    expect(item.issues.join(' ')).toMatch(/Tp\. Venda «BOOK» não reconhecido/);
    expect(item.hasBlockingIssues).toBe(false);
    expect(campanha('Ligue {{atendimento}}', { 'Tp. Venda': 'BOOK' }).status).toBe('Revisar');
  });

  it('código conhecido, ou mensagem que não cita a empresa, não pede revisão', () => {
    expect(campanha('A {{empresa}} liberou', { 'Tp. Venda': 'PEC' }).status).toBe('Pronto');
    expect(campanha('Olá {{nome}}', { 'Tp. Venda': 'BOOK' }).status).toBe('Pronto');
  });

  it('link curto vazio, quando a mensagem usa {{link}}', () => {
    expect(campanha('Acesse {{link}}').issues).toContain('Link curto ausente no mailing');
    expect(campanha('Acesse {{link}}', { 'Link curto': 'https://x.y/z' }).status).toBe('Pronto');
  });

  it('CPF vazio, quando a mensagem usa {{cpf}}', () => {
    expect(campanha('CPF {{cpf}}', { CPF: '' }).issues).toContain('CPF ausente no mailing');
    expect(campanha('CPF {{cpf}}').status).toBe('Pronto');
  });

  it('no 245, o aviso do CPF diz que o relatório não traz', () => {
    const r245 = registro({ CPF: '' }, { sourceType: 'report-245', financialDataAvailable: false });
    const [item] = CampaignCore.buildCampaign([r245], { template: 'CPF {{cpf}}', senders: ['Ana'] });
    expect(item.issues).toContain('CPF ausente: o relatório 245 não traz CPF');
  });
});

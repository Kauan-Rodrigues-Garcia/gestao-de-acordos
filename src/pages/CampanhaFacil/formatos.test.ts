/**
 * Os formatadores passaram a ser criados uma vez só (15/10/2026, a campanha de
 * 10 mil clientes levava 4 s para montar). O texto que vai na mensagem não
 * pode mudar com isso.
 */
import { describe, expect, it } from 'vitest';
import { CampaignCore } from './lib/campaign-core';

describe('formatos da mensagem', () => {
  it('reais sempre com centavos, no padrão brasileiro', () => {
    expect(CampaignCore.formatCurrency(1234.5)).toMatch(/^R\$\s1\.234,50$/);
    expect(CampaignCore.formatCurrency(48)).toMatch(/^R\$\s48,00$/);
    expect(CampaignCore.formatCurrency(null)).toBe('');
  });

  it('percentual com vírgula e até duas casas', () => {
    expect(CampaignCore.formatPercent(12.5)).toBe('12,5%');
    expect(CampaignCore.formatPercent(7)).toBe('7%');
  });

  it('chamadas seguidas dão o mesmo texto (o formatador é reaproveitado)', () => {
    const a = Array.from({ length: 3 }, () => CampaignCore.formatCurrency(700));
    expect(new Set(a).size).toBe(1);
  });
});

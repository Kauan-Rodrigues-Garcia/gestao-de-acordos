/**
 * Pix Automático em 21x (09/10/2026): {{pix_automatico_21x}} = valor com juros
 * ÷ 21; {{pix_automatico_desconto_21x}} = valor com juros menos o % do Pix
 * Automático, ÷ 21. Arredondado para cima, em reais inteiros — como o cartão.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { CampaignCore, type RawRecord } from './lib/campaign-core';
import { mensagemUsaValores } from './regras-mensagem';
import { VARIABLE_LABELS } from './VariaveisMensagem';

function registro(valorAtualizado: string): RawRecord {
  const values: Record<string, string> = {
    Nome: 'MARIA DA SILVA', CPF: '123', Contrato: '999', 'Parcelas em atraso': '3', Protesto: '0',
    Valor: '300', 'Valor Aberto': '1000', 'Valor Atualizado': valorAtualizado, 'Tp. Venda': 'BOOK',
    'Whats Titular': '18999999999',
  };
  const normalized = Object.fromEntries(Object.entries(values).map(([k, v]) => [CampaignCore.normalizeHeader(k), v]));
  return { rowNumber: 2, values, normalized, sourceType: 'report-247', financialDataAvailable: true };
}

describe('Pix Automático 21x', () => {
  it('padrão de 5% de desconto', () => {
    expect(CampaignCore.DEFAULT_DISCOUNTS.pix_automatico).toBe(5);
  });

  it('valor com juros ÷ 21, e com desconto', () => {
    const item = CampaignCore.deriveRecord(registro('2100'), CampaignCore.DEFAULT_DISCOUNTS);
    expect(item.valueWithInterest).toBe(2100);
    expect(item.pixAuto).toBe(100);           // 2100 / 21
    expect(item.pixAutoDiscount).toBe(95);    // 2100 × 0,95 / 21 = 95
  });

  it('usa o % configurado e arredonda para cima', () => {
    const descontos = { ...CampaignCore.DEFAULT_DISCOUNTS, pix_automatico: 10 };
    const item = CampaignCore.deriveRecord(registro('1000'), descontos);
    expect(item.pixAuto).toBe(48);            // 47,62 → 48
    expect(item.pixAutoDiscount).toBe(43);    // 900 / 21 = 42,86 → 43
    const v = CampaignCore.variablesFor(item, descontos);
    expect(v.pix_automatico_21x).toBe(CampaignCore.formatCurrency(48));
    expect(v.pix_automatico_desconto_21x).toBe(CampaignCore.formatCurrency(43));
    expect(v.pct_pix_automatico).toBe(CampaignCore.formatPercent(10));
  });

  it('desconto do Pix Automático fora de 0–100% vira pendência grave', () => {
    const item = CampaignCore.deriveRecord(registro('1000'), { ...CampaignCore.DEFAULT_DISCOUNTS, pix_automatico: 150 });
    expect(item.blockingIssues.join(' ')).toMatch(/Pix Automático/);
  });

  it('a mensagem que usa o Pix Automático exige valores (trava no relatório 245)', () => {
    expect(mensagemUsaValores('Pix em 21x de {{pix_automatico_21x}}')).toBe(true);
    expect(mensagemUsaValores('Pix em 21x de {{ pix_automatico_desconto_21x }}')).toBe(true);
    expect(mensagemUsaValores('Olá {{primeiro_nome}}, {{pct_pix_automatico}} de desconto')).toBe(false);
  });

  it('as variáveis aparecem nos botões do editor, com 21x no nome', () => {
    const rotulos = new Map(VARIABLE_LABELS);
    expect(rotulos.get('pix_automatico_21x')).toMatch(/21x/);
    expect(rotulos.get('pix_automatico_desconto_21x')).toMatch(/21x/);
  });
});

describe('migration 20261009180000', () => {
  const MIGRATIONS = path.resolve(__dirname, '../../../supabase/migrations');
  const arquivo = fs.readdirSync(MIGRATIONS).find(f => f.endsWith('_campanha_historico_favoritas_pix.sql'));
  const LISO = fs.readFileSync(path.join(MIGRATIONS, arquivo as string), 'utf8')
    .replace(/--[^\n]*/g, ' ').replace(/\s+/g, ' ');

  it('o desconto do Pix Automático nasce com 5%', () => {
    expect(LISO).toContain('ADD COLUMN IF NOT EXISTS pix_automatico NUMERIC NOT NULL DEFAULT 5');
  });
  it('favoritas: cada um só lê, marca e desmarca as suas', () => {
    expect(LISO).toContain('PRIMARY KEY (perfil_id, empresa_id, template_id)');
    expect(LISO).toContain('GRANT SELECT, INSERT, DELETE ON public.campanha_facil_mensagens_favoritas TO authenticated');
    expect(LISO.match(/perfil_id = \(SELECT auth\.uid\(\)\)/g)).toHaveLength(3);
  });
  it('histórico do operador: abertas pelos envios, encerradas pelo placar, com o voto', () => {
    expect(LISO).toContain('JOIN public.campanha_facil_envios e ON e.operador_id = eu.uid');
    expect(LISO).toContain("l.placar @> jsonb_build_array(jsonb_build_object('operador_id', eu.uid))");
    expect(LISO).toContain('LEFT JOIN public.campanha_facil_avaliacoes av ON av.lote_id = l.id AND av.operador_id = eu.uid');
    expect(LISO).toContain('REVOKE ALL ON FUNCTION public.fn_campanha_facil_minhas_participacoes() FROM PUBLIC, anon');
  });
});

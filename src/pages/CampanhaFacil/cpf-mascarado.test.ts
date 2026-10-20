/**
 * O {{cpf}} da Campanha Fácil sai com só os 5 últimos dígitos (19/10/2026).
 *
 * O que se perde se isto quebrar: o CPF inteiro do cliente volta a ser gravado
 * no texto de cada mensagem da campanha (`campanha_facil_contatos`) e nas
 * variáveis que o banco usa para refazer o texto.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CampaignCore, type RawRecord } from './lib/campaign-core';
import { contatoDoItem } from './envios';

function item(cpf: string) {
  const values: Record<string, string> = {
    Nome: 'MARIA DA SILVA', CPF: cpf, Contrato: '999', 'Whats Titular': '18999999999',
  };
  const normalized = Object.fromEntries(Object.entries(values).map(([k, v]) => [CampaignCore.normalizeHeader(k), v]));
  const registro: RawRecord = { rowNumber: 2, values, normalized, sourceType: 'report-247', financialDataAvailable: true };
  return CampaignCore.deriveRecord(registro);
}

describe('CPF mascarado', () => {
  it('mostra só os 5 últimos dígitos, com x, com ou sem pontuação', () => {
    expect(CampaignCore.maskCpf('123.456.789-00')).toBe('xxx.xxx.789-00');
    expect(CampaignCore.maskCpf('12345678900')).toBe('xxx.xxx.789-00');
  });

  it('sem asterisco: no WhatsApp ele liga o negrito e quebra «*_CPF: {{cpf}}_*»', () => {
    expect(CampaignCore.maskCpf('123.456.789-00')).not.toContain('*');
  });

  it('documento de outro tamanho fica com os 5 últimos; vazio continua vazio', () => {
    expect(CampaignCore.maskCpf('12.345.678/0001-90')).toBe('xxx00190');
    expect(CampaignCore.maskCpf('')).toBe('');
    expect(CampaignCore.maskCpf(null)).toBe('');
  });

  it('o {{cpf}} da mensagem e o das variáveis gravadas no banco saem mascarados', () => {
    const i = item('123.456.789-00');
    expect(CampaignCore.variablesFor(i, CampaignCore.DEFAULT_DISCOUNTS).cpf).toBe('xxx.xxx.789-00');
    const texto = CampaignCore.renderTemplate('Olá {{nome}} - CPF: {{cpf}}', CampaignCore.variablesFor(i, CampaignCore.DEFAULT_DISCOUNTS));
    expect(texto).toContain('xxx.xxx.789-00');
    expect(texto).not.toMatch(/123\.?456/);
    const contato = contatoDoItem({ ...i, message: texto }, 1);
    expect(contato.variaveis?.cpf).toBe('xxx.xxx.789-00');
    expect(JSON.stringify(contato)).not.toMatch(/123\.?456\.?789/);
  });
});

describe('a máscara no banco (20261019200000) é a mesma da tela', () => {
  const sql = readFileSync(resolve(__dirname, '../../../supabase/migrations/20261019200000_campanha_cpf_mascarado_no_banco.sql'), 'utf8');

  it('o gatilho mascara mensagem, mensagem editada e variaveis, por último', () => {
    expect(sql).toContain('BEFORE INSERT OR UPDATE OF mensagem, mensagem_editada, variaveis');
    expect(sql).toContain('trg_cf_contatos_zz_mascarar_cpf');
  });

  it('o formato do banco é o de maskCpf: xxx.xxx.789-00', () => {
    expect(sql).toContain("'xxx.xxx.' || substr(v_dig, 7, 3) || '-' || substr(v_dig, 10, 2)");
    expect(sql).toContain("'Olá - *_CPF: xxx.xxx.789-00_*'");
    expect(CampaignCore.maskCpf('123.456.789-00')).toBe('xxx.xxx.789-00');
  });
});

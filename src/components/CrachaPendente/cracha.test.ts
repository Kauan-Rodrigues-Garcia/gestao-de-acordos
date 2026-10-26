import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { crachaCompleto, iniciais, limparCracha, pediuPreviaCrachaNaUrl } from './cracha';

describe('limparCracha', () => {
  it('fica só com os números, no máximo 8', () => {
    expect(limparCracha('12 34-56')).toBe('123456');
    expect(limparCracha('123456789')).toBe('12345678');
    expect(limparCracha('abc')).toBe('');
  });
});

describe('crachaCompleto', () => {
  it('aceita até 8 números, inclusive menos', () => {
    expect(crachaCompleto('01234567')).toBe(true);
    expect(crachaCompleto('12345')).toBe(true);
    expect(crachaCompleto('')).toBe(false);
    expect(crachaCompleto('123456789')).toBe(false);
    expect(crachaCompleto('12345a')).toBe(false);
  });
});

describe('iniciais e prévia', () => {
  it('primeira e última inicial', () => {
    expect(iniciais('Ana Paula Souza')).toBe('AS');
    expect(iniciais('Ana')).toBe('A');
    expect(iniciais('  ')).toBe('');
  });
  it('a prévia abre só com ?previa-cracha', () => {
    expect(pediuPreviaCrachaNaUrl('?previa-cracha')).toBe(true);
    expect(pediuPreviaCrachaNaUrl('?outra')).toBe(false);
  });
});

describe('migration 20261026160000', () => {
  const sql = readFileSync(resolve(__dirname, '../../../supabase/migrations/20261026160000_cracha_preenchido_pela_pessoa.sql'), 'utf8');

  it('grava na tabela que Premiações e Comissões lê', () => {
    expect(sql).toMatch(/INSERT INTO public\.rh_dados_operadores/);
  });
  it('só mexe no próprio crachá e não troca um que já existe', () => {
    expect(sql).not.toMatch(/p_operador_id/);
    expect(sql).toMatch(/Para trocar, fale com o RH/);
  });
  it('o banco aceita de 1 a 8 números, como a tela', () => {
    expect(sql).toMatch(/\^\[0-9\]\{1,8\}\$/);
  });
  it('repetido não diz de quem é', () => {
    expect(sql).not.toMatch(/já é de %/);
  });
});

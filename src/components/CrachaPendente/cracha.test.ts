import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  crachaCompleto, iniciais, limparCracha, pediuPreviaCrachaNaUrl, resumirCracha, type PessoaCracha,
} from './cracha';

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

describe('resumirCracha', () => {
  const p = (situacao: PessoaCracha['situacao'], setor: string | null): PessoaCracha => ({
    usuario_id: `${situacao}-${setor}-${Math.random()}`, nome: 'X', cargo: null, empresa_nome: null,
    setor_nome: setor, situacao, respondida_em: null,
  });

  it('conta por situação e põe primeiro o setor que mais falta', () => {
    const r = resumirCracha([
      p('respondeu', 'Playmix'), p('pendente', 'Playmix'),
      p('pendente', 'Receptivo'), p('pendente', 'Receptivo'), p('ja_tinha', null),
    ]);
    expect(r.porSituacao).toEqual({ respondeu: 1, ja_tinha: 1, pendente: 3 });
    expect(r.porSetor.map(s => s.setor)).toEqual(['Receptivo', 'Playmix', 'Sem setor']);
    expect(r.porSetor[1].porSituacao).toEqual({ respondeu: 1, ja_tinha: 0, pendente: 1 });
  });
});

describe('migration 20261026180000', () => {
  const sql = readFileSync(resolve(__dirname, '../../../supabase/migrations/20261026180000_cracha_pedido_liga_e_painel.sql'), 'utf8');

  it('nasce ligado, como o cartão já estava', () => {
    expect(sql).toMatch(/ligado\s+BOOLEAN\s+NOT NULL DEFAULT TRUE/);
  });
  it('só o super_admin liga e desliga', () => {
    expect(sql).toMatch(/fn_cracha_pedido_ligar[\s\S]*fn_user_is_super_admin\(\)/);
  });
  it('o painel não devolve o número do crachá', () => {
    const painel = sql.slice(sql.indexOf('FUNCTION public.fn_cracha_pedido_painel'));
    expect(painel).not.toMatch(/d\.cracha\s+AS/);
    expect(painel).not.toMatch(/'cracha'/);
  });
  it('salvar continua sem trocar crachá existente e registra a resposta', () => {
    expect(sql).toMatch(/Para trocar, fale com o RH/);
    expect(sql).toMatch(/INSERT INTO public\.cracha_pedido_respostas/);
  });
});

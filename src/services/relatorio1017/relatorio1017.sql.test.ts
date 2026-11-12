/**
 * A migration do 1017 (20261112150000), conferida no texto do SQL.
 *
 * Não há Postgres nos testes: o que se prova é que cada trava ESTÁ ESCRITA e
 * que nenhuma refatoração futura a tirou. As travas erradas não quebram nada —
 * devolvem um número plausível (o total da empresa inchado, o 1017 no desafio)
 * numa tela que ninguém confere.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const raiz = path.resolve(__dirname, '../../../supabase/migrations');
const SQL = fs.readFileSync(path.join(raiz, '20261112150000_relatorio_1017_manutencao.sql'), 'utf8');
const codigo = SQL.replace(/--.*$/gm, '');

/** O corpo de uma função da migration, do CREATE até o fim do dollar quote. */
function corpo(nome: string): string {
  const ini = codigo.search(new RegExp(`create (or replace )?function public\\.${nome}\\(`, 'i'));
  expect(ini).toBeGreaterThanOrEqual(0);
  const resto = codigo.slice(ini);
  const abre = resto.match(/\$(\w*)\$/);
  expect(abre).not.toBeNull();
  const tag = abre![0];
  const a = resto.indexOf(tag);
  return resto.slice(0, resto.indexOf(tag, a + tag.length) + tag.length);
}

describe('a importação (fn_relatorio_setor_importar)', () => {
  const f = corpo('fn_relatorio_setor_importar');

  it('só o líder do PRÓPRIO setor ou o super admin', () => {
    expect(f).toMatch(/fn_user_is_super_admin\(\)\s+or \(fn_user_perfil\(\) = 'lider' and fn_user_setor_id\(\) = p_setor_id\)/);
  });

  it('só setor com o relatório no cadastro, ativo', () => {
    expect(f).toMatch(/from setor_relatorios sr[\s\S]*sr\.ativo/);
  });

  it('respeita o mês fechado', () => {
    expect(f).toContain('fn_mes_fechado_barrar(p_mes');
  });

  it('deixa de fora o que o 59 vigente já conta para setor', () => {
    expect(f).toMatch(/l\.estado = 'vigente'/);
    expect(f).toContain('fn_mestre_conta_na_meta(r.colchao, r.dt_pgto)');
    expect(f).toMatch(/where not t\.no_59/);
  });

  it('troca o mês do setor inteiro, e só do setor e relatório', () => {
    expect(f).toMatch(/delete from relatorio_setor_linhas\s+where setor_id = p_setor_id and relatorio = p_relatorio and mes_referencia = v_mes/);
  });

  it('é SECURITY DEFINER — as tabelas não têm policy de escrita', () => {
    expect(f).toMatch(/security definer/i);
    expect(codigo).not.toMatch(/policy \w+ on public\.relatorio_setor_linhas\s+for (insert|update|delete|all)/i);
  });
});

describe('a leitura única (fn_ajustes_recebimento)', () => {
  const f = corpo('fn_ajustes_recebimento');

  it('devolve a origem de cada pedaço', () => {
    expect(f).toMatch(/valor_ho numeric, origem text\)/);
    expect(f).toContain("'ajuste'::text");
    expect(f).toContain("'relatorio_' || l.relatorio");
  });

  it('o relatório é sempre de SETOR, sem pessoa e sem equipe', () => {
    expect(f).toMatch(/SELECT l\.empresa_id, 'setor'::text, NULL::uuid, NULL::uuid, l\.setor_id/);
  });

  it('só com o cadastro ativo, e fora de quem pergunta por janela de chegada', () => {
    expect(f).toMatch(/sr\.ativo/);
    expect(f).toMatch(/AND p_de\s+IS NULL\s+AND p_ate IS NULL/);
  });
});

describe('fora do total da empresa e do desafio', () => {
  it('a view do Painel Diretoria só leva o ajuste', () => {
    const view = codigo.slice(codigo.indexOf('create view private.mestre_recebimentos_com_ajuste'));
    expect(view).toMatch(/and x\.origem = 'ajuste';/);
  });

  it('o desafio do dia soma só o ajuste no dinheiro sem pessoa', () => {
    expect(codigo).toMatch(/fn_desafio_diario\(uuid\)[\s\S]*AND x\.origem = ''ajuste''/);
  });
});

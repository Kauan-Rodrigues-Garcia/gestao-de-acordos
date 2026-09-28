/**
 * Migration 20260929030000: o H.O. da PaguePlay volta a vir do relatório, e o
 * percentual vira configuração da empresa.
 *
 * O teste que importa é o do trigger. Enquanto ele sobrescrevia `total_ho`,
 * nenhuma mudança no parser chegava ao banco — o número da coluna morria no
 * INSERT, em silêncio.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATIONS = path.resolve(__dirname, '../../../../supabase/migrations');
const arquivo = fs.readdirSync(MIGRATIONS).find(f => f.endsWith('_ho_do_relatorio_e_percentual_configuravel.sql'));
const BRUTO = fs.readFileSync(path.join(MIGRATIONS, arquivo as string), 'utf8');
const LISO = BRUTO.replace(/--[^\n]*/g, ' ').replace(/\s+/g, ' ');

function corpo(nome: string): string {
  const i = LISO.indexOf(`FUNCTION public.${nome}(`);
  expect(i, nome).toBeGreaterThan(-1);
  return LISO.slice(i, LISO.indexOf('$fn$;', i));
}

describe('fn_pp_ho_percentual', () => {
  const c = corpo('fn_pp_ho_percentual');
  it('lê empresas.config.ho_percentual da PaguePlay', () => {
    expect(c).toContain("e.config->>'ho_percentual'");
    expect(c).toContain("e.slug = 'pagueplay'");
  });
  it('padrão 0,2260', () => {
    expect(c).toContain('0.2260::numeric');
  });
  it('só aceita fração entre 0 e 1', () => {
    expect(c).toMatch(/::numeric > 0 AND .*::numeric < 1/);
  });
  it('deixou de ser IMMUTABLE — agora lê tabela', () => {
    expect(c).toContain('STABLE');
    expect(c).not.toContain('IMMUTABLE');
  });
  it('SECURITY DEFINER: o trigger roda como quem importa, e empresas tem RLS', () => {
    expect(c).toContain('SECURITY DEFINER');
    expect(c).toContain("SET search_path TO ''");
  });
});

describe('o trigger para de sobrescrever', () => {
  const c = corpo('fn_analitico_ho_calculado');

  it('BookPlay continua zerada', () => {
    expect(c).toMatch(/IF NOT COALESCE\(v_pagueplay, false\) THEN new\.total_ho := 0; RETURN new;/);
  });

  it('o H.O. do relatório fica como veio', () => {
    expect(c).toContain('new.total_ho := round(new.total_ho, 2)');
  });

  it('só calcula quando a linha chega SEM H.O.', () => {
    expect(c).toMatch(
      /ELSIF COALESCE\(new\.total_ho, 0\) = 0 AND COALESCE\(new\.valor_recebido, 0\) <> 0 THEN new\.total_ho := round\(new\.valor_recebido \* public\.fn_pp_ho_percentual\(\), 2\)/,
    );
  });

  it('update só de valor mantém a proporção que a linha já tinha', () => {
    expect(c).toContain("TG_OP = 'UPDATE'");
    expect(c).toContain('new.total_ho IS NOT DISTINCT FROM old.total_ho');
    expect(c).toContain('round(new.valor_recebido * old.total_ho / old.valor_recebido, 2)');
  });

  it('a conta antiga (sempre 24,96% do recebido) não existe mais', () => {
    expect(c).not.toMatch(/new\.total_ho := case when coalesce\(v_pagueplay, false\) then round\(coalesce\(new\.valor_recebido/i);
    expect(LISO).not.toContain('0.2496');
  });
});

describe('gravar o percentual pela aba Metas', () => {
  const c = corpo('fn_empresa_definir_ho_percentual');
  it('exige sessão, a empresa e metas_editar', () => {
    expect(c).toContain('auth.uid() IS NULL');
    expect(c).toContain('public.fn_can_access_empresa(p_empresa_id)');
    expect(c).toContain("public.fn_user_tem('metas_editar')");
  });
  it('recusa fora de (0, 1)', () => {
    expect(c).toContain('p_percentual <= 0 OR p_percentual >= 1');
  });
  it('mescla no config, sem apagar as outras chaves', () => {
    expect(c).toContain("COALESCE(config, '{}'::jsonb) || jsonb_build_object('ho_percentual', v_valor)");
  });
  it('anon fora', () => {
    expect(BRUTO).toMatch(/REVOKE ALL ON FUNCTION public\.fn_empresa_definir_ho_percentual[^;]*FROM PUBLIC, anon/);
  });
});

describe('dados', () => {
  it('a PaguePlay passa a 0,2260', () => {
    expect(LISO).toMatch(/UPDATE public\.empresas SET config = COALESCE\(config, '\{\}'::jsonb\) \|\| jsonb_build_object\('ho_percentual', 0\.2260\)/);
    expect(LISO).toContain("WHERE slug = 'pagueplay'");
  });

  it('NÃO regrava analitico_recebimentos — o mês se corrige na reimportação', () => {
    expect(LISO).not.toMatch(/update public\.analitico_recebimentos/i);
    expect(LISO).not.toMatch(/update public\.analitico_colchao_fora_meta/i);
  });

  it('confere o próprio resultado antes do commit', () => {
    expect(LISO).toContain("public.fn_pp_ho_percentual() <> 0.2260");
    expect(LISO).toContain("t.tgname = 'trg_analitico_recebimentos_ho'");
  });

  it('transação, lock_timeout', () => {
    expect(BRUTO).toMatch(/^begin;/m);
    expect(BRUTO).toMatch(/^commit;/m);
    expect(BRUTO).toContain('set local lock_timeout');
  });
});

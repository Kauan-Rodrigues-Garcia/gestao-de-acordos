/**
 * Migration 20260929211916: o recebimento conta só no setor onde a pessoa está.
 *
 * «Se eu faço parte do Play 1 e recebi 5 mil pro Play 1 e 4 mil pro Play 2, os
 * 4 mil vão lá pro Play 2. Pra mim consta que recebi só 5 mil.» (29/09/2026)
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATIONS = path.resolve(__dirname, '../../../../supabase/migrations');
const arquivo = fs.readdirSync(MIGRATIONS)
  .find(f => f.endsWith('_recebido_conta_so_no_setor_da_pessoa.sql'));
const BRUTO = fs.readFileSync(path.join(MIGRATIONS, arquivo as string), 'utf8');
const LISO = BRUTO.replace(/--[^\n]*/g, ' ').replace(/\s+/g, ' ');

/** O corpo de uma função, do CREATE até o `$function$;` que a fecha. */
function corpo(nome: string): string {
  const ini = LISO.indexOf(`CREATE OR REPLACE FUNCTION public.${nome}(`);
  expect(ini).toBeGreaterThan(-1);
  return LISO.slice(ini, LISO.indexOf('$function$;', ini));
}

describe('fn_analitico_resumo_por_operador', () => {
  const f = corpo('fn_analitico_resumo_por_operador');

  it('só na BookPlay, e de setembro/2026 em diante', () => {
    expect(f).toContain("v_por_setor := p_mes >= '2026-09'");
    expect(f).toContain("em.slug = 'bookplay'");
  });

  it('a linha conta se não tem setor, se a pessoa não tem setor, ou se o setor é dela', () => {
    expect(f).toContain('NOT v_por_setor OR li.setor IS NULL');
    expect(f).toContain('NOT EXISTS (SELECT 1 FROM casa c WHERE c.op = li.op)');
    expect(f).toContain('EXISTS (SELECT 1 FROM casa c WHERE c.op = li.op AND c.setor = li.setor)');
  });

  it('mantém o portão de permissão e o recorte de escopo', () => {
    expect(f).toContain("public.fn_user_tem('analitico_sub_ranking')");
    expect(f).toContain('(v_escopo >= 3 OR ar.operador_id = ANY(v_ops))');
  });

  it('não referencia coluna sem qualificar dentro do RETURN QUERY', () => {
    // As colunas de saída (operador_id, total_recebido…) viram variáveis no
    // plpgsql; um `operador_id` solto no corpo é «column reference is
    // ambiguous» — e o plpgsql só descobre em execução.
    const rq = f.slice(f.indexOf('RETURN QUERY'));
    expect(rq).not.toMatch(/[^.\w]operador_id\b(?! AS)/);
  });
});

describe('fn_analitico_setores_no_mes', () => {
  const f = corpo('fn_analitico_setores_no_mes');

  it('mês fechado pelo retrato, corrente ao vivo', () => {
    expect(f).toContain('public.composicao_mes cm');
    expect(f).toContain('public.composicao_mes_lider l');
    expect(f).toContain('public.fn_setores_do_operador(o.op)');
    expect(f).toContain("to_char((now() AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM')");
  });

  it('não é chamável de fora das RPCs', () => {
    expect(LISO).toContain(
      'REVOKE ALL ON FUNCTION public.fn_analitico_setores_no_mes(uuid, text, uuid[]) FROM PUBLIC, anon, authenticated',
    );
  });
});

describe('fn_analitico_recebido_fora_do_setor', () => {
  const f = corpo('fn_analitico_recebido_fora_do_setor');

  it('devolve só o que está fora dos setores da pessoa', () => {
    expect(f).toContain('NOT EXISTS (SELECT 1 FROM casa c WHERE c.op = li.op AND c.setor = li.setor)');
    expect(f).toContain('GROUP BY li.op, li.setor');
  });

  it('quem olha enxerga também quem deixou fantasma de setor no seu alcance', () => {
    expect(f).toContain("t.tipo = 'setor'");
    expect(f).toContain('t.fantasma_ativo');
  });
});

/**
 * Migration 20260930120000: o desafio mede a equipe como o Painel do Líder.
 *
 * Conferida também executando num Postgres 16 local com um cenário de
 * transferido de setor, clone, líder e PaguePlay (30/09/2026).
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATIONS = path.resolve(__dirname, '../../../supabase/migrations');
const arquivo = fs.readdirSync(MIGRATIONS).find(f => f.endsWith('_desafio_mede_equipe_como_o_painel.sql'));
const LISO = fs.readFileSync(path.join(MIGRATIONS, arquivo as string), 'utf8')
  .replace(/--[^\n]*/g, ' ').replace(/\s+/g, ' ');

describe('fn_desafio_contexto_equipe', () => {
  it('regra do setor da pessoa: BookPlay, set/2026+, mesma função do resumo do Painel', () => {
    expect(LISO).toContain("em.slug = 'bookplay' AND v_mes_txt >= '2026-09'");
    expect(LISO).toContain('public.fn_analitico_setores_no_mes(');
    expect(LISO).toContain('WHERE NOT l.fora');
  });

  it('fantasma de setor fica no lugar e a origem recebe só as linhas do setor de origem', () => {
    expect(LISO).toContain('CASE WHEN f.fica_no_lugar THEN NULL ELSE f.origem_equipe_id END');
    expect(LISO).toContain('AND l.fora AND l.setor_id = f.origem_setor_id');
  });

  it('devolve o H.O. e o percentual de quem mede em H.O.', () => {
    expect(LISO).toContain("'total_ho', x.total_ho");
    expect(LISO).toContain("'total_ho', y.total_ho");
    expect(LISO).toContain("'empresas_ho', v_empresas_ho");
    expect(LISO).toContain('public.fn_pp_ho_percentual()');
  });

  it('mantém os três portões e fecha o anon', () => {
    expect(LISO).toContain('public.fn_desafio_alcanca_empresa(v_empresas)');
    expect(LISO).toContain('public.fn_desafio_no_meu_alcance(');
    expect(LISO).toContain('REVOKE ALL ON FUNCTION public.fn_desafio_contexto_equipe(UUID) FROM PUBLIC, anon');
  });
});

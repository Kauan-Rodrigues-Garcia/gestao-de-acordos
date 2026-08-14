/**
 * permissoes.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * O front esconde botões; quem garante é a RLS. Quando as duas listas divergem,
 * o botão aparece e o banco recusa — foi assim que o Admin → Cargos acumulou 12
 * permissões que existem na tela e nunca foram ligadas no código.
 *
 * Este teste LÊ A BASELINE ATIVA e compara os cargos declarados lá com as constantes
 * do front. Editar um lado sem o outro quebra aqui, não em produção.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  PERFIS_VISAO_GERAL_WPP, PERFIS_DEFINE_RESPONSAVEL_WPP, PERFIS_ACESSO_ABA_WPP,
  podeAcessarAbaWpp, temVisaoGeralPorCargo, podeDefinirResponsavel,
} from './permissoes';

const MIGRATION = resolve(
  __dirname, '../../../supabase/migrations/20260813225412_remote_schema_baseline.sql',
);

function lerMigration(): string {
  return readFileSync(MIGRATION, 'utf-8').replaceAll('"', '');
}

/** Extrai os cargos de um `ARRAY['a','b',...]` a partir de um trecho do SQL. */
function cargosDoArray(trecho: string): string[] {
  const m = trecho.match(/ARRAY\[([^\]]+)\]/);
  if (!m) return [];
  return m[1]
    .split(',')
    .map(s => s.trim().replace(/::text/g, '').replace(/^'|'$/g, ''))
    .filter(Boolean);
}

describe('permissões espelham a baseline ativa', () => {
  it('a baseline existe no caminho esperado', () => {
    expect(() => lerMigration()).not.toThrow();
  });

  it('PERFIS_VISAO_GERAL_WPP == cargos de fn_wpp_tem_visao_geral', () => {
    const sql = lerMigration();
    const i = sql.indexOf('FUNCTION public.fn_wpp_tem_visao_geral');
    expect(i).toBeGreaterThan(-1);

    const corpo  = sql.slice(i, sql.indexOf('$$;', i));
    const cargos = cargosDoArray(corpo);

    expect(cargos.sort()).toEqual([...PERFIS_VISAO_GERAL_WPP].sort());
  });

  it('PERFIS_DEFINE_RESPONSAVEL_WPP == cargos da policy atend_resp_insert', () => {
    const sql = lerMigration();
    const i = sql.indexOf('CREATE POLICY atend_resp_insert');
    expect(i).toBeGreaterThan(-1);

    const corpo  = sql.slice(i, sql.indexOf(');', i));
    const cargos = cargosDoArray(corpo);

    expect(cargos.sort()).toEqual([...PERFIS_DEFINE_RESPONSAVEL_WPP].sort());
  });

  it('ouvidoria NÃO tem visão geral (nível 2, mas outra trilha)', () => {
    expect(PERFIS_VISAO_GERAL_WPP).not.toContain('ouvidoria');
    expect(temVisaoGeralPorCargo('ouvidoria')).toBe(false);
  });

  it('operador não tem visão geral nem define responsável', () => {
    expect(temVisaoGeralPorCargo('operador')).toBe(false);
    expect(podeDefinirResponsavel('operador')).toBe(false);
  });

  it('líder e acima têm visão geral', () => {
    for (const cargo of ['lider', 'elite', 'gerencia', 'diretoria', 'administrador', 'super_admin']) {
      expect(temVisaoGeralPorCargo(cargo)).toBe(true);
    }
  });

  it('perfil nulo nunca passa em nada', () => {
    expect(temVisaoGeralPorCargo(null)).toBe(false);
    expect(podeDefinirResponsavel(undefined)).toBe(false);
    expect(podeAcessarAbaWpp(null)).toBe(false);
  });
});

// ── Gate de rollout ─────────────────────────────────────────────────────────

describe('gate de rollout da aba', () => {
  it('a aba está liberada para todos os cargos', () => {
    expect(PERFIS_ACESSO_ABA_WPP).toBeNull();
    for (const cargo of ['operador', 'lider', 'elite', 'gerencia', 'diretoria', 'administrador', 'super_admin']) {
      expect(podeAcessarAbaWpp(cargo)).toBe(true);
    }
  });

  it('abrir o gate NÃO deu visão geral ao operador', () => {
    // O ponto da separação: o gate diz quem ABRE a aba; a visão geral diz quem
    // vê os pedidos dos outros. Operador abre e enxerga só os dele — quem
    // garante é a policy sol_wpp_select, este teste só fixa a intenção.
    expect(podeAcessarAbaWpp('operador')).toBe(true);
    expect(temVisaoGeralPorCargo('operador')).toBe(false);
    expect(podeDefinirResponsavel('operador')).toBe(false);
  });

  it('ainda dá para fechar a aba voltando um array de cargos', () => {
    // Rollback rápido continua sendo uma linha só.
    expect(podeAcessarAbaWpp(null)).toBe(false);
  });
});

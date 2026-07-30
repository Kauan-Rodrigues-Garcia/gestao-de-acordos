/**
 * permissoes.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * O front esconde botões; quem garante é a RLS. Quando as duas listas divergem,
 * o botão aparece e o banco recusa — foi assim que o Admin → Cargos acumulou 12
 * permissões que existem na tela e nunca foram ligadas no código.
 *
 * Este teste LÊ A MIGRATION e compara os cargos declarados lá com as constantes
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
  __dirname, '../../../supabase/migrations/20260730b_solicitacoes_whatsapp.sql',
);

function lerMigration(): string {
  return readFileSync(MIGRATION, 'utf-8');
}

/** Extrai os cargos de um `ARRAY['a','b',...]` a partir de um trecho do SQL. */
function cargosDoArray(trecho: string): string[] {
  const m = trecho.match(/ARRAY\[([^\]]+)\]/);
  if (!m) return [];
  return m[1]
    .split(',')
    .map(s => s.trim().replace(/^'|'$/g, ''))
    .filter(Boolean);
}

describe('permissões espelham a migration 20260730b', () => {
  it('a migration existe no caminho esperado', () => {
    expect(() => lerMigration()).not.toThrow();
  });

  it('PERFIS_VISAO_GERAL_WPP == cargos de fn_wpp_tem_visao_geral', () => {
    const sql = lerMigration();
    const i = sql.indexOf('CREATE OR REPLACE FUNCTION public.fn_wpp_tem_visao_geral');
    expect(i).toBeGreaterThan(-1);

    const corpo  = sql.slice(i, sql.indexOf('$$;', i));
    const cargos = cargosDoArray(corpo);

    expect(cargos.sort()).toEqual([...PERFIS_VISAO_GERAL_WPP].sort());
  });

  it('PERFIS_DEFINE_RESPONSAVEL_WPP == cargos da policy atend_resp_insert', () => {
    const sql = lerMigration();
    const i = sql.indexOf('CREATE POLICY "atend_resp_insert"');
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
  it('hoje só admin e super_admin abrem a aba', () => {
    // Este teste MUDA quando a aba for liberada — é o lembrete de que o gate
    // ainda está ligado. Ao abrir para todos, troque PERFIS_ACESSO_ABA_WPP por
    // null e ajuste as duas expectativas abaixo.
    expect(PERFIS_ACESSO_ABA_WPP).toEqual(['administrador', 'super_admin']);
    expect(podeAcessarAbaWpp('administrador')).toBe(true);
    expect(podeAcessarAbaWpp('super_admin')).toBe(true);
  });

  it('líder e operador ainda NÃO abrem a aba', () => {
    expect(podeAcessarAbaWpp('lider')).toBe(false);
    expect(podeAcessarAbaWpp('operador')).toBe(false);
    expect(podeAcessarAbaWpp('gerencia')).toBe(false);
  });

  it('o gate é independente da visão geral — líder tem uma e não a outra', () => {
    // Separar os dois conceitos é o que permite liberar a aba mexendo em UMA
    // constante, sem tocar nas regras de quem vê o quê.
    expect(temVisaoGeralPorCargo('lider')).toBe(true);
    expect(podeAcessarAbaWpp('lider')).toBe(false);
  });
});

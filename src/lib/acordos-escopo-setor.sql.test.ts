import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const SQL = fs.readFileSync(path.resolve(
  __dirname,
  '../../supabase/migrations/20260820210000_permissoes_por_aba.sql',
), 'utf8');

describe('migration de escopos independentes por aba', () => {
  it('é atômica e guarda snapshot antes de migrar', () => {
    expect(SQL.trimStart()).toMatch(/^--[\s\S]*?\bBEGIN\s*;/i);
    expect(SQL.trimEnd()).toMatch(/COMMIT\s*;$/i);
    expect(SQL).toMatch(/permissoes_backup_20260820_abas_cargos/i);
    expect(SQL).toMatch(/permissoes_backup_20260820_abas_pessoas/i);
  });

  it('não ultrapassa 100 argumentos em jsonb_build_object', () => {
    const inicio = SQL.indexOf('CREATE OR REPLACE FUNCTION public.fn_permissoes_abas_novas');
    const fim = SQL.indexOf('$function$;', inicio);
    const corpo = SQL.slice(inicio, fim);
    const blocos = corpo.split(') || jsonb_build_object(');

    expect(blocos).toHaveLength(2);
    for (const bloco of blocos) {
      const pares = bloco.match(/^\s*'[a-z0-9_]+',/gm) ?? [];
      expect(pares.length).toBeLessThanOrEqual(50);
    }
  });

  it('mapeia cada aba para chaves próprias', () => {
    for (const aba of ['dashboard', 'acordos', 'lixeira', 'pix_automatico', 'tickets']) {
      expect(SQL).toContain(`WHEN '${aba}'`);
    }
    expect(SQL).toMatch(/dashboard_escopo_todos_setores/);
    expect(SQL).toMatch(/acordos_escopo_todos_setores/);
    expect(SQL).toMatch(/pix_escopo_empresa/);
  });

  it('decide Acordos pelo tenant sem compartilhar o escopo', () => {
    expect(SQL).toMatch(/WHEN 'bookplay' THEN public\.fn_tem_permissao\('ver_acordos'/i);
    expect(SQL).toMatch(/fn_usuario_no_escopo_aba\('acordos'/i);
    expect(SQL).toMatch(/fn_usuario_no_escopo_aba\('dashboard'/i);
    expect(SQL).toMatch(/CREATE POLICY permissoes4_acordos_select_gate[\s\S]*?AS RESTRICTIVE/i);
  });

  it('não usa categorias globais no resolvedor novo', () => {
    const corpo = SQL.slice(
      SQL.indexOf('CREATE OR REPLACE FUNCTION public.fn_tem_escopo_aba'),
      SQL.indexOf('CREATE OR REPLACE FUNCTION public.fn_usuario_no_escopo_aba'),
    );
    expect(corpo).not.toMatch(/ver_acordos_gerais|ver_todos_setores|filtrar_por_/);
  });

  it('obriga as RPCs analíticas compartilhadas a declarar a aba chamadora', () => {
    expect(SQL).toMatch(/fn_contexto_dados_analiticos_permitido/);
    for (const rpc of [
      'fn_analitico_dashboard_mes_json',
      'fn_analitico_dashboard_mes',
      'fn_analitico_resumo_por_operador',
      'fn_diario_resumo_mensal',
    ]) {
      const inicio = SQL.lastIndexOf(`CREATE FUNCTION public.${rpc}`);
      expect(inicio).toBeGreaterThan(-1);
      const corpo = SQL.slice(inicio, SQL.indexOf('$function$;', inicio) + 11);
      expect(corpo).toMatch(/p_contexto TEXT DEFAULT 'analitico'/);
      expect(corpo).toMatch(/fn_contexto_dados_analiticos_permitido/);
      expect(corpo).not.toMatch(/ver_analiticos_global|ver_acordos_gerais|fn_user_has_any_role/);
    }
  });
});

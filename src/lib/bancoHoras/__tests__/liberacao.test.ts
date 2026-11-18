/**
 * A trava do Banco de Horas (18/11/2026): na main, mas fechada para todo mundo
 * menos o super_admin até haver autorização. Estes testes falham de propósito
 * no dia em que alguém virar a chave — aí a liberação é consciente.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { BANCO_HORAS_LIBERADO, CARGOS_DO_BANCO_HORAS, passaTravaBancoHoras } from '../liberacao';
import { abasDoMenu, type ContextoMenu } from '@/lib/menuLateral';
import { ROUTE_PATHS } from '@/lib/index';

const ctx = (cargo: string): ContextoMenu => ({
  cargo, produto: 'cobranca', isPaguePlay: false, isBookplay: true,
  temPermissao: () => true, acessoTickets: true,
});
const veNoMenu = (cargo: string) =>
  abasDoMenu(ctx(cargo)).some(i => i.to === ROUTE_PATHS.BANCO_HORAS);

describe('Banco de Horas travado até a autorização', () => {
  it('não está liberado', () => {
    expect(BANCO_HORAS_LIBERADO).toBe(false);
  });

  it('só o super_admin passa — nem o administrador por acesso total', () => {
    expect(passaTravaBancoHoras('super_admin')).toBe(true);
    for (const cargo of ['administrador', 'gerencia', 'diretoria', 'lider', 'operador', 'rh', null, undefined]) {
      expect(passaTravaBancoHoras(cargo)).toBe(false);
    }
  });

  it('o menu mostra só para o super_admin, mesmo com todas as chaves ligadas', () => {
    expect(veNoMenu('super_admin')).toBe(true);
    for (const cargo of ['administrador', 'gerencia', 'diretoria', 'lider', 'operador']) {
      expect(veNoMenu(cargo)).toBe(false);
    }
  });

  it('o banco tem a mesma trava nas duas funções e na política do vínculo', () => {
    const sql = fs.readFileSync(path.resolve(__dirname,
      '../../../../supabase/migrations/20261118190000_banco_de_horas_trava.sql'), 'utf8');
    const trava = (sql.match(/fn_user_is_super_admin\(\)/g) ?? []).length;
    expect(trava).toBeGreaterThanOrEqual(3);
    expect(sql).toContain('FUNCTION public.fn_banco_horas_alcanca(');
    expect(sql).toContain('FUNCTION public.fn_banco_horas_pode_gerenciar(');
    expect(sql).toContain('POLICY banco_horas_mapa_select');
  });

  it('liberado, só a liderança: líder, gerência, diretoria, administrador e super_admin', () => {
    expect([...CARGOS_DO_BANCO_HORAS].sort()).toEqual(['administrador', 'diretoria', 'gerencia', 'lider', 'super_admin']);
    for (const fora of ['operador', 'ouvidoria', 'elite', 'rh', 'assistente_adm']) {
      expect(CARGOS_DO_BANCO_HORAS).not.toContain(fora);
    }
  });

  it('o banco tem a mesma lista de cargos e um interruptor só, desligado', () => {
    const sql = fs.readFileSync(path.resolve(__dirname,
      '../../../../supabase/migrations/20261118200000_banco_de_horas_cargos.sql'), 'utf8');
    const lista = sql.match(/fn_user_perfil\(\), ''\) IN \(([^)]*)\)/)?.[1] ?? '';
    const noBanco = [...lista.matchAll(/'([a-z_]+)'/g)].map(m => m[1]).concat('super_admin').sort();
    expect(noBanco).toEqual([...CARGOS_DO_BANCO_HORAS].sort());
    expect(sql).toMatch(/FUNCTION public\.fn_banco_horas_liberado\(\)\s+RETURNS BOOLEAN/);
    expect(sql).toMatch(/AS \$function\$ SELECT FALSE \$function\$;/);
    // As três portas passam pela regra do cargo.
    expect((sql.match(/SELECT public\.fn_banco_horas_cargo_passa\(\)/g) ?? []).length).toBe(3);
  });
});

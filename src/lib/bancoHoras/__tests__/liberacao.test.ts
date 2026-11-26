/**
 * A trava do Banco de Horas (18/11/2026), liberada para a liderança em
 * 19/11/2026. Operador e os demais cargos continuam fora, mesmo com a chave
 * ligada no painel.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { BANCO_HORAS_LIBERADO, CARGOS_DO_BANCO_HORAS, passaTravaBancoHoras } from '../liberacao';
import { abasDoMenu, type ContextoMenu } from '@/lib/menuLateral';
import { ROUTE_PATHS } from '@/lib/index';

const ctx = (cargo: string, temPermissao: (k: string) => boolean = () => true): ContextoMenu => ({
  cargo, produto: 'cobranca', isPaguePlay: false, isBookplay: true,
  temPermissao, acessoTickets: true,
});
const veNoMenu = (cargo: string, temPermissao?: (k: string) => boolean) =>
  abasDoMenu(ctx(cargo, temPermissao)).some(i => i.to === ROUTE_PATHS.BANCO_HORAS);

const migration = (nome: string) => fs.readFileSync(path.resolve(__dirname,
  `../../../../supabase/migrations/${nome}`), 'utf8');

describe('Banco de Horas liberado para a liderança', () => {
  it('está liberado', () => {
    expect(BANCO_HORAS_LIBERADO).toBe(true);
  });

  it('a liderança passa; operador e os demais cargos não', () => {
    for (const cargo of ['super_admin', 'administrador', 'gerencia', 'diretoria', 'lider']) {
      expect(passaTravaBancoHoras(cargo)).toBe(true);
    }
    for (const cargo of ['operador', 'ouvidoria', 'elite', 'rh', 'assistente_adm', null, undefined]) {
      expect(passaTravaBancoHoras(cargo)).toBe(false);
    }
  });

  it('o menu mostra para a liderança com a chave, e nunca para operador', () => {
    for (const cargo of ['super_admin', 'administrador', 'gerencia', 'diretoria', 'lider']) {
      expect(veNoMenu(cargo)).toBe(true);
    }
    for (const cargo of ['operador', 'rh', 'assistente_adm']) {
      expect(veNoMenu(cargo)).toBe(false);
    }
  });

  it('líder sem ver_banco_horas não vê no menu', () => {
    expect(veNoMenu('lider', k => k !== 'ver_banco_horas')).toBe(false);
  });

  it('liberado, só a liderança: líder, gerência, diretoria, administrador e super_admin', () => {
    expect([...CARGOS_DO_BANCO_HORAS].sort()).toEqual(['administrador', 'diretoria', 'gerencia', 'lider', 'super_admin']);
    for (const fora of ['operador', 'ouvidoria', 'elite', 'rh', 'assistente_adm']) {
      expect(CARGOS_DO_BANCO_HORAS).not.toContain(fora);
    }
  });

  it('o banco tem a mesma lista de cargos nas três portas', () => {
    const sql = migration('20261118200000_banco_de_horas_cargos.sql');
    const lista = sql.match(/fn_user_perfil\(\), ''\) IN \(([^)]*)\)/)?.[1] ?? '';
    const noBanco = [...lista.matchAll(/'([a-z_]+)'/g)].map(m => m[1]).concat('super_admin').sort();
    expect(noBanco).toEqual([...CARGOS_DO_BANCO_HORAS].sort());
    expect((sql.match(/SELECT public\.fn_banco_horas_cargo_passa\(\)/g) ?? []).length).toBe(3);
  });

  it('a liberação vira o interruptor do banco e liga só as chaves do líder', () => {
    const sql = migration('20261119140000_banco_de_horas_liberar_lideres.sql');
    expect(sql).toMatch(/FUNCTION public\.fn_banco_horas_liberado\(\)[\s\S]*?AS \$function\$ SELECT TRUE \$function\$;/);
    expect(sql).toContain("jsonb_build_object('ver_banco_horas', true, 'banco_horas_escopo_setor', true)");
    expect(sql).toContain("cp.cargo = 'lider'");
    // Todos os setores e gerenciar ficam como estão.
    expect(sql).not.toMatch(/'banco_horas_escopo_todos_setores',\s*true/);
    expect(sql).not.toMatch(/'banco_horas_gerenciar',\s*true/);
  });
});

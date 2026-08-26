import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATION = path.resolve(
  __dirname,
  '../../supabase/migrations/20260826131948_chat_cargos_e_disparos_com_anexos.sql',
);
const SQL = fs.readFileSync(MIGRATION, 'utf8');

function corpo(nome: string): string {
  const inicio = SQL.indexOf(`CREATE OR REPLACE FUNCTION public.${nome}`);
  const fim = SQL.indexOf(`REVOKE ALL ON FUNCTION public.${nome}`, inicio);
  if (inicio < 0 || fim < 0) throw new Error(`Função ${nome} não encontrada na migration.`);
  return SQL.slice(inicio, fim);
}

describe('migration do alcance do chat por cargo', () => {
  it('confere o cargo no mesmo cadeado de empresa e escopo', () => {
    const alcance = corpo('fn_chat_alcanca');
    expect(alcance).toContain("public.fn_user_tem('chat_cargo_' || b.perfil)");
    expect(alcance).toContain('public.fn_can_access_empresa(b.empresa_id)');
    expect(alcance).toContain("public.fn_user_tem('chat_escopo_setor')");
    expect(alcance).toContain("SET search_path TO ''");
  });

  it('não deixa uma conversa existente furar o cargo num disparo', () => {
    const disparo = corpo('fn_chat_disparar');
    const trava = disparo.indexOf('IF NOT public.fn_chat_alcanca(v_alvo)');
    const escrita = disparo.indexOf('INSERT INTO public.chat_mensagens');
    expect(trava).toBeGreaterThan(0);
    expect(escrita).toBeGreaterThan(trava);
    expect(disparo).not.toContain('v_conversa IS NULL AND NOT public.fn_chat_alcanca');
  });

  it('semeia as chaves sem sobrescrever uma escolha já gravada', () => {
    expect(SQL).toContain('WHERE NOT cp.permissoes ? c.chave');
    expect(SQL).toContain("'chat_cargo_super_admin'");
  });
});

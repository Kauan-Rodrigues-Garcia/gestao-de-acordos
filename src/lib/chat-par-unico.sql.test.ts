/**
 * 20261028140000: um par de pessoas tem UMA conversa direta, em qualquer
 * empresa, e a conversa que tem super admin não aparece no Monitor.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SQL = fs.readFileSync(
  path.resolve(__dirname, '../../supabase/migrations/20261028140000_chat_par_unico_e_super_admin_privado.sql'),
  'utf8',
);

function corpo(nome: string): string {
  const inicio = SQL.indexOf(`CREATE OR REPLACE FUNCTION public.${nome}(`);
  const fim = SQL.indexOf(`REVOKE ALL`, inicio);
  if (inicio < 0 || fim < 0) throw new Error(`Função ${nome} não encontrada.`);
  return SQL.slice(inicio, fim);
}

describe('uma conversa por par', () => {
  it('o índice único não tem mais a empresa', () => {
    expect(SQL).toMatch(/CREATE UNIQUE INDEX ux_chat_conversa_par\s+ON public\.chat_conversas \(par_menor, par_maior\)\s+WHERE tipo = 'direta'/);
  });

  it('abrir e disparar acham o par sem filtrar a empresa', () => {
    for (const nome of ['fn_chat_abrir', 'fn_chat_disparar']) {
      const f = corpo(nome);
      expect(f).toContain("ON CONFLICT (par_menor, par_maior) WHERE tipo = 'direta' DO NOTHING");
      expect(f).not.toContain('c.empresa_id = v_empresa');
      expect(f).not.toContain('ON CONFLICT (empresa_id');
    }
  });

  it('junta as repetidas ANTES de criar o índice, na conversa mais antiga', () => {
    const junta = SQL.indexOf('DO $junta$');
    expect(junta).toBeGreaterThan(0);
    expect(junta).toBeLessThan(SQL.indexOf('CREATE UNIQUE INDEX ux_chat_conversa_par'));
    expect(SQL).toContain('array_agg(c.id ORDER BY c.criado_em, c.id)');
    expect(SQL).toContain('DELETE FROM public.chat_conversas WHERE id = v_sai');
  });

  it('o anexo da mensagem que mudou de conversa continua legível pela mensagem', () => {
    const f = corpo('fn_chat_posso_ler_anexo');
    expect(f).toContain('RETURN TRUE;');
    expect(f).toContain("m.anexos @> jsonb_build_array(jsonb_build_object('url', p_caminho))");
  });
});

describe('conversa de super admin é privada', () => {
  it.each(['fn_chat_monitoro_conversa', 'fn_chat_monitor_conversas', 'fn_chat_monitor_recentes'])(
    '%s pula a conversa que tem super admin', (nome) => {
      const f = corpo(nome);
      expect(f).toMatch(/NOT EXISTS \([\s\S]*?perfil = 'super_admin'/);
    },
  );

  it('o monitor continua cortando primeiro pela permissão, que é barata', () => {
    const f = corpo('fn_chat_monitoro_conversa');
    expect(f.indexOf("fn_user_tem('chat_monitor')")).toBeLessThan(f.indexOf("'super_admin'"));
  });

  it('nenhuma policy é recriada', () => {
    expect(SQL).not.toMatch(/CREATE POLICY|DROP POLICY/);
  });
});

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATION = path.resolve(
  __dirname,
  '../../supabase/migrations/20260826180803_chat_lideres_e_status_entrega.sql',
);
const SQL = fs.readFileSync(MIGRATION, 'utf8');

function corpo(nome: string): string {
  const marcadores = [
    `CREATE OR REPLACE FUNCTION public.${nome}`,
    `CREATE FUNCTION public.${nome}`,
  ];
  const inicio = Math.max(...marcadores.map(m => SQL.indexOf(m)));
  const fim = SQL.indexOf(`REVOKE ALL ON FUNCTION public.${nome}`, inicio);
  if (inicio < 0 || fim < 0) throw new Error(`Função ${nome} não encontrada.`);
  return SQL.slice(inicio, fim);
}

describe('migration de líderes e entrega do chat', () => {
  it('une equipes operacionais e vínculos do seletor de líder', () => {
    const equipes = corpo('fn_chat_equipes_do_perfil');
    expect(equipes).toContain('public.fn_equipes_do_operador(p_perfil)');
    expect(equipes).toContain('public.equipe_lideres');
    expect(equipes).toContain('el.lider_id = p_perfil');

    expect(corpo('fn_chat_alcanca')).toContain('public.fn_chat_equipes_do_perfil');
    expect(corpo('fn_chat_contatos')).toContain('public.fn_chat_equipes_do_perfil');
  });

  it('persiste entrega separada da leitura e expõe os dois participantes', () => {
    expect(SQL).toContain('ADD COLUMN IF NOT EXISTS ultima_entrega_em');
    const lista = corpo('fn_chat_minhas_conversas');
    expect(lista).toContain('mi.ultima_entrega_em');
    expect(lista).toContain('po.ultima_entrega_em');
    expect(lista).toContain("SET search_path TO ''");
  });
});

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATION = path.resolve(
  __dirname,
  '../../supabase/migrations/20260828122407_chat_historico_por_atividade.sql',
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

describe('migration do histórico do chat', () => {
  it('usa atividade por participante e a virada do dia de São Paulo', () => {
    expect(SQL).toContain('ADD COLUMN IF NOT EXISTS ultima_atividade_em');
    const lista = corpo('fn_chat_minhas_conversas');
    expect(lista).toContain("now() AT TIME ZONE 'America/Sao_Paulo'");
    expect(lista).toContain('mi.ultima_atividade_em < limite.inicio_de_hoje');
    expect(lista).toContain('ORDER BY mi.ultima_atividade_em DESC');
  });

  it('mensagem manual reativa os dois lados', () => {
    const gatilho = corpo('fn_chat_apos_mensagem');
    const inicioManual = gatilho.indexOf('IF NEW.disparo_id IS NULL THEN');
    const inicioDisparo = gatilho.indexOf('ELSE', inicioManual);
    const blocoManual = gatilho.slice(inicioManual, inicioDisparo);

    expect(blocoManual).toContain('oculta_em           = NULL');
    expect(blocoManual).toContain('ultima_atividade_em = NEW.criado_em');
    expect(blocoManual).not.toContain('perfil_id IS DISTINCT FROM NEW.autor_id');
  });

  it('disparo não reativa a lista de quem enviou', () => {
    const gatilho = corpo('fn_chat_apos_mensagem');
    const inicioDisparo = gatilho.indexOf('ELSE', gatilho.indexOf('IF NEW.disparo_id IS NULL THEN'));
    const blocoDisparo = gatilho.slice(inicioDisparo, gatilho.indexOf('END IF;', inicioDisparo));

    expect(blocoDisparo).toContain('perfil_id IS DISTINCT FROM NEW.autor_id');
    expect(blocoDisparo).toContain('ultima_atividade_em = NEW.criado_em');
  });

  it('protege as RPCs privilegiadas contra execução pública', () => {
    expect(SQL).toContain(
      'REVOKE ALL ON FUNCTION public.fn_chat_apos_mensagem() FROM PUBLIC, anon, authenticated;',
    );
    expect(SQL).toContain(
      'REVOKE ALL ON FUNCTION public.fn_chat_minhas_conversas() FROM PUBLIC, anon;',
    );
    expect(SQL).toContain(
      'GRANT EXECUTE ON FUNCTION public.fn_chat_minhas_conversas() TO authenticated;',
    );
  });
});

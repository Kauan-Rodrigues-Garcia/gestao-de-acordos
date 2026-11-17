/**
 * Nome do cliente sem o código do ERP na frente — migration 20261117150000.
 *
 * O 59 grava «1994034 - NOME»; o 58 já cortava (`extrairNome`). O
 * reaproveitamento do nome tem de cortar também, venha de onde vier.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { extrairNome } from '@/services/analitico/analiticoComum';

const RAIZ = path.resolve(__dirname, '../../..');
const MIGRATIONS = path.join(RAIZ, 'supabase/migrations');
const arquivo = fs.readdirSync(MIGRATIONS).find(f => f.endsWith('_cliente_conhecido_sem_codigo.sql'));
const SQL = fs.readFileSync(path.join(MIGRATIONS, arquivo as string), 'utf8')
  .replace(/--[^\n]*/g, ' ')
  .replace(/\s+/g, ' ');

function corpoDe(nome: string): string {
  const i = SQL.indexOf(`FUNCTION public.${nome}(`);
  expect(i, `função ${nome} não está na migration`).toBeGreaterThan(-1);
  return SQL.slice(i, SQL.indexOf('$function$;', i));
}

/** A regex do SQL, rodada aqui para conferir os mesmos casos do front. */
const REGEX_SQL = /^\s*\d+\s*[-–]\s*/;
const semCodigo = (s: string) => s.replace(REGEX_SQL, '').trim() || null;

describe('fn_nome_sem_codigo', () => {
  it('usa a regex conferida aqui', () => {
    expect(corpoDe('fn_nome_sem_codigo')).toContain("'^\\s*\\d+\\s*[-–]\\s*'");
  });

  it.each([
    ['1994034 - MARIA DA SILVA', 'MARIA DA SILVA'],
    ['1994034-MARIA DA SILVA', 'MARIA DA SILVA'],
    ['  52 – JOÃO  ', 'JOÃO'],
    ['MARIA DA SILVA', 'MARIA DA SILVA'],
    ['ANA - 2ª VIA', 'ANA - 2ª VIA'],
  ])('%s → %s', (entrada, saida) => {
    expect(semCodigo(entrada)).toBe(saida);
  });

  it('nome que é só o código não vira nome', () => {
    expect(semCodigo('1994034 - ')).toBeNull();
  });

  it('dá o mesmo que o extrairNome do 58 no formato do relatório', () => {
    expect(semCodigo('1994034 - MARIA DA SILVA')).toBe(extrairNome('1994034 - MARIA DA SILVA'));
  });
});

describe('fn_cliente_conhecido', () => {
  const corpo = corpoDe('fn_cliente_conhecido');

  it('todo nome aproveitado passa pela limpeza — acordo anterior e relatório', () => {
    expect(corpo.split('SELECT public.fn_nome_sem_codigo(').length - 1).toBe(3);
    expect(corpo).not.toContain('SELECT btrim(a.nome_cliente)');
    expect(corpo).not.toContain('SELECT btrim(r.nome_cliente)');
  });

  it('continua interna', () => {
    expect(SQL).toContain(
      'REVOKE ALL ON FUNCTION public.fn_cliente_conhecido(uuid, text, text) FROM PUBLIC, anon, authenticated',
    );
  });
});

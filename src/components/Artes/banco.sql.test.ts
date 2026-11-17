// @vitest-environment node
/**
 * banco.sql.test.ts — a migration das artes (20261117180000) num Postgres de
 * verdade (PGlite, LOCAL — não é o banco de produção).
 *
 * Prova: só o super_admin lança, lista e encerra; a arte aparece só para quem
 * é (todo mundo ou o setor), só dentro do período e até encerrar; «vi» conta
 * uma vez e só para quem a arte é; a migration roda duas vezes.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const ADMIN = '00000000-0000-4000-8000-0000000000a1';
const O1 = '00000000-0000-4000-8000-0000000000c1';
const O2 = '00000000-0000-4000-8000-0000000000c2';
const INATIVO = '00000000-0000-4000-8000-0000000000f2';
const PLAY1 = '00000000-0000-4000-8000-0000000000e1';
const PLAY2 = '00000000-0000-4000-8000-0000000000e2';

const SQL = readFileSync(resolve(__dirname, '../../../supabase/migrations/20261117180000_artes_para_todos.sql'), 'utf8');
const CONTEUDO = { chamada: 'Deu a louca na gerente!', valor: 'R$ 503.997,49', meta: 'R$ 1.500.000,00' };

let db: PGlite;

async function como<T>(uid: string, sql: string, params: unknown[] = []): Promise<T> {
  await db.query("select set_config('teste.uid', $1, false)", [uid]);
  await db.query("select set_config('teste.super', $1, false)", [uid === ADMIN ? 'sim' : '']);
  const r = await db.query<{ v: T }>(sql, params);
  return r.rows[0]?.v as T;
}
const lancar = (o: { uid?: string; setores?: string[] | null; inicio?: string | null; fim?: string | null; modelo?: string } = {}) =>
  como<string>(o.uid ?? ADMIN, 'select public.fn_artes_lancar($1, $2, $3::jsonb, $4, $5, $6, $7) v',
    ['Deu a louca', o.modelo ?? 'deu-a-louca', JSON.stringify(CONTEUDO), 'amarelo', o.setores ?? null, o.inicio ?? null, o.fim ?? null]);
type Minha = { id: string; vi: boolean; conteudo: Record<string, string> };
const minhas = (uid: string) => como<Minha[]>(uid, 'select public.fn_artes_minhas() v');
type NaLista = { id: string; publico: number; viram: number; setores_nomes: string[]; encerrada_em: string | null };
const listar = (uid = ADMIN) => como<NaLista[]>(uid, 'select public.fn_artes_listar() v');
const vi = (uid: string, id: string) => como(uid, 'select public.fn_artes_vi($1) v', [id]);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('teste.uid', true), '')::uuid $$;
    create table public.setores (id uuid primary key, nome text);
    insert into public.setores values ('${PLAY1}', 'Play 1'), ('${PLAY2}', 'Play 2');
    create table public.perfis (id uuid primary key, nome text, setor_id uuid, perfil text, ativo boolean);
    insert into public.perfis values
      ('${ADMIN}', 'Admin', null, 'super_admin', true),
      ('${O1}', 'Ana', '${PLAY1}', 'operador', true), ('${O2}', 'Bruno', '${PLAY2}', 'operador', true),
      ('${INATIVO}', 'Saiu', '${PLAY1}', 'operador', false);
    create function public.fn_user_is_super_admin() returns boolean language sql stable
      as $$ select current_setting('teste.super', true) = 'sim' $$;
  `);
  await db.exec(SQL);
  await db.exec(SQL); // reexecutável
});
afterAll(async () => { await db.close(); });
beforeEach(async () => { await db.exec('delete from public.artes_lancadas'); });

describe('artes para todos (migration 20261117180000)', () => {
  it('só o super_admin lança, lista e encerra', async () => {
    await expect(lancar({ uid: O1 })).rejects.toThrow(/NAO_AUTORIZADO/);
    await expect(listar(O1)).rejects.toThrow(/NAO_AUTORIZADO/);
    const id = await lancar();
    await expect(como(O1, 'select public.fn_artes_encerrar($1) v', [id])).rejects.toThrow(/NAO_AUTORIZADO/);
  });

  it('para todo mundo: todos os ativos veem; o público conta só os ativos', async () => {
    const id = await lancar();
    expect((await minhas(O1)).map(a => a.id)).toEqual([id]);
    expect((await minhas(O2)).map(a => a.id)).toEqual([id]);
    expect(await minhas(INATIVO)).toEqual([]);
    expect((await minhas(O1))[0].conteudo.valor).toBe('R$ 503.997,49');
    expect((await listar())[0].publico).toBe(3);
  });

  it('por setor: só quem é do setor vê', async () => {
    const id = await lancar({ setores: [PLAY1] });
    expect((await minhas(O1)).map(a => a.id)).toEqual([id]);
    expect(await minhas(O2)).toEqual([]);
    const [l] = await listar();
    expect(l.publico).toBe(1);
    expect(l.setores_nomes).toEqual(['Play 1']);
    await expect(lancar({ setores: ['00000000-0000-4000-8000-000000000999'] })).rejects.toThrow(/pelo menos um setor/);
  });

  it('só dentro do período e até encerrar', async () => {
    const futura = await lancar({ inicio: new Date(Date.now() + 3_600_000).toISOString() });
    const passada = await lancar({ inicio: new Date(Date.now() - 7_200_000).toISOString(), fim: new Date(Date.now() - 3_600_000).toISOString() });
    const no_ar = await lancar();
    expect((await minhas(O1)).map(a => a.id)).toEqual([no_ar]);
    expect(futura && passada).toBeTruthy();
    await como(ADMIN, 'select public.fn_artes_encerrar($1) v', [no_ar]);
    expect(await minhas(O1)).toEqual([]);
    await expect(como(ADMIN, 'select public.fn_artes_encerrar($1) v', [no_ar])).rejects.toThrow(/já encerrada/);
    await expect(lancar({ inicio: '2026-11-17T12:00:00Z', fim: '2026-11-17T11:00:00Z' })).rejects.toThrow(/depois do início/);
  });

  it('«vi» conta uma vez e só para quem a arte é', async () => {
    const id = await lancar({ setores: [PLAY1] });
    await vi(O1, id);
    await vi(O1, id);
    await vi(O2, id); // não é do Play 1: não conta
    expect((await minhas(O1))[0].vi).toBe(true);
    expect((await listar())[0].viram).toBe(1);
  });

  it('modelo desconhecido é recusado', async () => {
    await expect(lancar({ modelo: 'outro' })).rejects.toThrow();
  });

  it('ninguém lê as tabelas direto', async () => {
    const r = await db.query<{ ok: boolean }>("select has_table_privilege('authenticated', 'public.artes_lancadas', 'select') ok");
    expect(r.rows[0].ok).toBe(false);
  });
});

// @vitest-environment node
/**
 * lobby.sql.test.ts — a migration 20261016120000 (o lobby da chefona e os
 * cliques automáticos que não contam) rodando num Postgres de verdade
 * (PGlite, local — não é o banco), por cima da 20261015230000.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const EMPRESA = '00000000-0000-4000-8000-000000000001';
const ADMIN   = '00000000-0000-4000-8000-0000000000a1';
const ANA     = '00000000-0000-4000-8000-0000000000c1';
const BRUNO   = '00000000-0000-4000-8000-0000000000c2';
const SETOR   = '00000000-0000-4000-8000-0000000000e1';

const migration = (nome: string) => readFileSync(resolve(__dirname, '../../../../../../supabase/migrations', nome), 'utf8');
const SQL_REI = migration('20261009120000_chefao_rei_do_pop.sql');
const SQL_CHEFONA = migration('20261015230000_chefona_bruxa_do_pantano.sql');
const SQL = migration('20261016120000_chefona_lobby_e_autoclick.sql');

let db: PGlite;

interface Estado {
  id: number; vida: number; vida_max: number; versao: number;
  lobby_total: number; lobby: { usuario: string; nome: string; setor: string | null }[];
  ranking: { usuario: string; dano: number; acertos: number }[];
  eu_no_lobby?: boolean; fora_do_lobby?: boolean; descartados?: number; freio?: boolean;
  eu?: { dano: number } | null;
}

async function como<T>(uid: string, sql: string, params: unknown[] = []): Promise<T> {
  await db.query("select set_config('teste.uid', $1, false)", [uid]);
  await db.query("select set_config('teste.super', $1, false)", [uid === ADMIN ? 'sim' : '']);
  const r = await db.query<{ v: T }>(sql, params);
  return r.rows[0]?.v as T;
}

const soltar = (vida = 500, esperaS = 0) =>
  como<number>(ADMIN, 'select public.fn_chefona_soltar($1, 2, $2, 0) v', [vida, esperaS]);
const entrar = (uid: string, id: number) => como<Estado>(uid, 'select public.fn_chefona_lobby_entrar($1) v', [id]);
const sair = (uid: string, id: number) => como<Estado>(uid, 'select public.fn_chefona_lobby_sair($1) v', [id]);
const atirar = (uid: string, id: number, a: number, d: number, suspeita = 0) =>
  como<Estado>(uid, 'select public.fn_chefona_acertar($1, $2, 0, $3, $2, $4) v', [id, a, d, suspeita]);
const esperarFreio = (uid: string) =>
  db.exec(`update public.chefona_golpes set ultimo_em = ultimo_em - interval '1 second' where usuario = '${uid}'`);
const avisosDoLobby = async () =>
  (await db.query<{ n: number }>("select count(*)::int n from realtime.enviados where event = 'chefona'")).rows[0].n;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('teste.uid', true), '')::uuid $$;
    create schema realtime;
    create table realtime.messages (topic text, payload jsonb, event text, private boolean);
    alter table realtime.messages enable row level security;
    create policy abobora_receber on realtime.messages for select to authenticated using (true);
    create table realtime.enviados (n serial, topic text, event text, payload jsonb);
    create function realtime.send(payload jsonb, event text, topic text, private boolean default true)
      returns void language sql
      as $$ insert into realtime.enviados (topic, event, payload) values (topic, event, payload) $$;
    create table public.empresas (id uuid primary key);
    insert into public.empresas values ('${EMPRESA}');
    create table public.setores (id uuid primary key, nome text);
    insert into public.setores values ('${SETOR}', 'Play 3');
    create table public.perfis (id uuid primary key, nome text, foto_url text, setor_id uuid);
    insert into public.perfis values
      ('${ANA}', 'Ana Paula', null, '${SETOR}'), ('${BRUNO}', 'Bruno Lima', null, null), ('${ADMIN}', 'Cleber', null, null);
    create function public.fn_user_is_super_admin() returns boolean language sql stable
      as $$ select current_setting('teste.super', true) = 'sim' $$;
  `);
  await db.exec(SQL_REI);
  await db.exec(SQL_CHEFONA);
  await db.exec(SQL);
  // Reexecutável.
  await db.exec(SQL);
});

beforeEach(async () => {
  await db.exec('delete from public.chefona_rodadas; delete from public.chefao_rodadas; truncate realtime.enviados;');
});

afterAll(async () => { await db.close(); });

describe('20261016120000 — o lobby', () => {
  it('entrar põe a pessoa no lobby com nome e setor, e diz a ela que entrou', async () => {
    const id = await soltar(500, 180);
    const r = await entrar(ANA, id);
    expect(r.eu_no_lobby).toBe(true);
    expect(r.lobby_total).toBe(1);
    expect(r.lobby).toEqual([{ usuario: ANA, nome: 'Ana Paula', setor: 'Play 3' }]);
  });

  it('entrar de novo não duplica nem avisa de novo', async () => {
    const id = await soltar(500, 180);
    await entrar(ANA, id);
    const antes = await avisosDoLobby();
    const r = await entrar(ANA, id);
    expect(r.lobby_total).toBe(1);
    expect(await avisosDoLobby()).toBe(antes);
  });

  it('o aviso a todos sai no máximo a cada 1,5 s, mas a versão sobe a cada entrada', async () => {
    const id = await soltar(500, 180);
    const v0 = (await como<Estado>(ANA, 'select public.fn_chefona_atual() v')).versao;
    const antes = await avisosDoLobby();
    await entrar(ANA, id);
    const r = await entrar(BRUNO, id);
    expect(await avisosDoLobby()).toBe(antes + 1);
    expect(r.versao).toBe(v0 + 2);
    expect(r.lobby_total).toBe(2);
    // Passado o freio, a próxima entrada avisa.
    await db.exec(`update public.chefona_rodadas set lobby_avisado_em = lobby_avisado_em - interval '2 seconds'`);
    await sair(BRUNO, id);
    expect(await avisosDoLobby()).toBe(antes + 2);
  });

  it('a leitura de entrada diz a cada um se está no lobby; o aviso geral não leva isso', async () => {
    const id = await soltar(500, 180);
    await entrar(ANA, id);
    expect((await como<Estado>(ANA, 'select public.fn_chefona_atual() v')).eu_no_lobby).toBe(true);
    expect((await como<Estado>(BRUNO, 'select public.fn_chefona_atual() v')).eu_no_lobby).toBe(false);
    const enviado = (await db.query<{ payload: Record<string, unknown> }>('select payload from realtime.enviados order by n desc limit 1')).rows[0].payload;
    expect(enviado).not.toHaveProperty('eu_no_lobby');
    expect(enviado).not.toHaveProperty('lobby_avisado_em');
    expect(enviado).toHaveProperty('lobby_total', 1);
  });

  it('sair tira a pessoa', async () => {
    const id = await soltar(500, 180);
    await entrar(ANA, id);
    const r = await sair(ANA, id);
    expect(r.eu_no_lobby).toBe(false);
    expect(r.lobby_total).toBe(0);
  });

  it('com ela fora da tela não dá para entrar', async () => {
    const id = await soltar();
    await db.exec(`update public.chefona_rodadas set situacao = 'fugiu'`);
    await expect(entrar(ANA, id)).rejects.toThrow(/SEM_CHEFONA/);
  });

  it('só quem está no lobby acerta; o super_admin acerta sem lobby', async () => {
    const id = await soltar(500);
    const fora = await atirar(BRUNO, id, 3, 9);
    expect(fora.fora_do_lobby).toBe(true);
    expect(fora.vida).toBe(500);
    const admin = await atirar(ADMIN, id, 3, 9);
    expect(admin.vida).toBe(491);
    await entrar(BRUNO, id);
    expect((await atirar(BRUNO, id, 3, 9)).vida).toBe(482);
  });

  it('entrar no meio da luta vale', async () => {
    const id = await soltar(500);
    const r = await entrar(ANA, id);
    expect(r.eu_no_lobby).toBe(true);
    expect((await atirar(ANA, id, 2, 6)).vida).toBe(494);
  });

  it('anon não entra; ninguém chama o aviso do lobby direto', async () => {
    const pode = async (papel: string, fn: string) =>
      (await db.query<{ ok: boolean }>(`select has_function_privilege('${papel}', '${fn}', 'EXECUTE') ok`)).rows[0].ok;
    expect(await pode('authenticated', 'public.fn_chefona_lobby_entrar(bigint)')).toBe(true);
    expect(await pode('anon', 'public.fn_chefona_lobby_entrar(bigint)')).toBe(false);
    expect(await pode('authenticated', 'public.fn_chefona_lobby_avisar(bigint)')).toBe(false);
  });
});

describe('20261016120000 — cliques automáticos não contam', () => {
  it('teto por tempo: no máximo 9 acertos por segundo; o resto é descartado e o dano vai na proporção', async () => {
    const id = await soltar(1000);
    await entrar(ANA, id);
    const r = await atirar(ANA, id, 12, 36);
    expect(r.descartados).toBe(3);
    expect(r.vida).toBe(1000 - 27);
    expect(r.ranking[0]).toMatchObject({ usuario: ANA, dano: 27, acertos: 9 });
  });

  it('lote com pista forte (ritmo, rápido, script) não tira vida nem entra no ranking', async () => {
    const id = await soltar(1000);
    await entrar(ANA, id);
    const r = await atirar(ANA, id, 5, 15, 1);
    expect(r.descartados).toBe(5);
    expect(r.vida).toBe(1000);
    expect(r.ranking).toEqual([]);
    const g = (await db.query<{ acertos_descartados: number; dano_descartado: number; suspeitas: number }>(
      `select acertos_descartados, dano_descartado, suspeitas from public.chefona_golpes where usuario = '${ANA}'`)).rows[0];
    expect(g).toEqual({ acertos_descartados: 5, dano_descartado: 15, suspeitas: 1 });
  });

  it('pista fraca (mouse parado, botão igual) conta normal', async () => {
    const id = await soltar(1000);
    await entrar(ANA, id);
    expect((await atirar(ANA, id, 3, 9, 8 | 16)).vida).toBe(991);
  });

  it('três lotes com pista forte: nada mais da pessoa conta nesta chefona', async () => {
    const id = await soltar(1000);
    await entrar(ANA, id);
    for (let i = 0; i < 3; i++) { await atirar(ANA, id, 4, 12, 2); await esperarFreio(ANA); }
    const limpo = await atirar(ANA, id, 3, 9, 0);
    expect(limpo.descartados).toBe(3);
    expect(limpo.vida).toBe(1000);
  });

  it('quem atira limpo segue contando com os outros bloqueados', async () => {
    const id = await soltar(1000);
    await entrar(ANA, id);
    await entrar(BRUNO, id);
    await atirar(ANA, id, 4, 12, 1);
    const r = await atirar(BRUNO, id, 4, 12, 0);
    expect(r.vida).toBe(988);
    expect(r.ranking.map(g => g.usuario)).toEqual([BRUNO]);
  });
});

// @vitest-environment node
/**
 * ritmo.sql.test.ts — a migration 20261016200000 (o diretor de ritmo) num
 * Postgres de verdade (PGlite, local — não é o banco), por cima de todas as
 * da chefona. O relógio da luta anda mexendo no `solta_em`.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ritmoDaLuta } from './ritmo';

const EMPRESA = '00000000-0000-4000-8000-000000000001';
const ADMIN   = '00000000-0000-4000-8000-0000000000a1';
const ANA     = '00000000-0000-4000-8000-0000000000c1';

const migration = (nome: string) => readFileSync(resolve(__dirname, '../../../../../supabase/migrations', nome), 'utf8');
const SQLS = [
  '20261009120000_chefao_rei_do_pop.sql', '20261015230000_chefona_bruxa_do_pantano.sql',
  '20261016120000_chefona_lobby_e_autoclick.sql', '20261016170000_chefona_hora_do_banco.sql',
  '20261016200000_chefona_ritmo.sql', '20261016220000_chefona_lobby_foto.sql',
].map(migration);

let db: PGlite;

interface Estado {
  vida: number; vida_max: number; situacao: string; ritmo: number; cura_em: string | null; cura_vida: number;
  ranking: { usuario: string; dano: number }[];
}

async function como<T>(uid: string, sql: string, params: unknown[] = []): Promise<T> {
  await db.query("select set_config('teste.uid', $1, false)", [uid]);
  await db.query("select set_config('teste.super', $1, false)", [uid === ADMIN ? 'sim' : '']);
  const r = await db.query<{ v: T }>(sql, params);
  return r.rows[0]?.v as T;
}

/** Uma chefona de 1.000 de vida (sem crescer por pessoa), com a Ana no lobby, aos `t` s de luta. */
async function lutaAos(t: number, vida = 1000): Promise<number> {
  const id = await como<number>(ADMIN, 'select public.fn_chefona_soltar(1000, 2, 0, 0) v');
  await como(ANA, 'select public.fn_chefona_lobby_entrar($1) v', [id]);
  await db.exec(`update public.chefona_rodadas set solta_em = clock_timestamp() - interval '${t} seconds',
    expira_em = clock_timestamp() + interval '60 seconds', vida = ${vida}, avisado_em = null where id = ${id}`);
  return id;
}
const atirar = (id: number, a: number, d: number) =>
  como<Estado>(ANA, 'select public.fn_chefona_acertar($1, $2, 0, $3, $2, 0) v', [id, a, d]);

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
    create table public.perfis (id uuid primary key, nome text, foto_url text, setor_id uuid);
    insert into public.perfis values ('${ANA}', 'Ana Paula', null, null), ('${ADMIN}', 'Cleber', 'https://x/cleber.png', null);
    create function public.fn_user_is_super_admin() returns boolean language sql stable
      as $$ select current_setting('teste.super', true) = 'sim' $$;
  `);
  for (const s of SQLS) await db.exec(s);
  // Reexecutável.
  await db.exec(SQLS[SQLS.length - 1]);
});

beforeEach(async () => {
  await db.exec('delete from public.chefona_rodadas; delete from public.chefao_rodadas; truncate realtime.enviados;');
});

afterAll(async () => { await db.close(); });

describe('20261016200000 — o diretor de ritmo', () => {
  it('a conta do banco é a mesma do app', async () => {
    for (const [t, f] of [[0, 1], [30, 0.9], [45, 0.5], [45, 0.1], [60, 0.6], [100, 0.4], [110, 1]] as const) {
      const banco = (await db.query<{ v: string }>('select public.fn_chefona_ritmo($1, $2)::text v', [t, f])).rows[0].v;
      expect(Number(banco), `t=${t} vida=${f}`).toBeCloseTo(ritmoDaLuta(t, f), 6);
    }
  });

  it('na linha o dano vale normal', async () => {
    const id = await lutaAos(45, 500);
    expect((await atirar(id, 3, 9)).vida).toBe(491);
  });

  it('atrás da linha (devagar) o dano vale mais, mas o ranking soma o dano de verdade', async () => {
    const id = await lutaAos(30, 1000);
    const r = await atirar(id, 3, 9);
    // Aos 30 s a linha está em 67%: com a vida cheia, o multiplicador bate no teto (5×).
    expect(r.vida).toBe(1000 - 45);
    expect(r.ranking[0]).toMatchObject({ usuario: ANA, dano: 9 });
    expect(r.ritmo).toBeGreaterThan(1);
  });

  it('à frente da linha (rápido) o dano vale menos', async () => {
    const id = await lutaAos(20, 300);
    const r = await atirar(id, 12, 144);
    // Aos 20 s a linha está em 78%; com 30% o multiplicador é o piso (0,25).
    expect(300 - r.vida).toBeLessThanOrEqual(36);
  });

  it('time forte demais: ela bebe uma poção sozinha, e todo mundo é avisado', async () => {
    const id = await lutaAos(30, 300);
    const r = await atirar(id, 3, 9);
    expect(r.cura_em).not.toBeNull();
    expect(r.cura_vida).toBeGreaterThan(200);
    expect(r.vida).toBeGreaterThan(500);
    expect((await db.query<{ n: number }>("select count(*)::int n from realtime.enviados where event = 'chefona'")).rows[0].n).toBeGreaterThan(0);
    // Logo depois não bebe de novo (8 s entre uma e outra).
    const de_novo = await atirar(id, 0, 0);
    expect(de_novo.cura_em).toBe(r.cura_em);
  });

  it('antes dos 60 s ela não cai: a vida para em 5%', async () => {
    const id = await lutaAos(59, 60);
    await db.exec(`update public.chefona_rodadas set cura_em = clock_timestamp() where id = ${id}`);
    const r = await atirar(id, 12, 144);
    expect(r.situacao).toBe('ativo');
    expect(r.vida).toBeGreaterThanOrEqual(50);
  });

  it('dos 115 s em diante qualquer tiro a derruba', async () => {
    const id = await lutaAos(116, 900);
    const r = await atirar(id, 1, 3);
    expect(r.situacao).toBe('derrotado');
    expect(r.ranking[0]).toMatchObject({ usuario: ANA, dano: 3 });
  });

  describe('o autoclick não entra na conta do ritmo', () => {
    const suspeito = (id: number, a: number, d: number, bits = 1) =>
      como<Estado & { versao: number; descartados: number }>(ANA, 'select public.fn_chefona_acertar($1, $2, 0, $3, $2, $4) v', [id, a, d, bits]);

    it('lote com pista forte: nem vida, nem cura, nem ritmo, nem versão mudam', async () => {
      const id = await lutaAos(30, 300);
      const antes = await como<Estado & { versao: number }>(ANA, 'select public.fn_chefona_atual() v');
      const r = await suspeito(id, 12, 144);
      expect(r.descartados).toBe(12);
      expect(r.vida).toBe(300);
      // Bem à frente da linha, mas foi autoclick: ela não bebe nada.
      expect(r.cura_em).toBeNull();
      expect(r.versao).toBe(antes.versao);
      expect(r.ritmo).toBeCloseTo(antes.ritmo, 2);
    });

    it('o primeiro lote suspeito não faz a vida crescer pela pessoa nova', async () => {
      const id = await lutaAos(30, 1000);
      await db.exec(`update public.chefona_rodadas set vida_por_pessoa = 400 where id = ${id}`);
      const r = await suspeito(id, 3, 9);
      expect(r.vida_max).toBe(1000);
    });

    it('bloqueado (3 pistas): nem o lote limpo dele mexe na vida ou faz ela beber', async () => {
      const id = await lutaAos(30, 300);
      for (let i = 0; i < 3; i++) {
        await suspeito(id, 4, 12, 2);
        await db.exec(`update public.chefona_golpes set ultimo_em = ultimo_em - interval '1 second' where usuario = '${ANA}'`);
      }
      const limpo = await atirar(id, 3, 9);
      expect(limpo.vida).toBe(300);
      expect(limpo.cura_em).toBeNull();
    });

    it('rápido demais: só a parte que contou (o teto de 9 por segundo) entra no ritmo', async () => {
      const id = await lutaAos(45, 500);
      const r = await atirar(id, 12, 36);
      // Na linha o multiplicador é ~1: 9 acertos contaram (27), 3 ficaram de fora.
      expect(500 - r.vida).toBe(27);
    });
  });

  it('o estado leva o ritmo de agora (1 fora da luta)', async () => {
    const id = await lutaAos(45, 500);
    const e = await como<Estado>(ANA, 'select public.fn_chefona_atual() v');
    expect(e.ritmo).toBeCloseTo(1, 1);
    await db.exec(`update public.chefona_rodadas set solta_em = clock_timestamp() + interval '30 seconds' where id = ${id}`);
    expect((await como<Estado>(ANA, 'select public.fn_chefona_atual() v')).ritmo).toBe(1);
  });
});

describe('20261016220000 — a foto no lobby', () => {
  it('quem tem foto entra com ela; quem não tem, sem (o app mostra o rostinho)', async () => {
    const id = await como<number>(ADMIN, 'select public.fn_chefona_soltar(1000, 2, 180, 0) v');
    await como(ANA, 'select public.fn_chefona_lobby_entrar($1) v', [id]);
    const r = await como<{ lobby: { usuario: string; foto: string | null }[] }>(ADMIN, 'select public.fn_chefona_lobby_entrar($1) v', [id]);
    expect(r.lobby).toEqual([
      expect.objectContaining({ usuario: ANA, foto: null }),
      expect.objectContaining({ usuario: ADMIN, foto: 'https://x/cleber.png' }),
    ]);
  });
});

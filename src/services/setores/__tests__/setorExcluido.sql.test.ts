// @vitest-environment node
/**
 * setorExcluido.sql.test.ts — as migrations 20261103170000 + 20261103180000 e
 * o script excluir_setor_play4_20261103.sql rodando num Postgres de verdade
 * (PGlite).
 *
 * O que importa provar:
 *
 *   * setor excluído e as equipes dele somem para `authenticated`, inclusive
 *     super admin;
 *   * a história continua apontando para eles (acordo, subgrupo do 59, retrato
 *     de mês fechado) — nada de SET NULL nem CASCADE;
 *   * o retrato do mês em aberto descarta o setor, o de mês anterior não;
 *   * só super admin (ou o SQL Editor, sem auth.uid()) marca `excluido_em`;
 *   * o ensaio (PARTE 1) executa, e a aplicação (PARTE 2) respeita as travas.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const EMPRESA = '00000000-0000-4000-8000-000000000001';
const PLAY4   = 'a2f0aad7-f108-40a3-9c68-80798c7fd5c1';
const OUTRO   = '00000000-0000-4000-8000-0000000000b2';
const EQUIPE  = '00000000-0000-4000-8000-0000000000e1';
const EQUIPE_OUTRO = '00000000-0000-4000-8000-0000000000e2';
const ARQUIVADO = '00000000-0000-4000-8000-0000000000f1';

const raiz = resolve(__dirname, '../../../..');
const ler = (p: string) => readFileSync(resolve(raiz, p), 'utf8');
const MIGRATION_SETOR   = ler('supabase/migrations/20261103170000_setor_excluido_some_de_hoje.sql');
const MIGRATION_EQUIPES = ler('supabase/migrations/20261103180000_setor_excluido_leva_equipes_e_sai_do_retrato.sql');
const SCRIPT = ler('supabase/sql_scripts/excluir_setor_play4_20261103.sql');
const fimDoEnsaio = SCRIPT.indexOf('ORDER BY 1, 2;') + 'ORDER BY 1, 2'.length;
const ENSAIO = SCRIPT.slice(0, fimDoEnsaio);
const APLICAR = SCRIPT.slice(SCRIPT.indexOf('-- PARTE 2 — APLICAÇÃO'));

let db: PGlite;
let corrente: string;

/** Roda `sql` como `authenticated`, com `uid` no papel de auth.uid(). */
async function comoUsuario<T>(uid: string, superAdmin: boolean, sql: string): Promise<T[]> {
  await db.exec(`
    set app.uid = '${uid}'; set app.super = '${superAdmin}';
    set role authenticated;
  `);
  try {
    return (await db.query<T>(sql)).rows;
  } finally {
    await db.exec(`reset role; reset app.uid; reset app.super;`);
  }
}

async function erroDe(fn: () => Promise<unknown>): Promise<string | null> {
  try { await fn(); return null; } catch (e) { return (e as Error).message; }
}

async function mesesDoRetrato(tabela: string, coluna: string, id: string): Promise<string[]> {
  const r = await db.query<{ mes: string }>(`select mes from public.${tabela} where ${coluna} = $1 order by mes`, [id]);
  return r.rows.map(l => l.mes);
}

beforeAll(async () => {
  db = new PGlite();
  corrente = (await db.query<{ m: string }>(
    `select to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM') m`)).rows[0].m;

  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('app.uid', true), '')::uuid $$;
    create function public.fn_user_is_super_admin() returns boolean language sql stable as
      $$ select coalesce(nullif(current_setting('app.super', true), '')::boolean, false) $$;

    create table public.empresas (id uuid primary key, slug text);
    create table public.setores (
      id uuid primary key, empresa_id uuid not null references public.empresas(id),
      nome text not null, ativo boolean not null default true,
      foto_url text, foto_receptivo_url text, descricao text
    );
    create table public.equipes (
      id uuid primary key, nome text,
      setor_id uuid references public.setores(id) on delete cascade
    );
    create table public.perfis (
      id uuid primary key, arquivado boolean default false,
      setor_id uuid references public.setores(id) on delete set null,
      equipe_id uuid references public.equipes(id) on delete set null
    );
    create table public.equipe_membros (
      equipe_id uuid references public.equipes(id) on delete cascade, pessoa_id uuid, papel text
    );
    create table public.mestre_equipes (
      id serial primary key, equipe_id uuid references public.equipes(id) on delete set null
    );
    create table public.analitico_ajustes_manuais (equipe_id uuid, setor_id uuid);
    create table public.acordos (id serial primary key, setor_id uuid references public.setores(id) on delete set null);
    create table public.metas (
      tipo text, referencia_id uuid, empresa_id uuid, meta_valor numeric, mes int, ano int
    );
    create table public.composicao_mes_setor (empresa_id uuid, mes text, setor_id uuid, nome text);
    create table public.composicao_mes (empresa_id uuid, mes text, operador_id uuid, setor_id uuid);
    create table public.composicao_mes_equipe (empresa_id uuid, mes text, equipe_id uuid, nome text, setor_id uuid);

    alter table public.setores enable row level security;
    create policy setores_select on public.setores for select to authenticated using (true);
    create policy setores_update on public.setores for update to authenticated using (true);
    alter table public.equipes enable row level security;
    create policy equipes_select on public.equipes for select to authenticated using (true);
    grant select, update on public.setores to authenticated;
    grant select on public.equipes to authenticated;

    insert into public.empresas values ('${EMPRESA}', 'bookplay');
    insert into public.setores (id, empresa_id, nome, ativo) values
      ('${PLAY4}', '${EMPRESA}', 'Play 4', false),
      ('${OUTRO}', '${EMPRESA}', 'Play Mix Marília', true);
    insert into public.equipes values
      ('${EQUIPE}', 'Digital Bruno', '${PLAY4}'),
      ('${EQUIPE_OUTRO}', 'Mix', '${OUTRO}');
    insert into public.perfis values ('${ARQUIVADO}', true, null, '${EQUIPE}');
    insert into public.equipe_membros values ('${EQUIPE}', '${ARQUIVADO}', 'membro');
    insert into public.mestre_equipes (equipe_id) values ('${EQUIPE}');
    insert into public.acordos (setor_id) values ('${PLAY4}');
    insert into public.composicao_mes_setor values
      ('${EMPRESA}', '2026-09', '${PLAY4}', 'Play 4'),
      ('${EMPRESA}', '${corrente}', '${PLAY4}', 'Play 4');
    insert into public.composicao_mes_equipe values
      ('${EMPRESA}', '2026-09', '${EQUIPE}', 'Digital Bruno', '${PLAY4}'),
      ('${EMPRESA}', '${corrente}', '${EQUIPE}', 'Digital Bruno', '${PLAY4}');
    insert into public.metas values
      ('setor', '${PLAY4}', '${EMPRESA}', 100, 9, 2026),
      ('setor', '${PLAY4}', '${EMPRESA}', 200, 12, 2099);
  `);
});

afterAll(async () => { await db?.close(); });

describe('excluir setor sem prejudicar mês fechado', () => {
  it('a PARTE 2 recusa sem as migrations aplicadas', async () => {
    expect(await erroDe(() => db.exec(APLICAR))).toMatch(/Aplique antes a migration 20261103170000/);
    await db.exec(MIGRATION_SETOR);
    expect(await erroDe(() => db.exec(APLICAR))).toMatch(/Aplique antes a migration 20261103180000/);
  });

  it('as migrations aplicam e são reexecutáveis', async () => {
    await db.exec(MIGRATION_SETOR);
    await db.exec(MIGRATION_EQUIPES);
    await db.exec(MIGRATION_EQUIPES);
  });

  it('o ensaio (PARTE 1) executa e mostra o setor', async () => {
    const r = await db.query<{ secao: string; item: string; valor: string }>(ENSAIO);
    expect(r.rows.find(l => l.secao === '0 pré-requisito')?.valor).toBe('true');
    const acordos = r.rows.find(l => l.secao === '4 FK → setores' && /(^|\.)acordos\.setor_id/.test(l.item));
    expect(acordos?.item).toContain('[SET NULL]');
    expect(acordos?.valor).toBe('1');
    const subgrupos = r.rows.find(l => l.secao === '5 FK → equipes' && /(^|\.)mestre_equipes\.equipe_id/.test(l.item));
    expect(subgrupos?.valor).toBe('1');
  });

  it('quem não é super admin não marca excluído', async () => {
    const msg = await erroDe(() => comoUsuario(OUTRO, false,
      `update public.setores set excluido_em = now() where id = '${OUTRO}'`));
    expect(msg).toMatch(/Só o super admin exclui setor/);
  });

  it('a PARTE 2 marca o setor, apaga a meta futura e guarda a história', async () => {
    await db.exec(APLICAR);

    const setor = await db.query<{ excluido: boolean }>(
      `select excluido_em is not null as excluido from public.setores where id = '${PLAY4}'`);
    expect(setor.rows[0].excluido).toBe(true);

    const metas = await db.query<{ ano: number }>(`select ano from public.metas order by ano`);
    expect(metas.rows.map(m => m.ano)).toEqual([2026]);

    const acordo = await db.query<{ setor_id: string }>(`select setor_id from public.acordos`);
    expect(acordo.rows[0].setor_id).toBe(PLAY4);

    const subgrupo = await db.query<{ equipe_id: string }>(`select equipe_id from public.mestre_equipes`);
    expect(subgrupo.rows[0].equipe_id).toBe(EQUIPE);
  });

  it('o retrato perde só o mês em aberto', async () => {
    expect(await mesesDoRetrato('composicao_mes_setor', 'setor_id', PLAY4)).toEqual(['2026-09']);
    expect(await mesesDoRetrato('composicao_mes_equipe', 'equipe_id', EQUIPE)).toEqual(['2026-09']);
  });

  it('o snapshot do mês em aberto não regrava o setor; o de mês anterior grava', async () => {
    await db.exec(`
      insert into public.composicao_mes_setor values ('${EMPRESA}', '${corrente}', '${PLAY4}', 'Play 4');
      insert into public.composicao_mes_equipe (empresa_id, mes, equipe_id, nome)
        values ('${EMPRESA}', '${corrente}', '${EQUIPE}', 'Digital Bruno');
      insert into public.composicao_mes_setor values ('${EMPRESA}', '2026-08', '${PLAY4}', 'Play 4');
      insert into public.composicao_mes_setor values ('${EMPRESA}', '${corrente}', '${OUTRO}', 'Play Mix Marília');
    `);
    expect(await mesesDoRetrato('composicao_mes_setor', 'setor_id', PLAY4)).toEqual(['2026-08', '2026-09']);
    expect(await mesesDoRetrato('composicao_mes_equipe', 'equipe_id', EQUIPE)).toEqual(['2026-09']);
    expect(await mesesDoRetrato('composicao_mes_setor', 'setor_id', OUTRO)).toEqual([corrente]);
  });

  it('setor excluído e as equipes dele somem para o app, até para o super admin', async () => {
    for (const superAdmin of [false, true]) {
      const setores = await comoUsuario<{ id: string }>(OUTRO, superAdmin, `select id from public.setores`);
      expect(setores.map(s => s.id)).toEqual([OUTRO]);
      const equipes = await comoUsuario<{ id: string }>(OUTRO, superAdmin, `select id from public.equipes`);
      expect(equipes.map(e => e.id)).toEqual([EQUIPE_OUTRO]);
    }
  });

  it('rodar a PARTE 2 de novo não faz nada', async () => {
    expect(await erroDe(() => db.exec(APLICAR))).toMatch(/já excluído/);
  });
});

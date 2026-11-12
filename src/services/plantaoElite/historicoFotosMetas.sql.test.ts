// @vitest-environment node
/**
 * A migration 20261111170500 (foto e metas no histórico do Plantão Elite) num
 * Postgres de verdade (PGlite, LOCAL — não é o banco de produção), por cima da
 * 20261105160000: a foto vem em `pessoas`, e `metas` traz, por mês e pessoa, a
 * meta, as extras e o fechado do mês inteiro (todo dia + ajuste de operador).
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const EMP = '00000000-0000-4000-8000-0000000000e0';
const REC = '00000000-0000-4000-8000-0000000000a1';
const TIAGO = '00000000-0000-4000-8000-0000000000c1';
const AGATHA = '00000000-0000-4000-8000-0000000000c2';
const MATHEUS = '00000000-0000-4000-8000-0000000000c3';
const GABRIEL = '00000000-0000-4000-8000-0000000000c4';
const GERENTE = '00000000-0000-4000-8000-0000000000c5';

const ler = (nome: string) => readFileSync(resolve(__dirname, '../../../supabase/migrations', nome), 'utf8');
const BASE = ler('20261105160000_plantao_elite_historico.sql');
const NOVA = ler('20261111170500_plantao_elite_historico_fotos_metas.sql');

let db: PGlite;

interface Hist {
  pessoas: { id: string; nome: string; foto: string | null }[];
  dias: { data: string }[];
  metas: { mes: string; id: string; meta: number | null; extras: unknown; fechado: number }[];
}

async function historico(uid: string, de: string, ate: string): Promise<Hist> {
  await db.query("select set_config('teste.uid', $1, false)", [uid]);
  const r = await db.query<{ h: Hist }>('select public.fn_elite_plantao_historico($1, $2, $3) h', [EMP, de, ate]);
  return r.rows[0].h;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('teste.uid', true), '')::uuid $$;
    create schema supabase_migrations;
    create table supabase_migrations.schema_migrations (version text primary key, name text, statements text[]);

    create table public.empresas (id uuid primary key, slug text);
    create table public.setores (id uuid primary key, nome text);
    create table public.equipes (id uuid primary key, setor_id uuid);
    create table public.perfis (
      id uuid primary key, nome text, usuario text, perfil text,
      setor_id uuid, equipe_id uuid, foto_url text);
    create table public.analitico_recebimentos (
      id serial primary key, empresa_id uuid, operador_id uuid, setor_id uuid,
      contribuicao_de_setor_id uuid, data_pagamento date, valor_recebido numeric,
      importado_em timestamptz default now());
    create table public.analitico_exclusoes_setor (
      empresa_id uuid, setor_id uuid, mes text, setor_origem_id uuid);
    create table public.elite_plantao (
      empresa_id uuid not null references public.empresas(id),
      perfil_id uuid not null references public.perfis(id),
      plantao text not null, ordem smallint not null default 1,
      criado_em timestamptz not null default now(),
      primary key (empresa_id, perfil_id));
    create table public.metas (
      id serial primary key, tipo text, referencia_id uuid, empresa_id uuid,
      meta_valor numeric(15,2) not null default 0, meta_acordos integer not null default 0,
      mes integer, ano integer, metas_extras jsonb not null default '[]',
      created_at timestamptz default now(), updated_at timestamptz default now());
    create table public.ajustes_teste (operador_id uuid, dia date, valor numeric);
    create function public.fn_ajustes_recebimento(p_empresas uuid[], p_ini date, p_fim date,
        p_de timestamptz default null, p_ate timestamptz default null)
      returns table(empresa_id uuid, alvo text, operador_id uuid, equipe_id uuid, setor_id uuid,
                    dia date, valor numeric, valor_ho numeric)
      language sql stable as $$
        select p_empresas[1], 'operador', a.operador_id, null::uuid, null::uuid, a.dia, a.valor, 0::numeric
          from public.ajustes_teste a where a.dia between p_ini and p_fim $$;

    create function public.fn_can_access_empresa(e uuid) returns boolean language sql stable as $$ select true $$;
    create function public.fn_user_tem(chave text) returns boolean language sql stable
      as $$ select exists (select 1 from public.perfis p where p.id = auth.uid() and p.perfil in ('elite','gerencia')) $$;

    insert into public.empresas values ('${EMP}', 'bookplay');
    insert into public.setores values ('${REC}', 'Receptivo');
    insert into public.perfis values
      ('${TIAGO}',   'Tiago Almada',     'tiago',   'elite',    '${REC}', null, 'https://x/tiago.jpg'),
      ('${AGATHA}',  'Agatha Rocha',     'agatha',  'elite',    '${REC}', null, null),
      ('${MATHEUS}', 'Matheus Souza',    'matheus', 'elite',    '${REC}', null, 'https://x/matheus.jpg'),
      ('${GABRIEL}', 'Gabriel Oliveira', 'gabriel', 'elite',    '${REC}', null, null),
      ('${GERENTE}', 'Gerente',          'gerente', 'gerencia', '${REC}', null, null);

    insert into public.elite_plantao (empresa_id, perfil_id, plantao, ordem) values
      ('${EMP}', '${TIAGO}',   'par',   1), ('${EMP}', '${AGATHA}',  'par',   2),
      ('${EMP}', '${MATHEUS}', 'impar', 1), ('${EMP}', '${GABRIEL}', 'impar', 2);

    insert into public.analitico_recebimentos (empresa_id, operador_id, setor_id, data_pagamento, valor_recebido) values
      -- outubro: Tiago era do ímpar (31/10), mas o fechado conta TODO dia do mês
      ('${EMP}', '${TIAGO}',   '${REC}', '2026-10-31', 1000),
      ('${EMP}', '${TIAGO}',   '${REC}', '2026-10-30', 2000),   -- dia de plantão do Matheus
      ('${EMP}', '${TIAGO}',   '${REC}', '2026-10-05', 3000),   -- fora do intervalo pedido
      ('${EMP}', '${AGATHA}',  '${REC}', '2026-10-31', 500),
      ('${EMP}', '${MATHEUS}', '${REC}', '2026-10-30', 800),
      -- novembro
      ('${EMP}', '${TIAGO}',   '${REC}', '2026-11-04', 400),
      ('${EMP}', '${MATHEUS}', '${REC}', '2026-11-05', 900);

    insert into public.ajustes_teste values ('${TIAGO}', '2026-10-15', 250);

    insert into public.metas (tipo, referencia_id, empresa_id, meta_valor, mes, ano, metas_extras, updated_at) values
      ('operador', '${TIAGO}',   '${EMP}', 6000, 10, 2026, '[8000, 7000]', now()),
      ('operador', '${MATHEUS}', '${EMP}', 999,  10, 2026, '[]', now() - interval '1 day'),  -- velha, perde
      ('operador', '${MATHEUS}', '${EMP}', 1000, 10, 2026, '[]', now()),
      ('operador', '${TIAGO}',   '${EMP}', 5000, 11, 2026, '[]', now()),
      ('setor',    '${REC}',     '${EMP}', 99999, 10, 2026, '[]', now());
  `);
  await db.exec(BASE);
  await db.exec(NOVA);
  await db.exec(NOVA); // reaplicável
});

afterAll(async () => { await db.close(); });

describe('migration 20261111170500 — foto e metas no histórico do Plantão Elite', () => {
  it('traz a foto de cada um (nula quando não há)', async () => {
    const h = await historico(GERENTE, '2026-10-30', '2026-11-05');
    const foto = Object.fromEntries(h.pessoas.map(p => [p.id, p.foto]));
    expect(foto[TIAGO]).toBe('https://x/tiago.jpg');
    expect(foto[MATHEUS]).toBe('https://x/matheus.jpg');
    expect(foto[AGATHA]).toBeNull();
  });

  it('a gerência vê a meta de todos, com o fechado do mês inteiro e o ajuste', async () => {
    const h = await historico(GERENTE, '2026-10-30', '2026-11-05');
    const de = (mes: string, id: string) => h.metas.find(m => m.mes === mes && m.id === id);

    // Tiago em outubro: 1000 + 2000 + 3000 (o mês inteiro, mesmo fora dos dias pedidos) + 250 de ajuste.
    expect(de('2026-10', TIAGO)).toMatchObject({ meta: 6000, extras: [8000, 7000] });
    expect(Number(de('2026-10', TIAGO)!.fechado)).toBe(6250);
    // A meta gravada por último vale; meta de setor não entra.
    expect(Number(de('2026-10', MATHEUS)!.meta)).toBe(1000);
    // Sem meta no mês: meta nula, fechado igual.
    expect(de('2026-10', AGATHA)).toMatchObject({ meta: null, extras: [] });
    expect(Number(de('2026-10', AGATHA)!.fechado)).toBe(500);
    expect(Number(de('2026-11', TIAGO)!.fechado)).toBe(400);
    // Todo mundo que esteve de plantão nos dias visíveis, mês a mês.
    expect(h.metas.filter(m => m.mes === '2026-10').map(m => m.id).sort())
      .toEqual([TIAGO, AGATHA, MATHEUS, GABRIEL].sort());
  });

  it('quem é de dupla vê só a própria meta', async () => {
    const h = await historico(TIAGO, '2026-10-30', '2026-11-05');
    expect(new Set(h.metas.map(m => m.id))).toEqual(new Set([TIAGO]));
    expect(h.metas.map(m => m.mes)).toEqual(['2026-10', '2026-11']);
    // A colega da dupla continua nos dias e nas pessoas, como antes.
    expect(h.pessoas.map(p => p.id).sort()).toEqual([TIAGO, AGATHA].sort());
  });

  it('registra a versão', async () => {
    const r = await db.query<{ n: number }>(
      "select count(*)::int n from supabase_migrations.schema_migrations where version = '20261111170500'");
    expect(r.rows[0].n).toBe(1);
  });
});

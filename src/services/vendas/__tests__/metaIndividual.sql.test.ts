/**
 * A meta individual do Comercial — `fn_vendas_metas_individuais_do_mes`.
 *
 * Prende as três decisões da migration 20261002120000: só vem meta com régua
 * (a da cobrança fica de fora), quem tem `ver_metas_vendas` lê todas e quem não
 * tem lê só a própria.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const MIGRATION = readFileSync(
  resolve(__dirname, '../../../../supabase/migrations/20261002120000_vendas_meta_individual.sql'),
  'utf8',
);

const EMPRESA = '00000000-0000-0000-0000-0000000000e1';
const OUTRA   = '00000000-0000-0000-0000-0000000000e2';
const ANA     = '00000000-0000-0000-0000-00000000000a';
const BIA     = '00000000-0000-0000-0000-00000000000b';
const CAIO    = '00000000-0000-0000-0000-00000000000c';

let db: PGlite;

async function ler(uid: string, chaves: string[], empresa = EMPRESA, mes = 10) {
  await db.query(`select set_config('test.uid', $1, false), set_config('test.chaves', $2, false)`,
    [uid, chaves.join(',')]);
  const r = await db.query<{ nome: string; quantidade: number }>(
    'select nome, quantidade from public.fn_vendas_metas_individuais_do_mes($1, 2026, $2)',
    [empresa, mes]);
  return r.rows;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql
      as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create function public.fn_user_tem(k text) returns boolean language sql
      as $$ select k = any(string_to_array(coalesce(current_setting('test.chaves', true), ''), ',')) $$;
    create function public.fn_can_access_empresa(e uuid) returns boolean language sql
      as $$ select e = '${EMPRESA}'::uuid $$;

    create table public.perfis (id uuid primary key, nome text, equipe_id uuid, setor_id uuid);
    create table public.metas (
      id uuid primary key default gen_random_uuid(), tipo text, referencia_id uuid, empresa_id uuid,
      meta_valor numeric(15,2) not null default 0, meta_acordos integer not null default 0,
      regua text, mes integer, ano integer);

    insert into public.perfis values
      ('${ANA}', 'Ana', null, null), ('${BIA}', 'Bia', null, null), ('${CAIO}', 'Caio', null, null);
    insert into public.metas (tipo, referencia_id, empresa_id, meta_acordos, regua, mes, ano) values
      ('operador', '${ANA}',  '${EMPRESA}', 12, 'quantidade', 10, 2026),
      ('operador', '${BIA}',  '${EMPRESA}', 12, 'quantidade', 10, 2026),
      -- cobrança: meta individual sem régua
      ('operador', '${CAIO}', '${EMPRESA}', 0, null, 10, 2026),
      -- outro mês
      ('operador', '${ANA}',  '${EMPRESA}', 9, 'quantidade', 9, 2026),
      -- equipe/setor não entram
      ('setor', '${EMPRESA}', '${EMPRESA}', 168, 'quantidade', 10, 2026);
  `);
  await db.exec(MIGRATION);
});

afterAll(async () => { await db.close(); });

describe('fn_vendas_metas_individuais_do_mes', () => {
  it('com ver_metas_vendas, todas as metas individuais com régua do mês', async () => {
    expect(await ler(ANA, ['ver_metas_vendas'])).toEqual([
      { nome: 'Ana', quantidade: 12 }, { nome: 'Bia', quantidade: 12 },
    ]);
  });

  it('sem a chave, só a própria', async () => {
    expect(await ler(BIA, [])).toEqual([{ nome: 'Bia', quantidade: 12 }]);
    expect(await ler(CAIO, [])).toEqual([]);
  });

  it('empresa fora do acesso devolve nada', async () => {
    expect(await ler(ANA, ['ver_metas_vendas'], OUTRA)).toEqual([]);
  });

  it('lê o mês pedido', async () => {
    expect(await ler(ANA, [], EMPRESA, 9)).toEqual([{ nome: 'Ana', quantidade: 9 }]);
  });
});

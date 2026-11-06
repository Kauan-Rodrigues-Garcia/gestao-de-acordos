// @vitest-environment node
/**
 * A migration 20261105150000 (Pix com a regra do Jornada) num Postgres de
 * verdade (PGlite, LOCAL — não é o banco de produção), sobre o mínimo das
 * tabelas do Pix: aplica, reaplica, cobra as regras da configuração e prova que
 * só a liderança carimba a comissão fixa — e que a lixeira devolve o valor.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const EMP = '00000000-0000-4000-8000-0000000000e0';
const SETOR = '00000000-0000-4000-8000-0000000000a1';
const OPER = '00000000-0000-4000-8000-0000000000c1';
const LIDER = '00000000-0000-4000-8000-0000000000c2';
const PIX = '00000000-0000-4000-8000-0000000000f1';

const SQL = readFileSync(
  resolve(__dirname, '../../../supabase/migrations/20261105150000_pix_meta_quantidade_e_comissao_fixa.sql'),
  'utf8',
);

let db: PGlite;

async function como(uid: string, sql: string, params: unknown[] = []) {
  await db.query("select set_config('teste.uid', $1, false)", [uid]);
  return db.query(sql, params);
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('teste.uid', true), '')::uuid $$;
    create table public.perfis (id uuid primary key, perfil text);
    insert into public.perfis values ('${OPER}', 'operador'), ('${LIDER}', 'lider');
    create function public.fn_user_has_any_role(roles text[]) returns boolean language sql stable
      as $$ select exists (select 1 from public.perfis p where p.id = auth.uid() and p.perfil = any(roles)) $$;

    create table public.pix_automatico_config (
      id uuid primary key default gen_random_uuid(), empresa_id uuid, setor_id uuid,
      pct numeric not null default 0.25, unique (empresa_id, setor_id));
    create table public.pix_automatico_acordos (
      id uuid primary key, empresa_id uuid, setor_id uuid, status text, valor numeric, pct_comissao numeric);
    create table public.lixeira_pix_automatico (
      id uuid primary key default gen_random_uuid(), acordo_id uuid, dados_completos jsonb);
  `);
  await db.exec(SQL);
  await db.exec(SQL); // reaplicar não quebra
});

afterAll(async () => { await db.close(); });

describe('migration 20261105150000 — Pix com a regra do Jornada', () => {
  it('configuração: o padrão é o de sempre, e «fixo» exige valor', async () => {
    await db.query(`insert into public.pix_automatico_config (empresa_id, setor_id) values ($1, $2)`, [EMP, SETOR]);
    const c = await db.query<{ meta_modo: string; comissao_modo: string }>(
      'select meta_modo, comissao_modo from public.pix_automatico_config');
    expect(c.rows[0]).toEqual({ meta_modo: 'valor', comissao_modo: 'percentual' });
    await expect(db.query(`update public.pix_automatico_config set comissao_modo = 'fixo'`))
      .rejects.toThrow(/fixo_tem_valor/);
    await expect(db.query(`update public.pix_automatico_config set meta_modo = 'outro'`))
      .rejects.toThrow(/meta_modo/);
    await db.query(`update public.pix_automatico_config set comissao_modo = 'fixo', comissao_valor_fixo = 3, meta_modo = 'quantidade'`);
  });

  it('o operador não carimba comissão fixa: no insert nasce vazia, no update fica', async () => {
    await como(OPER, `insert into public.pix_automatico_acordos (id, empresa_id, setor_id, status, valor, comissao_fixa)
      values ($1, $2, $3, 'pendente', 100, 999)`, [PIX, EMP, SETOR]);
    const fixa = async () => (await db.query<{ v: string | null }>(
      'select comissao_fixa::text v from public.pix_automatico_acordos where id = $1', [PIX])).rows[0].v;
    expect(await fixa()).toBeNull();
    await como(OPER, `update public.pix_automatico_acordos set comissao_fixa = 999 where id = $1`, [PIX]);
    expect(await fixa()).toBeNull();
    await como(LIDER, `update public.pix_automatico_acordos set status = 'aprovado', comissao_fixa = 3 where id = $1`, [PIX]);
    expect(await fixa()).toBe('3.00');
    await como(OPER, `update public.pix_automatico_acordos set comissao_fixa = 999 where id = $1`, [PIX]);
    expect(await fixa()).toBe('3.00');
  });

  it('a lixeira devolve a comissão fixa na restauração', async () => {
    const row = (await db.query<{ j: unknown }>('select to_jsonb(a) j from public.pix_automatico_acordos a where id = $1', [PIX])).rows[0].j;
    await db.query('insert into public.lixeira_pix_automatico (acordo_id, dados_completos) values ($1, $2)', [PIX, row]);
    await db.query('delete from public.pix_automatico_acordos where id = $1', [PIX]);
    // A restauração de verdade insere sem conhecer a coluna, com o sinal ligado.
    await db.exec(`begin;
      select set_config('pix.restaurando', 'on', true);
      insert into public.pix_automatico_acordos (id, empresa_id, setor_id, status, valor)
        values ('${PIX}', '${EMP}', '${SETOR}', 'aprovado', 100);
      commit;`);
    const v = await db.query<{ v: string }>('select comissao_fixa::text v from public.pix_automatico_acordos where id = $1', [PIX]);
    expect(v.rows[0].v).toBe('3.00');
  });

  it('valor fixo fora do limite é recusado', async () => {
    await expect(db.query('update public.pix_automatico_config set comissao_valor_fixo = -1'))
      .rejects.toThrow(/valor_fixo/);
  });
});

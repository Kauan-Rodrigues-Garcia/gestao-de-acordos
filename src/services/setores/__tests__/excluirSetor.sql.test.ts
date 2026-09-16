// @vitest-environment node
/**
 * excluirSetor.sql.test.ts — a migration 20260916100000 rodando num Postgres de
 * verdade (PGlite), e não lida como texto.
 *
 * `plpgsql` não valida o corpo na criação (COMERCIAL-ESTADO §2.4): a função
 * aplica com sucesso e o erro espera o clique de alguém. Aqui ela EXECUTA,
 * sobre um schema mínimo com as quatro naturezas de FK que importam:
 *
 *   equipes ......... CASCADE, e é regra do pedido — impede
 *   perfis .......... SET NULL, e é regra do pedido — impede, inclusive arquivado
 *   acordos ......... SET NULL, histórico — impede, descoberto pelo catálogo
 *   comissao_config . CASCADE, configuração do setor — NÃO impede, vai junto
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const EMPRESA = '00000000-0000-4000-8000-000000000001';
const OUTRA   = '00000000-0000-4000-8000-000000000002';
const ZERADO  = '00000000-0000-4000-8000-0000000000a1';
const COM_EQUIPE   = '00000000-0000-4000-8000-0000000000a2';
const COM_ARQUIVADO = '00000000-0000-4000-8000-0000000000a3';
const COM_ACORDO   = '00000000-0000-4000-8000-0000000000a4';
const DE_OUTRA     = '00000000-0000-4000-8000-0000000000a5';

const MIGRATION = readFileSync(
  resolve(__dirname, '../../../../supabase/migrations/20260916100000_setor_excluir_so_quando_zerado.sql'),
  'utf8',
);

let db: PGlite;

async function impedimentos(setor: string) {
  const r = await db.query<{ motivo: string; quantidade: number }>(
    'select motivo, quantidade::int as quantidade from public.fn_setor_impedimentos_exclusao($1)', [setor],
  );
  return r.rows;
}

async function excluir(setor: string): Promise<{ codigo: string | null; mensagem: string | null }> {
  try {
    await db.query('select public.fn_setor_excluir($1)', [setor]);
    return { codigo: null, mensagem: null };
  } catch (e) {
    const erro = e as { code?: string; message?: string };
    return { codigo: erro.code ?? 'desconhecido', mensagem: erro.message ?? '' };
  }
}

async function existe(setor: string): Promise<boolean> {
  const r = await db.query<{ n: number }>('select count(*)::int n from public.setores where id = $1', [setor]);
  return r.rows[0].n === 1;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create function public.fn_can_access_empresa(id uuid) returns boolean language sql
      as $$ select id = '${EMPRESA}'::uuid $$;
    create function public.fn_user_tem(k text) returns boolean language sql
      as $$ select k <> coalesce(current_setting('test.negada', true), '') $$;

    create table public.empresas (id uuid primary key);
    create table public.setores (id uuid primary key, empresa_id uuid not null references public.empresas(id), nome text);
    create table public.equipes (id uuid primary key default gen_random_uuid(),
      setor_id uuid references public.setores(id) on delete cascade);
    create table public.perfis (id uuid primary key default gen_random_uuid(),
      setor_id uuid references public.setores(id) on delete set null, arquivado boolean);
    create table public.acordos (id uuid primary key default gen_random_uuid(),
      setor_id uuid references public.setores(id) on delete set null);
    create table public.comissao_config (id uuid primary key default gen_random_uuid(),
      setor_id uuid not null references public.setores(id) on delete cascade);
    create table public.metas (id uuid primary key default gen_random_uuid(),
      tipo text, referencia_id uuid, empresa_id uuid);
  `);
  await db.exec(MIGRATION);
});

beforeEach(async () => {
  await db.exec(`
    select set_config('test.negada', '', false);
    delete from public.metas; delete from public.comissao_config; delete from public.acordos;
    delete from public.perfis; delete from public.equipes; delete from public.setores; delete from public.empresas;
    insert into public.empresas values ('${EMPRESA}'), ('${OUTRA}');
    insert into public.setores values
      ('${ZERADO}', '${EMPRESA}', 'zerado'),
      ('${COM_EQUIPE}', '${EMPRESA}', 'com equipe'),
      ('${COM_ARQUIVADO}', '${EMPRESA}', 'com arquivado'),
      ('${COM_ACORDO}', '${EMPRESA}', 'com acordo'),
      ('${DE_OUTRA}', '${OUTRA}', 'de outra empresa');
    insert into public.equipes (setor_id) values ('${COM_EQUIPE}');
    insert into public.perfis (setor_id, arquivado) values ('${COM_EQUIPE}', false), ('${COM_ARQUIVADO}', true);
    insert into public.acordos (setor_id) values ('${COM_ACORDO}'), ('${COM_ACORDO}');
    insert into public.comissao_config (setor_id) values ('${ZERADO}');
    insert into public.metas (tipo, referencia_id, empresa_id) values
      ('setor', '${ZERADO}', '${EMPRESA}'), ('setor', '${COM_ACORDO}', '${EMPRESA}');
  `);
});

afterAll(async () => { await db.close(); });

describe('fn_setor_impedimentos_exclusao', () => {
  it('setor zerado não tem impedimento — a configuração dele não conta', async () => {
    expect(await impedimentos(ZERADO)).toEqual([]);
  });

  it('as duas regras do pedido: equipe e usuário', async () => {
    expect(await impedimentos(COM_EQUIPE)).toEqual([
      { motivo: 'equipe criada', quantidade: 1 },
      { motivo: 'usuário no setor', quantidade: 1 },
    ]);
  });

  it('o desligado arquivado também impede, com motivo próprio', async () => {
    expect(await impedimentos(COM_ARQUIVADO)).toEqual([
      { motivo: 'desligado arquivado com vínculo', quantidade: 1 },
    ]);
  });

  it('o histórico é descoberto no catálogo, sem lista escrita à mão', async () => {
    expect(await impedimentos(COM_ACORDO)).toEqual([{ motivo: 'acordos', quantidade: 2 }]);
  });

  it('fora da empresa, ou sem ver_setores, recusa', async () => {
    await expect(impedimentos(DE_OUTRA)).rejects.toMatchObject({ code: '42501' });
    await db.exec(`select set_config('test.negada', 'ver_setores', false)`);
    await expect(impedimentos(ZERADO)).rejects.toMatchObject({ code: '42501' });
  });
});

describe('fn_setor_excluir', () => {
  it('remove o zerado, com a configuração e as metas dele — e só as dele', async () => {
    expect(await excluir(ZERADO)).toEqual({ codigo: null, mensagem: null });
    expect(await existe(ZERADO)).toBe(false);
    const cfg = await db.query<{ n: number }>('select count(*)::int n from public.comissao_config');
    expect(cfg.rows[0].n).toBe(0);
    const metas = await db.query<{ referencia_id: string }>('select referencia_id from public.metas');
    expect(metas.rows.map(m => m.referencia_id)).toEqual([COM_ACORDO]);
  });

  it('recusa com 23503 e diz o que tem, sem apagar nada', async () => {
    const r = await excluir(COM_EQUIPE);
    expect(r.codigo).toBe('23503');
    expect(r.mensagem).toContain('1 equipe criada');
    expect(r.mensagem).toContain('1 usuário no setor');
    expect(await existe(COM_EQUIPE)).toBe(true);

    const acordo = await excluir(COM_ACORDO);
    expect(acordo.codigo).toBe('23503');
    // O SET NULL não chegou a rodar: os acordos continuam no setor.
    const r2 = await db.query<{ n: number }>(`select count(*)::int n from public.acordos where setor_id = '${COM_ACORDO}'`);
    expect(r2.rows[0].n).toBe(2);
  });

  it('sem setores_criar_editar, recusa com 42501 mesmo zerado', async () => {
    await db.exec(`select set_config('test.negada', 'setores_criar_editar', false)`);
    expect((await excluir(ZERADO)).codigo).toBe('42501');
    expect(await existe(ZERADO)).toBe(true);
  });

  it('de outra empresa, recusa com 42501', async () => {
    expect((await excluir(DE_OUTRA)).codigo).toBe('42501');
    expect(await existe(DE_OUTRA)).toBe(true);
  });

  it('anon não executa nenhuma das duas', async () => {
    const r = await db.query<{ n: number }>(`
      select count(*)::int n from pg_proc p, aclexplode(p.proacl) x
       where p.proname in ('fn_setor_excluir', 'fn_setor_impedimentos_exclusao')
         and x.grantee = 'anon'::regrole`);
    expect(r.rows[0].n).toBe(0);
  });
});

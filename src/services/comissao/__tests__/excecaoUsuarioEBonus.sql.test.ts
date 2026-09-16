// @vitest-environment node
/**
 * excecaoUsuarioEBonus.sql.test.ts — a migration 20260916120000 rodando num
 * Postgres de verdade (PGlite), por cima da 20260911190000.
 *
 * `plpgsql` não valida o corpo na criação: a RPC aplica e o erro espera o clique
 * de alguém. Aqui as RPCs EXECUTAM, sobre um schema mínimo com dados de
 * setembro já configurados — o caso de produção.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const EMPRESA = '00000000-0000-4000-8000-000000000001';
const SETOR   = '00000000-0000-4000-8000-0000000000a1';
const OUTRO   = '00000000-0000-4000-8000-0000000000a2';
const EQUIPE  = '00000000-0000-4000-8000-0000000000b1';
const ANA     = '00000000-0000-4000-8000-0000000000c1';
const BRUNO   = '00000000-0000-4000-8000-0000000000c2';
const CARLA   = '00000000-0000-4000-8000-0000000000c3';
const DE_FORA = '00000000-0000-4000-8000-0000000000c9';

const MIGRATIONS = resolve(__dirname, '../../../../supabase/migrations');
const ORIGINAL = readFileSync(resolve(MIGRATIONS, '20260911190000_comissao_por_meta.sql'), 'utf8');
const NOVA = readFileSync(resolve(MIGRATIONS, '20260916120000_comissao_excecao_usuario_e_bonus.sql'), 'utf8');

let db: PGlite;

async function rpc<T = unknown>(sql: string, params: unknown[] = []): Promise<T> {
  const r = await db.query<{ v: T }>(`select ${sql} as v`, params);
  return r.rows[0].v;
}

async function erro(sql: string, params: unknown[] = []): Promise<{ code: string; message: string }> {
  try {
    await db.query(`select ${sql}`, params);
  } catch (e) {
    const x = e as { code?: string; message?: string };
    return { code: x.code ?? '?', message: x.message ?? '' };
  }
  throw new Error(`esperava erro em: ${sql}`);
}

function config(over: Record<string, unknown> = {}) {
  return JSON.stringify({
    empresa_id: EMPRESA, setor_id: SETOR, ano: 2026, mes: 9,
    faixas: [{ ordem: 1, pct: 1.75 }, { ordem: 2, pct: 2.11 }],
    ...over,
  });
}

function bonus(over: Record<string, unknown> = {}) {
  return JSON.stringify({
    empresa_id: EMPRESA, setor_id: SETOR, ano: 2026, mes: 9,
    tipo: 'meta', meta_ordem: 4, valor_bonus: 200, usuarios: [ANA],
    ...over,
  });
}

async function contar(sql: string): Promise<number> {
  const r = await db.query<{ n: number }>(`select count(*)::int n from ${sql}`);
  return r.rows[0].n;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
    create publication supabase_realtime;
    create function public.fn_can_access_empresa(id uuid) returns boolean language sql
      as $$ select id = '${EMPRESA}'::uuid $$;
    create function public.fn_user_tem(k text) returns boolean language sql
      as $$ select k <> coalesce(current_setting('test.negada', true), '') $$;
    create function public.fn_metas_esta_validada(e uuid, s uuid, m integer, a integer) returns boolean
      language sql as $$ select coalesce(current_setting('test.validada', true), '') = 'sim' $$;
    create function public.fn_permissoes_catalogo()
      returns table(chave text, tenants text[], padrao text[], explicita boolean)
      language sql immutable as $$ select 'ver_metas'::text, null::text[], null::text[], false $$;
    create table public.cargos_permissoes (cargo text, permissoes jsonb not null default '{}', atualizado_em timestamptz);

    create table public.empresas (id uuid primary key);
    create table public.setores (id uuid primary key, empresa_id uuid not null references public.empresas(id));
    create table public.equipes (id uuid primary key, setor_id uuid references public.setores(id));
    create table public.perfis (id uuid primary key, nome text, empresa_id uuid, setor_id uuid);

    insert into public.empresas values ('${EMPRESA}');
    insert into public.setores values ('${SETOR}', '${EMPRESA}'), ('${OUTRO}', '${EMPRESA}');
    insert into public.equipes values ('${EQUIPE}', '${SETOR}');
    insert into public.perfis values
      ('${ANA}', 'Ana', '${EMPRESA}', '${SETOR}'),
      ('${BRUNO}', 'Bruno', '${EMPRESA}', '${SETOR}'),
      ('${CARLA}', 'Carla', '${EMPRESA}', '${SETOR}'),
      ('${DE_FORA}', 'De Fora', '${EMPRESA}', '${OUTRO}');
  `);
  await db.exec(ORIGINAL);
  // Setembro já configurado antes da migration nova: padrão e exceção de equipe.
  await db.query('select public.fn_comissao_salvar($1::jsonb)', [config()]);
  await db.query('select public.fn_comissao_salvar($1::jsonb)', [config({ equipe_id: EQUIPE })]);
  await db.exec(NOVA);
});

beforeEach(async () => {
  await db.exec(`
    select set_config('test.negada', '', false);
    select set_config('test.validada', '', false);
    delete from public.comissao_bonus;
    delete from public.comissao_config where grupo_usuarios or mes <> 9;
  `);
});

afterAll(async () => { await db.close(); });

describe('o que já existia continua igual', () => {
  it('padrão e exceção de equipe sobreviveram e salvar de novo atualiza, sem duplicar', async () => {
    expect(await contar(`public.comissao_config where mes = 9 and not grupo_usuarios`)).toBe(2);
    await rpc('public.fn_comissao_salvar($1::jsonb)', [config({ faixas: [{ ordem: 1, pct: 3 }] })]);
    await rpc('public.fn_comissao_salvar($1::jsonb)', [config({ equipe_id: EQUIPE, faixas: [{ ordem: 1, pct: 4 }] })]);
    expect(await contar(`public.comissao_config where mes = 9 and not grupo_usuarios`)).toBe(2);
    const pcts = await db.query<{ pct: string }>(
      `select f.pct::text pct from public.comissao_faixas f join public.comissao_config c on c.id = f.config_id
        where c.mes = 9 and not c.grupo_usuarios order by c.equipe_id nulls first`);
    expect(pcts.rows.map(r => Number(r.pct))).toEqual([3, 4]);
  });

  it('o padrão não sai pela exclusão de exceção', async () => {
    const id = await rpc<string>(
      `(select id from public.comissao_config where mes = 9 and equipe_id is null and not grupo_usuarios)`);
    expect((await erro('public.fn_comissao_excluir_excecao($1)', [id])).code).toBe('22023');
  });
});

describe('exceção por usuário', () => {
  it('cria um grupo com várias pessoas e os percentuais próprios', async () => {
    const id = await rpc<string>('public.fn_comissao_salvar($1::jsonb)', [
      config({ grupo_usuarios: true, usuarios: [ANA, BRUNO], faixas: [{ ordem: 1, pct: 5 }] }),
    ]);
    expect(await contar(`public.comissao_config_usuarios where config_id = '${id}'`)).toBe(2);
    expect(await contar(`public.comissao_config where mes = 9 and equipe_id is null`)).toBe(2);
  });

  it('sem pessoas, com gente de outro setor, ou com a regra do setor: recusa', async () => {
    expect((await erro('public.fn_comissao_salvar($1::jsonb)', [config({ grupo_usuarios: true, usuarios: [] })])).code)
      .toBe('22023');
    expect((await erro('public.fn_comissao_salvar($1::jsonb)', [config({ grupo_usuarios: true, usuarios: [DE_FORA] })])).code)
      .toBe('22023');
    const id = await rpc<string>('public.fn_comissao_salvar($1::jsonb)', [
      config({ grupo_usuarios: true, usuarios: [ANA], regra_setor: 'multiplicador', multiplicador: 2 }),
    ]);
    const regra = await rpc<string>(`(select regra_setor from public.comissao_config where id = '${id}')`);
    expect(regra).toBe('nenhuma');
  });

  it('a pessoa fica em uma exceção só, e o erro diz quem', async () => {
    await rpc('public.fn_comissao_salvar($1::jsonb)', [config({ grupo_usuarios: true, usuarios: [ANA] })]);
    const e = await erro('public.fn_comissao_salvar($1::jsonb)', [config({ grupo_usuarios: true, usuarios: [ANA, BRUNO] })]);
    expect(e.code).toBe('23505');
    expect(e.message).toContain('Ana');
    // Nada da tentativa ficou.
    expect(await contar(`public.comissao_config where grupo_usuarios`)).toBe(1);
  });

  it('editar pelo id troca percentuais e pessoas; excluir devolve ao padrão', async () => {
    const id = await rpc<string>('public.fn_comissao_salvar($1::jsonb)', [
      config({ grupo_usuarios: true, usuarios: [ANA, BRUNO] }),
    ]);
    await rpc('public.fn_comissao_salvar($1::jsonb)', [
      config({ id, grupo_usuarios: true, usuarios: [BRUNO, CARLA], faixas: [{ ordem: 1, pct: 9 }] }),
    ]);
    const pessoas = await db.query<{ usuario_id: string }>(
      `select usuario_id from public.comissao_config_usuarios where config_id = $1 order by usuario_id`, [id]);
    expect(pessoas.rows.map(p => p.usuario_id)).toEqual([BRUNO, CARLA]);
    // Só os percentuais, sem mexer nas pessoas.
    await rpc('public.fn_comissao_salvar($1::jsonb)', [config({ id, grupo_usuarios: true, faixas: [{ ordem: 1, pct: 8 }] })]);
    expect(await contar(`public.comissao_config_usuarios where config_id = '${id}'`)).toBe(2);

    await rpc('public.fn_comissao_excluir_excecao($1)', [id]);
    expect(await contar(`public.comissao_config_usuarios`)).toBe(0);
  });

  it('respeita a trava da meta do setor', async () => {
    await db.exec(`select set_config('test.validada', 'sim', false)`);
    expect((await erro('public.fn_comissao_salvar($1::jsonb)', [config({ grupo_usuarios: true, usuarios: [ANA] })])).code)
      .toBe('42501');
  });

  it('importar o mês anterior copia o grupo, só com quem continua no setor', async () => {
    await rpc('public.fn_comissao_salvar($1::jsonb)', [config({ grupo_usuarios: true, usuarios: [ANA, BRUNO] })]);
    await db.exec(`update public.perfis set setor_id = '${OUTRO}' where id = '${BRUNO}'`);
    try {
      const total = await rpc<number>('public.fn_comissao_importar_mes_anterior($1, $2, 2026, 10, false)', [EMPRESA, SETOR]);
      expect(total).toBe(3);
      const pessoas = await db.query<{ usuario_id: string }>(
        `select cu.usuario_id from public.comissao_config_usuarios cu where cu.mes = 10`);
      expect(pessoas.rows.map(p => p.usuario_id)).toEqual([ANA]);
    } finally {
      await db.exec(`update public.perfis set setor_id = '${SETOR}' where id = '${BRUNO}'`);
    }
  });
});

describe('bônus', () => {
  it('os três tipos gravam só os campos do tipo, para várias pessoas', async () => {
    const meta = await rpc<string>('public.fn_comissao_bonus_salvar($1::jsonb)', [bonus({ usuarios: [ANA, BRUNO], valor_alvo: 999 })]);
    const valor = await rpc<string>('public.fn_comissao_bonus_salvar($1::jsonb)', [
      bonus({ tipo: 'valor', meta_ordem: null, valor_alvo: 200_000 }),
    ]);
    const especial = await rpc<string>('public.fn_comissao_bonus_salvar($1::jsonb)', [
      bonus({ tipo: 'especial', valor_alvo: 20_000, periodo_inicio: '2026-09-07', periodo_fim: '2026-09-11' }),
    ]);
    const linhas = await db.query<{ id: string; meta_ordem: number | null; valor_alvo: string | null; periodo_fim: string | null }>(
      `select id, meta_ordem, valor_alvo::text, periodo_fim::text from public.comissao_bonus`);
    const de = (id: string) => linhas.rows.find(l => l.id === id);
    expect(de(meta)).toMatchObject({ meta_ordem: 4, valor_alvo: null, periodo_fim: null });
    expect(de(valor)).toMatchObject({ meta_ordem: null, valor_alvo: '200000.00' });
    expect(de(especial)).toMatchObject({ meta_ordem: null, periodo_fim: '2026-09-11' });
    expect(await contar(`public.comissao_bonus_usuarios where bonus_id = '${meta}'`)).toBe(2);
  });

  it('recusa período fora do mês, fim antes do início, sem pessoa e gente de fora', async () => {
    const casos = [
      bonus({ tipo: 'especial', valor_alvo: 1, periodo_inicio: '2026-08-30', periodo_fim: '2026-09-03' }),
      bonus({ tipo: 'especial', valor_alvo: 1, periodo_inicio: '2026-09-10', periodo_fim: '2026-09-03' }),
      bonus({ usuarios: [] }),
      bonus({ usuarios: [DE_FORA] }),
      bonus({ valor_bonus: 0 }),
      bonus({ meta_ordem: null }),
    ];
    for (const c of casos) {
      expect((await erro('public.fn_comissao_bonus_salvar($1::jsonb)', [c])).code, c).toBe('22023');
    }
    expect(await contar('public.comissao_bonus')).toBe(0);
  });

  it('editar troca tipo e pessoas; excluir apaga; a trava e a chave valem', async () => {
    const id = await rpc<string>('public.fn_comissao_bonus_salvar($1::jsonb)', [bonus({ usuarios: [ANA, BRUNO] })]);
    await rpc('public.fn_comissao_bonus_salvar($1::jsonb)', [
      bonus({ id, tipo: 'valor', valor_alvo: 150_000, usuarios: [CARLA] }),
    ]);
    const b = await db.query<{ tipo: string; meta_ordem: number | null }>(
      `select tipo, meta_ordem from public.comissao_bonus where id = $1`, [id]);
    expect(b.rows[0]).toEqual({ tipo: 'valor', meta_ordem: null });
    const pessoas = await db.query<{ usuario_id: string }>(
      `select usuario_id from public.comissao_bonus_usuarios where bonus_id = $1`, [id]);
    expect(pessoas.rows.map(p => p.usuario_id)).toEqual([CARLA]);

    await db.exec(`select set_config('test.validada', 'sim', false)`);
    expect((await erro('public.fn_comissao_bonus_excluir($1)', [id])).code).toBe('42501');
    await db.exec(`select set_config('test.validada', '', false)`);

    await db.exec(`select set_config('test.negada', 'metas_comissao_editar', false)`);
    expect((await erro('public.fn_comissao_bonus_salvar($1::jsonb)', [bonus()])).code).toBe('42501');
    await db.exec(`select set_config('test.negada', '', false)`);

    await rpc('public.fn_comissao_bonus_excluir($1)', [id]);
    expect(await contar('public.comissao_bonus_usuarios')).toBe(0);
  });

  it('importar o mês anterior não copia bônus', async () => {
    await rpc('public.fn_comissao_bonus_salvar($1::jsonb)', [bonus()]);
    await rpc('public.fn_comissao_importar_mes_anterior($1, $2, 2026, 10, false)', [EMPRESA, SETOR]);
    expect(await contar('public.comissao_bonus where mes = 10')).toBe(0);
  });

  it('anon não executa as RPCs novas', async () => {
    const r = await db.query<{ n: number }>(`
      select count(*)::int n from pg_proc p, aclexplode(p.proacl) x
       where p.proname in ('fn_comissao_bonus_salvar', 'fn_comissao_bonus_excluir')
         and x.grantee = 'anon'::regrole`);
    expect(r.rows[0].n).toBe(0);
  });
});

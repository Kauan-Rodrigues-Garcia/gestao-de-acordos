// @vitest-environment node
/**
 * equipeOndeAPessoaEsta.sql.test.ts — a migration 20260929120000 num Postgres
 * de verdade (PGlite).
 *
 * A regra de 29/09/2026: a pessoa está nas equipes em que a tela de Equipes a
 * mostra — membro (`perfis.equipe_id`, exceto cargo `lider`), líder
 * (`equipe_lideres`) e clone — e o recebimento conta em TODAS. O que se prova
 * aqui é que o banco responde isso em cada função que recorta por equipe.
 *
 * O elenco reproduz os casos de setembro/2026 na BookPlay:
 *
 *   L1  lider, lidera A (Play 4) e C (Play 5), resíduo em B    → Brunno/Maria
 *   L3  lider, não lidera nada, resíduo em A                   → Tamires
 *   V1  lider, lidera A — quem olha com escopo de equipe
 *   O1  operador, membro de A
 *   O2  operador, membro de C, clonado em B
 *   E1  elite, membro de B e líder de C
 *   W2  operador do Play 5 — quem olha com escopo de setor
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const MIGRATION = readFileSync(
  resolve(__dirname, '../../../../supabase/migrations/20260929120000_equipe_e_onde_a_pessoa_esta.sql'),
  'utf8',
);

const E  = '00000000-0000-4000-8000-00000000e001';
const S1 = '00000000-0000-4000-8000-0000000005a1'; // Play 4
const S2 = '00000000-0000-4000-8000-0000000005a2'; // Play 5
const A  = '00000000-0000-4000-8000-00000000000a';
const B  = '00000000-0000-4000-8000-00000000000b';
const C  = '00000000-0000-4000-8000-00000000000c';
const L1 = '00000000-0000-4000-8000-000000000011';
const L3 = '00000000-0000-4000-8000-000000000013';
const V1 = '00000000-0000-4000-8000-000000000021';
const O1 = '00000000-0000-4000-8000-000000000031';
const O2 = '00000000-0000-4000-8000-000000000032';
const E1 = '00000000-0000-4000-8000-000000000041';
const W2 = '00000000-0000-4000-8000-000000000051';

let db: PGlite;

async function ids(sql: string, params: unknown[] = []): Promise<string[]> {
  const r = await db.query<{ id: string }>(sql, params);
  return r.rows.map(l => l.id).sort();
}

async function um<T>(sql: string, params: unknown[] = []): Promise<T> {
  const r = await db.query<{ v: T }>(sql, params);
  return r.rows[0]?.v as T;
}

/** Quem olha, com qual escopo e com quais chaves. */
async function comoUsuario(uid: string | null, escopo: number, chaves: string[] = []) {
  await db.exec(`
    select set_config('teste.uid', '${uid ?? ''}', false);
    select set_config('teste.escopo', '${escopo}', false);
    select set_config('teste.chaves', '${chaves.join(',')}', false);
  `);
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('teste.uid', true), '')::uuid $$;

    create table public.setores (
      id uuid primary key, empresa_id uuid, nome text,
      ativo boolean default true, alternativo boolean default false);
    create table public.equipes (id uuid primary key, empresa_id uuid, nome text, setor_id uuid);
    create table public.perfis (
      id uuid primary key, empresa_id uuid, perfil text, equipe_id uuid, setor_id uuid,
      situacao text default 'ativo', nome text, usuario text, email text, foto_url text,
      ativo boolean default true, desligado_em timestamptz);
    create table public.equipe_lideres (
      id serial primary key, empresa_id uuid, equipe_id uuid, lider_id uuid,
      criado_em timestamptz default now(), unique (equipe_id, lider_id));
    create table public.equipe_operadores_clones (
      id serial primary key, empresa_id uuid, equipe_id uuid, operador_id uuid,
      conta_recebimento boolean default true, unique (equipe_id, operador_id));
    create table public.analitico_recebimentos (
      id serial primary key, empresa_id uuid, operador_id uuid, operador_usuario text,
      valor_recebido numeric, total_ho numeric default 0, data_pagamento date,
      setor_id uuid, importado_por_id uuid, forma_pagamento text, forma_detalhe text,
      status_tabulacao text, procedencia text, contribuicao_de_setor_id uuid);
    create table public.composicao_mes (
      empresa_id uuid, mes text, operador_id uuid, equipe_id uuid, equipe_nome text,
      setor_id uuid, situacao text, equipes_clone uuid[], nome text, usuario text,
      email text, cargo text, foto_url text, ativo boolean, desligado_em timestamptz,
      unique (empresa_id, mes, operador_id));
    create table public.composicao_mes_equipe (
      empresa_id uuid, mes text, equipe_id uuid, nome text, setor_id uuid,
      unique (empresa_id, mes, equipe_id));
    create table public.composicao_mes_lider (
      empresa_id uuid, mes text, equipe_id uuid, lider_id uuid, ordem integer,
      unique (empresa_id, mes, equipe_id, lider_id));
    create table public.composicao_mes_setor (
      empresa_id uuid, mes text, setor_id uuid, nome text, ativo boolean, alternativo boolean,
      unique (empresa_id, mes, setor_id));

    -- As primitivas de permissão, controladas pelo teste.
    create function public.fn_can_access_empresa(uuid) returns boolean language sql stable as $$ select true $$;
    create function public.fn_user_tem(p text) returns boolean language sql stable as
      $$ select p = any(string_to_array(current_setting('teste.chaves', true), ',')) $$;
    create function public.fn_user_escopo(text) returns integer language sql stable as
      $$ select current_setting('teste.escopo', true)::integer $$;
    create function public.fn_user_escopo_analitico() returns integer language sql stable as
      $$ select current_setting('teste.escopo', true)::integer $$;
    create function public.fn_user_is_super_admin() returns boolean language sql stable as $$ select false $$;
    create function public.fn_user_has_any_role(text[]) returns boolean language sql stable as $$ select true $$;
    create function public.fn_log_registrar(
      p_acao text, p_categoria text, p_severidade text, p_descricao text, p_empresa_id uuid,
      p_tabela text, p_alvo_tipo text, p_alvo_rotulo text, p_detalhes jsonb, p_origem text)
      returns void language sql as $$ select $$;
    -- Mesma definição de 20260903290000.
    create function public.fn_setores_do_operador(p uuid) returns setof uuid language sql stable as $$
      select setor_id from public.perfis where id = p and setor_id is not null
      union select e.setor_id from public.equipe_operadores_clones c join public.equipes e on e.id = c.equipe_id where c.operador_id = p
      union select e.setor_id from public.equipe_lideres el join public.equipes e on e.id = el.equipe_id where el.lider_id = p
    $$;
  `);

  await db.exec(`
    insert into public.setores (id, empresa_id, nome) values
      ('${S1}', '${E}', 'Play 4'), ('${S2}', '${E}', 'Play 5');
    insert into public.equipes (id, empresa_id, nome, setor_id) values
      ('${A}', '${E}', 'A', '${S1}'), ('${B}', '${E}', 'B', '${S1}'), ('${C}', '${E}', 'C', '${S2}');
    insert into public.perfis (id, empresa_id, perfil, equipe_id, setor_id, nome) values
      ('${L1}', '${E}', 'lider',    '${B}', '${S1}', 'L1'),
      ('${L3}', '${E}', 'lider',    '${A}', '${S1}', 'L3'),
      ('${V1}', '${E}', 'lider',    null,   '${S1}', 'V1'),
      ('${O1}', '${E}', 'operador', '${A}', '${S1}', 'O1'),
      ('${O2}', '${E}', 'operador', '${C}', '${S2}', 'O2'),
      ('${E1}', '${E}', 'elite',    '${B}', '${S1}', 'E1'),
      ('${W2}', '${E}', 'operador', null,   '${S2}', 'W2');
    insert into public.equipe_lideres (empresa_id, equipe_id, lider_id, criado_em) values
      ('${E}', '${A}', '${L1}', '2026-08-01'),
      ('${E}', '${C}', '${L1}', '2026-09-01'),
      ('${E}', '${A}', '${V1}', '2026-08-02'),
      ('${E}', '${C}', '${E1}', '2026-08-03');
    insert into public.equipe_operadores_clones (empresa_id, equipe_id, operador_id) values
      ('${E}', '${B}', '${O2}');
    insert into public.analitico_recebimentos (empresa_id, operador_id, operador_usuario, valor_recebido, data_pagamento) values
      ('${E}', '${L1}', 'l1', 4000, '2026-09-10'),
      ('${E}', '${L3}', 'l3',  100, '2026-09-10'),
      ('${E}', '${O1}', 'o1', 1000, '2026-09-10'),
      ('${E}', '${O2}', 'o2',  500, '2026-09-10'),
      ('${E}', '${E1}', 'e1',  300, '2026-09-10');
  `);

  await db.exec(MIGRATION);
});

afterAll(async () => { await db?.close(); });

describe('fn_equipes_do_operador — em que equipes a pessoa está', () => {
  const equipes = (p: string) => ids('select equipe_id as id from public.fn_equipes_do_operador($1)', [p]);

  it('líder está em TODAS as que lidera, e o resíduo não conta', async () => {
    expect(await equipes(L1)).toEqual([A, C].sort());
  });
  it('líder que não lidera nada não está em equipe nenhuma', async () => {
    expect(await equipes(L3)).toEqual([]);
  });
  it('operador clonado está na dele e na clonada', async () => {
    expect(await equipes(O2)).toEqual([B, C].sort());
  });
  it('membro que também lidera está nas duas', async () => {
    expect(await equipes(E1)).toEqual([B, C].sort());
  });
});

describe('fn_pessoas_das_equipes — quem está nestas equipes', () => {
  it('membros, líderes e clones; nunca o resíduo do líder', async () => {
    expect(await ids('select public.fn_pessoas_das_equipes($1::uuid[]) as id', [[A]]))
      .toEqual([L1, O1, V1].sort());
    expect(await ids('select public.fn_pessoas_das_equipes($1::uuid[]) as id', [[B]]))
      .toEqual([E1, O2].sort());
  });
});

describe('fn_equipes_de_alcance e fn_equipe_principal', () => {
  it('alcance: líder nunca responde pelo resíduo', async () => {
    expect(await ids('select public.fn_equipes_de_alcance($1) as id', [L3])).toEqual([]);
    expect(await ids('select public.fn_equipes_de_alcance($1) as id', [E1])).toEqual([B, C].sort());
  });
  it('principal: a única; várias → a de membro; líder de várias → nenhuma', async () => {
    const principal = (p: string) => um<string | null>('select public.fn_equipe_principal($1) as v', [p]);
    expect(await principal(V1)).toBe(A);
    expect(await principal(O1)).toBe(A);
    expect(await principal(E1)).toBe(B);
    expect(await principal(L1)).toBeNull();
    expect(await principal(L3)).toBeNull();
  });
});

describe('fn_analitico_resumo_por_operador — lista e cards do analítico', () => {
  const CHAVES = ['ver_analitico', 'analitico_sub_analitico', 'analitico_sub_ranking'];
  const quem = () => ids(`select operador_id as id from public.fn_analitico_resumo_por_operador($1, '2026-09')`, [E]);

  it('escopo de equipe: o líder da equipe entra na lista de quem a lidera junto', async () => {
    await comoUsuario(V1, 1, CHAVES);
    // L1 não tem `perfis.equipe_id` em A — antes ficava de fora.
    expect(await quem()).toEqual([L1, O1].sort());
  });

  it('escopo de setor: o líder de uma equipe do setor entra mesmo sendo de outro setor', async () => {
    await comoUsuario(W2, 2, CHAVES);
    // L1 e E1 são do Play 4 pelo perfil, mas lideram C, do Play 5.
    expect(await quem()).toEqual([E1, L1, O2].sort());
  });

  it('escopo de todos os setores: todo mundo', async () => {
    await comoUsuario(W2, 3, CHAVES);
    expect(await quem()).toEqual([E1, L1, L3, O1, O2].sort());
  });

  it('a soma não muda: o dinheiro de cada pessoa aparece uma vez só', async () => {
    await comoUsuario(W2, 3, CHAVES);
    expect(Number(await um(
      `select sum(total_recebido) as v from public.fn_analitico_resumo_por_operador($1, '2026-09')`, [E],
    ))).toBe(5900);
  });
});

describe('fn_analitico_dashboard_mes_json — «só a minha»', () => {
  it('inclui o líder da equipe e quem é clone nela', async () => {
    await comoUsuario(V1, 1, []);
    const linhas = await um<{ operador_id: string }[]>(
      `select public.fn_analitico_dashboard_mes_json($1, '2026-09') as v`, [E]);
    expect(linhas.map(l => l.operador_id).sort()).toEqual([L1, O1].sort());
  });
});

describe('fn_operador_no_meu_alcance_de_equipe — acordos, «só a minha»', () => {
  it('pertencimento de verdade, sem resíduo', async () => {
    await comoUsuario(V1, 1, []);
    const alcanca = (p: string) => um<boolean>('select public.fn_operador_no_meu_alcance_de_equipe($1) as v', [p]);
    expect(await alcanca(L1)).toBe(true);
    expect(await alcanca(O1)).toBe(true);
    expect(await alcanca(L3)).toBe(false);
    expect(await alcanca(E1)).toBe(false);
  });
});

describe('fn_composicao_mes_snapshot — o retrato guarda todas as equipes', () => {
  it('rótulo na primeira, as demais em equipes_clone; resíduo de líder some', async () => {
    await comoUsuario(null, 3, []);
    await db.query(`select public.fn_composicao_mes_snapshot($1, '2099-01')`, [E]);
    const r = await db.query<{ operador_id: string; equipe_id: string | null; equipes_clone: string[] }>(
      `select operador_id, equipe_id, equipes_clone from public.composicao_mes where mes = '2099-01'`);
    const de = (p: string) => r.rows.find(l => l.operador_id === p)!;

    expect(de(L1).equipe_id).toBe(A);                 // a primeira que lidera
    expect(de(L1).equipes_clone).toEqual([C]);        // e a outra, somando
    expect(de(L3).equipe_id).toBeNull();              // Tamires: sem equipe
    expect(de(L3).equipes_clone).toEqual([]);
    expect(de(O2).equipe_id).toBe(C);
    expect(de(O2).equipes_clone).toEqual([B]);
    expect(de(E1).equipe_id).toBe(B);
    expect(de(E1).equipes_clone).toEqual([C]);
  });
});

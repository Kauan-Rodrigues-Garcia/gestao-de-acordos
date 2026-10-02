// @vitest-environment node
/**
 * Migrations 20261002160000 (IAs por setor) e 20261002170000 (calendário do
 * mês), rodando num Postgres isolado (PGlite) sobre o esqueleto do Comercial.
 *
 * O que se trava aqui:
 *   1. A aba IAs mostra só as IAs do setor de quem olha; «todos os setores»
 *      mostra todas; sem a chave da aba, nenhuma.
 *   2. Vincular pede `vincular_ias_vendas` e recusa IA ou operador de setor
 *      fora do alcance.
 *   3. O dia útil do banco e o da tela (`ehDiaUtilComercial`) contam igual,
 *      com feriado e sábado — e o placar usa o mesmo calendário.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { diasUteisComercial, ehDiaUtilComercial } from '@/lib/vendasCalendario';

const EMPRESA = '00000000-0000-4000-8000-000000000001';
const PERF    = '00000000-0000-4000-8000-0000000000e1'; // Performance
const BOOK    = '00000000-0000-4000-8000-0000000000e2'; // Vendas BookPlay
const LIDER   = '00000000-0000-4000-8000-0000000000aa'; // líder da Performance
const KEVIN   = '00000000-0000-4000-8000-0000000000b1'; // Performance
const BIA     = '00000000-0000-4000-8000-0000000000b2'; // Vendas BookPlay
const IA_PERF = '00000000-0000-4000-8000-0000000000c1';
const IA_BOOK = '00000000-0000-4000-8000-0000000000c2';

let db: PGlite;

async function q<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await db.query<T>(sql, params)).rows;
}

/** Permissões e escopo de quem está logado, como `fn_user_tem` e `fn_user_escopo` responderiam. */
async function comoQuem(perms: string[], escopoIas: number) {
  await db.exec(`
    select set_config('test.perms', '${perms.join(',')}', false);
    select set_config('test.escopo', '${escopoIas}', false);
  `);
}

async function iasDaAba(): Promise<string[]> {
  const linhas = await q<{ ia_id: string }>('select ia_id from public.fn_vendas_ias_da_aba($1)', [EMPRESA]);
  return [...new Set(linhas.map(l => l.ia_id))].sort();
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role authenticated; create role anon;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;

    create table public.empresas (id uuid primary key, produto text);
    create table public.setores (id uuid primary key, nome text, empresa_id uuid);
    create table public.equipes (id uuid primary key, nome text, setor_id uuid);
    create table public.perfis (
      id uuid primary key, empresa_id uuid, nome text, usuario text, situacao text default 'ativo',
      setor_id uuid, equipe_id uuid, robo boolean default false, arquivado boolean default false,
      foto_url text, perfil text default 'operador');
    create table public.equipe_lideres (equipe_id uuid, lider_id uuid);
    create table public.ausencias (operador_id uuid, tipo text, inicio date, fim date, meio_periodo boolean default false);
    create table public.ausencias_tipos (tipo text, abate_meta boolean);

    create function public.fn_can_access_empresa(e uuid) returns boolean language sql as $$ select true $$;
    create function public.fn_empresas_acessiveis() returns uuid[] language sql
      as $$ select coalesce(array_agg(id), '{}') from public.empresas $$;
    create function public.fn_user_is_super_admin() returns boolean language sql as $$ select false $$;
    create function public.fn_user_tem(chave text) returns boolean language sql
      as $$ select chave = any(string_to_array(coalesce(current_setting('test.perms', true), ''), ',')) $$;
    create function public.fn_user_escopo(aba text) returns integer language sql
      as $$ select case when aba = 'ias' then coalesce(nullif(current_setting('test.escopo', true), '')::int, -1) else 3 end $$;
    create function public.fn_setores_do_operador(u uuid) returns setof uuid language sql
      as $$ select setor_id from public.perfis where id = u and setor_id is not null $$;
    create function public.fn_equipes_com_lideranca(u uuid) returns table(equipe_id uuid) language sql
      as $$ select el.equipe_id from public.equipe_lideres el where el.lider_id = u $$;
    create function public.fn_vendas_equipe_que_credita(p uuid) returns uuid language sql
      as $$ select equipe_id from public.perfis where id = p $$;
    create function public.fn_vendas_perfil_do_login(e uuid, login text) returns uuid language sql
      as $$ select id from public.perfis where usuario = login $$;
    create function public.fn_vendas_alcanca(e uuid, p uuid, s uuid, eq uuid) returns boolean language sql
      as $$ select true $$;

    create table public.vendas (
      id uuid primary key default gen_random_uuid(), empresa_id uuid, operador_id uuid,
      setor_id uuid, equipe_id uuid, data_venda date, data_confirmacao date,
      valor_total numeric, conta_na_meta boolean default true, valor_na_meta numeric);
    alter table public.vendas enable row level security;
    create table public.vendas_lotes (id uuid primary key, empresa_id uuid, mes date, origem text, estado text);
    create table public.vendas_relatorio (
      lote_id uuid, empresa_id uuid, nr_documento text, valor_total numeric, conta_na_meta boolean,
      valor_na_meta numeric, data_venda date, data_confirmacao date, codigo_franquia text, login_vendedor text);
    create table public.vendas_franquias (empresa_id uuid, codigo text, estado text, setor_id uuid);

    insert into public.empresas values ('${EMPRESA}', 'comercial');
    insert into public.setores values ('${PERF}', 'Performance', '${EMPRESA}'), ('${BOOK}', 'Vendas BookPlay', '${EMPRESA}');
    insert into public.perfis (id, empresa_id, nome, usuario, setor_id, robo, perfil) values
      ('${LIDER}',   '${EMPRESA}', 'Líder',   'lider',   '${PERF}', false, 'lider'),
      ('${KEVIN}',   '${EMPRESA}', 'Kevin',   'kevin',   '${PERF}', false, 'operador'),
      ('${BIA}',     '${EMPRESA}', 'Bia',     'bia',     '${BOOK}', false, 'operador'),
      ('${IA_PERF}', '${EMPRESA}', 'IA Perf', 'ia_perf', '${PERF}', true,  'operador'),
      ('${IA_BOOK}', '${EMPRESA}', 'IA Book', 'ia_book', '${BOOK}', true,  'operador');
    insert into public.ausencias_tipos values ('atestado', true);
    select set_config('test.uid', '${LIDER}', false);
    select set_config('test.perms', 'usuarios_editar_cargo', false);
  `);
  await db.exec(readFileSync('supabase/migrations/20261001150000_vendas_ia_vinculos.sql', 'utf8'));
  await db.exec(readFileSync('supabase/migrations/20261002160000_vendas_ias_por_setor.sql', 'utf8'));
  await db.exec(readFileSync('supabase/migrations/20261002170000_vendas_calendario_do_mes.sql', 'utf8'));
}, 30000);

afterAll(async () => { await db?.close(); });

beforeEach(async () => {
  await db.exec(`
    delete from public.vendas_ia_vinculos; delete from public.vendas_ia_vinculos_historico;
    delete from public.vendas_calendario_mes; delete from public.ausencias;
    select set_config('test.uid', '${LIDER}', false);
  `);
});

describe('fn_vendas_ias_da_aba — cada setor vê as suas', () => {
  it('com o escopo do setor, a Performance não vê a IA de Vendas BookPlay', async () => {
    await comoQuem(['ver_ias_vendas'], 2);
    expect(await iasDaAba()).toEqual([IA_PERF]);
  });

  it('com todos os setores, vê as duas', async () => {
    await comoQuem(['ver_ias_vendas'], 3);
    expect(await iasDaAba()).toEqual([IA_PERF, IA_BOOK].sort());
  });

  it('sem a chave da aba, nenhuma', async () => {
    await comoQuem([], 3);
    expect(await iasDaAba()).toEqual([]);
  });

  it('sem nível de escopo, nenhuma', async () => {
    await comoQuem(['ver_ias_vendas'], -1);
    expect(await iasDaAba()).toEqual([]);
  });

  it('a lista traz o setor da IA', async () => {
    await comoQuem(['ver_ias_vendas'], 2);
    const [l] = await q<{ setor_id: string; setor_nome: string }>(
      'select setor_id, setor_nome from public.fn_vendas_ias_da_aba($1)', [EMPRESA]);
    expect(l).toEqual({ setor_id: PERF, setor_nome: 'Performance' });
  });
});

describe('fn_vendas_ia_vincular — chave própria e alcance', () => {
  const vincular = (ia: string, op: string | null) =>
    q('select public.fn_vendas_ia_vincular($1, $2, $3::date)', [ia, op, '2026-10-01']);

  it('usuarios_editar_cargo sozinho não vincula mais', async () => {
    await comoQuem(['usuarios_editar_cargo', 'ver_ias_vendas'], 3);
    await expect(vincular(IA_PERF, KEVIN)).rejects.toThrow(/IAs: vincular/);
  });

  it('com vincular_ias_vendas e o setor, vincula a IA do setor a alguém do setor', async () => {
    await comoQuem(['vincular_ias_vendas'], 2);
    await vincular(IA_PERF, KEVIN);
    const r = await q<{ n: number }>('select count(*)::int as n from public.vendas_ia_vinculos');
    expect(r[0].n).toBe(1);
  });

  it('recusa a IA de outro setor', async () => {
    await comoQuem(['vincular_ias_vendas'], 2);
    await expect(vincular(IA_BOOK, KEVIN)).rejects.toThrow(/fora do seu alcance/);
  });

  it('recusa o operador de outro setor', async () => {
    await comoQuem(['vincular_ias_vendas'], 2);
    await expect(vincular(IA_PERF, BIA)).rejects.toThrow(/fora do seu alcance/);
  });

  it('com todos os setores, cruza setor', async () => {
    await comoQuem(['vincular_ias_vendas'], 3);
    await vincular(IA_BOOK, KEVIN);
    const r = await q<{ n: number }>('select count(*)::int as n from public.vendas_ia_vinculos');
    expect(r[0].n).toBe(1);
  });

  it('definir o tipo também respeita o setor', async () => {
    await comoQuem(['vincular_ias_vendas'], 2);
    await expect(q('select public.fn_vendas_ia_definir_tipo($1, null)', [IA_BOOK]))
      .rejects.toThrow(/fora do seu alcance/);
    await q('select public.fn_vendas_ia_definir_tipo($1, null)', [IA_PERF]);
  });
});

describe('calendário do mês — banco e tela contam igual', () => {
  async function uteisSql(ano: number, mes: number): Promise<string[]> {
    const ini = `${ano}-${String(mes).padStart(2, '0')}-01`;
    const linhas = await q<{ d: string }>(
      `select to_char(d, 'YYYY-MM-DD') as d
         from generate_series($1::date, ($1::date + interval '1 month - 1 day')::date, interval '1 day') d
        where public.fn_vendas_dia_util($2, d::date) order by d`, [ini, EMPRESA]);
    return linhas.map(l => l.d);
  }

  async function salvar(feriados: string[], sabado: boolean) {
    await comoQuem(['editar_metas_vendas'], 3);
    await q('select public.fn_vendas_calendario_salvar($1, 2026, 10, $2::date[], $3)', [EMPRESA, feriados, sabado]);
  }

  it('mês sem configuração: segunda a sexta (22 em outubro/2026)', async () => {
    expect((await uteisSql(2026, 10)).length).toBe(22);
    expect(diasUteisComercial(2026, 10)).toBe(22);
  });

  it('feriado e sábado: os dois lados dão os mesmos dias', async () => {
    const cal = { feriados: ['2026-10-12'], sabadoUtil: true };
    await salvar(cal.feriados, cal.sabadoUtil);
    const sql = await uteisSql(2026, 10);
    const ts: string[] = [];
    for (let d = 1; d <= 31; d++) {
      const iso = `2026-10-${String(d).padStart(2, '0')}`;
      if (ehDiaUtilComercial(iso, cal)) ts.push(iso);
    }
    expect(sql).toEqual(ts);
    // 22 de seg-sex − 12/10 (segunda) + 5 sábados = 26.
    expect(sql.length).toBe(26);
  });

  it('feriado fora do mês é ignorado; tudo padrão apaga a linha', async () => {
    await salvar(['2026-11-02', '2026-10-12'], false);
    const [l] = await q<{ f: string[] }>(`select feriados::text[] as f from public.vendas_calendario_mes`);
    expect(l.f).toEqual(['2026-10-12']);
    await salvar([], false);
    const r = await q<{ n: number }>('select count(*)::int as n from public.vendas_calendario_mes');
    expect(r[0].n).toBe(0);
  });

  it('gravar exige a chave de definir a meta', async () => {
    await comoQuem([], 3);
    await expect(q('select public.fn_vendas_calendario_salvar($1, 2026, 10, $2::date[], false)', [EMPRESA, ['2026-10-12']]))
      .rejects.toThrow(/permissão/);
  });

  it('o placar conta o mesmo calendário, inclusive na ausência', async () => {
    await salvar(['2026-10-12'], false);
    // Atestado de 12 a 14/10: 12 é feriado, então só 13 e 14 abatem.
    await db.exec(`insert into public.ausencias values ('${KEVIN}', 'atestado', '2026-10-12', '2026-10-14', false)`);
    const [k] = await q<{ dias_abatidos: string; dias_uteis_do_mes: number }>(
      `select dias_abatidos::text, dias_uteis_do_mes from public.fn_vendas_placar_pessoas($1, '2026-10-01') where id = $2`,
      [EMPRESA, KEVIN]);
    expect(k.dias_uteis_do_mes).toBe(21);
    expect(Number(k.dias_abatidos)).toBe(2);
  });
});

// @vitest-environment node
/**
 * desempenhoEscopo.sql.test.ts — a migration 20260917140000 num Postgres de
 * verdade (PGlite).
 *
 * As três mudanças são de DESEMPENHO: nenhuma resposta pode mudar. Então o
 * teste guarda cópias literais das funções e da view de antes (como estão em
 * produção em 17/09/2026), aplica a migration e compara as duas versões
 * resposta a resposta — escopo de cada aba para cada tipo de usuário, e o
 * conjunto de acordos deduplicados sobre dados sorteados.
 *
 * E confere o que motivou a reescrita da view: sob RLS, a pergunta «é a última
 * parcela?» usa o índice novo em vez de varrer a tabela por linha.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const EMPRESA = '00000000-0000-4000-8000-000000000001';
const OUTRA   = '00000000-0000-4000-8000-000000000002';

const USUARIOS = {
  admin:        '00000000-0000-4000-8000-0000000000a1',
  superAdmin:   '00000000-0000-4000-8000-0000000000a2',
  lider:        '00000000-0000-4000-8000-0000000000a3',
  operador:     '00000000-0000-4000-8000-0000000000a4',
  comExcecao:   '00000000-0000-4000-8000-0000000000a5',
  semMapa:      '00000000-0000-4000-8000-0000000000a6',
  adminExcecao: '00000000-0000-4000-8000-0000000000a7',
  inexistente:  '00000000-0000-4000-8000-0000000000ff',
};

const MIGRATION = readFileSync(
  resolve(__dirname, '../../../supabase/migrations/20260917140000_desempenho_escopo_e_acordos_deduplicados.sql'),
  'utf8',
);

let db: PGlite;

async function comoUsuario<T>(usuarioId: string, sql: string): Promise<T[]> {
  await db.query(`select set_config('request.jwt.claims', $1, false)`,
    [JSON.stringify({ sub: usuarioId, role: 'authenticated' })]);
  return (await db.query<T>(sql)).rows;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid
    $$;

    create table public.perfis (id uuid primary key, perfil text, empresa_id uuid, setor_id uuid);
    create table public.perfis_permissoes (usuario_id uuid, empresa_id uuid, permissoes jsonb not null default '{}',
      unique (empresa_id, usuario_id));
    create table public.cargos_permissoes (empresa_id uuid, cargo text, permissoes jsonb not null default '{}',
      unique (empresa_id, cargo));

    -- O catálogo real é uma cadeia de 25 funções; para a regra basta a forma.
    create function public.fn_permissoes_catalogo()
      returns table(chave text, tenants text[], padrao text[], explicita boolean)
      language sql immutable set search_path to '' as $$
      values ('ver_dashboard', null::text[], array[]::text[], false),
             ('ver_acordos', null, array[]::text[], false),
             ('ver_analitico', null, array[]::text[], false),
             ('ver_rh_gestao', null, array[]::text[], true),
             ('rh_escopo_todos_setores', null, array[]::text[], true),
             ('vendas_escopo_setor', null, array[]::text[], true)
    $$;

    create function public.fn_abas_escopo() returns table(aba text, chave_aba text)
      language sql immutable set search_path to '' as $$
      values ('dashboard', 'ver_dashboard'), ('acordos', 'ver_acordos'), ('lixeira', 'ver_lixeira'),
             ('pix', 'ver_pix_automatico'), ('painel_lider', 'ver_painel_lider'),
             ('painel_diretoria', 'ver_painel_diretoria'), ('analitico', 'ver_analitico'),
             ('usuarios', 'ver_usuarios'), ('rh', 'ver_rh_gestao'), ('chips', 'ver_meus_chips'),
             ('fechamento', 'ver_fechamento'), ('vendas', 'ver_vendas'),
             ('indicacoes', 'ver_indicacoes'), ('acompanhamento', 'ver_acompanhamento')
    $$;

    -- ── Cópias literais de produção (17/09/2026), com sufixo _antes ─────────
    create function public.fn_user_tem(p_chave text) returns boolean
      language sql stable security definer set search_path to '' as $f$
      WITH ctx AS (
        SELECT p.perfil AS cargo, p.empresa_id, p.id AS usuario_id
          FROM public.perfis p WHERE p.id = (SELECT auth.uid())
      ),
      explicita AS (
        SELECT EXISTS (SELECT 1 FROM public.fn_permissoes_catalogo() c
                        WHERE c.chave = p_chave AND c.explicita) AS sim
      ),
      excecao AS (
        SELECT pp.permissoes->>p_chave AS valor FROM public.perfis_permissoes pp
          JOIN ctx ON pp.usuario_id = ctx.usuario_id WHERE pp.permissoes ? p_chave
      ),
      do_cargo AS (
        SELECT cp.permissoes->>p_chave AS valor FROM public.cargos_permissoes cp
          JOIN ctx ON cp.empresa_id = ctx.empresa_id AND cp.cargo = ctx.cargo
         WHERE cp.permissoes ? p_chave
      )
      SELECT CASE
        WHEN (SELECT cargo FROM ctx) IN ('administrador', 'super_admin')
             AND NOT (SELECT sim FROM explicita) THEN TRUE
        WHEN EXISTS (SELECT 1 FROM excecao) THEN COALESCE((SELECT valor FROM excecao)::BOOLEAN, FALSE)
        WHEN EXISTS (SELECT 1 FROM do_cargo) THEN COALESCE((SELECT valor FROM do_cargo)::BOOLEAN, FALSE)
        ELSE FALSE
      END;
    $f$;

    create function public.fn_user_escopo_antes(p_aba text) returns integer
      language sql stable security definer set search_path to '' as $f$
      WITH meta AS (SELECT a.chave_aba FROM public.fn_abas_escopo() a WHERE a.aba = p_aba),
      niveis(nome, peso) AS (VALUES ('individual', 0), ('equipe', 1), ('setor', 2), ('todos_setores', 3))
      SELECT CASE
        WHEN NOT EXISTS (SELECT 1 FROM meta) THEN -1
        WHEN (SELECT chave_aba FROM meta) IS NOT NULL
             AND NOT public.fn_user_tem((SELECT chave_aba FROM meta)) THEN -1
        ELSE COALESCE((SELECT MAX(n.peso) FROM niveis n
                        WHERE public.fn_user_tem(p_aba || '_escopo_' || n.nome)), -1)
      END;
    $f$;

    create function public.fn_user_escopo_perfis_antes() returns integer
      language sql stable security definer set search_path to '' as $f$
      SELECT COALESCE(MAX(public.fn_user_escopo_antes(a.aba)), -1) FROM public.fn_abas_escopo() a;
    $f$;

    -- As versões de hoje, que a migration substitui.
    create function public.fn_user_escopo(p_aba text) returns integer
      language sql stable security definer set search_path to ''
      as $f$ select public.fn_user_escopo_antes(p_aba) $f$;
    create function public.fn_user_escopo_perfis() returns integer
      language sql stable security definer set search_path to ''
      as $f$ select public.fn_user_escopo_perfis_antes() $f$;

    -- ── Acordos ────────────────────────────────────────────────────────────
    create table public.acordos (
      id uuid primary key default gen_random_uuid(),
      nome_cliente text, nr_cliente text, data_cadastro date, vencimento date, valor numeric,
      tipo text, parcelas integer, whatsapp text, status text, operador_id uuid, observacoes text,
      criado_em timestamptz, atualizado_em timestamptz, setor_id uuid, instituicao text,
      empresa_id uuid, acordo_grupo_id uuid, numero_parcela integer, tipo_receptivo text,
      operador_vinculado_id uuid, tipo_vinculo text, vinculo_operador_id uuid,
      vinculo_operador_nome text, estado_uf text, tag_ids uuid[]
    );
    create index idx_acordos_empresa_vencimento on public.acordos (empresa_id, vencimento);

    create view public.acordos_deduplicados with (security_invoker = true) as
    SELECT DISTINCT ON ((COALESCE(acordo_grupo_id::text, id::text))) id, nome_cliente, nr_cliente,
      data_cadastro, vencimento, valor, tipo, parcelas, whatsapp, status, operador_id, observacoes,
      criado_em, atualizado_em, setor_id, instituicao, empresa_id, acordo_grupo_id, numero_parcela,
      tipo_receptivo, operador_vinculado_id, tipo_vinculo, vinculo_operador_id,
      vinculo_operador_nome, estado_uf, tag_ids
      FROM acordos a
     ORDER BY (COALESCE(acordo_grupo_id::text, id::text)), numero_parcela DESC NULLS LAST, criado_em DESC;

    create function public.fn_mestre_diretoria_setor(uuid, text, uuid, text, integer) returns integer
      language sql set search_path = public set statement_timeout = '20s' as $$ select 1 $$;
  `);

  // Cargos e exceções que exercitam os quatro passos de fn_user_tem.
  await db.exec(`
    insert into public.perfis values
      ('${USUARIOS.admin}', 'administrador', '${EMPRESA}', null),
      ('${USUARIOS.superAdmin}', 'super_admin', '${EMPRESA}', null),
      ('${USUARIOS.lider}', 'lider', '${EMPRESA}', null),
      ('${USUARIOS.operador}', 'operador', '${EMPRESA}', null),
      ('${USUARIOS.comExcecao}', 'lider', '${EMPRESA}', null),
      ('${USUARIOS.semMapa}', 'ouvidoria', '${EMPRESA}', null),
      ('${USUARIOS.adminExcecao}', 'administrador', '${OUTRA}', null);

    insert into public.cargos_permissoes values
      ('${EMPRESA}', 'lider', '{"ver_dashboard": true, "dashboard_escopo_setor": true, "dashboard_escopo_equipe": true,
         "ver_acordos": true, "acordos_escopo_equipe": true, "ver_analitico": false, "analitico_escopo_setor": true,
         "ver_rh_gestao": true, "rh_escopo_individual": true}'),
      ('${EMPRESA}', 'operador', '{"ver_dashboard": true, "dashboard_escopo_individual": true,
         "ver_acordos": "true", "acordos_escopo_individual": true, "ver_vendas": false}'),
      ('${OUTRA}', 'administrador', '{"ver_rh_gestao": false}');

    insert into public.perfis_permissoes values
      ('${USUARIOS.comExcecao}', '${EMPRESA}', '{"ver_analitico": true, "analitico_escopo_todos_setores": true,
         "dashboard_escopo_setor": false}'),
      ('${USUARIOS.adminExcecao}', '${OUTRA}', '{"ver_rh_gestao": true, "rh_escopo_todos_setores": true}');
  `);

  // Grupos de parcelas sorteados, incluindo acordo sem grupo e grupo que usa o
  // id de uma linha como chave.
  await db.exec(`
    select setseed(0.42);
    insert into public.acordos (empresa_id, vencimento, operador_id, setor_id, acordo_grupo_id,
                                numero_parcela, criado_em, status)
    select case when g % 3 = 0 then '${OUTRA}'::uuid else '${EMPRESA}'::uuid end,
           date '2026-09-01' + (random() * 60)::int,
           case when g % 2 = 0 then '${USUARIOS.operador}'::uuid else '${USUARIOS.lider}'::uuid end,
           null,
           case when g % 50 = 0 then null
                else ('00000000-0000-4000-9000-' || lpad((g / 3)::text, 12, '0'))::uuid end,
           case when g % 7 = 0 then null else (g % 4) + 1 end,
           timestamptz '2026-09-01' + (g % 5) * interval '1 hour',
           'verificar_pendente'
      from generate_series(1, 6000) g;
    analyze public.acordos;
  `);
  await db.exec(`create table public.dedup_antes as select id from public.acordos_deduplicados;`);

  await db.exec(MIGRATION);
  // Reaplicar não pode quebrar.
  await db.exec(MIGRATION);
}, 60_000);

afterAll(async () => { await db.close(); });

describe('escopo: a resposta não muda', () => {
  const abas = [
    'dashboard', 'acordos', 'lixeira', 'pix', 'painel_lider', 'painel_diretoria', 'analitico',
    'usuarios', 'rh', 'chips', 'fechamento', 'vendas', 'indicacoes', 'acompanhamento', 'aba_inexistente',
  ];

  for (const [nome, id] of Object.entries(USUARIOS)) {
    it(`fn_user_escopo e fn_user_escopo_perfis iguais às de antes — ${nome}`, async () => {
      for (const aba of abas) {
        const [linha] = await comoUsuario<{ novo: number; antes: number }>(id,
          `select public.fn_user_escopo('${aba}') as novo, public.fn_user_escopo_antes('${aba}') as antes`);
        expect({ aba, valor: linha.novo }).toEqual({ aba, valor: linha.antes });
      }
      const [geral] = await comoUsuario<{ novo: number; antes: number }>(id,
        'select public.fn_user_escopo_perfis() as novo, public.fn_user_escopo_perfis_antes() as antes');
      expect(geral.novo).toBe(geral.antes);
    });
  }

  it('os casos cobrem acesso total, nominal, exceção e ausência', async () => {
    const valores = new Set<number>();
    for (const id of Object.values(USUARIOS)) {
      const r = await comoUsuario<{ e: number }>(id,
        `select e.escopo as e from public.fn_abas_escopo() a, lateral (select public.fn_user_escopo(a.aba) as escopo) e`);
      r.forEach(x => valores.add(x.e));
    }
    expect([...valores].sort()).toEqual([-1, 0, 1, 2, 3]);
  });
});

describe('acordos_deduplicados', () => {
  it('devolve exatamente as mesmas linhas que o DISTINCT ON de antes', async () => {
    const r = await db.query<{ antes: number; depois: number; so_antes: number; so_depois: number }>(`
      select (select count(*)::int from public.dedup_antes) as antes,
             (select count(*)::int from public.acordos_deduplicados) as depois,
             (select count(*)::int from (select id from public.dedup_antes
                                         except select id from public.acordos_deduplicados) x) as so_antes,
             (select count(*)::int from (select id from public.acordos_deduplicados
                                         except select id from public.dedup_antes) x) as so_depois`);
    expect(r.rows[0].antes).toBeGreaterThan(1000);
    expect(r.rows[0]).toMatchObject({ so_antes: 0, so_depois: 0 });
    expect(r.rows[0].depois).toBe(r.rows[0].antes);
  });

  it('sob RLS, a lista por vencimento usa o índice novo na subconsulta', async () => {
    await db.exec(`
      create or replace function public.teste_ve_acordo(p_operador uuid) returns boolean
        language plpgsql stable as $$ begin return p_operador is not null; end $$;
      alter table public.acordos enable row level security;
      drop policy if exists teste_select on public.acordos;
      create policy teste_select on public.acordos for select to authenticated
        using (public.teste_ve_acordo(operador_id));
      grant select on public.acordos, public.acordos_deduplicados to authenticated;
    `);
    await db.exec('set role authenticated');
    try {
      const plano = (await db.query<{ 'QUERY PLAN': string }>(`
        explain select * from public.acordos_deduplicados
         where empresa_id = '${EMPRESA}' order by vencimento limit 60`)).rows
        .map(l => l['QUERY PLAN']).join('\n');
      expect(plano).toContain('idx_acordos_dedup_uuid');
      expect(plano).toContain('idx_acordos_empresa_vencimento');
    } finally {
      await db.exec('reset role');
    }
  });
});

describe('work_mem', () => {
  it('as funções que iam para o disco ganham 32MB e mantêm o que já tinham', async () => {
    const r = await db.query<{ cfg: string[] }>(
      `select proconfig as cfg from pg_proc where proname = 'fn_mestre_diretoria_setor'`);
    expect(r.rows[0].cfg).toEqual(
      expect.arrayContaining(['search_path=public', 'statement_timeout=20s', 'work_mem=32MB']));
  });
});

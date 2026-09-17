// @vitest-environment node
/**
 * mestreDiretoriaDesempenho.sql.test.ts — a migration 20260917160000 num
 * Postgres de verdade (PGlite).
 *
 * A migration é só de DESEMPENHO: nenhuma resposta do Painel Diretoria pode
 * mudar. Então o teste carrega as definições de PRODUÇÃO de 17/09/2026
 * (`fixtures/diretoria59_producao_20260917.sql`, lidas com pg_get_functiondef),
 * roda tudo sobre dados sorteados, aplica a migration e roda de novo:
 *
 *   - as funções reescritas devolvem exatamente o que devolviam;
 *   - `fn_mestre_diretoria_equipes_dos_setores` devolve, setor a setor, o bloco
 *     `equipes` que `fn_mestre_diretoria_setor` devolvia;
 *   - `fn_mestre_conferencia` devolve o resumo e a lista das duas funções que
 *     a aba chamava;
 *   - os dois ajudantes passam a ser embutidos no plano (o motivo do item 1).
 *
 * Os dados têm o que muda número: lote aberto e lote substituído no mesmo mês
 * (não podem entrar), colchão dentro e fora da janela de agosto, equipe movida
 * para outro setor, equipe «somente geral», Integral e Extra cobrados para
 * outra carteira, carteira sem vínculo e o 58 com diferença de valor.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const MIGRATION = readFileSync(
  resolve(__dirname, '../../../../supabase/migrations/20260917160000_painel_diretoria_59_desempenho.sql'),
  'utf8',
);
const PRODUCAO = readFileSync(resolve(__dirname, 'fixtures/diretoria59_producao_20260917.sql'), 'utf8');

const E  = '00000000-0000-4000-8000-00000000e001';
const S1 = '00000000-0000-4000-8000-0000000005a1';
const S2 = '00000000-0000-4000-8000-0000000005a2';
const S3 = '00000000-0000-4000-8000-0000000005a3';
const S4 = '00000000-0000-4000-8000-0000000005a4';
const SETORES = [S1, S2, S3, S4];
const MESES = ['2026-08', '2026-09'];
const CORTES: (number | null)[] = [null, 10, 31];

let db: PGlite;

/** Linhas de uma função sem ordem garantida: comparadas como conjunto. */
function comoConjunto(linhas: unknown[]): string[] {
  return linhas.map(l => JSON.stringify(l)).sort();
}

async function jsonb(sql: string, params: unknown[] = []): Promise<unknown> {
  const r = await db.query<{ j: unknown }>(sql, params);
  return r.rows[0]?.j;
}

async function linhas(sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> {
  return (await db.query<Record<string, unknown>>(sql, params)).rows;
}

interface Retrato {
  linhas: Record<string, string[]>;
  visao: Record<string, unknown>;
  grade: Record<string, unknown>;
  setor: Record<string, unknown>;
  carteira: Record<string, unknown>;
  grupos: Record<string, unknown>;
  remocoes: Record<string, unknown>;
  divergencias: Record<string, Record<string, unknown>[]>;
  divergenciasResumo: Record<string, unknown>;
}

/** Tudo o que as abas leem, antes e depois da migration. */
async function retratar(): Promise<Retrato> {
  const r: Retrato = {
    linhas: {}, visao: {}, grade: {}, setor: {}, carteira: {}, grupos: {},
    remocoes: {}, divergencias: {}, divergenciasResumo: {},
  };
  for (const mes of MESES) {
    for (const corte of CORTES) {
      const k = `${mes}|${corte}`;
      r.linhas[k] = comoConjunto(await linhas(
        'select * from public.fn_mestre_diretoria_linhas($1, $2, $3)', [E, mes, corte]));
      r.visao[k] = await jsonb('select public.fn_mestre_diretoria_visao_geral($1, $2, $3) j', [E, mes, corte]);
      r.grade[k] = await jsonb('select public.fn_mestre_diretoria_setores($1, $2, $3) j', [E, mes, corte]);
      for (const s of SETORES) {
        r.setor[`${k}|${s}`] = await jsonb(
          'select public.fn_mestre_diretoria_setor($1, $2, $3, null, $4) j', [E, mes, s, corte]);
      }
      for (const cod of ['101', '104', '105', '106']) {
        r.carteira[`${k}|${cod}`] = await jsonb(
          'select public.fn_mestre_diretoria_setor($1, $2, null, $3, $4) j', [E, mes, cod, corte]);
      }
    }
    r.grupos[mes] = await linhas('select * from public.fn_mestre_resumo_grupos($1, $2)', [E, mes]);
    r.divergencias[mes] = await linhas(
      'select * from public.fn_mestre_divergencias($1, $2, null, null, null, 1000000)', [E, mes]);
    r.divergenciasResumo[mes] = await linhas('select * from public.fn_mestre_divergencias_resumo($1, $2)', [E, mes]);
  }
  for (const mes of ['2026-07', '2026-08', '2026-09', '2026-9', 'lixo', null]) {
    r.remocoes[String(mes)] = await linhas('select * from public.fn_analitico_remocoes_guardadas($1, $2)', [E, mes]);
  }
  return r;
}

let antes: Retrato;
let depois: Retrato;
let planoAntes: string;
let planoDepois: string;

const PLANO_AJUDANTES = `
  explain (verbose, costs off)
  select count(*) from public.mestre_recebimentos r
   where public.fn_mestre_conta_na_meta(r.colchao, r.dt_pgto)
     and public.fn_mestre_e_equipe(r.subgrupo_equipe)`;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
    -- O portão não é o assunto: passa sempre.
    create function public.fn_user_is_super_admin() returns boolean language sql stable as $$ select true $$;
    create function public.fn_can_access_empresa(uuid) returns boolean language sql stable as $$ select true $$;

    create table public.empresas (id uuid primary key, slug text);
    create table public.setores (id uuid primary key, empresa_id uuid, nome text, foto_url text,
      alternativo boolean default false, ativo boolean default true);
    create table public.equipes (id uuid primary key, empresa_id uuid, setor_id uuid, nome text);
    create table public.perfis (id uuid primary key, empresa_id uuid, nome text, foto_url text,
      setor_id uuid, perfil text);
    create table public.equipe_lideres (equipe_id uuid, lider_id uuid, empresa_id uuid, criado_em timestamptz);
    create table public.composicao_mes (empresa_id uuid, mes text, operador_id uuid, nome text, equipe_id uuid);
    create table public.composicao_mes_setor (empresa_id uuid, mes text, setor_id uuid, nome text);

    create table public.mestre_lotes (id uuid primary key, empresa_id uuid, mes date, estado text);
    create unique index mestre_lotes_um_vigente_por_mes on public.mestre_lotes (empresa_id, mes)
      where estado = 'vigente';
    create table public.mestre_recebimentos (
      id bigint generated always as identity primary key,
      lote_id uuid not null, empresa_id uuid not null, mes date not null,
      setor text not null default '', cod_grupo_filtro text not null,
      nome_grupo_filtro text not null default '', cobradora text not null default '',
      subgrupo_equipe text not null default '', cliente text not null default '',
      titulo text not null default '', nr_documento text not null default '',
      tp_doc text not null default '', colchao boolean not null default false,
      tipo text not null default '', dt_pgto date not null,
      recebido numeric(12,2) not null default 0,
      operador_id uuid, operador_setor_id uuid
    );
    create index mestre_recebimentos_lote on public.mestre_recebimentos (lote_id);
    create table public.mestre_grupos (empresa_id uuid, cod_grupo_filtro text, nome_grupo_filtro text,
      setor_id uuid, estado text, primeira_aparicao date, ultima_aparicao date);
    create table public.mestre_equipes (empresa_id uuid, cod_grupo_filtro text, nome_subgrupo text,
      destino text, destino_setor_id uuid, equipe_id uuid);

    create table public.analitico_recebimentos (empresa_id uuid, mes_referencia date, setor_id uuid,
      data_pagamento date, operador_usuario text, operador_id uuid, codigo text,
      valor_recebido numeric(12,2), procedencia text);
    create table public.analitico_removidos (id bigint generated always as identity, lote_id uuid,
      empresa_id uuid, setor_id uuid, mes_referencia date, valor_recebido numeric(12,2),
      removido_em timestamptz, restaurado_em timestamptz);
    create index analitico_removidos_empresa_mes on public.analitico_removidos
      (empresa_id, mes_referencia, removido_em desc);
    create table public.logs_sistema (id bigint generated always as identity, empresa_id uuid,
      criado_em timestamptz default now(), alvo_tipo text);

    -- Dependência de fn_mestre_divergencias, igual a produção (sem SET).
    create function public.fn_mestre_setor_resolvido(p_setor_do_grupo uuid, p_destino text,
      p_destino_setor_id uuid) returns uuid language sql immutable parallel safe as $f$
      select case coalesce(p_destino, 'proprio')
               when 'outro_setor'   then p_destino_setor_id
               when 'somente_geral' then null::uuid
               else p_setor_do_grupo
             end;
    $f$;

    -- Só para os «alter function ... set statement_timeout» da migration.
    create function public.fn_mestre_operadores_do_mes(uuid, text, integer) returns integer
      language sql as $$ select 1 $$;
    create function public.fn_mestre_equipes_sugeridas(uuid, text, numeric) returns integer
      language sql as $$ select 1 $$;
    create function public.fn_importacoes_historico(uuid, text, text, integer) returns integer
      language sql as $$ select 1 $$;
    create function public.fn_mestre_fontes_dos_setores(uuid, text) returns integer
      language sql as $$ select 1 $$;
    create function public.fn_mestre_comparar_setores(uuid, text) returns integer
      language sql as $$ select 1 $$;
  `);

  await db.exec(PRODUCAO);

  await db.exec(`
    select setseed(0.17);

    insert into public.empresas values ('${E}', 'bookplay');
    insert into public.setores (id, empresa_id, nome, foto_url) values
      ('${S1}', '${E}', 'Setor Um', 's1.png'), ('${S2}', '${E}', 'Setor Dois', null),
      ('${S3}', '${E}', 'Setor Tres', null),   ('${S4}', '${E}', 'Setor Quatro', null);
    insert into public.composicao_mes_setor values ('${E}', '2026-09', '${S1}', 'Setor Um em setembro');

    insert into public.equipes values
      ('00000000-0000-4000-8000-0000000000d1', '${E}', '${S1}', 'Equipe Alfa'),
      ('00000000-0000-4000-8000-0000000000d2', '${E}', '${S2}', 'Equipe Beta'),
      ('00000000-0000-4000-8000-0000000000d3', '${E}', '${S3}', 'Equipe Gama');
    insert into public.perfis values
      ('00000000-0000-4000-8000-0000000000b1', '${E}', 'Ana Paula', 'ana.png', '${S1}', 'operador'),
      ('00000000-0000-4000-8000-0000000000b2', '${E}', 'Beatriz',   null,      '${S2}', 'operador'),
      ('00000000-0000-4000-8000-0000000000b3', '${E}', 'Caio',      null,      '${S4}', 'operador'),
      ('00000000-0000-4000-8000-0000000000c1', '${E}', 'Lider Um',  'l1.png',  '${S1}', 'lider'),
      ('00000000-0000-4000-8000-0000000000c2', '${E}', 'Lider Dois', null,     '${S2}', 'lider');
    insert into public.equipe_lideres values
      ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000c1', '${E}', '2026-01-01'),
      ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000c2', '${E}', '2026-03-01'),
      ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000c2', '${E}', '2026-01-01');
    insert into public.composicao_mes values
      ('${E}', '2026-09', '00000000-0000-4000-8000-0000000000b1', 'Ana Paula (set)', '00000000-0000-4000-8000-0000000000d1'),
      ('${E}', '2026-09', '00000000-0000-4000-8000-0000000000b2', 'Beatriz (set)',   '00000000-0000-4000-8000-0000000000d2');

    -- Lotes: um vigente por mês, e em cada mês um lote que NÃO pode entrar.
    insert into public.mestre_lotes values
      ('00000000-0000-4000-8000-00000000a801', '${E}', '2026-08-01', 'vigente'),
      ('00000000-0000-4000-8000-00000000a802', '${E}', '2026-08-01', 'substituido'),
      ('00000000-0000-4000-8000-00000000a901', '${E}', '2026-09-01', 'vigente'),
      ('00000000-0000-4000-8000-00000000a902', '${E}', '2026-09-01', 'aberto');

    insert into public.mestre_grupos values
      ('${E}', '101', 'CART A', '${S1}', 'vinculado', '2026-08-01', '2026-09-20'),
      ('${E}', '102', 'CART B', '${S2}', 'vinculado', '2026-08-01', '2026-09-20'),
      ('${E}', '103', 'CART C', '${S3}', 'vinculado', '2026-08-02', '2026-09-19'),
      ('${E}', '104', 'CART D', '${S4}', 'novo',      '2026-08-03', '2026-09-18'),
      ('${E}', '106', 'CART F', null,    'novo',      '2026-09-01', '2026-09-17');
    -- '105' (CART E) não tem linha em mestre_grupos.

    insert into public.mestre_equipes values
      ('${E}', '101', 'EQUIPE ALFA',   'proprio',       null,    '00000000-0000-4000-8000-0000000000d1'),
      ('${E}', '101', 'EQUIPE MOVIDA', 'outro_setor',   '${S3}', '00000000-0000-4000-8000-0000000000d3'),
      ('${E}', '102', 'RETENCAO',      'somente_geral', null,    null),
      ('${E}', '102', 'EQUIPE BETA',   null,            null,    '00000000-0000-4000-8000-0000000000d2'),
      ('${E}', '103', 'EQUIPE GAMA',   'proprio',       null,    null);

    with lotes(id, mes, n) as (values
      ('00000000-0000-4000-8000-00000000a801'::uuid, date '2026-08-01', 1400),
      ('00000000-0000-4000-8000-00000000a802'::uuid, date '2026-08-01', 300),
      ('00000000-0000-4000-8000-00000000a901'::uuid, date '2026-09-01', 1400),
      ('00000000-0000-4000-8000-00000000a902'::uuid, date '2026-09-01', 400)
    ),
    sorteio as (
      select l.id as lote_id, l.mes, g,
             x.k, x.c, x.s, x.t, x.d, x.tp, x.r1, x.r2
        from lotes l
        cross join lateral generate_series(1, l.n) g
        cross join lateral (
          select g as gg,
                 1 + floor(random() * 6)::int as k,
                 1 + floor(random() * 8)::int as c,
                 1 + floor(random() * 9)::int as s,
                 1 + floor(random() * 5)::int as t,
                 floor(random() * 30)::int    as d,
                 1 + floor(random() * 5)::int as tp,
                 random() as r1, random() as r2
        ) x
    )
    insert into public.mestre_recebimentos (lote_id, empresa_id, mes, setor, cod_grupo_filtro,
      nome_grupo_filtro, cobradora, subgrupo_equipe, nr_documento, tp_doc, colchao, tipo, dt_pgto,
      recebido, operador_id, operador_setor_id)
    select s.lote_id, '${E}', s.mes,
           case when s.r1 < 0.12 then (array['CART A','CART B','CART C','CART D','CART E','CART F'])[s.k]
                                      || ' - ' || (array['CART B','CART C','CART A','CART A','CART B','CART C'])[s.k]
                when s.r1 < 0.16 then (array['CART A','CART B','CART C','CART D','CART E','CART F'])[s.k] || ' - NINGUEM'
                else 'COB ' || (array['CART A','CART B','CART C','CART D','CART E','CART F'])[s.k] end,
           (array['101','102','103','104','105','106'])[s.k],
           case when s.r2 < 0.03 then '' else (array['CART A','CART B','CART C','CART D','CART E','CART F'])[s.k] end,
           (array['ANA','BIA','CAIO','DUDA','EDU','FABI','','GIL'])[s.c],
           (array['EQUIPE ALFA','EQUIPE MOVIDA','RETENCAO','EQUIPE BETA','EQUIPE GAMA',
                  'ATESTADOS|FERIAS','LIDERANÇA','','EQUIPE SOLTA'])[s.s],
           case when s.r2 < 0.05 then '' else 'NR' || (s.g % 450) end,
           (array['BOLETO',' PIX ','','CARTAO','Cartão Recorrente'])[s.tp],
           random() < 0.12,
           (array['Integral','Extra','INTEGRAL','EXTRA',''])[s.t],
           s.mes + least(s.d, 29),
           ((1000 + s.g * 13 + floor(random() * 500000))::numeric / 100)::numeric(12,2),
           (array['00000000-0000-4000-8000-0000000000b1','00000000-0000-4000-8000-0000000000b2',
                  '00000000-0000-4000-8000-0000000000b3',null,null,null,null,null]::uuid[])[s.c],
           (array['${S1}','${S2}','${S4}',null,null,null,null,null]::uuid[])[s.c]
      from sorteio s;

    -- O 58: parte das linhas do 59, com diferença de valor, grafia e procedência
    -- trocadas às vezes, e linhas que só o 58 tem.
    insert into public.analitico_recebimentos
    select r.empresa_id, r.mes, g.setor_id, r.dt_pgto,
           case when random() < 0.5 then lower(r.cobradora) else r.cobradora end,
           r.operador_id, r.nr_documento,
           case when random() < 0.12 then r.recebido + ((1 + floor(random() * 9000))::numeric / 100)
                else r.recebido end,
           case when random() < 0.05 then 'contribuicao_59' else 'relatorio_58' end
      from public.mestre_recebimentos r
      join public.mestre_lotes l on l.id = r.lote_id and l.estado = 'vigente'
      join public.mestre_grupos g on g.empresa_id = r.empresa_id and g.cod_grupo_filtro = r.cod_grupo_filtro
     where g.setor_id is not null and r.cobradora <> '' and r.nr_documento <> ''
       and random() < 0.7;
    insert into public.analitico_recebimentos
    select '${E}', m.mes, (array['${S1}','${S2}','${S3}']::uuid[])[1 + floor(random() * 3)::int],
           m.mes + floor(random() * 25)::int, 'ZECA', null, 'SO58-' || g,
           ((500 + g * 17 + floor(random() * 90000))::numeric / 100)::numeric(12,2), 'relatorio_58'
      from (values (date '2026-08-01'), (date '2026-09-01')) m(mes)
      cross join generate_series(1, 40) g;

    insert into public.analitico_removidos (lote_id, empresa_id, setor_id, mes_referencia,
      valor_recebido, removido_em, restaurado_em)
    select (array['00000000-0000-4000-8000-00000000f001','00000000-0000-4000-8000-00000000f002',
                  '00000000-0000-4000-8000-00000000f003','00000000-0000-4000-8000-00000000f004']::uuid[])[1 + (g % 4)],
           '${E}',
           case when g % 7 = 0 then null else (array['${S1}','${S2}']::uuid[])[1 + (g % 2)] end,
           (array[date '2026-07-01', date '2026-08-01', date '2026-09-01', date '2026-09-15'])[1 + (g % 4)],
           ((100 + g * 3)::numeric / 100)::numeric(12,2),
           timestamptz '2026-09-01 08:00' + (g % 4) * interval '1 hour' + g * interval '1 second',
           case when g % 4 = 1 and g % 3 = 0 then timestamptz '2026-09-10 10:00' end
      from generate_series(1, 400) g;
  `);

  planoAntes = (await linhas(PLANO_AJUDANTES)).map(l => String(Object.values(l)[0])).join('\n');
  antes = await retratar();

  await db.exec(MIGRATION);

  planoDepois = (await linhas(PLANO_AJUDANTES)).map(l => String(Object.values(l)[0])).join('\n');
  depois = await retratar();
}, 120_000);

afterAll(async () => { await db?.close(); });

describe('migration 20260917160000 — mesmas respostas, menos trabalho', () => {
  it('os dados exercitam os casos que mudam número', async () => {
    const [c] = await linhas(`
      select count(*) filter (where l.estado <> 'vigente')                         as fora_do_vigente,
             count(*) filter (where r.colchao and r.dt_pgto <= date '2026-08-14')  as colchao_janela,
             count(*) filter (where r.colchao and r.dt_pgto >  date '2026-08-14')  as colchao_fora,
             count(*) filter (where r.setor like '% - CART %')                     as integral_para_outra
        from public.mestre_recebimentos r join public.mestre_lotes l on l.id = r.lote_id`);
    for (const v of Object.values(c)) expect(Number(v)).toBeGreaterThan(0);

    const origens = new Set(antes.linhas['2026-09|null'].map(l => (JSON.parse(l) as { origem: string }).origem));
    expect([...origens].sort()).toEqual(['integral', 'movido', 'proprio', 'somente_geral']);
  });

  it('fn_mestre_diretoria_linhas devolve as mesmas linhas', () => {
    for (const k of Object.keys(antes.linhas)) {
      expect(antes.linhas[k].length, k).toBeGreaterThan(0);
      expect(depois.linhas[k], k).toEqual(antes.linhas[k]);
    }
  });

  it('a visão geral é a mesma, inclusive a série diária', () => {
    for (const k of Object.keys(antes.visao)) expect(depois.visao[k], k).toEqual(antes.visao[k]);
    const v = antes.visao['2026-09|10'] as { serie: { valor: number }[] };
    expect(v.serie.some(d => Number(d.valor) > 0)).toBe(true);
  });

  it('a grade de setores e o detalhe de setor e de carteira são os mesmos', () => {
    for (const k of Object.keys(antes.grade)) expect(depois.grade[k], k).toEqual(antes.grade[k]);
    for (const k of Object.keys(antes.setor)) expect(depois.setor[k], k).toEqual(antes.setor[k]);
    for (const k of Object.keys(antes.carteira)) expect(depois.carteira[k], k).toEqual(antes.carteira[k]);
  });

  it('fn_mestre_resumo_grupos é a mesma, na mesma ordem', () => {
    for (const mes of MESES) {
      expect(antes.grupos[mes]).not.toHaveLength(0);
      expect(depois.grupos[mes], mes).toEqual(antes.grupos[mes]);
    }
  });

  it('fn_analitico_remocoes_guardadas é a mesma — inclusive mês inválido e nulo', () => {
    for (const k of Object.keys(antes.remocoes)) expect(depois.remocoes[k], k).toEqual(antes.remocoes[k]);
    expect(antes.remocoes['2026-09']).not.toHaveLength(0);
    expect(antes.remocoes['2026-9']).toHaveLength(0);
    expect(antes.remocoes.null).toHaveLength(0);
  });

  it('a conferência antiga continua igual', () => {
    for (const mes of MESES) {
      expect(comoConjunto(depois.divergencias[mes])).toEqual(comoConjunto(antes.divergencias[mes]));
      expect(depois.divergenciasResumo[mes]).toEqual(antes.divergenciasResumo[mes]);
    }
  });

  it('fn_mestre_diretoria_equipes_dos_setores = o bloco `equipes` do detalhe, setor a setor', async () => {
    for (const mes of MESES) {
      for (const corte of CORTES) {
        const k = `${mes}|${corte}`;
        const todas = await jsonb(
          'select public.fn_mestre_diretoria_equipes_dos_setores($1, $2, $3) j', [E, mes, corte],
        ) as Record<string, unknown[]>;
        let comEquipe = 0;
        for (const s of SETORES) {
          const detalhe = antes.setor[`${k}|${s}`] as { equipes: unknown[] };
          expect(todas[s] ?? [], `${k}|${s}`).toEqual(detalhe.equipes);
          if (detalhe.equipes.length) comEquipe++;
        }
        expect(comEquipe, k).toBeGreaterThan(1);
      }
    }
  });

  it('fn_mestre_conferencia = resumo + lista de antes, numa chamada', async () => {
    for (const mes of MESES) {
      const tudo = await jsonb('select public.fn_mestre_conferencia($1, $2, 1000000) j', [E, mes]) as {
        resumo: unknown[]; linhas: Record<string, unknown>[];
      };
      const resumoAntes = antes.divergenciasResumo[mes] as Record<string, unknown>[];
      expect(tudo.resumo.length).toBeGreaterThan(1);
      expect(tudo.resumo.map(r => JSON.stringify(normalizar(r)))).toEqual(
        resumoAntes.map(r => JSON.stringify(normalizar(r))));
      expect(comoConjunto(tudo.linhas.map(normalizar))).toEqual(
        comoConjunto((antes.divergencias[mes]).map(normalizar)));

      // Com limite, cabem as primeiras na ordem da função — a mesma sequência
      // de classe e |delta| que a chamada com `p_limite` devolve.
      const poucas = await jsonb('select public.fn_mestre_conferencia($1, $2, 7) j', [E, mes]) as {
        linhas: { classe: string; delta: number }[];
      };
      const limitadas = await linhas(
        'select * from public.fn_mestre_divergencias($1, $2, null, null, null, 7)', [E, mes]);
      expect(poucas.linhas).toHaveLength(7);
      expect(poucas.linhas.map(l => `${l.classe}|${Math.abs(Number(l.delta))}`)).toEqual(
        limitadas.map(l => `${String(l.classe)}|${Math.abs(Number(l.delta))}`));
    }
  });

  it('os dois ajudantes deixam de ser chamada de função no plano', async () => {
    expect(planoAntes).toContain('fn_mestre_conta_na_meta');
    expect(planoAntes).toContain('fn_mestre_e_equipe');
    expect(planoDepois).not.toContain('fn_mestre_conta_na_meta');
    expect(planoDepois).not.toContain('fn_mestre_e_equipe');

    const config = await linhas(`
      select p.proname, p.proconfig from pg_proc p
       where p.proname in ('fn_mestre_conta_na_meta', 'fn_mestre_e_equipe')`);
    expect(config.map(c => c.proconfig)).toEqual([null, null]);
  });

  it('as funções reescritas mantêm os SETs de produção e ganham o teto de tempo', async () => {
    const config = Object.fromEntries((await linhas(`
      select p.proname, p.proconfig from pg_proc p
       where p.proname in ('fn_mestre_diretoria_visao_geral', 'fn_mestre_diretoria_setor',
                           'fn_mestre_diretoria_setores', 'fn_mestre_resumo_grupos',
                           'fn_analitico_remocoes_guardadas', 'fn_mestre_diretoria_equipes_dos_setores',
                           'fn_mestre_conferencia', 'fn_mestre_divergencias')`))
      .map(c => [c.proname, c.proconfig as string[]]));

    for (const nome of ['fn_mestre_diretoria_visao_geral', 'fn_mestre_diretoria_setor',
                        'fn_mestre_resumo_grupos', 'fn_analitico_remocoes_guardadas',
                        'fn_mestre_diretoria_equipes_dos_setores', 'fn_mestre_conferencia']) {
      expect(config[nome], nome).toContain('work_mem=32MB');
    }
    for (const nome of Object.keys(config)) {
      expect(config[nome].some(c => c.startsWith('statement_timeout=')), nome).toBe(true);
      expect(config[nome], nome).toContain('search_path=public');
    }
  });

  it('o histórico ganha o índice parcial das importações', async () => {
    const [i] = await linhas(`select indexdef from pg_indexes where indexname = 'idx_logs_importacao_analitico'`);
    expect(String(i?.indexdef)).toContain("alvo_tipo = 'importacao_analitico'");
  });
});

/**
 * O jsonb traz número e chaves na ordem dele; a linha da função traz string,
 * Date e a ordem das colunas. Iguala os dois.
 */
function normalizar(l: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const entradas = Object.entries(l as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  for (const [k, v] of entradas) {
    if (v instanceof Date) out[k] = v.toISOString().slice(0, 10);
    else if (typeof v === 'number' || (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v))) out[k] = Number(v);
    else out[k] = v;
  }
  return out;
}

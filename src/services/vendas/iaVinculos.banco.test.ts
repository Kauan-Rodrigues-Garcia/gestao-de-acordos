// @vitest-environment node
/**
 * IA vinculada a operador (migration 20261001150000), rodando de verdade num
 * Postgres isolado (PGlite) sobre um esqueleto das tabelas do Comercial.
 *
 * O que se trava aqui:
 *   1. Vincular, trocar (mês inteiro e a partir da data) e desvincular deixam
 *      a IA com UM dono por data — nunca dois períodos sobrepostos.
 *   2. A regra SQL (`fn_vendas_ia_credito`) e a TS (`creditoDaVenda`) dão a
 *      mesma resposta para as mesmas datas.
 *   3. As travas: só IA se vincula, só a gente, e só com a permissão.
 *   4. A policy de leitura deixa o operador creditado ver a venda da IA.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { creditoDaVenda, type IaDoCadastro } from '@/lib/vendasIa';

const EMPRESA = '00000000-0000-4000-8000-000000000001';
const SETOR   = '00000000-0000-4000-8000-0000000000e1';
const EQUIPE  = '00000000-0000-4000-8000-0000000000f1';
const ADMIN   = '00000000-0000-4000-8000-0000000000aa';
const KEVIN   = '00000000-0000-4000-8000-0000000000b1';
const CAMILA  = '00000000-0000-4000-8000-0000000000b2';
const IA      = '00000000-0000-4000-8000-0000000000c1';
const IA2     = '00000000-0000-4000-8000-0000000000c2';

let db: PGlite;

async function q<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await db.query<T>(sql, params)).rows;
}

async function vincular(ia: string, operador: string | null, desde: string) {
  await q('select public.fn_vendas_ia_vincular($1, $2, $3::date)', [ia, operador, desde]);
}

async function periodos(ia = IA) {
  return q<{ operador_id: string; desde: string; ate: string | null }>(
    `select operador_id, to_char(desde, 'YYYY-MM-DD') as desde, to_char(ate, 'YYYY-MM-DD') as ate
       from public.vendas_ia_vinculos where ia_id = $1 order by desde`, [ia]);
}

async function creditoSql(data: string, ia = IA): Promise<string | null> {
  const [r] = await q<{ c: string | null }>('select public.fn_vendas_ia_credito($1, $2::date) as c', [ia, data]);
  return r.c;
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
      setor_id uuid, equipe_id uuid, robo boolean default false, arquivado boolean default false);
    create table public.equipe_lideres (equipe_id uuid, lider_id uuid);

    create function public.fn_can_access_empresa(e uuid) returns boolean language sql as $$ select true $$;
    create function public.fn_user_tem(chave text) returns boolean language sql
      as $$ select coalesce(current_setting('test.perm', true), 'sim') = 'sim' $$;
    create function public.fn_user_escopo(aba text) returns integer language sql
      as $$ select coalesce(nullif(current_setting('test.escopo', true), '')::int, 0) $$;
    create function public.fn_setores_do_operador(u uuid) returns setof uuid language sql as $$ select null::uuid where false $$;
    create function public.fn_equipes_com_lideranca(u uuid) returns table(equipe_id uuid) language sql
      as $$ select el.equipe_id from public.equipe_lideres el where el.lider_id = u $$;
    create function public.fn_vendas_equipe_que_credita(p uuid) returns uuid language sql
      as $$ select equipe_id from public.perfis where id = p $$;
    create function public.fn_vendas_perfil_do_login(e uuid, login text) returns uuid language sql
      as $$ select id from public.perfis where usuario = login $$;

    create table public.vendas (
      id uuid primary key default gen_random_uuid(), empresa_id uuid, operador_id uuid,
      setor_id uuid, equipe_id uuid, data_venda date, data_confirmacao date,
      valor_total numeric, conta_na_meta boolean default true, valor_na_meta numeric);
    -- Em produção a RLS de vendas já está ligada desde a Fase 1.
    alter table public.vendas enable row level security;
    create table public.vendas_lotes (id uuid primary key, empresa_id uuid, mes date, origem text, estado text);
    create table public.vendas_relatorio (
      lote_id uuid, empresa_id uuid, nr_documento text, valor_total numeric, conta_na_meta boolean,
      valor_na_meta numeric, data_venda date, data_confirmacao date, codigo_franquia text, login_vendedor text);
    create table public.vendas_franquias (empresa_id uuid, codigo text, estado text, setor_id uuid);

    insert into public.empresas values ('${EMPRESA}', 'comercial');
    insert into public.setores values ('${SETOR}', 'Extreme', '${EMPRESA}');
    insert into public.equipes values ('${EQUIPE}', 'Rafael', '${SETOR}');
    insert into public.perfis (id, empresa_id, nome, usuario, setor_id, equipe_id, robo) values
      ('${ADMIN}',  '${EMPRESA}', 'Admin',  'admin',  null,       null,        false),
      ('${KEVIN}',  '${EMPRESA}', 'Kevin',  'kevin',  '${SETOR}', '${EQUIPE}', false),
      ('${CAMILA}', '${EMPRESA}', 'Camila', 'camila', '${SETOR}', null,        false),
      ('${IA}',     '${EMPRESA}', 'IA Kevin',  'ia_kevin_comum', '${SETOR}', null, true),
      ('${IA2}',    '${EMPRESA}', 'IA Camila', 'ia_camila',      '${SETOR}', null, true);
    select set_config('test.uid', '${ADMIN}', false);
  `);
  await db.exec(readFileSync('supabase/migrations/20261001150000_vendas_ia_vinculos.sql', 'utf8'));
}, 30000);

afterAll(async () => { await db?.close(); });

beforeEach(async () => {
  await db.exec(`
    delete from public.vendas_ia_vinculos; delete from public.vendas_ia_vinculos_historico;
    delete from public.vendas; delete from public.vendas_relatorio; delete from public.vendas_lotes;
    delete from public.vendas_franquias; delete from public.equipe_lideres;
    select set_config('test.uid', '${ADMIN}', false);
    select set_config('test.perm', 'sim', false);
    select set_config('test.escopo', '0', false);
  `);
});

describe('fn_vendas_ia_vincular — um dono por data', () => {
  it('vincular cria um período em aberto', async () => {
    await vincular(IA, KEVIN, '2026-10-01');
    expect(await periodos()).toEqual([{ operador_id: KEVIN, desde: '2026-10-01', ate: null }]);
  });

  it('trocar a partir da data corta o anterior no dia da troca', async () => {
    await vincular(IA, KEVIN, '2026-10-01');
    await vincular(IA, CAMILA, '2026-10-15');
    expect(await periodos()).toEqual([
      { operador_id: KEVIN,  desde: '2026-10-01', ate: '2026-10-15' },
      { operador_id: CAMILA, desde: '2026-10-15', ate: null },
    ]);
    expect(await creditoSql('2026-10-14')).toBe(KEVIN);
    expect(await creditoSql('2026-10-15')).toBe(CAMILA);
  });

  it('trocar o mês inteiro substitui o período que começou dentro do mês', async () => {
    await vincular(IA, KEVIN, '2026-09-01');
    await vincular(IA, CAMILA, '2026-10-10');
    // «Mês inteiro» de outubro: desde = 01/10. O período da Camila (10/10) some,
    // o do Kevin é cortado em 01/10 — setembro fica com ele.
    await vincular(IA, KEVIN, '2026-10-01');
    // Mesmo operador colado: o banco estende em vez de picotar.
    expect(await periodos()).toEqual([{ operador_id: KEVIN, desde: '2026-09-01', ate: null }]);
  });

  it('desvincular fecha o período; dali em diante a venda fica com a IA', async () => {
    await vincular(IA, KEVIN, '2026-10-01');
    await vincular(IA, null, '2026-10-20');
    expect(await periodos()).toEqual([{ operador_id: KEVIN, desde: '2026-10-01', ate: '2026-10-20' }]);
    expect(await creditoSql('2026-10-19')).toBe(KEVIN);
    expect(await creditoSql('2026-10-20')).toBeNull();
  });

  it('desvincular desde o início apaga o vínculo', async () => {
    await vincular(IA, KEVIN, '2026-10-05');
    await vincular(IA, null, '2026-10-01');
    expect(await periodos()).toEqual([]);
  });

  it('toda troca deixa histórico com o antes e o depois', async () => {
    await vincular(IA, KEVIN, '2026-10-01');
    await vincular(IA, CAMILA, '2026-10-15');
    const h = await q<{ antes: unknown[]; depois: unknown[] }>(
      'select antes, depois from public.vendas_ia_vinculos_historico order by id');
    expect(h).toHaveLength(2);
    expect(h[1].antes).toHaveLength(1);
    expect(h[1].depois).toHaveLength(2);
  });
});

describe('fn_vendas_ia_vincular — travas', () => {
  it('recusa sem a permissão de editar cargo', async () => {
    await db.exec(`select set_config('test.perm', 'nao', false)`);
    await expect(vincular(IA, KEVIN, '2026-10-01')).rejects.toThrow(/permissão/);
  });

  it('recusa vincular quem não é IA', async () => {
    await expect(vincular(KEVIN, CAMILA, '2026-10-01')).rejects.toThrow(/não está marcado como IA/);
  });

  it('recusa vincular IA a outra IA', async () => {
    await expect(vincular(IA, IA2, '2026-10-01')).rejects.toThrow(/outra IA/);
  });

  it('recusa sem data', async () => {
    await expect(q('select public.fn_vendas_ia_vincular($1, $2, null)', [IA, KEVIN]))
      .rejects.toThrow(/a partir de quando/);
  });
});

describe('a regra SQL e a TS respondem igual', () => {
  it('para todo dia de setembro a novembro, com troca e desvínculo no meio', async () => {
    await vincular(IA, KEVIN, '2026-09-10');
    await vincular(IA, CAMILA, '2026-10-01');
    await vincular(IA, null, '2026-10-25');
    await vincular(IA, KEVIN, '2026-11-03');

    const linhas = await periodos();
    const iaTs: Pick<IaDoCadastro, 'vinculos'> = {
      vinculos: linhas.map(l => ({ iaId: IA, operadorId: l.operador_id, operadorNome: null, desde: l.desde, ate: l.ate })),
    };

    const dias: string[] = [];
    for (let d = new Date(Date.UTC(2026, 8, 1)); d < new Date(Date.UTC(2026, 11, 1)); d.setUTCDate(d.getUTCDate() + 1)) {
      dias.push(d.toISOString().slice(0, 10));
    }
    const sql = await q<{ dia: string; c: string | null }>(
      `select to_char(d, 'YYYY-MM-DD') as dia, public.fn_vendas_ia_credito($1, d::date) as c
         from generate_series('2026-09-01'::date, '2026-11-30'::date, interval '1 day') as d`, [IA]);
    const porDia = new Map(sql.map(r => [r.dia, r.c]));

    for (const dia of dias) {
      expect(porDia.get(dia) ?? null, dia).toBe(creditoDaVenda(iaTs, dia)?.operadorId ?? null);
    }
  });
});

describe('vendas_select — quem leva o crédito enxerga a venda da IA', () => {
  async function visiveisPara(uid: string, escopo = 0): Promise<number> {
    await db.exec(`
      select set_config('test.uid', '${uid}', false);
      select set_config('test.escopo', '${escopo}', false);
      grant usage on schema public to authenticated;
      grant select on all tables in schema public to authenticated;
      grant execute on all functions in schema public to authenticated;
      grant usage on schema auth to authenticated;
      grant execute on all functions in schema auth to authenticated;
      set role authenticated;
    `);
    try {
      const [r] = await q<{ n: number }>('select count(*)::int as n from public.vendas');
      return r.n;
    } finally {
      await db.exec('reset role');
    }
  }

  beforeEach(async () => {
    await db.exec(`
      insert into public.vendas (empresa_id, operador_id, setor_id, data_venda, data_confirmacao, valor_total, valor_na_meta)
      values ('${EMPRESA}', '${IA}', '${SETOR}', '2026-10-05', '2026-10-06', 1000, 1000);
    `);
  });

  it('sem vínculo, o operador não vê a venda da IA', async () => {
    expect(await visiveisPara(KEVIN)).toBe(0);
  });

  it('com vínculo na data, o operador vê', async () => {
    await vincular(IA, KEVIN, '2026-10-01');
    expect(await visiveisPara(KEVIN)).toBe(1);
  });

  it('vínculo que começa depois da confirmação não dá acesso', async () => {
    await vincular(IA, KEVIN, '2026-10-07');
    expect(await visiveisPara(KEVIN)).toBe(0);
  });

  it('o líder da equipe do operador (escopo 1) vê', async () => {
    await db.exec(`insert into public.equipe_lideres values ('${EQUIPE}', '${CAMILA}')`);
    await vincular(IA, KEVIN, '2026-10-01');
    expect(await visiveisPara(CAMILA, 1)).toBe(1);
  });
});

describe('fn_vendas_fechamento_do_setor — equipe pelo crédito, total igual', () => {
  const LOTE = '00000000-0000-4000-8000-0000000000d1';

  beforeEach(async () => {
    await db.exec(`
      insert into public.vendas_franquias values ('${EMPRESA}', '7161', 'vinculado', '${SETOR}');
      insert into public.vendas_lotes values ('${LOTE}', '${EMPRESA}', '2026-10-01', 'geral', 'vigente');
      insert into public.vendas_relatorio values
        ('${LOTE}', '${EMPRESA}', 'NR1', 1000, true, 1000, '2026-10-05', '2026-10-06', '7161', 'ia_kevin_comum'),
        ('${LOTE}', '${EMPRESA}', 'NR2',  500, true,  500, '2026-10-05', '2026-10-06', '7161', 'kevin');
      select set_config('test.escopo', '3', false);
    `);
  });

  async function fechamento() {
    return q<{ escopo: string; chave: string | null; valor_na_regua: string }>(
      `select escopo, chave, valor_na_regua::text from public.fn_vendas_fechamento_do_setor($1, $2, '2026-10-01')`,
      [EMPRESA, SETOR]);
  }

  it('sem vínculo, a venda da IA fica sem equipe e como automação', async () => {
    const f = await fechamento();
    expect(f.find(l => l.escopo === 'equipe' && l.chave === 'sem_equipe')?.valor_na_regua).toBe('1000');
    expect(f.find(l => l.escopo === 'natureza' && l.chave === 'robo')?.valor_na_regua).toBe('1000');
  });

  it('com vínculo, vai para a equipe do operador — e o total não muda', async () => {
    const antes = (await fechamento()).find(l => l.escopo === 'total')?.valor_na_regua;
    await vincular(IA, KEVIN, '2026-10-01');
    const f = await fechamento();
    expect(f.find(l => l.escopo === 'total')?.valor_na_regua).toBe(antes);
    expect(f.find(l => l.escopo === 'equipe' && l.chave === EQUIPE)?.valor_na_regua).toBe('1500');
    expect(f.find(l => l.escopo === 'equipe' && l.chave === 'sem_equipe')).toBeUndefined();
    expect(f.find(l => l.escopo === 'natureza' && l.chave === 'robo')).toBeUndefined();
  });
});

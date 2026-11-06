// @vitest-environment node
/**
 * A migration 20261105160000 (histórico do Plantão Elite) num Postgres de
 * verdade (PGlite, LOCAL — não é o banco de produção), sobre o mínimo das
 * tabelas do analítico: aplica, reaplica, e prova que cada dia sai com a dupla
 * que estava NAQUELE dia — antes e depois da troca de 01/11.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const EMP = '00000000-0000-4000-8000-0000000000e0';
const REC = '00000000-0000-4000-8000-0000000000a1';
const OUTRO = '00000000-0000-4000-8000-0000000000a2';
const TIAGO = '00000000-0000-4000-8000-0000000000c1';
const AGATHA = '00000000-0000-4000-8000-0000000000c2';
const MATHEUS = '00000000-0000-4000-8000-0000000000c3';
const GABRIEL = '00000000-0000-4000-8000-0000000000c4';
const GERENTE = '00000000-0000-4000-8000-0000000000c5';
const OPERADOR = '00000000-0000-4000-8000-0000000000c6';
const FORA = '00000000-0000-4000-8000-0000000000c7';

const SQL = readFileSync(
  resolve(__dirname, '../../../supabase/migrations/20261105160000_plantao_elite_historico.sql'),
  'utf8',
);

let db: PGlite;

async function como<T>(uid: string, sql: string, params: unknown[] = []) {
  await db.query("select set_config('teste.uid', $1, false)", [uid]);
  return db.query<T>(sql, params);
}

interface Hist {
  inicio: string;
  sou_da_dupla: boolean;
  pessoas: { id: string; nome: string }[];
  dias: { data: string; plantao: string; membros: { id: string; valor: number; qtd: number }[]; setor_total: number; setor_qtd: number }[];
}

async function historico(uid: string, de: string | null, ate: string | null): Promise<Hist> {
  const r = await como<{ h: Hist }>(uid, 'select public.fn_elite_plantao_historico($1, $2, $3) h', [EMP, de, ate]);
  return r.rows[0].h;
}

async function quadro(uid: string, data: string) {
  const r = await como<{ q: { plantao: string; sou_da_dupla: boolean; membros: { id: string }[] } }>(
    uid, 'select public.fn_elite_plantao_hora($1, $2) q', [EMP, data]);
  return r.rows[0].q;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('teste.uid', true), '')::uuid $$;

    create table public.empresas (id uuid primary key, slug text);
    create table public.setores (id uuid primary key, nome text);
    create table public.equipes (id uuid primary key, setor_id uuid);
    create table public.perfis (
      id uuid primary key, nome text, usuario text, perfil text,
      setor_id uuid, equipe_id uuid);
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

    create function public.fn_can_access_empresa(e uuid) returns boolean language sql stable as $$ select true $$;
    create function public.fn_user_tem(chave text) returns boolean language sql stable
      as $$ select exists (select 1 from public.perfis p where p.id = auth.uid() and p.perfil in ('elite','gerencia')) $$;

    insert into public.empresas values ('${EMP}', 'bookplay');
    insert into public.setores values ('${REC}', 'Receptivo'), ('${OUTRO}', 'Play 1');
    insert into public.perfis values
      ('${TIAGO}',   'Tiago Almada',   'tiago_almada',   'elite',    '${REC}', null),
      ('${AGATHA}',  'Agatha Rocha',   'agatha_rocha',   'elite',    '${REC}', null),
      ('${MATHEUS}', 'Matheus Souza',  'matheus',        'elite',    '${REC}', null),
      ('${GABRIEL}', 'Gabriel Oliveira','gabriel_oliveira','elite',  '${REC}', null),
      ('${GERENTE}', 'Gerente',        'gerente',        'gerencia', '${REC}', null),
      ('${OPERADOR}','Operador',       'op',             'operador', '${REC}', null),
      ('${FORA}',    'De fora',        'fora',           'operador', '${OUTRO}', null);

    -- A escala de hoje: a de depois da troca de 01/11.
    insert into public.elite_plantao (empresa_id, perfil_id, plantao, ordem) values
      ('${EMP}', '${TIAGO}',   'par',   1), ('${EMP}', '${AGATHA}',  'par',   2),
      ('${EMP}', '${MATHEUS}', 'impar', 1), ('${EMP}', '${GABRIEL}', 'impar', 2);

    insert into public.analitico_recebimentos (empresa_id, operador_id, setor_id, contribuicao_de_setor_id, data_pagamento, valor_recebido) values
      -- 31/10 (ímpar, antes da troca = Tiago + Agatha)
      ('${EMP}', '${TIAGO}',   '${REC}', null, '2026-10-31', 100),
      ('${EMP}', '${TIAGO}',   '${REC}', null, '2026-10-31', 50),
      ('${EMP}', '${AGATHA}',  '${REC}', null, '2026-10-31', 70),
      ('${EMP}', '${MATHEUS}', '${REC}', null, '2026-10-31', 999),   -- não era o dia dele
      ('${EMP}', '${OPERADOR}','${REC}', null, '2026-10-31', 1000),
      ('${EMP}', '${FORA}',    '${REC}', null, '2026-10-31', 500),   -- origem Play 1: excluída em outubro
      -- 04/11 (par, depois da troca = Tiago + Agatha)
      ('${EMP}', '${AGATHA}',  '${REC}', null, '2026-11-04', 40),
      ('${EMP}', '${OPERADOR}','${REC}', null, '2026-11-04', 200),
      -- 05/11 (ímpar, depois da troca = Matheus + Gabriel)
      ('${EMP}', '${MATHEUS}', '${REC}', null, '2026-11-05', 80),
      ('${EMP}', '${GABRIEL}', '${REC}', null, '2026-11-05', 20),
      ('${EMP}', '${FORA}',    '${REC}', null, '2026-11-05', 500);   -- em novembro a origem conta
    insert into public.analitico_exclusoes_setor values ('${EMP}', '${REC}', '2026-10', '${OUTRO}');
  `);
  await db.exec(SQL);
  await db.exec(SQL); // reaplicar não quebra nem duplica o passado
});

afterAll(async () => { await db.close(); });

describe('migration 20261105160000 — histórico do Plantão Elite', () => {
  it('semeia o início com os dias trocados e a troca de 01/11 com a escala de hoje', async () => {
    const r = await db.query<{ desde: string; plantao: string; n: number }>(`
      select desde::text, plantao, count(*)::int n from public.elite_plantao_escala
       where perfil_id in ('${TIAGO}', '${AGATHA}') group by 1, 2 order by 1`);
    expect(r.rows).toEqual([
      { desde: '2026-09-19', plantao: 'impar', n: 2 },
      { desde: '2026-11-01', plantao: 'par', n: 2 },
    ]);
  });

  it('o quadro do dia usa a dupla daquele dia, não a de hoje', async () => {
    const ids = (q: { membros: { id: string }[] }) => q.membros.map(m => m.id);
    expect(ids(await quadro(GERENTE, '2026-10-31'))).toEqual([TIAGO, AGATHA]);   // ímpar antes da troca
    expect(ids(await quadro(GERENTE, '2026-11-05'))).toEqual([MATHEUS, GABRIEL]); // ímpar depois
    expect(ids(await quadro(GERENTE, '2026-11-04'))).toEqual([TIAGO, AGATHA]);   // par depois
    const doTiago = await quadro(TIAGO, '2026-10-20'); // par, mas em outubro ele era do ímpar
    expect(doTiago).toMatchObject({ plantao: 'impar', sou_da_dupla: true });
    expect(ids(doTiago)).toEqual([TIAGO, AGATHA]);
  });

  it('a gerência vê todos os dias, com a dupla e o recebido de cada um', async () => {
    const h = await historico(GERENTE, '2026-10-31', '2026-11-05');
    expect(h.inicio).toBe('2026-09-19');
    expect(h.sou_da_dupla).toBe(false);
    expect(h.dias.map(d => d.data)).toEqual([
      '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05']);

    const d31 = h.dias[0];
    expect(d31.plantao).toBe('impar');
    expect(d31.membros).toEqual([
      { id: TIAGO, valor: 150, qtd: 2 },
      { id: AGATHA, valor: 70, qtd: 1 },
    ]);
    // Setor: tudo do Receptivo menos a origem Play 1, excluída em outubro.
    expect(Number(d31.setor_total)).toBe(100 + 50 + 70 + 999 + 1000);

    const d05 = h.dias[5];
    expect(d05.membros.map(m => [m.id, Number(m.valor)])).toEqual([[MATHEUS, 80], [GABRIEL, 20]]);
    expect(Number(d05.setor_total)).toBe(600); // em novembro a origem Play 1 conta

    expect(h.dias[1].membros.map(m => m.id)).toEqual([MATHEUS, GABRIEL]); // 01/11 já é a escala nova
    expect(h.pessoas.map(p => p.id).sort()).toEqual([TIAGO, AGATHA, MATHEUS, GABRIEL].sort());
  });

  it('quem é de dupla vê só os dias em que esteve de plantão', async () => {
    const h = await historico(TIAGO, '2026-10-31', '2026-11-05');
    expect(h.sou_da_dupla).toBe(true);
    // 31/10 (ímpar, antiga), 02/11 e 04/11 (par, nova).
    expect(h.dias.map(d => d.data)).toEqual(['2026-10-31', '2026-11-02', '2026-11-04']);
    expect(h.pessoas.map(p => p.id).sort()).toEqual([TIAGO, AGATHA].sort());
  });

  it('não começa antes do início nem passa de hoje', async () => {
    const h = await historico(GERENTE, '2026-01-01', '2026-09-20');
    expect(h.dias.map(d => d.data)).toEqual(['2026-09-19', '2026-09-20']);
  });

  it('sem a chave, nada', async () => {
    await expect(historico(OPERADOR, null, null)).rejects.toThrow(/Sem permissão/);
  });

  it('mudar a escala tira o retrato de hoje, sem mexer no passado', async () => {
    await db.query(`update public.elite_plantao set ordem = 3 where perfil_id = '${GABRIEL}'`);
    const r = await db.query<{ desde: string; n: number }>(`
      select desde::text, count(*)::int n from public.elite_plantao_escala group by 1 order by 1`);
    const hoje = (await db.query<{ h: string }>(
      "select ((now() at time zone 'America/Sao_Paulo')::date)::text h")).rows[0].h;
    expect(r.rows.find(x => x.desde === hoje)?.n).toBe(4);
    expect(r.rows.find(x => x.desde === '2026-09-19')?.n).toBe(4);
    const g = await db.query<{ ordem: number }>(`
      select ordem from public.elite_plantao_escala where desde = '2026-09-19' and perfil_id = '${GABRIEL}'`);
    expect(g.rows[0].ordem).toBe(2);
  });
});

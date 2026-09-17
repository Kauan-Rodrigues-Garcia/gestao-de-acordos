// @vitest-environment node
/**
 * realtimeSinal.sql.test.ts — as migrations 20260917100000 e 20260917110000
 * rodando num Postgres de verdade (PGlite).
 *
 * O gatilho é por COMANDO e lê tabela de transição: um erro de nome ou de ramo
 * só aparece quando a importação roda. Aqui ele roda — INSERT, UPSERT, UPDATE
 * que troca de empresa e DELETE — sobre um `realtime` de mentira que só grava o
 * que seria enviado.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const EMPRESA = '00000000-0000-4000-8000-000000000001';
const OUTRA   = '00000000-0000-4000-8000-000000000002';
const ANA     = '00000000-0000-4000-8000-0000000000c1';
const BRUNO   = '00000000-0000-4000-8000-0000000000c2';

const MIGRATIONS = resolve(__dirname, '../../../supabase/migrations');
const VIEWS = readFileSync(resolve(MIGRATIONS, '20260917100000_views_do_mestre_fechadas_para_anon.sql'), 'utf8');
const SINAL = readFileSync(resolve(MIGRATIONS, '20260917110000_realtime_sinal_por_broadcast.sql'), 'utf8');

let db: PGlite;

interface Enviado { topic: string; event: string; payload: { tabela: string; operacao: string; importado_por: string[] } }

async function enviados(): Promise<Enviado[]> {
  const r = await db.query<Enviado>('select topic, event, payload from realtime.enviados order by n');
  return r.rows;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$ select null::uuid $$;

    -- O suficiente do schema realtime para a migration aplicar e o gatilho rodar.
    create schema realtime;
    create table realtime.messages (topic text, extension text, payload jsonb, event text, private boolean);
    alter table realtime.messages enable row level security;
    create function realtime.topic() returns text language sql stable
      as $$ select nullif(current_setting('realtime.topic', true), '') $$;
    create table realtime.enviados (n serial, topic text, event text, payload jsonb, private boolean);
    create function realtime.send(payload jsonb, event text, topic text, private boolean default true)
      returns void language sql
      as $$ insert into realtime.enviados (topic, event, payload, private) values (topic, event, payload, private) $$;

    create function public.fn_can_access_empresa(id uuid) returns boolean language sql
      as $$ select id = '${EMPRESA}'::uuid $$;

    create table public.analitico_recebimentos (
      id serial primary key, empresa_id uuid, codigo text unique, valor numeric,
      importado_por_id uuid);
    create table public.cargos_permissoes (cargo text primary key, empresa_id uuid, permissoes jsonb);
    create table public.perfis_permissoes (perfil_id uuid primary key, empresa_id uuid);
    create table public.vendas (id serial primary key, empresa_id uuid);
    create table public.rh_lancamentos (id serial primary key, empresa_id uuid);
    create table public.rh_fechamentos (id serial primary key, empresa_id uuid);
    create table public.chat_conversas (id serial primary key);
    create table public.acordos (id serial primary key);

    create publication supabase_realtime for table
      public.analitico_recebimentos, public.chat_conversas, public.acordos;

    -- Para a migration das views: os objetos que ela ajusta.
    create table public.mestre_recebimentos (empresa_id uuid, valor numeric);
    create view public.vw_mestre_contribuicao_analitico as select * from public.mestre_recebimentos;
    create view public.vw_mestre_projecao_analitico as select * from public.mestre_recebimentos;
    grant select on public.vw_mestre_contribuicao_analitico, public.vw_mestre_projecao_analitico to anon;
    create function public.fn_mestre_aplicar_no_analitico_interno(uuid, text, uuid, uuid)
      returns jsonb language sql security definer as $$ select '{}'::jsonb $$;
    create function public.fn_desafio_pessoas_interna(uuid)
      returns jsonb language sql security definer as $$ select '[]'::jsonb $$;
    grant execute on function public.fn_mestre_aplicar_no_analitico_interno(uuid, text, uuid, uuid) to anon;
    grant execute on function public.fn_desafio_pessoas_interna(uuid) to anon;
  `);
  await db.exec(VIEWS);
  await db.exec(SINAL);
  // Reaplicar não pode quebrar nem duplicar gatilho.
  await db.exec(VIEWS);
  await db.exec(SINAL);
});

beforeEach(async () => {
  // O delete também avisa — por isso a limpeza da fila vem depois.
  await db.exec('delete from public.analitico_recebimentos; truncate realtime.enviados;');
});

afterAll(async () => { await db.close(); });

describe('20260917100000 — views e funções do mestre', () => {
  it('anon não lê as views e elas passam a security_invoker', async () => {
    const r = await db.query<{ relname: string; anon_le: boolean; opcoes: string[] }>(`
      select c.relname, has_table_privilege('anon', c.oid, 'SELECT') anon_le, c.reloptions opcoes
        from pg_class c where c.relname like 'vw_mestre_%' order by 1`);
    expect(r.rows).toEqual([
      { relname: 'vw_mestre_contribuicao_analitico', anon_le: false, opcoes: ['security_invoker=true'] },
      { relname: 'vw_mestre_projecao_analitico',     anon_le: false, opcoes: ['security_invoker=true'] },
    ]);
  });

  it('anon não executa as duas funções internas', async () => {
    const r = await db.query<{ anon: boolean }>(`
      select has_function_privilege('anon', p.oid, 'EXECUTE') anon from pg_proc p
       where p.proname in ('fn_mestre_aplicar_no_analitico_interno', 'fn_desafio_pessoas_interna')`);
    expect(r.rows).toEqual([{ anon: false }, { anon: false }]);
  });
});

describe('20260917110000 — o gatilho avisa por comando', () => {
  it('uma importação em lote vira UM aviso por empresa, com quem importou', async () => {
    await db.exec(`
      insert into public.analitico_recebimentos (empresa_id, codigo, valor, importado_por_id)
      select '${EMPRESA}', 'nr' || g, g, '${ANA}' from generate_series(1, 500) g;`);

    expect(await enviados()).toEqual([{
      topic: `analitico:${EMPRESA}`, event: 'mudou',
      payload: { tabela: 'analitico_recebimentos', operacao: 'INSERT', importado_por: [ANA] },
    }]);
  });

  it('duas empresas no mesmo comando avisam as duas', async () => {
    await db.exec(`
      insert into public.analitico_recebimentos (empresa_id, codigo, importado_por_id) values
        ('${EMPRESA}', 'a', '${ANA}'), ('${OUTRA}', 'b', '${BRUNO}'), ('${EMPRESA}', 'c', '${BRUNO}');`);

    const r = await enviados();
    expect(r.map(e => e.topic).sort()).toEqual([`analitico:${EMPRESA}`, `analitico:${OUTRA}`]);
    expect(r.find(e => e.topic.endsWith(EMPRESA))!.payload.importado_por.sort()).toEqual([ANA, BRUNO].sort());
  });

  it('upsert avisa a parte inserida e a parte atualizada', async () => {
    await db.exec(`insert into public.analitico_recebimentos (empresa_id, codigo) values ('${EMPRESA}', 'x');`);
    await db.exec('truncate realtime.enviados;');

    await db.exec(`
      insert into public.analitico_recebimentos (empresa_id, codigo, valor) values
        ('${EMPRESA}', 'x', 1), ('${EMPRESA}', 'y', 2)
      on conflict (codigo) do update set valor = excluded.valor;`);

    expect((await enviados()).map(e => e.payload.operacao).sort()).toEqual(['INSERT', 'UPDATE']);
  });

  it('UPDATE que troca de empresa avisa a de origem e a de destino', async () => {
    await db.exec(`insert into public.analitico_recebimentos (empresa_id, codigo) values ('${EMPRESA}', 'z');`);
    await db.exec('truncate realtime.enviados;');

    await db.exec(`update public.analitico_recebimentos set empresa_id = '${OUTRA}' where codigo = 'z';`);

    expect((await enviados()).map(e => e.topic).sort()).toEqual([`analitico:${EMPRESA}`, `analitico:${OUTRA}`]);
  });

  it('DELETE avisa, e comando sem linha não avisa nada', async () => {
    await db.exec(`insert into public.analitico_recebimentos (empresa_id, codigo) values ('${EMPRESA}', 'd');`);
    await db.exec('truncate realtime.enviados;');

    await db.exec(`delete from public.analitico_recebimentos where codigo = 'nao-existe';`);
    expect(await enviados()).toEqual([]);

    await db.exec(`delete from public.analitico_recebimentos where codigo = 'd';`);
    expect(await enviados()).toEqual([{
      topic: `analitico:${EMPRESA}`, event: 'mudou',
      payload: { tabela: 'analitico_recebimentos', operacao: 'DELETE', importado_por: [] },
    }]);
  });

  it('tabelas sem importado_por_id usam o próprio prefixo e lista vazia', async () => {
    await db.exec(`
      insert into public.cargos_permissoes values ('operador', '${EMPRESA}', '{}');
      insert into public.vendas (empresa_id) values ('${EMPRESA}');
      insert into public.rh_fechamentos (empresa_id) values ('${EMPRESA}');`);

    expect((await enviados()).map(e => [e.topic, e.payload.importado_por])).toEqual([
      [`permissoes:${EMPRESA}`, []],
      [`vendas:${EMPRESA}`, []],
      [`rh:${EMPRESA}`, []],
    ]);
  });

  it('são três gatilhos por tabela, sem duplicar ao reaplicar', async () => {
    const r = await db.query<{ n: number }>(
      `select count(*)::int n from pg_trigger where tgname like 'trg_realtime_sinal_%'`);
    expect(r.rows[0].n).toBe(18);
  });
});

describe('20260917110000 — publicação e autorização', () => {
  it('tira o analítico e as tabelas sem assinante, e deixa o resto', async () => {
    const r = await db.query<{ tablename: string }>(
      `select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by 1`);
    expect(r.rows.map(x => x.tablename)).toEqual(['acordos']);
  });

  it('ouve só quem acessa a empresa do tópico; tópico malformado nega', async () => {
    const pode = async (topico: string) => (await db.query<{ v: boolean }>(
      'select public.fn_realtime_posso_ouvir_empresa($1) v', [topico])).rows[0].v;

    expect(await pode(`analitico:${EMPRESA}`)).toBe(true);
    expect(await pode(`analitico:${OUTRA}`)).toBe(false);
    expect(await pode('analitico:nao-e-uuid')).toBe(false);
    expect(await pode('analitico')).toBe(false);
  });
});

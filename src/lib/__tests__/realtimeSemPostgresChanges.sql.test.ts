// @vitest-environment node
/**
 * realtimeSemPostgresChanges.sql.test.ts — a migration 20261013170000 rodando
 * num Postgres de verdade (PGlite).
 *
 * O aviso com os ids é por COMANDO e lê tabela de transição, e a empresa da
 * filha vem do pai por SQL dinâmico: erro de nome ou de ramo só aparece quando
 * a linha é gravada. Aqui ela é gravada, sobre um `realtime` de mentira que só
 * guarda o que seria enviado.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const EMPRESA = '00000000-0000-4000-8000-000000000001';
const OUTRA   = '00000000-0000-4000-8000-000000000002';
const ANA     = '00000000-0000-4000-8000-0000000000c1';
const BRUNO   = '00000000-0000-4000-8000-0000000000c2';
const PEDIDO  = '00000000-0000-4000-8000-0000000000a1';
const TICKET  = '00000000-0000-4000-8000-0000000000b1';
const FESTA   = '00000000-0000-4000-8000-0000000000f1';

const MIGRATION = readFileSync(
  resolve(__dirname, '../../../supabase/migrations/20261013170000_realtime_sem_postgres_changes.sql'), 'utf8');

let db: PGlite;

interface Enviado { topic: string; payload: Record<string, unknown> }

async function enviados(): Promise<Enviado[]> {
  return (await db.query<Enviado>('select topic, payload from realtime.enviados order by n')).rows;
}

const TABELAS = [
  'autorizacoes_pedidos', 'contribuicao_receptivo', 'numeros_celulares', 'numeros_whatsapp',
  'numeros_config', 'numeros_lixeira', 'analitico_ajustes_manuais', 'solicitacoes_whatsapp',
  'solicitacoes_whatsapp_mensagens', 'solicitacoes_whatsapp_leitura', 'tickets',
  'tickets_mensagens', 'tickets_eventos', 'comemoracao_parabens', 'nr_registros',
];

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$ select null::uuid $$;

    create schema realtime;
    create table realtime.messages (topic text, extension text, payload jsonb, event text, private boolean);
    alter table realtime.messages enable row level security;
    create function realtime.topic() returns text language sql stable
      as $$ select nullif(current_setting('realtime.topic', true), '') $$;
    create table realtime.enviados (n serial, topic text, event text, payload jsonb, private boolean);
    create function realtime.send(payload jsonb, event text, topic text, private boolean default true)
      returns void language sql
      as $$ insert into realtime.enviados (topic, event, payload, private) values (topic, event, payload, private) $$;

    create function public.fn_realtime_posso_ouvir_empresa(p_topico text) returns boolean language sql
      as $$ select split_part(p_topico, ':', 2) = '${EMPRESA}' $$;
    create policy sinal_mudou_receber on realtime.messages for select to authenticated using (true);

    -- O sinal com fila, reduzido ao que importa aqui: um envio por empresa.
    create function public.fn_realtime_sinal_mudou() returns trigger language plpgsql as $$
    declare v_empresa uuid;
    begin
      for v_empresa in
        select distinct e from (
          select n.empresa_id e from novas n where tg_op <> 'DELETE'
        ) x where e is not null
      loop
        perform realtime.send(jsonb_build_object('tabela', tg_table_name, 'operacao', tg_op),
          'mudou', tg_argv[0] || ':' || v_empresa::text, true);
      end loop;
      return null;
    end $$;

    create schema supabase_migrations;
    create table supabase_migrations.schema_migrations (version text primary key, name text, statements text[]);

    create table public.autorizacoes_pedidos (id uuid primary key default gen_random_uuid(), empresa_id uuid);
    create table public.contribuicao_receptivo (id uuid primary key default gen_random_uuid(), empresa_id uuid);
    create table public.numeros_celulares (id uuid primary key default gen_random_uuid(), empresa_id uuid);
    create table public.numeros_whatsapp (id uuid primary key default gen_random_uuid(), empresa_id uuid);
    create table public.numeros_config (empresa_id uuid primary key);
    create table public.numeros_lixeira (id uuid primary key default gen_random_uuid(), empresa_id uuid);
    create table public.analitico_ajustes_manuais (id uuid primary key default gen_random_uuid(), empresa_id uuid);
    create table public.solicitacoes_whatsapp (id uuid primary key, empresa_id uuid, nome_cliente text);
    create table public.solicitacoes_whatsapp_mensagens (
      id uuid primary key default gen_random_uuid(), empresa_id uuid, solicitacao_id uuid, autor_id uuid, conteudo text);
    create table public.solicitacoes_whatsapp_leitura (empresa_id uuid, solicitacao_id uuid, usuario_id uuid,
      primary key (solicitacao_id, usuario_id));
    create table public.tickets (id uuid primary key, empresa_id uuid, assunto text);
    create table public.tickets_mensagens (id uuid primary key default gen_random_uuid(), ticket_id uuid, autor_id uuid, texto text);
    create table public.tickets_eventos (id uuid primary key default gen_random_uuid(), ticket_id uuid, autor_id uuid);
    create table public.comemoracoes (id uuid primary key, empresa_id uuid);
    create table public.comemoracao_parabens (comemoracao_id uuid, usuario_id uuid, frase text);
    create table public.nr_registros (id uuid primary key default gen_random_uuid(), empresa_id uuid);

    create publication supabase_realtime for table ${TABELAS.map(t => `public.${t}`).join(', ')};
  `);
  await db.exec(MIGRATION);
});

afterAll(async () => { await db.close(); });

beforeEach(async () => { await db.exec('truncate realtime.enviados'); });

describe('migration 20261013170000', () => {
  it('a publicação fica vazia', async () => {
    const r = await db.query("select count(*)::int n from pg_publication_tables where pubname = 'supabase_realtime'");
    expect(r.rows[0]).toEqual({ n: 0 });
  });

  it('a policy passa a aceitar os sete nomes novos', async () => {
    const r = await db.query<{ qual: string }>(
      "select qual from pg_policies where schemaname = 'realtime' and policyname = 'sinal_mudou_receber'");
    for (const nome of ['autorizacoes', 'contribuicao', 'numeros', 'ajustes', 'solicitacoes', 'tickets', 'parabens', 'analitico']) {
      expect(r.rows[0].qual).toContain(`'${nome}'::text`);
    }
  });

  it('lista relida vai pelo sinal com fila', async () => {
    await db.exec(`insert into public.numeros_config (empresa_id) values ('${EMPRESA}')`);
    await db.exec(`insert into public.autorizacoes_pedidos (empresa_id) values ('${EMPRESA}')`);
    expect((await enviados()).map(e => e.topic)).toEqual([`numeros:${EMPRESA}`, `autorizacoes:${EMPRESA}`]);
  });
});

describe('aviso com os ids', () => {
  beforeAll(async () => {
    await db.exec(`
      insert into public.solicitacoes_whatsapp (id, empresa_id, nome_cliente) values ('${PEDIDO}', '${EMPRESA}', 'Cliente');
      insert into public.tickets (id, empresa_id, assunto) values ('${TICKET}', '${OUTRA}', 'Assunto');
      insert into public.comemoracoes (id, empresa_id) values ('${FESTA}', '${EMPRESA}');
    `);
  });

  it('mensagem leva o pedido e o autor — nunca o conteúdo', async () => {
    await db.exec(`insert into public.solicitacoes_whatsapp_mensagens (empresa_id, solicitacao_id, autor_id, conteudo)
                   values ('${EMPRESA}', '${PEDIDO}', '${ANA}', 'texto secreto')`);
    const [e] = await enviados();
    expect(e.topic).toBe(`solicitacoes:${EMPRESA}`);
    expect(e.payload).toEqual({
      tabela: 'solicitacoes_whatsapp_mensagens', operacao: 'INSERT', ids: [PEDIDO], autores: [ANA],
    });
    expect(JSON.stringify(e.payload)).not.toContain('secreto');
  });

  it('filha sem empresa_id acha a empresa no pai', async () => {
    await db.exec(`insert into public.tickets_mensagens (ticket_id, autor_id, texto) values ('${TICKET}', '${BRUNO}', 'oi')`);
    await db.exec(`insert into public.comemoracao_parabens (comemoracao_id, usuario_id, frase) values ('${FESTA}', '${ANA}', 'Parabéns!')`);
    const avisos = await enviados();
    expect(avisos.map(e => e.topic)).toEqual([`tickets:${OUTRA}`, `parabens:${EMPRESA}`]);
    expect(avisos[0].payload).toMatchObject({ tabela: 'tickets_mensagens', ids: [TICKET], autores: [BRUNO] });
    expect(avisos[1].payload).toMatchObject({ tabela: 'comemoracao_parabens', ids: [FESTA], autores: [ANA] });
  });

  it('UPDATE avisa uma vez por empresa, com os ids sem repetição', async () => {
    await db.exec(`update public.solicitacoes_whatsapp set nome_cliente = 'Outro' where id = '${PEDIDO}'`);
    const avisos = await enviados();
    expect(avisos).toHaveLength(1);
    expect(avisos[0].payload).toEqual({ tabela: 'solicitacoes_whatsapp', operacao: 'UPDATE', ids: [PEDIDO], autores: [] });
  });

  it('acima de 200 ids, só «recarregar»', async () => {
    await db.exec(`insert into public.tickets (id, empresa_id, assunto)
                   select gen_random_uuid(), '${EMPRESA}', 'lote' from generate_series(1, 201)`);
    const [e] = await enviados();
    expect(e.payload).toEqual({ tabela: 'tickets', operacao: 'INSERT', recarregar: true });
  });

  it('DELETE de filha cujo pai já sumiu não avisa (o pai avisou)', async () => {
    await db.exec(`insert into public.tickets_eventos (ticket_id, autor_id) values ('${TICKET}', '${ANA}')`);
    await db.exec(`truncate realtime.enviados`);
    await db.exec(`delete from public.tickets where id = '${TICKET}'`);
    await db.exec(`delete from public.tickets_eventos where ticket_id = '${TICKET}'`);
    expect((await enviados()).map(e => e.payload.tabela)).toEqual(['tickets']);
  });
});

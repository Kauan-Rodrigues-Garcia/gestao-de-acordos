// @vitest-environment node
/**
 * pixNrUnicoPorMes.sql.test.ts — a migration 20261026140000 num Postgres de
 * verdade (PGlite).
 *
 * O caso que a motivou: o NR 12963612 era da Agatha desde 10/08, e em 26/10 a
 * Erika quis registrá-lo — o sistema abriu um pedido de transferência por causa
 * de um registro de dois meses antes. Agora o NR é único DENTRO DO MÊS: outra
 * pessoa só barra no mesmo mês, e a mesma pessoa continua barrada em qualquer
 * mês.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const EMPRESA = '00000000-0000-4000-8000-000000000001';
const RECEPTIVO = '00000000-0000-4000-8000-0000000000b1';
const PLAY3 = '00000000-0000-4000-8000-0000000000b2';

const P = {
  agatha: '00000000-0000-4000-8000-0000000000a1',
  erika:  '00000000-0000-4000-8000-0000000000a2',
  ana:    '00000000-0000-4000-8000-0000000000a3',
  lider:  '00000000-0000-4000-8000-0000000000a4',
};

const MIGRATION = readFileSync(
  resolve(__dirname, '../../../supabase/migrations/20261026140000_pix_nr_unico_por_mes.sql'),
  'utf8',
);

let db: PGlite;

async function como(usuarioId: string, sql: string, params: unknown[] = []) {
  await db.query(`select set_config('request.jwt.claims', $1, false)`,
    [JSON.stringify({ sub: usuarioId, role: 'authenticated' })]);
  return db.query<Record<string, unknown>>(sql, params);
}

/** Registra no Pix pela porta normal (o trigger decide). `quando` é SQL. */
const registrar = (operador: string, nome: string, nr: string, quando = 'now()') =>
  db.exec(`insert into public.pix_automatico_acordos (empresa_id, operador_id, operador_nome, setor_id, nr_cliente, valor, criado_em)
           values ('${EMPRESA}', '${operador}', '${nome}', '${RECEPTIVO}', '${nr}', 100, ${quando})`);

const registrosDo = async (nr: string) =>
  (await db.query<{ operador_nome: string; status: string }>(
    `select operador_nome, status from public.pix_automatico_acordos where nr_cliente = $1 order by criado_em`, [nr])).rows;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid
    $$;

    create table public.perfis (id uuid primary key, empresa_id uuid, setor_id uuid, nome text);
    insert into public.perfis values
      ('${P.agatha}', '${EMPRESA}', '${RECEPTIVO}', 'Agatha Rocha'),
      ('${P.erika}',  '${EMPRESA}', '${RECEPTIVO}', 'Erika Eduarda'),
      ('${P.ana}',    '${EMPRESA}', '${PLAY3}',     'Ana'),
      ('${P.lider}',  '${EMPRESA}', '${RECEPTIVO}', 'Líder');

    create function public.fn_pix_nr_normalizar(p_nr text) returns text language sql immutable as $$ select lower(trim(p_nr)) $$;
    create function public.fn_user_tem(p text) returns boolean language sql stable as $$ select true $$;
    create function public.fn_can_access_empresa(p uuid) returns boolean language sql stable as $$ select true $$;
    create function public.fn_pix_pode_decidir_lado(p_empresa uuid, p_setor uuid) returns boolean language sql stable as $$ select true $$;
    create function public.fn_pix_valor_br(p numeric) returns text language sql immutable as $$ select p::text $$;

    create table public.pix_automatico_acordos (
      id uuid primary key default gen_random_uuid(),
      empresa_id uuid not null, operador_id uuid, operador_nome text, setor_id uuid,
      nr_cliente text not null, valor numeric not null, extra boolean not null default false,
      status text not null default 'pendente', pago boolean not null default false,
      duplicidade_autorizada boolean not null default false,
      criado_em timestamptz not null default now()
    );
    -- O índice de antes (empresa + NR), que a migration troca.
    create unique index idx_pix_auto_nr_unico on public.pix_automatico_acordos
      (empresa_id, public.fn_pix_nr_normalizar(nr_cliente)) where not duplicidade_autorizada;

    create table public.pix_automatico_nr_pedidos (
      id uuid primary key default gen_random_uuid(),
      empresa_id uuid not null, operador_id uuid not null, operador_nome text, setor_id uuid,
      nr_cliente text not null, valor numeric not null, extra boolean not null default false,
      status text not null default 'pendente' check (status in ('pendente', 'aprovado', 'recusado')),
      conflito_acordo_id uuid, conflito_operador text, conflito_operador_id uuid, conflito_setor_id uuid,
      conflito_valor numeric, conflito_status text, conflito_em timestamptz,
      motivo text, criado_por uuid, criado_em timestamptz not null default now(),
      decidido_por uuid, decidido_por_nome text, decidido_em timestamptz, decisao_motivo text, acordo_id uuid
    );
    create unique index ux_pix_nr_pedido_aberto on public.pix_automatico_nr_pedidos
      (empresa_id, operador_id, public.fn_pix_nr_normalizar(nr_cliente)) where status = 'pendente';

    create table public.pix_automatico_nr_pedido_aprovacoes (
      id uuid primary key default gen_random_uuid(), pedido_id uuid, lado text, setor_id uuid,
      aprovador_id uuid, aprovador_nome text, aprovado boolean, motivo text,
      unique (pedido_id, lado)
    );
    create table public.lixeira_pix_automatico (
      id uuid primary key default gen_random_uuid(), empresa_id uuid, acordo_id uuid, nr_cliente text,
      valor numeric, status text, operador_id uuid, operador_nome text, setor_id uuid, dados_completos jsonb,
      excluido_por uuid, excluido_por_nome text, motivo text, transferido_para_nome text
    );

    -- O trigger que a migration reescreve: precisa existir apontando para ela.
    create function public.fn_pix_nr_bloqueia_duplicado() returns trigger language plpgsql as $$ begin return new; end $$;
    create trigger trg_pix_nr_bloqueia before insert on public.pix_automatico_acordos
      for each row execute function public.fn_pix_nr_bloqueia_duplicado();
  `);

  // Antes da migration: o NR da Agatha de dois meses atrás, e o pedido aberto
  // da Erika (o caso real). E um pedido do MESMO mês, que tem de continuar.
  await registrar(P.agatha, 'Agatha Rocha', '12963612', "now() - interval '2 months'");
  await registrar(P.ana, 'Ana', '555', 'now()');
  await db.exec(`
    insert into public.pix_automatico_nr_pedidos (empresa_id, operador_id, operador_nome, setor_id, nr_cliente, valor, extra, conflito_operador)
    values ('${EMPRESA}', '${P.erika}', 'Erika Eduarda', '${RECEPTIVO}', '12963612', 2784, true, 'Agatha Rocha'),
           ('${EMPRESA}', '${P.erika}', 'Erika Eduarda', '${RECEPTIVO}', '555', 50, false, 'Ana');
  `);

  await db.exec(MIGRATION);
});

afterAll(async () => { await db?.close(); });

describe('os pedidos abertos na hora da migration', () => {
  it('o da Erika (registro antigo de outro mês) vira registro dela, pendente, e o da Agatha fica', async () => {
    expect(await registrosDo('12963612')).toEqual([
      { operador_nome: 'Agatha Rocha', status: 'pendente' },
      { operador_nome: 'Erika Eduarda', status: 'pendente' },
    ]);
    const [pedido] = (await db.query<{ status: string; acordo_id: string | null; decidido_por_nome: string }>(
      `select status, acordo_id, decidido_por_nome from public.pix_automatico_nr_pedidos where nr_cliente = '12963612'`)).rows;
    expect(pedido.status).toBe('aprovado');
    expect(pedido.acordo_id).not.toBeNull();
    expect(pedido.decidido_por_nome).toBe('Sistema');
  });

  it('o do mesmo mês continua na fila', async () => {
    const [pedido] = (await db.query<{ status: string }>(
      `select status from public.pix_automatico_nr_pedidos where nr_cliente = '555'`)).rows;
    expect(pedido.status).toBe('pendente');
  });
});

describe('registrar', () => {
  it('outra pessoa com o NR em outro mês: entra normal', async () => {
    await registrar(P.agatha, 'Agatha Rocha', '777', "now() - interval '1 month'");
    await registrar(P.ana, 'Ana', '777');
    expect((await registrosDo('777')).map(r => r.operador_nome)).toEqual(['Agatha Rocha', 'Ana']);
  });

  it('outra pessoa com o NR no mesmo mês: barra (é o caso do pedido)', async () => {
    await registrar(P.agatha, 'Agatha Rocha', '888');
    await expect(registrar(P.ana, 'Ana', '888')).rejects.toThrow(/já está registrado no Pix automático por Agatha Rocha/);
  });

  it('a mesma pessoa, mesmo em outro mês: continua barrada', async () => {
    await registrar(P.ana, 'Ana', '999', "now() - interval '3 months'");
    await expect(registrar(P.ana, 'Ana', '999')).rejects.toThrow(/PIX_NR_MESMO_OPERADOR/);
  });
});

describe('pedir e decidir', () => {
  it('pedir sobre um NR que só existe em outro mês manda fazer o registro normal', async () => {
    await registrar(P.agatha, 'Agatha Rocha', '1010', "now() - interval '2 months'");
    await expect(como(P.ana, `select public.fn_pix_nr_pedir('${P.ana}', '1010', 10)`))
      .rejects.toThrow(/nao esta com outra pessoa neste mes/);
  });

  it('transferir tira o NR só de quem o tem no mês do pedido', async () => {
    // A Agatha tem o NR em dois meses; a Ana pede o deste mês.
    await registrar(P.agatha, 'Agatha Rocha', '2020', "now() - interval '2 months'");
    await db.exec(`
      insert into public.pix_automatico_acordos (empresa_id, operador_id, operador_nome, setor_id, nr_cliente, valor, duplicidade_autorizada)
      values ('${EMPRESA}', '${P.erika}', 'Erika Eduarda', '${RECEPTIVO}', '2020', 300, false)`);
    const pedido = (await como(P.ana, `select (public.fn_pix_nr_pedir('${P.ana}', '2020', 300)).id as id`)).rows[0].id as string;
    await como(P.lider, `select public.fn_pix_nr_pedido_decidir('${pedido}', true, null, 'solicitante')`);
    await como(P.lider, `select public.fn_pix_nr_pedido_decidir('${pedido}', true, null, 'conflito')`)
      .catch(() => { /* um lado só quando os dois setores são o mesmo */ });

    expect((await registrosDo('2020')).map(r => r.operador_nome)).toEqual(['Agatha Rocha', 'Ana']);
    const lixeira = (await db.query<{ operador_nome: string }>(
      `select operador_nome from public.lixeira_pix_automatico where nr_cliente = '2020'`)).rows;
    expect(lixeira.map(l => l.operador_nome)).toEqual(['Erika Eduarda']);
  });
});

describe('o índice', () => {
  it('é único por empresa, NR e mês', async () => {
    const [{ def }] = (await db.query<{ def: string }>(
      `select indexdef as def from pg_indexes where indexname = 'idx_pix_auto_nr_unico'`)).rows;
    expect(def).toMatch(/fn_pix_mes\(criado_em\)/);
  });
});

// @vitest-environment node
/**
 * Pedido de NR duplicado: autorizar TRANSFERE o NR (migration 20260928190000).
 *
 * Roda a migration de verdade num Postgres isolado (PGlite), sobre um esqueleto
 * das tabelas do Pix. O que se trava aqui é o caso de 28/09/2026: autorizar
 * criava um segundo acordo e deixava o primeiro onde estava — o NR ficava em
 * duas mãos, e a leitura natural do cartão era a oposta.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const EMPRESA = '00000000-0000-4000-8000-000000000001';
const LIDER   = '00000000-0000-4000-8000-0000000000aa';
const JULIANA = '00000000-0000-4000-8000-0000000000b1';
const KAIO    = '00000000-0000-4000-8000-0000000000b2';
const RECEPTIVO = '00000000-0000-4000-8000-0000000000c1';
const PLAY4     = '00000000-0000-4000-8000-0000000000c2';

let db: PGlite;

async function q<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await db.query<T>(sql, params)).rows;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create schema auth;
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;

    create table public.perfis (id uuid primary key, nome text, foto_url text);
    create table public.notificacoes (
      id serial, usuario_id uuid, empresa_id uuid, titulo text, mensagem text, lida boolean,
      rota text, autor_id uuid, autor_nome text, autor_foto text);
    create table public.pix_log (acao text, descricao text, acordo_id uuid);

    create function public.fn_pix_nr_normalizar(t text) returns text language sql immutable as $$ select regexp_replace(coalesce(t,''), '\\D', '', 'g') $$;
    create function public.fn_pix_valor_br(v numeric) returns text language sql as $$ select to_char(v, 'FM999G990D00') $$;
    create function public.fn_pix_pode_decidir_lado(e uuid, s uuid) returns boolean language sql as $$ select true $$;
    create function public.fn_pix_log(e uuid, a uuid, nr text, acao text, descricao text, valor numeric,
                                      op uuid, opn text, antes jsonb, depois jsonb)
      returns void language sql as $$ insert into public.pix_log values (acao, descricao, a) $$;

    create table public.pix_automatico_acordos (
      id uuid primary key default gen_random_uuid(),
      empresa_id uuid not null, operador_id uuid, operador_nome text, setor_id uuid,
      nr_cliente text not null, valor numeric not null, extra boolean not null default false,
      status text not null default 'pendente', duplicidade_autorizada boolean not null default false,
      pago boolean not null default false, criado_em timestamptz not null default now());
    create unique index idx_pix_auto_nr_unico on public.pix_automatico_acordos
      (empresa_id, public.fn_pix_nr_normalizar(nr_cliente)) where (not duplicidade_autorizada);

    create function public.fn_pix_impede_excluir_pago() returns trigger language plpgsql as $$
    begin if old.pago then raise exception 'PIX_PAGO_NAO_EXCLUI'; end if; return old; end $$;
    create trigger trg_pix_a_impede_pago before delete on public.pix_automatico_acordos
      for each row execute function public.fn_pix_impede_excluir_pago();

    create table public.lixeira_pix_automatico (
      id uuid primary key default gen_random_uuid(), empresa_id uuid not null, acordo_id uuid not null,
      nr_cliente text not null, valor numeric not null, status text not null, operador_id uuid,
      operador_nome text, setor_id uuid, dados_completos jsonb not null, excluido_por uuid,
      excluido_por_nome text, excluido_em timestamptz not null default now());

    create table public.pix_automatico_nr_pedidos (
      id uuid primary key default gen_random_uuid(), empresa_id uuid not null, operador_id uuid not null,
      operador_nome text, setor_id uuid, nr_cliente text not null, valor numeric not null,
      extra boolean not null default false,
      conflito_acordo_id uuid references public.pix_automatico_acordos(id) on delete set null,
      conflito_operador text, conflito_valor numeric, conflito_status text, conflito_em timestamptz,
      motivo text, status text not null default 'pendente', decidido_por uuid, decidido_por_nome text,
      decidido_em timestamptz, decisao_motivo text,
      acordo_id uuid references public.pix_automatico_acordos(id) on delete set null,
      criado_por uuid, criado_em timestamptz not null default now(),
      conflito_operador_id uuid, conflito_setor_id uuid);
    create table public.pix_automatico_nr_pedido_aprovacoes (
      id uuid primary key default gen_random_uuid(), pedido_id uuid not null, lado text not null,
      setor_id uuid, aprovador_id uuid, aprovador_nome text, aprovado boolean not null, motivo text,
      criado_em timestamptz not null default now(), unique (pedido_id, lado));

    insert into public.perfis values
      ('${LIDER}', 'Líder', null), ('${JULIANA}', 'Juliana Itala', null), ('${KAIO}', 'Kaio Santana', null);
    select set_config('test.uid', '${LIDER}', false);
  `);
  await db.exec(readFileSync('supabase/migrations/20260928190000_pix_nr_pedido_transfere.sql', 'utf8'));
  // Depois da migration: o trigger usa a função que ela acabou de definir.
  await db.exec(`create trigger trg_pix_b_registra_exclusao before delete on public.pix_automatico_acordos
    for each row execute function public.fn_pix_registrar_exclusao();`);
}, 30000);

afterAll(async () => { await db?.close(); });

beforeEach(async () => {
  // Os acordos saem ANTES das notificações: excluir acordo gera notificação.
  await db.exec(`
    delete from public.pix_automatico_nr_pedido_aprovacoes; delete from public.pix_automatico_nr_pedidos;
    update public.pix_automatico_acordos set pago = false; delete from public.pix_automatico_acordos;
    delete from public.lixeira_pix_automatico; delete from public.notificacoes; delete from public.pix_log;
  `);
});

/** O NR com a Juliana (Receptivo) e o pedido do Kaio (Play 4): dois lados. */
async function cenario(opts: { pago?: boolean } = {}): Promise<string> {
  const [ac] = await q<{ id: string }>(
    `insert into public.pix_automatico_acordos (empresa_id, operador_id, operador_nome, setor_id, nr_cliente, valor, status, pago)
     values ($1, $2, 'Juliana Itala', $3, '12139503', 1690, 'aprovado', $4) returning id`,
    [EMPRESA, JULIANA, RECEPTIVO, opts.pago ?? false]);
  const [p] = await q<{ id: string }>(
    `insert into public.pix_automatico_nr_pedidos (empresa_id, operador_id, operador_nome, setor_id, nr_cliente, valor,
       conflito_acordo_id, conflito_operador, conflito_operador_id, conflito_setor_id, conflito_valor, conflito_status)
     values ($1, $2, 'Kaio Santana', $3, '12139503', 1690, $4, 'Juliana Itala', $5, $6, 1690, 'aprovado') returning id`,
    [EMPRESA, KAIO, PLAY4, ac.id, JULIANA, RECEPTIVO]);
  return p.id;
}

const decidir = (id: string, aprovar: boolean, lado: string) =>
  q(`select * from public.fn_pix_nr_pedido_decidir($1, $2, null, $3)`, [id, aprovar, lado]);

const donos = () => q<{ operador_nome: string; status: string }>(
  `select operador_nome, status from public.pix_automatico_acordos order by criado_em`);

describe('pedido de NR duplicado — autorizar transfere', { concurrent: false }, () => {
  it('um lado só assinado: nada muda ainda', async () => {
    const id = await cenario();
    await decidir(id, true, 'solicitante');
    expect(await donos()).toEqual([{ operador_nome: 'Juliana Itala', status: 'aprovado' }]);
    expect((await q<{ status: string }>(`select status from public.pix_automatico_nr_pedidos`))[0].status).toBe('pendente');
  });

  it('os dois lados autorizam: sai da Juliana e entra para o Kaio — um dono só', async () => {
    const id = await cenario();
    await decidir(id, true, 'solicitante');
    const [p] = await decidir(id, true, 'conflito') as Array<{ status: string; decisao_motivo: string }>;

    expect(await donos()).toEqual([{ operador_nome: 'Kaio Santana', status: 'pendente' }]);
    expect(p.status).toBe('aprovado');
    expect(p.decisao_motivo).toBe('Transferido de Juliana Itala para Kaio Santana.');

    // O da Juliana está na lixeira (recuperável), com quem decidiu.
    const lix = await q<{ operador_nome: string; excluido_por_nome: string }>(
      `select operador_nome, excluido_por_nome from public.lixeira_pix_automatico`);
    expect(lix).toEqual([{ operador_nome: 'Juliana Itala', excluido_por_nome: 'Líder' }]);

    // Ela é avisada com a palavra certa.
    const [n] = await q<{ usuario_id: string; titulo: string; mensagem: string }>(
      `select usuario_id, titulo, mensagem from public.notificacoes`);
    expect(n.usuario_id).toBe(JULIANA);
    expect(n.titulo).toBe('Pix automático — NR transferido');
    expect(n.mensagem).toContain('foi transferido para Kaio Santana');

    // O novo registro não carrega selo de duplicidade: o índice único o protege.
    const [novo] = await q<{ duplicidade_autorizada: boolean }>(
      `select duplicidade_autorizada from public.pix_automatico_acordos`);
    expect(novo.duplicidade_autorizada).toBe(false);
  });

  it('recusar mantém o NR com quem já tinha', async () => {
    const id = await cenario();
    const [p] = await decidir(id, false, 'conflito') as Array<{ status: string }>;
    expect(p.status).toBe('recusado');
    expect(await donos()).toEqual([{ operador_nome: 'Juliana Itala', status: 'aprovado' }]);
    expect(await q(`select 1 from public.lixeira_pix_automatico`)).toHaveLength(0);
  });

  it('comissão já paga não é transferida — e nada se perde', async () => {
    const id = await cenario({ pago: true });
    await decidir(id, true, 'solicitante');
    await expect(decidir(id, true, 'conflito')).rejects.toThrow('PIX_NR_TRANSFERENCIA_PAGA');
    expect(await donos()).toEqual([{ operador_nome: 'Juliana Itala', status: 'aprovado' }]);
    expect(await q(`select 1 from public.lixeira_pix_automatico`)).toHaveLength(0);
  });

  it('quem pediu já tem o NR: só sai dos outros, nada duplica', async () => {
    const id = await cenario();
    // Duplicidade antiga, do tempo em que autorizar duplicava.
    await q(`insert into public.pix_automatico_acordos (empresa_id, operador_id, operador_nome, setor_id, nr_cliente, valor, duplicidade_autorizada)
             values ($1, $2, 'Kaio Santana', $3, '12139503', 1690, true)`, [EMPRESA, KAIO, PLAY4]);
    await decidir(id, true, 'solicitante');
    const [p] = await decidir(id, true, 'conflito') as Array<{ decisao_motivo: string }>;
    expect(await donos()).toEqual([{ operador_nome: 'Kaio Santana', status: 'pendente' }]);
    expect(p.decisao_motivo).toContain('Transferido de Juliana Itala para Kaio Santana.');
  });

  it('exclusão comum continua avisando como exclusão', async () => {
    await cenario();
    await q(`delete from public.pix_automatico_acordos`);
    const [n] = await q<{ titulo: string }>(`select titulo from public.notificacoes`);
    expect(n.titulo).toBe('Pix automático — registro excluído');
  });
});

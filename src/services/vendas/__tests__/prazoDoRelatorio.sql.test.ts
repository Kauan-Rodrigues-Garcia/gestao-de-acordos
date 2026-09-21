// @vitest-environment node
/**
 * prazoDoRelatorio.sql.test.ts — a migration 20260921150000 rodando num
 * Postgres de verdade (PGlite), e não lida como texto.
 *
 * `plpgsql` não valida o corpo na criação (COMERCIAL-ESTADO §2.4). Aqui as
 * funções EXECUTAM, sobre um schema mínimo com as tabelas que elas tocam:
 *
 *   1. o relógio de 1 dia liga quando um GERAL é promovido depois do
 *      lançamento sem trazer o NR — e a prévia do setor também salva;
 *   2. vencido o dia, a venda vai para a lixeira e quem vendeu é avisado;
 *   3. na meta, só com a chave nova `excluir_vendas_na_meta` — que nasce em
 *      elite e gerência, e não em operador nem líder; quem lançou exclui a
 *      própria venda fora da meta.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const EMPRESA  = '00000000-0000-4000-8000-000000000001';
const ANA      = '00000000-0000-4000-8000-0000000000a1'; // operadora
const LEO      = '00000000-0000-4000-8000-0000000000a2'; // líder
const GINA     = '00000000-0000-4000-8000-0000000000a3'; // gerência
const BIA      = '00000000-0000-4000-8000-0000000000a4'; // outra operadora

const MIGRATION = readFileSync(
  resolve(__dirname, '../../../../supabase/migrations/20260921150000_vendas_prazo_do_relatorio_e_exclusao.sql'),
  'utf8',
);

let db: PGlite;

/** Quem está logado, e as chaves que o cargo dele tem. */
async function logar(uid: string, chaves: string[]) {
  await db.query(`select set_config('test.uid', $1, false), set_config('test.chaves', $2, false)`,
    [uid, chaves.join(',')]);
}

async function venda(p: {
  nr: string; operador?: string; criadoPor?: string; origem?: string;
  naMeta?: boolean; dataVenda?: string; criadaHa?: string;
}): Promise<string> {
  const r = await db.query<{ id: string }>(`
    insert into public.vendas (empresa_id, operador_id, criado_por, nr_documento, valor_total,
      data_venda, data_confirmacao, situacao, contrato_assinado, origem, criado_em)
    values ($1, $2, $3, $4, 1000, $5::date,
      case when $6 then $5::date end,
      case when $6 then 'confirmada' else 'aberta' end, $6, $7,
      now() - $8::interval)
    returning id`,
  [EMPRESA, p.operador ?? ANA, p.criadoPor ?? p.operador ?? ANA, p.nr,
    p.dataVenda ?? '2026-09-21', p.naMeta ?? false, p.origem ?? 'manual', p.criadaHa ?? '2 hours']);
  return r.rows[0].id;
}

/** Carrega e promove um lote — é a promoção que dispara o gatilho. */
async function importar(origem: 'geral' | 'setor', nrs: string[], mes = '2026-09-01') {
  const r = await db.query<{ id: string }>(
    `insert into public.vendas_lotes (empresa_id, mes, origem) values ($1, $2, $3) returning id`,
    [EMPRESA, mes, origem]);
  const lote = r.rows[0].id;
  for (const nr of nrs) {
    await db.query(`insert into public.vendas_relatorio (lote_id, empresa_id, nr_documento) values ($1, $2, $3)`,
      [lote, EMPRESA, nr]);
  }
  // O mesmo passo de fn_vendas_lote_promover: aposenta o anterior e promove.
  await db.query(`
    with antigo as (
      update public.vendas_lotes set estado = 'substituido'
       where empresa_id = $1 and mes = $2 and origem = $3 and estado = 'vigente' returning id)
    delete from public.vendas_relatorio where lote_id in (select id from antigo)`,
  [EMPRESA, mes, origem]);
  await db.query(`update public.vendas_lotes set estado = 'vigente', promovido_em = now() where id = $1`, [lote]);
  return lote;
}

async function relogio(id: string): Promise<string | null> {
  const r = await db.query<{ t: string | null }>(
    'select sem_relatorio_desde::text t from public.vendas where id = $1', [id]);
  return r.rows[0]?.t ?? null;
}

async function existe(id: string): Promise<boolean> {
  const r = await db.query<{ n: number }>('select count(*)::int n from public.vendas where id = $1', [id]);
  return r.rows[0].n === 1;
}

async function avisos(): Promise<{ usuario_id: string; titulo: string }[]> {
  const r = await db.query<{ usuario_id: string; titulo: string }>(
    'select usuario_id::text, titulo from public.notificacoes order by titulo, usuario_id');
  return r.rows;
}

async function excluir(id: string): Promise<string | null> {
  try {
    await db.query('select public.fn_venda_excluir($1, null)', [id]);
    return null;
  } catch (e) {
    return (e as { message?: string }).message ?? 'erro';
  }
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql
      as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create function public.fn_user_tem(k text) returns boolean language sql
      as $$ select k = any(string_to_array(coalesce(current_setting('test.chaves', true), ''), ',')) $$;
    create function public.fn_vendas_alcanca(e uuid, o uuid, s uuid, q uuid) returns boolean
      language sql as $$ select e = '${EMPRESA}'::uuid $$;

    create table public.empresas (id uuid primary key, slug text);
    create table public.perfis (id uuid primary key, nome text, perfil text, empresa_id uuid);

    -- O topo da cadeia do catálogo, reduzido às testemunhas que a prova confere.
    create table public.cargos_permissoes (empresa_id uuid, cargo text, permissoes jsonb not null default '{}');
    create function public.fn_permissoes_catalogo_antes_elite_20260919()
      returns table(chave text, tenants text[], padrao text[], explicita boolean) language sql
      as $$ select * from (values
        ('tickets_excluir', null::text[], array[]::text[], false),
        ('excluir_ausencias', array['comercial'], array['lider','elite','gerencia'], false),
        ('excluir_vendas', array['comercial'], array['lider','elite','gerencia'], false)
      ) as t(chave, tenants, padrao, explicita) $$;
    -- A semeadura: acrescenta a chave ausente com o padrão do cargo.
    create function public.fn_permissoes_semear_empresa(p uuid) returns void language plpgsql as $$
    begin
      update public.cargos_permissoes cp
         set permissoes = cp.permissoes || coalesce((
               select jsonb_object_agg(c.chave, cp.cargo = any(c.padrao))
                 from public.fn_permissoes_catalogo() c, public.empresas e
                where e.id = cp.empresa_id
                  and (c.tenants is null or e.slug = any(c.tenants))
                  and not cp.permissoes ? c.chave), '{}'::jsonb)
       where cp.empresa_id = p;
    end $$;

    create table public.vendas_lotes (
      id uuid primary key default gen_random_uuid(), empresa_id uuid not null, mes date not null,
      origem text not null, estado text not null default 'carregando',
      importado_em timestamptz not null default now(), promovido_em timestamptz);
    create table public.vendas_relatorio (
      id uuid primary key default gen_random_uuid(), lote_id uuid not null references public.vendas_lotes(id),
      empresa_id uuid not null, nr_documento text not null);

    create table public.vendas (
      id uuid primary key default gen_random_uuid(), empresa_id uuid not null,
      operador_id uuid not null, setor_id uuid, equipe_id uuid,
      nr_documento text not null, cliente text, uf char(2),
      valor_total numeric(14,2) not null, valor_entrada numeric(14,2), valor_recebido numeric(14,2) not null default 0,
      forma_pagamento text, data_venda date not null, data_confirmacao date,
      situacao text not null default 'aberta', contrato_assinado boolean not null default false,
      motivo text, origem text not null default 'manual',
      confirmado_por uuid, confirmado_em timestamptz,
      criado_por uuid, criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now(),
      lote_id uuid,
      conta_na_meta boolean generated always as (situacao = 'confirmada' and contrato_assinado) stored,
      valor_na_meta numeric(14,2) generated always as (
        case when situacao = 'confirmada' and contrato_assinado then valor_total else 0 end) stored,
      unique (empresa_id, nr_documento));

    create table public.vendas_eventos (
      id uuid primary key default gen_random_uuid(),
      venda_id uuid not null references public.vendas(id) on delete cascade, empresa_id uuid not null,
      tipo text not null check (tipo in ('criada','editada','confirmada','assinada','revertida','excluida','restaurada')),
      situacao_antes text, situacao_depois text, assinado_antes boolean, assinado_depois boolean,
      valor_antes numeric(14,2), valor_depois numeric(14,2), origem text, motivo text, autor_id uuid,
      criado_em timestamptz not null default now());

    create table public.lixeira_vendas (
      id uuid primary key default gen_random_uuid(), venda_id uuid not null, empresa_id uuid not null,
      operador_id uuid, operador_nome text, nr_documento text, cliente text, valor_total numeric(14,2),
      data_venda date, situacao text, contrato_assinado boolean, dados_completos jsonb not null,
      motivo text, excluido_por_id uuid, excluido_por_nome text,
      excluido_em timestamptz not null default now(),
      expira_em timestamptz not null default (now() + interval '7 days'));

    create table public.notificacoes (
      id uuid primary key default gen_random_uuid(), usuario_id uuid, titulo text not null,
      mensagem text not null, lida boolean not null default false, criado_em timestamptz not null default now(),
      empresa_id uuid, rota text);
  `);
  await db.exec(`
    insert into public.empresas values ('${EMPRESA}', 'comercial');
    insert into public.cargos_permissoes (empresa_id, cargo) values
      ('${EMPRESA}', 'operador'), ('${EMPRESA}', 'lider'),
      ('${EMPRESA}', 'elite'), ('${EMPRESA}', 'gerencia');
  `);
  // A migration traz BEGIN/COMMIT e o bloco de prova: aplicar já é o 1º teste.
  await db.exec(MIGRATION);
});

beforeEach(async () => {
  await db.exec(`
    delete from public.notificacoes; delete from public.lixeira_vendas;
    delete from public.vendas_eventos; delete from public.vendas;
    delete from public.vendas_relatorio; delete from public.vendas_lotes;
    delete from public.perfis; delete from public.empresas;
    insert into public.empresas values ('${EMPRESA}', 'comercial');
    insert into public.perfis values
      ('${ANA}', 'Ana', 'operador', '${EMPRESA}'), ('${LEO}', 'Leo', 'lider', '${EMPRESA}'),
      ('${GINA}', 'Gina', 'gerencia', '${EMPRESA}'), ('${BIA}', 'Bia', 'operador', '${EMPRESA}');
  `);
  await logar(ANA, ['criar_vendas']);
});

afterAll(async () => { await db.close(); });

describe('o relógio de 1 dia', () => {
  it('liga quando o geral é promovido sem o NR, e avisa quem vendeu', async () => {
    const id = await venda({ nr: '111' });
    await importar('geral', ['999']);
    expect(await relogio(id)).not.toBeNull();
    expect(await avisos()).toEqual([{ usuario_id: ANA, titulo: 'Venda 111 não veio no relatório' }]);
  });

  it('avisa também quem lançou em nome de outro, uma vez cada', async () => {
    await venda({ nr: '112', operador: BIA, criadoPor: LEO });
    await importar('geral', []);
    expect((await avisos()).map(a => a.usuario_id).sort()).toEqual([LEO, BIA].sort());
  });

  it('NR no geral ou na prévia do setor salva a venda', async () => {
    const noGeral = await venda({ nr: '201' });
    const naPrevia = await venda({ nr: '202' });
    await importar('setor', ['202']);
    await importar('geral', ['201']);
    expect(await relogio(noGeral)).toBeNull();
    expect(await relogio(naPrevia)).toBeNull();
  });

  it('não liga para venda na meta, nem para geral de mês anterior à venda', async () => {
    const naMeta = await venda({ nr: '301', naMeta: true });
    const setembro = await venda({ nr: '302' });
    await importar('geral', [], '2026-08-01');
    expect(await relogio(setembro)).toBeNull();
    await importar('geral', []);
    expect(await relogio(naMeta)).toBeNull();
    expect(await relogio(setembro)).not.toBeNull();
  });

  it('não liga para venda lançada DEPOIS da última importação', async () => {
    await importar('geral', []);
    const depois = await venda({ nr: '401', criadaHa: '0 seconds' });
    await db.query('select public.fn_vendas_prazo_rodar()');
    expect(await relogio(depois)).toBeNull();
  });

  it('desliga quando a prévia traz o NR depois', async () => {
    const id = await venda({ nr: '501' });
    await importar('geral', []);
    expect(await relogio(id)).not.toBeNull();
    await importar('setor', ['501']);
    expect(await relogio(id)).toBeNull();
  });

  it('a importação não cai se o aviso falhar', async () => {
    await venda({ nr: '601' });
    await db.exec('alter table public.notificacoes rename to notificacoes_fora');
    try {
      const lote = await importar('geral', []);
      const r = await db.query<{ estado: string }>('select estado from public.vendas_lotes where id = $1', [lote]);
      expect(r.rows[0].estado).toBe('vigente');
    } finally {
      await db.exec('alter table public.notificacoes_fora rename to notificacoes');
    }
  });
});

describe('vencido o dia', () => {
  it('vai para a lixeira com o motivo, e quem vendeu é avisado', async () => {
    const vencida = await venda({ nr: '701' });
    const noPrazo = await venda({ nr: '702' });
    await importar('geral', []);
    await db.query(`update public.vendas set sem_relatorio_desde = now() - interval '25 hours' where id = $1`, [vencida]);
    await db.query(`update public.vendas set sem_relatorio_desde = now() - interval '23 hours' where id = $1`, [noPrazo]);
    await db.query('delete from public.notificacoes');

    const r = await db.query<{ j: { excluidas: number } }>('select public.fn_vendas_prazo_rodar() j');
    expect(r.rows[0].j.excluidas).toBe(1);
    expect(await existe(vencida)).toBe(false);
    expect(await existe(noPrazo)).toBe(true);

    const lix = await db.query<{ nr_documento: string; motivo: string; excluido_por_nome: string }>(
      'select nr_documento, motivo, excluido_por_nome from public.lixeira_vendas');
    expect(lix.rows).toEqual([{
      nr_documento: '701',
      motivo: 'Não apareceu no relatório geral nem na prévia do setor em 1 dia.',
      excluido_por_nome: 'Sistema — prazo do relatório',
    }]);
    expect(await avisos()).toEqual([{ usuario_id: ANA, titulo: 'Venda 701 excluída' }]);
  });

  it('não exclui se o NR apareceu no meio do caminho', async () => {
    const id = await venda({ nr: '801' });
    await importar('geral', []);
    await db.query(`update public.vendas set sem_relatorio_desde = now() - interval '25 hours' where id = $1`, [id]);
    await importar('setor', ['801']);
    await db.query('select public.fn_vendas_prazo_rodar()');
    expect(await existe(id)).toBe(true);
  });
});

describe('fn_venda_excluir', () => {
  it('quem lançou exclui a própria venda manual, sem a chave', async () => {
    const id = await venda({ nr: '901' });
    expect(await excluir(id)).toBeNull();
    expect(await existe(id)).toBe(false);
  });

  it('sem a chave, não exclui a venda que outro lançou', async () => {
    const id = await venda({ nr: '902', operador: ANA, criadoPor: LEO });
    expect(await excluir(id)).toMatch(/você mesmo lançou/);
  });

  it('venda na meta: nem a própria, nem com excluir_vendas — só com a chave nova', async () => {
    const id = await venda({ nr: '903', naMeta: true });
    expect(await excluir(id)).toMatch(/na meta/);

    await logar(LEO, ['excluir_vendas']);
    expect(await excluir(id)).toMatch(/na meta/);

    await logar(GINA, ['excluir_vendas', 'excluir_vendas_na_meta']);
    expect(await excluir(id)).toBeNull();
    expect(await existe(id)).toBe(false);
  });

  it('o líder continua excluindo o que está fora da meta', async () => {
    const id = await venda({ nr: '904', origem: 'geral', criadoPor: GINA });
    await logar(LEO, ['excluir_vendas']);
    expect(await excluir(id)).toBeNull();
  });
});

describe('a chave excluir_vendas_na_meta', () => {
  it('entra no catálogo uma vez, sem derrubar os elos anteriores', async () => {
    const r = await db.query<{ chave: string }>('select chave from public.fn_permissoes_catalogo() order by chave');
    expect(r.rows.map(l => l.chave)).toEqual([
      'excluir_ausencias', 'excluir_vendas', 'excluir_vendas_na_meta', 'painel_lider_sub_elite', 'tickets_excluir',
    ]);
  });

  it('nasce ligada em elite e gerência, desligada em operador e líder', async () => {
    const r = await db.query<{ cargo: string; liga: boolean }>(
      `select cargo, (permissoes->>'excluir_vendas_na_meta')::boolean liga
         from public.cargos_permissoes order by cargo`);
    expect(r.rows).toEqual([
      { cargo: 'elite', liga: true }, { cargo: 'gerencia', liga: true },
      { cargo: 'lider', liga: false }, { cargo: 'operador', liga: false },
    ]);
  });
});

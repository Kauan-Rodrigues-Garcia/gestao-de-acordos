// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const empresa = '00000000-0000-4000-8000-000000000001';
const setor = '00000000-0000-4000-8000-000000000002';
const usuario = '00000000-0000-4000-8000-000000000003';
const outra = '00000000-0000-4000-8000-000000000004';
let db: PGlite;
const consultar = async (mes = '2026-09', tenant = empresa) => {
  const r = await db.query<{ r: unknown }>('select public.fn_pp_conciliacao_setor($1,$2) r', [tenant, mes]);
  return r.rows[0].r;
};
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create schema private;
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
    create function public.fn_can_access_empresa(id uuid) returns boolean language sql as $$ select id='${empresa}'::uuid $$;
    create function public.fn_user_tem(k text) returns boolean language sql as $$ select k <> coalesce(current_setting('test.negada',true),'') $$;
    create function public.fn_user_escopo(k text) returns integer language sql as $$ select current_setting('test.escopo')::integer $$;
    create table public.empresas(id uuid, slug text);
    create table public.setores(id uuid, empresa_id uuid, alternativo boolean);
    create table public.perfis(id uuid, setor_id uuid);
    create table public.pp_relatorio_conciliacoes(empresa_id uuid, data date, data_pagamento date, total bigint, pp bigint);
    alter table public.pp_relatorio_conciliacoes enable row level security;
    insert into public.empresas values ('${empresa}','pagueplay'),('${outra}','bookplay');
    insert into public.setores values ('${setor}','${empresa}',false);
    insert into public.perfis values ('${usuario}','${setor}');
    insert into public.pp_relatorio_conciliacoes values
      ('${empresa}','2026-09-01','2026-08-31',29044,6564),
      ('${empresa}','2026-09-30','2026-10-01',10001,2469),
      ('${empresa}','2026-08-31','2026-09-01',999999,9999),
      ('${empresa}','2026-10-01','2026-09-30',999999,9999),
      ('${outra}','2026-09-01','2026-09-01',999999,9999);
    select set_config('test.uid','${usuario}',false);
    select set_config('test.escopo','2',false);
    grant usage on schema public,auth to authenticated;
  `);
  const file = readdirSync('supabase/migrations').find(n => n.endsWith('_painel_lider_conciliacao_setor.sql'))!;
  await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'));
  await db.exec('set role authenticated');
}, 30000);
afterAll(async () => { await db?.close(); });

describe.sequential('consulta mensal autorizada no Postgres', () => {
  it('soma todas as linhas da competência, com percentuais diferentes e sem vazamento entre meses/empresas', async () => {
    expect(await consultar()).toEqual({ setor_id: setor, total_centavos: '39045', ho_centavos: '9033', quantidade: 2 });
  });
  it('mês sem importação retorna zero e quantidade zero', async () => {
    expect(await consultar('2026-07')).toEqual({ setor_id: setor, total_centavos: '0', ho_centavos: '0', quantidade: 0 });
  });
  it('não abre acesso direto aos pagamentos individuais', async () => {
    await expect(db.query('select * from public.pp_relatorio_conciliacoes')).rejects.toThrow('permission denied');
  });
  it('nega outra empresa e mês inválido', async () => {
    await expect(consultar('2026-09', outra)).rejects.toThrow('Sem acesso');
    await expect(consultar('2026-13')).rejects.toThrow('Mês inválido');
  });
  it('exige autenticação, aba, subaba e alcance de setor', async () => {
    await db.exec("select set_config('test.uid','',false)");
    await expect(consultar()).rejects.toThrow('Sem acesso');
    await db.query("select set_config('test.uid',$1,false)", [usuario]);
    for (const chave of ['ver_painel_lider', 'painel_lider_sub_desempenho_equipes']) {
      await db.query("select set_config('test.negada',$1,false)", [chave]);
      await expect(consultar()).rejects.toThrow('Sem acesso');
    }
    await db.exec("select set_config('test.negada','',false); select set_config('test.escopo','1',false)");
    await expect(consultar()).rejects.toThrow('Sem acesso');
    await db.exec("select set_config('test.escopo','2',false)");
  });
  it('nega líder de outro setor, mas aceita alcance de empresa', async () => {
    await db.exec(`reset role; update public.perfis set setor_id='${outra}'; set role authenticated`);
    await expect(consultar()).rejects.toThrow('Sem acesso');
    await db.exec("select set_config('test.escopo','3',false)");
    expect(await consultar()).toMatchObject({ total_centavos: '39045' });
  });
  it('não replica o total se aparecer outro setor sem mapeamento no relatório', async () => {
    await db.exec(`reset role; insert into public.setores values ('${outra}','${empresa}',false); set role authenticated`);
    await expect(consultar()).rejects.toThrow('único setor');
  });
});

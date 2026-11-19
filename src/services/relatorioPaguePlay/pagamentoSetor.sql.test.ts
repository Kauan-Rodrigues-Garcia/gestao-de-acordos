// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const empresa = '00000000-0000-4000-8000-000000000001';
const setor = '00000000-0000-4000-8000-000000000002';
const usuario = '00000000-0000-4000-8000-000000000003';
const outra = '00000000-0000-4000-8000-000000000004';
const alternativo = '00000000-0000-4000-8000-000000000005';
let db: PGlite;
const consultar = async (mes = '2026-11', tenant = empresa) => {
  const r = await db.query<{ r: unknown }>('select public.fn_pp_pagamento_setor_por_dia($1,$2) r', [tenant, mes]);
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
    create table public.setores(id uuid, empresa_id uuid, regra text, alternativo boolean, excluido_em timestamptz);
    create table public.perfis(id uuid, setor_id uuid);
    create table public.pp_relatorio_pagamentos(empresa_id uuid, data date, data_pagamento date, total bigint, pp bigint);
    alter table public.pp_relatorio_pagamentos enable row level security;
    insert into public.setores values ('${setor}','${empresa}','cofen',false,null), ('${alternativo}','${empresa}','cofen',true,null);
    insert into public.perfis values ('${usuario}','${setor}');
    insert into public.pp_relatorio_pagamentos values
      ('${empresa}','2026-11-03','2026-11-03',10000,2496),
      ('${empresa}','2026-11-03','2026-11-03',5050,1260),
      ('${empresa}','2026-11-30','2026-11-30',777,194),
      ('${empresa}','2026-10-31','2026-10-31',999999,9999),
      ('${empresa}','2026-12-01','2026-12-01',999999,9999),
      ('${outra}','2026-11-03','2026-11-03',999999,9999);
    select set_config('test.uid','${usuario}',false);
    select set_config('test.escopo','2',false);
    grant usage on schema public,auth to authenticated;
  `);
  const file = readdirSync('supabase/migrations').find(n => n.endsWith('_painel_lider_grafico_pelo_945.sql'))!;
  await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'));
  await db.exec('set role authenticated');
}, 30000);
afterAll(async () => { await db?.close(); });

describe('945 do setor Cofen por dia', { concurrent: false }, () => {
  it('soma por dia da coluna data, só do mês e da empresa', async () => {
    expect(await consultar()).toEqual({
      setor_id: setor,
      dias: [
        { data: '2026-11-03', total_centavos: '15050', ho_centavos: '3756', quantidade: 2 },
        { data: '2026-11-30', total_centavos: '777', ho_centavos: '194', quantidade: 1 },
      ],
    });
  });
  it('mês sem importação devolve lista vazia', async () => {
    expect(await consultar('2026-07')).toEqual({ setor_id: setor, dias: [] });
  });
  it('não abre os pagamentos individuais', async () => {
    await expect(db.query('select * from public.pp_relatorio_pagamentos')).rejects.toThrow('permission denied');
  });
  it('nega outra empresa, mês inválido, sem aba ou subaba e alcance de equipe', async () => {
    await expect(consultar('2026-11', outra)).rejects.toThrow('Sem acesso');
    await expect(consultar('2026-13')).rejects.toThrow('Mês inválido');
    for (const chave of ['ver_painel_lider', 'painel_lider_sub_grafico_recebimento']) {
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
    expect(await consultar()).toMatchObject({ setor_id: setor });
  });
  it('recusa quando não há um único setor Cofen (decide pela regra, não pela empresa)', async () => {
    await db.exec(`reset role; update public.setores set regra = 'nosso_produto' where id = '${setor}'; set role authenticated`);
    await expect(consultar()).rejects.toThrow('único setor Cofen');
    await db.exec(`reset role; update public.setores set regra = 'cofen' where id = '${setor}'; set role authenticated`);
  });
});

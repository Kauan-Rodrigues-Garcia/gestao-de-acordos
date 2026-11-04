// @vitest-environment node
/**
 * banco.sql.test.ts — as migrations do Jornada (20261104180000, 200000 e
 * 210000) rodando em sequência num Postgres de verdade (PGlite, LOCAL — não é o
 * banco de produção), sobre o mínimo do schema de que elas dependem.
 *
 * O que importa provar antes de colar no SQL Editor: as três aplicam em ordem,
 * podem rodar de novo sem quebrar, as chaves novas entram no catálogo sem
 * apagar as antigas, e a regra do setor Jornada vale (equipe «Retenção» de
 * outro setor não ganha a aba).
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const EMP = '00000000-0000-4000-8000-0000000000e0';
const JOR = '00000000-0000-4000-8000-0000000000a1';   // setor Jornada
const REC = '00000000-0000-4000-8000-0000000000a2';   // setor Receptivo
const EQ_SUP = '00000000-0000-4000-8000-0000000000b1'; // equipe Suporte (Jornada)
const EQ_RET = '00000000-0000-4000-8000-0000000000b2'; // equipe Retenção (Receptivo)
const ANA = '00000000-0000-4000-8000-0000000000c1';    // operadora do Suporte do Jornada
const BIA = '00000000-0000-4000-8000-0000000000c2';    // operadora da Retenção do Receptivo

const ler = (n: string) => readFileSync(resolve(__dirname, `../../../supabase/migrations/${n}`), 'utf8');
const SQL = [
  ler('20261104180000_jornada_acesso_e_retencao.sql'),
  ler('20261104200000_jornada_por_equipe.sql'),
  ler('20261104210000_jornada_meta_individual.sql'),
];

let db: PGlite;

async function como<T>(uid: string, sql: string, params: unknown[] = []): Promise<T> {
  await db.query("select set_config('teste.uid', $1, false)", [uid]);
  const r = await db.query<{ v: T }>(sql, params);
  return r.rows[0]?.v as T;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('teste.uid', true), '')::uuid $$;

    create table public.empresas (id uuid primary key, nome text, slug text);
    insert into public.empresas values ('${EMP}', 'BookPlay', 'bookplay');
    create table public.setores (id uuid primary key, nome text, empresa_id uuid, ativo boolean default true);
    insert into public.setores values ('${JOR}', 'Jornada', '${EMP}', true), ('${REC}', 'Receptivo', '${EMP}', true);
    create table public.equipes (id uuid primary key, nome text, setor_id uuid, empresa_id uuid);
    insert into public.equipes values ('${EQ_SUP}', 'Suporte', '${JOR}', '${EMP}'), ('${EQ_RET}', 'Retenção', '${REC}', '${EMP}');
    create table public.equipe_subgrupos (id uuid primary key, nome text, equipe_id uuid, empresa_id uuid);
    create table public.perfis (
      id uuid primary key, nome text, foto_url text, perfil text, ativo boolean default true, arquivado boolean default false,
      empresa_id uuid, setor_id uuid, equipe_id uuid, subgrupo_id uuid, situacao text);
    insert into public.perfis (id, nome, perfil, empresa_id, setor_id, equipe_id) values
      ('${ANA}', 'Ana', 'operador', '${EMP}', '${JOR}', '${EQ_SUP}'),
      ('${BIA}', 'Bia', 'operador', '${EMP}', '${REC}', '${EQ_RET}');

    create function public.fn_user_is_super_admin() returns boolean language sql stable as $$ select false $$;
    create function public.fn_can_access_empresa(target_empresa_id uuid) returns boolean language sql stable as $$ select true $$;
    create function public.fn_user_has_any_role(roles text[]) returns boolean language sql stable
      as $$ select exists (select 1 from public.perfis p where p.id = auth.uid() and p.perfil = any(roles)) $$;
    create function public.fn_setores_do_operador(p_operador uuid) returns setof uuid language sql stable
      as $$ select setor_id from public.perfis where id = p_operador $$;

    -- Permissões: o catálogo antigo (2 chaves) e a semeadura que reconstrói o mapa pelo catálogo.
    create table public.cargos_permissoes (empresa_id uuid, cargo text, permissoes jsonb, primary key (empresa_id, cargo));
    insert into public.cargos_permissoes values ('${EMP}', 'operador', '{"ver_acordos": true, "ver_pix_automatico": false}');
    create function public.fn_permissoes_catalogo()
      returns table(chave text, tenants text[], padrao text[], explicita boolean) language sql immutable
      as $$ select * from (values ('ver_acordos', null::text[], array['operador']::text[], false),
                                  ('ver_pix_automatico', null::text[], array['operador']::text[], false)) v(chave, tenants, padrao, explicita) $$;
    create function public.fn_permissoes_semear_empresa(p_empresa_id uuid) returns integer language plpgsql as $$
    declare v_cargo text; v_atual jsonb; v_mapa jsonb; r record;
    begin
      foreach v_cargo in array array['operador','lider'] loop
        select coalesce(permissoes, '{}') into v_atual from public.cargos_permissoes where empresa_id = p_empresa_id and cargo = v_cargo;
        v_atual := coalesce(v_atual, '{}'); v_mapa := '{}';
        for r in select * from public.fn_permissoes_catalogo() loop
          v_mapa := v_mapa || jsonb_build_object(r.chave,
            case when v_atual ? r.chave then (v_atual -> r.chave)::boolean else v_cargo = any(coalesce(r.padrao, '{}')) end);
        end loop;
        insert into public.cargos_permissoes values (p_empresa_id, v_cargo, v_mapa)
          on conflict (empresa_id, cargo) do update set permissoes = excluded.permissoes;
      end loop;
      return 2;
    end $$;
    create function public.fn_user_tem(p_chave text) returns boolean language sql stable as $$
      select coalesce((select (cp.permissoes ->> p_chave)::boolean from public.cargos_permissoes cp
                         join public.perfis p on p.empresa_id = cp.empresa_id and p.perfil = cp.cargo
                        where p.id = auth.uid()), false) $$;
  `);
  for (const s of SQL) await db.exec(s);
  for (const s of SQL.slice(1)) await db.exec(s); // reaplicar 200000 e 210000 não quebra
});

afterAll(async () => { await db.close(); });

describe('migrations do Jornada (180000 → 200000 → 210000)', () => {
  it('as chaves novas entram no catálogo e as antigas continuam, com o valor gravado', async () => {
    const chaves = (await db.query<{ chave: string }>('select chave from public.fn_permissoes_catalogo() order by 1')).rows.map(r => r.chave);
    expect(chaves).toEqual(['ver_acordos', 'ver_jornada_acesso', 'ver_jornada_retencao', 'ver_pix_automatico']);
    const op = (await db.query<{ p: Record<string, boolean> }>(`select permissoes p from public.cargos_permissoes where cargo = 'operador'`)).rows[0].p;
    expect(op).toEqual({ ver_acordos: true, ver_pix_automatico: false, ver_jornada_acesso: true, ver_jornada_retencao: true });
  });

  it('só grupo do setor Jornada vale: a equipe Retenção do Receptivo não é aba', async () => {
    const tipo = (id: string) => db.query<{ tipo: string | null }>('select tipo from public.fn_jornada_grupo($1)', [id]).then(r => r.rows[0]?.tipo ?? null);
    expect(await tipo(EQ_SUP)).toBe('acesso');
    expect(await tipo(EQ_RET)).toBeNull();
    expect(await como<boolean>(ANA, 'select public.fn_jornada_membro($1) v', [EQ_SUP])).toBe(true);
    expect(await como<boolean>(BIA, 'select public.fn_jornada_membro($1) v', [EQ_RET])).toBe(false);
  });

  it('desligar a chave no painel tira a aba', async () => {
    await db.exec(`update public.cargos_permissoes set permissoes = permissoes || '{"ver_jornada_acesso": false}' where cargo = 'operador'`);
    expect(await como<boolean>(ANA, 'select public.fn_jornada_membro($1) v', [EQ_SUP])).toBe(false);
    await db.exec(`update public.cargos_permissoes set permissoes = permissoes || '{"ver_jornada_acesso": true}' where cargo = 'operador'`);
  });

  it('as tabelas existem e ninguém lê direto', async () => {
    const r = await db.query<{ t: string }>(`select to_regclass('public.jornada_registros')::text t
      union all select to_regclass('public.jornada_metas')::text union all select to_regclass('public.jornada_metas_pessoa')::text`);
    expect(r.rows.map(x => x.t)).toEqual(['jornada_registros', 'jornada_metas', 'jornada_metas_pessoa']);
    const p = await db.query<{ v: boolean }>(`select has_table_privilege('authenticated', 'public.jornada_registros', 'select') v`);
    expect(p.rows[0].v).toBe(false);
  });
});

// @vitest-environment node
/**
 * permissoesDoSetor.sql.test.ts — a migration 20261026120000 num Postgres de
 * verdade (PGlite).
 *
 * A regra: quem está num setor com mapa próprio para o seu cargo usa o mapa do
 * cargo com o do setor por cima. Fora dele — e sem mapa de setor — toda
 * resposta é a de antes. A exceção da pessoa continua mandando sobre os dois.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const BOOKPLAY = '00000000-0000-4000-8000-000000000001';
const OUTRA    = '00000000-0000-4000-8000-000000000002';
const MANUTENCAO = '2b9ad301-cc59-4d9c-9694-24320a865976';
const PLAY1      = '00000000-0000-4000-8000-0000000000b1';
const SETOR_OUTRA = '00000000-0000-4000-8000-0000000000b2';

const U = {
  opManutencao:   '00000000-0000-4000-8000-0000000000a1',
  opPlay1:        '00000000-0000-4000-8000-0000000000a2',
  liderManut:     '00000000-0000-4000-8000-0000000000a3',
  opComExcecao:   '00000000-0000-4000-8000-0000000000a4',
  admin:          '00000000-0000-4000-8000-0000000000a5',
};

const MIGRATION = readFileSync(
  resolve(__dirname, '../../../supabase/migrations/20261026120000_permissoes_proprias_do_setor.sql'),
  'utf8',
);

let db: PGlite;

async function como<T>(usuarioId: string, sql: string, params: unknown[] = []): Promise<T[]> {
  await db.query(`select set_config('request.jwt.claims', $1, false)`,
    [JSON.stringify({ sub: usuarioId, role: 'authenticated' })]);
  return (await db.query<T>(sql, params)).rows;
}

const tem = async (u: string, chave: string) =>
  (await como<{ v: boolean }>(u, 'select public.fn_user_tem($1) as v', [chave]))[0].v;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid
    $$;

    create table public.empresas (id uuid primary key, slug text, nome text);
    create table public.setores (id uuid primary key, empresa_id uuid references public.empresas(id), nome text);
    create table public.cargos (slug text primary key, pertence_a_setor boolean, acesso_total boolean);
    create table public.perfis (id uuid primary key, perfil text, empresa_id uuid, setor_id uuid, nome text);
    create table public.perfis_permissoes (usuario_id uuid, empresa_id uuid, permissoes jsonb not null default '{}',
      unique (empresa_id, usuario_id));
    create table public.cargos_permissoes (empresa_id uuid, cargo text, permissoes jsonb not null default '{}',
      unique (empresa_id, cargo));
    create table public.perfis_empresas_acesso (perfil_id uuid, empresa_id uuid, concedido_por uuid,
      unique (perfil_id, empresa_id));

    create function public.fn_permissoes_catalogo()
      returns table(chave text, tenants text[], padrao text[], explicita boolean)
      language sql immutable set search_path to '' as $$
      values ('ver_acordos', null::text[], array[]::text[], false),
             ('ver_pix_automatico', null, array[]::text[], false),
             ('ver_campanha_facil', null, array[]::text[], false)
    $$;
    create function public.fn_abas_escopo() returns table(aba text, chave_aba text)
      language sql immutable set search_path to '' as $$
      values ('acordos', 'ver_acordos'), ('pix', 'ver_pix_automatico')
    $$;
    create function public.fn_user_perfil() returns text language sql stable as $$
      select perfil from public.perfis where id = auth.uid() $$;
    create function public.fn_user_empresa_id() returns uuid language sql stable as $$
      select empresa_id from public.perfis where id = auth.uid() $$;
    create function public.fn_user_setor_id() returns uuid language sql stable as $$
      select setor_id from public.perfis where id = auth.uid() $$;
    create function public.fn_user_is_super_admin() returns boolean language sql stable as $$
      select exists (select 1 from public.perfis where id = auth.uid() and perfil = 'super_admin') $$;
    create function public.fn_user_acesso_multiempresa() returns boolean language sql stable as $$ select false $$;
    create function public.fn_empresas_acessiveis() returns uuid[] language sql stable as $$
      select array[empresa_id] from public.perfis where id = auth.uid() $$;

    -- Gatilhos de apoio: aqui só precisam existir.
    create function public.set_updated_at_cargos() returns trigger language plpgsql as $$
      begin new.atualizado_em := now(); return new; end $$;
    create function public.fn_log_auditoria() returns trigger language plpgsql as $$
      begin return null; end $$;
    create function public.fn_realtime_sinal_mudou() returns trigger language plpgsql as $$
      begin return null; end $$;

    insert into public.empresas values ('${BOOKPLAY}', 'bookplay', 'BookPlay'), ('${OUTRA}', 'pagueplay', 'PaguePlay');
    insert into public.setores values
      ('${MANUTENCAO}', '${BOOKPLAY}', 'Manutenção'),
      ('${PLAY1}', '${BOOKPLAY}', 'Play 1'),
      ('${SETOR_OUTRA}', '${OUTRA}', 'Receptivo');
    insert into public.cargos values
      ('operador', true, false), ('lider', true, false), ('gerencia', true, false),
      ('diretoria', false, false), ('administrador', false, true), ('super_admin', false, true);
    insert into public.perfis values
      ('${U.opManutencao}', 'operador', '${BOOKPLAY}', '${MANUTENCAO}', 'Op Manutenção'),
      ('${U.opPlay1}',      'operador', '${BOOKPLAY}', '${PLAY1}',      'Op Play 1'),
      ('${U.liderManut}',   'lider',    '${BOOKPLAY}', '${MANUTENCAO}', 'Líder Manutenção'),
      ('${U.opComExcecao}', 'operador', '${BOOKPLAY}', '${MANUTENCAO}', 'Op com exceção'),
      ('${U.admin}',        'administrador', '${BOOKPLAY}', null, 'Admin');
    insert into public.cargos_permissoes values
      ('${BOOKPLAY}', 'operador', '{"ver_acordos": true, "ver_pix_automatico": true, "ver_campanha_facil": true,
                                    "acordos_escopo_individual": true, "pix_escopo_individual": true}'),
      ('${BOOKPLAY}', 'lider',    '{"ver_acordos": true, "acordos_escopo_equipe": true}'),
      ('${OUTRA}',    'operador', '{"ver_campanha_facil": false}');
    insert into public.perfis_permissoes values ('${U.opComExcecao}', '${BOOKPLAY}', '{"ver_pix_automatico": true}');
  `);
  await db.exec(MIGRATION);
});

afterAll(async () => { await db?.close(); });

describe('a migration cria a Manutenção como cópia do cargo', () => {
  it('operador, líder e gerência que existem no cargo ganham mapa igual ao do cargo', async () => {
    const linhas = (await db.query<{ cargo: string; permissoes: Record<string, boolean> }>(
      `select cargo, permissoes from public.cargos_permissoes_setor order by cargo`)).rows;
    // Gerência não tem mapa de cargo na BookPlay do teste, então não é copiada.
    expect(linhas.map(l => l.cargo)).toEqual(['lider', 'operador']);
    expect(linhas.find(l => l.cargo === 'operador')!.permissoes.ver_pix_automatico).toBe(true);
  });

  it('logo depois da migration, ninguém muda de resposta', async () => {
    expect(await tem(U.opManutencao, 'ver_pix_automatico')).toBe(true);
    expect(await tem(U.opPlay1, 'ver_pix_automatico')).toBe(true);
  });
});

describe('o mapa do setor por cima do mapa do cargo', () => {
  beforeAll(async () => {
    await db.exec(`
      update public.cargos_permissoes_setor
         set permissoes = permissoes || '{"ver_pix_automatico": false, "ver_campanha_facil": false}'
       where setor_id = '${MANUTENCAO}' and cargo = 'operador';
      -- Chave que o setor não tem vem do cargo.
      update public.cargos_permissoes_setor
         set permissoes = permissoes - 'ver_acordos'
       where setor_id = '${MANUTENCAO}' and cargo = 'operador';
    `);
  });

  it('desligar no setor desliga só para quem está nele', async () => {
    expect(await tem(U.opManutencao, 'ver_pix_automatico')).toBe(false);
    expect(await tem(U.opPlay1, 'ver_pix_automatico')).toBe(true);
  });

  it('a chave que o setor não tem vem do cargo', async () => {
    expect(await tem(U.opManutencao, 'ver_acordos')).toBe(true);
  });

  it('a exceção da pessoa continua mandando sobre o setor', async () => {
    expect(await tem(U.opComExcecao, 'ver_pix_automatico')).toBe(true);
  });

  it('o líder do setor usa o mapa do líder, não o do operador', async () => {
    expect(await tem(U.liderManut, 'ver_acordos')).toBe(true);
    expect(await tem(U.liderManut, 'ver_pix_automatico')).toBe(false);
  });

  it('acesso total continua total', async () => {
    expect(await tem(U.admin, 'ver_pix_automatico')).toBe(true);
  });

  it('o escopo por aba sai do mapa do setor', async () => {
    const manut = await como<{ aba: string; escopo: number }>(U.opManutencao,
      'select aba, escopo from public.fn_user_escopos_por_aba() order by aba');
    const play1 = await como<{ aba: string; escopo: number }>(U.opPlay1,
      'select aba, escopo from public.fn_user_escopos_por_aba() order by aba');
    expect(manut).toEqual([{ aba: 'acordos', escopo: 0 }, { aba: 'pix', escopo: -1 }]);
    expect(play1).toEqual([{ aba: 'acordos', escopo: 0 }, { aba: 'pix', escopo: 0 }]);
  });

  it('o escopo de acordos sai do mapa do setor', async () => {
    await db.exec(`
      update public.cargos_permissoes_setor
         set permissoes = permissoes || '{"acordos_escopo_setor": true}'
       where setor_id = '${MANUTENCAO}' and cargo = 'operador';
    `);
    const [manut] = await como<{ v: number }>(U.opManutencao, 'select public.fn_user_escopo_acordos() as v');
    const [play1] = await como<{ v: number }>(U.opPlay1, 'select public.fn_user_escopo_acordos() as v');
    expect(manut.v).toBe(2);
    expect(play1.v).toBe(0);
  });

  it('fn_perfil_tem responde pela outra pessoa com o setor dela', async () => {
    const r = await como<{ manut: boolean; play1: boolean }>(U.admin, `
      select public.fn_perfil_tem('${U.opManutencao}', 'ver_pix_automatico') as manut,
             public.fn_perfil_tem('${U.opPlay1}', 'ver_pix_automatico') as play1`);
    expect(r[0]).toEqual({ manut: false, play1: true });
  });

  it('na própria empresa, a Campanha segue o setor; noutra empresa, o cargo de lá', async () => {
    const [propria] = await como<{ v: boolean }>(U.opManutencao, `select public.fn_cf_tem('${BOOKPLAY}', 'ver_campanha_facil') as v`);
    const [doPlay1] = await como<{ v: boolean }>(U.opPlay1, `select public.fn_cf_tem('${BOOKPLAY}', 'ver_campanha_facil') as v`);
    expect(propria.v).toBe(false);
    expect(doPlay1.v).toBe(true);
    const mapa = (await db.query<{ m: Record<string, boolean> }>(
      `select public.fn_permissoes_do_cargo('${OUTRA}', 'operador', '${MANUTENCAO}') as m`)).rows[0].m;
    expect(mapa).toEqual({ ver_campanha_facil: false });
  });

  it('apagar o mapa do setor devolve o mapa do cargo', async () => {
    await db.exec(`delete from public.cargos_permissoes_setor where setor_id = '${MANUTENCAO}' and cargo = 'operador'`);
    expect(await tem(U.opManutencao, 'ver_pix_automatico')).toBe(true);
  });
});

describe('a tabela recusa o que não faz sentido', () => {
  it('setor de outra empresa', async () => {
    await expect(db.exec(`
      insert into public.cargos_permissoes_setor (empresa_id, setor_id, cargo)
      values ('${BOOKPLAY}', '${SETOR_OUTRA}', 'operador')`)).rejects.toThrow(/não pertence a esta empresa/);
  });

  it('cargo de acesso total ou fora de setor', async () => {
    await expect(db.exec(`
      insert into public.cargos_permissoes_setor (empresa_id, setor_id, cargo)
      values ('${BOOKPLAY}', '${PLAY1}', 'administrador')`)).rejects.toThrow(/não tem permissões por setor/);
    await expect(db.exec(`
      insert into public.cargos_permissoes_setor (empresa_id, setor_id, cargo)
      values ('${BOOKPLAY}', '${PLAY1}', 'diretoria')`)).rejects.toThrow(/não tem permissões por setor/);
  });

  it('dois mapas do mesmo cargo no mesmo setor', async () => {
    await db.exec(`insert into public.cargos_permissoes_setor (empresa_id, setor_id, cargo)
                   values ('${BOOKPLAY}', '${PLAY1}', 'operador')`);
    await expect(db.exec(`insert into public.cargos_permissoes_setor (empresa_id, setor_id, cargo)
                          values ('${BOOKPLAY}', '${PLAY1}', 'operador')`)).rejects.toThrow();
  });
});

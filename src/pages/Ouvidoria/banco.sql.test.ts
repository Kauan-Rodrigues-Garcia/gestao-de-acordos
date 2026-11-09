// @vitest-environment node
/**
 * banco.sql.test.ts — a migration da Ouvidoria Cofen (20261106150000) num
 * Postgres de verdade (PGlite, LOCAL — não é o banco de produção), sobre o
 * mínimo do schema de que ela depende.
 *
 * O que importa provar antes de colar no SQL Editor: ela aplica e reaplica, as
 * chaves entram no catálogo nascendo só no líder, a aba vale só em setor Cofen,
 * o líder libera e tira atendente pela exceção por pessoa (sem derrubar um
 * bloqueio do administrador), o CPF nunca entra inteiro e a linha do tempo
 * registra status e retorno.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const EMP = '00000000-0000-4000-8000-0000000000e0';
const COFEN = '00000000-0000-4000-8000-0000000000a1'; // Conecta Play (regra Cofen)
const NOSSO = '00000000-0000-4000-8000-0000000000a2'; // setor Nosso produto
const LIDER = '00000000-0000-4000-8000-0000000000c1'; // líder do Conecta Play
const ANA = '00000000-0000-4000-8000-0000000000c2';   // operadora do Conecta Play
const BIA = '00000000-0000-4000-8000-0000000000c3';   // operadora bloqueada pelo admin
const LUIZ = '00000000-0000-4000-8000-0000000000c4';  // líder do setor Nosso produto
const ADM = '00000000-0000-4000-8000-0000000000c5';   // administrador
const CAIO = '00000000-0000-4000-8000-0000000000c6';  // operador do setor Nosso produto

const ler = (n: string) => readFileSync(resolve(__dirname, `../../../supabase/migrations/${n}`), 'utf8');
const SQL = ler('20261106150000_ouvidoria_cofen.sql');
const SQL_CODIGO = ler('20261106180000_ouvidoria_codigo_cliente.sql');

let db: PGlite;

async function como<T>(uid: string, sql: string, params: unknown[] = []): Promise<T> {
  await db.query("select set_config('teste.uid', $1, false)", [uid]);
  const r = await db.query<{ v: T }>(sql, params);
  return r.rows[0]?.v as T;
}

async function erroComo(uid: string, sql: string, params: unknown[] = []): Promise<string> {
  try {
    await como(uid, sql, params);
  } catch (e) {
    return (e as Error).message;
  }
  return '';
}

const setoresDe = (uid: string) => como<{ setor_id: string; pode_gerir: boolean }[] | null>(uid,
  `select json_agg(json_build_object('setor_id', setor_id, 'pode_gerir', pode_gerir)) v
     from public.fn_ouvidoria_cofen_setores()`).then(r => r ?? []);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('teste.uid', true), '')::uuid $$;

    create table public.empresas (id uuid primary key, nome text, slug text);
    insert into public.empresas values ('${EMP}', 'PaguePlay', 'pagueplay');
    create table public.setores (id uuid primary key, nome text, empresa_id uuid, regra text, excluido_em timestamptz);
    insert into public.setores values
      ('${COFEN}', 'Conecta Play', '${EMP}', 'cofen', null),
      ('${NOSSO}', 'Play Mix', '${EMP}', 'nosso_produto', null);
    create table public.cargos (slug text primary key, acesso_total boolean);
    insert into public.cargos values ('operador', false), ('lider', false), ('administrador', true), ('super_admin', true);
    create table public.perfis (
      id uuid primary key, nome text, foto_url text, perfil text, arquivado boolean default false,
      empresa_id uuid, setor_id uuid, situacao text default 'ativo');
    insert into public.perfis (id, nome, perfil, empresa_id, setor_id) values
      ('${LIDER}', 'Lia', 'lider', '${EMP}', '${COFEN}'),
      ('${ANA}', 'Ana', 'operador', '${EMP}', '${COFEN}'),
      ('${BIA}', 'Bia', 'operador', '${EMP}', '${COFEN}'),
      ('${LUIZ}', 'Luiz', 'lider', '${EMP}', '${NOSSO}'),
      ('${ADM}', 'Adm', 'administrador', '${EMP}', null),
      ('${CAIO}', 'Caio', 'operador', '${EMP}', '${NOSSO}');
    create table public.equipes (id uuid primary key, setor_id uuid);
    create table public.equipe_membros (pessoa_id uuid, equipe_id uuid, papel text);

    create table public.perfis_permissoes (
      id uuid primary key default gen_random_uuid(), empresa_id uuid, usuario_id uuid,
      permissoes jsonb not null default '{}', atualizado_em timestamptz, atualizado_por uuid,
      unique (empresa_id, usuario_id));
    -- O administrador bloqueou a Bia nominalmente.
    insert into public.perfis_permissoes (empresa_id, usuario_id, permissoes)
      values ('${EMP}', '${BIA}', '{"ver_ouvidoria_cofen": false}');

    create function public.fn_can_access_empresa(target_empresa_id uuid) returns boolean language sql stable as $$ select true $$;
    create function public.fn_setores_do_operador(p_operador uuid) returns setof uuid language sql stable
      as $$ select setor_id from public.perfis where id = p_operador and setor_id is not null $$;
    create function public.fn_log_auditoria() returns trigger language plpgsql as $$ begin return null; end $$;

    -- Permissões: catálogo antigo (1 chave) e a semeadura pelo catálogo.
    create table public.cargos_permissoes (empresa_id uuid, cargo text, permissoes jsonb, primary key (empresa_id, cargo));
    insert into public.cargos_permissoes values
      ('${EMP}', 'operador', '{"ver_acordos": true}'), ('${EMP}', 'lider', '{"ver_acordos": true}');
    create function public.fn_permissoes_catalogo()
      returns table(chave text, tenants text[], padrao text[], explicita boolean) language sql immutable
      as $$ select * from (values ('ver_acordos', null::text[], array['operador','lider']::text[], false)) v(chave, tenants, padrao, explicita) $$;
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
    -- A mesma precedência do banco: acesso total, exceção da pessoa, mapa do cargo.
    create function public.fn_perfil_tem(p_perfil uuid, p_chave text) returns boolean language sql stable as $$
      select case
        when exists (select 1 from public.perfis p join public.cargos c on c.slug = p.perfil
                      where p.id = p_perfil and c.acesso_total) then true
        when exists (select 1 from public.perfis_permissoes pp where pp.usuario_id = p_perfil and pp.permissoes ? p_chave)
          then (select (pp.permissoes ->> p_chave)::boolean from public.perfis_permissoes pp where pp.usuario_id = p_perfil)
        else coalesce((select (cp.permissoes ->> p_chave)::boolean from public.cargos_permissoes cp
                         join public.perfis p on p.empresa_id = cp.empresa_id and p.perfil = cp.cargo
                        where p.id = p_perfil), false)
      end $$;
    create function public.fn_user_tem(p_chave text) returns boolean language sql stable
      as $$ select public.fn_perfil_tem(auth.uid(), p_chave) $$;
  `);
  await db.exec(SQL);
  await db.exec(SQL); // reaplicar não quebra
  // Uma gravada com CPF antes da troca: a coluna sai mesmo com dado nela.
  await db.exec(`select set_config('teste.uid', '${LIDER}', false)`);
  await db.query(`select public.fn_ouvidoria_cofen_salvar($1, null, $2::jsonb)`, [COFEN, JSON.stringify({
    canal: 'email', nome_profissional: 'Antes da troca', cpf: '52998224725', assunto: 'outros', descricao: 'x' })]);
  await db.exec(SQL_CODIGO);
  await db.exec(SQL_CODIGO); // reaplicar não quebra
  await db.exec(`delete from public.ouvidoria_manifestacoes; select setval('public.ouvidoria_manifestacoes_numero_seq', 1, false)`);
});

afterAll(async () => { await db.close(); });

describe('migration da Ouvidoria Cofen (20261106150000)', () => {
  it('as duas chaves entram no catálogo uma vez só, nascendo só no líder', async () => {
    const chaves = (await db.query<{ chave: string }>('select chave from public.fn_permissoes_catalogo() order by 1')).rows.map(r => r.chave);
    expect(chaves).toEqual(['ouvidoria_cofen_gerenciar', 'ver_acordos', 'ver_ouvidoria_cofen']);
    const mapa = async (cargo: string) => (await db.query<{ p: Record<string, boolean> }>(
      'select permissoes p from public.cargos_permissoes where cargo = $1', [cargo])).rows[0].p;
    expect(await mapa('lider')).toEqual({ ver_acordos: true, ver_ouvidoria_cofen: true, ouvidoria_cofen_gerenciar: true });
    expect(await mapa('operador')).toEqual({ ver_acordos: true, ver_ouvidoria_cofen: false, ouvidoria_cofen_gerenciar: false });
  });

  it('só setor Cofen: o líder do Conecta Play gerencia, o líder de Nosso produto não vê nada', async () => {
    expect(await setoresDe(LIDER)).toEqual([{ setor_id: COFEN, pode_gerir: true }]);
    expect(await setoresDe(LUIZ)).toEqual([]);
    expect(await setoresDe(ANA)).toEqual([]);
    expect(await setoresDe(ADM)).toEqual([{ setor_id: COFEN, pode_gerir: true }]);
  });

  it('o líder libera a Ana pela exceção por pessoa, e ela passa a atender sem gerenciar', async () => {
    expect(await como<string>(LIDER, 'select public.fn_ouvidoria_cofen_definir_acesso($1, $2, true) v', [COFEN, ANA])).toBe('liberado');
    const exc = (await db.query<{ p: Record<string, boolean> }>(
      'select permissoes p from public.perfis_permissoes where usuario_id = $1', [ANA])).rows[0].p;
    expect(exc).toEqual({ ver_ouvidoria_cofen: true });
    expect(await setoresDe(ANA)).toEqual([{ setor_id: COFEN, pode_gerir: false }]);
  });

  it('o líder não derruba o bloqueio do administrador, nem libera gente de outro setor ou a si mesmo', async () => {
    expect(await erroComo(LIDER, 'select public.fn_ouvidoria_cofen_definir_acesso($1, $2, true) v', [COFEN, BIA]))
      .toMatch(/bloqueado/);
    expect(await erroComo(LIDER, 'select public.fn_ouvidoria_cofen_definir_acesso($1, $2, true) v', [COFEN, CAIO]))
      .toMatch(/não é deste setor/);
    expect(await erroComo(LIDER, 'select public.fn_ouvidoria_cofen_definir_acesso($1, $2, false) v', [COFEN, LIDER]))
      .toMatch(/próprio acesso/);
    expect(await erroComo(ANA, 'select public.fn_ouvidoria_cofen_definir_acesso($1, $2, true) v', [COFEN, BIA]))
      .toMatch(/gerencia/);
  });

  it('o card mostra de onde vem cada acesso', async () => {
    const pessoas = await como<{ nome: string; origem: string; tem_acesso: boolean }[]>(LIDER,
      `select json_agg(json_build_object('nome', nome, 'origem', origem, 'tem_acesso', tem_acesso) order by nome) v
         from public.fn_ouvidoria_cofen_pessoas($1)`, [COFEN]);
    expect(pessoas).toEqual([
      { nome: 'Ana', origem: 'liberado', tem_acesso: true },
      { nome: 'Bia', origem: 'bloqueado', tem_acesso: false },
      { nome: 'Lia', origem: 'cargo', tem_acesso: true },
    ]);
    // Quem só atende vê só quem tem acesso (para escolher o responsável).
    const daAna = await como<string[]>(ANA,
      'select json_agg(nome order by nome) v from public.fn_ouvidoria_cofen_pessoas($1)', [COFEN]);
    expect(daAna).toEqual(['Ana', 'Lia']);
  });

  it('grava com código, código do cliente e status pelo acompanhamento', async () => {
    const historico = await como<Record<string, unknown>>(ANA,
      `select to_jsonb(public.fn_ouvidoria_cofen_salvar($1, null, $2::jsonb)) v`,
      [COFEN, JSON.stringify({
        canal: 'telefone', nome_profissional: 'Maria Souza', codigo_cliente: ' 4521873 ', conselho_uf: 'sp',
        assunto: 'cobranca_indevida', descricao: 'Cobrança de anuidade já paga', anuidades: ['2024', '2023', '2024', 'x'],
        situacao_financeira: 'quitada', acompanhar: false,
      })]);
    expect(historico.codigo).toBe('OUV-00001');
    expect(historico.codigo_cliente).toBe('4521873');
    expect(historico).not.toHaveProperty('cpf');
    expect(historico.conselho_uf).toBe('SP');
    expect(historico.anuidades).toEqual([2023, 2024]);
    expect(historico.status).toBe('concluido');

    const acomp = await como<Record<string, unknown>>(ANA,
      `select to_jsonb(public.fn_ouvidoria_cofen_salvar($1, null, $2::jsonb)) v`,
      [COFEN, JSON.stringify({
        canal: 'whatsapp', nome_profissional: 'João', assunto: 'operador', descricao: 'Atendimento ríspido',
        acompanhar: true, responsavel_id: LIDER,
      })]);
    expect(acomp.codigo).toBe('OUV-00002');
    expect(acomp.status).toBe('aberto');
    expect(acomp.responsavel_nome).toBe('Lia');

    // Código que é CPF é recusado; letra, a coluna recusa mesmo por fora das funções.
    expect(await erroComo(ANA, `select public.fn_ouvidoria_cofen_salvar($1, null, $2::jsonb) v`, [COFEN, JSON.stringify({
      canal: 'email', nome_profissional: 'X', codigo_cliente: '52998224725', assunto: 'outros', descricao: 'x' })])).toMatch(/é um CPF/);
    await expect(db.query(`update public.ouvidoria_manifestacoes set codigo_cliente = '12a'`)).rejects.toThrow(/codigo_cliente/);
    expect(await erroComo(ANA, `select public.fn_ouvidoria_cofen_salvar($1, null, '{"canal":"email"}'::jsonb) v`, [COFEN]))
      .toMatch(/nome do profissional/);
  });

  it('status e retorno vão para a linha do tempo; quem não alcança não lê', async () => {
    const id = (await db.query<{ id: string }>(`select id from public.ouvidoria_manifestacoes where codigo = 'OUV-00002'`)).rows[0].id;
    const atual = (await db.query<{ v: Record<string, unknown> }>(`select to_jsonb(m) v from public.ouvidoria_manifestacoes m where id = $1`, [id])).rows[0].v;
    await como(ANA, `select public.fn_ouvidoria_cofen_salvar($1, $2, $3::jsonb) v`,
      [COFEN, id, JSON.stringify({ ...atual, status: 'em_andamento', data_resposta: atual.data_manifestacao, providencia: 'Liguei de volta' })]);
    await como(ANA, `select public.fn_ouvidoria_cofen_anotar($1, 'Aguardando comprovante') v`, [id]);
    const tipos = await como<string[]>(ANA,
      'select json_agg(tipo) v from public.fn_ouvidoria_cofen_andamentos($1)', [id]);
    expect(tipos).toEqual(['criada', 'status', 'retorno', 'edicao', 'nota']);

    expect(await erroComo(CAIO, 'select count(*) v from public.fn_ouvidoria_cofen_listar($1)', [COFEN])).toMatch(/acesso/);
    expect(await como<number>(ANA, 'select count(*)::int v from public.fn_ouvidoria_cofen_listar($1)', [COFEN])).toBe(2);
  });

  it('só quem gerencia exclui; tirar o acesso apaga a exceção e a Ana perde a aba', async () => {
    const id = (await db.query<{ id: string }>(`select id from public.ouvidoria_manifestacoes where codigo = 'OUV-00001'`)).rows[0].id;
    expect(await erroComo(ANA, 'select public.fn_ouvidoria_cofen_excluir($1) v', [id])).toMatch(/gerencia/);
    await como(LIDER, 'select public.fn_ouvidoria_cofen_excluir($1) v', [id]);
    expect(await como<number>(LIDER, 'select count(*)::int v from public.fn_ouvidoria_cofen_listar($1)', [COFEN])).toBe(1);

    expect(await como<string>(LIDER, 'select public.fn_ouvidoria_cofen_definir_acesso($1, $2, false) v', [COFEN, ANA])).toBe('sem');
    const exc = (await db.query<{ p: Record<string, boolean> }>(
      'select permissoes p from public.perfis_permissoes where usuario_id = $1', [ANA])).rows[0].p;
    expect(exc).toEqual({});
    expect(await setoresDe(ANA)).toEqual([]);
  });

  it('acesso que vem do cargo não se tira na aba', async () => {
    const LIA2 = '00000000-0000-4000-8000-0000000000c7';
    await db.exec(`insert into public.perfis (id, nome, perfil, empresa_id, setor_id)
                   values ('${LIA2}', 'Lia 2', 'lider', '${EMP}', '${COFEN}') on conflict do nothing`);
    expect(await erroComo(LIDER, 'select public.fn_ouvidoria_cofen_definir_acesso($1, $2, false) v', [COFEN, LIA2]))
      .toMatch(/vem do cargo/);
  });
});

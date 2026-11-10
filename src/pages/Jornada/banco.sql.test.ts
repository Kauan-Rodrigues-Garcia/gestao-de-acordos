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
  ler('20261105140000_jornada_quatro_metas.sql'),
  ler('20261105170000_jornada_no_desempenho_do_dia.sql'),
  ler('20261110120000_jornada_nr_por_pessoa.sql'),
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
  for (const s of SQL.slice(1)) await db.exec(s); // reaplicar 200000, 210000 e 140000 não quebra
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

  it('Suporte vê só Acesso, Retenção vê só Retenção (as duas equipes no Jornada)', async () => {
    const EQ_RET_JOR = '00000000-0000-4000-8000-0000000000b3';
    const CAIO = '00000000-0000-4000-8000-0000000000c3';
    await db.exec(`
      insert into public.equipes values ('${EQ_RET_JOR}', 'Retenção 2', '${JOR}', '${EMP}') on conflict do nothing;
      insert into public.perfis (id, nome, perfil, empresa_id, setor_id, equipe_id)
        values ('${CAIO}', 'Caio', 'operador', '${EMP}', '${JOR}', '${EQ_RET_JOR}') on conflict do nothing;`);
    const abas = (uid: string) => como<string[]>(uid,
      'select coalesce(array_agg(tipo order by tipo), array[]::text[]) v from public.fn_jornada_minhas_abas($1)', [EMP]);
    expect(await abas(ANA)).toEqual(['acesso']);    // equipe Suporte
    expect(await abas(CAIO)).toEqual(['retencao']); // equipe Retenção 2
    expect(await abas(BIA)).toEqual([]);            // Retenção do Receptivo: nada
    expect(await como<boolean>(ANA, 'select public.fn_jornada_membro($1) v', [EQ_RET_JOR])).toBe(false);
    expect(await como<boolean>(CAIO, 'select public.fn_jornada_membro($1) v', [EQ_SUP])).toBe(false);
  });

  it('o nome decide a aba: palavra Suporte = Acesso, Retenç… = Retenção', async () => {
    const tipo = (n: string) => db.query<{ t: string | null }>('select public.fn_jornada_tipo_subgrupo($1) t', [n]).then(r => r.rows[0].t);
    expect(await tipo('Suporte')).toBe('acesso');
    expect(await tipo('Equipe Suporte 2')).toBe('acesso');
    expect(await tipo('RETENÇÃO')).toBe('retencao');
    expect(await tipo('retencao manha')).toBe('retencao');
    expect(await tipo('Suportes')).toBe('acesso');
    expect(await tipo('Cobrança')).toBeNull();
    expect(await tipo('Antisuporte')).toBeNull(); // precisa ser o começo de uma palavra
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

describe('quatro metas do Jornada (20261105140000)', () => {
  const LIDER = '00000000-0000-4000-8000-0000000000d1';

  beforeAll(async () => {
    await db.exec(`
      insert into public.perfis (id, nome, perfil, empresa_id, setor_id)
        values ('${LIDER}', 'Lider', 'lider', '${EMP}', '${JOR}') on conflict do nothing;`);
    await como(LIDER, `select public.fn_jornada_meta_salvar($1, 100, 'mes') v`, [EQ_SUP]);
    await como(LIDER, `select public.fn_jornada_meta_pessoas_salvar($1, $2::jsonb) v`,
      [EQ_SUP, JSON.stringify([{ perfil_id: ANA, meta: 110 }])]);
  });

  it('a liderança grava 2ª, 3ª e 4ª do grupo e da pessoa; a 1ª continua onde estava', async () => {
    await como(LIDER, 'select public.fn_jornada_faixas_salvar($1, $2::int[], $3::jsonb) v',
      [EQ_SUP, '{120,140,160}', JSON.stringify([{ perfil_id: ANA, extras: [130, 150] }])]);
    const f = await como<{ grupo: number[]; pessoas: { perfil_id: string; extras: number[] }[] }>(
      LIDER, 'select public.fn_jornada_faixas($1) v', [EQ_SUP]);
    expect(f.grupo).toEqual([120, 140, 160]);
    expect(f.pessoas).toEqual([{ perfil_id: ANA, extras: [130, 150] }]);
    const base = await db.query<{ meta: number }>('select meta from public.jornada_metas where grupo_id = $1', [EQ_SUP]);
    expect(base.rows[0].meta).toBe(100);
  });

  it('mudar a 1ª pela função antiga não apaga as faixas', async () => {
    await como(LIDER, `select public.fn_jornada_meta_salvar($1, 105, 'mes') v`, [EQ_SUP]);
    const f = await como<{ grupo: number[] }>(LIDER, 'select public.fn_jornada_faixas($1) v', [EQ_SUP]);
    expect(f.grupo).toEqual([120, 140, 160]);
  });

  it('recusa faixa fora de ordem, mais de 4 metas e operador gravando', async () => {
    await expect(como(LIDER, 'select public.fn_jornada_faixas_salvar($1, $2::int[], null) v', [EQ_SUP, '{90}']))
      .rejects.toThrow(/maior que a anterior/);
    await expect(como(LIDER, 'select public.fn_jornada_faixas_salvar($1, $2::int[], null) v', [EQ_SUP, '{120,140,160,180}']))
      .rejects.toThrow(/ate 4 metas/);
    await expect(como(ANA, 'select public.fn_jornada_faixas_salvar($1, $2::int[], null) v', [EQ_SUP, '{120}']))
      .rejects.toThrow(/lideranca/);
  });

  it('o membro lê as faixas do grupo e só as próprias', async () => {
    const f = await como<{ grupo: number[]; pessoas: { perfil_id: string }[] }>(ANA, 'select public.fn_jornada_faixas($1) v', [EQ_SUP]);
    expect(f.grupo).toEqual([120, 140, 160]);
    expect(f.pessoas.map(p => p.perfil_id)).toEqual([ANA]);
  });

  it('tirar a 1ª meta leva as faixas junto', async () => {
    await como(LIDER, `select public.fn_jornada_meta_pessoas_salvar($1, $2::jsonb) v`,
      [EQ_SUP, JSON.stringify([{ perfil_id: ANA, meta: null }])]);
    const f = await como<{ pessoas: unknown[] }>(LIDER, 'select public.fn_jornada_faixas($1) v', [EQ_SUP]);
    expect(f.pessoas).toEqual([]);
  });
});

describe('20261105170000 — acessos e retenções no Desempenho do Dia', () => {
  const EQ_RET3 = '00000000-0000-4000-8000-0000000000b4'; // equipe Retenção 3 (Jornada)
  const EQ_RECEB = '00000000-0000-4000-8000-0000000000b5'; // equipe Recebimento (Jornada, sem aba)
  const DUDA = '00000000-0000-4000-8000-0000000000f1';  // Retenção 3
  const EDU = '00000000-0000-4000-8000-0000000000f2';   // Recebimento
  const GER = '00000000-0000-4000-8000-0000000000f3';   // gerência
  const LID_REC = '00000000-0000-4000-8000-0000000000f4'; // líder do Receptivo
  const DIA = '2026-11-05';
  const contar = (uid: string, args: { op?: string; ops?: string[]; setor?: string }) =>
    como<Record<string, number | boolean> | null>(uid,
      'select public.fn_jornada_contagem_dia($1, $2, $3, $4, $5) v',
      [EMP, DIA, args.op ?? null, args.ops ?? null, args.setor ?? null]);

  beforeAll(async () => {
    await db.exec(`
      insert into public.equipes values
        ('${EQ_RET3}', 'Retenção 3', '${JOR}', '${EMP}'), ('${EQ_RECEB}', 'Recebimento', '${JOR}', '${EMP}');
      insert into public.perfis (id, nome, perfil, empresa_id, setor_id, equipe_id) values
        ('${DUDA}', 'Duda', 'operador', '${EMP}', '${JOR}', '${EQ_RET3}'),
        ('${EDU}', 'Edu', 'operador', '${EMP}', '${JOR}', '${EQ_RECEB}'),
        ('${GER}', 'Gê', 'gerencia', '${EMP}', '${REC}', null),
        ('${LID_REC}', 'Lia', 'lider', '${EMP}', '${REC}', null);
      delete from public.jornada_registros;
      insert into public.jornada_registros (empresa_id, tipo, equipe_id, perfil_id, nr, data, apagado_em) values
        ('${EMP}', 'acesso',   '${EQ_SUP}',  '${ANA}',  '1', '${DIA}', null),
        ('${EMP}', 'acesso',   '${EQ_SUP}',  '${ANA}',  '2', '${DIA}', null),
        ('${EMP}', 'acesso',   '${EQ_SUP}',  '${ANA}',  '3', '${DIA}', now()),       -- na lixeira: não conta
        ('${EMP}', 'acesso',   '${EQ_SUP}',  '${ANA}',  '4', '2026-11-02', null),   -- conta só no mês
        ('${EMP}', 'acesso',   '${EQ_SUP}',  '${ANA}',  '5', '2026-10-30', null),   -- outro mês: não conta
        ('${EMP}', 'retencao', '${EQ_RET3}', '${DUDA}', '9', '${DIA}', null);`);
  });

  it('o setor Jornada: o dia, o mês e as abas que ele tem', async () => {
    expect(await contar(GER, { setor: JOR })).toEqual({
      acesso: 2, retencao: 1, acesso_mes: 3, retencao_mes: 1, tem_acesso: true, tem_retencao: true,
    });
  });

  it('qualquer outro setor, ou a empresa inteira, não tem bloco', async () => {
    expect(await contar(GER, { setor: REC })).toBeNull();
    expect(await contar(GER, {})).toBeNull();
    expect(await contar(GER, { op: BIA })).toBeNull();
  });

  it('a equipe conta só a gente do Jornada', async () => {
    expect(await contar(GER, { ops: [ANA, BIA] })).toMatchObject({ acesso: 2, retencao: 0, tem_acesso: true, tem_retencao: false });
    // Recebimento é do Jornada, mas não tem aba: bloco sem linha nenhuma.
    expect(await contar(GER, { ops: [EDU] })).toMatchObject({ acesso: 0, retencao: 0, tem_acesso: false, tem_retencao: false });
  });

  it('operador só se vê; líder de outro setor não vê o Jornada', async () => {
    expect(await contar(ANA, { setor: JOR })).toMatchObject({ acesso: 2, retencao: 0 });
    expect(await contar(ANA, { op: DUDA })).toBeNull();
    expect(await contar(LID_REC, { setor: JOR })).toBeNull();
  });
});

describe('cada operador só vê os NRs dele; a liderança vê todos com o nome', () => {
  const LU = '00000000-0000-4000-8000-0000000000c4';     // 2ª operadora do Suporte (Jornada)
  const LIDER = '00000000-0000-4000-8000-0000000000d1'; // líder do Jornada (criado acima)
  const DIA = '2026-11-06';
  type Painel = {
    pessoas: { id: string }[];
    dias: { dia: string; total: number }[];
    registros: { nr: string; perfil_id: string; nome: string | null }[];
  };
  const painel = (uid: string) => como<Painel>(uid, 'select public.fn_jornada_painel($1, $2) v', [EQ_SUP, DIA]);
  const nrs = (p: Painel) => p.registros.map(r => r.nr).sort();
  let doLu: string;

  beforeAll(async () => {
    await db.exec(`
      insert into public.perfis (id, nome, perfil, empresa_id, setor_id, equipe_id)
        values ('${LU}', 'Lu', 'operador', '${EMP}', '${JOR}', '${EQ_SUP}') on conflict do nothing;
      insert into public.perfis (id, nome, perfil, empresa_id, setor_id)
        values ('${LIDER}', 'Lider', 'lider', '${EMP}', '${JOR}') on conflict do nothing;
      delete from public.jornada_registros;
      insert into public.jornada_registros (empresa_id, tipo, equipe_id, perfil_id, nr, data, apagado_em) values
        ('${EMP}', 'acesso', '${EQ_SUP}', '${ANA}', '100', '${DIA}', null),
        ('${EMP}', 'acesso', '${EQ_SUP}', '${ANA}', '101', '${DIA}', null),
        ('${EMP}', 'acesso', '${EQ_SUP}', '${LU}',  '200', '${DIA}', null),
        ('${EMP}', 'acesso', '${EQ_SUP}', '${LU}',  '201', '${DIA}', now());`);
    doLu = (await db.query<{ id: string }>(`select id from public.jornada_registros where nr = '200'`)).rows[0].id;
  });

  it('o painel do operador: só os NRs, o placar e o total do dia dele', async () => {
    const ana = await painel(ANA);
    expect(nrs(ana)).toEqual(['100', '101']);
    expect(ana.pessoas.map(p => p.id)).toEqual([ANA]);
    expect(ana.dias.map(d => Number(d.total))).toEqual([2]);
    const lu = await painel(LU);
    expect(nrs(lu)).toEqual(['200']);
    expect(lu.pessoas.map(p => p.id)).toEqual([LU]);
  });

  it('a liderança recebe todos os NRs do dia, cada um com quem lançou', async () => {
    const l = await painel(LIDER);
    expect(nrs(l)).toEqual(['100', '101', '200']);
    expect(l.registros.find(r => r.nr === '200')).toMatchObject({ perfil_id: LU, nome: 'Lu' });
    expect(l.pessoas.map(p => p.id).sort()).toEqual([ANA, LU].sort());
  });

  it('baixar e lixeira: o operador só recebe os dele', async () => {
    const baixar = (uid: string) => como<string[]>(uid,
      `select coalesce(jsonb_agg(nr order by nr), '[]') v from public.fn_jornada_exportar($1, $2, $2)`, [EQ_SUP, DIA]);
    expect(await baixar(ANA)).toEqual(['100', '101']);
    expect(await baixar(LIDER)).toEqual(['100', '101', '200']);
    const lixeira = (uid: string) => como<string[]>(uid,
      `select coalesce(jsonb_agg(nr order by nr), '[]') v from public.fn_jornada_lixeira($1)`, [EQ_SUP]);
    expect(await lixeira(ANA)).toEqual([]);
    expect(await lixeira(LU)).toEqual(['201']);
  });

  it('o operador não apaga o NR de outra pessoa', async () => {
    await expect(como(ANA, 'select public.fn_jornada_excluir($1) v', [doLu])).rejects.toThrow(/Sem permissao/);
    expect(await como<number>(ANA, 'select public.fn_jornada_excluir_lote($1::uuid[]) v', [`{${doLu}}`])).toBe(0);
    expect(nrs(await painel(LU))).toEqual(['200']);
  });
});

describe('20261110120000 — o mesmo NR com pessoas diferentes fica marcado', () => {
  // Camila atendeu no dia 3; o Léo atendeu o mesmo cliente no dia 4.
  const CAMILA = '00000000-0000-4000-8000-0000000000e1';
  const LEO = '00000000-0000-4000-8000-0000000000e2';
  const LIDER = '00000000-0000-4000-8000-0000000000d1';
  type Outro = { perfil_id: string; nome: string; data: string };
  type Painel = {
    registros: { id: string; nr: string; perfil_id: string; outros: Outro[] }[];
    compartilhados: { nr: string; pessoas: Outro[] }[];
  };
  const painel = (uid: string, dia: string) => como<Painel>(uid, 'select public.fn_jornada_painel($1, $2) v', [EQ_SUP, dia]);
  const lancar = (uid: string, nr: string, dia: string) => como<string>(uid, 'select public.fn_jornada_lancar($1, $2, $3) v', [EQ_SUP, nr, dia]);
  const lote = (uid: string, itens: { nr: string; data: string }[]) =>
    como<Record<string, number>>(uid, 'select public.fn_jornada_lancar_lote($1, $2::jsonb) v', [EQ_SUP, JSON.stringify(itens)]);

  beforeAll(async () => {
    await db.exec(`
      insert into public.perfis (id, nome, perfil, empresa_id, setor_id, equipe_id) values
        ('${CAMILA}', 'Camila', 'operador', '${EMP}', '${JOR}', '${EQ_SUP}'),
        ('${LEO}', 'Léo', 'operador', '${EMP}', '${JOR}', '${EQ_SUP}') on conflict do nothing;
      insert into public.perfis (id, nome, perfil, empresa_id, setor_id)
        values ('${LIDER}', 'Lider', 'lider', '${EMP}', '${JOR}') on conflict do nothing;
      delete from public.jornada_registros;
      insert into public.jornada_registros (empresa_id, tipo, equipe_id, perfil_id, nr, data) values
        ('${EMP}', 'acesso', '${EQ_SUP}', '${LEO}', '777', '2026-10-20');  -- outubro: não marca novembro`);
  });

  it('a mesma pessoa continua barrada; outra pessoa entra', async () => {
    await lancar(CAMILA, '777', '2026-11-03');
    await expect(lancar(CAMILA, '777', '2026-11-04')).rejects.toThrow(/por voce neste mes/);
    await expect(lancar(LEO, '777', '2026-11-04')).resolves.toBeTruthy();
  });

  it('cada lançamento traz quem mais tem o NR no mês', async () => {
    const leo = await painel(LEO, '2026-11-04');
    expect(leo.registros.map(r => [r.nr, r.outros])).toEqual([['777', [{ perfil_id: CAMILA, nome: 'Camila', data: '2026-11-03' }]]]);
    const camila = await painel(CAMILA, '2026-11-03');
    expect(camila.registros[0].outros).toEqual([{ perfil_id: LEO, nome: 'Léo', data: '2026-11-04' }]);
    // O operador continua sem ver o NR do outro na lista dele.
    expect(camila.registros.map(r => r.perfil_id)).toEqual([CAMILA]);
  });

  it('os compartilhados do mês: a liderança e as duas pessoas veem; quem não tem o NR, não', async () => {
    const esperado = [{ nr: '777', pessoas: [
      { perfil_id: CAMILA, nome: 'Camila', data: '2026-11-03' },
      { perfil_id: LEO, nome: 'Léo', data: '2026-11-04' },
    ] }];
    expect((await painel(LIDER, '2026-11-05')).compartilhados).toEqual(esperado);
    expect((await painel(CAMILA, '2026-11-05')).compartilhados).toEqual(esperado);
    expect((await painel(ANA, '2026-11-05')).compartilhados).toEqual([]);
  });

  it('importar: o próprio repetido não entra; o que já está com outra pessoa entra e é contado', async () => {
    await lancar(LEO, '888', '2026-11-04');
    expect(await lote(CAMILA, [{ nr: '777', data: '2026-11-05' }, { nr: '888', data: '2026-11-05' }, { nr: '999', data: '2026-11-05' }]))
      .toEqual({ inseridos: 2, repetidos: 1, invalidos: 0, compartilhados: 1 });
  });

  it('restaurar: volta se a dona não relançou, mesmo com outra pessoa no NR', async () => {
    const id = await lancar(LEO, '555', '2026-11-04');
    await lancar(CAMILA, '555', '2026-11-05');
    await como(LEO, 'select public.fn_jornada_excluir($1) v', [id]);
    expect(await como(LEO, 'select public.fn_jornada_restaurar($1::uuid[]) v', [`{${id}}`])).toEqual({ restaurados: 1, repetidos: 0 });
    // Apagou e relançou: o antigo fica na lixeira.
    await como(LEO, 'select public.fn_jornada_excluir($1) v', [id]);
    await lancar(LEO, '555', '2026-11-06');
    expect(await como(LEO, 'select public.fn_jornada_restaurar($1::uuid[]) v', [`{${id}}`])).toEqual({ restaurados: 0, repetidos: 1 });
  });

  it('os ajudantes não ficam abertos para o app', async () => {
    const r = await db.query<{ v: boolean }>(
      `select has_function_privilege('authenticated', 'public.fn_jornada_nr_outros(uuid,text,text,date,uuid)', 'EXECUTE') v`);
    expect(r.rows[0].v).toBe(false);
  });
});

// @vitest-environment node
/**
 * rankingQuitacao.sql.test.ts — a migration 20261112200000 num Postgres de
 * verdade (PGlite).
 *
 * Monta a conta de antes (seção 2 e 4 de 20261111150500, copiadas do arquivo),
 * aplica a migration nova — com a prova dela — e confere:
 *   • líder (cargo que não conta no recebimento) e robô saem do ranking, dos
 *     destaques, do placar e do «eu»; o resto fica na mesma ordem;
 *   • por equipe, cada disputa traz os destaques só com a gente dela;
 *   • cargo sem cadastro em `cargos` continua dentro.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const pasta = resolve(__dirname, '../../../supabase/migrations');
const ANTES = readFileSync(resolve(pasta, '20261111150500_ranking_quitacao_configuravel.sql'), 'utf8');
const MIGRATION = readFileSync(resolve(pasta, '20261112200000_ranking_quitacao_sem_lideres_e_por_equipe.sql'), 'utf8');
const PREVIA = readFileSync(resolve(pasta, '20261112210000_ranking_quitacao_previa_importacao.sql'), 'utf8');
const LIDER_CONFIGURA = readFileSync(resolve(pasta, '20261112220000_ranking_quitacao_lider_configura.sql'), 'utf8');
const ACEITA = readFileSync(resolve(pasta, '20261112230000_ranking_quitacao_aceita_por_setor.sql'), 'utf8');
const BOLETO = readFileSync(resolve(pasta, '20261112233000_ranking_quitacao_boleto_a_vista.sql'), 'utf8');
const POR_SETOR = readFileSync(resolve(pasta, '20261112234000_ranking_quitacao_importar_por_setor.sql'), 'utf8');
const JUNTAR = readFileSync(resolve(pasta, '20261112235000_ranking_quitacao_juntar_equipes.sql'), 'utf8');

function trecho(texto: string, de: string, ate: string): string {
  const i = texto.indexOf(de);
  const f = texto.indexOf(ate, i);
  if (i < 0 || f < 0) throw new Error(`trecho não achado: ${de}`);
  return texto.slice(i, f);
}

const EMP = '00000000-0000-4000-8000-000000000001';
const S_EQ = '00000000-0000-4000-8000-0000000000a1';                    // disputa por equipe
const S_SET = '00000000-0000-4000-8000-0000000000b1';                    // disputa do setor
const EQ_A = '00000000-0000-4000-8000-0000000000e1';
const EQ_B = '00000000-0000-4000-8000-0000000000e2';
const P = (n: number) => `00000000-0000-4000-8000-0000000001${String(n).padStart(2, '0')}`;
const MES = '2026-11-01';

let db: PGlite;

async function ranking(setor: string, quem: string | null = null) {
  const r = await db.query<{ r: Record<string, any> }>(
    `select public.fn_ranking_quitacao_calcular($1, $2, $3, $4) as r`, [EMP, setor, MES, quem]);
  return r.rows[0].r;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('teste.uid', true), '')::uuid
    $$;
    create schema realtime;
    create function realtime.send(jsonb, text, text, boolean) returns void language sql as $$ select $$;
    create schema supabase_migrations;
    create table supabase_migrations.schema_migrations (version text primary key, name text, statements text[]);

    create table public.setores (id uuid primary key, empresa_id uuid, nome text);
    create table public.equipes (id uuid primary key, empresa_id uuid, setor_id uuid, nome text);
    create table public.cargos (slug text primary key, conta_no_recebimento boolean);
    create table public.perfis (id uuid primary key, empresa_id uuid, nome text, foto_url text, perfil text,
      equipe_id uuid, setor_id uuid, robo boolean default false, situacao text default 'ativo');
    create table public.ranking_quitacao_setores (empresa_id uuid, setor_id uuid, ativo boolean,
      premios numeric(12,2)[], config jsonb not null default '{}', atualizado_por uuid, atualizado_em timestamptz,
      unique (empresa_id, setor_id));
    create table public.ranking_quitacao_acordos (empresa_id uuid, mes date, cod_acordo text, operador_usuario text,
      operador_id uuid, valor_acordo numeric, data_quitacao date, importado_em timestamptz default now(), importado_por uuid,
      unique (empresa_id, mes, cod_acordo));
    create table public.tv_numeros_cache (chave text primary key, dados jsonb);
    create table public.tv_paineis (id uuid primary key, empresa_id uuid, atualizado_em timestamptz);

    create table public.empresas (id uuid primary key);
    create table public.equipe_membros (pessoa_id uuid, equipe_id uuid, papel text);
    create function public.fn_setores_do_operador(p_operador uuid) returns setof uuid language sql stable as $$
      select p.setor_id from public.perfis p where p.id = p_operador and p.setor_id is not null
      union
      select e.setor_id from public.equipe_membros m join public.equipes e on e.id = m.equipe_id
       where m.pessoa_id = p_operador and m.papel in ('clone', 'lider')
    $$;
    -- O catálogo de verdade é uma cadeia de funções; para a migration basta a forma.
    create function public.fn_permissoes_catalogo() returns table(chave text, tenants text[], padrao text[], explicita boolean)
      language sql immutable as $$ values ('ranking_quitacao_configurar', null::text[], array[]::text[], false) $$;
    create function public.fn_permissoes_semear_empresa(uuid) returns void language sql as $$ select $$;

    -- As travas, de mentira: a chave vem de uma configuração da sessão.
    create function public.fn_can_access_empresa(uuid) returns boolean language sql stable as $$ select true $$;
    create function public.fn_user_is_super_admin() returns boolean language sql stable as $$ select false $$;
    create function public.fn_user_tem(text) returns boolean language sql stable as $$
      select $1 = any (string_to_array(coalesce(current_setting('teste.chaves', true), ''), ','))
    $$;
  `);
  await db.exec(trecho(ANTES, 'CREATE OR REPLACE FUNCTION public.fn_ranking_quitacao_calcular', '-- ── 3.'));
  await db.exec(trecho(ANTES, 'CREATE OR REPLACE FUNCTION public.fn_ranking_quitacao_avisar', '-- ── 5.'));

  await db.exec(`
    insert into public.cargos values ('operador', true), ('lider', false), ('gerente', false);
    insert into public.setores values ('${S_EQ}', '${EMP}', 'Play 2'), ('${S_SET}', '${EMP}', 'Play 3');
    insert into public.equipes values ('${EQ_A}', '${EMP}', '${S_EQ}', 'Kimberli'), ('${EQ_B}', '${EMP}', '${S_EQ}', 'Luciano');
    insert into public.perfis (id, empresa_id, nome, perfil, equipe_id, setor_id, robo) values
      ('${P(1)}', '${EMP}', 'Ana',      'operador', '${EQ_A}', '${S_EQ}', false),
      ('${P(2)}', '${EMP}', 'Bia',      'operador', '${EQ_A}', '${S_EQ}', false),
      ('${P(3)}', '${EMP}', 'Caio',     'operador', '${EQ_B}', '${S_EQ}', false),
      ('${P(4)}', '${EMP}', 'Kimberli', 'lider',    null,      '${S_EQ}', false),
      ('${P(5)}', '${EMP}', 'Luciano',  'lider',    '${EQ_B}', '${S_EQ}', false),
      ('${P(6)}', '${EMP}', 'Robo',     'operador', '${EQ_B}', '${S_EQ}', true),
      ('${P(7)}', '${EMP}', 'Sem cargo','novato',   '${EQ_B}', '${S_EQ}', false),
      ('${P(8)}', '${EMP}', 'Duda',     'operador', null,      '${S_SET}', false),
      ('${P(9)}', '${EMP}', 'Gerente',  'gerente',  null,      '${S_SET}', false),
      ('${P(10)}','${EMP}', 'Eva',      'operador', null,      '${S_SET}', false);
    insert into public.ranking_quitacao_setores (empresa_id, setor_id, ativo, premios, config) values
      ('${EMP}', '${S_EQ}', true, array[300, 200, 100],
        '{"disputa":"equipe","categorias":[{"id":"mais_quitacoes"},{"id":"maior_valor"},{"id":"maior_quitacao"},{"id":"equipe_campea"}]}'),
      ('${EMP}', '${S_SET}', true, array[350, 250], '{}');
  `);
  // [pessoa, valor] — uma quitação por linha.
  const quitacoes: [number, number][] = [
    [1, 1000], [1, 500], [2, 3000], [3, 800], [3, 700], [3, 600],
    [4, 9000], [5, 8000], [6, 7000], [7, 50],
    [8, 400], [9, 5000], [10, 300],
  ];
  await db.exec(`insert into public.ranking_quitacao_acordos (empresa_id, mes, cod_acordo, operador_usuario, operador_id, valor_acordo, data_quitacao) values ${
    quitacoes.map(([p, v], i) => `('${EMP}', '${MES}', 'c${i}', 'u${p}', '${P(p)}', ${v}, '2026-11-05')`).join(', ')};`);

  // Antes da migration o líder está lá — é o que o pedido de 12/11 viu.
  const antes = await ranking(S_SET);
  expect(antes.disputas[0].posicoes[0].nome).toBe('Gerente');

  await db.exec(MIGRATION);
  await db.exec(PREVIA);
  await db.exec(LIDER_CONFIGURA);
  await db.exec(ACEITA);
  await db.exec(BOLETO);
  await db.exec(POR_SETOR);
  await db.exec(JUNTAR);
});

afterAll(async () => { await db?.close(); });

describe('20261112200000 — líder fora do ranking', () => {
  it('disputa do setor: o gerente sai, o resto sobe na mesma ordem', async () => {
    const r = await ranking(S_SET);
    expect(r.disputas).toHaveLength(1);
    expect(r.disputas[0].posicoes.map((p: any) => [p.posicao, p.nome, p.premio])).toEqual([
      [1, 'Duda', 350], [2, 'Eva', 250],
    ]);
    expect(r.participantes).toBe(2);
  });

  it('por equipe: sem «Sem equipe» da líder, sem o líder nem o robô na equipe', async () => {
    const r = await ranking(S_EQ);
    expect(r.disputas.map((d: any) => d.nome)).toEqual(['Kimberli', 'Luciano']);
    const [a, b] = r.disputas;
    expect(a.posicoes.map((p: any) => p.nome)).toEqual(['Bia', 'Ana']);
    // Cargo sem cadastro em `cargos` continua dentro.
    expect(b.posicoes.map((p: any) => p.nome)).toEqual(['Caio', 'Sem cargo']);
    expect(b.quitacoes_total).toBe(4);
    expect(r.equipes.map((e: any) => [e.nome, e.pessoas, Number(e.valor)])).toEqual([
      ['Kimberli', 2, 4500], ['Luciano', 2, 2150],
    ]);
  });

  it('destaques por equipe; os do setor e a Equipe campeã sem líder', async () => {
    const r = await ranking(S_EQ);
    const venc = (cats: any[]) => Object.fromEntries(cats.map(c => [c.id, c.vencedor?.nome ?? null]));
    expect(venc(r.categorias)).toEqual({
      mais_quitacoes: 'Caio', maior_valor: 'Bia', maior_quitacao: 'Bia', equipe_campea: 'Kimberli',
    });
    expect(venc(r.disputas[0].categorias)).toEqual({ mais_quitacoes: 'Ana', maior_valor: 'Bia', maior_quitacao: 'Bia' });
    expect(venc(r.disputas[1].categorias)).toEqual({ mais_quitacoes: 'Caio', maior_valor: 'Caio', maior_quitacao: 'Caio' });
  });

  it('o líder olhando não tem «eu»; o operador tem, na equipe dele', async () => {
    expect((await ranking(S_EQ, P(5))).eu).toBeNull();
    const eu = (await ranking(S_EQ, P(7))).eu;
    expect(eu).toMatchObject({ posicao: 2, equipe_id: EQ_B, acima_nome: 'Caio' });
  });

  it('registra a versão', async () => {
    const v = await db.query(`select 1 from supabase_migrations.schema_migrations where version = '20261112200000'`);
    expect(v.rows).toHaveLength(1);
  });
});

describe('20261112210000 — prévia da importação por setor', () => {
  async function previa(operadores: string[]) {
    await db.query(`select set_config('teste.chaves', 'ranking_quitacao_importar', false)`);
    const r = await db.query<{ setor_nome: string; no_banco: number; no_arquivo: number }>(
      `select setor_nome, no_banco, no_arquivo from public.fn_ranking_quitacao_previa($1, $2, $3::uuid[])`,
      [EMP, '2026-11-20', operadores]);
    return r.rows.map(x => [x.setor_nome, x.no_banco, x.no_arquivo]);
  }

  it('arquivo só com o Play 2: o Play 3 aparece com o que tem hoje e 0 no arquivo', async () => {
    // Banco: Play 2 = 10 quitações (com líder e robô — a prévia conta tudo o que a importação apaga), Play 3 = 3.
    expect(await previa([P(1), P(1), P(3), 'ffffffff-ffff-4fff-8fff-ffffffffffff'])).toEqual([
      ['Play 2', 10, 3], ['Play 3', 3, 0],
    ]);
  });

  it('arquivo da empresa inteira: os dois setores com quitação', async () => {
    expect(await previa([P(1), P(8)])).toEqual([['Play 2', 10, 1], ['Play 3', 3, 1]]);
  });

  it('sem a chave de importar: recusa', async () => {
    await db.query(`select set_config('teste.chaves', '', false)`);
    await expect(db.query(`select * from public.fn_ranking_quitacao_previa($1, $2, '{}')`, [EMP, MES]))
      .rejects.toThrow(/Sem permissao/);
  });
});

describe('20261112220000 — o líder configura o ranking do próprio setor', () => {
  const S_DESLIGADO = '00000000-0000-4000-8000-0000000000c1';
  async function como(uid: string, chaves: string) {
    await db.query(`select set_config('teste.uid', $1, false), set_config('teste.chaves', $2, false)`, [uid, chaves]);
  }
  const definir = (setor: string, ativo: boolean | null, config: object | null = { disputa: 'equipe' }) =>
    db.query(`select public.fn_ranking_quitacao_definir_setor($1, $2, $3, null, $4::jsonb)`,
      [EMP, setor, ativo, config ? JSON.stringify(config) : null]);
  const config = async (setor: string) =>
    (await db.query<{ config: Record<string, unknown>; ativo: boolean }>(
      `select config, ativo from public.ranking_quitacao_setores where setor_id = $1`, [setor])).rows[0];

  beforeAll(async () => {
    await db.exec(`
      insert into public.setores values ('${S_DESLIGADO}', '${EMP}', 'Play 9');
      insert into public.ranking_quitacao_setores (empresa_id, setor_id, ativo, premios) values ('${EMP}', '${S_DESLIGADO}', false, array[1]);
      -- O Luciano lidera também uma equipe do Play 9 (desligado).
      insert into public.equipes values ('00000000-0000-4000-8000-0000000000e9', '${EMP}', '${S_DESLIGADO}', 'Luciano 9');
      insert into public.equipe_membros values ('${P(5)}', '00000000-0000-4000-8000-0000000000e9', 'lider');
    `);
  });

  it('a chave nova entra no catálogo', async () => {
    const r = await db.query(`select padrao from public.fn_permissoes_catalogo() where chave = 'ranking_quitacao_configurar_setor'`);
    expect(r.rows).toEqual([{ padrao: ['lider', 'gerencia'] }]);
  });

  it('fora do setor dele: recusa', async () => {
    await como(P(5), 'ranking_quitacao_configurar_setor');
    await expect(definir(S_SET, true)).rejects.toThrow(/so configura o Ranking de quitacao do seu setor/);
  });

  it('no setor dele: grava, e não pode desligar', async () => {
    await como(P(5), 'ranking_quitacao_configurar_setor');
    await definir(S_EQ, true, { disputa: 'equipe', criterio: 'quantidade' });
    expect(await config(S_EQ)).toMatchObject({ ativo: true, config: { disputa: 'equipe', criterio: 'quantidade' } });
    await expect(definir(S_EQ, false)).rejects.toThrow(/Desligar/);
    expect((await config(S_EQ)).ativo).toBe(true);
  });

  it('setor dele, mas desligado: não liga', async () => {
    await como(P(5), 'ranking_quitacao_configurar_setor');
    await expect(definir(S_DESLIGADO, true)).rejects.toThrow(/nao esta ligado/);
    expect((await config(S_DESLIGADO)).ativo).toBe(false);
  });

  it('a chave geral alcança todos os setores e liga/desliga; sem chave, nada', async () => {
    await como(P(9), 'ranking_quitacao_configurar');
    await definir(S_DESLIGADO, true, null);
    expect((await config(S_DESLIGADO)).ativo).toBe(true);
    await como(P(1), '');
    await expect(definir(S_EQ, true)).rejects.toThrow(/Sem permissao/);
  });
});

describe('20261112230000 — o que conta como quitação, por setor', () => {
  const nomes = (r: any) => r.disputas.flatMap((d: any) => d.posicoes.map((p: any) => `${p.nome}:${p.quitacoes}`));

  it('importar grava a origem; tipo desconhecido fica nulo', async () => {
    await db.query(`select set_config('teste.chaves', 'ranking_quitacao_importar', false)`);
    await db.query(`select public.fn_ranking_quitacao_importar($1, '2026-12-01', $2::jsonb)`, [EMP, JSON.stringify([
      { cod_acordo: 'z1', operador_usuario: 'u1', operador_id: P(1), valor_acordo: 10, data_quitacao: '2026-12-02', tipo: 'juncao' },
      { cod_acordo: 'z2', operador_usuario: 'u1', operador_id: P(1), valor_acordo: 10, data_quitacao: '2026-12-02', tipo: 'outra' },
      { cod_acordo: 'z3', operador_usuario: 'u1', operador_id: P(1), valor_acordo: 10, data_quitacao: '2026-12-02' },
    ])]);
    const r = await db.query(`select cod_acordo, tipo from public.ranking_quitacao_acordos where mes = '2026-12-01' order by 1`);
    expect(r.rows).toEqual([{ cod_acordo: 'z1', tipo: 'juncao' }, { cod_acordo: 'z2', tipo: null }, { cod_acordo: 'z3', tipo: null }]);
  });

  it('«só Quitação» tira Junção e saldo zerado; nulo (importado antes) conta; «todas» é o de sempre', async () => {
    // Bia (3000) quitou por troca de plano; uma das duas da Ana foi saldo zerado.
    await db.exec(`
      update public.ranking_quitacao_acordos set tipo = 'juncao' where operador_id = '${P(2)}' and mes = '${MES}';
      update public.ranking_quitacao_acordos set tipo = 'saldo_zerado' where operador_id = '${P(1)}' and mes = '${MES}' and valor_acordo = 500;
    `);
    const antes = nomes(await ranking(S_EQ));
    // O teste do líder deixou o Play 2 «por quantidade».
    expect(antes).toEqual(['Ana:2', 'Bia:1', 'Caio:3', 'Sem cargo:1']);

    await db.exec(`update public.ranking_quitacao_setores set config = config || '{"aceita":"so_quitacao"}' where setor_id = '${S_EQ}'`);
    const r = await ranking(S_EQ);
    expect(r.aceita).toBe('so_quitacao');
    expect(nomes(r)).toEqual(['Ana:1', 'Caio:3', 'Sem cargo:1']);
    // O placar das equipes segue o mesmo filtro.
    expect(r.equipes.find((e: any) => e.nome === 'Kimberli')).toMatchObject({ quitacoes: 1, pessoas: 1 });

    // O outro setor não muda.
    expect((await ranking(S_SET)).aceita).toBe('todas');
  });

  it('definir_setor recusa valor desconhecido de «aceita»', async () => {
    await db.query(`select set_config('teste.uid', $1, false), set_config('teste.chaves', 'ranking_quitacao_configurar', false)`, [P(9)]);
    await expect(db.query(`select public.fn_ranking_quitacao_definir_setor($1, $2, true, null, '{"aceita":"metade"}'::jsonb)`, [EMP, S_EQ]))
      .rejects.toThrow(/aceita todas as quitacoes ou so acordo de Quitacao/);
  });
});

describe('20261112233000 — Quitação no boleto à vista', () => {
  it('importar grava quitacao_boleto; «só Quitação» deixa de fora, «todas» conta', async () => {
    await db.query(`select set_config('teste.chaves', 'ranking_quitacao_importar', false)`);
    await db.query(`select public.fn_ranking_quitacao_importar($1, '2027-01-01', $2::jsonb)`, [EMP, JSON.stringify([
      { cod_acordo: 'b1', operador_usuario: 'u10', operador_id: P(10), valor_acordo: 275, data_quitacao: '2027-01-10', tipo: 'quitacao_boleto' },
      { cod_acordo: 'b2', operador_usuario: 'u10', operador_id: P(10), valor_acordo: 800, data_quitacao: '2027-01-11', tipo: 'quitacao' },
    ])]);
    const gravado = await db.query(`select cod_acordo, tipo from public.ranking_quitacao_acordos where mes = '2027-01-01' order by 1`);
    expect(gravado.rows).toEqual([{ cod_acordo: 'b1', tipo: 'quitacao_boleto' }, { cod_acordo: 'b2', tipo: 'quitacao' }]);

    const valorDaEva = async () => {
      const r = await db.query<{ r: Record<string, any> }>(
        `select public.fn_ranking_quitacao_calcular($1, $2, '2027-01-01', null) as r`, [EMP, S_SET]);
      return Number(r.rows[0].r.disputas[0].posicoes[0].valor);
    };
    expect(await valorDaEva()).toBe(1075);
    await db.exec(`update public.ranking_quitacao_setores set config = config || '{"aceita":"so_quitacao"}' where setor_id = '${S_SET}'`);
    expect(await valorDaEva()).toBe(800);
  });
});

describe('20261112234000 — cada setor importa o seu', () => {
  const FEV = '2027-02-01';
  const q = (cod: string, pessoa: number, valor: number) =>
    ({ cod_acordo: cod, operador_usuario: `u${pessoa}`, operador_id: P(pessoa), valor_acordo: valor, data_quitacao: '2027-02-05', tipo: 'quitacao' });
  const importar = (linhas: object[], setores: string[] | null) =>
    db.query(`select public.fn_ranking_quitacao_importar($1, $2, $3::jsonb, $4::uuid[]) as n`, [EMP, FEV, JSON.stringify(linhas), setores]);
  const doMes = async () =>
    (await db.query<{ cod_acordo: string; valor_acordo: string }>(
      `select cod_acordo, valor_acordo from public.ranking_quitacao_acordos where mes = $1 order by 1`, [FEV]))
      .rows.map(r => `${r.cod_acordo}:${Number(r.valor_acordo)}`);

  beforeAll(async () => {
    await db.query(`select set_config('teste.chaves', 'ranking_quitacao_importar', false)`);
    // O mês dos dois setores, importado do jeito antigo (empresa inteira).
    await importar([q('a1', 1, 100), q('a2', 3, 200), q('b1', 8, 300), q('b2', 10, 400)], null);
  });

  it('o Play 2 importa o dele: o Play 3 fica exatamente como estava', async () => {
    // Arquivo do Play 2 (S_EQ): a1 mudou de valor, a2 sumiu, a3 é nova.
    const r = await importar([q('a1', 1, 150), q('a3', 2, 50)], [S_EQ]);
    expect(r.rows[0]).toEqual({ n: 2 });
    expect(await doMes()).toEqual(['a1:150', 'a3:50', 'b1:300', 'b2:400']);
  });

  it('linha de outro setor no arquivo fica de fora; o setor não marcado não é tocado', async () => {
    // Relatório do Play 2 com uma pessoa do Play 3 (P(8)) no meio.
    await importar([q('a1', 1, 150), q('a3', 2, 50), q('b9', 8, 999)], [S_EQ]);
    expect(await doMes()).toEqual(['a1:150', 'a3:50', 'b1:300', 'b2:400']);
  });

  it('o Play 3 importa o dele depois, e o Play 2 continua', async () => {
    await importar([q('b1', 8, 310)], [S_SET]);
    expect(await doMes()).toEqual(['a1:150', 'a3:50', 'b1:310']);
  });

  it('nenhum setor marcado, ou setor de outra empresa: recusa', async () => {
    await expect(importar([q('a1', 1, 1)], [])).rejects.toThrow(/pelo menos um setor/);
    await expect(importar([q('a1', 1, 1)], ['00000000-0000-4000-8000-0000000000ff'])).rejects.toThrow(/nao e desta empresa/);
  });

  it('a função antiga de 3 parâmetros saiu; a chamada antiga cai na nova (empresa inteira)', async () => {
    const r = await db.query(`select to_regprocedure('public.fn_ranking_quitacao_importar(uuid,date,jsonb)') as velha`);
    expect(r.rows[0]).toEqual({ velha: null });
  });
});

describe('20261112235000 — juntar equipes', () => {
  const grava = (config: object) =>
    db.query(`select public.fn_ranking_quitacao_definir_setor($1, $2, true, null, $3::jsonb)`, [EMP, S_EQ, JSON.stringify(config)]);

  it('duas equipes juntas: um ranking só, uma linha no placar; tirar o grupo volta ao de antes', async () => {
    await db.query(`select set_config('teste.uid', $1, false), set_config('teste.chaves', 'ranking_quitacao_configurar', false)`, [P(9)]);
    await grava({ disputa: 'equipe' });
    const separado = await ranking(S_EQ);
    expect(separado.disputas.map((d: any) => d.nome)).toEqual(['Kimberli', 'Luciano']);
    expect(separado.disputas.map((d: any) => d.equipes)).toEqual([[EQ_A], [EQ_B]]);
    const pessoas = separado.disputas.reduce((t: number, d: any) => t + d.participantes, 0);

    await grava({ disputa: 'equipe', grupos_equipes: [{ nome: '', equipes: [EQ_A, EQ_B] }] });
    const junto = await ranking(S_EQ);
    expect(junto.disputas).toHaveLength(1);
    expect(junto.disputas[0]).toMatchObject({ equipe_id: EQ_A, nome: 'Kimberli + Luciano', participantes: pessoas, equipes: [EQ_A, EQ_B] });
    // Um ranking só: as posições correm 1, 2, 3… pelo grupo inteiro.
    expect(junto.disputas[0].posicoes.map((p: any) => p.posicao)).toEqual(
      Array.from({ length: junto.disputas[0].posicoes.length }, (_, i) => i + 1));
    expect(junto.equipes).toHaveLength(1);
    expect(junto.equipes[0]).toMatchObject({ id: EQ_A, nome: 'Kimberli + Luciano', pessoas });

    await grava({ disputa: 'equipe', grupos_equipes: [{ nome: 'Mateus e Kim', equipes: [EQ_A, EQ_B] }] });
    expect((await ranking(S_EQ)).disputas[0].nome).toBe('Mateus e Kim');

    await grava({ disputa: 'equipe', grupos_equipes: [] });
    expect((await ranking(S_EQ)).disputas.map((d: any) => d.nome)).toEqual(['Kimberli', 'Luciano']);
  });

  it('recusa grupo de uma equipe, equipe de outro setor e equipe em dois grupos', async () => {
    await expect(grava({ grupos_equipes: [{ equipes: [EQ_A] }] })).rejects.toThrow(/pelo menos duas equipes/);
    await expect(grava({ grupos_equipes: [{ equipes: [EQ_A, '00000000-0000-4000-8000-0000000000e9'] }] }))
      .rejects.toThrow(/nao e deste setor/);
    await expect(grava({ grupos_equipes: [{ equipes: [EQ_A, EQ_B] }, { equipes: [EQ_B, EQ_A] }] }))
      .rejects.toThrow(/dois grupos/);
  });
});

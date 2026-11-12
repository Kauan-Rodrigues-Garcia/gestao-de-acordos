// @vitest-environment node
/**
 * banco.gerentes.sql.test.ts — a migration 20261112160000 (votação dos
 * GERENTES e GUARDAR sem liberar) num Postgres de verdade (PGlite, LOCAL — não
 * é o banco de produção), por cima das três migrations da votação.
 *
 * O que importa provar (pedido de 12/11/2026): a operação vota nos gerentes
 * (quem vota ≠ quem concorre), as regras são da votação, a votação da
 * liderança continua igual, e a encerrada vai para a gaveta e volta — sem
 * ninguém decidir nem liberar enquanto está guardada.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const ADMIN = '00000000-0000-4000-8000-0000000000a1';
const DIR   = '00000000-0000-4000-8000-0000000000d1';
const L1    = '00000000-0000-4000-8000-0000000000c1';
const L2    = '00000000-0000-4000-8000-0000000000c2';
const L3    = '00000000-0000-4000-8000-0000000000c3';
const L4    = '00000000-0000-4000-8000-0000000000c4';
const G1    = '00000000-0000-4000-8000-0000000000b1';
const G2    = '00000000-0000-4000-8000-0000000000b2';
const G3    = '00000000-0000-4000-8000-0000000000b3';
const O1    = '00000000-0000-4000-8000-0000000000e1';
const O2    = '00000000-0000-4000-8000-0000000000e2';
const O3    = '00000000-0000-4000-8000-0000000000e3';
const SETOR = '00000000-0000-4000-8000-0000000000f1';
const EQUIPE = '00000000-0000-4000-8000-0000000000f2';

const ler = (n: string) => readFileSync(resolve(__dirname, `../../../supabase/migrations/${n}`), 'utf8');
const P15 = Array.from({ length: 15 }, (_, i) => ({ id: `q${i + 1}`, emoji: '⭐', texto: `Pergunta ${i + 1}?` }));
const P3 = P15.slice(0, 3);

let db: PGlite;

async function como<T>(uid: string, sql: string, params: unknown[] = []): Promise<T> {
  await db.query("select set_config('teste.uid', $1, false)", [uid]);
  await db.query("select set_config('teste.super', $1, false)", [uid === ADMIN ? 'sim' : '']);
  const r = await db.query<{ v: T }>(sql, params);
  return r.rows[0]?.v as T;
}
const gravar = (dados: Record<string, unknown>, uid = ADMIN) =>
  como<string>(uid, 'select public.fn_votacao_lideranca_gravar(null, $1::jsonb) v', [JSON.stringify({
    titulo: 'Gerentes de novembro', produto: 'cobranca', tipo: 'gerentes', setor_ids: [SETOR], equipe_ids: [EQUIPE],
    cargos: ['gerencia'], cargos_eleitores: ['operador'], perguntas: P3,
    participantes: [G1, G2, G3], eleitores: [O1, O2, O3], um_por_candidato: false, um_titulo: false, ...dados,
  })]);
const salvarLideranca = () =>
  como<string>(ADMIN, 'select public.fn_votacao_lideranca_salvar(null, $1, $2, $3, $4, $5::jsonb, $6) v',
    ['Liderança', 'cobranca', [SETOR], ['lider'], JSON.stringify(P15), [L1, L2, L3, L4]]);
const mudar = (id: string, acao: string, uid = ADMIN) => como(uid, 'select public.fn_votacao_lideranca_mudar($1, $2) v', [id, acao]);
const votar = (uid: string, id: string, votos: Record<string, string>) =>
  como(uid, 'select public.fn_votacao_lideranca_votar($1, $2::jsonb, null) v', [id, JSON.stringify(votos)]);
const tudo = (quem: string, ps = P3) => Object.fromEntries(ps.map(p => [p.id, quem]));
type Linha = { id: string; tipo: string; estado: string; eleitores: number; participantes: number; votaram: number; guardada_em: string | null };
const listar = () => como<Linha[]>(DIR, 'select public.fn_votacao_lideranca_listar() v');

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('teste.uid', true), '')::uuid $$;
    create table public.setores (id uuid primary key, nome text);
    insert into public.setores values ('${SETOR}', 'Play 1');
    create table public.equipes (id uuid primary key, nome text, setor_id uuid);
    insert into public.equipes values ('${EQUIPE}', 'Equipe Ana', '${SETOR}');
    create table public.perfis (id uuid primary key, nome text, foto_url text, setor_id uuid, perfil text, ativo boolean, equipe_id uuid);
    insert into public.perfis values
      ('${ADMIN}', 'Kauan', null, null, 'super_admin', true, null),
      ('${DIR}', 'Cleber', null, null, 'diretoria', true, null),
      ('${L1}', 'Ana', null, '${SETOR}', 'lider', true, null), ('${L2}', 'Bruno', null, '${SETOR}', 'lider', true, null),
      ('${L3}', 'Carla', null, '${SETOR}', 'lider', true, null), ('${L4}', 'Diego', null, '${SETOR}', 'lider', true, null),
      ('${G1}', 'Gabi', null, '${SETOR}', 'gerencia', true, null), ('${G2}', 'Gustavo', null, null, 'gerencia', true, null),
      ('${G3}', 'Giovana', null, '${SETOR}', 'gerencia', true, null),
      ('${O1}', 'Olga', null, '${SETOR}', 'operador', true, '${EQUIPE}'), ('${O2}', 'Oto', null, '${SETOR}', 'operador', true, '${EQUIPE}'),
      ('${O3}', 'Otávio', null, '${SETOR}', 'operador', true, null);
    create function public.fn_user_is_super_admin() returns boolean language sql stable
      as $$ select current_setting('teste.super', true) = 'sim' $$;
  `);
  await db.exec(ler('20261104230000_votacao_lideranca.sql'));
  await db.exec(ler('20261110150000_votacao_decisao_repetidos.sql'));
  await db.exec(ler('20261111190000_votacao_escolha_livre_diretoria.sql'));
  const nova = ler('20261112160000_votacao_gerentes_e_guardar.sql');
  await db.exec(nova);
  await db.exec(nova); // reexecutável
});

beforeEach(async () => { await db.exec('delete from public.votacao_lideranca;'); });
afterAll(async () => { await db.close(); });

describe('votação dos gerentes', () => {
  it('só o super_admin grava; pede gerentes, eleitores e 3 perguntas', async () => {
    await expect(gravar({}, DIR)).rejects.toThrow(/NAO_AUTORIZADO/);
    await expect(gravar({ perguntas: P15.slice(0, 2) })).rejects.toThrow(/mínimo é 3/);
    await expect(gravar({ participantes: [G1] })).rejects.toThrow(/2 gerentes/);
    await expect(gravar({ eleitores: [] })).rejects.toThrow(/quem vota/);
    await expect(gravar({ tipo: 'outro' })).rejects.toThrow(/Tipo/);
    expect(await gravar({})).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('a operação vota; quem concorre não vota; o mesmo gerente em todas', async () => {
    const id = await gravar({});
    await mudar(id, 'abrir');
    const minha = await como<Array<{ votacao: { tipo: string; um_por_candidato: boolean }; participantes: { id: string }[] }>>(
      O1, 'select public.fn_votacao_lideranca_minha() v');
    expect(minha).toHaveLength(1);
    expect(minha[0].votacao.tipo).toBe('gerentes');
    expect(minha[0].votacao.um_por_candidato).toBe(false);
    expect(minha[0].participantes.map(p => p.id).sort()).toEqual([G1, G3, G2].sort());
    expect(await como<unknown[]>(G1, 'select public.fn_votacao_lideranca_minha() v')).toEqual([]);

    await expect(votar(G1, id, tudo(G2))).rejects.toThrow(/NAO_AUTORIZADO/);
    await expect(votar(O1, id, { q1: G1, q2: G1 })).rejects.toThrow(/faltam 1/);
    await expect(votar(O1, id, { ...tudo(G1), q1: O2 })).rejects.toThrow(/não participa/);
    await votar(O1, id, tudo(G1));
    await votar(O2, id, tudo(G1));
    const l = (await listar()).find(v => v.id === id)!;
    expect(l).toMatchObject({ tipo: 'gerentes', eleitores: 3, participantes: 3, votaram: 2 });
  });

  it('com «um por candidato» ligado, cada gerente vale uma pergunta', async () => {
    const id = await gravar({ um_por_candidato: true });
    await mudar(id, 'abrir');
    await expect(votar(O1, id, tudo(G1))).rejects.toThrow(/uma pergunta/);
    await votar(O1, id, { q1: G1, q2: G2, q3: G3 });
  });

  it('sem «um título», o mesmo gerente leva várias sem decisão; resultado para quem votou', async () => {
    const id = await gravar({});
    await mudar(id, 'abrir');
    await votar(O1, id, tudo(G1));
    await votar(O2, id, tudo(G1));
    await votar(O3, id, tudo(G2));
    await mudar(id, 'encerrar', DIR);
    await como(DIR, 'select public.fn_votacao_lideranca_liberar($1) v', [id]);
    const meus = await como<Array<{ id: string; tipo: string }>>(O3, 'select public.fn_votacao_lideranca_meus_resultados() v');
    expect(meus.map(m => m.id)).toEqual([id]);
    expect(meus[0].tipo).toBe('gerentes');
    const r = await como<{ contagem: unknown[] }>(O3, 'select public.fn_votacao_lideranca_resultado($1) v', [id]);
    expect(r.contagem.length).toBeGreaterThan(0);
  });

  it('com «um título», o gerente em 1º em várias pede decisão', async () => {
    const id = await gravar({ um_titulo: true });
    await mudar(id, 'abrir');
    await votar(O1, id, tudo(G1));
    await mudar(id, 'encerrar', DIR);
    await expect(como(DIR, 'select public.fn_votacao_lideranca_liberar($1) v', [id])).rejects.toThrow(/Falta decidir 3/);
  });

  it('a apuração traz quem vota, com setor e equipe', async () => {
    const id = await gravar({});
    await mudar(id, 'abrir');
    const a = await como<{ eleitores: Array<{ id: string; setor: string; equipe: string | null }>; votacao: { eleitores_total: number } }>(
      DIR, 'select public.fn_votacao_lideranca_apuracao($1) v', [id]);
    expect(a.votacao.eleitores_total).toBe(3);
    expect(a.eleitores.find(e => e.id === O1)).toMatchObject({ setor: 'Play 1', equipe: 'Equipe Ana' });
    expect(a.eleitores.find(e => e.id === O3)?.equipe).toBeNull();
  });

  it('gerentes e liderança abertas ao mesmo tempo; duas de gerentes, não', async () => {
    const lid = await salvarLideranca();
    await mudar(lid, 'abrir');
    const g = await gravar({});
    await mudar(g, 'abrir');
    const g2 = await gravar({});
    await expect(mudar(g2, 'abrir')).rejects.toThrow(/deste tipo aberta/);
  });
});

describe('a liderança continua igual', () => {
  it('líder vota nos colegas, uma vez cada (regra agora na função)', async () => {
    const id = await salvarLideranca();
    await mudar(id, 'abrir');
    const l = (await listar()).find(v => v.id === id)!;
    expect(l).toMatchObject({ tipo: 'lideranca', eleitores: 4, participantes: 4 });
    await expect(votar(L1, id, { q1: L2, q2: L2, q3: L3 })).rejects.toThrow(/uma pergunta/);
    await expect(votar(L1, id, { q1: L2, q2: L3 })).rejects.toThrow(/faltam 1/);
    await votar(L1, id, { q1: L2, q2: L3, q3: L4 });
  });
});

describe('guardar sem liberar', () => {
  async function encerrada(): Promise<string> {
    const id = await salvarLideranca();
    await mudar(id, 'abrir');
    await votar(L1, id, { q1: L2, q2: L3, q3: L4 });
    await votar(L2, id, { q1: L1, q2: L3, q3: L4 });
    await mudar(id, 'encerrar', DIR);
    return id;
  }

  it('só a encerrada vai para a gaveta, e só o super_admin guarda', async () => {
    const id = await salvarLideranca();
    await expect(mudar(id, 'guardar')).rejects.toThrow(/estado atual/);
    await mudar(id, 'abrir');
    await expect(mudar(id, 'guardar')).rejects.toThrow(/estado atual/);
    await mudar(id, 'encerrar', DIR);
    await expect(mudar(id, 'guardar', DIR)).rejects.toThrow(/NAO_AUTORIZADO/);
    await mudar(id, 'guardar');
    expect((await listar()).find(v => v.id === id)?.guardada_em).toBeTruthy();
    await expect(mudar(id, 'guardar')).rejects.toThrow(/estado atual/);
  });

  it('guardada: ninguém decide, libera nem reabre; tirar da gaveta volta como estava', async () => {
    const id = await encerrada();
    await como(DIR, 'select public.fn_votacao_lideranca_desempatar($1, $2, $3) v', [id, 'q1', L2]);
    await mudar(id, 'guardar');
    await expect(como(DIR, 'select public.fn_votacao_lideranca_desempatar($1, $2, $3) v', [id, 'q1', L1])).rejects.toThrow(/guardada/);
    await expect(como(DIR, 'select public.fn_votacao_lideranca_liberar($1) v', [id])).rejects.toThrow(/guardada/);
    await expect(mudar(id, 'reabrir')).rejects.toThrow(/estado atual/);
    // A apuração continua visível, com a decisão gravada.
    const a = await como<{ votacao: { guardada_em: string | null; estado: string }; desempates: Array<{ escolhido_id: string }> }>(
      DIR, 'select public.fn_votacao_lideranca_apuracao($1) v', [id]);
    expect(a.votacao).toMatchObject({ estado: 'encerrada' });
    expect(a.votacao.guardada_em).toBeTruthy();
    expect(a.desempates.map(d => d.escolhido_id)).toEqual([L2]);

    await mudar(id, 'desguardar');
    const l = (await listar()).find(v => v.id === id)!;
    expect(l).toMatchObject({ estado: 'encerrada', guardada_em: null, votaram: 2 });
    await expect(mudar(id, 'desguardar')).rejects.toThrow(/estado atual/);
  });

  it('reabrir deixa quem faltou votar; cancelar tira da gaveta', async () => {
    const id = await encerrada();
    await mudar(id, 'reabrir');
    await votar(L3, id, { q1: L2, q2: L1, q3: L4 });
    await expect(votar(L1, id, { q1: L2, q2: L3, q3: L4 })).rejects.toThrow(/já enviou/);
    await mudar(id, 'encerrar', DIR);
    await mudar(id, 'guardar');
    await mudar(id, 'cancelar');
    const l = (await listar()).find(v => v.id === id)!;
    expect(l).toMatchObject({ estado: 'cancelada', guardada_em: null, votaram: 3 });
  });
});

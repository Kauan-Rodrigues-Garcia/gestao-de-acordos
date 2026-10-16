// @vitest-environment node
/**
 * banco.sql.test.ts — a migration da chefona (20261015230000) rodando num
 * Postgres de verdade (PGlite, local — não é o banco), sobre um `realtime` de
 * mentira que só grava o que seria enviado.
 *
 * Roda junto a do Rei do Pop (20261009120000): a chefona não pode sair com ele
 * na tela, e aplicar uma não pode estragar a outra.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const EMPRESA = '00000000-0000-4000-8000-000000000001';
const OUTRA   = '00000000-0000-4000-8000-000000000002';
const ADMIN   = '00000000-0000-4000-8000-0000000000a1';
const ANA     = '00000000-0000-4000-8000-0000000000c1';
const BRUNO   = '00000000-0000-4000-8000-0000000000c2';
const CAIO    = '00000000-0000-4000-8000-0000000000c3';

const migration = (nome: string) => readFileSync(resolve(__dirname, '../../../../../supabase/migrations', nome), 'utf8');
const SQL_REI = migration('20261009120000_chefao_rei_do_pop.sql');
const SQL = migration('20261015230000_chefona_bruxa_do_pantano.sql');

let db: PGlite;

interface Estado {
  id: number; vida: number; vida_max: number; absorcao: number; versao: number; situacao: string;
  protegida: boolean; totem_em: string | null; totem_vida: number; totens: number;
  cura_em: string | null; cura_vida: number;
  golpe_final_nome: string | null; participantes: number;
  ranking: { usuario: string; nome: string; dano: number; acertos: number; criticos: number }[];
  eu?: { dano: number; criticos: number; posicao: number } | null;
  freio?: boolean;
}

async function como<T>(uid: string, sql: string, params: unknown[] = []): Promise<T> {
  await db.query("select set_config('teste.uid', $1, false)", [uid]);
  await db.query("select set_config('teste.super', $1, false)", [uid === ADMIN ? 'sim' : '']);
  const r = await db.query<{ v: T }>(sql, params);
  return r.rows[0]?.v as T;
}

const soltar = (vida = 500, porPessoa = 0, esperaS = 0) =>
  como<number>(ADMIN, 'select public.fn_chefona_soltar($1, 2, $2, $3) v', [vida, esperaS, porPessoa]);
/** Um lote: `a` acertos, `c` críticos entre eles, `d` de dano somado. */
const atirar = (uid: string, id: number, a: number, d: number | null = null, c = 0) =>
  como<Estado>(uid, 'select public.fn_chefona_acertar($1, $2, $3, $4) v', [id, a, c, d]);
const curar = (uid: string, id: number, fracao = 0.22) =>
  como<Estado>(uid, 'select public.fn_chefona_curar($1, $2) v', [id, fracao]);
const proteger = (uid: string, id: number) =>
  como<Estado>(uid, 'select public.fn_chefona_proteger($1) v', [id]);
/** Passa o tempo do freio de uma pessoa (600 ms), sem esperar. */
const esperarFreio = (uid: string) =>
  db.exec(`update public.chefona_golpes set ultimo_em = ultimo_em - interval '1 second' where usuario = '${uid}'`);
/** Passa o tempo do freio dos avisos (2 s), sem esperar. */
const esperarAviso = () => db.exec(`update public.chefona_rodadas set avisado_em = avisado_em - interval '3 seconds'`);

async function avisos(): Promise<{ topic: string; event: string }[]> {
  return (await db.query<{ topic: string; event: string }>('select topic, event from realtime.enviados order by n')).rows;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('teste.uid', true), '')::uuid $$;

    create schema realtime;
    create table realtime.messages (topic text, payload jsonb, event text, private boolean);
    alter table realtime.messages enable row level security;
    create policy abobora_receber on realtime.messages for select to authenticated using (true);
    create table realtime.enviados (n serial, topic text, event text, payload jsonb);
    create function realtime.send(payload jsonb, event text, topic text, private boolean default true)
      returns void language sql
      as $$ insert into realtime.enviados (topic, event, payload) values (topic, event, payload) $$;

    create table public.empresas (id uuid primary key);
    insert into public.empresas values ('${EMPRESA}'), ('${OUTRA}');
    create table public.perfis (id uuid primary key, nome text, foto_url text);
    insert into public.perfis values
      ('${ANA}', 'Ana Paula', 'https://x/ana.png'), ('${BRUNO}', 'Bruno Lima', null), ('${CAIO}', '  ', null);
    create function public.fn_user_is_super_admin() returns boolean language sql stable
      as $$ select current_setting('teste.super', true) = 'sim' $$;
  `);
  await db.exec(SQL_REI);
  await db.exec(SQL);
  // Reexecutável: aplicar de novo não quebra.
  await db.exec(SQL);
});

beforeEach(async () => {
  await db.exec('delete from public.chefona_rodadas; delete from public.chefao_rodadas; truncate realtime.enviados;');
});

afterAll(async () => { await db.close(); });

describe('20261015230000 — soltar', () => {
  it('só o super_admin solta, e o aviso vai a todas as empresas com o sinal «chefona»', async () => {
    await expect(como(ANA, 'select public.fn_chefona_soltar(500, 2, 0, 0) v')).rejects.toThrow(/NAO_AUTORIZADO/);
    await soltar();
    expect((await avisos()).map(a => a.topic).sort()).toEqual([`abobora:${EMPRESA}`, `abobora:${OUTRA}`]);
    expect((await avisos()).every(a => a.event === 'chefona')).toBe(true);
  });

  it('duas chefonas ao mesmo tempo, não', async () => {
    await soltar();
    await expect(soltar()).rejects.toThrow(/JA_TEM_UMA/);
  });

  it('com o Rei do Pop na tela, não sai', async () => {
    await como(ADMIN, 'select public.fn_chefao_soltar(500, 2, 0, 0) v');
    await expect(soltar()).rejects.toThrow(/CHEFAO_NA_TELA/);
    // Ele fugiu (o prazo passou): agora sai.
    await db.exec(`update public.chefao_rodadas set expira_em = clock_timestamp() - interval '1 second'`);
    expect(await soltar()).toBeGreaterThan(0);
  });

  it('o Rei do Pop continua funcionando igual com a chefona instalada', async () => {
    const id = await como<number>(ADMIN, 'select public.fn_chefao_soltar(500, 2, 0, 0) v');
    const r = await como<Estado>(ANA, 'select public.fn_chefao_acertar($1, 3, 1) v', [id]);
    expect(r.vida).toBe(500 - 6);
    expect((await avisos()).some(a => a.event === 'chefao')).toBe(true);
    expect((await avisos()).some(a => a.event === 'chefona')).toBe(false);
  });
});

describe('20261015230000 — o tiro', () => {
  it('o primeiro tiro soma a vida da pessoa e entra no ranking com o nome do cadastro', async () => {
    const id = await soltar(500, 400);
    const r = await atirar(ANA, id, 3, 15, 1);
    expect(r.vida_max).toBe(900);
    expect(r.vida).toBe(900 - 15);
    expect(r.ranking).toEqual([expect.objectContaining({ usuario: ANA, nome: 'Ana Paula', dano: 15, acertos: 3, criticos: 1 })]);
    expect(r.eu).toMatchObject({ dano: 15, criticos: 1, posicao: 1 });
    expect(r.freio).toBeUndefined();
  });

  it('nome em branco vira «Alguém»', async () => {
    const id = await soltar();
    expect((await atirar(CAIO, id, 1, 3)).ranking[0].nome).toBe('Alguém');
  });

  it('o banco não confia no lote: 12 acertos e 12 de dano por acerto, no máximo', async () => {
    const id = await soltar(5000);
    expect((await atirar(ANA, id, 50, 100_000, 50)).vida).toBe(5000 - 12 * 12);
    await esperarFreio(ANA);
    // Crítico não passa do número de acertos.
    expect((await atirar(ANA, id, 2, 6, 9)).eu?.criticos).toBe(12 + 2);
  });

  it('sem o dano, conta 3 por acerto', async () => {
    const id = await soltar(500);
    expect((await atirar(ANA, id, 4)).vida).toBe(500 - 12);
  });

  it('o freio: lote cedo demais não tira vida e volta marcado', async () => {
    const id = await soltar(500);
    await atirar(ANA, id, 2, 6);
    const cedo = await atirar(ANA, id, 5, 15);
    expect(cedo.freio).toBe(true);
    expect(cedo.vida).toBe(494);
    await esperarFreio(ANA);
    expect((await atirar(ANA, id, 5, 15)).vida).toBe(479);
  });

  it('na contagem, tiro não vale', async () => {
    const id = await soltar(500, 400, 60);
    const r = await atirar(ANA, id, 5, 15);
    expect(r.vida).toBe(500);
    expect(r.participantes).toBe(0);
  });

  it('o golpe final leva o nome de quem já vinha atirando, e o dano conta só o que tirou', async () => {
    const id = await soltar(20);
    await atirar(BRUNO, id, 3, 9);
    await esperarFreio(BRUNO);
    const r = await atirar(BRUNO, id, 12, 60);
    expect(r.situacao).toBe('derrotado');
    expect(r.vida).toBe(0);
    expect(r.golpe_final_nome).toBe('Bruno Lima');
    expect(r.eu?.dano).toBe(20);
    // Morta, mais tiro não conta.
    expect((await atirar(ANA, id, 3, 9)).participantes).toBe(1);
  });
});

describe('20261015230000 — a Poção de Cura', () => {
  it('só o super_admin cura', async () => {
    const id = await soltar(500);
    await atirar(ANA, id, 12, 60);
    await expect(curar(ANA, id)).rejects.toThrow(/NAO_AUTORIZADO/);
  });

  it('devolve 22% da vida máxima, no máximo o que falta, e avisa na hora', async () => {
    const id = await soltar(100);
    await atirar(ANA, id, 6, 30);
    await db.exec('truncate realtime.enviados');
    const r = await curar(ADMIN, id);
    expect(r.cura_vida).toBe(22);
    expect(r.vida).toBe(92);
    expect(await avisos()).toHaveLength(2);
    // Bebendo não é imune: o tiro entra.
    await esperarFreio(ANA);
    expect((await atirar(ANA, id, 1, 3)).vida).toBe(89);
  });

  it('não bebe de vida cheia, nem duas vezes seguidas, nem na contagem', async () => {
    const id = await soltar(500);
    await expect(curar(ADMIN, id)).rejects.toThrow(/VIDA_CHEIA/);
    await atirar(ANA, id, 12, 140);
    await curar(ADMIN, id);
    await expect(curar(ADMIN, id)).rejects.toThrow(/JA_BEBENDO/);

    await db.exec(`update public.chefona_rodadas set situacao = 'fugiu'`);
    const outra = await soltar(500, 0, 60);
    await expect(curar(ADMIN, outra)).rejects.toThrow(/AINDA_CHEGANDO/);
  });
});

describe('20261015230000 — o Totem da Imortalidade', () => {
  it('só o super_admin protege, e um totem por vez', async () => {
    const id = await soltar(500);
    await expect(proteger(ANA, id)).rejects.toThrow(/NAO_AUTORIZADO/);
    expect((await proteger(ADMIN, id)).protegida).toBe(true);
    await expect(proteger(ADMIN, id)).rejects.toThrow(/JA_PROTEGIDA/);
  });

  it('o golpe fatal não mata: 1 de vida + Regeneração, Absorção, e o totem some da mão', async () => {
    const id = await soltar(100);
    await proteger(ADMIN, id);
    await db.exec('truncate realtime.enviados');
    const r = await atirar(ANA, id, 12, 140);
    expect(r.situacao).toBe('ativo');
    expect(r.protegida).toBe(false);
    expect(r.totens).toBe(1);
    expect(r.totem_vida).toBe(15);
    expect(r.vida).toBe(1 + 15);
    expect(r.absorcao).toBe(10);
    expect(r.totem_em).not.toBeNull();
    // Tirou 99 (até sobrar 1), não os 140 do lote.
    expect(r.eu?.dano).toBe(99);
    // O totem estourando avisa na hora.
    expect(await avisos()).toHaveLength(2);
  });

  it('a Absorção paga primeiro, e sem totem o próximo golpe fatal mata', async () => {
    const id = await soltar(100);
    await proteger(ADMIN, id);
    await atirar(ANA, id, 12, 140);
    await esperarFreio(ANA);
    // 10 de Absorção + 4 da vida.
    const r = await atirar(ANA, id, 2, 14);
    expect(r.absorcao).toBe(0);
    expect(r.vida).toBe(16 - 4);
    await esperarFreio(ANA);
    expect((await atirar(ANA, id, 12, 140)).situacao).toBe('derrotado');
  });
});

describe('20261015230000 — os avisos sob carga', () => {
  it('apanhando, no máximo um aviso a cada 2 s — de quantas pessoas forem', async () => {
    const id = await soltar(5000);
    await db.exec('truncate realtime.enviados');
    await esperarAviso();
    await atirar(ANA, id, 1, 3);
    await atirar(BRUNO, id, 1, 3);
    await atirar(CAIO, id, 1, 3);
    expect(await avisos()).toHaveLength(2);
    await esperarAviso();
    await esperarFreio(ANA);
    await atirar(ANA, id, 1, 3);
    expect(await avisos()).toHaveLength(4);
  });

  it('quando ela cai, avisa na hora, mesmo dentro dos 2 s', async () => {
    const id = await soltar(20);
    await atirar(ANA, id, 1, 3);
    await db.exec('truncate realtime.enviados');
    expect((await atirar(BRUNO, id, 12, 60)).situacao).toBe('derrotado');
    expect(await avisos()).toHaveLength(2);
  });

  it('a fuga avisa uma vez só, com muitos chegando depois do prazo', async () => {
    const id = await soltar(500);
    await db.exec(`update public.chefona_rodadas set expira_em = clock_timestamp() - interval '1 second'`);
    await db.exec('truncate realtime.enviados');
    expect((await atirar(ANA, id, 1, 3)).situacao).toBe('fugiu');
    expect((await atirar(BRUNO, id, 1, 3)).situacao).toBe('fugiu');
    expect(await avisos()).toHaveLength(2);
  });

  it('o aviso leva o mesmo estado que a resposta, sem os campos internos', async () => {
    const id = await soltar(500);
    await esperarAviso();
    await db.exec('truncate realtime.enviados');
    const r = await atirar(ANA, id, 2, 6);
    const p = (await db.query<{ payload: Estado }>('select payload from realtime.enviados limit 1')).rows[0].payload;
    expect(p.versao).toBe(r.versao);
    expect(p.vida).toBe(r.vida);
    expect(p).not.toHaveProperty('eu');
    expect(p).not.toHaveProperty('avisado_em');
    expect(p).not.toHaveProperty('solta_por');
    expect(JSON.stringify(p)).not.toContain('cliques');
  });
});

describe('20261015230000 — autoclick e permissões', () => {
  interface Ficha { usuario: string; cliques: number; lotes: number; lotes_no_teto: number; suspeitas: number; motivos: number; headshots: number }
  const fichas = (id: number) => como<Ficha[]>(ADMIN, 'select public.fn_chefona_suspeitos($1) v', [id]);

  it('guarda os cliques e conta só as pistas fortes como suspeita', async () => {
    const id = await soltar(5000);
    await como(ANA, 'select public.fn_chefona_acertar($1, 3, 1, 9, 9, 16) v', [id]);
    await esperarFreio(ANA);
    await como(ANA, 'select public.fn_chefona_acertar($1, 12, 0, 36, 30, 1) v', [id]);
    const ana = (await fichas(id)).find(f => f.usuario === ANA)!;
    expect(ana).toMatchObject({ cliques: 39, lotes: 2, lotes_no_teto: 1, suspeitas: 1, motivos: 1 | 16, headshots: 1 });
  });

  it('só o super_admin vê a lista', async () => {
    const id = await soltar(5000);
    await expect(como(ANA, 'select public.fn_chefona_suspeitos($1) v', [id])).rejects.toThrow(/NAO_AUTORIZADO/);
  });

  it('o app chama o tiro; as peças internas, não; e anon não chama nada', async () => {
    const pode = async (papel: string, f: string) => (await db.query<{ v: boolean }>(
      `select has_function_privilege('${papel}', '${f}', 'EXECUTE') v`)).rows[0].v;
    expect(await pode('authenticated', 'public.fn_chefona_acertar(bigint, integer, integer, integer, integer, integer)')).toBe(true);
    expect(await pode('authenticated', 'public.fn_chefona_enviar(jsonb)')).toBe(false);
    expect(await pode('authenticated', 'public.fn_chefona_avisar(bigint)')).toBe(false);
    expect(await pode('anon', 'public.fn_chefona_atual()')).toBe(false);
    expect(await pode('anon', 'public.fn_chefona_soltar(integer, integer, integer, integer)')).toBe(false);
  });

  it('a leitura de entrada devolve a última chefona, só para quem está logado', async () => {
    const id = await soltar(500);
    expect((await como<Estado>(ANA, 'select public.fn_chefona_atual() v')).id).toBe(id);
    expect(await como<Estado | null>('', 'select public.fn_chefona_atual() v')).toBeNull();
  });
});

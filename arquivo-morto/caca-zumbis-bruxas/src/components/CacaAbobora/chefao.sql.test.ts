// @vitest-environment node
/**
 * chefao.sql.test.ts — a migration do chefão (20261009120000) rodando num
 * Postgres de verdade (PGlite), sobre um `realtime` de mentira que só grava o
 * que seria enviado.
 *
 * Nasceu na revisão de lançamento (09/10/2026): o tiro foi reescrito para
 * segurar a trava da linha o mínimo possível e avisar no máximo a cada 2 s. Um
 * erro de ramo ali só apareceria em produção, com todo mundo atirando — aqui
 * ele roda.
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

const SQL = readFileSync(
  resolve(__dirname, '../../../supabase/migrations/20261009120000_chefao_rei_do_pop.sql'), 'utf8',
);

let db: PGlite;

interface Estado {
  id: number; vida: number; vida_max: number; versao: number; situacao: string;
  golpe_final_nome: string | null; participantes: number;
  ranking: { usuario: string; nome: string; dano: number }[];
  eu?: { dano: number; posicao: number } | null;
  freio?: boolean;
}

async function como<T>(uid: string, sql: string, params: unknown[] = []): Promise<T> {
  await db.query("select set_config('teste.uid', $1, false)", [uid]);
  await db.query("select set_config('teste.super', $1, false)", [uid === ADMIN ? 'sim' : '']);
  const r = await db.query<{ v: T }>(sql, params);
  return r.rows[0]?.v as T;
}

const soltar = (vida = 500, porPessoa = 250, esperaS = 0) =>
  como<number>(ADMIN, 'select public.fn_chefao_soltar($1, 5, $2, $3) v', [vida, esperaS, porPessoa]);
const atirar = (uid: string, id: number, a: number, h = 0) =>
  como<Estado>(uid, 'select public.fn_chefao_acertar($1, $2, $3) v', [id, a, h]);
/** Passa o tempo do freio de uma pessoa (600 ms), sem esperar. */
const esperarFreio = (uid: string) =>
  db.exec(`update public.chefao_golpes set ultimo_em = ultimo_em - interval '1 second' where usuario = '${uid}'`);
/** Passa o tempo do freio dos avisos (2 s), sem esperar. */
const esperarAviso = () => db.exec(`update public.chefao_rodadas set avisado_em = avisado_em - interval '3 seconds'`);

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
  await db.exec(SQL);
  // Reexecutável: aplicar de novo não quebra.
  await db.exec(SQL);
});

beforeEach(async () => {
  await db.exec('delete from public.chefao_rodadas; truncate realtime.enviados;');
});

afterAll(async () => { await db.close(); });

describe('20261009120000 — soltar', () => {
  it('só o super_admin solta, e o aviso vai a todas as empresas', async () => {
    await expect(como(ANA, 'select public.fn_chefao_soltar(500, 5, 0, 250) v')).rejects.toThrow(/NAO_AUTORIZADO/);
    await soltar();
    expect((await avisos()).map(a => a.topic).sort()).toEqual([`abobora:${EMPRESA}`, `abobora:${OUTRA}`]);
    expect((await avisos()).every(a => a.event === 'chefao')).toBe(true);
  });

  it('dois chefões ao mesmo tempo, não', async () => {
    await soltar();
    await expect(soltar()).rejects.toThrow(/JA_TEM_UM/);
  });
});

describe('20261009120000 — o tiro', () => {
  it('o primeiro tiro soma a vida da pessoa e entra no ranking com o nome do cadastro', async () => {
    const id = await soltar(500, 250);
    const r = await atirar(ANA, id, 3, 1);
    expect(r.vida_max).toBe(750);
    expect(r.vida).toBe(750 - 6);
    expect(r.ranking).toEqual([expect.objectContaining({ usuario: ANA, nome: 'Ana Paula', dano: 6 })]);
    expect(r.eu).toMatchObject({ dano: 6, posicao: 1 });
    expect(r.freio).toBeUndefined();
  });

  it('nome em branco vira «Alguém»', async () => {
    const id = await soltar();
    expect((await atirar(CAIO, id, 1)).ranking[0].nome).toBe('Alguém');
  });

  it('o freio: lote cedo demais não tira vida e volta marcado, para o app mandar de novo', async () => {
    const id = await soltar(500, 0);
    await atirar(ANA, id, 2);
    const cedo = await atirar(ANA, id, 5);
    expect(cedo.freio).toBe(true);
    expect(cedo.vida).toBe(498);
    await esperarFreio(ANA);
    const depois = await atirar(ANA, id, 5);
    expect(depois.freio).toBeUndefined();
    expect(depois.vida).toBe(493);
  });

  it('o lote não passa de 12 acertos, nem com headshot', async () => {
    const id = await soltar(500, 0);
    expect((await atirar(ANA, id, 50, 50)).vida).toBe(500 - 12);
  });

  it('na contagem, tiro não vale', async () => {
    const id = await soltar(500, 250, 60);
    const r = await atirar(ANA, id, 5);
    expect(r.vida).toBe(500);
    expect(r.participantes).toBe(0);
  });

  it('o golpe final leva o nome de quem já vinha atirando', async () => {
    const id = await soltar(10, 0);
    await atirar(BRUNO, id, 4);
    await esperarFreio(BRUNO);
    const r = await atirar(BRUNO, id, 12);
    expect(r.situacao).toBe('derrotado');
    expect(r.vida).toBe(0);
    expect(r.golpe_final_nome).toBe('Bruno Lima');
    expect(r.eu?.dano).toBe(10);
    // Morto, mais tiro não conta.
    await esperarFreio(ANA);
    expect((await atirar(ANA, id, 3)).participantes).toBe(1);
  });
});

describe('20261009120000 — os avisos sob carga', () => {
  it('apanhando, no máximo um aviso a cada 2 s — de quantas pessoas forem', async () => {
    const id = await soltar(5000, 0);
    await db.exec('truncate realtime.enviados');
    await esperarAviso();
    await atirar(ANA, id, 1);
    await atirar(BRUNO, id, 1);
    await atirar(CAIO, id, 1);
    // Um aviso (às duas empresas) para os três tiros.
    expect(await avisos()).toHaveLength(2);
    await esperarAviso();
    await esperarFreio(ANA);
    await atirar(ANA, id, 1);
    expect(await avisos()).toHaveLength(4);
  });

  it('quando ele cai, avisa na hora, mesmo dentro dos 2 s', async () => {
    const id = await soltar(10, 0);
    await atirar(ANA, id, 1);
    await db.exec('truncate realtime.enviados');
    expect((await atirar(BRUNO, id, 12)).situacao).toBe('derrotado');
    expect(await avisos()).toHaveLength(2);
  });

  it('a fuga avisa uma vez só, com muitos chegando depois do prazo', async () => {
    const id = await soltar(500, 0);
    await db.exec(`update public.chefao_rodadas set expira_em = clock_timestamp() - interval '1 second'`);
    await db.exec('truncate realtime.enviados');
    expect((await atirar(ANA, id, 1)).situacao).toBe('fugiu');
    expect((await atirar(BRUNO, id, 1)).situacao).toBe('fugiu');
    expect(await avisos()).toHaveLength(2);
  });

  it('o aviso leva o mesmo estado que a resposta', async () => {
    const id = await soltar(500, 0);
    await esperarAviso();
    await db.exec('truncate realtime.enviados');
    const r = await atirar(ANA, id, 2);
    const p = (await db.query<{ payload: Estado }>('select payload from realtime.enviados limit 1')).rows[0].payload;
    expect(p.versao).toBe(r.versao);
    expect(p.vida).toBe(r.vida);
    expect(p).not.toHaveProperty('eu');
    expect(p).not.toHaveProperty('avisado_em');
  });
});

interface Ficha { usuario: string; cliques: number; lotes: number; lotes_no_teto: number; suspeitas: number; motivos: number }

const curar = (uid: string, id: number, fracao = 0.25) =>
  como<Estado & { cura_vida: number; cura_em: string; cura_ate: string; expira_em: string }>(
    uid, 'select public.fn_chefao_curar($1, $2) v', [id, fracao]);
const atirarMedindo = (uid: string, id: number, a: number, cliques: number, suspeita: number) =>
  como<Estado>(uid, 'select public.fn_chefao_acertar($1, $2, 0, $3, $4) v', [id, a, cliques, suspeita]);
/** O banquete acabou (passa os 12 s sem esperar). */
const acabarBanquete = () => db.exec(`update public.chefao_rodadas set cura_em = cura_em - interval '20 seconds', cura_ate = cura_ate - interval '20 seconds'`);

describe('20261009120000 — o banquete', () => {
  it('só o super_admin cura', async () => {
    const id = await soltar(500, 0);
    await atirar(ANA, id, 12);
    await expect(curar(ANA, id)).rejects.toThrow(/NAO_AUTORIZADO/);
  });

  it('devolve 25% da vida máxima (no máximo o que falta), marca 12 s e estica o prazo', async () => {
    const id = await soltar(100, 0);
    await atirar(ANA, id, 12);
    await esperarFreio(ANA);
    await atirar(ANA, id, 12);
    const prazo = async () => Number((await db.query<{ ms: string }>('select (extract(epoch from expira_em) * 1000)::bigint ms from public.chefao_rodadas')).rows[0].ms);
    const antes = await prazo();
    const r = await curar(ADMIN, id);
    // Tinha 76; 25% de 100 = 25, mas só faltavam 24.
    expect(r.cura_vida).toBe(24);
    expect(r.vida).toBe(100);
    expect(Date.parse(r.cura_ate) - Date.parse(r.cura_em)).toBe(12_000);
    expect(await prazo() - antes).toBe(12_000);
  });

  it('comendo, ele é imune: o tiro volta marcado e não tira vida', async () => {
    const id = await soltar(500, 0);
    await atirar(ANA, id, 12);
    await curar(ADMIN, id);
    await esperarFreio(ANA);
    const r = await atirar(ANA, id, 12);
    expect(r).toMatchObject({ curando: true, vida: 500 });
    await acabarBanquete();
    expect((await atirar(ANA, id, 12)).vida).toBe(488);
  });

  it('não come duas vezes ao mesmo tempo, nem de vida cheia, nem na contagem', async () => {
    const id = await soltar(500, 0);
    await expect(curar(ADMIN, id)).rejects.toThrow(/VIDA_CHEIA/);
    await atirar(ANA, id, 12);
    await curar(ADMIN, id);
    await expect(curar(ADMIN, id)).rejects.toThrow(/JA_COMENDO/);

    await db.exec(`update public.chefao_rodadas set situacao = 'fugiu'`);
    const outro = await soltar(500, 0, 60);
    await expect(curar(ADMIN, outro)).rejects.toThrow(/AINDA_CHEGANDO/);
  });

  it('avisa todo mundo na hora (o banquete é o mesmo em toda tela)', async () => {
    const id = await soltar(500, 0);
    await atirar(ANA, id, 12);
    await db.exec('truncate realtime.enviados');
    await curar(ADMIN, id);
    const p = (await db.query<{ payload: Record<string, unknown> }>('select payload from realtime.enviados')).rows;
    expect(p).toHaveLength(2);
    // Faltavam 12: ele recupera 12 (não os 125 dos 25%).
    expect(p[0].payload).toMatchObject({ cura_vida: 12, vida: 500 });
    expect(typeof p[0].payload.cura_semente).toBe('number');
  });
});

describe('20261009120000 — autoclick', () => {
  const fichas = (id: number) => como<Ficha[]>(ADMIN, 'select public.fn_chefao_suspeitos($1) v', [id]);

  it('guarda os cliques, conta só as pistas fortes como suspeita e junta os motivos', async () => {
    const id = await soltar(5000, 0);
    await atirarMedindo(ANA, id, 3, 9, 16);  // mouse parado: pista fraca
    await esperarFreio(ANA);
    await atirarMedindo(ANA, id, 3, 14, 1);  // ritmo de máquina: forte
    await esperarFreio(ANA);
    await atirarMedindo(ANA, id, 12, 30, 1 | 8);
    const ana = (await fichas(id)).find(f => f.usuario === ANA)!;
    expect(ana).toMatchObject({ cliques: 53, lotes: 3, lotes_no_teto: 1, suspeitas: 2, motivos: 1 | 8 | 16 });
  });

  it('o lote recusado (freio, banquete) não conta', async () => {
    const id = await soltar(5000, 0);
    await atirarMedindo(BRUNO, id, 2, 5, 0);
    await atirarMedindo(BRUNO, id, 2, 5, 1);
    expect((await fichas(id)).find(f => f.usuario === BRUNO)).toMatchObject({ lotes: 1, suspeitas: 0, cliques: 5 });
  });

  it('o número que vem do app tem teto: ninguém manda um milhão de cliques', async () => {
    const id = await soltar(5000, 0);
    await atirarMedindo(CAIO, id, 1, 1_000_000, 99_999);
    expect((await fichas(id))[0]).toMatchObject({ cliques: 100, motivos: 255 });
  });

  it('só o super_admin vê a lista', async () => {
    const id = await soltar(5000, 0);
    await expect(como(ANA, 'select public.fn_chefao_suspeitos($1) v', [id])).rejects.toThrow(/NAO_AUTORIZADO/);
  });

  it('a suspeita não vai no aviso nem no ranking de todo mundo', async () => {
    const id = await soltar(5000, 0);
    await esperarAviso();
    await db.exec('truncate realtime.enviados');
    await atirarMedindo(ANA, id, 3, 20, 1);
    const p = (await db.query<{ payload: { ranking: Record<string, unknown>[] } }>('select payload from realtime.enviados limit 1')).rows[0].payload;
    expect(p.ranking[0]).not.toHaveProperty('suspeitas');
    expect(p.ranking[0]).not.toHaveProperty('motivos');
    expect(JSON.stringify(p)).not.toContain('cliques');
  });
});

describe('20261009120000 — permissões', () => {
  it('o app chama o tiro; as peças internas, não', async () => {
    const pode = async (f: string) => (await db.query<{ v: boolean }>(
      `select has_function_privilege('authenticated', '${f}', 'EXECUTE') v`)).rows[0].v;
    expect(await pode('public.fn_chefao_acertar(bigint, integer, integer, integer, integer)')).toBe(true);
    expect(await pode('public.fn_chefao_enviar(jsonb)')).toBe(false);
    expect(await pode('public.fn_chefao_avisar(bigint)')).toBe(false);
  });
});

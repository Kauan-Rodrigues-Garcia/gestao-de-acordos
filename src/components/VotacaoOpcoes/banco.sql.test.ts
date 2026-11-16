// @vitest-environment node
/**
 * banco.sql.test.ts — a migration da votação de opções (20261116190000) num
 * Postgres de verdade (PGlite, LOCAL — não é o banco de produção).
 *
 * Prova: só o super_admin libera e acompanha; só quem está na lista vota, uma
 * vez, numa opção que existe, com a votação aberta; ninguém lê a opção de
 * outra pessoa.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const ADMIN = '00000000-0000-4000-8000-0000000000a1';
const O1    = '00000000-0000-4000-8000-0000000000c1';
const O2    = '00000000-0000-4000-8000-0000000000c2';
const O3    = '00000000-0000-4000-8000-0000000000c3';
const FORA  = '00000000-0000-4000-8000-0000000000f1';
const INATIVO = '00000000-0000-4000-8000-0000000000f2';
const SETOR = '00000000-0000-4000-8000-0000000000e1';

const SQL = readFileSync(resolve(__dirname, '../../../supabase/migrations/20261116190000_votacao_opcoes.sql'), 'utf8');
const OPCOES = [{ id: 'premios', titulo: 'Sorteio de prêmios' }, { id: 'happy', titulo: 'Happy hour' }];

let db: PGlite;

async function como<T>(uid: string, sql: string, params: unknown[] = []): Promise<T> {
  await db.query("select set_config('teste.uid', $1, false)", [uid]);
  await db.query("select set_config('teste.super', $1, false)", [uid === ADMIN ? 'sim' : '']);
  const r = await db.query<{ v: T }>(sql, params);
  return r.rows[0]?.v as T;
}
const liberar = (uid = ADMIN, opcoes: unknown = OPCOES, eleitores = [O1, O2, O3]) =>
  como<string>(uid, 'select public.fn_votacao_opcoes_liberar($1, $2, $3::jsonb, $4, $5::jsonb) v',
    ['Votação de dezembro', 'Prêmios ou happy hour?', JSON.stringify(opcoes), eleitores, JSON.stringify({ setores: [SETOR] })]);
const mudar = (id: string, acao: string, uid = ADMIN) => como(uid, 'select public.fn_votacao_opcoes_mudar($1, $2) v', [id, acao]);
const votar = (uid: string, id: string, opcao: string) => como(uid, 'select public.fn_votacao_opcoes_votar($1, $2) v', [id, opcao]);
type Minha = { id: string; meu_voto: string | null; opcoes: { id: string }[] };
const minhas = (uid: string) => como<Minha[]>(uid, 'select public.fn_votacao_opcoes_minhas() v');
type NaLista = { id: string; estado: string; eleitores: number; votaram: number; contagem: Record<string, number> };
const listar = (uid = ADMIN) => como<NaLista[]>(uid, 'select public.fn_votacao_opcoes_listar() v');

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('teste.uid', true), '')::uuid $$;
    create table public.setores (id uuid primary key, nome text);
    insert into public.setores values ('${SETOR}', 'Play 1');
    create table public.perfis (id uuid primary key, nome text, setor_id uuid, perfil text, ativo boolean);
    insert into public.perfis values
      ('${ADMIN}', 'Kauan', null, 'super_admin', true),
      ('${O1}', 'Ana', '${SETOR}', 'operador', true), ('${O2}', 'Bruno', '${SETOR}', 'operador', true),
      ('${O3}', 'Carla', '${SETOR}', 'operador', true), ('${FORA}', 'Fora', '${SETOR}', 'operador', true),
      ('${INATIVO}', 'Saiu', '${SETOR}', 'operador', false);
    create function public.fn_user_is_super_admin() returns boolean language sql stable
      as $$ select current_setting('teste.super', true) = 'sim' $$;
  `);
  await db.exec(SQL);
  await db.exec(SQL); // reexecutável
});

beforeEach(async () => { await db.exec('delete from public.votacao_opcoes;'); });
afterAll(async () => { await db.close(); });

describe('liberar', () => {
  it('só o super_admin; 2 a 6 opções com título, sem repetir; alguém votando', async () => {
    await expect(liberar(O1)).rejects.toThrow(/NAO_AUTORIZADO/);
    await expect(liberar(ADMIN, [OPCOES[0]])).rejects.toThrow(/2 a 6/);
    await expect(liberar(ADMIN, [OPCOES[0], { id: 'x', titulo: ' ' }])).rejects.toThrow(/título/);
    await expect(liberar(ADMIN, [OPCOES[0], OPCOES[0]])).rejects.toThrow(/repetidas/);
    await expect(liberar(ADMIN, OPCOES, [])).rejects.toThrow(/quem vota/);
    await expect(liberar(ADMIN, OPCOES, [INATIVO])).rejects.toThrow(/quem vota/);
    expect(await liberar()).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('a lista fica sem inativos e sem repetição', async () => {
    await liberar(ADMIN, OPCOES, [O1, O1, O2, INATIVO]);
    const [v] = await listar();
    expect(v.eleitores).toBe(2);
    expect(v.estado).toBe('aberta');
  });
});

describe('votar', () => {
  it('quem está na lista vê a votação e vota uma vez', async () => {
    const id = await liberar();
    expect((await minhas(O1)).map(v => [v.id, v.meu_voto])).toEqual([[id, null]]);
    expect(await minhas(FORA)).toEqual([]);
    await votar(O1, id, 'premios');
    expect((await minhas(O1))[0].meu_voto).toBe('premios');
    await expect(votar(O1, id, 'happy')).rejects.toThrow(/já votou/);
    await expect(votar(FORA, id, 'happy')).rejects.toThrow(/NAO_AUTORIZADO/);
    await expect(votar(O2, id, 'churrasco')).rejects.toThrow(/inválida/);
    await votar(O2, id, 'happy');
    await votar(O3, id, 'happy');
    const [v] = await listar();
    expect(v.votaram).toBe(3);
    expect(v.contagem).toEqual({ premios: 1, happy: 2 });
  });

  it('encerrada não recebe voto e some de «minhas»; reabrir volta', async () => {
    const id = await liberar();
    await expect(mudar(id, 'encerrar', O1)).rejects.toThrow(/NAO_AUTORIZADO/);
    await mudar(id, 'encerrar');
    expect(await minhas(O1)).toEqual([]);
    await expect(votar(O1, id, 'premios')).rejects.toThrow(/não está aberta/);
    await expect(mudar(id, 'encerrar')).rejects.toThrow(/aberta/);
    await mudar(id, 'reabrir');
    await votar(O1, id, 'premios');
    await mudar(id, 'cancelar');
    await expect(mudar(id, 'reabrir')).rejects.toThrow(/encerrada/);
    await expect(mudar(id, 'voar')).rejects.toThrow(/Ação desconhecida|cancelada/);
  });
});

describe('quem vê o quê', () => {
  it('a participação diz quem votou e quando, nunca a opção; só para o super_admin', async () => {
    const id = await liberar();
    await votar(O1, id, 'premios');
    await expect(como(O1, 'select public.fn_votacao_opcoes_participacao($1) v', [id])).rejects.toThrow(/NAO_AUTORIZADO/);
    await expect(listar(O1)).rejects.toThrow(/NAO_AUTORIZADO/);
    const p = await como<Array<Record<string, unknown>>>(ADMIN, 'select public.fn_votacao_opcoes_participacao($1) v', [id]);
    expect(p.map(x => [x.nome, x.setor, !!x.votado_em])).toEqual([['Ana', 'Play 1', true], ['Bruno', 'Play 1', false], ['Carla', 'Play 1', false]]);
    expect(JSON.stringify(p)).not.toContain('premios');
  });

  it('as tabelas não abrem direto para o app', async () => {
    const r = await db.query<{ ok: boolean }>(
      "select has_table_privilege('authenticated', 'public.votacao_opcoes_votos', 'select') as ok");
    expect(r.rows[0].ok).toBe(false);
  });
});

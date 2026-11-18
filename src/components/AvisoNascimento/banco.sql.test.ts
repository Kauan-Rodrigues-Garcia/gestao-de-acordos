// @vitest-environment node
/**
 * banco.sql.test.ts — a migration do aviso de nascimento (20261118150000) num
 * Postgres de verdade (PGlite, LOCAL — não é o banco de produção).
 *
 * Prova: nada aparece antes de liberar; depois, TODA pessoa ativa do setor vê e
 * ninguém de fora vê; recado só do público e só admin lê.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const SUPER = '00000000-0000-4000-8000-0000000000a1';
const ADMIN = '00000000-0000-4000-8000-0000000000a2';
const OPERADOR = '00000000-0000-4000-8000-0000000000c1';
const LIDER = '00000000-0000-4000-8000-0000000000c2';
const GERENTE = '00000000-0000-4000-8000-0000000000c3';
const OUTRO_SETOR = '00000000-0000-4000-8000-0000000000d1';
const INATIVO = '00000000-0000-4000-8000-0000000000f1';
const SETOR = '00000000-0000-4000-8000-0000000000e1';
const SETOR2 = '00000000-0000-4000-8000-0000000000e2';
const AVISO = '00000000-0000-4000-8000-0000000000b1';

const SQL = readFileSync(resolve(__dirname, '../../../supabase/migrations/20261118150000_aviso_nascimento.sql'), 'utf8');
let db: PGlite;

async function como<T>(uid: string, sql: string, params: unknown[] = []): Promise<T> {
  await db.query("select set_config('teste.uid', $1, false)", [uid]);
  const r = await db.query<{ v: T }>(sql, params);
  return r.rows[0]?.v as T;
}
type Meu = { id: string; pode_recado: boolean; vi: boolean; meu_recado: string | null };
const meu = (uid: string) => como<Meu[]>(uid, 'select public.fn_nascimento_meu() v');
const liberar = (uid = SUPER, sim = true) => como(uid, 'select public.fn_nascimento_liberar($1, $2) v', [AVISO, sim]);
const foto = (uid = SUPER, caminho = `${AVISO}/foto.jpg`) => como(uid, 'select public.fn_nascimento_definir_foto($1, $2) v', [AVISO, caminho]);
const recado = (uid: string, texto: string) => como(uid, 'select public.fn_nascimento_recado($1, $2) v', [AVISO, texto]);
type Pessoa = { id: string; no_publico: boolean; viu_em: string | null; recado: string | null };
const painel = (uid = ADMIN) => como<Array<{ pessoas: Pessoa[]; setor_nome: string }>>(uid, 'select public.fn_nascimento_painel() v');

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('teste.uid', true), '')::uuid $$;
    create table public.setores (id uuid primary key, nome text, empresa_id uuid);
    insert into public.setores values ('${SETOR}', 'Setor A', null), ('${SETOR2}', 'Setor B', null);
    create table public.perfis (id uuid primary key, nome text, setor_id uuid, perfil text, ativo boolean);
    insert into public.perfis values
      ('${SUPER}', 'Super', null, 'super_admin', true), ('${ADMIN}', 'Admin', null, 'administrador', true),
      ('${OPERADOR}', 'Ana', '${SETOR}', 'operador', true), ('${LIDER}', 'Lia', '${SETOR}', 'lider', true),
      ('${GERENTE}', 'Gerente', '${SETOR}', 'gerencia', true), ('${OUTRO_SETOR}', 'Bia', '${SETOR2}', 'operador', true),
      ('${INATIVO}', 'Saiu', '${SETOR}', 'operador', false);
    create function public.fn_user_is_super_admin() returns boolean language sql stable
      as $$ select auth.uid() = '${SUPER}'::uuid $$;
  `);
  await db.exec(SQL);
  await db.exec(SQL); // reexecutável
});
afterAll(async () => { await db.close(); });
beforeEach(async () => {
  await db.exec(`delete from public.avisos_nascimento;
    insert into public.avisos_nascimento (id, setor_id, conteudo, homenageada_id)
    values ('${AVISO}', '${SETOR}', '{"titulo":"Exemplo"}', '${GERENTE}')`);
});

describe('aviso de nascimento (migration 20261118150000)', () => {
  it('não libera sem foto, e só o super_admin libera ou troca a foto', async () => {
    await expect(liberar()).rejects.toThrow(/foto antes/);
    await expect(foto(ADMIN)).rejects.toThrow(/NAO_AUTORIZADO/);
    await expect(foto(SUPER, 'outro/foto.jpg')).rejects.toThrow(/inválido/);
    await foto();
    await expect(liberar(ADMIN)).rejects.toThrow(/NAO_AUTORIZADO/);
    await expect(liberar(OPERADOR)).rejects.toThrow(/NAO_AUTORIZADO/);
  });

  it('antes de liberar ninguém vê', async () => {
    await foto();
    for (const uid of [OPERADOR, LIDER, GERENTE, OUTRO_SETOR]) expect(await meu(uid)).toEqual([]);
  });

  it('liberado: todo cargo ativo do setor vê; outro setor, inativo e cúpula sem setor não', async () => {
    await foto(); await liberar();
    for (const uid of [OPERADOR, LIDER, GERENTE]) expect((await meu(uid)).map(a => a.id)).toEqual([AVISO]);
    for (const uid of [OUTRO_SETOR, INATIVO, SUPER, ADMIN]) expect(await meu(uid)).toEqual([]);
  });

  it('recolher tira da tela e liberar de novo devolve', async () => {
    await foto(); await liberar(); await liberar(SUPER, false);
    expect(await meu(OPERADOR)).toEqual([]);
    await expect(recado(OPERADOR, 'Parabéns!')).rejects.toThrow(/NAO_AUTORIZADO/);
    await liberar();
    expect(await meu(OPERADOR)).toHaveLength(1);
  });

  it('«vi» conta só para o público e uma vez', async () => {
    await foto(); await liberar();
    for (const uid of [OPERADOR, OPERADOR, OUTRO_SETOR]) await como(uid, 'select public.fn_nascimento_vi($1) v', [AVISO]);
    expect((await meu(OPERADOR))[0].vi).toBe(true);
    expect((await meu(LIDER))[0].vi).toBe(false);
    const [a] = await painel();
    expect(a.pessoas.filter(p => p.viu_em).map(p => p.id)).toEqual([OPERADOR]);
    expect(a.pessoas.filter(p => p.no_publico)).toHaveLength(3);
  });

  it('recado: uma linha por pessoa, editável; quem é homenageada ou de fora não escreve', async () => {
    await foto(); await liberar();
    await recado(OPERADOR, 'Muita saúde!');
    await recado(OPERADOR, 'Muita saúde e alegria!');
    expect((await meu(OPERADOR))[0].meu_recado).toBe('Muita saúde e alegria!');
    expect((await meu(GERENTE))[0].pode_recado).toBe(false);
    await expect(recado(GERENTE, 'Oi, eu mesma')).rejects.toThrow(/NAO_AUTORIZADO/);
    await expect(recado(OUTRO_SETOR, 'Parabéns!')).rejects.toThrow(/NAO_AUTORIZADO/);
    await expect(recado(OPERADOR, 'x')).rejects.toThrow(/3 a 280/);
    expect((await painel()).at(0)?.pessoas.filter(p => p.recado).map(p => p.recado)).toEqual(['Muita saúde e alegria!']);
  });

  it('só administrador e super_admin leem o painel', async () => {
    const [doSuper] = await painel(SUPER) as Array<{ setor_nome: string; posso_liberar?: boolean }>;
    expect(doSuper).toMatchObject({ setor_nome: 'Setor A', posso_liberar: true });
    const [doAdmin] = await painel(ADMIN) as Array<{ posso_liberar?: boolean }>;
    expect(doAdmin.posso_liberar).toBe(false);
    for (const uid of [OPERADOR, LIDER, GERENTE]) await expect(painel(uid)).rejects.toThrow(/NAO_AUTORIZADO/);
  });

  it('a foto do aviso só é visível para admin e, depois de liberar, para o setor', async () => {
    const ids = (uid: string) => como<string[]>(uid, 'select coalesce(array_agg(x), array[]::text[]) v from public.fn_nascimento_ids_visiveis() x');
    await foto();
    expect(await ids(OPERADOR)).toEqual([]);
    expect(await ids(ADMIN)).toEqual([AVISO]);
    await liberar();
    expect(await ids(OPERADOR)).toEqual([AVISO]);
    expect(await ids(OUTRO_SETOR)).toEqual([]);
  });

  it('ninguém lê as tabelas direto', async () => {
    for (const t of ['avisos_nascimento', 'avisos_nascimento_vistas', 'avisos_nascimento_recados']) {
      const r = await db.query<{ ok: boolean }>(`select has_table_privilege('authenticated', 'public.${t}', 'select') ok`);
      expect(r.rows[0].ok).toBe(false);
    }
  });
});

// @vitest-environment node
/**
 * senhaPedidos.sql.test.ts — a migration 20261105100000 num Postgres de verdade
 * (PGlite).
 *
 * O que importa provar:
 *
 *   * só quem tem `ver_usuarios` pede, só de gente do próprio setor, nunca da
 *     cúpula nem de si mesmo, e um pedido aberto por pessoa;
 *   * o super admin vê todos, quem pediu vê só os seus;
 *   * só super admin reserva; só o servidor (sem auth.uid) conclui;
 *   * concluir liga a troca obrigatória e guarda a senha para quem pediu;
 *   * a própria pessoa não desliga a trava por UPDATE — só trocando a senha,
 *     e aí a senha some do pedido.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const EMPRESA = '00000000-0000-4000-8000-000000000001';
const PLAY1 = '00000000-0000-4000-8000-0000000000a1';
const PLAY2 = '00000000-0000-4000-8000-0000000000a2';
const SUPER = '00000000-0000-4000-8000-000000000010';
const LIDER = '00000000-0000-4000-8000-000000000011';
const OPERADOR = '00000000-0000-4000-8000-000000000012';
const OUTRO_SETOR = '00000000-0000-4000-8000-000000000013';
const DIRETOR = '00000000-0000-4000-8000-000000000014';
const SEM_CHAVE = '00000000-0000-4000-8000-000000000015';
const OPERADOR2 = '00000000-0000-4000-8000-000000000016';

const raiz = resolve(__dirname, '../../..');
const MIGRATION = readFileSync(resolve(raiz, 'supabase/migrations/20261105100000_senha_pedidos.sql'), 'utf8');

let db: PGlite;

/** Roda `sql` como `authenticated`, com `uid` no papel de auth.uid(). */
async function como<T>(uid: string, sql: string): Promise<T[]> {
  await db.exec(`set app.uid = '${uid}'; set role authenticated;`);
  try {
    return (await db.query<T>(sql)).rows;
  } finally {
    await db.exec(`reset role; reset app.uid;`);
  }
}

/** Roda como o servidor: service_role, sem auth.uid(). */
async function comoServidor<T>(sql: string): Promise<T[]> {
  await db.exec(`set role service_role;`);
  try {
    return (await db.query<T>(sql)).rows;
  } finally {
    await db.exec(`reset role;`);
  }
}

async function erroDe(fn: () => Promise<unknown>): Promise<string | null> {
  try { await fn(); return null; } catch (e) { return (e as Error).message; }
}

type R = { r: { ok: boolean; erro?: string; id?: string; por?: string } };
const pedir = (uid: string, alvo: string) =>
  como<R>(uid, `select public.fn_senha_pedir('${alvo}', 'esqueceu') as r`).then(l => l[0].r);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('app.uid', true), '')::uuid $$;

    create table public.empresas (id uuid primary key);
    create table public.setores (id uuid primary key, empresa_id uuid, nome text);
    create table public.perfis (
      id uuid primary key, nome text, perfil text, usuario text, empresa_id uuid,
      setor_id uuid references public.setores(id), foto_url text,
      ativo boolean default true, arquivado boolean default false, situacao text default 'ativo',
      senha_alterada boolean default true
    );
    create table public.notificacoes (
      id uuid primary key default gen_random_uuid(), usuario_id uuid, titulo text, mensagem text,
      empresa_id uuid, rota text, autor_id uuid, autor_nome text, autor_foto text
    );

    create function public.fn_user_is_super_admin() returns boolean language sql stable as
      $$ select exists (select 1 from public.perfis where id = auth.uid() and perfil = 'super_admin') $$;
    -- Quem tem a chave: todos menos SEM_CHAVE.
    create function public.fn_user_tem(p_chave text) returns boolean language sql stable as
      $$ select auth.uid() is not null and auth.uid() <> '${SEM_CHAVE}'::uuid $$;
    create function public.fn_transferencia_meus_setores() returns setof uuid language sql stable as
      $$ select setor_id from public.perfis where id = auth.uid() and setor_id is not null $$;
    grant usage on schema public to authenticated, service_role;
    grant execute on all functions in schema public to authenticated, service_role;
    grant select, update on public.perfis to authenticated;
    grant all on public.perfis, public.notificacoes, public.setores to service_role;

    insert into public.empresas values ('${EMPRESA}');
    insert into public.setores values ('${PLAY1}', '${EMPRESA}', 'Play 1'), ('${PLAY2}', '${EMPRESA}', 'Play 2');
    insert into public.perfis (id, nome, perfil, usuario, empresa_id, setor_id) values
      ('${SUPER}', 'Cleber', 'super_admin', 'cleber', '${EMPRESA}', null),
      ('${LIDER}', 'Rhaissa Lider', 'lider', 'rhaissa', '${EMPRESA}', '${PLAY1}'),
      ('${OPERADOR}', 'Joao Operador', 'operador', 'joao', '${EMPRESA}', '${PLAY1}'),
      ('${OPERADOR2}', 'Ana Operadora', 'operador', 'ana', '${EMPRESA}', '${PLAY1}'),
      ('${OUTRO_SETOR}', 'Maria Outra', 'operador', 'maria', '${EMPRESA}', '${PLAY2}'),
      ('${DIRETOR}', 'Diretor', 'diretoria', 'diretor', '${EMPRESA}', '${PLAY1}'),
      ('${SEM_CHAVE}', 'Sem Chave', 'supervisor', 'semchave', '${EMPRESA}', '${PLAY1}');
  `);
  await db.exec(MIGRATION);
  await db.exec(`grant execute on all functions in schema public to service_role;`);
});

afterAll(async () => { await db?.close(); });

describe('pedir', () => {
  it('recusa sem a chave, a própria conta, a cúpula e outro setor', async () => {
    expect((await pedir(SEM_CHAVE, OPERADOR)).erro).toBe('sem_permissao');
    expect((await pedir(LIDER, LIDER)).erro).toBe('propria_senha');
    expect((await pedir(LIDER, DIRETOR)).erro).toBe('alvo_invalido');
    expect((await pedir(LIDER, OUTRO_SETOR)).erro).toBe('fora_do_seu_setor');
    expect((await pedir(SUPER, OPERADOR)).erro).toBe('sem_permissao');
  });

  it('pede, avisa os super admins e não deixa pedido duplicado', async () => {
    const r = await pedir(LIDER, OPERADOR);
    expect(r.ok).toBe(true);
    const dup = await pedir(LIDER, OPERADOR);
    expect(dup).toMatchObject({ ok: false, erro: 'ja_pedido', por: 'Rhaissa Lider' });
    const avisos = await db.query<{ usuario_id: string; rota: string }>(
      `select usuario_id, rota from public.notificacoes where titulo = 'Pedido de reset de senha'`);
    expect(avisos.rows).toEqual([{ usuario_id: SUPER, rota: '/senhas' }]);
  });

  it('a tabela não abre para authenticated', async () => {
    expect(await erroDe(() => como(LIDER, `select * from public.senha_pedidos`))).toMatch(/permission denied/);
  });
});

describe('ler', () => {
  it('super admin vê todos; quem pediu vê os seus; outro não vê nada', async () => {
    await pedir(LIDER, OPERADOR2);
    const doSuper = await como<{ r: unknown[] }>(SUPER, `select public.fn_senha_pedidos_listar() as r`);
    const doLider = await como<{ r: unknown[] }>(LIDER, `select public.fn_senha_pedidos_listar() as r`);
    const doOperador = await como<{ r: unknown[] }>(OPERADOR, `select public.fn_senha_pedidos_listar() as r`);
    expect(doSuper[0].r).toHaveLength(2);
    expect(doLider[0].r).toHaveLength(2);
    expect(doOperador[0].r).toHaveLength(0);
  });
});

describe('aprovar', () => {
  const idDe = async (alvo: string) =>
    (await db.query<{ id: string }>(`select id from public.senha_pedidos where alvo_id = '${alvo}'`)).rows[0].id;

  it('só super admin reserva; só o servidor conclui', async () => {
    const id = await idDe(OPERADOR);
    const doLider = await como<R>(LIDER, `select public.fn_senha_pedido_reservar('${id}') as r`);
    expect(doLider[0].r.erro).toBe('so_super_admin');
    expect(await erroDe(() => como(SUPER, `select public.fn_senha_pedido_concluir('${id}', 'k7m4px', '${SUPER}')`)))
      .toMatch(/permission denied/);

    const res = await como<R>(SUPER, `select public.fn_senha_pedido_reservar('${id}') as r`);
    expect(res[0].r.ok).toBe(true);
    const fim = await comoServidor<R>(`select public.fn_senha_pedido_concluir('${id}', 'k7m4px', '${SUPER}') as r`);
    expect(fim[0].r.ok).toBe(true);

    const p = await db.query<{ senha_troca_obrigatoria: boolean; senha_alterada: boolean }>(
      `select senha_troca_obrigatoria, senha_alterada from public.perfis where id = '${OPERADOR}'`);
    expect(p.rows[0]).toEqual({ senha_troca_obrigatoria: true, senha_alterada: false });

    const lista = await como<{ r: Array<{ alvo_id: string; senha: string | null; status: string }> }>(
      LIDER, `select public.fn_senha_pedidos_listar() as r`);
    expect(lista[0].r.find(x => x.alvo_id === OPERADOR)).toMatchObject({ status: 'aprovado', senha: 'k7m4px' });

    const aviso = await db.query<{ mensagem: string }>(
      `select mensagem from public.notificacoes where usuario_id = '${LIDER}' and titulo = 'Senha resetada'`);
    expect(aviso.rows).toHaveLength(1);
    expect(aviso.rows[0].mensagem).not.toContain('k7m4px');
  });

  it('a própria pessoa não desliga a trava por UPDATE', async () => {
    const erro = await erroDe(() => como(OPERADOR,
      `update public.perfis set senha_troca_obrigatoria = false where id = '${OPERADOR}'`));
    expect(erro).toMatch(/só sai trocando a senha/);
  });

  it('trocar a senha desliga a trava e apaga a senha do pedido', async () => {
    await como(OPERADOR, `select public.fn_senha_troca_concluida()`);
    const p = await db.query<{ senha_troca_obrigatoria: boolean; senha_alterada: boolean }>(
      `select senha_troca_obrigatoria, senha_alterada from public.perfis where id = '${OPERADOR}'`);
    expect(p.rows[0]).toEqual({ senha_troca_obrigatoria: false, senha_alterada: true });
    const sp = await db.query<{ senha_provisoria: string | null; trocada_em: string | null }>(
      `select senha_provisoria, trocada_em from public.senha_pedidos where alvo_id = '${OPERADOR}'`);
    expect(sp.rows[0].senha_provisoria).toBeNull();
    expect(sp.rows[0].trocada_em).not.toBeNull();
  });

  it('depois de aprovado, pode pedir de novo', async () => {
    expect((await pedir(LIDER, OPERADOR)).ok).toBe(true);
  });
});

describe('recusar e cancelar', () => {
  it('super admin recusa com motivo; quem pediu cancela o seu', async () => {
    const [a, b] = (await db.query<{ id: string; alvo_id: string }>(
      `select id, alvo_id from public.senha_pedidos where status = 'pendente' order by alvo_id`)).rows;
    const rec = await como<R>(SUPER, `select public.fn_senha_pedido_recusar('${a.id}', 'não é do setor') as r`);
    expect(rec[0].r.ok).toBe(true);
    const outro = await como<R>(OPERADOR, `select public.fn_senha_pedido_cancelar('${b.id}') as r`);
    expect(outro[0].r.ok).toBe(false);
    const meu = await como<R>(LIDER, `select public.fn_senha_pedido_cancelar('${b.id}') as r`);
    expect(meu[0].r.ok).toBe(true);
    const st = await db.query<{ status: string }>(`select status from public.senha_pedidos where id in ('${a.id}', '${b.id}') order by alvo_id`);
    expect(st.rows.map(x => x.status)).toEqual(['recusado', 'cancelado']);
  });
});

// @vitest-environment node
/**
 * desafioSoQuemDisputa.sql.test.ts — a migration 20261105120000 num Postgres
 * de verdade (PGlite).
 *
 * O operador só enxerga a campanha que DISPUTA. A prova principal é de
 * contrato: para cada campanha e cada pessoa, `fn_desafio_eu_disputo` (SQL)
 * responde o mesmo que `participaDaCampanha` (o ranking, no cliente).
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { participaDaCampanha } from './calcularDesafio';
import { normalizarRegra } from './desafios.service';
import type { Desafio, PessoaDesafio } from './types';

const S1 = '00000000-0000-4000-8000-0000000000a1';
const S2 = '00000000-0000-4000-8000-0000000000a2';
const E1 = '00000000-0000-4000-8000-0000000000e1';
const E2 = '00000000-0000-4000-8000-0000000000e2';
const E3 = '00000000-0000-4000-8000-0000000000e3';
const OP  = '00000000-0000-4000-8000-000000000011';
const LID = '00000000-0000-4000-8000-000000000012';
const OP2 = '00000000-0000-4000-8000-000000000013';
const EXC = '00000000-0000-4000-8000-000000000014';

const raiz = resolve(__dirname, '../../..');
const MIGRATION = readFileSync(resolve(raiz, 'supabase/migrations/20261105120000_desafio_so_quem_disputa.sql'), 'utf8');

let db: PGlite;

/** Como as pessoas aparecem no elenco do ranking (`fn_desafio_pessoas_multi`). */
const ELENCO: PessoaDesafio[] = [
  { id: OP,  nome: 'Joao',  usuario: 'Joao.Silva', perfil: 'operador', equipeId: E1, setorId: S1,
    setores: [S1], equipes: [E1], equipesLideradas: [] },
  { id: LID, nome: 'Rhai',  usuario: 'rhaissa', perfil: 'lider', equipeId: E2, setorId: S1,
    setores: [S1], equipes: [E2], equipesLideradas: [E2] },
  // Operadora do Play 2 com clone no Play 1 que conta recebimento.
  { id: OP2, nome: 'Maria', usuario: 'maria', perfil: 'operador', equipeId: E3, setorId: S2,
    setores: [S2, S1], equipes: [E3, E1], equipesLideradas: [] },
  { id: EXC, nome: 'Ana',   usuario: 'ana', perfil: 'operador', equipeId: E1, setorId: S1,
    setores: [S1], equipes: [E1], equipesLideradas: [] },
].map(p => ({ ...p, fotoUrl: null, equipeNome: '', situacao: 'ativo', empresaId: 'emp', convidado: false }));

/** As campanhas, como estão gravadas em `desafios.regra`. */
const CAMPANHAS: Record<string, unknown> = {
  'operação inteira': {},
  'setor Play 1': { participantes: { setores: [S1] } },
  'líderes do Play 1': { participantes: { setores: [S1], cargos: ['lider'] } },
  'setor com exclusão': { participantes: { setores: [S1], excluidos: [EXC] } },
  // `chaveDeLogin` tira o ponto e baixa a caixa: «Joao.Silva» → «joaosilva».
  'convocação por login': { metasPorOperador: { joaosilva: 5000 } },
  'login com ponto não casa': { metasPorOperador: { 'joao.silva': 5000 } },
  'convocação por id (texto)': { metasPorOperador: { [OP2]: '3000' } },
  'mapa sem meta válida': { metasPorOperador: { [OP]: 0, [LID]: '' } },
  'modo teste': { participantes: { setores: [S1], convidados: [LID] } },
  'campanha de líderes': { fonteResultado: 'equipe_liderada', participantes: { cargos: ['lider'] } },
  'meta da equipe ignora o mapa': {
    fonteResultado: 'equipe_liderada', fonteMeta: 'meta_equipe', metasPorOperador: { [OP]: 100 },
  },
  'equipe E2': { participantes: { equipes: [E2] } },
  'lista nominal': { participantes: { operadores: [OP2] } },
  'setor Play 2': { participantes: { setores: [S2] } },
  'JSON torto': { participantes: { setores: 'x', equipes: [1, null] }, metasPorOperador: [] },
};

async function euDisputo(uid: string, regra: unknown): Promise<boolean> {
  await db.exec(`set app.uid = '${uid}'; set role authenticated;`);
  try {
    const r = await db.query<{ r: boolean }>(`select public.fn_desafio_eu_disputo($1::jsonb) as r`, [JSON.stringify(regra)]);
    return r.rows[0].r;
  } finally {
    await db.exec(`reset role; reset app.uid;`);
  }
}

async function noAlcance(uid: string, perms: string, regra: unknown, visibilidade = 'alcance', setorId: string | null = null): Promise<boolean> {
  await db.exec(`set app.uid = '${uid}'; set app.perms = '${perms}'; set role authenticated;`);
  try {
    const r = await db.query<{ r: boolean }>(
      `select public.fn_desafio_no_meu_alcance($1::uuid, $2::jsonb, $3) as r`,
      [setorId, JSON.stringify(regra), visibilidade]);
    return r.rows[0].r;
  } finally {
    await db.exec(`reset role; reset app.uid; reset app.perms;`);
  }
}

function participaNoCliente(p: PessoaDesafio, regra: unknown): boolean {
  return participaDaCampanha(p, { regra: normalizarRegra(regra, 'bater_meta') } as Desafio);
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('app.uid', true), '')::uuid $$;

    create table public.equipes (id uuid primary key, setor_id uuid);
    create table public.perfis (
      id uuid primary key, perfil text, usuario text, setor_id uuid, equipe_id uuid,
      ativo boolean default true, arquivado boolean default false, situacao text default 'ativo'
    );
    create table public.equipe_lideres (lider_id uuid, equipe_id uuid, empresa_id uuid);
    create table public.equipe_operadores_clones (
      operador_id uuid, equipe_id uuid, empresa_id uuid, conta_recebimento boolean
    );

    create function public.fn_user_is_super_admin() returns boolean language sql stable as
      $$ select exists (select 1 from public.perfis where id = auth.uid() and perfil = 'super_admin') $$;
    create function public.fn_user_tem(p_chave text) returns boolean language sql stable as
      $$ select p_chave = any (string_to_array(coalesce(current_setting('app.perms', true), ''), ',')) $$;
    create function public.fn_user_setor_id() returns uuid language sql stable as
      $$ select setor_id from public.perfis where id = auth.uid() $$;
    create function public.fn_user_equipes() returns uuid[] language sql stable as
      $$ select coalesce(array_agg(equipe_id), '{}') from (
           select equipe_id from public.perfis where id = auth.uid()
           union select equipe_id from public.equipe_lideres where lider_id = auth.uid()) t
         where equipe_id is not null $$;
    grant usage on schema public to authenticated;
    grant execute on all functions in schema public to authenticated;

    insert into public.equipes values ('${E1}', '${S1}'), ('${E2}', '${S1}'), ('${E3}', '${S2}');
    insert into public.perfis (id, perfil, usuario, setor_id, equipe_id) values
      ('${OP}',  'operador', 'Joao.Silva', '${S1}', '${E1}'),
      ('${LID}', 'lider',    'rhaissa',    '${S1}', null),
      ('${OP2}', 'operador', 'maria',      '${S2}', '${E3}'),
      ('${EXC}', 'operador', 'ana',        '${S1}', '${E1}');
    insert into public.equipe_lideres values ('${LID}', '${E2}', null);
    insert into public.equipe_operadores_clones values ('${OP2}', '${E1}', null, true);
  `);
  await db.exec(MIGRATION);
});

afterAll(async () => { await db?.close(); });

describe('fn_desafio_eu_disputo = participaDaCampanha', () => {
  for (const [nome, regra] of Object.entries(CAMPANHAS)) {
    it(nome, async () => {
      for (const p of ELENCO) {
        const cliente = participaNoCliente(p, regra);
        const banco = await euDisputo(p.id, regra);
        expect({ pessoa: p.nome, banco }).toEqual({ pessoa: p.nome, banco: cliente });
      }
    });
  }

  it('os casos do relato', async () => {
    // Campanha dos líderes: operador do setor fica de fora.
    expect(await euDisputo(OP, CAMPANHAS['líderes do Play 1'])).toBe(false);
    expect(await euDisputo(LID, CAMPANHAS['líderes do Play 1'])).toBe(true);
    // Convocação pela planilha: só quem tem meta.
    expect(await euDisputo(OP, CAMPANHAS['convocação por login'])).toBe(true);
    expect(await euDisputo(EXC, CAMPANHAS['convocação por login'])).toBe(false);
    // Excluído não vê.
    expect(await euDisputo(EXC, CAMPANHAS['setor com exclusão'])).toBe(false);
  });
});

describe('fn_desafio_no_meu_alcance', () => {
  const OPERADOR = 'desafios_escopo_individual';
  const LIDERANCA = 'desafios_escopo_individual,desafios_escopo_equipe,desafios_escopo_setor';

  it('operador não enxerga a campanha que não disputa', async () => {
    expect(await noAlcance(OP, OPERADOR, CAMPANHAS['líderes do Play 1'])).toBe(false);
    expect(await noAlcance(EXC, OPERADOR, CAMPANHAS['convocação por login'])).toBe(false);
    expect(await noAlcance(EXC, OPERADOR, CAMPANHAS['setor com exclusão'])).toBe(false);
    expect(await noAlcance(OP, OPERADOR, CAMPANHAS['setor Play 2'])).toBe(false);
  });

  it('operador enxerga a que disputa, inclusive a da operação inteira', async () => {
    expect(await noAlcance(OP, OPERADOR, CAMPANHAS['setor Play 1'])).toBe(true);
    expect(await noAlcance(OP, OPERADOR, CAMPANHAS['operação inteira'])).toBe(true);
    expect(await noAlcance(OP2, OPERADOR, CAMPANHAS['setor Play 1'])).toBe(true);
  });

  it('mural e liderança continuam como eram', async () => {
    expect(await noAlcance(OP, OPERADOR, CAMPANHAS['líderes do Play 1'], 'todos')).toBe(true);
    expect(await noAlcance(LID, LIDERANCA, CAMPANHAS['setor com exclusão'])).toBe(true);
    expect(await noAlcance(LID, LIDERANCA, CAMPANHAS['convocação por login'])).toBe(true);
    expect(await noAlcance(LID, LIDERANCA, CAMPANHAS['setor Play 2'])).toBe(false);
  });

  it('sem chave nenhuma, nada', async () => {
    expect(await noAlcance(OP, '', CAMPANHAS['setor Play 1'])).toBe(false);
  });
});

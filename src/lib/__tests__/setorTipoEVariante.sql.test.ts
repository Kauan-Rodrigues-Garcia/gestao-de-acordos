/**
 * Fase 6 — `setores.tipo`, a regra única do Núcleo e `empresas.variante`.
 *
 * Roda a migration num Postgres de verdade (PGlite) com as tabelas mínimas e
 * confere que a regra nova recusa e aceita o mesmo que a trava antiga
 * (20260911121000), com as mesmas frases — a tela as repete em
 * `cargoDoNucleo.ts`.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';

const MIGRATION = readFileSync(
  resolve(__dirname, '../../../supabase/migrations/20261002230000_setor_tipo_e_variante.sql'),
  'utf8',
);

const BOOK = '00000000-0000-4000-8000-0000000000b1';
const PAGUE = '00000000-0000-4000-8000-0000000000b2';
const COM = '00000000-0000-4000-8000-0000000000b3';
const NUC = '00000000-0000-4000-8000-0000000005a1';
const PLAY = '00000000-0000-4000-8000-0000000005a2';
const VAZIO = '00000000-0000-4000-8000-0000000005a3';
const PP_SETOR = '00000000-0000-4000-8000-0000000005b1';
const ASSIST = '00000000-0000-4000-8000-000000000001';
const OPER = '00000000-0000-4000-8000-000000000002';

let db: PGlite;

const ESQUEMA = `
  create role anon; create role authenticated;
  create table public.empresas (id uuid primary key, slug text unique, produto text not null);
  create table public.cargos (
    slug text primary key, nome text not null, ordem smallint not null,
    pertence_a_setor boolean not null, exige_tipo_setor text, acesso_total boolean not null default false);
  insert into public.cargos values
    ('operador', 'Operador', 1, true, null, false),
    ('lider', 'Líder', 3, true, null, false),
    ('diretoria', 'Diretoria', 6, false, null, false),
    ('assistente_adm', 'Assistente ADM', 8, true, 'nucleo', false),
    ('administrador', 'Administrador', 9, false, null, true),
    ('super_admin', 'Super Admin', 10, false, null, true);
  create table public.setores (id uuid primary key, empresa_id uuid not null, nome text);
  create table public.perfis (
    id uuid primary key, empresa_id uuid, setor_id uuid, perfil text references public.cargos (slug), nome text);
  create table public.numeros_config (
    empresa_id uuid primary key, setor_nucleo_id uuid, atualizado_em timestamptz);
  create function public.fn_numeros_setor_e_da_empresa(p_setor uuid, p_empresa uuid) returns boolean
    language sql stable as $$ select p_setor is null or exists (
      select 1 from public.setores where id = p_setor and empresa_id = p_empresa) $$;
  -- A trava antiga, como estava: o gatilho existe, a migration troca o corpo.
  create function public.fn_perfis_cargo_do_nucleo() returns trigger language plpgsql as
    $$ begin return new; end $$;
  create trigger b_trg_perfis_cargo_do_nucleo
    before insert or update of perfil, setor_id, empresa_id on public.perfis
    for each row execute function public.fn_perfis_cargo_do_nucleo();
  create function public.fn_numeros_config_valida() returns trigger language plpgsql as
    $$ begin return new; end $$;
  create trigger trg_numeros_config_valida
    before insert or update on public.numeros_config
    for each row execute function public.fn_numeros_config_valida();

  insert into public.empresas values
    ('${BOOK}', 'bookplay', 'cobranca'), ('${PAGUE}', 'pagueplay', 'cobranca'), ('${COM}', 'comercial', 'comercial');
  insert into public.setores values
    ('${NUC}', '${BOOK}', 'Inteligência e Gestão'), ('${PLAY}', '${BOOK}', 'Play 1'),
    ('${VAZIO}', '${BOOK}', 'Play 2'), ('${PP_SETOR}', '${PAGUE}', 'PP');
  insert into public.numeros_config values ('${BOOK}', '${NUC}', now());
  insert into public.perfis values
    ('${ASSIST}', '${BOOK}', '${NUC}', 'assistente_adm', 'A'),
    ('${OPER}', '${BOOK}', '${PLAY}', 'operador', 'O');
`;

async function erro(sql: string): Promise<string | null> {
  try {
    await db.exec(sql);
    return null;
  } catch (e) {
    // A migration falha dentro do BEGIN: a sessão fica em transação abortada.
    await db.exec('rollback').catch(() => undefined);
    return (e as Error).message;
  }
}

async function tipo(setor: string): Promise<string> {
  const r = await db.query<{ tipo: string }>('select tipo from public.setores where id = $1', [setor]);
  return r.rows[0].tipo;
}

beforeEach(async () => {
  db = new PGlite();
  await db.exec(ESQUEMA);
});

describe('a migration', () => {
  it('marca o Núcleo e a variante, e pode ser reaplicada', async () => {
    await db.exec(MIGRATION);
    await db.exec(MIGRATION);
    expect(await tipo(NUC)).toBe('nucleo');
    expect(await tipo(PLAY)).toBe('operacao');
    const v = await db.query<{ slug: string; variante: string | null }>(
      'select slug, variante from public.empresas order by slug');
    expect(v.rows).toEqual([
      { slug: 'bookplay', variante: 'bookplay' },
      { slug: 'comercial', variante: null },
      { slug: 'pagueplay', variante: 'pagueplay' },
    ]);
  });

  it('a prova recusa aplicar com alguém em violação', async () => {
    await db.exec(`update public.perfis set setor_id = '${NUC}' where id = '${OPER}'`);
    expect(await erro(MIGRATION)).toMatch(/violacao da regra de tipo de setor/);
    // Desfez tudo: a coluna nem existe.
    expect(await erro('select tipo from public.setores')).toMatch(/tipo/);
  });

  it('recusa empresa de cobrança que não seja bookplay/pagueplay', async () => {
    await db.exec(`insert into public.empresas values (gen_random_uuid(), 'nova', 'cobranca')`);
    expect(await erro(MIGRATION)).toMatch(/decidir a variante/);
  });
});

describe('a regra, depois da migration', () => {
  beforeEach(async () => { await db.exec(MIGRATION); });

  it('o setor do Núcleo recusa cargo comum', async () => {
    expect(await erro(`update public.perfis set setor_id = '${NUC}' where id = '${OPER}'`))
      .toBe('O setor Núcleo de Inteligência e Gestão só aceita o cargo Assistente ADM.');
  });

  it('Assistente ADM fora do Núcleo é recusado', async () => {
    expect(await erro(`update public.perfis set setor_id = '${PLAY}' where id = '${ASSIST}'`))
      .toBe('Assistente ADM só pode estar no setor Núcleo de Inteligência e Gestão.');
    expect(await erro(`update public.perfis set perfil = 'assistente_adm' where id = '${OPER}'`))
      .toBe('Assistente ADM só pode estar no setor Núcleo de Inteligência e Gestão.');
  });

  it('empresa sem Núcleo não aceita Assistente ADM', async () => {
    expect(await erro(
      `insert into public.perfis values (gen_random_uuid(), '${PAGUE}', '${PP_SETOR}', 'assistente_adm', 'X')`))
      .toBe('Assistente ADM é o cargo do Núcleo de Inteligência e Gestão, e esta empresa não tem o Núcleo configurado.');
  });

  it('acesso total e cúpula atravessam; troca de cargo dentro do Núcleo para comum é recusada', async () => {
    expect(await erro(`update public.perfis set perfil = 'administrador' where id = '${ASSIST}'`)).toBeNull();
    expect(await erro(`update public.perfis set perfil = 'lider' where id = '${ASSIST}'`))
      .toBe('O setor Núcleo de Inteligência e Gestão só aceita o cargo Assistente ADM.');
    expect(await erro(`update public.perfis set perfil = 'diretoria', setor_id = null where id = '${OPER}'`)).toBeNull();
  });

  it('o tipo do setor não muda deixando gente em violação', async () => {
    expect(await erro(`update public.setores set tipo = 'operacao' where id = '${NUC}'`))
      .toMatch(/não cabe num setor do tipo operacao/);
    expect(await erro(`update public.setores set tipo = 'nucleo' where id = '${PLAY}'`))
      .toMatch(/setores_um_nucleo_por_empresa|não cabe/);
  });

  it('trocar o Núcleo em numeros_config espelha em setores.tipo', async () => {
    expect(await erro(`update public.numeros_config set setor_nucleo_id = '${VAZIO}'`))
      .toMatch(/Há Assistente ADM no setor atual do Núcleo/);
    expect(await erro(`update public.numeros_config set setor_nucleo_id = '${PLAY}'`))
      .toMatch(/Há Assistente ADM no setor atual do Núcleo/);

    await db.exec(`delete from public.perfis where id = '${ASSIST}'`);
    expect(await erro(`update public.numeros_config set setor_nucleo_id = '${PLAY}'`))
      .toMatch(/tem pessoas com cargo comum/);

    await db.exec(`update public.numeros_config set setor_nucleo_id = '${VAZIO}'`);
    expect(await tipo(NUC)).toBe('operacao');
    expect(await tipo(VAZIO)).toBe('nucleo');

    await db.exec(`delete from public.numeros_config`);
    expect(await tipo(VAZIO)).toBe('operacao');
  });

  it('empresa de cobrança precisa de variante, e só ela tem', async () => {
    expect(await erro(`update public.empresas set variante = null where slug = 'bookplay'`))
      .toMatch(/empresas_variante_da_cobranca/);
    expect(await erro(`update public.empresas set variante = 'bookplay' where slug = 'comercial'`))
      .toMatch(/empresas_variante_da_cobranca/);
  });
});

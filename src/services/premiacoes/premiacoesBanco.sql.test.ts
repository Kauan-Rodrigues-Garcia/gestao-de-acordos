// @vitest-environment node
/**
 * premiacoesBanco.sql.test.ts — a migration 20260918150000 e o script dos
 * crachás da planilha num Postgres de verdade (PGlite).
 *
 * As tabelas do RH e as funções de escopo são reduzidas à forma que as duas
 * RPCs leem; o que se prova é a regra de cada uma e o casamento de nomes da
 * planilha com o cadastro — que decide de quem é cada crachá.
 *
 * Nomes e crachás aqui são FICTÍCIOS: o repositório é público.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

/** Os mesmos UUIDs do script: a BookPlay e o Receptivo. */
const EMPRESA = '9bed94cd-605d-4d43-9afb-352c72b05c50';
const RECEPTIVO = '6dd54018-e78f-4f3b-bca3-4221fe97f38b';
const PLAY4 = '00000000-0000-4000-8000-0000000000b4';
const COLCHAO = '00000000-0000-4000-8000-0000000000b9';
const EU = '00000000-0000-4000-8000-0000000000e1';

const MIGRATION = readFileSync(
  resolve(__dirname, '../../../supabase/migrations/20260918150000_fechamento_premiacoes_comissoes.sql'),
  'utf8',
);
const MODELO = readFileSync(
  resolve(__dirname, '../../../supabase/sql_scripts/crachas_da_planilha_por_nome.sql'),
  'utf8',
);

/**
 * A planilha do teste, com os mesmos tropeços da real: sobrenome depois de um
 * segundo nome, erro de digitação no cadastro, dois com o mesmo primeiro nome,
 * nome cortado e quem não tem cadastro.
 */
const PLANILHA: [string, string][] = [
  ['1001', 'ANA BEATRIZ DA SILVA ROCHA'],
  ['1002', 'BRUNO CAIO MENDES DE QUEIROZ'],
  ['1003', 'CAIO RAMOS TEIXEIRA'],
  ['1004', 'HELENA MARTINS CAMPOS'],
  ['1005', 'HELENA PINTO LIMA'],
  ['1006', 'LARA PEREIRA DA SILVA'],
  ['1007', 'DANIEL COSTA MOURA'],
  ['1008', 'DANIELA REIS PRADO'],
  ['1009', 'JOANA RAYANE BLANCHE DA SILVA'],
  ['1010', 'MARCOS COSTA DAS NEVES'],
  ['1011', 'OTAVIO BRANDAO LUZ'],
  ['1012', 'PAULA VIEIRA NUNES'],
];

/** O modelo com a planilha do teste no lugar da linha de exemplo. */
const SCRIPT = MODELO.replace(
  /\('0000000', 'NOME COMPLETO DA PLANILHA'\)/g,
  PLANILHA.map(([c, n]) => `('${c}', '${n}')`).join(',\n  '),
);
// Cada parte começa no resto da linha do próprio cabeçalho, que volta a ser comentário.
const PARTES = SCRIPT.split(/^-- ── PARTE \d/m).slice(1).map(p => `--${p}`);

/** O cadastro: nome e sobrenome, às vezes com erro, e quem não está na planilha. */
const CADASTRO: [string, string][] = [
  ['01', 'Ana Rocha'], ['02', 'Bruno Queiroz'], ['03', 'Caio Teixeira'], ['04', 'Helena Campos'],
  ['05', 'Helena Lima'], ['06', 'Lara Pereiraa'], ['07', 'Daniel Moura'], ['08', 'Daniela Prado'],
  ['09', 'Joana Santos'], ['10', 'Marcos'], ['11', 'Marcos Gonçalves de Souza'], ['12', 'Paula Nunes'],
  ['13', 'Renata Alves'],
];
const id = (n: string) => `00000000-0000-4000-8000-0000000000${n}`;

let db: PGlite;

async function como(opcoes: { nivel: number; editar?: boolean; setor?: string }) {
  await db.exec(`
    select set_config('request.jwt.claims', '${JSON.stringify({ sub: EU, role: 'authenticated' })}', false);
    select set_config('teste.nivel', '${opcoes.nivel}', false);
    select set_config('teste.editar', '${opcoes.editar ? 'sim' : 'nao'}', false);
    select set_config('teste.setor', '${opcoes.setor ?? ''}', false);
  `);
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid
    $$;

    create table public.setores (id uuid primary key, empresa_id uuid, nome text, ativo boolean default true);
    create table public.perfis (id uuid primary key, nome text, perfil text default 'operador',
      ativo boolean default true, empresa_id uuid, setor_id uuid);

    create table public.rh_celulas (id uuid primary key default gen_random_uuid(), empresa_id uuid not null,
      nome text not null, ordem integer not null default 0, ativo boolean not null default true,
      unique (empresa_id, nome));
    create table public.rh_config_setores (id uuid primary key default gen_random_uuid(), empresa_id uuid not null,
      setor_id uuid not null, celula_id uuid not null references public.rh_celulas(id),
      tipo_remuneracao text not null check (tipo_remuneracao in ('premiacao', 'comissao')),
      ativo boolean not null default true, unique (empresa_id, setor_id));
    create table public.rh_dados_operadores (id uuid primary key default gen_random_uuid(), empresa_id uuid not null,
      operador_id uuid not null, cracha text, atualizado_por uuid, atualizado_por_nome text,
      criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now(),
      unique (empresa_id, operador_id));
    create unique index idx_rh_cracha_unico on public.rh_dados_operadores(empresa_id, cracha)
      where cracha is not null and trim(cracha) <> '';

    -- Escopo e permissão controlados pelo teste.
    create function public.fn_user_escopo(p_aba text) returns integer language sql stable as $$
      select current_setting('teste.nivel')::integer $$;
    create function public.fn_user_tem(p_chave text) returns boolean language sql stable as $$
      select current_setting('teste.editar') = 'sim' $$;
    create function public.fn_can_access_empresa(p uuid) returns boolean language sql stable as $$
      select p = '${EMPRESA}'::uuid $$;
    create function public.fn_fechamento_alcanca(p_empresa_id uuid, p_operador_id uuid, p_ano integer, p_mes integer)
      returns boolean language sql stable as $$
      select public.fn_can_access_empresa(p_empresa_id) and (
        public.fn_user_escopo('fechamento') >= 3
        or (public.fn_user_escopo('fechamento') = 2 and exists (
          select 1 from public.perfis p where p.id = p_operador_id
             and p.setor_id::text = current_setting('teste.setor'))))
    $$;
  `);
  await db.exec(MIGRATION);
});

afterAll(async () => { await db.close(); });

beforeEach(async () => {
  await db.exec(`
    delete from public.rh_dados_operadores; delete from public.rh_config_setores; delete from public.rh_celulas;
    delete from public.perfis; delete from public.setores;
    insert into public.setores values
      ('${RECEPTIVO}', '${EMPRESA}', 'RECEPTIVO'),
      ('${PLAY4}', '${EMPRESA}', 'Play 4'),
      ('${COLCHAO}', '${EMPRESA}', 'Colchão');
    insert into public.perfis (id, nome, empresa_id, setor_id) values
      ${CADASTRO.map(([n, nome]) => `('${id(n)}', '${nome}', '${EMPRESA}', '${RECEPTIVO}')`).join(',\n')},
      ('${id('40')}', 'Bruno Play', '${EMPRESA}', '${PLAY4}'),
      ('${EU}', 'Gerente', '${EMPRESA}', '${RECEPTIVO}');
  `);
});

describe('fn_fechamento_premiacoes_dados', () => {
  beforeEach(async () => {
    await db.exec(`
      insert into public.rh_celulas (id, empresa_id, nome, ordem) values
        ('00000000-0000-4000-8000-0000000000c1', '${EMPRESA}', 'Birigui', 1),
        ('00000000-0000-4000-8000-0000000000c2', '${EMPRESA}', 'Marília', 2);
      insert into public.rh_config_setores (empresa_id, setor_id, celula_id, tipo_remuneracao) values
        ('${EMPRESA}', '${RECEPTIVO}', '00000000-0000-4000-8000-0000000000c1', 'premiacao'),
        ('${EMPRESA}', '${PLAY4}', '00000000-0000-4000-8000-0000000000c2', 'comissao');
      insert into public.rh_dados_operadores (empresa_id, operador_id, cracha) values
        ('${EMPRESA}', '${id('01')}', '1001'),
        ('${EMPRESA}', '${id('40')}', '777');
    `);
  });

  async function dados() {
    const r = await db.query<{ d: { setores: unknown[]; crachas: { operador_id: string; cracha: string }[] } }>(
      `select public.fn_fechamento_premiacoes_dados('${EMPRESA}', 2026, 8) as d`);
    return r.rows[0].d;
  }

  it('recusa quem não enxerga o Fechamento', async () => {
    await como({ nivel: -1 });
    await expect(dados()).rejects.toThrow(/não enxerga o Fechamento/);
  });

  it('nível setor: a cidade de todos os setores, o crachá só do próprio setor', async () => {
    await como({ nivel: 2, setor: RECEPTIVO });
    const d = await dados();
    expect(d.setores).toEqual([
      { setor_id: RECEPTIVO, celula: 'Birigui', tipo_remuneracao: 'premiacao' },
      { setor_id: PLAY4, celula: 'Marília', tipo_remuneracao: 'comissao' },
    ]);
    expect(d.crachas).toEqual([{ operador_id: id('01'), cracha: '1001' }]);
  });

  it('nível empresa: todos os crachás', async () => {
    await como({ nivel: 3 });
    expect((await dados()).crachas).toHaveLength(2);
  });
});

describe('fn_fechamento_salvar_cracha', () => {
  const salvar = (operador: string, cracha: string | null) => db.query(
    `select public.fn_fechamento_salvar_cracha('${EMPRESA}', '${operador}', 2026, 8, $1) as c`, [cracha]);

  it('sem fechamento_editar, recusa', async () => {
    await como({ nivel: 3, editar: false });
    await expect(salvar(id('01'), '1')).rejects.toThrow(/não pode preencher/);
  });

  it('fora do alcance, recusa', async () => {
    await como({ nivel: 2, editar: true, setor: RECEPTIVO });
    await expect(salvar(id('40'), '1')).rejects.toThrow(/fora do seu alcance/);
  });

  it('grava, troca e apaga; o crachá de outra pessoa é recusado com o nome dela', async () => {
    await como({ nivel: 2, editar: true, setor: RECEPTIVO });
    await salvar(id('01'), ' 1001 ');
    await salvar(id('01'), '1002');
    let r = await db.query<{ cracha: string | null; atualizado_por_nome: string }>(
      `select cracha, atualizado_por_nome from public.rh_dados_operadores where operador_id = '${id('01')}'`);
    expect(r.rows).toEqual([{ cracha: '1002', atualizado_por_nome: 'Gerente' }]);

    await expect(salvar(id('02'), '1002')).rejects.toThrow('O crachá 1002 já é de Ana Rocha.');

    await salvar(id('01'), '');
    r = await db.query(`select cracha from public.rh_dados_operadores where operador_id = '${id('01')}'`);
    expect(r.rows).toEqual([{ cracha: null }]);
  });

  it('crachá com espaço ou símbolo é recusado', async () => {
    await como({ nivel: 3, editar: true });
    await expect(salvar(id('01'), '10 01')).rejects.toThrow(/Crachá inválido/);
  });
});

describe('script dos crachás da planilha', () => {
  type Previa = { cracha: string; usuario_no_gestao: string | null; como: string; acao: string };
  const previa = async () => Object.fromEntries(
    (await db.query<Previa>(PARTES[0])).rows.map(l => [l.cracha, l]));

  it('o modelo versionado não traz planilha de verdade', () => {
    expect(MODELO.match(/\('\d+', '[^']+'\)/g)).toEqual([
      "('0000000', 'NOME COMPLETO DA PLANILHA')",
      "('0000000', 'NOME COMPLETO DA PLANILHA')",
    ]);
  });

  it('casa nome completo da planilha com o nome curto do cadastro', async () => {
    const r = await previa();
    expect(r['1001']).toMatchObject({ usuario_no_gestao: 'Ana Rocha', como: 'nome', acao: 'grava' });
    // Sobrenome no fim, depois de um segundo nome.
    expect(r['1002']).toMatchObject({ usuario_no_gestao: 'Bruno Queiroz', como: 'nome' });
    // «Caio» é o 2º nome do Bruno, mas o Caio do cadastro é Teixeira.
    expect(r['1003']).toMatchObject({ usuario_no_gestao: 'Caio Teixeira', como: 'nome' });
    // Duas Helenas se separam pelo sobrenome.
    expect(r['1004'].usuario_no_gestao).toBe('Helena Campos');
    expect(r['1005'].usuario_no_gestao).toBe('Helena Lima');
    // «Pereiraa» (erro de digitação) × «PEREIRA».
    expect(r['1006'].usuario_no_gestao).toBe('Lara Pereiraa');
    // Daniel × Daniela não se confundem.
    expect(r['1007'].usuario_no_gestao).toBe('Daniel Moura');
    expect(r['1008'].usuario_no_gestao).toBe('Daniela Prado');
    // Marcos Gonçalves não é Marcos Costa das Neves.
    expect(r['1010'].usuario_no_gestao).toBe('Marcos');
  });

  it('sem sobrenome que bata, o primeiro nome único casa marcado', async () => {
    expect((await previa())['1009']).toMatchObject({ usuario_no_gestao: 'Joana Santos', como: 'só o primeiro nome' });
  });

  it('quem não está no cadastro não grava', async () => {
    expect((await previa())['1011']).toMatchObject({ usuario_no_gestao: null, como: 'não encontrado', acao: 'não grava' });
  });

  it('primeiro nome repetido sem sobrenome é ambíguo', async () => {
    await db.exec(`insert into public.perfis (id, nome, empresa_id, setor_id)
      values ('${id('50')}', 'Joana Moura', '${EMPRESA}', '${RECEPTIVO}')`);
    expect((await previa())['1009']).toMatchObject({ como: 'ambíguo', acao: 'não grava' });
  });

  it('só o cadastro do setor entra', async () => {
    await db.exec(`update public.perfis set setor_id = '${PLAY4}' where id = '${id('12')}'`);
    expect((await previa())['1012']).toMatchObject({ como: 'não encontrado' });
  });

  it('a gravação não troca crachá existente nem toma o de outra pessoa', async () => {
    await db.exec(`
      insert into public.rh_dados_operadores (empresa_id, operador_id, cracha) values
        ('${EMPRESA}', '${id('02')}', '999'),
        ('${EMPRESA}', '${id('13')}', '1007');
    `);
    const r = await previa();
    expect(r['1002'].acao).toBe('não grava (já tem outro crachá)');
    expect(r['1007'].acao).toBe('não grava (crachá de outra pessoa)');

    const gravados = (await db.query<{ cracha: string }>(PARTES[1])).rows.map(l => l.cracha).sort();
    // 12 da planilha − Otávio (sem cadastro) − Bruno (já tinha) − Daniel (crachá de outra pessoa).
    expect(gravados).toEqual(['1001', '1003', '1004', '1005', '1006', '1008', '1009', '1010', '1012']);

    const ana = await db.query(`select cracha from public.rh_dados_operadores where operador_id = '${id('01')}'`);
    expect(ana.rows).toEqual([{ cracha: '1001' }]);
    // Rodar de novo não grava nada: todo mundo que casou já tem crachá.
    expect((await db.query(PARTES[1])).rows).toHaveLength(0);
  });

  it('liga os setores pelo nome sem acento nem maiúscula, e não mexe no que já existe', async () => {
    const r = (await db.query<{ setor: string; cidade: string; tipo: string }>(PARTES[2])).rows;
    expect(r).toEqual([
      { setor: 'RECEPTIVO', cidade: 'Birigui', tipo: 'premiacao', estado: 'ligado agora' },
      { setor: 'Play 4', cidade: 'Marília', tipo: 'comissao', estado: 'ligado agora' },
    ]);
    expect((await db.query(PARTES[2])).rows).toHaveLength(0);
  });
});

// @vitest-environment node
/**
 * fn_rh_historico_mes — a migration rodada de verdade num Postgres em memória
 * (PGlite), com um esqueleto mínimo das tabelas que ela lê.
 *
 * Não toca o banco de produção. O que se prova aqui: o SQL compila, a porta
 * recusa quem não é RH, e cada tipo de evento sai do log do jeito que o spec
 * (docs/superpowers/specs/2026-11-13-rh-historico-do-mes-design.md) descreve.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const MIGRATION = readFileSync(
  resolve(__dirname, '../../../../supabase/migrations/20261113150000_rh_historico_do_mes.sql'),
  'utf8',
);

const EMP = '00000000-0000-4000-8000-00000000e001';
const OUTRA = '00000000-0000-4000-8000-00000000e002';
const CID_BIR = '00000000-0000-4000-8000-0000000000c1';
const CID_MAR = '00000000-0000-4000-8000-0000000000c2';
const PLAY1 = '00000000-0000-4000-8000-0000000005a1';
const PLAY2 = '00000000-0000-4000-8000-0000000005a2';
const MIX = '00000000-0000-4000-8000-0000000005a3';
const EQ_A = '00000000-0000-4000-8000-00000000eaa1';
const EQ_B = '00000000-0000-4000-8000-00000000eaa2';

const p = (n: number) => `00000000-0000-4000-8000-0000000001${String(n).padStart(2, '0')}`;
const ANA = p(1), BIA = p(2), CAIO = p(3), DUDA = p(4), EDU = p(5), FABI = p(6), GABI = p(7), ROBO = p(8), DIR = p(9), HUGO = p(10);
const IVO = p(11), JOANA = p(12), KAUE = p(13);

/** Cenários achados na conferência com o banco (13/11/2026). */
const DADOS_CONFERENCIA = `
  INSERT INTO perfis (id, nome, perfil, empresa_id, setor_id, situacao) VALUES
    ('${IVO}',   'Ivo',   'operador', '${EMP}', '${PLAY2}', 'ativo'),
    ('${JOANA}', 'Joana', 'operador', '${EMP}', '${MIX}',   'ferias'),
    ('${KAUE}',  'Kauê',  'operador', '${EMP}', '${PLAY1}', 'ativo');
  INSERT INTO logs_sistema (usuario_nome, acao, tabela, registro_id, criado_em, empresa_id, antes, depois, campos) VALUES
    -- Ivo nasce sem setor e ganha o Play 2 no mesmo dia: entrada no Play 2, sem «transferência»
    ('Cleber', 'usuario_criado', 'perfis', '${IVO}', '2026-11-04 08:00-03', '${EMP}', NULL, '{"nome":"Ivo"}', NULL),
    ('Cleber', 'usuario_alterado', 'perfis', '${IVO}', '2026-11-04 08:05-03', '${EMP}',
      '{"setor_id":null}', '{"setor_id":"${PLAY2}"}', ARRAY['setor_id']),
    -- Joana: férias do jeito antigo desde 25/10, ainda de férias
    ('Fulano', 'usuario_alterado', 'perfis', '${JOANA}', '2026-10-25 09:00-03', '${EMP}',
      '{"situacao":"ativo"}', '{"situacao":"ferias"}', ARRAY['situacao']),
    -- Kauê: férias do jeito antigo em setembro, voltou em 30/09 — fora de novembro
    ('Fulano', 'usuario_alterado', 'perfis', '${KAUE}', '2026-09-10 09:00-03', '${EMP}',
      '{"situacao":"ativo"}', '{"situacao":"ferias"}', ARRAY['situacao']),
    ('Fulano', 'usuario_alterado', 'perfis', '${KAUE}', '2026-09-30 09:00-03', '${EMP}',
      '{"situacao":"ferias"}', '{"situacao":"ativo"}', ARRAY['situacao']);
`;

const ESQUELETO = `
  CREATE ROLE anon; CREATE ROLE authenticated;
  CREATE TABLE acesso_teste (rh boolean NOT NULL, empresas uuid[] NOT NULL);
  INSERT INTO acesso_teste VALUES (true, ARRAY['${EMP}'::uuid]);
  CREATE FUNCTION public.fn_user_tem(p_chave text) RETURNS boolean LANGUAGE sql AS
    $$ SELECT rh FROM acesso_teste $$;
  CREATE FUNCTION public.fn_can_access_empresa(p uuid) RETURNS boolean LANGUAGE sql AS
    $$ SELECT p = ANY (empresas) FROM acesso_teste $$;

  CREATE TABLE rh_celulas (id uuid PRIMARY KEY, nome text);
  CREATE TABLE setores (id uuid PRIMARY KEY, nome text, cidade_id uuid);
  CREATE TABLE equipes (id uuid PRIMARY KEY, nome text);
  CREATE TABLE cargos (slug text PRIMARY KEY, nivel int);
  CREATE TABLE perfis (
    id uuid PRIMARY KEY, nome text, perfil text, empresa_id uuid, setor_id uuid,
    equipe_id uuid, situacao text DEFAULT 'ativo', desligado_em timestamptz,
    ferias_desde date, ferias_ate date, robo boolean NOT NULL DEFAULT false
  );
  CREATE TABLE ausencias_tipos (tipo text PRIMARY KEY, rotulo text);
  CREATE TABLE ausencias (
    id serial, empresa_id uuid, operador_id uuid, tipo text, inicio date, fim date, criado_por uuid
  );
  CREATE TABLE logs_sistema (
    id serial, usuario_nome text, acao text, tabela text, registro_id text,
    criado_em timestamptz, empresa_id uuid, alvo_rotulo text,
    antes jsonb, depois jsonb, campos text[]
  );
`;

const DADOS = `
  INSERT INTO rh_celulas VALUES ('${CID_BIR}', 'Birigui'), ('${CID_MAR}', 'Marília');
  INSERT INTO setores VALUES ('${PLAY1}', 'Play 1', '${CID_BIR}'), ('${PLAY2}', 'Play 2', '${CID_BIR}'),
                             ('${MIX}', 'Play Mix Marília', '${CID_MAR}');
  INSERT INTO equipes VALUES ('${EQ_A}', 'Equipe A'), ('${EQ_B}', 'Equipe B');
  INSERT INTO cargos VALUES ('operador', 1), ('lider', 2), ('supervisor', 3), ('rh', NULL);
  INSERT INTO ausencias_tipos VALUES ('ferias', 'Férias'), ('inss', 'INSS');

  INSERT INTO perfis (id, nome, perfil, empresa_id, setor_id, equipe_id, situacao, desligado_em, ferias_desde, ferias_ate, robo) VALUES
    ('${ANA}',  'Ana',  'operador',  '${EMP}', '${MIX}',   '${EQ_A}', 'ativo', NULL, NULL, NULL, false),
    ('${BIA}',  'Bia',  'lider',     '${EMP}', '${PLAY2}', NULL,      'ativo', NULL, NULL, NULL, false),
    ('${CAIO}', 'Caio', 'operador',  '${EMP}', '${PLAY1}', NULL,      'desligado', '2026-11-12 13:00-03', NULL, NULL, false),
    ('${DUDA}', 'Duda', 'operador',  '${EMP}', '${PLAY1}', '${EQ_B}', 'ativo', NULL, NULL, NULL, false),
    ('${EDU}',  'Edu',  'operador',  '${EMP}', '${PLAY2}', NULL,      'ativo', NULL, NULL, NULL, false),
    ('${FABI}', 'Fabi', 'operador',  '${EMP}', '${PLAY1}', NULL,      'afastado', NULL, NULL, NULL, false),
    ('${GABI}', 'Gabi', 'operador',  '${EMP}', '${MIX}',   NULL,      'ferias', NULL, '2026-11-17', '2026-12-01', false),
    ('${ROBO}', 'Robô', 'operador',  '${EMP}', '${PLAY1}', NULL,      'ativo', NULL, NULL, NULL, true),
    ('${DIR}',  'Dir',  'diretoria', '${EMP}', '${PLAY2}', NULL,      'ativo', NULL, NULL, NULL, false),
    ('${HUGO}', 'Hugo', 'operador',  '${OUTRA}', '${PLAY1}', NULL,    'ativo', NULL, NULL, NULL, false);

  INSERT INTO logs_sistema (usuario_nome, acao, tabela, registro_id, criado_em, empresa_id, antes, depois, campos) VALUES
    -- Ana: Play 1 (Birigui) → Play Mix (Marília), 05/11
    ('Cleber', 'usuario_alterado', 'perfis', '${ANA}', '2026-11-05 10:00-03', '${EMP}',
      '{"setor_id":"${PLAY1}"}', '{"setor_id":"${MIX}"}', ARRAY['setor_id']),
    -- Bia: operador → lider em 10/11, ainda no Play 1; transferida ao Play 2 em 20/11
    ('Cleber', 'usuario_alterado', 'perfis', '${BIA}', '2026-11-10 09:00-03', '${EMP}',
      '{"perfil":"operador"}', '{"perfil":"lider"}', ARRAY['perfil']),
    ('Cleber', 'usuario_alterado', 'perfis', '${BIA}', '2026-11-20 09:00-03', '${EMP}',
      '{"setor_id":"${PLAY1}"}', '{"setor_id":"${PLAY2}"}', ARRAY['setor_id']),
    -- Caio: desligado em 12/11 e, na virada, sai da equipe (não é troca)
    ('Fulano', 'usuario_alterado', 'perfis', '${CAIO}', '2026-11-12 14:00-03', '${EMP}',
      '{"situacao":"ativo","desligado_em":null}', '{"situacao":"desligado","desligado_em":"2026-11-12T16:00:00+00:00"}',
      ARRAY['desligado_em','situacao']),
    (NULL, 'usuario_alterado', 'perfis', '${CAIO}', '2026-11-13 00:10-03', '${EMP}',
      '{"equipe_id":"${EQ_A}"}', '{"equipe_id":null}', ARRAY['equipe_id']),
    -- Duda: Equipe A → Equipe B no Play 1
    ('Fulano', 'usuario_alterado', 'perfis', '${DUDA}', '2026-11-07 11:00-03', '${EMP}',
      '{"equipe_id":"${EQ_A}"}', '{"equipe_id":"${EQ_B}"}', ARRAY['equipe_id']),
    -- Edu: entrou em 03/11
    ('Cleber', 'usuario_criado', 'perfis', '${EDU}', '2026-11-03 08:00-03', '${EMP}',
      NULL, '{"nome":"Edu","setor_id":"${PLAY2}","perfil":"operador"}', NULL),
    -- Fora: robô, diretoria, outubro, outra empresa, campo que não interessa
    ('Cleber', 'usuario_alterado', 'perfis', '${ROBO}', '2026-11-05 10:00-03', '${EMP}',
      '{"setor_id":"${PLAY2}"}', '{"setor_id":"${PLAY1}"}', ARRAY['setor_id']),
    ('Cleber', 'usuario_alterado', 'perfis', '${DIR}', '2026-11-05 10:00-03', '${EMP}',
      '{"setor_id":"${PLAY1}"}', '{"setor_id":"${PLAY2}"}', ARRAY['setor_id']),
    ('Cleber', 'usuario_alterado', 'perfis', '${ANA}', '2026-10-31 23:30-03', '${EMP}',
      '{"setor_id":"${PLAY2}"}', '{"setor_id":"${PLAY1}"}', ARRAY['setor_id']),
    ('Cleber', 'usuario_alterado', 'perfis', '${HUGO}', '2026-11-05 10:00-03', '${OUTRA}',
      '{"setor_id":"${PLAY2}"}', '{"setor_id":"${PLAY1}"}', ARRAY['setor_id']),
    ('Cleber', 'usuario_alterado', 'perfis', '${ANA}', '2026-11-06 10:00-03', '${EMP}',
      '{"foto_url":null}', '{"foto_url":"x"}', ARRAY['foto_url']);

  INSERT INTO ausencias (empresa_id, operador_id, tipo, inicio, fim, criado_por) VALUES
    ('${EMP}', '${FABI}', 'inss', '2026-10-20', '9999-12-31', '${BIA}'),
    ('${EMP}', '${DUDA}', 'ferias', '2026-12-01', '2026-12-20', '${BIA}');
`;

let db: PGlite;

interface Evento {
  tipo: string; dia: string; pessoa_nome: string; cargo: string;
  setor_de_nome: string | null; cidade_de: string | null;
  setor_para_nome: string | null; cidade_para: string | null;
  valor_de: string | null; valor_para: string | null; sentido: string | null;
  ausencia_rotulo: string | null; inicio: string | null; fim: string | null; feito_por: string;
}

async function historico(mes = '2026-11-01', empresas = [EMP]): Promise<Evento[]> {
  const r = await db.query<Evento>(
    `SELECT tipo, dia::text, pessoa_nome, cargo, setor_de_nome, cidade_de, setor_para_nome, cidade_para,
            valor_de, valor_para, sentido, ausencia_rotulo, inicio::text, fim::text, feito_por
       FROM public.fn_rh_historico_mes($1::uuid[], $2::date)`,
    [empresas, mes],
  );
  return r.rows;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(ESQUELETO);
  await db.exec(MIGRATION);
  await db.exec(DADOS);
  await db.exec(DADOS_CONFERENCIA);
});

afterAll(async () => { await db.close(); });

describe('fn_rh_historico_mes', () => {
  it('transferência entre cidades traz origem e destino com as duas cidades', async () => {
    const ev = (await historico()).find(e => e.tipo === 'transferencia' && e.pessoa_nome === 'Ana');
    expect(ev).toMatchObject({
      dia: '2026-11-05', setor_de_nome: 'Play 1', cidade_de: 'Birigui',
      setor_para_nome: 'Play Mix Marília', cidade_para: 'Marília', feito_por: 'Cleber',
    });
  });

  it('mudança de cargo é promoção pelo nível e fica no setor DO DIA, não no de hoje', async () => {
    const ev = (await historico()).find(e => e.tipo === 'cargo' && e.pessoa_nome === 'Bia');
    expect(ev).toMatchObject({
      valor_de: 'operador', valor_para: 'lider', sentido: 'promocao',
      setor_para_nome: 'Play 1', cidade_para: 'Birigui', cargo: 'lider',
    });
  });

  it('desligamento usa o dia do cadastro e a saída da equipe na virada não vira troca', async () => {
    const evs = (await historico()).filter(e => e.pessoa_nome === 'Caio');
    expect(evs.map(e => e.tipo)).toEqual(['desligamento']);
    expect(evs[0]).toMatchObject({ dia: '2026-11-12', valor_para: 'desligado', setor_para_nome: 'Play 1' });
  });

  it('troca de equipe traz os nomes das equipes', async () => {
    const ev = (await historico()).find(e => e.tipo === 'troca_equipe');
    expect(ev).toMatchObject({ pessoa_nome: 'Duda', valor_de: 'Equipe A', valor_para: 'Equipe B', setor_para_nome: 'Play 1' });
  });

  it('entrada no mês com o setor em que a pessoa nasceu', async () => {
    const ev = (await historico()).find(e => e.tipo === 'entrada');
    expect(ev).toMatchObject({ pessoa_nome: 'Edu', dia: '2026-11-03', setor_para_nome: 'Play 2', setor_de_nome: null });
  });

  it('afastamento sem data de volta, vindo do mês anterior, aparece com o período inteiro', async () => {
    const ev = (await historico()).find(e => e.tipo === 'afastamento');
    expect(ev).toMatchObject({
      pessoa_nome: 'Fabi', dia: '2026-11-01', ausencia_rotulo: 'INSS',
      inicio: '2026-10-20', fim: '9999-12-31', feito_por: 'Bia',
    });
  });

  it('férias só do cadastro entram; férias de dezembro não', async () => {
    const ferias = (await historico()).filter(e => e.tipo === 'ferias' && e.pessoa_nome === 'Gabi');
    expect(ferias).toHaveLength(1);
    expect(ferias[0]).toMatchObject({ inicio: '2026-11-17', fim: '2026-12-01', cidade_para: 'Marília' });
    expect((await historico()).some(e => e.tipo === 'ferias' && e.pessoa_nome === 'Duda')).toBe(false);
  });

  it('férias do jeito antigo (só situação) saem do log, com o período em aberto', async () => {
    const ferias = (await historico()).filter(e => e.tipo === 'ferias').map(e => e.pessoa_nome);
    expect(ferias).toEqual(['Joana', 'Gabi']);
    const joana = (await historico()).find(e => e.pessoa_nome === 'Joana');
    expect(joana).toMatchObject({ dia: '2026-11-01', inicio: '2026-10-25', fim: '9999-12-31', feito_por: 'Fulano' });
  });

  it('cadastro sem setor que ganha um depois: entrada nesse setor, e não transferência', async () => {
    const ivo = (await historico()).filter(e => e.pessoa_nome === 'Ivo');
    expect(ivo.map(e => e.tipo)).toEqual(['entrada']);
    expect(ivo[0]).toMatchObject({ setor_para_nome: 'Play 2', cidade_para: 'Birigui' });
  });

  it('deixa de fora robô, diretoria, outro mês, outra empresa e campo sem interesse', async () => {
    const evs = await historico();
    const nomes = evs.map(e => e.pessoa_nome);
    expect(nomes).not.toContain('Robô');
    expect(nomes).not.toContain('Dir');
    expect(nomes).not.toContain('Hugo');
    expect(evs.filter(e => e.pessoa_nome === 'Ana')).toHaveLength(1);
    expect(evs).toHaveLength(10);
  });

  it('empresa que a pessoa não alcança é ignorada', async () => {
    expect(await historico('2026-11-01', [OUTRA])).toEqual([]);
  });

  it('mês antes de agosto/2026 volta vazio', async () => {
    expect(await historico('2026-07-01')).toEqual([]);
  });

  it('sem RH com alcance todos os setores, recusa com 42501', async () => {
    await db.exec('UPDATE acesso_teste SET rh = false');
    await expect(historico()).rejects.toMatchObject({ code: '42501' });
    await db.exec('UPDATE acesso_teste SET rh = true');
  });
});

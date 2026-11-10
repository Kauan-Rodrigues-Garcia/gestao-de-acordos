// @vitest-environment node
/**
 * banco.sql.test.ts — a migration da Votação da Liderança (20261104230000)
 * rodando num Postgres de verdade (PGlite, LOCAL — não é o banco de produção).
 *
 * O que importa provar (pedido de 04/11/2026): tudo fica registrado (votos,
 * horários, desempates, diário), dá para repetir uma votação, ninguém vota em
 * si mesmo nem duas vezes, empate só sai com a diretoria, e em quem cada um
 * votou só o super_admin vê.
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
const FORA  = '00000000-0000-4000-8000-0000000000f1';
const SETOR = '00000000-0000-4000-8000-0000000000e1';

const ler = (n: string) => readFileSync(resolve(__dirname, `../../../supabase/migrations/${n}`), 'utf8');
const SQL = ler('20261104230000_votacao_lideranca.sql');
/** 10/11/2026: a diretoria decide também o líder em 1º em mais de uma categoria. */
const SQL_REPETIDOS = ler('20261110150000_votacao_decisao_repetidos.sql');
const PERGUNTAS = Array.from({ length: 15 }, (_, i) => ({ id: `q${i + 1}`, emoji: '⭐', texto: `Pergunta ${i + 1}?` }));

let db: PGlite;

async function como<T>(uid: string, sql: string, params: unknown[] = []): Promise<T> {
  await db.query("select set_config('teste.uid', $1, false)", [uid]);
  await db.query("select set_config('teste.super', $1, false)", [uid === ADMIN ? 'sim' : '']);
  const r = await db.query<{ v: T }>(sql, params);
  return r.rows[0]?.v as T;
}
const salvar = (uid = ADMIN, perguntas: unknown[] = PERGUNTAS, participantes = [L1, L2, L3, L4], id: string | null = null) =>
  como<string>(uid, 'select public.fn_votacao_lideranca_salvar($1, $2, $3, $4, $5, $6::jsonb, $7) v',
    [id, 'Votação de novembro', 'cobranca', [SETOR], ['lider'], JSON.stringify(perguntas), participantes]);
const mudar = (id: string, acao: string, uid = ADMIN) => como(uid, 'select public.fn_votacao_lideranca_mudar($1, $2) v', [id, acao]);
const votar = (uid: string, id: string, votos: Record<string, string>, comecou: string | null = null) =>
  como(uid, 'select public.fn_votacao_lideranca_votar($1, $2::jsonb, $3) v', [id, JSON.stringify(votos), comecou]);
type Retrato = {
  votacao: { estado: string; copiada_de: string | null; aberta_em: string | null; liberada_em: string | null };
  perguntas: { id: string }[];
  participantes: { id: string; nome: string; setor: string | null }[];
  contagem: { pergunta_id: string; candidato_id: string; votos: number }[] | null;
  desempates: { pergunta_id: string; escolhido_id: string; decidido_por: string }[] | null;
  envios: { eleitor_id: string; enviado_em: string; comecou_em: string | null; respondidas: number }[] | null;
  votos?: { eleitor: string; candidato: string; pergunta_id: string; votado_em: string }[];
  eventos?: { evento: string; por: string; detalhe: Record<string, unknown> | null }[];
};
const apuracao = (id: string, uid = DIR) => como<Retrato>(uid, 'select public.fn_votacao_lideranca_apuracao($1) v', [id]);

/**
 * Abre uma votação com os 4 líderes e todos votam. Com 4 participantes cada um
 * preenche 3 categorias (os 3 colegas, um em cada): q1 empata L1 × L2, q2 é do
 * L3, q3 é do L4.
 */
async function votacaoVotada(): Promise<string> {
  const id = await salvar();
  await mudar(id, 'abrir');
  await votar(L1, id, { q1: L2, q2: L3, q3: L4 });
  await votar(L2, id, { q1: L1, q2: L3, q3: L4 });
  await votar(L3, id, { q1: L2, q2: L1, q3: L4 });
  await votar(L4, id, { q1: L1, q2: L3, q3: L2 });
  return id;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('teste.uid', true), '')::uuid $$;
    create table public.setores (id uuid primary key, nome text);
    insert into public.setores values ('${SETOR}', 'Play 1');
    create table public.perfis (id uuid primary key, nome text, foto_url text, setor_id uuid, perfil text, ativo boolean);
    insert into public.perfis values
      ('${ADMIN}', 'Kauan', null, null, 'super_admin', true),
      ('${DIR}', 'Cleber', null, null, 'diretoria', true),
      ('${L1}', 'Ana', null, '${SETOR}', 'lider', true), ('${L2}', 'Bruno', null, '${SETOR}', 'lider', true),
      ('${L3}', 'Carla', null, '${SETOR}', 'lider', true), ('${L4}', 'Diego', null, '${SETOR}', 'lider', true),
      ('${FORA}', 'Fora', null, '${SETOR}', 'lider', true);
    create function public.fn_user_is_super_admin() returns boolean language sql stable
      as $$ select current_setting('teste.super', true) = 'sim' $$;
  `);
  await db.exec(SQL);
  await db.exec(SQL_REPETIDOS);
  await db.exec(SQL_REPETIDOS); // reexecutável
});

beforeEach(async () => {
  await db.exec('delete from public.votacao_lideranca;');
});

afterAll(async () => { await db.close(); });

describe('organizar', () => {
  it('só o super_admin cria; mínimo 15 perguntas e 3 participantes', async () => {
    await expect(salvar(DIR)).rejects.toThrow(/NAO_AUTORIZADO/);
    await expect(salvar(ADMIN, PERGUNTAS.slice(0, 14))).rejects.toThrow(/mínimo é 15/);
    await expect(salvar(ADMIN, PERGUNTAS, [L1, L2])).rejects.toThrow(/pelo menos 3/);
    await expect(salvar(ADMIN, [...PERGUNTAS, PERGUNTAS[0]])).rejects.toThrow(/repetidas/);
    expect(await salvar()).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('edita só o rascunho; uma aberta por operação', async () => {
    const a = await salvar();
    await salvar(ADMIN, PERGUNTAS, [L1, L2, L3], a);
    await mudar(a, 'abrir');
    await expect(salvar(ADMIN, PERGUNTAS, [L1, L2, L3], a)).rejects.toThrow(/rascunho/);
    const b = await salvar();
    await expect(mudar(b, 'abrir')).rejects.toThrow(/Já existe uma votação aberta/);
    await expect(mudar(a, 'voar')).rejects.toThrow(/Ação desconhecida/);
  });

  it('repetir copia a configuração num rascunho novo', async () => {
    const id = await votacaoVotada();
    const nova = await como<string>(ADMIN, 'select public.fn_votacao_lideranca_repetir($1) v', [id]);
    const r = await apuracao(nova, ADMIN);
    expect(r.votacao.estado).toBe('rascunho');
    expect(r.votacao.copiada_de).toBe(id);
    expect(r.participantes.map(p => p.nome).sort()).toEqual(['Ana', 'Bruno', 'Carla', 'Diego']);
    expect(r.perguntas).toHaveLength(15);
  });
});

describe('votar', () => {
  it('a votação aberta aparece só para quem participa', async () => {
    const id = await salvar();
    expect(await como<unknown[]>(L1, 'select public.fn_votacao_lideranca_minha() v')).toEqual([]); // rascunho
    await mudar(id, 'abrir');
    const minha = await como<Array<Retrato & { enviado_em: string | null }>>(L1, 'select public.fn_votacao_lideranca_minha() v');
    expect(minha).toHaveLength(1);
    expect(minha[0].enviado_em).toBeNull();
    expect(minha[0].participantes.find(p => p.id === L1)?.setor).toBe('Play 1');
    expect(minha[0].contagem).toBeNull(); // o líder não vê contagem
    expect(await como<unknown[]>(FORA, 'select public.fn_votacao_lideranca_minha() v')).toEqual([]);
  });

  it('não vota em si, nem fora da lista, nem pergunta inventada, nem duas vezes', async () => {
    const id = await salvar();
    await mudar(id, 'abrir');
    await expect(votar(L1, id, { q1: L1 })).rejects.toThrow(/si mesmo/);
    await expect(votar(L1, id, { q1: FORA })).rejects.toThrow(/não participa/);
    await expect(votar(L1, id, { q1: 'abc' })).rejects.toThrow(/não participa/);
    await expect(votar(L1, id, { q99: L2 })).rejects.toThrow(/Pergunta desconhecida/);
    await expect(votar(FORA, id, { q1: L2 })).rejects.toThrow(/NAO_AUTORIZADO/);
    await expect(votar(L1, id, {})).rejects.toThrow(/faltam 3/);
    await votar(L1, id, { q1: L2, q2: L3, q3: L4 });
    await expect(votar(L1, id, { q4: L2 })).rejects.toThrow(/já enviou/);
  });

  it('só envia com tudo preenchido (o máximo possível: 3 colegas, 3 categorias)', async () => {
    const id = await salvar();
    await mudar(id, 'abrir');
    await expect(votar(L1, id, { q1: L2, q2: L3 })).rejects.toThrow(/Preencha todas as categorias antes de enviar: faltam 1/);
    const r = await como<Retrato>(ADMIN, 'select public.fn_votacao_lideranca_registro($1) v', [id]);
    expect(r.votos).toEqual([]); // recusou inteiro, nada pela metade
    expect(r.envios).toEqual([]);
    await votar(L1, id, { q1: L2, q2: L3, q3: L4 });
  });

  it('cada colega uma vez só: a Bianca em «comunicativo» não vale em «organizado»', async () => {
    const id = await salvar();
    await mudar(id, 'abrir');
    await expect(votar(L1, id, { q1: L2, q2: L2, q3: L4 })).rejects.toThrow(/uma pergunta/);
    // Recusou inteiro: nada ficou gravado pela metade, e dá para votar de novo certo.
    await votar(L1, id, { q1: L2, q2: L3, q3: L4 });
    const r = await como<Retrato>(ADMIN, 'select public.fn_votacao_lideranca_registro($1) v', [id]);
    expect(r.votos!.map(v => v.candidato).sort()).toEqual(['Bruno', 'Carla', 'Diego']);
    // A trava também está na tabela (se alguém gravar por fora da função).
    await expect(db.query(`insert into public.votacao_lideranca_votos (votacao_id, pergunta_id, eleitor_id, candidato_id)
      values ($1, 'q4', $2, $3)`, [id, L1, L2])).rejects.toThrow(/vl_um_por_colega/);
  });

  it('grava os horários: quando começou e quando enviou', async () => {
    const id = await salvar();
    await mudar(id, 'abrir');
    const antes = new Date(Date.now() - 60_000).toISOString(); // antes da abertura: não vale
    await votar(L1, id, { q1: L2, q2: L3, q3: L4 }, antes);
    const agora = new Date().toISOString();
    await votar(L2, id, { q1: L1, q2: L3, q3: L4 }, agora);
    const r = await apuracao(id);
    const de = (uid: string) => r.envios!.find(e => e.eleitor_id === uid)!;
    expect(de(L1)).toMatchObject({ respondidas: 3, comecou_em: null });
    expect(de(L2).respondidas).toBe(3);
    expect(de(L2).comecou_em).not.toBeNull();
    expect(new Date(de(L2).enviado_em).getTime()).toBeGreaterThan(0);
  });
});

describe('diretoria', () => {
  it('durante a votação vê os horários, mas não a contagem', async () => {
    const id = await salvar();
    await mudar(id, 'abrir');
    await votar(L1, id, { q1: L2, q2: L3, q3: L4 });
    const r = await apuracao(id);
    expect(r.envios).toHaveLength(1);
    expect(r.contagem).toBeNull();
    await expect(apuracao(id, L1)).rejects.toThrow(/NAO_AUTORIZADO/);
  });

  it('encerra, vê a contagem, decide o empate e só então libera', async () => {
    const id = await votacaoVotada();
    await expect(mudar(id, 'encerrar', L1)).rejects.toThrow(/NAO_AUTORIZADO/);
    await mudar(id, 'encerrar', DIR);
    await expect(votar(FORA, id, { q1: L2 })).rejects.toThrow(/não está aberta/);

    const r = await apuracao(id);
    const q1 = r.contagem!.filter(c => c.pergunta_id === 'q1').sort((a, b) => a.candidato_id.localeCompare(b.candidato_id));
    expect(q1).toEqual([{ pergunta_id: 'q1', candidato_id: L1, votos: 2 }, { pergunta_id: 'q1', candidato_id: L2, votos: 2 }]);
    expect(JSON.stringify(r)).not.toContain('eleitor":"'); // nada de quem votou em quem

    await expect(como(DIR, 'select public.fn_votacao_lideranca_liberar($1) v', [id])).rejects.toThrow(/Falta decidir 1/);
    await expect(como(DIR, 'select public.fn_votacao_lideranca_desempatar($1, $2, $3) v', [id, 'q1', L3])).rejects.toThrow(/não tem voto/);
    // q2 é só do L3, e o L3 não leva outra: não precisa de decisão.
    await expect(como(DIR, 'select public.fn_votacao_lideranca_desempatar($1, $2, $3) v', [id, 'q2', L3])).rejects.toThrow(/não precisa de decisão/);
    await expect(como(L1, 'select public.fn_votacao_lideranca_desempatar($1, $2, $3) v', [id, 'q1', L1])).rejects.toThrow(/NAO_AUTORIZADO/);
    await como(DIR, 'select public.fn_votacao_lideranca_desempatar($1, $2, $3) v', [id, 'q1', L2]);
    await como(DIR, 'select public.fn_votacao_lideranca_liberar($1) v', [id]);

    const final = await apuracao(id);
    expect(final.votacao.estado).toBe('liberada');
    expect(final.desempates).toEqual([expect.objectContaining({ pergunta_id: 'q1', escolhido_id: L2, decidido_por: 'Cleber' })]);
    await expect(como(DIR, 'select public.fn_votacao_lideranca_desempatar($1, $2, $3) v', [id, 'q1', L1])).rejects.toThrow(/antes de liberar/);
  });
});

describe('resultado e registro', () => {
  it('o resultado só sai depois de liberado, e só para quem participa ou a diretoria', async () => {
    const id = await votacaoVotada();
    await mudar(id, 'encerrar', DIR);
    await expect(como(L1, 'select public.fn_votacao_lideranca_resultado($1) v', [id])).rejects.toThrow(/não liberado/);
    await como(DIR, 'select public.fn_votacao_lideranca_desempatar($1, $2, $3) v', [id, 'q1', L1]);
    await como(DIR, 'select public.fn_votacao_lideranca_liberar($1) v', [id]);
    const r = await como<Retrato>(L3, 'select public.fn_votacao_lideranca_resultado($1) v', [id]);
    expect(r.contagem!.length).toBeGreaterThan(0);
    expect(r.envios).toBeNull(); // horários: só a diretoria
    await expect(como(FORA, 'select public.fn_votacao_lideranca_resultado($1) v', [id])).rejects.toThrow(/não liberado/);

    // O card «Saiu o resultado»: só para quem participou.
    const meus = await como<Array<{ id: string; titulo: string }>>(L3, 'select public.fn_votacao_lideranca_meus_resultados() v');
    expect(meus).toEqual([expect.objectContaining({ id, titulo: 'Votação de novembro' })]);
    expect(await como<unknown[]>(FORA, 'select public.fn_votacao_lideranca_meus_resultados() v')).toEqual([]);
  });

  it('em quem cada um votou: só o super_admin; o diário guarda tudo menos o voto', async () => {
    const id = await votacaoVotada();
    await expect(como(DIR, 'select public.fn_votacao_lideranca_registro($1) v', [id])).rejects.toThrow(/NAO_AUTORIZADO/);
    const r = await como<Retrato>(ADMIN, 'select public.fn_votacao_lideranca_registro($1) v', [id]);
    expect(r.votos).toHaveLength(12);
    expect(r.votos!.find(v => v.eleitor === 'Ana' && v.pergunta_id === 'q1')?.candidato).toBe('Bruno');
    expect(r.eventos!.map(e => e.evento)).toEqual(['criada', 'aberta', 'votou', 'votou', 'votou', 'votou']);
    const votou = r.eventos!.find(e => e.evento === 'votou')!;
    expect(votou.detalhe).toEqual({ respondidas: 3 });
    expect(votou.por).toBe('Ana');
  });

  it('listar mostra cada votação com quantos votaram', async () => {
    const id = await votacaoVotada();
    const lista = await como<Array<{ id: string; estado: string; participantes: number; votaram: number }>>(DIR, 'select public.fn_votacao_lideranca_listar() v');
    expect(lista).toEqual([expect.objectContaining({ id, estado: 'aberta', participantes: 4, votaram: 4 })]);
    await expect(como(L1, 'select public.fn_votacao_lideranca_listar() v')).rejects.toThrow(/NAO_AUTORIZADO/);
  });
});

describe('permissões no banco', () => {
  it('ninguém lê as tabelas direto; os ajudantes não são chamáveis', async () => {
    const r = await db.query<{ t: boolean; v: boolean; f: boolean; g: boolean }>(`
      select has_table_privilege('authenticated', 'public.votacao_lideranca', 'select') t,
             has_table_privilege('authenticated', 'public.votacao_lideranca_votos', 'select') v,
             has_function_privilege('authenticated', 'public.fn_vl_montar(uuid, boolean, boolean)', 'execute') f,
             has_function_privilege('authenticated', 'public.fn_votacao_lideranca_votar(uuid, jsonb, timestamptz)', 'execute') g`);
    expect(r.rows[0]).toEqual({ t: false, v: false, f: false, g: true });
  });
});

describe('o mesmo líder em 1º em mais de uma categoria (20261110150000)', () => {
  const decidir = (id: string, q: string, quem: string) =>
    como(DIR, 'select public.fn_votacao_lideranca_desempatar($1, $2, $3) v', [id, q, quem]);
  const liberar = (id: string) => como(DIR, 'select public.fn_votacao_lideranca_liberar($1) v', [id]);
  const pendentes = (id: string) => db.query<{ pergunta_id: string; empate: boolean; repetido: boolean }>(
    'select pergunta_id, empate, repetido from public.fn_vl_pendentes($1) order by 1', [id]).then(r => r.rows);

  /**
   * A Carla (L3) em 1º em q1 (2 votos contra 1 da Ana) e em q2 (sozinha); o
   * Diego (L4) em 1º em q3, e a Ana (L1) tem 1 voto em q3 também.
   */
  async function carlaEmDuas(): Promise<string> {
    const id = await salvar();
    await mudar(id, 'abrir');
    await db.exec(`
      insert into public.votacao_lideranca_votos (votacao_id, pergunta_id, eleitor_id, candidato_id) values
        ('${id}', 'q1', '${L1}', '${L3}'), ('${id}', 'q1', '${L4}', '${L3}'), ('${id}', 'q1', '${L2}', '${L1}'),
        ('${id}', 'q2', '${L2}', '${L3}'),
        ('${id}', 'q3', '${L1}', '${L4}'), ('${id}', 'q3', '${L3}', '${L4}'), ('${id}', 'q3', '${L4}', '${L1}');`);
    await mudar(id, 'encerrar', DIR);
    return id;
  }

  it('as duas categorias da Carla ficam pendentes e o resultado não sai', async () => {
    const id = await carlaEmDuas();
    expect(await pendentes(id)).toEqual([
      { pergunta_id: 'q1', empate: false, repetido: true },
      { pergunta_id: 'q2', empate: false, repetido: true },
    ]);
    await expect(liberar(id)).rejects.toThrow(/Falta decidir 2 categoria/);
  });

  it('passar q1 para a Ana resolve as duas: a Carla fica só com q2', async () => {
    const id = await carlaEmDuas();
    await decidir(id, 'q1', L1);
    expect(await pendentes(id)).toEqual([]);
    await liberar(id);
    const r = await apuracao(id);
    expect(r.desempates).toEqual([expect.objectContaining({ pergunta_id: 'q1', escolhido_id: L1 })]);
    const motivo = await db.query<{ motivo: string }>('select motivo from public.votacao_lideranca_desempates where votacao_id = $1', [id]);
    expect(motivo.rows[0].motivo).toBe('repetido');
  });

  it('a diretoria pode manter a Carla nas duas, mas decide cada uma', async () => {
    const id = await carlaEmDuas();
    await decidir(id, 'q1', L3);
    expect((await pendentes(id)).map(p => p.pergunta_id)).toEqual(['q2']);
    await expect(liberar(id)).rejects.toThrow(/Falta decidir 1 categoria/);
    await decidir(id, 'q2', L3);
    await liberar(id);
  });

  it('só quem tem voto na categoria pode levar', async () => {
    const id = await carlaEmDuas();
    await expect(decidir(id, 'q2', L1)).rejects.toThrow(/não tem voto/);
  });

  it('passar uma categoria para quem já leva outra deixa a outra pendente', async () => {
    const id = await carlaEmDuas();
    await decidir(id, 'q2', L3);   // q2 fica com a Carla…
    await decidir(id, 'q1', L1);   // …e q1 vai para a Ana: tudo resolvido
    expect(await pendentes(id)).toEqual([]);
    // Agora a Ana leva q1; se a diretoria der q3 a ela também, q3 não está pendente: recusa.
    await expect(decidir(id, 'q3', L1)).rejects.toThrow(/não precisa de decisão/);
    // Trocar q1 para a Carla de novo: q1 já tem decisão (pode trocar) e nada fica pendente — foi escolha dela.
    await decidir(id, 'q1', L3);
    expect(await pendentes(id)).toEqual([]);
  });
});

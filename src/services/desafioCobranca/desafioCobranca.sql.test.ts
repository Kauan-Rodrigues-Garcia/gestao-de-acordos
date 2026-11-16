// @vitest-environment node
//
// A migration do Desafio Cobrança (20261116150000) num Postgres em memória:
// semente, leitura do lote do 59, quem soma, ajuste, liberação e TV.
import { PGlite } from '@electric-sql/pglite';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const EMP = '00000000-0000-4000-8000-000000000001';
const BIRIGUI = '00000000-0000-4000-8000-0000000000c1';
const MARILIA = '00000000-0000-4000-8000-0000000000c2';
const PLAY1 = '00000000-0000-4000-8000-0000000000a1';
const JORNADA = '00000000-0000-4000-8000-0000000000a2';
const PLAY5 = '00000000-0000-4000-8000-0000000000a3';
const COFEN = '00000000-0000-4000-8000-0000000000a4';
const SUPER = '00000000-0000-4000-8000-0000000000f1';
const OPERADOR = '00000000-0000-4000-8000-0000000000f2';
const MARIANA = '00000000-0000-4000-8000-0000000000f3';
const LOTE = '00000000-0000-4000-8000-0000000000e1';
const PAINEL = '00000000-0000-4000-8000-0000000000d1';
const TOKEN = 'ab'.repeat(32);

let db: PGlite;

async function como(uid: string | null) {
  await db.query(`select set_config('test.uid', $1, false)`, [uid ?? '']);
}
async function json<T = Record<string, unknown>>(sql: string, args: unknown[] = []): Promise<T> {
  const r = await db.query<{ r: T }>(sql, args);
  return r.rows[0].r;
}
const num = (v: unknown) => Number(v);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create table public.empresas (id uuid primary key);
    create table public.perfis (id uuid primary key, nome text, perfil text, setor_id uuid);
    create table public.rh_celulas (id uuid primary key, nome text);
    create table public.setores (id uuid primary key, nome text, regra text, cidade_id uuid);
    create function public.fn_user_is_super_admin() returns boolean language sql stable as $$
      select exists (select 1 from public.perfis where id = auth.uid() and perfil = 'super_admin') $$;
    create function public.fn_user_setor_id() returns uuid language sql stable as $$
      select setor_id from public.perfis where id = auth.uid() $$;
    create table public.mestre_lotes (id uuid primary key, empresa_id uuid, mes date, estado text, importado_em timestamptz);
    create table public.mestre_recebimentos (lote_id uuid, empresa_id uuid, mes date, dt_pgto date,
      cod_grupo_filtro text, nome_grupo_filtro text, recebido numeric);
    create table public.mestre_grupos (empresa_id uuid, cod_grupo_filtro text, setor_id uuid, estado text);
    create table public.tv_paineis (id uuid primary key, setor_id uuid);
    create table public.tv_conexoes (id uuid primary key default gen_random_uuid(), painel_id uuid, segredo_hash text);

    insert into public.empresas values ('${EMP}');
    insert into public.rh_celulas values ('${BIRIGUI}', 'Birigui'), ('${MARILIA}', 'Marília');
    insert into public.setores values
      ('${PLAY1}', 'Play 1', 'nosso_produto', '${BIRIGUI}'),
      ('${JORNADA}', 'Jornada Play', 'nosso_produto', '${BIRIGUI}'),
      ('${PLAY5}', 'Play 5', 'nosso_produto', '${MARILIA}'),
      ('${COFEN}', 'Cofen Marília', 'cofen', '${MARILIA}');
    insert into public.perfis values
      ('${SUPER}', 'Super', 'super_admin', null),
      ('${OPERADOR}', 'Op Play 1', 'operador', '${PLAY1}'),
      ('${MARIANA}', 'Op Play 5', 'operador', '${PLAY5}');
    insert into public.mestre_grupos values
      ('${EMP}', '25', '${PLAY1}', 'vinculado'),
      ('${EMP}', '76', '${JORNADA}', 'vinculado'),
      ('${EMP}', '3', '${PLAY5}', 'vinculado'),
      ('${EMP}', '72', '${COFEN}', 'vinculado'),
      ('${EMP}', '61', null, 'novo');
    insert into public.mestre_lotes values ('${LOTE}', '${EMP}', '2026-11-01', 'vigente', '2026-11-16 11:07:00-03');
    insert into public.mestre_recebimentos values
      ('${LOTE}', '${EMP}', '2026-11-01', '2026-11-16', '25', 'COB PLAY 1', 1000),
      ('${LOTE}', '${EMP}', '2026-11-01', '2026-11-16', '25', 'COB PLAY 1', 500),
      ('${LOTE}', '${EMP}', '2026-11-01', '2026-11-16', '76', 'JORNADAPLAY', 300),
      ('${LOTE}', '${EMP}', '2026-11-01', '2026-11-16', '3', 'MARILIA - PLAY 5', 200),
      ('${LOTE}', '${EMP}', '2026-11-01', '2026-11-16', '72', 'MARILIA - COFEN', 900),
      ('${LOTE}', '${EMP}', '2026-11-01', '2026-11-16', '61', 'COB PLAY - EM DIA', 70),
      ('${LOTE}', '${EMP}', '2026-11-01', '2026-11-13', '25', 'COB PLAY 1', 9999);
    insert into public.tv_paineis values ('${PAINEL}', '${PLAY1}');
    insert into public.tv_conexoes (painel_id, segredo_hash) values ('${PAINEL}', '${createHash('sha256').update(TOKEN).digest('hex')}');
  `);
  await db.exec(readFileSync('supabase/migrations/20261116150000_desafio_cobranca.sql', 'utf8'));
  // O sinal ao vivo (20261116210000): o emissor de verdade é a fila de 10 s; aqui só anota.
  await db.exec(`
    create table public.sinais_teste (topico text, tabela text, operacao text);
    create function public.fn_realtime_sinal_emitir(p_topico text, p_payload jsonb, p_forcar boolean default false)
    returns boolean language plpgsql as $$ begin
      insert into public.sinais_teste values (p_topico, p_payload ->> 'tabela', p_payload ->> 'operacao'); return true;
    end $$;
  `);
  await db.exec(readFileSync('supabase/migrations/20261116210000_desafio_cobranca_ao_vivo.sql', 'utf8'));
  await db.exec(readFileSync('supabase/migrations/20261116230000_desafio_cobranca_lancamento_vale_o_ultimo.sql', 'utf8'));
}, 60_000);

afterAll(async () => { await db?.close(); });

describe('desafio cobrança — semente e placar', () => {
  it('a semente cria o desafio de 16 a 18/11, não liberado, sem Jornada e sem Cofen somando', async () => {
    const d = (await db.query<{ liberado: boolean; meta_geral: string; dias: string }>(
      `select liberado, meta_geral::text, dias::text from public.desafio_cobranca`)).rows;
    expect(d).toHaveLength(1);
    expect(d[0].liberado).toBe(false);
    expect(num(d[0].meta_geral)).toBe(1_900_000);
    expect(d[0].dias).toBe('{2026-11-16,2026-11-17,2026-11-18}');

    const s = (await db.query<{ setor_id: string; soma: boolean; ve: boolean }>(
      `select setor_id::text, soma, ve from public.desafio_cobranca_setores order by setor_id`)).rows;
    const por = Object.fromEntries(s.map(x => [x.setor_id, x]));
    expect(por[PLAY1]).toMatchObject({ soma: true, ve: true });
    expect(por[JORNADA]).toMatchObject({ soma: false, ve: false });
    expect(por[PLAY5]).toMatchObject({ soma: true, ve: false });   // Marília soma sem ver
    expect(por[COFEN]).toMatchObject({ soma: false, ve: false });
  });

  it('o placar conta grupo ligado a setor que soma, o avulso marcado, e só os dias do desafio', async () => {
    await como(SUPER);
    const p = await json<{ total: number; grupos_avulsos: string[]; por_dia: { dia: string; total: number }[]; regra_medias: number; regra_medias_maior: number; regra_premio_maior: string }>(
      'select public.fn_desafio_cobranca_atual() r');
    // A regra individual: 4,5 médias = 1h mais cedo; 5 médias = sai às 14:00.
    expect(num(p.regra_medias)).toBe(4.5);
    expect(num(p.regra_medias_maior)).toBe(5);
    expect(p.regra_premio_maior).toBe('sai às 14:00');
    // Play 1 1.500 + Play 5 200 + Em dia (61, avulso da semente) 70. Fora: Jornada 300, Cofen 900, o dia 13.
    expect(p.grupos_avulsos).toEqual(['61']);
    expect(num(p.total)).toBe(1770);
    expect(p.por_dia.map(x => x.dia)).toEqual(['2026-11-16', '2026-11-17', '2026-11-18']);
    expect(num(p.por_dia[0].total)).toBe(1770);
  });

  it('grupo sem setor desmarcado sai; marcado de novo, volta', async () => {
    await como(SUPER);
    await db.exec(`update public.desafio_cobranca set grupos_avulsos = '{}'`);
    expect(num((await json<{ total: number }>('select public.fn_desafio_cobranca_atual() r')).total)).toBe(1700);
    await db.exec(`update public.desafio_cobranca set grupos_avulsos = '{61}'`);
    expect(num((await json<{ total: number }>('select public.fn_desafio_cobranca_atual() r')).total)).toBe(1770);
  });

  it('fonte manual: só os lançamentos do super_admin; de volta ao 59, o 59 volta', async () => {
    await como(SUPER);
    const id = (await db.query<{ id: string }>(`select id::text from public.desafio_cobranca`)).rows[0].id;
    expect((await json<{ fonte: string }>('select public.fn_desafio_cobranca_atual() r')).fonte).toBe('59');
    await expect(db.query(`update public.desafio_cobranca set fonte = 'planilha'`)).rejects.toThrow(/fonte_valida/);

    await db.exec(`update public.desafio_cobranca set fonte = 'manual'`);
    let p = await json<{ total: number; atualizado_em: string | null; por_dia: { valor_59: number; total: number }[] }>(
      'select public.fn_desafio_cobranca_atual() r');
    expect(num(p.total)).toBe(0);
    expect(p.atualizado_em).toBeNull();

    await db.query(`insert into public.desafio_cobranca_ajustes (desafio_id, dia, valor, motivo, criado_em)
                    values ($1, '2026-11-16', 5000, 'fechamento das 14h', '2026-11-16 14:05:00-03')`, [id]);
    p = await json('select public.fn_desafio_cobranca_atual() r');
    expect(num(p.total)).toBe(5000);
    expect(num(p.por_dia[0].valor_59)).toBe(0);
    expect(new Date(p.atualizado_em!).toISOString()).toBe('2026-11-16T17:05:00.000Z');

    // 20261116230000: lançar de novo SUBSTITUI (vale o último), sem motivo, e 0 é valor.
    await db.query(`insert into public.desafio_cobranca_ajustes (desafio_id, dia, valor, criado_em)
                    values ($1, '2026-11-16', 7000, '2026-11-16 15:05:00-03')`, [id]);
    p = await json('select public.fn_desafio_cobranca_atual() r');
    expect(num(p.total)).toBe(7000);
    await db.query(`insert into public.desafio_cobranca_ajustes (desafio_id, dia, valor, motivo, criado_em)
                    values ($1, '2026-11-17', 0, '', '2026-11-17 09:00:00-03')`, [id]);
    expect(num((await json<{ total: number }>('select public.fn_desafio_cobranca_atual() r')).total)).toBe(7000);
    // Remover o último volta ao anterior.
    await db.exec(`update public.desafio_cobranca_ajustes set removido_em = now() where valor = 7000`);
    expect(num((await json<{ total: number }>('select public.fn_desafio_cobranca_atual() r')).total)).toBe(5000);

    // De volta ao 59: o 59 + o lançamento (que vira ajuste). Limpa para os próximos testes.
    await db.exec(`update public.desafio_cobranca set fonte = '59'`);
    expect(num((await json<{ total: number }>('select public.fn_desafio_cobranca_atual() r')).total)).toBe(6770);
    await db.exec(`delete from public.desafio_cobranca_ajustes`);
  });

  it('o detalhe manda o cod do grupo sem setor nas horas', async () => {
    await como(SUPER);
    const d = await json<{ horas: { setor_id: string | null; cod: string | null; valor: number }[] }>('select public.fn_desafio_cobranca_detalhe() r');
    const solto = d.horas.filter(h => !h.setor_id).map(h => [h.cod, num(h.valor)]).sort();
    expect(solto).toEqual([['61', 70]]);
  });

  it('o 2º nível precisa de mais médias que o 1º', async () => {
    await expect(db.query(`update public.desafio_cobranca set regra_medias_maior = 4`)).rejects.toThrow(/medias_ordem/);
  });

  it('quem não é super_admin não vê antes da liberação', async () => {
    await como(OPERADOR);
    expect(await json('select public.fn_desafio_cobranca_atual() r')).toBeNull();
    await expect(db.query('select public.fn_desafio_cobranca_detalhe() r')).rejects.toThrow(/super_admin/);
  });
});

describe('desafio cobrança — robô, ajuste e liberação', () => {
  it('um lote novo promovido vira uma leitura nova e o placar anda', async () => {
    await db.exec(`
      insert into public.mestre_recebimentos values ('${LOTE}', '${EMP}', '2026-11-01', '2026-11-16', '25', 'COB PLAY 1', 800);
      update public.mestre_lotes set estado = 'aberto' where id = '${LOTE}';
      update public.mestre_lotes set estado = 'vigente', importado_em = '2026-11-16 12:07:00-03' where id = '${LOTE}';
    `);
    await como(SUPER);
    const p = await json<{ total: number; atualizado_em: string }>('select public.fn_desafio_cobranca_atual() r');
    expect(num(p.total)).toBe(2570);
    expect(new Date(p.atualizado_em).toISOString()).toBe('2026-11-16T15:07:00.000Z');

    const d = await json<{ horas: { lido_em: string }[]; leituras: string[] }>('select public.fn_desafio_cobranca_detalhe() r');
    expect(d.leituras).toHaveLength(2);
  });

  it('o ajuste soma; com setor que não soma, não conta; removido, sai', async () => {
    await como(SUPER);
    const id = (await db.query<{ id: string }>(`select id::text from public.desafio_cobranca`)).rows[0].id;
    await db.query(`insert into public.desafio_cobranca_ajustes (desafio_id, dia, valor, motivo, criado_por)
                    values ($1, '2026-11-16', 120.50, 'baixa manual que o 59 não trouxe', $2)`, [id, SUPER]);
    await db.query(`insert into public.desafio_cobranca_ajustes (desafio_id, dia, setor_id, valor, motivo)
                    values ($1, '2026-11-16', $2, 999, 'ajuste da Jornada')`, [id, JORNADA]);
    let p = await json<{ total: number }>('select public.fn_desafio_cobranca_atual() r');
    expect(num(p.total)).toBe(2690.5);

    await db.query(`update public.desafio_cobranca_ajustes set removido_em = now() where valor = 120.50`);
    p = await json<{ total: number }>('select public.fn_desafio_cobranca_atual() r');
    expect(num(p.total)).toBe(2570);
  });

  it('liberado: o setor que vê enxerga; o que só soma não; a TV do setor que vê também', async () => {
    await db.exec(`update public.desafio_cobranca set liberado = true`);
    // A janela depende de hoje: a função é trocada por uma que diz «dentro».
    await db.exec(`create or replace function public.fn_desafio_cobranca_na_janela(p_dias date[], p_premio date)
                   returns boolean language sql stable as $$ select true $$`);

    await como(OPERADOR);
    const p = await json<{ total: number; previa: boolean; super_admin: boolean }>('select public.fn_desafio_cobranca_atual() r');
    expect(num(p.total)).toBe(2570);
    expect(p.previa).toBe(false);
    expect(p.super_admin).toBe(false);
    expect(p).not.toHaveProperty('setores');

    await como(MARIANA);
    expect(await json('select public.fn_desafio_cobranca_atual() r')).toBeNull();

    await como(null);
    const tv = await json<{ total: number; natal: boolean }>('select public.fn_desafio_cobranca_tv($1) r', [TOKEN]);
    expect(num(tv.total)).toBe(2570);
    // Sem a tabela do Natal (ou sem liberar): a TV fica no Grafite e ouro.
    expect(tv.natal).toBe(false);
    await db.exec(`create table public.natal_liberacao (id smallint primary key, liberado_em timestamptz)`);
    expect((await json<{ natal: boolean }>('select public.fn_desafio_cobranca_tv($1) r', [TOKEN])).natal).toBe(false);
    await db.exec(`insert into public.natal_liberacao values (1, now())`);
    expect((await json<{ natal: boolean }>('select public.fn_desafio_cobranca_tv($1) r', [TOKEN])).natal).toBe(true);
    expect(await json('select public.fn_desafio_cobranca_tv($1) r', ['cd'.repeat(32)])).toBeNull();
  });

  it('a abertura: uma vez por pessoa, no banco; quem não vê o desafio não grava', async () => {
    const id = (await db.query<{ id: string }>(`select id::text from public.desafio_cobranca`)).rows[0].id;

    await como(OPERADOR);
    expect((await json<{ ja_abriu: boolean }>('select public.fn_desafio_cobranca_atual() r')).ja_abriu).toBe(false);
    expect((await db.query<{ r: boolean }>('select public.fn_desafio_cobranca_abri($1) r', [id])).rows[0].r).toBe(true);
    await db.query('select public.fn_desafio_cobranca_abri($1)', [id]);   // de novo: não duplica
    expect((await json<{ ja_abriu: boolean }>('select public.fn_desafio_cobranca_atual() r')).ja_abriu).toBe(true);

    // Marília soma sem ver: não grava abertura.
    await como(MARIANA);
    expect((await db.query<{ r: boolean }>('select public.fn_desafio_cobranca_abri($1) r', [id])).rows[0].r).toBe(false);

    // O super_admin tem a dele, separada; e vê quantas pessoas abriram.
    await como(SUPER);
    expect((await json<{ ja_abriu: boolean }>('select public.fn_desafio_cobranca_atual() r')).ja_abriu).toBe(false);
    expect(num((await json<{ aberturas: number }>('select public.fn_desafio_cobranca_detalhe() r')).aberturas)).toBe(1);
  });

  it('o gatilho com erro não derruba a promoção do 59', async () => {
    await db.exec(`create or replace function public.fn_desafio_cobranca_ler(p_desafio uuid, p_lote uuid)
                   returns integer language plpgsql as $$ begin raise exception 'quebrou'; end $$`);
    await db.exec(`
      update public.mestre_lotes set estado = 'aberto' where id = '${LOTE}';
      update public.mestre_lotes set estado = 'vigente', importado_em = '2026-11-16 13:07:00-03' where id = '${LOTE}';
    `);
    const l = (await db.query<{ estado: string }>(`select estado from public.mestre_lotes`)).rows[0];
    expect(l.estado).toBe('vigente');
  });
});

describe('desafio cobrança — ao vivo (20261116210000)', () => {
  const sinais = async () => (await db.query<{ topico: string; tabela: string; operacao: string }>(
    'select topico, tabela, operacao from public.sinais_teste')).rows;

  it('uma leitura do 59 com várias linhas vira UM sinal por empresa, no tópico desafios', async () => {
    await db.exec(`delete from public.sinais_teste;
      insert into public.desafio_cobranca_leituras (desafio_id, lido_em, dia, cod_grupo_filtro, valor)
      select id, '2026-11-17 15:07:00-03', '2026-11-17', c, 10 from public.desafio_cobranca, unnest(array['25','3','61']) c`);
    expect(await sinais()).toEqual([{ topico: `desafios:${EMP}`, tabela: 'desafio_cobranca_leituras', operacao: 'INSERT' }]);
  });

  it('ajuste lançado e removido, e mudança no desafio também avisam', async () => {
    await como(SUPER);
    await db.exec(`delete from public.sinais_teste;
      insert into public.desafio_cobranca_ajustes (desafio_id, dia, valor, motivo)
      select id, '2026-11-17', 50, 'teste ao vivo' from public.desafio_cobranca;
      update public.desafio_cobranca_ajustes set removido_em = now() where motivo = 'teste ao vivo';
      update public.desafio_cobranca set meta_geral = meta_geral;`);
    expect((await sinais()).map(x => `${x.tabela}:${x.operacao}`)).toEqual([
      'desafio_cobranca_ajustes:INSERT', 'desafio_cobranca_ajustes:UPDATE', 'desafio_cobranca:UPDATE',
    ]);
  });

  it('abrir a gaveta não manda sinal para a empresa inteira', async () => {
    await db.exec('delete from public.sinais_teste');
    await como(SUPER);
    await db.query('select public.fn_desafio_cobranca_abri(id) from public.desafio_cobranca');
    expect(await sinais()).toEqual([]);
  });

  it('o sinal com erro não derruba quem escreveu', async () => {
    await db.exec(`create or replace function public.fn_realtime_sinal_emitir(p_topico text, p_payload jsonb, p_forcar boolean default false)
                   returns boolean language plpgsql as $$ begin raise exception 'caiu'; end $$`);
    await db.exec(`insert into public.desafio_cobranca_leituras (desafio_id, lido_em, dia, cod_grupo_filtro, valor)
      select id, '2026-11-17 16:07:00-03', '2026-11-17', '25', 10 from public.desafio_cobranca`);
    const n = (await db.query<{ n: number }>(`select count(*)::int n from public.desafio_cobranca_leituras where lido_em = '2026-11-17 16:07:00-03'`)).rows[0].n;
    expect(n).toBe(1);
  });
});

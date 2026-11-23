// @vitest-environment node
//
// A migration do Desafio do Vale (20261123120000) num Postgres em memória:
// semente, % do setor pelo 59 (com o manual por cima), quem vê, liberação,
// fechamento e o recálculo só quando o 59 muda.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const EMP = '00000000-0000-4000-8000-000000000001';
const BIRIGUI = '00000000-0000-4000-8000-0000000000c1';
const PLAY1 = '00000000-0000-4000-8000-0000000000a1';
const JORNADA = '00000000-0000-4000-8000-0000000000a2';
const PLAY2 = '00000000-0000-4000-8000-0000000000a3';
const COFEN = '00000000-0000-4000-8000-0000000000a4';
const SUPER = '00000000-0000-4000-8000-0000000000f1';
const OPERADOR = '00000000-0000-4000-8000-0000000000f2';
const DIRETORA = '00000000-0000-4000-8000-0000000000f3';
const DO_JORNADA = '00000000-0000-4000-8000-0000000000f4';
const LOTE = '00000000-0000-4000-8000-0000000000e1';

let db: PGlite;

async function como(uid: string | null) {
  await db.query(`select set_config('test.uid', $1, false)`, [uid ?? '']);
}
async function json<T = Record<string, unknown>>(sql: string, args: unknown[] = []): Promise<T> {
  const r = await db.query<{ r: T }>(sql, args);
  return r.rows[0].r;
}
type Setor = { setor_id: string; nome: string; pct: number | null; origem: string | null; participa: boolean };
const atual = () => json<null | { meu_setor: Setor | null; setores: Setor[] | null; previa: boolean; faixas: unknown }>(
  'select public.fn_desafio_vale_atual() as r');

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create table public.empresas (id uuid primary key);
    create table public.perfis (id uuid primary key, nome text, perfil text, setor_id uuid, todos boolean default false);
    create table public.rh_celulas (id uuid primary key, nome text);
    create table public.setores (id uuid primary key, nome text, regra text, cidade_id uuid);
    create function public.fn_user_is_super_admin() returns boolean language sql stable as $$
      select exists (select 1 from public.perfis where id = auth.uid() and perfil = 'super_admin') $$;
    create function public.fn_user_setor_id() returns uuid language sql stable as $$
      select setor_id from public.perfis where id = auth.uid() $$;
    create function public.fn_user_tem(p_chave text) returns boolean language sql stable as $$
      select p_chave = 'analitico_escopo_todos_setores' and coalesce((select todos from public.perfis where id = auth.uid()), false) $$;
    create table public.mestre_lotes (id uuid primary key, empresa_id uuid, mes date, estado text, importado_em timestamptz);
    create table public.mestre_grupos (empresa_id uuid, cod_grupo_filtro text, setor_id uuid, estado text);
    create table public.metas (empresa_id uuid, tipo text, referencia_id text, mes int, ano int, meta_valor numeric);
    -- O 59 já atribuído a setor (no banco de verdade, a função do Painel Diretoria).
    create table public.linhas_59 (setor_id uuid, recebido numeric);
    create table public.chamadas_59 (n int);
    insert into public.chamadas_59 values (0);
    create function public.fn_mestre_diretoria_linhas(p_empresa_id uuid, p_mes text, p_dia_corte integer default null)
      returns table (setor_id uuid, recebido numeric) language plpgsql as $$
      begin
        update public.chamadas_59 set n = n + 1;
        return query select l.setor_id, l.recebido from public.linhas_59 l;
      end $$;
    create table public.composicao_mes (empresa_id uuid, mes text, operador_id uuid, setor_id uuid);
    create table public.sinais (topico text);
    create function public.fn_realtime_sinal_emitir(p_topico text, p_payload jsonb) returns void language sql as $$
      insert into public.sinais values (p_topico) $$;

    insert into public.empresas values ('${EMP}');
    insert into public.rh_celulas values ('${BIRIGUI}', 'Birigui');
    insert into public.setores values
      ('${PLAY1}', 'Play 1', 'nosso_produto', '${BIRIGUI}'),
      ('${JORNADA}', 'Jornada Play', 'nosso_produto', '${BIRIGUI}'),
      ('${PLAY2}', 'Play 2', 'nosso_produto', '${BIRIGUI}'),
      ('${COFEN}', 'Cofen Marília', 'cofen', '${BIRIGUI}');
    insert into public.perfis values
      ('${SUPER}', 'Super', 'super_admin', null, false),
      ('${OPERADOR}', 'Op Play 1', 'operador', '${PLAY1}', false),
      ('${DIRETORA}', 'Diretora', 'diretoria', '${PLAY2}', true),
      ('${DO_JORNADA}', 'Op Jornada', 'operador', '${JORNADA}', false);
    insert into public.mestre_grupos values
      ('${EMP}', '25', '${PLAY1}', 'vinculado'),
      ('${EMP}', '76', '${JORNADA}', 'vinculado'),
      ('${EMP}', '30', '${PLAY2}', 'vinculado'),
      ('${EMP}', '72', '${COFEN}', 'vinculado');
    insert into public.mestre_lotes values ('${LOTE}', '${EMP}', '2026-11-01', 'vigente', '2026-11-23 10:07-03');
    insert into public.metas values
      ('${EMP}', 'setor', '${PLAY1}', 11, 2026, 1000000),
      ('${EMP}', 'setor', '${PLAY2}', 11, 2026, 500000),
      ('${EMP}', 'setor', '${COFEN}', 11, 2026, 300000),
      ('${EMP}', 'operador', '${OPERADOR}', 11, 2026, 99);
    insert into public.linhas_59 values ('${PLAY1}', 600000), ('${PLAY1}', 349999.99), ('${PLAY2}', 510000), ('${COFEN}', 400000);
  `);
  const sql = readFileSync('supabase/migrations/20261123120000_desafio_vale.sql', 'utf8');
  await db.exec(sql);
  await db.exec(readFileSync('supabase/migrations/20261123150000_desafio_vale_virada_do_mes.sql', 'utf8'));
  await db.exec(readFileSync('supabase/migrations/20261123200000_desafio_vale_ranking_manutencao.sql', 'utf8'));
  await db.exec(`create table public.pix_automatico_acordos (id uuid primary key default gen_random_uuid(), empresa_id uuid,
    operador_id uuid, operador_nome text, setor_id uuid, status text, criado_em timestamptz)`);
  await db.exec(readFileSync('supabase/migrations/20261123220000_desafio_vale_sorteio.sql', 'utf8'));
  // A janela de quem vê é «hoje» de verdade: o desafio da semente é movido
  // para em volta de hoje, para o teste valer em qualquer data.
  await db.exec(`update public.desafio_vale set inicio = current_date - 2, fim = current_date + 5,
                   cupom_inicio = current_date - 2, cupom_fim = current_date + 1`);
});

afterAll(async () => { await db?.close(); });

describe('semente', () => {
  it('cria o desafio de 23 a 30/11 com cupom de 23 a 26/11, sem liberar', async () => {
    const d = await json<Record<string, unknown>>(`select to_jsonb(d) as r from public.desafio_vale d`);
    expect(d.liberado).toBe(false);
    expect(Number(d.medias)).toBe(9);
    expect(d.faixas).toEqual([{ pct: 100, valor: 120 }, { pct: 90, valor: 100 }, { pct: 0, valor: 80 }]);
    expect(d.cupom_pix).toBe(3);
  });

  it('participam os setores da cobrança; Jornada e Cofen ficam de fora', async () => {
    const r = await db.query<{ nome: string; participa: boolean }>(
      `select st.nome, s.participa from public.desafio_vale_setores s join public.setores st on st.id = s.setor_id order by st.nome`);
    expect(r.rows).toEqual([
      { nome: 'Cofen Marília', participa: false },
      { nome: 'Jornada Play', participa: false },
      { nome: 'Play 1', participa: true },
      { nome: 'Play 2', participa: true },
    ]);
  });
});

describe('quem vê', () => {
  it('antes de liberar: só o super_admin (prévia)', async () => {
    await como(OPERADOR);
    expect(await atual()).toBeNull();
    await como(SUPER);
    const d = await atual();
    expect(d?.previa).toBe(true);
    expect(d?.setores?.map(s => s.nome)).toEqual(['Play 1', 'Play 2']);
  });

  it('liberado: o operador vê o próprio setor, sem a lista dos outros', async () => {
    await como(SUPER);
    await db.exec(`update public.desafio_vale set liberado = true`);
    await como(OPERADOR);
    const d = await atual();
    expect(d?.previa).toBe(false);
    expect(d?.setores).toBeNull();
    expect(d?.meu_setor?.nome).toBe('Play 1');
  });

  it('quem tem o Analítico de todos os setores vê a lista', async () => {
    await como(DIRETORA);
    expect((await atual())?.setores?.length).toBe(2);
  });

  it('setor que não participa não vê', async () => {
    await como(DO_JORNADA);
    expect(await atual()).toBeNull();
  });

  it('a operação não escreve na configuração (RLS só super_admin)', async () => {
    const pol = await db.query<{ qual: string }>(`select qual from pg_policies where tablename = 'desafio_vale'`);
    expect(pol.rows[0].qual).toMatch(/fn_user_is_super_admin/);
  });
});

describe('o % do setor', () => {
  it('59 do setor ÷ meta do setor, sem arredondar para cima', async () => {
    await como(OPERADOR);
    const d = await atual();
    expect(Number(d?.meu_setor?.pct)).toBe(95); // 949.999,99 ÷ 1.000.000 = 94,99999 → round(.,2) = 95,00
    expect(d?.meu_setor?.origem).toBe('automatico');
  });

  it('Cofen não sai do 59: sem % automático', async () => {
    await como(SUPER);
    const det = await json<{ todos_setores: Setor[] }>('select public.fn_desafio_vale_detalhe() as r');
    const cofen = det.todos_setores.find(s => s.nome === 'Cofen Marília');
    expect(cofen?.pct).toBeNull();
  });

  it('não refaz a conta enquanto o 59 não muda', async () => {
    const antes = (await db.query<{ n: number }>('select n from public.chamadas_59')).rows[0].n;
    await como(OPERADOR);
    await atual();
    await atual();
    const depois = (await db.query<{ n: number }>('select n from public.chamadas_59')).rows[0].n;
    expect(depois).toBe(antes);
  });

  it('lote novo do 59: o próximo que abre refaz', async () => {
    await db.exec(`insert into public.linhas_59 values ('${PLAY1}', 100000);
                   update public.mestre_lotes set importado_em = '2026-11-23 11:07-03'`);
    await como(OPERADOR);
    expect(Number((await atual())?.meu_setor?.pct)).toBe(105);
  });

  it('o % manual (fechamento oficial) ganha do automático', async () => {
    await como(SUPER);
    await db.exec(`update public.desafio_vale_setores set pct_manual = 88.5 where setor_id = '${PLAY1}'`);
    await como(OPERADOR);
    const d = await atual();
    expect(Number(d?.meu_setor?.pct)).toBe(88.5);
    expect(d?.meu_setor?.origem).toBe('manual');
  });

  it('fechamento confirmado congela: o 59 não é mais relido', async () => {
    await como(SUPER);
    await db.exec(`update public.desafio_vale_setores set pct_manual = null;
                   update public.desafio_vale set fechado_em = now()`);
    const fechado = await json<{ fechado_por: string }>(`select to_jsonb(d) as r from public.desafio_vale d`);
    expect(fechado.fechado_por).toBe(SUPER);
    await db.exec(`insert into public.linhas_59 values ('${PLAY1}', 900000);
                   update public.mestre_lotes set importado_em = '2026-11-30 18:07-03'`);
    await como(OPERADOR);
    expect(Number((await atual())?.meu_setor?.pct)).toBe(105);
  });

  it('recalcular é só do super_admin', async () => {
    await como(OPERADOR);
    await expect(db.query(`select public.fn_desafio_vale_recalcular(id) from public.desafio_vale`)).rejects.toThrow(/super_admin/);
  });

  it('mexer no desafio manda o sinal ao vivo', async () => {
    const r = await db.query<{ n: number }>(`select count(*)::int as n from public.sinais where topico = 'desafios:${EMP}'`);
    expect(r.rows[0].n).toBeGreaterThan(0);
  });
});

describe('a virada do mês (20261123150000)', () => {
  it('passado o fim, vale o setor do retrato do mês, não o de hoje', async () => {
    await como(SUPER);
    await db.exec(`update public.desafio_vale set fechado_em = null, inicio = current_date - 8, fim = current_date - 1;
                   update public.desafio_vale_setores set pct_manual = null`);
    // O operador do Play 1 foi para o Jornada (que não participa) na virada.
    await db.exec(`update public.perfis set setor_id = '${JORNADA}' where id = '${OPERADOR}';
                   insert into public.composicao_mes values ('${EMP}', to_char(current_date - 1, 'YYYY-MM'), '${OPERADOR}', '${PLAY1}')`);
    await como(OPERADOR);
    const d = await atual();
    expect(d?.meu_setor?.nome).toBe('Play 1');
  });

  it('sem retrato, vale o setor de hoje (e quem foi para setor de fora some)', async () => {
    await db.exec(`delete from public.composicao_mes`);
    await como(OPERADOR);
    expect(await atual()).toBeNull();
  });

  it('com o resultado gravado no fechamento, continua vendo e recebe o resultado', async () => {
    await como(SUPER);
    await db.exec(`insert into public.desafio_vale_resultado (desafio_id, perfil_id, nome, medias, feito, bateu, valor, cupons)
                   select id, '${OPERADOR}', 'Op Play 1', 9.4, 94000, true, 120, 2 from public.desafio_vale`);
    await como(OPERADOR);
    const d = await json<{ meu_resultado: { valor: number; bateu: boolean; cupons: number } }>('select public.fn_desafio_vale_atual() as r');
    expect(Number(d.meu_resultado.valor)).toBe(120);
    expect(d.meu_resultado.bateu).toBe(true);
    await db.exec(`update public.perfis set setor_id = '${PLAY1}' where id = '${OPERADOR}'`);
  });

  it('a operação não lê o resultado dos outros direto na tabela', async () => {
    const pol = await db.query<{ qual: string }>(`select qual from pg_policies where tablename = 'desafio_vale_resultado'`);
    expect(pol.rows.map(r => r.qual).join()).toMatch(/fn_user_is_super_admin/);
  });

  it('sem lote vigente do mês, o % guardado não vira zero', async () => {
    await como(SUPER);
    const antes = await json<number>(`select pct_auto as r from public.desafio_vale_setores where setor_id = '${PLAY1}'`);
    await db.exec(`update public.mestre_lotes set estado = 'substituido'`);
    await db.query(`select public.fn_desafio_vale_recalcular(id) from public.desafio_vale`);
    const depois = await json<number>(`select pct_auto as r from public.desafio_vale_setores where setor_id = '${PLAY1}'`);
    expect(Number(depois)).toBe(Number(antes));
    expect(Number(depois)).toBeGreaterThan(0);
    await db.exec(`update public.mestre_lotes set estado = 'vigente'`);
  });
});

describe('Manutenção: ranking dos 2 que mais recebem (20261123200000)', () => {
  const MANUT = '00000000-0000-4000-8000-0000000000a9';
  const M1 = '00000000-0000-4000-8000-0000000000b1';
  const M2 = '00000000-0000-4000-8000-0000000000b2';
  const M3 = '00000000-0000-4000-8000-0000000000b3';
  const LIDER = '00000000-0000-4000-8000-0000000000b4';
  type Ranking = { qtd: number; topo: { nome: string; posicao: number }[]; eu: { posicao: number } | null; todos: unknown[] | null; corte: number };

  beforeAll(async () => {
    await db.exec(`
      alter table public.perfis add column if not exists empresa_id uuid, add column if not exists ativo boolean,
        add column if not exists arquivado boolean;
      update public.perfis set empresa_id = '${EMP}';
      create table public.analitico_recebimentos (empresa_id uuid, operador_id uuid, data_pagamento date, valor_recebido numeric);
      create or replace function public.fn_user_tem(p_chave text) returns boolean language sql stable as $$
        select (p_chave = 'analitico_escopo_todos_setores' and coalesce((select todos from public.perfis where id = auth.uid()), false))
            or (p_chave = 'analitico_escopo_setor' and exists (select 1 from public.perfis where id = auth.uid() and perfil = 'lider')) $$;
      insert into public.setores values ('${MANUT}', 'Manutenção', 'nosso_produto', '${BIRIGUI}');
      insert into public.perfis (id, nome, perfil, setor_id, empresa_id) values
        ('${M1}', 'Ana', 'operador', '${MANUT}', '${EMP}'), ('${M2}', 'Bia', 'operador', '${MANUT}', '${EMP}'),
        ('${M3}', 'Caio', 'operador', '${MANUT}', '${EMP}'), ('${LIDER}', 'Líder', 'lider', '${MANUT}', '${EMP}');
      insert into public.desafio_vale_setores (desafio_id, setor_id, participa) select id, '${MANUT}', true from public.desafio_vale;
      insert into public.analitico_recebimentos values
        ('${EMP}', '${M1}', current_date, 5000), ('${EMP}', '${M2}', current_date, 9000),
        ('${EMP}', '${M3}', current_date, 7000), ('${EMP}', '${M3}', current_date - 30, 99999),
        ('${EMP}', '${LIDER}', current_date, 50000);
    `);
    // Reaplicar marca a Manutenção (que agora existe) como ranking.
    await como(null);
    await db.exec(readFileSync('supabase/migrations/20261123200000_desafio_vale_ranking_manutencao.sql', 'utf8'));
    // E a do sorteio, que vem depois e substitui o `fn_desafio_vale_setor_json`.
    await db.exec(readFileSync('supabase/migrations/20261123220000_desafio_vale_sorteio.sql', 'utf8'));
  });

  it('a migration marca a Manutenção como ranking dos 2; os outros seguem no Pix', async () => {
    const r = await db.query<{ nome: string; cupom_regra: string; cupom_ranking_qtd: number }>(
      `select st.nome, s.cupom_regra, s.cupom_ranking_qtd from public.desafio_vale_setores s join public.setores st on st.id = s.setor_id
        where s.participa order by st.nome`);
    expect(r.rows.find(x => x.nome === 'Manutenção')).toMatchObject({ cupom_regra: 'ranking', cupom_ranking_qtd: 2 });
    expect(r.rows.find(x => x.nome === 'Play 2')?.cupom_regra).toBe('pix');
  });

  it('o operador vê o pódio e a posição dele, não a lista inteira', async () => {
    await como(M1);
    const r = await json<Ranking>('select public.fn_desafio_vale_ranking() as r');
    expect(r.qtd).toBe(2);
    expect(r.topo.map(t => t.nome)).toEqual(['Bia', 'Caio']); // o líder não concorre; dia fora do período não conta
    expect(r.eu?.posicao).toBe(3);
    expect(r.todos).toBeNull();
    expect(Number(r.corte)).toBe(7000);
  });

  it('o líder do setor vê a lista inteira', async () => {
    await como(LIDER);
    const r = await json<Ranking>('select public.fn_desafio_vale_ranking() as r');
    expect(r.todos).toHaveLength(3);
  });

  it('setor de Pix não tem ranking', async () => {
    await como(DIRETORA);
    expect(await json('select public.fn_desafio_vale_ranking() as r')).toBeNull();
  });

  it('quem vê todos escolhe o setor', async () => {
    await como(SUPER);
    const r = await json<Ranking>(`select public.fn_desafio_vale_ranking('${MANUT}') as r`);
    expect(r.topo[0].nome).toBe('Bia');
  });
});

describe('o sorteio dos cupons (20261123220000)', () => {
  const A = '00000000-0000-4000-8000-0000000000c5';
  const B = '00000000-0000-4000-8000-0000000000c6';
  const C = '00000000-0000-4000-8000-0000000000c7';
  const D = '00000000-0000-4000-8000-0000000000c8';
  type Sorteio = { concorrentes: number; chances_total: number; ganhadores: { perfil_id: string; posicao: number; cupons: number }[] };

  beforeAll(async () => {
    await db.exec(`
      insert into public.pix_automatico_acordos (empresa_id, operador_id, operador_nome, setor_id, status, criado_em)
      select '${EMP}', x.op, x.nome, '${PLAY2}', x.st, now()
        from (values ('${A}'::uuid, 'Ana', 'aprovado', 7), ('${B}'::uuid, 'Beto', 'aprovado', 3),
                     ('${C}'::uuid, 'Cris', 'aprovado', 2), ('${D}'::uuid, 'Dani', 'pendente', 6)) x(op, nome, st, n),
             generate_series(1, x.n);
      -- Fora do período: não conta.
      insert into public.pix_automatico_acordos (empresa_id, operador_id, operador_nome, setor_id, status, criado_em)
      select '${EMP}', '${C}', 'Cris', '${PLAY2}', 'aprovado', now() - interval '40 days' from generate_series(1, 9);
    `);
  });

  it('a cota já sai configurada pelo nome do setor', async () => {
    const r = await db.query<{ nome: string; sorteio_qtd: number }>(
      `select st.nome, s.sorteio_qtd from public.desafio_vale_setores s join public.setores st on st.id = s.setor_id order by st.nome`);
    expect(r.rows.find(x => x.nome === 'Play 1')?.sorteio_qtd).toBe(3);
    expect(r.rows.find(x => x.nome === 'Play 2')?.sorteio_qtd).toBe(3);
  });

  it('só o super_admin sorteia', async () => {
    await como(OPERADOR);
    await expect(db.query(`select public.fn_desafio_vale_sortear('${PLAY2}')`)).rejects.toThrow(/super_admin/);
  });

  it('concorre quem tem cupom (Pix aprovado, no período); ninguém ganha duas vezes', async () => {
    await como(SUPER);
    const r = await json<Sorteio>(`select public.fn_desafio_vale_sortear('${PLAY2}') as r`);
    expect(r.concorrentes).toBe(2);           // Ana (2 cupons) e Beto (1); Cris tem 2 Pix, Dani só pendentes
    expect(r.chances_total).toBe(2);          // uma chance por pessoa (o padrão, 23/11)
    expect(r.ganhadores).toHaveLength(2);     // cota de 3, mas só 2 concorrem
    expect(new Set(r.ganhadores.map(g => g.perfil_id))).toEqual(new Set([A, B]));
  });

  it('sortear de novo pede «refazer»', async () => {
    await expect(db.query(`select public.fn_desafio_vale_sortear('${PLAY2}')`)).rejects.toThrow(/refazer/);
    const r = await json<Sorteio>(`select public.fn_desafio_vale_sortear('${PLAY2}', true) as r`);
    expect(r.ganhadores).toHaveLength(2);
  });

  it('cada cupom uma chance, quando configurado', async () => {
    await db.exec(`update public.desafio_vale set sorteio_por_cupom = true`);
    const r = await json<Sorteio>(`select public.fn_desafio_vale_sortear('${PLAY2}', true) as r`);
    expect(r.chances_total).toBe(3);
    await db.exec(`update public.desafio_vale set sorteio_por_cupom = false`);
  });

  it('Marília não participa', async () => {
    await db.exec(`
      insert into public.rh_celulas values ('00000000-0000-4000-8000-0000000000c9', 'Marília') on conflict do nothing;
      insert into public.setores values ('00000000-0000-4000-8000-0000000000aa', 'Play 5', 'nosso_produto', '00000000-0000-4000-8000-0000000000c9');
      insert into public.desafio_vale_setores (desafio_id, setor_id, participa)
        select id, '00000000-0000-4000-8000-0000000000aa', true from public.desafio_vale;`);
    await como(null);
    await db.exec(readFileSync('supabase/migrations/20261123220000_desafio_vale_sorteio.sql', 'utf8'));
    const r = await json<boolean>(`select participa as r from public.desafio_vale_setores where setor_id = '00000000-0000-4000-8000-0000000000aa'`);
    expect(r).toBe(false);
    await como(SUPER);
  });

  it('a Manutenção é ranking: não sorteia', async () => {
    const manut = await json<string>(`select id::text as r from public.setores where nome = 'Manutenção'`);
    await expect(db.query('select public.fn_desafio_vale_sortear($1::uuid)', [manut])).rejects.toThrow(/ranking/);
  });

  it('os ganhadores aparecem no setor', async () => {
    const r = await json<{ ganhadores: unknown[]; sorteio_qtd: number }>(
      `select public.fn_desafio_vale_setor_json(id, '${PLAY2}') as r from public.desafio_vale`);
    expect(r.sorteio_qtd).toBe(3);
    expect(r.ganhadores).toHaveLength(2);
  });
});

describe('o recebido do setor igual ao do Painel do Líder (20261123231000)', () => {
  const MANUT = '00000000-0000-4000-8000-0000000000a9';
  const IMPORTADOR = '00000000-0000-4000-8000-0000000000d9';
  const recebido = (setor: string) => json<string>(
    'select recebido_auto::text as r from public.desafio_vale_setores where setor_id = $1::uuid', [setor]);

  beforeAll(async () => {
    await db.exec(`
      alter table public.setores add column if not exists alternativo boolean default false;
      alter table public.analitico_recebimentos add column if not exists setor_id uuid,
        add column if not exists importado_por_id uuid, add column if not exists procedencia text,
        add column if not exists contribuicao_de_setor_id uuid;
      create table public.analitico_exclusoes_setor (empresa_id uuid, mes text, setor_id uuid, setor_origem_id uuid);
      create table public.contribuicao_receptivo (empresa_id uuid, setor_id uuid, mes text, acumulado numeric, meta numeric);
      delete from public.analitico_recebimentos;
      update public.desafio_vale set fechado_em = null;
      insert into public.perfis (id, nome, perfil, setor_id, empresa_id) values ('${IMPORTADOR}', 'Robô', 'operador', '${PLAY1}', '${EMP}');
    `);
    const mes = await json<string>(`select to_char(date_trunc('month', fim), 'YYYY-MM') as r from public.desafio_vale where ativo`);
    const dia = await json<string>(`select date_trunc('month', fim)::date::text as r from public.desafio_vale where ativo`);
    await db.query(`
      insert into public.analitico_recebimentos (empresa_id, operador_id, data_pagamento, valor_recebido, setor_id, importado_por_id, procedencia) values
        ($1, null, $2::date, 238000, $3, null, null),          -- Manutenção pelo carimbo
        ($1, null, $2::date, 1000, null, $4, null),            -- sem carimbo: vai para o setor de quem importou (Play 1)
        ($1, $5, $2::date, 500000, $6, null, null),            -- Play 1, cobrado pelo operador do Play 1
        ($1, $7, $2::date, 20000, $6, null, null)`, // a última: Play 1, cobrado por alguém do Jornada (origem excluída)
      [EMP, dia, MANUT, IMPORTADOR, OPERADOR, PLAY1, DO_JORNADA]);
    await db.query(`insert into public.contribuicao_receptivo values ($1, $2, $3, 970000, 0)`, [EMP, MANUT, mes]);
    await db.query(`insert into public.analitico_exclusoes_setor values ($1, $2, $3, $4)`, [EMP, mes, PLAY1, JORNADA]);
    await como(null);
    await db.exec(readFileSync('supabase/migrations/20261123231000_desafio_vale_recebido_como_o_painel.sql', 'utf8'));
  });

  it('Manutenção: o total do relatório + a Contribuição do Receptivo digitada', async () => {
    expect(Number(await recebido(MANUT))).toBe(1_208_000);
  });

  it('linha sem carimbo vai para o setor de quem importou; a origem excluída sai', async () => {
    expect(Number(await recebido(PLAY1))).toBe(501_000);
  });

  it('com a contribuição já vinda do 59 em linhas, a digitada não soma de novo', async () => {
    const dia = await json<string>(`select date_trunc('month', fim)::date::text as r from public.desafio_vale where ativo`);
    await db.query(`insert into public.analitico_recebimentos (empresa_id, operador_id, data_pagamento, valor_recebido, setor_id, procedencia)
                    values ($1, null, $2::date, 900000, $3, 'contribuicao_59')`, [EMP, dia, MANUT]);
    await db.query(`select public.fn_desafio_vale_calcular(id) from public.desafio_vale where ativo`);
    expect(Number(await recebido(MANUT))).toBe(1_138_000);
  });
});

describe('o recebido soma o ajuste e o relatório 1017 (20261123233000)', () => {
  const MANUT = '00000000-0000-4000-8000-0000000000a9';
  const recebido = (setor: string) => json<string>(
    'select recebido_auto::text as r from public.desafio_vale_setores where setor_id = $1::uuid', [setor]);

  beforeAll(async () => {
    // A leitura única do dinheiro fora do Analítico (no banco: ajuste + 1017).
    await db.exec(`
      create table public.ajustes_teste (alvo text, operador_id uuid, setor_id uuid, dia date, valor numeric);
      create function public.fn_ajustes_recebimento(p_empresas uuid[], p_ini date, p_fim date,
        p_de timestamptz default null, p_ate timestamptz default null)
      returns table(empresa_id uuid, alvo text, operador_id uuid, equipe_id uuid, setor_id uuid, dia date,
                    valor numeric, valor_ho numeric, origem text)
      language sql stable as $f$
        select p_empresas[1], a.alvo, a.operador_id, null::uuid, a.setor_id, a.dia, a.valor, 0::numeric,
               case when a.alvo = 'setor' then 'relatorio_1017' else 'ajuste' end
          from public.ajustes_teste a where a.dia between p_ini and p_fim $f$;
    `);
    const dia = await json<string>(`select date_trunc('month', fim)::date::text as r from public.desafio_vale where ativo`);
    await db.query(`insert into public.ajustes_teste values
      ('setor', null, $1, $3::date, 70798.45),       -- o 1017 da Manutenção (sem pessoa)
      ('operador', $2, null, $3::date, 1500)`,        // ajuste de uma pessoa do Play 1: vai para o setor dela
      [MANUT, OPERADOR, dia]);
    await como(null);
    await db.exec(readFileSync('supabase/migrations/20261123233000_desafio_vale_recebido_com_ajuste_e_1017.sql', 'utf8'));
  });

  it('Manutenção: Analítico + contribuição + o 1017', async () => {
    expect(Number(await recebido(MANUT))).toBeCloseTo(1_208_798.45, 2);
  });

  it('o ajuste da pessoa entra no setor dela', async () => {
    expect(Number(await recebido(PLAY1))).toBe(502_500);
  });
});

describe('a arte obrigatória e quem viu (20261123235000)', () => {
  const LIDER = '00000000-0000-4000-8000-0000000000b4';
  type Vistos = { setores: { nome: string; total: number; viram: number; faltam: { nome: string }[] }[] } | null;

  beforeAll(async () => {
    await como(null);
    await db.exec(readFileSync('supabase/migrations/20261123235000_desafio_vale_quem_viu.sql', 'utf8'));
  });

  it('«Bora pra cima» grava uma vez; repetir não duplica', async () => {
    await como(OPERADOR);
    expect(await json<boolean>('select public.fn_desafio_vale_ja_vi(id) as r from public.desafio_vale where ativo')).toBe(false);
    await db.query('select public.fn_desafio_vale_vi(id) from public.desafio_vale where ativo');
    await db.query('select public.fn_desafio_vale_vi(id) from public.desafio_vale where ativo');
    expect(await json<boolean>('select public.fn_desafio_vale_ja_vi(id) as r from public.desafio_vale where ativo')).toBe(true);
    const n = await json<number>('select count(*)::int as r from public.desafio_vale_vistos');
    expect(n).toBe(1);
  });

  it('o super_admin conta todos os setores que participam e vê quem falta', async () => {
    await como(SUPER);
    const v = await json<Vistos>('select public.fn_desafio_vale_vistos() as r');
    const play1 = v!.setores.find(x => x.nome === 'Play 1')!;
    expect(play1.viram).toBe(1);
    expect(play1.total).toBeGreaterThanOrEqual(1);
    expect(v!.setores.some(x => x.nome === 'Jornada Play')).toBe(false);   // não participa
    const manut = v!.setores.find(x => x.nome === 'Manutenção')!;
    expect(manut.faltam.map(f => f.nome)).toContain('Ana');
  });

  it('o líder vê só o setor dele; o operador não vê a contagem', async () => {
    await como(LIDER);
    const v = await json<Vistos>('select public.fn_desafio_vale_vistos() as r');
    expect(v!.setores.map(x => x.nome)).toEqual(['Manutenção']);
    await como(OPERADOR);
    expect(await json('select public.fn_desafio_vale_vistos() as r')).toBeNull();
  });

  it('antes de liberar, não grava', async () => {
    await como(SUPER);
    await db.exec('update public.desafio_vale set liberado = false');
    await como(OPERADOR);
    expect(await json<boolean>('select public.fn_desafio_vale_vi(id) as r from public.desafio_vale where ativo')).toBe(false);
    await como(SUPER);
    await db.exec('update public.desafio_vale set liberado = true');
  });
});

describe('reexecutável', () => {
  it('colar de novo não duplica nada', async () => {
    await como(null);
    await db.exec(readFileSync('supabase/migrations/20261123120000_desafio_vale.sql', 'utf8'));
    await db.exec(readFileSync('supabase/migrations/20261123150000_desafio_vale_virada_do_mes.sql', 'utf8'));
    await db.exec(readFileSync('supabase/migrations/20261123200000_desafio_vale_ranking_manutencao.sql', 'utf8'));
    await db.exec(readFileSync('supabase/migrations/20261123220000_desafio_vale_sorteio.sql', 'utf8'));
    await db.exec(readFileSync('supabase/migrations/20261123231000_desafio_vale_recebido_como_o_painel.sql', 'utf8'));
    await db.exec(readFileSync('supabase/migrations/20261123233000_desafio_vale_recebido_com_ajuste_e_1017.sql', 'utf8'));
    await db.exec(readFileSync('supabase/migrations/20261123235000_desafio_vale_quem_viu.sql', 'utf8'));
    const r = await db.query<{ n: number }>('select count(*)::int as n from public.desafio_vale');
    expect(r.rows[0].n).toBe(1);
  });
});

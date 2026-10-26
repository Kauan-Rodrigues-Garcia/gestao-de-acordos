// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Migration 20261026170000. A seção 5 remenda funções vivas do banco (o Painel
// Diretoria inteiro) e não tem como existir aqui: o mecanismo do remendo é
// testado à parte, com uma função de mentira.

const EMP = '00000000-0000-4000-8000-0000000000e1';
const S1 = '00000000-0000-4000-8000-0000000000a1';     // setor normal, regra nosso_produto
const S2 = '00000000-0000-4000-8000-0000000000a2';     // setor Cofen
const ALT = '00000000-0000-4000-8000-0000000000a3';    // setor alternativo
const S3 = '00000000-0000-4000-8000-0000000000a4';     // setor sem carteira no 59
const EQ1 = '00000000-0000-4000-8000-0000000000b1';
const ANA = '00000000-0000-4000-8000-0000000000c1';
const BIA = '00000000-0000-4000-8000-0000000000c2';
const ADM = '00000000-0000-4000-8000-0000000000c9';    // super_admin
const LIDER = '00000000-0000-4000-8000-0000000000d1';
const LOTE = '00000000-0000-4000-8000-0000000000f1';

let db: PGlite;
const q = async <T = Record<string, unknown>>(sql: string, p: unknown[] = []) => (await db.query<T>(sql, p)).rows;
const lancar = (alvo: string, campos: Record<string, string | null>, valor: number, mes = '2026-10-01') =>
  q(`insert into public.analitico_ajustes_manuais (empresa_id, alvo, operador_id, equipe_id, setor_id, mes_referencia, valor, motivo, criado_por)
     values ($1, $2, $3, $4, $5, $6, $7, 'por fora', $8) returning id`,
    [EMP, alvo, campos.operador ?? null, campos.equipe ?? null, campos.setor ?? null, mes, valor, LIDER]);
/** Põe todos os eventos de um ajuste num dia (o gatilho grava com now()). */
const noDia = (id: string, dia: string) =>
  q(`update public.analitico_ajustes_eventos set criado_em = ($2::date + time '12:00') at time zone 'America/Sao_Paulo' where ajuste_id = $1`, [id, dia]);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create schema private;
    create function auth.uid() returns uuid language sql as $$ select '${LIDER}'::uuid $$;
    create table public.empresas(id uuid primary key, slug text);
    create table public.setores(id uuid primary key, empresa_id uuid, alternativo boolean, regra text, nome text);
    create table public.equipes(id uuid primary key, empresa_id uuid, setor_id uuid, nome text);
    create table public.perfis(id uuid primary key, empresa_id uuid, setor_id uuid, equipe_id uuid, perfil text, usuario text);
    create table public.equipe_lideres(equipe_id uuid, lider_id uuid, empresa_id uuid);
    create table public.equipe_operadores_clones(operador_id uuid, equipe_id uuid, empresa_id uuid, conta_recebimento boolean);
    create table public.analitico_recebimentos(id serial, empresa_id uuid, operador_id uuid, setor_id uuid,
      valor_recebido numeric, total_ho numeric, data_pagamento date, importado_em timestamptz default now(), mes_referencia date);
    create table public.desafios(id uuid, empresa_id uuid, empresas uuid[], status text, setor_id uuid, regra jsonb,
      visibilidade text, data_inicio date, data_fim date, criado_por uuid);
    create table public.metas(empresa_id uuid, tipo text, referencia_id uuid, mes int, ano int, meta_valor numeric);
    create table public.metas_config_mes(empresa_id uuid, mes int, ano int, feriados jsonb, contar_dia_atual boolean);
    create table public.mestre_lotes(id uuid primary key, empresa_id uuid, mes date, estado text);
    create table public.mestre_grupos(empresa_id uuid, cod_grupo_filtro text, nome_grupo_filtro text, setor_id uuid, estado text);
    create table public.mestre_equipes(empresa_id uuid, cod_grupo_filtro text, nome_subgrupo text, equipe_id uuid, ultima_aparicao date);
    create table public.mestre_recebimentos(id bigint, lote_id uuid, empresa_id uuid, mes date, setor text default '',
      cod_grupo_filtro text, nome_grupo_filtro text default '', cod_grupo text default '', cod_grupo_representa text,
      setor_orig text, cobradora text default '', operador_orig text, subgrupo_equipe text default '', cliente text default '',
      cod_cli text default '', titulo text default '', nr_documento text default '', parcela text default '',
      empresa_erp text default '', tipo_venda text, tp_doc text default '', colchao boolean default false, tipo text default '',
      dt_lig date, prev_pgto date, dt_pgto date, dias int, dias_atraso int, dias_ligacao_baixa int, recebido numeric,
      linha_num int, operador_id uuid, operador_setor_id uuid);
    create table public.analitico_ajustes_manuais(
      id uuid primary key default gen_random_uuid(), empresa_id uuid not null, operador_id uuid not null, setor_id uuid,
      equipe_id uuid, mes_referencia date not null, valor numeric not null, motivo text not null, criado_por uuid,
      criado_por_nome text, criado_em timestamptz not null default now(), cancelado boolean not null default false,
      cancelado_por uuid, cancelado_por_nome text, cancelado_em timestamptz, motivo_cancelamento text,
      editado_por uuid, editado_por_nome text, atualizado_em timestamptz not null default now());
    create unique index ux_ajuste_card_por_operador_mes on public.analitico_ajustes_manuais (empresa_id, operador_id, mes_referencia) where not cancelado;
    alter table public.analitico_ajustes_manuais enable row level security;
    create table public.analitico_ajustes_eventos(id uuid primary key default gen_random_uuid(), ajuste_id uuid, empresa_id uuid,
      tipo text, valor_anterior numeric, valor_novo numeric, delta numeric, observacao text, autor_id uuid, autor_nome text,
      criado_em timestamptz not null default now());
    alter table public.analitico_ajustes_eventos enable row level security;
    -- O gatilho de histórico, como está no banco.
    create function public.fn_ajuste_registrar_evento() returns trigger language plpgsql as $$
    begin
      if tg_op = 'INSERT' then
        insert into public.analitico_ajustes_eventos (ajuste_id, empresa_id, tipo, valor_anterior, valor_novo, delta)
        values (new.id, new.empresa_id, 'criado', null, new.valor, new.valor); return new; end if;
      if new.cancelado and not old.cancelado then
        insert into public.analitico_ajustes_eventos (ajuste_id, empresa_id, tipo, valor_anterior, valor_novo, delta)
        values (new.id, new.empresa_id, 'cancelado', old.valor, 0, -old.valor); return new; end if;
      if new.valor is distinct from old.valor then
        insert into public.analitico_ajustes_eventos (ajuste_id, empresa_id, tipo, valor_anterior, valor_novo, delta)
        values (new.id, new.empresa_id, 'atualizado', old.valor, new.valor, new.valor - old.valor); end if;
      return new;
    end $$;
    create trigger trg_ajuste_evento after insert or update on public.analitico_ajustes_manuais
      for each row execute function public.fn_ajuste_registrar_evento();
    create function public.fn_pp_ho_percentual() returns numeric language sql as $$ select 0.2496 $$;
    create function public.fn_analitico_setores_no_mes(e uuid, m text, ops uuid[]) returns table(operador_id uuid, setor_id uuid)
      language sql as $$ select null::uuid, null::uuid where false $$;
    create function public.fn_empresas_acessiveis() returns uuid[] language sql as $$ select array['${EMP}'::uuid] $$;
    create function public.fn_user_is_super_admin() returns boolean language sql as $$ select false $$;
    create function public.fn_user_tem(k text) returns boolean language sql as $$ select k = 'ajuste_recebimento_lancar' $$;
    create function public.fn_user_setor_id() returns uuid language sql as $$ select '${S1}'::uuid $$;
    create function public.fn_user_equipes() returns uuid[] language sql as $$ select array[]::uuid[] $$;
    create function public.fn_ajuste_no_meu_alcance(p uuid) returns boolean language sql as $$ select true $$;

    insert into public.empresas values ('${EMP}', 'bookplay');
    insert into public.setores values ('${S1}', '${EMP}', false, 'nosso_produto', 'Play'),
      ('${S2}', '${EMP}', false, 'cofen', 'Conecta'), ('${ALT}', '${EMP}', true, 'nosso_produto', 'Digital'),
      ('${S3}', '${EMP}', false, 'nosso_produto', 'Treino');
    insert into public.equipes values ('${EQ1}', '${EMP}', '${S1}', 'Equipe 1');
    insert into public.perfis values ('${ANA}', '${EMP}', '${S1}', '${EQ1}', 'operador', 'ANA_X'),
      ('${BIA}', '${EMP}', '${ALT}', null, 'operador', 'BIA_Y'), ('${ADM}', '${EMP}', '${S1}', null, 'super_admin', 'ADM'),
      ('${LIDER}', '${EMP}', '${S1}', null, 'lider', 'LIDER');
    insert into public.mestre_lotes values ('${LOTE}', '${EMP}', '2026-10-01', 'vigente');
    insert into public.mestre_grupos values ('${EMP}', '25', 'COB PLAY 1', '${S1}', 'vinculado');
    insert into public.mestre_equipes values ('${EMP}', '25', 'EQUIPE UM', '${EQ1}', '2026-10-20');
    insert into public.analitico_recebimentos (empresa_id, operador_id, setor_id, valor_recebido, total_ho, data_pagamento, mes_referencia)
      values ('${EMP}', '${ANA}', '${S1}', 100, 0, '2026-10-05', '2026-10-01');
    -- Card anterior à migration: operador, sem alvo.
    insert into public.analitico_ajustes_manuais (empresa_id, operador_id, setor_id, equipe_id, mes_referencia, valor, motivo, criado_por)
      values ('${EMP}', '${ANA}', '${S1}', '${EQ1}', '2026-10-01', 300, 'antigo', '${LIDER}');
  `);
  const arquivo = readdirSync('supabase/migrations').find(n => n.endsWith('_ajuste_recebimento_equipe_setor_em_todo_lugar.sql'))!;
  const sql = readFileSync(`supabase/migrations/${arquivo}`, 'utf8');
  const semRemendos = sql.slice(0, sql.indexOf('-- ── 5. Remendos')) + sql.slice(sql.indexOf('-- ── 6. Recebido por setor'));
  await db.exec(semRemendos);
  // O card antigo: todos os eventos em 10/10.
  const [antigo] = await q<{ id: string }>(`select id from public.analitico_ajustes_manuais where motivo = 'antigo'`);
  await noDia(antigo.id, '2026-10-10');
}, 60000);
afterAll(async () => { await db?.close(); });

const ajustes = (ini: string, fim: string) => q<{ alvo: string; dia: string; valor: string; valor_ho: string; setor_id: string }>(
  `select alvo, dia::text, valor::text, valor_ho::text, setor_id::text from public.fn_ajustes_recebimento(array['${EMP}'::uuid], $1, $2) order by alvo, dia`,
  [ini, fim]);

describe('ajuste de recebimento em todo lugar', { concurrent: false }, () => {
  it('o card antigo vira alvo operador e cai no dia em que foi lançado', async () => {
    expect(await ajustes('2026-10-01', '2026-10-31')).toEqual([
      expect.objectContaining({ alvo: 'operador', dia: '2026-10-10', valor: '300' }),
    ]);
    expect(await ajustes('2026-10-11', '2026-10-31')).toEqual([]);
  });

  it('equipe herda o setor da equipe; setor exige setor; um card por alvo', async () => {
    const [eq] = await lancar('equipe', { equipe: EQ1 }, 500);
    const [linha] = await q<{ setor_id: string; operador_id: string | null }>(
      `select setor_id::text, operador_id from public.analitico_ajustes_manuais where id = $1`, [(eq as { id: string }).id]);
    expect(linha).toEqual({ setor_id: S1, operador_id: null });
    await noDia((eq as { id: string }).id, '2026-10-12');
    await expect(lancar('equipe', { equipe: EQ1 }, 10)).rejects.toThrow(/ux_ajuste_card_por_equipe_mes/);
    await expect(lancar('setor', {}, 10)).rejects.toThrow(/escolha o setor/);
    await expect(lancar('operador', {}, 10)).rejects.toThrow(/ajuste_alvo_valido/);
    const [st] = await lancar('setor', { setor: S1 }, 200);
    await noDia((st as { id: string }).id, '2026-10-15');
  });

  it('alteração cai no dia dela; a soma do mês é o valor do card; cancelado zera', async () => {
    const [b] = await lancar('operador', { operador: BIA, setor: ALT }, 1000) as { id: string }[];
    await noDia(b.id, '2026-10-03');
    await q(`update public.analitico_ajustes_manuais set valor = 1500 where id = $1`, [b.id]);
    await q(`update public.analitico_ajustes_eventos set criado_em = '2026-10-20 15:00-03' where ajuste_id = $1 and tipo = 'atualizado'`, [b.id]);
    const bia = (await ajustes('2026-10-01', '2026-10-31')).filter(x => x.setor_id === ALT);
    expect(bia.map(x => [x.dia, x.valor])).toEqual([['2026-10-03', '1000'], ['2026-10-20', '500']]);
    await q(`update public.analitico_ajustes_manuais set cancelado = true where id = $1`, [b.id]);
    const soma = await q<{ v: string }>(`select coalesce(sum(valor),0)::text v from public.fn_ajustes_recebimento(array['${EMP}'::uuid], '2026-10-01', '2026-10-31') where setor_id = '${ALT}'`);
    expect(Number(soma[0].v)).toBe(0);
  });

  it('o que os eventos não explicam fica no dia 1; super_admin não conta; Cofen tem H.O.', async () => {
    const [c] = await lancar('setor', { setor: S2 }, 1000) as { id: string }[];
    await q(`delete from public.analitico_ajustes_eventos where ajuste_id = $1`, [c.id]);
    const [a] = await lancar('operador', { operador: ADM, setor: S1 }, 999) as { id: string }[];
    await noDia(a.id, '2026-10-04');
    const cofen = (await ajustes('2026-10-01', '2026-10-31')).filter(x => x.setor_id === S2);
    expect(cofen).toEqual([expect.objectContaining({ dia: '2026-10-01', valor: '1000', valor_ho: '249.60' })]);
    expect((await ajustes('2026-10-04', '2026-10-04'))).toEqual([]);
  });

  it('a janela de chegada só pega o que foi lançado nela', async () => {
    const r = await q<{ n: number }>(`select count(*)::int n from public.fn_ajustes_recebimento(array['${EMP}'::uuid], '2026-10-01', '2026-10-31',
      '2026-10-12 00:00-03', '2026-10-13 00:00-03')`);
    expect(r[0].n).toBe(1); // o de equipe, lançado em 12/10
  });

  it('fn_recebido_por_setor soma pessoa, equipe e setor — sem contar como pagamento', async () => {
    const r = await q<{ setor_id: string; total: string; qtd: string }>(
      `select setor_id::text, total::text, qtd::text from public.fn_recebido_por_setor(array['${EMP}'::uuid], '2026-10', '2026-10-01', '2026-10-31', null, null) order by setor_id`);
    const s1 = r.find(x => x.setor_id === S1)!;
    // 100 do analítico + 300 (Ana) + 500 (equipe) + 200 (setor)
    expect(Number(s1.total)).toBe(1100);
    expect(Number(s1.qtd)).toBe(1);
    expect(Number(r.find(x => x.setor_id === S2)!.total)).toBe(1000);
  });

  it('no dia, o setor só leva o ajuste lançado no dia', async () => {
    const r = await q<{ total: string }>(
      `select total::text from public.fn_recebido_por_setor(array['${EMP}'::uuid], '2026-10', '2026-10-15', '2026-10-15', null, null) where setor_id = '${S1}'`);
    expect(Number(r[0].total)).toBe(200);
  });

  it('o 59 do Painel Diretoria ganha a linha do ajuste na carteira do setor, e a pseudo-carteira sem vínculo', async () => {
    await lancar('setor', { setor: S3 }, 70).then(async ([x]) => noDia((x as { id: string }).id, '2026-10-08'));
    const r = await q<{ cod_grupo_filtro: string; subgrupo_equipe: string; tp_doc: string; recebido: string; dt_pgto: string; cobradora: string }>(
      `select cod_grupo_filtro, subgrupo_equipe, tp_doc, recebido::text, dt_pgto::text, cobradora
         from private.mestre_recebimentos_com_ajuste
        where lote_id = '${LOTE}' and cobradora <> 'BIA_Y' order by dt_pgto, recebido`);
    expect(r).toEqual([
      // Setor Cofen sem carteira no 59, card sem histórico: dia 1, pseudo-carteira.
      { cod_grupo_filtro: 'AJUSTE', subgrupo_equipe: '', tp_doc: 'AJUSTE MANUAL', recebido: '1000', dt_pgto: '2026-10-01', cobradora: '' },
      { cod_grupo_filtro: 'AJUSTE', subgrupo_equipe: '', tp_doc: 'AJUSTE MANUAL', recebido: '70', dt_pgto: '2026-10-08', cobradora: '' },
      { cod_grupo_filtro: '25', subgrupo_equipe: 'EQUIPE UM', tp_doc: 'AJUSTE MANUAL', recebido: '300', dt_pgto: '2026-10-10', cobradora: 'ANA_X' },
      { cod_grupo_filtro: '25', subgrupo_equipe: 'EQUIPE UM', tp_doc: 'AJUSTE MANUAL', recebido: '500', dt_pgto: '2026-10-12', cobradora: '' },
      { cod_grupo_filtro: '25', subgrupo_equipe: '', tp_doc: 'AJUSTE MANUAL', recebido: '200', dt_pgto: '2026-10-15', cobradora: '' },
    ]);
  });

  it('o remendo troca o número exato de ocorrências, ou não aplica nada', async () => {
    const sql = readFileSync(`supabase/migrations/${readdirSync('supabase/migrations').find(n => n.endsWith('_ajuste_recebimento_equipe_setor_em_todo_lugar.sql'))!}`, 'utf8');
    const criar = sql.slice(sql.indexOf('CREATE FUNCTION pg_temp.remendar'), sql.indexOf('-- 5a.'));
    await db.exec(`create function public.fn_alvo_teste() returns text language sql as $$ select 'from mestre_recebimentos r' $$;`);
    await db.exec(criar);
    await db.exec(`select pg_temp.remendar('public.fn_alvo_teste()'::regprocedure, '\\m(from)(\\s+)mestre_recebimentos(\\s+)r\\M', '\\1\\2private.x\\3r', 1)`);
    expect((await q<{ r: string }>(`select public.fn_alvo_teste() r`))[0].r).toBe('from private.x r');
    await expect(db.exec(`select pg_temp.remendar('public.fn_alvo_teste()'::regprocedure, 'nao existe', 'x', 1)`))
      .rejects.toThrow(/esperava 1 ocorrência/);
  });
});

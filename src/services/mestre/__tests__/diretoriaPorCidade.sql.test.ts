// @vitest-environment node
/**
 * diretoriaPorCidade.sql.test.ts — as migrations 20261003170000 e
 * 20261004120000 num Postgres de verdade (PGlite), sobre as definições de
 * produção do 59.
 *
 * O que não pode acontecer numa tela de diretoria é um número plausível e
 * errado. Por isso o teste amarra as leituras novas às que já existem:
 *
 *   - o geral é o total da Visão geral de sempre MENOS o que não conta
 *     (carteira sem cidade, ou com regra Cofen — o Cofen vem da conciliação);
 *     as cidades fecham o geral;
 *   - o dia de cada setor é o mesmo dia da série do detalhe do setor (a aba
 *     Setores e equipes) — mesma atribuição, colchão fora, Integral no destino;
 *   - o dia do geral é o dia da série da Visão geral, e o de cada cidade é o
 *     dia da série da cidade;
 *   - a carteira Cofen sai da conciliação (centavos → reais, pela `data`) e os
 *     operadores do Analítico;
 *   - classificar carteira: só o super admin, e a carteira com setor segue o setor.
 *
 * Os dados são os do teste de desempenho (20260917160000): colchão dentro e
 * fora da janela de agosto, equipe movida, «somente geral», Integral e Extra
 * cobrados para outra carteira, carteira sem vínculo e carteira sem cadastro.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const raiz = resolve(__dirname, '../../../../supabase/migrations');
const DESEMPENHO = readFileSync(resolve(raiz, '20260917160000_painel_diretoria_59_desempenho.sql'), 'utf8');
const CIDADES = readFileSync(resolve(raiz, '20261003170000_diretoria_por_cidade_e_dia.sql'), 'utf8');
const CARTEIRAS = readFileSync(resolve(raiz, '20261004120000_diretoria_carteiras_e_cofen.sql'), 'utf8');
const META_COFEN = readFileSync(resolve(raiz, '20261004180000_diretoria_cofen_meta.sql'), 'utf8');
const PRODUCAO = readFileSync(resolve(__dirname, 'fixtures/diretoria59_producao_20260917.sql'), 'utf8');

const E  = '00000000-0000-4000-8000-00000000e001';
const PP = '00000000-0000-4000-8000-00000000e002';
const S1 = '00000000-0000-4000-8000-0000000005a1';
const S2 = '00000000-0000-4000-8000-0000000005a2';
const S3 = '00000000-0000-4000-8000-0000000005a3';
const S4 = '00000000-0000-4000-8000-0000000005a4';
const CONECTA = '00000000-0000-4000-8000-0000000005c1';
const BIRIGUI = '00000000-0000-4000-8000-00000000c1d1';
const MARILIA = '00000000-0000-4000-8000-00000000c1d2';
const MARILIA_PP = '00000000-0000-4000-8000-00000000c1d9';
const OP_PP1 = '00000000-0000-4000-8000-0000000000f1';
const OP_PP2 = '00000000-0000-4000-8000-0000000000f2';
const MESES = ['2026-08', '2026-09'];
const CORTES: (number | null)[] = [null, 10, 31];

let db: PGlite;

type J = Record<string, unknown>;
const num = (v: unknown) => Number(v) || 0;

async function jsonb(sql: string, params: unknown[] = []): Promise<J> {
  const r = await db.query<{ j: J }>(sql, params);
  return r.rows[0]?.j as J;
}

async function permissao(superAdmin: boolean, temChave: boolean) {
  await db.query('update public.teste_portao set super = $1, tem = $2', [superAdmin, temChave]);
}

/** O que a Visão geral de sempre soma e a nova deixa de fora, por carteira. */
async function foraDaConta(mes: string, corte: number | null): Promise<number> {
  const nova = await jsonb('select public.fn_mestre_diretoria_cidades($1, $2, $3) as j', [E, mes, corte]);
  return num((nova.nao_conta as J).valor);
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;

    -- O portão é controlado pelo teste.
    create table public.teste_portao (super boolean not null, tem boolean not null);
    insert into public.teste_portao values (true, false);
    create function public.fn_user_is_super_admin() returns boolean language sql stable
      as $$ select super from public.teste_portao $$;
    create function public.fn_user_tem(text) returns boolean language sql stable
      as $$ select tem from public.teste_portao $$;
    create function public.fn_can_access_empresa(uuid) returns boolean language sql stable as $$ select true $$;

    create table public.empresas (id uuid primary key, slug text);
    create table public.rh_celulas (id uuid primary key, empresa_id uuid not null, nome text,
      constraint rh_celulas_id_empresa_key unique (id, empresa_id));
    create table public.setores (id uuid primary key, empresa_id uuid, nome text, foto_url text,
      alternativo boolean default false, ativo boolean default true, cidade_id uuid, regra text);
    create table public.equipes (id uuid primary key, empresa_id uuid, setor_id uuid, nome text);
    create table public.perfis (id uuid primary key, empresa_id uuid, nome text, foto_url text,
      setor_id uuid, perfil text);
    create table public.equipe_lideres (equipe_id uuid, lider_id uuid, empresa_id uuid, criado_em timestamptz);
    create table public.composicao_mes (empresa_id uuid, mes text, operador_id uuid, nome text, equipe_id uuid);
    create table public.composicao_mes_setor (empresa_id uuid, mes text, setor_id uuid, nome text);

    create table public.mestre_lotes (id uuid primary key, empresa_id uuid, mes date, estado text);
    create unique index mestre_lotes_um_vigente_por_mes on public.mestre_lotes (empresa_id, mes)
      where estado = 'vigente';
    create table public.mestre_recebimentos (
      id bigint generated always as identity primary key,
      lote_id uuid not null, empresa_id uuid not null, mes date not null,
      setor text not null default '', cod_grupo_filtro text not null,
      nome_grupo_filtro text not null default '', cobradora text not null default '',
      subgrupo_equipe text not null default '', cliente text not null default '',
      titulo text not null default '', nr_documento text not null default '',
      tp_doc text not null default '', colchao boolean not null default false,
      tipo text not null default '', dt_pgto date not null,
      recebido numeric(12,2) not null default 0,
      operador_id uuid, operador_setor_id uuid
    );
    create index mestre_recebimentos_lote on public.mestre_recebimentos (lote_id);
    create table public.mestre_grupos (empresa_id uuid not null, cod_grupo_filtro text, nome_grupo_filtro text,
      setor_id uuid, estado text, primeira_aparicao date, ultima_aparicao date);
    create table public.mestre_equipes (empresa_id uuid, cod_grupo_filtro text, nome_subgrupo text,
      destino text, destino_setor_id uuid, equipe_id uuid);

    create table public.analitico_recebimentos (empresa_id uuid, mes_referencia date, setor_id uuid,
      data_pagamento date, operador_usuario text, operador_id uuid, codigo text,
      valor_recebido numeric(12,2), total_ho numeric(12,2) not null default 0, procedencia text);
    create table public.analitico_removidos (id bigint generated always as identity, lote_id uuid,
      empresa_id uuid, setor_id uuid, mes_referencia date, valor_recebido numeric(12,2),
      removido_em timestamptz, restaurado_em timestamptz);
    create table public.logs_sistema (id bigint generated always as identity, empresa_id uuid,
      criado_em timestamptz default now(), alvo_tipo text);

    create table public.metas (empresa_id uuid, tipo text, referencia_id uuid, mes integer, ano integer,
      meta_valor numeric(14,2));

    -- O 945 de conciliação da PaguePlay (20260911222903), em centavos.
    create table public.pp_relatorio_conciliacoes (empresa_id uuid not null, id_baixa text not null,
      data date not null, data_pagamento date not null, uf text, acordo text, parcela text,
      forma text not null, ia text, total bigint not null, coren bigint not null, cofen bigint not null,
      pp bigint not null, primary key (empresa_id, id_baixa));

    create function public.fn_mestre_setor_resolvido(p_setor_do_grupo uuid, p_destino text,
      p_destino_setor_id uuid) returns uuid language sql immutable parallel safe as $f$
      select case coalesce(p_destino, 'proprio')
               when 'outro_setor'   then p_destino_setor_id
               when 'somente_geral' then null::uuid
               else p_setor_do_grupo
             end;
    $f$;
    create function public.fn_mestre_operadores_do_mes(uuid, text, integer) returns integer language sql as $$ select 1 $$;
    create function public.fn_mestre_equipes_sugeridas(uuid, text, numeric) returns integer language sql as $$ select 1 $$;
    create function public.fn_importacoes_historico(uuid, text, text, integer) returns integer language sql as $$ select 1 $$;
    create function public.fn_mestre_fontes_dos_setores(uuid, text) returns integer language sql as $$ select 1 $$;
    create function public.fn_mestre_comparar_setores(uuid, text) returns integer language sql as $$ select 1 $$;

    -- O catálogo de permissões, do jeito que a migration o encontra.
    create table public.cargos (slug text primary key, acesso_total boolean not null default false);
    insert into public.cargos values ('operador', false), ('diretoria', false), ('administrador', true), ('super_admin', true);
    create table public.cargos_permissoes (empresa_id uuid, cargo text, permissoes jsonb not null default '{}');
    create function public.fn_permissoes_catalogo()
      returns table(chave text, tenants text[], padrao text[], explicita boolean)
      language sql immutable as $$
        select * from (values ('ver_painel_diretoria', array['bookplay']::text[], array['diretoria']::text[], false))
          as c(chave, tenants, padrao, explicita) $$;
  `);

  await db.exec(PRODUCAO);
  await db.exec(DESEMPENHO);

  await db.exec(`
    select setseed(0.17);

    insert into public.empresas values ('${E}', 'bookplay'), ('${PP}', 'pagueplay');
    insert into public.rh_celulas values ('${BIRIGUI}', '${E}', 'Birigui'), ('${MARILIA}', '${E}', 'Marília'),
      ('${MARILIA_PP}', '${PP}', 'Marília');
    insert into public.setores (id, empresa_id, nome, foto_url, cidade_id, regra) values
      ('${S1}', '${E}', 'Setor Um', 's1.png', '${BIRIGUI}', 'nosso_produto'),
      ('${S2}', '${E}', 'Setor Dois', null, '${BIRIGUI}', 'nosso_produto'),
      ('${S3}', '${E}', 'Setor Tres', null, '${MARILIA}', 'nosso_produto'),
      ('${S4}', '${E}', 'Setor Quatro', null, '${MARILIA}', 'nosso_produto'),
      ('${CONECTA}', '${PP}', 'Conecta Play', null, '${MARILIA_PP}', 'cofen');
    insert into public.cargos_permissoes values ('${E}', 'operador', '{}'), ('${E}', 'diretoria', '{}');
    insert into public.composicao_mes_setor values ('${E}', '2026-09', '${S1}', 'Setor Um em setembro');
    insert into public.equipes values
      ('00000000-0000-4000-8000-0000000000d1', '${E}', '${S1}', 'Equipe Alfa'),
      ('00000000-0000-4000-8000-0000000000d2', '${E}', '${S2}', 'Equipe Beta'),
      ('00000000-0000-4000-8000-0000000000d3', '${E}', '${S3}', 'Equipe Gama');
    insert into public.perfis values
      ('00000000-0000-4000-8000-0000000000b1', '${E}', 'Ana Paula', 'ana.png', '${S1}', 'operador'),
      ('00000000-0000-4000-8000-0000000000b2', '${E}', 'Beatriz',   null,      '${S2}', 'operador'),
      ('00000000-0000-4000-8000-0000000000b3', '${E}', 'Caio',      null,      '${S4}', 'operador'),
      ('${OP_PP1}', '${PP}', 'Paula Cofen', null, '${CONECTA}', 'operador'),
      ('${OP_PP2}', '${PP}', 'Rafa Cofen',  null, '${CONECTA}', 'operador'),
      ('00000000-0000-4000-8000-0000000000f9', '${PP}', 'Dono', null, null, 'super_admin');
    insert into public.composicao_mes values
      ('${E}', '2026-09', '00000000-0000-4000-8000-0000000000b1', 'Ana Paula (set)', '00000000-0000-4000-8000-0000000000d1'),
      ('${PP}', '2026-09', '${OP_PP1}', 'Paula (set)', null);

    insert into public.mestre_lotes values
      ('00000000-0000-4000-8000-00000000a801', '${E}', '2026-08-01', 'vigente'),
      ('00000000-0000-4000-8000-00000000a802', '${E}', '2026-08-01', 'substituido'),
      ('00000000-0000-4000-8000-00000000a901', '${E}', '2026-09-01', 'vigente'),
      ('00000000-0000-4000-8000-00000000a902', '${E}', '2026-09-01', 'aberto');

    -- 101 e 102 em Birigui pelo setor; 103 em Marília pelo setor; 104 sem
    -- vínculo (o setor anotado não vale); 106 sem setor; 105 sem cadastro.
    insert into public.mestre_grupos values
      ('${E}', '101', 'CART A', '${S1}', 'vinculado', '2026-08-01', '2026-09-20'),
      ('${E}', '102', 'CART B', '${S2}', 'vinculado', '2026-08-01', '2026-09-20'),
      ('${E}', '103', 'CART C', '${S3}', 'vinculado', '2026-08-02', '2026-09-19'),
      ('${E}', '104', 'CART D', '${S4}', 'novo',      '2026-08-03', '2026-09-18'),
      ('${E}', '106', 'CART F', null,    'novo',      '2026-09-01', '2026-09-17');

    insert into public.mestre_equipes values
      ('${E}', '101', 'EQUIPE ALFA',   'proprio',       null,    '00000000-0000-4000-8000-0000000000d1'),
      ('${E}', '101', 'EQUIPE MOVIDA', 'outro_setor',   '${S3}', '00000000-0000-4000-8000-0000000000d3'),
      ('${E}', '102', 'RETENCAO',      'somente_geral', null,    null),
      ('${E}', '102', 'EQUIPE BETA',   null,            null,    '00000000-0000-4000-8000-0000000000d2'),
      ('${E}', '103', 'EQUIPE GAMA',   'proprio',       null,    null);

    with lotes(id, mes, n) as (values
      ('00000000-0000-4000-8000-00000000a801'::uuid, date '2026-08-01', 1400),
      ('00000000-0000-4000-8000-00000000a802'::uuid, date '2026-08-01', 300),
      ('00000000-0000-4000-8000-00000000a901'::uuid, date '2026-09-01', 1400),
      ('00000000-0000-4000-8000-00000000a902'::uuid, date '2026-09-01', 400)
    ),
    sorteio as (
      select l.id as lote_id, l.mes, g, x.k, x.c, x.s, x.t, x.d, x.tp, x.r1, x.r2
        from lotes l
        cross join lateral generate_series(1, l.n) g
        cross join lateral (
          select g as gg,
                 1 + floor(random() * 6)::int as k, 1 + floor(random() * 8)::int as c,
                 1 + floor(random() * 9)::int as s, 1 + floor(random() * 5)::int as t,
                 floor(random() * 30)::int as d, 1 + floor(random() * 5)::int as tp,
                 random() as r1, random() as r2
        ) x
    )
    insert into public.mestre_recebimentos (lote_id, empresa_id, mes, setor, cod_grupo_filtro,
      nome_grupo_filtro, cobradora, subgrupo_equipe, nr_documento, tp_doc, colchao, tipo, dt_pgto,
      recebido, operador_id, operador_setor_id)
    select s.lote_id, '${E}', s.mes,
           case when s.r1 < 0.12 then (array['CART A','CART B','CART C','CART D','CART E','CART F'])[s.k]
                                      || ' - ' || (array['CART B','CART C','CART A','CART A','CART B','CART C'])[s.k]
                when s.r1 < 0.16 then (array['CART A','CART B','CART C','CART D','CART E','CART F'])[s.k] || ' - NINGUEM'
                else 'COB ' || (array['CART A','CART B','CART C','CART D','CART E','CART F'])[s.k] end,
           (array['101','102','103','104','105','106'])[s.k],
           case when s.r2 < 0.03 then '' else (array['CART A','CART B','CART C','CART D','CART E','CART F'])[s.k] end,
           (array['ANA','BIA','CAIO','DUDA','EDU','FABI','','GIL'])[s.c],
           (array['EQUIPE ALFA','EQUIPE MOVIDA','RETENCAO','EQUIPE BETA','EQUIPE GAMA',
                  'ATESTADOS|FERIAS','LIDERANÇA','','EQUIPE SOLTA'])[s.s],
           case when s.r2 < 0.05 then '' else 'NR' || (s.g % 450) end,
           (array['BOLETO',' PIX ','','CARTAO','Cartão Recorrente'])[s.tp],
           random() < 0.12,
           (array['Integral','Extra','INTEGRAL','EXTRA',''])[s.t],
           s.mes + least(s.d, 29),
           ((1000 + s.g * 13 + floor(random() * 500000))::numeric / 100)::numeric(12,2),
           (array['00000000-0000-4000-8000-0000000000b1','00000000-0000-4000-8000-0000000000b2',
                  '00000000-0000-4000-8000-0000000000b3',null,null,null,null,null]::uuid[])[s.c],
           (array['${S1}','${S2}','${S4}',null,null,null,null,null]::uuid[])[s.c]
      from sorteio s;

    -- A conciliação de agosto e setembro: o H.O. (pp) e o repasse nas colunas.
    insert into public.pp_relatorio_conciliacoes
    select '${PP}', to_char(m, 'YYYYMM') || g, m + (g % 30), m + (g % 30) - 3, 'SP', 'A' || g, '1',
           (array['Pix','Cartão Padrão','Boleto'])[1 + g % 3], '',
           t, (t * 0.58)::bigint, (t * 0.19)::bigint, t - (t * 0.58)::bigint - (t * 0.19)::bigint
      from (values (date '2026-08-01'), (date '2026-09-01')) mm(m)
      cross join lateral generate_series(1, 400) g
      cross join lateral (select (5000 + floor(random() * 200000))::bigint as t) v;

    -- O Analítico da PaguePlay: dois operadores, uma linha sem operador e uma
    -- do super_admin (fora do ranking).
    insert into public.analitico_recebimentos (empresa_id, mes_referencia, setor_id, data_pagamento,
      operador_usuario, operador_id, codigo, valor_recebido, total_ho, procedencia)
    select '${PP}', date '2026-09-01', null, date '2026-09-01' + (g % 28),
           'u' || (g % 2), (array['${OP_PP1}','${OP_PP2}']::uuid[])[1 + g % 2], 'C' || g,
           (100 + g)::numeric(12,2), ((100 + g) * 0.226)::numeric(12,2), 'relatorio'
      from generate_series(1, 120) g;
    insert into public.analitico_recebimentos (empresa_id, mes_referencia, setor_id, data_pagamento,
      operador_usuario, operador_id, codigo, valor_recebido, total_ho, procedencia) values
      ('${PP}', '2026-09-01', null, '2026-09-05', 'orfao', null, 'X1', 999, 200, 'relatorio'),
      ('${PP}', '2026-09-01', null, '2026-09-05', 'dono', '00000000-0000-4000-8000-0000000000f9', 'X2', 888, 100, 'relatorio');
  `);

  await db.exec(CIDADES);
  await db.exec(CARTEIRAS);
  await db.exec(META_COFEN);
  await db.query("insert into public.metas values ($1, 'setor', $2, 9, 2026, 354000), ($1, 'setor', $2, 8, 2026, 0)", [PP, CONECTA]);
}, 120_000);

describe('o mês: só conta o que tem cidade e é Nosso produto', () => {
  it.each(MESES.flatMap(m => CORTES.map(c => [m, c] as const)))('%s, corte %s', async (mes, corte) => {
    const velha = await jsonb('select public.fn_mestre_diretoria_visao_geral($1, $2, $3) as j', [E, mes, corte]);
    const nova = await jsonb('select public.fn_mestre_diretoria_cidades($1, $2, $3) as j', [E, mes, corte]);
    const total = num((velha.total as J).recebido);
    const geral = nova.geral as J;
    const cidades = nova.cidades as J[];
    const fora = await foraDaConta(mes, corte);

    // O geral é o total de sempre menos o que não conta, centavo por centavo.
    expect(fora).toBeGreaterThan(0);
    expect(num(geral.valor) + fora).toBeCloseTo(total, 2);
    // E as cidades fecham o geral.
    expect(cidades.reduce((a, c) => a + num(c.valor), 0)).toBeCloseTo(num(geral.valor), 2);
    expect(cidades.every(c => c.cidade_id !== null)).toBe(true);

    // O que não conta é exatamente a soma das carteiras marcadas assim.
    const carteiras = nova.carteiras as J[];
    expect(carteiras.filter(k => k.conta !== true).reduce((a, k) => a + num(k.valor), 0)).toBeCloseTo(fora, 2);
    expect(carteiras.filter(k => k.conta === true).reduce((a, k) => a + num(k.valor), 0)).toBeCloseTo(num(geral.valor), 2);

    // A série e as formas somam o geral; cada cidade, a cidade.
    expect((geral.serie as J[]).reduce((a, d) => a + num(d.valor), 0)).toBeCloseTo(num(geral.valor), 2);
    expect((geral.formas as J[]).reduce((a, f) => a + num(f.valor), 0)).toBeCloseTo(num(geral.valor), 2);
    for (const c of cidades) {
      expect((c.serie as J[]).reduce((a, d) => a + num(d.valor), 0)).toBeCloseTo(num(c.valor), 2);
      expect((c.formas as J[]).reduce((a, f) => a + num(f.valor), 0)).toBeCloseTo(num(c.valor), 2);
    }
    expect(num(geral.valor_anterior)).toBeLessThanOrEqual(num((velha.total_anterior as J).recebido) + 0.001);
  });

  it('a cidade vem do setor vinculado; sem cidade, não conta e diz por quê', async () => {
    const nova = await jsonb('select public.fn_mestre_diretoria_cidades($1, $2, null) as j', [E, '2026-09']);
    const k = new Map((nova.carteiras as J[]).map(c => [c.cod as string, c]));
    expect(k.get('101')?.cidade_id).toBe(BIRIGUI);
    expect(k.get('103')?.cidade_id).toBe(MARILIA);
    for (const cod of ['101', '102', '103']) expect(k.get(cod)?.conta).toBe(true);
    // 104 anota um setor, mas não está vinculada: o setor não empresta a cidade.
    expect(k.get('104')?.conta).toBe(false);
    expect(k.get('104')?.motivo).toBe('sem_cidade');
    expect(k.get('105')?.motivo).toBe('sem_cidade');
  });

  it('setor sem cidade: as carteiras dele não contam', async () => {
    await db.query('update public.setores set cidade_id = null where id = $1', [S2]);
    try {
      const nova = await jsonb('select public.fn_mestre_diretoria_cidades($1, $2, null) as j', [E, '2026-09']);
      const k102 = (nova.carteiras as J[]).find(c => c.cod === '102') as J;
      expect(k102.conta).toBe(false);
      expect(k102.motivo).toBe('setor_sem_cidade');
    } finally {
      await db.query('update public.setores set cidade_id = $2 where id = $1', [S2, BIRIGUI]);
    }
  });
});

describe('um dia', () => {
  it('cada setor no dia é o dia da série do detalhe do setor', async () => {
    for (const setor of [S1, S2, S3]) {
      const detalhe = await jsonb('select public.fn_mestre_diretoria_setor($1, $2, $3, null, null) as j', [E, '2026-09', setor]);
      for (const dia of [3, 11, 22]) {
        const resumo = await jsonb('select public.fn_mestre_diretoria_dia($1, $2, $3, null, null) as j', [E, '2026-09', dia]);
        const unidade = (resumo.unidades as J[]).find(u => u.setor_id === setor);
        const esperado = num(((detalhe.serie as J[]).find(d => num(d.dia) === dia) ?? {}).valor);
        expect(num(unidade?.valor)).toBeCloseTo(esperado, 2);
      }
    }
  });

  it('o total do dia é o dia da série — no geral e em cada cidade', async () => {
    const mes = await jsonb('select public.fn_mestre_diretoria_cidades($1, $2, null) as j', [E, '2026-09']);
    for (const dia of [1, 9, 17, 29]) {
      const geral = await jsonb('select public.fn_mestre_diretoria_dia($1, $2, $3, null, null) as j', [E, '2026-09', dia]);
      const serieGeral = ((mes.geral as J).serie as J[]).find(d => num(d.dia) === dia) as J;
      expect(num((geral.total as J).valor)).toBeCloseTo(num(serieGeral.valor), 2);
      expect(num(geral.mesmo_dia_anterior)).toBeCloseTo(num(serieGeral.valor_anterior), 2);
      expect((geral.formas as J[]).reduce((a, f) => a + num(f.valor), 0)).toBeCloseTo(num((geral.total as J).valor), 2);

      for (const c of mes.cidades as J[]) {
        const r = await jsonb('select public.fn_mestre_diretoria_dia($1, $2, $3, $4, null) as j', [E, '2026-09', dia, c.cidade_id]);
        const serie = (c.serie as J[]).find(d => num(d.dia) === dia) as J;
        expect(num((r.total as J).valor)).toBeCloseTo(num(serie.valor), 2);
      }
    }
  });

  it('nenhuma unidade sem cidade aparece no dia', async () => {
    const r = await jsonb('select public.fn_mestre_diretoria_dia($1, $2, $3, null, null) as j', [E, '2026-09', 12]);
    for (const u of r.unidades as J[]) expect(u.cidade_id).not.toBeNull();
  });

  it('com uma cidade, só aparecem setores e carteiras dela', async () => {
    const r = await jsonb('select public.fn_mestre_diretoria_dia($1, $2, $3, $4, null) as j', [E, '2026-09', 12, MARILIA]);
    const unidades = r.unidades as J[];
    expect(unidades.length).toBeGreaterThan(0);
    for (const u of unidades) expect(u.cidade_id).toBe(MARILIA);
    expect(unidades.some(u => u.setor_id === S1)).toBe(false);
  });

  it('o destaque do dia tem nome e valor dentro do setor', async () => {
    const r = await jsonb('select public.fn_mestre_diretoria_dia($1, $2, $3, null, null) as j', [E, '2026-09', 12]);
    const um = (r.unidades as J[]).find(u => u.setor_id === S1) as J;
    const d = um.destaque as J;
    expect(typeof d.nome).toBe('string');
    expect(num(d.valor)).toBeGreaterThan(0);
    expect(num(d.valor)).toBeLessThanOrEqual(num(um.valor) + 0.001);
  });

  it('recusa dia fora do mês e escopo inventado', async () => {
    await expect(db.query('select public.fn_mestre_diretoria_dia($1, $2, 31, null, null)', [E, '2026-09'])).rejects.toThrow(/dia invalido/);
    await expect(db.query("select public.fn_mestre_diretoria_dia($1, $2, 3, 'birigui', null)", [E, '2026-09'])).rejects.toThrow(/escopo invalido/);
  });
});

describe('a carteira Cofen vem da conciliação e do Analítico', () => {
  const somaConc = async (mes: string, corte: number, col: string) => num((await db.query<{ v: string }>(
    `select coalesce(sum(${col}), 0) / 100.0 as v from public.pp_relatorio_conciliacoes
      where empresa_id = $1 and data >= $2::date and data < ($2::date + interval '1 month')
        and extract(day from data) <= $3`, [PP, `${mes}-01`, corte])).rows[0].v);

  it.each([[null], [10], [30]] as const)('o mês, corte %s: bruto, H.O. e repasse das colunas do relatório', async corte => {
    const c = await jsonb('select public.fn_diretoria_cofen($1, $2, $3) as j', [E, '2026-09', corte]);
    expect(c.disponivel).toBe(true);
    expect(c.setor_id).toBe(CONECTA);
    expect(c.cidade_nome).toBe('Marília');
    expect(c.conta).toBe(true);
    const corteEfetivo = num(c.dia_corte);
    const m = c.mes as J;
    expect(num(m.bruto)).toBeCloseTo(await somaConc('2026-09', corteEfetivo, 'total'), 2);
    expect(num(m.ho)).toBeCloseTo(await somaConc('2026-09', corteEfetivo, 'pp'), 2);
    expect(num(m.ho) + num(m.coren) + num(m.cofen)).toBeCloseTo(num(m.bruto), 2);

    const serie = c.serie as J[];
    expect(serie).toHaveLength(30);
    expect(serie.reduce((a, d) => a + num(d.bruto), 0)).toBeCloseTo(num(m.bruto), 2);
    expect(serie.reduce((a, d) => a + num(d.ho), 0)).toBeCloseTo(num(m.ho), 2);
    expect((c.formas as J[]).reduce((a, f) => a + num(f.ho), 0)).toBeCloseTo(num(m.ho), 2);
    expect((c.formas_dia as J[]).reduce((a, f) => a + num(f.bruto), 0)).toBeCloseTo(num(m.bruto), 2);

    // O mesmo corte em agosto, para a comparação.
    const ant = c.anterior as J;
    expect(num(ant.bruto_ate_corte)).toBeCloseTo(await somaConc('2026-08', corteEfetivo, 'total'), 2);
    expect(num(ant.ho_mes)).toBeCloseTo(await somaConc('2026-08', 31, 'pp'), 2);
  });

  it('os operadores: do Analítico, com nome do mês, sem órfão nem super_admin', async () => {
    const c = await jsonb('select public.fn_diretoria_cofen($1, $2, null) as j', [E, '2026-09']);
    const ops = c.operadores as J;
    const lista = ops.lista as J[];
    expect(num(ops.quantidade)).toBe(2);
    expect(lista.map(o => o.nome).sort()).toEqual(['Paula (set)', 'Rafa Cofen']);
    const esperado = num((await db.query<{ v: string }>(
      'select sum(valor_recebido) v from public.analitico_recebimentos where empresa_id = $1 and operador_id in ($2, $3)',
      [PP, OP_PP1, OP_PP2])).rows[0].v);
    expect(lista.reduce((a, o) => a + num(o.bruto), 0)).toBeCloseTo(esperado, 2);
    // O destaque de cada dia é de quem mais recebeu nele.
    const dia5 = (c.serie as J[]).find(d => num(d.dia) === 5) as J;
    expect(num(dia5.operadores)).toBeGreaterThan(0);
    expect((dia5.destaque as J).nome).toBeTruthy();
  });

  it('a meta do setor Cofen vem cadastrada da PaguePlay; sem meta (ou zero), nula', async () => {
    const set = await jsonb('select public.fn_diretoria_cofen($1, $2, null) as j', [E, '2026-09']);
    expect(num(set.meta)).toBe(354000);
    const ago = await jsonb('select public.fn_diretoria_cofen($1, $2, null) as j', [E, '2026-08']);
    expect(ago.meta).toBeNull();
  });

  it('setor Cofen sem cidade: avisa e não conta', async () => {
    await db.query('update public.setores set cidade_id = null where id = $1', [CONECTA]);
    try {
      const c = await jsonb('select public.fn_diretoria_cofen($1, $2, null) as j', [E, '2026-09']);
      expect(c.conta).toBe(false);
      expect(String(c.aviso)).toMatch(/sem cidade/);
    } finally {
      await db.query('update public.setores set cidade_id = $2 where id = $1', [CONECTA, MARILIA_PP]);
    }
  });

  it('dois setores Cofen: avisa em vez de repetir o total', async () => {
    await db.query("insert into public.setores (id, empresa_id, nome, regra) values ('00000000-0000-4000-8000-0000000005c2', $1, 'Outro Cofen', 'cofen')", [PP]);
    try {
      const c = await jsonb('select public.fn_diretoria_cofen($1, $2, null) as j', [E, '2026-09']);
      expect(c.disponivel).toBe(false);
      expect(String(c.aviso)).toMatch(/mais de um setor/);
    } finally {
      await db.query("delete from public.setores where id = '00000000-0000-4000-8000-0000000005c2'");
    }
  });

  it('a porta: sem a chave do painel e sem ser super_admin, recusa', async () => {
    await permissao(false, false);
    try {
      await expect(db.query('select public.fn_diretoria_cofen($1, $2, null)', [E, '2026-09'])).rejects.toThrow(/Sem acesso/);
      await permissao(false, true);
      await expect(db.query('select public.fn_diretoria_cofen($1, $2, null)', [E, '2026-09'])).resolves.toBeTruthy();
    } finally {
      await permissao(true, false);
    }
  });
});

describe('classificar carteira sem setor: só o super admin', () => {
  it('super admin grava; com cidade e Nosso produto, a carteira passa a contar', async () => {
    const antes = await jsonb('select public.fn_mestre_diretoria_cidades($1, $2, null) as j', [E, '2026-09']);
    const k106 = (antes.carteiras as J[]).find(c => c.cod === '106') as J;
    await db.query("select public.fn_mestre_carteira_classificar($1, '106', $2, 'nosso_produto')", [E, BIRIGUI]);
    const depois = await jsonb('select public.fn_mestre_diretoria_cidades($1, $2, null) as j', [E, '2026-09']);
    expect(num((depois.geral as J).valor)).toBeCloseTo(num((antes.geral as J).valor) + num(k106.valor), 2);
    expect(((depois.carteiras as J[]).find(c => c.cod === '106') as J).conta).toBe(true);
  });

  it('com regra Cofen, a carteira do 59 não conta: o Cofen vem da conciliação', async () => {
    await db.query("select public.fn_mestre_carteira_classificar($1, '104', $2, 'cofen')", [E, MARILIA]);
    const nova = await jsonb('select public.fn_mestre_diretoria_cidades($1, $2, null) as j', [E, '2026-09']);
    const k104 = (nova.carteiras as J[]).find(c => c.cod === '104') as J;
    expect(k104.cidade_id).toBe(MARILIA);
    expect(k104.conta).toBe(false);
    expect(k104.motivo).toBe('cofen');
  });

  it('quem tem chave de painel, mas não é super admin, não grava', async () => {
    await permissao(false, true);
    try {
      await expect(db.query("select public.fn_mestre_carteira_classificar($1, '106', $2, null)", [E, MARILIA]))
        .rejects.toThrow(/Só o super admin/);
    } finally {
      await permissao(true, false);
    }
  });

  it('carteira com setor segue o setor', async () => {
    await expect(db.query("select public.fn_mestre_carteira_classificar($1, '101', $2, null)", [E, MARILIA]))
      .rejects.toThrow(/segue a cidade e a regra do setor/);
  });

  it('cidade de outra empresa é recusada pelo banco', async () => {
    await expect(db.query("select public.fn_mestre_carteira_classificar($1, '106', $2, null)", [E, MARILIA_PP]))
      .rejects.toThrow();
  });
});

describe('o catálogo', () => {
  it('a chave de definir carteira saiu, sem partir a cadeia, e não sobrou em cargo nenhum', async () => {
    const chaves = (await db.query<{ chave: string }>('select chave from public.fn_permissoes_catalogo()')).rows.map(r => r.chave);
    expect(chaves).not.toContain('painel_diretoria_definir_carteira');
    expect(chaves).toContain('ver_painel_diretoria');
    const sobrou = (await db.query<{ n: number }>(
      "select count(*)::int n from public.cargos_permissoes where permissoes ? 'painel_diretoria_definir_carteira'",
    )).rows[0].n;
    expect(sobrou).toBe(0);
  });
});

// @vitest-environment node
/**
 * mestre59Diferenca.sql.test.ts — a migration 20261013180000 rodando num
 * Postgres de verdade (PGlite).
 *
 * A promoção por diferença decide, linha a linha, o que entra e o que sai do
 * retrato do 59, e troca metadados de dois lotes sem acionar os gatilhos duas
 * vezes. Erro aqui vira número errado no painel de toda a diretoria — por isso
 * roda com dados, não só com leitura do texto.
 *
 * Os gatilhos são os de produção (os da própria migration); o que fica de fora
 * é o motor do analítico, trocado por um registro de «quem foi chamado com
 * qual lote».
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const EMPRESA = '00000000-0000-4000-8000-000000000001';
const SETOR = '00000000-0000-4000-8000-0000000000d1';
const ANA = '00000000-0000-4000-8000-0000000000c1';

const MIGRATION = readFileSync(
  resolve(__dirname, '../../../supabase/migrations/20261013180000_mestre_59_grava_so_a_diferenca.sql'), 'utf8');

let db: PGlite;

interface Linha {
  cod_grupo_filtro: string; nome_grupo_filtro: string; cobradora: string; subgrupo_equipe: string;
  nr_documento: string; parcela: string; dt_pgto: string; recebido: number; linha_num: number;
}

const linha = (nr: string, recebido: number, over: Partial<Linha> = {}): Linha => ({
  cod_grupo_filtro: 'G1', nome_grupo_filtro: 'Carteira 1', cobradora: 'ana', subgrupo_equipe: 'Equipe A',
  nr_documento: nr, parcela: '1', dt_pgto: '2026-10-05', recebido, linha_num: 0, ...over,
});

async function abrirEEnviar(nome: string, hash: string, linhas: Linha[]): Promise<string> {
  const r = await db.query<{ id: string }>(
    `select fn_mestre_abrir_lote($1::uuid, '2026-10', $2, $3) as id`, [EMPRESA, nome, hash]);
  const id = r.rows[0].id;
  const comNum = linhas.map((l, i) => ({ ...l, linha_num: l.linha_num || i + 1 }));
  await db.query('select fn_mestre_inserir_linhas($1::uuid, $2::jsonb)', [id, JSON.stringify(comNum)]);
  return id;
}

/** O conteúdo do retrato vigente, sem id/lote/linha — o que a diferença preserva. */
async function retrato(): Promise<string[]> {
  const r = await db.query<{ k: string }>(`
    select nr_documento || '|' || parcela || '|' || cobradora || '|' || recebido::text || '|' || dt_pgto::text as k
      from mestre_recebimentos r join mestre_lotes l on l.id = r.lote_id and l.estado = 'vigente'
     order by 1`);
  return r.rows.map(x => x.k);
}

const esperado = (ls: Linha[]) => ls
  .map(l => `${l.nr_documento}|${l.parcela}|${l.cobradora}|${l.recebido.toFixed(2)}|${l.dt_pgto}`).sort();

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$ select '${ANA}'::uuid $$;
    create schema supabase_migrations;
    create table supabase_migrations.schema_migrations (version text primary key, name text, statements text[]);

    create function public.fn_user_is_super_admin() returns boolean language sql
      as $$ select coalesce(nullif(current_setting('teste.super', true), ''), 'sim') = 'sim' $$;
    create function public.fn_user_tem(p text) returns boolean language sql as $$ select false $$;

    create table public.perfis (id uuid primary key default gen_random_uuid(), empresa_id uuid,
      usuario text, setor_id uuid, ativo boolean default true);
    create table public.logs_sistema (id serial primary key, acao text, categoria text, severidade text,
      descricao text, empresa_id uuid, tabela text, alvo_tipo text, alvo_rotulo text, origem text,
      detalhes jsonb, criado_em timestamptz default now());
    create table public.notificacoes (id serial primary key, usuario_id uuid, titulo text, mensagem text,
      empresa_id uuid, rota text);

    create table public.mestre_lotes (
      id uuid primary key default gen_random_uuid(), empresa_id uuid not null, mes date not null,
      arquivo_nome text not null, arquivo_hash text not null, linhas integer not null default 0,
      total_recebido numeric(14,2) not null default 0, estado text not null default 'aberto'
        check (estado in ('aberto','vigente','substituido','descartado')),
      importado_por_id uuid, importado_em timestamptz not null default now(),
      promovido_em timestamptz, substituido_em timestamptz, substituido_por uuid references mestre_lotes(id));
    create unique index mestre_lotes_um_vigente_por_mes on public.mestre_lotes (empresa_id, mes) where estado = 'vigente';

    create table public.mestre_recebimentos (
      id bigint generated always as identity primary key,
      lote_id uuid not null references mestre_lotes(id) on delete cascade,
      empresa_id uuid not null, mes date not null,
      setor text not null default '', cod_grupo_filtro text not null, nome_grupo_filtro text not null default '',
      cod_grupo text not null default '', cod_grupo_representa text, setor_orig text,
      cobradora text not null default '', operador_orig text, subgrupo_equipe text not null default '',
      cliente text not null default '', cod_cli text not null default '', titulo text not null default '',
      nr_documento text not null default '', parcela text not null default '', empresa_erp text not null default '',
      tipo_venda text, tp_doc text not null default '', colchao boolean not null default false,
      tipo text not null default '', dt_lig date, prev_pgto date, dt_pgto date not null,
      dias integer, dias_atraso integer, dias_ligacao_baixa integer,
      recebido numeric(12,2) not null default 0, linha_num integer not null,
      operador_id uuid, operador_setor_id uuid);
    create index on public.mestre_recebimentos (lote_id);

    create table public.mestre_eventos (id serial primary key, empresa_id uuid, lote_id uuid references mestre_lotes(id),
      tipo text, cod_grupo_filtro text, rotulo text, detalhes jsonb, usuario_id uuid);
    create table public.mestre_grupos (empresa_id uuid, cod_grupo_filtro text, nome_grupo_filtro text,
      primeira_aparicao date, ultima_aparicao date, atualizado_em timestamptz default now(),
      primary key (empresa_id, cod_grupo_filtro));
    create table public.mestre_equipes (empresa_id uuid, cod_grupo_filtro text, nome_subgrupo text,
      primeira_aparicao date, ultima_aparicao date, atualizado_em timestamptz default now(),
      primary key (empresa_id, cod_grupo_filtro, nome_subgrupo));

    -- O motor do analítico, trocado por um registro de quem foi chamado e com qual lote.
    create table public.teste_sync (n serial, lote uuid, base uuid);
    create function public.fn_mestre_sincronizar_analitico_aplicar(p_empresa uuid, p_mes date, p_lote uuid)
      returns jsonb language plpgsql as $$
    begin
      insert into teste_sync (lote) values (p_lote);
      return jsonb_build_object('setores_sincronizados', 1, 'setores_pulados', 0, 'projetadas', 1,
        'inseridas', 1, 'alteradas', 0, 'removidas', 0, 'intactas', 0, 'valor_antes', 100, 'valor_depois', 150);
    end $$;

    -- A abertura, como em produção.
    create function public.fn_mestre_abrir_lote(p_empresa_id uuid, p_mes text, p_arquivo text, p_hash text)
      returns uuid language plpgsql as $$
    declare v_id uuid;
    begin
      insert into mestre_lotes (empresa_id, mes, arquivo_nome, arquivo_hash, importado_por_id)
      values (p_empresa_id, (p_mes || '-01')::date, p_arquivo, p_hash, auth.uid()) returning id into v_id;
      return v_id;
    end $$;

    -- A promoção completa de produção, reduzida ao que o invólucro exige dela:
    -- o lote novo vira o vigente, o antigo sai com as linhas. Gatilhos reais.
    create function public.fn_mestre_promover_lote(p_lote_id uuid) returns jsonb language plpgsql as $$
    declare v_ant uuid; v_emp uuid; v_mes date; v_n integer; v_t numeric;
    begin
      select empresa_id, mes into v_emp, v_mes from mestre_lotes where id = p_lote_id;
      select id into v_ant from mestre_lotes where empresa_id = v_emp and mes = v_mes and estado = 'vigente';
      select count(*), coalesce(sum(recebido), 0) into v_n, v_t from mestre_recebimentos where lote_id = p_lote_id;
      -- Como a de produção: o operador é congelado na promoção.
      update mestre_recebimentos r set operador_id = p.id, operador_setor_id = p.setor_id
        from perfis p where r.lote_id = p_lote_id and r.cobradora <> '' and p.empresa_id = r.empresa_id
         and lower(p.usuario) = lower(r.cobradora);
      if v_ant is not null then
        update mestre_lotes set estado = 'substituido', substituido_em = now(), substituido_por = p_lote_id where id = v_ant;
        delete from mestre_recebimentos where lote_id = v_ant;
      end if;
      update mestre_lotes set estado = 'vigente', promovido_em = now(), linhas = v_n, total_recebido = v_t where id = p_lote_id;
      return jsonb_build_object('lote_id', p_lote_id, 'linhas', v_n, 'total_recebido', v_t, 'substituiu', v_ant);
    end $$;
  `);

  await db.exec(MIGRATION);

  // Os gatilhos de produção, sobre a tabela de teste.
  await db.exec(`
    create trigger trg_mestre_aplicar_no_analitico after update of estado on public.mestre_lotes
      for each row execute function public.fn_mestre_sincronizar_analitico();
    create trigger trg_mestre_notificar_atualizacao after update of estado on public.mestre_lotes
      for each row execute function public.fn_mestre_notificar_atualizacao();
    insert into perfis (empresa_id, usuario, setor_id) values ('${EMPRESA}', 'Ana', '${SETOR}');
  `);
});

afterAll(async () => { await db.close(); });

beforeEach(async () => {
  await db.exec(`
    set teste.super = 'sim';
    delete from mestre_eventos; delete from mestre_recebimentos; delete from mestre_recebimentos_stage;
    update mestre_lotes set substituido_por = null;
    delete from mestre_lotes; delete from teste_sync; delete from logs_sistema; delete from notificacoes;
    delete from mestre_grupos; delete from mestre_equipes;
  `);
});

describe('primeiro lote do mês', () => {
  it('entra inteiro, vira o vigente e a passagem esvazia', async () => {
    const ls = [linha('100', 10), linha('101', 20), linha('102', 30)];
    const id = await abrirEEnviar('a.csv', 'h1', ls);
    const r = (await db.query<{ r: Record<string, unknown> }>(`select fn_mestre_promover_lote($1::uuid) as r`, [id])).rows[0].r;
    expect(r.modo).toBe('completo');
    expect(await retrato()).toEqual(esperado(ls));
    expect((await db.query('select count(*)::int n from mestre_recebimentos_stage')).rows[0]).toEqual({ n: 0 });
    const v = await db.query<{ id: string }>(`select id from mestre_lotes where estado = 'vigente'`);
    expect(v.rows[0].id).toBe(id);
  });

  it('lote vazio é recusado', async () => {
    const id = (await db.query<{ id: string }>(
      `select fn_mestre_abrir_lote($1::uuid, '2026-10', 'v.csv', 'h0') as id`, [EMPRESA])).rows[0].id;
    await expect(db.query(`select fn_mestre_promover_lote($1::uuid)`, [id])).rejects.toThrow(/vazio/);
  });
});

describe('segunda carga: só a diferença', () => {
  it('o retrato fica igual ao arquivo novo, no MESMO lote físico', async () => {
    const base = [linha('100', 10), linha('101', 20), linha('102', 30), linha('103', 40)];
    const id1 = await abrirEEnviar('a.csv', 'h1', base);
    await db.query(`select fn_mestre_promover_lote($1::uuid)`, [id1]);
    await db.exec('delete from teste_sync; delete from notificacoes; delete from logs_sistema');

    // 102 saiu, 104 e 105 entraram, e a ordem do arquivo mudou (101 foi para o fim).
    const novo = [linha('100', 10), linha('103', 40), linha('104', 5), linha('105', 7), linha('101', 20)];
    const id2 = await abrirEEnviar('b.csv', 'h2', novo);
    const r = (await db.query<{ r: Record<string, number | string> }>(
      `select fn_mestre_promover_lote($1::uuid) as r`, [id2])).rows[0].r;

    expect(r.modo).toBe('diferenca');
    expect(r.linhas_inseridas).toBe(2);
    expect(r.linhas_removidas).toBe(1);
    expect(r.linhas_mantidas).toBe(3);
    expect(await retrato()).toEqual(esperado(novo));

    // O lote físico do retrato é o primeiro; o aberto virou o retrato anterior.
    const lotes = (await db.query<{ id: string; estado: string; arquivo_nome: string; linhas: number }>(
      `select id, estado, arquivo_nome, linhas from mestre_lotes order by importado_em, id`)).rows;
    const vig = lotes.find(l => l.estado === 'vigente')!;
    const ant = lotes.find(l => l.estado === 'substituido')!;
    expect(vig.id).toBe(id1);
    expect(vig).toMatchObject({ arquivo_nome: 'b.csv', linhas: 5 });
    expect(ant.id).toBe(id2);
    expect(ant).toMatchObject({ arquivo_nome: 'a.csv', linhas: 4 });
    expect((await db.query('select count(*)::int n from mestre_recebimentos_stage')).rows[0]).toEqual({ n: 0 });
  });

  it('o analítico é sincronizado UMA vez, com o id da importação, e o aviso nomeia a diferença', async () => {
    const id1 = await abrirEEnviar('a.csv', 'h1', [linha('100', 10), linha('101', 20)]);
    await db.query(`select fn_mestre_promover_lote($1::uuid)`, [id1]);
    await db.exec('delete from teste_sync; delete from notificacoes; delete from logs_sistema');

    const id2 = await abrirEEnviar('b.csv', 'h2', [linha('100', 10), linha('101', 20), linha('102', 50)]);
    await db.query(`select fn_mestre_promover_lote($1::uuid)`, [id2]);

    const chamadas = (await db.query<{ lote: string }>('select lote from teste_sync')).rows;
    expect(chamadas).toEqual([{ lote: id2 }]);
    const log = (await db.query<{ detalhes: { lote_59: string } }>(`select detalhes from logs_sistema`)).rows;
    expect(log).toHaveLength(1);
    expect(log[0].detalhes.lote_59).toBe(id2);
    // O total foi de 30 para 80; o motor de teste diz que o analítico andou 50.
    const avisos = (await db.query<{ mensagem: string }>(`select mensagem from notificacoes`)).rows;
    expect(avisos).toHaveLength(1);
    expect(avisos[0].mensagem).toMatch(/a mais/);
  });

  it('o mesmo arquivo de novo não grava nada nem avisa ninguém', async () => {
    const ls = [linha('100', 10), linha('101', 20)];
    const id1 = await abrirEEnviar('a.csv', 'h1', ls);
    await db.query(`select fn_mestre_promover_lote($1::uuid)`, [id1]);
    await db.exec('delete from teste_sync; delete from notificacoes');

    const id2 = await abrirEEnviar('a.csv', 'h1', ls);
    const r = (await db.query<{ r: Record<string, number> }>(
      `select fn_mestre_promover_lote($1::uuid) as r`, [id2])).rows[0].r;
    expect(r.linhas_inseridas).toBe(0);
    expect(r.linhas_removidas).toBe(0);
    expect(await retrato()).toEqual(esperado(ls));
    expect((await db.query('select count(*)::int n from notificacoes')).rows[0]).toEqual({ n: 0 });
  });

  it('linhas repetidas contam por ocorrência', async () => {
    const id1 = await abrirEEnviar('a.csv', 'h1', [linha('100', 10), linha('100', 10), linha('100', 10), linha('101', 5)]);
    await db.query(`select fn_mestre_promover_lote($1::uuid)`, [id1]);
    const novo = [linha('100', 10), linha('100', 10), linha('101', 5)];   // uma das três saiu
    const id2 = await abrirEEnviar('b.csv', 'h2', novo);
    const r = (await db.query<{ r: Record<string, number> }>(
      `select fn_mestre_promover_lote($1::uuid) as r`, [id2])).rows[0].r;
    expect(r.linhas_removidas).toBe(1);
    expect(r.linhas_inseridas).toBe(0);
    expect(await retrato()).toEqual(esperado(novo));
  });

  it('um perfil que passou a existir congela o operador só nas linhas dele', async () => {
    const ls = [linha('100', 10, { cobradora: 'bia' }), linha('101', 20, { cobradora: 'ana' })];
    const id1 = await abrirEEnviar('a.csv', 'h1', ls);
    await db.query(`select fn_mestre_promover_lote($1::uuid)`, [id1]);
    const antes = (await db.query<{ cobradora: string; operador_id: string | null }>(
      `select cobradora, operador_id from mestre_recebimentos order by cobradora`)).rows;
    expect(antes).toEqual([{ cobradora: 'ana', operador_id: expect.any(String) }, { cobradora: 'bia', operador_id: null }]);

    await db.exec(`insert into perfis (empresa_id, usuario, setor_id) values ('${EMPRESA}', 'BIA', '${SETOR}')`);
    const id2 = await abrirEEnviar('b.csv', 'h2', ls);
    const r = (await db.query<{ r: Record<string, number> }>(
      `select fn_mestre_promover_lote($1::uuid) as r`, [id2])).rows[0].r;
    expect(r.linhas_inseridas).toBe(0);
    expect(r.operadores_congelados).toBe(1);
    const depois = (await db.query<{ operador_id: string | null }>(`select operador_id from mestre_recebimentos`)).rows;
    expect(depois.every(x => x.operador_id !== null)).toBe(true);
    await db.exec(`delete from perfis where usuario = 'BIA'`);
  });
});

describe('modo completo (emergência)', () => {
  it('troca o retrato inteiro: o lote novo vira o vigente e as linhas são as do arquivo', async () => {
    const id1 = await abrirEEnviar('a.csv', 'h1', [linha('100', 10), linha('101', 20)]);
    await db.query(`select fn_mestre_promover_lote($1::uuid)`, [id1]);

    const novo = [linha('200', 1), linha('201', 2)];
    const id2 = await abrirEEnviar('b.csv', 'h2', novo);
    const r = (await db.query<{ r: Record<string, unknown> }>(
      `select fn_mestre_promover_lote($1::uuid, true) as r`, [id2])).rows[0].r;
    expect(r.modo).toBe('completo');
    expect(await retrato()).toEqual(esperado(novo));
    expect((await db.query<{ id: string }>(`select id from mestre_lotes where estado = 'vigente'`)).rows[0].id).toBe(id2);
  });

  it('só super_admin pede o modo completo', async () => {
    const id1 = await abrirEEnviar('a.csv', 'h1', [linha('100', 10)]);
    await db.query(`select fn_mestre_promover_lote($1::uuid)`, [id1]);
    const id2 = await abrirEEnviar('b.csv', 'h2', [linha('101', 10)]);
    await db.exec(`set teste.super = 'nao'`);
    await expect(db.query(`select fn_mestre_promover_lote($1::uuid, true)`, [id2])).rejects.toThrow();
  });
});

describe('descartar', () => {
  it('limpa a passagem e deixa o retrato como estava', async () => {
    const ls = [linha('100', 10)];
    const id1 = await abrirEEnviar('a.csv', 'h1', ls);
    await db.query(`select fn_mestre_promover_lote($1::uuid)`, [id1]);

    const id2 = await abrirEEnviar('b.csv', 'h2', [linha('999', 99)]);
    await db.query(`select fn_mestre_descartar_lote($1::uuid)`, [id2]);
    expect((await db.query('select count(*)::int n from mestre_recebimentos_stage')).rows[0]).toEqual({ n: 0 });
    expect(await retrato()).toEqual(esperado(ls));
  });
});

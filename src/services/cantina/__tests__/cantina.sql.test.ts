// @vitest-environment node
/**
 * cantina.sql.test.ts — a migration 20261022153000 rodando num Postgres de
 * verdade (PGlite).
 *
 * As regras da cantina moram no banco: janela do item, faixa de retirada,
 * prazo de cancelamento, preço e quem muda status. Erro de ramo em plpgsql só
 * aparece quando a função roda — aqui ela roda, com o relógio controlado.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const BOOKPLAY = '00000000-0000-4000-8000-000000000001';
const SETOR    = '00000000-0000-4000-8000-0000000000a1';
const ANA      = '00000000-0000-4000-8000-0000000000c1'; // operadora
const BRUNO    = '00000000-0000-4000-8000-0000000000c2'; // operador
const CIDA     = '00000000-0000-4000-8000-0000000000c3'; // a cantina

const MIGRATION = readFileSync(
  resolve(__dirname, '../../../../supabase/migrations/20261022153000_cantina.sql'), 'utf8');

let db: PGlite;

/** Quem está logado e que horas são em Brasília (`HH:MM`). */
async function sessao(uid: string, hora: string): Promise<void> {
  await db.query(`select set_config('teste.uid', $1, false), set_config('teste.agora', $2, false)`,
    [uid, `2026-10-22 ${hora}:00-03`]);
}

async function rpc<T = unknown>(sql: string, params: unknown[] = []): Promise<T> {
  const r = await db.query<{ v: T }>(`select ${sql} as v`, params);
  return r.rows[0].v;
}

async function falha(sql: string, params: unknown[] = []): Promise<string> {
  try {
    await db.query(`select ${sql}`, params);
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error(`deveria ter falhado: ${sql}`);
}

async function itemId(codigo: number): Promise<string> {
  const r = await db.query<{ id: string }>('select id from public.cantina_itens where codigo = $1', [codigo]);
  return r.rows[0].id;
}

interface Pedido { id: string; numero: number; status: string; total: number; itens: { nome: string; preco: number; opcao: string | null }[] }

async function pedir(itens: unknown[], hora: string): Promise<Pedido> {
  return rpc<Pedido>('public.fn_cantina_fazer_pedido($1::jsonb, $2)', [JSON.stringify(itens), hora]);
}

async function enviados(): Promise<{ topic: string; payload: Record<string, unknown> }[]> {
  return (await db.query<{ topic: string; payload: Record<string, unknown> }>(
    'select topic, payload from realtime.enviados order by n')).rows;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('teste.uid', true), '')::uuid $$;

    create schema realtime;
    create table realtime.messages (topic text, extension text, payload jsonb, event text, private boolean);
    alter table realtime.messages enable row level security;
    create function realtime.topic() returns text language sql stable
      as $$ select nullif(current_setting('realtime.topic', true), '') $$;
    create table realtime.enviados (n serial, topic text, event text, payload jsonb);
    create function realtime.send(payload jsonb, event text, topic text, private boolean default true)
      returns void language sql
      as $$ insert into realtime.enviados (topic, event, payload) values (topic, event, payload) $$;

    create schema supabase_migrations;
    create table supabase_migrations.schema_migrations (version text primary key, name text, statements text[]);

    create table public.empresas (id uuid primary key default gen_random_uuid(), nome text unique, slug text unique,
      produto text not null, ativo boolean default true,
      constraint empresas_produto_conhecido check (produto in ('cobranca','comercial','rh')));
    create table public.setores (id uuid primary key, nome text);
    create table public.perfis (id uuid primary key, nome text, empresa_id uuid, setor_id uuid, perfil text);
    create table public.cargos (slug text primary key, nome text, nivel int, ordem int, pertence_a_setor boolean,
      exige_tipo_setor text, acesso_total boolean, conta_no_recebimento boolean, lidera_equipe boolean, ativo boolean);
    create table public.cargos_permissoes (empresa_id uuid, cargo text, permissoes jsonb, primary key (empresa_id, cargo));
    create table public.notificacoes (id serial primary key, usuario_id uuid, empresa_id uuid, titulo text,
      mensagem text, rota text, autor_nome text);

    insert into public.cargos values ('operador','Operador',1,1,true,null,false,true,false,true),
                                     ('rh','RH',null,7,true,null,false,false,false,true);

    -- O catálogo antes desta migration, reduzido ao que importa aqui.
    create function public.fn_permissoes_catalogo()
      returns table(chave text, tenants text[], padrao text[], explicita boolean)
      language sql immutable as $$
        select x.chave, null::text[], array['operador']::text[], false
          from (select 'ver_acordos' as chave union all select 'chave_' || g from generate_series(1, 40) g) x
      $$;

    -- Semeia como a de verdade: chave ausente nasce no padrão.
    create function public.fn_permissoes_semear_empresa(p_empresa_id uuid) returns integer language plpgsql as $$
    declare r record;
    begin
      insert into public.cargos_permissoes (empresa_id, cargo, permissoes)
      values (p_empresa_id, 'operador', '{}') on conflict do nothing;
      for r in select * from public.fn_permissoes_catalogo() loop
        update public.cargos_permissoes
           set permissoes = permissoes || jsonb_build_object(r.chave, 'operador' = any(r.padrao))
         where empresa_id = p_empresa_id and cargo = 'operador' and not (permissoes ? r.chave);
      end loop;
      return 1;
    end $$;

    -- O painel no banco, como a fn_user_tem de verdade lê: o mapa do cargo
    -- na empresa da pessoa.
    create function public.fn_user_tem(p_chave text) returns boolean language sql stable as $$
      select coalesce((select (cp.permissoes ->> p_chave)::boolean
                         from public.perfis p
                         join public.cargos_permissoes cp on cp.empresa_id = p.empresa_id and cp.cargo = p.perfil
                        where p.id = auth.uid()), false)
    $$;

    create function public.fn_realtime_posso_ouvir_usuario(p_topico text) returns boolean language sql stable
      as $$ select split_part(p_topico, ':', 2) = auth.uid()::text $$;

    insert into public.empresas (id, nome, slug, produto) values ('${BOOKPLAY}', 'BookPlay', 'bookplay', 'cobranca');
    insert into public.setores values ('${SETOR}', 'Play 1');
    insert into public.cargos_permissoes values ('${BOOKPLAY}', 'rh', '{}');
  `);

  await db.exec(MIGRATION);
  // Reaplicar não pode quebrar nem duplicar nada.
  await db.exec(MIGRATION);

  // O relógio controlado.
  await db.exec(`
    create or replace function public.fn_cantina_agora() returns timestamptz language sql stable
      as $$ select coalesce(nullif(current_setting('teste.agora', true), '')::timestamptz, now()) $$;
  `);

  const cantina = (await db.query<{ id: string }>(`select id from public.empresas where slug = 'cantina'`)).rows[0].id;
  await db.exec(`
    insert into public.perfis values
      ('${ANA}',   'Ana Souza',   '${BOOKPLAY}', '${SETOR}', 'operador'),
      ('${BRUNO}', 'Bruno Lima',  '${BOOKPLAY}', '${SETOR}', 'operador'),
      ('${CIDA}',  'Cida Cantina', '${cantina}', null, 'cantina');
  `);
});

beforeEach(async () => {
  await db.exec(`
    truncate public.cantina_pedidos cascade;
    truncate realtime.enviados;
    truncate public.notificacoes;
    update public.cantina_config set aberta = true;
  `);
});

afterAll(async () => { await db.close(); });

describe('cadastro', () => {
  it('cria a empresa Cantina, o cargo e o mapa só com a fila', async () => {
    const r = await db.query<{ produto: string; permissoes: Record<string, boolean> }>(`
      select e.produto, cp.permissoes from public.empresas e
        join public.cargos_permissoes cp on cp.empresa_id = e.id and cp.cargo = 'cantina'
       where e.slug = 'cantina'`);
    expect(r.rows).toEqual([{ produto: 'cantina', permissoes: { cantina_painel: true, ver_cantina: false } }]);
    expect(await rpc<number>(`(select count(*)::int from public.cargos where slug = 'cantina')`)).toBe(1);
  });

  it('a operação ganha ver_cantina; o rh também, sem mexer no resto do mapa', async () => {
    const r = await db.query<{ cargo: string; v: boolean | null; fila: boolean | null }>(`
      select cargo, (permissoes ->> 'ver_cantina')::boolean v, (permissoes ->> 'cantina_painel')::boolean fila
        from public.cargos_permissoes where empresa_id = '${BOOKPLAY}' order by cargo`);
    expect(r.rows).toEqual([
      { cargo: 'operador', v: true, fila: false },
      { cargo: 'rh',       v: true, fila: null },
    ]);
  });

  it('carrega os 12 itens do print e nenhuma tabela entra no Postgres Changes', async () => {
    expect(await rpc<number>('(select count(*)::int from public.cantina_itens)')).toBe(12);
    expect(await rpc<number>(`(select count(*)::int from pg_trigger where tgname like 'trg_cantina_%')`)).toBe(3);
  });
});

describe('fazer pedido', () => {
  it('soma pelo preço do cadastro, guarda o retrato e numera o dia', async () => {
    await sessao(ANA, '10:02');
    const p = await pedir([
      { item_id: await itemId(50), quantidade: 2, preco: 0.01 }, // preço forjado é ignorado
      { item_id: await itemId(59), quantidade: 1, observacao: 'sem tomate' },
    ], '10:30');

    expect(p.numero).toBe(1);
    expect(Number(p.total)).toBe(56);
    expect(p.status).toBe('novo');
    expect(p.itens.map(i => [i.nome, Number(i.preco)])).toEqual([['X-Salada', 18], ['X-Egg', 20]]);

    const linha = (await db.query<{ nome: string; empresa_nome: string; setor_nome: string; retirada: string }>(`
      select nome, empresa_nome, setor_nome,
             to_char(retirada_em at time zone 'America/Sao_Paulo', 'HH24:MI') retirada
        from public.cantina_pedidos`)).rows[0];
    expect(linha).toEqual({ nome: 'Ana Souza', empresa_nome: 'BookPlay', setor_nome: 'Play 1', retirada: '10:30' });

    await sessao(BRUNO, '10:05');
    expect((await pedir([{ item_id: await itemId(52), quantidade: 1 }], '11:00')).numero).toBe(2);
  });

  it('recusa faixa fora da grade, perto demais, antes de abrir e depois de fechar', async () => {
    await sessao(ANA, '10:02');
    const x = await itemId(50);
    expect(await falha(`public.fn_cantina_fazer_pedido($1::jsonb, '10:40')`, [JSON.stringify([{ item_id: x, quantidade: 1 }])]))
      .toMatch(/faixas de retirada/);
    expect(await falha(`public.fn_cantina_fazer_pedido($1::jsonb, '10:15')`, [JSON.stringify([{ item_id: x, quantidade: 1 }])]))
      .toMatch(/a partir de 10:17/);
    expect(await falha(`public.fn_cantina_fazer_pedido($1::jsonb, '17:15')`, [JSON.stringify([{ item_id: x, quantidade: 1 }])]))
      .toMatch(/das 07:00 às 17:00/);
    expect(await falha(`public.fn_cantina_fazer_pedido($1::jsonb, 'meio-dia')`, [JSON.stringify([{ item_id: x, quantidade: 1 }])]))
      .toMatch(/Horário de retirada inválido/);
  });

  it('recusa item fora da janela de pedido', async () => {
    await sessao(ANA, '10:02');
    expect(await falha(`public.fn_cantina_fazer_pedido($1::jsonb, '14:00')`,
      [JSON.stringify([{ item_id: await itemId(9), quantidade: 1 }])]))
      .toMatch(/Coca-Cola KS só pode ser pedido das 13:30 às 15:30/);
  });

  it('exige a opção do refrigerante e só aceita as do cadastro', async () => {
    await sessao(ANA, '14:00');
    const lata = await itemId(8);
    expect(await falha(`public.fn_cantina_fazer_pedido($1::jsonb, '14:30')`,
      [JSON.stringify([{ item_id: lata, quantidade: 1 }])])).toMatch(/Escolha a opção/);
    expect(await falha(`public.fn_cantina_fazer_pedido($1::jsonb, '14:30')`,
      [JSON.stringify([{ item_id: lata, quantidade: 1, opcao: 'Pepsi' }])])).toMatch(/Escolha a opção/);
    const p = await pedir([{ item_id: lata, quantidade: 2, opcao: 'Fanta Uva' }], '14:30');
    expect(p.itens[0].opcao).toBe('Fanta Uva');
  });

  it('recusa pedido vazio, quantidade inválida, item inativo, cantina fechada e quem não pode pedir', async () => {
    await sessao(ANA, '10:02');
    expect(await falha(`public.fn_cantina_fazer_pedido('[]'::jsonb, '10:30')`)).toMatch(/vazio/);
    expect(await falha(`public.fn_cantina_fazer_pedido($1::jsonb, '10:30')`,
      [JSON.stringify([{ item_id: await itemId(50), quantidade: 21 }])])).toMatch(/Quantidade inválida/);

    await db.exec('update public.cantina_itens set ativo = false where codigo = 58');
    expect(await falha(`public.fn_cantina_fazer_pedido($1::jsonb, '10:30')`,
      [JSON.stringify([{ item_id: await itemId(58), quantidade: 1 }])])).toMatch(/saiu do cardápio/);
    await db.exec('update public.cantina_itens set ativo = true where codigo = 58');

    await db.exec('update public.cantina_config set aberta = false');
    expect(await falha(`public.fn_cantina_fazer_pedido($1::jsonb, '10:30')`,
      [JSON.stringify([{ item_id: await itemId(50), quantidade: 1 }])])).toMatch(/não está recebendo/);
    await db.exec('update public.cantina_config set aberta = true');

    await sessao(CIDA, '10:02');
    expect(await falha(`public.fn_cantina_fazer_pedido($1::jsonb, '10:30')`,
      [JSON.stringify([{ item_id: await itemId(50), quantidade: 1 }])])).toMatch(/Sem acesso/);
  });

  it('avisa a fila (novo) e o dono só com ids, uma vez', async () => {
    await sessao(ANA, '10:02');
    const p = await pedir([{ item_id: await itemId(50), quantidade: 1 }], '10:30');
    expect(await enviados()).toEqual([
      { topic: 'cantina-fila:hoje', payload: { ids: [p.id], novo: true } },
      { topic: `cantina-pessoa:${ANA}`, payload: { ids: [p.id] } },
    ]);
  });
});

describe('cancelar', () => {
  it('quem pediu cancela até 15 min antes, e depois não', async () => {
    await sessao(ANA, '10:00');
    const a = await pedir([{ item_id: await itemId(50), quantidade: 1 }], '10:30');
    const b = await pedir([{ item_id: await itemId(50), quantidade: 1 }], '10:30');

    await sessao(ANA, '10:15');
    expect((await rpc<Pedido>(`public.fn_cantina_cancelar($1, 'cliente')`, [a.id])).status).toBe('cancelado');

    await sessao(ANA, '10:16');
    expect(await falha(`public.fn_cantina_cancelar($1, 'cliente')`, [b.id])).toMatch(/15 minutos antes/);
  });

  it('outra pessoa não cancela; a cantina cancela com motivo e avisa o dono', async () => {
    await sessao(ANA, '10:00');
    const p = await pedir([{ item_id: await itemId(50), quantidade: 1 }], '10:30');

    await sessao(BRUNO, '10:01');
    expect(await falha(`public.fn_cantina_cancelar($1, 'cliente')`, [p.id])).toMatch(/não encontrado/);
    expect(await falha(`public.fn_cantina_cancelar($1, 'cantina', 'x')`, [p.id])).toMatch(/não encontrado/);

    await sessao(CIDA, '10:25');
    expect(await falha(`public.fn_cantina_cancelar($1, 'cantina')`, [p.id])).toMatch(/motivo/);
    const c = await rpc<Pedido & { cancelado_pela_cantina: boolean }>(
      `public.fn_cantina_cancelar($1, 'cantina', 'Acabou o pão')`, [p.id]);
    expect(c.cancelado_pela_cantina).toBe(true);
    expect((await db.query<{ titulo: string; usuario_id: string }>('select titulo, usuario_id from public.notificacoes')).rows)
      .toEqual([{ titulo: 'Cantina cancelou seu pedido', usuario_id: ANA }]);
  });
});

describe('a fila da cantina', () => {
  it('só a cantina lê a fila e muda status', async () => {
    await sessao(ANA, '10:00');
    const p = await pedir([{ item_id: await itemId(50), quantidade: 1 }], '10:30');
    expect(await falha('public.fn_cantina_fila()')).toMatch(/Sem acesso/);
    expect(await falha(`public.fn_cantina_mudar_status($1, 'pronto')`, [p.id])).toMatch(/Sem acesso/);

    await sessao(CIDA, '10:05');
    const fila = await rpc<{ pedidos: { id: string }[] }>('public.fn_cantina_fila()');
    expect(fila.pedidos.map(x => x.id)).toEqual([p.id]);
  });

  it('segue o caminho, avisa o dono no pronto e recusa salto inválido', async () => {
    await sessao(ANA, '10:00');
    const p = await pedir([{ item_id: await itemId(50), quantidade: 1 }], '10:30');

    await sessao(CIDA, '10:05');
    expect(await falha(`public.fn_cantina_mudar_status($1, 'retirado')`, [p.id])).toMatch(/Não dá para passar de novo para retirado/);
    expect((await rpc<Pedido>(`public.fn_cantina_mudar_status($1, 'preparando')`, [p.id])).status).toBe('preparando');
    expect((await rpc<Pedido>(`public.fn_cantina_mudar_status($1, 'pronto')`, [p.id])).status).toBe('pronto');
    expect((await db.query<{ titulo: string }>('select titulo from public.notificacoes')).rows)
      .toEqual([{ titulo: 'Seu pedido está pronto' }]);

    // «Não retirado» só depois do horário.
    expect(await falha(`public.fn_cantina_mudar_status($1, 'nao_retirado')`, [p.id])).toMatch(/Ainda não chegou/);
    await sessao(CIDA, '10:45');
    expect((await rpc<Pedido>(`public.fn_cantina_mudar_status($1, 'nao_retirado')`, [p.id])).status).toBe('nao_retirado');
    // Clique errado: volta.
    expect((await rpc<Pedido>(`public.fn_cantina_mudar_status($1, 'retirado')`, [p.id])).status).toBe('retirado');

    const msgs = await rpc<{ lado: string; texto: string }[]>(`public.fn_cantina_mensagens($1, 'cantina')`, [p.id]);
    expect(msgs.map(m => m.lado)).toEqual(['sistema', 'sistema', 'sistema', 'sistema', 'sistema']);
  });

  it('o relatório do mês leva entregue e não retirado, e deixa cancelado de fora', async () => {
    await sessao(ANA, '10:00');
    const a = await pedir([{ item_id: await itemId(50), quantidade: 1 }], '10:30');
    const b = await pedir([{ item_id: await itemId(52), quantidade: 2 }], '10:30');
    await rpc(`public.fn_cantina_cancelar($1, 'cliente')`, [b.id]);

    await sessao(CIDA, '10:05');
    const r = await rpc<{ numero: number; itens: string }[]>(`public.fn_cantina_relatorio_mes('2026-10-01')`);
    expect(r.map(x => [x.numero, x.itens])).toEqual([[a.numero, '1× X-Salada']]);
  });
});

describe('conversa', () => {
  it('cada lado escreve como ele mesmo, conta não lidas e avisa só o outro lado', async () => {
    await sessao(ANA, '10:00');
    const p = await pedir([{ item_id: await itemId(50), quantidade: 1 }], '10:30');
    await db.exec('truncate realtime.enviados');

    await rpc(`public.fn_cantina_enviar_mensagem($1, 'cliente', 'Pode caprichar no molho?')`, [p.id]);
    expect(await enviados()).toEqual([
      { topic: 'cantina-fila:hoje', payload: { ids: [p.id], mensagem: true } },
    ]);

    await sessao(CIDA, '10:03');
    const fila = await rpc<{ pedidos: { nao_lidas: number }[] }>('public.fn_cantina_fila()');
    expect(fila.pedidos[0].nao_lidas).toBe(1);
    await rpc(`public.fn_cantina_marcar_lido($1, 'cantina')`, [p.id]);
    expect((await rpc<{ pedidos: { nao_lidas: number }[] }>('public.fn_cantina_fila()')).pedidos[0].nao_lidas).toBe(0);

    await db.exec('truncate realtime.enviados');
    await rpc(`public.fn_cantina_enviar_mensagem($1, 'cantina', 'Claro!')`, [p.id]);
    expect(await enviados()).toEqual([
      { topic: `cantina-pessoa:${ANA}`, payload: { ids: [p.id], mensagem: true } },
    ]);
    expect((await db.query<{ titulo: string }>('select titulo from public.notificacoes')).rows)
      .toEqual([{ titulo: 'Mensagem da cantina' }]);

    // Outra pessoa não lê nem escreve.
    await sessao(BRUNO, '10:04');
    expect(await falha(`public.fn_cantina_mensagens($1, 'cliente')`, [p.id])).toMatch(/não encontrado/);
    expect(await falha(`public.fn_cantina_enviar_mensagem($1, 'cliente', 'oi')`, [p.id])).toMatch(/não encontrado/);
  });
});

describe('quem ouve o tempo real', () => {
  async function ouve(uid: string, topico: string): Promise<boolean> {
    await db.query(`select set_config('teste.uid', $1, false), set_config('realtime.topic', $2, false)`, [uid, topico]);
    const r = await db.query<{ policyname: string; ok: boolean }>(`
      select (extension = 'broadcast'
              and ((split_part(realtime.topic(), ':', 1) = 'cantina-pessoa'
                    and public.fn_realtime_posso_ouvir_usuario(realtime.topic()))
                or (realtime.topic() = 'cantina-fila:hoje' and public.fn_user_tem('cantina_painel')))) ok
        from (select 'broadcast'::text as extension) m`);
    return r.rows[0].ok;
  }

  it('o dono ouve o próprio tópico; a fila, só a cantina', async () => {
    expect(await ouve(ANA, `cantina-pessoa:${ANA}`)).toBe(true);
    expect(await ouve(BRUNO, `cantina-pessoa:${ANA}`)).toBe(false);
    expect(await ouve(ANA, 'cantina-fila:hoje')).toBe(false);
    expect(await ouve(CIDA, 'cantina-fila:hoje')).toBe(true);

    const r = await db.query<{ policyname: string }>(
      `select policyname from pg_policies where schemaname = 'realtime' and policyname like 'cantina_%' order by 1`);
    expect(r.rows.map(x => x.policyname)).toEqual(['cantina_sinal_fila', 'cantina_sinal_pessoa']);
  });
});

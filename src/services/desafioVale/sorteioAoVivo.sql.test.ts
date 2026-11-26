// @vitest-environment node
//
// O sorteio ao vivo do Desafio do Vale (20261126150000) num Postgres em
// memória: abrir para uma plateia, começar a contagem, NUNCA ter ganhador
// antes de `revela_em`, sortear uma vez só, avisar só a plateia e encerrar.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const EMP = '00000000-0000-4000-8000-000000000001';
const BIRIGUI = '00000000-0000-4000-8000-0000000000c1';
const PLAY1 = '00000000-0000-4000-8000-0000000000a1';
const PLAY2 = '00000000-0000-4000-8000-0000000000a3';
const SUPER = '00000000-0000-4000-8000-0000000000f1';
const ANA = '00000000-0000-4000-8000-0000000000b1';
const BIA = '00000000-0000-4000-8000-0000000000b2';
const CAIO = '00000000-0000-4000-8000-0000000000b3';
const DUDA = '00000000-0000-4000-8000-0000000000b4';
const ELI = '00000000-0000-4000-8000-0000000000b5';   // sem cupom: entra como extra
const FORA = '00000000-0000-4000-8000-0000000000b6';  // do Play 2, fora da plateia
const LOTE = '00000000-0000-4000-8000-0000000000e1';

let db: PGlite;

async function como(uid: string | null) {
  await db.query(`select set_config('test.uid', $1, false)`, [uid ?? '']);
}
async function json<T = Record<string, unknown>>(sql: string, args: unknown[] = []): Promise<T> {
  const r = await db.query<{ r: T }>(sql, args);
  return r.rows[0].r;
}
interface Show {
  id: number; estado: string; qtd: number; setor_nome: string; revela_em: string | null; plateia: number;
  concorrentes: { perfil_id: string; nome: string }[];
  ganhadores: { posicao: number; perfil_id: string; nome: string }[] | null;
}
const resposta = (sql: string, args: unknown[] = []) => json<{ agora: string; show: Show | null }>(sql, args);
/** Faz a contagem acabar sem esperar 7 s. */
const acabarContagem = (id: number) => db.query(`update public.desafio_vale_show set revela_em = clock_timestamp() - interval '1 second' where id = $1`, [id]);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create schema realtime;
    create table realtime.enviados (payload jsonb, evento text, topico text);
    create function realtime.send(payload jsonb, event text, topic text, private boolean default true) returns void
      language sql as $$ insert into realtime.enviados values (payload, event, topic) $$;
    create table public.empresas (id uuid primary key);
    create table public.perfis (id uuid primary key, nome text, perfil text, setor_id uuid, todos boolean default false, foto_url text);
    create table public.rh_celulas (id uuid primary key, nome text);
    create table public.setores (id uuid primary key, nome text, regra text, cidade_id uuid);
    create function public.fn_user_is_super_admin() returns boolean language sql stable as $$
      select exists (select 1 from public.perfis where id = auth.uid() and perfil = 'super_admin') $$;
    create function public.fn_user_setor_id() returns uuid language sql stable as $$
      select setor_id from public.perfis where id = auth.uid() $$;
    create function public.fn_user_tem(p_chave text) returns boolean language sql stable as $$ select false $$;
    create table public.mestre_lotes (id uuid primary key, empresa_id uuid, mes date, estado text, importado_em timestamptz);
    create table public.mestre_grupos (empresa_id uuid, cod_grupo_filtro text, setor_id uuid, estado text);
    create table public.metas (empresa_id uuid, tipo text, referencia_id text, mes int, ano int, meta_valor numeric);
    create function public.fn_mestre_diretoria_linhas(p_empresa_id uuid, p_mes text, p_dia_corte integer default null)
      returns table (setor_id uuid, recebido numeric) language sql as $$ select null::uuid, 0::numeric where false $$;
    create table public.composicao_mes (empresa_id uuid, mes text, operador_id uuid, setor_id uuid);
    create table public.sinais (topico text);
    create function public.fn_realtime_sinal_emitir(p_topico text, p_payload jsonb) returns void language sql as $$
      insert into public.sinais values (p_topico) $$;

    insert into public.empresas values ('${EMP}');
    insert into public.rh_celulas values ('${BIRIGUI}', 'Birigui');
    insert into public.setores values
      ('${PLAY1}', 'Play 1', 'nosso_produto', '${BIRIGUI}'),
      ('${PLAY2}', 'Play 2', 'nosso_produto', '${BIRIGUI}');
    insert into public.perfis (id, nome, perfil, setor_id, foto_url) values
      ('${SUPER}', 'Super', 'super_admin', null, null),
      ('${ANA}', 'Ana', 'operador', '${PLAY1}', 'https://foto/ana.png'),
      ('${BIA}', 'Bia', 'operador', '${PLAY1}', null),
      ('${CAIO}', 'Caio', 'operador', '${PLAY1}', null),
      ('${DUDA}', 'Duda', 'operador', '${PLAY1}', null),
      ('${ELI}', 'Eli', 'operador', '${PLAY1}', null),
      ('${FORA}', 'Fora', 'operador', '${PLAY2}', null);
    insert into public.mestre_grupos values
      ('${EMP}', '25', '${PLAY1}', 'vinculado'),
      ('${EMP}', '30', '${PLAY2}', 'vinculado');
    insert into public.mestre_lotes values ('${LOTE}', '${EMP}', '2026-11-01', 'vigente', '2026-11-23 10:07-03');
  `);
  for (const m of ['20261123120000_desafio_vale', '20261123150000_desafio_vale_virada_do_mes', '20261123200000_desafio_vale_ranking_manutencao']) {
    await db.exec(readFileSync(`supabase/migrations/${m}.sql`, 'utf8'));
  }
  await db.exec(`create table public.pix_automatico_acordos (id uuid primary key default gen_random_uuid(), empresa_id uuid,
    operador_id uuid, operador_nome text, setor_id uuid, status text, criado_em timestamptz)`);
  await db.exec(readFileSync('supabase/migrations/20261123220000_desafio_vale_sorteio.sql', 'utf8'));
  await db.exec(readFileSync('supabase/migrations/20261126150000_desafio_vale_sorteio_ao_vivo.sql', 'utf8'));
  await db.exec(`update public.desafio_vale set inicio = current_date - 2, fim = current_date + 5,
                   cupom_inicio = current_date - 2, cupom_fim = current_date + 1`);
  // Play 1: Ana 6 Pix (2 cupons), Bia 3, Caio 3, Duda 2 (sem cupom). Eli nada.
  const pix: [string, number][] = [[ANA, 6], [BIA, 3], [CAIO, 3], [DUDA, 2]];
  for (const [quem, n] of pix) {
    await db.query(`insert into public.pix_automatico_acordos (empresa_id, operador_id, setor_id, status, criado_em)
      select $1, $2, $3, 'aprovado', now() from generate_series(1, $4)`, [EMP, quem, PLAY1, n]);
  }
});

afterAll(async () => { await db?.close(); });

describe('o sorteio ao vivo (20261126150000)', () => {
  let id = 0;

  it('só o super_admin abre', async () => {
    await como(ANA);
    await expect(db.query(`select public.fn_vale_show_abrir($1, array[$2]::uuid[])`, [PLAY1, ANA])).rejects.toThrow(/super_admin/);
  });

  it('abre para a plateia escolhida, com quem sorteia junto, e avisa só ela', async () => {
    await como(SUPER);
    const r = await resposta(`select public.fn_vale_show_abrir($1, array[$2,$3,$4,$5]::uuid[], array[$6]::uuid[]) as r`, [PLAY1, ANA, BIA, CAIO, DUDA, ELI]);
    expect(r.show!.estado).toBe('aberto');
    expect(r.show!.qtd).toBe(3);
    expect(r.show!.setor_nome).toBe('Play 1');
    expect(r.show!.plateia).toBe(5); // os 4 + o super_admin
    expect(r.show!.ganhadores).toBeNull();
    // Concorrem Ana, Bia, Caio (cupom) e Eli (extra); Duda não tem cupom.
    expect(r.show!.concorrentes.map(c => c.nome)).toEqual(['Ana', 'Bia', 'Caio', 'Eli']);
    id = r.show!.id;
    const topicos = (await db.query<{ topico: string; evento: string }>(`select topico, evento from realtime.enviados`)).rows;
    expect(topicos.every(t => t.evento === 'vale')).toBe(true);
    expect(new Set(topicos.map(t => t.topico))).toEqual(new Set([ANA, BIA, CAIO, DUDA, SUPER].map(u => `corrida-eu:${u}`)));
    expect(topicos.some(t => t.topico.endsWith(FORA))).toBe(false);
  });

  it('não abre um segundo sorteio com um no ar', async () => {
    await expect(db.query(`select public.fn_vale_show_abrir($1, array[]::uuid[])`, [PLAY2])).rejects.toThrow(/no ar/);
  });

  it('quem está na plateia acha o sorteio ao recarregar; quem não está, não', async () => {
    await como(DUDA);
    expect((await resposta(`select public.fn_vale_show_meu() as r`)).show!.id).toBe(id);
    await como(FORA);
    expect((await resposta(`select public.fn_vale_show_meu() as r`)).show).toBeNull();
  });

  it('ninguém lê as tabelas direto', async () => {
    const r = await db.query<{ ok: boolean }>(
      `select has_table_privilege('authenticated', 'public.desafio_vale_show', 'select') as ok`);
    expect(r.rows[0].ok).toBe(false);
  });

  it('só o super_admin começa a contagem', async () => {
    await como(ANA);
    await expect(db.query(`select public.fn_vale_show_comecar($1)`, [id])).rejects.toThrow(/super_admin/);
  });

  it('começar congela quem concorre e marca revela_em ~7 s à frente, sem ganhador', async () => {
    await como(SUPER);
    const r = await resposta(`select public.fn_vale_show_comecar($1) as r`, [id]);
    expect(r.show!.estado).toBe('contagem');
    const falta = Date.parse(r.show!.revela_em!) - Date.parse(r.agora);
    expect(falta).toBeGreaterThan(6_000);
    expect(falta).toBeLessThanOrEqual(7_000);
    expect(r.show!.ganhadores).toBeNull();
    const cong = await db.query(`select * from public.desafio_vale_show_concorrentes where show_id = $1`, [id]);
    expect(cong.rows).toHaveLength(4);
  });

  it('antes de acabar a contagem, revelar recusa e não existe ganhador em lugar nenhum', async () => {
    await como(ANA);
    await expect(db.query(`select public.fn_vale_show_revelar($1)`, [id])).rejects.toThrow(/AINDA_NAO/);
    await como(SUPER);
    await expect(db.query(`select public.fn_vale_show_revelar($1)`, [id])).rejects.toThrow(/AINDA_NAO/);
    const s = await db.query<{ ganhadores: unknown }>(`select ganhadores from public.desafio_vale_show where id = $1`, [id]);
    expect(s.rows[0].ganhadores).toBeNull();
    expect((await db.query(`select 1 from public.desafio_vale_sorteio`)).rows).toHaveLength(0);
    const avisos = await db.query<{ payload: { show: Show } }>(`select payload from realtime.enviados`);
    expect(avisos.rows.every(a => a.payload.show.ganhadores === null)).toBe(true);
  });

  it('quem não está na plateia não revela', async () => {
    await acabarContagem(id);
    await como(FORA);
    await expect(db.query(`select public.fn_vale_show_revelar($1)`, [id])).rejects.toThrow(/não encontrado/);
  });

  it('acabou a contagem: o primeiro pedido sorteia 3 diferentes, grava e avisa', async () => {
    await db.exec(`delete from realtime.enviados`);
    await como(BIA);
    const r = await resposta(`select public.fn_vale_show_revelar($1) as r`, [id]);
    expect(r.show!.estado).toBe('revelado');
    const g = r.show!.ganhadores!;
    expect(g.map(x => x.posicao)).toEqual([1, 2, 3]);
    expect(new Set(g.map(x => x.perfil_id)).size).toBe(3);
    expect(g.every(x => [ANA, BIA, CAIO, ELI].includes(x.perfil_id))).toBe(true);
    const oficial = await db.query<{ perfil_id: string; sorteado_por: string }>(
      `select perfil_id, sorteado_por from public.desafio_vale_sorteio where setor_id = $1 order by posicao`, [PLAY1]);
    expect(oficial.rows.map(x => x.perfil_id)).toEqual(g.map(x => x.perfil_id));
    expect(oficial.rows.every(x => x.sorteado_por === SUPER)).toBe(true);
    expect((await db.query(`select 1 from realtime.enviados`)).rows).toHaveLength(5);
  });

  it('o segundo pedido não sorteia de novo: lê o mesmo resultado', async () => {
    const antes = (await db.query<{ ganhadores: unknown }>(`select ganhadores from public.desafio_vale_show where id = $1`, [id])).rows[0].ganhadores;
    await como(CAIO);
    const r = await resposta(`select public.fn_vale_show_revelar($1) as r`, [id]);
    expect(r.show!.ganhadores).toEqual(antes);
  });

  it('abrir de novo o mesmo setor pede «refazer»', async () => {
    await como(SUPER);
    await expect(db.query(`select public.fn_vale_show_abrir($1, array[]::uuid[])`, [PLAY1])).rejects.toThrow(/refazer/);
  });

  it('encerrar fecha a tela de todo mundo', async () => {
    await como(SUPER);
    const r = await resposta(`select public.fn_vale_show_encerrar($1) as r`, [id]);
    expect(r.show!.estado).toBe('encerrado');
    await como(ANA);
    expect((await resposta(`select public.fn_vale_show_meu() as r`)).show).toBeNull();
  });

  it('cancelar no meio da contagem não sorteia ninguém', async () => {
    await como(SUPER);
    const a = await resposta(`select public.fn_vale_show_abrir($1, array[$2]::uuid[], '{}', true) as r`, [PLAY1, ANA]);
    await resposta(`select public.fn_vale_show_comecar($1) as r`, [a.show!.id]);
    const c = await resposta(`select public.fn_vale_show_encerrar($1) as r`, [a.show!.id]);
    expect(c.show!.estado).toBe('cancelado');
    expect(c.show!.ganhadores).toBeNull();
    await acabarContagem(a.show!.id);
    await como(ANA);
    const r = await resposta(`select public.fn_vale_show_revelar($1) as r`, [a.show!.id]);
    expect(r.show!.ganhadores).toBeNull();
    // O resultado anterior do setor continua lá.
    expect((await db.query(`select 1 from public.desafio_vale_sorteio where setor_id = $1`, [PLAY1])).rows).toHaveLength(3);
  });

  it('sem ninguém com cupom, começar recusa', async () => {
    await como(SUPER);
    const a = await resposta(`select public.fn_vale_show_abrir($1, array[$2]::uuid[]) as r`, [PLAY2, FORA]);
    await expect(db.query(`select public.fn_vale_show_comecar($1)`, [a.show!.id])).rejects.toThrow(/Ninguém concorrendo/);
    await resposta(`select public.fn_vale_show_encerrar($1) as r`, [a.show!.id]);
  });

  it('reexecutável', async () => {
    await db.exec(readFileSync('supabase/migrations/20261126150000_desafio_vale_sorteio_ao_vivo.sql', 'utf8'));
  });
});

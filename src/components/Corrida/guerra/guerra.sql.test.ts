// @vitest-environment node
/**
 * guerra.sql.test.ts — a migration da Guerra na Corrida (20261023150000) num
 * Postgres de verdade (PGlite, local — não é o banco), em cima das migrations
 * da corrida, com um `realtime` de mentira que só grava o que seria enviado.
 *
 * O que importa provar: só o super_admin liga, só antes da largada e só na de
 * cavalos; só quem foi chamado ataca e atira; os tetos e os freios seguram; a
 * guerra acaba entre 20 e 60 s; a vida do chefe sai de quem atacou; o diretor
 * de ritmo e o anjo são os mesmos de `regras.ts`; e o aviso vai para a sala.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { alvoDaGuerra, curaDoRitmo, GUERRA, ritmoDaLuta, vidaDoChefe } from './regras';

const ADMIN = '00000000-0000-4000-8000-0000000000a1';
const ANA   = '00000000-0000-4000-8000-0000000000c1';
const BRUNO = '00000000-0000-4000-8000-0000000000c2';
const CAIO  = '00000000-0000-4000-8000-0000000000c3';
const FORA  = '00000000-0000-4000-8000-0000000000f9';

const mig = (n: string) => readFileSync(resolve(__dirname, '../../../../supabase/migrations', n), 'utf8');
const MIGRATIONS = [
  '20261020130000_corrida_da_sorte.sql', '20261020200000_corrida_preencher_escolhas.sql', '20261020210000_corrida_tema_e_palpite.sql',
  '20261021120000_corrida_corredor_sem_perfil.sql', '20261022120000_corrida_cavalos.sql', '20261022130000_corrida_enquete.sql',
  '20261022190000_corrida_torcida.sql',
].map(mig);
const SQL_GUERRA = mig('20261023150000_corrida_guerra.sql');

let db: PGlite;

interface Guerra {
  ligada: boolean; versao: number; cavalos: number | null; alvo: number | null; comecou_em: string | null; pressao: number; sobrou_em: string | null;
  solta_em: string | null; expira_em: string | null; pessoas: number; vida_max: number | null; vida: number | null; curas: number; cura_vida: number | null;
  ritmo: number; caiu_em: string | null; ranking: { usuario: string; nome: string; dano: number }[]; fora?: boolean; freio?: boolean;
}

async function como<T>(uid: string, sql: string, params: unknown[] = []): Promise<T> {
  await db.query("select set_config('teste.uid', $1, false)", [uid]);
  await db.query("select set_config('teste.super', $1, false)", [uid === ADMIN ? 'sim' : '']);
  const r = await db.query<{ v: T }>(sql, params);
  return r.rows[0]?.v as T;
}
const ligar = (uid: string, id: number, on = true) => como<Guerra>(uid, 'select public.fn_corrida_guerra_ligar($1, $2) v', [id, on]);
const atacar = (uid: string, id: number, n: number) => como<Guerra>(uid, 'select public.fn_corrida_guerra_atacar($1, $2) v', [id, n]);
const golpear = (uid: string, id: number, dano: number, acertos: number, bolas = 0, banidos = 0) =>
  como<Guerra>(uid, 'select public.fn_corrida_guerra_golpear($1, $2, $3, $4, $5) v', [id, dano, acertos, bolas, banidos]);
const estado = (uid: string, id: number) => como<Guerra>(uid, 'select public.fn_corrida_guerra_estado($1) v', [id]);
/** O relógio: a linha da guerra «aconteceu» tantos segundos antes (o PGlite não deixa mexer no relógio). */
const recuar = (id: number, campo: 'comecou_em' | 'solta_em', s: number) =>
  db.query(`update public.corrida_guerra set ${campo} = clock_timestamp() - make_interval(secs => $2), calculado_em = '-infinity', expira_em = CASE WHEN '${campo}' = 'solta_em' THEN clock_timestamp() - make_interval(secs => $2) + interval '150 seconds' ELSE expira_em END where corrida_id = $1`, [id, s]);
const forcar = (id: number) => db.query('select public.fn_corrida_guerra_recalcular($1, true)', [id]);
/** Uma corrida em andamento por vez (o índice da 20261020130000): a anterior termina antes da próxima. */
const encerrar = () => db.query("update public.corridas set estado = 'encerrada' where estado in ('preparando', 'aberta', 'correndo')");
const avisos = async () => (await db.query<{ event: string; topic: string; payload: { guerra?: Guerra } }>('select event, topic, payload from realtime.enviados order by n')).rows;

/** Uma corrida de cavalos já montada: `estado`, e a largada (inicia_em) se já correu. */
async function corrida(estadoC: 'aberta' | 'correndo', categoria = 'cavalos'): Promise<number> {
  const r = await db.query<{ id: number }>(
    `insert into public.corridas (nome, estado, categoria, inicia_em, gravada_em, gravacao)
     values ('Corrida', $1, $2, CASE WHEN $1 = 'correndo' THEN clock_timestamp() - interval '15 seconds' END, clock_timestamp(),
             jsonb_build_object('faixa', jsonb_build_array($3::text, $4::text, $5::text), 'semente', 77, 'arquivo', 'x', 'mapa', 'manha', 'parada', 1, 'vencedor', $3::text))
     returning id`, [estadoC, categoria, ANA, BRUNO, CAIO]);
  const id = r.rows[0].id;
  await db.query(`insert into public.corrida_pessoas (corrida_id, usuario, corre, assiste, nome, entrou_em) values
    ($1, $2, true, false, 'Ana Paula', clock_timestamp()), ($1, $3, true, false, 'Bruno Lima', clock_timestamp()), ($1, $4, true, false, 'Caio', null)`, [id, ANA, BRUNO, CAIO]);
  return id;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('teste.uid', true), '')::uuid $$;
    create schema realtime;
    create table realtime.messages (topic text, extension text, payload jsonb, event text, private boolean);
    alter table realtime.messages enable row level security;
    create function realtime.topic() returns text language sql stable as $$ select ''::text $$;
    create table realtime.enviados (n serial, topic text, event text, payload jsonb);
    create function realtime.send(payload jsonb, event text, topic text, private boolean default true)
      returns void language sql
      as $$ insert into realtime.enviados (topic, event, payload) values (topic, event, payload) $$;
    create table public.setores (id uuid primary key, nome text);
    create table public.perfis (id uuid primary key, nome text, foto_url text, setor_id uuid);
    create function public.fn_user_is_super_admin() returns boolean language sql stable
      as $$ select current_setting('teste.super', true) = 'sim' $$;
    create function public.fn_realtime_posso_ouvir_usuario(p_topico text) returns boolean language sql stable
      as $$ select split_part(p_topico, ':', 2)::uuid = auth.uid() $$;
  `);
  for (const sql of MIGRATIONS) await db.exec(sql);
  await db.exec(SQL_GUERRA);
  await db.exec(SQL_GUERRA);   // reexecutável
});
beforeEach(async () => { await db.exec('delete from public.corridas; truncate realtime.enviados;'); });
afterAll(async () => { await db.close(); });

describe('20261023150000 — ligar', () => {
  it('só o super_admin, só na de cavalos, só antes da largada', async () => {
    const id = await corrida('aberta');
    await expect(ligar(ANA, id)).rejects.toThrow(/NAO_AUTORIZADO/);
    const g = await ligar(ADMIN, id);
    expect(g).toMatchObject({ ligada: true, comecou_em: null, sobrou_em: null });
    expect((await avisos()).at(-1)).toMatchObject({ event: 'guerra', topic: `corrida-sala:${id}` });
    expect((await ligar(ADMIN, id, false)).ligada).toBe(false);

    await encerrar();
    const bichos = await corrida('aberta', 'bichinhos');
    await expect(ligar(ADMIN, bichos)).rejects.toThrow(/SO_CAVALOS/);
    await encerrar();
    const correndo = await corrida('correndo');
    await expect(ligar(ADMIN, correndo)).rejects.toThrow(/JA_LARGOU/);
  });

  it('quem não foi chamado não lê o estado', async () => {
    const id = await corrida('aberta'); await ligar(ADMIN, id);
    await expect(estado(FORA, id)).rejects.toThrow(/NAO_AUTORIZADO/);
    expect((await estado(BRUNO, id)).ligada).toBe(true);
  });
});

async function emGuerra(): Promise<number> {
  const id = await corrida('aberta'); await ligar(ADMIN, id);
  await db.query("update public.corridas set estado = 'correndo', inicia_em = clock_timestamp() - interval '15 seconds' where id = $1", [id]);
  return id;
}

describe('20261023150000 — o ataque', () => {
  it('a primeira chamada começa a guerra: alvo pelos cavalos da gravação e por quem entrou no lobby', async () => {
    const id = await emGuerra();
    await expect(atacar(FORA, id, 5)).rejects.toThrow(/NAO_AUTORIZADO/);
    const g = await atacar(ANA, id, 0);
    // 3 cavalos, 2 no lobby (o Caio não entrou)
    expect(g).toMatchObject({ cavalos: 3, alvo: alvoDaGuerra(3, 2) });
    expect(g.comecou_em).not.toBeNull();
  });

  it('desligada, ou fora da corrida, não conta', async () => {
    const id = await corrida('correndo');
    expect((await atacar(ANA, id, 10)).ligada).toBe(false);
    await encerrar();
    const aberta = await corrida('aberta'); await ligar(ADMIN, aberta);
    expect((await atacar(ANA, aberta, 10)).fora).toBe(true);
  });

  it('segura 40 cliques por envio e 1 envio a cada 1,5 s por pessoa', async () => {
    const id = await emGuerra();
    await atacar(ANA, id, 500);
    await atacar(ANA, id, 500);   // cedo demais: jogado fora
    await atacar(BRUNO, id, 7);
    const r = await db.query<{ usuario: string; cliques: number }>('select usuario, cliques from public.corrida_guerra_golpes where corrida_id = $1 order by usuario', [id]);
    expect(r.rows).toEqual([{ usuario: ANA, cliques: GUERRA.maxCliquesPorEnvio }, { usuario: BRUNO, cliques: 7 }]);
  });

  it('com clique de sobra, não acaba antes de 20 s; passado o alvo, sobra um e o chefe nasce', async () => {
    const id = await emGuerra();
    await atacar(ANA, id, 0);
    await db.query('update public.corrida_guerra_golpes set cliques = 99999 where corrida_id = $1', [id]);
    await recuar(id, 'comecou_em', 5); await forcar(id);
    expect((await estado(ANA, id)).sobrou_em).toBeNull();
    await recuar(id, 'comecou_em', 21); await forcar(id);
    const g = await estado(ANA, id);
    expect(g.sobrou_em).not.toBeNull();
    expect(g.pessoas).toBe(1);
    expect(Number(g.vida_max)).toBe(vidaDoChefe(1));
    expect((Date.parse(g.solta_em!) - Date.parse(g.sobrou_em!)) / 1000).toBeCloseTo(GUERRA.filmeS, 3);
    expect((Date.parse(g.expira_em!) - Date.parse(g.solta_em!)) / 1000).toBeCloseTo(GUERRA.prazoS, 3);
    expect((await avisos()).some(a => a.event === 'guerra' && a.payload.guerra?.sobrou_em)).toBe(true);
  });

  it('sem clique nenhum, acaba sozinha em 60 s', async () => {
    const id = await emGuerra();
    await atacar(ANA, id, 0);
    await recuar(id, 'comecou_em', 50); await forcar(id);
    expect((await estado(ANA, id)).sobrou_em).toBeNull();
    await recuar(id, 'comecou_em', 61); await forcar(id);
    expect((await estado(ANA, id)).sobrou_em).not.toBeNull();
  });
});

async function comChefe(): Promise<number> {
  const id = await emGuerra();
  await atacar(ANA, id, 3); await atacar(BRUNO, id, 5);
  await recuar(id, 'comecou_em', 61); await forcar(id);
  return id;
}

describe('20261023150000 — o chefe', () => {
  it('antes de soltar não leva tiro; depois, o dano bruto vira efetivo pelo ritmo', async () => {
    const id = await comChefe();
    expect((await golpear(ANA, id, 30, 10)).fora).toBe(true);
    await recuar(id, 'solta_em', 10);
    await golpear(ANA, id, 9999, 3, 9, 9);   // teto: 3 acertos × 20, 3 bolas, 1 banido
    const vmax = vidaDoChefe(2);
    const r = await db.query<{ dano: string; efetivo: string }>('select dano, efetivo from public.corrida_guerra_golpes where corrida_id = $1 and usuario = $2', [id, ANA]);
    const bruto = 3 * 20 + 3 * GUERRA.bolaFracao * vmax + GUERRA.banidoFracao * vmax;
    expect(Number(r.rows[0].dano)).toBeCloseTo(bruto, 3);
    expect(Number(r.rows[0].efetivo) / Number(r.rows[0].dano)).toBeCloseTo(ritmoDaLuta(10, 1), 2);
    // o freio de 0,6 s
    expect((await golpear(ANA, id, 10, 2)).freio).toBe(true);
  });

  it('o ranking soma o bruto e traz o nome; quem não foi chamado não atira', async () => {
    const id = await comChefe(); await recuar(id, 'solta_em', 10);
    await golpear(ANA, id, 30, 10); await golpear(BRUNO, id, 50, 10);
    await expect(golpear(FORA, id, 10, 1)).rejects.toThrow(/NAO_AUTORIZADO/);
    await forcar(id);
    const g = await estado(ANA, id);
    expect(g.ranking.map(x => [x.nome, x.dano])).toEqual([['Bruno Lima', 50], ['Ana Paula', 30]]);
  });

  it('antes de 50 s a vida não desce dos 5%; depois, cai', async () => {
    const id = await comChefe(); await recuar(id, 'solta_em', 20);
    await db.query('update public.corrida_guerra_golpes set efetivo = 1e6 where corrida_id = $1 and usuario = $2', [id, ANA]);
    await forcar(id);
    let g = await estado(ANA, id);
    // parou no piso (e, bem atrás da linha, ainda comeu um anjo)
    expect(Number(g.vida)).toBeGreaterThanOrEqual(0.05 * Number(g.vida_max) - 0.1);
    expect(g.caiu_em).toBeNull();
    // o que passou do piso antes dos 50 s não volta: depois deles, é preciso bater de novo
    await recuar(id, 'solta_em', 55);
    await db.query('update public.corrida_guerra_golpes set efetivo = efetivo + 1e7 where corrida_id = $1 and usuario = $2', [id, ANA]);
    await forcar(id);
    g = await estado(ANA, id);
    expect(Number(g.vida)).toBe(0);
    expect(g.caiu_em).not.toBeNull();
    expect((await golpear(ANA, id, 10, 1)).fora).toBe(true);
  });

  it('o anjo: vida caindo rápido demais, ele come um anjo e cura o que o ritmo manda', async () => {
    const id = await comChefe(); await recuar(id, 'solta_em', 30);
    const vmax = vidaDoChefe(2);
    // a 30 s a linha está em 2/3; deixa a vida em 30%
    await db.query('update public.corrida_guerra_golpes set efetivo = $3 where corrida_id = $1 and usuario = $2', [id, ANA, 0.7 * vmax]);
    await forcar(id);
    const g = await estado(ANA, id);
    const cura = curaDoRitmo(30, 0.3, 30);
    expect(cura).toBeGreaterThan(0);
    expect(g.curas).toBe(1);
    expect(Number(g.cura_vida)).toBeCloseTo(cura * vmax, 0);
    expect(Number(g.vida)).toBeCloseTo((0.3 + cura) * vmax, 0);
    // e não come outro antes de 10 s
    await forcar(id);
    expect((await estado(ANA, id)).curas).toBe(1);
  });

  it('o ritmo e o anjo do banco são as contas de regras.ts', async () => {
    for (const t of [0, 15, 45, 80, 100, 130]) for (const f of [0.05, 0.3, 0.6, 0.95]) {
      const r = await db.query<{ m: string; c: string }>('select public.fn_corrida_guerra_ritmo($1, $2) m, public.fn_corrida_guerra_cura($1, $2, 30) c', [t, f]);
      expect(Number(r.rows[0].m)).toBeCloseTo(ritmoDaLuta(t, f), 4);
      expect(Number(r.rows[0].c)).toBeCloseTo(curaDoRitmo(t, f, 30), 4);
    }
  });
});

// @vitest-environment node
/**
 * banco.sql.test.ts — a migration da rádio (20261029210000) rodando num
 * Postgres de verdade (PGlite, local — não é o banco), sobre um `realtime` de
 * mentira que só grava o que seria enviado.
 *
 * O que importa provar: só quem pode ouve, o voto vale só na janela e fica
 * escondido, o sorteio respeita o peso e vira a rodada UMA vez só, e só o
 * super_admin pula ou mexe no catálogo.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const ADMIN = '00000000-0000-4000-8000-0000000000a1';
const ADMIN2 = '00000000-0000-4000-8000-0000000000a2';
const ANA   = '00000000-0000-4000-8000-0000000000c1';

const SQL = readFileSync(resolve(__dirname, '../../../../../supabase/migrations/20261029210000_radio.sql'), 'utf8');

let db: PGlite;

interface Musica { video: string; titulo: string; canal: string; capa: string | null; duracao_s: number; estilo: string; votos?: number }
interface Estado {
  rodada: number; atual: Musica | null; inicia_em: string | null; candidatas: Musica[];
  anterior: { rodada: number; motivo: string; sorteada: string; votos: number; candidatas: Musica[] } | null;
  agora: string; meu_voto: string | null; controla: boolean; no_ar: boolean;
}

async function como<T>(uid: string, sql: string, params: unknown[] = []): Promise<T> {
  await db.query("select set_config('teste.uid', $1, false)", [uid]);
  await db.query("select set_config('teste.super', $1, false)", [uid === ADMIN || uid === ADMIN2 ? 'sim' : '']);
  const r = await db.query<{ v: T }>(sql, params);
  return r.rows[0]?.v as T;
}
const ler = (uid = ADMIN) => como<Estado>(uid, 'select public.fn_radio_ler() v');
const avancar = (rodada: number, motivo = 'fim', uid = ADMIN) =>
  como<Estado>(uid, 'select public.fn_radio_avancar($1, $2) v', [rodada, motivo]);
const votar = (uid: string, rodada: number, video: string) =>
  como<{ meu_voto: string }>(uid, 'select public.fn_radio_votar($1, $2) v', [rodada, video]);

/** Põe a música no ar `segundos` atrás (o relógio do teste não anda sozinho). */
async function tocandoHa(segundos: number) {
  await db.query(`update public.radio set inicia_em = now() - make_interval(secs => $1) where id = 1`, [segundos]);
}

const video = (n: number) => `vid${String(n).padStart(8, '0')}`;

async function semear(estilos: string[], porEstilo = 4) {
  let n = 0;
  for (const nome of estilos) {
    const id = await como<number>(ADMIN, 'select public.fn_radio_estilo_salvar(null, $1, null, true) v', [nome]);
    const musicas = Array.from({ length: porEstilo }, () => {
      n++;
      return { video: video(n), titulo: `${nome} ${n}`, canal: 'Canal', capa: `https://i.ytimg.com/vi/${video(n)}/mqdefault.jpg`, duracao_s: 180 };
    });
    await como(ADMIN, 'select public.fn_radio_importar($1, $2::jsonb) v', [id, JSON.stringify(musicas)]);
  }
}

async function avisos(): Promise<{ topic: string; event: string; payload: Record<string, unknown> }[]> {
  return (await db.query<{ topic: string; event: string; payload: Record<string, unknown> }>(
    'select topic, event, payload from realtime.enviados order by n')).rows;
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

    create function public.fn_user_is_super_admin() returns boolean language sql stable
      as $$ select current_setting('teste.super', true) = 'sim' $$;
  `);
  await db.exec(SQL);
  // Reexecutável: aplicar de novo não quebra.
  await db.exec(SQL);
});

beforeEach(async () => {
  await db.exec(`
    delete from public.radio_votos; delete from public.radio_estilos;
    update public.radio set no_ar = true, rodada = 0, atual = null, inicia_em = null, candidatas = '[]', anterior = null;
    truncate realtime.enviados;
  `);
});

afterAll(async () => { await db.close(); });

describe('20261029210000 — quem ouve', () => {
  it('só o super_admin lê, vota e vira a rádio', async () => {
    await expect(ler(ANA)).rejects.toThrow(/NAO_AUTORIZADO/);
    await expect(avancar(0, 'fim', ANA)).rejects.toThrow(/NAO_AUTORIZADO/);
    await expect(votar(ANA, 0, video(1))).rejects.toThrow(/NAO_AUTORIZADO/);
    await expect(como(ANA, 'select public.fn_radio_catalogo() v')).rejects.toThrow(/NAO_AUTORIZADO/);
    await expect(como(ANA, "select public.fn_radio_estilo_salvar(null, 'Funk', null, true) v")).rejects.toThrow(/NAO_AUTORIZADO/);
    const e = await ler();
    expect(e).toMatchObject({ rodada: 0, atual: null, meu_voto: null, controla: true, no_ar: true });
    expect(typeof e.agora).toBe('string');
  });

  it('nasce desligada', async () => {
    const r = await db.query<{ no_ar: boolean }>("select column_default is not null and column_default = 'false' as no_ar from information_schema.columns where table_name = 'radio' and column_name = 'no_ar'");
    expect(r.rows[0].no_ar).toBe(true);
  });

  it('a policy do tópico passa pela mesma porta', async () => {
    const r = await db.query<{ qual: string }>(
      "select pg_get_expr(polqual, polrelid) qual from pg_policy where polname = 'radio_receber'");
    expect(r.rows[0].qual).toMatch(/radio:geral/);
    expect(r.rows[0].qual).toMatch(/fn_radio_pode_ouvir/);
  });
});

describe('20261029210000 — o sorteio', () => {
  it('rádio vazia continua vazia, sem estourar', async () => {
    const e = await avancar(0);
    expect(e.atual).toBeNull();
    expect(e.candidatas).toEqual([]);
  });

  it('a primeira música entra com 3 candidatas de estilos diferentes, e avisa todo mundo', async () => {
    await semear(['Funk', 'Trap', 'Internacional', 'Sertanejo', 'Pagode']);
    const e = await avancar(0);
    expect(e.rodada).toBe(1);
    expect(e.atual?.video).toMatch(/^vid/);
    expect(e.inicia_em).not.toBeNull();
    expect(e.candidatas).toHaveLength(3);
    expect(new Set(e.candidatas.map(c => c.estilo)).size).toBe(3);
    expect(e.candidatas.map(c => c.video)).not.toContain(e.atual?.video);
    expect(e.anterior).toBeNull();
    const a = await avisos();
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ topic: 'radio:geral', event: 'mudou' });
    expect(a[0].payload).toMatchObject({ rodada: 1 });
    // O aviso não leva voto de ninguém.
    expect(a[0].payload).not.toHaveProperty('meu_voto');
  });

  it('com menos de 3 estilos, completa com músicas do que houver', async () => {
    await semear(['Funk'], 6);
    const e = await avancar(0);
    expect(e.candidatas).toHaveLength(3);
    expect(new Set(e.candidatas.map(c => c.video)).size).toBe(3);
  });

  it('antes do fim não vira; no fim, vira UMA vez (quem chega depois recebe o mesmo)', async () => {
    await semear(['Funk', 'Trap', 'Internacional']);
    await avancar(0);
    await tocandoHa(60);
    expect((await avancar(1)).rodada).toBe(1);
    await tocandoHa(180);
    const primeiro = await avancar(1);
    const segundo = await avancar(1, 'fim', ADMIN2);
    expect(primeiro.rodada).toBe(2);
    expect(segundo.rodada).toBe(2);
    expect(segundo.atual).toEqual(primeiro.atual);
    expect((await avisos()).length).toBe(2);
  });

  it('a sorteada é uma das candidatas, e o resultado mostra a contagem', async () => {
    await semear(['Funk', 'Trap', 'Internacional']);
    const e1 = await avancar(0);
    await tocandoHa(150);
    await votar(ADMIN, 1, e1.candidatas[0].video);
    await votar(ADMIN2, 1, e1.candidatas[0].video);
    await tocandoHa(180);
    const e2 = await avancar(1);
    expect(e1.candidatas.map(c => c.video)).toContain(e2.atual?.video);
    expect(e2.anterior).toMatchObject({ rodada: 1, motivo: 'fim', votos: 2, sorteada: e2.atual?.video });
    expect(e2.anterior?.candidatas.map(c => c.votos)).toEqual([2, 0, 0]);
    // Os votos da rodada que acabou saem.
    expect((await db.query('select 1 from public.radio_votos')).rows).toHaveLength(0);
  });

  it('votar aumenta a chance, não garante', async () => {
    await semear(['Funk', 'Trap', 'Internacional'], 1);
    let ganhou = 0;
    const vezes = 150;
    for (let i = 0; i < vezes; i++) {
      await db.exec(`
        update public.radio set rodada = 1, inicia_em = now() - interval '150 seconds',
          atual = '{"video":"vid99999999","titulo":"x","canal":"","capa":null,"duracao_s":180,"estilo":"Funk"}',
          candidatas = (select jsonb_agg(jsonb_build_object('video', video, 'titulo', titulo, 'canal', canal,
            'capa', capa, 'duracao_s', duracao_s, 'estilo', 'x') order by video) from public.radio_musicas);
        delete from public.radio_votos;
      `);
      await votar(ADMIN, 1, video(1));
      await votar(ADMIN2, 1, video(1));
      await tocandoHa(180);
      const e = await avancar(1);
      if (e.atual?.video === video(1)) ganhou++;
    }
    // Pesos 3, 1, 1: 60% de chance. Nem sempre, mas bem mais que 1/3.
    expect(ganhou / vezes).toBeGreaterThan(0.45);
    expect(ganhou).toBeLessThan(vezes);
  });
});

describe('20261029210000 — o voto', () => {
  it('só na janela: abre 60 s antes do fim, fecha 5 s antes', async () => {
    await semear(['Funk', 'Trap', 'Internacional']);
    const e = await avancar(0);
    const alvo = e.candidatas[1].video;
    await tocandoHa(30);
    await expect(votar(ADMIN, 1, alvo)).rejects.toThrow(/VOTACAO_FECHADA/);
    await tocandoHa(125);
    await expect(votar(ADMIN, 1, alvo)).resolves.toMatchObject({ meu_voto: alvo });
    await tocandoHa(176);
    await expect(votar(ADMIN, 1, alvo)).rejects.toThrow(/VOTACAO_ENCERRADA/);
  });

  it('um voto por pessoa, dá para trocar, e só em candidata desta rodada', async () => {
    await semear(['Funk', 'Trap', 'Internacional']);
    const e = await avancar(0);
    await tocandoHa(150);
    await votar(ADMIN, 1, e.candidatas[0].video);
    await votar(ADMIN, 1, e.candidatas[2].video);
    expect((await ler()).meu_voto).toBe(e.candidatas[2].video);
    expect((await ler(ADMIN2)).meu_voto).toBeNull();
    expect((await db.query('select 1 from public.radio_votos')).rows).toHaveLength(1);
    await expect(votar(ADMIN, 1, e.atual!.video)).rejects.toThrow(/CANDIDATA_INVALIDA/);
    await expect(votar(ADMIN, 7, e.candidatas[0].video)).rejects.toThrow(/RODADA_PASSOU/);
  });

  it('o estado não mostra a contagem da rodada no ar', async () => {
    await semear(['Funk', 'Trap', 'Internacional']);
    const e = await avancar(0);
    await tocandoHa(150);
    await votar(ADMIN, 1, e.candidatas[0].video);
    const lido = await ler(ADMIN2);
    expect(lido.candidatas.every(c => c.votos === undefined)).toBe(true);
  });
});

describe('20261029210000 — pular e erro', () => {
  it('pular é só do super_admin e vira na hora', async () => {
    await semear(['Funk', 'Trap', 'Internacional']);
    await avancar(0);
    await tocandoHa(10);
    await expect(avancar(1, 'pular', ANA)).rejects.toThrow(/NAO_AUTORIZADO/);
    const e = await avancar(1, 'pular');
    expect(e.rodada).toBe(2);
    expect(e.anterior?.motivo).toBe('pular');
  });

  it('erro no começo tira a música do catálogo; depois de 45 s não vale', async () => {
    await semear(['Funk', 'Trap', 'Internacional']);
    const e1 = await avancar(0);
    await tocandoHa(60);
    expect((await avancar(1, 'erro')).rodada).toBe(1);
    await tocandoHa(5);
    const e2 = await avancar(1, 'erro');
    expect(e2.rodada).toBe(2);
    const r = await db.query<{ ativa: boolean }>('select ativa from public.radio_musicas where video = $1', [e1.atual!.video]);
    expect(r.rows.every(x => !x.ativa)).toBe(true);
  });

  it('motivo inventado não passa', async () => {
    await expect(avancar(0, 'qualquer')).rejects.toThrow(/MOTIVO_INVALIDO/);
  });
});

describe('20261029210000 — o controle do super_admin', () => {
  const ligar = (sim: boolean, uid = ADMIN) => como<Estado>(uid, 'select public.fn_radio_ligar($1) v', [sim]);

  it('desligar para tudo para todo mundo; desligada, nada vira e ninguém vota', async () => {
    await semear(['Funk', 'Trap', 'Internacional']);
    await avancar(0);
    await expect(ligar(false, ANA)).rejects.toThrow(/NAO_AUTORIZADO/);
    await db.exec('truncate realtime.enviados');
    const off = await ligar(false);
    expect(off).toMatchObject({ no_ar: false, atual: null, candidatas: [] });
    expect((await avisos())[0].payload).toMatchObject({ no_ar: false });
    await tocandoHa(999);
    expect((await avancar(off.rodada)).atual).toBeNull();
    await expect(votar(ADMIN, off.rodada, video(1))).rejects.toThrow(/RODADA_PASSOU/);
    await expect(como(ADMIN, 'select public.fn_radio_tocar($1) v', [video(1)])).rejects.toThrow(/RADIO_DESLIGADA/);
  });

  it('ligar começa já, com uma sorteada e a votação nova', async () => {
    await semear(['Funk', 'Trap', 'Internacional']);
    await ligar(false);
    const on = await ligar(true);
    expect(on.no_ar).toBe(true);
    expect(on.atual?.video).toMatch(/^vid/);
    expect(on.candidatas).toHaveLength(3);
    expect(on.anterior).toBeNull();
    // Ligar de novo não troca a música.
    expect((await ligar(true)).atual).toEqual(on.atual);
  });

  it('tocar agora põe a escolhida no ar, com a contagem da que saiu', async () => {
    await semear(['Funk', 'Trap', 'Internacional']);
    const e = await avancar(0);
    const escolhida = [1, 2, 3, 4, 5, 6].map(video).find(v => v !== e.atual?.video && !e.candidatas.some(c => c.video === v))!;
    await expect(como(ANA, 'select public.fn_radio_tocar($1) v', [escolhida])).rejects.toThrow(/NAO_AUTORIZADO/);
    await expect(como(ADMIN, 'select public.fn_radio_tocar($1) v', ['naoexiste00'])).rejects.toThrow(/MUSICA_SUMIU/);
    const t = await como<Estado>(ADMIN, 'select public.fn_radio_tocar($1) v', [escolhida]);
    expect(t.atual?.video).toBe(escolhida);
    expect(t.anterior?.motivo).toBe('trocar');
  });

  it('trocar uma candidata derruba só os votos dela; sortear de novo derruba todos', async () => {
    await semear(['Funk', 'Trap', 'Internacional'], 5);
    const e = await avancar(0);
    await tocandoHa(150);
    await votar(ADMIN, 1, e.candidatas[0].video);
    await votar(ADMIN2, 1, e.candidatas[1].video);
    const livre = Array.from({ length: 15 }, (_, i) => video(i + 1))
      .find(v => v !== e.atual?.video && !e.candidatas.some(c => c.video === v))!;

    await expect(como(ANA, 'select public.fn_radio_candidata_trocar($1, $2, $3) v', [1, 1, livre])).rejects.toThrow(/NAO_AUTORIZADO/);
    await expect(como(ADMIN, 'select public.fn_radio_candidata_trocar($1, $2, $3) v', [1, 4, livre])).rejects.toThrow(/POSICAO_INVALIDA/);
    await expect(como(ADMIN, 'select public.fn_radio_candidata_trocar($1, $2, $3) v', [1, 1, e.atual!.video])).rejects.toThrow(/MUSICA_REPETIDA/);
    await expect(como(ADMIN, 'select public.fn_radio_candidata_trocar($1, $2, $3) v', [1, 1, e.candidatas[2].video])).rejects.toThrow(/MUSICA_REPETIDA/);

    const t = await como<Estado>(ADMIN, 'select public.fn_radio_candidata_trocar($1, $2, $3) v', [1, 1, livre]);
    expect(t.candidatas.map(c => c.video)).toEqual([livre, e.candidatas[1].video, e.candidatas[2].video]);
    expect(t.meu_voto).toBeNull();
    expect((await ler(ADMIN2)).meu_voto).toBe(e.candidatas[1].video);

    const s = await como<Estado>(ADMIN, 'select public.fn_radio_candidatas_sortear($1) v', [1]);
    expect(s.candidatas).toHaveLength(3);
    expect((await db.query('select 1 from public.radio_votos')).rows).toHaveLength(0);

    await tocandoHa(177);
    await expect(como(ADMIN, 'select public.fn_radio_candidatas_sortear($1) v', [1])).rejects.toThrow(/VOTACAO_ENCERRADA/);
  });

  it('a busca acha por título, canal ou estilo, uma vez cada vídeo', async () => {
    await semear(['Funk', 'Trap'], 3);
    expect(await como<Musica[]>(ADMIN, 'select public.fn_radio_musicas($1) v', ['trap'])).toHaveLength(3);
    expect(await como<Musica[]>(ADMIN, 'select public.fn_radio_musicas($1) v', ['funk 2'])).toEqual([expect.objectContaining({ video: video(2) })]);
    expect(await como<Musica[]>(ADMIN, 'select public.fn_radio_musicas(null) v')).toHaveLength(6);
    await expect(como(ANA, 'select public.fn_radio_musicas(null) v')).rejects.toThrow(/NAO_AUTORIZADO/);
  });
});

describe('20261029210000 — catálogo', () => {
  it('importar substitui a lista, ignora o que vem torto e conta o que entrou e saiu', async () => {
    const id = await como<number>(ADMIN, "select public.fn_radio_estilo_salvar(null, 'Funk', 'PLabcdefghij', true) v");
    const lista = [
      { video: video(1), titulo: 'Um', canal: 'A', capa: 'https://i.ytimg.com/a.jpg', duracao_s: 200 },
      { video: video(2), titulo: 'Dois', canal: 'B', capa: 'https://malicioso/x.jpg', duracao_s: 200 },
      { video: video(2), titulo: 'Dois de novo', canal: 'B', capa: null, duracao_s: 200 },
      { video: 'curto', titulo: 'Id torto', canal: '', capa: null, duracao_s: 200 },
      { video: video(3), titulo: 'Longa', canal: '', capa: null, duracao_s: 3600 },
      { video: video(4), titulo: '   ', canal: '', capa: null, duracao_s: 200 },
    ];
    expect(await como(ADMIN, 'select public.fn_radio_importar($1, $2::jsonb) v', [id, JSON.stringify(lista)]))
      .toEqual({ musicas: 2, sairam: 0 });
    const capa = await db.query<{ capa: string | null }>('select capa from public.radio_musicas where video = $1', [video(2)]);
    expect(capa.rows[0].capa).toBeNull();

    const nova = [{ video: video(5), titulo: 'Cinco', canal: '', capa: null, duracao_s: 120 }];
    expect(await como(ADMIN, 'select public.fn_radio_importar($1, $2::jsonb) v', [id, JSON.stringify(nova)]))
      .toEqual({ musicas: 1, sairam: 2 });
    expect(await como(ADMIN, 'select public.fn_radio_importar($1, $2::jsonb, false) v', [id, JSON.stringify(lista)]))
      .toEqual({ musicas: 2, sairam: 0 });

    const cat = await como<{ estilos: { nome: string; musicas: number; playlist: string }[] }>(ADMIN, 'select public.fn_radio_catalogo() v');
    expect(cat.estilos).toEqual([expect.objectContaining({ nome: 'Funk', musicas: 3, playlist: 'PLabcdefghij' })]);
  });

  it('nome repetido não entra; apagar leva as músicas junto', async () => {
    await semear(['Funk']);
    await expect(como(ADMIN, "select public.fn_radio_estilo_salvar(null, '  funk ', null, true) v")).rejects.toThrow(/NOME_REPETIDO/);
    const id = (await db.query<{ id: number }>('select id from public.radio_estilos')).rows[0].id;
    await como(ADMIN, 'select public.fn_radio_estilo_apagar($1) v', [id]);
    expect((await db.query('select 1 from public.radio_musicas')).rows).toHaveLength(0);
  });

  it('estilo desligado não entra nas candidatas', async () => {
    await semear(['Funk', 'Trap', 'Internacional', 'Pagode']);
    const pagode = (await db.query<{ id: number }>("select id from public.radio_estilos where nome = 'Pagode'")).rows[0].id;
    await como(ADMIN, "select public.fn_radio_estilo_salvar($1, 'Pagode', null, false) v", [pagode]);
    for (let i = 0; i < 10; i++) {
      await db.exec("update public.radio set rodada = 0, atual = null, candidatas = '[]'");
      const e = await avancar(0);
      expect(e.candidatas.map(c => c.estilo)).not.toContain('Pagode');
      expect(e.atual?.estilo).not.toBe('Pagode');
    }
  });

  it('tirar uma música apaga de todos os estilos', async () => {
    await semear(['Funk']);
    expect(await como(ADMIN, 'select public.fn_radio_musica_tirar($1) v', [video(1)])).toBe(1);
  });
});

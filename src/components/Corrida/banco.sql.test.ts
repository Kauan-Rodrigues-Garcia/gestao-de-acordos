// @vitest-environment node
/**
 * banco.sql.test.ts — a migration da Corrida da Sorte (20261020130000) rodando
 * num Postgres de verdade (PGlite, local — não é o banco), sobre um `realtime`
 * de mentira que só grava o que seria enviado.
 *
 * O que importa provar: cada coisa chega só para quem deve (quem corre escolhe,
 * quem foi chamado assiste, ninguém mais), e só o super_admin comanda.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const ADMIN = '00000000-0000-4000-8000-0000000000a1';
const ANA   = '00000000-0000-4000-8000-0000000000c1';
const BRUNO = '00000000-0000-4000-8000-0000000000c2';
const CAIO  = '00000000-0000-4000-8000-0000000000c3';
const DORA  = '00000000-0000-4000-8000-0000000000c4';
const SETOR = '00000000-0000-4000-8000-0000000000e1';

const SQL = readFileSync(resolve(__dirname, '../../../supabase/migrations/20261020130000_corrida_da_sorte.sql'), 'utf8');
const SQL_PREENCHER = readFileSync(resolve(__dirname, '../../../supabase/migrations/20261020200000_corrida_preencher_escolhas.sql'), 'utf8');
const SQL_TEMA = readFileSync(resolve(__dirname, '../../../supabase/migrations/20261020210000_corrida_tema_e_palpite.sql'), 'utf8');
const SQL_AVULSO = readFileSync(resolve(__dirname, '../../../supabase/migrations/20261021120000_corrida_corredor_sem_perfil.sql'), 'utf8');

let db: PGlite;

interface Pessoa { usuario: string; nome: string; setor: string | null; foto: string | null; corre: boolean; assiste: boolean; escolha: number | null; entrou_em: string | null }
interface Corrida { id: number; estado: string; premio: string | null; aberta_em: string | null; inicia_em: string | null; gravada_em: string | null; gravacao: Record<string, unknown> | null; vencedor_nome: string | null; corredores: number; chamados: number; escolheram: number; no_lobby: number }
interface Minha { agora: string; corrida: Corrida | null; eu: Pessoa | null; divulgacao: { id: number; titulo: string } | null }
interface Painel { corrida: Corrida | null; pessoas: Pessoa[]; divulgacoes: { id: number; alvos: number; fecharam: number }[] }

async function como<T>(uid: string, sql: string, params: unknown[] = []): Promise<T> {
  await db.query("select set_config('teste.uid', $1, false)", [uid]);
  await db.query("select set_config('teste.super', $1, false)", [uid === ADMIN ? 'sim' : '']);
  const r = await db.query<{ v: T }>(sql, params);
  return r.rows[0]?.v as T;
}
const minha = (uid: string) => como<Minha>(uid, 'select public.fn_corrida_minha() v');
const criar = (corredores: string[], plateia: string[], premio = 'R$ 30') =>
  como<Painel>(ADMIN, 'select public.fn_corrida_criar($1, $2, $3, $4) v', ['Corrida da Sorte', premio, corredores, plateia]);
const idAtual = async () => (await como<Painel>(ADMIN, 'select public.fn_corrida_painel() v')).corrida!.id;
const gravacao = (vencedor: string) => ({ arquivo: '1/corrida.bin', mapa: 'pixel', semente: 1234, vencedor, video: '1/festa.webm' });

async function avisos(): Promise<{ topic: string; event: string; payload: Record<string, unknown> }[]> {
  return (await db.query<{ topic: string; event: string; payload: Record<string, unknown> }>('select topic, event, payload from realtime.enviados order by n')).rows;
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
    insert into public.setores values ('${SETOR}', 'Recuperação');
    create table public.perfis (id uuid primary key, nome text, foto_url text, setor_id uuid);
    insert into public.perfis values
      ('${ADMIN}', 'Cleber', null, null),
      ('${ANA}', 'Ana Paula', 'https://x/ana.png', '${SETOR}'), ('${BRUNO}', 'Bruno Lima', null, '${SETOR}'),
      ('${CAIO}', '  ', null, null), ('${DORA}', 'Dora', null, '${SETOR}');
    create function public.fn_user_is_super_admin() returns boolean language sql stable
      as $$ select current_setting('teste.super', true) = 'sim' $$;
    create function public.fn_realtime_posso_ouvir_usuario(p_topico text) returns boolean language sql stable
      as $$ select split_part(p_topico, ':', 2)::uuid = auth.uid() $$;
  `);
  await db.exec(SQL);
  // Reexecutável: aplicar de novo não quebra.
  await db.exec(SQL);
  await db.exec(SQL_PREENCHER);
  await db.exec(SQL_PREENCHER);
  await db.exec(SQL_TEMA);
  await db.exec(SQL_TEMA);
  await db.exec(SQL_AVULSO);
  await db.exec(SQL_AVULSO);
});

beforeEach(async () => {
  await db.exec('delete from public.corridas; delete from public.corrida_divulgacoes; truncate realtime.enviados;');
});

afterAll(async () => { await db.close(); });

describe('20261020130000 — criar', () => {
  it('só o super_admin cria', async () => {
    await expect(como(ANA, 'select public.fn_corrida_criar($1, $2, $3, $4) v', ['x', null, [ANA, BRUNO], []])).rejects.toThrow(/NAO_AUTORIZADO/);
    await expect(como(ANA, 'select public.fn_corrida_painel() v')).rejects.toThrow(/NAO_AUTORIZADO/);
  });

  it('copia nome, setor e foto do cadastro; nome vazio vira «Alguém»', async () => {
    const p = await criar([ANA, BRUNO, CAIO], [DORA]);
    const porId = new Map(p.pessoas.map(x => [x.usuario, x]));
    expect(porId.get(ANA)).toMatchObject({ nome: 'Ana Paula', setor: 'Recuperação', foto: 'https://x/ana.png', corre: true, assiste: false });
    expect(porId.get(CAIO)?.nome).toBe('Alguém');
    expect(porId.get(DORA)).toMatchObject({ corre: false, assiste: true });
    expect(p.corrida).toMatchObject({ estado: 'preparando', premio: 'R$ 30', corredores: 3, chamados: 4 });
  });

  it('o convite para escolher vai só para quem corre, cada um no seu tópico', async () => {
    await criar([ANA, BRUNO], [DORA]);
    const a = await avisos();
    expect(a.map(x => x.topic).sort()).toEqual([`corrida-eu:${ANA}`, `corrida-eu:${BRUNO}`].sort());
    expect(a.every(x => x.event === 'corrida')).toBe(true);
    // O conteúdo é o estado da própria pessoa: não precisa reler nada.
    expect((a[0].payload as unknown as Minha).corrida?.estado).toBe('preparando');
  });

  it('na fase de escolha, quem só assiste não fica sabendo; quem corre, sim', async () => {
    await criar([ANA, BRUNO], [DORA]);
    expect((await minha(DORA)).corrida).toBeNull();
    expect((await minha(ANA)).eu).toMatchObject({ corre: true, escolha: null });
    expect((await minha(CAIO)).corrida).toBeNull();
  });

  it('duas corridas em andamento, não; e precisa de 2 pessoas correndo', async () => {
    await expect(criar([ANA], [])).rejects.toThrow(/POUCA_GENTE/);
    await criar([ANA, BRUNO], []);
    await expect(criar([ANA, BRUNO], [])).rejects.toThrow(/JA_TEM_UMA/);
  });
});

describe('20261020130000 — escolher o bichinho', () => {
  it('quem corre escolhe 0, 1 ou 2; quem não corre, não', async () => {
    await criar([ANA, BRUNO], [DORA]);
    const id = await idAtual();
    const r = await como<Minha>(ANA, 'select public.fn_corrida_escolher($1, 2::smallint) v', [id]);
    expect(r.eu?.escolha).toBe(2);
    await expect(como(DORA, 'select public.fn_corrida_escolher($1, 0::smallint) v', [id])).rejects.toThrow(/NAO_CORRE/);
    await expect(como(ANA, 'select public.fn_corrida_escolher($1, 3::smallint) v', [id])).rejects.toThrow(/ESCOLHA_INVALIDA/);
  });

  it('depois de gravada, a escolha fecha', async () => {
    await criar([ANA, BRUNO], []);
    const id = await idAtual();
    await como(ADMIN, 'select public.fn_corrida_gravar($1, $2) v', [id, gravacao(ANA)]);
    await expect(como(BRUNO, 'select public.fn_corrida_escolher($1, 1::smallint) v', [id])).rejects.toThrow(/ESCOLHA_FECHADA/);
  });
});

describe('20261020130000 — abrir, entrar, gravar e largar', () => {
  it('abrir manda o card para todo mundo chamado e mais ninguém', async () => {
    await criar([ANA, BRUNO], [DORA]);
    const id = await idAtual();
    await db.exec('truncate realtime.enviados');
    await como(ADMIN, 'select public.fn_corrida_abrir($1) v', [id]);
    const a = await avisos();
    expect(a.filter(x => x.event === 'corrida').map(x => x.topic).sort()).toEqual([ANA, BRUNO, DORA].map(u => `corrida-eu:${u}`).sort());
    expect(a.some(x => x.topic === `corrida-sala:${id}` && x.event === 'estado')).toBe(true);
    expect((await minha(DORA)).corrida?.estado).toBe('aberta');
    expect((await minha(CAIO)).corrida).toBeNull();
  });

  it('só quem foi chamado entra no lobby e lê a sala; o tópico da sala também', async () => {
    await criar([ANA, BRUNO], [DORA]);
    const id = await idAtual();
    await expect(como(ANA, 'select public.fn_corrida_entrar($1) v', [id])).rejects.toThrow(/SEM_LOBBY/);
    await como(ADMIN, 'select public.fn_corrida_abrir($1) v', [id]);
    const sala = await como<{ pessoas: Pessoa[] }>(DORA, 'select public.fn_corrida_entrar($1) v', [id]);
    expect(sala.pessoas.find(p => p.usuario === DORA)?.entrou_em).toBeTruthy();
    await expect(como(CAIO, 'select public.fn_corrida_entrar($1) v', [id])).rejects.toThrow(/NAO_AUTORIZADO/);
    await expect(como(CAIO, 'select public.fn_corrida_sala($1) v', [id])).rejects.toThrow(/NAO_AUTORIZADO/);
    expect(await como(DORA, `select public.fn_realtime_posso_ouvir_corrida('corrida-sala:${id}') v`)).toBe(true);
    expect(await como(CAIO, `select public.fn_realtime_posso_ouvir_corrida('corrida-sala:${id}') v`)).toBe(false);
    expect(await como(CAIO, "select public.fn_realtime_posso_ouvir_corrida('corrida-sala:abc') v")).toBe(false);
  });

  it('quem entra avisa a sala no máximo a cada 1,5 s, levando quem entrou desde o anterior', async () => {
    await criar([ANA, BRUNO], [DORA]);
    const id = await idAtual();
    await como(ADMIN, 'select public.fn_corrida_abrir($1) v', [id]);
    await db.exec('truncate realtime.enviados');
    await como(ANA, 'select public.fn_corrida_entrar($1) v', [id]);
    await como(BRUNO, 'select public.fn_corrida_entrar($1) v', [id]);
    let lobby = (await avisos()).filter(a => a.event === 'lobby');
    expect(lobby).toHaveLength(1);
    // Passa o freio: o próximo aviso leva o Bruno (que tinha ficado no freio) e a Dora.
    await db.exec(`update public.corridas set lobby_avisado_em = lobby_avisado_em - interval '3 seconds'`);
    await como(DORA, 'select public.fn_corrida_entrar($1) v', [id]);
    lobby = (await avisos()).filter(a => a.event === 'lobby');
    expect(lobby).toHaveLength(2);
    const entraram = (lobby[1].payload.entraram as { usuario: string }[]).map(e => e.usuario);
    expect(entraram).toEqual(expect.arrayContaining([BRUNO, DORA]));
    // Entrar de novo (outra aba) não avisa ninguém.
    await db.exec(`update public.corridas set lobby_avisado_em = lobby_avisado_em - interval '3 seconds'`);
    await como(DORA, 'select public.fn_corrida_entrar($1) v', [id]);
    expect((await avisos()).filter(a => a.event === 'lobby')).toHaveLength(2);
    // A conferência de 30 s acha todo mundo.
    const conf = await como<{ entraram: unknown[] }>(ANA, 'select public.fn_corrida_lobby($1, null) v', [id]);
    expect(conf.entraram).toHaveLength(3);
  });

  it('gravar exige vencedor que corre; largar exige aberta e gravada; a largada é a hora do banco + 4 s', async () => {
    await criar([ANA, BRUNO], [DORA]);
    const id = await idAtual();
    await expect(como(ADMIN, 'select public.fn_corrida_gravar($1, $2) v', [id, gravacao(DORA)])).rejects.toThrow(/GRAVACAO_INCOMPLETA/);
    await expect(como(ADMIN, 'select public.fn_corrida_gravar($1, $2) v', [id, { mapa: 'x' }])).rejects.toThrow(/GRAVACAO_INCOMPLETA/);
    await como(ADMIN, 'select public.fn_corrida_gravar($1, $2) v', [id, gravacao(ANA)]);
    await expect(como(ADMIN, 'select public.fn_corrida_iniciar($1) v', [id])).rejects.toThrow(/NAO_DA/);
    await como(ADMIN, 'select public.fn_corrida_abrir($1) v', [id]);
    await expect(como(ANA, 'select public.fn_corrida_iniciar($1) v', [id])).rejects.toThrow(/NAO_AUTORIZADO/);
    const p = await como<Painel & { agora: string }>(ADMIN, 'select public.fn_corrida_iniciar($1) v', [id]);
    expect(p.corrida).toMatchObject({ estado: 'correndo', vencedor_nome: 'Ana Paula' });
    const folga = Date.parse(p.corrida!.inicia_em!) - Date.parse(p.agora);
    expect(folga).toBeGreaterThan(3500);
    expect(folga).toBeLessThan(4500);
    // Quem chega atrasado ainda entra (pega a corrida no ponto em que ela está).
    expect(await como(DORA, 'select public.fn_corrida_entrar($1) v', [id])).toBeTruthy();
  });

  it('depois de gravada, ninguém troca as pessoas nem o prêmio; descartar a gravação libera', async () => {
    await criar([ANA, BRUNO], [DORA]);
    const id = await idAtual();
    await como(ADMIN, 'select public.fn_corrida_gravar($1, $2) v', [id, gravacao(BRUNO)]);
    await expect(como(ADMIN, 'select public.fn_corrida_ajustar($1, $2, $3, $4) v', [id, 'R$ 50', [ANA, BRUNO, DORA], []])).rejects.toThrow(/JA_GRAVADA/);
    await como(ADMIN, 'select public.fn_corrida_gravar($1, null) v', [id]);
    const p = await como<Painel>(ADMIN, 'select public.fn_corrida_ajustar($1, $2, $3, $4) v', [id, 'R$ 50', [ANA, BRUNO, DORA], []]);
    expect(p.corrida).toMatchObject({ premio: 'R$ 50', corredores: 3, gravada_em: null });
  });

  it('ajustar avisa quem entrou e quem saiu da lista', async () => {
    await criar([ANA, BRUNO], [DORA]);
    const id = await idAtual();
    await db.exec('truncate realtime.enviados');
    await como(ADMIN, 'select public.fn_corrida_ajustar($1, $2, $3, $4) v', [id, null, [ANA, CAIO], [DORA]]);
    const pessoais = (await avisos()).filter(a => a.event === 'corrida').map(a => a.topic).sort();
    expect(pessoais).toEqual([`corrida-eu:${BRUNO}`, `corrida-eu:${CAIO}`].sort());
    expect((await minha(BRUNO)).corrida).toBeNull();
  });

  it('cancelar libera a próxima; encerrada some da tela depois de 15 min', async () => {
    await criar([ANA, BRUNO], [DORA]);
    const id = await idAtual();
    await como(ADMIN, 'select public.fn_corrida_abrir($1) v', [id]);
    await como(ADMIN, 'select public.fn_corrida_encerrar($1, true) v', [id]);
    expect((await minha(DORA)).corrida).toBeNull();
    await criar([ANA, BRUNO], []);
  });

  it('uma corrida esquecida «correndo» não segura a próxima', async () => {
    await criar([ANA, BRUNO], []);
    const id = await idAtual();
    await como(ADMIN, 'select public.fn_corrida_gravar($1, $2) v', [id, gravacao(ANA)]);
    await como(ADMIN, 'select public.fn_corrida_abrir($1) v', [id]);
    await como(ADMIN, 'select public.fn_corrida_iniciar($1) v', [id]);
    await db.exec(`update public.corridas set inicia_em = inicia_em - interval '20 minutes'`);
    const p = await criar([ANA, BRUNO], []);
    expect(p.corrida?.id).not.toBe(id);
  });
});

describe('20261020130000 — o card de divulgação', () => {
  it('chega só para quem foi escolhido e some quando a pessoa fecha', async () => {
    await expect(como(ANA, 'select public.fn_corrida_divulgar($1, $2, $3, $4, 3) v', ['Vem aí', 'Fique de olho', null, [ANA]])).rejects.toThrow(/NAO_AUTORIZADO/);
    const p = await como<Painel>(ADMIN, 'select public.fn_corrida_divulgar($1, $2, $3, $4, 3) v', ['Vem aí', 'Fique de olho', 'R$ 30', [ANA, BRUNO]]);
    expect(p.divulgacoes[0]).toMatchObject({ alvos: 2, fecharam: 0 });
    expect((await avisos()).map(a => a.topic).sort()).toEqual([`corrida-eu:${ANA}`, `corrida-eu:${BRUNO}`].sort());
    const d = (await minha(ANA)).divulgacao!;
    expect(d.titulo).toBe('Vem aí');
    expect((await minha(DORA)).divulgacao).toBeNull();
    expect((await como<Minha>(ANA, 'select public.fn_corrida_divulgacao_fechar($1) v', [d.id])).divulgacao).toBeNull();
    expect((await como<Painel>(ADMIN, 'select public.fn_corrida_painel() v')).divulgacoes[0].fecharam).toBe(1);
  });

  it('tirar do ar antes do prazo some com o card de quem ainda não fechou', async () => {
    const p = await como<Painel>(ADMIN, 'select public.fn_corrida_divulgar($1, $2, $3, $4, 3) v', ['Vem aí', 'Fique de olho', null, [ANA]]);
    await como(ADMIN, 'select public.fn_corrida_divulgacao_encerrar($1) v', [p.divulgacoes[0].id]);
    expect((await minha(ANA)).divulgacao).toBeNull();
  });
});

describe('20261020210000 — o cenário do lobby e o palpite', () => {
  it('o cenário nasce f1, só o super_admin troca, e só antes da largada', async () => {
    const p = await criar([ANA, BRUNO], [DORA]);
    expect((p.corrida as unknown as { tema: string }).tema).toBe('f1');
    const id = p.corrida!.id;
    await expect(como(ANA, 'select public.fn_corrida_tema($1, $2) v', [id, 'tv'])).rejects.toThrow(/NAO_AUTORIZADO/);
    await expect(como(ADMIN, 'select public.fn_corrida_tema($1, $2) v', [id, 'praia'])).rejects.toThrow(/TEMA_INVALIDO/);
    const q = await como<Painel>(ADMIN, 'select public.fn_corrida_tema($1, $2) v', [id, 'hipodromo']);
    expect((q.corrida as unknown as { tema: string }).tema).toBe('hipodromo');
    await como(ADMIN, 'select public.fn_corrida_abrir($1) v', [id]);
    await como(ADMIN, 'select public.fn_corrida_gravar($1, $2) v', [id, gravacao(ANA)]);
    await como(ADMIN, 'select public.fn_corrida_iniciar($1) v', [id]);
    await expect(como(ADMIN, 'select public.fn_corrida_tema($1, $2) v', [id, 'tv'])).rejects.toThrow(/NAO_DA/);
  });

  it('palpite: quem foi chamado, em quem está no grid, com o lobby aberto; avisa a sala com um recado pequeno', async () => {
    await criar([ANA, BRUNO], [DORA]);
    const id = await idAtual();
    await como(ANA, 'select public.fn_corrida_escolher($1, 1::smallint) v', [id]);
    await expect(como(DORA, 'select public.fn_corrida_palpitar($1, $2) v', [id, ANA])).rejects.toThrow(/PALPITE_FECHADO/);
    await como(ADMIN, 'select public.fn_corrida_abrir($1) v', [id]);
    await expect(como(DORA, 'select public.fn_corrida_palpitar($1, $2) v', [id, BRUNO])).rejects.toThrow(/ALVO_INVALIDO/); // Bruno ainda escolhe
    await expect(como(CAIO, 'select public.fn_corrida_palpitar($1, $2) v', [id, ANA])).rejects.toThrow(/NAO_AUTORIZADO/);
    await db.exec('truncate realtime.enviados');
    const r = await como<{ palpite: string }>(DORA, 'select public.fn_corrida_palpitar($1, $2) v', [id, ANA]);
    expect(r.palpite).toBe(ANA);
    const a = await avisos();
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ topic: `corrida-sala:${id}`, event: 'palpite', payload: { usuario: DORA, palpite: ANA } });
    const sala = await como<{ pessoas: Pessoa[] }>(DORA, 'select public.fn_corrida_sala($1) v', [id]);
    expect((sala.pessoas.find(p => p.usuario === DORA) as unknown as { palpite: string }).palpite).toBe(ANA);
  });

  it('clicar sem parar não vira enxurrada: o mesmo palpite ou outro em menos de 1 s não avisa', async () => {
    await criar([ANA, BRUNO], [DORA]);
    const id = await idAtual();
    await como(ANA, 'select public.fn_corrida_escolher($1, 1::smallint) v', [id]);
    await como(BRUNO, 'select public.fn_corrida_escolher($1, 0::smallint) v', [id]);
    await como(ADMIN, 'select public.fn_corrida_abrir($1) v', [id]);
    await db.exec('truncate realtime.enviados');
    await como(DORA, 'select public.fn_corrida_palpitar($1, $2) v', [id, ANA]);
    await como(DORA, 'select public.fn_corrida_palpitar($1, $2) v', [id, ANA]);
    const r = await como<{ palpite: string }>(DORA, 'select public.fn_corrida_palpitar($1, $2) v', [id, BRUNO]);
    expect(r.palpite).toBe(ANA);
    expect(await avisos()).toHaveLength(1);
    // passado 1 s, troca
    await db.query('update public.corrida_pessoas set palpite_em = palpite_em - interval \'2 seconds\' where usuario = $1', [DORA]);
    expect((await como<{ palpite: string }>(DORA, 'select public.fn_corrida_palpitar($1, $2) v', [id, BRUNO])).palpite).toBe(BRUNO);
    expect(await avisos()).toHaveLength(2);
  });

  it('na largada o palpite fecha', async () => {
    await criar([ANA, BRUNO], [DORA]);
    const id = await idAtual();
    await como(ANA, 'select public.fn_corrida_escolher($1, 1::smallint) v', [id]);
    await como(ADMIN, 'select public.fn_corrida_abrir($1) v', [id]);
    await como(ADMIN, 'select public.fn_corrida_gravar($1, $2) v', [id, gravacao(ANA)]);
    await como(ADMIN, 'select public.fn_corrida_iniciar($1) v', [id]);
    await expect(como(DORA, 'select public.fn_corrida_palpitar($1, $2) v', [id, ANA])).rejects.toThrow(/PALPITE_FECHADO/);
  });
});

describe('20261020200000 — preencher para quem não escolheu', () => {
  it('só o super_admin; dá 0..2 só a quem corre sem escolha e avisa a pessoa e a sala', async () => {
    await criar([ANA, BRUNO, CAIO], [DORA]);
    const id = await idAtual();
    await como(ANA, 'select public.fn_corrida_escolher($1, 2::smallint) v', [id]);
    await como(ADMIN, 'select public.fn_corrida_abrir($1) v', [id]);
    await expect(como(ANA, 'select public.fn_corrida_preencher($1) v', [id])).rejects.toThrow(/NAO_AUTORIZADO/);
    await db.exec('truncate realtime.enviados');
    const p = await como<Painel>(ADMIN, 'select public.fn_corrida_preencher($1) v', [id]);
    const porId = new Map(p.pessoas.map(x => [x.usuario, x]));
    expect(porId.get(ANA)?.escolha).toBe(2);
    expect([0, 1, 2]).toContain(porId.get(BRUNO)?.escolha);
    expect([0, 1, 2]).toContain(porId.get(CAIO)?.escolha);
    expect(porId.get(DORA)?.escolha).toBeNull();
    const a = await avisos();
    expect(a.filter(x => x.event === 'corrida').map(x => x.topic).sort()).toEqual([BRUNO, CAIO].map(u => `corrida-eu:${u}`).sort());
    expect(a.some(x => x.topic === `corrida-sala:${id}` && x.event === 'pessoas')).toBe(true);
  });

  it('ninguém sem escolha: não avisa nada; depois de gravada, não preenche', async () => {
    await criar([ANA, BRUNO], []);
    const id = await idAtual();
    await como(ANA, 'select public.fn_corrida_escolher($1, 0::smallint) v', [id]);
    await como(BRUNO, 'select public.fn_corrida_escolher($1, 1::smallint) v', [id]);
    await db.exec('truncate realtime.enviados');
    await como(ADMIN, 'select public.fn_corrida_preencher($1) v', [id]);
    expect(await avisos()).toEqual([]);
    await como(ADMIN, 'select public.fn_corrida_gravar($1, $2) v', [id, gravacao(ANA)]);
    await expect(como(ADMIN, 'select public.fn_corrida_preencher($1) v', [id])).rejects.toThrow(/NAO_DA/);
  });
});

describe('20261021120000 — corredor sem perfil', () => {
  type ComAvulso = Pessoa & { avulso: boolean };
  const criarComAvulsos = (corredores: string[], plateia: string[], avulsos: unknown[]) =>
    como<Painel>(ADMIN, 'select public.fn_corrida_criar($1, $2, $3, $4, $5) v', ['Corrida da Sorte', 'R$ 30', corredores, plateia, JSON.stringify(avulsos)]);
  const ajustar = (id: number, corredores: string[], avulsos: unknown[]) =>
    como<Painel>(ADMIN, 'select public.fn_corrida_ajustar($1, $2, $3, $4, $5) v', [id, 'R$ 30', corredores, [], JSON.stringify(avulsos)]);
  const avulsosDe = (p: Painel) => (p.pessoas as ComAvulso[]).filter(x => x.avulso);

  it('entra com nome e setor digitados, já com bichinho, só correndo', async () => {
    const p = await criarComAvulsos([ANA], [], [{ nome: '  João  ', setor: 'Play 4' }]);
    const [joao] = avulsosDe(p);
    expect(joao).toMatchObject({ nome: 'João', setor: 'Play 4', corre: true, assiste: false, foto: null });
    expect([0, 1, 2]).toContain(joao.escolha);
    // Conta para o mínimo de 2 e já está no grid.
    expect(p.corrida).toMatchObject({ corredores: 2, escolheram: 1 });
    expect((p.pessoas as ComAvulso[]).find(x => x.usuario === ANA)?.avulso).toBe(false);
  });

  it('um perfil e um avulso bastam; só avulsos também valem', async () => {
    await expect(criarComAvulsos([], [], [{ nome: 'João', setor: 'Play 4' }])).rejects.toThrow(/POUCA_GENTE/);
    const p = await criarComAvulsos([], [], [{ nome: 'João', setor: 'Play 4' }, { nome: 'Maria', setor: 'Receptivo' }]);
    expect(p.corrida?.corredores).toBe(2);
  });

  it('sem nome ou sem setor, recusa', async () => {
    await expect(criarComAvulsos([ANA, BRUNO], [], [{ nome: 'João', setor: '  ' }])).rejects.toThrow(/AVULSO_INVALIDO/);
    await expect(criarComAvulsos([ANA, BRUNO], [], [{ nome: '', setor: 'Play 4' }])).rejects.toThrow(/AVULSO_INVALIDO/);
    await expect(criarComAvulsos([ANA, BRUNO], [], [{ nome: 'x'.repeat(41), setor: 'Play 4' }])).rejects.toThrow(/AVULSO_INVALIDO/);
  });

  it('não recebe aviso nenhum: nem o convite, nem a abertura, nem o cancelamento', async () => {
    const p = await criarComAvulsos([ANA], [DORA], [{ nome: 'João', setor: 'Play 4' }]);
    const joao = avulsosDe(p)[0].usuario;
    const id = p.corrida!.id;
    await como(ADMIN, 'select public.fn_corrida_abrir($1) v', [id]);
    await como(ADMIN, 'select public.fn_corrida_encerrar($1, true) v', [id]);
    expect((await avisos()).some(x => x.topic === `corrida-eu:${joao}`)).toBe(false);
  });

  it('ajustar: quem volta com o id fica com o mesmo bichinho; quem não volta sai; quem vem sem id é novo', async () => {
    const p = await criarComAvulsos([ANA], [], [{ nome: 'João', setor: 'Play 4' }, { nome: 'Maria', setor: 'Receptivo' }]);
    const [a, b] = avulsosDe(p);
    const joao = a.nome === 'João' ? a : b;
    await db.exec('truncate realtime.enviados');

    const p2 = await ajustar(p.corrida!.id, [ANA], [{ id: joao.usuario, nome: 'João Pedro', setor: 'Play 5' }, { nome: 'Lia', setor: 'Play 1' }]);
    const depois = avulsosDe(p2);
    expect(depois.map(x => x.nome).sort()).toEqual(['João Pedro', 'Lia']);
    expect(depois.find(x => x.nome === 'João Pedro')).toMatchObject({ usuario: joao.usuario, setor: 'Play 5', escolha: joao.escolha });
    // Avulso não entra na conta de quem precisa de aviso pessoal.
    expect((await avisos()).filter(x => x.event === 'corrida')).toEqual([]);
  });

  it('o id de um perfil não vira avulso, e o avulso não vira perfil', async () => {
    const p = await criarComAvulsos([ANA], [], [{ id: BRUNO, nome: 'Impostor', setor: 'X' }]);
    const av = avulsosDe(p)[0];
    expect(av.usuario).not.toBe(BRUNO);
    expect((p.pessoas as ComAvulso[]).some(x => x.usuario === BRUNO)).toBe(false);
  });

  it('pode vencer: a gravação aceita o avulso e o nome dele vai para a corrida', async () => {
    const p = await criarComAvulsos([ANA], [], [{ nome: 'João', setor: 'Play 4' }]);
    const joao = avulsosDe(p)[0].usuario;
    const g = await como<Painel>(ADMIN, 'select public.fn_corrida_gravar($1, $2) v', [p.corrida!.id, gravacao(joao)]);
    expect(g.corrida?.vencedor_nome).toBe('João');
  });

  it('a chamada antiga, sem a lista, continua valendo', async () => {
    const p = await como<Painel>(ADMIN, 'select public.fn_corrida_criar($1, $2, $3, $4) v', ['Corrida da Sorte', null, [ANA, BRUNO], []]);
    expect(p.corrida?.corredores).toBe(2);
  });

  it('as funções internas novas não ficam abertas', async () => {
    const r = await db.query<{ ok: boolean }>(`select has_function_privilege('authenticated', 'public.fn_corrida_contar_avulsos(jsonb)', 'EXECUTE') ok`);
    expect(r.rows[0].ok).toBe(false);
  });
});

describe('20261020130000 — permissões', () => {
  it('as funções internas não ficam abertas', async () => {
    const r = await db.query<{ ok: boolean }>(`select has_function_privilege('authenticated', 'public.fn_corrida_avisar_pessoa(uuid)', 'EXECUTE') ok`);
    expect(r.rows[0].ok).toBe(false);
    const r2 = await db.query<{ ok: boolean }>(`select has_function_privilege('authenticated', 'public.fn_corrida_minha()', 'EXECUTE') ok`);
    expect(r2.rows[0].ok).toBe(true);
  });
});

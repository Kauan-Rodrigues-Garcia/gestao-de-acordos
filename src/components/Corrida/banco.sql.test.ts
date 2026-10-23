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
const SQL_CAVALOS = readFileSync(resolve(__dirname, '../../../supabase/migrations/20261022120000_corrida_cavalos.sql'), 'utf8');
const SQL_ENQUETE = readFileSync(resolve(__dirname, '../../../supabase/migrations/20261022130000_corrida_enquete.sql'), 'utf8');
const SQL_TORCIDA = readFileSync(resolve(__dirname, '../../../supabase/migrations/20261022190000_corrida_torcida.sql'), 'utf8');
const SQL_SURPRESA = readFileSync(resolve(__dirname, '../../../supabase/migrations/20261023180000_corrida_enquete_surpresa.sql'), 'utf8');

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
  await db.exec(SQL_CAVALOS);
  await db.exec(SQL_CAVALOS);
  await db.exec(SQL_ENQUETE);
  await db.exec(SQL_ENQUETE);
  await db.exec(SQL_TORCIDA);
  await db.exec(SQL_TORCIDA);
  await db.exec(SQL_SURPRESA);
  await db.exec(SQL_SURPRESA);
});

beforeEach(async () => {
  await db.exec('delete from public.corridas; delete from public.corrida_divulgacoes; delete from public.corrida_enquetes; truncate realtime.enviados;');
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

describe('20261022120000 — a corrida de cavalos', () => {
  interface ComCategoria extends Corrida { categoria: string; nome: string }
  const criarCavalos = (corredores: string[], plateia: string[], avulsos: unknown[] = []) =>
    como<Painel>(ADMIN, 'select public.fn_corrida_criar($1, $2, $3, $4, $5, $6) v', ['', 'R$ 30', corredores, plateia, JSON.stringify(avulsos), 'cavalos']);
  const escolher = (uid: string, id: number, cavalo: number) => como<Minha>(uid, 'select public.fn_corrida_escolher($1, $2::smallint) v', [id, cavalo]);
  const escolhas = async () => (await como<Painel>(ADMIN, 'select public.fn_corrida_painel() v')).pessoas.filter(p => p.corre).map(p => p.escolha);

  it('nasce de cavalos, com o nome certo; sem dizer nada, continua de bichinhos', async () => {
    const p = await criarCavalos([ANA, BRUNO], [DORA]);
    expect(p.corrida as ComCategoria).toMatchObject({ categoria: 'cavalos', nome: 'Corrida de Cavalos', corredores: 2 });
    await como(ADMIN, 'select public.fn_corrida_encerrar($1, true) v', [p.corrida!.id]);
    const b = await criar([ANA, BRUNO], []);
    expect((b.corrida as ComCategoria).categoria).toBe('bichinhos');
  });

  it('categoria que não existe é recusada', async () => {
    await expect(como(ADMIN, 'select public.fn_corrida_criar($1, $2, $3, $4, $5, $6) v', ['', null, [ANA, BRUNO], [], '[]', 'tartarugas']))
      .rejects.toThrow(/CATEGORIA_INVALIDA/);
  });

  it('cavalo vai de 0 a 23; bichinho continua de 0 a 2', async () => {
    const { corrida } = await criarCavalos([ANA, BRUNO], []);
    await escolher(ANA, corrida!.id, 23);
    await expect(escolher(BRUNO, corrida!.id, 24)).rejects.toThrow(/ESCOLHA_INVALIDA/);
    await como(ADMIN, 'select public.fn_corrida_encerrar($1, true) v', [corrida!.id]);
    const b = await criar([ANA, BRUNO], []);
    await expect(como(ANA, 'select public.fn_corrida_escolher($1, 5::smallint) v', [b.corrida!.id])).rejects.toThrow(/ESCOLHA_INVALIDA/);
  });

  it('cada cavalo tem um dono só: quem chega depois escolhe outro', async () => {
    const id = (await criarCavalos([ANA, BRUNO], [])).corrida!.id;
    await escolher(ANA, id, 7);
    await expect(escolher(BRUNO, id, 7)).rejects.toThrow(/CAVALO_TEM_DONO/);
    // escolher o próprio cavalo de novo não é conflito; trocar solta o antigo
    await escolher(ANA, id, 7);
    await escolher(ANA, id, 8);
    await escolher(BRUNO, id, 7);
    expect((await escolhas()).sort()).toEqual([7, 8]);
  });

  it('no bichinho, os dois podem ter o mesmo', async () => {
    const id = (await criar([ANA, BRUNO], [])).corrida!.id;
    await como(ANA, 'select public.fn_corrida_escolher($1, 1::smallint) v', [id]);
    await como(BRUNO, 'select public.fn_corrida_escolher($1, 1::smallint) v', [id]);
    expect(await escolhas()).toEqual([1, 1]);
  });

  it('quem ainda está escolhendo fica sabendo na hora que o cavalo saiu', async () => {
    const id = (await criarCavalos([ANA, BRUNO], [])).corrida!.id;
    await db.exec('truncate realtime.enviados');
    await escolher(ANA, id, 3);
    const a = await avisos();
    expect(a.some(x => x.topic === `corrida-sala:${id}` && x.event === 'escolha' && x.payload.escolha === 3)).toBe(true);
  });

  it('o sorteio de quem não escolheu dá cavalos diferentes e livres', async () => {
    const id = (await criarCavalos([ANA, BRUNO, CAIO, DORA], [])).corrida!.id;
    await escolher(ANA, id, 0);
    await como(ADMIN, 'select public.fn_corrida_preencher($1) v', [id]);
    const e = await escolhas();
    expect(e.every(x => x != null && x >= 0 && x <= 23)).toBe(true);
    expect(new Set(e).size).toBe(4);
    expect(e).toContain(0);
  });

  it('o corredor sem perfil ganha um cavalo livre, diferente do de quem já escolheu', async () => {
    const p = await criarCavalos([ANA], [], [{ nome: 'João', setor: 'Play 4' }, { nome: 'Lia', setor: 'Play 4' }]);
    const e = p.pessoas.filter(x => x.corre).map(x => x.escolha);
    const avulsos = e.filter(x => x != null);
    expect(avulsos).toHaveLength(2);
    expect(new Set(avulsos).size).toBe(2);
  });

  it('são 24 cavalos: mais de 24 correndo é recusado (criar e ajustar)', async () => {
    const muitos = Array.from({ length: 25 }, (_, i) => ({ nome: `Pessoa ${i}`, setor: 'Play 4' }));
    await expect(criarCavalos([], [], muitos)).rejects.toThrow(/GENTE_DEMAIS/);
    const id = (await criarCavalos([ANA, BRUNO], [])).corrida!.id;
    await expect(como(ADMIN, 'select public.fn_corrida_ajustar($1, $2, $3, $4, $5) v', [id, 'R$ 30', [ANA, BRUNO], [], JSON.stringify(muitos)]))
      .rejects.toThrow(/GENTE_DEMAIS/);
  });

  it('quem corre nunca lê «grav» na corrida de cavalos', async () => {
    const id = (await criarCavalos([ANA, BRUNO], [])).corrida!.id;
    await escolher(ANA, id, 1);
    await como(ADMIN, 'select public.fn_corrida_gravar($1, $2) v', [id, gravacao(ANA)]);
    const erro = await escolher(BRUNO, id, 2).then(() => '', e => String(e));
    expect(erro).toMatch(/ESCOLHA_FECHADA/);
    expect(erro).not.toMatch(/grav/i);
  });

  it('o histórico do painel diz a categoria', async () => {
    await criarCavalos([ANA, BRUNO], []);
    const p = await como<Painel & { historico: { categoria: string }[] }>(ADMIN, 'select public.fn_corrida_painel() v');
    expect(p.historico[0].categoria).toBe('cavalos');
  });

  it('o card de divulgação chega com a categoria (sem dizer, é de bichinhos)', async () => {
    await como(ADMIN, 'select public.fn_corrida_divulgar($1, $2, $3, $4, $5, $6) v', ['Vem aí!', 'Corrida de cavalos', 'R$ 30', [ANA], 3, 'cavalos']);
    const m = await minha(ANA) as Minha & { divulgacao: { categoria: string } };
    expect(m.divulgacao.categoria).toBe('cavalos');
    await como(ADMIN, 'select public.fn_corrida_divulgar($1, $2, $3, $4, $5) v', ['De novo', 'Bichinhos', null, [BRUNO], 3]);
    const b = await minha(BRUNO) as Minha & { divulgacao: { categoria: string } };
    expect(b.divulgacao.categoria).toBe('bichinhos');
    await expect(como(ADMIN, 'select public.fn_corrida_divulgar($1, $2, $3, $4, $5, $6) v', ['x', 'y', null, [ANA], 3, 'tartarugas'])).rejects.toThrow(/CATEGORIA_INVALIDA/);
  });

  it('a função interna do sorteio não fica aberta', async () => {
    const r = await db.query<{ ok: boolean }>(`select has_function_privilege('authenticated', 'public.fn_corrida_cavalo_livre(bigint)', 'EXECUTE') ok`);
    expect(r.rows[0].ok).toBe(false);
  });
});

describe('20261022130000 — a votação da categoria', () => {
  interface Enquete { id: number; encerra_em: string; fechada_em: string | null; vencedora: string | null; votos: { bichinhos: number; cavalos: number } | null; empate: boolean | null; meu_voto: string | null }
  const abrir = (votantes: string[]) => como<{ enquete: Enquete }>(ADMIN, 'select public.fn_corrida_enquete_abrir($1) v', [votantes]);
  const votar = (uid: string, id: number, cat: string) => como<{ enquete: Enquete }>(uid, 'select public.fn_corrida_enquete_votar($1, $2) v', [id, cat]);
  const fechar = (id: number) => como<{ enquete: Enquete }>(ADMIN, 'select public.fn_corrida_enquete_fechar($1) v', [id]);
  const vencer = (id: number) => db.query("update public.corrida_enquetes set encerra_em = clock_timestamp() - interval '1 second' where id = $1", [id]);

  it('só o super_admin abre; o card chega só para quem foi chamado, no tópico de cada um', async () => {
    await expect(como(ANA, 'select public.fn_corrida_enquete_abrir($1) v', [[ANA]])).rejects.toThrow(/NAO_AUTORIZADO/);
    const { enquete } = await abrir([ANA, BRUNO, ANA]);
    expect(enquete.vencedora).toBeNull();
    const a = await avisos();
    expect(a.map(x => x.topic).sort()).toEqual([`corrida-eu:${ANA}`, `corrida-eu:${BRUNO}`].sort());
    expect(a.every(x => x.event === 'enquete')).toBe(true);
  });

  it('vota quem foi chamado, troca o voto, e não vota depois do tempo', async () => {
    const { enquete } = await abrir([ANA, BRUNO]);
    await expect(votar(DORA, enquete.id, 'cavalos')).rejects.toThrow(/NAO_AUTORIZADO/);
    await expect(votar(ANA, enquete.id, 'tartarugas')).rejects.toThrow(/CATEGORIA_INVALIDA/);
    expect((await votar(ANA, enquete.id, 'bichinhos')).enquete.meu_voto).toBe('bichinhos');
    expect((await votar(ANA, enquete.id, 'cavalos')).enquete.meu_voto).toBe('cavalos');
    await expect(fechar(enquete.id)).rejects.toThrow(/AINDA_VOTANDO/);
    await vencer(enquete.id);
    await expect(votar(BRUNO, enquete.id, 'bichinhos')).rejects.toThrow(/VOTACAO_ENCERRADA/);
  });

  it('vence quem tem mais votos e cada um recebe o resultado com o próprio voto', async () => {
    const { enquete } = await abrir([ANA, BRUNO, DORA]);
    await votar(ANA, enquete.id, 'cavalos');
    await votar(BRUNO, enquete.id, 'cavalos');
    await votar(DORA, enquete.id, 'bichinhos');
    await vencer(enquete.id);
    await db.exec('truncate realtime.enviados');
    const r = await fechar(enquete.id);
    expect(r.enquete).toMatchObject({ vencedora: 'cavalos', votos: { bichinhos: 1, cavalos: 2 }, empate: false });
    const a = await avisos();
    expect(a).toHaveLength(3);
    const daDora = a.find(x => x.topic === `corrida-eu:${DORA}`)!.payload as { enquete: Enquete };
    expect(daDora.enquete).toMatchObject({ vencedora: 'cavalos', meu_voto: 'bichinhos' });
    // Fechar de novo devolve o mesmo, sem avisar outra vez.
    expect((await fechar(enquete.id)).enquete.vencedora).toBe('cavalos');
    expect(await avisos()).toHaveLength(3);
  });

  it('empate (até sem voto nenhum) vai para o sorteio', async () => {
    const { enquete } = await abrir([ANA, BRUNO]);
    await vencer(enquete.id);
    const r = await fechar(enquete.id);
    expect(r.enquete.empate).toBe(true);
    expect(['bichinhos', 'cavalos']).toContain(r.enquete.vencedora);
  });

  it('não abre com corrida em andamento nem sem ninguém para votar', async () => {
    await expect(abrir([])).rejects.toThrow(/SEM_VOTANTES/);
    await criar([ANA, BRUNO], []);
    await expect(abrir([ANA])).rejects.toThrow(/CORRIDA_EM_ANDAMENTO/);
  });

  it('as funções internas não ficam abertas', async () => {
    const r = await db.query<{ ok: boolean }>(`select has_function_privilege('authenticated', 'public.fn_corrida_enquete_avisar(bigint)', 'EXECUTE') ok`);
    expect(r.rows[0].ok).toBe(false);
  });
});

describe('20261023180000 — a votação de surpresa', () => {
  interface Enquete { id: number; vencedora: string | null; votos: { bichinhos: number; cavalos: number } | null; empate: boolean | null; meu_voto: string | null; forcada?: string | null; votos_reais?: { bichinhos: number; cavalos: number } | null }
  const abrir = (votantes: string[]) => como<{ enquete: Enquete }>(ADMIN, 'select public.fn_corrida_enquete_abrir($1) v', [votantes]);
  const votar = (uid: string, id: number, cat: string) => como<{ enquete: Enquete }>(uid, 'select public.fn_corrida_enquete_votar($1, $2) v', [id, cat]);
  const fechar = (id: number, forcar: string | null) => como<{ enquete: Enquete }>(ADMIN, 'select public.fn_corrida_enquete_fechar($1, $2) v', [id, forcar]);
  const vencer = (id: number) => db.query("update public.corrida_enquetes set encerra_em = clock_timestamp() - interval '1 second' where id = $1", [id]);

  it('perdendo de verdade, os cavalos ganham com UM voto a mais; ninguém vê a contagem real, só o super_admin', async () => {
    const { enquete } = await abrir([ANA, BRUNO, DORA]);
    await votar(ANA, enquete.id, 'bichinhos'); await votar(BRUNO, enquete.id, 'bichinhos'); await votar(DORA, enquete.id, 'cavalos');
    await vencer(enquete.id);
    await db.exec('truncate realtime.enviados');
    const r = await fechar(enquete.id, 'cavalos');
    // 3 chamados: o placar não passa de 3 votos (1 × 2), e vence a forçada
    expect(r.enquete).toMatchObject({ vencedora: 'cavalos', votos: { bichinhos: 1, cavalos: 2 }, empate: false, forcada: 'cavalos', votos_reais: { bichinhos: 2, cavalos: 1 } });
    const a = await avisos();
    expect(a).toHaveLength(3);
    for (const x of a) {
      const e = (x.payload as { enquete: Enquete }).enquete;
      expect(e).toMatchObject({ vencedora: 'cavalos', votos: { bichinhos: 1, cavalos: 2 } });
      expect(e.votos_reais).toBeUndefined();
      expect(e.forcada).toBeUndefined();
    }
    // fechar de novo devolve o mesmo
    expect((await fechar(enquete.id, 'cavalos')).enquete).toMatchObject({ vencedora: 'cavalos', votos: { bichinhos: 1, cavalos: 2 } });
  });

  it('com gente de sobra, é o voto da outra mais um; empate também vira um a mais', async () => {
    const { enquete } = await abrir([ANA, BRUNO, CAIO, DORA, ADMIN]);
    await votar(ANA, enquete.id, 'bichinhos'); await votar(BRUNO, enquete.id, 'cavalos');
    await vencer(enquete.id);
    expect((await fechar(enquete.id, 'cavalos')).enquete).toMatchObject({ vencedora: 'cavalos', votos: { bichinhos: 1, cavalos: 2 }, empate: false });
  });

  it('se os cavalos já ganhavam, o placar é o de verdade; sem voto nenhum, 1 × 0', async () => {
    let { enquete } = await abrir([ANA, BRUNO, DORA]);
    await votar(ANA, enquete.id, 'cavalos'); await votar(BRUNO, enquete.id, 'cavalos');
    await vencer(enquete.id);
    expect((await fechar(enquete.id, 'cavalos')).enquete).toMatchObject({ vencedora: 'cavalos', votos: { bichinhos: 0, cavalos: 2 } });
    ({ enquete } = await abrir([ANA, BRUNO]));
    await vencer(enquete.id);
    expect((await fechar(enquete.id, 'cavalos')).enquete).toMatchObject({ vencedora: 'cavalos', votos: { bichinhos: 0, cavalos: 1 }, empate: false });
  });

  it('sem forçar, é a votação de sempre; só o super_admin fecha, e só com uma das duas', async () => {
    const { enquete } = await abrir([ANA, BRUNO, DORA]);
    await votar(ANA, enquete.id, 'bichinhos'); await votar(BRUNO, enquete.id, 'bichinhos');
    await vencer(enquete.id);
    await expect(como(ANA, 'select public.fn_corrida_enquete_fechar($1, $2) v', [enquete.id, 'cavalos'])).rejects.toThrow(/NAO_AUTORIZADO/);
    await expect(fechar(enquete.id, 'tartarugas')).rejects.toThrow(/CATEGORIA_INVALIDA/);
    expect((await fechar(enquete.id, null)).enquete).toMatchObject({ vencedora: 'bichinhos', votos: { bichinhos: 2, cavalos: 0 }, votos_reais: null });
  });
});

describe('20261022190000 — a torcida durante a corrida', () => {
  interface Torcida { barulho: { alvo: string; n: number }[]; gritos: { usuario: string; emoji: string }[] }
  const torcer = (uid: string, id: number, n: number, emoji: string | null = null) =>
    como<{ fora?: boolean; cedo?: boolean }>(uid, 'select public.fn_corrida_torcer($1, $2, $3) v', [id, n, emoji]);
  const sinais = async () => (await avisos()).filter(a => a.event === 'torcida').map(a => ({ topic: a.topic, ...(a.payload as unknown as Torcida) }));
  // Ana corre no 1, Bruno no 2, Dora assiste com palpite na Ana; a largada é dada.
  async function largada(): Promise<number> {
    const id = (await como<Painel>(ADMIN, 'select public.fn_corrida_criar($1, $2, $3, $4, $5, $6) v', ['', 'R$ 30', [ANA, BRUNO], [DORA], '[]', 'cavalos'])).corrida!.id;
    await como(ANA, 'select public.fn_corrida_escolher($1, 1::smallint) v', [id]);
    await como(BRUNO, 'select public.fn_corrida_escolher($1, 2::smallint) v', [id]);
    await como(ADMIN, 'select public.fn_corrida_gravar($1, $2) v', [id, gravacao(ANA)]);
    await como(ADMIN, 'select public.fn_corrida_abrir($1) v', [id]);
    await como(DORA, 'select public.fn_corrida_palpitar($1, $2) v', [id, ANA]);
    await como(ADMIN, 'select public.fn_corrida_iniciar($1) v', [id]);
    await db.exec('truncate realtime.enviados');
    return id;
  }
  /** O relógio não anda no teste: «passaram 2 s» é empurrar as marcas para trás. */
  const passar = (id: number) => db.exec(`update public.corrida_torcida set torceu_em = torceu_em - interval '3 seconds', emoji_em = emoji_em - interval '3 seconds' where corrida_id = ${Number(id)};
    update public.corrida_torcida_envio set enviado_em = enviado_em - interval '3 seconds' where corrida_id = ${Number(id)};`);

  it('antes da largada não vale: nada é guardado nem mandado', async () => {
    const id = (await como<Painel>(ADMIN, 'select public.fn_corrida_criar($1, $2, $3, $4, $5, $6) v', ['', null, [ANA, BRUNO], [DORA], '[]', 'cavalos'])).corrida!.id;
    expect(await torcer(DORA, id, 5, '🔥')).toMatchObject({ fora: true });
    expect((await db.query('select 1 from public.corrida_torcida')).rows).toHaveLength(0);
    expect(await sinais()).toHaveLength(0);
  });

  it('só quem foi chamado torce', async () => {
    const id = await largada();
    await expect(torcer(CAIO, id, 5)).rejects.toThrow(/NAO_AUTORIZADO/);
  });

  it('quem corre torce para si; quem assiste, para o palpite; a sala recebe o barulho somado e os emojis', async () => {
    const id = await largada();
    await torcer(ANA, id, 4);
    await passar(id);
    await torcer(DORA, id, 6, '🔥');
    const s = await sinais();
    expect(s).toHaveLength(2);
    expect(s.every(x => x.topic === `corrida-sala:${id}`)).toBe(true);
    expect(s[1].barulho).toEqual([{ alvo: ANA, n: 10 }]);
    expect(s[1].gritos).toEqual([{ usuario: DORA, emoji: '🔥' }]);
  });

  it('no máximo 1 por 2 s por pessoa, e 1 sinal a cada 2 s para a sala', async () => {
    const id = await largada();
    await torcer(ANA, id, 4, '👏');
    expect(await torcer(ANA, id, 4)).toMatchObject({ cedo: true });
    await torcer(BRUNO, id, 3, '😱');   // outra pessoa, mas a sala acabou de receber
    const s = await sinais();
    expect(s).toHaveLength(1);
    const linhas = (await db.query<{ usuario: string; barulho: number }>('select usuario, barulho from public.corrida_torcida order by barulho')).rows;
    expect(linhas).toEqual([{ usuario: BRUNO, barulho: 3 }, { usuario: ANA, barulho: 4 }]);
    // passados 2 s, o próximo sinal leva o que ficou guardado (o emoji do Bruno), e não repete o da Ana
    await passar(id);
    await torcer(DORA, id, 1);
    const [, seg] = await sinais();
    expect(seg.gritos).toEqual([{ usuario: BRUNO, emoji: '😱' }]);
    expect(seg.barulho.sort((a, b) => a.n - b.n)).toEqual([{ alvo: BRUNO, n: 3 }, { alvo: ANA, n: 5 }]);
  });

  it('barulho tem teto e não fica negativo; emoji fora da lista não vai', async () => {
    const id = await largada();
    await torcer(ANA, id, 5000, '<script>');
    await passar(id);
    await torcer(BRUNO, id, -10, '🔥');
    const linhas = (await db.query<{ usuario: string; barulho: number; emoji: string | null }>('select usuario, barulho, emoji from public.corrida_torcida order by usuario')).rows;
    expect(linhas).toEqual([{ usuario: ANA, barulho: 60, emoji: null }, { usuario: BRUNO, barulho: 0, emoji: '🔥' }]);
  });

  it('as tabelas só se leem pela função (RLS ligada), e a função é de quem está logado', async () => {
    const r = await db.query<{ relname: string; relrowsecurity: boolean }>(
      `select relname, relrowsecurity from pg_class where relname in ('corrida_torcida', 'corrida_torcida_envio') order by relname`);
    expect(r.rows.every(x => x.relrowsecurity)).toBe(true);
    const f = await db.query<{ a: boolean; b: boolean }>(`select has_function_privilege('authenticated', 'public.fn_corrida_torcer(bigint, integer, text)', 'EXECUTE') a,
      has_function_privilege('anon', 'public.fn_corrida_torcer(bigint, integer, text)', 'EXECUTE') b`);
    expect(f.rows[0]).toEqual({ a: true, b: false });
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

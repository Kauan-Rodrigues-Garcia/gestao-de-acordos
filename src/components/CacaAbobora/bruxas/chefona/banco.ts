/**
 * banco.ts — a chefona da Caça às Bruxas (a Bruxa do Pântano) do lado do
 * banco: a vida que todo mundo divide, os tiros em lote, a Poção de Cura e o
 * Totem do super_admin, e o ranking.
 *
 * ## O pedido (15/10/2026)
 *
 * Soltar a chefona igual ao Rei do Pop (`../../chefao.ts`): o super_admin
 * solta, 1 minuto de contagem, todo mundo atira na MESMA vida, e no fim o
 * ranking. A regra mora na migration 20261015230000, que só cria coisa nova —
 * nada do Rei do Pop muda.
 *
 * ## O que é de cada tela e o que é de todos
 *
 * A bruxa voando, as poções que ela joga na página, os desvios e a fúria são
 * da tela de cada um (`palcoChefona.ts`), como o passo de dança do Rei do Pop.
 * A vida, a Poção de Cura, o Totem e o ranking são do banco: iguais em toda
 * tela. A fúria sai da vida (abaixo de 35%), então chega junto para todos.
 *
 * ## Os tiros vão em lote
 *
 * Como no Rei do Pop: o acerto entra na hora na tela de quem atirou e vai ao
 * banco a cada `LOTE_MS`, com o dano somado (a tela sabe onde pegou). O banco
 * avisa os outros pelo tópico da caça (`abobora:<empresa>`, sinal `chefona`),
 * no máximo a cada 2 s. `versao` sobe a cada mudança: aviso atrasado não
 * desfaz o que já se sabe.
 *
 * Este arquivo é leve de propósito (vai no pacote de entrada, com o canal da
 * caça): o desenho dela (`palcoChefona.ts`) só baixa na cena.
 *
 * ## Ensaio (só no localhost)
 *
 * Como no Rei do Pop: o laboratório (`?zumbis`) solta uma chefona de id
 * negativo, e os tiros se resolvem aqui (`aplicarLote`, a mesma regra da
 * migration) sem chegar ao banco.
 */
import { useEffect, useReducer, useSyncExternalStore } from 'react';
import { supabase } from '@/lib/supabase';
import {
  EU_NO_ENSAIO, chefaoChegando, juntarChefao, normalizarChefao, ordenarRanking,
  type Golpeador, type MeuPlacar, type RodadaChefao,
} from '../../chefao';
import { MOTIVO, normalizarFichas, type Colheita, type FichaDeCliques } from '../../autoclick';
import { CONTAGEM_LOBBY_S } from './lobby/trilha';

/** Quem entrou no lobby (os últimos 24 que o banco manda). */
export interface NoLobby {
  usuario: string;
  nome:    string;
  setor:   string | null;
}

export interface RodadaChefona extends RodadaChefao {
  /** A Absorção do totem (a parte dourada da barra): gasta antes da vida. */
  absorcao:     number;
  /** Segurando o Totem da Imortalidade agora: o golpe fatal não mata. */
  protegida:    boolean;
  protegida_em: string | null;
  /** Quando o totem estourou, e quanto a Regeneração devolveu (a tela mostra subindo). */
  totem_em:     string | null;
  totem_vida:   number;
  totens:       number;
  curas:        number;
  /** O lobby (16/10/2026, migration 20261016120000): quantos entraram, e os últimos 24 na ordem de chegada. */
  lobby_total:  number;
  lobby:        NoLobby[];
}

/** Os números que a migration também usa — mudou um, mude o outro. */
export const LOTE_MS = 1_000;
export const MAX_ACERTOS_POR_LOTE = 12;
/** O dano de um acerto, no máximo: cabeça (6) com ela tonta (2×). */
export const MAX_DANO_POR_ACERTO = 12;
/** A contagem antes dela: 3 minutos de lobby (16/10/2026; era 1 minuto). */
export const ESPERA_S = CONTAGEM_LOBBY_S;
export const PRAZO_MIN = 2;
/** A Poção de Cura (o `CURA_FRACAO` do palco) e quanto ela leva bebendo. */
export const CURA_FRACAO = 0.22;
export const BEBER_MS = 1_800;
/** O totem estourou: a Regeneração e a Absorção (frações da vida máxima). */
export const REGEN_FRACAO = 0.15;
export const ABSORCAO_FRACAO = 0.1;
export const REGEN_MS = 8_000;
/** Folga sobre o `expira_em`: relógio adiantado não manda ela embora antes da hora. */
const FOLGA_EXPIRA_MS = 3_000;

// ── Quanto de vida ──────────────────────────────────────────────────────────
//
// A conta (15/10/2026), a mesma do Rei do Pop com o dano dela: uma pessoa
// clica 3 a 4 vezes por segundo e acerta perto da metade (ela é grande, mas
// some na pérola e desvia nas poções); o acerto vale 3 no corpo e 6 na cabeça,
// mais quando ela prepara poção. Dá ~4 de dano por segundo por pessoa. Com
// `PRAZO_MIN` = 2, tirando a entrada, as manobras e as poções, sobram ~95 s
// úteis: ~400 por pessoa é o Médio. A cura (22%) e o totem (1 vida + 15%)
// esticam a luta — por isso a base é maior que a do Rei do Pop.

export interface DificuldadeChefona {
  nome: string;
  base: number;
  porPessoa: number;
}

export const DIFICULDADES_CHEFONA: readonly DificuldadeChefona[] = [
  { nome: 'Fácil', base: 400, porPessoa: 230 },
  { nome: 'Médio', base: 700, porPessoa: 400 },
  { nome: 'Difícil', base: 1100, porPessoa: 620 },
];

// ── Puras (exportadas para os testes) ─────────────────────────────────────────

const texto = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v : null);
const inteiro = (v: unknown, padrao = 0) => (Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : padrao);

/**
 * O que chegou do banco. A linha é a do Rei do Pop com os campos dela; no
 * ranking, `criticos` faz o papel do `headshots` (o placar mostra igual).
 */
export function normalizarChefona(bruto: unknown): RodadaChefona | null {
  if (!bruto || typeof bruto !== 'object') return null;
  const r = bruto as Record<string, unknown>;
  const ranking = Array.isArray(r.ranking)
    ? r.ranking.map(g => (g && typeof g === 'object' ? { ...g, headshots: (g as Record<string, unknown>).criticos } : g))
    : [];
  const base = normalizarChefao({ ...r, ranking, cura_ate: null, cura_semente: 0 });
  if (!base) return null;
  return {
    ...base,
    absorcao:     Math.max(0, inteiro(r.absorcao)),
    protegida:    r.protegida === true,
    protegida_em: texto(r.protegida_em),
    totem_em:     texto(r.totem_em),
    totem_vida:   Math.max(0, inteiro(r.totem_vida)),
    totens:       Math.max(0, inteiro(r.totens)),
    curas:        Math.max(0, inteiro(r.curas)),
    lobby_total:  Math.max(0, inteiro(r.lobby_total)),
    lobby:        normalizarLobby(r.lobby),
  };
}

function normalizarLobby(bruto: unknown): NoLobby[] {
  if (!Array.isArray(bruto)) return [];
  return bruto.flatMap((b): NoLobby[] => {
    if (!b || typeof b !== 'object') return [];
    const l = b as Record<string, unknown>;
    if (typeof l.usuario !== 'string') return [];
    return [{ usuario: l.usuario, nome: texto(l.nome) ?? 'Alguém', setor: texto(l.setor) }];
  });
}

export function normalizarPlacarChefona(bruto: unknown): MeuPlacar | null {
  if (!bruto || typeof bruto !== 'object') return null;
  const p = bruto as Record<string, unknown>;
  return {
    dano:      Math.max(0, inteiro(p.dano)),
    acertos:   Math.max(0, inteiro(p.acertos)),
    headshots: Math.max(0, inteiro(p.criticos)),
    posicao:   Math.max(0, inteiro(p.posicao)),
  };
}

/** Na tela agora (da contagem até o fim do prazo). */
export function chefonaNaTela(r: RodadaChefona | null, agora: number): boolean {
  return !!r && r.situacao === 'ativo' && agora < Date.parse(r.expira_em) + FOLGA_EXPIRA_MS;
}

/** O ativo cujo prazo passou sem aviso do banco: fugiu, daqui. */
export function situacaoDaChefona(r: RodadaChefona, agora: number): RodadaChefona['situacao'] {
  return r.situacao === 'ativo' && !chefonaNaTela(r, agora) ? 'fugiu' : r.situacao;
}

export { chefaoChegando as chefonaChegando };

/**
 * Quanto da vida do banco a barra ainda NÃO mostra. O banco soma a cura e a
 * Regeneração na hora; a tela mostra a cura no último gole (`BEBER_MS`) e a
 * Regeneração subindo em `REGEN_MS`. (Relógio atrasado mais que 5 s: mostra
 * tudo de uma vez.)
 */
export function vidaPorAparecer(r: RodadaChefona, agora: number): number {
  let falta = 0;
  if (r.cura_em && r.cura_vida > 0) {
    const t = agora - Date.parse(r.cura_em);
    if (t > -5_000 && t < BEBER_MS) falta += r.cura_vida;
  }
  if (r.totem_em && r.totem_vida > 0) {
    const t = agora - Date.parse(r.totem_em);
    if (t > -5_000 && t < REGEN_MS) falta += r.totem_vida * (1 - Math.max(0, t) / REGEN_MS);
  }
  return falta;
}

/** A vida que a barra mostra: a do banco, menos os meus tiros a caminho, menos o que ainda vai aparecer. */
export function vidaNaTela(r: RodadaChefona, agora: number, pendente: number): number {
  return Math.max(0, Math.round(r.vida - pendente - vidaPorAparecer(r, agora)));
}

/**
 * Um lote, pela regra da migration (`fn_chefona_acertar`): a vida cresce com a
 * caçadora nova, a Absorção paga primeiro, e o golpe fatal com o totem na mão
 * vira 1 de vida + Regeneração. Serve ao ensaio e aos testes — o banco é quem
 * manda de verdade.
 */
export function aplicarLote(
  r: RodadaChefona, quem: { usuario: string; nome: string; foto?: string | null },
  acertos: number, criticos: number, dano: number, agora: number,
): RodadaChefona {
  const a = Math.max(0, Math.min(MAX_ACERTOS_POR_LOTE, Math.trunc(acertos)));
  const c = Math.max(0, Math.min(a, Math.trunc(criticos)));
  const d = Math.max(0, Math.min(a * MAX_DANO_POR_ACERTO, Math.trunc(dano)));
  if (r.situacao !== 'ativo' || a === 0 || d === 0 || agora < Date.parse(r.solta_em) || agora >= Date.parse(r.expira_em)) return r;
  const antes = r.ranking.find(g => g.usuario === quem.usuario);
  const extra = antes ? 0 : Math.min(r.vida_por_pessoa, 500_000 - r.vida_max);
  const max = r.vida_max + extra;
  let vida = r.vida + extra;
  let absorcao = r.absorcao;
  const gasta = Math.min(absorcao, d);
  absorcao -= gasta;
  const resto = d - gasta;
  let efetivo = d;
  let morreu = false;
  let totem = false;
  let regen = 0;
  if (vida - resto > 0) vida -= resto;
  else if (r.protegida) {
    totem = true;
    efetivo = gasta + (vida - 1);
    regen = Math.min(max - 1, Math.max(1, Math.round(max * REGEN_FRACAO)));
    vida = 1 + regen;
    absorcao = Math.round(max * ABSORCAO_FRACAO);
  } else {
    morreu = true;
    efetivo = gasta + vida;
    vida = 0;
  }
  const eu: Golpeador = {
    usuario: quem.usuario, nome: quem.nome, foto: quem.foto ?? null,
    dano: (antes?.dano ?? 0) + efetivo,
    acertos: (antes?.acertos ?? 0) + a,
    headshots: (antes?.headshots ?? 0) + c,
  };
  const ranking = ordenarRanking([...r.ranking.filter(g => g.usuario !== quem.usuario), eu]);
  const quando = new Date(agora).toISOString();
  return {
    ...r, vida, vida_max: max, absorcao, versao: r.versao + 1,
    ranking, participantes: Math.max(r.participantes + (antes ? 0 : 1), ranking.length),
    ...(totem ? { protegida: false, totem_em: quando, totem_vida: regen, totens: r.totens + 1 } : {}),
    ...(morreu ? {
      situacao: 'derrotado' as const, derrotado_em: quando,
      golpe_final_por: quem.usuario, golpe_final_nome: quem.nome, golpe_final_foto: quem.foto ?? null,
    } : {}),
  };
}

// ── O estado do app ──────────────────────────────────────────────────────────

let estado: RodadaChefona | null = null;
/**
 * A chefona em cujo lobby ESTA pessoa está. É de cada um: vem só nas respostas
 * dela (a leitura de entrada, entrar, sair), nunca no aviso geral.
 */
let euNoLobby: number | null = null;
const ouvintes = new Set<() => void>();

function avisarOuvintes(): void {
  for (const o of [...ouvintes]) o();
}

function publicar(proximo: RodadaChefona | null): void {
  if (proximo === estado) return;
  estado = proximo;
  avisarOuvintes();
}

function marcarLobby(rodadaId: number, dentro: boolean): void {
  const proximo = dentro ? rodadaId : euNoLobby === rodadaId ? null : euNoLobby;
  if (proximo === euNoLobby) return;
  euNoLobby = proximo;
  avisarOuvintes();
}

/** O que chegou do banco (Broadcast, resposta do tiro ou leitura). */
export function aceitarChefona(bruto: unknown): void {
  const nova = normalizarChefona(bruto);
  if (!nova) return;
  const dentro = (bruto as { eu_no_lobby?: unknown }).eu_no_lobby;
  if (typeof dentro === 'boolean') marcarLobby(nova.id, dentro);
  publicar(juntarChefao(estado, nova));
}

export function estadoChefona(): RodadaChefona | null {
  return estado;
}

/** Esta pessoa está no lobby desta chefona? */
export function useEuNoLobbyChefona(rodadaId: number | null | undefined): boolean {
  const id = useSyncExternalStore(
    o => { ouvintes.add(o); return () => { ouvintes.delete(o); }; },
    () => euNoLobby,
  );
  return rodadaId != null && id === rodadaId;
}

/** O banco ainda não tem o lobby (migration 20261016120000 por aplicar). */
const semLobbyNoBanco = (erro: string) => /fn_chefona_lobby|PGRST202|schema cache|does not exist/.test(erro);

/**
 * Entra no lobby. Banco sem a migration do lobby: entra só nesta tela (o banco
 * velho deixa todo mundo acertar), para a chefona não sumir até aplicarem.
 */
export async function entrarNoLobbyChefona(rodadaId: number): Promise<{ erro: string | null }> {
  if (rodadaId < 0) { ensaioEntrarNoLobby(rodadaId); return { erro: null }; }
  const { data, error } = await rpc<unknown>('fn_chefona_lobby_entrar', { p_rodada: rodadaId });
  if (error) {
    if (semLobbyNoBanco(error.message)) { marcarLobby(rodadaId, true); return { erro: null }; }
    return { erro: error.message };
  }
  aceitarChefona(data);
  marcarLobby(rodadaId, true);
  return { erro: null };
}

export async function sairDoLobbyChefona(rodadaId: number): Promise<{ erro: string | null }> {
  marcarLobby(rodadaId, false);
  if (rodadaId < 0) { ensaioSairDoLobby(rodadaId); return { erro: null }; }
  const { data, error } = await rpc<unknown>('fn_chefona_lobby_sair', { p_rodada: rodadaId });
  if (error) return { erro: semLobbyNoBanco(error.message) ? null : error.message };
  aceitarChefona(data);
  return { erro: null };
}

function rpc<T>(nome: string, args?: Record<string, unknown>) {
  const cliente = supabase as unknown as {
    rpc: (n: string, a?: Record<string, unknown>) => PromiseLike<{ data: T; error: { message: string; code?: string } | null }>;
  };
  return cliente.rpc(nome, args);
}

/**
 * A leitura de entrada (e depois de reconectar). Banco sem a migration: a
 * função não existe e nada aparece.
 */
export async function lerChefona(): Promise<void> {
  const { data, error } = await rpc<unknown>('fn_chefona_atual');
  if (!error && data) aceitarChefona(data);
}

/**
 * A chefona de agora. A assinatura do tópico é a da caça (`caca.ts` ouve o
 * sinal `chefona` e entrega aqui); este gancho só lê e redesenha quando a
 * contagem acaba ou o prazo vence sem aviso.
 */
export function useChefona(): RodadaChefona | null {
  const valor = useSyncExternalStore(
    o => { ouvintes.add(o); return () => { ouvintes.delete(o); }; },
    () => estado,
  );
  const [, redesenhar] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!valor || valor.situacao !== 'ativo') return;
    const agora = Date.now();
    const marcos = [Date.parse(valor.solta_em), Date.parse(valor.expira_em) + FOLGA_EXPIRA_MS].filter(m => m > agora);
    if (marcos.length === 0) return;
    const t = setTimeout(redesenhar, Math.min(Math.min(...marcos) - agora + 50, 2 ** 31 - 1));
    return () => clearTimeout(t);
  }, [valor]);
  return valor;
}

// ── O tiro ───────────────────────────────────────────────────────────────────

export interface ResultadoLoteChefona {
  rodada: RodadaChefona | null;
  eu:     MeuPlacar | null;
  erro:   string | null;
  /** O banco achou o lote cedo demais: os tiros NÃO entraram, e voltam no próximo. */
  freio:  boolean;
  /**
   * Quantos acertos do lote o banco NÃO contou (rápido demais, ou cliques com
   * pista de autoclick: migration 20261016120000). Não voltam.
   */
  descartados?: number;
}

/** Manda um lote. A resposta já atualiza a vida e o ranking nesta aba. */
export async function enviarLoteChefona(
  rodadaId: number, acertos: number, criticos: number, dano: number,
  colheita: Colheita = { cliques: 0, suspeita: 0 },
): Promise<ResultadoLoteChefona> {
  const a = Math.max(0, Math.min(MAX_ACERTOS_POR_LOTE, Math.trunc(acertos)));
  const c = Math.max(0, Math.min(a, Math.trunc(criticos)));
  const d = Math.max(0, Math.min(a * MAX_DANO_POR_ACERTO, Math.round(dano)));
  if (a === 0 || d === 0) return { rodada: estado, eu: null, erro: null, freio: false };
  if (rodadaId < 0) return loteNoEnsaio(rodadaId, a, c, d, EU_NO_ENSAIO, 'Você (ensaio)', colheita);
  const { data, error } = await rpc<{ eu?: unknown; freio?: unknown; descartados?: unknown } & Record<string, unknown>>(
    'fn_chefona_acertar',
    { p_rodada: rodadaId, p_acertos: a, p_criticos: c, p_dano: d, p_cliques: colheita.cliques, p_suspeita: colheita.suspeita },
  );
  if (error) return { rodada: null, eu: null, erro: error.message, freio: false };
  aceitarChefona(data);
  return {
    rodada: estado, eu: normalizarPlacarChefona(data?.eu), erro: null, freio: data?.freio === true,
    descartados: Math.max(0, inteiro(data?.descartados)),
  };
}

// ── O painel do super_admin ──────────────────────────────────────────────────

export async function soltarChefona(
  d: Pick<DificuldadeChefona, 'base' | 'porPessoa'>, minutos = PRAZO_MIN, esperaS = ESPERA_S,
): Promise<{ erro: string | null }> {
  const { error } = await rpc<number | null>('fn_chefona_soltar', {
    p_vida: d.base, p_minutos: minutos, p_espera_s: esperaS, p_vida_por_pessoa: d.porPessoa,
  });
  if (!error) void lerChefona().catch((): void => undefined);
  return { erro: error?.message ?? null };
}

/** A Poção de Cura: só o super_admin (o banco confere). */
export async function curarChefona(rodadaId: number): Promise<{ erro: string | null }> {
  if (rodadaId < 0) return { erro: ensaioCurar() };
  const { data, error } = await rpc<unknown>('fn_chefona_curar', { p_rodada: rodadaId, p_fracao: CURA_FRACAO });
  if (error) return { erro: error.message };
  aceitarChefona(data);
  return { erro: null };
}

/** O Totem da Imortalidade: só o super_admin (o banco confere). */
export async function protegerChefona(rodadaId: number): Promise<{ erro: string | null }> {
  if (rodadaId < 0) return { erro: ensaioProteger() };
  const { data, error } = await rpc<unknown>('fn_chefona_proteger', { p_rodada: rodadaId });
  if (error) return { erro: error.message };
  aceitarChefona(data);
  return { erro: null };
}

/** Em palavras, o erro de soltar, curar ou proteger. */
export function motivoDoErroDaChefona(erro: string): string {
  if (erro.includes('JA_TEM_UMA')) return 'Ela já está na tela.';
  if (erro.includes('CHEFAO_NA_TELA')) return 'O Rei do Pop zumbi está na tela: espere ele cair ou fugir.';
  if (erro.includes('JA_BEBENDO')) return 'Ela já está bebendo.';
  if (erro.includes('VIDA_CHEIA')) return 'Ela já está com a vida toda.';
  if (erro.includes('JA_PROTEGIDA')) return 'Ela já está segurando o totem.';
  if (erro.includes('AINDA_CHEGANDO')) return 'Ela ainda não chegou.';
  if (erro.includes('SEM_CHEFONA')) return 'Ela não está mais na tela.';
  if (/fn_chefona_lobby/.test(erro)) return 'O banco ainda não tem o lobby da chefona (migration 20261016120000).';
  if (/fn_chefona_|PGRST202|schema cache/.test(erro)) return 'O banco ainda não tem a chefona (migration 20261015230000).';
  return erro;
}

/** Quem parece autoclick nesta chefona: só o super_admin (o banco confere). */
export async function lerSuspeitosChefona(rodadaId: number): Promise<{ fichas: FichaDeCliques[]; erro: string | null }> {
  if (rodadaId < 0) return { fichas: [...fichasDoEnsaio.values()], erro: null };
  const { data, error } = await rpc<unknown>('fn_chefona_suspeitos', { p_rodada: rodadaId });
  if (error) return { fichas: [], erro: error.message };
  return { fichas: normalizarFichas(data), erro: null };
}

// ── Ensaio (só no localhost) ─────────────────────────────────────────────────

let ultimoEnsaio = 0;
let robos: ReturnType<typeof setInterval> | null = null;
const fichasDoEnsaio = new Map<string, FichaDeCliques>();

const NOMES_DE_ENSAIO = [
  'Ana Paula Moura', 'Bruno Henrique Lima', 'Camila Rocha', 'Diego Martins', 'Elaine Cristina Souza',
  'Felipe Andrade', 'Gabriela Nunes', 'Heitor Campos',
];

/** Solta uma chefona de mentira — só na tela de quem está no laboratório. */
export function ensaioSoltarChefona(vida = 300, minutos = PRAZO_MIN, esperaS = 0, porPessoa = 60): void {
  ensaioRobosChefona(false);
  ultimoEnsaio -= 1;
  const chega = Date.now() + esperaS * 1000;
  fichasDoEnsaio.clear();
  publicar({
    id: ultimoEnsaio, solta_em: new Date(chega).toISOString(),
    expira_em: new Date(chega + minutos * 60_000).toISOString(),
    vida_max: vida, vida, vida_por_pessoa: porPessoa, situacao: 'ativo', derrotado_em: null,
    golpe_final_por: null, golpe_final_nome: null, golpe_final_foto: null,
    cura_em: null, cura_ate: null, cura_vida: 0, cura_semente: 0,
    versao: 1, participantes: 0, ranking: [],
    absorcao: 0, protegida: false, protegida_em: null, totem_em: null, totem_vida: 0, totens: 0, curas: 0,
    lobby_total: 0, lobby: [],
  });
}

function ensaioEntrarNoLobby(rodadaId: number): void {
  const r = estado;
  marcarLobby(rodadaId, true);
  if (!r || r.id !== rodadaId || r.lobby.some(l => l.usuario === EU_NO_ENSAIO)) return;
  const lobby = [...r.lobby, { usuario: EU_NO_ENSAIO, nome: 'Você (ensaio)', setor: null }].slice(-24);
  publicar({ ...r, lobby, lobby_total: r.lobby_total + 1, versao: r.versao + 1 });
}

function ensaioSairDoLobby(rodadaId: number): void {
  const r = estado;
  if (!r || r.id !== rodadaId || !r.lobby.some(l => l.usuario === EU_NO_ENSAIO)) return;
  publicar({ ...r, lobby: r.lobby.filter(l => l.usuario !== EU_NO_ENSAIO), lobby_total: Math.max(0, r.lobby_total - 1), versao: r.versao + 1 });
}

function loteNoEnsaio(
  rodadaId: number, a: number, c: number, d: number, usuario: string, nome: string, colheita: Colheita,
): ResultadoLoteChefona {
  const r = estado;
  if (!r || r.id !== rodadaId) return { rodada: r, eu: null, erro: null, freio: false };
  const nova = aplicarLote(r, { usuario, nome }, a, c, d, Date.now());
  if (nova !== r) {
    const g = nova.ranking.find(x => x.usuario === usuario)!;
    const f = fichasDoEnsaio.get(usuario);
    fichasDoEnsaio.set(usuario, {
      usuario, nome, dano: g.dano, acertos: g.acertos, headshots: g.headshots,
      cliques: (f?.cliques ?? 0) + colheita.cliques, lotes: (f?.lotes ?? 0) + 1,
      lotes_no_teto: (f?.lotes_no_teto ?? 0) + (a >= MAX_ACERTOS_POR_LOTE ? 1 : 0),
      suspeitas: (f?.suspeitas ?? 0) + ((colheita.suspeita & (MOTIVO.ritmo | MOTIVO.rapido | MOTIVO.sintetico)) ? 1 : 0),
      motivos: (f?.motivos ?? 0) | colheita.suspeita, segundos: (f?.segundos ?? 0) + 1,
    });
    if (nova.situacao !== 'ativo') ensaioRobosChefona(false);
    publicar(nova);
  }
  const i = estado?.ranking.findIndex(x => x.usuario === usuario) ?? -1;
  const g = i >= 0 ? estado!.ranking[i] : null;
  return {
    rodada: estado, erro: null, freio: false,
    eu: g ? { dano: g.dano, acertos: g.acertos, headshots: g.headshots, posicao: i + 1 } : null,
  };
}

function ensaioCurar(): string | null {
  const r = estado;
  const agora = Date.now();
  if (!r || r.id >= 0 || r.situacao !== 'ativo') return 'SEM_CHEFONA';
  if (chefaoChegando(r, agora)) return 'AINDA_CHEGANDO';
  if (r.cura_em && agora < Date.parse(r.cura_em) + 3_000) return 'JA_BEBENDO';
  const cura = Math.min(r.vida_max - r.vida, Math.max(1, Math.round(r.vida_max * CURA_FRACAO)));
  if (cura <= 0) return 'VIDA_CHEIA';
  publicar({ ...r, vida: r.vida + cura, cura_vida: cura, cura_em: new Date(agora).toISOString(), curas: r.curas + 1, versao: r.versao + 1 });
  return null;
}

function ensaioProteger(): string | null {
  const r = estado;
  const agora = Date.now();
  if (!r || r.id >= 0 || r.situacao !== 'ativo') return 'SEM_CHEFONA';
  if (chefaoChegando(r, agora)) return 'AINDA_CHEGANDO';
  if (r.protegida) return 'JA_PROTEGIDA';
  publicar({ ...r, protegida: true, protegida_em: new Date(agora).toISOString(), versao: r.versao + 1 });
  return null;
}

/** Os robôs: cada um acerta de vez em quando, uns mais que outros. */
export function ensaioRobosChefona(ligar: boolean): void {
  if (robos) { clearInterval(robos); robos = null; }
  if (!ligar) return;
  robos = setInterval(() => {
    const r = estado;
    if (!r || r.id >= 0 || r.situacao !== 'ativo') { ensaioRobosChefona(false); return; }
    const i = Math.floor(Math.random() ** 1.6 * NOMES_DE_ENSAIO.length);
    const a = 1 + Math.floor(Math.random() * 2);
    const c = Math.random() < 0.25 ? 1 : 0;
    loteNoEnsaio(r.id, a, c, a * 3 + c * 3, `robo-${i}`, NOMES_DE_ENSAIO[i], { cliques: a + 1, suspeita: 0 });
  }, 700);
}

export function ensaioArrancarChefona(fracao = 0.3): void {
  const r = estado;
  if (!r || r.id >= 0 || r.situacao !== 'ativo') return;
  // Um canhão: vários lotes cheios de uma vez.
  let falta = Math.max(1, Math.round(r.vida_max * fracao));
  while (falta > 0 && estado?.situacao === 'ativo') {
    const d = Math.min(falta, MAX_ACERTOS_POR_LOTE * MAX_DANO_POR_ACERTO);
    loteNoEnsaio(r.id, MAX_ACERTOS_POR_LOTE, 0, d, 'robo-canhao', 'Canhão do Laboratório', { cliques: 0, suspeita: 0 });
    falta -= d;
  }
}

export function ensaioPularContagemChefona(): void {
  const r = estado;
  if (!r || r.id >= 0 || !chefaoChegando(r, Date.now())) return;
  const agora = Date.now();
  const dura = Date.parse(r.expira_em) - Date.parse(r.solta_em);
  publicar({ ...r, solta_em: new Date(agora).toISOString(), expira_em: new Date(agora + dura).toISOString(), versao: r.versao + 1 });
}

export function ensaioFugirChefona(): void {
  const r = estado;
  if (!r || r.id >= 0 || r.situacao !== 'ativo') return;
  ensaioRobosChefona(false);
  publicar({ ...r, situacao: 'fugiu', versao: r.versao + 1 });
}

export function ensaioLimparChefona(): void {
  ensaioRobosChefona(false);
  fichasDoEnsaio.clear();
  if (estado && estado.id < 0) publicar(null);
}

/** Só para os testes: o estado é de módulo e vazaria de um caso para o outro. */
export function __resetChefonaParaTestes(): void {
  ensaioRobosChefona(false);
  estado = null;
  euNoLobby = null;
  ouvintes.clear();
}

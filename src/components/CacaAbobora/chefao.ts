/**
 * chefao.ts — o chefão da Caça aos Zumbis: a vida que todo mundo divide, os
 * tiros e o ranking de quem ajudou.
 *
 * ## O pedido (09/10/2026)
 *
 * No modo de soltar zumbi, um chefão: o Rei do Pop zumbi, do clipe de terror
 * clássico. Todo mundo atira nele ao mesmo tempo; ele fica dançando os
 * passinhos famosos, anda pela tela e desvia dos tiros. No fim aparece um
 * ranking de quem ajudou.
 *
 * ## A regra
 *
 * Mora no banco (migration 20261009120000): o super_admin solta o chefão com
 * uma vida (`vida_max`) e um prazo. Cada acerto tira vida — no corpo 1, na
 * cabeça 3 (`DANO_*` em `chefaoArte.ts`). Quem tira a última gota dá o GOLPE
 * FINAL. Passou do prazo com vida, ele foge dançando. O ranking é por dano.
 *
 * O desvio é da tela de cada um: a posição dele também (cada pessoa vê o
 * chefão no seu canto, como o zumbi comum). Só a vida e o ranking são de
 * todos.
 *
 * ## Os tiros vão em lote
 *
 * Cento e tantas pessoas clicando sem parar seriam centenas de chamadas por
 * segundo. O acerto entra na hora na tela de quem atirou (a vida desce antes
 * do banco responder) e vai ao banco junto com os outros a cada `LOTE_MS`.
 * O banco devolve a linha como ficou, e avisa os outros pelo Broadcast no
 * mesmo tópico da caça (`abobora:<empresa>`, sinal `chefao`) — no máximo um
 * aviso a cada 2 s, para não afogar o Realtime (o aviso vai a toda aba logada). `versao` sobe a cada mudança:
 * aviso atrasado não desfaz o que já se sabe.
 *
 * ## Ensaio (só no localhost)
 *
 * Como no zumbi comum: o laboratório solta um chefão de id negativo, os tiros
 * se resolvem aqui e nunca chegam ao banco, e há robôs atirando para ver o
 * ranking se mexer.
 */
import { useEffect, useReducer, useSyncExternalStore } from 'react';
import { supabase } from '@/lib/supabase';
import { DANO_CABECA, DANO_CORPO } from './chefaoArte';
import { MOTIVO, normalizarFichas, type Colheita, type FichaDeCliques } from './autoclick';

export type SituacaoChefao = 'ativo' | 'derrotado' | 'fugiu';

export interface Golpeador {
  usuario:   string;
  nome:      string;
  foto:      string | null;
  dano:      number;
  acertos:   number;
  headshots: number;
}

export interface RodadaChefao {
  id:               number;
  solta_em:         string;
  expira_em:        string;
  vida_max:         number;
  vida:             number;
  /** Quanto cada caçador novo soma à vida (no primeiro tiro dele). 0 = vida fixa. */
  vida_por_pessoa:  number;
  situacao:         SituacaoChefao;
  derrotado_em:     string | null;
  golpe_final_por:  string | null;
  golpe_final_nome: string | null;
  golpe_final_foto: string | null;
  /** O banquete (`curarChefao`): de quando a quando ele come e fica imune. */
  cura_em:          string | null;
  cura_ate:         string | null;
  /** Quanto o último banquete devolveu de vida. */
  cura_vida:        number;
  /** Escolhe a vítima e onde ela aparece — igual em toda tela. */
  cura_semente:     number;
  /** Sobe a cada mudança: aviso mais velho que o que se sabe é ignorado. */
  versao:           number;
  /** Quantas pessoas acertaram pelo menos uma vez. */
  participantes:    number;
  /** Os que mais tiraram vida, do maior para o menor (até `TOPO`). */
  ranking:          Golpeador[];
}

/** Quantos o banco manda no ranking. */
export const TOPO = 10;

/** De quanto em quanto tempo os acertos guardados vão ao banco. */
export const LOTE_MS = 1_000;

/**
 * O máximo que um lote leva (o banco confere de novo). Ninguém clica mais de
 * 12 vezes por segundo acertando um alvo que dança.
 */
export const MAX_ACERTOS_POR_LOTE = 12;

/** Folga sobre o `expira_em`: relógio adiantado não manda o chefão embora antes da hora. */
const FOLGA_EXPIRA_MS = 3_000;

/**
 * A contagem antes de ele aparecer (09/10/2026 — «antes do boss ser liberado,
 * uma contagem regressiva de 1 minuto»). O banco guarda a hora da chegada em
 * `solta_em`; até lá, todo mundo vê a contagem, e tiro não vale.
 */
export const ESPERA_S = 60;

// ── Quanto de vida ──────────────────────────────────────────────────────────
//
// A conta (09/10/2026): uma pessoa clica 3 a 4 vezes por segundo; num alvo que
// dança, acerta uns 45%, e ele desvia de uns 30% dos certeiros; com os
// headshots (3), dá ~1,8 de dano por segundo por pessoa. Em uns 2,5 minutos
// úteis (os 5 de prazo, menos as Fúrias e o tempo de achar a mira), são ~250
// por pessoa. Como não dá para saber quantos vão jogar (logado não é jogando),
// a vida CRESCE com quem entra: `vida_por_pessoa` a cada caçador novo.

export interface Dificuldade {
  nome: string;
  /** A vida com que ele chega. */
  base: number;
  /** Quanto cada caçador novo soma. */
  porPessoa: number;
}

export const DIFICULDADES: readonly Dificuldade[] = [
  { nome: 'Fácil', base: 300, porPessoa: 150 },
  { nome: 'Médio', base: 500, porPessoa: 250 },
  { nome: 'Difícil', base: 800, porPessoa: 400 },
];

/** A vida que ele terá com `pessoas` caçadores. */
export function vidaCom(d: Pick<Dificuldade, 'base' | 'porPessoa'>, pessoas: number): number {
  return d.base + d.porPessoa * Math.max(0, pessoas);
}

// ── O banquete ──────────────────────────────────────────────────────────────
//
// Pedido de 09/10/2026: um botão, só do super_admin, de recuperar a vida do
// chefão. Aparece uma pessoa num canto, ele corre até ela, pula e devora:
// recupera `CURA_FRACAO` da vida máxima e fica imune enquanto come. O banco
// manda (`fn_chefao_curar`): a hora e a vítima são as mesmas em toda tela.

/** Quanto da vida máxima um banquete devolve (no máximo o que falta). */
export const CURA_FRACAO = 0.25;
/**
 * Quanto dura (o banco usa os mesmos 12 s, e soma isso ao prazo): ela entra
 * andando, ele a vê, corre, dá o bote, e come o resto do tempo.
 */
export const CURA_MS = 12_000;
/** A parte do começo em que ele ainda está indo até a vítima: a vida só sobe depois. */
export const CURA_CHEGA_MS = 5_000;

/** Comendo agora: imune. */
export function curando(r: RodadaChefao | null, agora: number): boolean {
  if (!r?.cura_em || !r.cura_ate) return false;
  return agora >= Date.parse(r.cura_em) && agora < Date.parse(r.cura_ate);
}

/**
 * Quanto da vida do banquete AINDA não apareceu na barra. O banco devolve
 * tudo de uma vez; a barra sobe aos poucos, enquanto ele come.
 */
export function faltaDaCura(r: RodadaChefao, agora: number): number {
  if (!curando(r, agora) || r.cura_vida <= 0) return 0;
  const come = Date.parse(r.cura_em!) + CURA_CHEGA_MS;
  const ate = Date.parse(r.cura_ate!);
  const p = Math.min(1, Math.max(0, (agora - come) / Math.max(1, ate - come)));
  return Math.round(r.cura_vida * (1 - p));
}

/** Quanto tempo o ranking final fica aberto (a pessoa pode fechar antes). */
export const RANKING_MS = 60_000;

// ── Puras (exportadas para os testes) ─────────────────────────────────────────

const texto = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v : null);
const inteiro = (v: unknown, padrao = 0) => (Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : padrao);

function normalizarGolpeador(bruto: unknown): Golpeador | null {
  if (!bruto || typeof bruto !== 'object') return null;
  const g = bruto as Record<string, unknown>;
  const usuario = texto(g.usuario);
  if (!usuario) return null;
  return {
    usuario,
    nome:      texto(g.nome) ?? 'Alguém',
    foto:      texto(g.foto),
    dano:      Math.max(0, inteiro(g.dano)),
    acertos:   Math.max(0, inteiro(g.acertos)),
    headshots: Math.max(0, inteiro(g.headshots)),
  };
}

export function normalizarChefao(bruto: unknown): RodadaChefao | null {
  if (!bruto || typeof bruto !== 'object') return null;
  const r = bruto as Record<string, unknown>;
  const id = Number(r.id);
  if (!Number.isFinite(id) || typeof r.solta_em !== 'string' || typeof r.expira_em !== 'string') return null;
  const situacao: SituacaoChefao = r.situacao === 'derrotado' || r.situacao === 'fugiu' ? r.situacao : 'ativo';
  const vidaMax = Math.max(1, inteiro(r.vida_max, 1));
  const ranking = (Array.isArray(r.ranking) ? r.ranking : [])
    .map(normalizarGolpeador)
    .filter((g): g is Golpeador => g !== null);
  return {
    id,
    solta_em:         r.solta_em,
    expira_em:        r.expira_em,
    vida_max:         vidaMax,
    vida:             Math.min(vidaMax, Math.max(0, inteiro(r.vida, vidaMax))),
    vida_por_pessoa:  Math.max(0, inteiro(r.vida_por_pessoa)),
    situacao,
    derrotado_em:     texto(r.derrotado_em),
    golpe_final_por:  texto(r.golpe_final_por),
    golpe_final_nome: texto(r.golpe_final_nome),
    golpe_final_foto: texto(r.golpe_final_foto),
    cura_em:          texto(r.cura_em),
    cura_ate:         texto(r.cura_ate),
    cura_vida:        Math.max(0, inteiro(r.cura_vida)),
    cura_semente:     inteiro(r.cura_semente),
    versao:           inteiro(r.versao),
    participantes:    Math.max(ranking.length, inteiro(r.participantes)),
    ranking:          ordenarRanking(ranking),
  };
}

/** Do maior dano para o menor; empate, mais headshots; depois o nome. */
export function ordenarRanking(rs: readonly Golpeador[]): Golpeador[] {
  return [...rs].sort((a, b) => b.dano - a.dano || b.headshots - a.headshots || a.nome.localeCompare(b.nome, 'pt-BR'));
}

/**
 * Junta o que chegou ao que se sabe.
 *
 * - Rodada mais antiga: ignorada.
 * - Mesma rodada com versão menor: aviso atrasado, ignorado.
 * - Acabada (derrotado ou fugiu) não volta a «ativo».
 */
export function juntarChefao(atual: RodadaChefao | null, nova: RodadaChefao): RodadaChefao | null {
  if (!atual) return nova;
  if (nova.id < atual.id) return atual;
  if (nova.id > atual.id) return nova;
  if (atual.situacao !== 'ativo' && nova.situacao === 'ativo') return atual;
  if (nova.versao < atual.versao && nova.situacao === atual.situacao) return atual;
  if (nova.versao === atual.versao && nova.situacao === atual.situacao && nova.vida === atual.vida
    && nova.ranking.length === atual.ranking.length) return atual;
  return nova;
}

export function chefaoNaTela(r: RodadaChefao | null, agora: number): boolean {
  return !!r && r.situacao === 'ativo' && agora < Date.parse(r.expira_em) + FOLGA_EXPIRA_MS;
}

/** Solto, mas ainda na contagem: não chegou. */
export function chefaoChegando(r: RodadaChefao | null, agora: number): boolean {
  return !!r && r.situacao === 'ativo' && agora < Date.parse(r.solta_em);
}

/** O ativo cujo prazo passou sem aviso do banco: fugiu, daqui. */
export function situacaoNaTela(r: RodadaChefao, agora: number): SituacaoChefao {
  return r.situacao === 'ativo' && !chefaoNaTela(r, agora) ? 'fugiu' : r.situacao;
}

/** O dano de um lote. */
export function danoDoLote(acertos: number, headshots: number): number {
  return acertos * DANO_CORPO + headshots * DANO_CABECA;
}

/** «3:07» — quanto falta para ele fugir. */
export function formatarRelogio(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** A posição de alguém no ranking (1 = primeiro), ou 0 se não está nele. */
export function posicaoNoRanking(r: RodadaChefao | null, usuario: string | null | undefined): number {
  if (!r || !usuario) return 0;
  return r.ranking.findIndex(g => g.usuario === usuario) + 1;
}

// ── O estado do app ──────────────────────────────────────────────────────────

let estado: RodadaChefao | null = null;
const ouvintes = new Set<() => void>();

function publicar(proximo: RodadaChefao | null): void {
  if (proximo === estado) return;
  estado = proximo;
  for (const o of [...ouvintes]) o();
}

/** O que chegou do banco (Broadcast, resposta do tiro ou leitura). */
export function aceitarChefao(bruto: unknown): void {
  const nova = normalizarChefao(bruto);
  if (nova) publicar(juntarChefao(estado, nova));
}

export function estadoChefao(): RodadaChefao | null {
  return estado;
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
export async function lerChefao(): Promise<void> {
  const { data, error } = await rpc<unknown>('fn_chefao_atual');
  if (!error && data) aceitarChefao(data);
}

/**
 * O chefão de agora. A assinatura do tópico é a da caça (`caca.ts` ouve o
 * sinal `chefao` e entrega aqui); este gancho só lê e redesenha quando o
 * prazo vence sem aviso.
 */
export function useChefao(): RodadaChefao | null {
  const valor = useSyncExternalStore(
    o => { ouvintes.add(o); return () => { ouvintes.delete(o); }; },
    () => estado,
  );
  const [, redesenhar] = useReducer((n: number) => n + 1, 0);
  // Redesenha na chegada (fim da contagem) e no fim do prazo.
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

/** O placar de quem atirou — mesmo fora do topo do ranking. */
export interface MeuPlacar {
  dano:      number;
  acertos:   number;
  headshots: number;
  /** 1 = primeiro. */
  posicao:   number;
}

export interface ResultadoLote {
  rodada: RodadaChefao | null;
  eu:     MeuPlacar | null;
  erro:   string | null;
  /**
   * O banco achou este lote cedo demais (um a cada 600 ms por pessoa — a rede
   * pode juntar dois): os tiros NÃO entraram, e voltam no próximo lote.
   */
  freio:  boolean;
}

/** Quem está no laboratório, no ranking do ensaio. */
export const EU_NO_ENSAIO = 'voce';

export function normalizarPlacar(bruto: unknown): MeuPlacar | null {
  if (!bruto || typeof bruto !== 'object') return null;
  const p = bruto as Record<string, unknown>;
  return {
    dano:      Math.max(0, inteiro(p.dano)),
    acertos:   Math.max(0, inteiro(p.acertos)),
    headshots: Math.max(0, inteiro(p.headshots)),
    posicao:   Math.max(0, inteiro(p.posicao)),
  };
}

/**
 * Manda um lote de acertos. A resposta já atualiza a vida e o ranking de todos
 * nesta aba. `colheita` é o que o detector de autoclick mediu (`autoclick.ts`).
 */
export async function enviarLote(
  rodadaId: number, acertos: number, headshots: number, colheita: Colheita = { cliques: 0, suspeita: 0 },
): Promise<ResultadoLote> {
  const a = Math.max(0, Math.min(MAX_ACERTOS_POR_LOTE, Math.trunc(acertos)));
  const h = Math.max(0, Math.min(MAX_ACERTOS_POR_LOTE - a, Math.trunc(headshots)));
  if (a + h === 0) return { rodada: estado, eu: null, erro: null, freio: false };
  if (rodadaId < 0) {
    const r = loteNoEnsaio(rodadaId, a, h, EU_NO_ENSAIO, 'Você (ensaio)', colheita);
    const i = r?.ranking.findIndex(g => g.usuario === EU_NO_ENSAIO) ?? -1;
    const g = i >= 0 ? r!.ranking[i] : null;
    return { rodada: r, eu: g ? { dano: g.dano, acertos: g.acertos, headshots: g.headshots, posicao: i + 1 } : null, erro: null, freio: false };
  }
  const { data, error } = await rpc<{ eu?: unknown; freio?: unknown } & Record<string, unknown>>(
    'fn_chefao_acertar',
    { p_rodada: rodadaId, p_acertos: a, p_headshots: h, p_cliques: colheita.cliques, p_suspeita: colheita.suspeita },
  );
  if (error) return { rodada: null, eu: null, erro: error.message, freio: false };
  aceitarChefao(data);
  return { rodada: estado, eu: normalizarPlacar(data?.eu), erro: null, freio: data?.freio === true };
}

// ── O painel do super_admin ──────────────────────────────────────────────────

export async function soltarChefao(
  d: Pick<Dificuldade, 'base' | 'porPessoa'>, minutos: number, esperaS = ESPERA_S,
): Promise<{ erro: string | null }> {
  const { error } = await rpc<number | null>('fn_chefao_soltar', {
    p_vida: d.base, p_minutos: minutos, p_espera_s: esperaS, p_vida_por_pessoa: d.porPessoa,
  });
  if (!error) void lerChefao().catch((): void => undefined);
  return { erro: error?.message ?? null };
}

/** O banquete: só o super_admin (o banco confere). */
export async function curarChefao(rodadaId: number, fracao = CURA_FRACAO): Promise<{ erro: string | null }> {
  if (rodadaId < 0) return { erro: ensaioCurar(fracao) };
  const { data, error } = await rpc<unknown>('fn_chefao_curar', { p_rodada: rodadaId, p_fracao: fracao });
  if (error) return { erro: error.message };
  aceitarChefao(data);
  return { erro: null };
}

/** Em palavras, o erro do banquete. */
export function motivoDoErroDaCura(erro: string): string {
  if (erro.includes('JA_COMENDO')) return 'Ele já está comendo.';
  if (erro.includes('VIDA_CHEIA')) return 'Ele já está com a vida toda.';
  if (erro.includes('AINDA_CHEGANDO')) return 'Ele ainda não chegou.';
  if (erro.includes('SEM_CHEFAO')) return 'Ele não está mais na tela.';
  if (/fn_chefao_curar|PGRST202|schema cache/.test(erro)) return 'O banco ainda não tem o banquete (migration 20261009120000).';
  return erro;
}

/** Quem parece autoclick nesta rodada: só o super_admin (o banco confere). */
export async function lerSuspeitos(rodadaId: number): Promise<{ fichas: FichaDeCliques[]; erro: string | null }> {
  if (rodadaId < 0) return { fichas: [...fichasDoEnsaio.values()].map(fichaComSegundos), erro: null };
  const { data, error } = await rpc<unknown>('fn_chefao_suspeitos', { p_rodada: rodadaId });
  if (error) return { fichas: [], erro: error.message };
  return { fichas: normalizarFichas(data), erro: null };
}

// ── Ensaio (só no localhost) ─────────────────────────────────────────────────

let ultimoEnsaio = 0;
let robos: ReturnType<typeof setInterval> | null = null;

/** O que o banco guardaria de cada um, no ensaio (a lista de autoclick). */
const fichasDoEnsaio = new Map<string, FichaDeCliques & { desde: number; ate: number }>();
const fichaComSegundos = ({ desde, ate, ...f }: FichaDeCliques & { desde: number; ate: number }): FichaDeCliques =>
  ({ ...f, segundos: Math.max(1, Math.ceil((ate - desde) / 1000)) });

/** O robô que, no ensaio, atira de autoclick: para ver a lista acender. */
const ROBO_DO_AUTOCLICK = 'Leandro Duarte';

/** Quem «joga» no ensaio. O primeiro é quem está no laboratório. */
const NOMES_DE_ENSAIO = [
  'Ana Paula Moura', 'Bruno Henrique Lima', 'Camila Rocha', 'Diego Martins', 'Elaine Cristina Souza',
  'Felipe Andrade', 'Gabriela Nunes', 'Heitor Campos', 'Isabela Freitas', 'João Victor Alves',
  'Karina Lopes', 'Leandro Duarte',
];

/** Solta um chefão de mentira — só na tela de quem está no laboratório. */
export function ensaioSoltarChefao(vida = 120, minutos = 3, esperaS = 0, porPessoa = 0): void {
  ultimoEnsaio -= 1;
  const chega = Date.now() + esperaS * 1000;
  publicar({
    id: ultimoEnsaio, solta_em: new Date(chega).toISOString(),
    expira_em: new Date(chega + minutos * 60_000).toISOString(),
    vida_max: vida, vida, vida_por_pessoa: porPessoa, situacao: 'ativo', derrotado_em: null,
    golpe_final_por: null, golpe_final_nome: null, golpe_final_foto: null,
    cura_em: null, cura_ate: null, cura_vida: 0, cura_semente: 0,
    versao: 1, participantes: 0, ranking: [],
  });
  fichasDoEnsaio.clear();
}

/** O banquete no ensaio: as mesmas regras do banco. Devolve o erro, ou null. */
function ensaioCurar(fracao: number): string | null {
  const r = estado;
  const agora = Date.now();
  if (!r || r.id >= 0 || r.situacao !== 'ativo') return 'SEM_CHEFAO';
  if (chefaoChegando(r, agora)) return 'AINDA_CHEGANDO';
  if (curando(r, agora)) return 'JA_COMENDO';
  const cura = Math.min(r.vida_max - r.vida, Math.max(1, Math.round(r.vida_max * Math.min(0.5, Math.max(0.05, fracao)))));
  if (cura <= 0) return 'VIDA_CHEIA';
  publicar({
    ...r, vida: r.vida + cura, cura_vida: cura,
    cura_em: new Date(agora).toISOString(), cura_ate: new Date(agora + CURA_MS).toISOString(),
    cura_semente: Math.floor(Math.random() * 2 ** 31),
    expira_em: new Date(Date.parse(r.expira_em) + CURA_MS).toISOString(),
    versao: r.versao + 1,
  });
  return null;
}

/** O botão do laboratório. */
export function ensaioCurarChefao(): string | null {
  return ensaioCurar(CURA_FRACAO);
}

function loteNoEnsaio(
  rodadaId: number, acertos: number, headshots: number, usuario: string, nome: string,
  colheita: Colheita = { cliques: acertos + headshots, suspeita: 0 },
): RodadaChefao | null {
  const r = estado;
  if (!r || r.id !== rodadaId || r.situacao !== 'ativo' || chefaoChegando(r, Date.now()) || curando(r, Date.now())) return r;
  const agora = Date.now();
  const ficha = fichasDoEnsaio.get(usuario) ?? {
    usuario, nome, dano: 0, acertos: 0, headshots: 0, cliques: 0, lotes: 0, lotes_no_teto: 0,
    suspeitas: 0, motivos: 0, segundos: 1, desde: agora, ate: agora,
  };
  const antes = r.ranking.find(g => g.usuario === usuario);
  // Caçador novo: a vida cresce antes do tiro dele (como no banco).
  const extra = antes ? 0 : r.vida_por_pessoa;
  const vidaAntes = r.vida + extra;
  const dano = Math.min(vidaAntes, danoDoLote(acertos, headshots));
  if (dano <= 0) return r;
  const eu: Golpeador = {
    usuario, nome, foto: null,
    dano: (antes?.dano ?? 0) + dano,
    acertos: (antes?.acertos ?? 0) + acertos,
    headshots: (antes?.headshots ?? 0) + headshots,
  };
  fichasDoEnsaio.set(usuario, {
    ...ficha, dano: eu.dano, acertos: eu.acertos, headshots: eu.headshots, ate: agora,
    cliques: ficha.cliques + colheita.cliques, lotes: ficha.lotes + 1,
    lotes_no_teto: ficha.lotes_no_teto + (acertos + headshots >= MAX_ACERTOS_POR_LOTE ? 1 : 0),
    suspeitas: ficha.suspeitas + ((colheita.suspeita & (MOTIVO.ritmo | MOTIVO.rapido | MOTIVO.sintetico)) ? 1 : 0),
    motivos: ficha.motivos | colheita.suspeita,
  });
  const ranking = ordenarRanking([...r.ranking.filter(g => g.usuario !== usuario), eu]);
  const vida = vidaAntes - dano;
  const morreu = vida <= 0;
  const nova: RodadaChefao = {
    ...r, vida, vida_max: r.vida_max + extra, ranking, versao: r.versao + 1,
    participantes: ranking.length,
    ...(morreu ? {
      situacao: 'derrotado' as const, derrotado_em: new Date().toISOString(),
      golpe_final_por: usuario, golpe_final_nome: nome,
    } : {}),
  };
  if (morreu) ensaioRobos(false);
  publicar(nova);
  return nova;
}

/** Liga ou desliga os robôs: cada um acerta de vez em quando, uns mais que outros. */
export function ensaioRobos(ligar: boolean): void {
  if (robos) { clearInterval(robos); robos = null; }
  if (!ligar) return;
  let tiques = 0;
  robos = setInterval(() => {
    const r = estado;
    if (!r || r.id >= 0 || r.situacao !== 'ativo') { ensaioRobos(false); return; }
    const i = Math.floor(Math.random() ** 1.6 * (NOMES_DE_ENSAIO.length - 1));
    const head = Math.random() < 0.2 ? 1 : 0;
    loteNoEnsaio(r.id, 1 + Math.floor(Math.random() * 2) - head, head, `robo-${i}`, NOMES_DE_ENSAIO[i], {
      cliques: 2 + Math.floor(Math.random() * 3), suspeita: 0,
    });
    // O do autoclick: um tique sim, outro não, com o relógio e parado no lugar.
    if (++tiques % 2 === 0) {
      loteNoEnsaio(r.id, 1, 0, 'robo-autoclick', ROBO_DO_AUTOCLICK, {
        cliques: 10, suspeita: MOTIVO.ritmo | MOTIVO.seguro | MOTIVO.parado,
      });
    }
  }, 700);
}

export function ensaioRobosLigados(): boolean {
  return robos !== null;
}

/**
 * Um tiro de canhão do ensaio: tira uma fração da vida máxima de uma vez,
 * para ver os ferimentos e os braços voando sem atirar meia hora.
 */
export function ensaioArrancar(fracao = 0.3): void {
  const r = estado;
  if (!r || r.id >= 0 || r.situacao !== 'ativo') return;
  const dano = Math.max(1, Math.round(r.vida_max * fracao));
  loteNoEnsaio(r.id, dano, 0, 'robo-canhao', 'Canhão do Laboratório');
}

/** Acaba a contagem agora: ele chega já. */
export function ensaioPularContagem(): void {
  const r = estado;
  if (!r || r.id >= 0 || !chefaoChegando(r, Date.now())) return;
  const agora = Date.now();
  const dura = Date.parse(r.expira_em) - Date.parse(r.solta_em);
  publicar({ ...r, solta_em: new Date(agora).toISOString(), expira_em: new Date(agora + dura).toISOString(), versao: r.versao + 1 });
}

/** O prazo acabou: ele foge dançando. */
export function ensaioFugir(): void {
  const r = estado;
  if (!r || r.id >= 0 || r.situacao !== 'ativo') return;
  ensaioRobos(false);
  publicar({ ...r, situacao: 'fugiu', versao: r.versao + 1 });
}

/** Tira o ensaio da tela. */
export function ensaioLimparChefao(): void {
  ensaioRobos(false);
  fichasDoEnsaio.clear();
  if (estado && estado.id < 0) publicar(null);
}

// ── Não quero ver o chefão ───────────────────────────────────────────────────
//
// Ao lado do botão de música há um botão para esconder o chefão (09/10/2026):
// quem desliga não vê a contagem, nem ele, nem ouve nada dele. Vale para a
// pessoa, neste navegador (localStorage), até ela ligar de novo. Sem
// localStorage (aba anônima travada), fica ligado.

const chaveDesligado = (perfilId: string) => `caca:chefao:desligado:${perfilId}`;
const ouvintesDesligado = new Set<() => void>();

export function chefaoDesligado(perfilId: string | null | undefined): boolean {
  if (!perfilId) return false;
  try { return localStorage.getItem(chaveDesligado(perfilId)) === '1'; } catch { return false; }
}

export function desligarChefao(perfilId: string, desligar: boolean): void {
  try {
    if (desligar) localStorage.setItem(chaveDesligado(perfilId), '1');
    else localStorage.removeItem(chaveDesligado(perfilId));
  } catch { /* sem localStorage: fica como estava */ }
  for (const o of [...ouvintesDesligado]) o();
}

/** Se esta pessoa escondeu o chefão — redesenha quando ela troca. */
export function useChefaoDesligado(perfilId: string | null | undefined): boolean {
  return useSyncExternalStore(
    o => { ouvintesDesligado.add(o); return () => { ouvintesDesligado.delete(o); }; },
    () => chefaoDesligado(perfilId),
  );
}

/** Só para os testes: o estado é de módulo e vazaria de um caso para o outro. */
export function __resetChefaoParaTestes(): void {
  ensaioRobos(false);
  estado = null;
  ouvintes.clear();
}

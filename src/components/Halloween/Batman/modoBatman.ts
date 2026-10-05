/**
 * modoBatman.ts — quando o gestão está no modo Batman (pedido de 05/10/2026).
 *
 * A regra, combinada com o Cleber:
 *
 *   - ENTRA quando a faixa «Batman» do Som ambiente começa a tocar (escolhida
 *     pela pessoa: ela não está na sequência automática);
 *   - FICA enquanto ela continuar escolhida — pausar NÃO tira o tema. Quem quer
 *     ficar com ele, deixa a música pausada;
 *   - SAI quando a pessoa troca de faixa (ou a do Batman acaba e a sequência
 *     anda), sempre na mesma velocidade;
 *   - a trava: depois de sair, só entra de novo quando a saída TERMINOU. Deu
 *     play no meio da saída? A música toca e o tema volta assim que ela acabar;
 *   - F5 com o tema no ar e a faixa ainda escolhida: volta já montado, sem
 *     refazer a entrada (o motor devolve a música pausada no mesmo ponto).
 *
 * Fica fora do React, como o motor: trocar de tela não pode reiniciar a
 * entrada, e a saída tem de terminar mesmo numa tela sem o Batman. Quem desenha
 * (`CenaBatman`, a lanterna) só lê `nivelEm` a cada quadro.
 *
 * O «nível» vai de 0 (Halloween normal) a 1 (tema inteiro): o vermelho, a
 * névoa e a luz entram por faixas dele; o Batman aparece com a fase `dentro`.
 */
import { useSyncExternalStore } from 'react';
import { assinarSom, lerEstadoSom } from '../SomAmbiente/motor';

export type FaseBatman = 'fora' | 'entrando' | 'dentro' | 'saindo';

export interface EstadoBatman {
  fase: FaseBatman;
  /** `performance.now()` da última troca de fase. */
  desde: number;
  /** O nível no momento da troca (a saída pode começar no meio da entrada). */
  n0: number;
}

export const FAIXA_BATMAN = 'batman';
/** Do Halloween normal ao tema inteiro. */
export const SUBIDA_MS = 12_000;
/** Na saída, o tempo de ele sumir antes de o vermelho começar a baixar. */
export const SEGURA_MS = 2_600;
/** Do tema inteiro de volta ao normal, depois que ele sumiu. */
export const DESCIDA_MS = 8_000;

const FORA: EstadoBatman = { fase: 'fora', desde: 0, n0: 0 };
const lim = (v: number) => Math.max(0, Math.min(1, v));

/** O nível do tema (0 a 1) num instante. Puro: dá para testar. */
export function nivelEm(e: EstadoBatman, agora: number): number {
  const t = Math.max(0, agora - e.desde);
  switch (e.fase) {
    case 'fora': return 0;
    case 'dentro': return 1;
    case 'entrando': return lim(e.n0 + t / SUBIDA_MS);
    case 'saindo': return t < SEGURA_MS ? e.n0 : lim(e.n0 - (t - SEGURA_MS) / DESCIDA_MS);
  }
}

/** Quanto falta para a fase atual virar a próxima; `null` nas fases paradas. */
export function duracaoDaFase(e: EstadoBatman): number | null {
  if (e.fase === 'entrando') return (1 - e.n0) * SUBIDA_MS;
  if (e.fase === 'saindo') return SEGURA_MS + e.n0 * DESCIDA_MS;
  return null;
}

/**
 * O que o som pede agora. `tocando`: a faixa do Batman está de fato tocando
 * (não só escolhida). Puro: dá para testar.
 */
export function decidir(fase: FaseBatman, som: { faixa: string; tocando: boolean }): 'entrar' | 'sair' | null {
  if (fase === 'fora' && som.faixa === FAIXA_BATMAN && som.tocando) return 'entrar';
  if ((fase === 'entrando' || fase === 'dentro') && som.faixa !== FAIXA_BATMAN) return 'sair';
  // `saindo`: espera terminar — a trava contra entra-e-sai.
  return null;
}

// ── Marca no navegador, para o F5 ────────────────────────────────────────────

const chave = (perfilId: string) => `modo-batman:${perfilId}`;
function marcar(perfilId: string | null, ligado: boolean) {
  if (!perfilId) return;
  try {
    if (ligado) localStorage.setItem(chave(perfilId), '1');
    else localStorage.removeItem(chave(perfilId));
  } catch { /* modo privado: só não volta no F5 */ }
}
function marcado(perfilId: string): boolean {
  try { return localStorage.getItem(chave(perfilId)) === '1'; } catch { return false; }
}

// ── Estado observável ────────────────────────────────────────────────────────

let estado: EstadoBatman = FORA;
let perfil: string | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
const ouvintes = new Set<() => void>();
const relogio = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function publicar(novo: EstadoBatman) {
  estado = novo;
  for (const o of ouvintes) {
    try { o(); } catch { /* quem ouve não derruba o modo */ }
  }
}

function mudar(fase: FaseBatman) {
  const agora = relogio();
  publicar({ fase, desde: agora, n0: nivelEm(estado, agora) });
  marcar(perfil, fase === 'entrando' || fase === 'dentro');
  agendar();
}

function agendar() {
  if (timer) { clearTimeout(timer); timer = null; }
  const ms = duracaoDaFase(estado);
  if (ms === null) return;
  const fase = estado.fase;
  timer = setTimeout(() => {
    timer = null;
    if (estado.fase !== fase) return;
    mudar(fase === 'entrando' ? 'dentro' : 'fora');
    avaliar();
  }, ms);
}

/** Olha o som e decide. Chamado a cada mudança do motor. */
function avaliar() {
  const s = lerEstadoSom();
  if (s.perfil !== perfil) {
    // Outra sessão (login, logout, troca de pessoa): começa do zero — ou do F5.
    perfil = s.perfil;
    if (timer) { clearTimeout(timer); timer = null; }
    const volta = !!perfil && marcado(perfil) && s.prefs.faixa === FAIXA_BATMAN;
    publicar(volta ? { fase: 'dentro', desde: relogio(), n0: 1 } : FORA);
    if (perfil && !volta) marcar(perfil, false);
  }
  if (!perfil) return;
  const acao = decidir(estado.fase, {
    faixa: s.prefs.faixa,
    tocando: s.estado === 'tocando' && s.noAr === FAIXA_BATMAN && !s.silenciado,
  });
  if (acao === 'entrar') mudar('entrando');
  else if (acao === 'sair') mudar('saindo');
}

assinarSom(avaliar);
avaliar();

function assinar(o: () => void) {
  ouvintes.add(o);
  return () => { ouvintes.delete(o); };
}

/** A fase, para montar e desmontar as camadas. O nível, lido a cada quadro com `nivelAgora`. */
export function useModoBatman(): EstadoBatman {
  return useSyncExternalStore(assinar, () => estado, () => estado);
}
export const lerModoBatman = () => estado;
export const nivelAgora = () => nivelEm(estado, relogio());

// ── Para onde a lanterna aponta ──────────────────────────────────────────────
//
// A cena publica COMO achar a cabeça dele (em coordenadas da tela); a lanterna,
// que mora em outra camada, pergunta no próprio quadro. Pergunta e não valor
// guardado: com a página rolando, um valor de um quadro atrás faria a mira
// tremer. `null`: ele não está na tela.

type Ponto = { x: number; y: number };
let alvo: (() => Ponto | null) | null = null;
export const definirAlvoBatman = (onde: (() => Ponto | null) | null) => { alvo = onde; };
export const alvoBatman = (): Ponto | null => (alvo ? alvo() : null);

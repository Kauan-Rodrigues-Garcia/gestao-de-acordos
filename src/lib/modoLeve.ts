/**
 * modoLeve.ts — o «Modo leve», para computador fraco (pedido de 06/10/2026).
 *
 * Operadores com máquina mais fraca reclamaram de a tela travar na planilha. O
 * modo leve tira o que custa processador sem mudar número nenhum:
 *
 *   - as camadas animadas do Halloween (o que é parado fica);
 *   - animações e transições do app (`html[data-leve]` em `index.css`, e o
 *     framer-motion via `MotionConfig` em `App.tsx`);
 *   - a contagem dos números (`useMovimentoPreferido`);
 *   - desfoques de fundo e sombras com filtro;
 *   - a releitura do Dashboard e do Painel de Metas a cada acordo salvo na
 *     empresa, que passa a juntar os avisos por mais tempo (`ESPERA_RELEITURA`).
 *
 * ## Por máquina, e não por pessoa
 *
 * O que trava é o computador. Fica no `localStorage` do navegador, sem a
 * pessoa: quem senta numa máquina fraca encontra o modo como o deixaram, e a
 * mesma pessoa numa máquina boa não carrega a escolha junto.
 *
 * ## Quem sugere
 *
 * `SugestaoModoLeve` observa travadas de verdade (`PerformanceObserver`) e,
 * passando de `deveSugerir`, oferece o modo. «Agora não» cala a oferta por
 * `SILENCIO_MS`.
 */
import { useSyncExternalStore } from 'react';

const CHAVE = 'gestao:modo-leve';
const CHAVE_RECUSA = 'gestao:modo-leve-recusado-em';

/** Quanto tempo a oferta fica quieta depois de um «Agora não». */
export const SILENCIO_MS = 7 * 24 * 60 * 60_000;

function ler(): boolean {
  try { return localStorage.getItem(CHAVE) === '1'; } catch { return false; }
}

let ligado = typeof window !== 'undefined' ? ler() : false;
const ouvintes = new Set<() => void>();

function aplicarNoHtml(v: boolean) {
  if (typeof document === 'undefined') return;
  if (v) document.documentElement.setAttribute('data-leve', '');
  else document.documentElement.removeAttribute('data-leve');
}
aplicarNoHtml(ligado);

/** Leitura fora do React (hooks de dados, laços de animação). */
export function modoLeveLigado(): boolean {
  return ligado;
}

export function definirModoLeve(v: boolean): void {
  ligado = v;
  try { localStorage.setItem(CHAVE, v ? '1' : '0'); } catch { /* modo privado: vale até recarregar */ }
  aplicarNoHtml(v);
  for (const o of ouvintes) {
    try { o(); } catch { /* quem ouve não derruba o interruptor */ }
  }
}

function assinar(o: () => void) {
  ouvintes.add(o);
  return () => { ouvintes.delete(o); };
}

export function useModoLeve(): boolean {
  return useSyncExternalStore(assinar, modoLeveLigado, () => false);
}

// ── Oferta recusada ─────────────────────────────────────────────────────────

export function recusarSugestao(agora = Date.now()): void {
  try { localStorage.setItem(CHAVE_RECUSA, String(agora)); } catch { /* modo privado */ }
}

/** A oferta pode aparecer? Não com o modo já ligado, nem dentro do silêncio. */
export function podeSugerir(agora = Date.now()): boolean {
  if (ligado) return false;
  try {
    const em = Number(localStorage.getItem(CHAVE_RECUSA));
    return !(Number.isFinite(em) && em > 0 && agora - em < SILENCIO_MS);
  } catch {
    return true;
  }
}

// ── A regra do vigia (pura, para testar) ────────────────────────────────────

/** Uma travada: quando terminou (ms, relógio da página) e quanto durou. */
export interface Travada {
  fim: number;
  duracao: number;
}

/** O que se sabe da máquina — dicas do navegador, nem sempre presentes. */
export interface DicasDaMaquina {
  nucleos?: number;
  memoriaGb?: number;
}

/** A janela em que as travadas são somadas. */
export const JANELA_MS = 2 * 60_000;

/**
 * Máquina modesta pelas dicas do navegador: 4 núcleos ou menos, ou 4 GB ou
 * menos. Dica, não sentença — só deixa o vigia mais sensível.
 */
export function maquinaModesta(d: DicasDaMaquina): boolean {
  return (d.nucleos !== undefined && d.nucleos <= 4)
      || (d.memoriaGb !== undefined && d.memoriaGb <= 4);
}

/**
 * Hora de oferecer o modo leve?
 *
 * Conta só o que caiu nos últimos `JANELA_MS`. Travada é quadro de 50 ms ou
 * mais (menos de 20 quadros por segundo) — abaixo disso a pessoa não sente. Pede
 * as duas coisas, quantidade E tempo
 * somado: um único carregamento pesado (abrir a tela, importar um relatório)
 * dá uma travada longa e não é máquina fraca; muitas travadas curtas de
 * enfeite também não bastam se somarem pouco.
 *
 *   normal   — 12 travadas somando 3 s em 2 min;
 *   modesta  —  8 travadas somando 2 s.
 */
export function deveSugerir(travadas: readonly Travada[], agora: number, dicas: DicasDaMaquina = {}): boolean {
  const modesta = maquinaModesta(dicas);
  const minimo = modesta ? 8 : 12;
  const somaMinima = modesta ? 2_000 : 3_000;
  let qtd = 0;
  let soma = 0;
  for (const t of travadas) {
    if (t.duracao < 50 || agora - t.fim > JANELA_MS) continue;
    qtd += 1;
    soma += t.duracao;
  }
  return qtd >= minimo && soma >= somaMinima;
}

// ── Releitura em tempo real ─────────────────────────────────────────────────

/**
 * Espera e teto do agrupador que relê Dashboard e Painel de Metas a cada acordo
 * salvo na empresa. Normal: 300 ms / 1,2 s (o de sempre). Leve: 3 s / 10 s — o
 * número chega alguns segundos depois, e a máquina não recalcula sem parar no
 * horário de pico.
 */
export function esperaDaReleitura(): { esperaMs: number; tetoMs: number } {
  return ligado ? { esperaMs: 3_000, tetoMs: 10_000 } : { esperaMs: 300, tetoMs: 1_200 };
}

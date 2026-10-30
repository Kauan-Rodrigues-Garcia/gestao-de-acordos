/**
 * liberacao.ts — quem liga o Mural de Outubro no app de verdade, e quando a
 * abertura passa.
 *
 * Uma linha em `mural_outubro` (migration 20261029120000). O super_admin, em
 * Configurações > Geral (`admin/MuralOutubroConfig.tsx`):
 *
 *   «Liberar para o pessoal»  o mural liga para todos; sem a revelação
 *                             começada, ainda não aparece nada (`fases.ts`)
 *   «Começar a revelação»     a abertura fica daqui a 5 minutos (hora do
 *                             banco, migration 20261029235000), para todos:
 *                             o bueiro, a água, o barco, a mão, o
 *                             «Participar» e a revelação (e libera junto)
 *   nada começado             a revelação é a de sempre: o bueiro às 15h55
 *                             de sexta 30/10, a abertura às 16h
 *
 * O banco avisa pelo sinal `permissoes` (o caminho do jumpscare) e cada tela
 * relê. Este arquivo é leve de propósito: o `Layout` o carrega sempre, e o
 * resto do mural só baixa quando está liberado.
 *
 * No `npm run dev` o mural fica sempre ligado (o laboratório e o painel do
 * relógio dependem disso). Sem a migration, ninguém vê nada e nada quebra.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { supabase } from '@/lib/supabase';
import { assinarSinal } from '@/lib/sinais';
import { ABERTURA, BARCO_ANTES_DA_ABERTURA_MS, FIM, JANELA_MS } from './fases';
import { acertarPeloBanco } from './relogio';

export interface Liberacao {
  liberado: boolean;
  /** A abertura solta pelo botão (ms), ou `null` = sexta 16h. */
  abreEm: number | null;
  atualizadoPorNome: string | null;
  atualizadoEm: string | null;
}

const FECHADO: Liberacao = { liberado: false, abreEm: null, atualizadoPorNome: null, atualizadoEm: null };

let atual: Liberacao = FECHADO;
/** relógio do banco − relógio local, em ms. */
let desvioMs = 0;
let carregando: Promise<void> | null = null;
const ouvintes = new Set<() => void>();

function avisar() { for (const o of ouvintes) o(); }

type Rpc = (n: string, a?: Record<string, unknown>) => PromiseLike<{
  data: Record<string, unknown> | null; error: { message: string } | null;
}>;
const rpc: Rpc = (n, a) => (supabase.rpc as unknown as Rpc)(n, a);

function aplicar(data: Record<string, unknown> | null, pedidoEm: number): void {
  if (!data) return;
  const agora = new Date(String(data.agora ?? '')).getTime();
  if (Number.isFinite(agora)) {
    // Meio caminho da ida e volta: a hora do banco é a de quando ele respondeu.
    desvioMs = agora - (pedidoEm + (Date.now() - pedidoEm) / 2);
    acertarPeloBanco(desvioMs);
  }
  const abre = typeof data.abre_em === 'string' ? new Date(data.abre_em).getTime() : NaN;
  atual = {
    liberado: data.liberado === true,
    abreEm: Number.isFinite(abre) ? abre : null,
    atualizadoPorNome: typeof data.atualizado_por_nome === 'string' ? data.atualizado_por_nome : null,
    atualizadoEm: typeof data.atualizado_em === 'string' ? data.atualizado_em : null,
  };
  avisar();
}

async function ler(): Promise<void> {
  const pedidoEm = Date.now();
  const { data, error } = await rpc('fn_mural_outubro_ler');
  if (error) return;
  aplicar(data, pedidoEm);
}

function carregar(forcar = false): Promise<void> {
  if (!carregando || forcar) carregando = ler().catch((): void => undefined);
  return carregando;
}

/** A hora pelo relógio do banco (a abertura solta é marcada nele). */
export function agoraDoServidor(): number {
  return Date.now() + desvioMs;
}

/** A hora da abertura em vigor: a solta pelo botão, ou sexta 16h. */
export function aberturaDe(l: Liberacao): number {
  return l.abreEm ?? ABERTURA;
}

/** A liberação atual. Escuta o sinal da empresa em que a pessoa está. */
export function useLiberacaoDoMural(empresaId: string | null | undefined): Liberacao {
  const valor = useSyncExternalStore(
    o => { ouvintes.add(o); return () => { ouvintes.delete(o); }; },
    () => atual,
  );

  useEffect(() => { void carregar(); }, []);

  useEffect(() => {
    if (!empresaId) return;
    return assinarSinal('permissoes', empresaId, {
      onMudou: s => { if (s.tabela === 'mural_outubro') void carregar(true); },
      onReconectado: () => { void carregar(true); },
    });
  }, [empresaId]);

  return valor;
}

/** O mural monta nesta tela? (liberado, ou no dev, ou na prévia ou no ensaio — e antes do fim de sábado). */
export function muralNaTela(l: Liberacao, previa: boolean): boolean {
  if (previa || previaDoBueiro || ensaio) return true;
  if (agoraDoServidor() >= FIM) return false;
  return l.liberado || import.meta.env.DEV;
}

// ── A prévia do super_admin: só nesta aba, nada gravado ─────────────────────

let previa = false;
const ouvintesDaPrevia = new Set<() => void>();

export function lerPrevia(): boolean { return previa; }

export function usePrevia(): boolean {
  return useSyncExternalStore(
    o => { ouvintesDaPrevia.add(o); return () => { ouvintesDaPrevia.delete(o); }; },
    () => previa,
  );
}

/** A abertura inteira só nesta tela, sem marcar que a pessoa já viu. */
export function verPrevia(): void { previa = true; for (const o of ouvintesDaPrevia) o(); }
export function encerrarPrevia(): void { previa = false; for (const o of ouvintesDaPrevia) o(); }

// ── A prévia do bueiro (29/10/2026): o bueiro, os balões e o barquinho ──────
//
// Só nesta aba, nada gravado, até desligar. Os balões e o barquinho vêm bem
// mais vezes do que na semana de verdade, para dar para ver tudo em segundos.

let previaDoBueiro = false;

export function usePreviaDoBueiro(): boolean {
  return useSyncExternalStore(
    o => { ouvintesDaPrevia.add(o); return () => { ouvintesDaPrevia.delete(o); }; },
    () => previaDoBueiro,
  );
}

export function alternarPreviaDoBueiro(): void {
  previaDoBueiro = !previaDoBueiro;
  for (const o of ouvintesDaPrevia) o();
}

/** Na prévia: um balão a cada ~8 s e a água com o barco a cada minuto (ela leva 45 s até a mão). */
export const BALAO_NA_PREVIA_MS = 8_000;
export const BARCO_NA_PREVIA_MS = 60_000;

// ── O ensaio completo (29/10/2026) ──────────────────────────────────────────
//
// Pedido: «uma versão completa de teste, desde o início, o tempo de espera e
// até a abertura, para o super_admin». Só nesta aba, nada gravado: a mesma
// revelação do botão de verdade, os 5 minutos inteiros (`JANELA_MS`). O
// bueiro aparece com a névoa, faltando 2 min 45 s a água escorre, o barco
// cai, a mão sai, os 2 minutos com o «Participar» e, quando zera, a abertura
// (ou, sem participar, o botão da barra quando a revelação acaba). Os «já
// viu» e «participou» de verdade ficam guardados e voltam quando o ensaio
// acaba (`estado.ts`). Recarregar a página também acaba.

export interface Ensaio {
  /** Quando o ensaio começou (hora do portal). */
  inicio: number;
  /** A abertura do ensaio (hora do portal). */
  abreEm: number;
}

let ensaio: Ensaio | null = null;

export function lerEnsaio(): Ensaio | null { return ensaio; }

export function useEnsaio(): Ensaio | null {
  return useSyncExternalStore(
    o => { ouvintesDaPrevia.add(o); return () => { ouvintesDaPrevia.delete(o); }; },
    () => ensaio,
  );
}

/** Use `comecarEnsaio` (`estado.ts`), que também separa o «já viu» e o «participou». */
export function definirEnsaio(novo: Ensaio | null): void {
  ensaio = novo;
  for (const o of ouvintesDaPrevia) o();
}

/** O ensaio começando agora: a abertura dele fica 5 minutos depois, como no botão de verdade. */
export function ensaioDesdeAgora(agora: number): Ensaio {
  return { inicio: agora, abreEm: agora + JANELA_MS };
}

/** O atalho do ensaio: o relógio dele anda até 3 s antes da água (se ainda não chegou lá). */
export function ensaioNaAgua(e: Ensaio, agora: number): Ensaio {
  const pulo = e.abreEm - agora - (BARCO_ANTES_DA_ABERTURA_MS + 3_000);
  return pulo > 0 ? { inicio: e.inicio - pulo, abreEm: e.abreEm - pulo } : e;
}

// ── O cartão de Configurações (só o super_admin passa no banco) ──────────────

async function chamar(nome: string, args?: Record<string, unknown>): Promise<{ erro: string | null }> {
  const pedidoEm = Date.now();
  const { data, error } = await rpc(nome, args);
  if (error) return { erro: error.message };
  aplicar(data, pedidoEm);
  return { erro: null };
}

export const liberarMural = (liberado: boolean) => chamar('fn_mural_outubro_liberar', { p_liberado: liberado });
export const soltarAbertura = () => chamar('fn_mural_outubro_soltar');
export const cancelarAbertura = () => chamar('fn_mural_outubro_cancelar');

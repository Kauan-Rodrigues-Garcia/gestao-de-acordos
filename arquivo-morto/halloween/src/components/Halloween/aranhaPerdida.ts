/**
 * aranhaPerdida.ts — quando a aranha caiu da tela, e o que vem depois.
 *
 * A aranha derrubada some por cinco minutos. Antes, isso vivia só num timer
 * da página: recarregar (ou sair do Dashboard e voltar) trazia a aranha de
 * volta na hora. Agora a hora da queda fica no aparelho, e quem monta a
 * aranha pergunta aqui se ela ainda está perdida.
 *
 * A linha do tempo, contada da queda:
 *
 *   0 s            caiu da tela
 *   5 s            o morcego traz o cartaz «Procura-se» (`CARTAZ_EM_MS`)
 *   4 min 54 s     o cartaz pega fogo (`QUEIMA_ANTES_MS` antes da volta)
 *   5 min          ela volta andando pela borda e desce o fio
 *
 * No `localStorage`, e não no perfil: é uma brincadeira do aparelho, não uma
 * preferência da pessoa. Sem acesso ao armazenamento, vale o timer da página.
 */

export const VOLTA_EM_MS = 5 * 60_000;
export const CARTAZ_EM_MS = 5_000;
/** O fogo e as cinzas levam uns 5 s; ela aparece logo depois. */
export const QUEIMA_ANTES_MS = 6_000;

const CHAVE = 'hw:aranha-perdida-em';

/** Guarda a hora da queda. */
export function lembrarQueda(agora: number = Date.now()): void {
  try { localStorage.setItem(CHAVE, String(agora)); } catch { /* sem armazenamento: só o timer */ }
}

/** Esquece a queda — ela voltou. */
export function esquecerQueda(): void {
  try { localStorage.removeItem(CHAVE); } catch { /* idem */ }
}

/**
 * A hora da queda, se ela ainda está perdida. Queda antiga (já voltou),
 * no futuro (relógio mexido) ou ilegível: `null`, e a lembrança é apagada.
 */
export function quedaGuardada(agora: number = Date.now()): number | null {
  let bruto: string | null = null;
  try { bruto = localStorage.getItem(CHAVE); } catch { return null; }
  if (bruto === null) return null;
  const em = Number(bruto);
  if (!Number.isFinite(em) || em > agora || agora - em >= VOLTA_EM_MS) {
    esquecerQueda();
    return null;
  }
  return em;
}

export interface PlanoDaVolta {
  /** O cartaz já devia estar pendurado: aparece direto, sem o morcego. */
  cartazJaChegou: boolean;
  /** Daqui a quanto o morcego traz o cartaz (0 se já chegou). */
  cartazEm: number;
  /** Daqui a quanto o cartaz pega fogo. `null`: não dá mais tempo de mostrar o cartaz. */
  queimaEm: number | null;
  /** Daqui a quanto ela volta. */
  voltaEm: number;
}

/** O que falta acontecer, para uma queda em `queda`, vista em `agora`. */
export function planoDaVolta(queda: number, agora: number): PlanoDaVolta {
  const passou = Math.max(0, agora - queda);
  const voltaEm = Math.max(0, VOLTA_EM_MS - passou);
  const queima = VOLTA_EM_MS - QUEIMA_ANTES_MS - passou;
  return {
    cartazJaChegou: passou >= CARTAZ_EM_MS,
    cartazEm: Math.max(0, CARTAZ_EM_MS - passou),
    queimaEm: queima > 0 ? queima : null,
    voltaEm,
  };
}

/** «4:07» — o relógio do cartaz. */
export function relogio(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

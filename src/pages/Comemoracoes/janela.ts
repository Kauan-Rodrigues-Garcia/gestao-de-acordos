/**
 * janela.ts — quando uma comemoração está no ar, e qual entra primeiro.
 *
 * Fora dos componentes para ter teste: é aritmética de relógio, o tipo de coisa
 * que erra por um sinal trocado e só aparece na frente do time inteiro.
 */

/** O mínimo que estas contas precisam de uma comemoração. */
export interface Exibivel {
  id:           string;
  inicia_em:    string;
  duracao_s:    number;
  cancelada_em?: string | null;
}

/**
 * Até onde no futuro vale agendar um timer local.
 *
 * `setTimeout` de dias é desperdício e impreciso; o que passar disso é pego na
 * próxima releitura ou pelo realtime.
 */
export const HORIZONTE_TIMER_MS = 30 * 60_000;   // 30 min

/** Instante em que a comemoração começa, em ms. NaN vira 0 (nunca no ar). */
export function inicioMs(c: Exibivel): number {
  const t = new Date(c.inicia_em).getTime();
  return Number.isFinite(t) ? t : 0;
}

export function fimMs(c: Exibivel): number {
  return inicioMs(c) + Math.max(0, c.duracao_s) * 1000;
}

/** Já começou e ainda não acabou — quem entra no meio da festa vê. */
export function estaNoAr(c: Exibivel, agora: number): boolean {
  if (c.cancelada_em) return false;
  const inicio = inicioMs(c);
  if (!inicio) return false;
  return agora >= inicio && agora < fimMs(c);
}

/** Começa daqui a pouco e merece um timer local. */
export function vaiComecar(c: Exibivel, agora: number, horizonte = HORIZONTE_TIMER_MS): boolean {
  if (c.cancelada_em) return false;
  const inicio = inicioMs(c);
  if (!inicio) return false;
  return inicio > agora && inicio - agora <= horizonte;
}

/** Quanto falta para começar, nunca negativo. */
export function msAteComecar(c: Exibivel, agora: number): number {
  return Math.max(0, inicioMs(c) - agora);
}

/**
 * A próxima a entrar na tela, ou null.
 *
 * Uma de cada vez: duas comemorações sobrepostas no topo-centro seriam
 * ilegíveis. Entre as que estão no ar, ganha a que começou ANTES — quem chegou
 * primeiro termina primeiro, e a outra entra na sequência.
 */
export function proximaDaFila<T extends Exibivel>(
  lista: readonly T[],
  agora: number,
  jaExibidas: ReadonlySet<string>,
): T | null {
  const candidatas = lista
    .filter((c) => !jaExibidas.has(c.id) && estaNoAr(c, agora))
    .sort((a, b) => inicioMs(a) - inicioMs(b));
  return candidatas[0] ?? null;
}

/** Ainda não começou — está na agenda. */
export function estaAgendada(c: Exibivel, agora: number): boolean {
  if (c.cancelada_em) return false;
  const inicio = inicioMs(c);
  return !!inicio && inicio > agora;
}

/** Já começou e terminou. */
export function jaPassou(c: Exibivel, agora: number): boolean {
  const inicio = inicioMs(c);
  return !!inicio && agora >= fimMs(c);
}

// ── Agendamento ──────────────────────────────────────────────────────────────

/**
 * Até onde no futuro dá para agendar.
 *
 * Agendar para daqui a três meses é esquecer, não agendar: ninguém lembra de
 * conferir, e o time que bateu a meta já mudou de composição.
 */
export const MAX_DIAS_AGENDAMENTO = 7;

/**
 * Folga para o horário "agora" não ser recusado pelo tempo do clique.
 *
 * Sem ela, escolher o minuto corrente e levar 20 s preenchendo o resto do
 * formulário faria o envio falhar com "não dá para agendar no passado".
 */
export const TOLERANCIA_PASSADO_MS = 2 * 60_000;

/** Mensagem de erro do agendamento, ou null se estiver válido. */
export function validarAgendamento(iso: string, agora: number): string | null {
  const quando = new Date(iso).getTime();
  if (!Number.isFinite(quando)) return 'Escolha uma data e hora válidas.';
  if (quando < agora - TOLERANCIA_PASSADO_MS) {
    return 'Não dá para agendar no passado.';
  }
  if (quando > agora + MAX_DIAS_AGENDAMENTO * 24 * 3_600_000) {
    return `O agendamento vai até ${MAX_DIAS_AGENDAMENTO} dias à frente.`;
  }
  return null;
}

/**
 * Desvio entre o relógio do banco e o do navegador, em ms.
 *
 * Um PC com a hora adiantada mostraria a comemoração antes de todo mundo. O
 * desvio é medido uma vez e somado ao `Date.now()` local daí em diante.
 */
export function desvioDoServidor(agoraServidorIso: string, agoraLocalMs: number): number {
  const servidor = new Date(agoraServidorIso).getTime();
  if (!Number.isFinite(servidor)) return 0;
  return servidor - agoraLocalMs;
}

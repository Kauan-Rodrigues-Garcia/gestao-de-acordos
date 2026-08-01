/**
 * vistas.ts — quais comemorações ESTE usuário já viu.
 *
 * A metade que faltava do "não repetir". `finalizada_em` fecha a comemoração
 * para todo mundo; aqui é o contrário: a comemoração ainda está no ar para os
 * colegas, mas eu já vi e não quero ver de novo.
 *
 * Antes isso era um `Set` num `useRef`, ou seja, morria a cada F5. Recarregar a
 * página dentro da janela de duração fazia a mesma festa explodir outra vez — e
 * abrir o sistema numa segunda aba dava a terceira.
 *
 * Fica no `localStorage` e não no banco de propósito: é preferência de tela de
 * quem olha, muda várias vezes por minuto e não interessa a mais ninguém. Uma
 * tabela para isso seria escrita de banco a cada card exibido.
 *
 * Por usuário, porque o computador é compartilhado entre turnos.
 */

/** Comemoração de ontem não volta; guardar mais que isso só engorda a chave. */
const VALIDADE_MS = 7 * 24 * 3_600_000;

/** Teto de segurança para a chave não crescer sem limite. */
const MAX_GUARDADAS = 200;

interface Vista { id: string; ts: number }

export function chaveVistas(usuarioId: string | null | undefined): string {
  return `comemoracao:vistas::${usuarioId ?? 'anon'}`;
}

/**
 * Lê o registro, já podado.
 *
 * Tudo que não for reconhecido vira lista vazia: no pior caso a pessoa vê uma
 * comemoração repetida, o que é infinitamente melhor que uma tela que não
 * carrega por causa de um JSON estragado.
 */
export function lerVistas(usuarioId: string | null | undefined, agora = Date.now()): Vista[] {
  try {
    const bruto = localStorage.getItem(chaveVistas(usuarioId));
    if (!bruto) return [];
    const valor = JSON.parse(bruto) as unknown;
    if (!Array.isArray(valor)) return [];

    return valor
      .filter((v): v is Vista =>
        !!v && typeof v === 'object'
        && typeof (v as Vista).id === 'string'
        && typeof (v as Vista).ts === 'number')
      .filter((v) => agora - v.ts < VALIDADE_MS);
  } catch {
    return [];
  }
}

/** Já vi esta? */
export function jaVista(
  usuarioId: string | null | undefined,
  id: string,
  agora = Date.now(),
): boolean {
  return lerVistas(usuarioId, agora).some((v) => v.id === id);
}

/**
 * Marca como vista. Idempotente — marcar de novo não duplica nem renova.
 *
 * Não renovar é de propósito: o carimbo é de quando eu vi pela primeira vez, e
 * é ele que decide quando a entrada pode ser podada.
 */
export function marcarVista(
  usuarioId: string | null | undefined,
  id: string,
  agora = Date.now(),
): void {
  try {
    const atuais = lerVistas(usuarioId, agora);
    if (atuais.some((v) => v.id === id)) return;

    // Os mais novos ficam: numa poda, perder o registro de uma festa antiga
    // não repete nada, porque ela já saiu da janela faz tempo.
    const proximas = [...atuais, { id, ts: agora }].slice(-MAX_GUARDADAS);
    localStorage.setItem(chaveVistas(usuarioId), JSON.stringify(proximas));
  } catch {
    // Navegador sem localStorage (aba anônima com storage bloqueado): a
    // comemoração pode repetir num F5, e nada mais quebra.
  }
}

/** Só para teste. */
export function limparVistas(usuarioId: string | null | undefined): void {
  try { localStorage.removeItem(chaveVistas(usuarioId)); } catch { /* noop */ }
}

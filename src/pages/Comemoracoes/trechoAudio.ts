/**
 * trechoAudio.ts — qual pedaço da música toca na comemoração.
 *
 * O arquivo vai inteiro para o Storage; o que se guarda é a MARCAÇÃO do trecho
 * (onde começa e quanto dura). Recortar o arquivo de verdade exigiria decodar e
 * re-codificar o áudio no navegador — biblioteca nova, minutos de CPU e perda
 * de qualidade, para um resultado que o `currentTime` entrega de graça.
 *
 * Como o Storage responde a Range request, o navegador do operador busca só o
 * pedaço que vai tocar, e não o arquivo todo.
 */

/** Nenhuma comemoração passa de 1 minuto, então o trecho também não. */
export const TRECHO_MAX_S = 60;
/** Abaixo disso não dá tempo de reconhecer a música. */
export const TRECHO_MIN_S = 1;

export interface Trecho {
  /** Segundo em que a música começa a tocar. */
  inicio: number;
  /** Quantos segundos toca a partir dali. */
  duracao: number;
}

function arredondar(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Prende o trecho dentro do arquivo e dos limites.
 *
 * A duração é cortada pelo que sobra depois do início: escolher o segundo 50 de
 * uma música de 60 s não pode gerar um trecho de 1 minuto que ultrapassa o fim
 * do arquivo — tocaria silêncio.
 */
export function limitarTrecho(trecho: Trecho, duracaoTotalS: number): Trecho {
  const total = Number.isFinite(duracaoTotalS) && duracaoTotalS > 0 ? duracaoTotalS : 0;
  if (!total) return { inicio: 0, duracao: TRECHO_MIN_S };

  const inicio = Math.min(Math.max(0, arredondar(trecho.inicio) || 0), Math.max(0, total - TRECHO_MIN_S));
  const restante = total - inicio;

  const duracao = Math.min(
    Math.max(TRECHO_MIN_S, arredondar(trecho.duracao) || TRECHO_MIN_S),
    Math.min(TRECHO_MAX_S, restante),
  );

  return { inicio: arredondar(inicio), duracao: arredondar(duracao) };
}

/** Trecho inicial sugerido: do começo, até 30 s ou o que a música tiver. */
export function trechoSugerido(duracaoTotalS: number): Trecho {
  return limitarTrecho({ inicio: 0, duracao: 30 }, duracaoTotalS);
}

/** Instante em que o trecho termina. */
export function fimDoTrecho(trecho: Trecho): number {
  return arredondar(trecho.inicio + trecho.duracao);
}

/** `95` → `1:35`. Para mostrar tempo de música em cima do slider. */
export function formatarSegundos(s: number): string {
  if (!Number.isFinite(s) || s < 0) return '0:00';
  const total = Math.round(s);
  const minutos = Math.floor(total / 60);
  return `${minutos}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * trechoAudio.ts — de onde a música começa.
 *
 * O líder escolhe só o PONTO DE PARTIDA. Quanto tempo toca é a duração da
 * comemoração, escolhida no formulário — não faz sentido a música ter uma
 * duração própria e o card outra: uma das duas ficaria sobrando.
 *
 * O arquivo vai inteiro para o Storage; o que se guarda é a marcação. Recortar
 * o áudio de verdade exigiria decodar e re-codificar no navegador, para um
 * resultado que o `currentTime` do player entrega de graça. Como o Storage
 * responde a Range request, o navegador busca só o pedaço que vai tocar.
 */

/** Nenhuma comemoração passa de 1 minuto, então o som também não. */
export const TRECHO_MAX_S = 60;
/** Sobra mínima depois do ponto escolhido — abaixo disso não dá para ouvir. */
export const SOBRA_MIN_S = 1;

function arredondar(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Prende o ponto de partida dentro da música.
 *
 * Não deixa escolher um ponto colado no fim: o som teria menos de um segundo
 * antes de o arquivo acabar, e a comemoração rodaria em silêncio.
 */
export function limitarInicio(inicio: number, duracaoTotalS: number): number {
  const total = Number.isFinite(duracaoTotalS) && duracaoTotalS > 0 ? duracaoTotalS : 0;
  if (!total) return 0;
  const bruto = Number.isFinite(inicio) ? inicio : 0;
  return arredondar(Math.min(Math.max(0, bruto), Math.max(0, total - SOBRA_MIN_S)));
}

/**
 * Quanto de música ainda existe depois do ponto escolhido.
 *
 * Serve para avisar o líder quando a comemoração é mais longa do que o que
 * sobra da música — aí o fim toca em silêncio.
 */
export function sobraApos(inicio: number, duracaoTotalS: number): number {
  const total = Number.isFinite(duracaoTotalS) && duracaoTotalS > 0 ? duracaoTotalS : 0;
  return Math.max(0, arredondar(total - limitarInicio(inicio, total)));
}

/** `95` → `1:35`. Para mostrar tempo de música em cima do controle. */
export function formatarSegundos(s: number): string {
  if (!Number.isFinite(s) || s < 0) return '0:00';
  const total = Math.round(s);
  const minutos = Math.floor(total / 60);
  return `${minutos}:${String(total % 60).padStart(2, '0')}`;
}

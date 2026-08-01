/**
 * previaSom.ts — o player de prévia da biblioteca de mídia.
 *
 * **Um som por vez, para a página inteira.** Antes cada botão Play chamava
 * `tocarArquivoDeSom` e jogava fora a função de parada devolvida: nada guardava
 * quem estava tocando, então clicar duas vezes criava dois `<audio>` sobrepostos
 * e não havia como pausar. Com dez músicas na biblioteca isso vira uma parede
 * de som que só termina sozinha.
 *
 * Módulo e não hook: quem toca é o botão de um item, quem precisa parar é o
 * botão de OUTRO item. Estado compartilhado entre irmãos é mais simples fora do
 * React — e assim dá para testar sem montar tela.
 *
 * Nada aqui lança: som é reforço, e navegador que bloqueia autoplay não pode
 * derrubar a tela.
 */
import { tocarArquivoDeSom, type OpcoesSom } from './som-comemoracao';

interface EmCurso {
  url:   string;
  parar: () => void;
}

let emCurso: EmCurso | null = null;

/** Avisados sempre que muda o que está tocando (inclusive para null). */
const ouvintes = new Set<(url: string | null) => void>();

function avisar(): void {
  const url = emCurso?.url ?? null;
  for (const ouvinte of ouvintes) {
    try { ouvinte(url); } catch { /* ouvinte quebrado não derruba os outros */ }
  }
}

/** Qual URL está tocando agora, ou null. */
export function urlTocando(): string | null {
  return emCurso?.url ?? null;
}

export function estaTocando(url: string): boolean {
  return emCurso?.url === url;
}

/** Para o que estiver tocando. Silencioso se não houver nada. */
export function pausarPrevia(): void {
  if (!emCurso) return;
  const { parar } = emCurso;
  emCurso = null;
  try { parar(); } catch { /* já tinha parado */ }
  avisar();
}

/**
 * Toca a prévia de um som, parando o anterior.
 *
 * Clicar no que já está tocando PAUSA — é o comportamento que a pessoa espera
 * de um botão que virou play/pause, e evita reiniciar o mesmo trecho sem querer.
 *
 * Ignora o mudo de propósito: quem clicou em ouvir pediu para ouvir.
 */
export function tocarPrevia(url: string, opcoes?: OpcoesSom | null): void {
  if (estaTocando(url)) { pausarPrevia(); return; }

  pausarPrevia();
  const parar = tocarArquivoDeSom(url, true, opcoes);
  emCurso = { url, parar };
  avisar();

  // A prévia termina sozinha quando a duração acaba, e o módulo não fica
  // sabendo: `tocarArquivoDeSom` só devolve a parada. Sem este despertar, o
  // botão ficaria em "pause" para sempre depois do fim.
  const duracaoMs = (opcoes?.duracao ?? 0) * 1000;
  if (duracaoMs > 0) {
    setTimeout(() => {
      if (emCurso?.url === url) { emCurso = null; avisar(); }
    }, duracaoMs);
  }
}

/** Assina as mudanças. Devolve a função de cancelar, para o `useEffect`. */
export function ouvirPrevia(ouvinte: (url: string | null) => void): () => void {
  ouvintes.add(ouvinte);
  return () => { ouvintes.delete(ouvinte); };
}

/** Só para teste: derruba o estado entre casos. */
export function __resetarPrevia(): void {
  emCurso = null;
  ouvintes.clear();
}

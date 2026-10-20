/** O nome da gincana e os arquivos de som (servidos pelo próprio app, em public/sons/corrida). */
export const NOME_CORRIDA = 'Corrida da Sorte';

export const SONS = {
  /** «Tokyo Drift» (Teriyaki Boyz), escolhida pelo Cleber em 20/10/2026: começa 15 s depois do lobby abrir. */
  lobby: '/sons/corrida/lobby-tokyo-drift.mp3',
  /** O Tema da Vitória (o da Fórmula 1), os primeiros 77 s: começa 2 s depois de quem venceu cruzar a linha. */
  vitoria: '/sons/corrida/vitoria.mp3',
} as const;

let contexto: AudioContext | null = null;
/**
 * Chame DENTRO do clique («Assistir», «Testar»): o navegador só deixa tocar som
 * depois de um gesto da pessoa, e o AudioContext nasce suspenso fora dele.
 */
export function destravarAudio(): AudioContext | null {
  try {
    if (!contexto || contexto.state === 'closed') {
      const A = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!A) return null;
      contexto = new A();
    }
    if (contexto.state === 'suspended') void contexto.resume().catch((): void => undefined);
    return contexto;
  } catch {
    return null;
  }
}
export const audioDestravado = (): AudioContext | null => contexto;

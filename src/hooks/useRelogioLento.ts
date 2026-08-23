/**
 * useRelogioLento — um relógio que só acorda a tela quando muda alguma coisa.
 *
 * ## O problema de mostrar "há 3 h" numa lista
 *
 * O texto precisa envelhecer sozinho: um ticket aberto às 9h05 tem de virar
 * "há 1 h" às 10h05 sem ninguém tocar em nada. A saída ingênua é um
 * `setInterval` de um segundo — e aí quarenta cartões re-renderizam sessenta
 * vezes por minuto para mudar um texto que muda de minuto em minuto.
 *
 * Pior: cada cartão com o próprio `setInterval` produz quarenta timers
 * desalinhados, e a lista fica repintando em ondas o dia inteiro.
 *
 * Aqui há **um** timer por intervalo, compartilhado por todos os assinantes, e
 * ele bate a cada minuto. O carimbo devolvido é estável entre as batidas, o que
 * deixa `React.memo` funcionar: um cartão só re-renderiza quando o minuto vira
 * de fato.
 *
 * A aba oculta não bate: `document.hidden` congela o relógio e a volta produz
 * uma batida imediata, para o texto não voltar mostrando a hora de quando a
 * pessoa saiu.
 */
import { useSyncExternalStore } from 'react';

interface Relogio {
  agora: number;
  ouvintes: Set<() => void>;
  timer: ReturnType<typeof setInterval> | null;
}

const relogios = new Map<number, Relogio>();

function obter(intervaloMs: number): Relogio {
  let r = relogios.get(intervaloMs);
  if (!r) {
    r = { agora: Date.now(), ouvintes: new Set(), timer: null };
    relogios.set(intervaloMs, r);
  }
  return r;
}

function bater(r: Relogio): void {
  r.agora = Date.now();
  for (const ouvinte of [...r.ouvintes]) ouvinte();
}

export function useRelogioLento(intervaloMs = 60_000): number {
  const r = obter(intervaloMs);

  return useSyncExternalStore(
    (aoMudar) => {
      r.ouvintes.add(aoMudar);

      if (!r.timer) {
        r.timer = setInterval(() => {
          // Ninguém está olhando: não adianta acordar a tela, e a volta já
          // dispara uma batida pelo `visibilitychange`.
          if (typeof document !== 'undefined' && document.hidden) return;
          bater(r);
        }, intervaloMs);
      }

      const aoVoltar = () => {
        if (typeof document === 'undefined') return;
        if (document.visibilityState === 'visible') bater(r);
      };
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', aoVoltar);
      }

      return () => {
        r.ouvintes.delete(aoMudar);
        if (typeof document !== 'undefined') {
          document.removeEventListener('visibilitychange', aoVoltar);
        }
        // Último a sair apaga a luz: um timer vivo sem ouvinte roda para sempre.
        if (r.ouvintes.size === 0 && r.timer) {
          clearInterval(r.timer);
          r.timer = null;
        }
      };
    },
    () => r.agora,
    () => r.agora,
  );
}

export default useRelogioLento;

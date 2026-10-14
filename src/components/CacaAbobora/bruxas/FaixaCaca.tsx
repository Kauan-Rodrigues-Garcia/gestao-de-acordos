/**
 * FaixaCaca.tsx — a faixa das bruxas (`faixa.ts`) com o recado da rodada do
 * banco: quem derrubou, a foto, a bruxa, como foi, os recordes e o «2x».
 *
 * Baixada só quando a rodada achada é de bruxa (ver `../index.tsx`).
 */
import { useLayoutEffect, useRef } from 'react';
import type { RodadaAbobora } from '../caca';
import { montarFaixa } from './faixa';
import { dadosDaRodada } from './rodada';

export function FaixaBruxas({ rodada }: { rodada: RodadaAbobora }) {
  const lugar = useRef<HTMLDivElement>(null);
  const d = dadosDaRodada(rodada);
  // O que muda a faixa: a rodada, e o «2x» que chega depois.
  const chave = `${rodada.id}:${d.dobrado ? 1 : 0}:${d.morte}:${d.nome}:${d.foto ?? ''}:${d.rapida ? 1 : 0}:${d.hsRapido ? 1 : 0}`;

  useLayoutEffect(() => {
    const el = lugar.current;
    if (!el) return;
    let ajustar: (() => void) | null = null;
    // Num quadro à parte do tiro (PC fraco): o quadro do tiro já monta a queda.
    const pedido = requestAnimationFrame(() => {
      const f = montarFaixa(dadosDaRodada(rodada));
      el.replaceChildren(f.el);
      f.ajustar();
      ajustar = f.ajustar;
      // A fonte chega depois e muda a largura do recado.
      void document.fonts?.ready.then(() => ajustar?.());
    });
    const aoMudar = () => ajustar?.();
    window.addEventListener('resize', aoMudar);
    return () => {
      cancelAnimationFrame(pedido);
      window.removeEventListener('resize', aoMudar);
      ajustar = null;
    };
    // `chave` resume a rodada: a faixa só é remontada quando o recado muda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);

  return <div ref={lugar} />;
}

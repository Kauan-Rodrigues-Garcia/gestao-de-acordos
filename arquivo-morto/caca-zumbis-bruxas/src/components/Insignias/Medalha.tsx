/**
 * Uma medalha do álbum: fita na cor da gincana, aro dourado e, na face, o
 * desenho da própria gincana (`arte.ts`). A que falta é a silhueta, num aro
 * tracejado.
 *
 * `pendurada`: a do topo do app — a fita sai da borda de cima da barra e a
 * medalha balança quando o mouse passa.
 */
import { forwardRef, type HTMLAttributes } from 'react';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Conquista, Insignia } from './insignias';
import { rostoDaInsignia } from './arte';

interface Props extends HTMLAttributes<HTMLDivElement> {
  insignia: Insignia;
  conquista: Conquista | undefined;
  /** Diâmetro do disco, em px. */
  tam: number;
  pendurada?: boolean;
  /** Ganhou e ainda não viu: o disco pulsa. */
  nova?: boolean;
}

export const Medalha = forwardRef<HTMLDivElement, Props>(function Medalha(
  { insignia, conquista, tam, pendurada, nova, className, style, ...resto },
  ref,
) {
  const rosto = rostoDaInsignia(insignia.id, conquista?.desenho ?? null);
  // O desenho encosta na face: ampliar só por inteiro deixava a cabeça do Rei
  // (24 px com o chapéu) do tamanho de um botão.
  const escala = rosto ? (tam * 0.8) / Math.max(rosto.largura, rosto.altura) : 1;
  return (
    <div
      ref={ref}
      className={cn(
        'ins-medalha',
        pendurada && 'ins-pendurada',
        !conquista && 'ins-falta',
        nova && conquista && 'ins-nova',
        className,
      )}
      style={{ ['--tam' as string]: `${tam}px`, ['--fita' as string]: insignia.fita, ...style }}
      {...resto}
    >
      <div className="ins-fita" />
      <div className="ins-disco">
        {rosto && (
          <img src={rosto.url} alt="" width={rosto.largura * escala} height={rosto.altura * escala} draggable={false} />
        )}
      </div>
      {conquista?.golpeFinal && tam >= 22 && (
        <span className="ins-estrela" aria-hidden>
          <Star className="h-[70%] w-[70%] fill-current" />
        </span>
      )}
    </div>
  );
});

/**
 * A medalha da próxima gincana, que ainda não existe: fita cinza, face de
 * noite e um «?» dourado. Fica no fim da fileira do topo, puxando a
 * curiosidade (pedido de 19/10/2026: «duas com ? indagando qual será a
 * próxima»).
 */
export const MedalhaMisteriosa = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement> & { tam: number }>(
  function MedalhaMisteriosa({ tam, className, style, ...resto }, ref) {
    return (
      <div
        ref={ref}
        className={cn('ins-medalha ins-pendurada ins-misterio', className)}
        style={{ ['--tam' as string]: `${tam}px`, ['--fita' as string]: '#5b5566', ...style }}
        {...resto}
      >
        <div className="ins-fita" />
        <div className="ins-disco"><span className="ins-interrogacao">?</span></div>
      </div>
    );
  },
);

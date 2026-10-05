/**
 * AlternadorMeta — o seletor «Metas: 1ª | 2ª | 3ª | 4ª» no cabeçalho do card
 * «Projeção».
 *
 * Pedido de 05/10/2026: há quem prefira acompanhar o ritmo por uma meta acima
 * da 1ª. Cada opção é uma meta CADASTRADA da pessoa no mês — sem a 3ª, o
 * seletor vai de 1ª a 2ª; com só a 1ª, ele nem é desenhado (quem decide isso é
 * o `CardsMetas`). Oferecer uma meta para depois não ter o que mostrar seria
 * pior que não oferecer.
 *
 * ## Por que no cabeçalho do card
 *
 * A grade do painel está fechada — os cards de valor casam altura dois a dois
 * e o donut fecha a linha. Um seletor solto acima dela abriria uma faixa nova
 * só para ele; dentro do valor, brigaria com o anel. A linha do rótulo tem
 * sobra à direita, e a pílula mede o mesmo que os ícones que já moram ali
 * (16px de altura útil, com o respiro compensado em margem negativa), então o
 * card não cresce nem um pixel.
 *
 * O marcador é UM elemento compartilhado entre as opções (`layoutId`): ao
 * escolher outra meta ele desliza até ela, em vez de sumir de uma e nascer na
 * outra.
 */

import { useId } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { NivelMeta } from '@/lib/alvoProjecao';

interface AlternadorMetaProps {
  /** A meta em uso. */
  nivel: NivelMeta;
  /** As metas cadastradas, em ordem (sempre começa na 1ª). */
  niveis: readonly NivelMeta[];
  onEscolher: (nivel: NivelMeta) => void;
}

export function AlternadorMeta({ nivel, niveis, onEscolher }: AlternadorMetaProps) {
  const reduzir = useReducedMotion();
  const idMarcador = `marcador-meta-${useId()}`;

  return (
    <div className="-my-0.5 flex items-center gap-1.5">
      <span
        className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
        aria-hidden="true"
      >
        Metas:
      </span>
      <div
        role="radiogroup"
        aria-label="Meta da projeção"
        className="inline-flex items-center rounded-full border border-border/70 bg-muted/50 p-[2px] transition-colors hover:border-primary/40"
      >
        {niveis.map(n => {
          const ativo = n === nivel;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={ativo}
              aria-label={`Projeção pela ${n}ª meta`}
              title={ativo ? `Projeção pela ${n}ª meta` : `Ver a projeção pela ${n}ª meta`}
              onClick={() => { if (!ativo) onEscolher(n); }}
              className={cn(
                'relative rounded-full px-1.5 py-[2px] text-[10px] font-semibold leading-none tabular-nums select-none',
                'transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                ativo
                  ? (n === 1 ? 'text-foreground' : 'text-primary-foreground')
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {ativo && (
                <motion.span
                  layoutId={idMarcador}
                  aria-hidden="true"
                  className={cn(
                    'absolute inset-0 rounded-full shadow-sm transition-colors duration-200',
                    // A 1ª é a leitura de sempre: marcador neutro. Acima dela,
                    // a cor da marca avisa que a régua não é a padrão.
                    n === 1 ? 'bg-card ring-1 ring-border/60' : 'bg-primary',
                  )}
                  transition={reduzir
                    ? { duration: 0 }
                    : { type: 'spring', stiffness: 520, damping: 34 }}
                />
              )}
              <span className="relative z-10">{n}ª</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

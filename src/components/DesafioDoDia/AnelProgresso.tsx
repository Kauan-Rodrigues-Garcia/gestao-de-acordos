/**
 * O anel de progresso do desafio do dia.
 *
 * SVG puro: o traço é `currentColor`, então a cor vem da classe de quem usa.
 * Passado de 100%, o anel fecha e ganha uma segunda volta mais fina — bater o
 * desafio não é o fim da conta, e o anel cheio parado esconderia o que sobra.
 */
import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { useMovimentoPreferido } from '@/hooks/useMovimentoPreferido';

interface Props {
  progresso: number;
  tamanho?: number;
  espessura?: number;
  /** Classe de cor do traço (`text-amber-500`). */
  cor: string;
  className?: string;
  children?: ReactNode;
}

export function AnelProgresso({ progresso, tamanho = 160, espessura = 12, cor, className, children }: Props) {
  const { semMovimento } = useMovimentoPreferido();
  const raio = (tamanho - espessura) / 2;
  const volta = 2 * Math.PI * raio;
  const p = Math.max(0, progresso);
  const primeira = Math.min(p, 100) / 100;
  const extra = p > 100 ? Math.min(p - 100, 100) / 100 : 0;
  const transicao = semMovimento ? { duration: 0 } : { duration: 0.9, ease: [0.22, 1, 0.36, 1] as const };

  return (
    <div className={cn('relative shrink-0', className)} style={{ width: tamanho, height: tamanho }}>
      <svg width={tamanho} height={tamanho} viewBox={`0 0 ${tamanho} ${tamanho}`} className="-rotate-90" aria-hidden="true">
        <circle
          cx={tamanho / 2} cy={tamanho / 2} r={raio}
          fill="none" strokeWidth={espessura} className="stroke-muted"
        />
        <motion.circle
          cx={tamanho / 2} cy={tamanho / 2} r={raio}
          fill="none" strokeWidth={espessura} strokeLinecap="round"
          stroke="currentColor" className={cor}
          strokeDasharray={volta}
          initial={false}
          animate={{ strokeDashoffset: volta * (1 - primeira) }}
          transition={transicao}
        />
        {extra > 0 && (
          <motion.circle
            cx={tamanho / 2} cy={tamanho / 2} r={raio - espessura * 0.9}
            fill="none" strokeWidth={Math.max(3, espessura / 3)} strokeLinecap="round"
            stroke="currentColor" className={cn(cor, 'opacity-60')}
            strokeDasharray={2 * Math.PI * (raio - espessura * 0.9)}
            initial={false}
            animate={{ strokeDashoffset: 2 * Math.PI * (raio - espessura * 0.9) * (1 - extra) }}
            transition={transicao}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        {children}
      </div>
    </div>
  );
}

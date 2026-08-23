/**
 * ProgressoDesafio — a barra que cresce até o valor novo.
 *
 * Não usa `components/ui/progress` porque aquela barra é do sistema e pinta
 * sempre com `bg-primary`; aqui a cor é do TEMA da campanha, e o crescimento é
 * animado para que uma atualização discreta do Analítico seja percebida — o
 * mesmo motivo pelo qual `ValorAnimado` existe.
 *
 * `prefers-reduced-motion` desliga o movimento, e a barra vai direto ao valor
 * certo. Framer Motion respeita a preferência sozinho quando a transição é
 * declarada assim.
 */
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface Props {
  /** Percentual. Acima de 100 a barra apenas fica cheia. */
  progresso: number;
  /** Classe de cor do preenchimento — vem de `estiloDoTema`. */
  cor: string;
  className?: string;
  'aria-label'?: string;
}

export function ProgressoDesafio({ progresso, cor, className, ...resto }: Props) {
  const largura = Math.max(0, Math.min(100, progresso));
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(largura)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn('h-2 w-full overflow-hidden rounded-full bg-muted', className)}
      {...resto}
    >
      <motion.div
        className={cn('h-full rounded-full', cor)}
        initial={false}
        animate={{ width: `${largura}%` }}
        transition={{ type: 'spring', stiffness: 160, damping: 26 }}
      />
    </div>
  );
}

export default ProgressoDesafio;

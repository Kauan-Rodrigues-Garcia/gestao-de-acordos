/**
 * CadeadoMes — o selo de "mês fechado" e a explicação ao encostar nele.
 *
 * Existe como componente próprio porque o cadeado aparece em lugares que não
 * conversam entre si (cabeçalho de Acordos, linha da tabela, detalhe do acordo,
 * cabeçalho do painel), e um chip amarelo desenhado quatro vezes vira quatro
 * tons de amarelo e quatro textos diferentes para o mesmo fato.
 *
 * Dois modos, do mesmo componente:
 *
 *   • `variante="chip"`  — o selo do cabeçalho, com rótulo escrito
 *   • `variante="icone"` — só o cadeado, para caber ao lado de um botão de linha
 *
 * O `title` nativo acompanha o tooltip de propósito: em toque não existe hover,
 * e o motivo do bloqueio não pode depender de mouse.
 */

import { Lock, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import { ROTULO_MES_FECHADO } from '@/lib/fechamentoMes';

interface CadeadoMesProps {
  /** A frase completa — vem de `useFechamentoMes().mensagem`. */
  mensagem: string;
  /**
   * Cargo que passa pelo cadeado (super admin). Muda a cor e o ícone: âmbar de
   * "atenção, você pode" em vez do cinza de "não dá".
   */
  liberado?: boolean;
  variante?: 'chip' | 'icone';
  className?: string;
}

export function CadeadoMes({
  mensagem,
  liberado = false,
  variante = 'chip',
  className,
}: CadeadoMesProps) {
  const Icone = liberado ? ShieldAlert : Lock;

  const cores = liberado
    ? 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400'
    : 'border-border bg-muted/50 text-muted-foreground';

  const selo = variante === 'icone' ? (
    <span
      className={cn(
        'inline-flex items-center justify-center w-6 h-6 rounded-md border',
        cores, className,
      )}
      title={mensagem}
      aria-label={mensagem}
    >
      <Icone className="w-3 h-3" />
    </span>
  ) : (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border',
        'text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap',
        cores, className,
      )}
      title={mensagem}
    >
      <Icone className="w-3 h-3" />
      {liberado ? 'Fechado · super admin' : ROTULO_MES_FECHADO}
    </span>
  );

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>{selo}</TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs leading-relaxed">
          {mensagem}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

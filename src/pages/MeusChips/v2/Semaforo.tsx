/**
 * Semaforo — uma luz por chip, como a fileira de largada de corrida.
 *
 * Pedido do Cleber (17/11/2026): «a pessoa tem 4 chips, tem uma barrinha com 4
 * luzinhas; todos ativos = todas verdes; 3 ativos e 1 banido = três verdes e
 * uma vermelha». As luzes vão do verde (Ativo) ao amarelo (Recuperar), laranja
 * (Restrição) e vermelho (Banido) — `luzesDoSemaforo` ordena.
 *
 * Com muitos chips as luzes encolhem e, passado o teto, a fileira mostra as
 * primeiras e um «+N»: a barra não pode empurrar o nome da pessoa para fora.
 */
import { memo } from 'react';
import { cn } from '@/lib/utils';
import { mascararNumero } from '@/services/numeros/numerosFormato';
import {
  STATUS_CHIP_LABELS, luzesDoSemaforo, type StatusChip,
} from '@/services/chipsFisicos/chipsFisicosRegras';
import { LUZ_STATUS } from '../ChipsFisicos/coresStatusChip';


export interface SemaforoProps {
  chips: readonly { id: string; status: StatusChip; numero: string }[];
  tamanho?: 'sm' | 'md' | 'lg';
  /** Quantas luzes cabem antes do «+N». */
  maximo?: number;
  className?: string;
}

const TAMANHO = {
  sm: { luz: 'h-2.5 w-2.5', gap: 'gap-1', caixa: 'px-1.5 py-1' },
  md: { luz: 'h-3.5 w-3.5', gap: 'gap-1.5', caixa: 'px-2 py-1.5' },
  lg: { luz: 'h-5 w-5', gap: 'gap-2', caixa: 'px-3 py-2' },
} as const;

export const Semaforo = memo(function Semaforo({
  chips, tamanho = 'md', maximo = 12, className,
}: SemaforoProps) {
  const t = TAMANHO[tamanho];
  const luzes = luzesDoSemaforo(chips);
  const visiveis = luzes.slice(0, maximo);
  const sobra = luzes.length - visiveis.length;

  const resumo = (['ativo', 'recuperar', 'restricao', 'banido'] as StatusChip[])
    .map(s => [s, luzes.filter(c => c.status === s).length] as const)
    .filter(([, n]) => n > 0)
    .map(([s, n]) => `${n} ${STATUS_CHIP_LABELS[s].toLowerCase()}`)
    .join(', ');

  if (luzes.length === 0) {
    return (
      <span
        className={cn('inline-flex items-center rounded-full bg-zinc-900/90 dark:bg-black/70', t.caixa, className)}
        role="img" aria-label="Nenhum chip"
      >
        <span className={cn('rounded-full bg-zinc-700', t.luz)} />
      </span>
    );
  }

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full bg-zinc-900/90 ring-1 ring-black/20 dark:bg-black/70 dark:ring-white/10',
        'shadow-inner', t.caixa, t.gap, className,
      )}
      role="img"
      aria-label={`${luzes.length} chips: ${resumo}`}
      title={resumo}
    >
      {visiveis.map(c => (
        <span
          key={c.id}
          className={cn('rounded-full transition-colors duration-500', t.luz, LUZ_STATUS[c.status])}
          title={`${mascararNumero(c.numero)} — ${STATUS_CHIP_LABELS[c.status]}`}
        />
      ))}
      {sobra > 0 && (
        <span className="pl-0.5 text-[10px] font-semibold tabular-nums text-zinc-300">+{sobra}</span>
      )}
    </span>
  );
});

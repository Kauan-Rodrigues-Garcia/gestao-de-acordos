/**
 * O ícone do canal «Transferências». Arquivo à parte porque a `BolhaChat`
 * fechada o usa no aviso de pedido novo, e o canal inteiro só carrega com a
 * janela aberta (`janela.ts`).
 */
import { ArrowRightLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

export function IconeTransferencias({ tamanho, alerta }: { tamanho: number; alerta: boolean }) {
  return (
    <span
      className={cn(
        'relative grid shrink-0 place-items-center rounded-full',
        alerta ? 'bg-amber-500 text-white' : 'bg-primary/15 text-primary',
      )}
      style={{ width: tamanho, height: tamanho }}
      aria-hidden
    >
      <ArrowRightLeft style={{ width: tamanho * 0.48, height: tamanho * 0.48 }} />
    </span>
  );
}

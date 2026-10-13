import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import type { InfoFaixa } from './faixas';
import './somAmbiente.css';

/**
 * A capa do disco — ou, sem ela (playlist, ou a imagem não carregou), o ícone
 * da faixa no tom dela. Quem chama dá o tamanho e o arredondamento.
 */
export function CapaFaixa({ info, className, icone = 'h-4 w-4' }: {
  info: InfoFaixa;
  className?: string;
  /** Tamanho do ícone de quando não há capa. */
  icone?: string;
}) {
  const [falhou, setFalhou] = useState(false);
  useEffect(() => setFalhou(false), [info.capa]);

  if (info.capa && !falhou) {
    return (
      <img
        src={info.capa}
        alt=""
        decoding="async"
        draggable={false}
        onError={() => setFalhou(true)}
        className={cn('shrink-0 object-cover', className)}
      />
    );
  }
  return (
    <span className={cn('som-icone flex shrink-0 items-center justify-center', className)} aria-hidden>
      <info.Icone className={icone} />
    </span>
  );
}

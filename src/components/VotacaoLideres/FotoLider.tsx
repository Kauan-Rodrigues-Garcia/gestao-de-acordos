import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import { iniciais, type Candidato } from './cedula';

/** Foto do líder (redonda, a não ser que a classe diga outra coisa); sem foto, as iniciais. */
export function FotoLider({ lider, className, estilo }: { lider: Candidato | undefined; className?: string; estilo?: CSSProperties }) {
  if (lider?.foto) {
    return <img src={lider.foto} alt="" draggable={false} loading="lazy" decoding="async" className={cn('rounded-full object-cover', className)} style={estilo} />;
  }
  return (
    <span aria-hidden="true" className={cn('grid place-items-center rounded-full bg-muted font-bold text-muted-foreground', className)} style={estilo}>
      {lider ? iniciais(lider.nome) : '?'}
    </span>
  );
}

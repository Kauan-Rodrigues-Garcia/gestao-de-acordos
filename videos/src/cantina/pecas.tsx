// As peças que as duas telas da cantina dividem, desenhadas como as de
// `src/pages/Cantina/visual.tsx` no app — só que paradas: no vídeo quem anima é
// o quadro, nunca o CSS.

import { Check, ChefHat, CupSoda, PackageCheck, Sandwich, UtensilsCrossed, type LucideIcon } from 'lucide-react';
import { Img, staticFile } from 'remotion';
import { cn } from '@/lib/utils';
import type { Categoria } from './dados';

const ILUSTRACAO: Record<Categoria, { icone: LucideIcon; fundo: string; cor: string }> = {
  lanches: { icone: Sandwich, fundo: 'from-amber-200 via-orange-200 to-orange-300', cor: 'text-orange-700' },
  bebidas: { icone: CupSoda, fundo: 'from-sky-100 via-cyan-200 to-sky-300', cor: 'text-sky-700' },
};

export const fotoDe = (foto: string) => staticFile(`cantina/${foto}.jpg`);

/**
 * A imagem do item: a ilustração da categoria e, por cima, a foto.
 * `revela` (0 → 1) abre a foto num círculo que cresce do meio.
 */
export const ImagemItem: React.FC<{
  categoria: Categoria;
  foto: string;
  revela: number;
  className?: string;
  style?: React.CSSProperties;
  tamanhoIcone?: string;
}> = ({ categoria, foto, revela, className, style, tamanhoIcone = 'w-12 h-12' }) => {
  const il = ILUSTRACAO[categoria];
  const Icone = il.icone;
  return (
    <div className={cn('relative overflow-hidden', className)} style={style}>
      <div className={cn('absolute inset-0 bg-gradient-to-br', il.fundo)}>
        <span className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-white/35 blur-xl" />
        <span className="absolute -bottom-8 -left-4 w-20 h-20 rounded-full bg-white/25 blur-lg" />
        <Icone className={cn('absolute inset-0 m-auto drop-shadow-sm', il.cor, tamanhoIcone)} strokeWidth={1.6} />
      </div>
      {revela > 0 && (
        <Img
          src={fotoDe(foto)}
          className="absolute inset-0 h-full w-full object-cover"
          style={{
            clipPath: revela >= 1 ? undefined : `circle(${revela * 75}% at 50% 50%)`,
            transform: `scale(${1.12 - 0.12 * Math.min(1, revela)})`,
          }}
        />
      )}
    </div>
  );
};

export type Status = 'novo' | 'preparando' | 'pronto' | 'retirado';

const ROTULO: Record<Status, string> = {
  novo: 'Recebido',
  preparando: 'Preparando',
  pronto: 'Pronto para retirar',
  retirado: 'Retirado',
};

const SELO: Record<Status, string> = {
  novo: 'bg-sky-500/12 text-sky-700 ring-sky-500/30',
  preparando: 'bg-amber-500/15 text-amber-800 ring-amber-500/35',
  pronto: 'bg-emerald-500/15 text-emerald-700 ring-emerald-500/40',
  retirado: 'bg-muted text-muted-foreground ring-border',
};

export const SeloStatus: React.FC<{ status: Status; className?: string }> = ({ status, className }) => (
  <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 whitespace-nowrap', SELO[status], className)}>
    {status === 'pronto' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
    {status === 'preparando' && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />}
    {ROTULO[status]}
  </span>
);

const ETAPAS: { status: Status; rotulo: string; Icone: LucideIcon }[] = [
  { status: 'novo', rotulo: 'Recebido', Icone: Check },
  { status: 'preparando', rotulo: 'Preparando', Icone: ChefHat },
  { status: 'pronto', rotulo: 'Pronto', Icone: PackageCheck },
  { status: 'retirado', rotulo: 'Retirado', Icone: UtensilsCrossed },
];

/** Recebido → Preparando → Pronto → Retirado. `pulso` (0 → 1, em loop) é o anel da etapa atual. */
export const LinhaDoTempo: React.FC<{ status: Status; pulso: number }> = ({ status, pulso }) => {
  const atual = ETAPAS.findIndex((e) => e.status === status);
  return (
    <ol className="flex items-center w-full">
      {ETAPAS.map((e, i) => {
        const feito = i < atual || (i === atual && status === 'retirado');
        const agora = i === atual && status !== 'retirado';
        return (
          <li key={e.status} className={cn('flex items-center', i < ETAPAS.length - 1 && 'flex-1')}>
            <div className="flex flex-col items-center gap-1 min-w-[56px]">
              <span
                className={cn(
                  'relative flex items-center justify-center w-9 h-9 rounded-full ring-2',
                  feito && 'bg-emerald-500 text-white ring-emerald-500',
                  agora && (status === 'pronto' ? 'bg-emerald-500 text-white ring-emerald-300' : 'bg-primary text-primary-foreground ring-primary/30'),
                  !feito && !agora && 'bg-muted text-muted-foreground ring-border',
                )}
              >
                {agora && (
                  <span
                    className="absolute inset-0 rounded-full bg-current"
                    style={{ opacity: 0.25 * (1 - pulso), transform: `scale(${1 + 0.6 * pulso})` }}
                  />
                )}
                <e.Icone className="w-4 h-4" />
              </span>
              <span className={cn('text-[11px] font-medium', feito || agora ? 'text-foreground' : 'text-muted-foreground')}>{e.rotulo}</span>
            </div>
            {i < ETAPAS.length - 1 && <span className={cn('h-0.5 flex-1 -mt-5 mx-1 rounded-full', i < atual ? 'bg-emerald-500' : 'bg-border')} />}
          </li>
        );
      })}
    </ol>
  );
};

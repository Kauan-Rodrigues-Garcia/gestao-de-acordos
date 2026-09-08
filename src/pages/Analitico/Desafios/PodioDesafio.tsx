import { motion, useReducedMotion } from 'framer-motion';
import { Crown, Medal } from 'lucide-react';
import { formatBRL } from '@/lib/money';
import { cn } from '@/lib/utils';
import type { ResultadoParticipante } from '@/services/desafios/calcularDesafio';
import type { PremioPorPosicao } from '@/services/desafios/types';
import type { EstiloTema } from './tema';
import { percentualCurto, percentualCheio } from './tema';
import { AvatarParticipante } from './AvatarParticipante';
import { ProgressoDesafio } from './ProgressoDesafio';
import { PremioParticipante } from './PremioParticipante';

const MEDALHAS = [
  { borda: 'border-amber-400/50', fundo: 'from-amber-100/70 dark:from-amber-400/10', texto: 'text-amber-700 dark:text-amber-300', selo: 'bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-300' },
  { borda: 'border-slate-300/70 dark:border-slate-500/40', fundo: 'from-slate-100/80 dark:from-slate-400/10', texto: 'text-slate-600 dark:text-slate-300', selo: 'bg-slate-200/60 text-slate-700 dark:bg-slate-400/15 dark:text-slate-300' },
  { borda: 'border-orange-300/60 dark:border-orange-400/30', fundo: 'from-orange-100/50 dark:from-orange-400/10', texto: 'text-orange-800 dark:text-orange-300', selo: 'bg-orange-100 text-orange-800 dark:bg-orange-400/15 dark:text-orange-300' },
] as const;

interface Props {
  top5: ResultadoParticipante[];
  premios: PremioPorPosicao[];
  tema: EstiloTema;
  mostrarFotos: boolean;
  animar: boolean;
  voceId?: string | null;
  corridaDeProjecao?: boolean;
  compacto?: boolean;
}

/** Ordem de leitura 1–3 na primeira linha, 4–5 na segunda; coluna única no celular. */
export function PodioDesafio({ top5, premios, tema, mostrarFotos, animar, voceId, corridaDeProjecao, compacto: painel = false }: Props) {
  const reduzirMovimento = useReducedMotion();
  if (!top5.length) return null;

  return (
    <ol className="grid grid-cols-1 gap-3 md:grid-cols-6">
      {top5.map(item => {
        const estilo = MEDALHAS[item.posicao - 1];
        const primeiro = item.posicao === 1;
        const compacto = item.posicao > 3;
        const ehVoce = !!voceId && item.pessoa.id === voceId;
        const premio = premios.find(p => p.posicao === item.posicao);
        const Icone = primeiro ? Crown : Medal;
        return (
          <motion.li
            key={item.pessoa.id}
            layout={animar && !reduzirMovimento}
            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
            className={cn(
              'desafio-destaque relative flex min-w-0 flex-col rounded-2xl border bg-gradient-to-b to-card',
              painel ? 'p-3' : 'p-4',
              compacto ? 'from-muted/30 md:col-span-3' : 'md:col-span-2',
              estilo?.borda ?? 'border-border', estilo?.fundo,
              primeiro && 'shadow-[0_4px_24px_-16px_rgba(245,158,11,0.5)]',
              ehVoce && 'ring-2 ring-primary/40',
            )}
          >
            <div className="mb-4 flex items-center justify-between gap-2">
              <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold', estilo?.selo ?? 'bg-muted text-muted-foreground')}>
                <Icone className="h-3.5 w-3.5" aria-hidden="true" /> {item.posicao}º lugar
              </span>
              {ehVoce && <span className="text-[10px] font-semibold text-primary">Você</span>}
            </div>

            <div className={cn('flex min-w-0 flex-1', compacto ? 'items-center gap-3' : 'flex-col items-center text-center')}>
              <div className={cn('shrink-0 rounded-full border p-1', estilo?.borda ?? 'border-border', !compacto && 'mb-3')}>
                <AvatarParticipante
                  nome={item.pessoa.nome} fotoUrl={item.pessoa.fotoUrl} mostrarFoto={mostrarFotos}
                  className={cn('shrink-0', painel ? 'h-10 w-10' : compacto ? 'h-11 w-11' : 'h-16 w-16 lg:h-20 lg:w-20')}
                />
              </div>
              <div className={cn('min-w-0', compacto ? 'flex-1' : 'w-full')}>
                <p className={cn('break-words font-semibold leading-snug text-foreground', painel ? 'text-xs' : 'text-sm')}>{item.pessoa.nome}</p>
                {item.pessoa.equipeNome && <p className="mt-1 break-words text-[11px] text-muted-foreground">{item.pessoa.equipeNome}</p>}
              </div>
              <div className={cn('shrink-0', compacto ? 'text-right' : 'mt-auto pt-4 pb-1')}>
                <p className={cn('font-bold tracking-tight tabular-nums', painel ? (corridaDeProjecao ? 'text-xl' : 'text-sm') : compacto ? 'text-xl' : 'text-3xl', estilo?.texto ?? tema.destaque)}>
                  {corridaDeProjecao ? (item.meta ? percentualCheio(item.progresso) : '—') : formatBRL(item.recebido)}
                </p>
                {!corridaDeProjecao && <p className="mt-0.5 text-[10px] text-muted-foreground">recebidos</p>}
              </div>
            </div>

            {item.meta ? (
              <div className="mt-4">
                <ProgressoDesafio progresso={item.progresso} cor={tema.barra} className="h-1" aria-label={`Progresso de ${item.pessoa.nome}`} />
                {!corridaDeProjecao && !premio && <p className="mt-2 text-center text-[11px] text-muted-foreground">{percentualCurto(item.progresso)} do desafio</p>}
              </div>
            ) : null}
            {premio && <div className="mt-4"><PremioParticipante key={premio.posicao} premio={premio} compacto={painel} /></div>}
          </motion.li>
        );
      })}
    </ol>
  );
}

export default PodioDesafio;

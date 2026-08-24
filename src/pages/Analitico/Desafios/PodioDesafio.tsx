/**
 * PodioDesafio — os três primeiros, em destaque.
 *
 * O 1º ao centro e maior; 2º e 3º ao lado, um degrau abaixo. Em telas
 * estreitas o pódio vira uma coluna na ordem 1º, 2º, 3º — a ordem visual do
 * pódio (2, 1, 3) só existe quando há largura para ela, e é feita com `order`,
 * não com uma segunda lista.
 *
 * As medalhas seguem a paleta que o ranking do Analítico já usa (ouro, prata,
 * bronze), para que as duas telas se leiam como a mesma família.
 */
import { motion } from 'framer-motion';
import { formatBRL } from '@/lib/money';
import { cn } from '@/lib/utils';
import type { ResultadoParticipante } from '@/services/desafios/calcularDesafio';
import type { EstiloTema } from './tema';
import { percentualCurto } from './tema';
import { AvatarParticipante } from './AvatarParticipante';
import { ProgressoDesafio } from './ProgressoDesafio';

const MEDALHAS = [
  { medalha: '🥇', borda: 'border-yellow-400/60', fundo: 'bg-yellow-50/60 dark:bg-yellow-950/20', texto: 'text-yellow-700 dark:text-yellow-400' },
  { medalha: '🥈', borda: 'border-slate-400/60',  fundo: 'bg-slate-50/60 dark:bg-slate-900/20',   texto: 'text-slate-600 dark:text-slate-400' },
  { medalha: '🥉', borda: 'border-amber-700/40',  fundo: 'bg-orange-50/40 dark:bg-orange-950/10', texto: 'text-amber-700 dark:text-amber-500' },
] as const;

/** 2º à esquerda, 1º ao centro, 3º à direita — só a partir de `sm`. */
const ORDEM_VISUAL = ['sm:order-2', 'sm:order-1', 'sm:order-3'] as const;

interface Props {
  top3: ResultadoParticipante[];
  tema: EstiloTema;
  mostrarFotos: boolean;
  animar: boolean;
  voceId?: string | null;
}

export function PodioDesafio({ top3, tema, mostrarFotos, animar, voceId }: Props) {
  if (!top3.length) return null;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:items-end">
      {top3.map((item, i) => {
        const estilo = MEDALHAS[i];
        const primeiro = i === 0;
        const ehVoce = !!voceId && item.pessoa.id === voceId;
        return (
          <motion.div
            key={item.pessoa.id}
            layout={animar}
            layoutId={animar ? `desafio-podio-${item.pessoa.id}` : undefined}
            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
            className={cn(
              'flex flex-col items-center rounded-xl border bg-card p-4 text-center',
              estilo.borda, estilo.fundo, ORDEM_VISUAL[i],
              primeiro && 'sm:pb-6 sm:pt-6',
              ehVoce && 'ring-1 ring-primary/40',
            )}
          >
            <span className={cn('text-2xl', primeiro && 'sm:text-3xl')} aria-hidden="true">
              {estilo.medalha}
            </span>

            <AvatarParticipante
              nome={item.pessoa.nome}
              fotoUrl={item.pessoa.fotoUrl}
              mostrarFoto={mostrarFotos}
              className={cn('my-2', primeiro ? 'h-16 w-16 sm:h-20 sm:w-20' : 'h-14 w-14')}
            />

            <p className="w-full truncate text-sm font-semibold text-foreground">
              {item.pessoa.nome}
            </p>
            <p className="w-full truncate text-[11px] text-muted-foreground">
              {item.pessoa.equipeNome}
            </p>

            <p className={cn('mt-2 font-bold tabular-nums', primeiro ? 'text-xl' : 'text-lg', estilo.texto)}>
              {formatBRL(item.recebido)}
            </p>

            {item.meta ? (
              <>
                <ProgressoDesafio
                  progresso={item.progresso}
                  cor={tema.barra}
                  className="mt-2 h-1.5 w-full"
                  aria-label={`Progresso de ${item.pessoa.nome}`}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {percentualCurto(item.progresso)} do desafio
                  {item.falta > 0 && <> · faltam {formatBRL(item.falta)}</>}
                </p>
              </>
            ) : null}
          </motion.div>
        );
      })}
    </div>
  );
}

export default PodioDesafio;

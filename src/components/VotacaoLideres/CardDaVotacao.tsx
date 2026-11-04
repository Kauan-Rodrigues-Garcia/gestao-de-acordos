/**
 * CardDaVotacao — o aviso no canto inferior esquerdo (pedido de 04/11/2026),
 * no jeito de pesquisa: um cartão pequeno com o convite e o botão.
 *
 *   votar      a votação abriu e a pessoa ainda não votou → «Votar agora»
 *   resultado  a diretoria liberou o resultado → «Ver resultado»
 *
 * Minimiza numa pílula (fica no canto até votar). O de resultado dá para
 * dispensar. Só apresentação: quem decide quando aparece é `AvisoVotacao`.
 */
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, Trophy, Vote, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type TipoDoCard = 'votar' | 'resultado';

interface Props {
  tipo: TipoDoCard;
  titulo: string;
  minimizado: boolean;
  onAbrir: () => void;
  onMinimizar: () => void;
  onExpandir: () => void;
  /** Só no de resultado: some até sair outro. */
  onDispensar?: () => void;
  /** Recuo do menu lateral (px), como o dock de autorizações. */
  recuoEsquerda?: number;
  demo?: boolean;
}

export function CardDaVotacao({ tipo, titulo, minimizado, onAbrir, onMinimizar, onExpandir, onDispensar, recuoEsquerda = 16, demo }: Props) {
  const votar = tipo === 'votar';
  return (
    <div className="fixed bottom-4 left-4 z-[45] print:hidden md:left-[var(--recuo-votacao)]"
      style={{ '--recuo-votacao': `${recuoEsquerda}px` } as React.CSSProperties}>
      <AnimatePresence mode="wait">
        {minimizado ? (
          <motion.button key="pilula" type="button" onClick={onExpandir}
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}
            className="flex items-center gap-2.5 rounded-full border border-primary/40 bg-card py-2.5 pl-3 pr-4 text-[15px] font-semibold shadow-xl hover:border-primary">
            <span className="relative grid h-7 w-7 place-items-center rounded-full bg-primary/15 text-primary">
              {votar ? <Vote className="h-4 w-4" /> : <Trophy className="h-4 w-4" />}
              <span className="absolute -right-0.5 -top-0.5 h-2 w-2 animate-pulse rounded-full bg-warning" aria-hidden="true" />
            </span>
            {votar ? 'Votação da Liderança' : 'Saiu o resultado'}
          </motion.button>
        ) : (
          <motion.section key="card" role="dialog" aria-labelledby="vl-card-titulo"
            initial={{ opacity: 0, y: 24, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 260, damping: 22 }}
            // Tela estreita: sobra o canto direito para a bolha do chat (bottom-6 right-6, 56 px).
            className="w-[min(calc(100vw-7rem),390px)] overflow-hidden rounded-2xl border bg-card shadow-2xl md:w-[390px]">
            <div className={cn('h-2', votar ? 'bg-primary' : 'bg-warning')} aria-hidden="true" />
            <div className="relative p-5">
              <div className="absolute right-2.5 top-2.5 flex">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onMinimizar} aria-label="Minimizar"><ChevronDown className="h-5 w-5" /></Button>
                {!votar && onDispensar && (
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onDispensar} aria-label="Dispensar"><X className="h-5 w-5" /></Button>
                )}
              </div>
              <div className="flex items-start gap-3.5 pr-14">
                <motion.span animate={{ scale: [1, 1.08, 1] }} transition={{ repeat: Infinity, duration: 2.4 }}
                  className={cn('grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-3xl', votar ? 'bg-primary/15' : 'bg-warning/15')} aria-hidden="true">
                  {votar ? '🗳️' : '🏆'}
                </motion.span>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Votação da Liderança{demo ? ' · demonstração' : ''}
                  </p>
                  <h3 id="vl-card-titulo" className="mt-0.5 text-xl font-bold leading-tight">{votar ? 'Sua vez de votar!' : 'Saiu o resultado!'}</h3>
                </div>
              </div>
              <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
                <strong className="text-foreground">{titulo}</strong>
                {votar ? ': escolha o líder que mais combina com cada categoria. Leva poucos minutos e o voto é secreto.' : ': veja quem levou cada categoria.'}
              </p>
              <Button size="lg" className="mt-4 h-12 w-full gap-2 text-base" onClick={onAbrir}>
                {votar ? <><Vote className="h-5 w-5" /> Votar agora</> : <><Trophy className="h-5 w-5" /> Ver resultado</>}
              </Button>
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}

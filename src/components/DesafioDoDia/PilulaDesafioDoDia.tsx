/**
 * A pílula do desafio do dia na barra superior.
 *
 * Duas peças: `PilulaVisual` só desenha (a configuração usa para a prévia, sem
 * banco) e `PilulaDesafioDoDia` liga o placar ao vivo. A conectada some sozinha
 * para quem não está no alvo do desafio: enxergar pela RLS não é participar.
 *
 * O que ela mostra, por situação:
 *
 *   agendado   «Desafio do dia · começa às 14h»
 *   valendo    contagem regressiva do que falta + barra + tempo restante
 *   apurando   o que falta, enquanto o último lote do robô não chega
 *   encerrado  o resultado — batido ou o percentual alcançado
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Hourglass, Trophy, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ValorAnimado } from '@/components/ValorAnimado';
import { EfeitoComemoracao } from '@/components/comemoracao/EfeitoComemoracao';
import { usePlacarDoDia } from '@/hooks/useDesafioDoDia';
import type { AndamentoDoDia, SituacaoDoDia } from '@/services/desafios/desafioDoDia';
import { rotuloDoTempo, textoDaEntrada, valorDaMedida } from './formato';
import type { Desafio } from '@/services/desafios/types';
import { ESTILO_BATIDO, estiloDoDia, type EstiloDoDia } from './estilo';

export interface PilulaVisualProps {
  estilo: EstiloDoDia;
  situacao: SituacaoDoDia;
  andamento: AndamentoDoDia | null;
  /** «1h12» restante, «às 14h» para começar. */
  rotuloTempo: string | null;
  previa?: boolean;
  entrada?: { id: number; texto: string } | null;
  onClick?: () => void;
  className?: string;
}

export function PilulaVisual({
  estilo, situacao, andamento, rotuloTempo, previa = false, entrada = null, onClick, className,
}: PilulaVisualProps) {
  const bateu = !!andamento?.bateu;
  const e = bateu ? ESTILO_BATIDO : estilo;
  const progresso = Math.min(100, andamento?.progresso ?? 0);
  const porQtd = !!andamento?.porQuantidade;
  const formatar = (v: number) => valorDaMedida(v, porQtd);

  let conteudo: ReactNode;
  if (situacao === 'agendado') {
    conteudo = (
      <span className="truncate text-xs font-medium text-foreground">
        Desafio do dia <span className="text-muted-foreground">· {rotuloTempo ?? 'em breve'}</span>
      </span>
    );
  } else if (bateu) {
    conteudo = (
      <span className="flex items-center gap-1.5 text-xs font-semibold">
        <span className={e.texto}>Desafio batido!</span>
        <ValorAnimado valor={andamento?.realizado ?? 0} formatar={formatar} className="tabular-nums text-foreground" />
      </span>
    );
  } else if (situacao === 'encerrado') {
    conteudo = (
      <span className="text-xs font-medium text-muted-foreground">
        Encerrado · <span className="tabular-nums text-foreground">{Math.round(andamento?.progresso ?? 0)}%</span>
      </span>
    );
  } else {
    conteudo = (
      <>
        <span className="flex min-w-0 items-baseline gap-1">
          <span className="hidden text-[10px] font-medium uppercase tracking-wide text-muted-foreground lg:inline">Faltam</span>
          {andamento?.meta == null ? (
            <span className="text-xs text-muted-foreground">sem meta</span>
          ) : (
            <ValorAnimado
              valor={andamento.falta}
              formatar={formatar}
              className={cn('text-sm font-bold tabular-nums', e.texto)}
              classeDescendo="scale-110"
              aria-label="Quanto falta para o desafio do dia"
            />
          )}
        </span>
        <span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-muted sm:block" aria-hidden="true">
          <motion.span
            className={cn('block h-full rounded-full', e.barra)}
            initial={false}
            animate={{ width: `${progresso}%` }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          />
        </span>
        <span className="hidden text-[11px] font-semibold tabular-nums text-foreground sm:inline">{Math.floor(andamento?.progresso ?? 0)}%</span>
        {rotuloTempo && (
          <span className="hidden items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground md:inline-flex">
            {situacao === 'apurando' && <Hourglass className="h-2.5 w-2.5" aria-hidden="true" />}
            {rotuloTempo}
          </span>
        )}
      </>
    );
  }

  const Icone = bateu ? Trophy : Zap;

  return (
    <div className={cn('relative shrink-0', className)}>
      <motion.button
        type="button"
        onClick={onClick}
        title="Abrir o desafio do dia"
        aria-label="Abrir o desafio do dia"
        key={entrada?.id ?? 'parada'}
        initial={entrada ? { scale: 1 } : false}
        animate={entrada ? { scale: [1, 1.06, 1] } : { scale: 1 }}
        transition={{ duration: 0.5 }}
        className={cn(
          'flex h-9 max-w-[22rem] items-center gap-2 rounded-full border bg-card pl-1 pr-3 shadow-sm transition-shadow',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          e.borda,
          entrada && cn('ring-2 shadow-lg', e.brilho),
          situacao === 'encerrado' && !bateu && 'opacity-80',
        )}
      >
        <span className={cn('relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full', e.suave)}>
          {situacao === 'valendo' && !bateu && (
            <span className={cn('absolute inset-0 animate-ping rounded-full opacity-30 motion-reduce:animate-none', e.suave)} aria-hidden="true" />
          )}
          <Icone className={cn('relative h-3.5 w-3.5', e.texto)} aria-hidden="true" />
        </span>
        {conteudo}
        {previa && (
          <span className="rounded-full border border-dashed border-border px-1.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">Prévia</span>
        )}
      </motion.button>

      {/* O dinheiro que acabou de entrar sobe da pílula e some. */}
      <AnimatePresence>
        {entrada && (
          <motion.span
            key={entrada.id}
            initial={{ opacity: 0, y: 4, scale: 0.9 }}
            animate={{ opacity: 1, y: 30, scale: 1 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ duration: 0.45, ease: 'easeOut' }}
            className={cn(
              'pointer-events-none absolute left-1/2 top-full z-[60] -translate-x-1/2 whitespace-nowrap rounded-full border bg-card px-2.5 py-1 text-xs font-semibold shadow-lg',
              e.borda, e.texto,
            )}
          >
            {entrada.texto}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}

const MARCA_COMEMORADO = 'desafio-do-dia:comemorado:';

/** A pílula ligada ao placar. Some para quem não participa. */
export function PilulaDesafioDoDia({
  desafio, previa, onAbrir, className,
}: { desafio: Desafio; previa: boolean; onAbrir: (d: Desafio) => void; className?: string }) {
  const uso = usePlacarDoDia(desafio, true, { sempreAoVivo: previa });
  const { placar, andamento, situacao, minuto, hoje, entradas, loteId } = uso;
  const diario = desafio.regra.diario!;

  // A comemoração dispara na VIRADA para batido, uma vez por sessão.
  const bateuAntes = useRef<boolean | null>(null);
  const [festa, setFesta] = useState(false);
  useEffect(() => {
    if (!andamento) return;
    const antes = bateuAntes.current;
    bateuAntes.current = andamento.bateu;
    if (antes !== false || !andamento.bateu) return;
    const chave = MARCA_COMEMORADO + desafio.id;
    try {
      if (sessionStorage.getItem(chave)) return;
      sessionStorage.setItem(chave, '1');
    } catch { /* sem storage: comemora assim mesmo */ }
    setFesta(true);
    const t = setTimeout(() => setFesta(false), 3_200);
    return () => clearTimeout(t);
  }, [andamento, desafio.id]);

  if (!placar || !placar.suportado) return null;
  if (!placar.participo && !placar.acompanho && !previa) return null;

  const entrada = entradas.length && situacao !== 'agendado'
    ? { id: loteId, texto: textoDaEntrada(entradas, !!andamento?.porQuantidade) }
    : null;

  return (
    <>
      <PilulaVisual
        estilo={estiloDoDia(desafio.visual.acento)}
        situacao={situacao}
        andamento={andamento}
        rotuloTempo={rotuloDoTempo(situacao, diario, minuto, desafio.dataInicio, hoje)}
        previa={previa}
        entrada={entrada}
        onClick={() => onAbrir(desafio)}
        className={className}
      />
      {festa && <EfeitoComemoracao efeito="confete" id={`dia-${desafio.id}`} />}
    </>
  );
}

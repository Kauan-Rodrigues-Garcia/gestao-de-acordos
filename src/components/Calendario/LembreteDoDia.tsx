/**
 * O lembrete que desce do botão do Calendário quando há algo marcado para hoje
 * no setor — «Hoje: Banco de horas até às 19:00», «Hoje é aniversário da
 * Maryana».
 *
 * Desce colado ao botão (que é de onde a informação vem), uma vez por dia:
 * «Ver calendário» abre o painel, «Ok, entendi» só fecha. As duas marcam o dia
 * como visto (`calendarioLembrete.ts`), e o botão para de piscar junto.
 */
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { CalendarDays, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { corTexto } from '@/lib/temas';
import { INFO_TIPO, rotuloDoDia, type EventoCalendario } from '@/lib/calendarioSetor';
import { ICONE_TIPO } from './estiloTipo';

interface Props {
  aberto: boolean;
  hojeISO: string;
  eventos: EventoCalendario[];
  onVer: () => void;
  onDispensar: () => void;
}

export function LembreteDoDia({ aberto, hojeISO, eventos, onVer, onDispensar }: Props) {
  const reduzir = useReducedMotion();
  return (
    <AnimatePresence>
      {aberto && eventos.length > 0 && (
        <motion.div
          role="status"
          aria-live="polite"
          initial={reduzir ? { opacity: 0 } : { opacity: 0, y: -14, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduzir ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.98 }}
          transition={{ duration: 0.35, delay: reduzir ? 0 : 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="absolute left-0 top-full z-40 mt-2.5 w-[min(21rem,calc(100vw-5rem))] origin-top-left overflow-hidden rounded-2xl border border-border bg-card text-left shadow-xl"
        >
          {/* A setinha apontando para o botão. */}
          <span className="absolute -top-1.5 left-5 h-3 w-3 rotate-45 border-l border-t border-border bg-card" aria-hidden />

          <div className="relative flex items-start gap-3 border-b border-border bg-primary/10 px-4 py-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
              <CalendarDays className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">Hoje no seu setor</p>
              <p className="text-xs text-muted-foreground">{rotuloDoDia(hojeISO)}</p>
            </div>
            <button type="button" onClick={onDispensar} aria-label="Fechar lembrete"
              className="-mr-1 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          <ul className="space-y-2.5 px-4 py-3">
            {eventos.slice(0, 4).map(e => {
              const Icone = ICONE_TIPO[e.tipo];
              const cor = INFO_TIPO[e.tipo].cor;
              const aniversario = e.tipo === 'aniversario' && e.pessoa_nome;
              return (
                <li key={e.id} className="flex items-start gap-2.5">
                  <Icone className="mt-0.5 h-4 w-4 shrink-0" style={{ color: cor ? corTexto(cor) : 'var(--primary)' }} aria-hidden />
                  <div className="min-w-0">
                    <p className="text-sm font-medium leading-snug text-foreground">
                      {aniversario ? `Aniversário de ${e.pessoa_nome} 🎉` : e.titulo}
                    </p>
                    {e.detalhe && <p className="text-xs text-muted-foreground">{e.detalhe}</p>}
                  </div>
                </li>
              );
            })}
            {eventos.length > 4 && (
              <li className="text-xs text-muted-foreground">e mais {eventos.length - 4} no calendário</li>
            )}
          </ul>

          <div className="flex gap-2 px-4 pb-4">
            <Button size="sm" className="flex-1" onClick={onVer}>Ver calendário</Button>
            <Button size="sm" variant="ghost" onClick={onDispensar}>Ok, entendi</Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

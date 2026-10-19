/**
 * A gaveta do desafio do dia: abre da pílula da barra superior com o placar
 * completo. Baixada sob demanda por `BarraDesafioDoDia`.
 */
import { useRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Zap } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { usePlacarDoDia } from '@/hooks/useDesafioDoDia';
import { rotuloJanela } from '@/services/desafios/desafioDoDia';
import type { Desafio } from '@/services/desafios/types';
import { cn } from '@/lib/utils';
import { PainelDesafioDoDia } from './PainelDesafioDoDia';
import { estiloDoDia } from './estilo';

export function GavetaDesafioDoDia({ desafio, onClose }: { desafio: Desafio | null; onClose: () => void }) {
  const { perfil } = useAuth();
  const uso = usePlacarDoDia(desafio, !!desafio);
  const focoAnterior = useRef<HTMLElement | null>(null);
  const estilo = estiloDoDia(desafio?.visual.acento);

  return (
    <Dialog.Root open={!!desafio} onOpenChange={v => { if (!v) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="veu-desfocado fixed inset-0 z-50 bg-black/30 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 motion-reduce:animate-none" />
        <Dialog.Content
          aria-label={desafio ? `Desafio do dia ${desafio.nome}` : 'Desafio do dia'}
          onOpenAutoFocus={() => { focoAnterior.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; }}
          onCloseAutoFocus={e => { e.preventDefault(); focoAnterior.current?.focus(); }}
          className="fixed inset-y-0 right-0 z-50 flex w-[620px] max-w-[calc(100vw-1rem)] flex-col border-l border-border bg-background shadow-2xl outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right data-[state=open]:duration-300 data-[state=closed]:duration-200 motion-reduce:animate-none"
        >
          {desafio && (
            <>
              <header className="shrink-0 border-b border-border bg-card px-6 py-4">
                <div className="flex items-center justify-between gap-3">
                  <span className={cn('inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em]', estilo.texto)}>
                    <Zap className="h-4 w-4" aria-hidden="true" /> Desafio do dia
                  </span>
                  <Dialog.Close aria-label="Fechar" className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <X className="h-4 w-4" aria-hidden="true" />
                  </Dialog.Close>
                </div>
                <Dialog.Title className="mt-2 text-xl font-semibold tracking-tight text-foreground">{desafio.nome}</Dialog.Title>
                <Dialog.Description className="mt-1 text-xs text-muted-foreground">
                  {desafio.regra.diario?.alvoNome} · {desafio.regra.diario ? rotuloJanela(desafio.regra.diario) : ''}
                </Dialog.Description>
              </header>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">
                <PainelDesafioDoDia desafio={desafio} uso={uso} operadorId={perfil?.id ?? null} />
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

import { useRef, useState, useEffect } from 'react';
import { Check, ChevronDown, ShieldCheck } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import type { TermoUso } from '@/lib/supabase';

interface ModalTermoUsoProps {
  open: boolean;
  termo: TermoUso | null;
  onAceitar: () => Promise<void>;
  onRecusar: () => void;
}

export function ModalTermoUso({ open, termo, onAceitar, onRecusar }: ModalTermoUsoProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [scrolledToEnd, setScrolledToEnd] = useState(false);
  const [checked, setChecked] = useState(false);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    if (open) {
      setScrolledToEnd(false);
      setChecked(false);
      setAccepting(false);
      // reset scroll position
      if (contentRef.current) contentRef.current.scrollTop = 0;
    }
  }, [open]);

  function handleScroll() {
    const el = contentRef.current;
    if (!el || scrolledToEnd) return;
    if (el.scrollHeight - el.scrollTop <= el.clientHeight + 60) {
      setScrolledToEnd(true);
    }
  }

  async function handleAceitar() {
    if (!checked || accepting) return;
    setAccepting(true);
    await onAceitar();
    setAccepting(false);
  }

  if (!open || !termo) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={() => {
        // modal não pode ser fechado sem aceitar ou recusar
      }}
    >
      <DialogContent
        className="max-w-2xl flex flex-col gap-4 max-h-[92vh] [&>button.absolute]:hidden"
        onPointerDownOutside={e => e.preventDefault()}
        onEscapeKeyDown={e => e.preventDefault()}
        onInteractOutside={e => e.preventDefault()}
      >
        {/* Cabeçalho */}
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="w-4 h-4 text-primary flex-shrink-0" />
            {termo.titulo}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Versão {termo.versao} — Leia o conteúdo completo antes de aceitar.
          </DialogDescription>
        </DialogHeader>

        {/* Área de conteúdo com scroll obrigatório */}
        <div
          ref={contentRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto border border-border rounded-md p-4 text-xs leading-relaxed whitespace-pre-wrap font-mono bg-muted/20 min-h-0"
          style={{ maxHeight: '46vh' }}
        >
          {termo.conteudo}
          {/* espaçador para garantir scroll até o fim */}
          <div className="h-4" />
        </div>

        {/* Indicador de scroll */}
        {!scrolledToEnd && (
          <p className="flex-shrink-0 flex items-center justify-center gap-1 text-xs text-muted-foreground">
            <ChevronDown className="w-3.5 h-3.5 animate-bounce" />
            Role até o final para habilitar o aceite
          </p>
        )}

        {/* Checkbox de aceite */}
        <div
          className={cn(
            'flex-shrink-0 flex items-start gap-3 p-3 rounded-md border transition-colors',
            scrolledToEnd
              ? 'border-primary/30 bg-primary/5'
              : 'border-muted bg-muted/10 opacity-50',
          )}
        >
          <Checkbox
            id="aceite-check"
            checked={checked}
            disabled={!scrolledToEnd}
            onCheckedChange={v => { if (scrolledToEnd) setChecked(v === true); }}
            className="mt-0.5 flex-shrink-0"
          />
          <label
            htmlFor="aceite-check"
            className={cn(
              'text-xs leading-relaxed select-none',
              scrolledToEnd ? 'cursor-pointer' : 'cursor-not-allowed',
            )}
          >
            Li e aceito integralmente o Termo de Uso e a Política de Privacidade acima. Declaro estar ciente das minhas obrigações como usuário interno do sistema Gestão de Acordos.
          </label>
        </div>

        {/* Botões */}
        <DialogFooter className="flex-shrink-0 flex flex-col-reverse sm:flex-row sm:justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={onRecusar}
            disabled={accepting}
          >
            Recusar e sair
          </Button>
          <Button
            size="sm"
            className="gap-1.5"
            onClick={handleAceitar}
            disabled={!checked || accepting}
          >
            <Check className="w-3.5 h-3.5" />
            {accepting ? 'Registrando...' : 'Aceitar e Continuar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

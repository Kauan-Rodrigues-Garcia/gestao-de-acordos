/**
 * DialogoEtiquetas — marca as etiquetas do chip (Movimentando, Principal…).
 *
 * Grava a lista inteira de uma vez (`fn_chips_fisicos_etiquetas`).
 */
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { mascararNumero } from '@/services/numeros/numerosFormato';
import {
  ETIQUETAS_CHIP, ETIQUETA_CHIP_DESCRICAO, ETIQUETA_CHIP_LABELS, etiquetasDoChip,
  type EtiquetaChip,
} from '@/services/chipsFisicos/chipsFisicosRegras';
import { salvarEtiquetasChip, type ChipFisicoRow } from '@/services/chipsFisicos/chipsFisicos.service';
import { COR_ETIQUETA } from './coresStatusChip';

export function DialogoEtiquetas({ chip, onFechar, onSalvo }: {
  chip: ChipFisicoRow | null; onFechar: () => void; onSalvo: () => void;
}) {
  const [marcadas, setMarcadas] = useState<Set<EtiquetaChip>>(new Set());
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (chip) setMarcadas(new Set(etiquetasDoChip(chip)));
  }, [chip]);

  function alternar(e: EtiquetaChip) {
    setMarcadas(m => {
      const n = new Set(m);
      if (n.has(e)) n.delete(e); else n.add(e);
      return n;
    });
  }

  async function salvar() {
    if (!chip) return;
    setSalvando(true);
    const r = await salvarEtiquetasChip(chip.id, ETIQUETAS_CHIP.filter(e => marcadas.has(e)));
    setSalvando(false);
    if (!r.ok) { toast.error(r.erro ?? 'Não foi possível salvar as etiquetas.'); return; }
    toast.success(`Etiquetas de ${mascararNumero(chip.numero)} salvas.`);
    onSalvo();
    onFechar();
  }

  return (
    <Dialog open={chip !== null} onOpenChange={a => { if (!a && !salvando) onFechar(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Etiquetas do chip</DialogTitle>
          <DialogDescription>
            <span className="font-mono">{chip ? mascararNumero(chip.numero) : ''}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label="Etiquetas">
          {ETIQUETAS_CHIP.map(e => {
            const ligada = marcadas.has(e);
            return (
              <button
                key={e}
                type="button"
                aria-pressed={ligada}
                onClick={() => alternar(e)}
                className={cn(
                  'flex items-start gap-2 rounded-lg border p-2.5 text-left transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  ligada ? COR_ETIQUETA[e] : 'hover:bg-muted/60',
                )}
              >
                <span className={cn(
                  'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                  ligada ? 'border-current bg-current/10' : 'border-muted-foreground/40',
                )}>
                  {ligada && <Check className="h-3 w-3" aria-hidden />}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{ETIQUETA_CHIP_LABELS[e]}</span>
                  <span className="block text-[11px] text-muted-foreground">{ETIQUETA_CHIP_DESCRICAO[e]}</span>
                </span>
              </button>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onFechar} disabled={salvando}>Cancelar</Button>
          <Button onClick={() => void salvar()} disabled={salvando}>
            {salvando && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Salvar etiquetas
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

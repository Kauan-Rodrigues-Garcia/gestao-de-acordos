/**
 * ModalAvisosAntesDeSalvar — «confira antes de salvar» (11/11/2026).
 *
 * Lista o que parece fora do padrão no acordo (`lib/avisosAcordo.ts`) e deixa a
 * pessoa escolher: voltar e corrigir, ou salvar assim mesmo. Não bloqueia.
 */
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import type { AvisoAcordo } from '@/lib/avisosAcordo';

interface Props {
  /** `null` ou vazio = fechado. */
  avisos: AvisoAcordo[] | null;
  salvando?: boolean;
  /** Volta ao formulário, sem salvar. */
  onCorrigir: () => void;
  /** Salva do jeito que está. */
  onSalvarAssim: () => void;
}

export function ModalAvisosAntesDeSalvar({ avisos, salvando, onCorrigir, onSalvarAssim }: Props) {
  const aberto = !!avisos?.length;
  return (
    <Dialog open={aberto} onOpenChange={(open) => { if (!open && !salvando) onCorrigir(); }}>
      <DialogContent className="max-w-md" aria-describedby="dlg-avisos-antes-de-salvar">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            Confira antes de salvar
          </DialogTitle>
          <DialogDescription id="dlg-avisos-antes-de-salvar" asChild>
            <div className="space-y-3 pt-1">
              <p className="text-sm text-foreground/80">
                {avisos && avisos.length > 1
                  ? 'Estes pontos estão fora do padrão:'
                  : 'Este ponto está fora do padrão:'}
              </p>
              <ul className="space-y-1.5">
                {avisos?.map((a, i) => (
                  <li
                    key={`${a.campo}-${i}`}
                    className="text-xs rounded-lg bg-amber-500/10 border border-amber-500/30 p-2.5 text-amber-800 dark:text-amber-300"
                  >
                    {a.texto}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">
                Se estiver tudo certo, pode salvar assim mesmo.
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2 pt-1">
          <Button variant="outline" className="flex-1" onClick={onCorrigir} disabled={salvando}>
            Voltar e corrigir
          </Button>
          <Button className="flex-1" onClick={onSalvarAssim} disabled={salvando}>
            Salvar assim mesmo
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

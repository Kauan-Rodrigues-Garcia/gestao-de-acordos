import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import type { ModalAvisoDiretoExtraProps } from './types';

export function ModalAvisoDiretoExtra({
  aberto, operadorNome, operadorSetor, nrLabel, labelCampo,
  confirmando, onConfirmar, onCancel,
}: ModalAvisoDiretoExtraProps) {
  return (
    <Dialog open={aberto} onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent className="max-w-md" aria-describedby="dlg-aviso-direto-extra">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-primary">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            Vínculo detectado — operador Direto/Extra
          </DialogTitle>
          <DialogDescription id="dlg-aviso-direto-extra" asChild>
            <div className="space-y-3 pt-1">
              <p className="text-sm text-foreground/80">
                O {labelCampo}{' '}
                <strong className="font-mono text-foreground">{nrLabel}</strong>{' '}
                já possui um vínculo com o operador{' '}
                <strong className="text-foreground">{operadorNome}</strong>
                {operadorSetor ? (<> do setor <strong className="text-foreground">{operadorSetor}</strong></>) : null}.
              </p>
              <div className="rounded-lg bg-primary/10 border border-primary/30 p-3 space-y-1">
                <p className="text-xs font-semibold text-primary flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  Como a lógica Direto e Extra está ativa para este operador, nenhuma autorização é necessária.
                </p>
                <p className="text-xs text-foreground/80">
                  Ao continuar, este acordo será tabulado como <strong>Direto</strong> para você e o acordo
                  anterior de <strong>{operadorNome}</strong> passará a ser <strong>Extra</strong>. O operador
                  receberá uma notificação automaticamente.
                </p>
              </div>
            </div>
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2 pt-1">
          <Button variant="outline" className="flex-1" onClick={onCancel} disabled={confirmando}>Cancelar</Button>
          <Button className="flex-1 gap-2" onClick={onConfirmar} disabled={confirmando}>
            {confirmando ? 'Tabulando...' : 'Tabular como Direto'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

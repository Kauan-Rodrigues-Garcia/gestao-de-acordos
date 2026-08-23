/**
 * DialogoMotivo — devolver e reabrir exigem uma frase, e ela não é opcional.
 *
 * O motivo não é burocracia: é a única coisa que chega a quem vai corrigir. A
 * notificação leva esse texto, e "devolvido" sem explicação obriga a pessoa a
 * procurar quem devolveu para descobrir o quê.
 *
 * Por isso o botão de confirmar fica desabilitado enquanto o campo está vazio —
 * e o banco recusa de qualquer forma (`RH_MOTIVO_OBRIGATORIO`), então esta é a
 * cortesia, não a trava.
 */
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

export interface DialogoMotivoProps {
  aberto: boolean;
  titulo: string;
  descricao: string;
  /** Rótulo do botão que confirma. Ex.: «Devolver operador». */
  rotuloConfirmar: string;
  /** Aparência destrutiva para devolução; padrão para reabertura. */
  destrutivo?: boolean;
  salvando?: boolean;
  onConfirmar: (motivo: string) => void | Promise<void>;
  onFechar: () => void;
}

export function DialogoMotivo({
  aberto, titulo, descricao, rotuloConfirmar,
  destrutivo = true, salvando = false, onConfirmar, onFechar,
}: DialogoMotivoProps) {
  const [motivo, setMotivo] = useState('');

  // Abrir de novo com o motivo anterior escrito faria alguém devolver um
  // segundo operador com a justificativa do primeiro, sem perceber.
  useEffect(() => { if (aberto) setMotivo(''); }, [aberto]);

  const vazio = motivo.trim().length === 0;

  return (
    <Dialog open={aberto} onOpenChange={o => { if (!o) onFechar(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>{descricao}</DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="rh-motivo" className="text-xs">
            Motivo <span className="text-destructive">*</span>
          </Label>
          <Textarea
            id="rh-motivo" value={motivo} onChange={e => setMotivo(e.target.value)}
            placeholder="Explique o que precisa ser corrigido — este texto chega a quem vai corrigir."
            rows={3} className="text-sm"
            autoFocus
          />
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" size="sm" onClick={onFechar} disabled={salvando}>
            Cancelar
          </Button>
          <Button
            size="sm"
            variant={destrutivo ? 'destructive' : 'default'}
            disabled={vazio || salvando}
            onClick={() => void onConfirmar(motivo.trim())}
          >
            {salvando ? 'Salvando…' : rotuloConfirmar}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default DialogoMotivo;

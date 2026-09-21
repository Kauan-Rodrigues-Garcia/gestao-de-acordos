/**
 * DialogoStatusChip — trocar o status de um chip e, se for o caso, o tempo.
 *
 * Abre no status atual e sem tempo. Salvar sempre recomeça a contagem: é o jeito
 * de trocar o tempo, e a janela avisa quando há uma contagem correndo que vai
 * ser substituída.
 */
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { mascararNumero } from '@/services/numeros/numerosFormato';
import {
  STATUS_CHIP_LABELS, erroDoTempo, formatarDuracao,
} from '@/services/chipsFisicos/chipsFisicosRegras';
import { alterarStatusChip, type ChipFisicoRow } from '@/services/chipsFisicos/chipsFisicos.service';
import { SeletorStatusETempo, type ValorStatusETempo } from './SeletorStatusETempo';

export interface DialogoStatusChipProps {
  chip: ChipFisicoRow | null;
  onFechar: () => void;
  onSalvo: () => void;
}

export function DialogoStatusChip({ chip, onFechar, onSalvo }: DialogoStatusChipProps) {
  const [valor, setValor] = useState<ValorStatusETempo>({ status: 'ativo', minutos: null });
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (chip) setValor({ status: chip.status, minutos: null });
  }, [chip]);

  const erro = erroDoTempo(valor.status, valor.minutos);
  const contagemCorrendo = !!chip?.prazo_ate && new Date(chip.prazo_ate).getTime() > Date.now();

  async function salvar() {
    if (!chip || erro) return;
    setSalvando(true);
    const r = await alterarStatusChip(chip.id, valor.status, valor.minutos);
    setSalvando(false);
    if (!r.ok) { toast.error(r.erro ?? 'Não foi possível salvar o status.'); return; }
    toast.success(
      `${mascararNumero(chip.numero)}: ${STATUS_CHIP_LABELS[valor.status]}`
      + (valor.minutos ? ` por ${formatarDuracao(valor.minutos)}` : '') + '.',
    );
    onSalvo();
    onFechar();
  }

  return (
    <Dialog open={chip !== null} onOpenChange={aberto => { if (!aberto && !salvando) onFechar(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Status do chip</DialogTitle>
          <DialogDescription>
            <span className="font-mono">{chip ? mascararNumero(chip.numero) : ''}</span>
          </DialogDescription>
        </DialogHeader>

        <SeletorStatusETempo idBase="status-chip" valor={valor} onMudar={setValor} />

        {contagemCorrendo && (
          <p className="text-xs text-muted-foreground">
            Este chip tem um tempo correndo. Salvar substitui a contagem atual.
          </p>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onFechar} disabled={salvando}>Cancelar</Button>
          <Button onClick={() => void salvar()} disabled={salvando || !!erro}>
            {salvando && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Salvar status
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

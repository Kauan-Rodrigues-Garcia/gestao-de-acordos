/**
 * DialogoLembrete — o temporizador que a própria pessoa cria para o chip.
 *
 * «Recarregar em 2 h», «Tirar da restrição amanhã». Quando acaba, o robô
 * `chips-fisicos-avisar` manda notificação ao dono do chip e a quem criou o
 * lembrete (migration 20261117200000), e a tela acende «Lembrete».
 */
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { BellOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { mascararNumero } from '@/services/numeros/numerosFormato';
import {
  LEMBRETES_RAPIDOS_MINUTOS, LEMBRETE_TEXTO_MAX, erroDoLembrete, formatarDuracaoLonga,
} from '@/services/chipsFisicos/chipsFisicosRegras';
import { salvarLembreteChip, type ChipFisicoRow } from '@/services/chipsFisicos/chipsFisicos.service';

export function DialogoLembrete({ chip, onFechar, onSalvo }: {
  chip: ChipFisicoRow | null; onFechar: () => void; onSalvo: () => void;
}) {
  const [texto, setTexto] = useState('');
  const [minutos, setMinutos] = useState<number | null>(60);
  const [horasLivres, setHorasLivres] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!chip) return;
    setTexto(chip.lembrete_texto ?? '');
    setMinutos(60);
    setHorasLivres('');
  }, [chip]);

  const erro = erroDoLembrete(texto, minutos);
  const temLembrete = !!chip?.lembrete_ate;

  async function salvar(apagar = false) {
    if (!chip || (!apagar && erro)) return;
    setSalvando(true);
    const r = apagar
      ? await salvarLembreteChip(chip.id, null, null)
      : await salvarLembreteChip(chip.id, texto.trim(), minutos);
    setSalvando(false);
    if (!r.ok) { toast.error(r.erro ?? 'Não foi possível salvar o lembrete.'); return; }
    toast.success(apagar
      ? 'Lembrete apagado.'
      : `Lembrete criado: avisa em ${formatarDuracaoLonga(minutos!)}.`);
    onSalvo();
    onFechar();
  }

  function usarHorasLivres(v: string) {
    setHorasLivres(v);
    const h = Number(v.replace(',', '.'));
    setMinutos(Number.isFinite(h) && h > 0 ? Math.round(h * 60) : null);
  }

  return (
    <Dialog open={chip !== null} onOpenChange={a => { if (!a && !salvando) onFechar(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Lembrete do chip</DialogTitle>
          <DialogDescription>
            <span className="font-mono">{chip ? mascararNumero(chip.numero) : ''}</span>
            {' '}— quando o tempo acabar, chega uma notificação.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="lembrete-texto">Do que é o lembrete</Label>
            <Input
              id="lembrete-texto"
              value={texto}
              maxLength={LEMBRETE_TEXTO_MAX}
              onChange={e => setTexto(e.target.value)}
              placeholder="Ex.: recarregar o chip, tirar da restrição"
            />
            <p className="text-right text-[10px] text-muted-foreground">{texto.length}/{LEMBRETE_TEXTO_MAX}</p>
          </div>

          <div className="space-y-1.5">
            <Label>Avisar em</Label>
            <div className="flex flex-wrap gap-1.5">
              {LEMBRETES_RAPIDOS_MINUTOS.map(m => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={minutos === m && !horasLivres}
                  onClick={() => { setMinutos(m); setHorasLivres(''); }}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs transition-colors',
                    minutos === m && !horasLivres
                      ? 'border-primary bg-primary/10 font-medium text-primary'
                      : 'hover:bg-muted',
                  )}
                >
                  {formatarDuracaoLonga(m)}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Input
                aria-label="Outro tempo, em horas"
                inputMode="decimal"
                value={horasLivres}
                onChange={e => usarHorasLivres(e.target.value)}
                placeholder="Outro"
                className="h-8 w-24"
              />
              <span className="text-xs text-muted-foreground">horas (até 7 dias)</span>
            </div>
          </div>

          {erro && texto && <p className="text-xs text-destructive">{erro}</p>}
          {temLembrete && (
            <p className="text-xs text-muted-foreground">Salvar substitui o lembrete atual.</p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {temLembrete ? (
            <Button variant="ghost" className="text-destructive" onClick={() => void salvar(true)} disabled={salvando}>
              <BellOff className="mr-1 h-4 w-4" aria-hidden /> Apagar lembrete
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onFechar} disabled={salvando}>Cancelar</Button>
            <Button onClick={() => void salvar()} disabled={salvando || !!erro}>
              {salvando && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Criar lembrete
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

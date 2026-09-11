/**
 * DialogoTempoRestricao — quanto tempo o número fica restrito.
 *
 * A restrição é a única situação em que quem marca informa o tempo: o WhatsApp
 * diz «restrito por 24 horas», «por 3 dias», e cada caso é um. Os atalhos cobrem
 * os tempos que aparecem na operação; os campos cobrem o resto.
 *
 * A janela mostra quando a restrição termina, e não só a duração: «termina amanhã
 * às 14:30» é o que a pessoa confere contra o aviso do WhatsApp.
 *
 * O teto de 90 dias é o do banco (`fn_numeros_alterar_situacao`); a janela repete
 * a regra só para não oferecer um botão que a RPC vai recusar.
 */
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { mascararNumero } from '@/services/numeros/numerosFormato';
import { RESTRICAO_MAX_MINUTOS } from '@/services/numeros/numerosRegras';

const ATALHOS = [
  { rotulo: '6 horas',  minutos: 6 * 60 },
  { rotulo: '12 horas', minutos: 12 * 60 },
  { rotulo: '24 horas', minutos: 24 * 60 },
  { rotulo: '48 horas', minutos: 48 * 60 },
  { rotulo: '72 horas', minutos: 72 * 60 },
] as const;

/** O tempo que a janela abre marcado: o caso mais comum. */
const PADRAO_MINUTOS = 24 * 60;

function inteiro(valor: string): number {
  const n = Number.parseInt(valor, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export interface DialogoTempoRestricaoProps {
  aberto: boolean;
  /** O número, só para a frase. */
  numero: string;
  salvando: boolean;
  onFechar: () => void;
  onConfirmar: (minutos: number) => void;
}

export function DialogoTempoRestricao({
  aberto, numero, salvando, onFechar, onConfirmar,
}: DialogoTempoRestricaoProps) {
  const [dias, setDias]       = useState('0');
  const [horas, setHoras]     = useState('24');
  const [minutos, setMinutos] = useState('0');

  function preencher(total: number) {
    setDias(String(Math.floor(total / 1440)));
    setHoras(String(Math.floor((total % 1440) / 60)));
    setMinutos(String(total % 60));
  }

  // Reabrir recomeça no padrão: o tempo da restrição anterior não vale para esta.
  useEffect(() => { if (aberto) preencher(PADRAO_MINUTOS); }, [aberto]);

  const total  = inteiro(dias) * 1440 + inteiro(horas) * 60 + inteiro(minutos);
  const valido = total >= 1 && total <= RESTRICAO_MAX_MINUTOS;
  const termina = valido
    ? new Date(Date.now() + total * 60_000).toLocaleString('pt-BR', {
        weekday: 'long', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
      })
    : null;

  const campo = (id: string, rotulo: string, valor: string, mudar: (v: string) => void) => (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">{rotulo}</Label>
      <Input
        id={id} type="number" inputMode="numeric" min={0} value={valor}
        onChange={e => mudar(e.target.value)} className="h-9 tabular-nums"
      />
    </div>
  );

  return (
    <Dialog open={aberto} onOpenChange={a => { if (!a && !salvando) onFechar(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Tempo de restrição</DialogTitle>
          <DialogDescription>
            Quanto tempo {mascararNumero(numero)} fica restrito. A contagem começa agora.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Tempos mais usados">
            {ATALHOS.map(a => (
              <Button
                key={a.minutos} type="button" size="sm"
                variant={total === a.minutos ? 'default' : 'outline'}
                aria-pressed={total === a.minutos}
                onClick={() => preencher(a.minutos)}
              >
                {a.rotulo}
              </Button>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-3">
            {campo('restricao-dias', 'Dias', dias, setDias)}
            {campo('restricao-horas', 'Horas', horas, setHoras)}
            {campo('restricao-minutos', 'Minutos', minutos, setMinutos)}
          </div>

          <p className={valido ? 'text-sm text-muted-foreground' : 'text-sm text-destructive'}>
            {termina ? <>Termina {termina}.</> : 'Informe de 1 minuto a 90 dias.'}
          </p>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onFechar} disabled={salvando}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => onConfirmar(total)} disabled={!valido || salvando}>
            {salvando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Marcar restrição
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * DialogoLancar — entregar um número a um operador do setor.
 *
 * A lista traz só gente ATIVA do MESMO setor do número. Não é a trava — a RPC
 * recusa qualquer outra pessoa —, é para o seletor não oferecer uma escolha que
 * o banco vai negar depois de a pessoa já ter clicado.
 *
 * Serve também para TROCAR de operador: é a mesma ação, e o histórico guarda de
 * quem para quem.
 */
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { mascararNumero } from '@/services/numeros/numerosFormato';
import {
  lancarAoOperador, listarOperadoresDoSetor,
  type NumeroRow, type OperadorDoSetor,
} from '@/services/numeros/numeros.service';

export interface DialogoLancarProps {
  numero: NumeroRow | null;
  empresaId: string;
  /** Quem está com ele hoje, para a lista não oferecer a mesma pessoa. */
  nomeAtual?: string | null;
  onFechar: () => void;
  onLancado: () => void;
}

export function DialogoLancar({
  numero, empresaId, nomeAtual, onFechar, onLancado,
}: DialogoLancarProps) {
  const [operadores, setOperadores] = useState<OperadorDoSetor[]>([]);
  const [escolhido, setEscolhido]   = useState('');
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando]     = useState(false);

  useEffect(() => {
    if (!numero) { setOperadores([]); setEscolhido(''); return; }
    let cancelado = false;
    setCarregando(true);
    setEscolhido('');
    listarOperadoresDoSetor(empresaId, numero.setor_id)
      .then(lista => {
        if (cancelado) return;
        // Quem já está com o número não entra: a RPC recusa lançar para a
        // mesma pessoa, e oferecê-la seria oferecer um erro.
        setOperadores(lista.filter(o => o.id !== numero.operador_id));
      })
      .catch(() => { if (!cancelado) setOperadores([]); })
      .finally(() => { if (!cancelado) setCarregando(false); });
    return () => { cancelado = true; };
  }, [numero, empresaId]);

  async function lancar() {
    if (!numero || !escolhido) return;
    setSalvando(true);
    const r = await lancarAoOperador(numero.id, escolhido);
    setSalvando(false);
    if (!r.ok) { toast.error(r.erro ?? 'Não foi possível lançar.'); return; }
    const nome = operadores.find(o => o.id === escolhido)?.nome ?? 'o operador';
    toast.success(`${mascararNumero(numero.numero)} lançado para ${nome}.`);
    onLancado();
    onFechar();
  }

  return (
    <Dialog open={numero !== null} onOpenChange={a => { if (!a) onFechar(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {nomeAtual ? 'Passar número para outra pessoa' : 'Lançar número'}
          </DialogTitle>
          <DialogDescription>
            {numero ? mascararNumero(numero.numero) : ''}
            {nomeAtual ? ` · hoje com ${nomeAtual}` : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="operador-destino">Operador</Label>
          <Select
            value={escolhido}
            onValueChange={setEscolhido}
            disabled={carregando || operadores.length === 0}
          >
            <SelectTrigger id="operador-destino">
              <SelectValue placeholder={carregando ? 'Carregando…' : 'Escolha quem recebe'} />
            </SelectTrigger>
            <SelectContent>
              {operadores.map(o => (
                <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!carregando && operadores.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Nenhuma pessoa ativa disponível neste setor.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={salvando}>Cancelar</Button>
          <Button onClick={() => void lancar()} disabled={!escolhido || salvando}>
            Lançar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

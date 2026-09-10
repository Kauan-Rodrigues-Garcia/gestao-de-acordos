/**
 * DialogoMotivoRetorno — por que este número está voltando.
 *
 * Serve às DUAS devoluções, porque a pergunta é a mesma e a resposta vai para o
 * mesmo par de colunas:
 *
 *   • o operador devolvendo à liderança (o número fica no setor);
 *   • a liderança relançando ao Núcleo (o número sai do setor).
 *
 * ## Lista curta mais observação livre
 *
 * Só texto livre obrigaria o Núcleo a ler trezentas frases para saber quantos
 * foram banidos no mês. Só a lista perderia o caso que ninguém previu. Os dois
 * juntos respondem as duas perguntas — quantos, e o quê.
 *
 * O botão fica desabilitado sem motivo escolhido, e o banco recusa de qualquer
 * forma. Esta é a cortesia; a trava está na RPC.
 */
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  MOTIVOS_RETORNO, MOTIVO_LABELS, type MotivoRetorno,
} from '@/services/numeros/numerosRegras';

export interface DialogoMotivoRetornoProps {
  aberto: boolean;
  titulo: string;
  descricao: string;
  rotuloConfirmar: string;
  salvando?: boolean;
  onConfirmar: (motivo: MotivoRetorno, observacao: string) => void | Promise<void>;
  onFechar: () => void;
}

export function DialogoMotivoRetorno({
  aberto, titulo, descricao, rotuloConfirmar,
  salvando = false, onConfirmar, onFechar,
}: DialogoMotivoRetornoProps) {
  const [motivo, setMotivo] = useState<MotivoRetorno | ''>('');
  const [observacao, setObservacao] = useState('');

  // Reabrir com a escolha anterior faria devolver um segundo número com a
  // justificativa do primeiro, sem ninguém perceber.
  useEffect(() => {
    if (aberto) { setMotivo(''); setObservacao(''); }
  }, [aberto]);

  return (
    <Dialog open={aberto} onOpenChange={a => { if (!a) onFechar(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>{descricao}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="motivo-retorno">Motivo</Label>
            <Select value={motivo} onValueChange={v => setMotivo(v as MotivoRetorno)}>
              <SelectTrigger id="motivo-retorno">
                <SelectValue placeholder="Escolha o motivo" />
              </SelectTrigger>
              <SelectContent>
                {MOTIVOS_RETORNO.map(m => (
                  <SelectItem key={m} value={m}>{MOTIVO_LABELS[m]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="observacao-retorno">Observação (opcional)</Label>
            <Textarea
              id="observacao-retorno"
              value={observacao}
              onChange={e => setObservacao(e.target.value)}
              placeholder="O que o Núcleo precisa saber para tratar este número"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={salvando}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            disabled={motivo === '' || salvando}
            onClick={() => { if (motivo !== '') void onConfirmar(motivo, observacao); }}
          >
            {rotuloConfirmar}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * DialogoExcluirNumero — apagar um cadastro feito errado.
 *
 * ## Por que a confirmação existe aqui, e não em «alterar situação»
 *
 * A regra do módulo: o que é reversível acontece em um clique; o que não é pede
 * confirmação. Trocar a situação é reversível e fica no histórico. Apagar não —
 * a linha some, e a trilha dela vai junto por `ON DELETE CASCADE`.
 *
 * ## O texto diz o que se perde
 *
 * «Tem certeza?» não ajuda ninguém a decidir. O aviso diz a consequência exata
 * (o histórico some junto) e aponta a alternativa (marcar Banido), porque na
 * maioria das vezes é ela que a pessoa quer — apagar só serve para o número que
 * foi digitado errado e nunca circulou.
 *
 * Quem recusa de fato é o banco: `fn_numeros_pode_excluir` derruba a exclusão de
 * qualquer número que já tenha saído do Núcleo. Esta tela evita chegar lá.
 */
import { useState } from 'react';
import { toast } from 'sonner';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { mascararNumero } from '@/services/numeros/numerosFormato';
import { excluirNumero, type NumeroRow } from '@/services/numeros/numeros.service';

export interface DialogoExcluirNumeroProps {
  numero: NumeroRow | null;
  /** O aparelho de onde ele sai, só para a frase. */
  nomeDoCelular?: string;
  onFechar: () => void;
  onExcluido: () => void;
}

export function DialogoExcluirNumero({
  numero, nomeDoCelular, onFechar, onExcluido,
}: DialogoExcluirNumeroProps) {
  const [salvando, setSalvando] = useState(false);

  async function excluir() {
    if (!numero) return;
    setSalvando(true);
    const r = await excluirNumero(numero.id);
    setSalvando(false);

    if (!r.ok) { toast.error(r.erro ?? 'Não foi possível excluir.'); return; }
    toast.success(`${mascararNumero(numero.numero)} foi excluído do cadastro.`);
    onExcluido();
    onFechar();
  }

  return (
    <AlertDialog open={numero !== null} onOpenChange={a => { if (!a) onFechar(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Excluir {numero ? mascararNumero(numero.numero) : 'este número'}?
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>
                O número sai do cadastro
                {nomeDoCelular ? ` de ${nomeDoCelular}` : ''}, e o histórico dele
                é apagado junto. Não há como desfazer.
              </p>
              <p>
                Isto serve para o que foi digitado errado. Se o número existe de
                verdade e parou de funcionar, marque <strong>Banido</strong> —
                assim o registro e a trilha ficam.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={salvando}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={salvando}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={e => { e.preventDefault(); void excluir(); }}
          >
            Excluir
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

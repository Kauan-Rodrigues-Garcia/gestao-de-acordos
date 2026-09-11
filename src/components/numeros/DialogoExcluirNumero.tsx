/**
 * DialogoExcluirNumero — mandar um número para a Lixeira de Números.
 *
 * ## Excluir deixou de ser sem volta
 *
 * Até a migration 20260911150000, excluir apagava a linha e a trilha junto, e
 * por isso só valia para o que nunca tinha circulado. Agora a cópia, com o
 * histórico, vai para a lixeira e volta inteira ao restaurar. A confirmação
 * continua — tirar um número da lista é um passo que se confere —, mas o texto
 * diz a verdade: dá para desfazer.
 *
 * ## Quando o número está com um setor
 *
 * Só o super_admin chega aqui com um número assim (`podeExcluirNumero`). O
 * aviso diz a consequência que não se vê desta tela: o número some do Meus
 * Chips de quem o usa agora.
 *
 * Quem recusa de fato é o banco: `fn_numeros_excluir`.
 */
import { useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle } from 'lucide-react';
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
  /** O setor com quem o número está, só para o aviso. */
  nomeDoSetor?: string;
  onFechar: () => void;
  onExcluido: () => void;
}

export function DialogoExcluirNumero({
  numero, nomeDoCelular, nomeDoSetor, onFechar, onExcluido,
}: DialogoExcluirNumeroProps) {
  const [salvando, setSalvando] = useState(false);

  const foraDoNucleo = numero !== null
    && (numero.posse !== 'nucleo' || numero.operador_id !== null);

  async function excluir() {
    if (!numero) return;
    setSalvando(true);
    const r = await excluirNumero(numero.id);
    setSalvando(false);

    if (!r.ok) { toast.error(r.erro ?? 'Não foi possível excluir.'); return; }
    toast.success(`${mascararNumero(numero.numero)} foi para a Lixeira de Números.`);
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
                O número sai {nomeDoCelular ? `de ${nomeDoCelular}` : 'do cadastro'} e vai
                para a <strong>Lixeira de Números</strong>, com o histórico inteiro. Dá
                para restaurar de lá.
              </p>
              {foraDoNucleo && (
                <p className="flex items-start gap-1.5 rounded-md border border-warning/40 bg-warning/10 px-2.5 py-2 text-foreground">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                  <span>
                    Este número está com {nomeDoSetor ?? 'um setor'}
                    {numero?.operador_id ? ', na mão de um operador' : ''}. Ao excluir, ele
                    some do Meus Chips de quem o usa agora.
                  </span>
                </p>
              )}
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
            Mover para a lixeira
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

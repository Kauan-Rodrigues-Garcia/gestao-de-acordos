/**
 * ModalAvisoPixAutomatico — o acordo está salvo, mas o trabalho não acabou.
 *
 * ## Por que existe
 *
 * PIX Automático e Cartão Recorrente pagam comissão pela aba **Pix Automático**,
 * que tem tabela, meta e percentual próprios (`pix_automatico_acordos`). A lista
 * de acordos não alimenta essa conta. Quem lança só ali fica com o acordo certo
 * na tela e a comissão fora do cálculo — e não tem como perceber, porque a lista
 * mostra o acordo exatamente como qualquer outro.
 *
 * Foi o que aconteceu no Play 3: um lote inteiro de PIX Automático registrado na
 * lista padrão, para acompanhar, sem ninguém repetir o registro na aba certa.
 *
 * ## Por que é uma janela, e não um toast
 *
 * Um toast some sozinho em cinco segundos e não tem botão que leve a lugar
 * nenhum. Aqui o caminho faz parte do aviso: o botão abre a aba já com o NR
 * digitado, e o que sobra para a pessoa é o valor — que ela tem em mãos e o
 * sistema não pode adivinhar (na lista o valor é o da parcela; lá é o total).
 */

import { Zap, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { nomeDaFormaRecorrente } from '@/lib/formasRecorrentes';

interface Props {
  /** `null` = fechado. Aberto, traz o NR gravado e a forma escolhida. */
  aviso: { nr: string; forma: string } | null;
  /** Abre a aba Pix Automático com o NR já preenchido. */
  onIr: () => void;
  /** Fecha e segue o caminho normal de quem salvou (voltar para a lista). */
  onDepois: () => void;
}

export function ModalAvisoPixAutomatico({ aviso, onIr, onDepois }: Props) {
  return (
    <Dialog open={!!aviso} onOpenChange={(open) => { if (!open) onDepois(); }}>
      <DialogContent className="max-w-md" aria-describedby="dlg-aviso-pix-automatico">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-cyan-600 dark:text-cyan-400">
            <Zap className="w-5 h-5 shrink-0" />
            Falta registrar no Pix Automático
          </DialogTitle>
          <DialogDescription id="dlg-aviso-pix-automatico" asChild>
            <div className="space-y-3 pt-1">
              <p className="text-sm text-foreground/80">
                O acordo{' '}
                <strong className="font-mono text-foreground">{aviso?.nr}</strong>{' '}
                foi salvo como{' '}
                <strong className="text-foreground">
                  {aviso ? nomeDaFormaRecorrente(aviso.forma) : ''}
                </strong>.
              </p>
              <div className="rounded-lg bg-cyan-500/10 border border-cyan-500/30 p-3 space-y-1">
                <p className="text-xs font-semibold text-cyan-700 dark:text-cyan-400">
                  A comissão desta forma de pagamento sai da aba Pix Automático.
                </p>
                <p className="text-xs text-foreground/80">
                  Registrar só aqui deixa este acordo <strong>fora do cálculo</strong>.
                  O botão abaixo abre a aba com o NR já preenchido — falta o{' '}
                  <strong>valor total</strong> do acordo, que é você quem informa.
                </p>
              </div>
            </div>
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2 pt-1">
          <Button variant="outline" className="flex-1" onClick={onDepois}>
            Agora não
          </Button>
          <Button className="flex-1 gap-2 bg-cyan-600 hover:bg-cyan-600/85 text-white" onClick={onIr}>
            Registrar no Pix Automático
            <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

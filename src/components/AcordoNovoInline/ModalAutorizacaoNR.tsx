/**
 * ModalAutorizacaoNR — a janela que aparece quando o NR/Código já tem vínculo.
 *
 * ## O login do líder saiu
 *
 * Até 18/08/2026, esta janela pedia usuário e senha de um líder. Na prática, o
 * líder atravessava a operação para digitar a senha dele na máquina de outra
 * pessoa — um deslocamento por acordo, e a equipe inteira treinada a ver isso
 * como normal.
 *
 * Agora há um botão só: **Solicitar autorização**. O pedido vai para
 * `autorizacoes_pedidos`, quem pode decidir recebe notificação e resolve pela
 * gaveta no canto da tela, de onde estiver.
 *
 * ## A janela fecha ao solicitar
 *
 * Decisão de produto: o operador não espera de janela aberta. Ele solicita, a
 * janela fecha, um aviso diz que está em avaliação, e a resposta chega por
 * notificação — aprovada, o acordo já vem tabulado no nome dele.
 *
 * Por isso o pedido carrega o payload inteiro do acordo: quem grava é o
 * servidor, na hora da aprovação, e não esta tela.
 */

import { AlertTriangle, Send, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import type { ModalAutorizacaoNRProps } from './types';

export function ModalAutorizacaoNR({
  conflito, autorizando, onSolicitar, onCancel,
}: ModalAutorizacaoNRProps) {
  const nrLabel: string = conflito
    ? (
        (conflito.payload.instituicao as string | undefined)?.trim() ||
        (conflito.payload.nr_cliente  as string | undefined)?.trim() ||
        '—'
      )
    : '—';

  const operadorDiretoNome = conflito?.operadorNome ?? '—';
  const operadorExtraNome  = conflito?.extraAtualOpNome ?? '—';
  const isTrocaExtra       = conflito?.modo === 'troca_extra';

  return (
    <Dialog open={!!conflito} onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent className="max-w-md" aria-describedby="dlg-conflito-nr-desc">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-warning">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            {isTrocaExtra
              ? 'Vínculo EXTRA em uso — precisa de autorização'
              : 'NR já agendado por outro operador'}
          </DialogTitle>
          <DialogDescription id="dlg-conflito-nr-desc" asChild>
            <div className="space-y-3 pt-1">
              {isTrocaExtra ? (
                <>
                  <p className="text-sm text-foreground/80">
                    O NR{' '}
                    <strong className="font-mono text-foreground">{nrLabel}</strong>{' '}
                    já possui vínculo <strong>DIRETO</strong> com{' '}
                    <strong className="text-foreground">{operadorDiretoNome}</strong>{' '}
                    e vínculo <strong>EXTRA</strong> com{' '}
                    <strong className="text-foreground">{operadorExtraNome}</strong>.
                  </p>
                  <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3 space-y-1">
                    <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      Se for autorizado, o vínculo EXTRA será transferido
                    </p>
                    <p className="text-xs text-foreground/80">
                      O acordo EXTRA atual de <strong>{operadorExtraNome}</strong> será
                      removido e você assumirá o vínculo EXTRA. O acordo DIRETO de{' '}
                      <strong>{operadorDiretoNome}</strong> <strong>não é afetado</strong>.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm text-foreground/80">
                    O NR{' '}
                    <strong className="font-mono text-foreground">{nrLabel}</strong>{' '}
                    já possui um agendamento com o operador{' '}
                    <strong className="text-foreground">{operadorDiretoNome}</strong>.{' '}
                    Peça autorização para registrar.
                  </p>
                  <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-3 space-y-1">
                    <p className="text-xs font-semibold text-destructive flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      Se for autorizado, a ação é irreversível
                    </p>
                    <p className="text-xs text-destructive/80">
                      O acordo atual de{' '}
                      <strong>{operadorDiretoNome}</strong>{' '}
                      será <strong>removido da lista</strong> e movido para a{' '}
                      <strong>lixeira temporária</strong>. O operador receberá uma
                      notificação com todos os detalhes da transferência.
                    </p>
                  </div>
                </>
              )}
              <div className="rounded-lg bg-primary/10 border border-primary/30 p-3">
                <p className="text-xs text-foreground/80">
                  Ao solicitar, <strong>os líderes e a gerência do seu setor</strong> —
                  além de diretoria e administradores — recebem uma notificação e
                  decidem de onde estiverem. Você recebe a resposta por notificação;
                  <strong> não precisa ficar nesta tela</strong>.
                </p>
              </div>
              <p className="text-[11px] text-muted-foreground">
                A decisão fica registrada nos logs com o nome de quem autorizou.
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2 pt-1">
          <Button variant="outline" className="flex-1" onClick={onCancel} disabled={autorizando}>
            Cancelar
          </Button>
          <Button className="flex-1 gap-2" onClick={onSolicitar} disabled={autorizando}>
            {autorizando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {autorizando ? 'Enviando...' : 'Solicitar autorização'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

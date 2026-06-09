import { AlertTriangle, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import type { ModalAutorizacaoNRProps } from './types';

export function ModalAutorizacaoNR({
  conflito, liderEmail, liderSenha, autorizando,
  onEmailChange, onSenhaChange, onAutorizar, onCancel,
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
              ? 'Vínculo EXTRA em uso — transferência necessária'
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
                      Ao autorizar, o vínculo EXTRA será transferido
                    </p>
                    <p className="text-xs text-foreground/80">
                      O acordo EXTRA atual de <strong>{operadorExtraNome}</strong> será removido e
                      você assumirá o vínculo EXTRA. O acordo DIRETO de{' '}
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
                    Será possível registrar após autorização.
                  </p>
                  <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-3 space-y-1">
                    <p className="text-xs font-semibold text-destructive flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      Atenção — ação irreversível
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
              <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/30 p-3">
                <p className="text-xs text-yellow-700 dark:text-yellow-400">
                  Esta operação ficará registrada nos logs do sistema com o nome do líder autorizador.
                </p>
              </div>
            </div>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          <div className="flex items-center gap-2 border-t border-border pt-3">
            <Shield className="w-4 h-4 text-primary shrink-0" />
            <p className="text-sm font-semibold">Autorização do Líder</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">E-mail do Líder / Admin</Label>
            <Input
              type="email" placeholder="lider@empresa.com" value={liderEmail}
              onChange={(e) => onEmailChange(e.target.value)}
              className="h-9 text-sm" disabled={autorizando} autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Senha</Label>
            <Input
              type="password" placeholder="••••••••" value={liderSenha}
              onChange={(e) => onSenhaChange(e.target.value)}
              className="h-9 text-sm" disabled={autorizando} autoComplete="current-password"
              onKeyDown={(e) => { if (e.key === 'Enter' && liderEmail && liderSenha) onAutorizar(); }}
            />
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={onCancel} disabled={autorizando}>Cancelar</Button>
            <Button
              className="flex-1 gap-2" onClick={onAutorizar}
              disabled={autorizando || !liderEmail.trim() || !liderSenha.trim()}
            >
              <Shield className="w-4 h-4" />
              {autorizando ? 'Verificando...' : isTrocaExtra ? 'Autorizar Troca de EXTRA' : 'Autorizar Transferência'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

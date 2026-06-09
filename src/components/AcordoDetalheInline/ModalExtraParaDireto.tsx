import { useState, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertTriangle, ArrowLeftRight, Shield } from 'lucide-react';

export interface ModalExtraParaDiretoProps {
  open:           boolean;
  onClose:        () => void;
  onConfirmar:    (liderCreds: { email: string; senha: string } | null) => Promise<void>;
  executando:     boolean;
  operadorDiretoNome: string;
  nrLabel:        string;
  precisaAutorizacao: boolean;
}

export function ModalExtraParaDireto({
  open, onClose, onConfirmar, executando, operadorDiretoNome, nrLabel, precisaAutorizacao,
}: ModalExtraParaDiretoProps) {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');

  useEffect(() => {
    if (!open) { setEmail(''); setSenha(''); }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md" aria-describedby="dlg-extra-para-direto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-primary">
            <ArrowLeftRight className="w-5 h-5 shrink-0" />
            Tornar este acordo DIRETO
          </DialogTitle>
          <DialogDescription id="dlg-extra-para-direto" asChild>
            <div className="space-y-3 pt-1">
              <p className="text-sm text-foreground/80">
                Este acordo ({nrLabel}) ficará como <strong>Direto</strong> para você
                e será <strong>removido</strong> do operador{' '}
                <strong className="text-foreground">{operadorDiretoNome}</strong>.
              </p>
              <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/30 p-3">
                <p className="text-xs text-yellow-700 dark:text-yellow-400 flex items-start gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>
                    O operador <strong>{operadorDiretoNome}</strong> será notificado e o acordo
                    dele será movido para a lixeira (retido por 3 dias).
                  </span>
                </p>
              </div>
            </div>
          </DialogDescription>
        </DialogHeader>

        {precisaAutorizacao && (
          <div className="space-y-3 pt-1">
            <div className="flex items-center gap-2 border-t border-border pt-3">
              <Shield className="w-4 h-4 text-primary shrink-0" />
              <p className="text-sm font-semibold">Autorização do Líder</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">E-mail do Líder / Admin</Label>
              <Input
                type="email" placeholder="lider@empresa.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-9 text-sm" disabled={executando}
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Senha</Label>
              <Input
                type="password" placeholder="••••••••"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                className="h-9 text-sm" disabled={executando}
                autoComplete="current-password"
              />
            </div>
          </div>
        )}

        {!precisaAutorizacao && (
          <div className="rounded-lg bg-primary/10 border border-primary/30 p-3 text-xs text-primary">
            <Shield className="w-3.5 h-3.5 inline-block mr-1 shrink-0" />
            Seu perfil já tem autorização — nenhuma senha adicional é necessária.
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={executando}>
            Cancelar
          </Button>
          <Button
            className="flex-1 gap-2"
            onClick={() => onConfirmar(precisaAutorizacao ? { email, senha } : null)}
            disabled={executando || (precisaAutorizacao && (!email.trim() || !senha.trim()))}
          >
            <ArrowLeftRight className="w-4 h-4" />
            {executando ? 'Processando...' : 'Tornar Direto'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

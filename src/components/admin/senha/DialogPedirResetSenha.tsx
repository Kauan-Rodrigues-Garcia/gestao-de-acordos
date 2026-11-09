/**
 * DialogPedirResetSenha — a liderança pede ao super admin para resetar a senha
 * de alguém do setor (05/11/2026).
 *
 * Aprovado, o sistema gera uma senha provisória e ela aparece no canal
 * «Senhas» do chat de quem pediu. A pessoa entra com ela e é obrigada a criar
 * uma senha nova antes de usar o sistema.
 */
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { KeyRound, Loader2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { pedirResetSenha } from '@/services/senhaPedidos.service';
import { abrirSenhasNoChat } from '@/components/Chat/abrirSenhas';

export interface AlvoDoReset {
  id: string;
  nome: string;
  usuario?: string | null;
}

export function DialogPedirResetSenha({ alvo, onFechar, onPedido }: {
  alvo: AlvoDoReset | null;
  onFechar: () => void;
  /** Depois de pedir com sucesso (para a tela marcar «aguardando»). */
  onPedido: (alvoId: string) => void;
}) {
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => { if (alvo) setMotivo(''); }, [alvo]);

  async function pedir() {
    if (!alvo) return;
    setEnviando(true);
    const r = await pedirResetSenha(alvo.id, motivo);
    setEnviando(false);
    if (!r.ok) {
      toast.error(r.erro, { duration: 9000 });
      return;
    }
    toast.success(`Pedido enviado. Quando for aprovado, a senha nova de ${alvo.nome.split(' ')[0]} aparece no chat, canal «Senhas».`, {
      duration: 9000,
      action: { label: 'Abrir', onClick: () => abrirSenhasNoChat() },
    });
    onPedido(alvo.id);
    onFechar();
  }

  return (
    <Dialog open={!!alvo} onOpenChange={o => { if (!o && !enviando) onFechar(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" /> Solicitar reset de senha?
          </DialogTitle>
          <DialogDescription>
            Tem certeza de que quer pedir uma senha nova para <strong>{alvo?.nome}</strong>
            {alvo?.usuario ? <> (login <span className="font-mono">{alvo.usuario}</span>)</> : null}?
            O pedido vai para o super admin. Aprovado, o sistema gera uma senha provisória e
            ela aparece no seu chat, no canal «Senhas». Ao entrar com ela, a pessoa é obrigada
            a criar uma senha nova.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label className="text-xs">Motivo (opcional)</Label>
          <textarea
            value={motivo} maxLength={300} rows={2} disabled={enviando}
            onChange={e => setMotivo(e.target.value)}
            placeholder="Ex.: esqueceu a senha"
            className="w-full resize-none rounded-md border border-border bg-background px-2.5 py-2 text-sm"
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" disabled={enviando} onClick={onFechar}>Cancelar</Button>
          <Button disabled={enviando} onClick={() => void pedir()} className="gap-1.5">
            {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            {enviando ? 'Enviando…' : 'Sim, enviar pedido'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

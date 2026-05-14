import { useState, useEffect } from 'react';
import { MessageCircle } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

interface ChatplayNewFeatureModalProps {
  open: boolean;
  onClose: () => void;
}

export function ChatplayNewFeatureModal({ open, onClose }: ChatplayNewFeatureModalProps) {
  const { perfil, refreshPerfil } = useAuth();
  const [countdown, setCountdown] = useState(3);

  useEffect(() => {
    if (!open) { setCountdown(3); return; }
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [open, countdown]);

  async function handleDismiss() {
    if (perfil?.id) {
      await supabase.from('perfis').update({ viu_notificacao_chatplay: true }).eq('id', perfil.id);
      await refreshPerfil();
    }
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && countdown <= 0) handleDismiss(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-violet-500" />
            Nova funcionalidade: Chatplay
          </DialogTitle>
          <DialogDescription>
            Integração direta com o Chatplay disponível nos acordos.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <p className="text-sm text-foreground/80">
            Agora você pode abrir conversas diretamente no <strong>Chatplay</strong> a partir de qualquer acordo com número de telefone cadastrado.
          </p>
          <ul className="text-sm space-y-2 text-foreground/75">
            <li className="flex items-start gap-2">
              <span className="text-violet-500 font-bold mt-0.5">·</span>
              Clique no botão <strong>Chatplay</strong> no painel de detalhes de um acordo.
            </li>
            <li className="flex items-start gap-2">
              <span className="text-violet-500 font-bold mt-0.5">·</span>
              Para habilitar pela primeira vez, clique no ícone <strong>Chatplay</strong> no topo da página e siga o tutorial de instalação.
            </li>
          </ul>
        </div>

        <div className="flex justify-end pt-2 border-t border-border">
          <Button
            size="sm"
            className="bg-violet-600 hover:bg-violet-700 text-white min-w-[120px]"
            onClick={handleDismiss}
            disabled={countdown > 0}
          >
            {countdown > 0 ? `Entendi (${countdown}s)` : 'Entendi'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

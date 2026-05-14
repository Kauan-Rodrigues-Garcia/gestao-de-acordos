import { useState, useEffect } from 'react';
import { MessageCircle, Zap } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
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
      <DialogContent className="max-w-sm p-0 overflow-hidden">

        {/* Banner superior */}
        <div className="bg-violet-600 px-6 py-5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
            <MessageCircle className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-violet-200 uppercase tracking-widest">Nova funcionalidade</p>
            <DialogTitle className="text-white text-lg font-bold leading-tight mt-0.5">
              Integração Chatplay
            </DialogTitle>
          </div>
        </div>

        {/* Corpo */}
        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-foreground/80 leading-relaxed">
            Abra conversas no Chatplay diretamente pelos acordos, sem precisar copiar o número manualmente.
          </p>

          <div className="space-y-3">
            <div className="flex gap-3 items-start">
              <div className="w-7 h-7 rounded-lg bg-violet-500/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Zap className="w-3.5 h-3.5 text-violet-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Como usar</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Abra o detalhe de um acordo e clique no botão <strong>Chatplay</strong> para iniciar a conversa automaticamente.
                </p>
              </div>
            </div>

            <div className="flex gap-3 items-start">
              <div className="w-7 h-7 rounded-lg bg-violet-500/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                <MessageCircle className="w-3.5 h-3.5 text-violet-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Primeira configuração</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Clique no ícone Chatplay no topo da página e siga o tutorial de instalação do script.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Rodapé */}
        <div className="px-6 pb-5 flex justify-end">
          <Button
            size="sm"
            className="bg-violet-600 hover:bg-violet-700 text-white min-w-[130px]"
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

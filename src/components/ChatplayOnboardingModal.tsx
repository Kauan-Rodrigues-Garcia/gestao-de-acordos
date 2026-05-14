import { useState } from 'react';
import { Check, Copy, Wrench } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

const SCRIPT_URL = '/scripts/chatplay_opener.user.js';

interface ChatplayOnboardingModalProps {
  open: boolean;
  onClose: () => void;
  onConfirmed: () => void;
}

export function ChatplayOnboardingModal({ open, onClose, onConfirmed }: ChatplayOnboardingModalProps) {
  const { perfil, refreshPerfil } = useAuth();
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleCopy() {
    try {
      const res = await fetch(SCRIPT_URL);
      const text = await res.text();
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error('Não foi possível copiar o script');
    }
  }

  async function handleConfirmei() {
    if (!perfil?.id) return;
    setSaving(true);
    const { error } = await supabase
      .from('perfis')
      .update({ tampermonkey_configured: true })
      .eq('id', perfil.id);
    setSaving(false);
    if (error) {
      toast.error('Erro ao salvar configuração');
      return;
    }
    await refreshPerfil();
    toast.success('Chatplay configurado com sucesso!');
    onConfirmed();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="w-5 h-5 text-violet-500" />
            Configurar integração Chatplay
          </DialogTitle>
          <DialogDescription>
            Siga os passos para habilitar o botão Chatplay nos acordos.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <ol className="space-y-4 text-sm">
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-violet-500 text-white text-xs font-bold flex items-center justify-center mt-0.5">1</span>
              <div>
                Instale a extensão <strong>Tampermonkey</strong> no Chrome ou Edge
                {' '}(<a href="https://www.tampermonkey.net/" target="_blank" rel="noopener noreferrer" className="text-violet-500 underline underline-offset-2">tampermonkey.net</a>).
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-violet-500 text-white text-xs font-bold flex items-center justify-center mt-0.5">2</span>
              <div className="flex-1 space-y-2">
                <p>Copie o código do script abaixo:</p>
                <Button size="sm" variant="outline" className="gap-2 border-violet-500/40 text-violet-600 hover:bg-violet-500/10 dark:text-violet-400" onClick={handleCopy}>
                  {copied ? <><Check className="w-3.5 h-3.5 text-green-500" /> Copiado!</> : <><Copy className="w-3.5 h-3.5" /> Copiar código do script</>}
                </Button>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-violet-500 text-white text-xs font-bold flex items-center justify-center mt-0.5">3</span>
              <div className="space-y-1">
                <p>No Tampermonkey, clique em <strong>Adicionar novo script</strong>, apague o conteúdo padrão, cole o código copiado e salve com <strong>Ctrl+S</strong>.</p>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-violet-500 text-white text-xs font-bold flex items-center justify-center mt-0.5">4</span>
              <div>
                Acesse o <strong>chatplay.com.br</strong> pelo mesmo navegador e mantenha a aba aberta ao usar o botão nos acordos.
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-violet-500 text-white text-xs font-bold flex items-center justify-center mt-0.5">5</span>
              <div>Confirme a instalação clicando em <strong>Confirmei</strong> abaixo.</div>
            </li>
          </ol>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>Fechar</Button>
          <Button
            size="sm"
            className="gap-2 bg-violet-600 hover:bg-violet-700 text-white"
            onClick={handleConfirmei}
            disabled={saving}
          >
            {saving ? 'Salvando...' : <><Check className="w-3.5 h-3.5" /> Confirmei</>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

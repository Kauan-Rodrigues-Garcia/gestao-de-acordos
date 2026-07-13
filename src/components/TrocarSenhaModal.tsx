/**
 * TrocarSenhaModal — troca de senha única (botão de chave na topbar).
 *
 * Muitos logins foram criados com uma senha padrão. Este modal deixa o usuário
 * definir a própria senha UMA vez. Ao concluir, marca perfis.senha_alterada =
 * true (o botão de chave some para sempre) e atualiza a senha no Supabase Auth.
 *
 * Recomenda uma senha fácil de lembrar — ex.: a mesma usada no sistema Mundial.
 */
import { useState } from 'react';
import { KeyRound, Loader2, Eye, EyeOff } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

const MIN_SENHA = 6;

interface TrocarSenhaModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  perfilId: string;
  /** Chamado após a troca concluir com sucesso (esconde o botão de chave). */
  onTrocada: () => void;
}

export function TrocarSenhaModal({ open, onOpenChange, perfilId, onTrocada }: TrocarSenhaModalProps) {
  const [senha, setSenha]       = useState('');
  const [confirma, setConfirma] = useState('');
  const [mostrar, setMostrar]   = useState(false);
  const [salvando, setSalvando] = useState(false);

  function resetar() {
    setSenha(''); setConfirma(''); setMostrar(false);
  }

  async function salvar() {
    if (senha.length < MIN_SENHA) {
      toast.error(`A senha precisa ter ao menos ${MIN_SENHA} caracteres.`);
      return;
    }
    if (senha !== confirma) {
      toast.error('As senhas não coincidem.');
      return;
    }
    setSalvando(true);
    try {
      const { error: authErr } = await supabase.auth.updateUser({ password: senha });
      if (authErr) throw authErr;
      // Marca que a senha padrão já foi trocada — o botão de chave some.
      const { error: dbErr } = await supabase
        .from('perfis').update({ senha_alterada: true }).eq('id', perfilId);
      if (dbErr) throw dbErr;
      toast.success('Senha alterada com sucesso!');
      resetar();
      onOpenChange(false);
      onTrocada();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error('Erro ao alterar senha: ' + msg);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!salvando) { onOpenChange(o); if (!o) resetar(); } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-primary" /> Alterar minha senha
          </DialogTitle>
          <DialogDescription>
            Defina uma senha nova para acessar o sistema. Recomendamos uma senha
            fácil de lembrar — pode ser a mesma que você usa no sistema Mundial.
            Esta troca aparece só uma vez.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label className="text-sm">Nova senha</Label>
            <div className="relative">
              <Input
                type={mostrar ? 'text' : 'password'}
                value={senha}
                autoFocus
                disabled={salvando}
                placeholder={`Mínimo ${MIN_SENHA} caracteres`}
                onChange={e => setSenha(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') void salvar(); }}
                className="pr-9"
              />
              <button
                type="button"
                onClick={() => setMostrar(v => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                tabIndex={-1}
              >
                {mostrar ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Confirmar nova senha</Label>
            <Input
              type={mostrar ? 'text' : 'password'}
              value={confirma}
              disabled={salvando}
              placeholder="Repita a senha"
              onChange={e => setConfirma(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void salvar(); }}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" disabled={salvando} onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button disabled={salvando} onClick={() => void salvar()} className="gap-1.5">
            {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
            {salvando ? 'Salvando…' : 'Salvar senha'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * TrocarSenhaModal — troca da própria senha.
 *
 * Dois usos:
 *
 *   • o botão de chave na topbar (voluntário). Muitos logins foram criados com
 *     uma senha padrão; o modal deixa a pessoa definir a própria senha UMA vez
 *     e o botão some (`perfis.senha_alterada = true`);
 *   • `obrigatoria` (05/11/2026): a senha foi resetada por pedido da liderança
 *     (`perfis.senha_troca_obrigatoria`). Não fecha, não tem Cancelar — só
 *     «Sair». Ver `TrocaDeSenhaObrigatoria`. Desde 10/11/2026 a mesma trava
 *     vale para a senha resetada direto e para a conta recém-criada. (Quem
 *     ainda estava com a senha inicial vê outro card: `SenhaInicial/`.)
 *
 * A senha nova passa pela régua de `@/lib/senhaForte`: 6+ caracteres, letra e
 * número, sem sequência manjada e sem o próprio nome.
 *
 * Nos dois casos, depois de o GoTrue aceitar a senha nova,
 * `fn_senha_troca_concluida` desliga a trava e apaga a senha provisória que
 * ficou no pedido.
 */
import { useState } from 'react';
import { KeyRound, Loader2, Eye, EyeOff, LogOut, ShieldAlert } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabase';
import { concluirTrocaDeSenha } from '@/services/senhaPedidos.service';
import { useAuth } from '@/hooks/useAuth';
import { MIN_SENHA_FORTE, problemaDaSenha } from '@/lib/senhaForte';
import { toast } from 'sonner';

interface TrocarSenhaModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  perfilId: string;
  /** Chamado após a troca concluir com sucesso (esconde o botão de chave). */
  onTrocada: () => void;
  /** Senha resetada por pedido: não fecha sem trocar. */
  obrigatoria?: boolean;
  /** Só no modo obrigatório: o botão «Sair». */
  onSair?: () => void;
}

/** O GoTrue recusa repetir a senha atual — aqui, a provisória. */
function mensagemDoErro(msg: string): string {
  if (/same.?password|different from the old/i.test(msg)) {
    return 'A senha nova precisa ser diferente da atual.';
  }
  if (/weak|at least|pwned|leaked|should contain/i.test(msg)) {
    return `Senha fraca ou conhecida demais: use ao menos ${MIN_SENHA_FORTE} caracteres, com letra e número, e fuja das óbvias.`;
  }
  return msg;
}

export function TrocarSenhaModal({
  open, onOpenChange, perfilId, onTrocada, obrigatoria = false, onSair,
}: TrocarSenhaModalProps) {
  const [senha, setSenha]       = useState('');
  const [confirma, setConfirma] = useState('');
  const [mostrar, setMostrar]   = useState(false);
  const [salvando, setSalvando] = useState(false);
  const { perfil } = useAuth();

  function resetar() {
    setSenha(''); setConfirma(''); setMostrar(false);
  }

  async function salvar() {
    const problema = problemaDaSenha(senha, { usuario: perfil?.usuario, nome: perfil?.nome });
    if (problema) {
      toast.error(problema);
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
      try {
        await concluirTrocaDeSenha();
      } catch (e) {
        // Sem a migration 20261105100000 a RPC não existe: o caminho antigo
        // (marcar senha_alterada direto) segura o botão de chave. No modo
        // obrigatório a trava só sai pela RPC — o erro tem de aparecer.
        if (obrigatoria) throw e;
        const { error: dbErr } = await supabase
          .from('perfis').update({ senha_alterada: true }).eq('id', perfilId);
        if (dbErr) throw dbErr;
      }
      toast.success('Senha alterada com sucesso!');
      resetar();
      onOpenChange(false);
      onTrocada();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error('Erro ao alterar senha: ' + mensagemDoErro(msg));
    } finally {
      setSalvando(false);
    }
  }

  const bloquear = obrigatoria
    ? {
      onPointerDownOutside: (e: Event) => e.preventDefault(),
      onEscapeKeyDown: (e: KeyboardEvent) => e.preventDefault(),
      onInteractOutside: (e: Event) => e.preventDefault(),
    }
    : {};

  return (
    <Dialog
      open={open}
      onOpenChange={o => {
        if (obrigatoria || salvando) return;
        onOpenChange(o);
        if (!o) resetar();
      }}
    >
      <DialogContent className={obrigatoria ? 'sm:max-w-md [&>button.absolute]:hidden' : 'sm:max-w-md'} {...bloquear}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {obrigatoria
              ? <><ShieldAlert className="w-5 h-5 text-primary" /> Crie a sua senha nova</>
              : <><KeyRound className="w-5 h-5 text-primary" /> Alterar minha senha</>}
          </DialogTitle>
          <DialogDescription>
            {obrigatoria ? (
              <>
                A senha que você usou para entrar é provisória. Crie uma senha só sua
                para continuar usando o sistema: ao menos {MIN_SENHA_FORTE} caracteres, com
                letra e número, sem o seu nome.
              </>
            ) : (
              <>
                Defina uma senha só sua: ao menos {MIN_SENHA_FORTE} caracteres, com letra e
                número, sem o seu nome. Não use a mesma senha de outros sistemas.
              </>
            )}
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
                autoComplete="new-password"
                placeholder={`Mínimo ${MIN_SENHA_FORTE}, com letra e número`}
                onChange={e => setSenha(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') void salvar(); }}
                className="pr-9"
              />
              <button
                type="button"
                onClick={() => setMostrar(v => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                tabIndex={-1}
                aria-label={mostrar ? 'Esconder a senha' : 'Mostrar a senha'}
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
              autoComplete="new-password"
              placeholder="Repita a senha"
              onChange={e => setConfirma(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void salvar(); }}
            />
          </div>
        </div>

        <DialogFooter className={obrigatoria ? 'gap-2 sm:justify-between' : undefined}>
          {obrigatoria ? (
            <Button variant="ghost" disabled={salvando} onClick={onSair} className="gap-1.5">
              <LogOut className="w-4 h-4" /> Sair
            </Button>
          ) : (
            <Button variant="ghost" disabled={salvando} onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
          )}
          <Button disabled={salvando} onClick={() => void salvar()} className="gap-1.5">
            {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
            {salvando ? 'Salvando…' : 'Salvar senha'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

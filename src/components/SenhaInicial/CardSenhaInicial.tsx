/**
 * CardSenhaInicial — «Uma senha só sua» (campanha de 10/11/2026).
 *
 * O card que quem ainda estava com a senha inicial encontra quando o super
 * admin libera a troca (Configurações › Geral). Fica por cima de tudo e não
 * fecha: o sistema só volta depois da senha nova. A saída é «Sair».
 *
 * É diferente, de propósito, do modal da senha resetada (`TrocarSenhaModal`
 * no modo obrigatório): ali a pessoa pediu ou acabou de chegar; aqui ela usa o
 * sistema há meses e é interrompida no meio do dia. O tom é de conversa —
 * explica o porquê, diz que é rápido e que é só desta vez.
 *
 * Temporário: zerou a lista de pendentes, sai junto com `liberacao.ts`.
 */
import { useState } from 'react';
import { Check, Eye, EyeOff, HeartHandshake, Loader2, LogOut, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { MIN_SENHA_FORTE, problemaDaSenha } from '@/lib/senhaForte';
import { concluirTrocaDeSenha } from '@/services/senhaPedidos.service';

interface Props {
  nome?: string | null;
  usuario?: string | null;
  onTrocada: () => void;
  onSair: () => void;
}

function primeiroNome(nome?: string | null): string {
  const p = (nome ?? '').trim().split(/\s+/)[0] ?? '';
  return p ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : '';
}

function mensagemDoErro(msg: string): string {
  if (/same.?password|different from the old|inicial/i.test(msg)) {
    return 'A senha nova precisa ser diferente da que você usa hoje.';
  }
  if (/weak|at least|pwned|leaked|should contain/i.test(msg)) {
    return 'Essa senha é conhecida demais. Tente outra combinação de letras e números.';
  }
  return msg;
}

function Passo({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className={cn('flex items-center gap-1.5 transition-colors', ok ? 'text-success' : 'text-muted-foreground')}>
      <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors',
        ok ? 'border-success bg-success/15' : 'border-border')}>
        {ok && <Check className="h-3 w-3" strokeWidth={3} />}
      </span>
      {children}
    </li>
  );
}

export function CardSenhaInicial({ nome, usuario, onTrocada, onSair }: Props): React.ReactElement {
  const [senha, setSenha] = useState('');
  const [confirma, setConfirma] = useState('');
  const [mostrar, setMostrar] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const quem = primeiroNome(nome);

  const temTamanho = senha.length >= MIN_SENHA_FORTE;
  const temLetra = /[a-zA-ZÀ-ÿ]/.test(senha);
  const temNumero = /[0-9]/.test(senha);
  const confere = senha.length > 0 && senha === confirma;

  async function salvar() {
    const problema = problemaDaSenha(senha, { usuario, nome });
    if (problema) { toast.error(problema); return; }
    if (senha !== confirma) { toast.error('As duas senhas não estão iguais.'); return; }
    setSalvando(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: senha });
      if (error) throw error;
      await concluirTrocaDeSenha();
      toast.success('Prontinho! A sua senha nova já está valendo.', {
        description: 'O seu login continua o mesmo.',
      });
      onTrocada();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(mensagemDoErro(msg));
    } finally {
      setSalvando(false);
    }
  }

  const naoFecha = {
    onPointerDownOutside: (e: Event) => e.preventDefault(),
    onEscapeKeyDown: (e: KeyboardEvent) => e.preventDefault(),
    onInteractOutside: (e: Event) => e.preventDefault(),
  };

  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent
        className="gap-0 overflow-hidden p-0 sm:max-w-md [&>button.absolute]:hidden"
        {...naoFecha}
      >
        {/* O acolhimento */}
        <div className="relative bg-gradient-to-br from-amber-100 via-orange-50 to-rose-100 px-6 pb-5 pt-6 dark:from-amber-950/60 dark:via-orange-950/40 dark:to-rose-950/50">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/80 shadow-sm ring-1 ring-amber-200/70 dark:bg-white/10 dark:ring-white/10">
            <HeartHandshake className="h-6 w-6 text-amber-600 dark:text-amber-300" />
          </div>
          <DialogHeader className="space-y-1.5 text-left">
            <DialogTitle className="text-lg leading-snug text-amber-950 dark:text-amber-50">
              {quem ? `Oi, ${quem}! ` : 'Oi! '}Vamos criar uma senha só sua?
            </DialogTitle>
            <DialogDescription className="text-sm leading-relaxed text-amber-950/75 dark:text-amber-50/75">
              Para cuidar da sua conta e dos dados da empresa, cada pessoa passa a ter a
              própria senha. A que você usa hoje é a inicial, igual para todo mundo, e por
              isso pedimos que você crie a sua agora. Leva menos de um minuto e é só desta vez.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div className="space-y-1.5">
            <Label className="text-sm">Sua senha nova</Label>
            <div className="relative">
              <Input
                type={mostrar ? 'text' : 'password'}
                value={senha}
                autoFocus
                disabled={salvando}
                autoComplete="new-password"
                placeholder="Ex.: uma palavra e um número"
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
                {mostrar ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">Repita, para conferir</Label>
            <Input
              type={mostrar ? 'text' : 'password'}
              value={confirma}
              disabled={salvando}
              autoComplete="new-password"
              placeholder="A mesma senha"
              onChange={e => setConfirma(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void salvar(); }}
            />
          </div>

          <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs" aria-label="O que a senha precisa ter">
            <Passo ok={temTamanho}>{MIN_SENHA_FORTE} caracteres ou mais</Passo>
            <Passo ok={temLetra}>Uma letra</Passo>
            <Passo ok={temNumero}>Um número</Passo>
            <Passo ok={confere}>As duas iguais</Passo>
          </ul>

          <p className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2 text-xs leading-relaxed text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            <span>
              O seu login continua o mesmo. Só evite o seu nome e sequências como 123456.
              Ninguém da empresa vê a sua senha, nem a liderança.
            </span>
          </p>
        </div>

        <DialogFooter className="gap-2 border-t border-border bg-muted/30 px-6 py-3 sm:justify-between">
          <Button variant="ghost" disabled={salvando} onClick={onSair} className="gap-1.5 text-muted-foreground">
            <LogOut className="h-4 w-4" /> Sair
          </Button>
          <Button disabled={salvando} onClick={() => void salvar()} className="gap-1.5">
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            {salvando ? 'Salvando…' : 'Criar minha senha'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

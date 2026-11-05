/**
 * CartaoPedidoSenha — um pedido de reset de senha no canal «Senhas» do chat.
 *
 *   • super admin: Aprovar (com confirmação) ou Recusar (motivo opcional).
 *     Aprovar chama o servidor, que gera a senha e a redefine;
 *   • quem pediu: a situação, «Cancelar pedido» enquanto espera e, aprovado,
 *     a senha provisória para passar à pessoa — até ela trocar (ou 7 dias).
 */
import { useState } from 'react';
import { toast } from 'sonner';
import { Check, Copy, KeyRound, Loader2, X } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { PERFIL_LABELS } from '@/lib/index';
import { ROTULO_STATUS_SENHA, pedidoSenhaAberto, type PedidoSenha } from '@/lib/senhaPedidos';
import { aprovarPedidoSenha, cancelarPedidoSenha, recusarPedidoSenha } from '@/services/senhaPedidos.service';

const COR_STATUS: Record<PedidoSenha['status'], string> = {
  pendente: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  executando: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  aprovado: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  recusado: 'bg-destructive/10 text-destructive',
  cancelado: 'bg-muted text-muted-foreground',
};

const dataHora = (iso: string | null) => (iso
  ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', '')
  : '');

const cargo = (c: string | null | undefined) => (c ? PERFIL_LABELS[c as keyof typeof PERFIL_LABELS] ?? c : '');

function copiar(texto: string) {
  navigator.clipboard?.writeText(texto).then(() => toast.success('Copiado'), () => toast.error('Não foi possível copiar'));
}

export function CartaoPedidoSenha({ pedido, souSuperAdmin, meuId, onMudou }: {
  pedido: PedidoSenha;
  souSuperAdmin: boolean;
  meuId: string | null;
  onMudou: () => void;
}) {
  const aberto = pedidoSenhaAberto(pedido);
  const decidivel = souSuperAdmin && pedido.status === 'pendente';
  const [confirmando, setConfirmando] = useState(false);
  const [recusando, setRecusando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [ocupado, setOcupado] = useState(false);
  // A senha que ESTE navegador acabou de gerar: aparece antes de a lista reler.
  const [senhaGerada, setSenhaGerada] = useState<string | null>(null);
  const senha = pedido.senha ?? senhaGerada;
  const primeiro = pedido.alvo_nome.split(' ')[0];
  const meuPedido = !!meuId && pedido.solicitante_id === meuId;

  async function aprovar() {
    setOcupado(true);
    const r = await aprovarPedidoSenha(pedido.id);
    setOcupado(false);
    setConfirmando(false);
    if (!r.ok || !r.senha) {
      toast.error(r.erro ?? 'Não foi possível aprovar.', { duration: 10000 });
    } else {
      setSenhaGerada(r.senha);
      toast.success(`Senha de ${primeiro} resetada. A senha já está no chat de ${pedido.solicitante_nome.split(' ')[0]}.`);
      if (r.aviso) toast.warning(r.aviso, { duration: 15000 });
    }
    onMudou();
  }

  async function recusar() {
    setOcupado(true);
    const r = await recusarPedidoSenha(pedido.id, motivo);
    setOcupado(false);
    if (!r.ok) toast.error(r.erro);
    else { toast.message('Pedido recusado.'); setRecusando(false); }
    onMudou();
  }

  async function cancelar() {
    setOcupado(true);
    const r = await cancelarPedidoSenha(pedido.id);
    setOcupado(false);
    if (!r.ok) toast.error(r.erro);
    else toast.message('Pedido cancelado.');
    onMudou();
  }

  const iniciais = pedido.alvo_nome.split(' ').map(n => n[0]).slice(0, 2).join('');

  return (
    <article className={cn(
      'rounded-xl border bg-card p-3 text-sm shadow-sm',
      aberto ? 'border-amber-500/40' : 'border-border',
    )}>
      <header className="flex flex-wrap items-start justify-between gap-x-2 gap-y-0.5">
        <p className="min-w-0 font-semibold">
          {souSuperAdmin ? pedido.solicitante_nome : 'Seu pedido'}
          {souSuperAdmin && (
            <span className="font-normal text-muted-foreground">
              {' · '}{[cargo(pedido.solicitante_cargo), pedido.solicitante_setor].filter(Boolean).join(' · ')}
            </span>
          )}
        </p>
        <span className="text-[11px] text-muted-foreground">{dataHora(pedido.criado_em)}</span>
      </header>

      <div className="mt-2 flex items-center gap-2.5 rounded-lg bg-muted/40 px-2 py-1.5">
        <Avatar className="h-8 w-8">
          {pedido.alvo_foto && <AvatarImage src={pedido.alvo_foto} alt={pedido.alvo_nome} />}
          <AvatarFallback className="bg-primary/10 text-[11px] font-semibold text-primary">{iniciais}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{pedido.alvo_nome}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {[pedido.alvo_usuario && `login ${pedido.alvo_usuario}`, cargo(pedido.alvo_cargo), pedido.alvo_setor].filter(Boolean).join(' · ')}
          </p>
        </div>
        <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold', COR_STATUS[pedido.status])}>
          {ROTULO_STATUS_SENHA[pedido.status]}
        </span>
      </div>

      {pedido.motivo && (
        <p className="mt-2 whitespace-pre-wrap rounded-lg border-l-2 border-primary/40 pl-2 text-xs">{pedido.motivo}</p>
      )}
      {pedido.erro && aberto && <p className="mt-2 text-[11px] text-destructive">Última tentativa falhou: {pedido.erro}</p>}
      {pedido.status === 'recusado' && pedido.motivo_recusa && (
        <p className="mt-2 text-[11px] text-muted-foreground">Motivo: {pedido.motivo_recusa}</p>
      )}
      {pedido.status === 'cancelado' && pedido.erro && (
        <p className="mt-2 text-[11px] text-muted-foreground">{pedido.erro}</p>
      )}

      {/* ── A senha provisória ─────────────────────────────────────────────── */}
      {pedido.status === 'aprovado' && (
        senha && !pedido.trocada_em ? (
          <div className="mt-2 rounded-lg border border-emerald-500/40 bg-emerald-500/[0.07] p-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Senha provisória</p>
            <div className="mt-1 flex items-center gap-2">
              <code className="select-all rounded-md bg-background px-2.5 py-1 font-mono text-lg font-bold tracking-[0.2em]">{senha}</code>
              <Button size="sm" variant="ghost" className="h-8 gap-1.5" onClick={() => copiar(senha)}>
                <Copy className="h-3.5 w-3.5" /> Copiar
              </Button>
            </div>
            <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
              Passe para {primeiro}{pedido.alvo_usuario ? <> (login <span className="font-mono">{pedido.alvo_usuario}</span>)</> : null}.
              Ao entrar, o sistema obriga a criar uma senha nova — e esta some daqui.
            </p>
          </div>
        ) : (
          <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <KeyRound className="h-3.5 w-3.5" />
            {pedido.trocada_em
              ? `${primeiro} já criou a senha nova em ${dataHora(pedido.trocada_em)}.`
              : 'A senha provisória expirou (7 dias). Se ainda precisar, peça outro reset.'}
          </p>
        )
      )}

      {/* ── Decidir (super admin) ──────────────────────────────────────────── */}
      {decidivel && (
        <div className="mt-3 space-y-2 border-t border-border pt-2.5">
          {confirmando ? (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-2 text-xs">
              <p>
                Resetar a senha de <strong>{pedido.alvo_nome}</strong>? O sistema gera uma senha nova,
                manda para {pedido.solicitante_nome.split(' ')[0]} e obriga {primeiro} a trocar ao entrar.
              </p>
              <div className="mt-2 flex gap-2">
                <Button size="sm" className="h-7 gap-1.5" disabled={ocupado} onClick={() => void aprovar()}>
                  {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  {ocupado ? 'Resetando…' : 'Confirmar'}
                </Button>
                <Button size="sm" variant="ghost" className="h-7" disabled={ocupado} onClick={() => setConfirmando(false)}>Voltar</Button>
              </div>
            </div>
          ) : recusando ? (
            <div className="space-y-2">
              <input type="text" value={motivo} maxLength={300} disabled={ocupado} autoFocus
                onChange={e => setMotivo(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') void recusar(); }}
                placeholder="Motivo da recusa (opcional)"
                className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs" />
              <div className="flex gap-2">
                <Button size="sm" variant="destructive" className="h-7 gap-1.5" disabled={ocupado} onClick={() => void recusar()}>
                  {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                  Recusar
                </Button>
                <Button size="sm" variant="ghost" className="h-7" disabled={ocupado} onClick={() => setRecusando(false)}>Voltar</Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" className="h-8 gap-1.5" disabled={ocupado} onClick={() => setConfirmando(true)}>
                <Check className="h-3.5 w-3.5" /> Aprovar
              </Button>
              <Button size="sm" variant="outline" className="h-8 gap-1.5" disabled={ocupado} onClick={() => setRecusando(true)}>
                <X className="h-3.5 w-3.5" /> Recusar
              </Button>
            </div>
          )}
        </div>
      )}

      {!souSuperAdmin && meuPedido && pedido.status === 'pendente' && (
        <div className="mt-2.5 border-t border-border pt-2">
          <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={ocupado} onClick={() => void cancelar()}>
            {ocupado ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <X className="mr-1 h-3.5 w-3.5" />}
            Cancelar pedido
          </Button>
        </div>
      )}

      {!aberto && pedido.decidido_em && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          {pedido.status === 'cancelado' ? 'Cancelado' : 'Decidido'} em {dataHora(pedido.decidido_em)}
          {pedido.decidido_por_nome ? ` por ${pedido.decidido_por_nome}` : ''}
        </p>
      )}
    </article>
  );
}

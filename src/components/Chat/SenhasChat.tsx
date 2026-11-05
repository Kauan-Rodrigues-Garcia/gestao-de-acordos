/**
 * SenhasChat.tsx — o canal «Senhas» do chat (05/11/2026).
 *
 * Mesmo desenho do canal «Transferências»: não é conversa de verdade, não se
 * apaga e não tem menu — é a fila dos pedidos de reset de senha.
 *
 *   • super admin: um canal só, com TODOS os pedidos. Sobe para o topo, aceso,
 *     enquanto houver pedido aberto;
 *   • quem pediu: o mesmo canal, só com os pedidos dele. Acende quando um é
 *     decidido, e só existe na lista depois do primeiro pedido.
 */
import { useMemo } from 'react';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CartaoPedidoSenha } from '@/components/admin/senha/CartaoPedidoSenha';
import { pedidoSenhaAberto, type PedidoSenha, type ResumoSenhas } from '@/lib/senhaPedidos';
import { horaCurta, rotuloDoDia } from './formatos';
import { IconeSenhas } from './IconeSenhas';

export const TITULO_SENHAS = 'Senhas';

export interface SenhasNoChat {
  resumo: ResumoSenhas;
  avisos: number;
  emDestaque: boolean;
  selecionada: boolean;
  onAbrir: () => void;
}

/** A linha na lista de conversas. */
export function LinhaSenhas({ resumo, avisos, emDestaque, selecionada, onAbrir }: SenhasNoChat) {
  return (
    <button type="button" onClick={onAbrir}
      className={cn(
        'w-full grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 px-3 py-2.5 text-left transition-colors',
        selecionada ? 'bg-muted' : emDestaque ? 'bg-amber-500/[0.07] hover:bg-amber-500/[0.12]' : 'hover:bg-muted/50',
      )}>
      <IconeSenhas tamanho={40} alerta={emDestaque} />
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{TITULO_SENHAS}</p>
        <p className={cn('truncate text-xs', emDestaque ? 'font-medium text-amber-700 dark:text-amber-400' : 'text-muted-foreground')}>
          {resumo.previa}
        </p>
      </div>
      <span className="flex min-w-[30px] shrink-0 flex-col items-end gap-0.5 self-stretch justify-center">
        <span className="text-[10px] text-muted-foreground">{horaCurta(resumo.ultimaEm)}</span>
        {avisos > 0 && (
          <span className={cn(
            'flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold text-white',
            emDestaque ? 'bg-amber-500' : 'bg-primary',
          )} aria-label={`${avisos} ${avisos === 1 ? 'pedido de senha' : 'pedidos de senha'}`}>
            {avisos > 99 ? '99+' : avisos}
          </span>
        )}
      </span>
    </button>
  );
}

/** O canal aberto: os pedidos abertos em cima, o histórico por dia embaixo. */
export function PainelSenhas({
  pedidos, souSuperAdmin, meuId, onMudou, expandido, onVoltar,
}: {
  pedidos: PedidoSenha[];
  souSuperAdmin: boolean;
  meuId: string | null;
  onMudou: () => void;
  expandido: boolean;
  onVoltar: () => void;
}) {
  const abertos = useMemo(
    () => pedidos.filter(pedidoSenhaAberto).sort((a, b) => a.criado_em.localeCompare(b.criado_em)),
    [pedidos],
  );
  const historico = useMemo(() => {
    const dias = new Map<string, PedidoSenha[]>();
    const fechados = pedidos
      .filter(p => !pedidoSenhaAberto(p))
      .sort((a, b) => (b.decidido_em ?? b.criado_em).localeCompare(a.decidido_em ?? a.criado_em));
    for (const p of fechados) {
      const dia = rotuloDoDia(p.decidido_em ?? p.criado_em);
      dias.set(dia, [...(dias.get(dia) ?? []), p]);
    }
    return [...dias.entries()];
  }, [pedidos]);

  const cartao = (p: PedidoSenha) => (
    <CartaoPedidoSenha key={p.id} pedido={p} souSuperAdmin={souSuperAdmin} meuId={meuId} onMudou={onMudou} />
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center gap-2.5 border-b border-border px-3 py-2.5">
        {!expandido && (
          <button onClick={onVoltar} aria-label="Voltar para a lista"
            className="-ml-1 rounded p-1 transition-colors hover:bg-muted pointer-coarse:-ml-2 pointer-coarse:p-2">
            <ArrowLeft className="h-4 w-4 pointer-coarse:h-5 pointer-coarse:w-5" />
          </button>
        )}
        <IconeSenhas tamanho={34} alerta={souSuperAdmin && abertos.length > 0} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{TITULO_SENHAS}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {souSuperAdmin ? 'Pedidos de reset de senha de todos os setores' : 'Seus pedidos de reset de senha'}
          </p>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-muted/20 p-3">
        {abertos.length > 0 && (
          <section className="space-y-2" aria-label="Aguardando decisão">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400">
              <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
              {abertos.length === 1 ? '1 aguardando decisão' : `${abertos.length} aguardando decisão`}
            </p>
            {abertos.map(cartao)}
          </section>
        )}

        {historico.map(([dia, lista]) => (
          <section key={dia} className="space-y-2" aria-label={`Decididos · ${dia}`}>
            <p className="text-center">
              <span className="rounded-full bg-background px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground shadow-sm">{dia}</span>
            </p>
            {lista.map(cartao)}
          </section>
        ))}

        {pedidos.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <IconeSenhas tamanho={48} alerta={false} />
            <p className="text-sm font-medium">Nenhum pedido de senha</p>
            <p className="text-xs text-muted-foreground">
              {souSuperAdmin
                ? 'Quando a liderança pedir para resetar a senha de alguém, o pedido chega aqui e você é avisado.'
                : 'Peça na aba Usuários: abra a pessoa e clique em «Solicitar reset de senha».'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

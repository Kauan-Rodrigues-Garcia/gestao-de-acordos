/**
 * CartaoPedidoTransferencia — um pedido de transferência no canal do chat.
 *
 * Duas visões do mesmo cartão:
 *
 *   • super admin: cada pessoa ainda aberta tem uma caixinha (todas marcadas
 *     ao abrir). «Aprovar marcadas» transfere as marcadas e RECUSA as
 *     desmarcadas, com o motivo opcional. Antes de rodar, uma confirmação: a
 *     transferência apaga tabulação (chegar limpo) e não volta;
 *   • quem pediu: a situação de cada pessoa, e «Cancelar pedido» enquanto
 *     houver alguém esperando.
 *
 * A transferência é a da tela (`aprovarItens` → `executarTransferencia`).
 */
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ArrowRight, Check, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { PERFIL_LABELS } from '@/lib/index';
import {
  ROTULO_ITEM, itemAberto, type ItemPedido, type PedidoTransferencia,
} from '@/lib/transferenciaPedidos';
import {
  aprovarItens, cancelarPedido, podeLevarAcordos, recusarItens,
} from '@/services/admin/transferenciaPedidos.service';
import { EtiquetasSetor } from './EtiquetasSetor';

const COR_ITEM: Record<ItemPedido['status'], string> = {
  pendente: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  executando: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  transferida: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  recusada: 'bg-destructive/10 text-destructive',
  cancelada: 'bg-muted text-muted-foreground',
  sem_efeito: 'bg-muted text-muted-foreground',
};

const dataHora = (iso: string | null) => (iso
  ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', '')
  : '');

const cargo = (c: string | null | undefined) => (c ? PERFIL_LABELS[c as keyof typeof PERFIL_LABELS] ?? c : '');

export function CartaoPedidoTransferencia({ pedido, souSuperAdmin, meuId, onMudou }: {
  pedido: PedidoTransferencia;
  souSuperAdmin: boolean;
  meuId: string | null;
  onMudou: () => void;
}) {
  const abertos = useMemo(() => pedido.itens.filter(itemAberto), [pedido.itens]);
  const decidivel = souSuperAdmin && abertos.length > 0;
  const [marcados, setMarcados] = useState<Set<string>>(() => new Set(abertos.map(i => i.id)));
  const levarPermitido = podeLevarAcordos(pedido);
  const [levar, setLevar] = useState(pedido.levar_acordos && levarPermitido);
  const [motivo, setMotivo] = useState('');
  const [confirmando, setConfirmando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [progresso, setProgresso] = useState<{ feitos: number; total: number } | null>(null);

  const aprovar = abertos.filter(i => marcados.has(i.id) && i.status === 'pendente');
  const recusar = abertos.filter(i => !marcados.has(i.id) && i.status === 'pendente');

  function alternar(id: string) {
    setConfirmando(false);
    setMarcados(m => {
      const n = new Set(m);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  async function decidir(tudoRecusado: boolean) {
    setOcupado(true);
    try {
      const paraRecusar = tudoRecusado ? abertos.filter(i => i.status === 'pendente') : recusar;
      if (!tudoRecusado && aprovar.length) {
        const r = await aprovarItens({
          pedido, itemIds: aprovar.map(i => i.id), levarAcordos: levar,
          executadoPorId: meuId,
          onProgresso: (feitos, total) => setProgresso({ feitos, total }),
        });
        const ok = r.filter(x => x.ok);
        const apagados = ok.reduce((s, x) => s + x.acordosApagados, 0);
        const movidos = ok.reduce((s, x) => s + x.acordosMovidos, 0);
        if (ok.length) {
          toast.success([
            ok.length === 1 ? '1 pessoa transferida.' : `${ok.length} pessoas transferidas.`,
            apagados ? `${apagados.toLocaleString('pt-BR')} tabulações apagadas (relatórios baixados).` : '',
            movidos ? `${movidos.toLocaleString('pt-BR')} tabulações foram junto.` : '',
          ].filter(Boolean).join(' '), { duration: 9000 });
        }
        for (const x of r) {
          if (!x.ok) toast.error(`${x.nome}: ${x.mensagem}`, { duration: 12000 });
          else if (x.aviso) toast.warning(`${x.nome} — ${x.aviso}`, { duration: 12000 });
        }
      }
      if (paraRecusar.length) {
        const r = await recusarItens(paraRecusar.map(i => i.id), motivo);
        if (!r.ok) toast.error(r.erro ?? 'Não foi possível recusar.');
        else toast.message(paraRecusar.length === 1 ? '1 pessoa recusada.' : `${paraRecusar.length} pessoas recusadas.`);
      }
    } finally {
      setOcupado(false);
      setProgresso(null);
      setConfirmando(false);
      onMudou();
    }
  }

  async function cancelar() {
    setOcupado(true);
    const r = await cancelarPedido(pedido.id);
    setOcupado(false);
    if (!r.ok) toast.error(r.erro ?? 'Não foi possível cancelar.');
    else toast.message('Pedido cancelado.');
    onMudou();
  }

  const meuPedido = !!meuId && pedido.solicitante_id === meuId;

  return (
    <article className={cn(
      'rounded-xl border bg-card p-3 text-sm shadow-sm',
      abertos.length ? 'border-amber-500/40' : 'border-border',
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

      <p className="mt-0.5 text-xs text-muted-foreground">
        {pedido.direcao === 'tirar' ? 'Tirar do setor dele' : 'Trazer para o setor dele'}
        {' · '}{pedido.itens.length === 1 ? '1 pessoa' : `${pedido.itens.length} pessoas`}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded-lg bg-muted/40 px-2 py-1.5 text-xs">
        <span className="font-medium">{pedido.origem?.nome ?? 'Setor removido'}</span>
        <EtiquetasSetor setor={pedido.origem} />
        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="font-medium">{pedido.destino?.nome ?? 'Setor removido'}</span>
        <EtiquetasSetor setor={pedido.destino} />
      </div>

      {pedido.motivo && (
        <p className="mt-2 whitespace-pre-wrap rounded-lg border-l-2 border-primary/40 pl-2 text-xs">{pedido.motivo}</p>
      )}

      <ul className="mt-2 space-y-1">
        {pedido.itens.map(i => {
          const caixa = decidivel && i.status === 'pendente';
          return (
            <li key={i.id} className="flex items-start gap-2">
              {caixa ? (
                <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-primary" checked={marcados.has(i.id)}
                  disabled={ocupado} onChange={() => alternar(i.id)} aria-label={`Aprovar ${i.perfil_nome}`} />
              ) : decidivel ? <span className="w-4 shrink-0" aria-hidden /> : null}
              <div className="min-w-0 flex-1">
                <p className="truncate">
                  {i.perfil_nome}
                  {i.perfil_cargo && <span className="text-muted-foreground"> · {cargo(i.perfil_cargo)}</span>}
                </p>
                {i.status === 'recusada' && i.motivo_recusa && (
                  <p className="text-[11px] text-muted-foreground">Motivo: {i.motivo_recusa}</p>
                )}
                {i.erro && <p className="text-[11px] text-destructive">{i.erro}</p>}
                {i.status === 'transferida' && i.levou_acordos && (
                  <p className="text-[11px] text-muted-foreground">Levou as tabulações</p>
                )}
              </div>
              <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold', COR_ITEM[i.status])}>
                {ROTULO_ITEM[i.status]}
              </span>
            </li>
          );
        })}
      </ul>

      {decidivel && (
        <div className="mt-3 space-y-2 border-t border-border pt-2.5">
          <label className={cn('flex items-start gap-2 text-xs', !levarPermitido && 'opacity-60')}>
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-primary" checked={levar && levarPermitido}
              disabled={!levarPermitido || ocupado} onChange={e => { setLevar(e.target.checked); setConfirmando(false); }} />
            <span>
              Levar as tabulações junto
              <span className="block text-[11px] text-muted-foreground">
                {levarPermitido
                  ? pedido.levar_acordos ? 'Quem pediu sugeriu levar.' : 'Desmarcado = chegar limpo: relatório baixado e tabulações apagadas.'
                  : 'Outra empresa ou outra regra de negócio: sempre chega limpo.'}
              </span>
            </span>
          </label>
          {recusar.length > 0 || confirmando ? (
            <input type="text" value={motivo} maxLength={500} disabled={ocupado}
              onChange={e => setMotivo(e.target.value)}
              placeholder="Motivo da recusa (opcional)"
              className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs" />
          ) : null}

          {confirmando ? (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-2 text-xs">
              <p>
                {aprovar.length > 0 && <>Transferir <strong>{aprovar.length}</strong>{levar && levarPermitido ? ' levando as tabulações' : ' chegando limpo'}</>}
                {aprovar.length > 0 && recusar.length > 0 && ' e '}
                {recusar.length > 0 && <>recusar <strong>{recusar.length}</strong></>}?
                {aprovar.length > 0 && !(levar && levarPermitido) && ' As tabulações de quem vai são baixadas em relatório e apagadas.'}
              </p>
              <div className="mt-2 flex gap-2">
                <Button size="sm" className="h-7 gap-1.5" disabled={ocupado} onClick={() => void decidir(false)}>
                  {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  {ocupado && progresso ? `Transferindo ${progresso.feitos}/${progresso.total}…` : 'Confirmar'}
                </Button>
                <Button size="sm" variant="ghost" className="h-7" disabled={ocupado} onClick={() => setConfirmando(false)}>Voltar</Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" className="h-8 gap-1.5" disabled={ocupado || aprovar.length === 0} onClick={() => setConfirmando(true)}>
                <Check className="h-3.5 w-3.5" />
                {aprovar.length === abertos.length ? `Aprovar ${aprovar.length === 1 ? '' : 'todas '}(${aprovar.length})` : `Aprovar marcadas (${aprovar.length})`}
              </Button>
              <Button size="sm" variant="outline" className="h-8 gap-1.5" disabled={ocupado} onClick={() => void decidir(true)}>
                {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                Recusar {abertos.length === 1 ? '' : 'todas'}
              </Button>
            </div>
          )}
        </div>
      )}

      {!souSuperAdmin && meuPedido && abertos.some(i => i.status === 'pendente') && (
        <div className="mt-2.5 border-t border-border pt-2">
          <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={ocupado} onClick={() => void cancelar()}>
            {ocupado ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <X className="mr-1 h-3.5 w-3.5" />}
            Cancelar pedido
          </Button>
        </div>
      )}

      {!abertos.length && pedido.concluido_em && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          {pedido.status === 'cancelado' ? 'Cancelado' : 'Decidido'} em {dataHora(pedido.concluido_em)}
          {(() => {
            const por = [...new Set(pedido.itens.map(i => i.decidido_por_nome).filter(Boolean))];
            return por.length ? ` por ${por.join(', ')}` : '';
          })()}
        </p>
      )}
    </article>
  );
}

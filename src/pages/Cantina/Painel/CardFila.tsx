/**
 * CardFila — um pedido no quadro da cantina.
 *
 * Feito para o balcão: o número grande, a hora de retirada, quem pediu, os
 * itens e UM botão grande com o próximo passo. Atrasado fica laranja; pedido
 * que acabou de chegar pulsa até alguém mexer nele.
 */
import { memo } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, ChefHat, Clock, Loader2, MessageCircle, PackageCheck, UserX, UtensilsCrossed } from 'lucide-react';
import { cn } from '@/lib/utils';
import { atrasado, formatarPreco, horaSP, type PedidoCantina, type StatusPedido } from '@/lib/cantina';
import { SeloStatus } from '../visual';

const PROXIMO: Partial<Record<StatusPedido, { para: StatusPedido; rotulo: string; icone: typeof ChefHat; cor: string }>> = {
  novo:       { para: 'preparando', rotulo: 'Preparar',        icone: ChefHat,         cor: 'bg-amber-500 hover:bg-amber-600 text-white' },
  preparando: { para: 'pronto',     rotulo: 'Pronto',          icone: PackageCheck,    cor: 'bg-emerald-600 hover:bg-emerald-700 text-white' },
  pronto:     { para: 'retirado',   rotulo: 'Entregue',        icone: UtensilsCrossed, cor: 'bg-sky-600 hover:bg-sky-700 text-white' },
};

export const CardFila = memo(function CardFila({
  pedido, agoraMs, recente, mudando, onAbrir, onTrocar,
}: {
  pedido: PedidoCantina;
  agoraMs: number;
  recente: boolean;
  mudando: boolean;
  onAbrir: (id: string) => void;
  onTrocar: (id: string, status: StatusPedido) => void;
}) {
  const prox = PROXIMO[pedido.status];
  const tarde = atrasado(pedido, agoraMs);
  const minutosAtraso = tarde ? Math.floor((agoraMs - Date.parse(pedido.retirada_em)) / 60_000) : 0;
  const podeNaoRetirado = pedido.status === 'pronto' && agoraMs >= Date.parse(pedido.retirada_em);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      className={cn(
        'relative rounded-2xl border bg-card shadow-sm overflow-hidden',
        recente && 'ring-2 ring-sky-500 animate-[pulse_1.6s_ease-in-out_3]',
        tarde && 'border-orange-400 dark:border-orange-600',
      )}
    >
      {tarde && <span className="absolute inset-y-0 left-0 w-1 bg-orange-500" aria-hidden />}
      <button type="button" onClick={() => onAbrir(pedido.id)} className="block w-full text-left p-3 hover:bg-accent/40 transition-colors">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black tracking-tight">#{pedido.numero}</span>
            <span className={cn('inline-flex items-center gap-1 text-sm font-bold tabular-nums', tarde ? 'text-orange-600 dark:text-orange-400' : 'text-foreground')}>
              <Clock className="w-3.5 h-3.5" />{horaSP(pedido.retirada_em)}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {pedido.nao_lidas > 0 && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-primary text-primary-foreground px-1.5 py-0.5 text-[11px] font-bold">
                <MessageCircle className="w-3 h-3" />{pedido.nao_lidas}
              </span>
            )}
            {pedido.status !== 'novo' && pedido.status !== 'preparando' && pedido.status !== 'pronto' && <SeloStatus status={pedido.status} />}
          </div>
        </div>
        <p className="mt-0.5 text-sm font-semibold truncate">{pedido.nome}</p>
        <p className="text-[11px] text-muted-foreground truncate">
          {[pedido.setor_nome, pedido.empresa_nome].filter(Boolean).join(' · ')}
        </p>
        <ul className="mt-2 space-y-0.5">
          {pedido.itens.map((i, n) => (
            <li key={n} className="text-sm leading-snug">
              <strong className="tabular-nums">{i.quantidade}×</strong> {i.nome}
              {i.opcao && <span className="text-muted-foreground"> ({i.opcao})</span>}
              {i.observacao && <span className="block text-xs text-orange-700 dark:text-orange-300">↳ {i.observacao}</span>}
            </li>
          ))}
        </ul>
        {pedido.observacao && <p className="mt-1.5 text-xs italic text-muted-foreground">“{pedido.observacao}”</p>}
        <div className="mt-2 flex items-center justify-between text-xs">
          {tarde ? (
            <span className="inline-flex items-center gap-1 font-semibold text-orange-600 dark:text-orange-400">
              <AlertTriangle className="w-3.5 h-3.5" /> {minutosAtraso} min além do horário
            </span>
          ) : <span />}
          <span className="font-semibold tabular-nums">{formatarPreco(pedido.total)}</span>
        </div>
      </button>

      {(prox || podeNaoRetirado) && (
        <div className="flex gap-1.5 px-3 pb-3">
          {prox && (
            <button
              type="button" disabled={mudando}
              onClick={() => onTrocar(pedido.id, prox.para)}
              className={cn('flex-1 h-11 inline-flex items-center justify-center gap-2 rounded-xl text-sm font-bold shadow-sm transition-colors disabled:opacity-60', prox.cor)}
            >
              {mudando ? <Loader2 className="w-4 h-4 animate-spin" /> : <prox.icone className="w-4 h-4" />}
              {prox.rotulo}
            </button>
          )}
          {podeNaoRetirado && (
            <button
              type="button" disabled={mudando} title="Não retirou"
              onClick={() => onTrocar(pedido.id, 'nao_retirado')}
              className="h-11 px-3 inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-300 text-rose-700 dark:border-rose-800 dark:text-rose-300 text-xs font-semibold hover:bg-rose-500/10 disabled:opacity-60"
            >
              <UserX className="w-4 h-4" /> Não retirou
            </button>
          )}
        </div>
      )}
    </motion.div>
  );
});

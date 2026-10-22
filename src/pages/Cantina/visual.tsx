/**
 * visual.tsx — as peças de desenho que a aba e o painel da cantina dividem.
 *
 * Item sem foto ganha a ilustração da categoria (gradiente quente + ícone), e
 * não a câmera riscada de «foto indisponível» do sistema antigo: um cardápio
 * com metade das fotos faltando continua bonito.
 */
import {
  Check, ChefHat, Clock, Cookie, CookingPot, CupSoda, Croissant, PackageCheck, Sandwich,
  UtensilsCrossed, XCircle, type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  ETAPAS, etapaAtual, STATUS_ROTULO,
  type CategoriaCantina, type PedidoCantina, type StatusPedido,
} from '@/lib/cantina';

const ILUSTRACAO: Record<CategoriaCantina, { icone: LucideIcon; fundo: string; cor: string }> = {
  lanches:   { icone: Sandwich,        fundo: 'from-amber-200 via-orange-200 to-orange-300 dark:from-amber-500/25 dark:via-orange-500/20 dark:to-orange-600/30', cor: 'text-orange-700 dark:text-orange-300' },
  salgados:  { icone: Croissant,       fundo: 'from-yellow-100 via-amber-200 to-amber-300 dark:from-yellow-500/20 dark:via-amber-500/20 dark:to-amber-600/30', cor: 'text-amber-700 dark:text-amber-300' },
  refeicoes: { icone: CookingPot,      fundo: 'from-lime-100 via-emerald-200 to-emerald-300 dark:from-lime-500/20 dark:via-emerald-500/20 dark:to-emerald-600/30', cor: 'text-emerald-700 dark:text-emerald-300' },
  bebidas:   { icone: CupSoda,         fundo: 'from-sky-100 via-cyan-200 to-sky-300 dark:from-sky-500/20 dark:via-cyan-500/20 dark:to-sky-600/30', cor: 'text-sky-700 dark:text-sky-300' },
  doces:     { icone: Cookie,          fundo: 'from-pink-100 via-rose-200 to-rose-300 dark:from-pink-500/20 dark:via-rose-500/20 dark:to-rose-600/30', cor: 'text-rose-700 dark:text-rose-300' },
  outros:    { icone: UtensilsCrossed, fundo: 'from-stone-100 via-stone-200 to-stone-300 dark:from-stone-500/20 dark:via-stone-500/20 dark:to-stone-600/30', cor: 'text-stone-700 dark:text-stone-300' },
};

/** O ícone da categoria, sem o fundo (chips de filtro). */
export function IconeDaCategoria({ categoria, className }: { categoria: CategoriaCantina; className?: string }) {
  const Icone = (ILUSTRACAO[categoria] ?? ILUSTRACAO.outros).icone;
  return <Icone className={className} />;
}

/** A foto do item, ou a ilustração da categoria. */
export function ImagemItem({
  categoria, foto, nome, className, tamanhoIcone = 'w-12 h-12',
}: {
  categoria: CategoriaCantina;
  foto: string | null;
  nome: string;
  className?: string;
  tamanhoIcone?: string;
}) {
  if (foto) {
    return <img src={foto} alt={nome} loading="lazy" className={cn('object-cover', className)} />;
  }
  const il = ILUSTRACAO[categoria] ?? ILUSTRACAO.outros;
  const Icone = il.icone;
  return (
    <div className={cn('relative overflow-hidden bg-gradient-to-br', il.fundo, className)} aria-hidden>
      {/* Dois círculos de luz dão profundidade sem pesar. */}
      <span className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-white/35 dark:bg-white/5 blur-xl" />
      <span className="absolute -bottom-8 -left-4 w-20 h-20 rounded-full bg-white/25 dark:bg-white/5 blur-lg" />
      <Icone className={cn('absolute inset-0 m-auto drop-shadow-sm', il.cor, tamanhoIcone)} strokeWidth={1.6} />
    </div>
  );
}

const SELO: Record<StatusPedido, string> = {
  novo:         'bg-sky-500/12 text-sky-700 dark:text-sky-300 ring-sky-500/30',
  preparando:   'bg-amber-500/15 text-amber-800 dark:text-amber-300 ring-amber-500/35',
  pronto:       'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-emerald-500/40',
  retirado:     'bg-muted text-muted-foreground ring-border',
  nao_retirado: 'bg-rose-500/12 text-rose-700 dark:text-rose-300 ring-rose-500/30',
  cancelado:    'bg-muted text-muted-foreground ring-border line-through decoration-1',
};

export function SeloStatus({ status, className }: { status: StatusPedido; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1', SELO[status], className)}>
      {status === 'pronto' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
      {status === 'preparando' && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />}
      {STATUS_ROTULO[status]}
    </span>
  );
}

const ICONE_ETAPA: LucideIcon[] = [Check, ChefHat, PackageCheck, UtensilsCrossed];

/** Recebido → Preparando → Pronto → Retirado. */
export function LinhaDoTempo({ pedido }: { pedido: Pick<PedidoCantina, 'status'> }) {
  if (pedido.status === 'cancelado' || pedido.status === 'nao_retirado') {
    return (
      <div className={cn(
        'flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium',
        pedido.status === 'cancelado' ? 'bg-muted text-muted-foreground' : 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
      )}>
        {pedido.status === 'cancelado' ? <XCircle className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
        {STATUS_ROTULO[pedido.status]}
      </div>
    );
  }
  const atual = etapaAtual(pedido.status);
  return (
    <ol className="flex items-center w-full" aria-label="Andamento do pedido">
      {ETAPAS.map((e, i) => {
        const Icone = ICONE_ETAPA[i];
        const feito = i < atual || (i === atual && pedido.status === 'retirado');
        const agora = i === atual && pedido.status !== 'retirado';
        return (
          <li key={e.status} className={cn('flex items-center', i < ETAPAS.length - 1 && 'flex-1')}>
            <div className="flex flex-col items-center gap-1 min-w-[56px]">
              <span className={cn(
                'relative flex items-center justify-center w-9 h-9 rounded-full ring-2 transition-colors',
                feito && 'bg-emerald-500 text-white ring-emerald-500',
                agora && (pedido.status === 'pronto'
                  ? 'bg-emerald-500 text-white ring-emerald-300 dark:ring-emerald-700'
                  : 'bg-primary text-primary-foreground ring-primary/30'),
                !feito && !agora && 'bg-muted text-muted-foreground ring-border',
              )}>
                {agora && <span className="absolute inset-0 rounded-full animate-ping bg-current opacity-20" />}
                <Icone className="w-4 h-4" />
              </span>
              <span className={cn('text-[11px] font-medium', (feito || agora) ? 'text-foreground' : 'text-muted-foreground')}>
                {e.rotulo}
              </span>
            </div>
            {i < ETAPAS.length - 1 && (
              <span className={cn('h-0.5 flex-1 -mt-5 mx-1 rounded-full', i < atual ? 'bg-emerald-500' : 'bg-border')} />
            )}
          </li>
        );
      })}
    </ol>
  );
}

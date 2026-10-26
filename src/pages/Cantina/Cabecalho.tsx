/**
 * Cabecalho — a abertura da aba Cantina, com cara de página de entrada
 * (26/10/2026): saudação e chamada à esquerda, a vitrine de fotos girando à
 * direita (no celular, a vitrine vem em cima, como capa).
 *
 * Cores só dos tokens do tema: segue claro, escuro e a cor de destaque de cada
 * empresa. O laranja fixo de antes brigava com todos eles.
 */
import { motion } from 'framer-motion';
import { ArrowDown, Clock, Megaphone, UtensilsCrossed } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ConfigCantina } from '@/lib/cantina';
import { Vitrine, type SlideVitrine } from './Vitrine';

export function CabecalhoCantina({
  saudacao, primeiroNome, config, vitrine, disponiveisAgora, onVerCardapio, onEscolher,
}: {
  /** «Bom dia», «Boa tarde» ou «Boa noite». */
  saudacao: string;
  primeiroNome: string;
  config: ConfigCantina;
  vitrine: SlideVitrine[];
  disponiveisAgora: number;
  onVerCardapio: () => void;
  onEscolher: (itemId: string) => void;
}) {
  const temVitrine = vitrine.length > 0;
  return (
    <motion.header
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-3xl border bg-card shadow-sm"
    >
      <div className="absolute -left-24 -top-28 w-80 h-80 rounded-full bg-primary/10 blur-3xl" aria-hidden />
      <div className="absolute left-1/3 -bottom-32 w-72 h-72 rounded-full bg-primary/5 blur-3xl" aria-hidden />

      <div className="relative grid gap-2 p-2.5 md:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] md:gap-3">
        {temVitrine && (
          <Vitrine
            slides={vitrine}
            onEscolher={onEscolher}
            className="order-first md:order-last aspect-[16/9] md:aspect-auto md:min-h-[260px]"
          />
        )}

        <div className={cn(
          'min-w-0 flex flex-col justify-center gap-3.5 px-3 pt-2 pb-3 sm:px-4 md:py-5 md:pl-5',
          !temVitrine && 'md:col-span-2',
        )}>
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <UtensilsCrossed className="h-4 w-4" />
            </span>
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Cantina</span>
          </div>

          <div className="space-y-1.5">
            <h1 className="text-2xl sm:text-[1.75rem] font-bold leading-tight tracking-tight text-foreground">
              {saudacao}{primeiroNome ? `, ${primeiroNome}` : ''}.
              <span className="block text-muted-foreground font-semibold">O que vai ser hoje?</span>
            </h1>
            <p className="max-w-md text-sm text-muted-foreground">
              Escolha no cardápio, marque o horário e é só passar para retirar. Sem fila, sem anotar nada.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onVerCardapio}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
            >
              Ver o cardápio <ArrowDown className="h-4 w-4" />
            </button>
            {config.aberta && disponiveisAgora > 0 && (
              <span className="text-sm text-muted-foreground">
                <strong className="font-semibold text-foreground">{disponiveisAgora}</strong>{' '}
                {disponiveisAgora === 1 ? 'item disponível' : 'itens disponíveis'} agora
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1',
              config.aberta
                ? 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/25 dark:text-emerald-300'
                : 'bg-rose-500/10 text-rose-700 ring-rose-500/25 dark:text-rose-300',
            )}>
              <span className={cn('w-2 h-2 rounded-full', config.aberta ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500')} />
              {config.aberta ? 'Aberta para pedidos' : 'Fechada no momento'}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
              <Clock className="w-3.5 h-3.5" /> Retiradas das {config.abre_as} às {config.fecha_as}
            </span>
          </div>

          {(config.aviso_titulo || config.aviso_texto) && (
            <div className="flex max-w-2xl gap-2.5 rounded-xl border bg-muted/40 px-3 py-2.5">
              <Megaphone className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div className="min-w-0 text-[13px] leading-snug">
                {config.aviso_titulo && <p className="font-semibold text-foreground">{config.aviso_titulo}</p>}
                {config.aviso_texto && <p className="mt-0.5 text-muted-foreground">{config.aviso_texto}</p>}
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.header>
  );
}

/**
 * CardItem — um item do cardápio.
 *
 * Três estados que a pessoa entende sem ler: disponível (botão +), no carrinho
 * (− quantidade +, com o card destacado) e fora do horário (cadeado e «a partir
 * de 13:30»). Item com sabor abre a escolha na hora do +.
 */
import { memo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Lock, Minus, Plus } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { formatarPreco, fotoDoItem, type ItemCantina, type JanelaItem } from '@/lib/cantina';
import { ImagemItem } from './visual';

const MAX_INGREDIENTES = 4;

export const CardItem = memo(function CardItem({
  item, janela, quantidade, onSomar, aberta,
}: {
  item: ItemCantina;
  janela: JanelaItem;
  /** Unidades no carrinho (todas as opções somadas). */
  quantidade: number;
  onSomar: (item: ItemCantina, opcao: string | null, delta: number) => void;
  /** A cantina está recebendo pedidos. */
  aberta: boolean;
}) {
  const [escolhendo, setEscolhendo] = useState(false);
  const disponivel = aberta && janela.estado === 'aberta';
  const temOpcoes = item.opcoes.length > 0;
  const noCarrinho = quantidade > 0;

  const ingredientes = item.ingredientes.slice(0, MAX_INGREDIENTES);
  const sobra = item.ingredientes.length - ingredientes.length;

  const botaoMais = (
    <motion.button
      type="button"
      whileTap={{ scale: 0.88 }}
      disabled={!disponivel}
      onClick={temOpcoes ? undefined : () => onSomar(item, null, 1)}
      aria-label={`Adicionar ${item.nome}`}
      className={cn(
        'h-10 inline-flex items-center justify-center rounded-xl font-semibold text-sm shadow-sm transition-colors',
        noCarrinho ? 'w-10 bg-primary text-primary-foreground' : 'px-4 gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90',
        'disabled:opacity-40 disabled:cursor-not-allowed',
      )}
    >
      <Plus className="w-4 h-4" />
      {!noCarrinho && 'Adicionar'}
    </motion.button>
  );

  return (
    <motion.article
      id={`item-${item.id}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={disponivel ? { y: -2 } : undefined}
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-2xl border bg-card shadow-sm transition-shadow',
        disponivel && 'hover:shadow-lg',
        noCarrinho && 'ring-2 ring-primary/60 border-transparent',
        !disponivel && 'opacity-[0.82]',
      )}
    >
      <div className="relative aspect-[16/10]">
        <ImagemItem categoria={item.categoria} foto={fotoDoItem(item)} nome={item.nome} className="absolute inset-0 w-full h-full" />
        <span className="absolute top-2 left-2 rounded-full bg-black/55 text-white text-[11px] font-semibold px-2 py-0.5 backdrop-blur-sm">
          #{item.codigo}
        </span>
        <AnimatePresence>
          {noCarrinho && (
            <motion.span
              key={quantidade}
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.4, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 22 }}
              className="absolute top-2 right-2 min-w-7 h-7 px-2 rounded-full bg-primary text-primary-foreground text-sm font-bold flex items-center justify-center shadow-md"
            >
              {quantidade}×
            </motion.span>
          )}
        </AnimatePresence>
        {janela.estado !== 'aberta' && (
          <div className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-gradient-to-t from-black/70 to-transparent px-3 pt-6 pb-2 text-white text-xs font-medium">
            <Lock className="w-3.5 h-3.5" />
            {janela.estado === 'antes' ? `Pedidos a partir das ${janela.abre}` : `Pedidos encerrados às ${janela.fechou}`}
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3.5">
        <div>
          <h3 className="font-semibold leading-tight text-foreground">{item.nome}</h3>
          {item.descricao && <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{item.descricao}</p>}
        </div>

        {ingredientes.length > 0 && (
          <ul className="flex flex-wrap gap-1" aria-label="Ingredientes">
            {ingredientes.map(i => (
              <li key={i} className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{i}</li>
            ))}
            {sobra > 0 && (
              <li className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground" title={item.ingredientes.slice(MAX_INGREDIENTES).join(', ')}>
                +{sobra}
              </li>
            )}
          </ul>
        )}
        {temOpcoes && (
          <p className="text-[11px] text-muted-foreground">{item.opcoes.join(' · ')}</p>
        )}

        <div className="mt-auto flex items-end justify-between gap-2 pt-1">
          <div>
            <p className="text-lg font-bold tracking-tight text-foreground">{formatarPreco(item.preco)}</p>
            {item.pedido_de && (
              <p className="text-[11px] text-muted-foreground">pedidos {item.pedido_de}–{item.pedido_ate}</p>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {noCarrinho && !temOpcoes && (
              <>
                <motion.button
                  type="button" whileTap={{ scale: 0.88 }}
                  onClick={() => onSomar(item, null, -1)}
                  aria-label={`Tirar um ${item.nome}`}
                  className="h-10 w-10 inline-flex items-center justify-center rounded-xl border bg-background hover:bg-accent"
                >
                  <Minus className="w-4 h-4" />
                </motion.button>
                <span className="w-6 text-center font-bold tabular-nums">{quantidade}</span>
              </>
            )}
            {temOpcoes ? (
              <Popover open={escolhendo} onOpenChange={setEscolhendo}>
                <PopoverTrigger asChild disabled={!disponivel}>{botaoMais}</PopoverTrigger>
                <PopoverContent align="end" className="w-56 p-2">
                  <p className="px-2 pb-1.5 text-xs font-semibold text-muted-foreground">Escolha o sabor</p>
                  <div className="grid gap-1">
                    {item.opcoes.map(o => (
                      <button
                        key={o} type="button"
                        onClick={() => { onSomar(item, o, 1); setEscolhendo(false); }}
                        className="flex items-center justify-between rounded-lg px-2.5 py-2 text-sm hover:bg-accent text-left"
                      >
                        {o}
                        <Plus className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            ) : botaoMais}
          </div>
        </div>
      </div>
    </motion.article>
  );
});

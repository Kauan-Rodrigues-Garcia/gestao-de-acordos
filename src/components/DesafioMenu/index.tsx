/**
 * DesafioMenu — o campo da campanha no menu lateral.
 *
 * ## Onde ele fica, e por quê
 *
 * Logo acima do Desempenho do Dia, e pelo mesmo motivo daquele: são as duas
 * coisas que a pessoa quer olhar de relance sem sair da tela em que está. A
 * diferença é que esta é uma IMAGEM — o GIF que quem montou a campanha
 * escolheu —, e uma imagem convida a clicar de um jeito que um ícone não.
 *
 * ## Os dois tamanhos
 *
 * Menu estendido: a mídia ocupa a largura toda, 4:3, com o nome da campanha
 * por baixo. Menu recolhido: vira um quadrado de 40 px, do tamanho dos ícones
 * dos outros itens, e o nome some. Não é a mesma imagem escalada — o
 * enquadramento muda de `cover` largo para quadrado, senão o recolhido
 * mostraria uma tira da imagem sem sentido.
 *
 * ## O que ele NÃO faz
 *
 * Não calcula ranking e não busca recebimento. Ele mostra a mídia e abre a
 * gaveta; quem faz a conta é o painel, e só quando alguém o abre. Um menu
 * lateral que carrega o quadro de uma campanha a cada render pagaria isso em
 * toda tela do sistema.
 */
import { AnimatePresence, motion } from 'framer-motion';
import { Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { estiloDaCampanha } from '@/pages/Analitico/Desafios/tema';
import type { Desafio } from '@/services/desafios/types';

export interface DesafioMenuProps {
  desafio: Desafio;
  /** O menu está estendido? Governa o tamanho da mídia. */
  expandido: boolean;
  aberto: boolean;
  onToggle: () => void;
}

export function DesafioMenu({ desafio, expandido, aberto, onToggle }: DesafioMenuProps) {
  const estilo = estiloDaCampanha(desafio.visual);
  const { Icone } = estilo;
  const temMidia = !!desafio.midiaUrl;

  return (
    <div className="px-2 pt-2">
      <button
        type="button"
        onClick={onToggle}
        title={desafio.nome}
        aria-pressed={aberto}
        className={cn(
          'group relative w-full overflow-hidden rounded-lg border transition-all duration-200',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          aberto ? estilo.borda : 'border-sidebar-border hover:border-sidebar-foreground/30',
          !temMidia && 'bg-sidebar-accent/40',
        )}
      >
        <div
          className={cn(
            'relative w-full overflow-hidden transition-all duration-200',
            // Recolhido: quadrado do tamanho da coluna de ícones. Estendido:
            // uma faixa 16:9, que é o formato em que um GIF de campanha vem.
            expandido ? 'aspect-[16/9]' : 'aspect-square',
          )}
        >
          {temMidia ? (
            <img
              src={desafio.midiaUrl ?? ''}
              alt={desafio.nome}
              className={cn(
                'h-full w-full transition-transform duration-300 group-hover:scale-105',
                desafio.visual.ajusteMidia === 'conter'
                  ? 'bg-sidebar-accent/40 object-contain'
                  : 'object-cover',
              )}
            />
          ) : (
            <div className={cn(
              'flex h-full w-full items-center justify-center bg-gradient-to-br',
              estilo.gradiente,
            )}>
              <Icone className={cn('h-5 w-5', estilo.destaque)} />
            </div>
          )}

          {/* Pulso discreto no canto: a campanha está no ar AGORA, e é isso que
              o campo anuncia. Some quando a gaveta já está aberta — aí a
              pessoa já está olhando. */}
          {!aberto && (
            <span className="absolute right-1.5 top-1.5 flex h-2 w-2">
              <span className={cn(
                'absolute inline-flex h-full w-full animate-ping rounded-full opacity-75',
                estilo.barra,
              )} />
              <span className={cn('relative inline-flex h-2 w-2 rounded-full', estilo.barra)} />
            </span>
          )}
        </div>

        <AnimatePresence initial={false}>
          {expandido && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden"
            >
              <div className="flex items-center gap-1.5 px-2.5 py-2 text-left">
                <Trophy className={cn('h-3.5 w-3.5 flex-shrink-0', estilo.destaque)} />
                <span className="truncate text-xs font-medium text-sidebar-foreground">
                  {desafio.nome}
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </button>
    </div>
  );
}

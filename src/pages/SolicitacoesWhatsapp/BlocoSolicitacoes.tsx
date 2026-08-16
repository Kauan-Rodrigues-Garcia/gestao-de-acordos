/**
 * BlocoSolicitacoes — uma das quatro seções da aba.
 *
 * O cabeçalho carrega o nome, a contagem e — só quando existe — quantos itens
 * ali dentro passaram do prazo. Blocos recolhíveis abrem e fecham por clique e
 * **não montam o conteúdo enquanto fechados**: os concluídos podem ser
 * centenas de cards, e montá-los para deixá-los escondidos era o custo que
 * pesava ao abrir a aba.
 *
 * Bloco sem nada dentro não aparece. Quem responde "quantos?" é a faixa de
 * contadores no topo da página, que mostra o zero sem gastar uma seção inteira
 * para dizê-lo.
 */
import { useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export function BlocoSolicitacoes({
  titulo, descricao, icone, total, atrasados = 0,
  recolhivel = false, abertoInicial = true, acao, children,
}: {
  titulo:    string;
  /** Uma linha explicando o critério do bloco. */
  descricao?: string;
  icone:     ReactNode;
  total:     number;
  /** Passaram dos 5 dias. Único número colorido do cabeçalho. */
  atrasados?: number;
  recolhivel?: boolean;
  abertoInicial?: boolean;
  /** Botão opcional no rodapé — hoje só o "ver histórico completo". */
  acao?:     ReactNode;
  /** Função, não nó: fechado, o conteúdo nem chega a ser montado. */
  children:  () => ReactNode;
}) {
  const [aberto, setAberto] = useState(abertoInicial);
  const mostra = !recolhivel || aberto;

  if (total === 0) return null;

  const cabecalho = (
    <div className="flex items-center gap-2 min-w-0 flex-1">
      <span className="shrink-0 text-muted-foreground">{icone}</span>
      <h2 className="text-sm font-semibold shrink-0">{titulo}</h2>
      <span className="text-xs font-semibold tabular-nums text-muted-foreground shrink-0">
        {total}
      </span>
      {atrasados > 0 && (
        <span
          className="shrink-0 rounded border border-destructive/40 bg-destructive/10 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-destructive"
          title="Passaram de 5 dias sem serem concluídos"
        >
          {atrasados} atrasado{atrasados > 1 ? 's' : ''}
        </span>
      )}
      {descricao && (
        <span className="hidden sm:block text-[11px] text-muted-foreground/70 truncate">
          {descricao}
        </span>
      )}
      <div className="flex-1 h-px bg-border/70 min-w-4" />
    </div>
  );

  return (
    <section className="space-y-2">
      {recolhivel ? (
        <button
          type="button"
          onClick={() => setAberto(v => !v)}
          aria-expanded={aberto}
          className="flex w-full items-center gap-2 rounded-lg -mx-1 px-1 py-1 text-left transition-colors hover:bg-accent/40"
        >
          {cabecalho}
          <ChevronDown className={cn(
            'w-4 h-4 shrink-0 text-muted-foreground transition-transform',
            aberto && 'rotate-180',
          )} />
        </button>
      ) : (
        <div className="flex items-center gap-2 px-1 py-1">{cabecalho}</div>
      )}

      <AnimatePresence initial={false}>
        {mostra && (
          <motion.div
            initial={recolhivel ? { height: 0, opacity: 0 } : false}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="space-y-2">
              {children()}
              {acao}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

/**
 * PainelComissao — a comissão do próprio operador, aberta pelo menu lateral.
 *
 * Mesmo molde do Desempenho do Dia: flutua por cima da página e fecha no `Esc`
 * ou no véu. A comissão é consultada no meio de outra tarefa — «quanto falta
 * para a 3ª?» —, e trocar de página para responder faria perder o lugar.
 *
 * O corpo é o `ConteudoComissao` da consulta da liderança, em uma coluna. Os
 * dados vêm de `useMinhaComissao`, que só busca com o painel aberto.
 *
 * `←` `→` trocam o mês. O mês que ainda não começou não existe como resposta.
 */
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CalendarDays, ChevronLeft, ChevronRight, Coins, RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMovimentoPreferido } from '@/hooks/useMovimentoPreferido';
import { formatBRL } from '@/lib/money';
import { deslocarMes, mesAtual } from '@/lib/mesReferencia';
import { cn } from '@/lib/utils';
import { mesPorExtenso } from '@/pages/Dashboard/Analitico/mensagemOperador';
import { useMinhaComissao } from '@/services/comissao/useMinhaComissao';
import { ConteudoComissao } from './ConteudoComissao';

interface PainelComissaoProps {
  aberto: boolean;
  onClose: () => void;
}

function Aviso({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}

export function PainelComissao({ aberto, onClose }: PainelComissaoProps) {
  const { semMovimento } = useMovimentoPreferido();
  const [mes, setMes] = useState(mesAtual);
  const dados = useMinhaComissao({ aberto, mes });

  const doMesAtual = mes >= mesAtual();

  const andar = useCallback((delta: number) => {
    setMes(atual => {
      const proximo = deslocarMes(atual, delta);
      return proximo > mesAtual() ? atual : proximo;
    });
  }, []);

  useEffect(() => {
    if (!aberto) return;

    function aoPressionar(e: KeyboardEvent) {
      const alvo = e.target as HTMLElement | null;
      const digitando = alvo?.tagName === 'INPUT' || alvo?.tagName === 'TEXTAREA' || alvo?.isContentEditable;
      if (e.key === 'Escape') { onClose(); return; }
      if (digitando) return;
      if (e.key === 'ArrowLeft')  { e.preventDefault(); andar(-1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); andar(1); }
    }

    window.addEventListener('keydown', aoPressionar);
    return () => window.removeEventListener('keydown', aoPressionar);
  }, [aberto, onClose, andar]);

  const r = dados.resultado;
  const subtitulo = [
    dados.isPaguePlay ? 'valores em H.O.' : null,
    r ? `realizado ${formatBRL(r.recebido)}` : null,
  ].filter(Boolean).join(' · ') || 'faixas e percentual do mês';

  let corpo: ReactNode = null;
  if (!dados.dbAtiva) {
    corpo = <Aviso>A comissão ainda não está disponível.</Aviso>;
  } else if (dados.erro) {
    corpo = <Aviso>Não foi possível carregar a comissão deste mês. Tente atualizar.</Aviso>;
  } else if (r) {
    corpo = <ConteudoComissao resultado={r} mesFechado={!doMesAtual} compacto />;
  } else if (dados.carregando) {
    corpo = (
      <div className="space-y-3" aria-hidden="true">
        <div className="h-[92px] animate-pulse rounded-xl bg-muted/30" />
        <div className="h-[64px] animate-pulse rounded-xl bg-muted/30" />
        <div className="h-[260px] animate-pulse rounded-xl bg-muted/30" />
      </div>
    );
  }

  return (
    <AnimatePresence>
      {aberto && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="veu-desfocado fixed inset-0 z-30 bg-black/25"
            onClick={onClose}
          />

          <motion.div
            role="dialog"
            aria-label="Minha comissão"
            initial={semMovimento ? { opacity: 0 } : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={semMovimento ? { opacity: 0 } : { opacity: 0, y: 10 }}
            transition={{ type: 'spring', stiffness: 400, damping: 34, mass: 0.7 }}
            style={{ willChange: 'transform, opacity' }}
            // Altura fixa pelo mesmo motivo do Desempenho do Dia: ancorado
            // embaixo, qualquer mudança de altura empurra o que se está lendo.
            className={cn(
              'fixed bottom-4 left-4 z-40 flex h-[620px] max-h-[85vh] w-[420px] max-w-[calc(100vw-2rem)]',
              'flex-col overflow-hidden rounded-2xl border border-border/80 bg-card shadow-xl',
            )}
          >
            {/* ── Cabeçalho ── */}
            <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10">
                  <Coins className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold leading-none">Minha comissão</p>
                  <p className="mt-1 truncate text-[11px] leading-none text-muted-foreground">{subtitulo}</p>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                <Button
                  variant="ghost" size="icon" className="h-7 w-7 rounded-lg"
                  onClick={dados.recarregar}
                  disabled={dados.carregando}
                  aria-label="Atualizar"
                  title="Atualizar"
                >
                  <RefreshCw className={cn('h-3.5 w-3.5 text-muted-foreground', dados.carregando && 'animate-spin')} />
                </Button>
                <Button
                  variant="ghost" size="icon" className="h-7 w-7 rounded-lg"
                  onClick={onClose}
                  aria-label="Fechar"
                  title="Fechar (Esc)"
                >
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </div>
            </header>

            {/* ── Mês ── */}
            <div className="flex shrink-0 items-center gap-2 border-b border-border/60 px-4 py-2.5">
              <Button
                variant="outline" size="icon" className="h-7 w-7 shrink-0 rounded-lg"
                onClick={() => andar(-1)}
                aria-label="Mês anterior"
                title="Mês anterior (←)"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <p className="flex-1 text-center text-sm font-medium tabular-nums" aria-live="polite">
                {mesPorExtenso(mes)}
              </p>
              <Button
                variant="outline" size="icon" className="h-7 w-7 shrink-0 rounded-lg"
                onClick={() => andar(1)}
                disabled={doMesAtual}
                aria-label="Próximo mês"
                title="Próximo mês (→)"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
              {!doMesAtual && (
                <Button
                  variant="outline" size="sm"
                  className="h-7 shrink-0 gap-1 rounded-lg border-emerald-500/30 px-2.5 text-xs text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-400"
                  onClick={() => setMes(mesAtual())}
                >
                  <CalendarDays className="h-3 w-3" aria-hidden="true" /> Mês atual
                </Button>
              )}
            </div>

            {/* ── Conteúdo ── */}
            <div className={cn(
              'flex-1 overflow-y-auto px-4 py-3.5 transition-opacity',
              dados.carregando && r && 'opacity-50',
            )}>
              {corpo}
            </div>

            <footer className="shrink-0 border-t border-border/60 px-4 py-1.5">
              <p className="text-center text-[10px] text-muted-foreground">
                <kbd className="rounded border border-border px-1">←</kbd>
                {' '}
                <kbd className="rounded border border-border px-1">→</kbd>
                {' muda o mês · '}
                <kbd className="rounded border border-border px-1">Esc</kbd>
                {' fecha'}
              </p>
            </footer>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

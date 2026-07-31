/**
 * src/components/NotificacaoToast.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Card temporário no canto superior direito quando chega notificação nova.
 *
 * Complementa o sino, não substitui: o sino guarda, o card avisa na hora. A
 * barra embaixo cresce enquanto o tempo corre — é o relógio visual do card.
 *
 * **Uma de cada vez.** Duas notificações juntas viram fila: a segunda só aparece
 * quando a primeira sai. Empilhar cards cobriria a tela e o usuário não leria
 * nenhum.
 *
 * Só mostra o que chega DEPOIS da montagem. As que já estavam na lista ao abrir
 * o app são histórico — despejá-las na tela a cada F5 seria ruído.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, X } from 'lucide-react';
import type { Notificacao } from '@/lib/supabase';
import { useNotificacoes } from '@/providers/NotificacoesProvider';
import { useTenant } from '@/lib/tenant-config';
import { rotaDaNotificacao } from '@/lib/notificacoes-rota';
import { tocarSomNotificacao } from '@/lib/som-notificacao';
import { cn } from '@/lib/utils';

/** Quanto tempo cada card fica na tela. */
export const DURACAO_TOAST_MS = 2_000;

export function NotificacaoToast() {
  const { notificacoes, marcarLida } = useNotificacoes();
  const navigate = useNavigate();
  const tenant   = useTenant();

  const [fila, setFila]     = useState<Notificacao[]>([]);
  const [atual, setAtual]   = useState<Notificacao | null>(null);

  /**
   * Ids já vistos. Começa `null` para distinguir "ainda não sei o que existia"
   * de "não existia nada" — sem isso, a primeira carga entraria toda na fila.
   */
  const vistosRef = useRef<Set<string> | null>(null);
  const timerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Detecta o que chegou depois de montar ─────────────────────────────────
  useEffect(() => {
    if (vistosRef.current === null) {
      vistosRef.current = new Set(notificacoes.map(n => n.id));
      return;
    }
    const vistos = vistosRef.current;
    const novas = notificacoes.filter(n => !vistos.has(n.id) && !n.lida);
    for (const n of notificacoes) vistos.add(n.id);
    if (novas.length) {
      // A lista vem da mais nova para a mais antiga; a fila mostra na ordem em
      // que chegaram.
      setFila(prev => [...prev, ...[...novas].reverse()]);
    }
  }, [notificacoes]);

  // ── Puxa da fila quando a tela está livre ─────────────────────────────────
  useEffect(() => {
    if (atual || fila.length === 0) return;
    setAtual(fila[0]);
    setFila(prev => prev.slice(1));
  }, [atual, fila]);

  // ── Relógio do card ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!atual) return;
    // Um som por card, não por notificação: a fila garante que duas chegando
    // juntas toquem separadas, em vez de virar um estalo só.
    tocarSomNotificacao();
    timerRef.current = setTimeout(() => setAtual(null), DURACAO_TOAST_MS);
    return () => {
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    };
  }, [atual]);

  function fechar() {
    setAtual(null);
  }

  function abrir() {
    if (!atual) return;
    const destino = rotaDaNotificacao(atual, tenant.isPaguePlay);
    if (!atual.lida) void marcarLida(atual.id);
    setAtual(null);
    if (destino) navigate(destino);
  }

  return (
    <div
      className="fixed top-4 right-4 z-[100] w-[min(22rem,calc(100vw-2rem))] pointer-events-none"
      aria-live="polite"
    >
      <AnimatePresence mode="wait">
        {atual && (
          <motion.div
            key={atual.id}
            initial={{ opacity: 0, x: 40, scale: 0.96 }}
            animate={{ opacity: 1, x: 0,  scale: 1 }}
            exit={{    opacity: 0, x: 40, scale: 0.96 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className={cn(
              'pointer-events-auto rounded-xl border border-border bg-card shadow-lg',
              'overflow-hidden cursor-pointer',
            )}
            onClick={abrir}
            role="button"
            tabIndex={0}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(); } }}
          >
            <div className="flex items-start gap-2.5 p-3">
              <span className="mt-0.5 shrink-0 rounded-lg bg-primary/10 p-1.5">
                <Bell className="w-3.5 h-3.5 text-primary" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold leading-tight truncate">
                  {atual.titulo}
                </p>
                <p className="text-[12px] text-muted-foreground leading-snug mt-0.5 line-clamp-2">
                  {atual.mensagem}
                </p>
              </div>
              <button
                type="button"
                // `stopPropagation`: fechar não pode navegar junto.
                onClick={e => { e.stopPropagation(); fechar(); }}
                className="shrink-0 text-muted-foreground hover:text-foreground -mt-0.5 -mr-0.5 p-0.5"
                aria-label="Fechar aviso"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Relógio visual: cresce de 0 a 100% no tempo de vida do card. */}
            <div className="h-1 bg-muted">
              <motion.div
                className="h-full bg-primary"
                initial={{ width: '0%' }}
                animate={{ width: '100%' }}
                transition={{ duration: DURACAO_TOAST_MS / 1000, ease: 'linear' }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

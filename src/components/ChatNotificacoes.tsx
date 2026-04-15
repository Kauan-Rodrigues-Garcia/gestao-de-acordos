/**
 * ChatNotificacoes.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Botão flutuante de notificações no canto inferior direito da tela.
 * Ao clicar, abre uma janela estilo chat exibindo as notificações não lidas.
 * Atualiza em tempo real via Supabase Realtime.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageCircle, X, Check, CheckCheck, Trash2, Bell, ArrowRight,
  AlertTriangle, Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase, Notificacao } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

// ── Helpers ────────────────────────────────────────────────────────────────

function tempoRelativo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min  = Math.floor(diff / 60_000);
  const h    = Math.floor(diff / 3_600_000);
  const d    = Math.floor(diff / 86_400_000);
  if (min < 1)  return 'agora';
  if (min < 60) return `${min}min`;
  if (h < 24)   return `${h}h`;
  return `${d}d`;
}

function iconeNotificacao(titulo: string) {
  const t = titulo.toLowerCase();
  if (t.includes('⚠️') || t.includes('transfer') || t.includes('nr')) {
    return <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />;
  }
  if (t.includes('exclu') || t.includes('lixeira')) {
    return <Trash2 className="w-4 h-4 text-destructive shrink-0 mt-0.5" />;
  }
  return <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />;
}

// ── Componente principal ──────────────────────────────────────────────────

export function ChatNotificacoes() {
  const { user } = useAuth();
  const [aberto, setAberto]             = useState(false);
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([]);
  const [loading, setLoading]           = useState(false);
  const [animarBadge, setAnimarBadge]   = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const naoLidas = notificacoes.filter(n => !n.lida).length;

  // ── Carregar notificações ─────────────────────────────────────────────
  const carregar = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from('notificacoes')
        .select('*')
        .eq('usuario_id', user.id)
        .order('criado_em', { ascending: false })
        .limit(50);
      setNotificacoes((data as Notificacao[]) || []);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { carregar(); }, [carregar]);

  // ── Realtime: escuta INSERT em notificacoes para este usuário ──────────
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`chat-notif-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notificacoes',
          filter: `usuario_id=eq.${user.id}`,
        },
        (payload) => {
          const nova = payload.new as Notificacao;
          setNotificacoes(prev => [nova, ...prev]);
          // Animação do badge
          setAnimarBadge(true);
          setTimeout(() => setAnimarBadge(false), 1000);
          // Som / vibração (best-effort)
          try { navigator.vibrate?.([50, 30, 50]); } catch {}
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notificacoes',
          filter: `usuario_id=eq.${user.id}`,
        },
        (payload) => {
          const atualizada = payload.new as Notificacao;
          setNotificacoes(prev =>
            prev.map(n => n.id === atualizada.id ? atualizada : n)
          );
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  // ── Fechar ao clicar fora ─────────────────────────────────────────────
  useEffect(() => {
    if (!aberto) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setAberto(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [aberto]);

  // ── Ações ─────────────────────────────────────────────────────────────
  async function marcarLida(id: string) {
    setNotificacoes(prev => prev.map(n => n.id === id ? { ...n, lida: true } : n));
    await supabase.from('notificacoes').update({ lida: true }).eq('id', id);
  }

  async function marcarTodasLidas() {
    if (!user?.id) return;
    setNotificacoes(prev => prev.map(n => ({ ...n, lida: true })));
    await supabase.from('notificacoes').update({ lida: true })
      .eq('usuario_id', user.id).eq('lida', false);
  }

  async function excluirNotificacao(id: string) {
    setNotificacoes(prev => prev.filter(n => n.id !== id));
    await supabase.from('notificacoes').delete().eq('id', id);
  }

  async function limparTodas() {
    if (!user?.id) return;
    setNotificacoes([]);
    await supabase.from('notificacoes').delete().eq('usuario_id', user.id);
  }

  if (!user) return null;

  return (
    <div ref={containerRef} className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-2">

      {/* ── Janela de chat ── */}
      <AnimatePresence>
        {aberto && (
          <motion.div
            key="chat-window"
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            className="w-[340px] sm:w-[380px] bg-card border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col"
            style={{ maxHeight: '520px' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-primary" />
                <p className="text-sm font-semibold text-foreground">Notificações</p>
                {naoLidas > 0 && (
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
                    {naoLidas > 99 ? '99+' : naoLidas}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {naoLidas > 0 && (
                  <Button
                    variant="ghost" size="sm"
                    className="h-7 text-xs px-2 text-muted-foreground hover:text-foreground gap-1"
                    onClick={marcarTodasLidas}
                    title="Marcar todas como lidas"
                  >
                    <CheckCheck className="w-3.5 h-3.5" /> Lidas
                  </Button>
                )}
                {notificacoes.length > 0 && (
                  <Button
                    variant="ghost" size="icon"
                    className="w-7 h-7 text-muted-foreground hover:text-destructive"
                    onClick={limparTodas}
                    title="Limpar todas"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}
                <Button
                  variant="ghost" size="icon"
                  className="w-7 h-7"
                  onClick={() => setAberto(false)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Lista */}
            <ScrollArea className="flex-1 overflow-y-auto">
              {loading && notificacoes.length === 0 ? (
                <div className="flex items-center justify-center py-10 text-muted-foreground text-sm">
                  Carregando...
                </div>
              ) : notificacoes.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
                  <Bell className="w-8 h-8 opacity-20" />
                  <p className="text-sm">Nenhuma notificação</p>
                </div>
              ) : (
                <div className="divide-y divide-border/60">
                  {notificacoes.map(n => (
                    <motion.div
                      key={n.id}
                      layout
                      initial={{ opacity: 0, x: 12 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -12 }}
                      className={cn(
                        'group flex gap-2.5 px-4 py-3 hover:bg-accent/40 transition-colors cursor-pointer',
                        !n.lida && 'bg-primary/5 border-l-2 border-l-primary/60'
                      )}
                      onClick={() => { if (!n.lida) marcarLida(n.id); }}
                    >
                      {/* Ícone contextual */}
                      {iconeNotificacao(n.titulo)}

                      {/* Conteúdo */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-1">
                          <p className={cn(
                            'text-xs font-semibold leading-snug',
                            !n.lida ? 'text-foreground' : 'text-muted-foreground'
                          )}>
                            {n.titulo}
                          </p>
                          <span className="text-[10px] text-muted-foreground/60 shrink-0 mt-0.5">
                            {tempoRelativo(n.criado_em)}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground/80 mt-0.5 leading-snug line-clamp-3">
                          {n.mensagem}
                        </p>
                        {!n.lida && (
                          <div className="flex items-center gap-1 mt-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary/70" />
                            <span className="text-[10px] text-primary/70 font-medium">Não lida</span>
                          </div>
                        )}
                      </div>

                      {/* Ações rápidas (visíveis ao hover) */}
                      <div className="flex flex-col items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        {!n.lida && (
                          <button
                            className="w-5 h-5 rounded-full hover:bg-primary/20 flex items-center justify-center text-primary/60 hover:text-primary transition-colors"
                            title="Marcar como lida"
                            onClick={e => { e.stopPropagation(); marcarLida(n.id); }}
                          >
                            <Check className="w-3 h-3" />
                          </button>
                        )}
                        <button
                          className="w-5 h-5 rounded-full hover:bg-destructive/10 flex items-center justify-center text-muted-foreground/50 hover:text-destructive transition-colors"
                          title="Excluir"
                          onClick={e => { e.stopPropagation(); excluirNotificacao(n.id); }}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </ScrollArea>

            {/* Rodapé */}
            {notificacoes.length > 0 && (
              <div className="px-4 py-2 border-t border-border bg-muted/20 flex items-center justify-between">
                <p className="text-[11px] text-muted-foreground">
                  {notificacoes.length} notificação{notificacoes.length !== 1 ? 'ões' : ''}
                  {naoLidas > 0 && ` · ${naoLidas} não lida${naoLidas !== 1 ? 's' : ''}`}
                </p>
                {naoLidas > 0 && (
                  <button
                    className="text-[11px] text-primary hover:underline flex items-center gap-0.5"
                    onClick={marcarTodasLidas}
                  >
                    Marcar todas <ArrowRight className="w-3 h-3" />
                  </button>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Botão flutuante ── */}
      <motion.button
        whileHover={{ scale: 1.07 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => { setAberto(v => !v); if (!aberto) carregar(); }}
        className={cn(
          'relative w-14 h-14 rounded-full shadow-xl flex items-center justify-center transition-colors',
          aberto
            ? 'bg-primary text-primary-foreground'
            : 'bg-card border-2 border-border text-foreground hover:bg-primary hover:text-primary-foreground hover:border-primary'
        )}
        aria-label="Notificações"
      >
        {aberto ? (
          <X className="w-6 h-6" />
        ) : (
          <MessageCircle className="w-6 h-6" />
        )}

        {/* Badge de não lidas */}
        <AnimatePresence>
          {naoLidas > 0 && !aberto && (
            <motion.span
              key="badge"
              initial={{ scale: 0 }}
              animate={{ scale: animarBadge ? [1, 1.35, 1] : 1 }}
              exit={{ scale: 0 }}
              transition={{ duration: animarBadge ? 0.4 : 0.15 }}
              className="absolute -top-1 -right-1 min-w-[22px] h-[22px] bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full flex items-center justify-center px-1 shadow-md border-2 border-background"
            >
              {naoLidas > 99 ? '99+' : naoLidas}
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>
    </div>
  );
}

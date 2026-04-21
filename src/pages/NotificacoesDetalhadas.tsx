/**
 * NotificacoesDetalhadas.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Página dedicada de "Notificações Detalhadas": lista as notificações
 * dos últimos 5 dias do usuário atual, agrupadas por dia.
 *
 * Acessível pelo menu principal em /notificacoes.
 */
import { useEffect, useMemo, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Bell, Check, CheckCheck, X, History, Clock, CheckCircle2,
  AlertTriangle, Info, Trash2, Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  if (min < 60) return `${min} min`;
  if (h < 24)   return `${h}h`;
  if (d < 7)    return `${d}d`;
  return new Date(iso).toLocaleDateString('pt-BR');
}

function dataFormatada(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function iconeNotificacao(titulo: string, className = 'w-4 h-4') {
  const t = titulo.toLowerCase();
  if (t.includes('⚠') || t.includes('aviso') || t.includes('atenção') || t.includes('transferido') || t.includes('removido'))
    return <AlertTriangle className={cn('text-yellow-600 shrink-0', className)} />;
  if (t.includes('extra') || t.includes('direto') || t.includes('vinculo') || t.includes('vínculo'))
    return <History className={cn('text-primary shrink-0', className)} />;
  return <Info className={cn('text-primary shrink-0', className)} />;
}

// ── Componente ────────────────────────────────────────────────────────────

export default function NotificacoesDetalhadas() {
  const { user } = useAuth();
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([]);
  const [loading, setLoading] = useState(false);
  const [filtro, setFiltro] = useState('');
  const [erroCarregar, setErroCarregar] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setErroCarregar(null);
    try {
      // Carregar últimas 200 notificações dos últimos 5 dias
      const cincoDiasAtras = new Date(Date.now() - 5 * 86_400_000).toISOString();
      const { data, error } = await supabase
        .from('notificacoes')
        .select('*')
        .eq('usuario_id', user.id)
        .gte('criado_em', cincoDiasAtras)
        .order('criado_em', { ascending: false })
        .limit(500);
      if (error) {
        console.error('[NotificacoesDetalhadas] erro ao carregar', error);
        setErroCarregar('Erro ao carregar notificações — tente novamente.');
      } else if (data) {
        setNotificacoes(data as Notificacao[]);
      }
    } catch (e) {
      console.error('[NotificacoesDetalhadas] erro ao carregar', e);
      setErroCarregar('Erro ao carregar notificações — tente novamente.');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { carregar(); }, [carregar]);

  // Realtime
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`notif-detalhadas-${user.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'notificacoes', filter: `usuario_id=eq.${user.id}` },
        () => { carregar(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, carregar]);

  // Filtro textual
  const filtradas = useMemo(() => {
    if (!filtro.trim()) return notificacoes;
    const q = filtro.trim().toLowerCase();
    return notificacoes.filter(n =>
      n.titulo.toLowerCase().includes(q) ||
      n.mensagem.toLowerCase().includes(q)
    );
  }, [notificacoes, filtro]);

  // Agrupamento por dia
  const grupos = useMemo(() => {
    const mapa = new Map<string, Notificacao[]>();
    filtradas.forEach(n => {
      const d = new Date(n.criado_em);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const arr = mapa.get(key) ?? [];
      arr.push(n);
      mapa.set(key, arr);
    });
    mapa.forEach(arr => arr.sort((a, b) => new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime()));
    return Array.from(mapa.entries()).sort(([a], [b]) => (a < b ? 1 : -1));
  }, [filtradas]);

  const naoLidas = filtradas.filter(n => !n.lida).length;

  async function marcarLida(id: string) {
    await supabase.from('notificacoes').update({ lida: true }).eq('id', id);
  }
  async function marcarTodasLidas() {
    if (!user?.id) return;
    await supabase.from('notificacoes').update({ lida: true })
      .eq('usuario_id', user.id).eq('lida', false);
  }
  async function excluirNotificacao(id: string) {
    await supabase.from('notificacoes').delete().eq('id', id);
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="px-6 py-5 border-b border-border bg-gradient-to-r from-primary/5 via-background to-background">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
                Notificações Detalhadas
              </h1>
              <p className="text-sm text-muted-foreground">
                Últimos 5 dias {naoLidas > 0 && <span className="text-primary font-medium">· {naoLidas} não lida{naoLidas !== 1 ? 's' : ''}</span>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {naoLidas > 0 && (
              <Button variant="outline" size="sm" className="gap-1.5" onClick={marcarTodasLidas}>
                <CheckCheck className="w-4 h-4" /> Marcar todas lidas
              </Button>
            )}
            <Button variant="ghost" size="sm" className="gap-1.5" onClick={carregar} title="Atualizar">
              <Bell className="w-4 h-4" /> Atualizar
            </Button>
          </div>
        </div>

        {/* Filtro de pesquisa */}
        <div className="mt-4 relative max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/60" />
          <Input
            placeholder="Pesquisar por título ou mensagem..."
            value={filtro}
            onChange={e => setFiltro(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>
      </div>

      {/* Conteúdo */}
      <ScrollArea className="flex-1 min-h-0 overflow-y-auto">
        {loading && filtradas.length === 0 ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">
            Carregando notificações...
          </div>
        ) : filtradas.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
            <History className="w-12 h-12 opacity-20" />
            <p className="text-sm">
              {filtro ? 'Nenhuma notificação corresponde à busca.' : 'Sem notificações nos últimos 5 dias.'}
            </p>
          </div>
        ) : (
          <div className="flex flex-col px-2 md:px-6 py-4 gap-6">
            {grupos.map(([diaKey, itens]) => {
              const [ano, mes, dia] = diaKey.split('-');
              const dataObj = new Date(Number(ano), Number(mes) - 1, Number(dia));
              const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
              const diffDias = Math.round((hoje.getTime() - dataObj.getTime()) / 86_400_000);
              const labelDia =
                diffDias === 0 ? 'Hoje' :
                diffDias === 1 ? 'Ontem' :
                dataObj.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' });
              const naoLidasDia = itens.filter(n => !n.lida).length;

              return (
                <section key={diaKey} className="rounded-xl border border-border bg-card/30 overflow-hidden">
                  <header className="px-4 py-2.5 bg-muted/30 border-b border-border flex items-center gap-2 sticky top-0 z-[1] backdrop-blur-sm">
                    <Clock className="w-3.5 h-3.5 text-primary" />
                    <span className="text-sm font-semibold text-foreground capitalize">{labelDia}</span>
                    <span className="text-xs text-muted-foreground">({itens.length})</span>
                    {naoLidasDia > 0 && (
                      <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                        {naoLidasDia} não lida{naoLidasDia !== 1 ? 's' : ''}
                      </span>
                    )}
                  </header>
                  <div className="divide-y divide-border/60">
                    {itens.map(n => (
                      <motion.div
                        key={n.id}
                        layout
                        initial={{ opacity: 0, x: 8 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -8 }}
                        className={cn(
                          'group flex gap-3 px-4 py-3 hover:bg-accent/30 transition-colors',
                          !n.lida && 'bg-primary/5 border-l-2 border-l-primary/60'
                        )}
                      >
                        {iconeNotificacao(n.titulo)}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className={cn(
                              'text-sm font-semibold leading-snug',
                              !n.lida ? 'text-foreground' : 'text-muted-foreground',
                            )}>{n.titulo}</p>
                            <span className="text-[10px] text-muted-foreground/70 shrink-0 mt-0.5 font-mono">
                              {dataFormatada(n.criado_em).split(' ')[1]}
                            </span>
                          </div>
                          <p className="text-xs text-foreground/75 mt-1 leading-relaxed whitespace-pre-line">
                            {n.mensagem}
                          </p>
                          <div className="flex items-center gap-2 mt-2">
                            {!n.lida ? (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-medium">
                                <span className="w-1.5 h-1.5 rounded-full bg-primary" /> Não lida
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/70">
                                <CheckCircle2 className="w-3 h-3" /> Lida
                              </span>
                            )}
                            <span className="text-[10px] text-muted-foreground/60">{tempoRelativo(n.criado_em)}</span>
                          </div>
                        </div>
                        <div className="flex flex-col items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          {!n.lida && (
                            <button
                              className="w-7 h-7 rounded-full hover:bg-primary/20 flex items-center justify-center text-primary/70 hover:text-primary transition-colors"
                              title="Marcar como lida"
                              onClick={() => marcarLida(n.id)}
                            >
                              <Check className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            className="w-7 h-7 rounded-full hover:bg-destructive/10 flex items-center justify-center text-muted-foreground/50 hover:text-destructive transition-colors"
                            title="Excluir"
                            onClick={() => excluirNotificacao(n.id)}
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </ScrollArea>

      {/* rodapé */}
      <div className="px-6 py-2 border-t border-border bg-muted/20 flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {filtradas.length} notificação{filtradas.length !== 1 ? 'ões' : ''} nos últimos 5 dias
        </span>
        {filtradas.length > 0 && (
          <button
            className="text-destructive/70 hover:text-destructive flex items-center gap-1"
            onClick={async () => {
              if (!user?.id) return;
              if (!confirm('Limpar TODAS as notificações?')) return;
              await supabase.from('notificacoes').delete().eq('usuario_id', user.id);
              carregar();
            }}
          >
            <Trash2 className="w-3.5 h-3.5" /> Limpar todas
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * ChatNotificacoes.tsx — o painel de notificações.
 * ─────────────────────────────────────────────────────────────────────────────
 * Ancorado abaixo do cabeçalho, à direita. Quem abre e fecha é o sino do header
 * (Layout.tsx), que dispara um clique no gatilho oculto `[data-notif-trigger]`
 * desta janela — contrato antigo, mantido.
 *
 * ── O que mudou na 2.0 (11/08/2026) ─────────────────────────────────────────
 *
 *   CATEGORIA EM VEZ DE PALPITE. O ícone saía de um `if` com três casos sobre o
 *   texto do título, dentro deste arquivo. Agora vem de `notificacoes-tipo.ts`,
 *   que classifica em sete categorias, tem teste com o inventário de TODOS os
 *   produtores do projeto e é lido também pelo card temporário — os dois passam
 *   a falar a mesma língua.
 *
 *   FILTROS. Chips de "Não lidas" e por categoria. Os chips saem das
 *   notificações que a pessoa TEM, não de uma tabela fixa: quem está na
 *   PaguePlay nunca recebe notificação do Pix automático, então o chip nem
 *   aparece. É assim que a diferença entre os dois tenants se resolve sem uma
 *   lista para alguém esquecer de atualizar.
 *
 *   AGRUPAMENTO POR DIA. Hoje, Ontem, Últimos 7 dias, Mais antigas. Uma lista
 *   corrida de 30 itens com "3d atrás" em cada linha não deixa ninguém achar o
 *   que chegou de manhã.
 *
 *   TETO DE 30 QUE ESCONDIA COISA. A lista mostrava `slice(0, 30)` sem dizer, e
 *   o rodapé anunciava o total — quem tinha 45 via "45 notificações" e só
 *   alcançava 30. Agora há botão para carregar mais.
 *
 *   SOM. Botão para ligar/desligar, com a escolha guardada. Som que não se pode
 *   desligar acaba desligado no volume da máquina, e aí a pessoa perde também o
 *   telefone.
 */
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  X, Check, CheckCheck, Trash2, Bell, BellOff, ArrowLeft,
  Clock, CheckCircle2, ExternalLink, Maximize2, Minimize2, Volume2, VolumeX,
  Inbox,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { Notificacao } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useNotificacoes } from '@/providers/NotificacoesProvider';
import { useTenant } from '@/lib/tenant-config';
import { rotaDaNotificacao } from '@/lib/notificacoes-rota';
import {
  tipoDaNotificacao, categoriasPresentes, grupoDaData, tempoRelativo,
  CATEGORIA_LABEL, GRUPO_LABEL, URGENCIA_BARRA,
  type CategoriaNotificacao, type GrupoData,
} from '@/lib/notificacoes-tipo';
import { IconeCategoria } from '@/components/notificacoes/IconeCategoria';
import { somAtivo, definirSomAtivo, tocarSomNotificacao } from '@/lib/som-notificacao';
import { cn } from '@/lib/utils';

// ── Helpers ────────────────────────────────────────────────────────────────

function dataFormatada(iso: string): string {
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

/** Quantas linhas por vez. Ver "TETO DE 30" no cabeçalho. */
const PAGINA = 30;

/** Filtro ativo: tudo, só as não lidas, ou uma categoria. */
type Filtro = 'todas' | 'nao_lidas' | CategoriaNotificacao;

const ORDEM_GRUPOS: GrupoData[] = ['hoje', 'ontem', 'semana', 'anteriores'];

// ── Modal de detalhe ──────────────────────────────────────────────────────

interface ModalDetalheProps {
  notificacao: Notificacao;
  onClose: () => void;
  onMarcarLida: (id: string) => Promise<void>;
  onExcluir: (id: string) => Promise<void>;
  onNavigate?: () => void;
}

export function ModalDetalhe({
  notificacao: n, onClose, onMarcarLida, onExcluir, onNavigate,
}: ModalDetalheProps) {
  const tipo = tipoDaNotificacao(n);

  return (
    <motion.div
      key="modal-detalhe"
      initial={{ opacity: 0, y: 10, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 340, damping: 30 }}
      className="absolute inset-0 z-10 flex flex-col bg-card rounded-2xl overflow-hidden"
    >
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border bg-muted/30 shrink-0">
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-full hover:bg-accent flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Voltar para a lista"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <p className="text-xs font-semibold text-foreground truncate flex-1">
          {CATEGORIA_LABEL[tipo.categoria]}
        </p>
        {!n.lida && <span className="w-2 h-2 rounded-full bg-primary shrink-0" />}
      </div>

      <ScrollArea className="flex-1 overflow-y-auto">
        <div className="px-4 py-4 space-y-4">
          <div className="flex items-start gap-3">
            <IconeCategoria categoria={tipo.categoria} />
            <h3 className="text-sm font-semibold text-foreground leading-snug pt-1.5">
              {n.titulo}
            </h3>
          </div>

          {/* Mensagem completa — sem line-clamp. É o que o painel não mostra. */}
          <div className="bg-muted/40 rounded-xl px-3.5 py-3 border border-border/50">
            <p className="text-[12.5px] text-foreground/90 leading-relaxed whitespace-pre-wrap">
              {n.mensagem}
            </p>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <Clock className="w-3.5 h-3.5 shrink-0" />
              <span>{dataFormatada(n.criado_em)}</span>
              <span className="text-muted-foreground/50">·</span>
              <span>{tempoRelativo(n.criado_em)}</span>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span>{n.lida ? 'Lida' : 'Não lida'}</span>
            </div>
          </div>
        </div>
      </ScrollArea>

      <div className="px-4 py-3 border-t border-border bg-muted/20 flex items-center gap-2 shrink-0 flex-wrap">
        {onNavigate && (
          <Button size="sm" variant="default" className="flex-1 h-8 text-xs gap-1.5" onClick={onNavigate}>
            <ExternalLink className="w-3.5 h-3.5" /> Ver acordo
          </Button>
        )}
        {!n.lida && (
          <Button
            size="sm" variant="outline" className="flex-1 h-8 text-xs gap-1.5"
            onClick={async () => { await onMarcarLida(n.id); onClose(); }}
          >
            <Check className="w-3.5 h-3.5" /> Marcar como lida
          </Button>
        )}
        <Button
          size="sm" variant="ghost"
          className="h-8 text-xs px-3 text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5"
          onClick={async () => { await onExcluir(n.id); onClose(); }}
        >
          <Trash2 className="w-3.5 h-3.5" /> Excluir
        </Button>
      </div>
    </motion.div>
  );
}

// ── Uma linha da lista ────────────────────────────────────────────────────

function LinhaNotificacao({
  n, onAbrir, onMarcarLida, onExcluir,
}: {
  n: Notificacao;
  onAbrir: (n: Notificacao) => void;
  onMarcarLida: (id: string) => void;
  onExcluir: (id: string) => void;
}) {
  const tipo = tipoDaNotificacao(n);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -16 }}
      transition={{ duration: 0.16 }}
      className={cn(
        'group relative flex gap-3 px-4 py-3 cursor-pointer select-none',
        'hover:bg-accent/40 transition-colors',
        !n.lida && 'bg-primary/[0.04]',
      )}
      onClick={() => onAbrir(n)}
    >
      {/* Barra de urgência só no que ainda não foi lido: depois de lida, a
          notificação é histórico e não precisa mais gritar. */}
      {!n.lida && (
        <span className={cn('absolute left-0 top-0 bottom-0 w-[3px]', URGENCIA_BARRA[tipo.urgencia])} />
      )}

      <IconeCategoria categoria={tipo.categoria} tamanho="sm" className="mt-0.5" />

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className={cn(
            'text-xs leading-snug line-clamp-1',
            n.lida ? 'font-medium text-muted-foreground' : 'font-semibold text-foreground',
          )}>
            {n.titulo}
          </p>
          <span className="text-[10px] text-muted-foreground/70 shrink-0 tabular-nums mt-0.5">
            {tempoRelativo(n.criado_em)}
          </span>
        </div>

        <p className="text-[11px] text-muted-foreground/85 mt-1 leading-snug line-clamp-2">
          {n.mensagem}
        </p>

        <div className="flex items-center gap-2 mt-1.5">
          <span className="text-[10px] text-muted-foreground/60">
            {CATEGORIA_LABEL[tipo.categoria]}
          </span>
          {!n.lida && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-primary">
              <span className="w-1.5 h-1.5 rounded-full bg-primary" /> Nova
            </span>
          )}
        </div>
      </div>

      {/* Ações: aparecem no hover e também no foco por teclado — sem o
          `focus-within` elas seriam inalcançáveis sem mouse. */}
      <div className="flex flex-col items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
        {!n.lida && (
          <button
            className="w-6 h-6 rounded-md hover:bg-primary/15 flex items-center justify-center text-primary/70 hover:text-primary transition-colors"
            title="Marcar como lida"
            aria-label={`Marcar como lida: ${n.titulo}`}
            onClick={e => { e.stopPropagation(); onMarcarLida(n.id); }}
          >
            <Check className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          className="w-6 h-6 rounded-md hover:bg-destructive/10 flex items-center justify-center text-muted-foreground/50 hover:text-destructive transition-colors"
          title="Excluir"
          aria-label={`Excluir: ${n.titulo}`}
          onClick={e => { e.stopPropagation(); onExcluir(n.id); }}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </motion.div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────

export function ChatNotificacoes() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const tenant   = useTenant();

  const [aberto, setAberto]       = useState(false);
  const [expandido, setExpandido] = useState(false);
  const [detalhe, setDetalhe]     = useState<Notificacao | null>(null);
  const [filtro, setFiltro]       = useState<Filtro>('todas');
  const [limite, setLimite]       = useState(PAGINA);
  const [comSom, setComSom]       = useState(() => somAtivo());
  const containerRef = useRef<HTMLDivElement>(null);

  // Lista, contagem e canal vêm do NotificacoesProvider — este componente e o
  // sino do header leem o MESMO estado, então não podem divergir.
  const {
    notificacoes, naoLidas, loading, refresh,
    marcarLida, marcarTodasLidas, excluir, limparTodas: limparTodasNoProvider,
  } = useNotificacoes();

  // O modal de detalhe guarda uma cópia; segue a lista para não exibir dado
  // velho (ou continuar aberto depois de a notificação ser apagada).
  useEffect(() => {
    setDetalhe(atual => {
      if (!atual) return atual;
      const naLista = notificacoes.find(n => n.id === atual.id);
      if (!naLista)          return null;
      if (naLista === atual) return atual;
      return naLista;
    });
  }, [notificacoes]);

  // ── Fechar ao clicar fora ─────────────────────────────────────────────
  useEffect(() => {
    if (!aberto) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setAberto(false);
        setDetalhe(null);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [aberto]);

  // Esc fecha: primeiro o detalhe, depois o painel. Fechar tudo de uma vez faria
  // perder a lista por causa de um Esc destinado ao detalhe.
  useEffect(() => {
    if (!aberto) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      setDetalhe(d => {
        if (d) return null;
        setAberto(false);
        return null;
      });
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [aberto]);

  // Janela aberta por 2 s → marca tudo como lida, para não acumular não lidas.
  // Depende de naoLidas: notificação que chegar com a janela aberta também é
  // marcada 2 s depois. Fechar antes cancela o timer.
  useEffect(() => {
    if (!aberto || naoLidas === 0) return;
    const t = setTimeout(() => { void marcarTodasLidas(); }, 2000);
    return () => clearTimeout(t);
  }, [aberto, naoLidas, marcarTodasLidas]);

  // Trocar o filtro volta a paginação ao começo — senão, ir de "Todas" (com 90
  // carregadas) para uma categoria de 3 itens deixaria o botão "carregar mais"
  // aparecendo sem ter o que carregar.
  useEffect(() => { setLimite(PAGINA); }, [filtro]);

  const excluirNotificacao = useCallback(async (id: string) => {
    setDetalhe(d => (d?.id === id ? null : d));
    await excluir(id);
  }, [excluir]);

  const limparTodas = useCallback(async () => {
    setDetalhe(null);
    await limparTodasNoProvider();
  }, [limparTodasNoProvider]);

  function alternarSom() {
    const novo = !comSom;
    setComSom(novo);
    definirSomAtivo(novo);
    // Toca uma amostra ao LIGAR: é a única forma de a pessoa saber que som ela
    // acabou de escolher ouvir, sem esperar a próxima notificação.
    if (novo) tocarSomNotificacao('atencao');
  }

  /** Vai para onde a notificação aponta. `false` = não há destino. */
  const navegarPara = useCallback((n: Notificacao): boolean => {
    const destino = rotaDaNotificacao(n, tenant.isPaguePlay);
    if (!destino) return false;
    setAberto(false);
    setDetalhe(null);
    navigate(destino);
    return true;
  }, [navigate, tenant.isPaguePlay]);

  /**
   * Clique na notificação: leva para a aba de origem.
   *
   * Toda notificação com destino navega. O painel de detalhe fica só para as
   * que não têm para onde ir.
   */
  const abrirDetalhe = useCallback((n: Notificacao) => {
    if (!n.lida) void marcarLida(n.id);
    if (navegarPara(n)) return;
    setDetalhe(n);
  }, [marcarLida, navegarPara]);

  // ── Filtro e agrupamento ──────────────────────────────────────────────
  const categorias = useMemo(() => categoriasPresentes(notificacoes), [notificacoes]);

  const filtradas = useMemo(() => {
    if (filtro === 'todas')     return notificacoes;
    if (filtro === 'nao_lidas') return notificacoes.filter(n => !n.lida);
    return notificacoes.filter(n => tipoDaNotificacao(n).categoria === filtro);
  }, [notificacoes, filtro]);

  const visiveis = useMemo(() => filtradas.slice(0, limite), [filtradas, limite]);

  /**
   * As visíveis, quebradas em blocos de data.
   *
   * `agora` é lido uma vez por recálculo, e não dentro do laço: com a lista
   * atravessando a meia-noite, duas leituras diferentes do relógio colocariam
   * vizinhas em blocos diferentes.
   */
  const blocos = useMemo(() => {
    const agora = Date.now();
    const mapa = new Map<GrupoData, Notificacao[]>();
    for (const n of visiveis) {
      const g = grupoDaData(n.criado_em, agora);
      const atual = mapa.get(g);
      if (atual) atual.push(n);
      else mapa.set(g, [n]);
    }
    return ORDEM_GRUPOS
      .filter(g => mapa.has(g))
      .map(g => ({ grupo: g, itens: mapa.get(g)! }));
  }, [visiveis]);

  if (!user) return null;

  const vazioTexto = filtro === 'nao_lidas'
    ? 'Nada por ler. Tudo em dia.'
    : filtro === 'todas'
      ? 'Nenhuma notificação.'
      : `Nada em ${CATEGORIA_LABEL[filtro as CategoriaNotificacao]}.`;

  return (
    <div ref={containerRef} className="fixed right-4 top-[60px] z-50 flex flex-col items-end gap-2">
      {/* Wrapper com pointer-events:none durante exit para não bloquear cliques */}
      <div style={{ pointerEvents: aberto ? 'auto' : 'none' }}>
        <AnimatePresence>
          {aberto && (
            <motion.div
              key="painel-notificacoes"
              initial={{ opacity: 0, y: -12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12, scale: 0.97 }}
              transition={{ type: 'tween', duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              className={cn(
                'bg-card border border-border rounded-2xl shadow-2xl overflow-hidden',
                'flex flex-col relative transition-[width] duration-200',
                expandido ? 'w-[min(92vw,660px)]' : 'w-[360px] sm:w-[400px]',
              )}
              style={
                expandido
                  ? { maxHeight: 'min(82vh, 760px)', minHeight: '440px', height: '78vh' }
                  : { maxHeight: '560px', minHeight: '340px' }
              }
              role="dialog"
              aria-label="Notificações"
            >
              <AnimatePresence>
                {detalhe && (
                  <ModalDetalhe
                    notificacao={detalhe}
                    onClose={() => setDetalhe(null)}
                    onMarcarLida={marcarLida}
                    onExcluir={excluirNotificacao}
                    onNavigate={detalhe.acordo_id ? () => { navegarPara(detalhe); } : undefined}
                  />
                )}
              </AnimatePresence>

              {/* ── Cabeçalho ── */}
              <div className="shrink-0 border-b border-border bg-muted/25">
                <div className="flex items-center justify-between px-4 pt-3 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="relative">
                      <Bell className="w-4 h-4 text-primary" />
                      {naoLidas > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-destructive" />
                      )}
                    </span>
                    <p className="text-sm font-semibold text-foreground">Notificações</p>
                    {naoLidas > 0 && (
                      <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
                        {naoLidas > 99 ? '99+' : naoLidas}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-0.5">
                    <Button
                      variant="ghost" size="icon"
                      className="w-7 h-7 text-muted-foreground hover:text-foreground"
                      onClick={alternarSom}
                      title={comSom ? 'Desligar o som das notificações' : 'Ligar o som das notificações'}
                      aria-label={comSom ? 'Desligar o som' : 'Ligar o som'}
                    >
                      {comSom ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
                    </Button>
                    {naoLidas > 0 && (
                      <Button
                        variant="ghost" size="icon"
                        className="w-7 h-7 text-muted-foreground hover:text-foreground"
                        onClick={marcarTodasLidas}
                        title="Marcar todas como lidas"
                        aria-label="Marcar todas como lidas"
                      >
                        <CheckCheck className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    {notificacoes.length > 0 && (
                      <Button
                        variant="ghost" size="icon"
                        className="w-7 h-7 text-muted-foreground hover:text-destructive"
                        onClick={limparTodas}
                        title="Limpar todas"
                        aria-label="Limpar todas"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    <Button
                      variant="ghost" size="icon"
                      className="w-7 h-7 text-muted-foreground hover:text-foreground"
                      onClick={() => setExpandido(v => !v)}
                      title={expandido ? 'Reduzir janela' : 'Expandir janela'}
                      aria-label={expandido ? 'Reduzir janela' : 'Expandir janela'}
                    >
                      {expandido ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                    </Button>
                    <Button
                      variant="ghost" size="icon" className="w-7 h-7"
                      onClick={() => { setAberto(false); setDetalhe(null); }}
                      aria-label="Fechar notificações"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {/* ── Chips de filtro ──
                    Saem das notificações que a pessoa TEM. Ver o cabeçalho. */}
                {notificacoes.length > 0 && (
                  <div className="flex items-center gap-1.5 px-3 pb-2.5 overflow-x-auto scrollbar-none">
                    <ChipFiltro ativo={filtro === 'todas'} onClick={() => setFiltro('todas')}>
                      Todas
                    </ChipFiltro>
                    {naoLidas > 0 && (
                      <ChipFiltro ativo={filtro === 'nao_lidas'} onClick={() => setFiltro('nao_lidas')}>
                        Não lidas · {naoLidas}
                      </ChipFiltro>
                    )}
                    {categorias.map(c => (
                      <ChipFiltro key={c} ativo={filtro === c} onClick={() => setFiltro(c)}>
                        {CATEGORIA_LABEL[c]}
                      </ChipFiltro>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Lista ── */}
              <div className="flex-1 flex flex-col min-h-0">
                <ScrollArea className="flex-1 min-h-0 h-full overflow-y-auto">
                  {loading && notificacoes.length === 0 ? (
                    <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
                      Carregando…
                    </div>
                  ) : filtradas.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-14 gap-2.5 text-muted-foreground">
                      <span className="rounded-2xl bg-muted/60 p-3">
                        <Inbox className="w-7 h-7 opacity-40" />
                      </span>
                      <p className="text-sm">{vazioTexto}</p>
                      {filtro !== 'todas' && (
                        <button
                          className="text-xs text-primary hover:underline"
                          onClick={() => setFiltro('todas')}
                        >
                          Ver todas
                        </button>
                      )}
                    </div>
                  ) : (
                    <>
                      {blocos.map(({ grupo, itens }) => (
                        <section key={grupo}>
                          <h3 className="sticky top-0 z-[1] px-4 py-1.5 bg-card/95 backdrop-blur-sm text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 border-b border-border/40">
                            {GRUPO_LABEL[grupo]}
                          </h3>
                          <div className="divide-y divide-border/50">
                            <AnimatePresence initial={false}>
                              {itens.map(n => (
                                <LinhaNotificacao
                                  key={n.id}
                                  n={n}
                                  onAbrir={abrirDetalhe}
                                  onMarcarLida={marcarLida}
                                  onExcluir={excluirNotificacao}
                                />
                              ))}
                            </AnimatePresence>
                          </div>
                        </section>
                      ))}

                      {filtradas.length > visiveis.length && (
                        <div className="p-3">
                          <Button
                            variant="outline" size="sm"
                            className="w-full h-8 text-xs"
                            onClick={() => setLimite(l => l + PAGINA)}
                          >
                            Carregar mais ({filtradas.length - visiveis.length})
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                </ScrollArea>
              </div>

              {/* ── Rodapé ── */}
              {notificacoes.length > 0 && (
                <div className="px-4 py-2 border-t border-border bg-muted/20 flex items-center justify-between shrink-0">
                  <p className="text-[11px] text-muted-foreground">
                    {/* Diz quantas ESTÃO NA TELA, não quantas existem: o rodapé
                        antigo anunciava o total e a lista mostrava 30. */}
                    {visiveis.length} de {filtradas.length}
                    {naoLidas > 0 && ` · ${naoLidas} não lida${naoLidas !== 1 ? 's' : ''}`}
                  </p>
                  {!comSom && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/70">
                      <BellOff className="w-3 h-3" /> Som desligado
                    </span>
                  )}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Gatilho oculto ──
          Quem abre/fecha é o sino do header (Layout.tsx), que dispara um
          clique aqui via document.querySelector('[data-notif-trigger]'). */}
      <button
        data-notif-trigger
        type="button"
        aria-hidden
        tabIndex={-1}
        className="hidden"
        onClick={() => {
          const abrindo = !aberto;
          setAberto(abrindo);
          if (abrindo) {
            void refresh();
            setDetalhe(null);
            setFiltro('todas');
            setLimite(PAGINA);
          }
        }}
      />
    </div>
  );
}

// ── Chip ───────────────────────────────────────────────────────────────────

function ChipFiltro({
  ativo, onClick, children,
}: {
  ativo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={cn(
        'shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
        ativo
          ? 'border-primary/40 bg-primary/12 text-primary'
          : 'border-border/70 text-muted-foreground hover:text-foreground hover:bg-accent/50',
      )}
    >
      {children}
    </button>
  );
}

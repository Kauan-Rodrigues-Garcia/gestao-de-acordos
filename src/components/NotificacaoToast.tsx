/**
 * src/components/NotificacaoToast.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Os cards temporários no canto superior direito.
 *
 * Complementa o sino, não substitui: o sino guarda, o card avisa na hora.
 *
 * ── O que mudou na 2.0 (11/08/2026) ─────────────────────────────────────────
 *
 *   PILHA DE ATÉ TRÊS, não um de cada vez. A regra antiga ("empilhar cobriria a
 *   tela") resolvia o problema errado: com um card só, três notificações
 *   seguidas levavam 6 s para terminar de aparecer e a pessoa via a terceira
 *   sem contexto das outras duas. Três cards compactos ocupam menos de um terço
 *   da altura da tela e é o que qualquer sistema profissional mostra. O que
 *   passar de três continua em fila.
 *
 *   TEMPO POR URGÊNCIA. Eram 2 s para tudo — não dá para ler duas linhas de
 *   texto em 2 s. Agora vem de `DURACAO_POR_URGENCIA`: o crítico fica 9 s, o
 *   informativo 4,5 s.
 *
 *   PAUSA NO MOUSE. Passar o mouse congela a contagem de TODOS os cards. Era o
 *   que faltava para o card ser legível: sem isso, ler com calma é impossível e
 *   clicar no que está saindo é sorte.
 *
 *   BARRA REGRESSIVA. Ela ENCOLHE em vez de crescer. Barra que cresce parece
 *   carregamento; barra que encolhe é o tempo acabando, que é o que ela mede.
 *
 *   CATEGORIA E AÇÃO. Ícone colorido por assunto (`notificacoes-tipo.ts`),
 *   barra lateral pela urgência e um botão explícito para ir ao destino.
 *
 * Só mostra o que chega DEPOIS da montagem. As que já estavam na lista ao abrir
 * o app são histórico — despejá-las na tela a cada F5 seria ruído.
 */
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ArrowRight } from 'lucide-react';
import type { Notificacao } from '@/lib/supabase';
import { useNotificacoes } from '@/providers/NotificacoesProvider';
import { useTenant } from '@/lib/tenant-config';
import { rotaDaNotificacao } from '@/lib/notificacoes-rota';
import {
  tipoDaNotificacao, DURACAO_POR_URGENCIA, URGENCIA_BARRA,
  type TipoNotificacao,
} from '@/lib/notificacoes-tipo';
import { IconeCategoria } from '@/components/notificacoes/IconeCategoria';
import { tocarSomNotificacao, prepararSomNotificacao } from '@/lib/som-notificacao';
import { cn } from '@/lib/utils';

/**
 * Quantos cards ficam visíveis ao mesmo tempo.
 *
 * Três é o teto por um motivo prático: o quarto card empurraria a pilha para
 * baixo da dobra em telas de notebook, e card que não se vê não avisa nada.
 */
export const MAX_VISIVEIS = 3;

/** Fallback quando a urgência não resolve — nunca deve acontecer. */
export const DURACAO_TOAST_MS = DURACAO_POR_URGENCIA.info;

/** De quanto em quanto tempo a barra é redesenhada. */
const PASSO_MS = 100;

interface CardAtivo {
  notificacao: Notificacao;
  tipo: TipoNotificacao;
  /** Quanto ainda falta, em ms. Cai sozinho; congela com o mouse em cima. */
  restanteMs: number;
  duracaoMs: number;
}

export function NotificacaoToast() {
  const { notificacoes, marcarLida } = useNotificacoes();
  const navigate = useNavigate();
  const tenant   = useTenant();

  const [fila, setFila]       = useState<Notificacao[]>([]);
  const [ativos, setAtivos]   = useState<CardAtivo[]>([]);
  const [pausado, setPausado] = useState(false);

  /**
   * Ids já vistos. Começa `null` para distinguir "ainda não sei o que existia"
   * de "não existia nada" — sem isso, a primeira carga entraria toda na fila.
   */
  const vistosRef = useRef<Set<string> | null>(null);

  // ── Áudio pronto antes de precisar ────────────────────────────────────────
  // O navegador só libera som depois de um gesto na página, e o download do
  // arquivo levaria mais tempo que o card na tela. Aquecer no primeiro clique
  // faz o primeiro aviso já sair com som.
  useEffect(() => {
    const aquecer = () => prepararSomNotificacao();
    window.addEventListener('pointerdown', aquecer, { once: true });
    window.addEventListener('keydown', aquecer, { once: true });
    return () => {
      window.removeEventListener('pointerdown', aquecer);
      window.removeEventListener('keydown', aquecer);
    };
  }, []);

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

  // ── Promove da fila enquanto houver vaga ──────────────────────────────────
  useEffect(() => {
    if (fila.length === 0 || ativos.length >= MAX_VISIVEIS) return;
    const vagas  = MAX_VISIVEIS - ativos.length;
    const entram = fila.slice(0, vagas);

    setFila(prev => prev.slice(entram.length));
    setAtivos(prev => [
      ...prev,
      ...entram.map(n => {
        const tipo = tipoDaNotificacao(n);
        const duracaoMs = DURACAO_POR_URGENCIA[tipo.urgencia] ?? DURACAO_TOAST_MS;
        return { notificacao: n, tipo, duracaoMs, restanteMs: duracaoMs };
      }),
    ]);

    // Um som por LEVA, não por card: três notificações promovidas no mesmo
    // ciclo são um evento só para o ouvido. O `tocarSomNotificacao` ainda tem o
    // próprio intervalo mínimo, mas contar com ele aqui seria depender de um
    // detalhe de outro módulo.
    const maisUrgente = entram
      .map(n => tipoDaNotificacao(n).urgencia)
      .reduce<TipoNotificacao['urgencia']>(
        (pior, u) => (u === 'critica' || (u === 'atencao' && pior === 'info') ? u : pior),
        'info',
      );
    tocarSomNotificacao(maisUrgente);
  }, [fila, ativos.length]);

  // ── Relógio único para a pilha ────────────────────────────────────────────
  // Um `setInterval` para todos os cards, e não um timer por card: com timers
  // individuais, pausar no mouse exigiria cancelar e recriar cada um com o
  // tempo restante recalculado à mão.
  useEffect(() => {
    if (ativos.length === 0 || pausado) return;
    const t = setInterval(() => {
      setAtivos(prev => prev
        .map(c => ({ ...c, restanteMs: c.restanteMs - PASSO_MS }))
        .filter(c => c.restanteMs > 0));
    }, PASSO_MS);
    return () => clearInterval(t);
  }, [ativos.length, pausado]);

  const fechar = useCallback((id: string) => {
    setAtivos(prev => prev.filter(c => c.notificacao.id !== id));
  }, []);

  const abrir = useCallback((n: Notificacao) => {
    const destino = rotaDaNotificacao(n, tenant.isPaguePlay);
    if (!n.lida) void marcarLida(n.id);
    setAtivos(prev => prev.filter(c => c.notificacao.id !== n.id));
    if (destino) navigate(destino);
  }, [marcarLida, navigate, tenant.isPaguePlay]);

  /** Quantas ainda esperam vaga — vira a etiqueta do rodapé da pilha. */
  const naFila = fila.length;

  const conteudo = useMemo(() => ativos.map(card => {
    const { notificacao: n, tipo, restanteMs, duracaoMs } = card;
    const temDestino = rotaDaNotificacao(n, tenant.isPaguePlay) !== null;

    return (
      <motion.div
        key={n.id}
        layout
        initial={{ opacity: 0, x: 48, scale: 0.96 }}
        animate={{ opacity: 1, x: 0,  scale: 1 }}
        exit={{    opacity: 0, x: 48, scale: 0.96 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        className={cn(
          'pointer-events-auto relative overflow-hidden rounded-xl',
          'border border-border/80 bg-card/95 backdrop-blur-sm shadow-lg',
          'cursor-pointer hover:border-border hover:shadow-xl transition-[box-shadow,border-color]',
        )}
        onClick={() => abrir(n)}
        role="button"
        tabIndex={0}
        // Nome explícito: sem ele o leitor de tela (e o teste) juntam o texto do
        // card com o `aria-label` do X de fechar, e os dois botões passam a ter
        // o mesmo nome.
        aria-label={`Abrir: ${n.titulo}`}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(n); }
        }}
      >
        {/* Barra lateral: a urgência de relance, antes de qualquer leitura. */}
        <span className={cn('absolute left-0 top-0 bottom-0 w-1', URGENCIA_BARRA[tipo.urgencia])} />

        <div className="flex items-start gap-3 p-3 pl-4">
          <IconeCategoria categoria={tipo.categoria} />

          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold leading-tight text-foreground line-clamp-1">
              {n.titulo}
            </p>
            <p className="text-[12px] text-muted-foreground leading-snug mt-1 line-clamp-2">
              {n.mensagem}
            </p>
            {temDestino && (
              <span className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-primary">
                Ver detalhes <ArrowRight className="w-3 h-3" />
              </span>
            )}
          </div>

          <button
            type="button"
            // `stopPropagation`: fechar não pode navegar junto.
            onClick={e => { e.stopPropagation(); fechar(n.id); }}
            className="shrink-0 rounded-md p-1 -mt-0.5 -mr-0.5 text-muted-foreground/70 hover:text-foreground hover:bg-accent transition-colors"
            aria-label={`Fechar aviso: ${n.titulo}`}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Relógio: encolhe até zero. Cresce pareceria carregamento. */}
        <div className="h-0.5 bg-muted/60">
          <div
            className={cn('h-full transition-[width] ease-linear', URGENCIA_BARRA[tipo.urgencia])}
            style={{
              width: `${Math.max(0, (restanteMs / duracaoMs) * 100)}%`,
              transitionDuration: `${PASSO_MS}ms`,
            }}
          />
        </div>
      </motion.div>
    );
  }), [ativos, abrir, fechar, tenant.isPaguePlay]);

  return (
    <div
      className="fixed top-4 right-4 z-[100] w-[min(23rem,calc(100vw-2rem))] flex flex-col gap-2 pointer-events-none"
      aria-live="polite"
      // A pausa vale para a PILHA, não para um card: o mouse está lendo a
      // região inteira, e ver o vizinho sumir enquanto se lê é o mesmo defeito
      // que a pausa veio corrigir.
      onMouseEnter={() => setPausado(true)}
      onMouseLeave={() => setPausado(false)}
    >
      <AnimatePresence initial={false}>{conteudo}</AnimatePresence>

      {naFila > 0 && (
        <div className="pointer-events-none self-end rounded-full border border-border/70 bg-card/90 px-2.5 py-1 text-[10px] font-medium text-muted-foreground shadow-sm">
          +{naFila} na fila
        </div>
      )}
    </div>
  );
}

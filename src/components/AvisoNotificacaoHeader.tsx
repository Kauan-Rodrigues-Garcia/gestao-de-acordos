/**
 * src/components/AvisoNotificacaoHeader.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * O aviso de notificação nova, DENTRO da barra superior.
 *
 * ── O que ele substituiu, e por quê ─────────────────────────────────────────
 *
 * Até 02/09/2026 isto era o `NotificacaoToast`: uma pilha de até três cards
 * flutuando no canto superior direito, `position: fixed`, `z-100`. Dois
 * problemas reais, os dois relatados por quem usa:
 *
 *   O DESFILE AO ENTRAR. O toast considerava "nova" toda notificação que
 *   aparecesse na lista depois da montagem. Só que na montagem a lista está
 *   VAZIA — a leitura do banco ainda nem voltou. Quando ela voltava com 50
 *   linhas, as 50 eram novidade, e a pessoa via 50 cards desfilarem em fila
 *   para ler o que já estava guardado no sino. Entrar no sistema virou uma
 *   punição para quem tem caixa cheia.
 *
 *   O CANTO OCUPADO. Card flutuante cobre o que está embaixo dele. Mesmo
 *   descendo para 68 px, três cards de 23 rem tapavam o lado direito da tela —
 *   e o lado direito é onde ficam os botões de ação da maioria das telas.
 *
 * Agora o aviso é UMA LINHA, no espaço vazio do cabeçalho, entre o botão do
 * menu e o bloco de ações. Ele é um item de flex como qualquer outro: não
 * flutua, não tem z-index disputando com nada, e não pode cobrir botão nenhum
 * porque ocupa espaço que já era vazio. `min-w-0` + `truncate` garantem que
 * encolher a janela aperta o texto do aviso, nunca empurra o que está ao lado.
 *
 * ── As três regras de quando aparecer ───────────────────────────────────────
 *
 *   1. Só depois da carga inicial (`cargaInicialConcluida` do provider). O que
 *      veio na primeira leitura é histórico e pertence ao sino.
 *   2. Só com a aba VISÍVEL. O que chega com a aba escondida entra na lista e
 *      acende o sino, mas não vira aviso — voltar para a aba não pode
 *      significar assistir à fila do que aconteceu enquanto você não estava.
 *   3. Um por vez, com teto de fila. Passou de `MAX_FILA` esperando, o excesso
 *      é contado e descartado: vira "+N" no chip, que leva ao sino. Fila longa
 *      de aviso temporário é ruído — o sino é que guarda.
 *
 * Sair da aba limpa o que estava na fila, pela mesma razão da regra 2.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import type { Notificacao } from '@/lib/supabase';
import { useNotificacoes } from '@/providers/NotificacoesProvider';
import { useTenant } from '@/lib/tenant-config';
import { rotaDaNotificacao } from '@/lib/notificacoes-rota';
import {
  tipoDaNotificacao, apresentacaoDaNotificacao,
  DURACAO_POR_URGENCIA, URGENCIA_BARRA,
  type TipoNotificacao,
} from '@/lib/notificacoes-tipo';
import { CaraDaNotificacao } from '@/components/notificacoes/IconeCategoria';
import { tocarSomNotificacao, prepararSomNotificacao } from '@/lib/som-notificacao';
import { cn } from '@/lib/utils';

/**
 * Quantas esperam vez antes de o excesso virar só número.
 *
 * Três é o bastante para uma rajada curta (uma conversa respondendo três vezes)
 * caber sem perder nada. Acima disso, mostrar uma a uma levaria mais de meio
 * minuto de cabeçalho piscando para dizer o que o sino diz de uma vez.
 */
export const MAX_FILA = 3;

/** Fallback quando a urgência não resolve — nunca deve acontecer. */
export const DURACAO_AVISO_MS = DURACAO_POR_URGENCIA.info;

/** De quanto em quanto tempo a barra regressiva é redesenhada. */
const PASSO_MS = 100;

interface AvisoAtivo {
  notificacao: Notificacao;
  tipo: TipoNotificacao;
  /** Quanto ainda falta, em ms. Cai sozinho; congela com o mouse em cima. */
  restanteMs: number;
  duracaoMs: number;
}

/** A aba está à vista? Fora do navegador (teste em jsdom) assume que sim. */
function abaVisivel(): boolean {
  return typeof document === 'undefined' || document.visibilityState !== 'hidden';
}

/** Abre o painel do sino — o mesmo gatilho que o ícone do cabeçalho usa. */
function abrirPainelDoSino() {
  document.querySelector<HTMLButtonElement>('[data-notif-trigger]')?.click();
}

export function AvisoNotificacaoHeader() {
  const { notificacoes, marcarLida, cargaInicialConcluida } = useNotificacoes();
  const navigate = useNavigate();
  const tenant   = useTenant();

  const [fila, setFila]         = useState<Notificacao[]>([]);
  const [excedente, setExcedente] = useState(0);
  const [ativo, setAtivo]       = useState<AvisoAtivo | null>(null);
  const [pausado, setPausado]   = useState(false);

  /**
   * Ids já contabilizados. `null` = a carga inicial ainda não voltou, então
   * ainda não dá para dizer o que é novo (ver o cabeçalho, regra 1).
   */
  const vistosRef = useRef<Set<string> | null>(null);

  // ── Áudio pronto antes de precisar ────────────────────────────────────────
  // O navegador só libera som depois de um gesto na página, e o download do
  // arquivo levaria mais tempo que o aviso na tela.
  useEffect(() => {
    const aquecer = () => prepararSomNotificacao();
    window.addEventListener('pointerdown', aquecer, { once: true });
    window.addEventListener('keydown', aquecer, { once: true });
    return () => {
      window.removeEventListener('pointerdown', aquecer);
      window.removeEventListener('keydown', aquecer);
    };
  }, []);

  // ── Troca de usuário: o retrato anterior não vale mais ────────────────────
  useEffect(() => {
    if (!cargaInicialConcluida) {
      vistosRef.current = null;
      setFila([]);
      setExcedente(0);
      setAtivo(null);
    }
  }, [cargaInicialConcluida]);

  // ── O que chegou DEPOIS da carga inicial, com a aba à vista ───────────────
  useEffect(() => {
    if (!cargaInicialConcluida) return;

    // Primeiro retrato: tudo que está aqui é histórico do sino.
    if (vistosRef.current === null) {
      vistosRef.current = new Set(notificacoes.map(n => n.id));
      return;
    }

    const vistos = vistosRef.current;
    const novas = notificacoes.filter(n => !vistos.has(n.id) && !n.lida);
    for (const n of notificacoes) vistos.add(n.id);
    if (novas.length === 0) return;

    // Aba escondida: entra na lista e acende o sino, mas não vira aviso.
    if (!abaVisivel()) return;

    // A lista vem da mais nova para a mais antiga; a fila mostra na ordem em
    // que chegaram.
    setFila(prev => {
      const juntas = [...prev, ...[...novas].reverse()];
      if (juntas.length <= MAX_FILA) return juntas;
      setExcedente(x => x + (juntas.length - MAX_FILA));
      return juntas.slice(0, MAX_FILA);
    });

    // Um som por LEVA, não por notificação: uma rajada é um evento só para o
    // ouvido.
    const maisUrgente = novas
      .map(n => tipoDaNotificacao(n).urgencia)
      .reduce<TipoNotificacao['urgencia']>(
        (pior, u) => (u === 'critica' || (u === 'atencao' && pior === 'info') ? u : pior),
        'info',
      );
    tocarSomNotificacao(maisUrgente);
  }, [notificacoes, cargaInicialConcluida]);

  // ── Sair da aba limpa a fila ──────────────────────────────────────────────
  // Mesma razão da regra 2: voltar não pode ser assistir ao que passou.
  useEffect(() => {
    const aoTrocar = () => {
      if (!abaVisivel()) { setFila([]); setExcedente(0); setAtivo(null); }
    };
    document.addEventListener('visibilitychange', aoTrocar);
    return () => document.removeEventListener('visibilitychange', aoTrocar);
  }, []);

  // ── Promove da fila quando a vaga (única) abre ────────────────────────────
  useEffect(() => {
    if (ativo || fila.length === 0) return;
    const [proxima, ...resto] = fila;
    const tipo = tipoDaNotificacao(proxima);
    const duracaoMs = DURACAO_POR_URGENCIA[tipo.urgencia] ?? DURACAO_AVISO_MS;
    setFila(resto);
    setAtivo({ notificacao: proxima, tipo, duracaoMs, restanteMs: duracaoMs });
    // O aviso anterior pode ter sumido debaixo do cursor sem disparar
    // `pointerleave`; recomeçar despausado evita o relógio travado para sempre.
    setPausado(false);
  }, [fila, ativo]);

  // ── Relógio regressivo ────────────────────────────────────────────────────
  useEffect(() => {
    if (!ativo || pausado) return;
    const t = setInterval(() => {
      setAtivo(prev => {
        if (!prev) return prev;
        const restanteMs = prev.restanteMs - PASSO_MS;
        return restanteMs > 0 ? { ...prev, restanteMs } : null;
      });
    }, PASSO_MS);
    return () => clearInterval(t);
  }, [ativo, pausado]);

  const fechar = useCallback(() => {
    setAtivo(null);
    setPausado(false);
  }, []);

  const abrir = useCallback((n: Notificacao) => {
    const destino = rotaDaNotificacao(n, tenant.isPaguePlay);
    if (!n.lida) void marcarLida(n.id);
    setAtivo(null);
    setPausado(false);
    if (destino) navigate(destino);
  }, [marcarLida, navigate, tenant.isPaguePlay]);

  /** Quantas ainda esperam, somando as que nem entraram na fila. */
  const aguardando = fila.length + excedente;

  const verTodas = useCallback(() => {
    setFila([]);
    setExcedente(0);
    setAtivo(null);
    abrirPainelDoSino();
  }, []);

  /*
   * O container é SEMPRE renderizado, mesmo vazio: ele é o `flex-1` que empurra
   * o bloco de ações para a direita do cabeçalho. Trocá-lo por `null` faria o
   * cabeçalho inteiro se reorganizar a cada aviso que chega e sai.
   */
  return (
    <div
      className="flex-1 min-w-0 flex items-center justify-center px-2"
      aria-live="polite"
    >
      <AnimatePresence initial={false} mode="wait">
        {ativo && (() => {
          const { notificacao: n, tipo, restanteMs, duracaoMs } = ativo;
          const vis = apresentacaoDaNotificacao(n);
          const temDestino = rotaDaNotificacao(n, tenant.isPaguePlay) !== null;

          return (
            <motion.div
              key={n.id}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{    opacity: 0, y: -8 }}
              transition={{ duration: 0.16, ease: 'easeOut' }}
              onPointerEnter={() => setPausado(true)}
              onPointerLeave={() => setPausado(false)}
              className={cn(
                'group relative flex items-center gap-2 h-9 w-full max-w-lg min-w-0',
                'rounded-lg border border-border/70 bg-muted/40 pl-2 pr-1.5',
                'overflow-hidden transition-colors',
                temDestino && 'cursor-pointer hover:bg-muted/70 hover:border-border',
              )}
              role={temDestino ? 'button' : undefined}
              tabIndex={temDestino ? 0 : undefined}
              aria-label={temDestino ? `Abrir: ${vis.titulo}` : undefined}
              onClick={() => temDestino && abrir(n)}
              onKeyDown={e => {
                if (temDestino && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  abrir(n);
                }
              }}
            >
              {/* A urgência de relance, antes de qualquer leitura. */}
              <span className={cn('absolute left-0 top-0 bottom-0 w-[3px]', URGENCIA_BARRA[tipo.urgencia])} />

              <CaraDaNotificacao
                categoria={tipo.categoria}
                comFoto={vis.usarFotoDoAutor}
                autorNome={n.autor_nome}
                autorFoto={n.autor_foto}
                tamanho="sm"
                className="ml-1"
              />

              {/* Uma linha só: título e corpo dividem a largura, e o `min-w-0`
                  de cada lado é o que permite os dois truncarem em vez de
                  esticarem a barra. */}
              <div className="flex-1 min-w-0 flex items-baseline gap-1.5">
                <span className="text-[12px] font-semibold text-foreground truncate max-w-[45%] shrink-0">
                  {vis.titulo}
                </span>
                <span className="hidden sm:block text-[12px] text-muted-foreground truncate min-w-0">
                  {vis.corpo}
                </span>
              </div>

              {aguardando > 0 && (
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); verTodas(); }}
                  className="shrink-0 rounded-full border border-border/70 bg-background/70 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground hover:text-foreground hover:border-border transition-colors"
                  title={`Mais ${aguardando} — abrir o painel de notificações`}
                >
                  +{aguardando}
                </button>
              )}

              <button
                type="button"
                // `stopPropagation`: fechar não pode navegar junto.
                onClick={e => { e.stopPropagation(); fechar(); }}
                className="shrink-0 rounded-md p-1 text-muted-foreground/70 hover:text-foreground hover:bg-accent transition-colors"
                aria-label={`Fechar aviso: ${vis.titulo}`}
              >
                <X className="w-3.5 h-3.5" />
              </button>

              {/* Relógio: encolhe até zero, rente à borda de baixo. Cresce
                  pareceria carregamento. */}
              <span
                className={cn(
                  'absolute left-0 bottom-0 h-[2px] transition-[width] ease-linear',
                  URGENCIA_BARRA[tipo.urgencia],
                )}
                style={{
                  width: `${Math.max(0, (restanteMs / duracaoMs) * 100)}%`,
                  transitionDuration: `${PASSO_MS}ms`,
                }}
              />
            </motion.div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
}

/**
 * CardComemoracao — o card da comemoração.
 *
 * O MESMO componente serve à exibição e ao preview do editor, via `modo`. Se
 * fossem dois, divergiriam na primeira mudança — e o líder descobriria isso
 * com a comemoração já na tela de todo mundo.
 *
 * Proporção fixa (`ASPECTO`) e posições em % para o que o líder vê ser o que os
 * outros veem, em qualquer monitor.
 */
import { useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { X, Trophy, Move } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import type { PessoaComemoracao } from '@/services/comemoracoes.service';
import {
  posicaoDe, moverElemento, type ElementoId, type LayoutComemoracao,
} from '@/pages/Comemoracoes/layout';

/** Card de referência, em unidades lógicas. As posições do editor são % disto. */
export const LARGURA_LOGICA = 640;
export const ALTURA_LOGICA  = 360;
export const ASPECTO = `${LARGURA_LOGICA} / ${ALTURA_LOGICA}`;

/** Primeiro nome — o card não tem largura para nome completo de 4 palavras. */
function primeiroNome(nome: string | null | undefined): string {
  return (nome ?? '').trim().split(/\s+/)[0] || '—';
}

function iniciais(nome: string | null | undefined): string {
  const partes = (nome ?? '').trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return '?';
  return (partes[0][0] + (partes[1]?.[0] ?? '')).toUpperCase();
}

export interface CardComemoracaoProps {
  titulo:       string;
  mensagem:     string | null;
  homenageados: PessoaComemoracao[];
  /** GIF enviado pelo líder. Ausente = troféu do catálogo. */
  gifUrl?:      string | null;
  layout?:      LayoutComemoracao;
  /** 'editor' ganha alças de arrasto; 'exibicao' só anima. */
  modo?:        'editor' | 'exibicao';
  /** Editor: elemento selecionado e callbacks de edição. */
  selecionado?: ElementoId | null;
  onSelecionar?: (e: ElementoId) => void;
  onMover?:     (proximo: LayoutComemoracao) => void;
  onFechar?:    () => void;
  /** Duração, para a barra de tempo. Ausente = sem barra (preview). */
  tempoTotalS?: number;
}

export function CardComemoracao({
  titulo, mensagem, homenageados, gifUrl, layout = {},
  modo = 'exibicao', selecionado, onSelecionar, onMover, onFechar, tempoTotalS,
}: CardComemoracaoProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [arrastando, setArrastando] = useState<ElementoId | null>(null);
  const ehEditor = modo === 'editor';

  // Com muita gente as fotos encolhem, senão a última linha sai do card.
  const muitos = homenageados.length > 6;

  /**
   * Arrasto por ponteiro: funciona com mouse e com toque, e o
   * `setPointerCapture` mantém o elemento recebendo os eventos mesmo quando o
   * cursor sai de cima dele — sem isso, arrastar rápido "solta" o elemento.
   */
  function aoPegar(elemento: ElementoId) {
    return (e: React.PointerEvent) => {
      if (!ehEditor || !onMover) return;
      e.preventDefault();
      e.stopPropagation();
      onSelecionar?.(elemento);
      setArrastando(elemento);

      const alvo = e.currentTarget as HTMLElement;
      alvo.setPointerCapture(e.pointerId);

      let ultimoX = e.clientX;
      let ultimoY = e.clientY;

      const aoMover = (ev: PointerEvent) => {
        const caixa = cardRef.current?.getBoundingClientRect();
        if (!caixa) return;
        const dx = ev.clientX - ultimoX;
        const dy = ev.clientY - ultimoY;
        ultimoX = ev.clientX;
        ultimoY = ev.clientY;
        onMover(moverElemento(layout, elemento, { dx, dy },
          { largura: caixa.width, altura: caixa.height }));
      };

      const aoSoltar = () => {
        setArrastando(null);
        alvo.releasePointerCapture?.(e.pointerId);
        alvo.removeEventListener('pointermove', aoMover);
        alvo.removeEventListener('pointerup', aoSoltar);
        alvo.removeEventListener('pointercancel', aoSoltar);
      };

      alvo.addEventListener('pointermove', aoMover);
      alvo.addEventListener('pointerup', aoSoltar);
      alvo.addEventListener('pointercancel', aoSoltar);
    };
  }

  /** Envolve um elemento posicionável. */
  function Posicionado({ id, children }: { id: ElementoId; children: ReactNode }) {
    const pos = posicaoDe(layout, id);
    const estilo: CSSProperties = {
      left: `${pos.x}%`,
      top:  `${pos.y}%`,
      transform: `translate(-50%, -50%) scale(${pos.escala})`,
    };
    return (
      <div
        style={estilo}
        onPointerDown={ehEditor ? aoPegar(id) : undefined}
        className={cn(
          'absolute flex max-w-[92%] flex-col items-center',
          ehEditor && 'cursor-grab touch-none rounded-lg ring-offset-2 transition-shadow',
          ehEditor && selecionado === id && 'ring-2 ring-white/80',
          arrastando === id && 'cursor-grabbing opacity-90',
        )}
      >
        {ehEditor && (
          <span className="pointer-events-none absolute -top-2 -right-2 rounded-full bg-white/90 p-0.5 text-black/70 shadow">
            <Move className="h-2.5 w-2.5" />
          </span>
        )}
        {children}
      </div>
    );
  }

  return (
    <div
      ref={cardRef}
      className={cn(
        'relative w-full overflow-hidden rounded-2xl border-2 border-amber-400/60 shadow-2xl',
        'bg-gradient-to-br from-amber-500/95 via-orange-500/95 to-rose-500/95',
        ehEditor && 'ring-1 ring-primary/40',
      )}
      style={{ aspectRatio: ASPECTO }}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.35),transparent_60%)]" />

      {onFechar && (
        <button
          type="button"
          onClick={onFechar}
          aria-label="Fechar comemoração"
          // O card inteiro é `pointer-events-none` na exibição (ver o overlay);
          // este botão reativa só para si.
          className="pointer-events-auto absolute right-2 top-2 z-20 rounded-full bg-black/20 p-1 text-white/80 transition-colors hover:bg-black/40 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      )}

      <div className="relative h-full w-full text-center text-white">
        {/* Mídia: o GIF do líder, ou o troféu do catálogo */}
        <Posicionado id="midia">
          {gifUrl ? (
            <img
              src={gifUrl}
              alt=""
              draggable={false}
              className="max-h-[38%] w-auto max-w-[220px] rounded-lg object-contain shadow-lg"
              style={{ maxHeight: `${ALTURA_LOGICA * 0.38}px` }}
            />
          ) : (
            <motion.div
              initial={{ scale: 0, rotate: -20 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 220, damping: 14 }}
              className="rounded-full bg-white/20 p-2.5 backdrop-blur-sm"
            >
              <Trophy className="h-7 w-7 drop-shadow" />
            </motion.div>
          )}
        </Posicionado>

        <Posicionado id="titulo">
          <motion.h2
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="whitespace-pre-wrap text-2xl font-black uppercase leading-tight tracking-wide drop-shadow-md sm:text-3xl"
          >
            {titulo}
          </motion.h2>
        </Posicionado>

        {mensagem && (
          <Posicionado id="mensagem">
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="text-sm font-medium leading-snug text-white/90 drop-shadow"
            >
              {mensagem}
            </motion.p>
          </Posicionado>
        )}

        <Posicionado id="pessoas">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.28 }}
            className="flex flex-wrap items-start justify-center gap-x-4 gap-y-2"
          >
            {homenageados.map((p) => (
              <div key={p.id} className="flex flex-col items-center gap-1">
                <Avatar className={cn('border-2 border-white/70 shadow-lg', muitos ? 'h-9 w-9' : 'h-12 w-12')}>
                  {p.foto_url && <AvatarImage src={p.foto_url} alt={p.nome} className="object-cover" />}
                  <AvatarFallback className="bg-white/25 text-xs font-bold text-white">
                    {iniciais(p.nome)}
                  </AvatarFallback>
                </Avatar>
                <span className={cn('font-bold drop-shadow', muitos ? 'text-[10px]' : 'text-xs')}>
                  {primeiroNome(p.nome)}
                </span>
              </div>
            ))}
          </motion.div>
        </Posicionado>
      </div>

      {/* Relógio visual: mostra quanto falta, para o card não parecer travado. */}
      {!!tempoTotalS && (
        <div className="absolute bottom-0 left-0 h-1.5 w-full bg-black/20">
          <motion.div
            className="h-full bg-white/80"
            initial={{ width: '100%' }}
            animate={{ width: '0%' }}
            transition={{ duration: tempoTotalS, ease: 'linear' }}
          />
        </div>
      )}
    </div>
  );
}

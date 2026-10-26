/**
 * Vitrine — o carrossel de fotos do cabeçalho da cantina (26/10/2026).
 *
 * Troca a foto a cada INTERVALO_MS com fade cruzado. Tudo aqui é framer-motion,
 * e a troca em si é só OPACIDADE:
 *
 *   • o app roda com `MotionConfig reducedMotion="never"` (App.tsx), então os
 *     computadores da empresa — que vêm com «reduzir animações» ligado no
 *     Windows — veem a troca normal;
 *   • no Modo leve (`reducedMotion="always"`) o framer desliga só o transform:
 *     o zoom lento some, o fade e a barrinha de progresso continuam.
 *
 * Nenhuma transição de CSS carrega a troca: o Modo leve corta todas para 1 ms.
 *
 * Para quando a aba está escondida (não gasta máquina à toa) e quando o mouse
 * está em cima (dá tempo de ler).
 */
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Lock, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatarPreco } from '@/lib/cantina';

const INTERVALO_MS = 4500;
const FADE_S = 0.9;

export interface SlideVitrine {
  id: string;
  foto: string;
  nome: string;
  preco: number;
  /** `null` = dá para pedir agora; senão, o aviso do cadeado. */
  bloqueio: string | null;
}

function useAbaVisivel(): boolean {
  const [visivel, setVisivel] = useState(() => typeof document === 'undefined' || !document.hidden);
  useEffect(() => {
    const aplicar = () => setVisivel(!document.hidden);
    document.addEventListener('visibilitychange', aplicar);
    return () => document.removeEventListener('visibilitychange', aplicar);
  }, []);
  return visivel;
}

export function Vitrine({
  slides, onEscolher, className,
}: {
  slides: SlideVitrine[];
  onEscolher: (id: string) => void;
  className?: string;
}) {
  const [indice, setIndice] = useState(0);
  const [mouseEmCima, setMouseEmCima] = useState(false);
  const abaVisivel = useAbaVisivel();
  const total = slides.length;
  const parado = mouseEmCima || !abaVisivel || total < 2;

  // Cada troca reinicia a contagem: pausar e voltar dá o tempo inteiro de novo,
  // e a barrinha (que recomeça junto, pela `key`) nunca mente.
  useEffect(() => {
    if (parado) return;
    const t = window.setTimeout(() => setIndice(i => (i + 1) % total), INTERVALO_MS);
    return () => window.clearTimeout(t);
  }, [indice, parado, total]);

  // Baixa todas antes: a primeira passada não pisca em branco.
  useEffect(() => {
    for (const s of slides) { const img = new Image(); img.src = s.foto; }
  }, [slides]);

  if (total === 0) return null;
  const atual = slides[indice % total];

  return (
    <div
      className={cn('relative overflow-hidden rounded-2xl bg-muted', className)}
      onMouseEnter={() => setMouseEmCima(true)}
      onMouseLeave={() => setMouseEmCima(false)}
    >
      {/* Sem `mode="wait"`: a nova entra por cima enquanto a velha sai, e o
          fundo nunca aparece entre as duas. */}
      <AnimatePresence initial={false}>
        <motion.img
          key={atual.id}
          src={atual.foto}
          alt=""
          aria-hidden
          draggable={false}
          initial={{ opacity: 0, scale: 1.08 }}
          animate={{
            opacity: 1, scale: 1,
            transition: {
              opacity: { duration: FADE_S, ease: 'easeOut' },
              scale: { duration: INTERVALO_MS / 1000 + FADE_S, ease: 'linear' },
            },
          }}
          exit={{ opacity: 0, transition: { duration: FADE_S, ease: 'easeIn' } }}
          className="absolute inset-0 h-full w-full object-cover"
        />
      </AnimatePresence>

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" aria-hidden />

      {/* Legenda do prato da vez */}
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-3 sm:p-4">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={atual.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 0.35, delay: 0.15 } }}
            exit={{ opacity: 0, transition: { duration: 0.2 } }}
            className="min-w-0 text-white"
            aria-live="polite"
          >
            <span className={cn(
              'mb-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold backdrop-blur-sm',
              atual.bloqueio ? 'bg-black/45' : 'bg-emerald-500/85',
            )}>
              {atual.bloqueio ? <><Lock className="h-3 w-3" /> {atual.bloqueio}</> : 'Disponível agora'}
            </span>
            <p className="truncate text-base sm:text-lg font-bold leading-tight drop-shadow">{atual.nome}</p>
            <p className="text-xs sm:text-sm font-medium text-white/85">{formatarPreco(atual.preco)}</p>
          </motion.div>
        </AnimatePresence>

        <button
          type="button"
          onClick={() => onEscolher(atual.id)}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs sm:text-sm font-semibold text-neutral-900 shadow-md hover:bg-white/90"
        >
          <Plus className="h-4 w-4" /> Ver<span className="hidden sm:inline"> no cardápio</span>
        </button>
      </div>

      {/* Um tracinho por foto; o da vez enche enquanto conta. */}
      {total > 1 && (
        <div className="absolute inset-x-3 top-3 flex gap-1.5 sm:inset-x-4">
          {slides.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setIndice(i)}
              aria-label={`Mostrar ${s.nome}`}
              className="relative h-1 flex-1 overflow-hidden rounded-full bg-white/35"
            >
              {i < indice % total && <span className="absolute inset-0 bg-white/90" />}
              {i === indice % total && (
                <motion.span
                  key={`${indice}-${parado}`}
                  className="absolute inset-y-0 left-0 bg-white"
                  initial={{ width: parado ? '100%' : '0%' }}
                  animate={{ width: '100%' }}
                  transition={{ duration: parado ? 0 : INTERVALO_MS / 1000, ease: 'linear' }}
                />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * BootSequence — a abertura, logo depois do quinto clique.
 * ─────────────────────────────────────────────────────────────────────────────
 * Três atos em pouco menos de 3 segundos: o nome do sistema se corrompendo, o
 * terminal reconhecendo a invasão, e os criadores aparecendo. Curto de
 * propósito — abertura que se repete toda visita não pode custar dez segundos.
 *
 * Com `prefers-reduced-motion`, a sequência não é encurtada: ela é
 * SUBSTITUÍDA por um cartão estático com o mesmo texto. Piscar rápido é
 * exatamente o que a preferência pede para evitar, então acelerar seria piorar.
 *
 * Pode ser pulada a qualquer momento com clique, Esc ou Enter — quem já viu uma
 * vez não deve ser obrigado a ver de novo.
 */
import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

/** Os estágios de corrupção do nome. O último é ruído puro. */
const CORROMPENDO = [
  'GESTÃO DE ACORDOS',
  'GEST_O DE ACORDOS',
  'GESTÃO D_ AC_RDOS',
  'G_STÃO D_ AC_R_OS',
  '▓▓▓▓▓▓▓▓▓▓▓▓▓▓',
];

const LINHAS_TERMINAL = [
  '> unexpected input detected',
  '> checking credentials...',
  '> hidden sector detected',
  '> developer access granted',
  '',
  '> loading creators...',
];

/** Duração de cada quadro da corrupção. */
const PASSO_CORRUPCAO = 110;
/** Duração de cada linha do terminal. */
const PASSO_LINHA = 130;

export function BootSequence({
  movimentoReduzido, aoTerminar,
}: {
  movimentoReduzido: boolean;
  aoTerminar: () => void;
}) {
  const [ato, setAto] = useState<0 | 1 | 2>(0);
  const [quadro, setQuadro] = useState(0);
  const [linhas, setLinhas] = useState(0);

  const terminarRef = useRef(aoTerminar);
  terminarRef.current = aoTerminar;

  // Pular: clique, Esc ou Enter. Registrado uma vez, removido no cleanup.
  useEffect(() => {
    const pular = () => terminarRef.current();
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') pular();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, []);

  /*
   * Movimento reduzido: nada de sequência. Mostra o cartão final e segue
   * sozinho depois de um respiro curto.
   */
  useEffect(() => {
    if (!movimentoReduzido) return;
    const t = setTimeout(() => terminarRef.current(), 1200);
    return () => clearTimeout(t);
  }, [movimentoReduzido]);

  // Ato 1 — a corrupção do nome.
  useEffect(() => {
    if (movimentoReduzido || ato !== 0) return;
    if (quadro >= CORROMPENDO.length - 1) {
      const t = setTimeout(() => setAto(1), 260);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setQuadro(q => q + 1), PASSO_CORRUPCAO);
    return () => clearTimeout(t);
  }, [ato, quadro, movimentoReduzido]);

  // Ato 2 — o terminal.
  useEffect(() => {
    if (movimentoReduzido || ato !== 1) return;
    if (linhas >= LINHAS_TERMINAL.length) {
      const t = setTimeout(() => setAto(2), 200);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setLinhas(l => l + 1), PASSO_LINHA);
    return () => clearTimeout(t);
  }, [ato, linhas, movimentoReduzido]);

  // Ato 3 — os nomes, e então sai.
  useEffect(() => {
    if (movimentoReduzido || ato !== 2) return;
    const t = setTimeout(() => terminarRef.current(), 1150);
    return () => clearTimeout(t);
  }, [ato, movimentoReduzido]);

  if (movimentoReduzido) {
    return (
      <div
        className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-black text-center px-6"
        role="status"
      >
        <p className="creators-lab__rotulo" style={{ color: '#00E5FF' }}>ACESSO CONCEDIDO</p>
        <h1 className="text-3xl sm:text-5xl font-bold tracking-widest text-white">
          CREATORS LAB
        </h1>
        <p className="text-sm text-white/60 font-mono">KAUAN + CLEBER</p>
        <button className="creators-lab__btn mt-4" onClick={() => terminarRef.current()}
          style={{ color: '#fff', borderColor: '#00E5FF' }}>
          Entrar
        </button>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black cursor-pointer px-6"
      onClick={() => terminarRef.current()}
      role="button"
      tabIndex={0}
      aria-label="Pular abertura"
      onKeyDown={e => { if (e.key === 'Enter') terminarRef.current(); }}
    >
      {/* Varredura sobre tudo — some no movimento reduzido pela media query. */}
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{ background: 'repeating-linear-gradient(0deg, rgba(0,0,0,.5) 0 1px, transparent 1px 3px)' }}
      />

      {ato === 0 && (
        <h1
          className="font-mono text-2xl sm:text-4xl md:text-5xl font-bold tracking-[.2em] text-center"
          style={{
            color: quadro >= 3 ? '#FF2E97' : '#D6F5FF',
            textShadow: quadro >= 2 ? '0 0 24px rgba(255,46,151,.7)' : '0 0 14px rgba(0,229,255,.4)',
            transform: quadro >= 2 ? `translateX(${quadro % 2 ? -3 : 3}px)` : undefined,
          }}
        >
          {CORROMPENDO[quadro]}
        </h1>
      )}

      {ato === 1 && (
        <div className="font-mono text-xs sm:text-sm text-left w-full max-w-md">
          {LINHAS_TERMINAL.slice(0, linhas).map((l, i) => (
            <motion.p
              key={i}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.12 }}
              style={{ color: l.includes('granted') ? '#B6FF3C' : '#00E5FF' }}
              className="min-h-[1.3em]"
            >
              {l}
            </motion.p>
          ))}
        </div>
      )}

      {ato === 2 && (
        <div className="text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
            className="font-mono text-lg sm:text-2xl tracking-[.4em] text-[#D6F5FF]"
          >
            K A U A N
            <div className="my-2 text-[#FF2E97] text-base">+</div>
            C L E B E R
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, letterSpacing: '.05em' }}
            animate={{ opacity: 1, letterSpacing: '.28em' }}
            transition={{ delay: 0.35, duration: 0.5 }}
            className="mt-8 font-mono text-2xl sm:text-4xl font-bold text-[#00E5FF]"
            style={{ textShadow: '0 0 30px rgba(0,229,255,.6)' }}
          >
            CREATORS LAB
          </motion.h1>
        </div>
      )}

      <p className="absolute bottom-6 left-0 right-0 text-center font-mono text-[10px] tracking-widest text-white/25">
        clique para pular
      </p>
    </div>
  );
}

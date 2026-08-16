/**
 * BootSequence — a abertura, logo depois do escurecimento.
 * ─────────────────────────────────────────────────────────────────────────────
 * Três atos: o nome do sistema se corrompendo, o terminal reconhecendo a
 * invasão, e os criadores aparecendo.
 *
 * ## Sobre o ritmo
 *
 * A primeira versão passava em 2,6 s e parecia engasgo: o nome se desmanchava
 * antes de o olho ler o primeiro quadro, e as seis linhas do terminal
 * apareciam praticamente juntas. Agora cada quadro fica ~0,3 s e cada linha
 * ~0,34 s, com respiro entre os atos — perto de 7 s no total.
 *
 * Sete segundos é muito para algo que se repete? Seria, se não desse para
 * pular. Dá: clique, Esc, Enter ou espaço, a qualquer momento, e o aviso está
 * escrito na tela desde o primeiro quadro.
 *
 * Se você mexer nas constantes de tempo, mexa nelas — não espalhe números pelo
 * meio dos efeitos.
 *
 * ## Movimento reduzido
 *
 * A sequência não é encurtada: ela é SUBSTITUÍDA por um cartão estático com o
 * mesmo texto. Piscar rápido é exatamente o que a preferência pede para
 * evitar, então acelerar seria piorar.
 *
 * Vale lembrar que, desde 16/08/2026, `movimentoReduzido` só é verdadeiro
 * quando a PESSOA escolheu — a preferência do sistema operacional passou a
 * apenas oferecer. Ver o cabeçalho de `theme/CreatorsProvider.tsx`.
 */
import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

/** Os estágios de corrupção do nome. O último é ruído puro. */
const CORROMPENDO = [
  'GESTÃO DE ACORDOS',
  'GEST_O DE ACORDOS',
  'GESTÃO D_ AC_RDOS',
  'G_STÃO D_ AC_R_OS',
  '█▓▒░ ▓█▒░▓ ▒░█▓',
];

const LINHAS_TERMINAL = [
  '> entrada inesperada no elemento de marca',
  '> verificando credenciais................ ok',
  '> varrendo rotas nao declaradas.......... 1',
  '> setor oculto localizado',
  '> acesso de desenvolvedor concedido',
  '',
  '> carregando creators...',
];

/** Duração de cada quadro da corrupção. */
const PASSO_CORRUPCAO = 300;
/** Duração de cada linha do terminal. */
const PASSO_LINHA = 340;
/** Respiro entre o ato 1 e o ato 2. */
const PAUSA_ATO_1 = 620;
/** Respiro entre o ato 2 e o ato 3. */
const PAUSA_ATO_2 = 480;
/** Quanto tempo os nomes ficam na tela antes de o Lab aparecer. */
const DURACAO_ATO_3 = 2400;
/** No modo reduzido não há sequência: só o cartão, e um respiro. */
const ESPERA_REDUZIDO = 1800;

const AMARELO = '#FCEE0A';
const CIANO   = '#02D7F2';
const VERMELHO = '#FF003C';

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

  // Pular: clique, Esc, Enter ou espaço. Registrado uma vez, removido no
  // cleanup.
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') terminarRef.current();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, []);

  /*
   * Movimento reduzido: nada de sequência. Mostra o cartão final e segue
   * sozinho depois de um respiro.
   */
  useEffect(() => {
    if (!movimentoReduzido) return;
    const t = setTimeout(() => terminarRef.current(), ESPERA_REDUZIDO);
    return () => clearTimeout(t);
  }, [movimentoReduzido]);

  // Ato 1 — a corrupção do nome.
  useEffect(() => {
    if (movimentoReduzido || ato !== 0) return;
    if (quadro >= CORROMPENDO.length - 1) {
      const t = setTimeout(() => setAto(1), PAUSA_ATO_1);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setQuadro(q => q + 1), PASSO_CORRUPCAO);
    return () => clearTimeout(t);
  }, [ato, quadro, movimentoReduzido]);

  // Ato 2 — o terminal.
  useEffect(() => {
    if (movimentoReduzido || ato !== 1) return;
    if (linhas >= LINHAS_TERMINAL.length) {
      const t = setTimeout(() => setAto(2), PAUSA_ATO_2);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setLinhas(l => l + 1), PASSO_LINHA);
    return () => clearTimeout(t);
  }, [ato, linhas, movimentoReduzido]);

  // Ato 3 — os nomes, e então sai.
  useEffect(() => {
    if (movimentoReduzido || ato !== 2) return;
    const t = setTimeout(() => terminarRef.current(), DURACAO_ATO_3);
    return () => clearTimeout(t);
  }, [ato, movimentoReduzido]);

  if (movimentoReduzido) {
    return (
      <div
        className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-black px-6 text-center"
        role="status"
      >
        <p className="creators-lab__rotulo" style={{ color: CIANO }}>ACESSO CONCEDIDO</p>
        <h1 className="text-3xl font-bold tracking-widest text-white sm:text-5xl">
          CREATORS LAB
        </h1>
        <p className="font-mono text-sm text-white/60">KAUAN + CLEBER</p>
        <button
          className="creators-lab__btn mt-4"
          onClick={() => terminarRef.current()}
          style={{ color: '#fff', borderColor: AMARELO }}
        >
          Entrar
        </button>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex cursor-pointer items-center justify-center bg-black px-6"
      onClick={() => terminarRef.current()}
      role="button"
      tabIndex={0}
      aria-label="Pular abertura"
      onKeyDown={e => { if (e.key === 'Enter') terminarRef.current(); }}
    >
      {/* Varredura sobre tudo. */}
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{ background: 'repeating-linear-gradient(0deg, rgba(0,0,0,.5) 0 1px, transparent 1px 3px)' }}
      />

      {/* Faixa de perigo no alto e embaixo: a moldura do mundo Cyberpunk,
          presente antes mesmo de a realidade ser escolhida. */}
      <div className="creators-lab__tarja pointer-events-none absolute inset-x-0 top-0" />
      <div className="creators-lab__tarja pointer-events-none absolute inset-x-0 bottom-0" />

      {ato === 0 && (
        <h1
          className="text-center font-mono text-2xl font-bold tracking-[.2em] sm:text-4xl md:text-5xl"
          style={{
            color: quadro >= 3 ? VERMELHO : quadro >= 1 ? AMARELO : '#F2F2F2',
            /* A separação de canais cresce junto com a corrupção: no primeiro
               quadro o nome está inteiro, no último ele já se desfez. */
            textShadow: quadro === 0
              ? 'none'
              : `${quadro}px 0 ${CIANO}, -${quadro}px 0 ${VERMELHO}`,
            transform: quadro >= 2 ? `translateX(${quadro % 2 ? -4 : 4}px)` : undefined,
            transition: 'color .18s linear',
          }}
        >
          {CORROMPENDO[quadro]}
        </h1>
      )}

      {ato === 1 && (
        <div className="w-full max-w-lg text-left font-mono text-xs sm:text-sm">
          {LINHAS_TERMINAL.slice(0, linhas).map((l, i) => (
            <motion.p
              key={i}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.22 }}
              style={{ color: l.includes('concedido') ? AMARELO : CIANO }}
              className="min-h-[1.45em]"
            >
              {l}
            </motion.p>
          ))}

          {/* Barra de carga: cresce com as linhas, então mede alguma coisa de
              verdade em vez de fingir progresso. */}
          <div className="mt-5 h-[3px] w-full bg-white/10">
            <motion.div
              className="h-full"
              style={{ background: AMARELO }}
              animate={{ width: `${(linhas / LINHAS_TERMINAL.length) * 100}%` }}
              transition={{ duration: PASSO_LINHA / 1000, ease: 'linear' }}
            />
          </div>
        </div>
      )}

      {ato === 2 && (
        <div className="text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="font-mono text-lg tracking-[.4em] text-[#F2F2F2] sm:text-2xl"
          >
            K A U A N
            <div className="my-3 text-base" style={{ color: VERMELHO }}>+</div>
            C L E B E R
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, letterSpacing: '.04em' }}
            animate={{ opacity: 1, letterSpacing: '.28em' }}
            transition={{ delay: 0.6, duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
            className="mt-10 font-mono text-2xl font-bold sm:text-4xl"
            style={{ color: AMARELO, textShadow: `0 0 34px rgba(252,238,10,.45)` }}
          >
            CREATORS LAB
          </motion.h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.5, duration: 0.6 }}
            className="mt-5 font-mono text-[.65rem] tracking-[.3em]"
            style={{ color: CIANO }}
          >
            ACESSO CONCEDIDO
          </motion.p>
        </div>
      )}

      <p className="absolute bottom-7 left-0 right-0 text-center font-mono text-[10px] tracking-widest text-white/30">
        clique, Esc ou espaço para pular
      </p>
    </div>
  );
}

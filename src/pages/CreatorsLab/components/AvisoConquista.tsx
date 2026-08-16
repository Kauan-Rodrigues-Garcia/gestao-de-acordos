/**
 * AvisoConquista — o cartão que aparece quando uma conquista cai.
 *
 * Consome a fila do provider: mostra a primeira, espera, avisa que mostrou, e a
 * próxima entra. Sem fila, duas conquistas simultâneas se sobreporiam e uma
 * sumiria sem ninguém ver.
 */
import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useCreators } from '../theme/CreatorsProvider';
import { CONQUISTAS } from '../lib/conquistas';

const TEMPO_NA_TELA = 3400;

export function AvisoConquista() {
  const { tokens, fila, avisou, movimentoReduzido } = useCreators();
  const atual = fila[0] ?? null;

  useEffect(() => {
    if (!atual) return;
    const t = setTimeout(() => avisou(atual), TEMPO_NA_TELA);
    return () => clearTimeout(t);
  }, [atual, avisou]);

  const conquista = atual ? CONQUISTAS.find(c => c.id === atual) : null;

  return (
    <AnimatePresence>
      {conquista && (
        <motion.div
          key={conquista.id}
          initial={movimentoReduzido ? { opacity: 0 } : { opacity: 0, y: 40, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ type: 'spring', stiffness: 320, damping: 24 }}
          className="creators-lab__painel fixed bottom-24 left-1/2 z-[92] flex -translate-x-1/2 items-center gap-3 px-5 py-3"
          style={{ borderColor: tokens.cores.acento }}
          role="status"
          aria-live="polite"
        >
          <span className="text-2xl" aria-hidden>{conquista.icone}</span>
          <div>
            <p className="creators-lab__rotulo" style={{ color: tokens.cores.secundaria }}>
              {tokens.id === 'arcade' ? 'NEW HIGH SCORE' : 'ACHIEVEMENT UNLOCKED'}
            </p>
            <p className="text-sm font-bold" style={{ color: tokens.cores.acento }}>
              {conquista.titulo}
            </p>
            <p className="text-xs" style={{ color: tokens.cores.textoSuave }}>
              {conquista.descricao}
            </p>
          </div>
          <button
            className="ml-2 text-xs opacity-60 hover:opacity-100"
            style={{ color: tokens.cores.texto }}
            onClick={() => avisou(conquista.id)}
            aria-label="Dispensar aviso"
          >
            ✕
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * Programa: Fliperama.
 *
 * A máquina, a ficha única, o ranking e a regra do jogo são os de sempre
 * (`sections/ArcadeCabinet.tsx`, `lib/fliperama.ts`). O que mora aqui é a
 * cortina que escurece o resto enquanto a câmera está em cima do gabinete.
 *
 * ## Por que a cortina é daqui
 *
 * Ela é `position: fixed`, e o corpo da janela é o bloco de contenção dos
 * elementos fixos de dentro dele (`contain: layout`, ver `creators-lab.css`).
 * Então "fixed inset-0" quer dizer "a janela inteira" — a cortina cobre o
 * conteúdo desta janela e mais nada, e o gabinete (`z-index: 61`) sobe por
 * cima dela no mesmo contexto de empilhamento.
 */
import { AnimatePresence, motion } from 'framer-motion';
import { ArcadeCabinet } from '../sections/ArcadeCabinet';
import { useCreators } from '../theme/CreatorsProvider';

export default function ProgramaFliperama() {
  const { maquinaEmFoco, movimentoReduzido } = useCreators();

  return (
    <>
      <AnimatePresence>
        {maquinaEmFoco && (
          <motion.div
            key="cortina"
            className="creators-lab__cortina"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: movimentoReduzido ? 0 : 0.8 }}
            aria-hidden="true"
          />
        )}
      </AnimatePresence>
      <ArcadeCabinet />
    </>
  );
}

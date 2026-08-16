/**
 * PainelConquistas e AvisoConquista.
 *
 * O painel lista tudo; as secretas aparecem como `🔒 ???` até caírem — mostrar
 * o nome de uma conquista secreta estraga o que ela tem de secreta.
 */
import { AnimatePresence, motion } from 'framer-motion';
import { useCreators } from '../theme/CreatorsProvider';
import { CONQUISTAS } from '../lib/conquistas';

export function PainelConquistas({
  aberto, aoFechar,
}: {
  aberto: boolean;
  aoFechar: () => void;
}) {
  const { tokens, desbloqueadas } = useCreators();
  const total = CONQUISTAS.length;
  const feitas = desbloqueadas.size;

  return (
    <AnimatePresence>
      {aberto && (
        <motion.div
          className="fixed inset-0 z-[85] flex items-center justify-center bg-black/80 p-5"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={aoFechar}
          role="dialog" aria-modal="true" aria-label="Conquistas"
        >
          <motion.div
            initial={{ scale: 0.94, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.94, opacity: 0 }}
            className="creators-lab__painel max-h-[80vh] w-full max-w-md overflow-y-auto p-5"
            onClick={e => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="creators-lab__rotulo" style={{ color: tokens.cores.secundaria }}>
                  {tokens.vocab.conquistas}
                </p>
                <p className="creators-lab__mono text-xs" style={{ color: tokens.cores.textoSuave }}>
                  {feitas} / {total}
                </p>
              </div>
              <button className="creators-lab__btn" onClick={aoFechar} autoFocus>
                {tokens.vocab.fechar}
              </button>
            </div>

            <div className="creators-lab__barra mb-5">
              <span style={{ width: `${(feitas / total) * 100}%` }} />
            </div>

            <ul className="space-y-2">
              {CONQUISTAS.map(c => {
                const feita = desbloqueadas.has(c.id);
                const escondida = c.secreta && !feita;
                return (
                  <li
                    key={c.id}
                    className="flex items-start gap-3 p-3"
                    style={{
                      border: `1px solid ${feita ? tokens.cores.primaria : tokens.cores.borda}`,
                      borderRadius: tokens.raio,
                      opacity: feita ? 1 : 0.55,
                    }}
                  >
                    <span className="text-xl" aria-hidden>{escondida ? '🔒' : c.icone}</span>
                    <div>
                      <p className="text-sm font-bold"
                         style={{ color: feita ? tokens.cores.acento : tokens.cores.textoSuave }}>
                        {escondida ? '???' : c.titulo}
                      </p>
                      <p className="text-xs" style={{ color: tokens.cores.textoSuave }}>
                        {escondida ? 'ainda não descoberta' : c.descricao}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

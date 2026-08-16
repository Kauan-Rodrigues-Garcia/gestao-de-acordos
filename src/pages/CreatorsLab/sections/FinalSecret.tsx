/**
 * FinalSecret — o botão proibido, o fim, e o segredo depois do fim.
 *
 * Quem clica em "voltar" recebe um "espere..." e, em vez da saída, a última
 * seção: como isto foi construído — com a pilha REAL do repositório, nada
 * aspiracional.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useCreators } from '../theme/CreatorsProvider';
import { SecaoLab } from '../components/SecaoLab';
import { PROJETO_REAL } from '../creators.config';
import { CLIQUES_PROIBIDOS } from '../lib/conquistas';

const AVISOS = ['Eu avisei.', 'Sério?', 'Você não aprende.', 'Tá bom.'];

function BotaoProibido() {
  const { tokens, progresso, registrar, movimentoReduzido } = useCreators();
  const [cliques, setCliques] = useState(progresso.cliquesProibidos);
  const [tremendo, setTremendo] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const clicar = useCallback(() => {
    const novo = Math.min(cliques + 1, CLIQUES_PROIBIDOS);
    setCliques(novo);
    registrar({ cliquesProibidos: novo });

    if (novo >= CLIQUES_PROIBIDOS && !movimentoReduzido) {
      setTremendo(true);
      // Divertido, não destrutivo: a página inteira treme por um instante e
      // volta ao normal sozinha.
      timerRef.current = setTimeout(() => setTremendo(false), 900);
    }
  }, [cliques, registrar, movimentoReduzido]);

  const passou = cliques >= CLIQUES_PROIBIDOS;

  return (
    <div className="creators-lab__painel p-6 text-center">
      <motion.div animate={tremendo ? { x: [0, -8, 8, -6, 6, 0], rotate: [0, -1, 1, 0] } : {}}
                  transition={{ duration: 0.5, repeat: tremendo ? 1 : 0 }}>
        <button
          type="button"
          onClick={clicar}
          className="creators-lab__btn"
          style={{
            borderColor: tokens.cores.secundaria,
            color: tokens.cores.secundaria,
            fontSize: '.9rem',
            padding: '.8rem 1.6rem',
          }}
          aria-describedby="aviso-proibido"
        >
          ⚠ DO NOT PRESS
        </button>
      </motion.div>

      <p id="aviso-proibido" className="creators-lab__mono mt-4 text-sm" aria-live="polite"
         style={{ color: tokens.cores.textoSuave, minHeight: '1.5em' }}>
        {cliques === 0 ? ' '
          : passou ? '🏆 LISTENING SKILLS: 0'
          : AVISOS[cliques - 1]}
      </p>
    </div>
  );
}

export function FinalSecret({ aoSair }: { aoSair: () => void }) {
  const { tokens, movimentoReduzido } = useCreators();
  const [fase, setFase] = useState<'fim' | 'espere' | 'segredo'>('fim');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const tentarSair = useCallback(() => {
    setFase('espere');
    timerRef.current = setTimeout(() => setFase('segredo'), 1100);
  }, []);

  const arcade = tokens.id === 'arcade';

  return (
    <>
      <SecaoLab
        id="proibido"
        rotulo={arcade ? 'SECRET STAGE' : 'RESTRICTED'}
        titulo={arcade ? 'DO NOT PRESS' : 'BOTÃO PROIBIDO'}
        descricao="Não aperte. É sério."
      >
        <BotaoProibido />
      </SecaoLab>

      <SecaoLab id="fim" rotulo="END OF LINE" titulo="THE END.">
        <div className="creators-lab__painel p-8 text-center">
          <AnimatePresence mode="wait">
            {fase === 'fim' && (
              <motion.div key="fim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <p className="text-sm" style={{ color: tokens.cores.textoSuave }}>
                  Obrigado por explorar nosso cantinho do sistema.
                </p>
                <button className="creators-lab__btn mt-5" onClick={tentarSair}>
                  {arcade ? '◀ QUIT GAME' : '[ RETURN TO GESTÃO ]'}
                </button>
              </motion.div>
            )}

            {fase === 'espere' && (
              <motion.p
                key="espere"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="creators-lab__mono text-lg tracking-[.3em]"
                style={{ color: tokens.cores.secundaria }}
              >
                WAIT...
              </motion.p>
            )}

            {fase === 'segredo' && (
              <motion.div
                key="segredo"
                initial={movimentoReduzido ? { opacity: 0 } : { opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
              >
                <p className="creators-lab__mono text-xs" style={{ color: tokens.cores.textoSuave }}>
                  Since you're still here...
                </p>
                <h3 className="mt-3 text-2xl font-bold" style={{ color: tokens.cores.primaria }}>
                  HOW WE BUILT THIS
                </h3>

                {/* Pilha REAL — conferida no package.json do repositório. */}
                <div className="mt-5 flex flex-wrap justify-center gap-1.5">
                  {PROJETO_REAL.stack.map(t => (
                    <span key={t} className="creators-lab__mono px-2 py-1 text-[.62rem]"
                          style={{
                            border: `1px solid ${tokens.cores.borda}`,
                            borderRadius: tokens.raio,
                            color: tokens.cores.acento,
                          }}>
                      {t}
                    </span>
                  ))}
                </div>

                <div className="creators-lab__ficha mx-auto mt-6 max-w-sm text-left">
                  {([
                    ['3D', 'Canvas 2D e projeção escrita à mão'],
                    ['partículas', 'Canvas, um laço só'],
                    ['animação', 'Framer Motion (já no projeto)'],
                    ['temas', 'variáveis CSS num escopo isolado'],
                    ['terminal', 'lista branca — nada é executado'],
                    ['bibliotecas novas', 'nenhuma'],
                  ] as const).map(([k, v]) => (
                    <div key={k} className="flex items-baseline">
                      <dt>{k}</dt>
                      <span className="creators-lab__pontilhado" />
                      <dd style={{ color: tokens.cores.texto }}>{v}</dd>
                    </div>
                  ))}
                </div>

                <p className="mt-6 text-xs" style={{ color: tokens.cores.textoSuave }}>
                  Nenhuma dependência foi instalada para construir esta página.
                </p>

                <button className="creators-lab__btn mt-6" onClick={aoSair}>
                  {arcade ? '◀ QUIT FOR REAL' : '[ AGORA SIM, VOLTAR ]'}
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </SecaoLab>
    </>
  );
}

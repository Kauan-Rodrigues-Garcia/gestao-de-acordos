/**
 * ProjectArchive — os projetos, com os que rodam abrindo aqui dentro.
 *
 * Clicar num projeto expande a ficha no lugar (não abre modal): a lista
 * continua visível, e dá para pular de um projeto a outro sem fechar nada.
 * Quando o projeto tem `miniApp`, a aplicação aparece funcionando dentro da
 * própria ficha.
 */
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useCreators } from '../theme/CreatorsProvider';
import { SecaoLab } from '../components/SecaoLab';
import { CalculadoraDesconto, ContadorDiasUteis } from '../components/MiniApps';
import { PROJETOS } from '../creators.config';

export function ProjectArchive() {
  const { tokens, movimentoReduzido, registrar } = useCreators();
  const [aberto, setAberto] = useState<string | null>(null);
  const arcade = tokens.id === 'arcade';

  return (
    <SecaoLab
      id="projetos"
      rotulo={tokens.vocab.projetos}
      titulo={arcade ? 'GAME LIBRARY' : 'PROJECT ARCHIVE'}
      descricao="Dois destes rodam aqui dentro. Não são capturas de tela."
    >
      <div className="grid gap-3 sm:grid-cols-3">
        {PROJETOS.map((p, i) => {
          const ativo = aberto === p.id;
          return (
            <motion.button
              key={p.id}
              type="button"
              onClick={() => {
                const novo = ativo ? null : p.id;
                setAberto(novo);
                if (novo) registrar({ itensAbertos: [`projeto:${p.id}`] });
              }}
              initial={movimentoReduzido ? false : { opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
              whileHover={movimentoReduzido ? undefined : { y: -4 }}
              className="creators-lab__painel p-4 text-left"
              style={{ borderColor: ativo ? tokens.cores.primaria : tokens.cores.borda }}
              aria-expanded={ativo}
              aria-controls={`projeto-${p.id}`}
            >
              <span className="text-2xl" aria-hidden>{p.simbolo}</span>
              <span className="mt-2 block text-sm font-bold" style={{ color: tokens.cores.texto }}>
                {p.nome}
              </span>
              <span className="mt-1 block text-xs" style={{ color: tokens.cores.textoSuave }}>
                {p.resumo}
              </span>
              {p.miniApp && (
                <span
                  className="creators-lab__mono mt-2 inline-block text-[.58rem] tracking-widest"
                  style={{ color: tokens.cores.acento }}
                >
                  ▶ {arcade ? 'PLAYABLE' : 'EXECUTÁVEL'}
                </span>
              )}
            </motion.button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        {aberto && (() => {
          const p = PROJETOS.find(x => x.id === aberto)!;
          return (
            <motion.div
              key={p.id}
              id={`projeto-${p.id}`}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.28 }}
              className="overflow-hidden"
            >
              <div className="creators-lab__painel mt-4 grid gap-6 p-6 md:grid-cols-2">
                <div>
                  <h3 className="text-lg font-bold" style={{ color: tokens.cores.primaria }}>
                    {p.simbolo} {p.nome}
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed" style={{ color: tokens.cores.textoSuave }}>
                    {p.descricao}
                  </p>

                  <dl className="creators-lab__ficha mt-4 space-y-2">
                    <div>
                      <dt>desafio</dt>
                      <dd className="text-xs" style={{ color: tokens.cores.texto }}>{p.desafio}</dd>
                    </div>
                    <div>
                      <dt>solução</dt>
                      <dd className="text-xs" style={{ color: tokens.cores.texto }}>{p.solucao}</dd>
                    </div>
                  </dl>

                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {p.tecnologias.map(t => (
                      <span
                        key={t}
                        className="creators-lab__mono px-2 py-0.5 text-[.6rem]"
                        style={{
                          border: `1px solid ${tokens.cores.borda}`,
                          borderRadius: tokens.raio,
                          color: tokens.cores.acento,
                        }}
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  {p.miniApp ? (
                    <>
                      <p className="creators-lab__rotulo mb-3" style={{ color: tokens.cores.secundaria }}>
                        {arcade ? 'PLAY' : 'DEMO AO VIVO'}
                      </p>
                      {p.miniApp === 'calculadora-desconto' && <CalculadoraDesconto />}
                      {p.miniApp === 'dias-uteis' && <ContadorDiasUteis />}
                    </>
                  ) : (
                    <div
                      className="flex h-full min-h-[180px] items-center justify-center p-6 text-center"
                      style={{
                        border: `1px dashed ${tokens.cores.borda}`,
                        borderRadius: tokens.raio,
                      }}
                    >
                      <p className="creators-lab__mono text-xs" style={{ color: tokens.cores.textoSuave }}>
                        Você está usando este projeto agora mesmo.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })()}
      </AnimatePresence>
    </SecaoLab>
  );
}

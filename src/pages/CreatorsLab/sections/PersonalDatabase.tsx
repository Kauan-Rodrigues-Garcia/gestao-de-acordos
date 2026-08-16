/**
 * PersonalDatabase — filmes, jogos, música e o resto.
 *
 * Os itens abrem com `layoutId`: o cartão pequeno VIRA o painel grande, em vez
 * de um modal aparecer por cima. É a mesma técnica de FLIP que o prompt pede, e
 * o framer-motion já faz — não precisa de biblioteca nova.
 *
 * Enquanto o conteúdo pessoal não for informado, a seção mostra a lacuna e diz
 * onde preencher. Nada aqui é inventado.
 */
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useCreators } from '../theme/CreatorsProvider';
import { SecaoLab, Pendente } from '../components/SecaoLab';
import { CRIADORES, type ItemInteresse } from '../creators.config';

function Item({ item, aoAbrir }: { item: ItemInteresse; aoAbrir: () => void }) {
  const { tokens, movimentoReduzido } = useCreators();
  return (
    <motion.button
      layoutId={`item-${item.id}`}
      type="button"
      onClick={aoAbrir}
      whileHover={movimentoReduzido ? undefined : { y: -5, scale: 1.03 }}
      className="creators-lab__painel flex aspect-[2/3] flex-col items-center justify-center gap-2 p-3"
      aria-label={`Abrir ${item.titulo}`}
    >
      {item.imagem
        ? <img src={item.imagem} alt="" className="h-full w-full object-cover" loading="lazy" />
        : <span className="text-3xl" aria-hidden>{item.simbolo}</span>}
      <span className="creators-lab__mono text-center text-[.6rem] leading-tight"
            style={{ color: tokens.cores.textoSuave }}>
        {item.titulo}
      </span>
    </motion.button>
  );
}

export function PersonalDatabase() {
  const { tokens, registrar } = useCreators();
  const [aberto, setAberto] = useState<ItemInteresse | null>(null);
  const arcade = tokens.id === 'arcade';

  const todos = CRIADORES.flatMap(c =>
    c.categorias.flatMap(cat => cat.itens.map(i => ({ ...i, dono: c.nome, cat }))));

  return (
    <SecaoLab
      id="database"
      rotulo={tokens.vocab.interesses}
      titulo={arcade ? 'CARTRIDGE LIBRARY' : 'PERSONAL DATABASE'}
      descricao="O que a gente vê, joga e ouve quando não está tabulando acordo."
    >
      {todos.length === 0 ? (
        <div className="creators-lab__painel p-6 text-center">
          <Pendente oQue="filmes, jogos, música e livros de Kauan e Cleber" />
          <p className="mt-3 text-xs" style={{ color: tokens.cores.textoSuave }}>
            Preencha os arrays <code className="creators-lab__mono">itens</code> em{' '}
            <code className="creators-lab__mono">creators.config.ts</code> e eles
            aparecem aqui automaticamente, nos dois temas.
          </p>
        </div>
      ) : (
        <>
          {CRIADORES.map(c => {
            const doCriador = c.categorias.filter(cat => cat.itens.length > 0);
            if (!doCriador.length) return null;
            return (
              <div key={c.id} className="mb-8">
                <p className="creators-lab__rotulo mb-3" style={{ color: tokens.cores.acento }}>
                  {c.nome}
                </p>
                {doCriador.map(cat => (
                  <div key={cat.id} className="mb-5">
                    <p className="creators-lab__mono mb-2 text-[.62rem]"
                       style={{ color: tokens.cores.textoSuave }}>
                      {cat.icone} {arcade ? cat.rotuloArcade : cat.rotuloCyber}
                    </p>
                    <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 md:grid-cols-6">
                      {cat.itens.map(item => (
                        <Item
                          key={item.id}
                          item={item}
                          aoAbrir={() => {
                            setAberto(item);
                            registrar({ itensAbertos: [item.id], totalItens: todos.length });
                          }}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            );
          })}

          <AnimatePresence>
            {aberto && (
              <motion.div
                className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-5"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => setAberto(null)}
                role="dialog" aria-modal="true" aria-label={aberto.titulo}
              >
                <motion.div
                  layoutId={`item-${aberto.id}`}
                  className="creators-lab__painel max-w-lg p-6"
                  onClick={e => e.stopPropagation()}
                >
                  <div className="flex items-start gap-4">
                    <span className="text-4xl" aria-hidden>{aberto.simbolo}</span>
                    <div>
                      <h3 className="text-lg font-bold" style={{ color: tokens.cores.primaria }}>
                        {aberto.titulo}
                      </h3>
                      {aberto.nota !== undefined && (
                        <p className="creators-lab__mono text-xs" style={{ color: tokens.cores.acento }}>
                          {arcade ? 'SCORE' : 'RATING'} {aberto.nota}/10
                        </p>
                      )}
                    </div>
                  </div>
                  <p className="mt-4 text-sm" style={{ color: tokens.cores.textoSuave }}>
                    {aberto.descricao}
                  </p>
                  <p className="mt-3 text-sm" style={{ color: tokens.cores.texto }}>
                    <strong style={{ color: tokens.cores.secundaria }}>Por quê: </strong>
                    {aberto.porQue}
                  </p>
                  {aberto.curiosidade && (
                    <p className="creators-lab__mono mt-3 text-xs" style={{ color: tokens.cores.textoSuave }}>
                      ▸ {aberto.curiosidade}
                    </p>
                  )}
                  <button className="creators-lab__btn mt-5" onClick={() => setAberto(null)} autoFocus>
                    {tokens.vocab.fechar}
                  </button>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </SecaoLab>
  );
}

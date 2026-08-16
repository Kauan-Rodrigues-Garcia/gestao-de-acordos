/**
 * CreatorsHero — a abertura do conteúdo, com os dois cartões e o explorador.
 *
 * O explorador de perfil não é um texto longo: é um grafo em que o criador fica
 * no centro e as categorias orbitam. Clicar num nó revela o conteúdo daquela
 * categoria. As posições dos nós vêm de `pontoOrbital` — a mesma função que o
 * Math Lab demonstra depois, o que é meio da graça.
 */
import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useCreators } from '../theme/CreatorsProvider';
import { CartaoCriador } from '../components/CartaoCriador';
import { NucleoHolografico } from '../components/NucleoHolografico';
import { Pendente } from '../components/SecaoLab';
import { pontoOrbital, TAU } from '../lib/matematica';
import { CRIADORES, PROJETO_REAL, estaPendente, textoPendente } from '../creators.config';

const RAIO_ORBITA = 118;

function ExploradorPerfil({ idCriador }: { idCriador: 'kauan' | 'cleber' }) {
  const { tokens, movimentoReduzido, registrar } = useCreators();
  const criador = CRIADORES.find(c => c.id === idCriador)!;
  const [ativa, setAtiva] = useState<string | null>(null);

  // Os nós distribuídos igualmente na circunferência: θ = i · 2π / n.
  const nos = useMemo(() => criador.categorias.map((cat, i) => {
    const angulo = (i / criador.categorias.length) * TAU - Math.PI / 2;
    const p = pontoOrbital(0, 0, RAIO_ORBITA, angulo, 0.62);
    return { cat, x: p.x, y: p.y };
  }), [criador.categorias]);

  const categoriaAtiva = criador.categorias.find(c => c.id === ativa) ?? null;
  const arcade = tokens.id === 'arcade';

  return (
    <div className="mt-10">
      <div className="relative mx-auto h-[290px] w-full max-w-md">
        {/* Centro */}
        <div
          className="absolute left-1/2 top-1/2 flex h-24 w-24 -translate-x-1/2 -translate-y-1/2 items-center justify-center text-center"
          style={{
            border: `${tokens.bordaLargura} solid ${tokens.cores.primaria}`,
            borderRadius: arcade ? 0 : '50%',
            background: tokens.cores.fundoAlt,
          }}
        >
          <span className="creators-lab__mono text-sm font-bold" style={{ color: tokens.cores.primaria }}>
            {criador.nome.toUpperCase()}
          </span>
        </div>

        {nos.map(({ cat, x, y }, i) => {
          const selecionado = ativa === cat.id;
          const vazia = cat.itens.length === 0;
          return (
            <div key={cat.id} className="absolute left-1/2 top-1/2" style={{ transform: 'translate(-50%,-50%)' }}>
              {/* Linha ligando o nó ao centro. SVG por cima de posição absoluta
                  seria mais trabalho do que uma div girada. */}
              <span
                aria-hidden
                className="absolute origin-left"
                style={{
                  width: Math.hypot(x, y),
                  height: 1,
                  background: selecionado ? tokens.cores.primaria : tokens.cores.borda,
                  transform: `rotate(${Math.atan2(y, x)}rad)`,
                  opacity: selecionado ? 0.9 : 0.35,
                }}
              />
              <motion.button
                type="button"
                onClick={() => {
                  const novo = selecionado ? null : cat.id;
                  setAtiva(novo);
                  if (novo) registrar({ itensAbertos: [`${idCriador}:${cat.id}`] });
                }}
                initial={movimentoReduzido ? false : { opacity: 0, scale: 0.6 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: 0.1 + i * 0.07 }}
                whileHover={movimentoReduzido ? undefined : { scale: 1.12 }}
                className="relative flex h-14 w-14 items-center justify-center text-lg"
                style={{
                  transform: `translate(${x}px, ${y}px) translate(-50%,-50%)`,
                  border: `${tokens.bordaLargura} solid ${selecionado ? tokens.cores.primaria : tokens.cores.borda}`,
                  borderRadius: arcade ? 0 : '50%',
                  background: selecionado ? tokens.cores.primaria : tokens.cores.superficie,
                  color: selecionado ? tokens.cores.fundo : tokens.cores.texto,
                  opacity: vazia ? 0.55 : 1,
                }}
                aria-label={`${arcade ? cat.rotuloArcade : cat.rotuloCyber}${vazia ? ' (sem conteúdo ainda)' : ''}`}
                aria-pressed={selecionado}
              >
                {cat.icone}
              </motion.button>
            </div>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        {categoriaAtiva && (
          <motion.div
            key={categoriaAtiva.id}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22 }}
            className="creators-lab__painel mt-4 p-5"
          >
            <p className="creators-lab__rotulo" style={{ color: tokens.cores.secundaria }}>
              {arcade ? categoriaAtiva.rotuloArcade : categoriaAtiva.rotuloCyber}
            </p>
            {categoriaAtiva.itens.length === 0 ? (
              <div className="mt-3">
                <Pendente oQue={`itens de ${categoriaAtiva.id} do ${criador.nome}`} />
                <p className="mt-2 text-xs" style={{ color: tokens.cores.textoSuave }}>
                  Preencha em <code className="creators-lab__mono">creators.config.ts</code>.
                </p>
              </div>
            ) : (
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {categoriaAtiva.itens.map(item => (
                  <li key={item.id} className="creators-lab__mono text-xs" style={{ color: tokens.cores.texto }}>
                    {item.simbolo} {item.titulo}
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function CreatorsHero() {
  const { tokens, movimentoReduzido } = useCreators();
  const [aberto, setAberto] = useState<'kauan' | 'cleber' | null>(null);
  const arcade = tokens.id === 'arcade';

  const criadorAberto = CRIADORES.find(c => c.id === aberto) ?? null;

  return (
    <section id="creators" aria-labelledby="creators-titulo">
      {/* Título + núcleo 3D lado a lado */}
      <div className="flex flex-col items-center gap-8 lg:flex-row lg:justify-between">
        <div className="text-center lg:text-left">
          <p className="creators-lab__rotulo" style={{ color: tokens.cores.secundaria }}>
            {arcade ? 'INSERT COIN' : 'GDA://CREATORS'}
          </p>
          <h1
            id="creators-titulo"
            className="mt-3 text-4xl font-bold sm:text-6xl"
            style={{ color: tokens.cores.primaria }}
          >
            {arcade ? 'SELECT YOUR' : 'THE'}
            <br />
            {arcade ? 'DEVELOPER' : 'CREATORS'}
          </h1>
          <p className="mt-4 max-w-md text-sm" style={{ color: tokens.cores.textoSuave }}>
            Dois desenvolvedores, um sistema de cobrança com{' '}
            <strong style={{ color: tokens.cores.acento }}>
              {PROJETO_REAL.commitsTotal} commits
            </strong>{' '}
            e uma área que ninguém deveria ter encontrado.
          </p>
        </div>

        <div className="shrink-0" aria-hidden={movimentoReduzido ? undefined : false}>
          <NucleoHolografico
            cor={tokens.cores.primaria}
            corSecundaria={tokens.cores.secundaria}
            tamanho={movimentoReduzido ? 190 : 250}
            movimentoReduzido={movimentoReduzido}
          />
        </div>
      </div>

      {/* Os dois cartões */}
      <div className="mt-14 flex flex-col items-center justify-center gap-6 md:flex-row md:items-stretch">
        {CRIADORES.map((c, i) => (
          <CartaoCriador
            key={c.id}
            criador={c}
            indice={i}
            selecionado={aberto === c.id}
            aoAbrir={() => setAberto(aberto === c.id ? null : c.id)}
          />
        ))}
      </div>

      {/* Perfil expandido */}
      <AnimatePresence mode="wait">
        {criadorAberto && (
          <motion.div
            key={criadorAberto.id}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="creators-lab__painel mt-8 p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="creators-lab__rotulo" style={{ color: tokens.cores.secundaria }}>
                    {tokens.vocab.perfis}
                  </p>
                  <h3 className="mt-1 text-xl font-bold" style={{ color: tokens.cores.texto }}>
                    {criadorAberto.nome}
                  </h3>
                </div>
                <button
                  className="creators-lab__btn"
                  onClick={() => setAberto(null)}
                  aria-label="Fechar perfil"
                >
                  {tokens.vocab.fechar}
                </button>
              </div>

              <div className="mt-4">
                {estaPendente(criadorAberto.sobre)
                  ? <Pendente oQue={textoPendente(criadorAberto.sobre)} />
                  : <p className="text-sm leading-relaxed" style={{ color: tokens.cores.textoSuave }}>
                      {criadorAberto.sobre}
                    </p>}
              </div>

              {/* Curiosidades */}
              <div className="mt-5">
                <p className="creators-lab__rotulo mb-2" style={{ color: tokens.cores.acento }}>
                  {arcade ? 'TRIVIA' : 'NOTES'}
                </p>
                <ul className="space-y-1.5">
                  {criadorAberto.curiosidades.map((c, i) => (
                    <li key={i} className="text-sm">
                      {estaPendente(c)
                        ? <Pendente oQue={textoPendente(c)} />
                        : <span style={{ color: tokens.cores.textoSuave }}>— {c}</span>}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Golpe especial — a piada do Arcade, que o Cyberpunk chama de outra coisa */}
              <div className="mt-5">
                <p className="creators-lab__rotulo mb-1" style={{ color: tokens.cores.secundaria }}>
                  {arcade ? 'SPECIAL MOVE' : 'SIGNATURE'}
                </p>
                {estaPendente(criadorAberto.golpeEspecial)
                  ? <Pendente oQue={textoPendente(criadorAberto.golpeEspecial)} />
                  : <code className="creators-lab__mono text-sm" style={{ color: tokens.cores.acento }}>
                      {criadorAberto.golpeEspecial}
                    </code>}
              </div>

              <ExploradorPerfil idCriador={criadorAberto.id} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

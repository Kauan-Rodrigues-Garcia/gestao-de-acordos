/**
 * CartaoCriador — o cartão que reage ao mouse.
 * ─────────────────────────────────────────────────────────────────────────────
 * A inclinação sai de `inclinacaoDoCard`, que converte a posição do cursor
 * dentro do cartão para dois ângulos. A conta está em `lib/matematica.ts`, com
 * teste — inclusive o do sinal invertido, que é a diferença entre o cartão
 * encarar o cursor e fugir dele.
 *
 * A profundidade não é truque de sombra: cada camada recebe `translateZ`
 * diferente dentro de um `preserve-3d`, então foto, nome e selo se deslocam em
 * velocidades distintas quando o cartão gira. É paralaxe de verdade.
 *
 * No toque não há hover: o cartão fica reto e a interação vira o clique que
 * abre o perfil. Com movimento reduzido, idem.
 */
import { useCallback, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useCreators } from '../theme/CreatorsProvider';
import { inclinacaoDoCard, normalizarNoRetangulo } from '../lib/matematica';
import { estaPendente, textoPendente, type Criador } from '../creators.config';
import { Pendente } from './SecaoLab';

export function CartaoCriador({
  criador, indice, aoAbrir, selecionado,
}: {
  criador: Criador;
  indice: number;
  aoAbrir: () => void;
  selecionado: boolean;
}) {
  const { tokens, movimentoReduzido } = useCreators();
  const arcade = tokens.id === 'arcade';
  const ref = useRef<HTMLDivElement | null>(null);
  const [giro, setGiro] = useState({ rotacaoX: 0, rotacaoY: 0 });
  const [brilho, setBrilho] = useState({ x: 50, y: 50 });

  const aoMover = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (movimentoReduzido || e.pointerType === 'touch') return;
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const { nx, ny } = normalizarNoRetangulo(e.clientX - r.left, e.clientY - r.top, r.width, r.height);
    setGiro(inclinacaoDoCard(nx, ny, arcade ? 5 : 9));
    setBrilho({ x: ((nx + 1) / 2) * 100, y: ((ny + 1) / 2) * 100 });
  }, [movimentoReduzido, arcade]);

  const aoSair = useCallback(() => {
    setGiro({ rotacaoX: 0, rotacaoY: 0 });
    setBrilho({ x: 50, y: 50 });
  }, []);

  const temFoto = !!criador.foto;
  const papelPendente = estaPendente(criador.papel);
  const taglinePendente = estaPendente(criador.tagline);

  return (
    <div className="creators-lab__cena w-full max-w-sm">
      <motion.div
        ref={ref}
        onPointerMove={aoMover}
        onPointerLeave={aoSair}
        onClick={aoAbrir}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); aoAbrir(); } }}
        role="button"
        tabIndex={0}
        aria-label={`Abrir perfil de ${criador.nome}`}
        aria-pressed={selecionado}
        initial={movimentoReduzido ? false : { opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ delay: indice * 0.12, duration: 0.45 }}
        animate={{ rotateX: giro.rotacaoX, rotateY: giro.rotacaoY }}
        className="creators-lab__card3d creators-lab__painel relative cursor-pointer overflow-hidden p-6"
        style={{
          borderColor: selecionado ? tokens.cores.primaria : tokens.cores.borda,
          boxShadow: selecionado
            ? `0 0 0 1px ${tokens.cores.primaria}, ${tokens.sombra}`
            : tokens.sombra,
        }}
      >
        {/* Reflexo que segue o cursor. Fica atrás do conteúdo. */}
        {!movimentoReduzido && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 transition-opacity duration-300"
            style={{
              background: `radial-gradient(260px circle at ${brilho.x}% ${brilho.y}%, ${tokens.cores.brilho}, transparent 70%)`,
              opacity: 0.55,
            }}
          />
        )}

        {/* Identificação — SUBJECT_01 no Cyberpunk, PLAYER 1 no Arcade. */}
        <div className="creators-lab__camada relative flex items-center justify-between" style={{ '--z': '18px' } as React.CSSProperties}>
          <span className="creators-lab__rotulo" style={{ color: tokens.cores.secundaria }}>
            {tokens.vocab.sujeito(indice + 1)}
          </span>
          <span className="creators-lab__mono text-[.6rem]" style={{ color: tokens.cores.textoSuave }}>
            {criador.commits} commits
          </span>
        </div>

        {/* Retrato */}
        <div
          className="creators-lab__camada relative mx-auto mt-5 flex items-center justify-center overflow-hidden"
          style={{
            '--z': '34px',
            width: arcade ? 116 : 108,
            height: arcade ? 116 : 108,
            borderRadius: arcade ? 0 : '50%',
            border: `${tokens.bordaLargura} solid ${tokens.cores.primaria}`,
            background: tokens.cores.fundoAlt,
          } as React.CSSProperties}
        >
          {temFoto ? (
            <img
              src={criador.foto}
              alt={`Foto de ${criador.nome}`}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <span
              className="creators-lab__mono text-4xl font-bold"
              style={{ color: tokens.cores.primaria }}
              aria-hidden
            >
              {criador.iniciais}
            </span>
          )}
        </div>

        {/* Nome */}
        <h3
          className="creators-lab__camada relative mt-4 text-center text-2xl font-bold"
          style={{ '--z': '26px', color: tokens.cores.texto } as React.CSSProperties}
        >
          {criador.nome.toUpperCase()}
        </h3>

        {/* Função e tagline — pendentes ficam explícitas, nunca preenchidas. */}
        <div className="creators-lab__camada relative mt-2 text-center" style={{ '--z': '20px' } as React.CSSProperties}>
          {papelPendente
            ? <Pendente oQue={textoPendente(criador.papel)} />
            : <p className="creators-lab__mono text-xs tracking-[.18em] uppercase"
                 style={{ color: tokens.cores.acento }}>{criador.papel}</p>}

          <div className="mt-2">
            {taglinePendente
              ? <Pendente oQue={textoPendente(criador.tagline)} />
              : <p className="text-sm" style={{ color: tokens.cores.textoSuave }}>{criador.tagline}</p>}
          </div>
        </div>

        {/* Barras de habilidade — só quando houver número real. */}
        <div className="creators-lab__camada relative mt-5 space-y-2" style={{ '--z': '14px' } as React.CSSProperties}>
          {criador.habilidades.some(h => h.nivel > 0) ? (
            criador.habilidades.map(h => (
              <div key={h.nome} className="flex items-center gap-2">
                <span className="creators-lab__mono w-16 shrink-0 text-[.62rem] tracking-wider"
                      style={{ color: tokens.cores.textoSuave }}>
                  {h.nome}
                </span>
                <div className="creators-lab__barra flex-1">
                  <motion.span
                    initial={movimentoReduzido ? false : { width: 0 }}
                    whileInView={{ width: `${h.nivel}%` }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.7, delay: 0.2 }}
                  />
                </div>
              </div>
            ))
          ) : (
            <div className="text-center">
              <Pendente oQue="níveis de habilidade" />
            </div>
          )}
        </div>

        <p className="creators-lab__camada relative mt-5 text-center creators-lab__mono text-[.6rem] tracking-[.2em]"
           style={{ '--z': '10px', color: tokens.cores.primaria } as React.CSSProperties}>
          [ {tokens.vocab.selecionar} ]
        </p>
      </motion.div>
    </div>
  );
}

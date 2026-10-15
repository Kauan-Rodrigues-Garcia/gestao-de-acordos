/**
 * EfeitoV2 — o estouro em volta do card quando a festa chega.
 *
 * Na 1.0 a chuva caía na tela inteira o tempo todo. Aqui o efeito é um
 * MOMENTO: estoura a partir do card, cai e acaba — a festa chama a atenção na
 * chegada e depois deixa a pessoa trabalhar.
 *
 * `pointer-events: none` em tudo, e nada para quem pediu menos movimento ao
 * sistema.
 */
import { useEffect, useMemo, useState, type RefObject } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { EfeitoId } from './design';

/** Quanto o card leva para chegar no lugar (mola do `CenaV2`). */
const POUSO_MS = 280;

const CORES_CONFETE = ['#FFD166', '#EF476F', '#06D6A0', '#118AB2', '#B388FF', '#FF9F1C', '#FFFFFF'];

interface Particula {
  id:      number;
  /** Deslocamento final a partir da origem, em px. */
  dx:      number;
  dy:      number;
  /** Ponto alto do arco (negativo = sobe). */
  pico:    number;
  giro:    number;
  atraso:  number;
  duracao: number;
  tamanho: number;
  cor:     string;
}

function sortear(quantidade: number, efeito: EfeitoId, larguraTela: number): Particula[] {
  return Array.from({ length: quantidade }, (_, i) => {
    const angulo = Math.random() * Math.PI * 2;
    const alcance = 160 + Math.random() * Math.min(520, larguraTela * 0.45);
    const segundaLeva = i >= quantidade * 0.65;
    return {
      id: i,
      dx: Math.cos(angulo) * alcance,
      dy: efeito === 'estrelas'
        ? -120 - Math.random() * 260
        : 260 + Math.random() * 420,
      pico: -80 - Math.random() * 180,
      giro: Math.random() * 900 - 450,
      atraso: (segundaLeva ? 0.9 : 0) + Math.random() * 0.25,
      duracao: 1.8 + Math.random() * 1.4,
      tamanho: efeito === 'moedas' ? 12 + Math.random() * 8 : 7 + Math.random() * 7,
      cor: CORES_CONFETE[i % CORES_CONFETE.length],
    };
  });
}

function Estrela({ tamanho, cor }: { tamanho: number; cor: string }) {
  return (
    <svg width={tamanho * 1.6} height={tamanho * 1.6} viewBox="0 0 20 20" aria-hidden="true">
      <path d="M10 0 Q11.6 8.4 20 10 Q11.6 11.6 10 20 Q8.4 11.6 0 10 Q8.4 8.4 10 0 Z" fill={cor} />
    </svg>
  );
}

export function EfeitoV2({
  efeito, alvoRef,
}: { efeito: EfeitoId; alvoRef: RefObject<HTMLElement | null> }) {
  const calmo = useReducedMotion();
  const [origem, setOrigem] = useState<{ x: number; y: number } | null>(null);

  // Estoura quando o card pousa, medindo onde ele parou — medir na montagem
  // pegaria o card ainda descendo, no meio da entrada.
  useEffect(() => {
    const id = setTimeout(() => {
      const r = alvoRef.current?.getBoundingClientRect();
      setOrigem(r && r.width > 0
        ? { x: r.left + r.width / 2, y: r.top + r.height / 2 }
        : { x: window.innerWidth / 2, y: 200 });
    }, POUSO_MS);
    return () => clearTimeout(id);
  }, [alvoRef]);

  const particulas = useMemo(
    () => sortear(efeito === 'moedas' ? 36 : 54, efeito, typeof window !== 'undefined' ? window.innerWidth : 1200),
    [efeito],
  );

  if (efeito === 'nenhum' || calmo || !origem) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
      {particulas.map((p) => {
        const estilo = { left: origem.x, top: origem.y };
        if (efeito === 'estrelas') {
          return (
            <motion.span key={p.id} className="absolute" style={estilo}
              initial={{ x: 0, y: 0, opacity: 0, scale: 0.3 }}
              animate={{ x: p.dx * 0.8, y: p.dy, opacity: [0, 1, 1, 0], scale: [0.3, 1.1, 0.8, 0.4] }}
              transition={{ duration: p.duracao + 0.6, delay: p.atraso, ease: 'easeOut' }}>
              <Estrela tamanho={p.tamanho} cor={p.id % 3 === 0 ? '#FFFFFF' : '#FFD86B'} />
            </motion.span>
          );
        }
        if (efeito === 'moedas') {
          return (
            <motion.span key={p.id} className="absolute rounded-full"
              style={{
                ...estilo, width: p.tamanho, height: p.tamanho,
                background: 'radial-gradient(circle at 35% 30%, #FFF6C2 0%, #F8C846 45%, #C2841A 100%)',
                boxShadow: 'inset 0 0 0 1.5px rgba(150,95,10,.6)',
              }}
              initial={{ x: 0, y: 0, opacity: 0, rotateY: 0 }}
              animate={{ x: p.dx, y: [0, p.pico, p.dy], opacity: [0, 1, 1, 0], rotateY: p.giro * 2 }}
              transition={{ duration: p.duracao, delay: p.atraso, ease: 'easeIn' }} />
          );
        }
        return (
          <motion.span key={p.id} className="absolute rounded-[2px]"
            style={{ ...estilo, width: p.tamanho * 0.55, height: p.tamanho, background: p.cor }}
            initial={{ x: 0, y: 0, opacity: 0, rotate: 0 }}
            animate={{ x: p.dx, y: [0, p.pico, p.dy], opacity: [0, 1, 1, 0], rotate: p.giro }}
            transition={{ duration: p.duracao, delay: p.atraso, ease: 'easeOut' }} />
        );
      })}
    </div>
  );
}

/**
 * EfeitoComemoracao — a animação de fundo da comemoração.
 *
 * Feito em código, não em GIF: são partículas simples, e um GIF para isso seria
 * um asset a versionar, servir e cachear, além de pesar na tela de quem tem
 * internet ruim. A fase 2 acrescenta o GIF que o líder enviar — este efeito
 * continua valendo como opção do catálogo.
 *
 * `pointer-events: none` em tudo: isto passa por cima de gente trabalhando e
 * não pode roubar um clique.
 */
import { useMemo } from 'react';
import { motion } from 'framer-motion';
import type { EfeitoId } from '@/pages/Comemoracoes/catalogo';

/** Partículas suficientes para encher a tela sem pesar em máquina fraca. */
const QUANTIDADE = 26;

const CORES = ['#f59e0b', '#ef4444', '#3b82f6', '#22c55e', '#a855f7', '#ec4899'];

/**
 * Posições sorteadas UMA vez por montagem.
 *
 * Sortear a cada render faria as partículas saltarem de lugar sempre que
 * qualquer estado do pai mudasse.
 */
function useParticulas(quantidade: number, semente: string) {
  return useMemo(
    () => Array.from({ length: quantidade }, (_, i) => ({
      id:      `${semente}-${i}`,
      esquerda: Math.random() * 100,
      atraso:   Math.random() * 1.2,
      duracao:  2.4 + Math.random() * 1.8,
      cor:      CORES[i % CORES.length],
      giro:     Math.random() * 720 - 360,
      tamanho:  6 + Math.random() * 8,
    })),
    [quantidade, semente],
  );
}

export function EfeitoComemoracao({ efeito, id }: { efeito: EfeitoId; id: string }) {
  const particulas = useParticulas(QUANTIDADE, id);

  if (efeito === 'nenhum') return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[99] overflow-hidden" aria-hidden="true">
      {particulas.map((p) => {
        if (efeito === 'estrelas') {
          return (
            <motion.span
              key={p.id}
              className="absolute rounded-full"
              style={{
                left: `${p.esquerda}%`,
                top: `${10 + (p.giro + 360) % 60}%`,
                width: p.tamanho, height: p.tamanho,
                background: p.cor,
                boxShadow: `0 0 ${p.tamanho}px ${p.cor}`,
              }}
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: [0, 1, 0], scale: [0, 1.4, 0] }}
              transition={{ duration: 1.6, delay: p.atraso, repeat: Infinity, repeatDelay: 0.6 }}
            />
          );
        }

        if (efeito === 'fogos') {
          return (
            <motion.span
              key={p.id}
              className="absolute rounded-full"
              style={{
                left: `${p.esquerda}%`, top: '50%',
                width: p.tamanho / 2, height: p.tamanho / 2,
                background: p.cor,
              }}
              initial={{ opacity: 0, x: 0, y: 0, scale: 0 }}
              animate={{
                opacity: [0, 1, 0],
                x: [(p.giro / 6), (p.giro / 2)],
                y: [0, (p.tamanho * 6) - 40],
                scale: [0, 1, 0.4],
              }}
              transition={{ duration: 1.4, delay: p.atraso, repeat: Infinity, repeatDelay: 0.8 }}
            />
          );
        }

        // confete e chuva-moedas: caem do topo. A moeda é redonda e dourada;
        // o confete é um retângulo colorido que gira.
        const moeda = efeito === 'chuva-moedas';
        return (
          <motion.span
            key={p.id}
            className={moeda ? 'absolute rounded-full' : 'absolute'}
            style={{
              left: `${p.esquerda}%`,
              width: moeda ? p.tamanho : p.tamanho * 0.6,
              height: moeda ? p.tamanho : p.tamanho,
              background: moeda ? '#facc15' : p.cor,
              border: moeda ? '1px solid #ca8a04' : undefined,
              borderRadius: moeda ? '9999px' : 2,
            }}
            initial={{ y: -40, opacity: 0, rotate: 0 }}
            animate={{ y: '105vh', opacity: [0, 1, 1, 0], rotate: p.giro }}
            transition={{ duration: p.duracao, delay: p.atraso, repeat: Infinity, ease: 'linear' }}
          />
        );
      })}
    </div>
  );
}

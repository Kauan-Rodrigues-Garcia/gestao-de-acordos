/**
 * animacoesTexto.ts — como o texto entra na tela.
 *
 * O título é a primeira coisa que a pessoa lê quando a comemoração explode em
 * cima do trabalho dela. Até aqui só havia um jeito de ele aparecer (subindo),
 * o que deixava toda comemoração com a mesma cara.
 *
 * Tudo aqui é **prop de framer-motion**, não CSS solto: o card já usa
 * `motion.h2`/`motion.p`, então a animação entra como dado, sem componente
 * novo. Fora do componente para ter teste e para o catálogo caber numa olhada.
 *
 * Nada usa keyframe infinito: a comemoração dura no máximo 60 s e some. Texto
 * pulsando sem parar em cima de quem está atendendo cansa em dez segundos.
 */
import type { MotionProps } from 'framer-motion';
import type { OpcaoCatalogo } from './catalogo';

export type AnimTextoId = 'nenhuma' | 'subir' | 'pop' | 'maquina' | 'brilho' | 'tremor';

export const ANIMACOES_TEXTO: readonly OpcaoCatalogo<AnimTextoId>[] = [
  { id: 'subir',   nome: 'Subir',      descricao: 'Sobe e revela. O de sempre.' },
  { id: 'pop',     nome: 'Estouro',    descricao: 'Entra crescendo, com mola.' },
  { id: 'maquina', nome: 'Datilografia', descricao: 'Revela da esquerda para a direita.' },
  { id: 'brilho',  nome: 'Brilho',     descricao: 'Acende uma vez ao aparecer.' },
  { id: 'tremor',  nome: 'Tremor',     descricao: 'Chacoalha uma vez e assenta.' },
  { id: 'nenhuma', nome: 'Sem animação', descricao: 'Aparece pronto.' },
];

const VALIDAS = new Set<string>(ANIMACOES_TEXTO.map((a) => a.id));

export const ANIM_TEXTO_PADRAO: AnimTextoId = 'subir';

/**
 * Valor do banco → animação que sabemos tocar.
 *
 * Mesma tolerância do `efeitoValido`: id gravado por uma versão mais nova não
 * pode impedir a comemoração de aparecer nesta.
 */
export function animTextoValida(valor: string | null | undefined): AnimTextoId {
  return VALIDAS.has(valor ?? '') ? (valor as AnimTextoId) : ANIM_TEXTO_PADRAO;
}

/**
 * Tipado a partir do próprio `MotionProps` e não das peças internas do
 * framer-motion: as três aceitam mais formas do que `TargetAndTransition`
 * (rótulo de variante, booleano, keyframes), e amarrar no tipo estreito faz o
 * `motion.h2` recusar o objeto na hora do espalhamento.
 */
export interface PropsAnimacao {
  initial:    MotionProps['initial'];
  animate:    MotionProps['animate'];
  transition: MotionProps['transition'];
}

/** Quanto tempo a datilografia leva por caractere. */
const SEGUNDOS_POR_LETRA = 0.045;
/** Teto da datilografia: título de 40 letras não pode levar a comemoração toda. */
const MAX_DATILOGRAFIA_S = 1.6;

/**
 * Props de entrada do texto.
 *
 * `atraso` escalona título e mensagem, como o card já fazia à mão.
 * `comprimento` só importa na datilografia, que precisa durar proporcional ao
 * texto — senão título curto sai lento e título longo sai atropelado.
 */
export function propsAnimacaoTexto(
  id: AnimTextoId,
  atraso = 0,
  comprimento = 0,
): PropsAnimacao {
  switch (id) {
    case 'nenhuma':
      return { initial: { opacity: 1 }, animate: { opacity: 1 }, transition: { duration: 0 } };

    case 'pop':
      return {
        initial: { opacity: 0, scale: 0.4 },
        animate: { opacity: 1, scale: 1 },
        transition: { type: 'spring', stiffness: 300, damping: 12, delay: atraso },
      };

    case 'maquina':
      // Revelar por recorte, e não letra a letra no DOM: sem timer, sem
      // re-render por caractere, e o texto inteiro continua no acessível desde
      // o primeiro quadro (leitor de tela não lê pela metade).
      return {
        initial: { opacity: 1, clipPath: 'inset(0 100% 0 0)' },
        animate: { opacity: 1, clipPath: 'inset(0 0% 0 0)' },
        transition: {
          duration: Math.min(MAX_DATILOGRAFIA_S, Math.max(0.2, comprimento * SEGUNDOS_POR_LETRA)),
          ease: 'linear',
          delay: atraso,
        },
      };

    case 'brilho':
      return {
        initial: { opacity: 0 },
        animate: { opacity: 1, filter: ['brightness(1)', 'brightness(2.2)', 'brightness(1)'] },
        transition: { duration: 0.9, times: [0, 0.35, 1], delay: atraso },
      };

    case 'tremor':
      return {
        initial: { opacity: 0 },
        animate: { opacity: 1, x: [0, -7, 7, -4, 4, 0] },
        transition: { duration: 0.5, delay: atraso },
      };

    case 'subir':
    default:
      return {
        initial: { opacity: 0, y: 12 },
        animate: { opacity: 1, y: 0 },
        transition: { delay: atraso },
      };
  }
}

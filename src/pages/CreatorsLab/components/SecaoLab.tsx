/**
 * SecaoLab — o invólucro de toda seção do Lab.
 *
 * Existe para que o título, o espaçamento e a entrada por scroll sejam
 * decididos em um lugar só. Se cada seção montasse o próprio cabeçalho, a
 * página viraria nove hierarquias diferentes.
 *
 * A animação de entrada usa `whileInView` com `once`, então cada seção anima
 * uma vez e para — narrativa por scroll não é o mesmo que movimento constante.
 */
import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { useCreators } from '../theme/CreatorsProvider';

export function SecaoLab({
  id, rotulo, titulo, descricao, children, largura = 'normal',
}: {
  id: string;
  /** Linha pequena acima do título — muda com o tema. */
  rotulo: string;
  titulo: string;
  descricao?: string;
  children: ReactNode;
  largura?: 'normal' | 'cheia';
}) {
  const { tokens, movimentoReduzido } = useCreators();
  const arcade = tokens.id === 'arcade';

  return (
    <motion.section
      id={id}
      initial={movimentoReduzido ? false : { opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: tokens.duracao, ease: tokens.easing }}
      className={largura === 'cheia' ? 'mt-24' : 'mx-auto mt-24 w-full'}
      aria-labelledby={`${id}-titulo`}
    >
      <header className="mb-7">
        <p className="creators-lab__rotulo" style={{ color: tokens.cores.secundaria }}>
          {arcade ? `— ${rotulo} —` : `// ${rotulo}`}
        </p>
        <h2
          id={`${id}-titulo`}
          className="mt-2 text-2xl font-bold sm:text-3xl"
          style={{ color: tokens.cores.primaria }}
        >
          {titulo}
        </h2>
        {descricao && (
          <p className="mt-2 max-w-2xl text-sm" style={{ color: tokens.cores.textoSuave }}>
            {descricao}
          </p>
        )}
      </header>
      {children}
    </motion.section>
  );
}

/** Marca visível de conteúdo que ainda não foi informado. Nunca inventa texto. */
export function Pendente({ oQue }: { oQue: string }) {
  return (
    <span className="creators-lab__pendente" title="Conteúdo ainda não fornecido">
      ⚠ {oQue}
    </span>
  );
}

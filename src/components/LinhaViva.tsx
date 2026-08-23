/**
 * LinhaViva — a linha entra e sai sem a tabela ser refeita.
 *
 * ## O problema de animar linha de tabela
 *
 * `<tr>` não aceita `height: auto → 0` de forma confiável, `<td>` ignora
 * `transform` em vários navegadores e `AnimatePresence` precisa que o elemento
 * fique no DOM durante a saída — coisa que uma tabela reordenada a cada
 * releitura nunca permitiu.
 *
 * Aqui a animação é só de **opacidade e um deslocamento pequeno**, aplicadas
 * pelo framer-motion no próprio `<tr>`. Nada de altura: linha que colapsa
 * empurra tudo abaixo dela e é justamente o salto de scroll que estamos
 * tirando da tela.
 *
 * ## `layout` fica DESLIGADO de propósito
 *
 * `layout` no `<tr>` mede e reposiciona toda linha a cada render. Numa tabela
 * de cem linhas isso custa mais que o redesenho que ele evita, e o `<tbody>`
 * treme quando a largura de uma coluna muda. A promessa aqui é modesta e
 * cumprida: quem chega aparece, quem sai desaparece, quem fica não se mexe.
 *
 * ## Só anima o que é novo
 *
 * `nova` diz se aquela chave acabou de entrar. Sem isso, a primeira pintura da
 * tabela animaria as cem linhas de uma vez — efeito de abertura, não aviso de
 * novidade, e é o oposto do que este trabalho quer.
 */
import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

export interface LinhaVivaProps {
  children: ReactNode;
  /** A linha acabou de entrar na lista? Só nesse caso ela é animada. */
  nova?: boolean;
  className?: string;
  onClick?: () => void;
  title?: string;
}

/** Entrada discreta: aparece e assenta. Saída: some no lugar. */
const TRANSICAO = { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const };

export function LinhaViva({ children, nova = false, className, onClick, title }: LinhaVivaProps) {
  return (
    <motion.tr
      // `initial={false}` na linha que já existia: ela renderiza no estado
      // final sem passar pelo quadro inicial.
      initial={nova ? { opacity: 0, y: -4 } : false}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: { duration: 0.15 } }}
      transition={TRANSICAO}
      className={className}
      onClick={onClick}
      title={title}
    >
      {children}
    </motion.tr>
  );
}

/** A mesma ideia para cartões e itens de lista fora de tabela. */
export function ItemVivo({ children, nova = false, className, onClick, title }: LinhaVivaProps) {
  return (
    <motion.div
      initial={nova ? { opacity: 0, y: -6 } : false}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: { duration: 0.15 } }}
      transition={TRANSICAO}
      className={className}
      onClick={onClick}
      title={title}
    >
      {children}
    </motion.div>
  );
}

export default LinhaViva;

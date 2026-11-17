/**
 * SecaoLab — o cabeçalho de dentro de um programa.
 *
 * Era o invólucro de cada seção da página de rolagem, com a entrada animada
 * por scroll. Agora cada seção é um programa numa janela: o título grande é o
 * da barra de título, e isto aqui virou só o cabeçalho do conteúdo — a linha
 * pequena, o nome e a descrição.
 *
 * Continua existindo para que título e espaçamento sejam decididos num lugar
 * só. Se cada programa montasse o próprio cabeçalho, seriam dez hierarquias
 * diferentes.
 *
 * Não há mais `whileInView`: dentro de uma janela não existe "rolar até a
 * seção". Quem anima a entrada é a janela, ao abrir.
 */
import type { ReactNode } from 'react';
import { useCreators } from '../theme/CreatorsProvider';

export function SecaoLab({
  id, rotulo, titulo, descricao, children,
}: {
  id: string;
  /** Linha pequena acima do título — muda com o tema. */
  rotulo: string;
  titulo: string;
  descricao?: string;
  children: ReactNode;
}) {
  const { tokens } = useCreators();

  return (
    <section id={id} className="creators-lab__secao" aria-labelledby={`${id}-titulo`}>
      <header className="creators-lab__secao-cabecalho">
        <p className="creators-lab__rotulo" style={{ color: tokens.cores.secundaria }}>
          {tokens.vocab.rotuloSecao(rotulo)}
        </p>
        <h2
          id={`${id}-titulo`}
          className="mt-1 text-xl font-bold sm:text-2xl"
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
    </section>
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

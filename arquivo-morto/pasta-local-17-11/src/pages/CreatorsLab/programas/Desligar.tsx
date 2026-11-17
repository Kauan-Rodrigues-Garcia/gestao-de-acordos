/**
 * Programa: Desligar.
 *
 * Desligar o computador é voltar ao Gestão. O caminho até lá é o da antiga
 * última seção: o botão que não era para apertar, a despedida, o "espere..." e
 * o que aparece para quem ficou.
 */
import { FinalSecret } from '../sections/FinalSecret';
import { useMesa } from '../desktop/contexto';

export default function ProgramaDesligar() {
  const mesa = useMesa();
  return <FinalSecret aoSair={() => mesa?.desligar()} />;
}

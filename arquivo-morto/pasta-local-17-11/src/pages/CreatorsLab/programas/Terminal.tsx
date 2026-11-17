/**
 * Programa: Terminal.
 *
 * A casca é só a ligação com a área de trabalho: o que o terminal PEDE
 * (trocar de sistema, abrir as conquistas, sair) é atendido aqui. A
 * interpretação continua em `lib/terminal.ts` — lista branca, nada é executado.
 */
import { SecretTerminal } from '../sections/SecretTerminal';
import { useCreators } from '../theme/CreatorsProvider';
import { useMesa } from '../desktop/contexto';

export default function ProgramaTerminal() {
  const { trocarTema } = useCreators();
  const mesa = useMesa();

  return (
    <SecretTerminal
      aoSair={() => mesa?.desligar()}
      aoTrocarTema={trocarTema}
      aoMatrix={() => mesa?.matrix()}
      aoAbrirConquistas={() => mesa?.abrir('conquistas')}
    />
  );
}

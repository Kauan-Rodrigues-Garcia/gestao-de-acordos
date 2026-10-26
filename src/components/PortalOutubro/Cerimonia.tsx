/**
 * Cerimonia.tsx — a abertura e o mural, num pedaço que só baixa quando o
 * portal abre (ou quando alguém pede para rever).
 */
import { Abertura } from './Abertura';
import { Mural } from './Mural';
import { abrirMural, marcarVisto, type Tela } from './estado';
import './portal.css';

export default function Cerimonia({ tela, leve }: { tela: Exclude<Tela, null>; leve: boolean }) {
  if (tela.modo === 'abertura') {
    return <Abertura leve={leve} aoTerminar={() => { marcarVisto(); abrirMural(0); }} />;
  }
  return <Mural atoInicial={tela.ato} leve={leve} />;
}

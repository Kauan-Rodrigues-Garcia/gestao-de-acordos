/**
 * Cerimonia.tsx — a abertura, a Coisa e o mural, num pedaço que só baixa
 * quando o portal abre (ou quando alguém pede para rever).
 *
 * A ordem (pedido de 28/10/2026: a Coisa vem ANTES do mural, dançando): a
 * tela do Gestão desmancha e, embaixo dela, já está o palco de Derry; a Coisa
 * nasce, dança, baba e puxa o mural para a tela com o corpo inteiro. O palco
 * fica no mesmo lugar da árvore do começo ao fim da cena (não recomeça ao
 * passar da abertura para a Coisa nem enquanto o mural entra) e só sai quando
 * o mural chega.
 *
 * O volume (`ControleDeSom`) fica por cima de tudo, do começo ao fim. E o
 * som ambiente do Gestão (a rádio, as músicas do player) pausa enquanto isto
 * está aberto e volta sozinho ao fechar (29/10/2026: «não pode ocorrer essas
 * interferências»).
 */
import { useEffect, useRef, useState } from 'react';
import { liberarSilencio, silenciar } from '@/components/Halloween/SomAmbiente/motor';
import { Abertura } from './Abertura';
import { ControleDeSom } from './ControleDeSom';
import { Mural } from './Mural';
import { ACoisa } from './coisa/ACoisa';
import { calarSonsDaCoisa } from './coisa/trilha';
import { abrirCoisa, marcarVisto, puxarMural, type Tela } from './estado';
import './portal.css';

export default function Cerimonia({ tela, leve }: { tela: Exclude<Tela, null>; leve: boolean }) {
  const mural = useRef<HTMLDivElement>(null);
  // A tela do Gestão já está desmanchando: o palco monta embaixo dela.
  const [palcoEmbaixo, setPalcoEmbaixo] = useState(false);
  const puxado = tela.modo === 'mural' && !!tela.puxado;
  // O palco fica embaixo enquanto o mural entra puxado.
  const [puxadaAcabou, setPuxadaAcabou] = useState(false);
  useEffect(() => { if (!puxado) setPuxadaAcabou(false); }, [puxado]);
  const puxando = puxado && !puxadaAcabou;

  const comCoisa = tela.modo === 'coisa' || (tela.modo === 'abertura' && palcoEmbaixo) || puxando;

  // Abriu: o som ambiente pausa. Fechou (o X, o Esc): a trilha da Coisa cala junto e ele volta.
  useEffect(() => {
    silenciar('mural-outubro');
    return () => { calarSonsDaCoisa(); liberarSilencio('mural-outubro'); };
  }, []);

  return (
    <>
      {tela.modo === 'mural' && <Mural raiz={mural} leve={leve} puxando={puxando} semEntrada={puxado} soVisual={!puxado} />}
      {tela.modo === 'abertura' && (
        <Abertura leve={leve} aoDesmanchar={() => setPalcoEmbaixo(true)} aoTerminar={() => { marcarVisto(); abrirCoisa(); }} />
      )}
      {comCoisa && (
        <ACoisa
          leve={leve}
          pronto={tela.modo !== 'abertura'}
          mural={mural}
          aoPuxar={puxarMural}
          aoTerminar={() => setPuxadaAcabou(true)}
        />
      )}
      <ControleDeSom />
    </>
  );
}

/**
 * Peça: a Caça aos Zumbis, encenada.
 *
 * Um zumbi escondido num canto de uma tela de mentira; clicar nele o derruba e
 * outro aparece em outro canto. Na Caça de verdade, quem acertava primeiro
 * ganhava a faixa no topo — aqui não há primeiro, nem faixa, nem placar: é só
 * o gesto. Os zumbis são os sprites da época; a "tela" atrás é fictícia.
 *
 * Os cantos são percorridos em ordem fixa, não sorteados: a peça é uma
 * demonstração, e achar o zumbi não é para ser difícil.
 */
import { useEffect, useRef, useState } from 'react';
import { SpriteZumbi } from '../../../../../arquivo-morto/caca-zumbis-bruxas/src/components/CacaAbobora/SpriteZumbi';
import { ZUMBIS } from '../../../../../arquivo-morto/caca-zumbis-bruxas/src/components/CacaAbobora/zumbis';
import { useCreators } from '../../theme/CreatorsProvider';

/** Onde o zumbi se esconde, em % da tela de mentira. */
const CANTOS = [
  { left: '78%', top: '56%' },
  { left: '6%',  top: '8%' },
  { left: '70%', top: '6%' },
  { left: '8%',  top: '58%' },
  { left: '42%', top: '34%' },
];

/** Tempo com o zumbi caído antes de o próximo aparecer. */
const PAUSA_MS = 900;

export default function PecaCaca() {
  const { tokens, movimentoReduzido } = useCreators();
  const c = tokens.cores;
  const [rodada, setRodada] = useState(0);
  const [caido, setCaido] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => () => { if (timer.current !== null) window.clearTimeout(timer.current); }, []);

  const zumbi = ZUMBIS[rodada % ZUMBIS.length];
  const canto = CANTOS[rodada % CANTOS.length];

  const pegar = () => {
    if (caido) return;
    setCaido(true);
    timer.current = window.setTimeout(() => {
      setCaido(false);
      setRodada(r => r + 1);
    }, PAUSA_MS);
  };

  return (
    <div>
      <div className="creators-lab__tela-ficticia" aria-label="Tela fictícia com um zumbi escondido">
        {/* Linhas de mentira, para o zumbi ter onde se esconder. */}
        {[72, 55, 64, 40, 58].map((largura, i) => (
          <span key={i} className="creators-lab__tela-ficticia-linha" style={{ width: `${largura}%` }} />
        ))}

        <button
          type="button"
          className="creators-lab__zumbi-escondido"
          style={{ ...canto, opacity: caido ? 0.45 : 1 }}
          onClick={pegar}
          aria-label={caido ? `${zumbi.nome}, pego` : `Pegar ${zumbi.nome}`}
        >
          <SpriteZumbi zumbi={zumbi} escala={2} animado={!movimentoReduzido && !caido} soCabeca={caido} morta={caido} />
        </button>
      </div>

      <p className="creators-lab__mono mt-3 text-[.7rem]" style={{ color: c.textoSuave }} aria-live="polite">
        {caido ? `Pegou ${zumbi.nome}. Já vem outro.` : 'Tem um zumbi escondido nesta tela. Clique nele.'}
      </p>
    </div>
  );
}

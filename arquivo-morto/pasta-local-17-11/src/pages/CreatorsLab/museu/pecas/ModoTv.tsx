/**
 * Peça: a mesa do Modo TV, encenada.
 *
 * Duas telinhas — a prévia e a que está «no ar» — e o corte, que leva uma para
 * a outra. Era assim que se trocava o que a TV do setor mostrava. As cenas
 * daqui são fictícias: um relógio parado, uma métrica inventada e um sorteio
 * sem ninguém.
 */
import { useState } from 'react';
import { useCreators } from '../../theme/CreatorsProvider';

const CENAS = [
  { id: 'relogio',  nome: 'Relógio',  grande: '14:30',   pequeno: 'hora de mentira' },
  { id: 'metrica',  nome: 'Métrica',  grande: '87%',     pequeno: 'número inventado' },
  { id: 'sorteio',  nome: 'Sorteio',  grande: '? ? ?',   pequeno: 'ninguém concorrendo' },
] as const;

type IdCena = typeof CENAS[number]['id'];

function Telinha({ rotulo, cena, noAr }: { rotulo: string; cena: typeof CENAS[number]; noAr: boolean }) {
  return (
    <div className="creators-lab__telinha" data-no-ar={noAr}>
      <span className="creators-lab__telinha-rotulo">{rotulo}</span>
      <span className="creators-lab__telinha-grande">{cena.grande}</span>
      <span className="creators-lab__telinha-pequeno">{cena.nome} · {cena.pequeno}</span>
    </div>
  );
}

export default function PecaModoTv() {
  const { tokens } = useCreators();
  const c = tokens.cores;
  const [previa, setPrevia] = useState<IdCena>('metrica');
  const [noAr, setNoAr] = useState<IdCena>('relogio');

  const cena = (id: IdCena) => CENAS.find(x => x.id === id)!;

  return (
    <div>
      <div className="creators-lab__mesa-tv">
        <Telinha rotulo="prévia" cena={cena(previa)} noAr={false} />
        <Telinha rotulo="no ar" cena={cena(noAr)} noAr />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label="Cenas">
        {CENAS.map(x => (
          <button
            key={x.id}
            type="button"
            className="creators-lab__arquivo"
            aria-current={previa === x.id}
            onClick={() => setPrevia(x.id)}
          >
            {x.nome}
          </button>
        ))}
        <button
          type="button"
          className="creators-lab__btn"
          onClick={() => setNoAr(previa)}
          disabled={previa === noAr}
        >
          cortar
        </button>
      </div>

      <p className="creators-lab__mono mt-3 text-[.7rem]" style={{ color: c.textoSuave }}>
        Escolha a cena na prévia e corte para pôr no ar. Nenhuma TV está ligada nisto.
      </p>
    </div>
  );
}

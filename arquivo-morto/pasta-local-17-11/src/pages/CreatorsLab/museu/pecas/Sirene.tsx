/**
 * Peça: a Sirene, encenada — só a luz.
 *
 * Escolhe-se a cor e aperta-se «Tocar agora»: o painel acende por alguns
 * segundos. Não há som, não há horário, não há setor e ninguém mais vê: é uma
 * lâmpada dentro desta janela.
 *
 * ## A luz pisca DEVAGAR, de propósito
 *
 * A alternância é de 0,8 s por ciclo — bem abaixo de três piscadas por
 * segundo, que é o limite a partir do qual luz piscando vira risco para quem
 * é fotossensível. E com movimento reduzido ela não pisca: o painel só acende
 * na cor escolhida e apaga.
 *
 * As cores são as do Museu, não as cadastradas na Sirene de verdade.
 */
import { useEffect, useRef, useState } from 'react';
import { useCreators } from '../../theme/CreatorsProvider';

const CORES = [
  { id: 'vermelha', nome: 'Vermelha', luz: '#E5262B' },
  { id: 'azul',     nome: 'Azul',     luz: '#2F6BFF' },
  { id: 'verde',    nome: 'Verde',    luz: '#22A85A' },
  { id: 'ambar',    nome: 'Âmbar',    luz: '#F0A020' },
] as const;

/** Quanto tempo a luz fica acesa. */
const DURACAO_MS = 3200;

export default function PecaSirene() {
  const { tokens, movimentoReduzido } = useCreators();
  const c = tokens.cores;
  const [cor, setCor] = useState<typeof CORES[number]>(CORES[0]);
  const [tocando, setTocando] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => () => { if (timer.current !== null) window.clearTimeout(timer.current); }, []);

  const tocar = () => {
    setTocando(true);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setTocando(false), DURACAO_MS);
  };

  return (
    <div style={{ maxWidth: '26rem' }}>
      <div
        className="creators-lab__lampada"
        data-acesa={tocando}
        data-pisca={tocando && !movimentoReduzido}
        style={{ '--creator-lampada': cor.luz } as React.CSSProperties}
        role="img"
        aria-label={tocando ? `Luz ${cor.nome.toLowerCase()} acesa` : 'Luz apagada'}
      />

      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Cor da sirene">
        {CORES.map(k => (
          <button
            key={k.id}
            type="button"
            className="creators-lab__arquivo"
            aria-current={cor.id === k.id}
            onClick={() => setCor(k)}
          >
            <span
              aria-hidden="true"
              style={{ width: 10, height: 10, borderRadius: '50%', background: k.luz, display: 'inline-block' }}
            />
            {k.nome}
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" className="creators-lab__btn" onClick={tocar} disabled={tocando}>
          {tocando ? 'tocando...' : 'tocar agora'}
        </button>
        <p className="creators-lab__mono text-[.7rem]" style={{ color: c.textoSuave }}>
          Só a luz, só aqui. Sem som.
        </p>
      </div>
    </div>
  );
}

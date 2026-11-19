import { useEffect, useState } from 'react';
import { ninguemOlhando } from '@/lib/atencao';
import { LANCAMENTO_MS, partesDaContagem } from './tema';
import './vi.css';

/**
 * A contagem regressiva do GTA VI, embaixo da data na faixa da arte (Cleber,
 * 18/11/2026): acaba à meia-noite do dia 19, o lançamento. Quem diz o tempo é o relógio, então
 * trocar de aba ou recarregar não atrasa nada. Com ninguém olhando
 * (`lib/atencao.ts`) a tela não é redesenhada.
 *
 * `lancamento` só muda no laboratório, para testar a virada.
 */
export function ContagemVi({ lancamento = LANCAMENTO_MS }: { lancamento?: number }) {
  const [agora, setAgora] = useState(Date.now);
  const partes = partesDaContagem(agora, lancamento);
  const acabou = partes === null;

  useEffect(() => {
    if (acabou) return;
    let relogio = 0;
    const bater = () => {
      if (!ninguemOlhando() || Date.now() >= lancamento) setAgora(Date.now());
      // Cai na virada do segundo, para o número não pular nem repetir.
      relogio = window.setTimeout(bater, ((lancamento - Date.now()) % 1000 + 1000) % 1000 + 20);
    };
    relogio = window.setTimeout(bater, ((lancamento - Date.now()) % 1000 + 1000) % 1000 + 20);
    return () => window.clearTimeout(relogio);
  }, [acabou, lancamento]);

  // Depois do lançamento a contagem some (Cleber, 19/11/2026: sem o «Já disponível»).
  if (!partes) return null;

  return (
    <div
      className="vi-contagem"
      role="timer"
      aria-label={`Faltam ${partes[0]} horas e ${partes[1]} minutos para o lançamento do GTA VI`}
    >
      <span className="vi-contagem-corpo" aria-hidden="true">
        <span className="vi-contagem-rotulo">Lançamento em</span>
        <span className="vi-contagem-tempo">
          {partes.map((par, i) => (
            <span key={i} className="vi-contagem-par">
              {i > 0 && <span className="vi-contagem-sep">:</span>}
              {[...par].map((d, j) => <span key={j} className="vi-contagem-digito">{d}</span>)}
            </span>
          ))}
        </span>
      </span>
    </div>
  );
}

/**
 * O botão do tempo no topo do app, ao lado do Calendário, e o card que desce
 * dele (06/11/2026). Só o desenho: quem lê a previsão é `BotaoClima`, e o
 * laboratório (`lab-calendario.html`) usa este sem banco nem rede.
 *
 * O tempo é coisa separada do calendário (Cleber, 06/11/2026): botão próprio,
 * no mesmo traço de gibi e na paleta do mês, e o clique abre só o card do
 * tempo. Fecha no clique fora, no Esc ou no próprio botão.
 */
import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import type { PaletaGibi } from '@/lib/calendarioSetor';
import { varsDaPaleta } from '@/lib/calendarioGibi';
import type { CondicaoClima, Estacao } from '@/lib/clima';
import { PersonagemDoTempo } from './personagens';
import '../gibi/gibi.css';
import './clima.css';

export interface ClimaDoBotao {
  condicao: CondicaoClima;
  noite: boolean;
  temp: number;
  estacao: Estacao;
  variante: number;
  /** «Birigui: 31°, sol, máx 34° mín 21°», para o título e o leitor de tela. */
  resumo: string;
}

export function BotaoDoTempo({ paleta, clima, aberto, onAlternar, onFechar, children }: {
  paleta: PaletaGibi;
  clima: ClimaDoBotao;
  aberto: boolean;
  onAlternar: () => void;
  onFechar: () => void;
  /** O card do tempo. */
  children: ReactNode;
}) {
  const raiz = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: PointerEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) onFechar();
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar(); };
    document.addEventListener('pointerdown', fora);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', fora);
      document.removeEventListener('keydown', esc);
    };
  }, [aberto, onFechar]);

  const titulo = `Previsão do tempo — ${clima.resumo}`;

  return (
    <div ref={raiz} className="gb-sys cl-sys shrink-0" style={varsDaPaleta(paleta) as CSSProperties}>
      <button
        type="button"
        className="gb-bt cl-bt"
        onClick={onAlternar}
        title={titulo}
        aria-label={titulo}
        aria-expanded={aberto}
        aria-haspopup="dialog"
      >
        <span className="cl-bt-ic" aria-hidden>
          <PersonagemDoTempo
            condicao={clima.condicao}
            noite={clima.noite}
            estacao={clima.estacao}
            variante={clima.variante}
            temp={clima.temp}
            cores={paleta}
          />
        </span>
        <b aria-hidden>{clima.temp}°</b>
      </button>

      {aberto && (
        <div className="cl-pop" role="dialog" aria-label="Previsão do tempo">
          <span className="cl-pop-seta" aria-hidden />
          {children}
        </div>
      )}
    </div>
  );
}

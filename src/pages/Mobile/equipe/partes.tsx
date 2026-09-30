/**
 * Peças da tela da equipe: a régua (a assinatura do visual v2), a cor de cada
 * quartil e os ícones das abas.
 */
import { ESCALA_REGUA, corDoQuartil } from './regua';

/**
 * A régua: um traço com as marcas das faixas e um ponto onde a pessoa está.
 * `pct` é a projeção (recebido ÷ esperado × 100). Só desenho — `aria-hidden`:
 * o número ao lado já diz o mesmo em texto.
 */
export function Regua({ pct, marcas, cor }: { pct: number | null; marcas: number[]; cor: string }) {
  const pos = pct === null ? null : Math.max(0, Math.min(pct, ESCALA_REGUA)) / ESCALA_REGUA * 100;
  return (
    <div className="e-regua" aria-hidden="true">
      {pos !== null && <div className="e-regua-fill" style={{ width: `${pos}%` }} />}
      {marcas.map(m => (
        <i key={m} className="e-regua-marca" style={{ left: `${(m / ESCALA_REGUA) * 100}%` }} />
      ))}
      {pos !== null && <i className="e-regua-ponto" style={{ left: `${pos}%`, background: cor }} />}
    </div>
  );
}

export function EscalaRegua({ marcas }: { marcas: number[] }) {
  return (
    <div className="e-escala" aria-hidden="true">
      {marcas.map(m => <span key={m} style={{ left: `${(m / ESCALA_REGUA) * 100}%` }}>{m}%</span>)}
    </div>
  );
}

export function Seta({ tamanho = 15 }: { tamanho?: number }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke="var(--e-grafite)"
      strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function IconeAba({ aba }: { aba: 'equipe' | 'quartis' | 'grafico' | 'hoje' }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {aba === 'equipe' && <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>}
      {aba === 'quartis' && <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />}
      {aba === 'grafico' && <><path d="M3 17l6-6 4 4 8-8" /><path d="M14 7h7v7" /></>}
      {aba === 'hoje' && <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>}
    </svg>
  );
}

/** Uma linha «rótulo … valor» dos grupos brancos. */
export function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="e-lin">
      <span className="e-r">{rotulo}</span>
      <span className="e-v e-num">{children}</span>
    </div>
  );
}

/**
 * «Quanto falta por faixa», hoje e amanhã — a mesma tabela do card do Painel
 * e da linha expandida dos Quartis (`degrausComAmanha`). Mostra as faixas
 * acima e a atual; as de baixo já passaram.
 */
export function TabelaFaixas({ degraus, faixaAtual, formatar }: {
  degraus: ReadonlyArray<{ quartil: number; falta: number; faltaAmanha: number | null; alcancado: boolean }>;
  faixaAtual: number | null;
  formatar: (v: number) => string;
}) {
  const linhas = degraus.filter(g => !g.alcancado || g.quartil === faixaAtual);
  if (!linhas.length) return null;
  return (
    <div className="e-grupo" role="table" aria-label="Quanto falta por faixa">
      <div className="e-faixa e-cab" role="row">
        <span /><span role="columnheader">Faixa</span>
        <span className="e-faixa-h" role="columnheader">Hoje</span>
        <span className="e-faixa-a" role="columnheader">Amanhã</span>
      </div>
      {linhas.map(g => {
        const atual = g.quartil === faixaAtual;
        return (
          <div className="e-faixa" role="row" key={g.quartil}>
            <i style={{ background: corDoQuartil(g.quartil) }} />
            <span className="e-faixa-n" role="cell">
              {g.quartil}º quartil{atual && <small>atual</small>}
            </span>
            <span className={`e-faixa-h ${g.alcancado ? 'e-pos' : 'e-num'}`} role="cell"
              style={g.alcancado ? { fontWeight: 600 } : undefined}>
              {g.alcancado ? 'na faixa' : formatar(g.falta)}
            </span>
            <span className="e-faixa-a e-num" role="cell">
              {g.faltaAmanha === null ? '—' : g.faltaAmanha === 0 ? 'mantém' : formatar(g.faltaAmanha)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Aba Quartis do setor (desenho §2.3): primeiro o cartão do setor — quantas
 * pessoas em cada faixa e o % delas, numa barra só —, depois as pessoas
 * separadas por equipe, da melhor projeção para a pior.
 *
 * A faixa de cada pessoa é a da aba Quartis do Painel (`montarEquipe` →
 * `montarLinhasQuartil`).
 */
import { useMemo } from 'react';
import { abreviarCliente } from '@/lib/mobile/formato';
import type { EquipeNaTela } from '../equipe/montarEquipe';
import { quartisDoSetor } from './contas';

const COR_Q: Record<number, string> = { 1: '#2e9e6a', 2: '#5566d6', 3: '#d08a1e', 4: '#d0493f' };

export function AbaQuartisSetor({ nome, equipes, emHO }: { nome: string; equipes: EquipeNaTela[]; emHO: boolean }) {
  const resumo = useMemo(() => quartisDoSetor(equipes), [equipes]);

  return (
    <>
      <section className="v-cartao" aria-label={`Quartis do setor ${nome}`}>
        <div className="v-rotulo">Setor {nome} · pessoas por quartil</div>
        {resumo.total === 0 ? (
          <div className="v-linha">Ninguém com meta individual neste mês.</div>
        ) : (
          <>
            <div className="s-q-faixa" role="img"
              aria-label={resumo.faixas.map(f => `Q${f.quartil} ${Math.round(f.pct)}%`).join(', ')}>
              {resumo.faixas.map(f => f.qtd > 0 && (
                <i key={f.quartil} style={{ width: `${f.pct}%`, background: COR_Q[f.quartil] }} />
              ))}
            </div>
            <div className="s-q-leg">
              {resumo.faixas.map(f => (
                <div key={f.quartil}>
                  <small><i style={{ background: COR_Q[f.quartil] }} />Q{f.quartil}</small>
                  <b>{Math.round(f.pct)}%</b>
                  <span>{f.qtd} {f.qtd === 1 ? 'pessoa' : 'pessoas'}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {equipes.map(e => {
        const linhas = e.linhas.filter(l => l.quartil)
          .sort((a, b) => (b.projecao ?? 0) - (a.projecao ?? 0));
        if (!linhas.length) return null;
        return (
          <div key={e.id}>
            <div className="e-sec">
              <span className="e-olho">{e.nome}</span>
              <span className="e-sec-dir">{linhas.length} {linhas.length === 1 ? 'pessoa' : 'pessoas'}{emHO ? ' · H.O.' : ''}</span>
            </div>
            <div className="e-grupo">
              {linhas.map(l => (
                <div key={l.op.id} className="e-quem-rec">
                  <span className="e-op-nm">{abreviarCliente(l.op.nome)}</span>
                  <span className="e-v e-num" style={{ color: COR_Q[l.quartil?.quartil ?? 0] }}>
                    Q{l.quartil?.quartil} · {l.projecao ?? 0}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}

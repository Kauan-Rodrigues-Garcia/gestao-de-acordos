/**
 * O cartão «Equipes» do gráfico do setor (desenho §2.3): recolhido; ao tocar,
 * abre e mostra, para cada equipe, o total do mês e um minigráfico diário.
 * As barras saem da mesma conta do gráfico grande (`montarGraficoDoMes`).
 */
import { useMemo, useState } from 'react';
import { formatBRL } from '@/lib/money';
import { montarGraficoDoMes } from '@/lib/mobile/graficoDia';
import type { LinhaRecebidaDia } from '@/services/analitico/analitico.service';
import type { EquipeNaTela } from '../equipe/montarEquipe';

function MiniGrafico({ equipe, linhas, mes, hojeISO }: {
  equipe: EquipeNaTela; linhas: LinhaRecebidaDia[]; mes: string; hojeISO: string;
}) {
  const g = useMemo(() => montarGraficoDoMes({
    linhas, mes, hojeISO, escopo: { tipo: 'equipe', operadores: new Set(equipe.operadorIds) },
  }), [linhas, mes, hojeISO, equipe.operadorIds]);
  const maior = g.melhor?.valor ?? 0;
  const n = g.dias.length;
  return (
    <div className="s-mini">
      <div className="s-mini-topo"><span>{equipe.nome}</span><b>{formatBRL(g.total)}</b></div>
      <svg viewBox={`0 0 ${n * 10} 44`} preserveAspectRatio="none" aria-hidden="true">
        {g.dias.map((d, i) => {
          const h = d.valor && maior ? Math.max(2, (d.valor / maior) * 40) : 0;
          return h ? (
            <rect key={d.dia} x={i * 10 + 2} y={44 - h} width={6} height={h} rx={1.5}
              fill={d.hoje ? '#5566d6' : '#1f6b5c'} opacity={d.hoje ? 0.7 : 0.9} />
          ) : null;
        })}
      </svg>
    </div>
  );
}

export function EquipesRecolhiveis({ equipes, linhas, mes, hojeISO }: {
  equipes: EquipeNaTela[]; linhas: LinhaRecebidaDia[] | undefined; mes: string; hojeISO: string;
}) {
  const [aberto, setAberto] = useState(false);
  if (!equipes.length || !linhas) return null;
  return (
    <section className="s-rec" data-aberto={aberto}>
      <button type="button" aria-expanded={aberto} onClick={() => setAberto(a => !a)}>
        <span>Equipes · {equipes.length}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {aberto && equipes.map(e => (
        <MiniGrafico key={e.id} equipe={e} linhas={linhas} mes={mes} hojeISO={hojeISO} />
      ))}
    </section>
  );
}

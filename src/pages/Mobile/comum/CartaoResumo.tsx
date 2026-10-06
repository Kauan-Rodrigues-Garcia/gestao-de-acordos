/**
 * O Resumo de um conjunto — equipe ou setor — no app (06/10/2026, desenho §2.0).
 *
 * O painel «de casa»: recebido do mês, a barra contra a meta com o risco do que
 * devia ter hoje, e quatro números — hoje, quanto falta, onde fecha e o ritmo.
 * Só números do conjunto; nenhum nome, nenhuma pessoa.
 */
import { formatBRL } from '@/lib/money';
import type { RitmoDoConjunto } from '@/lib/mobile/ritmo';
import { BarraMeta, DinheiroAnimado, PctAnimado } from './partesComuns';
import './comum.css';

function rotuloDoRitmo(pct: number): { texto: string; cor: string } {
  if (pct >= 100) return { texto: 'acima do ritmo', cor: '#2e9e6a' };
  if (pct >= 90) return { texto: 'no ritmo', cor: '#5566d6' };
  if (pct >= 70) return { texto: 'abaixo do ritmo', cor: '#d08a1e' };
  return { texto: 'muito abaixo do ritmo', cor: '#d0493f' };
}

const mil = (v: number) => (Math.abs(v) >= 100_000
  ? `R$ ${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mil`
  : formatBRL(v));

export function CartaoResumo({ titulo, recebido, hoje, qtdHoje, ritmo, unidadeHO, aviso }: {
  /** «Equipe da Ana» / «Setor Play 1». */
  titulo: string;
  recebido: number;
  hoje: number;
  qtdHoje: number;
  ritmo: RitmoDoConjunto | null;
  unidadeHO: boolean;
  /** Uma linha discreta no pé (ex.: «total do relatório de conciliação»). */
  aviso?: string | null;
}) {
  const sufixo = unidadeHO ? ' · H.O.' : '';
  const r = ritmo ? rotuloDoRitmo(ritmo.pctRitmo) : null;
  return (
    <section className="v-cartao v-resumo" aria-label={`Resumo · ${titulo}`}>
      <div className="v-rotulo">{titulo} · recebido no mês{sufixo}</div>
      <div className="v-valor"><DinheiroAnimado valor={recebido} aposta /></div>
      <div className="v-linha">
        <span>{ritmo ? <>Meta <b>{formatBRL(ritmo.meta)}</b></> : 'Sem meta cadastrada neste mês'}</span>
        {ritmo && <span className="v-pct"><PctAnimado valor={ritmo.pctMeta} aposta /></span>}
      </div>
      {ritmo && (
        <BarraMeta
          pct={Math.min(100, ritmo.pctMeta)}
          esperado={Math.min(100, (ritmo.esperado / ritmo.meta) * 100)}
          rotuloEsperado={`devia ter ${mil(ritmo.esperado)}`}
        />
      )}
      <div className="v-resumo-grade">
        <div><small>Hoje{sufixo}</small><b>{formatBRL(hoje)}</b><i>{qtdHoje} {qtdHoje === 1 ? 'pagamento' : 'pagamentos'}</i></div>
        <div><small>Falta para a meta</small><b>{ritmo ? (ritmo.falta > 0 ? mil(ritmo.falta) : 'meta batida') : '—'}</b></div>
        <div><small>Fecha o mês em</small><b>{ritmo ? mil(ritmo.fecha) : '—'}</b></div>
        <div><small>Ritmo</small>
          <b style={r ? { color: r.cor } : undefined}>{ritmo ? `${Math.round(ritmo.pctRitmo)}%` : '—'}</b>
          {r && <i>{r.texto}</i>}
        </div>
      </div>
      {aviso && <div className="v-aviso">{aviso}</div>}
    </section>
  );
}

/**
 * Aba Setor — o Resumo do setor e um cartão por equipe (desenho §2.3).
 *
 * O cartão do setor é o Resumo (`CartaoResumo`): recebido, meta, devia ter
 * hoje, falta, onde fecha e ritmo. Embaixo, cada equipe com o % da meta; tocar
 * abre a equipe na tela do líder (`/m/equipe?equipe=`).
 */
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatBRL } from '@/lib/money';
import { ROUTE_PATHS } from '@/lib/index';
import type { RitmoDoConjunto } from '@/lib/mobile/ritmo';
import type { LinhaRecebidaDia } from '@/services/analitico/analitico.service';
import type { EscopoAnalitico } from '@/services/analitico/escopoAnalitico';
import { hojeDoConjunto } from './contas';
import { CartaoResumo } from '../comum/CartaoResumo';
import { Seta } from '../equipe/partes';
import type { EquipeNaTela } from '../equipe/montarEquipe';

function corDoPct(p: number): string {
  return p >= 100 ? '#2e9e6a' : p >= 80 ? '#5566d6' : p >= 50 ? '#d08a1e' : '#d0493f';
}

export function AbaSetor({ nome, recebido, ritmo, emHO, cofen, equipes, linhasSetor, escopoSetor, hojeISO, rodape }: {
  nome: string;
  recebido: number | null;
  ritmo: RitmoDoConjunto | null;
  emHO: boolean;
  cofen: boolean;
  equipes: EquipeNaTela[];
  linhasSetor: LinhaRecebidaDia[] | undefined;
  /** `null` = as linhas já são só do setor (Cofen, pela conciliação). */
  escopoSetor: EscopoAnalitico | null;
  hojeISO: string;
  rodape: React.ReactNode;
}) {
  const navigate = useNavigate();
  const hoje = useMemo(() => hojeDoConjunto(linhasSetor, hojeISO, escopoSetor), [linhasSetor, hojeISO, escopoSetor]);

  return (
    <>
      {recebido === null ? (
        <div className="e-esq" style={{ margin: '0 16px', height: 250, borderRadius: 24 }} aria-busy="true" />
      ) : (
        <CartaoResumo titulo={`Setor ${nome}`} recebido={recebido} hoje={hoje.total} qtdHoje={hoje.qtd}
          ritmo={ritmo} unidadeHO={emHO}
          aviso={cofen ? 'Total do relatório de conciliação, como no Painel do Líder.' : null} />
      )}

      <div className="e-sec">
        <span className="e-olho">Equipes do setor</span>
        <span className="e-sec-dir">{equipes.length}</span>
      </div>
      {equipes.length === 0 ? (
        <p className="e-nota">Nenhuma equipe neste setor.</p>
      ) : (
        <div className="e-grupo">
          {equipes.map(e => {
            const pct = e.meta ? (e.acumulado / e.meta) * 100 : null;
            return (
              <button key={e.id} type="button" className="s-eq"
                onClick={() => navigate(`${ROUTE_PATHS.MOBILE_EQUIPE}?equipe=${e.id}`)}>
                <span className="s-eq-l1">
                  <span className="s-eq-nm">{e.nome}</span>
                  <span className="s-eq-pct" style={pct !== null ? { color: corDoPct(pct) } : undefined}>
                    {pct !== null ? `${Math.round(pct)}%` : 'sem meta'}
                  </span>
                  <Seta tamanho={13} />
                </span>
                <span className="s-eq-barra" aria-hidden="true">
                  <i style={{ width: `${Math.min(100, pct ?? 0)}%`, background: pct !== null ? corDoPct(pct) : 'transparent' }} />
                </span>
                <span className="s-eq-l2">
                  {formatBRL(e.acumulado)}{e.meta ? <> de {formatBRL(e.meta)}</> : null}
                  {emHO ? ' · H.O.' : ''}
                </span>
              </button>
            );
          })}
        </div>
      )}
      {rodape}
    </>
  );
}

/**
 * Aba Equipe — o card do Desempenho Equipes do Painel do Líder, para o dedo
 * (spec da liderança §2.1): cartão escuro com a régua até a meta e a marca do
 * esperado hoje, uma frase com a projeção, o ritmo e quanto falta por faixa.
 */
import { formatBRL } from '@/lib/money';
import { valorCurto } from '@/lib/mobile/formato';
import type { EquipeNaTela } from './montarEquipe';
import { Linha, TabelaFaixas } from './partes';
import { BarraMeta, DinheiroAnimado, PctAnimado } from '../comum/partesComuns';

function inteiro(v: number): string {
  return `R$ ${Math.round(v).toLocaleString('pt-BR')}`;
}

export function AbaEquipe({ equipe, rodape }: { equipe: EquipeNaTela; rodape: React.ReactNode }) {
  const { acumulado, meta, esperado, detalhe: d } = equipe;
  const unidade = equipe.emHO ? ' H.O.' : '';
  const pctMeta = meta ? (acumulado / meta) * 100 : null;
  const fill = meta ? Math.min(acumulado / meta, 1) * 100 : 0;
  const marcaEsperado = meta && esperado !== null ? Math.min(esperado / meta, 1) * 100 : null;
  const diferenca = esperado !== null ? acumulado - esperado : null;
  const metaBatida = meta !== null && acumulado >= meta;

  return (
    <>
      <section className="v-cartao" aria-label="Recebido da equipe no mês">
        <div className="v-rotulo">Recebido no mês{unidade}</div>
        <div className="v-valor"><DinheiroAnimado valor={acumulado} /></div>
        {meta ? (
          <>
            <div className="v-linha">
              <span>de <b>{formatBRL(meta)}</b>{metaBatida ? ' · meta batida' : ''}</span>
              <span className="v-pct"><PctAnimado valor={pctMeta ?? 0} /></span>
            </div>
            <BarraMeta pct={fill} esperado={metaBatida ? null : marcaEsperado} rotuloEsperado="esperado hoje" />
          </>
        ) : (
          <div className="v-linha">Sem meta configurada para a equipe neste mês.</div>
        )}
      </section>

      {meta !== null && d.projecaoPct !== null && diferenca !== null && (
        <p className="e-frase">
          Projeção <b>{d.projecaoPct}%</b> — <b>{valorCurto(Math.abs(diferenca))}</b>{' '}
          {diferenca >= 0 ? 'à frente do' : 'atrás do'} esperado.
          {d.diasRestantes > 0 && <> No ritmo de hoje, o mês fecha em <b>{valorCurto(d.projecaoFechamento)}</b>.</>}
        </p>
      )}

      {meta !== null && (
        <>
          <div className="e-sec">
            <span className="e-olho">Ritmo</span>
            <span className="e-sec-dir">
              {d.diasRestantes === 0 ? 'último dia útil' : `${d.diasRestantes} ${d.diasRestantes === 1 ? 'dia útil restante' : 'dias úteis restantes'}`}
            </span>
          </div>
          <div className="e-grupo">
            {d.ritmoNecessario !== null && (
              <Linha rotulo="Precisa por dia daqui pra frente">{inteiro(d.ritmoNecessario)}</Linha>
            )}
            <Linha rotulo="Média diária até agora">{inteiro(d.mediaDiaria)}</Linha>
            <Linha rotulo={metaBatida ? 'Acima da meta' : 'Falta para a meta'}>
              {inteiro(metaBatida ? acumulado - meta : (d.faltaMeta ?? 0))}
            </Linha>
          </div>

          {d.degraus.length > 0 && (
            <>
              <div className="e-sec"><span className="e-olho">Quanto falta por faixa</span></div>
              <TabelaFaixas degraus={d.degraus} faixaAtual={d.faixaAtual?.quartil ?? null} formatar={inteiro} />
            </>
          )}
        </>
      )}

      {equipe.treinamento && (
        <p className="e-nota">Equipe em treinamento: os dias úteis contam a partir do início dela.</p>
      )}
      {rodape}
    </>
  );
}

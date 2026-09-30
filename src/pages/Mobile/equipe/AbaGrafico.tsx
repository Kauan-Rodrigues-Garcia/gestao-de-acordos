/**
 * Aba Gráfico — o Gráfico de recebimento do Painel do Líder, sem recharts
 * (spec da liderança §2.3). Barras por dia do mês, a média diária tracejada
 * (a do site: total ÷ dias com recebimento) e uma leitura grande do dia tocado
 * no lugar dos rótulos sobre cada ponto, que não cabem no celular.
 *
 * Valor BRUTO, como o gráfico do site nos dois tenants.
 */
import { useMemo, useState } from 'react';
import { formatBRL } from '@/lib/money';
import { valorCurto } from '@/lib/mobile/formato';
import { montarGraficoDoMes, type DiaDoGrafico } from '@/lib/mobile/graficoDia';
import type { LinhaRecebidaDia } from '@/services/analitico/analitico.service';
import type { EquipeNaTela } from './montarEquipe';

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto',
  'setembro', 'outubro', 'novembro', 'dezembro'];

const L = 340;          // largura do desenho
const BASE = 150;       // linha do chão
const TOPO = 26;        // espaço para o rótulo da média
const FONTE = 'Figtree, system-ui, sans-serif';

export function AbaGrafico({ equipe, mes, hojeISO, linhas, carregando, erro, isPaguePlay }: {
  equipe: EquipeNaTela;
  mes: string;
  hojeISO: string;
  linhas: LinhaRecebidaDia[] | undefined;
  carregando: boolean;
  erro: boolean;
  isPaguePlay: boolean;
}) {
  const grafico = useMemo(() => montarGraficoDoMes({
    linhas: linhas ?? [], mes, hojeISO,
    escopo: { tipo: 'equipe', operadores: new Set(equipe.operadorIds) },
  }), [linhas, mes, hojeISO, equipe.operadorIds]);

  const padrao = useMemo(() => {
    const hoje = grafico.dias.find(d => d.hoje && d.valor !== null);
    if (hoje) return hoje.dia;
    const comValor = grafico.dias.filter(d => d.valor !== null);
    return comValor.length ? comValor[comValor.length - 1].dia : null;
  }, [grafico]);
  const [tocado, setTocado] = useState<number | null>(null);
  const dia = tocado ?? padrao;
  const sel = dia ? grafico.dias[dia - 1] : null;

  if (carregando) {
    return <div className="e-esq" style={{ margin: '0 16px', height: 320 }} aria-busy="true" aria-label="Carregando" />;
  }
  if (erro) return <p className="e-vazio"><b>Não foi possível carregar o gráfico</b>Tente de novo em instantes.</p>;
  if (grafico.total === 0) {
    return <p className="e-vazio"><b>Nenhum recebimento neste mês</b>O gráfico aparece com o primeiro relatório do mês.</p>;
  }

  const [ano, mesN] = mes.split('-').map(Number);
  const n = grafico.dias.length;
  const passo = L / n;
  const larg = Math.max(3, passo * 0.66);
  const maximo = Math.max(grafico.melhor?.valor ?? 0, grafico.media) * 1.04 || 1;
  const altura = (v: number) => Math.max(2, (v / maximo) * (BASE - TOPO));
  const yMedia = BASE - altura(grafico.media);

  const rotuloDia = (d: DiaDoGrafico) => {
    const semana = DIAS_SEMANA[new Date(ano, mesN - 1, d.dia).getDay()];
    return `${semana}, ${d.dia} de ${MESES[mesN - 1]}`;
  };
  // Hoje ainda está correndo: comparar o parcial com a média só assustaria.
  const vsMedia = sel?.valor && !sel.hoje && grafico.media > 0
    ? Math.round((sel.valor / grafico.media - 1) * 100) : null;

  return (
    <>
      <section className="e-leitura" aria-live="polite">
        <div className="e-olho">{sel ? rotuloDia(sel) : ''}{sel?.hoje ? ' · hoje' : ''}</div>
        <div className="e-leitura-valor e-num">
          {sel?.valor ? <><small>R$</small>{formatBRL(sel.valor).replace(/^R\$\s?/, '')}</> : 'Sem recebimento'}
        </div>
        {sel?.hoje && sel.valor !== null && (
          <div className="e-leitura-de">Parcial — o dia ainda está correndo.</div>
        )}
        {vsMedia !== null && (
          <div className="e-leitura-de">
            <span className={vsMedia >= 0 ? 'e-pos' : 'e-neg'}>
              {vsMedia === 0 ? 'na média' : `${Math.abs(vsMedia)}% ${vsMedia > 0 ? 'acima' : 'abaixo'} da média`}
            </span>
          </div>
        )}
      </section>

      <section className="e-graf">
        <svg viewBox={`0 0 ${L} 176`} role="img" aria-label="Recebido por dia do mês">
          <defs>
            <linearGradient id="e-mare" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0" stopColor="#2ba8e0" /><stop offset="1" stopColor="#34c27a" />
            </linearGradient>
          </defs>
          <line x1={0} x2={L} y1={yMedia} y2={yMedia} stroke="#0e1b26" strokeOpacity={0.5} strokeDasharray="3 4" />
          <text x={L - 2} y={14} textAnchor="end" fontSize={10.5} fill="#6a7784" fontFamily={FONTE}>
            - - média {valorCurto(grafico.media)}
          </text>
          <line x1={0} x2={L} y1={BASE + 0.5} y2={BASE + 0.5} stroke="#e7ebee" />
          {grafico.dias.map(d => {
            const x = (d.dia - 1) * passo + (passo - larg) / 2;
            const escolhido = d.dia === dia;
            const tocar = () => setTocado(d.dia);
            return (
              <g key={d.dia} role="button" tabIndex={d.valor !== null ? 0 : -1}
                aria-label={`${rotuloDia(d)}: ${d.valor !== null ? formatBRL(d.valor) : 'sem recebimento'}`}
                onClick={tocar}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tocar(); } }}>
                <rect x={(d.dia - 1) * passo} y={0} width={passo} height={BASE} fill="transparent" />
                {d.valor !== null ? (
                  d.hoje && !escolhido ? (
                    <rect x={x + 0.5} y={BASE - altura(d.valor) + 0.5} width={larg - 1} height={altura(d.valor) - 1}
                      rx={3} fill="none" stroke="#9aa7b0" strokeDasharray="3 2" />
                  ) : (
                    <rect x={x} y={BASE - altura(d.valor)} width={larg} height={altura(d.valor)} rx={3}
                      fill={escolhido ? 'url(#e-mare)' : '#cdd5da'} />
                  )
                ) : (
                  <rect x={x} y={BASE - 3} width={larg} height={3} rx={1.5} fill={d.futuro ? '#eef1f3' : '#e3e8eb'} />
                )}
              </g>
            );
          })}
          <text x={2} y={168} fontSize={10.5} fill="#6a7784" fontFamily={FONTE}>1/{mesN}</text>
          {dia && dia !== 1 && dia !== n && (
            <text x={(dia - 0.5) * passo} y={168} textAnchor="middle" fontSize={10.5} fill="#0e1b26"
              fontWeight={600} fontFamily={FONTE}>{dia}/{mesN}</text>
          )}
          <text x={L - 2} y={168} textAnchor="end" fontSize={10.5} fill="#6a7784" fontFamily={FONTE}>{n}/{mesN}</text>
        </svg>
      </section>

      <div className="e-tres">
        <div>
          <div className="e-olho">No mês</div>
          <div className="e-tres-v e-num">{valorCurto(grafico.total)}</div>
          <div className="e-tres-d">{grafico.diasComRecebimento} {grafico.diasComRecebimento === 1 ? 'dia' : 'dias'}</div>
        </div>
        <div>
          <div className="e-olho">Média</div>
          <div className="e-tres-v e-num">{valorCurto(grafico.media)}</div>
          <div className="e-tres-d">por dia</div>
        </div>
        <div>
          <div className="e-olho">Melhor dia</div>
          <div className="e-tres-v e-num">{grafico.melhor ? valorCurto(grafico.melhor.valor) : '—'}</div>
          <div className="e-tres-d">{grafico.melhor ? `${grafico.melhor.dia}/${mesN}` : ''}</div>
        </div>
      </div>
      <p className="e-nota">
        Toque numa barra para ver o dia. Hoje fica tracejado até fechar.
        {isPaguePlay && ' Valores brutos, como no gráfico do site.'}
      </p>
    </>
  );
}

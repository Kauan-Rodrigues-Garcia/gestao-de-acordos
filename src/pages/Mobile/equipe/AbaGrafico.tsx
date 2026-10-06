/**
 * Aba Gráfico — o Gráfico de recebimento do Painel do Líder, sem recharts
 * (spec da liderança §2.3). Barras por dia do mês, a média diária tracejada
 * (a do site: total ÷ dias com recebimento) e uma leitura grande do dia tocado
 * no lugar dos rótulos sobre cada ponto, que não cabem no celular.
 *
 * Revisão de 30/09/2026: os números do mês vêm primeiro (três quadros), o dia
 * tocado é lido no cabeçalho do próprio cartão do gráfico, todos os dias do
 * mês aparecem na linha de baixo, e a barra tocada não ganha contorno de foco
 * — o destaque é a cor dela e o dia marcado no eixo.
 *
 * Valor BRUTO, como o gráfico do site nos dois tenants.
 */
import { useMemo, useState } from 'react';
import { formatBRL } from '@/lib/money';
import { valorCurto } from '@/lib/mobile/formato';
import { montarGraficoDoMes, type DiaDoGrafico } from '@/lib/mobile/graficoDia';
import type { LinhaRecebidaDia } from '@/services/analitico/analitico.service';
import type { EscopoAnalitico } from '@/services/analitico/escopoAnalitico';
import { DinheiroAnimado } from '../comum/partesComuns';

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto',
  'setembro', 'outubro', 'novembro', 'dezembro'];

const L = 340;          // largura do desenho
const BASE = 142;       // linha do chão
const TOPO = 8;
const ALTURA = 164;
const FONTE = 'Figtree, system-ui, sans-serif';

export function AbaGrafico({ escopo, mes, hojeISO, linhas, carregando, erro, isPaguePlay, emHO = false, rodape = null }: {
  /** De quem é o gráfico: a equipe (as pessoas dela) ou o setor. */
  escopo: EscopoAnalitico;
  /** H.O. no interruptor (Cofen): as linhas já chegam convertidas. */
  emHO?: boolean;
  /** O que vem depois do gráfico (o setor põe as equipes aqui). */
  rodape?: React.ReactNode;
  mes: string;
  hojeISO: string;
  linhas: LinhaRecebidaDia[] | undefined;
  carregando: boolean;
  erro: boolean;
  isPaguePlay: boolean;
}) {
  const grafico = useMemo(() => montarGraficoDoMes({
    linhas: linhas ?? [], mes, hojeISO,
    escopo,
  }), [linhas, mes, hojeISO, escopo]);

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
    return <div className="e-esq" style={{ margin: '0 16px', height: 340 }} aria-busy="true" aria-label="Carregando" />;
  }
  if (erro) return <p className="e-vazio"><b>Não foi possível carregar o gráfico</b>Tente de novo em instantes.</p>;
  if (grafico.total === 0) {
    return <p className="e-vazio"><b>Nenhum recebimento neste mês</b>O gráfico aparece com o primeiro relatório do mês.</p>;
  }

  const [ano, mesN] = mes.split('-').map(Number);
  const n = grafico.dias.length;
  const passo = L / n;
  const larg = Math.max(3, passo * 0.62);
  const maximo = Math.max(grafico.melhor?.valor ?? 0, grafico.media) * 1.06 || 1;
  const altura = (v: number) => Math.max(2, (v / maximo) * (BASE - TOPO));
  const yMedia = BASE - altura(grafico.media);
  const fimDeSemana = (d: number) => {
    const s = new Date(ano, mesN - 1, d).getDay();
    return s === 0 || s === 6;
  };

  const rotuloDia = (d: DiaDoGrafico) => {
    const semana = DIAS_SEMANA[new Date(ano, mesN - 1, d.dia).getDay()];
    return `${semana}, ${d.dia} de ${MESES[mesN - 1]}`;
  };
  // Hoje ainda está correndo: comparar o parcial com a média só assustaria.
  const vsMedia = sel?.valor && !sel.hoje && grafico.media > 0
    ? Math.round((sel.valor / grafico.media - 1) * 100) : null;

  return (
    <>
      <div className="e-tres e-tres-topo">
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

      <section className="e-graf" aria-label="Recebido por dia">
        <div className="e-graf-cab" aria-live="polite">
          <div className="e-olho">{sel ? rotuloDia(sel) : ''}{sel?.hoje ? ' · hoje' : ''}</div>
          <div className="e-graf-valor e-num">
            {sel?.valor ? <DinheiroAnimado valor={sel.valor} semCor /> : 'Sem recebimento'}
          </div>
          <div className="e-graf-comp">
            {sel?.hoje && sel.valor !== null && <span>Parcial — o dia ainda está correndo.</span>}
            {vsMedia !== null && (
              <span className={`e-graf-pill ${vsMedia >= 0 ? 'e-graf-pill-pos' : 'e-graf-pill-neg'}`}>
                {vsMedia === 0 ? 'na média' : `${vsMedia > 0 ? '▲' : '▼'} ${Math.abs(vsMedia)}% ${vsMedia > 0 ? 'acima' : 'abaixo'} da média`}
              </span>
            )}
          </div>
        </div>

        <svg viewBox={`0 0 ${L} ${ALTURA}`} role="img" aria-label="Recebido por dia do mês">
          <defs>
            <linearGradient id="e-mare" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0" stopColor="#2ba8e0" /><stop offset="1" stopColor="#34c27a" />
            </linearGradient>
            <linearGradient id="e-mare-h" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#2ba8e0" /><stop offset="1" stopColor="#34c27a" />
            </linearGradient>
          </defs>
          <line x1={0} x2={L} y1={BASE + 0.5} y2={BASE + 0.5} stroke="#e7ebee" />
          {grafico.dias.map(d => {
            const x = (d.dia - 1) * passo + (passo - larg) / 2;
            const escolhido = d.dia === dia;
            const tocar = () => setTocado(d.dia);
            return (
              <g key={d.dia} className="e-graf-dia" role="button" tabIndex={d.valor !== null ? 0 : -1}
                aria-label={`${rotuloDia(d)}: ${d.valor !== null ? formatBRL(d.valor) : 'sem recebimento'}`}
                aria-pressed={escolhido}
                onClick={tocar}
                onFocus={tocar}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tocar(); } }}>
                <rect x={(d.dia - 1) * passo} y={0} width={passo} height={ALTURA} fill="transparent" />
                {escolhido && (
                  <rect x={(d.dia - 1) * passo + 0.5} y={TOPO - 4} width={passo - 1} height={BASE - TOPO + 4}
                    rx={4} fill="#2ba8e0" fillOpacity={0.07} />
                )}
                {d.valor !== null ? (
                  d.hoje && !escolhido ? (
                    <rect x={x + 0.5} y={BASE - altura(d.valor) + 0.5} width={larg - 1} height={altura(d.valor) - 1}
                      rx={2.5} fill="none" stroke="#9aa7b0" strokeDasharray="3 2" />
                  ) : (
                    <rect x={x} y={BASE - altura(d.valor)} width={larg} height={altura(d.valor)} rx={2.5}
                      fill={escolhido ? 'url(#e-mare)' : d.valor >= grafico.media ? '#b9cfd9' : '#d5dde2'} />
                  )
                ) : (
                  <rect x={x} y={BASE - 2} width={larg} height={2} rx={1} fill={d.futuro ? '#eef1f3' : '#e3e8eb'} />
                )}
                {escolhido && (
                  <rect x={(d.dia - 1) * passo + 1.5} y={BASE + 17} width={passo - 3} height={2.5} rx={1.25} fill="url(#e-mare-h)" />
                )}
                <text x={(d.dia - 0.5) * passo} y={BASE + 13} textAnchor="middle" fontFamily={FONTE}
                  fontSize={7.6} letterSpacing={-0.35} fontWeight={escolhido || d.hoje ? 700 : 500}
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                  fill={escolhido ? '#0e1b26' : d.hoje ? '#0e1b26' : fimDeSemana(d.dia) || d.futuro ? '#b3bdc4' : '#6a7784'}>
                  {d.dia}
                </text>
              </g>
            );
          })}
          <line x1={0} x2={L} y1={yMedia} y2={yMedia} stroke="#0e1b26" strokeOpacity={0.45}
            strokeDasharray="3 4" pointerEvents="none" />
        </svg>

        <div className="e-graf-leg" aria-hidden="true">
          <span><i className="e-graf-leg-media" />média {valorCurto(grafico.media)}/dia</span>
          <span><i className="e-graf-leg-acima" />acima da média</span>
          <span><i className="e-graf-leg-hoje" />hoje</span>
        </div>
      </section>

      <p className="e-nota">
        Toque numa barra para ver o dia. Hoje fica tracejado até fechar.
        {emHO ? ' Valores em H.O.' : isPaguePlay && ' Valores brutos, como no gráfico do site.'}
      </p>
      {rodape}
    </>
  );
}

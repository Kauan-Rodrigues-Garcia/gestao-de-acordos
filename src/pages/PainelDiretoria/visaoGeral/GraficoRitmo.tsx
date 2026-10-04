/**
 * O ritmo do mês em dois desenhos, cada um na sua escala e no mesmo eixo de
 * dias:
 *
 *   - em cima, a corrida: o acumulado contra o caminho da meta (que só anda em
 *     dia útil) e a linha até onde o mês fecha mantendo o ritmo;
 *   - embaixo, cada dia contra a meta por dia útil. Clicar num dia abre o
 *     resumo dele.
 *
 * SVG simples, sem biblioteca de gráfico: desenha uma vez por mudança de dado
 * e fica parado.
 */
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { formatBRL } from '@/lib/money';
import { cn } from '@/lib/utils';
import type { DiaDaSerie } from '@/services/mestre/diretoria.service';
import type { Calendario } from './placar';
import { mil } from './formato';

const ESQ = 8, DIR = 8;

/**
 * A largura real do desenho, medida: o SVG desenha em pixel de verdade e o
 * texto fica do mesmo tamanho quando o bloco alarga (o resumo do dia aberto).
 */
function useLargura() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(760);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const medir = () => setW(Math.max(280, Math.round(el.clientWidth)));
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

export const GraficoRitmo = memo(function GraficoRitmo({ mes, serie, meta, cal, diaCorte, diasNoMes, diaAberto, onDia, baixo = false }: {
  mes: string; serie: DiaDaSerie[]; meta: number | null; cal: Calendario; diaCorte: number; diasNoMes: number;
  diaAberto?: number | null; onDia?: (dia: number) => void; baixo?: boolean;
}) {
  const [ref, W] = useLargura();
  const larg = (W - ESQ - DIR) / diasNoMes;
  const px = (i: number) => ESQ + i * larg + larg / 2;
  const mm = mes.slice(5);

  const corrida = useMemo(() => {
    const H = baixo ? 130 : 160, T = 18, P = 8;
    const metaDia = meta && cal.totalUteis ? meta / cal.totalUteis : 0;
    let acc = 0, ideal = 0;
    const pts: [number, number][] = [], cam: [number, number][] = [];
    for (let i = 0; i < diasNoMes; i++) {
      acc += serie[i]?.valor ?? 0;
      if (cal.uteis.has(i + 1)) ideal += metaDia;
      if (i + 1 <= diaCorte) pts.push([i, acc]);
      cam.push([i, ideal]);
    }
    const ult = pts[pts.length - 1] ?? [0, 0];
    const fecha = cal.decorridos > 0 ? (ult[1] / cal.decorridos) * cal.totalUteis : ult[1];
    const fechado = diaCorte >= diasNoMes;
    const teto = Math.max(meta ?? 0, fecha, ult[1], 1) * 1.07;
    const y = (v: number) => T + (H - T - P) * (1 - v / teto);
    const linha = (arr: [number, number][]) => arr.map(([i, v], k) => `${k ? 'L' : 'M'}${px(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    const area = pts.length ? `${linha(pts)} L${px(ult[0]).toFixed(1)},${y(0).toFixed(1)} L${px(0).toFixed(1)},${y(0).toFixed(1)} Z` : '';
    const bate = meta ? fecha >= meta : true;
    return { H, y, linha, area, pts, cam, ult, fecha, fechado, bate };
  // `px` depende só de diasNoMes, que já está aqui.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serie, meta, cal, diaCorte, diasNoMes, baixo, W]);

  const colunas = useMemo(() => {
    const H = baixo ? 78 : 92, T = 14, P = 18;
    const metaDia = meta && cal.totalUteis ? meta / cal.totalUteis : 0;
    const maior = Math.max(metaDia * 1.25, ...serie.filter(d => d.dentroDoCorte).map(d => d.valor), 1) * 1.05;
    const y = (v: number) => T + (H - T - P) * (1 - v / maior);
    return { H, T, P, metaDia, maior, y };
  }, [serie, meta, cal, baixo]);

  const { H, y, linha, area, pts, cam, ult, fecha, fechado, bate } = corrida;
  const corFecha = bate ? 'var(--vg-q1)' : 'var(--vg-q3)';
  return (
    <div ref={ref} className="vg-ritmo">
      <svg className="vg-graf" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label="Acumulado do mês contra o caminho da meta">
        {meta ? (
          <>
            <line x1={ESQ} x2={W - DIR} y1={y(meta)} y2={y(meta)} className="vg-g-meta" />
            <text x={ESQ} y={y(meta) - 5}>meta {mil(meta)}</text>
            <path d={linha(cam)} className="vg-g-caminho" />
          </>
        ) : null}
        {area && <path d={area} className="vg-g-area" />}
        {pts.length > 0 && <path d={linha(pts)} className="vg-g-acc" />}
        {!fechado && pts.length > 0 && (
          <>
            <line x1={px(ult[0])} y1={y(ult[1])} x2={px(diasNoMes - 1)} y2={y(fecha)} stroke={corFecha} strokeWidth="2" strokeDasharray="3 4" />
            <circle cx={px(diasNoMes - 1)} cy={y(fecha)} r="4" fill={corFecha} />
            <text x={px(diasNoMes - 1) - 8} y={meta && fecha > meta ? y(fecha) - 8 : y(fecha) + 16} textAnchor="end" style={{ fill: corFecha, fontWeight: 600 }}>
              fecha em {mil(fecha)}
            </text>
          </>
        )}
        {pts.length > 0 && <circle cx={px(ult[0])} cy={y(ult[1])} r="4.5" className="vg-g-ponto" />}
      </svg>
      <div className="vg-colunas" style={{ height: colunas.H }}>
        {colunas.metaDia > 0 && (
          <div className="vg-g-metadia" style={{ top: colunas.y(colunas.metaDia) }}>
            <span>meta por dia útil {mil(colunas.metaDia)}</span>
          </div>
        )}
        {Array.from({ length: diasNoMes }, (_, i) => {
          const dia = i + 1, d = serie[i], futuro = dia > diaCorte, valor = d?.valor ?? 0;
          const util = cal.uteis.has(dia);
          const h = futuro ? 2 : Math.max(2, ((colunas.H - colunas.T - colunas.P) * valor) / colunas.maior);
          return (
            <button key={dia} type="button" disabled={futuro || !onDia} tabIndex={futuro || !onDia ? -1 : 0}
              className={cn('vg-c2', futuro && 'vg-futuro', !futuro && !util && 'vg-fds',
                !futuro && util && colunas.metaDia > 0 && (valor >= colunas.metaDia ? 'vg-bateu' : 'vg-abaixo'),
                dia === diaAberto && 'vg-sel')}
              style={{ height: h }}
              data-dica={futuro ? undefined : `${dia}/${mm} · ${mil(valor)}`}
              aria-label={futuro ? undefined : `Dia ${dia}: ${formatBRL(valor)}${onDia ? '. Ver o resumo do dia' : ''}`}
              aria-pressed={onDia ? dia === diaAberto : undefined}
              onClick={() => onDia?.(dia)} />
          );
        })}
        <div className="vg-eixo2"><span>1/{mm}</span><span>{diaCorte < diasNoMes ? `hoje · ${diaCorte}/${mm}` : 'mês fechado'}</span><span>{diasNoMes}/{mm}</span></div>
      </div>
      <div className="vg-gleg">
        <span><i className="vg-l-acc" />acumulado</span>
        {meta ? <span><i className="vg-l-cam" />caminho da meta</span> : null}
        {meta ? <span><i style={{ background: 'var(--vg-q1)' }} />dia acima da meta diária</span> : null}
        {meta ? <span><i style={{ background: 'var(--vg-q2)' }} />abaixo</span> : null}
        {!meta && <span>sem meta cadastrada: só o recebido</span>}
      </div>
    </div>
  );
});

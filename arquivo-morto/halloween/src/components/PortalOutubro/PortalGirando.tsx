/**
 * PortalGirando.tsx — o portal: anéis em blocos, laranja e verde, girando em
 * sentidos contrários, e o redemoinho escuro no meio. Sem degradê (os blocos
 * são o tracejado dos anéis).
 *
 * Cada anel é um desenho parado numa camada própria, e quem gira é a camada
 * (`transform` no HTML, que a placa de vídeo faz sem repintar). Girar o
 * `<g>` dentro de um SVG obrigava o navegador a repintar o portal inteiro a
 * cada quadro (26/10/2026: 30% da CPU no teste). As fagulhas piscam juntas,
 * pela `opacity` da camada delas. No modo leve nada gira.
 */
import { useMemo } from 'react';
import { sorteador } from './rachaduras';

const ANEIS: readonly { r: number; cor: string; largura: number; traco: string; sentido: 1 | -1; dura: number }[] = [
  { r: 196, cor: '#ff8a1f', largura: 14, traco: '18 6', sentido: 1, dura: 14 },
  { r: 178, cor: '#ffc46b', largura: 4, traco: '6 10', sentido: -1, dura: 9 },
  { r: 160, cor: '#9dff5c', largura: 8, traco: '10 14', sentido: 1, dura: 7 },
  { r: 132, cor: '#3d8a2a', largura: 6, traco: '4 12', sentido: -1, dura: 5 },
  { r: 104, cor: '#9dff5c', largura: 4, traco: '3 15', sentido: 1, dura: 4 },
];

const CAIXA = '-250 -250 500 500';

export function PortalGirando({ className }: { className?: string }) {
  const fagulhas = useMemo(() => {
    const acaso = sorteador(51);
    return Array.from({ length: 28 }, () => {
      const a = acaso() * Math.PI * 2, r = 206 + acaso() * 34;
      return { x: Math.round(Math.cos(a) * r), y: Math.round(Math.sin(a) * r), tam: acaso() < 0.3 ? 6 : 4, cor: acaso() < 0.5 ? '#ff8a1f' : '#ffd34d', par: acaso() < 0.5 };
    });
  }, []);
  return (
    <div className={`portal-girando ${className ?? ''}`} aria-hidden>
      <svg viewBox={CAIXA}>
        <circle r={190} fill="#06100a" />
        <circle r={120} fill="#0a1a0f" />
        <circle r={70} fill="#030604" />
      </svg>
      {ANEIS.map((a, i) => (
        <div key={i} className="portal-anel" style={{ animationDuration: `${a.dura}s`, animationDirection: a.sentido === 1 ? 'normal' : 'reverse' }}>
          <svg viewBox={CAIXA} shapeRendering="crispEdges">
            <circle r={a.r} fill="none" stroke={a.cor} strokeWidth={a.largura} strokeDasharray={a.traco} />
          </svg>
        </div>
      ))}
      {/* Duas camadas de fagulhas, piscando em tempos trocados. */}
      {[true, false].map(par => (
        <div key={String(par)} className={`portal-fagulhas${par ? '' : ' portal-fagulhas-2'}`}>
          <svg viewBox={CAIXA} shapeRendering="crispEdges">
            {fagulhas.filter(f => f.par === par).map((f, i) => <rect key={i} x={f.x} y={f.y} width={f.tam} height={f.tam} fill={f.cor} />)}
          </svg>
        </div>
      ))}
    </div>
  );
}

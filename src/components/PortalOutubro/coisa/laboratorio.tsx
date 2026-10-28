/**
 * laboratorio.tsx — os quadros da Coisa ampliados, SÓ no localhost
 * (http://localhost:8080/lab-coisa.html): o palhaço parado, a dança, a
 * fúria, ela puxando o mural e as caras de perto (`cabecona.ts`), para
 * acertar o desenho sem passar pelo mural.
 */
import { StrictMode, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { PUXANDO, QUADROS } from './desenho';
import { PALETA_DA_COISA, PALETA_DA_FURIA, type Paleta } from './arte';
import { PALETA_DA_CABECONA, PALETA_DO_FOGO, montarCabecona, paletaEmCinza, type PoseDaCabecona } from './cabecona';
import { pintarGrade } from './derry';

function Quadro({ linhas, paleta, escala }: { linhas: readonly string[]; paleta: Paleta; escala: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current?.getContext('2d');
    if (c) pintarGrade(c, linhas, paleta, 0, 0);
  }, [linhas, paleta]);
  return (
    <canvas
      ref={ref}
      width={linhas[0].length}
      height={linhas.length}
      style={{ width: linhas[0].length * escala, height: linhas.length * escala, imageRendering: 'pixelated' }}
    />
  );
}

const CARAS: readonly [string, PoseDaCabecona, number?][] = [
  ['parada', {}],
  ['escondida (porta)', { balao: true, brilho: true }, 0.85],
  ['cabeça baixa', { baixa: true, dentes: true, brilho: true }],
  ['torta, olhando', { inclina: 0.8, olhar: [1, 0], dentes: true }],
  ['de baixo, sangue, baba', { baixa: true, sangue: true, brilho: true, baba: [9, 14] }],
  ['abrindo', { queixo: 0.45, brilho: true }],
  ['bocarra', { queixo: 1, brilho: true, corpo: false }],
  ['depois do bote', { sangue: true, dentes: true, brilho: true, olhar: [-1, 1], corpo: false }],
  ['piscando', { piscando: true, dentes: true }],
  ['no fogo, encarando', { fogo: true, baixa: true, sangue: true, dentes: true, baba: [12, 16] }],
  ['no fogo, abrindo', { fogo: true, sangue: true, queixo: 0.5, baba: [6, 9] }],
  ['no fogo, bocarra', { fogo: true, sangue: true, queixo: 1 }],
];

function Laboratorio() {
  return (
    <div style={{ minHeight: '100vh', background: '#141a20', padding: 24, display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-end', color: '#ccc', font: '12px monospace' }}>
      {CARAS.map(([nome, pose, cinza]) => (
        <figure key={nome} style={{ margin: 0 }}>
          <Quadro linhas={montarCabecona(pose)} paleta={paletaEmCinza(cinza ?? 0, pose.fogo ? PALETA_DO_FOGO : PALETA_DA_CABECONA)} escala={4} />
          <figcaption>{nome}</figcaption>
        </figure>
      ))}
      <div style={{ flexBasis: '100%' }} />
      {QUADROS.map((q, i) => <Quadro key={i} linhas={q.linhas} paleta={PALETA_DA_COISA} escala={i === 0 ? 6 : 3} />)}
      <Quadro linhas={QUADROS[0].linhas} paleta={PALETA_DA_FURIA} escala={4} />
      <div style={{ flexBasis: '100%' }} />
      {[...PUXANDO.anda, PUXANDO.firma, ...PUXANDO.puxa].map((linhas, i) => <Quadro key={`p${i}`} linhas={linhas} paleta={PALETA_DA_COISA} escala={3} />)}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><Laboratorio /></StrictMode>);

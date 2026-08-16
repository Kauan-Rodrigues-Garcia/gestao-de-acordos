/**
 * MathLab — a matemática das animações, com os controles na mão de quem lê.
 * ─────────────────────────────────────────────────────────────────────────────
 * Cinco experimentos, cada um mostrando a fórmula ao lado do resultado. A ideia
 * é que a pessoa mexa no parâmetro e veja a curva mudar — em vez de ler que a
 * animação "usa seno".
 *
 * Todos desenham no MESMO canvas e no MESMO laço: cinco canvas com cinco
 * `requestAnimationFrame` custariam cinco vezes mais para mostrar uma coisa de
 * cada vez.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useCreators } from '../theme/CreatorsProvider';
import { SecaoLab } from '../components/SecaoLab';
import {
  PHI, onda, pontoOrbital, distancia, influencia, repulsao, alturaAurea,
  razaoFibonacci, TAU, limitar,
} from '../lib/matematica';

type Experimento = 'ondas' | 'orbita' | 'distancia' | 'repulsao' | 'aurea';

const EXPERIMENTOS: { id: Experimento; nome: string; formula: string; explica: string }[] = [
  { id: 'ondas', nome: 'Trigonometria', formula: 'y = A · sen(f·x + φ)',
    explica: 'Toda oscilação suave de interface é isto. Amplitude é o quanto sobe; frequência é quantas vezes.' },
  { id: 'orbita', nome: 'Movimento orbital', formula: 'x = cx + r·cos(θ)   y = cy + r·sen(θ)',
    explica: 'Os nós que orbitam o perfil lá em cima usam exatamente esta conta.' },
  { id: 'distancia', nome: 'Distância euclidiana', formula: 'd = √(dx² + dy²)',
    explica: 'É como as partículas do fundo sabem que o cursor chegou perto.' },
  { id: 'repulsao', nome: 'Repulsão', formula: 'F ∝ 1 / d²',
    explica: 'A física não se importa que d chegue a zero. Aqui importa: sem um epsilon, a força vira infinito.' },
  { id: 'aurea', nome: 'Proporção áurea', formula: 'φ = (1 + √5) / 2 ≈ 1,618',
    explica: 'Os vértices do icosaedro do topo saem daqui. E a razão de Fibonacci converge para ele.' },
];

export function MathLab() {
  const { tokens, movimentoReduzido, registrar } = useCreators();
  const [ativo, setAtivo] = useState<Experimento>('ondas');
  const [amplitude, setAmplitude] = useState(40);
  const [frequencia, setFrequencia] = useState(2);
  const [velocidade, setVelocidade] = useState(1);
  const [revelouPhi, setRevelouPhi] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef  = useRef<number | null>(null);
  const mouseRef  = useRef({ x: -999, y: -999 });

  const arcade = tokens.id === 'arcade';

  useEffect(() => {
    registrar({ experimentosUsados: [ativo], totalExperimentos: EXPERIMENTOS.length });
  }, [ativo, registrar]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let L = 0, A = 0;
    let t = 0;
    let rodando = true;

    // Partículas do experimento de repulsão — criadas uma vez.
    const pontos = Array.from({ length: 46 }, (_, i) => ({
      x: 0, y: 0, ox: 0, oy: 0, i,
    }));

    function medir() {
      L = canvas.clientWidth;
      A = 220;
      canvas.width  = Math.floor(L * dpr);
      canvas.height = Math.floor(A * dpr);
      canvas.style.height = `${A}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      pontos.forEach((p, i) => {
        const col = i % 12, lin = Math.floor(i / 12);
        p.ox = (L / 13) * (col + 1);
        p.oy = 45 + lin * 45;
        p.x = p.ox; p.y = p.oy;
      });
    }

    /**
     * Desenha UM quadro. Separada do agendamento de propósito: assim o modo de
     * movimento reduzido reaproveita exatamente o mesmo desenho, sem duplicar
     * nada e sem precisar enganar a condição de parada do laço.
     */
    function desenhar() {
      t += 0.016 * velocidade;
      ctx.clearRect(0, 0, L, A);
      const { x: mx, y: my } = mouseRef.current;

      if (ativo === 'ondas') {
        for (const [tipo, cor] of [['sin', tokens.cores.primaria], ['cos', tokens.cores.secundaria]] as const) {
          ctx.beginPath();
          ctx.strokeStyle = cor;
          ctx.lineWidth = 2;
          for (let x = 0; x <= L; x += 2) {
            const y = A / 2 - onda(x / 60, amplitude, frequencia * 0.2, t, tipo);
            if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
        ctx.strokeStyle = tokens.cores.borda;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, A / 2); ctx.lineTo(L, A / 2); ctx.stroke();
      }

      if (ativo === 'orbita') {
        const cx = L / 2, cy = A / 2;
        const rotulos = ['CODE', 'AI', 'GAMES', 'TECH', 'MUSIC', 'FILMES'];
        ctx.strokeStyle = tokens.cores.borda;
        ctx.lineWidth = 1;
        for (const r of [50, 80]) {
          ctx.beginPath();
          ctx.ellipse(cx, cy, r, r * 0.42, 0, 0, TAU);
          ctx.stroke();
        }
        rotulos.forEach((rot, i) => {
          const raio = i % 2 === 0 ? 50 : 80;
          const ang = t * (i % 2 === 0 ? 1 : -0.7) + (i / rotulos.length) * TAU;
          const p = pontoOrbital(cx, cy, raio, ang, 0.42);
          ctx.fillStyle = i % 2 === 0 ? tokens.cores.primaria : tokens.cores.acento;
          ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, TAU); ctx.fill();
          ctx.font = '9px monospace';
          ctx.fillStyle = tokens.cores.textoSuave;
          ctx.fillText(rot, p.x + 7, p.y + 3);
        });
        ctx.fillStyle = tokens.cores.secundaria;
        ctx.beginPath(); ctx.arc(cx, cy, 7, 0, TAU); ctx.fill();
      }

      if (ativo === 'distancia') {
        for (const p of pontos) {
          const d = distancia(p.ox, p.oy, mx, my);
          const inf = influencia(d, 130);
          ctx.globalAlpha = 0.2 + inf * 0.8;
          ctx.fillStyle = inf > 0.5 ? tokens.cores.secundaria : tokens.cores.primaria;
          ctx.beginPath(); ctx.arc(p.ox, p.oy, 2 + inf * 5, 0, TAU); ctx.fill();
        }
        ctx.globalAlpha = 1;
        if (mx > 0) {
          ctx.strokeStyle = tokens.cores.acento;
          ctx.beginPath(); ctx.arc(mx, my, 130, 0, TAU); ctx.stroke();
        }
      }

      if (ativo === 'repulsao') {
        for (const p of pontos) {
          const dx = p.x - mx, dy = p.y - my;
          const d = Math.hypot(dx, dy);
          if (d < 150) {
            const { fx, fy } = repulsao(dx, dy, 2200, 10, 6);
            p.x += fx * 0.4; p.y += fy * 0.4;
          }
          // Volta devagar para o lugar de origem.
          p.x += (p.ox - p.x) * 0.06;
          p.y += (p.oy - p.y) * 0.06;
          const desloc = distancia(p.x, p.y, p.ox, p.oy);
          ctx.fillStyle = desloc > 12 ? tokens.cores.secundaria : tokens.cores.primaria;
          ctx.globalAlpha = 0.35 + limitar(desloc / 40, 0, 0.65);
          ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, TAU); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }

      if (ativo === 'aurea') {
        // Retângulos áureos encaixados: cada um é o anterior dividido por φ.
        let larg = Math.min(L - 40, 300);
        let alt  = alturaAurea(larg);
        let x = (L - larg) / 2;
        const y = (A - alt) / 2;
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 7; i++) {
          ctx.strokeStyle = i === 0 ? tokens.cores.primaria : tokens.cores.borda;
          ctx.globalAlpha = 1 - i * 0.1;
          ctx.strokeRect(x, y, larg, alt);
          const novaLarg = alt;
          const novaAlt  = alturaAurea(novaLarg);
          x += larg - novaLarg;
          larg = novaLarg; alt = novaAlt;
        }
        ctx.globalAlpha = 1;
      }
    }

    function quadro() {
      if (!rodando) { frameRef.current = null; return; }
      desenhar();
      frameRef.current = requestAnimationFrame(quadro);
    }

    function aoMover(e: PointerEvent) {
      const r = canvas.getBoundingClientRect();
      mouseRef.current = { x: e.clientX - r.left, y: e.clientY - r.top };
    }
    function aoSair() { mouseRef.current = { x: -999, y: -999 }; }
    function aoTrocarVisibilidade() {
      rodando = !document.hidden;
      if (document.hidden) {
        if (frameRef.current !== null) { cancelAnimationFrame(frameRef.current); frameRef.current = null; }
      } else if (frameRef.current === null) frameRef.current = requestAnimationFrame(quadro);
    }

    medir();

    if (movimentoReduzido) {
      // Um quadro, parado, num instante escolhido para a curva ficar legível.
      t = 0.6;
      rodando = false;
      desenhar();
    } else {
      frameRef.current = requestAnimationFrame(quadro);
    }

    canvas.addEventListener('pointermove', aoMover, { passive: true });
    canvas.addEventListener('pointerleave', aoSair);
    window.addEventListener('resize', medir);
    document.addEventListener('visibilitychange', aoTrocarVisibilidade);

    return () => {
      rodando = false;
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      canvas.removeEventListener('pointermove', aoMover);
      canvas.removeEventListener('pointerleave', aoSair);
      window.removeEventListener('resize', medir);
      document.removeEventListener('visibilitychange', aoTrocarVisibilidade);
    };
  }, [ativo, amplitude, frequencia, velocidade, tokens, movimentoReduzido]);

  const atual = useMemo(() => EXPERIMENTOS.find(e => e.id === ativo)!, [ativo]);

  return (
    <SecaoLab
      id="math"
      rotulo={tokens.vocab.matematica}
      titulo={arcade ? 'BONUS STAGE' : 'MATH // LAB'}
      descricao="Animação não é mágica de biblioteca. Mexa nos controles e veja a fórmula responder."
    >
      <div className="flex flex-wrap gap-2">
        {EXPERIMENTOS.map(e => (
          <button
            key={e.id}
            type="button"
            onClick={() => setAtivo(e.id)}
            className="creators-lab__btn"
            style={ativo === e.id
              ? { background: tokens.cores.primaria, color: tokens.cores.fundo }
              : undefined}
            aria-pressed={ativo === e.id}
          >
            {e.nome}
          </button>
        ))}
      </div>

      <div className="creators-lab__painel mt-4 overflow-hidden">
        <canvas ref={canvasRef} className="block w-full" aria-label={`Visualização: ${atual.nome}`} role="img" />
        <div className="border-t p-4" style={{ borderColor: tokens.cores.borda }}>
          <code className="creators-lab__mono text-sm" style={{ color: tokens.cores.acento }}>
            {atual.formula}
          </code>
          <p className="mt-2 text-xs" style={{ color: tokens.cores.textoSuave }}>{atual.explica}</p>

          {ativo === 'ondas' && (
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {([
                ['Amplitude', amplitude, setAmplitude, 5, 90],
                ['Frequência', frequencia, setFrequencia, 1, 12],
                ['Velocidade', velocidade, setVelocidade, 0, 4],
              ] as const).map(([rot, val, set, min, max]) => (
                <label key={rot} className="block">
                  <span className="creators-lab__mono flex justify-between text-[.62rem]"
                        style={{ color: tokens.cores.textoSuave }}>
                    <span>{rot}</span><span style={{ color: tokens.cores.primaria }}>{val}</span>
                  </span>
                  <input
                    type="range" min={min} max={max} step={rot === 'Velocidade' ? 0.1 : 1}
                    value={val}
                    onChange={e => (set as (n: number) => void)(Number(e.target.value))}
                    className="mt-1 w-full"
                    style={{ accentColor: tokens.cores.primaria }}
                  />
                </label>
              ))}
            </div>
          )}

          {ativo === 'aurea' && (
            <div className="mt-4">
              {!revelouPhi ? (
                <button className="creators-lab__btn" onClick={() => setRevelouPhi(true)}>
                  WHY 1.618?
                </button>
              ) : (
                <div className="creators-lab__ficha" style={{ color: tokens.cores.texto }}>
                  <p style={{ color: tokens.cores.acento }}>THE GOLDEN RATIO</p>
                  <p>φ = {PHI.toFixed(15)}</p>
                  <p className="mt-2" style={{ color: tokens.cores.textoSuave }}>
                    Fibonacci: 1, 1, 2, 3, 5, 8, 13, 21…
                  </p>
                  <p style={{ color: tokens.cores.textoSuave }}>
                    razão no 30º termo → {razaoFibonacci(30).toFixed(12)}
                  </p>
                  <p className="mt-2 text-xs" style={{ color: tokens.cores.textoSuave }}>
                    Não foi escolhido por gosto. Ele emerge da sequência — e dos
                    vértices do sólido lá no topo desta página.
                  </p>
                </div>
              )}
            </div>
          )}

          {(ativo === 'distancia' || ativo === 'repulsao') && (
            <p className="creators-lab__mono mt-3 text-[.62rem]" style={{ color: tokens.cores.secundaria }}>
              ▸ mova o cursor sobre a área acima
            </p>
          )}
        </div>
      </div>
    </SecaoLab>
  );
}

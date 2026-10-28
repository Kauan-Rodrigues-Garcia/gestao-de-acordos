/**
 * Roleta.tsx — a roleta do mural: os nomes passando numa janela, rápido no
 * começo e freando até parar no ganhador (`sorteio.ts`). O ganhador entra
 * pronto — no dia ele virá do servidor; aqui, do sorteio local de teste.
 *
 * Mais o confete em blocos, para quando ela para.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { freio, montarFita } from './sorteio';
import { sorteador } from './acaso';

export interface NaRoleta { nome: string; setor: string | null }

const LINHA = 64;
const VISIVEIS = 5;

export function Roleta({ itens, ganhador, duracaoMs, aoParar }: {
  itens: readonly NaRoleta[];
  ganhador: number;
  duracaoMs: number;
  aoParar: () => void;
}) {
  const { fita, parada } = useMemo(
    () => montarFita(itens, ganhador, itens.length < 10 ? 14 : 3),
    [itens, ganhador],
  );
  const [parou, setParou] = useState(false);
  const fitaRef = useRef<HTMLDivElement>(null);
  const fim = useRef(aoParar);
  fim.current = aoParar;

  // A fita anda pelo `transform` direto no elemento, sem React a cada quadro
  // (redesenhar os nomes 60 vezes por segundo pesava: 58% da CPU no teste).
  useEffect(() => {
    let id = 0;
    const inicio = performance.now();
    const meio = Math.floor(VISIVEIS / 2);
    const passo = (t: number) => {
      const x = Math.min(1, (t - inicio) / duracaoMs);
      const pos = freio(x) * parada;
      if (fitaRef.current) fitaRef.current.style.transform = `translate3d(0, ${-(pos - meio) * LINHA}px, 0)`;
      if (x < 1) id = requestAnimationFrame(passo);
      else { setParou(true); fim.current(); }
    };
    passo(inicio);
    return () => cancelAnimationFrame(id);
  }, [parada, duracaoMs]);

  return (
    <div className="portal-roleta" style={{ height: LINHA * VISIVEIS }}>
      <div ref={fitaRef} className="portal-roleta-fita">
        {fita.map((p, i) => (
          <div key={i} className={`portal-roleta-linha${parou && i === parada ? ' portal-roleta-ganhou' : ''}`} style={{ height: LINHA }}>
            <span className="portal-roleta-nome">{p.nome}</span>
            {p.setor && <span className="portal-roleta-setor">{p.setor}</span>}
          </div>
        ))}
      </div>
      <div className="portal-roleta-mira" style={{ top: LINHA * Math.floor(VISIVEIS / 2), height: LINHA }} aria-hidden />
    </div>
  );
}

const CORES = ['#ff8a1f', '#9dff5c', '#f0c75e', '#c8202a', '#ece5d0'];

/** O confete em blocos. Cada peça cai com os números dela (Web Animations), que a placa de vídeo faz sozinha. */
export function Confete({ semente = 1 }: { semente?: number }) {
  const raiz = useRef<HTMLDivElement>(null);
  const pecas = useMemo(() => {
    const acaso = sorteador(semente);
    return Array.from({ length: 70 }, (_, i) => ({
      i,
      x: Math.round(acaso() * 100),
      tam: acaso() < 0.3 ? 12 : 8,
      cor: CORES[Math.floor(acaso() * CORES.length)],
      atraso: Math.round(acaso() * 900),
      dura: Math.round(1800 + acaso() * 1600),
      giro: Math.round((acaso() - 0.5) * 720),
    }));
  }, [semente]);
  useEffect(() => {
    const els = Array.from(raiz.current?.children ?? []) as HTMLElement[];
    const anims = els.map((el, i) => {
      const p = pecas[i];
      if (!p || typeof el.animate !== 'function') return null;
      return el.animate(
        [{ transform: 'translateY(0) rotate(0deg)' }, { transform: `translateY(${window.innerHeight + 40}px) rotate(${p.giro}deg)` }],
        { duration: p.dura, delay: p.atraso, easing: 'linear', fill: 'both' },
      );
    });
    return () => { for (const a of anims) a?.cancel(); };
  }, [pecas]);
  return (
    <div ref={raiz} className="portal-confete" aria-hidden>
      {pecas.map(p => <span key={p.i} style={{ left: `${p.x}%`, width: p.tam, height: p.tam, background: p.cor }} />)}
    </div>
  );
}

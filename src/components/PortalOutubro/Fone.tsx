/**
 * Fone.tsx — o player de música que se foi (o som ambiente do Gestão, de
 * 01/10 a 23/10/2026), agora como fone pendurado num prego (pedido de
 * 28/10/2026: «algo melhor, um fone escrito F»): o F de prestar homenagem,
 * na tecla ao lado (as conchas ficaram lisas, a pedido).
 * O fio está cortado, desfiado no cobre. Quem aperta F no teclado (ou clica
 * na tecla) presta a homenagem: a tecla afunda, o fone balança e os F sobem
 * como num chat. A conta é só desta tela.
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Pixel } from './Bueiro';

const L = 36, A = 31;

const PALETA_DO_FONE = {
  o: '#08080b', B: '#3b3b44', b: '#6a6a77', k: '#22222a',
  C: '#2b2b33', c: '#4b4b57', P: '#151519', p: '#2c2c34',
};

/** O fone em pixel: o arco e as duas conchas com a almofada para dentro (o F fica só na tecla). */
function montarFone(): string[] {
  const g = Array.from({ length: A }, () => Array<string>(L).fill('.'));
  const p = (x: number, y: number, ch: string) => { if (x >= 0 && y >= 0 && x < L && y < A) g[y][x] = ch; };
  // O arco.
  const cx = 17.5, cy = 18;
  for (let y = 1; y <= 18; y++) {
    for (let x = 1; x < L - 1; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d >= 13.6 && d < 14.6) p(x, y, 'k');
      else if (d >= 14.6 && d < 15.8) p(x, y, 'B');
      else if (d >= 15.8 && d < 16.8) p(x, y, y < 12 ? 'b' : 'B');
    }
  }
  // As conchas: a casca, o brilho e a almofada (para o lado de dentro).
  for (const [x0, dentro] of [[1, 1], [26, -1]] as const) {
    for (let y = 15; y <= 29; y++) {
      for (let x = x0; x < x0 + 9; x++) {
        const canto = (y === 15 || y === 29) && (x === x0 || x === x0 + 8);
        if (canto) continue;
        const borda = dentro > 0 ? x >= x0 + 7 : x <= x0 + 1;
        p(x, y, borda ? (y % 3 === 0 ? 'p' : 'P') : (dentro > 0 ? x === x0 + 1 : x === x0 + 7) ? 'c' : 'C');
      }
    }
  }
  // O contorno.
  const cheio = (x: number, y: number) => g[y]?.[x] !== undefined && g[y][x] !== '.' && g[y][x] !== 'o';
  for (let y = 0; y < A; y++) for (let x = 0; x < L; x++) {
    if (g[y][x] === '.' && (cheio(x - 1, y) || cheio(x + 1, y) || cheio(x, y - 1) || cheio(x, y + 1))) g[y][x] = 'o';
  }
  return g.map(l => l.join(''));
}

const FONE = montarFone();

interface Homenagem { id: number; x: number; giro: number }

export function Fone({ x, y, tam = 4, pausado }: { x: number; y: number; tam?: number; pausado: boolean }) {
  const [fs, setFs] = useState<Homenagem[]>([]);
  const [apertou, setApertou] = useState(0);
  const proximo = useRef(0);
  const pausadoRef = useRef(pausado);
  pausadoRef.current = pausado;

  const homenagem = () => {
    const id = proximo.current++;
    setApertou(n => n + 1);
    setFs(l => [...l.slice(-14), { id, x: Math.round(Math.random() * 120 - 30), giro: Math.round(Math.random() * 16 - 8) }]);
    window.setTimeout(() => setFs(l => l.filter(f => f.id !== id)), 2200);
  };
  const homenagemRef = useRef(homenagem);
  homenagemRef.current = homenagem;

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.repeat || pausadoRef.current || (e.key !== 'f' && e.key !== 'F')) return;
      if (e.target instanceof Element && e.target.closest('input, textarea, [contenteditable="true"]')) return;
      homenagemRef.current();
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, []);

  return (
    <div className="mural-fone" style={{ left: x, top: y } as CSSProperties}>
      <span className="mural-fone-prego" aria-hidden />
      <div key={apertou} className={`mural-fone-pendurado${apertou ? ' mural-fone-balanca' : ''}`} title="Infelizmente o player se foi…">
        <Pixel linhas={FONE} paleta={PALETA_DO_FONE} tam={tam} />
        <svg className="mural-fone-fio" width={70} height={92} viewBox="0 0 70 92" aria-hidden>
          <path d="M14 0 C 10 22, 40 26, 30 48 S 8 70, 26 84" />
          <path className="mural-fone-cobre" d="M26 84 l-5 7 M26 84 l1 8 M26 84 l6 6" />
        </svg>
        <div className="mural-fone-etiqueta">
          <p className="mural-fone-nome">Player de música</p>
          <p className="mural-fone-data">01/10 – 23/10/2026</p>
          <p className="mural-fone-frase">A música não toca mais por aqui.</p>
        </div>
      </div>
      <button type="button" className={`mural-fone-tecla${apertou ? ' mural-fone-tecla-apertou' : ''}`} key={`t${apertou}`} onClick={homenagem}>
        <span>F</span>
      </button>
      <p className="mural-fone-dica">aperte F para prestar homenagem</p>
      <div className="mural-fone-fs" aria-hidden>
        {fs.map(f => <span key={f.id} style={{ left: f.x, rotate: `${f.giro}deg` }}>F</span>)}
      </div>
    </div>
  );
}

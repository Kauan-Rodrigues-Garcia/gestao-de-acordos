/**
 * VultoNoVidro — o fundo do Analítico: vultos do outro lado de um vidro fosco.
 *
 * Vários ao mesmo tempo, cada um na sua faixa da tela (sem se atropelarem), e
 * cada aparição sorteia um tipo: comum, de chifres, de cartola, de chapéu de
 * bruxa, de capuz, alto e magro, pequeno de cabeça grande, grandalhão,
 * orelhudo. Surgem devagar da névoa, acendem os olhos, piscam quando bem
 * entendem — às vezes duas vezes, às vezes fecham por um tempo — e somem.
 *
 * Atrás deles, uma lâmpada que zumbe, engasga e às vezes apaga. No escuro é
 * ela que recorta os vultos: sem luz, só os olhos ficam.
 *
 * ## Leve de propósito
 *
 * - O desfoque de cada vulto é FIXO (sorteado na aparição). Só se anima
 *   opacidade e posição, que a placa de vídeo compõe sem redesenhar: o vulto
 *   desfocado é pintado uma vez por aparição.
 * - A lâmpada é uma variável CSS não herdada (`--lampada`) escrita só na luz e
 *   na sombra de cada vulto — pisca dezenas de vezes por minuto, não redesenha
 *   o React e não toca no SVG desfocado (ver `halloween.css`).
 * - Cada vulto cuida dos próprios tempos; piscar redesenha só aquele vulto.
 */
import { memo, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

const acaso = (min: number, max: number) => min + Math.random() * (max - min);

// ── Os tipos ──────────────────────────────────────────────────────────────────
//
// Desenhados num quadro de 200 × 400, com os pés embaixo. Os olhos vão em
// coordenadas do mesmo quadro: altura, meia distância entre eles, tamanho e
// inclinação (positiva = cara de bravo).

type Olhos = { y: number; dx: number; w: number; h: number; giro: number };
type Tipo = { desenho: ReactNode; olhos: Olhos; escala: number };

const TRONCO = 'M30 240 C 32 205, 62 186, 84 182 L 116 182 C 138 186, 168 205, 170 240 L 182 400 L 18 400 Z';
const CABECA = <><ellipse cx="100" cy="120" rx="28" ry="36" /><rect x="88" y="148" width="24" height="40" rx="10" /><path d={TRONCO} /></>;

const TIPOS: Record<string, Tipo> = {
  comum: { desenho: CABECA, olhos: { y: 118, dx: 12, w: 11, h: 4, giro: 8 }, escala: 1 },
  chifres: {
    desenho: <>{CABECA}
      <path d="M82 98 C 66 84, 58 62, 68 38 C 72 58, 80 74, 94 88 Z" />
      <path d="M118 98 C 134 84, 142 62, 132 38 C 128 58, 120 74, 106 88 Z" /></>,
    olhos: { y: 119, dx: 12, w: 12, h: 4, giro: 16 }, escala: 1.02,
  },
  cartola: {
    desenho: <>{CABECA}
      <ellipse cx="100" cy="90" rx="44" ry="7" />
      <path d="M76 92 L 78 30 Q 100 24 122 30 L 124 92 Z" /></>,
    olhos: { y: 119, dx: 12, w: 11, h: 3.5, giro: 4 }, escala: 1,
  },
  bruxa: {
    desenho: <>{CABECA}
      <ellipse cx="100" cy="92" rx="52" ry="7" />
      <path d="M70 94 Q 92 62 102 12 Q 110 2 118 12 Q 112 52 132 94 Z" /></>,
    olhos: { y: 120, dx: 11, w: 10, h: 4, giro: 12 }, escala: 0.98,
  },
  capuz: {
    desenho: <>
      <path d="M100 36 C 62 62, 54 120, 58 176 L 142 176 C 146 120, 138 62, 100 36 Z" />
      <path d="M22 250 C 26 204, 56 178, 84 172 L 116 172 C 144 178, 174 204, 178 250 L 190 400 L 10 400 Z" /></>,
    olhos: { y: 128, dx: 10, w: 9, h: 3, giro: 10 }, escala: 1.04,
  },
  alto: {
    desenho: <>
      <ellipse cx="100" cy="70" rx="23" ry="40" />
      <rect x="92" y="100" width="16" height="78" rx="7" />
      <path d="M50 220 C 52 190, 74 176, 90 172 L 110 172 C 126 176, 148 190, 150 220 L 160 400 L 40 400 Z" /></>,
    olhos: { y: 70, dx: 10, w: 10, h: 3.5, giro: 6 }, escala: 1.12,
  },
  pequeno: {
    desenho: <>
      <ellipse cx="100" cy="250" rx="36" ry="38" />
      <rect x="90" y="280" width="20" height="24" rx="8" />
      <path d="M50 342 C 52 312, 76 298, 90 296 L 110 296 C 124 298, 148 312, 150 342 L 158 400 L 42 400 Z" /></>,
    olhos: { y: 248, dx: 14, w: 9, h: 9, giro: 0 }, escala: 0.82,
  },
  grandalhao: {
    desenho: <>
      <ellipse cx="100" cy="122" rx="24" ry="30" />
      <rect x="84" y="140" width="32" height="40" rx="12" />
      <path d="M4 250 C 8 196, 50 170, 84 166 L 116 166 C 150 170, 192 196, 196 250 L 200 400 L 0 400 Z" /></>,
    olhos: { y: 120, dx: 9, w: 9, h: 3, giro: 12 }, escala: 1.1,
  },
  orelhudo: {
    desenho: <>{CABECA}
      <ellipse cx="82" cy="56" rx="9" ry="38" transform="rotate(-14 82 92)" />
      <ellipse cx="118" cy="56" rx="9" ry="38" transform="rotate(14 118 92)" /></>,
    olhos: { y: 118, dx: 12, w: 7, h: 7, giro: 0 }, escala: 0.96,
  },
};
const NOMES = Object.keys(TIPOS);

// ── Um vulto ─────────────────────────────────────────────────────────────────

type Aparicao = {
  tipo: string;
  /** Centro, em px. */
  x: number;
  escala: number;
  baixo: number;
  /** 0 = lá no fundo (mais desfocado e apagado), 1 = perto do vidro. */
  perto: number;
  respira: number;
};

/**
 * Um lugar na tela que de tempos em tempos tem alguém. Cuida dos próprios
 * tempos: chegar, acender os olhos, piscar, ir embora, esperar.
 */
const Vulto = memo(function Vulto({ de, ate, atrasoInicial, alturaCena }: {
  de: number;
  ate: number;
  atrasoInicial: number;
  alturaCena: number;
}) {
  const [aparicao, setAparicao] = useState<Aparicao | null>(null);
  const [visivel, setVisivel] = useState(false);
  const [olhos, setOlhos] = useState(false);
  const [pisca, setPisca] = useState(false);
  const id = useId().replace(/:/g, '');

  useEffect(() => {
    let vivo = true;
    let piscando = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const depois = (ms: number) => new Promise<void>(r => {
      const t = setTimeout(() => { timers.delete(t); r(); }, ms);
      timers.add(t);
    });

    // Pisca ao acaso enquanto os olhos estão abertos.
    const piscar = async () => {
      while (vivo && piscando) {
        await depois(acaso(1200, 5200));
        if (!vivo || !piscando) return;
        const sorte = Math.random();
        if (sorte < 0.12) {
          // Fecha por um tempo — e o escuro fica mais escuro.
          setPisca(true); await depois(acaso(700, 2000)); setPisca(false);
        } else {
          setPisca(true); await depois(130); setPisca(false);
          if (sorte < 0.35) { await depois(180); setPisca(true); await depois(120); setPisca(false); }
        }
      }
    };

    void (async () => {
      await depois(atrasoInicial);
      while (vivo) {
        const tipo = NOMES[Math.floor(Math.random() * NOMES.length)];
        const perto = Math.random();
        const base = Math.min(1.2, Math.max(0.7, alturaCena / 620));
        const escala = base * TIPOS[tipo].escala * (0.75 + 0.3 * perto);
        const meia = 100 * escala;
        const min = de + meia, max = Math.max(min, ate - meia);
        setAparicao({ tipo, x: acaso(min, max), escala, baixo: -acaso(30, 80) * escala, perto, respira: acaso(4.5, 7) });
        await depois(60);
        if (!vivo) return;
        setVisivel(true);
        await depois(acaso(1600, 3200));
        if (!vivo) return;
        setOlhos(true);
        piscando = true;
        void piscar();
        await depois(acaso(6000, 14000));
        if (!vivo) return;
        piscando = false;
        setPisca(false);
        setOlhos(false);
        await depois(acaso(300, 900));
        setVisivel(false);
        await depois(3200);
        if (!vivo) return;
        setAparicao(null);
        await depois(acaso(800, 4000));
      }
    })();
    return () => { vivo = false; piscando = false; timers.forEach(clearTimeout); };
  }, [de, ate, atrasoInicial, alturaCena]);

  if (!aparicao) return null;
  const t = TIPOS[aparicao.tipo];
  const o = t.olhos;
  const estilo = {
    left: aparicao.x - 100,
    bottom: aparicao.baixo,
    ['--escala' as string]: aparicao.escala,
    ['--forca' as string]: 0.5 + 0.42 * aparicao.perto,
    ['--respira' as string]: `${aparicao.respira}s`,
  } as CSSProperties;

  return (
    <div className="hw-vulto" data-visivel={visivel} style={estilo}>
      <div className="hw-vulto-luz" />
      <div className="hw-vulto-tronco">
        <div className="hw-vulto-sombra">
          {/*
            Quadro com folga: o desfoque precisa de espaço para vazar, senão corta reto na borda.
            Desfoque e esmaecido da base DENTRO do SVG, e não em `filter`/`mask` de CSS: assim
            são pintados uma vez por aparição. Em CSS, numa camada que respira, a placa de
            vídeo refazia o desfoque a cada quadro.
          */}
          <svg viewBox="-60 -40 320 440" className="hw-vulto-corpo">
            <defs>
              <filter id={`${id}-d`} filterUnits="userSpaceOnUse" x="-60" y="-40" width="320" height="440">
                <feGaussianBlur stdDeviation={10 - 4.5 * aparicao.perto} />
              </filter>
              <linearGradient id={`${id}-g`} gradientUnits="userSpaceOnUse" x1="0" y1="400" x2="0" y2="268">
                <stop offset="0" stopColor="#000" /><stop offset="1" stopColor="#fff" />
              </linearGradient>
              <mask id={`${id}-m`} maskUnits="userSpaceOnUse" x="-60" y="-40" width="320" height="440">
                <rect x="-60" y="-40" width="320" height="440" fill={`url(#${id}-g)`} />
              </mask>
            </defs>
            <g mask={`url(#${id}-m)`}><g filter={`url(#${id}-d)`}>{t.desenho}</g></g>
          </svg>
        </div>
        <div className={cn('hw-vulto-olhos', olhos && 'acesos', pisca && 'pisca')}>
          {[-1, 1].map(lado => (
            <span
              key={lado}
              style={{
                left: 100 + lado * o.dx - o.w / 2, top: o.y - o.h / 2, width: o.w, height: o.h,
                rotate: `${-lado * o.giro}deg`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
});

// ── Cena ──────────────────────────────────────────────────────────────────────

export function VultoNoVidro({ claro }: { claro: boolean }) {
  const cena = useRef<HTMLDivElement>(null);
  const [medida, setMedida] = useState<{ w: number; h: number } | null>(null);

  // Mede (e mede de novo só se a tela mudar bastante): define quantas faixas.
  useEffect(() => {
    const el = cena.current;
    if (!el) return;
    const medir = () => setMedida(m => {
      const w = el.clientWidth, h = el.clientHeight;
      if (m && Math.abs(m.w - w) < 120 && Math.abs(m.h - h) < 120) return m;
      return { w, h };
    });
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // ── A lâmpada ──
  useEffect(() => {
    const el = cena.current;
    if (!el) return;
    let vivo = true;
    let t: ReturnType<typeof setTimeout> | undefined;
    // Só nos elementos que leem a lâmpada: escrever na caixa de fora mudava o
    // estilo de todos os vultos e fazia o navegador repintar o desfoque deles.
    const luz = (v: number) => {
      const valor = v.toFixed(2);
      el.querySelectorAll<HTMLElement>('.hw-vulto-luz, .hw-vulto-sombra')
        .forEach(alvo => alvo.style.setProperty('--lampada', valor));
    };
    const tocar = (passos: [number, number][]) => {
      let i = 0;
      const passo = () => {
        if (!vivo) return;
        if (i >= passos.length) { zumbir(); return; }
        const [v, ms] = passos[i++];
        luz(v);
        t = setTimeout(passo, ms);
      };
      passo();
    };
    const zumbir = () => {
      if (!vivo) return;
      const sorte = Math.random();
      if (sorte < 0.04) {
        // Engasgo.
        tocar([[acaso(0.15, 0.35), acaso(40, 70)], [acaso(0.8, 1), acaso(30, 60)], [acaso(0.02, 0.12), acaso(60, 110)],
          [acaso(0.6, 0.9), acaso(30, 50)], [acaso(0.05, 0.2), acaso(80, 160)], [1, 0]]);
        return;
      }
      if (sorte < 0.055) {
        // Apagão.
        tocar([[acaso(0.3, 0.5), 50], [0.02, acaso(600, 1600)], [0.55, 60], [0.08, 90], [0.9, 50], [0.2, 70], [1, 0]]);
        return;
      }
      luz(acaso(0.86, 1));
      t = setTimeout(zumbir, acaso(160, 340));
    };
    luz(1);
    zumbir();
    return () => { vivo = false; clearTimeout(t); };
  }, []);

  const faixas = useMemo(() => {
    if (!medida) return [];
    const n = Math.min(5, Math.max(2, Math.floor(medida.w / 300)));
    const larg = medida.w / n;
    // Os atrasos de entrada também são sorteados aqui: os vultos não chegam juntos.
    return Array.from({ length: n }, (_, i) => ({ de: i * larg, ate: (i + 1) * larg, atraso: i * 1400 + acaso(300, 2600) }));
  }, [medida]);

  return (
    <div ref={cena} className={cn('hw-vidro', claro && 'claro')}>
      {medida && faixas.map((f, i) => (
        <Vulto key={`${faixas.length}-${i}`} de={f.de} ate={f.ate} atrasoInicial={f.atraso} alturaCena={medida.h} />
      ))}
      <div className="hw-vidro-fosco" />
    </div>
  );
}

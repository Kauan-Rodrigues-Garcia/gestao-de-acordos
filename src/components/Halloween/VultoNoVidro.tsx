/**
 * VultoNoVidro — o fundo do Analítico: alguém do outro lado de um vidro fosco.
 *
 * Camadas, de trás para a frente:
 *
 *   luz     — uma lâmpada atrás do vidro, que nunca está bem: zumbe, engasga e
 *             às vezes apaga. É ela que recorta o vulto (no escuro, sem luz,
 *             ele some — e só os olhos ficam).
 *   vulto   — corpo bem desfocado, que respira; mãos que vêm de longe e batem
 *             no vidro, ficam nítidas onde encostam e escorregam devagar;
 *             olhos que acendem depois do impacto, piscam e são os últimos a
 *             apagar quando ele recua.
 *   marcas  — o que as mãos deixam no vidro embaçado, evaporando.
 *   vidro   — granulado fosco, reflexo diagonal e escorridos de condensação.
 *
 * A névoa (`Fumaca`) passa por cima de tudo isto.
 *
 * Coreografia de cada aparição (em `useEffect`, com um cancelamento só):
 * surge (longe) → encosta (as mãos batem; a luz falha e o vidro treme) →
 * encostado (olhos, mãos escorregando) → recua (marcas ficam) → some, e a
 * próxima aparição vem de outro lugar.
 *
 * A luz é escrita direto numa variável CSS (`--luz`) — pisca dezenas de vezes
 * por minuto e não pode redesenhar o React a cada vez.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { cn } from '@/lib/utils';

const acaso = (min: number, max: number) => min + Math.random() * (max - min);
const esperar = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/** Tamanho do vulto no desenho; a tela escala. */
const LARGURA = 340;
const ALTURA = 460;

type Fase = 'oculto' | 'surge' | 'encosta' | 'encostado' | 'recua';
/** Onde o vulto aparece, e onde fica a lâmpada atrás dele. */
type Lugar = { x: number; baixo: number; escala: number; luzX: number; luzY: number };

// ── Desenhos ──────────────────────────────────────────────────────────────────

/**
 * Uma mão espalmada no vidro, vista de frente, com o polegar à DIREITA (é a
 * mão que aparece do lado esquerdo da tela). A outra é a mesma espelhada.
 *
 * Dedos longos que afinam na ponta, e o antebraço descendo até sumir no corpo.
 * Onde a pele encosta no vidro (pontas dos dedos e almofadas da palma) o tom é
 * mais fechado: é o que faz parecer encostado, e não pintado.
 */
const DEDOS = [
  // base x, base y, inclinação, comprimento, largura
  { x: 38, y: 80, giro: -22, comp: 44, larg: 9 },
  { x: 49, y: 70, giro: -8, comp: 58, larg: 10 },
  { x: 60, y: 68, giro: 2, comp: 64, larg: 10.5 },
  { x: 71, y: 72, giro: 12, comp: 57, larg: 10 },
  { x: 82, y: 110, giro: 50, comp: 44, larg: 12 },
];

/** Dedo apontando para cima a partir da base (0,0): afina e arredonda na ponta. */
function dedo(comp: number, larg: number): string {
  const ponta = larg * 0.78;
  return `M${-larg / 2} 6 L${-ponta / 2} ${-comp + ponta / 2} A${ponta / 2} ${ponta / 2} 0 0 1 ${ponta / 2} ${-comp + ponta / 2} L${larg / 2} 6 Z`;
}

function Mao({ espelho = false }: { espelho?: boolean }) {
  return (
    <svg viewBox="0 0 120 240" style={espelho ? { transform: 'scaleX(-1)' } : undefined}>
      <g opacity=".88">
        <path d="M31 84 C 31 70, 38 66, 49 66 L 71 66 C 82 66, 86 72, 86 84 L 86 116 C 86 132, 75 142, 59 142 C 43 142, 31 132, 31 116 Z" />
        {/* Punho e antebraço, que somem para baixo (máscara no CSS). */}
        <path d="M42 130 L 74 130 L 80 240 L 36 240 Z" />
        {DEDOS.map((d, i) => (
          <path key={i} d={dedo(d.comp, d.larg)} transform={`translate(${d.x} ${d.y}) rotate(${d.giro})`} />
        ))}
      </g>
      {/* Onde encosta: as pontas dos dedos e as almofadas da palma. */}
      <g className="hw-vulto-contato">
        {DEDOS.map((d, i) => (
          <ellipse key={i} cx="0" cy={-d.comp + d.larg * 0.9} rx={d.larg * 0.36} ry={d.larg * 0.62}
            transform={`translate(${d.x} ${d.y}) rotate(${d.giro})`} />
        ))}
        <ellipse cx="58" cy="90" rx="18" ry="7" />
        <ellipse cx="47" cy="120" rx="8" ry="12" />
        <ellipse cx="71" cy="123" rx="9" ry="11" />
      </g>
    </svg>
  );
}

/** Cabeça, pescoço, ombros caídos e os braços erguidos até as mãos. */
function Corpo() {
  return (
    <svg viewBox={`0 0 ${LARGURA} ${ALTURA}`}>
      <ellipse cx="170" cy="150" rx="41" ry="54" />
      <rect x="151" y="190" width="38" height="52" rx="14" />
      <path d="M68 304 C 70 264, 108 242, 140 238 L 200 238 C 232 242, 270 264, 272 304 L 288 460 L 52 460 Z" />
      <path d="M96 286 C 72 256, 60 222, 57 178" fill="none" stroke="currentColor" strokeWidth="34" strokeLinecap="round" />
      <path d="M244 286 C 268 256, 280 222, 283 178" fill="none" stroke="currentColor" strokeWidth="34" strokeLinecap="round" />
    </svg>
  );
}

// ── Cena ──────────────────────────────────────────────────────────────────────

function estiloDoLugar(l: Lugar): CSSProperties {
  return { left: l.x, bottom: l.baixo, ['--escala' as string]: l.escala };
}

export function VultoNoVidro({ claro }: { claro: boolean }) {
  const cena = useRef<HTMLDivElement>(null);
  const [fase, setFase] = useState<Fase>('oculto');
  const [lugar, setLugar] = useState<Lugar | null>(null);
  const [marca, setMarca] = useState<(Lugar & { id: number }) | null>(null);
  const [impacto, setImpacto] = useState(false);
  /** Pede um engasgo da lâmpada fora de hora (o impacto das mãos). */
  const engasgar = useRef<() => void>(() => {});

  // ── A lâmpada ──
  useEffect(() => {
    const el = cena.current;
    if (!el) return;
    let vivo = true;
    let t: ReturnType<typeof setTimeout> | undefined;
    const luz = (v: number) => el.style.setProperty('--luz', v.toFixed(3));

    /** Toca uma sequência [intensidade, ms] e volta ao zumbido. */
    const tocar = (passos: [number, number][]) => {
      clearTimeout(t);
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
    const engasgo = (): [number, number][] => [
      [acaso(0.15, 0.35), acaso(40, 70)], [acaso(0.8, 1), acaso(30, 60)], [acaso(0.02, 0.12), acaso(60, 110)],
      [acaso(0.6, 0.9), acaso(30, 50)], [acaso(0.05, 0.2), acaso(80, 160)], [1, 0],
    ];
    const apagao = (): [number, number][] => [
      [acaso(0.3, 0.5), 50], [0.02, acaso(500, 1500)], [0.55, 60], [0.08, 90], [0.9, 50], [0.2, 70], [1, 0],
    ];
    // Zumbido: quase estável, com um tremor miúdo; de vez em quando, engasga.
    const zumbir = () => {
      if (!vivo) return;
      const sorte = Math.random();
      if (sorte < 0.022) { tocar(engasgo()); return; }
      if (sorte < 0.03) { tocar(apagao()); return; }
      luz(acaso(0.84, 1));
      t = setTimeout(zumbir, acaso(90, 240));
    };
    engasgar.current = () => tocar(engasgo());
    luz(1);
    zumbir();
    return () => { vivo = false; clearTimeout(t); };
  }, []);

  // ── As aparições ──
  useEffect(() => {
    let vivo = true;
    let marcas = 0;
    const sortearLugar = (): Lugar | null => {
      const el = cena.current;
      if (!el) return null;
      const w = el.clientWidth, h = el.clientHeight;
      const escala = Math.min(1.3, Math.max(0.75, h / 560)) * acaso(0.9, 1.05);
      const largura = LARGURA * escala;
      const x = acaso(w * 0.02, Math.max(w * 0.02, w - largura - w * 0.02));
      const baixo = -acaso(40, 100) * escala;
      // A lâmpada fica um pouco abaixo da cabeça, atrás do peito.
      return { x, baixo, escala, luzX: x + (LARGURA / 2) * escala, luzY: h - baixo - (ALTURA - 190) * escala };
    };
    (async () => {
      await esperar(acaso(900, 2200));
      while (vivo) {
        const l = sortearLugar();
        if (!l) return;
        setLugar(l);
        setFase('oculto');
        await esperar(80);
        if (!vivo) return;
        setFase('surge');
        await esperar(acaso(2600, 3600));
        if (!vivo) return;
        setFase('encosta');
        // As mãos chegam no fim da aceleração: aí é o baque.
        await esperar(1000);
        if (!vivo) return;
        setImpacto(true);
        engasgar.current();
        setTimeout(() => { if (vivo) setImpacto(false); }, 260);
        await esperar(250);
        setFase('encostado');
        await esperar(acaso(4500, 7000));
        if (!vivo) return;
        setMarca({ ...l, id: ++marcas });
        setFase('recua');
        await esperar(3200);
        if (!vivo) return;
        setFase('oculto');
        await esperar(acaso(4500, 9000));
      }
    })();
    return () => { vivo = false; };
  }, []);

  // Escorridos de condensação no vidro, sorteados uma vez.
  const escorridos = useMemo(() => Array.from({ length: 9 }, () => ({
    left: `${acaso(2, 98)}%`, top: `${acaso(-10, 60)}%`, height: `${acaso(12, 38)}%`, opacity: acaso(0.4, 1),
  })), []);

  return (
    <div ref={cena} className={cn('hw-vidro', claro && 'claro', impacto && 'impacto')} data-fase={fase}>
      {lugar && (
        <div className="hw-vidro-presenca">
          <div className="hw-vidro-luz" style={{ left: lugar.luzX, top: lugar.luzY }} />
        </div>
      )}

      {lugar && (
        <div className="hw-vulto" style={estiloDoLugar(lugar)}>
          <div className="hw-vulto-sombra">
            <div className="hw-vulto-tronco">
              <div className="hw-vulto-corpo"><Corpo /></div>
            </div>
            <div className="hw-vulto-mao esq"><Mao /></div>
            <div className="hw-vulto-mao dir"><Mao espelho /></div>
          </div>
          {/* Fora da sombra: os olhos não dependem da luz. */}
          <div className="hw-vulto-tronco">
            <div className="hw-vulto-olhos"><span /><span /></div>
          </div>
        </div>
      )}

      {marca && (
        <div key={marca.id} className="hw-vulto hw-vidro-marcas" style={estiloDoLugar(marca)}>
          <div className="hw-vulto-mao esq"><Mao /></div>
          <div className="hw-vulto-mao dir"><Mao espelho /></div>
        </div>
      )}

      <div className="hw-vidro-fosco">
        {escorridos.map((e, i) => <i key={i} style={e} />)}
      </div>
    </div>
  );
}

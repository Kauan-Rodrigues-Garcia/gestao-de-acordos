/**
 * A polícia na janela do Analítico (pedido de 06/10/2026): uma viatura chega
 * lá embaixo e o vermelho e o azul batem no vidro molhado; depois os policiais
 * descem e apontam as lanternas da calçada para a janela, tentando enxergar.
 * Pedido de ajuste no mesmo dia: luzes um pouco mais altas e várias lanternas
 * fracas no lugar de uma forte.
 *
 * Referências: a chegada da GCPD na casa do prefeito, no começo de The Batman
 * (2022) — as luzes da viatura escorrendo no vidro com chuva; as lanternas
 * cortando o escuro molhado de Se7en (1995); o holofote da viatura varrendo
 * pela persiana em Blade Runner (1982).
 *
 * A cena (segundos):
 *
 *    0 –  7  a viatura chega da esquerda: luz crescendo, sirene abafada abrindo;
 *    7       para e corta a sirene; as luzes seguem piscando em silêncio;
 *    9 – 23  os policiais descem: três lanternas, uma depois da outra, apontam
 *            da calçada para o vidro e procuram, parando aqui e ali;
 *   24 – 31  a viatura vai embora pela direita.
 *
 * Tudo em camadas de CSS que só mudam `transform` e `opacity` (compositor); as
 * luzes vão também para a chuva e para o vidro (`reflexos`), que acendem as
 * gotas com a cor delas. Montado só durante a cena.
 *
 * Com a música tocando: a primeira 40 a 75 s depois de abrir o Analítico, depois
 * a cada 4 a 7 minutos. Para validar: `?batman=policia`.
 */
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import type { Luz } from './chuva';
import { musicaTocando, policiasPedidasAte, volumeDosEfeitos } from './regente';
import { sirene } from './sirene';

const CHEGA = 7, VAI = 24, FIM = 31;
const MIN = 60_000;
const acaso = (min: number, max: number) => min + Math.random() * (max - min);
const lim = (v: number) => Math.max(0, Math.min(1, v));
const suave = (v: number) => { const x = lim(v); return x * x * (3 - 2 * x); };

/**
 * O giroflex: vermelho duas vezes, azul duas vezes. Cada clarão acende rápido
 * e morre devagar (a luz se espalha no vidro molhado). [vermelho, azul], 0 a 1.
 */
const VOLTA = 900;
const CLAROES: [number, 0 | 1][] = [[0, 0], [140, 0], [450, 1], [590, 1]];
function giroflex(ms: number, calmo: boolean): [number, number] {
  // Movimento reduzido: sem clarões, as duas cores se revezam devagar.
  if (calmo) { const s = 0.5 + 0.5 * Math.sin(ms / 1200); return [s, 1 - s]; }
  const f = ms % VOLTA, v: [number, number] = [0, 0];
  for (const [ini, cor] of CLAROES) {
    let d = f - ini;
    if (d < 0) d += VOLTA;
    const p = d < 70 ? 1 : Math.exp(-(d - 70) / 110);
    if (p > v[cor]) v[cor] = p;
  }
  return v;
}

/**
 * Uma lanterna: um policial que desceu da viatura, parado na calçada (`origem`,
 * fração da largura), apontando para o vidro. Liga em `de`, procura por pontos
 * sorteados — para em cada um, como quem tenta enxergar — e desliga em `ate`.
 */
interface Lanterna { de: number; ate: number; origem: number; pontos: number[]; escala: number; forca: number; cor: RGB }
type RGB = [number, number, number];
const CORES_DE_LANTERNA: RGB[] = [[255, 228, 180], [222, 232, 255], [238, 240, 248]];

/** Os policiais da vez: três lanternas, cada uma entrando um pouco depois da outra. */
function sortearLanternas(): Lanterna[] {
  return [0, 1, 2].map(n => {
    const de = 9 + n * acaso(1.1, 1.6), ate = 21 + n * acaso(0.6, 1), origem = 0.14 + n * 0.17 + acaso(-0.04, 0.04);
    // [s, x, y]: entra por baixo, procura, sai por baixo.
    const pontos = [de, origem, 1.15];
    let t = de + acaso(0.8, 1.2);
    while (t < ate - 1.2) {
      const x = acaso(0.1, 0.62), y = acaso(0.22, 0.78);
      pontos.push(t, x, y, t + acaso(0.3, 1.1), x + acaso(-0.02, 0.02), y + acaso(-0.02, 0.02));
      t = pontos[pontos.length - 3] + acaso(0.9, 1.8);
    }
    pontos.push(ate, origem + acaso(-0.05, 0.05), 1.15);
    return { de, ate, origem, pontos, escala: acaso(0.8, 1.05), forca: acaso(0.55, 0.7), cor: CORES_DE_LANTERNA[n] };
  });
}

/** Onde a lanterna aponta no segundo `t` ([x, y, força], frações da janela), tremendo na mão; `null` desligada. */
function mirar(l: Lanterna, t: number): [number, number, number] | null {
  const p = l.pontos;
  if (t <= p[0] || t >= p[p.length - 3]) return null;
  let i = 3;
  while (p[i] < t) i += 3;
  const k = suave((t - p[i - 3]) / (p[i] - p[i - 3]));
  const x = p[i - 2] + (p[i + 1] - p[i - 2]) * k, y = p[i - 1] + (p[i + 2] - p[i - 1]) * k;
  const tremor = l.forca * 10 + l.origem;
  // Liga e desliga suave; abaixo do peitoril ela ainda não bate no vidro.
  const a = l.forca * suave((t - l.de) / 0.5) * (1 - suave((t - l.ate + 0.6) / 0.6)) * (0.96 + 0.04 * Math.sin(t * 37 + tremor));
  return [x + Math.sin(t * 7.3 + tremor) * 0.004 + Math.sin(t * 13.1) * 0.0025, y + Math.sin(t * 6.1 + tremor) * 0.004, a];
}

/**
 * A agenda da polícia e a cena. `luzes`: onde a cena escreve, a cada quadro, as
 * luzes que a chuva deve refletir (vazio fora da cena).
 */
export function PoliciaNaJanela({ luzes }: { luzes: MutableRefObject<Luz[]> }) {
  const [cena, setCena] = useState<number | null>(null);
  const emCena = useRef(false);
  const contador = useRef(0);

  useEffect(() => {
    if (!proxima) proxima = Date.now() + acaso(40_000, 75_000);
    let pedidas = policiasPedidasAte();
    const t = window.setInterval(() => {
      const p = policiasPedidasAte(), pediu = p !== pedidas;
      pedidas = p;
      if (emCena.current) return;
      const agora = Date.now();
      if (!pediu && (agora < proxima || !musicaTocando() || document.visibilityState !== 'visible')) return;
      proxima = agora + acaso(4 * MIN, 7 * MIN);
      emCena.current = true;
      setCena(++contador.current);
    }, 1_000);
    return () => window.clearInterval(t);
  }, []);

  const acabou = useCallback(() => { emCena.current = false; luzes.current = []; setCena(null); }, [luzes]);
  return cena ? <CenaDaPolicia key={cena} luzes={luzes} aoTerminar={acabou} /> : null;
}
/** Quando vem a próxima viatura: fora do componente, para trocar de tela não reiniciar a conta. */
let proxima = 0;

function CenaDaPolicia({ luzes, aoTerminar }: { luzes: MutableRefObject<Luz[]>; aoTerminar: () => void }) {
  const pol = useRef<HTMLDivElement>(null), vm = useRef<HTMLSpanElement>(null), az = useRef<HTMLSpanElement>(null);
  const lanternas = useRef(sortearLanternas());
  /** Por lanterna: o corpo que anda e as três peças com opacidade (halo, disco, facho). */
  const pecas = useRef<(HTMLElement | null)[][]>(lanternas.current.map((): (HTMLElement | null)[] => [null, null, null, null]));
  const fim = useRef(aoTerminar);
  fim.current = aoTerminar;

  useEffect(() => {
    const caixa = pol.current?.parentElement;
    if (!caixa) return;
    let W = caixa.clientWidth, H = caixa.clientHeight;
    const medir = () => { W = caixa.clientWidth; H = caixa.clientHeight; };
    window.addEventListener('resize', medir);
    const calmo = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    sirene(CHEGA, volumeDosEfeitos() * 0.35);

    let t0 = 0, vivo = true;
    const quadro = (agora: number) => {
      if (!vivo) return;
      if (!t0) t0 = agora;
      const t = (agora - t0) / 1000;
      if (t >= FIM) { luzes.current = []; fim.current(); return; }

      // A viatura: chega da esquerda, para, vai embora pela direita.
      const presenca = suave(t / CHEGA) * (1 - suave((t - VAI) / (FIM - VAI)));
      const x = W * (t < VAI ? -0.35 + 0.65 * (1 - (1 - lim(t / CHEGA)) ** 3) : 0.3 + 1.1 * suave((t - VAI) / (FIM - VAI)));
      const [r, b] = giroflex(agora - t0, calmo);
      // Um resto de luz entre os clarões: o vidro molhado segura a cor.
      const vr = presenca * (0.15 + 0.85 * r), vb = presenca * (0.15 + 0.85 * b);
      const mover = `translate3d(${x.toFixed(1)}px,0,0)`;
      if (vm.current) { vm.current.style.transform = mover; vm.current.style.opacity = vr.toFixed(3); }
      if (az.current) { az.current.style.transform = mover; az.current.style.opacity = vb.toFixed(3); }
      const novas: Luz[] = [
        { x: x - W * 0.14, y: H * 0.9, r: H * 0.5, cor: [255, 40, 50], forca: vr },
        { x: x + W * 0.14, y: H * 0.9, r: H * 0.5, cor: [70, 120, 255], forca: vb },
      ];

      // As lanternas: o disco no vidro e o facho descendo até quem segura.
      lanternas.current.forEach((l, n) => {
        const [corpo, halo, disco, facho] = pecas.current[n];
        const m = mirar(l, t), a = m ? m[2] : 0;
        if (m && corpo) {
          const S = H * 0.24 * l.escala, lx = W * m[0], ly = H * m[1];
          corpo.style.transform = `translate3d(${(lx - S / 2).toFixed(1)}px,${(ly - S / 2).toFixed(1)}px,0)`;
          // O facho aponta para baixo, para a calçada onde ele está.
          const giro = Math.atan2(W * l.origem - lx, H * 1.3 - ly) * -1;
          if (facho) facho.style.transform = `translateX(-50%) rotate(${giro.toFixed(3)}rad)`;
          novas.push({ x: lx, y: ly, r: S * 0.6, cor: l.cor, forca: a * 1.3 });
        }
        if (halo) halo.style.opacity = a.toFixed(3);
        if (disco) disco.style.opacity = a.toFixed(3);
        if (facho) facho.style.opacity = a.toFixed(3);
      });
      luzes.current = novas;
      requestAnimationFrame(quadro);
    };
    requestAnimationFrame(quadro);
    return () => { vivo = false; window.removeEventListener('resize', medir); luzes.current = []; };
  }, [luzes]);

  return (
    <>
      <div ref={pol} className="gt-pol">
        <span ref={vm} className="vm"><i /><b /></span>
        <span ref={az} className="az"><i /><b /></span>
      </div>
      {lanternas.current.map((l, n) => {
        const guardar = (k: number) => (el: HTMLElement | null) => { pecas.current[n][k] = el; };
        return (
          <div key={n} ref={guardar(0)} className="gt-lant" style={{ height: `${24 * l.escala}%`, ['--lc' as string]: l.cor.join(' ') }}>
            <i ref={guardar(3)} className="gt-lant-facho" />
            <i ref={guardar(1)} className="gt-lant-halo" />
            <i ref={guardar(2)} className="gt-lant-disco" />
          </div>
        );
      })}
    </>
  );
}

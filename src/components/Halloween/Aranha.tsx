import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import {
  FISICA, anguloNoFio, comprimentoAoSoltar, distancia, estourou, normalizarAngulo, passoLivre, passoNoFio,
  saiuDaTela, velocidadeDaMao, type Amostra, type Ponto,
} from './aranhaFisica';

/*
 * A aranha pendurada na teia da direita — e, desde 02/10/2026, de brinquedo.
 *
 *   Passar o mouse   sobe o fio e some de 0 a 3 minutos (como sempre foi).
 *   Clicar e puxar   estica o fio. Soltar antes do limite: ela balança no fio
 *                    por uns segundos e depois sobe, como no passar do mouse.
 *   Puxar demais     o fio estoura e ela fica na mão, já sem fio. Soltar: cai
 *                    rodando como o morcego, com peso — dá para jogar para
 *                    cima e pegar de novo no ar.
 *   Cair da tela     perdeu. Cinco minutos depois ela volta andando pela borda
 *                    e desce o fio de novo.
 *
 * Duas aranhas no DOM, uma de cada vez: a da teia, dentro da camada que rola
 * com a página (CSS, como antes), e a solta, num palco fixo na tela inteira —
 * a solta precisa poder cair para fora da tela, coisa que a camada de altura
 * zero dentro do `<main>` não deixa. O fio da solta nasce na âncora da teia,
 * lida a cada quadro: rolar a página leva a âncora junto, e a aranha vem atrás.
 *
 * Quadro a quadro no DOM, por refs, e não em estado do React — o mesmo motivo
 * dos morcegos. A física fica em `aranhaFisica.ts`.
 */

const ALTURA_DO_FIO = 110;
const VOLTA_EM_MS = 5 * 60_000;
/** Do ponto onde o fio prende (alto da cabeça) ao centro do corpo, em px. */
const CABECA = 10;
/** Metade da caixa da aranha solta — 40 px, maior que o desenho, para dar para pegar no ar. */
const MEIA_CAIXA = 20;
/** Quanto o fio encurta por quadro quando ela sobe depois de balançar. */
const SUBIDA = 0.8;

type Modo = 'teia' | 'esticando' | 'balancando' | 'segura' | 'voando' | 'perdida' | 'voltando';

interface Controle {
  foge: () => void;
  pegarDaTeia: (e: React.PointerEvent<SVGSVGElement>) => void;
  pegarNoAr: (e: React.PointerEvent<HTMLDivElement>) => void;
}

const acaso = (min: number, max: number) => min + Math.random() * (max - min);

function AranhaSvg(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="-13 -13 26 26" {...props}>
      <g className="pernas">
        <path d="M-3 -2 L-9 -8 L-12 -4" /><path d="M-3 0 L-10 -3 L-13 1" /><path d="M-3 2 L-10 3 L-12 8" /><path d="M-2 3 L-7 8 L-8 12" />
        <path d="M3 -2 L9 -8 L12 -4" /><path d="M3 0 L10 -3 L13 1" /><path d="M3 2 L10 3 L12 8" /><path d="M2 3 L7 8 L8 12" />
      </g>
      <ellipse className="corpo" cx="0" cy="3" rx="5" ry="6" />
      <circle className="corpo" cx="0" cy="-4" r="3.4" />
      <circle className="olho" cx="-1.3" cy="-4.3" r=".9" /><circle className="olho" cx="1.3" cy="-4.3" r=".9" />
    </svg>
  );
}

/**
 * O traço do fio da âncora até a aranha. Frouxo, faz barriga para baixo;
 * esticado, fica reto e, perto de estourar, treme.
 */
function caminhoDoFio(a: Ponto, p: Ponto, comprimento: number, t: number): string {
  const d = distancia(a, p);
  const mx = (a.x + p.x) / 2, my = (a.y + p.y) / 2;
  if (d < comprimento - 0.5) {
    const barriga = Math.sqrt(comprimento * comprimento - d * d) * 0.5;
    return `M${a.x} ${a.y} Q${mx} ${my + barriga} ${p.x} ${p.y}`;
  }
  const tensao = (d - comprimento) / FISICA.limite;
  const tremor = tensao > 0.6 ? Math.sin(t / 16) * (tensao - 0.6) * 6 : 0;
  const nx = d ? -(p.y - a.y) / d : 0, ny = d ? (p.x - a.x) / d : 0;
  return `M${a.x} ${a.y} Q${mx + nx * tremor} ${my + ny * tremor} ${p.x} ${p.y}`;
}

export function Aranha({ claro }: { claro: boolean }) {
  const caixa = useRef<HTMLDivElement>(null);
  const fio = useRef<HTMLDivElement>(null);
  const palco = useRef<HTMLDivElement>(null);
  const solta = useRef<HTMLDivElement>(null);
  const linha = useRef<SVGPathElement>(null);
  const caco = useRef<SVGPathElement>(null);
  const controle = useRef<Controle | null>(null);

  useEffect(() => {
    let modo: Modo = 'teia';
    // Subindo ou descendo no DOM: o passar do mouse não reinicia a subida.
    let ocupada = false;
    let arrastando = false;
    let raf = 0, ultimo = 0;
    let timers: number[] = [];
    let anims: Animation[] = [];
    // O corpo. Presa ao fio, (x, y) é onde o fio prende; solta, é o centro.
    const s = {
      x: 0, y: 0, vx: 0, vy: 0, rot: 0, vr: 0,
      comprimento: 0, soltaEm: 0, subindo: false,
      mao: { x: 0, y: 0 }, dedo: { x: 0, y: 0 },
      amostras: [] as Amostra[],
      caco: null as null | { x: number; y: number; t0: number },
    };

    const depois = (fn: () => void, ms: number) => { timers.push(window.setTimeout(fn, ms)); };
    const animar = (el: Element, quadros: Keyframe[], opcoes: KeyframeAnimationOptions) => {
      const a = el.animate(quadros, opcoes); anims.push(a); return a;
    };
    /** Para o que a aranha da teia estava fazendo: subida, espera, descida, volta. */
    const pararNaTeia = () => {
      timers.forEach(t => window.clearTimeout(t)); timers = [];
      anims.forEach(a => a.cancel()); anims = [];
      caixa.current?.classList.remove('escalando', 'descendo');
      ocupada = false;
    };
    const ancora = (): Ponto | null => {
      const r = caixa.current?.getBoundingClientRect();
      return r ? { x: r.left + r.width / 2, y: r.top } : null;
    };

    // ── Na teia (DOM + CSS, como antes) ───────────────────────────────────────

    const descer = () => {
      const el = caixa.current, f = fio.current;
      if (!el || !f) return;
      el.classList.add('descendo');
      const desce = animar(f, [{ height: '4px' }, { height: `${ALTURA_DO_FIO * 0.45}px` }], { duration: 3200, easing: 'ease-in-out', fill: 'forwards' });
      desce.onfinish = () => {
        desce.cancel(); f.style.height = ''; f.style.animation = '';
        el.classList.remove('descendo'); ocupada = false; modo = 'teia';
      };
    };
    /** Lá em cima, espera de 0 a 3 minutos e desce. */
    const esperarEDescer = () => { ocupada = true; depois(descer, Math.random() * 180000); };
    /** Parada lá em cima, fio recolhido: é onde ela fica entre sumir e descer. */
    const recolhida = () => {
      const el = caixa.current, f = fio.current;
      if (!el || !f) return;
      f.style.animation = 'none'; f.style.height = '4px';
      el.style.visibility = '';
    };

    const foge = () => {
      const el = caixa.current, f = fio.current;
      if (!el || !f || modo !== 'teia' || ocupada) return;
      ocupada = true;
      const h = f.getBoundingClientRect().height;
      f.style.animation = 'none'; f.style.height = `${h}px`;
      el.classList.add('escalando');
      const sobe = animar(f, [{ height: `${h}px` }, { height: '4px' }], { duration: Math.max(1600, h * 20), easing: 'cubic-bezier(.4, .1, .6, .95)', fill: 'forwards' });
      sobe.onfinish = () => { f.style.height = '4px'; sobe.cancel(); el.classList.remove('escalando'); esperarEDescer(); };
    };

    /** Cinco minutos depois de cair: entra pela borda, anda até a teia e desce o fio. */
    const voltar = () => {
      const el = caixa.current;
      if (!el) return;
      modo = 'voltando'; ocupada = true;
      recolhida();
      el.classList.add('escalando');
      const anda = animar(el, [
        { transform: 'translate(64px, -46px) rotate(-130deg)' },
        { transform: 'translate(0, 0) rotate(-130deg)', offset: 0.7 },
        { transform: 'translate(0, 0) rotate(-160deg)', offset: 0.78 },
        { transform: 'translate(0, 0) rotate(-115deg)', offset: 0.86 },
        { transform: 'translate(0, 0) rotate(0deg)' },
      ], { duration: 3600, easing: 'ease-in-out' });
      anda.onfinish = () => { anda.cancel(); el.classList.remove('escalando'); descer(); };
    };

    // ── Solta (palco fixo, quadro a quadro) ───────────────────────────────────

    const mostrarSolta = (sim: boolean) => {
      solta.current?.classList.toggle('ativa', sim);
      if (!sim) solta.current?.classList.remove('agitada', 'agarrada');
    };

    const pof = (x: number, y: number) => {
      const p = palco.current;
      if (!p) return;
      const el = document.createElement('div');
      el.className = 'hw-pof fio';
      el.style.left = `${x}px`; el.style.top = `${y}px`;
      el.innerHTML = Array.from({ length: 7 }, (_, i) => `<i style="--a:${i * 51}deg"></i>`).join('');
      p.appendChild(el); window.setTimeout(() => el.remove(), 600);
    };

    /** O fio estourou na mão: a aranha fica na mão, sem fio, e o pedaço de cima volta para a teia. */
    const estourar = () => {
      const rad = (s.rot * Math.PI) / 180;
      const cx = s.x - CABECA * Math.sin(rad), cy = s.y + CABECA * Math.cos(rad);
      s.caco = { x: s.x, y: s.y, t0: performance.now() };
      pof(s.x, s.y);
      // O dedo segura o mesmo ponto do corpo: só muda a referência, de cabeça para centro.
      s.dedo = { x: s.dedo.x + (s.x - cx), y: s.dedo.y + (s.y - cy) };
      s.x = cx; s.y = cy;
      modo = 'segura';
      solta.current?.classList.add('agitada');
    };

    const perder = () => {
      modo = 'perdida';
      mostrarSolta(false);
      depois(voltar, VOLTA_EM_MS);
    };

    /** Terminou de subir o fio depois do balanço: volta a ser a aranha da teia, lá em cima. */
    const chegouNoTopo = () => {
      mostrarSolta(false);
      recolhida();
      modo = 'teia';
      esperarEDescer();
    };

    const desenhar = (a: Ponto | null, t: number) => {
      const presa = modo === 'esticando' || modo === 'balancando';
      const el = solta.current;
      if (el) {
        let cx = s.x, cy = s.y;
        if (presa && a) {
          s.rot = anguloNoFio(s, a);
          const rad = (s.rot * Math.PI) / 180;
          cx = s.x - CABECA * Math.sin(rad); cy = s.y + CABECA * Math.cos(rad);
        }
        el.style.transform = `translate(${cx - MEIA_CAIXA}px, ${cy - MEIA_CAIXA}px) rotate(${s.rot}deg)`;
      }
      const ln = linha.current;
      if (ln) {
        if (presa && a) {
          ln.setAttribute('d', caminhoDoFio(a, s, s.comprimento, t));
          const tensao = Math.max(0, distancia(a, s) - s.comprimento) / FISICA.limite;
          ln.style.strokeWidth = String(Math.max(0.35, 1 - tensao * 0.65));
        } else {
          ln.setAttribute('d', '');
        }
      }
      const cc = caco.current;
      if (cc) {
        const k = s.caco ? (t - s.caco.t0) / 320 : 1;
        if (!s.caco || !a || k >= 1) {
          s.caco = null; cc.setAttribute('d', '');
        } else {
          // O pedaço de cima volta para a âncora, chicoteando.
          const e = 1 - Math.pow(1 - k, 3);
          const px = s.caco.x + (a.x - s.caco.x) * e, py = s.caco.y + (a.y - s.caco.y) * e;
          const ondula = Math.sin(k * Math.PI * 3) * (1 - k) * 14;
          cc.setAttribute('d', `M${a.x} ${a.y} Q${(a.x + px) / 2 + ondula} ${(a.y + py) / 2} ${px} ${py}`);
        }
      }
    };

    const quadro = (t: number) => {
      const passos = Math.min(3, Math.max(0, (t - ultimo) / (1000 / 60)));
      ultimo = t;
      const n = Math.max(1, Math.ceil(passos * 2)), dt = passos / n;
      const a = ancora();

      if (modo === 'esticando') {
        s.x = s.mao.x - s.dedo.x; s.y = s.mao.y - s.dedo.y;
        if (a && estourou(s, a, s.comprimento)) estourar();
      } else if (modo === 'balancando' && a) {
        for (let i = 0; i < n; i++) passoNoFio(s, a, s.comprimento, dt);
        // Balança uns segundos e sobe, como quando passa o mouse — subindo
        // ainda balança, o fio só vai encurtando.
        const solto = t - s.soltaEm;
        if (!s.subindo && solto > 4500 && (Math.hypot(s.vx, s.vy) < 0.8 || solto > 8000)) {
          s.subindo = true;
          solta.current?.classList.add('agitada');
        }
        if (s.subindo) {
          s.comprimento -= SUBIDA * passos;
          if (s.comprimento <= 4) chegouNoTopo();
        }
      } else if (modo === 'segura') {
        s.x = s.mao.x - s.dedo.x; s.y = s.mao.y - s.dedo.y;
        // Na mão, pende para o lado em que a mão corre.
        const { vx } = velocidadeDaMao(s.amostras, t);
        s.rot += (Math.max(-35, Math.min(35, vx * 3)) - s.rot) * Math.min(1, 0.15 * passos);
      } else if (modo === 'voando') {
        for (let i = 0; i < n; i++) passoLivre(s, window.innerWidth, dt);
        if (saiuDaTela(s, window.innerHeight)) perder();
      }

      desenhar(a, t);
      const fisica = modo === 'esticando' || modo === 'balancando' || modo === 'segura' || modo === 'voando';
      raf = fisica || s.caco ? requestAnimationFrame(quadro) : 0;
    };
    const rodar = () => {
      if (raf) return;
      ultimo = performance.now();
      raf = requestAnimationFrame(quadro);
    };

    // ── A mão ─────────────────────────────────────────────────────────────────

    const comecarArrasto = (e: React.PointerEvent, novo: Modo) => {
      e.preventDefault();
      arrastando = true;
      modo = novo;
      s.mao = { x: e.clientX, y: e.clientY };
      s.dedo = { x: e.clientX - s.x, y: e.clientY - s.y };
      s.amostras = [{ x: e.clientX, y: e.clientY, t: performance.now() }];
      solta.current?.classList.add('ativa', 'agarrada');
      rodar();
    };

    const pegarDaTeia = (e: React.PointerEvent<SVGSVGElement>) => {
      if (modo !== 'teia' || e.button > 0) return;
      const a = ancora();
      if (!a || !caixa.current) return;
      const r = e.currentTarget.getBoundingClientRect();
      s.x = r.left + r.width / 2; s.y = r.top + r.height / 2 - CABECA;
      s.vx = 0; s.vy = 0; s.subindo = false;
      s.comprimento = Math.max(12, distancia(s, a));
      pararNaTeia();
      caixa.current.style.visibility = 'hidden';
      solta.current?.classList.remove('agitada');
      comecarArrasto(e, 'esticando');
      desenhar(a, performance.now());
    };

    const pegarNoAr = (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button > 0) return;
      if (modo === 'balancando') {
        // Pegou de novo enquanto balança: volta a esticar o mesmo fio.
        s.subindo = false;
        solta.current?.classList.remove('agitada');
        comecarArrasto(e, 'esticando');
      } else if (modo === 'voando') {
        s.rot = normalizarAngulo(s.rot);
        comecarArrasto(e, 'segura');
      }
    };

    const mover = (e: PointerEvent) => {
      if (!arrastando) return;
      s.mao = { x: e.clientX, y: e.clientY };
      s.amostras.push({ x: e.clientX, y: e.clientY, t: performance.now() });
      if (s.amostras.length > 8) s.amostras.shift();
    };
    const largar = () => {
      if (!arrastando) return;
      arrastando = false;
      solta.current?.classList.remove('agarrada');
      const v = velocidadeDaMao(s.amostras, performance.now());
      s.vx = v.vx; s.vy = v.vy;
      if (modo === 'esticando') {
        modo = 'balancando';
        s.soltaEm = performance.now();
        const a = ancora();
        if (a) s.comprimento = comprimentoAoSoltar(s, a, s.comprimento);
      } else if (modo === 'segura') {
        modo = 'voando';
        // Roda como o morcego: o giro segue o arremesso, com um empurrão de sorte.
        s.vr = Math.max(-14, Math.min(14, v.vx * 1.2)) + (Math.random() < 0.5 ? -1 : 1) * acaso(3, 7);
      }
    };

    window.addEventListener('pointermove', mover);
    window.addEventListener('pointerup', largar);
    window.addEventListener('pointercancel', largar);
    controle.current = { foge, pegarDaTeia, pegarNoAr };
    return () => {
      window.removeEventListener('pointermove', mover);
      window.removeEventListener('pointerup', largar);
      window.removeEventListener('pointercancel', largar);
      if (raf) cancelAnimationFrame(raf);
      timers.forEach(t => window.clearTimeout(t));
      anims.forEach(a => a.cancel());
      controle.current = null;
    };
  }, []);

  return (
    <>
      <div ref={caixa} className="hw-aranha">
        <div ref={fio} className="fio" style={{ ['--h' as string]: `${ALTURA_DO_FIO}px` }} />
        <AranhaSvg
          onMouseEnter={() => controle.current?.foge()}
          onPointerDown={e => controle.current?.pegarDaTeia(e)}
        />
      </div>
      {createPortal(
        <div ref={palco} className={cn('hw-aranha-palco text-foreground', claro && 'hw-claro')} aria-hidden="true">
          <svg className="hw-aranha-fios">
            <path ref={linha} className="fio-livre" />
            <path ref={caco} className="fio-livre" />
          </svg>
          <div ref={solta} className="hw-aranha solta" onPointerDown={e => controle.current?.pegarNoAr(e)}>
            <AranhaSvg />
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

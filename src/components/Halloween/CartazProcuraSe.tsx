import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { MorcegoSvg } from './Desenhos';
import { carregarFontesDoCartaz } from './fonte';
import { relogio } from './aranhaPerdida';
import './cartaz.css';

/*
 * O cartaz «Procura-se» que fica no lugar da aranha enquanto ela está perdida.
 * Quem decide quando ele aparece e quando queima é a `Aranha` (linha do tempo
 * em `aranhaPerdida.ts`); aqui só a arte e as animações.
 *
 *   Chegada     um morcego traz o cartaz voando desde a esquerda, afundando
 *               com o peso e suando, prende na teia e vai embora aliviado. O
 *               cartaz desce o fio e balança com o tranco. (Recarregou a
 *               página com ela ainda perdida: o cartaz já está lá.)
 *   Pendurado   balança devagar. Clique: chega mais perto, ali mesmo no fio,
 *               para ler; clique de novo, fora dele ou Esc devolve.
 *   Queima      perto de ela voltar, uma faísca acende o canto de baixo, o
 *               fogo come o papel com fagulhas e fumaça, e sobram cinzas.
 *
 * Os olhos do retrato seguem o mouse e piscam. O relógio a lápis é o tempo
 * real que falta para ela voltar.
 *
 * Fora do React o que mexe por quadro (voo, fogo, olhos), pelo mesmo motivo
 * da aranha e dos morcegos.
 */

export interface EstadoDoCartaz {
  /** Hora da queda (ms, `Date.now`). */
  queda: number;
  /** Hora em que ela volta. */
  volta: number;
  /** `morcego`: chega voando. `direto`: já estava pendurado (página recarregada). */
  chegada: 'morcego' | 'direto';
  queimando: boolean;
}

/** Quanto o fio do cartaz desce da teia, em px. */
const FIO = 26;

const acaso = (min: number, max: number) => min + Math.random() * (max - min);

/** A borda rasgada, igual em todo cartaz: sorteada uma vez, com semente. */
const RASGO = (() => {
  let s = 13;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const p: string[] = [];
  const pt = (x: number, y: number) => p.push(`${x.toFixed(2)}% ${y.toFixed(2)}%`);
  for (let x = 0; x <= 100; x += 3.2) pt(x, r() * 1.3);
  for (let y = 0; y <= 100; y += 2.6) pt(100 - r() * 1.6, y);
  for (let x = 100; x >= 0; x -= 3) pt(x, 100 - r() * 1.3 - (x > 6 && x < 19 ? 2.5 + r() * 2.2 : 0));
  for (let y = 100; y >= 0; y -= 2.6) pt(r() * 1.6, y);
  return `polygon(${p.join(',')})`;
})();

export function CartazProcuraSe({ estado }: { estado: EstadoDoCartaz }) {
  const [aberto, setAberto] = useState(false);
  const [cinzas, setCinzas] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const fio = useRef<HTMLDivElement>(null);
  const voo = useRef<HTMLDivElement>(null);
  const balanco = useRef<HTMLDivElement>(null);
  const papel = useRef<HTMLDivElement>(null);
  const morcego = useRef<HTMLDivElement>(null);
  const efeitos = useRef<HTMLDivElement>(null);
  const relogioRef = useRef<HTMLElement>(null);
  const retrato = useRef<HTMLDivElement>(null);
  const [carteiro, setCarteiro] = useState(estado.chegada === 'morcego');

  useEffect(carregarFontesDoCartaz, []);

  // ── Chegada ────────────────────────────────────────────────────────────────
  // Antes da pintura: o cartaz não pode aparecer um quadro no lugar final.
  useLayoutEffect(() => {
    if (estado.chegada !== 'morcego') return;
    const v = voo.current, f = fio.current, b = balanco.current, m = morcego.current, r = raiz.current;
    if (!v || !f || !b || !m || !r) return;
    const anims: Animation[] = [];
    const animar = (el: Element, k: Keyframe[], o: KeyframeAnimationOptions) => { const a = el.animate(k, o); anims.push(a); return a; };
    let vivo = true;
    // Fio recolhido até o morcego prender o cartaz. Antes de qualquer leitura
    // de layout: depois dela, a troca de altura viraria transição visível.
    f.style.height = '0px';

    // Desde fora da camada, pela esquerda, até a âncora — afundando a cada batida.
    const camada = r.parentElement;
    const ate = (camada?.clientWidth ?? 1200) - 36;
    const dist = ate + 110;
    const quadros: Keyframe[] = [];
    const passos = 7;
    for (let i = 0; i <= passos; i++) {
      const k = i / passos;
      const x = -dist * (1 - k);
      const afunda = i === passos ? 0 : (i % 2 ? 34 : 4) * (1 - k * 0.6);
      const giro = i === passos ? 0 : (i % 2 ? 5 : -5) * (1 - k * 0.5);
      quadros.push({ transform: `translate(${x}px, ${afunda - FIO}px) rotate(${giro}deg)`, offset: k });
    }
    const duracao = Math.min(5200, Math.max(2800, dist * 2.4));
    const chegou = animar(v, quadros, { duration: duracao, easing: 'cubic-bezier(.3,.1,.35,1)', fill: 'forwards' });

    chegou.finished.then(async () => {
      if (!vivo) return;
      // Prende na teia e solta: o cartaz desce o fio e quica.
      m.classList.add('aliviado');
      const desce = 'cubic-bezier(.3,1.45,.5,1)';
      animar(f, [{ height: '0px' }, { height: `${FIO}px` }], { duration: 650, easing: desce, fill: 'forwards' });
      animar(v, [{ transform: `translate(0, ${-FIO}px)` }, { transform: 'translate(0, 0)' }], { duration: 650, easing: desce, fill: 'forwards' });
      animar(m, [
        { transform: 'translate(0, 0)', opacity: 1 },
        { transform: 'translate(-4px, -30px) rotate(-6deg)', opacity: 1, offset: 0.3 },
        { transform: 'translate(260px, -240px) rotate(-18deg)', opacity: 0 },
      ], { duration: 1300, easing: 'cubic-bezier(.45,0,.8,.55)', fill: 'forwards' }).finished.then(() => { if (vivo) setCarteiro(false); }, () => {});
      await new Promise(ok => window.setTimeout(ok, 420));
      if (!vivo) return;
      animar(b, [0, 7, -4.4, 2.6, -1.2, 0.4, 0].map(g => ({ transform: `rotate(${g}deg)` })), { duration: 1700, easing: 'ease-out' });
    }, () => {});

    return () => { vivo = false; anims.forEach(a => a.cancel()); f.style.height = ''; };
  }, [estado.chegada]);

  // ── Ler de perto ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: PointerEvent) => { if (!papel.current?.contains(e.target as Node)) setAberto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false); };
    document.addEventListener('pointerdown', fora, true);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', fora, true); document.removeEventListener('keydown', esc); };
  }, [aberto]);

  // ── Relógio, olhos que seguem o mouse e piscadas ───────────────────────────
  useEffect(() => {
    const tique = () => { if (relogioRef.current) relogioRef.current.textContent = relogio(estado.volta - Date.now()); };
    tique();
    const t = window.setInterval(tique, 1000);

    let pedido = 0, mx = 0, my = 0;
    const olhar = () => {
      pedido = 0;
      retrato.current?.querySelectorAll<SVGGElement>('[data-olho]').forEach(o => {
        const r = o.getBoundingClientRect();
        if (!r.width) return;
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        const a = Math.atan2(my - cy, mx - cx);
        const perto = Math.min(1, Math.hypot(mx - cx, my - cy) / 160);
        const pupila = o.querySelector<SVGGElement>('.pupila');
        if (pupila) pupila.style.transform = `translate(${(Math.cos(a) * 4 * perto).toFixed(2)}px, ${(Math.sin(a) * 5 * perto).toFixed(2)}px)`;
      });
    };
    const mover = (e: PointerEvent) => { mx = e.clientX; my = e.clientY; if (!pedido) pedido = requestAnimationFrame(olhar); };
    window.addEventListener('pointermove', mover, { passive: true });

    const timers: number[] = [];
    const piscar = () => {
      const r = retrato.current;
      if (r) {
        r.classList.add('pisca');
        timers.push(window.setTimeout(() => r.classList.remove('pisca'), 140));
        if (Math.random() < 0.25) {
          timers.push(window.setTimeout(() => r.classList.add('pisca'), 310));
          timers.push(window.setTimeout(() => r.classList.remove('pisca'), 440));
        }
      }
      timers.push(window.setTimeout(piscar, acaso(2600, 6800)));
    };
    timers.push(window.setTimeout(piscar, 1800));

    return () => {
      window.clearInterval(t);
      window.removeEventListener('pointermove', mover);
      if (pedido) cancelAnimationFrame(pedido);
      timers.forEach(x => window.clearTimeout(x));
    };
  }, [estado.volta]);

  // ── Queima ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!estado.queimando) return;
    setAberto(false);
    const p = papel.current, ef = efeitos.current, r = raiz.current, f = fio.current;
    if (!p || !ef || !r || !f) return;
    let vivo = true, raf = 0;
    const timers: number[] = [];
    const anims: Animation[] = [];
    const animar = (el: Element, k: Keyframe[], o: KeyframeAnimationOptions) => { const a = el.animate(k, o); anims.push(a); return a; };
    const particula = (cls: string, x: number, y: number) => {
      const d = document.createElement('i');
      d.className = cls; d.style.left = `${x}px`; d.style.top = `${y}px`;
      ef.appendChild(d); return d;
    };

    // Espera o cartaz voltar ao tamanho de pendurado, se estava aberto.
    timers.push(window.setTimeout(() => {
      if (!vivo) return;
      const faisca = document.createElement('i');
      faisca.className = 'faisca';
      p.appendChild(faisca);
      animar(faisca, [0, 1, 0.4, 1, 0.6, 1].map((o, i) => ({ opacity: o, transform: `scale(${0.4 + i * 0.14})` })), { duration: 650, fill: 'forwards' });

      timers.push(window.setTimeout(() => {
        if (!vivo) return;
        p.classList.add('queimando');
        const dur = 3200, t0 = performance.now();
        let fumacaEm = 0;
        const passo = (agora: number) => {
          if (!vivo) return;
          const k = Math.min(1, (agora - t0) / dur);
          const q = (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2) * 112;
          p.style.setProperty('--q', `${q}%`);
          if (k > 0.05) faisca.style.opacity = '0';
          // Fagulhas e fumaça na borda do fogo, em coordenadas da âncora.
          const pr = p.getBoundingClientRect(), base = r.getBoundingClientRect();
          const cx = pr.left - base.left + pr.width * 0.1, cy = pr.top - base.top + pr.height * 1.04;
          const raio = (Math.hypot(pr.width * 0.9, pr.height * 1.04) * q) / 100;
          const ponto = (): [number, number] | null => {
            const th = acaso(0, Math.PI / 2);
            const x = cx + raio * Math.cos(th), y = cy - raio * Math.sin(th);
            const dentro = x > pr.left - base.left && x < pr.right - base.left && y > pr.top - base.top && y < pr.bottom - base.top;
            return dentro ? [x, y] : null;
          };
          if (Math.random() < 0.6) {
            const pt = ponto();
            if (pt) {
              const b = particula('brasa', pt[0], pt[1]);
              animar(b, [{ transform: 'translate(0,0)', opacity: 1 }, { transform: `translate(${acaso(-14, 14)}px, ${acaso(-60, -26)}px)`, opacity: 0 }],
                { duration: acaso(700, 1300), easing: 'ease-out', fill: 'forwards' }).finished.then(() => b.remove(), () => {});
            }
          }
          if (agora - fumacaEm > 260) {
            fumacaEm = agora;
            const pt = ponto();
            if (pt) {
              const s = particula('fumaca', pt[0] - 10, pt[1] - 10);
              animar(s, [{ transform: 'translate(0,0) scale(.6)', opacity: 0 }, { opacity: 1, offset: 0.2 }, { transform: `translate(${acaso(-18, 18)}px, -90px) scale(1.8)`, opacity: 0 }],
                { duration: acaso(1500, 2100), easing: 'ease-out', fill: 'forwards' }).finished.then(() => s.remove(), () => {});
            }
          }
          if (k < 1) { raf = requestAnimationFrame(passo); return; }
          // Sobrou cinza: cai, e o fio recolhe para a teia.
          const pr2 = p.getBoundingClientRect();
          setCinzas(true);
          for (let i = 0; i < 10; i++) {
            const c = particula('cinza', pr2.left - base.left + acaso(0.1, 0.9) * pr2.width, pr2.top - base.top + acaso(0.2, 0.9) * pr2.height);
            animar(c, [{ transform: 'translate(0,0) rotate(0)', opacity: 0.9 }, { transform: `translate(${acaso(-20, 20)}px, ${acaso(70, 140)}px) rotate(${acaso(-200, 200)}deg)`, opacity: 0 }],
              { duration: acaso(1200, 1800), easing: 'ease-in', fill: 'forwards' });
          }
          animar(f, [{ transform: 'scaleY(1)' }, { transform: 'scaleY(0)' }], { duration: 700, delay: 300, easing: 'ease-in', fill: 'forwards' });
        };
        raf = requestAnimationFrame(passo);
      }, 650));
    }, aberto ? 460 : 0));

    return () => {
      vivo = false;
      cancelAnimationFrame(raf);
      timers.forEach(x => window.clearTimeout(x));
      anims.forEach(a => a.cancel());
      ef.replaceChildren();
      p.classList.remove('queimando');
      p.style.removeProperty('--q');
      p.querySelector('.faisca')?.remove();
    };
    // `aberto` só decide a espera de quem começa a queimar aberto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado.queimando]);

  const hora = new Date(estado.queda).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

  return (
    <div ref={raiz} className={cn('hw-cartaz', aberto && 'aberto', cinzas && 'cinzas')} style={{ ['--fio' as string]: `${FIO}px` }}>
      <div ref={fio} className="hw-cartaz-fio" />
      <div className="hw-cartaz-corpo">
        <div ref={voo} className="hw-cartaz-voo">
          <div ref={balanco} className="hw-cartaz-balanco">
            <div
              ref={papel}
              className="hw-cartaz-papel"
              style={{ clipPath: RASGO }}
              onClick={() => { if (!estado.queimando) setAberto(a => !a); }}
            >
              <span className="prego" />
              <p className="titulo">PROCURA-SE</p>
              <p className="sub">VIVA OU… VIVA</p>
              <div ref={retrato} className="retrato"><RetratoDaAranha /></div>
              <p className="nome">DONA ARANHA</p>
              <p className="fugiu">Fugiu do fio às <b>{hora}</b></p>
              <div className="recompensa"><span>RECOMPENSA</span><b>13 balas de abóbora</b></div>
              <p className="aviso">Se avistada, <strong>NÃO puxe o fio</strong>.</p>
              <p className="lapis rabisco">vi ela no Analítico!!</p>
              <p className="lapis volta">ela volta em<br /><b ref={relogioRef} /></p>
            </div>
          </div>
          {carteiro && (
            <div ref={morcego} className="hw-morcego hw-carteiro">
              <MorcegoSvg />
              <i className="gota" />
            </div>
          )}
        </div>
      </div>
      <div ref={efeitos} className="hw-cartaz-efeitos" />
    </div>
  );
}

/** A Dona Aranha em desenho animado: a mesma da teia (corpo, oito patas, olhos), de lacinho. */
function RetratoDaAranha() {
  const tinta = '#3b2413', escuro = '#2a180b';
  return (
    <svg viewBox="0 0 200 178">
      <defs>
        <pattern id="hw-cartaz-hachura" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="#6b4a2c" strokeWidth="1.3" opacity=".45" />
        </pattern>
        <radialGradient id="hw-cartaz-moldura" cx="50%" cy="42%" r="62%">
          <stop offset="0" stopColor="#f1dcaa" /><stop offset=".75" stopColor="#ddbb7c" /><stop offset="1" stopColor="#c39a58" />
        </radialGradient>
      </defs>
      <ellipse cx="100" cy="88" rx="90" ry="82" fill="url(#hw-cartaz-moldura)" stroke={tinta} strokeWidth="4" />
      <ellipse cx="100" cy="88" rx="81" ry="73" fill="none" stroke={tinta} strokeWidth="1.4" strokeDasharray="2 4" />
      <path d="M30 130 Q100 175 170 130 L170 170 L30 170 Z" fill="url(#hw-cartaz-hachura)" style={{ clipPath: 'ellipse(81px 73px at 100px 88px)' }} />
      <line x1="100" y1="6" x2="100" y2="52" stroke={tinta} strokeWidth="2" />
      <g fill="none" stroke={tinta} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M82 80 Q60 44 36 62" /><path d="M80 92 Q48 80 26 98" /><path d="M80 104 Q46 112 34 136" /><path d="M85 114 Q66 140 62 158" />
        <path d="M118 80 Q140 44 164 62" /><path d="M120 92 Q152 80 174 98" /><path d="M120 104 Q154 112 166 136" /><path d="M115 114 Q134 140 138 158" />
      </g>
      <g fill={tinta}>
        <circle cx="36" cy="62" r="4" /><circle cx="26" cy="98" r="4" /><circle cx="34" cy="136" r="4" /><circle cx="62" cy="158" r="4" />
        <circle cx="164" cy="62" r="4" /><circle cx="174" cy="98" r="4" /><circle cx="166" cy="136" r="4" /><circle cx="138" cy="158" r="4" />
      </g>
      <ellipse cx="100" cy="116" rx="31" ry="35" fill="#3f2816" stroke={escuro} strokeWidth="4" />
      <path d="M86 102 Q100 92 114 102 M88 116 Q100 108 112 116 M90 130 Q100 124 110 130" stroke="#7a5534" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <ellipse cx="88" cy="104" rx="6" ry="9" fill="#8d6640" opacity=".55" transform="rotate(-20 88 104)" />
      <circle cx="100" cy="72" r="26" fill="#4b301a" stroke={escuro} strokeWidth="4" />
      <path d="M114 50 l14 -9 l-2 15 z M114 50 l-15 -6 l5 13 z" fill="#a8452f" stroke={escuro} strokeWidth="2.4" strokeLinejoin="round" />
      <circle cx="114" cy="50" r="3.6" fill="#a8452f" stroke={escuro} strokeWidth="2.2" />
      {[89, 111].map(x => (
        <g key={x} data-olho>
          <ellipse cx={x} cy="68" rx="9.5" ry="11.5" fill="#fbf1da" stroke={escuro} strokeWidth="2.6" />
          <g className="pupila"><circle cx={x} cy="69" r="4.6" fill="#1d1109" /><circle cx={x + 1.6} cy="67.2" r="1.4" fill="#fff" /></g>
          <ellipse className="palpebra" cx={x} cy="68" rx="10.4" ry="12.4" fill="#4b301a" stroke={escuro} strokeWidth="2.6" />
        </g>
      ))}
      <path d="M80 54 Q88 49 96 54" stroke={escuro} strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M104 52 Q113 52 120 57" stroke={escuro} strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M91 85 Q100 91 110 83" stroke={escuro} strokeWidth="2.6" fill="none" strokeLinecap="round" />
      <path d="M96 87.6 l1.6 4 l1.8 -3.6 M103 87.4 l1.6 3.8 l1.6 -3.9" fill="#fbf1da" stroke={escuro} strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

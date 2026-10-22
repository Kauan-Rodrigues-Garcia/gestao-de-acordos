/**
 * CardDivulgacao — o aviso que o super admin manda para quem escolher:
 * «fica esperto, vem aí uma corrida com prêmio». Um card aconchegante, com os
 * bichinhos correndo numa pistinha no alto. Some quando a pessoa fecha (fica
 * anotado no banco: não volta em outro computador).
 */
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Trophy, X } from 'lucide-react';
import { CALMO, desenhaBichinho, mulberry32, tresBichinhos, type Estilo } from './motor/bichinhos';
import { categoriaDe, fecharDivulgacao, mensagemDoErro, type DivulgacaoJson } from './banco';
import CardCavalos from './cavalos/CardCavalos';

interface Props { divulgacao: DivulgacaoJson; onFechou?: () => void; teste?: boolean }

export default function CardDivulgacao({ divulgacao, onFechou, teste }: Props) {
  const [fechando, setFechando] = useState(false);
  const fechar = async () => {
    if (teste) { onFechou?.(); return; }
    setFechando(true);
    try { await fecharDivulgacao(divulgacao.id); onFechou?.(); }
    catch (e) { toast.error('Não deu para fechar', { description: mensagemDoErro(e) }); setFechando(false); }
  };
  // O card da corrida de cavalos tem o tema do hipódromo (a página da corrida, no modo «card»).
  if (categoriaDe(divulgacao) === 'cavalos') {
    return <CardCavalos titulo={divulgacao.titulo} mensagem={divulgacao.mensagem} premio={divulgacao.premio} onFechar={() => { if (!fechando) void fechar(); }} />;
  }
  return (
    <div className="fixed inset-0 z-[84] grid place-items-center bg-[#04060d]/55 p-4 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-labelledby="cds-div-titulo">
      <div className="cds-palco cds-entra relative w-full max-w-[460px] overflow-hidden rounded-3xl border border-[#ffd678]/40 bg-gradient-to-b from-[#1d2a50] via-[#142040] to-[#0b1022] text-center text-[#e8eefc] shadow-[0_30px_80px_rgba(0,0,0,.6),0_0_70px_rgba(255,214,120,.18)]">
        <button type="button" onClick={fechar} disabled={fechando} className="absolute right-3 top-3 z-10 rounded-full p-1.5 text-[#c8d4f4] hover:bg-white/10" aria-label="Fechar o aviso">
          <X className="h-4 w-4" />
        </button>
        <PistinhaViva />
        <div className="px-6 pb-6 pt-4">
          <p className="text-[13px] font-bold uppercase tracking-[0.2em] text-[#ffd84d]">Fica esperto!</p>
          <h3 id="cds-div-titulo" className="cds-titulo mt-1 -skew-x-6 text-[30px] leading-tight text-[#fff6e6] [text-shadow:2px_2px_0_#e2343f]">{divulgacao.titulo}</h3>
          <p className="mx-auto mt-3 max-w-[38ch] whitespace-pre-line text-[15px] leading-relaxed text-[#c8d4f0]">{divulgacao.mensagem}</p>
          {divulgacao.premio && (
            <p className="mx-auto mt-4 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-b from-[#ffe68a] to-[#e0a92a] px-3.5 py-1.5 text-[15px] font-bold text-[#2a1a02] shadow-[0_6px_20px_rgba(224,169,42,.35)]">
              <Trophy className="h-4 w-4" aria-hidden="true" /> Prêmio: {divulgacao.premio}
            </p>
          )}
          <div className="mt-5">
            <button type="button" onClick={fechar} disabled={fechando}
              className="rounded-xl bg-[#e2343f] px-6 py-3 text-[16px] font-bold text-white shadow-[0_8px_30px_rgba(226,52,63,.4)] transition-colors hover:bg-[#f04450] disabled:opacity-60">
              Oba! Vou ficar de olho
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** A pistinha do alto do card: cinco bichinhos dando voltas, a linha de chegada e confete. */
function PistinhaViva() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const c = cv.getContext('2d'); if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let w = 0, h = 0;
    const medir = () => { const r = cv.getBoundingClientRect(); w = r.width; h = r.height; cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); };
    medir();
    const rng = mulberry32(2026);
    const corredores: { est: Estilo; v: number; fase: number; faixa: number }[] = [];
    for (let i = 0; i < 2; i++) for (const est of tresBichinhos(rng)) corredores.push({ est, v: 0.11 + rng() * 0.05, fase: rng(), faixa: corredores.length % 3 });
    corredores.length = 5;
    const confete = Array.from({ length: 26 }, () => ({ x: rng(), y: rng(), v: 0.08 + rng() * 0.1, cor: ['#ffd84d', '#ff6fb5', '#5ff0c8', '#ffffff', '#ff8a3d'][Math.floor(rng() * 5)], rot: rng() * 6 }));
    let raf = 0;
    const quadro = (ms: number) => {
      const t = ms / 1000;
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#2a3a6e'); g.addColorStop(1, '#1d2a50'); c.fillStyle = g; c.fillRect(0, 0, w, h);
      // o sol se pondo e a pista
      const sol = c.createRadialGradient(w * 0.78, h * 0.62, 4, w * 0.78, h * 0.62, h * 0.9); sol.addColorStop(0, 'rgba(255,170,110,.55)'); sol.addColorStop(1, 'rgba(255,170,110,0)'); c.fillStyle = sol; c.fillRect(0, 0, w, h);
      const py = h * 0.5;
      c.fillStyle = '#30343d'; c.fillRect(0, py, w, h - py);
      c.fillStyle = 'rgba(244,241,234,.75)'; c.fillRect(0, py + 2, w, 2); c.fillRect(0, h - 4, w, 2);
      for (let x = (-(t * 60) % 40); x < w; x += 40) { c.fillStyle = 'rgba(244,241,234,.35)'; c.fillRect(x, py + (h - py) / 2, 18, 2); }
      // a linha de chegada
      const lx = w - 34; for (let i = 0; i < 2; i++) for (let j = 0; j * 6 < h - py; j++) { c.fillStyle = (i + j) % 2 ? '#15171c' : '#f4f1ea'; c.fillRect(lx + i * 6, py + j * 6, 6, Math.min(6, h - py - j * 6)); }
      // confete caindo devagar
      if (!CALMO) for (const p of confete) { const y = ((p.y + t * p.v) % 1) * h, x = p.x * w + Math.sin(t + p.rot) * 6; c.save(); c.translate(x, y); c.rotate(t * 2 + p.rot); c.fillStyle = p.cor; c.globalAlpha = 0.8; c.fillRect(-3, -1.5, 6, 3); c.restore(); }
      // os bichinhos
      const r = Math.min(14, (h - py) / 5);
      for (const k of corredores) {
        const u = CALMO ? k.fase : (k.fase + t * k.v) % 1.25 - 0.12;
        const x = u * (w + 40) - 20, y = py + (h - py) * (0.28 + k.faixa * 0.25) - Math.abs(Math.sin(t * 9 + k.fase * 6)) * r * 0.35;
        c.fillStyle = 'rgba(0,0,0,.28)'; c.beginPath(); c.ellipse(x + 2, py + (h - py) * (0.28 + k.faixa * 0.25) + r * 0.9, r * 0.8, r * 0.22, 0, 0, Math.PI * 2); c.fill();
        desenhaBichinho(c, x, y, r, k.est, { expr: 'feliz', lx: 0.8, ly: 0, t: t + k.fase * 3, inc: 0.12 });
      }
      if (!CALMO) raf = requestAnimationFrame(quadro);
    };
    raf = requestAnimationFrame(quadro);
    const ro = new ResizeObserver(medir); ro.observe(cv);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);
  return <canvas ref={ref} className="block h-[130px] w-full" aria-hidden="true" />;
}

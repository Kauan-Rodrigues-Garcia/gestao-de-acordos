// A comemoração de meta (`components/comemoracao`): o card cai do topo, sem
// caixa, com o texto contornado de escuro (SOMBRA_TEXTO); o confete do
// EfeitoComemoracao chove pela tela; e os balões de «parabéns» da equipe sobem
// pelos lados (BaloesParabens).

import { Trophy } from 'lucide-react';
import { random, useCurrentFrame } from 'remotion';
import { entre, FPS, mola, ms } from '../../movimento';
import { OPERADORA } from '../dados';
import { APP_A, APP_L } from '../layout';
import type { TempoApp } from '../roteiro';

const SOMBRA_TEXTO: React.CSSProperties = {
  textShadow:
    '1px 1px 0 rgba(0,0,0,.75), -1px 1px 0 rgba(0,0,0,.75), 1px -1px 0 rgba(0,0,0,.75), -1px -1px 0 rgba(0,0,0,.75), 0 3px 10px rgba(0,0,0,.5)',
};

const CORES = ['#f59e0b', '#ef4444', '#3b82f6', '#22c55e', '#a855f7', '#ec4899'];

const BALOES = [
  { nome: 'Carlos', frase: 'Parabéns, Ju! 👏', lado: 'esquerda' as const, base: 58 },
  { nome: 'Marina', frase: 'Arrasou! 🔥', lado: 'direita' as const, base: 66 },
  { nome: 'Diego', frase: 'Bora, Águia! 💪', lado: 'esquerda' as const, base: 72 },
  { nome: 'Paula', frase: 'Merecido demais! 🎉', lado: 'direita' as const, base: 54 },
];

export const Comemoracao: React.FC<{ t: TempoApp }> = ({ t }) => {
  const f = useCurrentFrame();
  const ini = t.metaVem;
  const fim = t.c11.inicio + ms(60);
  if (f < ini || f > fim + ms(500)) return null;
  const entra = mola(f, ini, { mass: 1, stiffness: 260, damping: 22, overshootClamping: false });
  const sai = entre(f, fim, fim + ms(400), 0, 1);
  const trofeu = mola(f, ini + ms(120), { mass: 1, stiffness: 220, damping: 14, overshootClamping: false });
  const textoP = entre(f, ini + ms(160), ini + ms(520), 0, 1);
  const pessoasP = entre(f, ini + ms(320), ini + ms(640), 0, 1);
  const msgP = entre(f, ini + ms(420), ini + ms(800), 0, 1);
  const duracao = fim - ini;
  const resta = 1 - Math.min(1, (f - ini) / duracao);

  // largura do card: max-w-xl (576) com palco lógico de 640×360 encolhido
  const largura = 576;
  const escala = largura / 640;

  return (
    <div className="absolute inset-0 pointer-events-none font-sans" style={{ zIndex: 80 }}>
      {/* confete caindo (EfeitoComemoracao) */}
      {Array.from({ length: 44 }).map((_, i) => {
        const atraso = random(`at${i}`) * 1.2;
        const dur = 2.4 + random(`du${i}`) * 1.8;
        const tt = (f - t.explode) / FPS - atraso;
        if (tt < 0) return null;
        const prog = (tt % dur) / dur;
        const y = -40 + prog * (APP_A * 1.05 + 40);
        const op = prog < 0.08 ? prog / 0.08 : prog > 0.85 ? (1 - prog) / 0.15 : 1;
        const tam = 6 + random(`ta${i}`) * 8;
        return (
          <span
            key={i}
            className="absolute"
            style={{
              left: `${random(`es${i}`) * 100}%`,
              top: 0,
              width: tam * 0.6,
              height: tam,
              borderRadius: 2,
              background: CORES[i % CORES.length],
              transform: `translateY(${y}px) rotate(${(random(`gi${i}`) * 720 - 360) * prog}deg)`,
              opacity: op * (1 - sai),
            }}
          />
        );
      })}

      {/* card */}
      <div
        className="absolute inset-x-0 top-0 flex justify-center px-3 pt-4"
        style={{ opacity: Math.min(1, entra * 1.3) * (1 - sai), transform: `translateY(${(1 - entra) * -60 - sai * 40}px) scale(${0.9 + 0.1 * entra - 0.05 * sai})` }}
      >
        <div className="relative w-full" style={{ maxWidth: largura, height: 360 * escala }}>
          <div className="absolute left-0 top-0 text-center text-white" style={{ width: 640, height: 360, transform: `scale(${escala})`, transformOrigin: 'top left' }}>
            <div className="absolute left-1/2 -translate-x-1/2" style={{ top: 20 }}>
              <div className="rounded-full bg-amber-400 p-3 shadow-xl" style={{ transform: `scale(${trofeu}) rotate(${(1 - trofeu) * -20}deg)` }}>
                <Trophy className="h-8 w-8 text-white drop-shadow" />
              </div>
            </div>
            <div className="absolute inset-x-0" style={{ top: 102, opacity: textoP, transform: `translateY(${(1 - textoP) * 10}px)` }}>
              <h2 style={SOMBRA_TEXTO} className="whitespace-pre-wrap text-3xl font-black uppercase leading-none tracking-tight text-amber-300">META BATIDA!</h2>
            </div>
            <div className="absolute inset-x-0 flex justify-center" style={{ top: 150, opacity: pessoasP, transform: `translateY(${(1 - pessoasP) * 10}px)` }}>
              <div className="flex flex-col items-center gap-1">
                <span className="relative flex h-14 w-14 shrink-0 overflow-hidden rounded-full border-2 border-white shadow-[0_2px_12px_rgba(0,0,0,.5)]">
                  <span className="flex h-full w-full items-center justify-center bg-amber-500 text-sm font-bold text-white">{OPERADORA.iniciais}</span>
                </span>
                <span style={SOMBRA_TEXTO} className="font-bold text-sm">{OPERADORA.primeiroNome}</span>
              </div>
            </div>
            <div className="absolute inset-x-0" style={{ top: 248, opacity: msgP, transform: `translateY(${(1 - msgP) * 10}px)` }}>
              <p style={SOMBRA_TEXTO} className="text-sm font-semibold leading-snug">Bateu a meta do mês! Todo o setor comemora com você 🎉</p>
            </div>
          </div>
          <div className="absolute bottom-0 left-1/2 h-1 w-40 -translate-x-1/2 overflow-hidden rounded-full bg-black/40">
            <div className="h-full bg-amber-300" style={{ width: `${resta * 100}%` }} />
          </div>
        </div>
      </div>

      {/* balões de parabéns */}
      {BALOES.map((b, i) => {
        const em = t.baloes[i];
        if (f < em) return null;
        const vida = ms(2600);
        const p = Math.min(1, (f - em) / vida);
        const op = p < 0.12 ? p / 0.12 : p > 0.75 ? Math.max(0, (1 - p) / 0.25) : 1;
        const ease = 1 - Math.pow(1 - p, 2);
        return (
          <div
            key={b.nome}
            className="absolute flex items-center gap-2 rounded-full border border-white/20 bg-black/70 py-1 pl-1 pr-3 shadow-lg"
            style={{
              [b.lado === 'esquerda' ? 'left' : 'right']: 12,
              top: (b.base / 100) * APP_A,
              opacity: op * (1 - sai),
              transform: `translateY(${30 - 150 * ease}px) scale(${0.8 + 0.2 * Math.min(1, p * 6)})`,
              backdropFilter: 'blur(4px)',
            }}
          >
            <span className="relative flex h-6 w-6 shrink-0 overflow-hidden rounded-full border border-white/40">
              <span className="flex h-full w-full items-center justify-center bg-primary text-[9px] font-bold text-primary-foreground">{b.nome.charAt(0)}</span>
            </span>
            <span className="whitespace-nowrap text-xs font-semibold text-white">
              <strong className="font-bold">{b.nome}:</strong> {b.frase}
            </span>
          </div>
        );
      })}
      <div style={{ width: APP_L }} />
    </div>
  );
};

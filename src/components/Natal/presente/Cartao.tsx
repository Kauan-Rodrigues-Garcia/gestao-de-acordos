/**
 * Cartao — as boas-vindas do Natal, que saem da carta do Polo Norte depois do
 * vídeo (Cleber, 29/10/2026): papel creme, filete dourado, neve assentada na
 * borda de cima com um varal de luzinhas, e um gorro de Papai Noel enfiado no
 * canto. O texto é o do Cleber (05/11/2026): «Novembro chegou e já entramos em
 * clima natalino. Tudo foi feito do zero e pensado com carinho…». Cores
 * próprias, iguais em qualquer tema: é um objeto, como o presente.
 */
import { forwardRef } from 'react';

/** Sorteio fixo por índice: a pelúcia sai igual em todo render. */
const fixo = (i: number) => {
  const x = Math.sin(i * 12.9898 + 4.1) * 43758.5453;
  return x - Math.floor(x);
};

/** A borda de cima e a de baixo da barra de pelúcia (y em função de x). */
const topoDaBarra = (x: number) => 117 - 9 * Math.sin((Math.PI * (x - 14)) / 166);
const pedaBarra = (x: number) => 148 - 7 * Math.sin((Math.PI * (x - 12)) / 168);

/** Tufos ao longo das bordas da barra e nas pontas: é o que a deixa felpuda. */
const TUFOS = (() => {
  const t: { x: number; y: number; r: number }[] = [];
  for (let i = 0, x = 14; x <= 182; i++, x += 8.5) t.push({ x: x + (fixo(i) - 0.5) * 3, y: topoDaBarra(x) + (fixo(i + 50) - 0.5) * 3, r: 6.5 + fixo(i + 90) * 3 });
  for (let i = 0, x = 12; x <= 184; i++, x += 9) t.push({ x: x + (fixo(i + 200) - 0.5) * 3, y: pedaBarra(x) + (fixo(i + 250) - 0.5) * 3, r: 6 + fixo(i + 300) * 3 });
  t.push({ x: 9, y: 132, r: 11 }, { x: 187, y: 130, r: 11 });
  return t;
})();

/** Os pelinhos riscados por cima da pelúcia. */
const PELOS = Array.from({ length: 34 }, (_, i) => {
  const x = 20 + fixo(i + 400) * 156, y0 = topoDaBarra(x) + 6, y1 = pedaBarra(x) - 5;
  const y = y0 + fixo(i + 450) * Math.max(4, y1 - y0);
  return { x, y, ang: (fixo(i + 500) - 0.5) * 1.6 };
});

/** O pompom: tufos em volta de um miolo. */
const POMPOM = { x: 199, y: 86 };
const TUFOS_DO_POMPOM = Array.from({ length: 15 }, (_, i) => {
  const ang = (i / 15) * Math.PI * 2 + fixo(i + 600) * 0.3;
  const d = 12 + fixo(i + 650) * 3;
  return { x: POMPOM.x + Math.cos(ang) * d, y: POMPOM.y + Math.sin(ang) * d, r: 5.5 + fixo(i + 700) * 2.5 };
});

export function Gorro({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 224 172" className={className} aria-hidden>
      <defs>
        <linearGradient id="np-gorro-veludo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff5a64" />
          <stop offset=".42" stopColor="#d3162b" />
          <stop offset="1" stopColor="#7c0918" />
        </linearGradient>
        <linearGradient id="np-gorro-pelucia" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset=".6" stopColor="#f4f6f9" />
          <stop offset="1" stopColor="#d9e0e8" />
        </linearGradient>
        <radialGradient id="np-gorro-tufo" cx=".38" cy=".32" r=".75">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset=".65" stopColor="#f1f4f8" />
          <stop offset="1" stopColor="#c9d3de" />
        </radialGradient>
        <radialGradient id="np-gorro-baga" cx=".35" cy=".3" r=".8">
          <stop offset="0" stopColor="#ff8a8a" />
          <stop offset=".5" stopColor="#d62828" />
          <stop offset="1" stopColor="#8e1414" />
        </radialGradient>
      </defs>

      {/* O corpo de veludo, que sobe e cai para a direita */}
      <path
        d="M24 120 C28 84 52 48 96 31 C124 21 158 18 183 34 C198 44 206 62 203 79 C197 72 190 66 182 62 C176 72 171 92 168 118 Z"
        fill="url(#np-gorro-veludo)"
      />
      {/* A sombra que a ponta caída faz no corpo, e o lado de dentro */}
      <path d="M148 56 C162 52 176 55 184 62 C176 67 166 72 157 79 C154 71 151 63 148 56 Z" fill="#5c0611" opacity=".42" />
      <path d="M182 62 C176 72 171 92 168 118 L150 118 C151 97 155 80 162 70 Z" fill="#5a0612" opacity=".3" />
      {/* As dobras do pano */}
      <path d="M121 40 C116 64 114 90 117 116" fill="none" stroke="#6e0816" strokeOpacity=".28" strokeWidth="3" strokeLinecap="round" />
      <path d="M76 54 C71 76 70 97 72 116" fill="none" stroke="#6e0816" strokeOpacity=".2" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M182 36 C190 46 196 58 197 70" fill="none" stroke="#6e0816" strokeOpacity=".3" strokeWidth="2" strokeLinecap="round" />
      {/* O brilho do veludo */}
      <path d="M36 114 C40 86 58 58 92 41 C68 60 54 86 49 114 Z" fill="#ffffff" opacity=".16" />
      <path d="M102 34 C126 26 152 24 173 32 C152 30 129 33 110 41 Z" fill="#ffffff" opacity=".24" />

      {/* A barra de pelúcia: a sombra dos tufos, a barra, os tufos e os pelinhos */}
      <g fill="#b9c4d1" opacity=".55">
        {TUFOS.map((t, i) => <circle key={i} cx={t.x + 1.2} cy={t.y + 2} r={t.r} />)}
      </g>
      <path
        d={`M12 ${topoDaBarra(12)} C56 106 140 104 186 ${topoDaBarra(186)} L188 ${pedaBarra(188)} C140 140 60 140 10 ${pedaBarra(10)} Z`}
        fill="url(#np-gorro-pelucia)"
      />
      <g fill="url(#np-gorro-tufo)">
        {TUFOS.map((t, i) => <circle key={i} cx={t.x} cy={t.y} r={t.r} />)}
      </g>
      <path
        d={`M18 ${topoDaBarra(18) + 4} C60 112 136 110 180 ${topoDaBarra(180) + 4} L180 ${pedaBarra(180) - 4} C136 136 60 136 18 ${pedaBarra(18) - 4} Z`}
        fill="#ffffff"
        opacity=".7"
      />
      <g stroke="#d3dbe5" strokeWidth="1.1" strokeLinecap="round" fill="none">
        {PELOS.map((p, i) => (
          <path key={i} d={`M${p.x.toFixed(1)} ${p.y.toFixed(1)} q${(Math.cos(p.ang) * 2.5).toFixed(1)} -2.5 ${(Math.cos(p.ang) * 4.5).toFixed(1)} ${(Math.sin(p.ang) * 3).toFixed(1)}`} />
        ))}
      </g>

      {/* Azevinho preso na pelúcia */}
      <g transform="translate(150 118)">
        <path d="M0 0 C-4 -9 -14 -14 -24 -12 C-21 -9 -22 -6 -18 -5 C-21 -2 -19 1 -16 1 C-12 3 -6 3 0 0 Z" fill="#1f7a43" />
        <path d="M0 0 C-7 -4 -14 -7 -21 -9" fill="none" stroke="#0f4f2a" strokeWidth=".9" />
        <path d="M0 0 C3 -9 12 -16 22 -16 C20 -13 22 -10 18 -8 C21 -5 20 -2 16 -1 C12 2 6 3 0 0 Z" fill="#279453" />
        <path d="M0 0 C6 -5 12 -9 19 -12" fill="none" stroke="#11592f" strokeWidth=".9" />
        <circle cx="-3" cy="-2" r="4.2" fill="url(#np-gorro-baga)" />
        <circle cx="4" cy="-3.5" r="4" fill="url(#np-gorro-baga)" />
        <circle cx="0.5" cy="3" r="4.2" fill="url(#np-gorro-baga)" />
        <circle cx="-4.2" cy="-3.4" r="1.1" fill="#fff" opacity=".7" />
        <circle cx="2.8" cy="-4.8" r="1" fill="#fff" opacity=".7" />
        <circle cx="-.7" cy="1.6" r="1.1" fill="#fff" opacity=".7" />
      </g>

      {/* O pompom */}
      <g>
        {TUFOS_DO_POMPOM.map((t, i) => <circle key={`s${i}`} cx={t.x + 1.2} cy={t.y + 2} r={t.r} fill="#b9c4d1" opacity=".5" />)}
        {TUFOS_DO_POMPOM.map((t, i) => <circle key={i} cx={t.x} cy={t.y} r={t.r} fill="url(#np-gorro-tufo)" />)}
        <circle cx={POMPOM.x} cy={POMPOM.y} r="13" fill="url(#np-gorro-tufo)" />
        <circle cx={POMPOM.x - 4} cy={POMPOM.y - 5} r="4.5" fill="#ffffff" opacity=".85" />
      </g>
    </svg>
  );
}

/** A neve assentada na borda de cima do cartão, com pingentes. */
function NeveDaBorda() {
  return (
    <svg className="np-cartao-neve" viewBox="0 0 300 28" preserveAspectRatio="none" aria-hidden>
      <path
        d="M0 18 C14 8 30 6 46 10 C60 3 82 2 98 9 C116 4 136 5 150 11 C168 2 192 3 206 10 C222 4 246 4 260 11 C274 6 290 8 300 14 L300 20 C296 22 292 22 290 20 C288 26 282 27 280 21 C270 23 252 22 238 21 C236 27 230 28 228 21 C214 23 190 22 172 21 C170 25 165 26 163 21 C146 23 124 22 106 21 C104 27 98 27 96 21 C80 22 58 23 40 21 C38 25 33 25 31 21 C20 22 8 22 0 21 Z"
        fill="#ffffff"
      />
      <path d="M8 14 C40 6 90 6 130 10 C170 6 230 6 290 12" fill="none" stroke="#dfe7f0" strokeWidth="2" strokeLinecap="round" opacity=".9" />
    </svg>
  );
}

/** Um floco desenhado, para a assinatura. */
function Floquinho({ tamanho = 14 }: { tamanho?: number }) {
  return (
    <svg viewBox="-10 -10 20 20" width={tamanho} height={tamanho} aria-hidden>
      <g stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
        {[0, 60, 120].map(a => (
          <g key={a} transform={`rotate(${a})`}>
            <path d="M0 -8.5 V8.5" />
            <path d="M0 -5.5 L-2.4 -7.6 M0 -5.5 L2.4 -7.6 M0 5.5 L-2.4 7.6 M0 5.5 L2.4 7.6" />
          </g>
        ))}
      </g>
    </svg>
  );
}

/** As cores das luzinhas do varal, na ordem em que se repetem. */
const LUZES = ['#e0283a', '#f4c542', '#2f9e5b', '#3a8ee6', '#f07c2a'];
/** O fio do varal: cai da neve da borda, com duas barrigas. */
const fioDoVaral = (x: number) => 6 + 14 * Math.abs(Math.sin((Math.PI * x) / 150));

/** O varal de luzinhas pendurado na neve da borda de cima (piscam uma depois da outra). */
function Varal() {
  const lampadas = Array.from({ length: 11 }, (_, i) => 10 + i * 28);
  return (
    <svg className="np-cartao-varal" viewBox="0 0 300 40" preserveAspectRatio="none" aria-hidden>
      <path
        d={`M0 ${fioDoVaral(0)} ${Array.from({ length: 61 }, (_, i) => `L${i * 5} ${fioDoVaral(i * 5).toFixed(1)}`).join(' ')}`}
        fill="none" stroke="#3d5a40" strokeWidth="1.4"
      />
      {lampadas.map((x, i) => {
        const y = fioDoVaral(x);
        return (
          <g key={x} transform={`translate(${x} ${y.toFixed(1)}) rotate(${(i % 2 ? 8 : -8)})`}>
            <rect x="-2" y="0" width="4" height="4" rx="1" fill="#5b6b5c" />
            <ellipse className="np-cartao-luz" cx="0" cy="9" rx="3.6" ry="5.4" fill={LUZES[i % LUZES.length]}
              style={{ animationDelay: `${(i % 4) * 0.35}s`, color: LUZES[i % LUZES.length] }} />
          </g>
        );
      })}
    </svg>
  );
}

/** Um raminho de azevinho, para o divisor. */
function Azevinho() {
  return (
    <svg viewBox="-16 -10 32 20" width={32} height={20} aria-hidden>
      <path d="M0 2 C-4 -5 -11 -8 -15 -6 C-13 -4 -14 -2 -11 -1 C-13 1 -11 3 -9 3 C-6 5 -3 4 0 2 Z" fill="#2f8a50" />
      <path d="M0 2 C4 -5 11 -8 15 -6 C13 -4 14 -2 11 -1 C13 1 11 3 9 3 C6 5 3 4 0 2 Z" fill="#247a44" />
      <path d="M0 2 C-5 -1 -9 -3 -13 -5 M0 2 C5 -1 9 -3 13 -5" fill="none" stroke="#145a2e" strokeWidth=".8" />
      <circle cx="-2.6" cy="2.4" r="2.9" fill="#d62828" />
      <circle cx="2.6" cy="2.4" r="2.9" fill="#c01f24" />
      <circle cx="0" cy="-1.4" r="2.9" fill="#e23a3a" />
      <circle cx="-3.4" cy="1.5" r=".8" fill="#fff" opacity=".7" />
      <circle cx="-.8" cy="-2.3" r=".8" fill="#fff" opacity=".7" />
    </svg>
  );
}

/** Quantos segundos o bilhete segura o botão (Cleber, 04/11/2026: «uma contagenzinha de 5 segundos»). */
export const CONTAGEM_DO_CARTAO_S = 5;

export const Cartao = forwardRef<HTMLButtonElement, {
  aoEntrar: () => void;
  saindo: boolean;
  /** Segundos que faltam para o botão liberar (0: liberado). */
  falta: number;
}>(
  function Cartao({ aoEntrar, saindo, falta }, botao) {
    return (
      <div className="np-cartao" role="dialog" aria-modal="true" aria-labelledby="np-cartao-titulo">
        <Gorro className="np-gorro" />
        <NeveDaBorda />
        <Varal />
        <p className="np-cartao-olho">Natal 2026</p>
        <h2 id="np-cartao-titulo" className="np-cartao-titulo">Feliz Natal!</h2>
        <div className="np-cartao-divisor" aria-hidden>
          <span />
          <Azevinho />
          <span />
        </div>
        <p className="np-cartao-texto">
          Novembro chegou, e com ele já entramos no <b>clima natalino</b>.
        </p>
        <p className="np-cartao-texto">
          Tudo o que você vai ver foi feito do zero e pensado com muito carinho,
          para todo mundo aproveitar ainda mais esta época tão especial.
        </p>
        <p className="np-cartao-assinatura">Boas festas! <Floquinho tamanho={13} /></p>
        <button
          ref={botao}
          type="button"
          className={`np-cartao-botao${falta > 0 ? ' esperando' : ''}`}
          onClick={aoEntrar}
          disabled={saindo || falta > 0}
          aria-label={falta > 0 ? `Entrar no Natal, libera em ${falta} segundos` : 'Entrar no Natal'}
        >
          {falta > 0 && (
            <span className="np-cartao-contagem" style={{ ['--np-falta' as string]: falta / CONTAGEM_DO_CARTAO_S }} aria-hidden>
              <span key={falta}>{falta}</span>
            </span>
          )}
          Entrar no Natal
        </button>
        <p className="np-cartao-nota">
          {falta > 0 ? 'Enquanto você lê, o Natal vai se arrumando aí atrás…' : 'A música continua no botão de música, no alto da tela.'}
        </p>
      </div>
    );
  },
);

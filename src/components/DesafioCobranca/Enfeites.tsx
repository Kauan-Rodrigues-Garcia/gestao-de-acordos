/**
 * Os enfeites de Natal do Desafio Cobrança (16/11/2026).
 *
 * Mesma estética do Natal do Gestão: as cores do pisca-pisca são as dele
 * (vermelho, verde e dourado, `piscaPisca.css`), mais o gelo do desafio; os
 * sincelos são o PRÓPRIO componente do Gestão (`Natal/Sincelos`).
 *
 * Só aparecem nos temas de Natal: cada enfeite tem a classe `dc-so-natal`, e
 * o CSS mostra quando a gaveta (`.dc`) ou a TV (`.dc-tv`) tem `data-natal`. Na TV ficam parados
 * (`parado`): o Modo TV não tem animação contínua.
 */
import type { CSSProperties } from 'react';

/** As cores das lâmpadas: as do pisca-pisca do Gestão + gelo e branco. */
const LUZES = ['#e5484d', '#e9b949', '#2fa36b', '#8be9fd', '#ffffff'];

/**
 * O pisca-pisca: um fio que cai em curvas entre os ganchos, com as lâmpadas
 * penduradas. `largura` e `altura` em px do desenho.
 */
export function PiscaPisca({ largura, altura = 34, luzes = 18, parado = false, className, style }: {
  largura: number; altura?: number; luzes?: number; parado?: boolean; className?: string; style?: CSSProperties;
}) {
  const vaos = Math.max(2, Math.round(luzes / 3));
  const vao = largura / vaos;
  const queda = altura * 0.42;
  // O fio: uma curva por vão, presa no alto de cada gancho.
  let d = `M 0 4`;
  for (let i = 0; i < vaos; i++) {
    const x0 = i * vao;
    d += ` Q ${x0 + vao / 2} ${4 + queda * 2} ${x0 + vao} 4`;
  }
  // Onde fica o fio num x (a mesma curva, para pendurar a lâmpada certinho).
  const yDoFio = (x: number) => {
    const i = Math.min(vaos - 1, Math.floor(x / vao));
    const t = (x - i * vao) / vao;
    return 4 + 2 * t * (1 - t) * queda * 2;
  };
  const passo = largura / luzes;
  return (
    <svg
      className={`dc-pisca ${parado ? 'parado' : ''} ${className ?? ''}`} width={largura} height={altura}
      viewBox={`0 0 ${largura} ${altura}`} aria-hidden style={style}
    >
      <path d={d} fill="none" stroke="#1f3b2c" strokeWidth={1.6} strokeLinecap="round" />
      {Array.from({ length: luzes }, (_, i) => {
        const x = passo / 2 + i * passo;
        const y = yDoFio(x);
        const cor = LUZES[i % LUZES.length];
        const vira = i % 2 ? 12 : -12;
        return (
          <g key={i} transform={`translate(${x} ${y}) rotate(${vira})`}>
            <rect x={-2.6} y={0} width={5.2} height={4} rx={1} fill="#2b4636" />
            <ellipse
              className="dc-luz" cx={0} cy={9.5} rx={4.2} ry={6.2} fill={cor}
              style={{ ['--i' as string]: i, ['--cor' as string]: cor }}
            />
            <ellipse cx={-1.4} cy={7.6} rx={1.1} ry={2} fill="#ffffff" opacity={0.65} />
          </g>
        );
      })}
    </svg>
  );
}

/** Dois montes de neve, como os do Natal do Gestão. */
export function MontesDeNeve({ className, style, altura = 70 }: { className?: string; style?: CSSProperties; altura?: number }) {
  return (
    <svg className={`dc-montes ${className ?? ''}`} viewBox="0 0 600 70" preserveAspectRatio="none" aria-hidden style={{ height: altura, ...style }}>
      <path className="longe" d="M0 38 C 90 10, 180 12, 260 34 S 430 6, 600 30 L 600 70 L 0 70 Z" />
      <path className="perto" d="M0 54 C 120 30, 210 36, 300 52 S 480 30, 600 48 L 600 70 L 0 70 Z" />
    </svg>
  );
}

/** O laço vermelho do presente (canto do ingresso). */
export function Laco({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg className={className} style={style} width="58" height="40" viewBox="0 0 58 40" aria-hidden>
      <path d="M29 20 C 14 2, 2 6, 6 18 C 9 27, 20 26, 29 20 Z" fill="#d93a3f" stroke="#9e1c22" strokeWidth="1.4" />
      <path d="M29 20 C 44 2, 56 6, 52 18 C 49 27, 38 26, 29 20 Z" fill="#d93a3f" stroke="#9e1c22" strokeWidth="1.4" />
      <path d="M27 21 L 20 38 L 25 35 L 28 39 Z" fill="#c42f35" />
      <path d="M31 21 L 38 38 L 33 35 L 30 39 Z" fill="#c42f35" />
      <circle cx="29" cy="20" r="5" fill="#ef5a5f" stroke="#9e1c22" strokeWidth="1.4" />
      <path d="M12 12 C 15 9, 19 9, 22 12" stroke="#ffffff" strokeWidth="1.6" fill="none" opacity="0.55" strokeLinecap="round" />
    </svg>
  );
}

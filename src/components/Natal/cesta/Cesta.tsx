/**
 * Cesta — a cesta de basquete de Natal que aparece enquanto a bola da
 * saudação está solta (Cleber, 05/11/2026). Só desenho: a física mora em
 * `fisica.ts` e roda no laço da `BolaSolta`.
 *
 * São duas camadas no mesmo lugar, para a bola passar POR DENTRO do aro: a
 * tabela e a metade de trás do aro ficam atrás da bola; a rede e a metade da
 * frente, na frente. Nada aqui pega clique (a página continua clicável).
 *
 * O desenho usa o centro do aro como (0, 0): a caixa vai de 80 px para cada
 * lado e de 130 px acima a 85 px abaixo dele.
 */
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { FUNDO_DA_REDE, MEIA_ABERTURA, type Aro } from './fisica';
import './cesta.css';

const CAIXA = { esq: 80, cima: 130, largura: 160, altura: 215 };
const VIEWBOX = `${-CAIXA.esq} ${-CAIXA.cima} ${CAIXA.largura} ${CAIXA.altura}`;
const LUZES = ['#ff5252', '#ffd54f', '#64b5f6', '#81c784', '#ff8a65', '#ffd54f', '#ce93d8'];

/** A guirlanda do alto da tabela: arcos caindo entre os ganchos, uma luz em cada arco. */
const GUIRLANDA = (() => {
  const de = -74, ate = 74, arcos = 7, passo = (ate - de) / arcos, y = -118;
  let d = `M ${de} ${y}`;
  const luzes: { x: number; y: number; cor: string }[] = [];
  for (let i = 0; i < arcos; i++) {
    const x0 = de + i * passo, meio = x0 + passo / 2;
    d += ` Q ${meio} ${y + 13} ${x0 + passo} ${y}`;
    luzes.push({ x: meio, y: y + 7.5, cor: LUZES[i % LUZES.length] });
  }
  return { d, luzes };
})();

/** A rede: quatro fileiras de nós, cada uma mais estreita, ligadas em losango. */
const REDE = (() => {
  const m = MEIA_ABERTURA;
  const fileiras = [{ y: 3, meia: m - 1 }, { y: 22, meia: m * 0.8 }, { y: 41, meia: m * 0.65 }, { y: FUNDO_DA_REDE, meia: m * 0.53 }];
  const nos = fileiras.map(f => Array.from({ length: 9 }, (_, i) => ({ x: -f.meia + (i * 2 * f.meia) / 8, y: f.y })));
  let d = '';
  for (let r = 0; r < nos.length - 1; r++) {
    for (let i = 0; i < 9; i++) {
      const a = nos[r][i];
      for (const j of [i - 1, i + 1]) {
        const b = nos[r + 1][j];
        if (b) d += `M ${a.x.toFixed(1)} ${a.y} L ${b.x.toFixed(1)} ${b.y} `;
      }
    }
  }
  const bolinhas = nos[3].filter((_, i) => i % 2 === 0).map((p, i) => ({ ...p, cor: LUZES[(i * 2 + 1) % LUZES.length] }));
  return { d, bolinhas };
})();

/** Meio aro em elipse: `frente` é a metade de baixo (perto de quem olha). */
const meioAro = (frente: boolean) => `M ${-MEIA_ABERTURA} 0 A ${MEIA_ABERTURA} 7 0 0 ${frente ? 0 : 1} ${MEIA_ABERTURA} 0`;

function Bengala({ frente }: { frente: boolean }) {
  return (
    <g fill="none" strokeLinecap="round">
      <path d={meioAro(frente)} stroke="#8e1414" strokeWidth={6.5} />
      <path d={meioAro(frente)} stroke="#e53935" strokeWidth={5} />
      <path d={meioAro(frente)} stroke="#fff" strokeWidth={5} strokeDasharray="4.5 5.5" strokeLinecap="butt" />
      {/* As pontas do aro, onde a bola bate. */}
      {frente && [-MEIA_ABERTURA, MEIA_ABERTURA].map(x => <circle key={x} cx={x} cy={0} r={3.4} fill="#e53935" stroke="#8e1414" strokeWidth={1} />)}
    </g>
  );
}

interface Props {
  aro: Aro;
  acertos: number;
  /** As cestas do boneco de neve (o segredo da bola), contadas à parte. */
  acertosBoneco: number;
  /** Quem fez a última cesta: o «+1» do boneco é azul de gelo, com ⛄. */
  ultima: 'pessoa' | 'boneco' | null;
  /** A fase da bola: congelou, a cesta mostra o placar final; voltando, ela vai embora. */
  fase: 'solta' | 'congelando' | 'voltando';
}

const cestas = (n: number) => `${n} ${n === 1 ? 'cesta' : 'cestas'}`;

/** O texto do placar: as cestas de quem joga e, se ele jogou, as do boneco. */
function textoDoPlacar(n: number, b: number, final: boolean): string {
  if (final) {
    if (n === 0 && b === 0) return 'Fica pra próxima! 😅';
    if (n === 0) return `O boneco fez ${b}! ⛄`;
    return `${cestas(n)}! 🎉${b > 0 ? ` · ⛄ ${b}` : ''}`;
  }
  if (n === 0 && b === 0) return 'Acerta a cesta! 🏀';
  return `🎄 ${cestas(n)}${b > 0 ? ` · ⛄ ${b}` : ''}`;
}

export function Cesta({ aro, acertos, acertosBoneco, ultima, fase }: Props) {
  const caixa = {
    left: aro.x - CAIXA.esq, top: aro.y - CAIXA.cima, width: CAIXA.largura, height: CAIXA.altura,
  } as const;
  const saindo = fase === 'voltando';
  const final = fase !== 'solta';
  const total = acertos + acertosBoneco;
  const placar = textoDoPlacar(acertos, acertosBoneco, final);

  return createPortal(
    <>
      {/* Atrás da bola: a tabela e a metade de trás do aro. */}
      <svg className={cn('nt-cesta nt-cesta-tras', saindo && 'saindo')} style={caixa} viewBox={VIEWBOX} aria-hidden="true">
        <defs>
          <linearGradient id="nt-cesta-vidro" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="1" stopColor="#e7f1fb" />
          </linearGradient>
        </defs>
        {/* O suporte que liga a tabela ao aro. */}
        <rect x={-6} y={-28} width={12} height={26} rx={2} fill="#9aa3ad" stroke="#6b737c" strokeWidth={1} />
        {/* A tabela, com o quadrado de mira. */}
        <rect x={-70} y={-118} width={140} height={92} rx={8} fill="url(#nt-cesta-vidro)" stroke="#c62828" strokeWidth={4} />
        <rect x={-23} y={-62} width={46} height={34} rx={2} fill="none" stroke="#c62828" strokeWidth={3} />
        {/* Neve em cima da tabela. */}
        <path d="M -71 -116 C -66 -126 -56 -122 -52 -125 C -45 -130 -36 -122 -28 -126 C -18 -131 -10 -123 0 -126 C 10 -130 18 -122 28 -126 C 38 -131 46 -122 54 -125 C 60 -127 68 -124 71 -116 Z" fill="#fff" stroke="#d6e4f0" strokeWidth={1} />
        {/* A guirlanda e as luzes, que piscam. */}
        <path d={GUIRLANDA.d} fill="none" stroke="#1f7a3a" strokeWidth={5} strokeLinecap="round" />
        <path d={GUIRLANDA.d} fill="none" stroke="#2fa85a" strokeWidth={2} strokeDasharray="2 3" strokeLinecap="round" />
        {GUIRLANDA.luzes.map((l, i) => (
          <g key={i} className="nt-cesta-luz" style={{ animationDelay: `${-i * 0.37}s` }}>
            <circle cx={l.x} cy={l.y} r={5.5} fill={l.cor} opacity={0.35} />
            <circle cx={l.x} cy={l.y} r={2.8} fill={l.cor} />
          </g>
        ))}
        {/* O laço no meio. */}
        <g transform="translate(0 -119)">
          <path d="M 0 0 C -6 -9 -16 -7 -14 0 C -12 6 -5 4 0 0 Z" fill="#d32f2f" stroke="#8e1414" strokeWidth={0.8} />
          <path d="M 0 0 C 6 -9 16 -7 14 0 C 12 6 5 4 0 0 Z" fill="#d32f2f" stroke="#8e1414" strokeWidth={0.8} />
          <path d="M -1 1 L -6 12 L -3 11 L -1 14 Z M 1 1 L 6 12 L 3 11 L 1 14 Z" fill="#c62828" />
          <circle r={2.6} fill="#b71c1c" />
        </g>
        <Bengala frente={false} />
      </svg>

      {/* Na frente da bola: a rede e a metade da frente do aro. */}
      <svg className={cn('nt-cesta nt-cesta-frente', saindo && 'saindo')} style={caixa} viewBox={VIEWBOX} aria-hidden="true">
        <g key={total} className={cn('nt-cesta-rede', total > 0 && 'chua')}>
          <path d={REDE.d} fill="none" stroke="#5b6570" strokeWidth={2.4} strokeLinecap="round" opacity={0.35} />
          <path d={REDE.d} fill="none" stroke="#f7f9fb" strokeWidth={1.4} strokeLinecap="round" />
          {REDE.bolinhas.map((b, i) => (
            <g key={i}>
              <circle cx={b.x} cy={b.y + 3} r={2.9} fill={b.cor} stroke="rgba(0,0,0,.25)" strokeWidth={0.6} />
              <circle cx={b.x - 0.9} cy={b.y + 2.1} r={0.8} fill="#fff" opacity={0.8} />
            </g>
          ))}
        </g>
        <Bengala frente />
        {/* Um raminho de azevinho no aro. */}
        <g transform="translate(-24 6) rotate(-12)">
          <path d="M 0 0 C -4 -5 -11 -4 -13 1 C -9 0 -6 3 0 0 Z" fill="#2e7d32" stroke="#1b5e20" strokeWidth={0.6} />
          <path d="M 0 0 C 4 -5 11 -4 13 1 C 9 0 6 3 0 0 Z" fill="#388e3c" stroke="#1b5e20" strokeWidth={0.6} />
          <circle cx={-1.8} cy={-1.5} r={2} fill="#d32f2f" />
          <circle cx={1.8} cy={-1.5} r={2} fill="#e53935" />
          <circle cx={0} cy={1.2} r={2} fill="#c62828" />
        </g>
      </svg>

      {/* O placar, em cima da tabela; pula a cada cesta. */}
      <div
        key={`${acertos}-${acertosBoneco}-${final}`}
        className={cn('nt-cesta-placar', total > 0 && 'pulou', final && 'final', saindo && 'saindo')}
        style={{ left: aro.x, top: aro.y - CAIXA.cima - 8 }}
        role="status"
      >
        {placar}
      </div>
      {total > 0 && !final && (
        <div key={`mais-${total}`} className={cn('nt-cesta-mais', ultima === 'boneco' && 'do-boneco')} style={{ left: aro.x, top: aro.y + 20 }} aria-hidden="true">{ultima === 'boneco' ? '⛄+1' : '+1'}</div>
      )}
    </>,
    document.body,
  );
}

import { useId, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import {
  ALTURA_TREM, CARROS, COMPRIMENTO_TREM, MEIO_DOS_CARROS, RAIO_PASSAGEIRO, TOPO_TREM, VAO_ENTRE_CARROS,
  type IdCarro, type PassageiroDoTrem,
} from './carros';
import './trem.css';

/*
 * O trenzinho de Natal — só o desenho. Quem diz onde ele está é o trilho.
 *
 * Mesma linguagem do boneco de neve (`BonecoDeNeve.tsx`): vetor chapado, sem
 * contorno. Da frente para trás: a locomotiva (sem rosto, pedido do Cleber;
 * na frente vai o farol), o vagão de três passageiros, o vagão da árvore com o
 * biscoito de gengibre que acena e o vagão dos presentes com mais dois
 * passageiros — os cinco sorteados da viagem (`passageiros.ts`).
 *
 * Cada carro é desenhado no seu próprio quadro: x de 0 ao comprimento dele, a
 * frente para a direita, as rodas encostando no trilho em y = `TRILHO_Y`. É
 * assim que a camada do trem (`CamadaDoTrem.tsx`) põe cada carro no seu ponto
 * do trilho, girando com a curva (as medidas estão em `carros.ts`). `Trem`
 * monta os quatro em fila, parado no lugar, para o laboratório.
 *
 * O que mexe é CSS (`trem.css`), menos as rodas e a biela no sistema: lá a
 * camada gira cada roda pela distância andada (`data-raio`), e elas param
 * quando o trem para. `parado` desliga tudo.
 */

const COR = {
  vermelho: '#D6403A',
  vermelhoClaro: '#E8625A',
  vermelhoEscuro: '#A92F35',
  vinho: '#7A2433',
  creme: '#F6F0E7',
  cremeSombra: '#E6D8C2',
  ouro: '#F2B544',
  ouroEscuro: '#D9952B',
  verde: '#3F9A5B',
  verdeEscuro: '#2E7A47',
  azul: '#6BA6E0',
  rosa: '#FF94AA',
  olho: '#2A2530',
  ferro: '#3A2F3B',
  tronco: '#7A5236',
  gengibre: '#C9844A',
  janela: '#FFD98A',
} as const;

function Roda({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  return (
    <g transform={`translate(${cx} ${cy})`}>
      <g className="nt-trem-roda" data-raio={r}>
        <circle r={r} fill={COR.ferro} />
        <circle r={r * 0.74} fill={COR.creme} />
        <circle r={r * 0.56} fill={COR.vermelho} />
        {[0, 60, 120].map(a => (
          <rect key={a} x={-r * 0.56} y={-r * 0.07} width={r * 1.12} height={r * 0.14} fill={COR.creme} transform={`rotate(${a})`} />
        ))}
        <circle r={r * 0.2} fill={COR.ouro} />
      </g>
    </g>
  );
}

/** Caixa de presente com fita em cruz. */
function Presente({ x, y, l, a, cor, fita }: { x: number; y: number; l: number; a: number; cor: string; fita: string }) {
  const meio = x + l / 2;
  const f = Math.max(2.4, l * 0.14);
  return (
    <g>
      <rect x={x} y={y} width={l} height={a} rx={2} fill={cor} />
      <rect x={x} y={y} width={l} height={a * 0.16} rx={2} fill="#FFFFFF" opacity={0.18} />
      <rect x={meio - f / 2} y={y} width={f} height={a} fill={fita} />
      <rect x={x} y={y + a * 0.34} width={l} height={f} fill={fita} />
    </g>
  );
}

/** Laço em cima do presente. */
function Laco({ x, y, t, cor }: { x: number; y: number; t: number; cor: string }) {
  return (
    // O `translate` fica num `<g>` de fora: o `transform` da animação (CSS) apagaria o atributo.
    <g transform={`translate(${x} ${y})`}>
      <g className="nt-trem-laco">
        <ellipse cx={-t * 0.55} cy={-t * 0.3} rx={t * 0.62} ry={t * 0.38} fill={cor} transform={`rotate(-24 ${-t * 0.55} ${-t * 0.3})`} />
        <ellipse cx={t * 0.55} cy={-t * 0.3} rx={t * 0.62} ry={t * 0.38} fill={cor} transform={`rotate(24 ${t * 0.55} ${-t * 0.3})`} />
        <circle cy={-t * 0.08} r={t * 0.26} fill={cor} />
        <circle cx={-t * 0.08} cy={-t * 0.16} r={t * 0.09} fill="#FFFFFF" opacity={0.4} />
      </g>
    </g>
  );
}

const CORES_INICIAIS = ['#3F9A5B', '#6BA6E0', '#D9952B', '#A96BD6', '#E2706A', '#4BA3A3'];

function iniciais(nome: string) {
  return nome.trim().split(/\s+/).slice(0, 2).map(p => p[0] ?? '').join('').toUpperCase() || '?';
}

/**
 * Um passageiro: a foto redonda com aro creme e um gorro de Papai Noel. Entra
 * com um pulinho (o embarque) e balança de leve na viagem. O `data-passageiro`
 * é por onde a camada acha a foto para o cartão do mouse.
 */
function Passageiro({ cx, p, indice }: { cx: number; p: PassageiroDoTrem; indice: number }) {
  const r = RAIO_PASSAGEIRO;
  // Sentado na almofada, em cima do estrado do vagão plano.
  const cy = ESTRADO_Y - r + 3;
  const recorte = useId();
  const cor = CORES_INICIAIS[[...p.id].reduce((h, c) => h + c.charCodeAt(0), 0) % CORES_INICIAIS.length];
  return (
    <g className="nt-trem-passageiro" data-passageiro={indice}>
      <ellipse cx={cx} cy={ESTRADO_Y} rx={r * 0.78} ry={5} fill={COR.vermelhoEscuro} />
      <ellipse cx={cx} cy={ESTRADO_Y - 1.5} rx={r * 0.7} ry={4} fill={COR.creme} />
      <g className="nt-trem-cabeca" style={{ animationDelay: `${-indice * 0.37}s` }}>
        <circle className="nt-trem-foto" cx={cx} cy={cy} r={r + 3} fill={COR.creme} />
        {/* O rosto: com o vagão espelhado (andando para a esquerda), ele é desvirado — foto e letras nunca saem do avesso. */}
        <g className="nt-trem-rosto">
        {p.foto ? (
          <>
            <clipPath id={recorte}><circle cx={cx} cy={cy} r={r} /></clipPath>
            <circle cx={cx} cy={cy} r={r} fill={cor} />
            <image href={p.foto} x={cx - r} y={cy - r} width={r * 2} height={r * 2} clipPath={`url(#${recorte})`} preserveAspectRatio="xMidYMid slice" />
          </>
        ) : (
          <>
            <circle cx={cx} cy={cy} r={r} fill={cor} />
            <text x={cx} y={cy + r * 0.3} textAnchor="middle" fontSize={r * 0.8} fontWeight={700} fill="#FFFFFF" fontFamily="system-ui, sans-serif">{iniciais(p.nome)}</text>
          </>
        )}
        </g>
        {/* o gorro, caído para o lado — achatado: com a foto grande, o de antes ficava alto demais */}
        <g transform={`translate(${cx} ${cy - r * 0.62}) scale(0.95 0.66) translate(${-cx} ${-(cy - r * 0.62)})`}>
        <path d={`M${cx - r * 0.95} ${cy - r * 0.55} Q${cx - r * 0.2} ${cy - r * 2.05} ${cx + r * 1.02} ${cy - r * 1.5} Q${cx + r * 0.55} ${cy - r * 1.08} ${cx + r * 0.95} ${cy - r * 0.55} Z`} fill={COR.vermelho} />
        <path d={`M${cx - r * 0.5} ${cy - r * 1.2} Q${cx - r * 0.1} ${cy - r * 1.75} ${cx + r * 0.62} ${cy - r * 1.62}`} stroke={COR.vermelhoClaro} strokeWidth={r * 0.12} strokeLinecap="round" fill="none" />
        <rect x={cx - r * 1.05} y={cy - r * 0.8} width={r * 2.1} height={r * 0.42} rx={r * 0.21} fill="#FFFFFF" />
        <circle cx={cx + r * 1.06} cy={cy - r * 1.46} r={r * 0.25} fill="#FFFFFF" />
        </g>
      </g>
    </g>
  );
}

/** Vagão aberto: base vermelha, borda creme e a grade na frente da carga. */
function Vagao({ L, carga, balanco }: { L: number; carga: ReactNode; balanco: string }) {
  const pes = Array.from({ length: Math.round(L / 18) + 1 }, (_, i) => 2 + (i * (L - 7)) / Math.round(L / 18));
  return (
    <g className="nt-trem-sacode" style={{ animationDelay: balanco }}>
      {carga}
      {/* grade: o corrimão creme e os pés vermelhos, na frente da carga */}
      {pes.map(px => <rect key={px} x={px} y={50} width={3} height={19} rx={1} fill={COR.vermelhoEscuro} />)}
      <rect x={0} y={48} width={L} height={4.5} rx={2.25} fill={COR.creme} />
      {/* a caixa */}
      <rect x={1} y={80} width={L - 2} height={10} rx={4} fill={COR.vermelhoEscuro} />
      <rect x={0} y={68} width={L} height={17} rx={4} fill={COR.vermelho} />
      <rect x={3} y={70} width={L - 6} height={3} rx={1.5} fill={COR.vermelhoClaro} />
      <rect x={-2} y={65.5} width={L + 4} height={5} rx={2.5} fill={COR.creme} />
      {/* rebites */}
      {[10, L - 10].map(px => <circle key={px} cx={px} cy={77} r={1.6} fill={COR.ouro} />)}
      {/* um floco de neve no meio, em creme */}
      <g transform={`translate(${L / 2} 77)`} stroke={COR.creme} strokeWidth={1.3} strokeLinecap="round">
        {[0, 60, 120].map(a => <line key={a} x1={0} y1={-4.6} x2={0} y2={4.6} transform={`rotate(${a})`} />)}
      </g>
      <rect x={6} y={88} width={L - 12} height={4} rx={2} fill={COR.vinho} />
    </g>
  );
}

/** Os engates: meio de cada lado, para encostar no carro vizinho. */
function Engates({ L, frente = true, tras = true }: { L: number; frente?: boolean; tras?: boolean }) {
  return (
    <>
      {tras && <rect x={-VAO_ENTRE_CARROS / 2 - 1} y={86} width={VAO_ENTRE_CARROS / 2 + 4} height={3.4} rx={1.7} fill={COR.vinho} />}
      {frente && <rect x={L - 3} y={86} width={VAO_ENTRE_CARROS / 2 + 4} height={3.4} rx={1.7} fill={COR.vinho} />}
    </>
  );
}

function Biscoito({ x }: { x: number }) {
  return (
    <g transform={`translate(${x} 0)`}>
      <g className="nt-trem-aceno">
        <path d="M5.5 47 Q10 41 13.5 34.5" stroke={COR.gengibre} strokeWidth={5} strokeLinecap="round" fill="none" />
        <path d="M8 43.6 l2 -1.6 M10.2 40 l2 -1.6" stroke="#FFFFFF" strokeWidth={0.9} strokeLinecap="round" />
      </g>
      <path d="M-5.5 47 Q-9 52 -9 56" stroke={COR.gengibre} strokeWidth={5} strokeLinecap="round" fill="none" />
      <rect x={-7} y={44} width={14} height={20} rx={6} fill={COR.gengibre} />
      <circle cy={50} r={1.3} fill={COR.vermelho} />
      <circle cy={55} r={1.3} fill={COR.verde} />
      <circle cx={0} cy={36} r={9.5} fill={COR.gengibre} />
      <path d="M-7.4 31 Q0 26.5 7.4 31" stroke="#FFFFFF" strokeWidth={1} strokeLinecap="round" fill="none" strokeDasharray="1.6 1.4" />
      <g className="nt-trem-olhos">
        <circle cx={-3.2} cy={35} r={1.35} fill={COR.olho} />
        <circle cx={3.2} cy={35} r={1.35} fill={COR.olho} />
        <circle cx={-2.8} cy={34.5} r={0.45} fill="#FFFFFF" />
        <circle cx={3.6} cy={34.5} r={0.45} fill="#FFFFFF" />
      </g>
      <ellipse cx={-5.6} cy={38.6} rx={1.8} ry={1.1} fill={COR.rosa} opacity={0.75} />
      <ellipse cx={5.6} cy={38.6} rx={1.8} ry={1.1} fill={COR.rosa} opacity={0.75} />
      <path d="M-2.4 39.2 Q0 41.4 2.4 39.2" stroke="#FFFFFF" strokeWidth={0.9} strokeLinecap="round" fill="none" />
    </g>
  );
}

function VagaoArvore() {
  const L = 76;
  return (
    <>
      <Engates L={L} />
      <Vagao L={L} balanco="-0.2s" carga={
        <g>
          <Presente x={53} y={50} l={19} a={18} cor={COR.ouro} fita={COR.vermelho} />
          <Laco x={62.5} y={50} t={6} cor={COR.vermelho} />
          <rect x={34} y={56} width={8} height={12} rx={1.5} fill={COR.tronco} />
          <path d="M16 62 L38 30 L60 62 Q38 67 16 62 Z" fill={COR.verdeEscuro} />
          <path d="M18 60 L38 31 L58 60 Q38 64.5 18 60 Z" fill={COR.verde} />
          <path d="M22 45 L38 17 L54 45 Q38 49.5 22 45 Z" fill={COR.verdeEscuro} />
          <path d="M24 43.5 L38 18 L52 43.5 Q38 47.5 24 43.5 Z" fill={COR.verde} />
          <path d="M28 29 L38 8 L48 29 Q38 32 28 29 Z" fill={COR.verde} />
          {/* neve nas pontas dos galhos */}
          <path d="M18 60 Q21 57.5 24 59.4 Q27 57.6 29.5 60.6 Q24 61.6 18 60 Z" fill="#FFFFFF" />
          <path d="M52 59.8 Q54.5 57.4 58 60 Q54.5 61.4 52 59.8 Z" fill="#FFFFFF" />
          <path d="M24 43.5 Q27 41 30 43 Q28 45 24 43.5 Z" fill="#FFFFFF" />
          <path d="M47.5 43.2 Q50 41 52 43.5 Q49.5 44.6 47.5 43.2 Z" fill="#FFFFFF" />
          {/* luzinhas */}
          {([
            [30, 56, COR.vermelho, 0], [42, 53, COR.ouro, 0.4], [50, 58, COR.azul, 0.8],
            [33, 40, COR.azul, 1.2], [44, 38, COR.vermelho, 0.2], [38, 26, COR.ouro, 0.6],
            [26, 50, COR.ouro, 1], [48, 48, COR.rosa, 1.4],
          ] as const).map(([cx, cy, cor, atraso]) => (
            <circle key={`${cx}-${cy}`} className="nt-trem-luz" cx={cx} cy={cy} r={2.1} fill={cor} style={{ animationDelay: `${atraso}s` }} />
          ))}
          <path className="nt-trem-estrela"
            d="M38 0.5 L40.1 5.3 L45.3 5.8 L41.4 9.2 L42.6 14.3 L38 11.6 L33.4 14.3 L34.6 9.2 L30.7 5.8 L35.9 5.3 Z"
            fill={COR.ouro} />
          <Biscoito x={11} />
        </g>
      } />
      <Roda cx={16} cy={96} r={8} />
      <Roda cx={60} cy={96} r={8} />
    </>
  );
}

/** Onde fica o estrado dos vagões planos (o tampo, onde os passageiros sentam). */
const ESTRADO_Y = 77;

/**
 * Vagão plano: só o estrado, sem grade nem paredes — os passageiros vão
 * sentados em cima, e as fotos aparecem inteiras.
 */
function VagaoPlano({ L, carga, balanco }: { L: number; carga: ReactNode; balanco: string }) {
  return (
    <g className="nt-trem-sacode" style={{ animationDelay: balanco }}>
      <rect x={1} y={84} width={L - 2} height={7} rx={3.5} fill={COR.vermelhoEscuro} />
      <rect x={0} y={ESTRADO_Y + 2} width={L} height={8} rx={2.5} fill={COR.vermelho} />
      <rect x={-2} y={ESTRADO_Y - 1} width={L + 4} height={4.5} rx={2.25} fill={COR.creme} />
      {Array.from({ length: Math.floor((L - 12) / 26) + 1 }, (_, i) => (
        <circle key={i} cx={6 + i * 26} cy={ESTRADO_Y + 6} r={1.4} fill={COR.ouro} />
      ))}
      <rect x={8} y={88} width={L - 16} height={4} rx={2} fill={COR.vinho} />
      {carga}
    </g>
  );
}

function VagaoPassageiros({ passageiros, base }: { passageiros: (PassageiroDoTrem | null)[]; base: number }) {
  const L = 262;
  return (
    <>
      <Engates L={L} />
      <VagaoPlano L={L} balanco="-0.32s" carga={
        <g>
          {[47, 133, 219].map((cx, i) => passageiros[i] && (
            <Passageiro key={passageiros[i]!.id} cx={cx} p={passageiros[i]!} indice={base + i} />
          ))}
        </g>
      } />
      <Roda cx={26} cy={96} r={8} />
      <Roda cx={236} cy={96} r={8} />
    </>
  );
}

function VagaoPresentes({ passageiros, base }: { passageiros: (PassageiroDoTrem | null)[]; base: number }) {
  const L = 216;
  return (
    <>
      <Engates L={L} tras={false} />
      <VagaoPlano L={L} balanco="-0.4s" carga={
        <g>
          <Presente x={6} y={ESTRADO_Y - 32} l={30} a={32} cor={COR.verde} fita={COR.vermelho} />
          <Laco x={21} y={ESTRADO_Y - 32} t={8} cor={COR.vermelho} />
          <rect x={30} y={ESTRADO_Y - 14} width={14} height={14} rx={2} fill={COR.rosa} />
          {[[33.5, ESTRADO_Y - 10], [40, ESTRADO_Y - 6.5], [35, ESTRADO_Y - 3]].map(([cx, cy]) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={1.2} fill="#FFFFFF" opacity={0.85} />)}
          {[89, 175].map((cx, i) => passageiros[i] && (
            <Passageiro key={passageiros[i]!.id} cx={cx} p={passageiros[i]!} indice={base + i} />
          ))}
        </g>
      } />
      <Roda cx={26} cy={96} r={8} />
      <Roda cx={190} cy={96} r={8} />
    </>
  );
}

/** A locomotiva, no quadro de 0 a 120 (o desenho original ia de 190 a 310). */
function Locomotiva() {
  return (
    <>
      {/* fumaça, atrás de tudo */}
      <g className="nt-trem-fumaca">
        {/* A cor vem do `trem.css`: no tema claro o branco sumia no fundo. */}
        {[0, 1, 2].map(i => <circle key={i} cx={71} cy={22} r={5} style={{ animationDelay: `${-i * 0.6}s` }} />)}
      </g>
      <Engates L={120} frente={false} />
      <g transform="translate(-190 0)">
        <g className="nt-trem-sacode" style={{ animationDelay: '-0.12s' }}>
          {/* chassi */}
          <rect x={196} y={84} width={100} height={8} rx={3} fill={COR.vinho} />
          {/* limpa-trilhos */}
          <path d="M286 86 H292 L310 102 H288 Z" fill={COR.vermelhoEscuro} />
          <path d="M292 89.5 L300 97 M289 92 L294.5 100" stroke={COR.creme} strokeWidth={1.6} strokeLinecap="round" />
          {/* caldeira */}
          <rect x={230} y={55} width={56} height={31} rx={6} fill={COR.vermelho} />
          <rect x={233} y={58} width={50} height={4} rx={2} fill={COR.vermelhoClaro} />
          <rect x={246} y={55} width={4} height={31} fill={COR.creme} />
          <rect x={268} y={55} width={4} height={31} fill={COR.creme} />
          {/* domo dourado */}
          <path d="M236 55.5 A6.5 6.5 0 0 1 249 55.5 Z" fill={COR.ouro} />
          <circle cx={240.4} cy={51.6} r={1.2} fill="#FFFFFF" opacity={0.5} />
          {/* chaminé */}
          <rect x={255} y={38} width={11} height={18} fill={COR.vinho} />
          <path d="M249.5 30 H271.5 L267.5 40 H253.5 Z" fill={COR.vinho} />
          <rect x={248.5} y={27.5} width={24} height={4.5} rx={2.25} fill={COR.creme} />
          <path d="M249.5 28.5 Q254 24.6 258 27.4 Q262 24.4 266 27.2 Q270 25 272 28.5 Z" fill="#FFFFFF" />
          {/* cabine */}
          <rect x={198} y={40} width={38} height={46} rx={6} fill={COR.vermelho} />
          <rect x={198} y={77} width={38} height={9} fill={COR.vermelhoEscuro} />
          <rect x={206} y={48} width={22} height={17} rx={5} fill={COR.creme} />
          <rect x={209} y={51} width={16} height={11} rx={3.5} fill={COR.janela} />
          <path d="M211 59.5 L216.5 53" stroke="#FFFFFF" strokeWidth={1.4} strokeLinecap="round" opacity={0.7} />
          {/* guirlanda na porta da cabine */}
          <circle cx={217} cy={73} r={4.6} fill="none" stroke={COR.verde} strokeWidth={2.8} />
          <circle cx={214} cy={70} r={0.9} fill={COR.vermelho} />
          <circle cx={220.5} cy={74.5} r={0.9} fill={COR.vermelho} />
          <path d="M215.2 77.6 L217 76 L218.8 77.6 M217 76 l-2.2 3.4 M217 76 l2.2 3.4" stroke={COR.vermelho} strokeWidth={1.3} strokeLinecap="round" fill="none" />
          {/* teto com neve */}
          <rect x={193} y={33} width={48} height={9} rx={4.5} fill={COR.creme} />
          <rect x={193} y={38.5} width={48} height={3.5} rx={1.75} fill={COR.cremeSombra} />
          <path d="M194 35.6 Q197 30 203 32.4 Q207 27.8 213 31 Q218 27.4 224 30.8 Q230 28 234 32 Q239.5 31.2 240 35.6 Z" fill="#FFFFFF" />
          {/* a frente, de perfil como o resto: a caixa de fumaça, um pouco mais
              larga que a caldeira, e a porta dela vista de lado */}
          <rect x={272} y={52.5} width={20} height={34} rx={6} fill={COR.vermelhoEscuro} />
          <rect x={274} y={55} width={16} height={3.5} rx={1.75} fill={COR.vermelho} />
          <rect x={289} y={54} width={6} height={31} rx={3} fill={COR.vinho} />
          <rect x={290.4} y={57} width={2.2} height={25} rx={1.1} fill={COR.creme} opacity={0.55} />
          {[59, 70, 81].map(cy => <circle key={cy} cx={276.5} cy={cy} r={0.9} fill={COR.creme} />)}
          {/* azevinho na lateral da caixa de fumaça */}
          <ellipse cx={281} cy={70} rx={4} ry={1.8} fill={COR.verde} transform="rotate(-28 281 70)" />
          <ellipse cx={287} cy={70} rx={4} ry={1.8} fill={COR.verde} transform="rotate(28 287 70)" />
          <circle cx={282.8} cy={71.6} r={1.5} fill={COR.vermelho} />
          <circle cx={285.4} cy={71.6} r={1.5} fill={COR.vermelho} />
          <circle cx={284.1} cy={69.5} r={1.5} fill={COR.vermelho} />
          {/* o farol, em cima da frente, olhando para onde o trem vai */}
          <path className="nt-trem-facho" d="M296 44.5 L322 36 L322 60 L296 51.5 Z" fill={COR.janela} />
          <rect x={281} y={49} width={10} height={4} rx={1} fill={COR.vinho} />
          <rect x={279} y={41} width={15} height={10} rx={2.5} fill={COR.ouro} />
          <rect x={279} y={41} width={15} height={2.6} rx={1.3} fill={COR.ouroEscuro} />
          <ellipse className="nt-trem-farol" cx={294} cy={46.2} rx={2.4} ry={4.2} fill={COR.janela} />
          <ellipse cx={293.6} cy={44.6} rx={0.8} ry={1.3} fill="#FFFFFF" opacity={0.85} />
        </g>
        <Roda cx={216} cy={91} r={13} />
        <Roda cx={256} cy={96} r={8} />
        <Roda cx={278} cy={96} r={8} />
        {/* biela: liga a roda grande às da frente */}
        <rect className="nt-trem-biela" x={216} y={90} width={40} height={2.6} rx={1.3} fill={COR.cremeSombra} />
      </g>
    </>
  );
}

/** Um carro, no quadro dele. `passageiros` são os cinco da viagem (vazio = assento sem ninguém ainda). */
export function CarroDoTrem({ id, passageiros }: { id: IdCarro; passageiros: (PassageiroDoTrem | null)[] }) {
  if (id === 'locomotiva') return <Locomotiva />;
  if (id === 'arvore') return <VagaoArvore />;
  if (id === 'passageiros') return <VagaoPassageiros passageiros={passageiros.slice(0, 3)} base={0} />;
  return <VagaoPresentes passageiros={passageiros.slice(3, 5)} base={3} />;
}

/** O trem inteiro em fila, parado no lugar — para o laboratório. */
export function Trem({ largura = 300, virado = false, parado = false, passageiros = [], className }: {
  /** Largura na tela, em px; a altura segue a proporção do desenho. */
  largura?: number;
  /** Andando para a esquerda. */
  virado?: boolean;
  parado?: boolean;
  passageiros?: (PassageiroDoTrem | null)[];
  className?: string;
}) {
  const W = COMPRIMENTO_TREM;
  return (
    <svg
      viewBox={`0 ${TOPO_TREM} ${W} ${ALTURA_TREM}`}
      width={largura}
      height={(largura * ALTURA_TREM) / W}
      className={cn('nt-trem', parado && 'nt-trem-parado', className)}
      aria-hidden="true"
      overflow="visible"
    >
      <g transform={virado ? `translate(${W} 0) scale(-1 1)` : undefined}>
        {CARROS.map((c, i) => (
          <g key={c.id} transform={`translate(${W / 2 + MEIO_DOS_CARROS[i] - c.comprimento / 2} 0)`}>
            <CarroDoTrem id={c.id} passageiros={passageiros} />
          </g>
        ))}
      </g>
    </svg>
  );
}

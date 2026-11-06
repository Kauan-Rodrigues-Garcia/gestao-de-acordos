import { useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { useModoLeve } from '@/lib/modoLeve';
import './chale.css';

/**
 * O chalé de Natal no alto da aba Acordos (Cleber, 05/11/2026): «um ambiente
 * aconchegante, como se fosse a parte de dentro de um chalé» — no centro a
 * lareira com o fogo aceso, a chaminé subindo até a barra de cima, e a linha
 * das abas (no Nosso produto) ou o pé do cabeçalho (na regra Cofen) como o
 * chão. Em volta: a janela com neve caindo, a poltrona de balanço, o gato
 * dormindo no tapete, a árvore e os presentes.
 *
 * Mora na camada do Natal (`CamadaNatal`, no alto do `<main>`, rola junto) e
 * mede a página: o cabeçalho (`data-natal-cabecalho`) diz o vão livre entre o
 * título (e as abas) e os botões; o chão (`data-natal-chao`) diz a altura.
 * Cabe inteiro, aparece inteiro; não cabe, fica só a lareira; nem ela, some.
 * Nada aqui pega clique, só a lareira (o mouse em cima atiça o fogo).
 *
 * Desenho num quadro de `L` × `A` com o chão em `A`; a escala é a da altura.
 */
const L = 600;
const A = 176;
/** O recorte de só a lareira (com as velas e as meias), para telas estreitas. */
const SO_LAREIRA = { x: 196, w: 208 };
/** Folga até o título e até os botões. */
const FOLGA = 28;

/** `topo`: quanto (no quadro) sobra acima do desenho até a barra de cima — a chaminé e a parede sobem até lá. */
interface Lugar { x: number; altura: number; escala: number; compacto: boolean; topo: number }

function medir(el: HTMLElement): Lugar | null {
  const main = el.closest('main');
  const cab = main?.querySelector<HTMLElement>('[data-natal-cabecalho]');
  const chao = main?.querySelector<HTMLElement>('[data-natal-chao]');
  if (!main || !cab || !chao) return null;
  const m = main.getBoundingClientRect();
  const visiveis = (e: Element) => Array.from(e.children).map(f => f.getBoundingClientRect()).filter(r => r.width > 0);
  const partes = Array.from(cab.children).filter(f => f.getBoundingClientRect().width > 0);
  const titulo = partes[0]?.getBoundingClientRect();
  const botoes = partes.length > 1 ? visiveis(partes[partes.length - 1]) : [];
  // À esquerda: o fim do título e, se o chão é a fileira das abas, o fim da última aba.
  const esq = Math.max(titulo?.right ?? m.left, chao === cab ? m.left : Math.max(m.left, ...visiveis(chao).map(r => r.right)));
  const dir = botoes.length ? Math.min(...botoes.map(r => r.left)) : m.right;
  const a = esq + FOLGA, b = dir - FOLGA;
  const altura = chao.getBoundingClientRect().bottom - m.top + main.scrollTop;
  if (altura < 40 || b <= a) return null;
  const meio = (a + b) / 2 - m.left;
  // A escala é a da altura; sem largura para tanto, encolhe até 70% dela (a chaminé estica até o alto).
  const pelaAltura = altura / A;
  const cabe = (w: number) => Math.min(pelaAltura, (b - a) / w);
  for (const [w, compacto] of [[L, false], [SO_LAREIRA.w, true]] as const) {
    const escala = cabe(w);
    if (escala >= pelaAltura * 0.7) return { x: meio - (w * escala) / 2, altura, escala, compacto, topo: altura / escala - A };
  }
  return null;
}

export function Chale() {
  const raiz = useRef<HTMLDivElement>(null);
  const [lugar, setLugar] = useState<Lugar | null>(null);
  const leve = useModoLeve();

  useLayoutEffect(() => {
    const el = raiz.current;
    if (!el) return;
    const atualizar = () => {
      const l = medir(el);
      setLugar(v => (JSON.stringify(v) === JSON.stringify(l) ? v : l));
    };
    atualizar();
    // O cabeçalho muda sem mudar de tamanho («Carregando…», botões que aparecem): remede de vez em quando.
    const id = window.setInterval(atualizar, 1200);
    const main = el.closest('main');
    const ro = new ResizeObserver(atualizar);
    if (main) ro.observe(main);
    window.addEventListener('resize', atualizar);
    return () => { window.clearInterval(id); ro.disconnect(); window.removeEventListener('resize', atualizar); };
  }, []);

  const t = lugar?.topo ?? 0;
  const vb = lugar?.compacto ? `${SO_LAREIRA.x} ${-t} ${SO_LAREIRA.w} ${A + t}` : `0 ${-t} ${L} ${A + t}`;
  const largura = lugar ? (lugar.compacto ? SO_LAREIRA.w : L) * lugar.escala : 0;

  return (
    <div ref={raiz} className={cn('nt-chale', leve && 'leve')} aria-hidden="true"
      style={lugar ? { left: lugar.x, width: largura, height: lugar.altura } : { width: 0, height: 0 }}>
      {lugar && (
        <svg viewBox={vb} width={largura} height={lugar.altura} preserveAspectRatio="xMidYMax meet">
          <Defs />
          {!lugar.compacto && <Parede topo={t} />}
          {!lugar.compacto && <Janela />}
          <Tapete />
          {!lugar.compacto && <Poltrona />}
          {!lugar.compacto && <Gato />}
          <Lareira topo={t} />
          {!lugar.compacto && <Presentes />}
          {!lugar.compacto && <Arvore />}
          {!lugar.compacto && <Pendurados topo={t} />}
        </svg>
      )}
    </div>
  );
}

function Defs() {
  return (
    <defs>
      <linearGradient id="nt-ch-noite" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#132A47" />
        <stop offset="1" stopColor="#2F5C88" />
      </linearGradient>
      <radialGradient id="nt-ch-calor" cx="0.5" cy="0.6" r="0.5">
        <stop offset="0" stopColor="#FFB347" stopOpacity="0.9" />
        <stop offset="1" stopColor="#FF7A1A" stopOpacity="0" />
      </radialGradient>
      <linearGradient id="nt-ch-boca" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#140A06" />
        <stop offset="1" stopColor="#3A1C10" />
      </linearGradient>
      {/* Os tijolos da lareira e da chaminé. */}
      <pattern id="nt-ch-tijolo" width={24} height={12} patternUnits="userSpaceOnUse">
        <rect width={24} height={12} fill="#7E3A28" />
        <rect x={0.7} y={0.7} width={22.6} height={4.9} rx={1} fill="#BE6347" />
        <rect x={-11.3} y={6.7} width={22.6} height={4.9} rx={1} fill="#B3573E" />
        <rect x={12.7} y={6.7} width={22.6} height={4.9} rx={1} fill="#C56A4E" />
      </pattern>
      {/* A parede some nas pontas e no alto: não tem borda dura. */}
      <linearGradient id="nt-ch-some-lados" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#fff" stopOpacity="0" />
        <stop offset="0.12" stopColor="#fff" stopOpacity="1" />
        <stop offset="0.88" stopColor="#fff" stopOpacity="1" />
        <stop offset="1" stopColor="#fff" stopOpacity="0" />
      </linearGradient>
      <mask id="nt-ch-mascara">
        <rect y={-200} width={L} height={A + 200} fill="url(#nt-ch-some-lados)" />
      </mask>
      <clipPath id="nt-ch-vidro"><rect x={76} y={30} width={84} height={64} rx={3} /></clipPath>
      <clipPath id="nt-ch-fogueira"><path d="M246 172 V120 Q246 100 300 100 Q354 100 354 120 V172 Z" /></clipPath>
    </defs>
  );
}

/** A parede de tábuas e o assoalho. */
function Parede({ topo }: { topo: number }) {
  return (
    <g mask="url(#nt-ch-mascara)">
      <rect className="nt-ch-parede" x={0} y={-topo} width={L} height={A + topo} />
      {Array.from({ length: 19 }, (_, i) => (
        <line key={i} className="nt-ch-tabua" x1={16 + i * 32} y1={-topo} x2={16 + i * 32} y2={A - 8} />
      ))}
      {/* os nós da madeira */}
      {[[40, 44], [136, 120], [420, 36], [560, 110], [200, 150], [480, 140]].map(([x, y]) => (
        <ellipse key={`${x}-${y}`} className="nt-ch-no" cx={x} cy={y} rx={3} ry={1.6} />
      ))}
      <rect className="nt-ch-rodape" x={0} y={A - 10} width={L} height={10} />
    </g>
  );
}

/** A janela, de noite, com a neve caindo lá fora. */
function Janela() {
  return (
    <g>
      {/* as cortinas, atrás da moldura */}
      <path d="M62 22 Q74 60 64 106 L54 106 Q60 60 50 22 Z" fill="#B23A35" />
      <path d="M174 22 Q162 60 172 106 L182 106 Q176 60 186 22 Z" fill="#B23A35" />
      <rect x={48} y={18} width={140} height={5} rx={2.5} fill="#6B472E" />
      <rect x={70} y={24} width={96} height={76} rx={6} fill="#8A5E3F" />
      <rect x={76} y={30} width={84} height={64} rx={3} fill="url(#nt-ch-noite)" />
      <g clipPath="url(#nt-ch-vidro)">
        <circle cx={142} cy={44} r={7} fill="#FFF3C4" />
        <circle cx={145} cy={42} r={6} fill="url(#nt-ch-noite)" />
        {[[90, 40], [118, 36], [104, 52], [150, 60]].map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r={0.9} fill="#FFFFFF" opacity={0.8} />)}
        {/* os morros de neve e um pinheirinho */}
        <path d="M76 94 V80 Q100 70 120 80 Q140 72 160 78 V94 Z" fill="#E8F2FA" />
        <path d="M96 78 L102 66 L108 78 Z" fill="#2E6B4A" />
        <rect x={101} y={78} width={2} height={3} fill="#5E3D26" />
        {/* a neve caindo */}
        {Array.from({ length: 10 }, (_, i) => (
          <circle key={i} className="nt-ch-floco" cx={80 + ((i * 37) % 78)} cy={24} r={1 + (i % 3) * 0.4}
            style={{ animationDelay: `${-i * 0.55}s`, animationDuration: `${4 + (i % 4) * 0.7}s` }} />
        ))}
      </g>
      <rect x={116.5} y={30} width={3} height={64} fill="#8A5E3F" />
      <rect x={76} y={60.5} width={84} height={3} fill="#8A5E3F" />
      {/* o parapeito, com neve e uma guirlandinha */}
      <rect x={64} y={98} width={108} height={7} rx={2} fill="#6B472E" />
      <path d="M66 98 Q80 93 94 96 Q110 92 126 96 Q142 92 158 96 Q166 94 170 98 Z" fill="#FFFFFF" />
      <circle cx={118} cy={22} r={9} fill="none" stroke="#2E7A47" strokeWidth={4} />
      <path d="M114 29 L118 25 L122 29" stroke="#D6403A" strokeWidth={2.4} strokeLinecap="round" fill="none" />
    </g>
  );
}

/** O tapete na frente da lareira, e o reflexo do fogo nele. */
function Tapete() {
  return (
    <g>
      <ellipse cx={300} cy={A - 3} rx={124} ry={5.5} fill="#A92F35" />
      <ellipse cx={300} cy={A - 3} rx={112} ry={3.8} fill="none" stroke="#F2B544" strokeWidth={1.2} strokeDasharray="4 3" />
      <ellipse className="nt-ch-reflexo" cx={300} cy={A - 3} rx={96} ry={5} fill="#FFB347" />
    </g>
  );
}

/** A poltrona de balanço, com a manta xadrez e a almofada. Balança devagar. */
function Poltrona() {
  return (
    <g className="nt-ch-poltrona">
      {/* os balanços */}
      <path d="M58 170 Q120 186 190 164" stroke="#5E3D26" strokeWidth={5} strokeLinecap="round" fill="none" />
      <path d="M84 134 L80 172 M166 134 L172 168" stroke="#6B472E" strokeWidth={4.5} strokeLinecap="round" />
      {/* o encosto */}
      <path d="M86 126 L80 58 M164 126 L170 58" stroke="#6B472E" strokeWidth={6} strokeLinecap="round" />
      <path d="M78 60 Q125 42 172 60" stroke="#7A5236" strokeWidth={7} strokeLinecap="round" fill="none" />
      {[102, 116, 130, 144].map((x, i) => (
        <path key={x} d={`M${x + (i - 1.5) * 0.8} 120 L${x + (i - 1.5) * 2.4} 62`} stroke="#8A5E3F" strokeWidth={3.6} strokeLinecap="round" />
      ))}
      {/* a almofada e o assento */}
      <rect x={72} y={124} width={106} height={12} rx={4} fill="#8A5E3F" />
      <rect x={78} y={114} width={94} height={13} rx={6.5} fill="#C8382F" />
      <path d="M86 120 H164" stroke="#E8635A" strokeWidth={1.4} strokeDasharray="3 4" />
      {/* os braços */}
      <rect x={66} y={98} width={26} height={6} rx={3} fill="#7A5236" />
      <rect x={158} y={98} width={26} height={6} rx={3} fill="#7A5236" />
      {/* a manta xadrez caindo do encosto */}
      <path d="M134 56 Q160 52 172 60 L178 112 Q160 120 146 110 Z" fill="#2E7A47" />
      <path d="M140 58 L150 112 M154 55 L163 116 M168 58 L174 112" stroke="#D6403A" strokeWidth={2.2} />
      <path d="M137 72 Q156 68 173 74 M140 90 Q158 86 176 92" stroke="#F2B544" strokeWidth={1.4} fill="none" />
      <path d="M146 110 Q160 120 178 112 L176 118 Q160 126 146 116 Z" fill="#245F38" />
    </g>
  );
}

/** O gato dormindo no tapete, enrolado; o rabo mexe de vez em quando. */
function Gato() {
  return (
    <g transform={`translate(204 ${A - 6})`}>
      <ellipse className="nt-ch-gato-respira" cx={0} cy={-7} rx={19} ry={8.5} fill="#8D8FA0" />
      <path className="nt-ch-gato-rabo" d="M16 -4 Q28 -2 24 -12 Q22 -16 18 -14" stroke="#7A7C8E" strokeWidth={4.2} strokeLinecap="round" fill="none" />
      <circle cx={-14} cy={-9} r={7.4} fill="#9B9DAE" />
      <path d="M-20 -13 L-21 -21 L-15 -16 Z M-12 -16 L-8 -22 L-7 -14 Z" fill="#9B9DAE" />
      <path d="M-19.5 -14.5 L-20 -18.5 L-17 -16 Z" fill="#F3C4CF" />
      <path d="M-19 -9 Q-17 -7.5 -15 -9 M-12.5 -9.5 Q-10.5 -8 -8.5 -9.5" stroke="#3A3A48" strokeWidth={1} strokeLinecap="round" fill="none" />
      <circle cx={-13.6} cy={-6} r={0.9} fill="#E58FA3" />
      <path d="M-2 -14 Q4 -16 10 -13" stroke="#A9ABBB" strokeWidth={1.4} fill="none" strokeLinecap="round" />
      {/* um «z» de quem dorme */}
      <text className="nt-ch-zzz" x={-6} y={-22}>z</text>
    </g>
  );
}

/** A lareira: chaminé até o alto, cornija com guirlanda, velas e meias, o fogo e as brasas. */
function Lareira({ topo }: { topo: number }) {
  return (
    <g className="nt-ch-lareira">
      {/* a chaminé, subindo até a barra de cima */}
      <rect x={250} y={-topo} width={100} height={52 + topo} fill="url(#nt-ch-tijolo)" />
      <rect x={250} y={-topo} width={10} height={52 + topo} fill="#000" opacity={0.18} />
      <rect x={340} y={-topo} width={10} height={52 + topo} fill="#000" opacity={0.22} />
      {/* a guirlanda na chaminé */}
      <circle cx={300} cy={27} r={13} fill="none" stroke="#2E7A47" strokeWidth={6.5} />
      <circle cx={300} cy={27} r={13} fill="none" stroke="#3F9A5B" strokeWidth={2.4} strokeDasharray="2 4" />
      {[[289, 20], [311, 22], [296, 39], [309, 35]].map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r={1.8} fill="#D6403A" />)}
      <path d="M294 15 C288 8 284 14 290 16 Z M306 15 C312 8 316 14 310 16 Z" fill="#D6403A" />
      <path d="M298 16 L294 24 M302 16 L306 24" stroke="#C62828" strokeWidth={2.2} strokeLinecap="round" />
      <circle cx={300} cy={15.5} r={2.2} fill="#A92F35" />

      {/* a cornija, com as velas e a guirlanda de luzinhas */}
      <rect x={202} y={50} width={196} height={11} rx={2.5} fill="#6B472E" />
      <rect x={202} y={50} width={196} height={3} rx={1.5} fill="#8A5E3F" />
      {[212, 388].map(x => (
        <g key={x}>
          <rect x={x - 4} y={32} width={8} height={18} rx={1.5} fill="#F6F0E7" />
          <rect x={x - 4} y={32} width={2.4} height={18} fill="#FFFFFF" opacity={0.7} />
          <circle className="nt-ch-vela-brilho" cx={x} cy={27} r={7} fill="#FFD98A" />
          <path className="nt-ch-vela" d={`M${x} 22 C${x + 3} 26 ${x + 2.4} 31 ${x} 31 C${x - 2.4} 31 ${x - 3} 26 ${x} 22 Z`} fill="#FFB347" />
        </g>
      ))}
      <path d="M204 62 Q217 70 230 62 Q243 70 256 62 Q269 70 282 62 Q295 70 308 62 Q321 70 334 62 Q347 70 360 62 Q373 70 386 62 Q392 66 396 62"
        stroke="#2E7A47" strokeWidth={5} strokeLinecap="round" fill="none" />
      {[217, 243, 269, 295, 321, 347, 373].map((x, i) => (
        <circle key={x} className="nt-ch-luz" cx={x} cy={67} r={2.3} fill={['#FF3B3B', '#FFC531', '#3AA0FF', '#2FD16B'][i % 4]}
          style={{ animationDelay: `${-i * 0.37}s` }} />
      ))}

      {/* o corpo de tijolos e a boca */}
      <rect x={220} y={61} width={160} height={A - 66} fill="url(#nt-ch-tijolo)" />
      <rect x={220} y={61} width={12} height={A - 66} fill="#000" opacity={0.16} />
      <rect x={368} y={61} width={12} height={A - 66} fill="#000" opacity={0.2} />
      <path d="M240 172 V118 Q240 94 300 94 Q360 94 360 118 V172 Z" fill="#CFC6BB" />
      <path d="M246 172 V120 Q246 100 300 100 Q354 100 354 120 V172 Z" fill="url(#nt-ch-boca)" />

      {/* o fogo: o calor atrás, a lenha, três camadas de chama e as brasas subindo */}
      <g className="nt-ch-fogo">
        <g clipPath="url(#nt-ch-fogueira)">
          <circle className="nt-ch-calor" cx={300} cy={150} r={48} fill="url(#nt-ch-calor)" />
          <g className="nt-ch-chamas">
            <path className="nt-ch-chama c1" d="M272 166 C266 148 280 140 278 122 C290 132 290 114 300 102 C305 118 318 122 313 138 C324 132 328 148 326 166 Z" fill="#FF6A1A" />
            <path className="nt-ch-chama c2" d="M282 166 C278 150 290 144 289 130 C298 138 298 124 304 116 C307 130 317 135 313 148 C320 146 320 158 318 166 Z" fill="#FFA51F" />
            <path className="nt-ch-chama c3" d="M291 166 C289 156 296 151 296 142 C300 148 302 140 306 134 C309 146 313 153 309 166 Z" fill="#FFE07A" />
          </g>
          {Array.from({ length: 6 }, (_, i) => (
            <circle key={i} className="nt-ch-brasa" cx={288 + ((i * 7) % 26)} cy={150} r={1.2 + (i % 2) * 0.5}
              style={{ animationDelay: `${-i * 0.45}s`, animationDuration: `${2.2 + (i % 3) * 0.5}s` }} />
          ))}
        </g>
        {/* a lenha */}
        <rect x={268} y={160} width={64} height={9} rx={4.5} fill="#6B3F24" transform="rotate(-8 300 164)" />
        <rect x={268} y={160} width={64} height={9} rx={4.5} fill="#7E4B2B" transform="rotate(9 300 164)" />
        <circle cx={270} cy={168} r={3.6} fill="#C99A6B" />
        <circle cx={331} cy={168} r={3.6} fill="#C99A6B" />
        <ellipse className="nt-ch-brasas-chao" cx={300} cy={170} rx={30} ry={2.6} fill="#FF7A1A" />
      </g>

      {/* as meias penduradas na cornija */}
      {([[236, '#D6403A'], [300, '#3F9A5B'], [364, '#D6403A']] as const).map(([x, cor], i) => (
        <g key={x} transform={`translate(${x - 8} 61)`}>
          <path d="M8 0 V5" stroke="#3A2F3B" strokeWidth={1.2} />
          <path d="M2 10 H14 V26 Q14 32 8 32 H-5 Q-10 32 -10 27 Q-10 22 -3 22 H2 Z" fill={cor} />
          <path d="M-8 26 Q-4 24 0 26" stroke="#FFFFFF" strokeWidth={1.3} fill="none" opacity={0.7} />
          <rect x={0} y={4} width={16} height={7} rx={3} fill="#FFFFFF" />
          {i === 1 && <path d="M5 16 L8 13 L11 16 L8 19 Z" fill="#F2B544" />}
          {i !== 1 && <circle cx={8} cy={17} r={1.6} fill="#FFFFFF" opacity={0.85} />}
        </g>
      ))}
      {/* a pedra da frente */}
      <rect x={208} y={A - 6} width={184} height={6} rx={2} fill="#B9B0A4" />
      <rect x={208} y={A - 6} width={184} height={1.6} rx={0.8} fill="#DCD5CB" />
    </g>
  );
}

/** Os presentes, empilhados entre a lareira e a árvore. */
function Presentes() {
  return (
    <g>
      <rect x={400} y={140} width={44} height={36} rx={3} fill="#3F9A5B" />
      <rect x={419} y={140} width={6} height={36} fill="#D6403A" />
      <rect x={400} y={153} width={44} height={6} fill="#D6403A" />
      <path d="M422 140 C412 128 404 136 414 140 Z M422 140 C432 128 440 136 430 140 Z" fill="#D6403A" />
      <rect x={406} y={116} width={30} height={24} rx={2.5} fill="#D6403A" transform="rotate(-6 421 128)" />
      <rect x={418} y={116} width={5} height={24} fill="#F2B544" transform="rotate(-6 421 128)" />
      <path d="M419 115 C412 106 406 112 414 116 Z M421 115 C428 106 434 112 426 116 Z" fill="#F2B544" />
      <rect x={447} y={154} width={26} height={22} rx={2.5} fill="#F2B544" />
      <rect x={457} y={154} width={5} height={22} fill="#3AA0FF" />
      <rect x={447} y={162} width={26} height={5} fill="#3AA0FF" />
      <path d="M459.5 154 C454 147 449 151 455 154 Z M459.5 154 C465 147 470 151 464 154 Z" fill="#3AA0FF" />
      {/* a etiqueta */}
      <path d="M436 150 L444 147 L446 153 L438 156 Z" fill="#F6F0E7" stroke="#C9B79A" strokeWidth={0.6} />
    </g>
  );
}

/** A árvore de Natal, com a estrela, as bolas e as luzinhas piscando. */
function Arvore() {
  const luzes = [[506, 58], [534, 64], [496, 92], [520, 98], [548, 102], [486, 132], [512, 140], [540, 136], [560, 146]];
  const bolas = [[512, 46, '#D6403A'], [528, 80, '#F2B544'], [500, 112, '#3AA0FF'], [544, 120, '#D6403A'], [520, 128, '#F2B544'], [480, 148, '#D6403A']];
  return (
    <g>
      <rect x={507} y={156} width={26} height={20} rx={3} fill="#A92F35" />
      <rect x={507} y={161} width={26} height={3.5} fill="#F2B544" />
      <rect x={515} y={150} width={10} height={8} fill="#6B472E" />
      <path d="M520 82 L574 154 L466 154 Z" fill="#2E7A47" />
      <path d="M520 46 L562 112 L478 112 Z" fill="#3F9A5B" />
      <path d="M520 18 L550 72 L490 72 Z" fill="#46A564" />
      {/* a neve nas pontas */}
      <path d="M466 154 Q474 148 482 153 M558 153 Q566 148 574 154 M478 112 Q486 106 494 111 M546 111 Q554 106 562 112" stroke="#FFFFFF" strokeWidth={2.4} strokeLinecap="round" fill="none" />
      {/* o cordão dourado */}
      <path d="M498 66 Q522 76 544 64 M488 104 Q520 118 556 102 M476 146 Q520 160 566 144" stroke="#F2B544" strokeWidth={1.6} fill="none" strokeDasharray="3 2" />
      {bolas.map(([x, y, cor]) => (
        <g key={`${x}-${y}`}>
          <circle cx={x as number} cy={y as number} r={4} fill={cor as string} />
          <circle cx={(x as number) - 1.2} cy={(y as number) - 1.2} r={1.1} fill="#FFFFFF" opacity={0.7} />
        </g>
      ))}
      {luzes.map(([x, y], i) => (
        <circle key={`${x}-${y}`} className="nt-ch-luz" cx={x} cy={y} r={2} fill={['#FFF3B0', '#FF9AD0', '#9AD8FF'][i % 3]}
          style={{ animationDelay: `${-i * 0.29}s` }} />
      ))}
      <g className="nt-ch-estrela" transform="translate(520 16)">
        <path d="M0 -10 L2.9 -3.1 L10 -3.1 L4.4 1.4 L6.4 8.4 L0 4.4 L-6.4 8.4 L-4.4 1.4 L-10 -3.1 L-2.9 -3.1 Z" fill="#FFD54F" stroke="#E0A800" strokeWidth={0.8} />
      </g>
    </g>
  );
}

/** Do teto: uma bola e uma estrela penduradas, balançando de leve. */
function Pendurados({ topo }: { topo: number }) {
  return (
    <g>
      <g className="nt-ch-pendurado" style={{ transformOrigin: '206px 0px' }}>
        <path d={`M206 ${-topo} V18`} stroke="#B8862B" strokeWidth={0.9} />
        <circle cx={206} cy={24} r={6} fill="#D6403A" />
        <rect x={203.5} y={16.5} width={5} height={3} rx={1} fill="#F2B544" />
        <circle cx={204} cy={22} r={1.6} fill="#FFFFFF" opacity={0.6} />
      </g>
      <g className="nt-ch-pendurado" style={{ transformOrigin: '420px 0px', animationDelay: '-1.4s' }}>
        <path d={`M420 ${-topo} V26`} stroke="#B8862B" strokeWidth={0.9} />
        <path d="M420 24 L422.4 29.6 L428.4 29.6 L423.6 33.2 L425.4 39 L420 35.6 L414.6 39 L416.4 33.2 L411.6 29.6 L417.6 29.6 Z" fill="#FFD54F" stroke="#E0A800" strokeWidth={0.6} />
      </g>
      <g className="nt-ch-pendurado" style={{ transformOrigin: '584px 0px', animationDelay: '-2.6s' }}>
        <path d={`M584 ${-topo} V14`} stroke="#B8862B" strokeWidth={0.9} />
        <circle cx={584} cy={19} r={5} fill="#3AA0FF" />
        <rect x={582} y={12.5} width={4} height={2.6} rx={1} fill="#F2B544" />
      </g>
    </g>
  );
}

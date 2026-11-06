import { useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { useModoLeve } from '@/lib/modoLeve';
import { usePiscaPisca, varsDaLampada } from '../piscaPisca';
import { Fuligem, GrinchEspiando, GrinchInteiro, JanelaQuebrada, NuvemDeBriga } from './grinch/Grinch';
import { Duendes } from './grinch/Duendes';
import { useGrinch, type Bagunca, type EstadoGrinch } from './grinch/roteiro';
import './chale.css';

/**
 * O chalé de Natal no alto da aba Acordos (Cleber, 05/11/2026): «um ambiente
 * aconchegante, como se fosse a parte de dentro de um chalé» — no centro a
 * lareira com o fogo aceso, a chaminé subindo até a barra de cima, e a linha
 * das abas (no Nosso produto) ou o pé do cabeçalho (na regra Cofen) como o
 * chão. Em volta: a janela com neve caindo, a poltrona de balanço, o gato
 * dormindo no tapete, a árvore e os presentes.
 *
 * ## Redesenho de 06/11/2026 (Kauan: «melhoramento visual em todos os itens,
 * e que se encaixe com o Gestão»)
 *
 * A parede de tábuas bege era um painel de madeira em cima de uma tela limpa.
 * Virou papel de parede e lambri NOS TONS DO TEMA (`--primary` e `--background`
 * em `chale.css`), que somem nas pontas — o chalé passa a ser do Gestão, no
 * claro e no escuro. Os objetos ganharam volume (gradientes suaves, sem
 * contorno grosso, como os ícones do app): lareira com arco de pedra e chave,
 * grade de ferro e lenha com casca; poltrona torneada com almofada capitonê e
 * manta xadrez com franja; árvore em camadas com festão; presentes em 3D, um
 * deles na cor do Gestão; janela com cortina de veludo, lua, vilarejo ao longe
 * e geada nos cantos. As luzinhas da cornija e da árvore obedecem ao
 * controlador do pisca-pisca (`piscaPisca.ts`), como o varal do Dashboard.
 *
 * E o Grinch mora aqui (`grinch/`): de tempos em tempos quebra a janela (ou
 * desce pela chaminé), bagunça tudo numa nuvem de briga de desenho animado e
 * vai embora; depois vêm os duendes arrumar, falando dele e do Urso. Cada
 * objeto tem a sua versão bagunçada aqui (classe `bag`, em `chale.css`).
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
/** O recorte de só a lareira (com as velas, as meias e a bola do Grinch), para telas estreitas. */
const SO_LAREIRA = { x: 196, w: 208 };
/** Folga até o título e até os botões. */
const FOLGA = 28;

/** `topo`: quanto (no quadro) sobra acima do desenho até a barra de cima — a chaminé e a parede sobem até lá. */
interface Lugar { x: number; altura: number; escala: number; compacto: boolean; topo: number; larguraMain: number }

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
    if (escala >= pelaAltura * 0.7) return { x: meio - (w * escala) / 2, altura, escala, compacto, topo: altura / escala - A, larguraMain: m.width };
  }
  return null;
}

export function Chale() {
  const raiz = useRef<HTMLDivElement>(null);
  const [lugar, setLugar] = useState<Lugar | null>(null);
  const leve = useModoLeve();
  const pisca = usePiscaPisca();
  // A borda direita da tela, no quadro do chalé: é de lá que os duendes vêm.
  const direita = lugar ? (lugar.compacto ? SO_LAREIRA.x : 0) + (lugar.larguraMain - lugar.x) / lugar.escala : L + 100;
  const grinch = useGrinch(lugar ? lugar.compacto : null, direita, leve);
  const b = grinch.bagunca;

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
        <svg viewBox={vb} width={largura} height={lugar.altura} preserveAspectRatio="xMidYMax meet" data-pisca={pisca}>
          <Defs />
          {!lugar.compacto && <Parede topo={t} />}
          {/* A janela um pouco menor e mais alta, e a poltrona mais baixa: o
              encosto não cobre mais o vidro, onde o Grinch aparece. */}
          {!lugar.compacto && <g transform="translate(23.6 -10) scale(.8)"><Janela grinch={grinch} /></g>}
          <g className={cn('nt-bag-tapete', b.tapete && 'bag')}><Tapete /></g>
          {!lugar.compacto && (
            <g transform="translate(24.8 35.2) scale(.8)">
              <g className={cn('nt-bag-poltrona', b.poltrona && 'bag')}><Poltrona /></g>
            </g>
          )}
          {!lugar.compacto && <g className={cn('nt-ch-gato', grinch.gatoFugiu && 'fugiu')}><Gato /></g>}
          <Lareira topo={t} b={b} />
          {!lugar.compacto && <g className={cn('nt-bag-presentes', b.presentes && 'bag')}><Presentes /></g>}
          {!lugar.compacto && <g className={cn('nt-bag-arvore', b.arvore && 'bag')}><Arvore /></g>}
          {!lugar.compacto && <Pendurados topo={t} />}
          <BolaDoGrinch topo={t} caida={!!b.bola} />
          <RestosDaBagunca b={b} compacto={lugar.compacto} />
          <Fuligem e={grinch} />
          <NuvemDeBriga e={grinch} compacto={lugar.compacto} />
          <GrinchInteiro e={grinch} />
          <Duendes duendes={grinch.duendes} />
        </svg>
      )}
    </div>
  );
}

// ── Cores de objeto (as da parede vêm do tema, em `chale.css`) ───────────────

const VERMELHO = '#C8353A';
const VERDE = '#2F7D52';
const OURO = '#E2B04A';

function Defs() {
  return (
    <defs>
      {/* janela */}
      <linearGradient id="nt-ch-noite" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#0E1F3A" />
        <stop offset=".7" stopColor="#24497A" />
        <stop offset="1" stopColor="#3B6A9E" />
      </linearGradient>
      <radialGradient id="nt-ch-lua" cx=".5" cy=".5" r=".5">
        <stop offset="0" stopColor="#FFF6D6" stopOpacity=".55" />
        <stop offset="1" stopColor="#FFF6D6" stopOpacity="0" />
      </radialGradient>
      <linearGradient id="nt-ch-moldura" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#F4EEE6" />
        <stop offset="1" stopColor="#D9CFC2" />
      </linearGradient>
      <linearGradient id="nt-ch-veludo" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#8E1F27" />
        <stop offset=".35" stopColor="#C2343B" />
        <stop offset=".6" stopColor="#A2262E" />
        <stop offset="1" stopColor="#C93A40" />
      </linearGradient>
      {/* madeira */}
      <linearGradient id="nt-ch-madeira" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#9A6A45" />
        <stop offset="1" stopColor="#6E4529" />
      </linearGradient>
      <linearGradient id="nt-ch-madeira-h" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#7A4E30" />
        <stop offset=".45" stopColor="#A9774F" />
        <stop offset="1" stopColor="#6E4529" />
      </linearGradient>
      {/* lareira */}
      <pattern id="nt-ch-tijolo" width={24} height={12} patternUnits="userSpaceOnUse">
        <rect width={24} height={12} fill="#8A4632" />
        <rect x={0.8} y={0.8} width={22.4} height={4.8} rx={1.2} fill="#B9614A" />
        <rect x={0.8} y={0.8} width={22.4} height={1.2} rx={0.6} fill="#CF7A61" />
        <rect x={-11.2} y={6.8} width={22.4} height={4.8} rx={1.2} fill="#AD5741" />
        <rect x={12.8} y={6.8} width={22.4} height={4.8} rx={1.2} fill="#C06A50" />
        <rect x={12.8} y={6.8} width={22.4} height={1.2} rx={0.6} fill="#D58468" />
      </pattern>
      <linearGradient id="nt-ch-sombra-lados" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#000" stopOpacity=".28" />
        <stop offset=".12" stopColor="#000" stopOpacity="0" />
        <stop offset=".88" stopColor="#000" stopOpacity="0" />
        <stop offset="1" stopColor="#000" stopOpacity=".32" />
      </linearGradient>
      <linearGradient id="nt-ch-pedra" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ECE6DC" />
        <stop offset="1" stopColor="#C9BFB1" />
      </linearGradient>
      <radialGradient id="nt-ch-boca" cx=".5" cy=".85" r=".8">
        <stop offset="0" stopColor="#5A2614" />
        <stop offset=".55" stopColor="#24110A" />
        <stop offset="1" stopColor="#0E0705" />
      </radialGradient>
      <radialGradient id="nt-ch-calor" cx="0.5" cy="0.6" r="0.5">
        <stop offset="0" stopColor="#FFB347" stopOpacity="0.95" />
        <stop offset="1" stopColor="#FF7A1A" stopOpacity="0" />
      </radialGradient>
      <linearGradient id="nt-ch-chama-fora" x1="0" y1="1" x2="0" y2="0">
        <stop offset="0" stopColor="#F2481B" />
        <stop offset=".6" stopColor="#FF7A1F" />
        <stop offset="1" stopColor="#FFB347" stopOpacity=".85" />
      </linearGradient>
      <linearGradient id="nt-ch-chama-meio" x1="0" y1="1" x2="0" y2="0">
        <stop offset="0" stopColor="#FF8C1F" />
        <stop offset="1" stopColor="#FFD24D" />
      </linearGradient>
      <linearGradient id="nt-ch-chama-miolo" x1="0" y1="1" x2="0" y2="0">
        <stop offset="0" stopColor="#FFE58A" />
        <stop offset="1" stopColor="#FFFBE6" />
      </linearGradient>
      {/* árvore */}
      <linearGradient id="nt-ch-pinho" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#3F9C66" />
        <stop offset="1" stopColor="#1F5E3C" />
      </linearGradient>
      {/* bolas */}
      <radialGradient id="nt-ch-bola-vermelha" cx=".35" cy=".3" r=".75">
        <stop offset="0" stopColor="#FF8A8A" />
        <stop offset=".45" stopColor="#D63A3F" />
        <stop offset="1" stopColor="#8E1C22" />
      </radialGradient>
      <radialGradient id="nt-ch-bola-ouro" cx=".35" cy=".3" r=".75">
        <stop offset="0" stopColor="#FFF0B8" />
        <stop offset=".45" stopColor="#E7B649" />
        <stop offset="1" stopColor="#9C6C14" />
      </radialGradient>
      <radialGradient id="nt-ch-bola-azul" cx=".35" cy=".3" r=".75">
        <stop offset="0" stopColor="#BFE3FF" />
        <stop offset=".45" stopColor="#3E86D1" />
        <stop offset="1" stopColor="#1B4C85" />
      </radialGradient>
      {/* a manta xadrez */}
      <pattern id="nt-ch-xadrez" width={10} height={10} patternUnits="userSpaceOnUse" patternTransform="rotate(-8)">
        <rect width={10} height={10} fill="#2F7D52" />
        <rect x={0} y={3.5} width={10} height={3} fill="#C8353A" opacity=".85" />
        <rect x={3.5} y={0} width={3} height={10} fill="#C8353A" opacity=".7" />
        <rect x={0} y={4.6} width={10} height={0.8} fill="#E2B04A" opacity=".9" />
        <rect x={4.6} y={0} width={0.8} height={10} fill="#E2B04A" opacity=".8" />
      </pattern>
      {/* a parede some nas pontas e no alto: não tem borda dura */}
      <linearGradient id="nt-ch-some-lados" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#fff" stopOpacity="0" />
        <stop offset="0.1" stopColor="#fff" stopOpacity="1" />
        <stop offset="0.9" stopColor="#fff" stopOpacity="1" />
        <stop offset="1" stopColor="#fff" stopOpacity="0" />
      </linearGradient>
      <mask id="nt-ch-mascara">
        <rect y={-400} width={L} height={A + 400} fill="url(#nt-ch-some-lados)" />
      </mask>
      <radialGradient id="nt-ch-luz-fogo" cx=".5" cy=".9" r=".55">
        <stop offset="0" stopColor="#FFB347" stopOpacity=".38" />
        <stop offset="1" stopColor="#FFB347" stopOpacity="0" />
      </radialGradient>
      <clipPath id="nt-ch-vidro"><rect x={76} y={30} width={84} height={64} rx={2} /></clipPath>
      <clipPath id="nt-ch-fogueira"><path d="M248 170 V122 Q248 102 300 102 Q352 102 352 122 V170 Z" /></clipPath>
    </defs>
  );
}

/** Papel de parede listrado e lambri, nos tons do tema; o brilho do fogo pulsa nela. */
function Parede({ topo }: { topo: number }) {
  return (
    <g mask="url(#nt-ch-mascara)">
      <rect className="nt-ch-parede" x={0} y={-topo} width={L} height={A + topo} />
      {Array.from({ length: 30 }, (_, i) => (
        <rect key={i} className="nt-ch-listra" x={10 + i * 20} y={-topo} width={6} height={A - 58 + topo} />
      ))}
      {/* o lambri: a moldura do meio, os painéis e o rodapé */}
      <rect className="nt-ch-lambri" x={0} y={118} width={L} height={52} />
      {Array.from({ length: 12 }, (_, i) => (
        <rect key={i} className="nt-ch-painel" x={8 + i * 50} y={126} width={40} height={34} rx={2} />
      ))}
      <rect className="nt-ch-moldura" x={0} y={115} width={L} height={4.5} rx={1} />
      <rect className="nt-ch-rodape" x={0} y={164} width={L} height={6} />
      <rect className="nt-ch-luz-fogo" x={120} y={-topo} width={360} height={A + topo} fill="url(#nt-ch-luz-fogo)" />
    </g>
  );
}

/** A janela, de noite: lua, estrelas, o vilarejo ao longe e a neve caindo — e às vezes o Grinch. */
function Janela({ grinch }: { grinch: EstadoGrinch }) {
  const estrelas = [[86, 38], [98, 46], [130, 36], [152, 50], [108, 34], [140, 56], [92, 56]];
  return (
    <g>
      {/* o vidro e o lado de fora */}
      <rect x={76} y={30} width={84} height={64} rx={2} fill="url(#nt-ch-noite)" />
      <g clipPath="url(#nt-ch-vidro)">
        <circle cx={144} cy={44} r={16} fill="url(#nt-ch-lua)" />
        <circle cx={144} cy={44} r={6.5} fill="#FFF3C4" />
        <circle cx={142} cy={42.6} r={1.3} fill="#EADBA2" />
        <circle cx={146.4} cy={46} r={0.9} fill="#EADBA2" />
        {estrelas.map(([x, y], i) => (
          <circle key={i} className="nt-ch-estrelinha" cx={x} cy={y} r={0.75} fill="#FFFFFF" style={{ animationDelay: `${-i * 0.7}s` }} />
        ))}
        {/* morros, pinheiros e o vilarejo (Quemlândia, ao longe) */}
        <path d="M76 94 V74 Q92 66 108 72 Q124 64 140 70 Q152 66 160 70 V94 Z" fill="#C9DCEC" />
        <path d="M76 94 V80 Q98 72 120 79 Q142 73 160 78 V94 Z" fill="#E9F2F9" />
        {[[86, 76, 0.8], [93, 75, 1], [150, 74, 0.9]].map(([x, y, s], i) => (
          <g key={i} transform={`translate(${x} ${y}) scale(${s})`}>
            <path d="M0 -12 L5 -3 L3 -3 L7 3 L-7 3 L-3 -3 L-5 -3 Z" fill="#2C6B4A" />
            <path d="M-3 -3 L0 -6 L3 -3" stroke="#FFFFFF" strokeWidth={0.8} fill="none" opacity={0.8} />
          </g>
        ))}
        <g transform="translate(118 76)">
          <rect x={-6} y={-4} width={12} height={8} fill="#7A4A3A" />
          <path d="M-8 -4 L0 -10 L8 -4 Z" fill="#F4F8FB" />
          <rect className="nt-ch-casinha" x={-2} y={-2} width={4} height={3} fill="#FFD36B" />
        </g>
        <g transform="translate(132 78)">
          <rect x={-4} y={-3} width={8} height={6} fill="#6B4434" />
          <path d="M-5.6 -3 L0 -7.4 L5.6 -3 Z" fill="#F4F8FB" />
          <rect className="nt-ch-casinha" x={-1.4} y={-1.6} width={2.8} height={2.2} fill="#FFD36B" style={{ animationDelay: '-1.3s' }} />
        </g>
        {/* o Grinch espia lá de fora, atrás da neve */}
        <GrinchEspiando e={grinch} />
        {Array.from({ length: 12 }, (_, i) => (
          <circle key={i} className="nt-ch-floco" cx={80 + ((i * 37) % 78)} cy={24} r={0.8 + (i % 3) * 0.4}
            style={{ animationDelay: `${-i * 0.55}s`, animationDuration: `${4 + (i % 4) * 0.7}s` }} />
        ))}
        {/* geada nos cantos e o reflexo do vidro */}
        <path d="M76 30 H90 Q82 33 80 40 Q78 36 76 44 Z M160 30 H146 Q154 33 156 40 Q158 36 160 44 Z" fill="#FFFFFF" opacity={0.55} />
        <path d="M76 94 V84 Q79 90 86 90 Q82 92 84 94 Z M160 94 V84 Q157 90 150 90 Q154 92 152 94 Z" fill="#FFFFFF" opacity={0.5} />
        <path d="M84 94 L120 30 H130 L94 94 Z" fill="#FFFFFF" opacity={0.06} />
      </g>
      {/* o vidro trincado e quebrado (`grinch/Grinch.tsx`) */}
      <JanelaQuebrada e={grinch} />
      {/* a moldura branca com bisel, os caixilhos */}
      <path d="M70 24 H166 V100 H70 Z M76 30 V94 H160 V30 Z" fill="url(#nt-ch-moldura)" fillRule="evenodd" />
      <path d="M70 24 H166 V26 H70 Z" fill="#FFFFFF" opacity={0.7} />
      <rect x={116.5} y={30} width={3} height={64} fill="#E9E2D8" />
      <rect x={76} y={60.5} width={84} height={3} fill="#E9E2D8" />
      {/* o parapeito com neve e uma velinha */}
      <rect x={62} y={99} width={112} height={6} rx={1.5} fill="url(#nt-ch-moldura)" />
      <rect x={64} y={104.5} width={108} height={2} rx={1} fill="#000" opacity={0.08} />
      <path d="M66 99.5 Q74 95 84 97 Q96 94 108 97 Q120 94.5 132 97 Q146 94 158 97 Q166 95.5 170 99.5 Z" fill="#FFFFFF" />
      {/* as cortinas de veludo, o bandô e as amarras */}
      <path d="M50 18 Q66 16 74 18 Q70 50 64 70 Q60 86 66 108 L50 108 Q54 86 54 70 Q52 40 50 18 Z" fill="url(#nt-ch-veludo)" />
      <path d="M186 18 Q170 16 162 18 Q166 50 172 70 Q176 86 170 108 L186 108 Q182 86 182 70 Q184 40 186 18 Z" fill="url(#nt-ch-veludo)" />
      <path d="M56 70 Q62 72 66 68 M180 70 Q174 72 170 68" stroke={OURO} strokeWidth={2.2} strokeLinecap="round" fill="none" />
      <circle cx={66} cy={68.5} r={2} fill={OURO} />
      <circle cx={170} cy={68.5} r={2} fill={OURO} />
      <rect x={44} y={12} width={148} height={4} rx={2} fill="#6E4529" />
      <circle cx={44} cy={14} r={3} fill="#8E5E3B" />
      <circle cx={192} cy={14} r={3} fill="#8E5E3B" />
      <path d="M48 16 H188 V22 Q176 30 164 22 Q152 30 140 22 Q128 30 118 22 Q108 30 96 22 Q84 30 72 22 Q60 30 48 22 Z" fill="#A9282F" />
      <path d="M48 16 H188 V18 H48 Z" fill="#C93A40" />
      {/* a guirlandinha no alto da janela */}
      <circle cx={118} cy={26} r={6.5} fill="none" stroke="#2F7D52" strokeWidth={3.4} />
      <circle cx={118} cy={26} r={6.5} fill="none" stroke="#4DA373" strokeWidth={1.4} strokeDasharray="1.4 2.4" />
      <path d="M115 31 L118 28.5 L121 31" stroke={VERMELHO} strokeWidth={1.8} strokeLinecap="round" fill="none" />
    </g>
  );
}

/** O tapete oval na frente da lareira, e o reflexo do fogo nele. */
function Tapete() {
  return (
    <g>
      <ellipse cx={300} cy={A - 3} rx={128} ry={6} fill="#8E2329" />
      <ellipse cx={300} cy={A - 3} rx={120} ry={4.8} fill="#B1323A" />
      <ellipse cx={300} cy={A - 3} rx={110} ry={3.6} fill="none" stroke="#F1D9A8" strokeWidth={1.1} strokeDasharray="3 2.4" />
      <ellipse cx={300} cy={A - 3} rx={92} ry={2.6} fill="none" stroke={OURO} strokeWidth={0.7} />
      <ellipse className="nt-ch-reflexo" cx={300} cy={A - 3} rx={88} ry={4.4} fill="#FFB347" />
    </g>
  );
}

/** A poltrona de balanço, torneada, com almofada capitonê e a manta xadrez. Balança devagar. */
function Poltrona() {
  return (
    <g className="nt-ch-poltrona">
      {/* os balanços */}
      <path d="M56 168 Q122 184 194 160" stroke="#5A3820" strokeWidth={6} strokeLinecap="round" fill="none" />
      <path d="M58 166 Q122 181 192 158" stroke="#8E5E3B" strokeWidth={1.4} strokeLinecap="round" fill="none" opacity={0.8} />
      {/* pés */}
      <path d="M86 132 L82 171 M164 132 L170 166" stroke="url(#nt-ch-madeira-h)" strokeWidth={5} strokeLinecap="round" />
      {/* o encosto: as colunas torneadas, as travessas e o topo curvo */}
      <path d="M86 124 L80 56 M164 124 L170 56" stroke="url(#nt-ch-madeira-h)" strokeWidth={6.5} strokeLinecap="round" />
      {[80, 170].map(x => <circle key={x} cx={x} cy={52} r={4.6} fill="#9A6A45" />)}
      <path d="M78 58 Q125 38 172 58" stroke="url(#nt-ch-madeira)" strokeWidth={8} strokeLinecap="round" fill="none" />
      <path d="M80 56 Q125 37 170 56" stroke="#C3916A" strokeWidth={1.6} strokeLinecap="round" fill="none" opacity={0.6} />
      {[100, 113, 126, 139, 152].map((x, i) => (
        <g key={x}>
          <path d={`M${x + (i - 2) * 0.6} 118 L${x + (i - 2) * 2.2} 60`} stroke="#8E5E3B" strokeWidth={3.4} strokeLinecap="round" />
          <ellipse cx={x + (i - 2) * 1.4} cy={88} rx={2.6} ry={3.6} fill="#8E5E3B" />
        </g>
      ))}
      <path d="M84 96 Q125 90 166 96" stroke="#7A4E30" strokeWidth={3} fill="none" />
      {/* o assento e a almofada capitonê */}
      <rect x={70} y={124} width={110} height={11} rx={4} fill="url(#nt-ch-madeira)" />
      <rect x={76} y={111} width={98} height={15} rx={7.5} fill="#B8333A" />
      <rect x={76} y={111} width={98} height={5} rx={2.5} fill="#D24A50" opacity={0.7} />
      {[92, 110, 128, 146, 160].map(x => <circle key={x} cx={x} cy={119} r={1.1} fill="#7E1F25" />)}
      {/* os braços */}
      <path d="M64 101 Q76 96 92 100" stroke="url(#nt-ch-madeira)" strokeWidth={6} strokeLinecap="round" fill="none" />
      <path d="M158 100 Q174 96 186 101" stroke="url(#nt-ch-madeira)" strokeWidth={6} strokeLinecap="round" fill="none" />
      <path d="M88 101 L86 124 M162 101 L164 124" stroke="#7A4E30" strokeWidth={3.4} strokeLinecap="round" />
      {/* a manta xadrez dobrada no encosto, com franja */}
      <path d="M132 54 Q158 48 173 58 L180 110 Q162 118 146 108 Q140 80 132 54 Z" fill="url(#nt-ch-xadrez)" />
      <path d="M132 54 Q158 48 173 58 L174 64 Q156 56 134 62 Z" fill="#000" opacity={0.12} />
      <path d="M146 108 Q162 118 180 110" stroke="#1F5E3C" strokeWidth={1.6} fill="none" />
      {Array.from({ length: 8 }, (_, i) => {
        const x = 148 + i * 4.2, y = 109 + Math.sin((i / 7) * Math.PI) * 4.6;
        return <path key={i} d={`M${x} ${y} l-0.4 4.2`} stroke={OURO} strokeWidth={1} strokeLinecap="round" />;
      })}
    </g>
  );
}

/** O gato cinza-azulado, enrolado no tapete; respira e o rabo mexe de vez em quando. */
function Gato() {
  return (
    <g transform={`translate(206 ${A - 6})`}>
      <ellipse cx={0} cy={0.5} rx={21} ry={2.2} fill="#000" opacity={0.12} />
      <ellipse className="nt-ch-gato-respira" cx={0} cy={-7} rx={19} ry={8.5} fill="#8C93A8" />
      <path className="nt-ch-gato-respira" d="M-6 -14 Q2 -16 10 -13 M-2 -10 Q5 -12 12 -9 M4 -6 Q10 -7 15 -5" stroke="#727A90" strokeWidth={1.4} fill="none" strokeLinecap="round" />
      <path className="nt-ch-gato-rabo" d="M16 -3 Q28 -1 24 -11 Q22 -15 18 -13" stroke="#7C8399" strokeWidth={4.4} strokeLinecap="round" fill="none" />
      <circle cx={-14} cy={-9} r={7.6} fill="#9AA1B5" />
      <path d="M-20.4 -13 L-21.6 -21.4 L-15 -16.4 Z M-12 -16.4 L-7.6 -22.4 L-6.8 -14.4 Z" fill="#9AA1B5" />
      <path d="M-19.8 -14.6 L-20.4 -18.8 L-17.2 -16.2 Z" fill="#F2C4CF" />
      <path d="M-19 -9 Q-17 -7.5 -15 -9 M-12.5 -9.5 Q-10.5 -8 -8.5 -9.5" stroke="#3A3E4D" strokeWidth={1} strokeLinecap="round" fill="none" />
      <circle cx={-13.6} cy={-6} r={0.9} fill="#E58FA3" />
      <path d="M-18 -4.6 L-24 -5.6 M-18 -3.8 L-23.6 -3.2" stroke="#D7DBE6" strokeWidth={0.5} />
      {/* a coleira com guizo */}
      <path d="M-9 -3.6 Q-12 -1.4 -16 -2.4" stroke={VERMELHO} strokeWidth={1.6} fill="none" strokeLinecap="round" />
      <circle cx={-12.4} cy={-1.2} r={1.3} fill={OURO} />
      <text className="nt-ch-zzz" x={-6} y={-22}>z</text>
    </g>
  );
}

/** A lareira: chaminé até o alto com guirlanda, cornija com festão e velas, arco de pedra, fogo, lenha e meias. */
function Lareira({ topo, b }: { topo: number; b: Bagunca }) {
  const luzes = [214, 236, 258, 280, 302, 324, 346, 368, 388];
  return (
    <g className="nt-ch-lareira">
      {/* a chaminé, subindo até a barra de cima */}
      <rect x={252} y={-topo} width={96} height={54 + topo} fill="url(#nt-ch-tijolo)" />
      <rect x={252} y={-topo} width={96} height={54 + topo} fill="url(#nt-ch-sombra-lados)" />
      {/* a guirlanda da chaminé, com laço */}
      <g className={cn('nt-bag-guirlanda', b.guirlanda && 'bag')}>
      <g transform="translate(300 26)">
        <circle r={13.5} fill="none" stroke="#245F3D" strokeWidth={7.5} />
        <circle r={13.5} fill="none" stroke="#3F8F60" strokeWidth={5} strokeDasharray="1.6 2.6" />
        <circle r={13.5} fill="none" stroke="#5DB07F" strokeWidth={2.4} strokeDasharray="1 3.6" strokeDashoffset={1.4} />
        {[[-11, -6], [10, -8], [-6, 12], [9, 9], [13, 2]].map(([x, y]) => (
          <g key={`${x}-${y}`}><circle cx={x} cy={y} r={2} fill="#D6403A" /><circle cx={x - 0.6} cy={y - 0.6} r={0.6} fill="#FFFFFF" opacity={0.7} /></g>
        ))}
        <path d="M-1 -13 C-9 -21 -15 -14 -7 -11.6 Z M1 -13 C9 -21 15 -14 7 -11.6 Z" fill={VERMELHO} />
        <path d="M-1.4 -12 L-6 -2 L-3.4 -3 L-2 0 Z M1.4 -12 L6 -2 L3.4 -3 L2 0 Z" fill="#A9282F" />
        <circle cy={-12.6} r={2.6} fill="#A9282F" />
      </g>
      </g>

      {/* a cornija: a viga com mísulas */}
      <path d="M210 62 Q212 70 220 70 L222 62 Z M390 62 Q388 70 380 70 L378 62 Z" fill="#5A3820" />
      <rect x={200} y={50} width={200} height={12} rx={2.5} fill="url(#nt-ch-madeira)" />
      <rect x={200} y={50} width={200} height={2.6} rx={1.3} fill="#C3916A" opacity={0.7} />
      <path d="M214 56 H260 M290 57 H330 M352 55.5 H392" stroke="#5A3820" strokeWidth={0.6} opacity={0.6} />
      {/* as velas, com pingos */}
      {[212, 390].map((x, i) => (
        <g key={x} className={cn('nt-bag-vela', i ? 'v2' : 'v1', b.velas && 'bag')}>
          <rect x={x - 6} y={46} width={12} height={4} rx={1.5} fill={OURO} />
          <rect x={x - 4} y={30} width={8} height={17} rx={1.6} fill="#F6EFE3" />
          <rect x={x - 4} y={30} width={2.6} height={17} fill="#FFFFFF" opacity={0.8} />
          <path d={`M${x + 1.5} 30 V35 Q${x + 2.6} 36 ${x + 2.4} 34 V30 Z`} fill="#EDE3D2" />
          <circle className="nt-ch-vela-brilho" cx={x} cy={24} r={8} fill="#FFD98A" />
          <path className="nt-ch-vela" d={`M${x} 19 C${x + 3.2} 23.4 ${x + 2.6} 28.6 ${x} 28.6 C${x - 2.6} 28.6 ${x - 3.2} 23.4 ${x} 19 Z`} fill="#FFB347" />
          <path className="nt-ch-vela" d={`M${x} 23 C${x + 1.4} 25 ${x + 1.2} 28 ${x} 28 C${x - 1.2} 28 ${x - 1.4} 25 ${x} 23 Z`} fill="#FFF3C4" />
        </g>
      ))}
      {/* o festão de pinheiro na cornija, com as luzinhas do pisca-pisca */}
      <path d="M202 63 Q217 72 232 63 Q247 72 262 63 Q277 72 292 63 Q307 72 322 63 Q337 72 352 63 Q367 72 382 63 Q392 69 398 63"
        stroke="#245F3D" strokeWidth={6.5} strokeLinecap="round" fill="none" />
      <path d="M202 63 Q217 72 232 63 Q247 72 262 63 Q277 72 292 63 Q307 72 322 63 Q337 72 352 63 Q367 72 382 63 Q392 69 398 63"
        stroke="#4DA373" strokeWidth={4.4} strokeLinecap="round" fill="none" strokeDasharray="1.2 2.4" />
      {luzes.map((x, i) => (
        <g key={x}>
          <circle className="nt-ch-luz-halo pp-luz" cx={x} cy={68.5} r={5} fill={['#FF3B3B', '#FFC531', '#2FD16B', '#8FD3FF'][i % 4]}
            style={varsDaLampada(i)} />
          <ellipse className="nt-ch-luz pp-luz" cx={x} cy={68.5} rx={1.8} ry={2.5} fill={['#FF3B3B', '#FFC531', '#2FD16B', '#8FD3FF'][i % 4]}
            style={varsDaLampada(i)} />
        </g>
      ))}

      {/* o corpo de tijolos */}
      <rect x={218} y={62} width={164} height={A - 68} fill="url(#nt-ch-tijolo)" />
      <rect x={218} y={62} width={164} height={A - 68} fill="url(#nt-ch-sombra-lados)" />
      {/* o arco de pedra, com a pedra-chave */}
      <path d="M236 170 V120 Q236 90 300 90 Q364 90 364 120 V170 H354 V122 Q354 100 300 100 Q246 100 246 122 V170 Z" fill="url(#nt-ch-pedra)" />
      {[[240, 128], [240, 146], [240, 162], [360, 128], [360, 146], [360, 162]].map(([x, y]) => (
        <path key={`${x}-${y}`} d={`M${x - 4} ${y} H${x + 4}`} stroke="#B5AA9A" strokeWidth={0.8} />
      ))}
      <path d="M292 87 H308 L306 101 H294 Z" fill="#DCD3C6" stroke="#B5AA9A" strokeWidth={0.6} />
      {/* a boca, com a fuligem */}
      <path d="M246 170 V122 Q246 100 300 100 Q354 100 354 122 V170 Z" fill="url(#nt-ch-boca)" />

      {/* o fogo: o calor atrás, as chamas em três camadas e as brasas subindo */}
      <g className="nt-ch-fogo">
        <g clipPath="url(#nt-ch-fogueira)">
          <circle className="nt-ch-calor" cx={300} cy={150} r={50} fill="url(#nt-ch-calor)" />
          <g className="nt-ch-chamas">
            <path className="nt-ch-chama c1" d="M270 166 C262 150 274 142 272 126 C282 134 284 120 292 108 C296 122 302 112 304 104 C310 118 322 122 318 136 C328 132 332 150 328 166 Z" fill="url(#nt-ch-chama-fora)" />
            <path className="nt-ch-chama c2" d="M280 166 C276 152 286 146 286 134 C294 140 296 128 302 118 C305 130 314 136 312 148 C318 146 320 158 318 166 Z" fill="url(#nt-ch-chama-meio)" />
            <path className="nt-ch-chama c3" d="M290 166 C288 157 294 152 295 144 C299 149 301 141 305 136 C308 147 312 154 309 166 Z" fill="url(#nt-ch-chama-miolo)" />
          </g>
          {Array.from({ length: 7 }, (_, i) => (
            <circle key={i} className="nt-ch-brasa" cx={284 + ((i * 7) % 32)} cy={152} r={1 + (i % 2) * 0.5}
              style={{ animationDelay: `${-i * 0.42}s`, animationDuration: `${2.2 + (i % 3) * 0.5}s` }} />
          ))}
        </g>
        {/* a lenha, com casca e anéis */}
        <g transform="rotate(-7 300 164)">
          <rect x={266} y={159} width={68} height={9} rx={4.5} fill="#6B3F24" />
          <path d="M272 161.5 H300 M306 165 H328" stroke="#4E2C18" strokeWidth={0.8} />
        </g>
        <g transform="rotate(8 300 164)">
          <rect x={266} y={159} width={68} height={9} rx={4.5} fill="#7E4B2B" />
          <path d="M276 165 H298 M304 161.6 H326" stroke="#5A3420" strokeWidth={0.8} />
        </g>
        {[[268, 167], [332, 167]].map(([x, y]) => (
          <g key={x}><circle cx={x} cy={y} r={4} fill="#D9AE80" /><circle cx={x} cy={y} r={2.4} fill="none" stroke="#B88A5C" strokeWidth={0.6} /></g>
        ))}
        <ellipse className="nt-ch-brasas-chao" cx={300} cy={169} rx={32} ry={2.6} fill="#FF7A1A" />
        {/* a grade de ferro na frente */}
        <path d="M256 170 V156 M266 170 V152 M276 170 V150 M324 170 V150 M334 170 V152 M344 170 V156 M254 158 Q300 144 346 158"
          stroke="#2A2422" strokeWidth={1.6} strokeLinecap="round" fill="none" />
        {[266, 276, 324, 334].map(x => <circle key={x} cx={x} cy={x === 276 || x === 324 ? 149 : 151} r={1.4} fill="#3A3230" />)}
      </g>

      {/* as meias de tricô penduradas em ganchinhos dourados */}
      {([[238, VERMELHO, '#F6EFE3'], [300, VERDE, '#F6EFE3'], [362, VERMELHO, '#F6EFE3']] as const).map(([x, cor, punho], i) => (
        <g key={x} className={cn('nt-bag-meia', `m${i + 1}`, b.meias && 'bag')}>
        <g transform={`translate(${x - 8} 62)`}>
          <path d="M8 -1 V5" stroke={OURO} strokeWidth={1.4} strokeLinecap="round" />
          <path d="M2 10 H14 V26 Q14 33 7 33 H-5 Q-11 33 -11 27.5 Q-11 22 -3 22 H2 Z" fill={cor} />
          <path d="M2 14 H14 M2 18 H14 M-8 26 H12" stroke="#000" strokeWidth={0.5} opacity={0.15} />
          <path d="M-9.4 28 Q-5 25 -1 27.6" stroke="#FFFFFF" strokeWidth={1.3} fill="none" opacity={0.7} />
          <rect x={-0.5} y={4} width={17} height={7.5} rx={3.6} fill={punho} />
          <path d="M1 5.6 Q4 4.4 7 5.6 Q10 4.4 13 5.6" stroke="#FFFFFF" strokeWidth={1} fill="none" />
          {i === 1 ? <path d="M5 16 L8 13 L11 16 L8 19 Z" fill={OURO} /> : <circle cx={8} cy={17} r={1.6} fill="#FFFFFF" opacity={0.85} />}
        </g>
        </g>
      ))}
      {/* a pedra da frente */}
      <rect x={206} y={A - 7} width={188} height={7} rx={2} fill="url(#nt-ch-pedra)" />
      <rect x={206} y={A - 7} width={188} height={1.6} rx={0.8} fill="#FFFFFF" opacity={0.6} />
    </g>
  );
}

/** Uma caixa de presente em 3D: frente, lado, tampa, fita e laço. */
function Caixa({ x, y, w, h, cor, sombra, fita, giro = 0, classe }: {
  x: number; y: number; w: number; h: number; cor: string; sombra: string; fita: string; giro?: number; classe?: string;
}) {
  const p = 6;
  return (
    <g transform={`rotate(${giro} ${x + w / 2} ${y + h})`} className={classe}>
      <path d={`M${x + w} ${y} l${p} -${p * 0.6} V${y + h - p * 0.6} l-${p} ${p * 0.6} Z`} fill={sombra} className="lado" />
      <rect x={x} y={y} width={w} height={h} rx={1.5} fill={cor} className="frente" />
      <path d={`M${x} ${y} l${p} -${p * 0.6} H${x + w + p} l-${p} ${p * 0.6} Z`} fill={cor} className="tampa" opacity={0.85} />
      <rect x={x + w / 2 - 2.6} y={y} width={5.2} height={h} fill={fita} />
      <rect x={x + w / 2 - 2.6} y={y} width={1.6} height={h} fill="#FFFFFF" opacity={0.35} />
      <path d={`M${x + w} ${y + h / 2 - 2} l${p} -${p * 0.6} v4.4 l-${p} ${p * 0.6} Z`} fill={fita} opacity={0.85} />
      <path d={`M${x + w / 2} ${y - 1} C${x + w / 2 - 10} ${y - 12} ${x + w / 2 - 16} ${y - 3} ${x + w / 2 - 3} ${y - 0.4} Z M${x + w / 2} ${y - 1} C${x + w / 2 + 10} ${y - 12} ${x + w / 2 + 16} ${y - 3} ${x + w / 2 + 3} ${y - 0.4} Z`} fill={fita} />
      <circle cx={x + w / 2} cy={y - 1} r={2.2} fill={fita} />
    </g>
  );
}

/** Os presentes, entre a lareira e a árvore — um deles na cor do Gestão. */
function Presentes() {
  return (
    <g>
      <ellipse cx={440} cy={A - 1} rx={40} ry={2.4} fill="#000" opacity={0.1} />
      <g className="p1"><Caixa x={400} y={140} w={42} h={36} cor="#2F7D52" sombra="#1F5E3C" fita="#C8353A" /></g>
      <g className="p2"><Caixa x={406} y={118} w={28} h={22} cor="#C8353A" sombra="#8E2329" fita={OURO} giro={-6} /></g>
      <g className="p3"><Caixa x={448} y={152} w={26} h={24} cor="#E2B04A" sombra="#B98A2C" fita="#C8353A" classe="nt-ch-presente-gestao" /></g>
      {/* a etiqueta */}
      <path d="M436 150 L444 147 L446 153 L438 156 Z" fill="#F6EFE3" stroke="#C9B79A" strokeWidth={0.6} />
    </g>
  );
}

/** A árvore em camadas, com festão dourado, bolas, luzinhas do pisca-pisca e a estrela. */
function Arvore() {
  const luzes = [[506, 58], [534, 64], [520, 50], [496, 92], [520, 98], [548, 100], [486, 132], [512, 140], [540, 136], [562, 144], [500, 116], [530, 120]];
  const bolas: [number, number, string][] = [[512, 44, 'vermelha'], [528, 80, 'ouro'], [500, 108, 'azul'], [546, 118, 'vermelha'], [520, 128, 'ouro'], [482, 146, 'vermelha'], [556, 150, 'azul']];
  // uma camada de galhos com a borda de baixo recortada
  const camada = (topo: number, base: number, meia: number) => {
    const n = 5, passo = (meia * 2) / n;
    let d = `M520 ${topo} L${520 + meia} ${base}`;
    for (let i = n; i > 0; i--) d += ` Q${520 - meia + passo * (i - 0.5)} ${base + 5} ${520 - meia + passo * (i - 1)} ${base}`;
    return d + ' Z';
  };
  return (
    <g>
      <ellipse cx={520} cy={A - 1} rx={34} ry={2.4} fill="#000" opacity={0.12} />
      {/* o vaso: caixote de madeira com faixa dourada */}
      <path d="M504 154 H536 L533 172 H507 Z" fill="url(#nt-ch-madeira)" />
      <rect x={503} y={154} width={34} height={4} rx={1} fill="#9A6A45" />
      <rect x={505.6} y={161} width={29} height={2.6} fill={OURO} />
      <rect x={515} y={148} width={10} height={8} fill="#5A3820" />
      <path d={camada(78, 152, 56)} fill="url(#nt-ch-pinho)" />
      <path d={camada(44, 114, 44)} fill="url(#nt-ch-pinho)" />
      <path d={camada(14, 76, 32)} fill="url(#nt-ch-pinho)" />
      {/* o lado da sombra */}
      <path d="M520 78 L576 152 L520 156 Z M520 44 L564 114 L520 118 Z M520 14 L552 76 L520 80 Z" fill="#000" opacity={0.1} />
      {/* neve nas pontas */}
      <path d="M466 152 Q472 148 478 152 M562 152 Q568 148 574 152 M478 114 Q484 110 490 114 M550 114 Q556 110 562 114 M490 76 Q495 72 500 76 M540 76 Q545 72 550 76"
        stroke="#FFFFFF" strokeWidth={2.2} strokeLinecap="round" fill="none" opacity={0.9} />
      {/* o festão dourado em espiral */}
      <path d="M500 64 Q522 74 544 62 M486 100 Q520 114 556 100 M472 140 Q520 156 568 138" stroke={OURO} strokeWidth={1.8} fill="none" />
      <path d="M500 64 Q522 74 544 62 M486 100 Q520 114 556 100 M472 140 Q520 156 568 138" stroke="#FFF0B8" strokeWidth={0.6} fill="none" strokeDasharray="1 3" />
      {bolas.map(([x, y, cor]) => (
        <g key={`${x}-${y}`}>
          <rect x={x - 1.4} y={y - 6.2} width={2.8} height={1.8} rx={0.5} fill={OURO} />
          <circle cx={x} cy={y} r={4.4} fill={`url(#nt-ch-bola-${cor})`} />
        </g>
      ))}
      {luzes.map(([x, y], i) => (
        <g key={`${x}-${y}`}>
          <circle className="nt-ch-luz-halo pp-luz" cx={x} cy={y} r={4.4} fill={['#FFF3B0', '#FF9AD0', '#9AD8FF', '#FFC531'][i % 4]} style={varsDaLampada(i + 20)} />
          <circle className="nt-ch-luz pp-luz" cx={x} cy={y} r={1.7} fill={['#FFF3B0', '#FF9AD0', '#9AD8FF', '#FFC531'][i % 4]} style={varsDaLampada(i + 20)} />
        </g>
      ))}
      {/* a estrela, com brilho */}
      <g className="nt-ch-estrela nt-arvore-estrela" transform="translate(520 12)">
        <circle r={11} fill="#FFE07A" opacity={0.25} />
        <path d="M0 -10 L2.9 -3.1 L10 -3.1 L4.4 1.4 L6.4 8.4 L0 4.4 L-6.4 8.4 L-4.4 1.4 L-10 -3.1 L-2.9 -3.1 Z" fill="#FFD54F" stroke="#D99A00" strokeWidth={0.8} />
        <path d="M0 -6 L1.4 -2 L0 0 Z" fill="#FFFFFF" opacity={0.7} />
      </g>
    </g>
  );
}

/** Do teto: uma bola e uma estrela penduradas, balançando de leve. */
function Pendurados({ topo }: { topo: number }) {
  return (
    <g>
      <g className="nt-ch-pendurado" style={{ transformOrigin: '196px 0px' }}>
        <path d={`M196 ${-topo} V12`} stroke="#B8862B" strokeWidth={0.9} />
        <rect x={193.4} y={11} width={5.2} height={3} rx={1} fill={OURO} />
        <circle cx={196} cy={19} r={5.6} fill="url(#nt-ch-bola-azul)" />
      </g>
      <g className="nt-ch-pendurado" style={{ transformOrigin: '430px 0px', animationDelay: '-1.4s' }}>
        <path d={`M430 ${-topo} V26`} stroke="#B8862B" strokeWidth={0.9} />
        <path d="M430 24 L432.4 29.6 L438.4 29.6 L433.6 33.2 L435.4 39 L430 35.6 L424.6 39 L426.4 33.2 L421.6 29.6 L427.6 29.6 Z" fill="#FFD54F" stroke="#D99A00" strokeWidth={0.6} />
      </g>
      <g className="nt-ch-pendurado" style={{ transformOrigin: '588px 0px', animationDelay: '-2.6s' }}>
        <path d={`M588 ${-topo} V12`} stroke="#B8862B" strokeWidth={0.9} />
        <rect x={585.8} y={10.6} width={4.4} height={2.8} rx={1} fill={OURO} />
        <circle cx={588} cy={17} r={5} fill="url(#nt-ch-bola-ouro)" />
      </g>
    </g>
  );
}

/** A bola vermelha pendurada entre a chaminé e a árvore. Na bagunça, cai e rola para o chão. */
const BOLA = { x: 367, y: 42, r: 7 };
function BolaDoGrinch({ topo, caida }: { topo: number; caida: boolean }) {
  return (
    <g className={cn('nt-bag-bola', caida && 'bag')}>
      <path className="fio" d={`M${BOLA.x} ${-topo} V${BOLA.y - BOLA.r - 2.4}`} stroke="#B8862B" strokeWidth={0.9} />
      <g className="bola">
        <rect x={BOLA.x - 2.4} y={BOLA.y - BOLA.r - 3} width={4.8} height={3.2} rx={1} fill={OURO} />
        <circle cx={BOLA.x} cy={BOLA.y} r={BOLA.r} fill="url(#nt-ch-bola-vermelha)" />
      </g>
    </g>
  );
}

/**
 * O que fica espalhado pelo chão enquanto a bagunça não é arrumada: a
 * estrela e bolas da árvore, papel de presente rasgado, e a neve e os cacos
 * que entraram pela janela quebrada.
 */
function RestosDaBagunca({ b, compacto }: { b: Bagunca; compacto: boolean }) {
  return (
    <g className="nt-restos">
      {!compacto && b.arvore && (
        <g className="resto">
          <path d="M556 168 L558.6 162.4 L564.6 162.4 L559.8 158.8 L561.6 153 L556 156.4 L550.4 153 L552.2 158.8 L547.4 162.4 L553.4 162.4 Z" transform="rotate(150 556 160)" fill="#FFD54F" stroke="#D99A00" strokeWidth={0.6} />
          <circle cx={470} cy={171} r={4} fill="url(#nt-ch-bola-ouro)" />
          <circle cx={584} cy={171.4} r={3.6} fill="url(#nt-ch-bola-azul)" />
        </g>
      )}
      {!compacto && b.presentes && (
        <g className="resto">
          <path d="M392 172 l6 -4 l4 3 l-5 3 Z M418 174 l5 -3 l2 4 Z M460 173 l4 -5 l5 2 l-4 4 Z" fill="#C8353A" />
          <path d="M404 171 q6 -6 12 0 M446 172 q4 -5 9 -1" stroke={OURO} strokeWidth={1.2} fill="none" />
        </g>
      )}
      {!compacto && b.janela && (
        <g className="resto">
          <path d="M96 172 Q110 166 124 172 Z" fill="#FFFFFF" opacity={0.85} />
          <path d="M104 173 l3 -3 l2 3 Z M118 173 l2 -2.6 l3 2.6 Z" fill="#CFE3F7" stroke="#8FB3D9" strokeWidth={0.4} />
        </g>
      )}
    </g>
  );
}

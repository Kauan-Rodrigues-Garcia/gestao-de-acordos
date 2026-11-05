import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { cn } from '@/lib/utils';
import { relogioNatal } from '../musica';
import { CarroDoTrem } from './Trem';
import { CARROS, MEIO_DOS_CARROS, TRILHO_Y, type PassageiroDoTrem } from './carros';
import { CartaoPassageiro } from './CartaoPassageiro';
import { COMPRIMENTO_TREM_PX, ESCALA_TREM, TRILHO_NA_FAIXA, useRelogioDoTrem } from './comum';
import {
  SEGUNDOS_POR_PISTA, chaveDoSorteio, ondeEsta, quantosABordo,
  type AbaDoTrem, type PosicaoDoTrem,
} from './horario';
import { useFotosResolvidas, usePassageiros, type Sorteado } from './passageiros';
import { agendaAgora, useAgendaDoTrem } from './agenda';
import {
  distanciaNoTrecho, ladoDoCorpo, montarTrilho, pontoNoTrilho, type MedidasDoTrilho, type Trilho,
} from './trilho';
import { AtracaoDoTrilho, EnfeiteDoTrilho, PiscaPiscaDoTrilho } from './Cenario';
import { buzina, sino } from './sons';

/*
 * O trilho e o trem de uma aba. Mora dentro do `<main>` (a área que rola),
 * cobrindo o conteúdo inteiro, NA FRENTE dele: as pistas correm nas faixas
 * do alto e do pé (`trilho.ts`). `pointer-events: none`: o clique atravessa
 * para o que está embaixo.
 *
 * Medidas: a largura do `<main>` e as faixas (`data-faixa-trem`), relidas
 * quando a página muda de tamanho.
 *
 * Movimento: um `requestAnimationFrame` lê o relógio do Natal, pergunta ao
 * horário onde o trem está e escreve o `transform` de cada carro direto no
 * elemento — nenhum render do React por quadro. Com o trem em outra aba, não
 * desenha o trem (o trilho fica).
 *
 * Mouse: quem acha o passageiro é a conta — a posição das fotos na tela
 * (a camada não recebe eventos).
 *
 * Cenário (`Cenario.tsx`): as atrações das faixas (o sinal de passagem pisca e
 * o boneco de neve acena com o trem perto). A classe é ligada aqui, no mesmo
 * quadro do movimento.
 *
 * Rodas: giram pela distância andada (e não por um relógio de CSS) — aceleram
 * na saída, freiam na chegada e param com o trem. A biela acompanha a roda
 * grande.
 *
 * Sons: a buzina, bem baixa, toda vez que o trem sai da estação (Cleber,
 * 04/11/2026); o sino na chegada à estação e no fim da linha. Só toca
 * o que acontece na aba aberta.
 */

const PASSO_MODO_LEVE_MS = 90;
/** De garantia, as medidas da página são relidas de tanto em tanto. */
const REMEDIR_MS = 2000;
/** Com o trem em outra aba, o quadro só confere de tanto em tanto (nada se mexe aqui). */
const CONFERE_SEM_TREM_MS = 400;
/** Fora da janela (rolou a página), o trem não é desenhado; volta com essa folga, em px. */
const FOLGA_DA_JANELA = 260;

/** As bolas da nuvem de vapor da virada: x, y (do meio do trem), raio, atraso. */
const NUVEM: readonly [number, number, number, number][] = [
  [-120, 10, 26, 0], [-60, -4, 32, 0.05], [0, -10, 38, 0], [60, -4, 32, 0.08], [120, 10, 26, 0.04],
  [-90, 30, 24, 0.1], [-30, 26, 30, 0.12], [30, 26, 30, 0.06], [90, 30, 24, 0.14],
];

interface Medidas extends MedidasDoTrilho { altura: number }

function medir(raiz: HTMLElement): Medidas | null {
  const topo = raiz.querySelector<HTMLElement>('[data-faixa-trem="topo"]');
  const fim = raiz.querySelector<HTMLElement>('[data-faixa-trem="fim"]');
  if (!fim) return null;
  const caixa = raiz.getBoundingClientRect();
  const meioX = (sel: string) => {
    const el = raiz.querySelector<HTMLElement>(sel);
    if (!el) return undefined;
    const r = el.getBoundingClientRect();
    return r.left - caixa.left + r.width / 2;
  };
  return {
    largura: raiz.clientWidth,
    altura: fim.offsetTop + fim.offsetHeight,
    yTopo: topo ? topo.offsetTop + topo.offsetHeight - TRILHO_NA_FAIXA : undefined,
    yFim: fim.offsetTop + fim.offsetHeight - TRILHO_NA_FAIXA,
    comprimentoTrem: COMPRIMENTO_TREM_PX,
    xEstacao: meioX('[data-trem-parada]'),
    xFimDaLinha: meioX('[data-trem-fim-da-linha]'),
    // O que já ocupa as faixas (o iglu): ali o trilho não põe enfeite.
    reservas: Array.from(raiz.querySelectorAll<HTMLElement>('[data-trem-reserva]')).map(el => {
      const r = el.getBoundingClientRect();
      return { x0: r.left - caixa.left, x1: r.right - caixa.left, y: r.bottom - caixa.top + raiz.scrollTop };
    }),
  };
}

function useMedidas(raiz: RefObject<HTMLElement>): Medidas | null {
  const [m, setM] = useState<Medidas | null>(null);
  useLayoutEffect(() => {
    /*
     * Recarregando a página, às vezes o trilho não aparecia (04/11/2026): a
     * camada podia montar antes de o `<main>` estar pronto (o ref ainda vazio,
     * ou a página ainda sem largura) e desistia de medir para sempre. Agora
     * ela espera o `<main>` aparecer e, de garantia, remede a cada
     * `REMEDIR_MS` — os observadores pegam quase tudo, mas página carregando
     * dado muda de altura por dentro.
     */
    let quadro = 0;
    let ro: ResizeObserver | null = null;
    let mo: MutationObserver | null = null;
    let intervalo = 0;
    const iniciar = () => {
      const el = raiz.current;
      if (!el || !el.clientWidth) { quadro = requestAnimationFrame(iniciar); return; }
      const refazer = () => {
        cancelAnimationFrame(quadro);
        quadro = requestAnimationFrame(() => {
          const nova = medir(el);
          if (!nova) return;
          setM(v => (v && JSON.stringify(v) === JSON.stringify(nova) ? v : nova));
        });
      };
      ro = new ResizeObserver(refazer);
      const observarFilhos = () => { ro!.disconnect(); ro!.observe(el); for (const f of Array.from(el.children)) ro!.observe(f); };
      observarFilhos();
      mo = new MutationObserver(() => { observarFilhos(); refazer(); });
      mo.observe(el, { childList: true });
      intervalo = window.setInterval(refazer, REMEDIR_MS);
      refazer();
    };
    iniciar();
    return () => { cancelAnimationFrame(quadro); ro?.disconnect(); mo?.disconnect(); window.clearInterval(intervalo); };
  }, [raiz]);
  return m;
}

/** Onde o centro do trem está no trilho desta aba. Parado na estação: o começo; no fim da linha: o fim. */
function distanciaAgora(trilho: Trilho, p: PosicaoDoTrem): number {
  if (p.fase === 'estacao') return 0;
  if (p.fase === 'fim') return trilho.comprimento;
  return distanciaNoTrecho(trilho, p.noTrecho, { volta: p.fase === 'volta', partindo: p.partindo, chegando: p.chegando });
}

/** Sentido em que a frente do trem aponta (+1 = ida). Na parada ele «vira» no meio da nuvem de vapor. */
function sentido(p: PosicaoDoTrem): 1 | -1 {
  if (p.fase === 'ida') return 1;
  if (p.fase === 'volta') return -1;
  const virou = p.noTrecho >= 0.6;
  return p.fase === 'estacao' ? (virou ? 1 : -1) : (virou ? -1 : 1);
}

export function CamadaDoTrem({ aba, rota, raiz, leve }: {
  aba: AbaDoTrem;
  rota: readonly AbaDoTrem[];
  raiz: RefObject<HTMLElement>;
  leve: boolean;
}) {
  const medidas = useMedidas(raiz);
  const trilho = useMemo(() => (medidas ? montarTrilho(medidas, SEGUNDOS_POR_PISTA) : null), [medidas]);
  const mascara = useId();

  // Passageiros: embarcam no compasso do sorteio da estação (`etapaDoSorteio`); meio segundo basta.
  const agoraLento = useRelogioDoTrem(500);
  const agenda = useAgendaDoTrem();
  const pos = ondeEsta(agoraLento, rota, agenda);
  const sorteados = usePassageiros(chaveDoSorteio(pos));
  // Fechado na estação, o trem espera vazio.
  const aBordo = pos.fechado ? 0 : pos.fase === 'estacao' ? quantosABordo(pos.noTrecho, sorteados?.length ?? 0) : 5;
  const fotos = useFotosResolvidas((sorteados ?? []).map(s => s.foto));
  const carrosRef = useRef<(SVGGElement | null)[]>([]);
  const chaveDosAssentos = Array.from({ length: 5 }, (_, i) => {
    const s = sorteados?.[i];
    return s && i < aBordo ? `${s.id}:${fotos[i] ?? ''}` : '-';
  }).join('|');
  /*
   * O relógio acima redesenha a camada duas vezes por segundo; o trem (centenas
   * de formas) e o cenário só mudam quando alguém embarca ou a página muda de
   * tamanho — então ficam guardados e o React nem olha para eles nesses quadros.
   */
  const desenhoDosCarros = useMemo(() => {
    const assentos: (PassageiroDoTrem | null)[] = Array.from({ length: 5 }, (_, i) => {
      const s = sorteados?.[i];
      return s && i < aBordo ? { id: s.id, nome: s.nome, setor: s.setor, foto: fotos[i] } : null;
    });
    return CARROS.map((c, i) => (
      <g key={c.id} ref={g => { carrosRef.current[i] = g; }}>
        <CarroDoTrem id={c.id} passageiros={assentos} />
      </g>
    ));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `chaveDosAssentos` resume sorteados, aBordo e fotos.
  }, [chaveDosAssentos]);

  const grupoTrem = useRef<SVGGElement>(null);
  const cenarioDesenhado = useMemo(() => trilho && (
    <>
      {trilho.atracoes.map(a => <AtracaoDoTrilho key={`${a.tipo}-${a.x}`} a={a} />)}
      {trilho.enfeites.map(e => <EnfeiteDoTrilho key={`${e.y}-${e.x}`} e={e} />)}
    </>
  ), [trilho]);
  const piscasDesenhados = useMemo(() => trilho?.piscas.map(p => <PiscaPiscaDoTrilho key={p.y} p={p} />), [trilho]);
  const nuvem = useRef<HTMLDivElement>(null);
  const [parado, setParado] = useState(false);
  const [sobre, setSobre] = useState<{ p: Sorteado; x: number; y: number } | null>(null);
  const mouse = useRef<{ x: number; y: number } | null>(null);
  const sorteadosRef = useRef(sorteados);
  sorteadosRef.current = sorteados;

  /*
   * Nenhuma faixa do trem à vista (a pessoa está no meio da página): o
   * pisca-pisca, o cenário e o trem param de animar até uma faixa voltar.
   */
  const camada = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = raiz.current;
    if (!el || !trilho) return;
    const faixas = Array.from(el.querySelectorAll<HTMLElement>('[data-faixa-trem]'));
    if (!faixas.length) return;
    const vistas = new Set<Element>();
    const obs = new IntersectionObserver(entradas => {
      for (const e of entradas) { if (e.isIntersecting) vistas.add(e.target); else vistas.delete(e.target); }
      camada.current?.classList.toggle('nt-camada-quieta', vistas.size === 0);
    }, { root: el, rootMargin: '120px 0px' });
    faixas.forEach(f => obs.observe(f));
    return () => obs.disconnect();
  }, [raiz, trilho]);

  // O movimento, os sons e o mouse, num quadro só.
  useEffect(() => {
    const el = raiz.current;
    if (!trilho || !el) return;
    let quadro = 0;
    let ultimoQuadro = 0;
    let anterior: PosicaoDoTrem | null = null;
    let sAnterior: number | null = null;
    let odometro = 0;
    let ultimaConferencia = 0;
    const atracoes = Array.from(el.querySelectorAll<SVGGElement>('.nt-trem-camada .nt-atracao'));
    // As rodas e a biela não mudam enquanto o trilho é o mesmo: procuradas uma vez só.
    const rodas = Array.from(grupoTrem.current?.querySelectorAll<SVGGElement>('.nt-trem-roda') ?? [])
      .map(roda => ({ roda, raio: Number(roda.dataset.raio) || 8 }));
    const biela = grupoTrem.current?.querySelector<SVGElement>('.nt-trem-biela') ?? null;
    let estavaAqui: boolean | null = null;
    let pausado: boolean | null = null;
    const meioTrem = COMPRIMENTO_TREM_PX / 2;
    const cenario = (s: number | null) => {
      for (const g of atracoes) {
        g.classList.toggle('perto', s !== null && Math.abs(s - Number(g.dataset.atracaoS)) < meioTrem + 170);
      }
    };

    const conferirMouse = () => {
      const m = mouse.current;
      if (!m) { setSobre(null); return; }
      const lista = sorteadosRef.current ?? [];
      for (const g of Array.from(el.querySelectorAll<SVGGElement>('.nt-trem-camada [data-passageiro]'))) {
        const r = g.querySelector<SVGCircleElement>('.nt-trem-foto')?.getBoundingClientRect();
        if (!r) continue;
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        if (Math.hypot(m.x - cx, m.y - cy) <= r.width / 2 + 2) {
          const p = lista[Number(g.dataset.passageiro)];
          if (p) { setSobre(v => (v?.p.id === p.id ? v : { p, x: cx, y: r.top })); return; }
        }
      }
      setSobre(null);
    };

    const passo = (t: number) => {
      quadro = requestAnimationFrame(passo);
      // Sem o trem nesta aba, nada se mexe: confere de vez em quando.
      const passoMin = estavaAqui === false ? CONFERE_SEM_TREM_MS : leve ? PASSO_MODO_LEVE_MS : 0;
      if (t - ultimoQuadro < passoMin) return;
      ultimoQuadro = t;
      const agora = relogioNatal();
      const p = ondeEsta(agora, rota, agendaAgora());
      const aquiAgora = p.aba === aba;
      // Escondido até ser posicionado (sem isso, no primeiro quadro ele aparecia grandão
      // no canto) e tirado do desenho com o trem em outra aba — as animações dele param.
      if (grupoTrem.current && estavaAqui !== aquiAgora) {
        grupoTrem.current.style.display = aquiAgora ? '' : 'none';
        grupoTrem.current.style.visibility = 'visible';
      }
      estavaAqui = aquiAgora;

      // Eventos (só com a mudança, nunca no primeiro quadro).
      if (anterior && aquiAgora) {
        if (anterior.fase === 'estacao' && p.fase === 'ida') buzina();
        if (anterior.fase === 'volta' && p.fase === 'estacao') sino(2);
        if (anterior.fase === 'ida' && p.fase === 'fim') sino(1);
      }
      const paradoAgora = p.fase === 'estacao' || p.fase === 'fim';
      if (!anterior || (anterior.fase === 'estacao' || anterior.fase === 'fim') !== paradoAgora) setParado(paradoAgora);
      // A nuvem de vapor da virada, no primeiro segundo e meio de cada parada.
      if (nuvem.current) nuvem.current.classList.toggle('nt-trem-nuvem-viva', aquiAgora && paradoAgora && p.noTrecho < 1.4);
      anterior = p;
      if (!aquiAgora) { sAnterior = null; cenario(null); return; }

      const s = distanciaAgora(trilho, p);
      cenario(s);
      const lado = sentido(p);
      const k = ESCALA_TREM;
      let centroNaTela: { x: number; y: number } | null = null;
      CARROS.forEach((c, i) => {
        const g = carrosRef.current[i];
        if (!g) return;
        const ponto = pontoNoTrilho(trilho, s + lado * MEIO_DOS_CARROS[i] * k);
        const rumo = ponto.angulo + (lado < 0 ? Math.PI : 0);
        const m = ladoDoCorpo(rumo);
        g.classList.toggle('nt-espelhado', m < 0);
        g.setAttribute('transform',
          `translate(${ponto.x.toFixed(1)} ${ponto.y.toFixed(1)}) rotate(${((rumo * 180) / Math.PI).toFixed(2)}) ` +
          `scale(${k} ${(k * m).toFixed(3)}) translate(${-c.comprimento / 2} ${-TRILHO_Y})`);
        if (i === 1) centroNaTela = ponto;
      });
      if (nuvem.current && centroNaTela) {
        const c = centroNaTela as { x: number; y: number };
        nuvem.current.style.transform = `translate(${c.x}px, ${c.y - 30}px) scale(0.6)`;
      }
      // Fora da janela (a pessoa rolou a página), as animações do trem param.
      const centro = centroNaTela as { x: number; y: number } | null;
      const longe = !!centro && (centro.y < el.scrollTop - FOLGA_DA_JANELA || centro.y > el.scrollTop + el.clientHeight + FOLGA_DA_JANELA);
      if (longe !== pausado) { grupoTrem.current?.classList.toggle('nt-trem-pausado', longe); pausado = longe; }

      // As rodas, pela distância andada (no quadro do carro, o trem anda sempre para a frente).
      if (sAnterior !== null) odometro += Math.abs(s - sAnterior);
      sAnterior = s;
      const grupo = grupoTrem.current;
      if (grupo && !leve && !longe) {
        let anguloGrande = 0;
        for (const { roda, raio: r } of rodas) {
          const graus = ((odometro / (r * k)) * 180) / Math.PI;
          roda.setAttribute('transform', `rotate(${(graus % 360).toFixed(1)})`);
          if (r > 10) anguloGrande = graus;
        }
        const a = (anguloGrande * Math.PI) / 180;
        biela
          ?.setAttribute('transform', `translate(${(2.2 * Math.cos(a)).toFixed(2)} ${(2.2 * Math.sin(a)).toFixed(2)})`);
      }

      if (t - ultimaConferencia > 120) { ultimaConferencia = t; conferirMouse(); }
    };
    quadro = requestAnimationFrame(passo);

    const aoMover = (e: MouseEvent) => { mouse.current = { x: e.clientX, y: e.clientY }; };
    const aoSair = () => { mouse.current = null; setSobre(null); };
    el.addEventListener('mousemove', aoMover);
    el.addEventListener('mouseleave', aoSair);
    return () => {
      cancelAnimationFrame(quadro);
      el.removeEventListener('mousemove', aoMover);
      el.removeEventListener('mouseleave', aoSair);
    };
  }, [trilho, rota, aba, raiz, leve]);

  if (!medidas || !trilho) return null;
  const { largura, altura } = medidas;
  const caminho = trilho.d;

  return (
    <div ref={camada} className="nt-trem-camada" style={{ height: altura }} aria-hidden="true">
      <svg width={largura} height={altura} className="block overflow-visible">
        <defs>
          <mask id={mascara} maskUnits="userSpaceOnUse" x={-200} y={-200} width={largura + 400} height={altura + 400}>
            <path d={caminho} fill="none" stroke="#fff" strokeWidth={11} strokeLinejoin="round" />
            <path d={caminho} fill="none" stroke="#000" strokeWidth={6.4} strokeLinejoin="round" />
          </mask>
        </defs>
        {cenarioDesenhado}
        {/* os dormentes e os dois trilhos */}
        <path d={caminho} fill="none" stroke="#8A5E3F" strokeWidth={16} strokeDasharray="4.5 7" />
        <path d={caminho} fill="none" stroke="#9AA3AE" strokeWidth={11} mask={`url(#${mascara})`} />
        {/* o pisca-pisca logo abaixo do trilho, em toda pista */}
        <g className={cn(leve && 'nt-trem-parado')}>
          {piscasDesenhados}
        </g>
        <g ref={grupoTrem} style={{ visibility: 'hidden' }} className={cn('nt-trem nt-trem-guiado', (parado || leve) && 'nt-trem-freado', leve && 'nt-trem-parado')}>
          {desenhoDosCarros}
        </g>
      </svg>
      <div ref={nuvem} className="nt-trem-nuvem">
        {NUVEM.map(([x, y, r, atraso], i) => (
          <span key={i} style={{ left: x - r, top: y - r, width: r * 2, height: r * 2, animationDelay: `${atraso}s` }} />
        ))}
      </div>
      {sobre && <CartaoPassageiro pessoa={sobre.p} x={sobre.x} y={sobre.y} legenda={`A bordo · viagem nº ${pos.viagem + 1}`} />}
    </div>
  );
}

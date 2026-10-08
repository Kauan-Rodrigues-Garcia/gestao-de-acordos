/**
 * cena.tsx — o que a Caça aos Zumbis desenha: o zumbi escondido, a morte dele,
 * o recado de quem atirou e a faixa com o nome de quem matou.
 *
 * Baixado só quando há o que mostrar (ver `index.tsx`): quem passa o dia sem
 * zumbi não paga por este pedaço — nem pela física.
 *
 * ## O tiro (Cleber, 07/10/2026)
 *
 * O zumbi é pequeno de propósito e o tiro é de mira: vale o pixel em que o
 * clique caiu (com um de tolerância), não a caixa. Clique no fundo entre o
 * braço e a perna é tiro na parede — o zumbi continua ali. Na cabeça, é
 * HEADSHOT: a cabeça estoura. No corpo, o corpo estoura e a cabeça cai numa
 * poça. Quem perde a corrida vê o próprio tiro do mesmo jeito; quem não
 * atirou vê o zumbi morrer como o vencedor matou (o banco conta se foi
 * headshot).
 *
 * ## Andando e preso à página (Cleber, 07/10/2026)
 *
 * Depois de sair da cova, o zumbi anda devagar para um lado e para o outro,
 * parando de vez em quando — a direção é sorteada na tela de cada um. Ele, a
 * morte e a mancha que fica moram na camada do conteúdo (`camada.ts`): rolar a
 * página leva todos junto.
 *
 * ## Sons (08/10/2026)
 *
 * `sons.ts`, para todo mundo, sempre: o gemido baixinho da saída da cova, o tiro, o cérebro
 * estourando no headshot, o respingo no corpo, os baques. Não depende do Som
 * ambiente do Halloween (Cleber).
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent, type Ref, type WheelEvent } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { carregarFontesPixel } from '@/components/Halloween/fonte';
import { acharEsconderijo, caixaLivre } from './esconderijo';
import { formatarTempo, nomeCurto, pegarAbobora, type RodadaAbobora } from './caca';
import {
  ALTURA, LARGURA, MS_POR_PASSO, MS_POR_QUADRO, NUMERO_DA_PARTE, PRIMEIRO_PASSO, TODOS_OS_QUADROS,
  centroDaParte, montarQuadro, parteNoPonto, zumbiDaRodada, type Zumbi,
} from './zumbis';
import {
  APAGA_S, ORIGEM_X, ORIGEM_Y, PALCO_A, PALCO_L, acabou, avancar, criarMorte, desenharChao, desenharResto,
  type Evento, type Tiro,
} from './fisica';
import {
  somAcerto, somBaque, somCerebro, somCrava, somGemido, somPlof, somPop, somRicochete, somTiro,
} from './sons';
import { pegarCamada, type Camada } from './camada';
import { SpriteZumbi } from './SpriteZumbi';
import { quadrosDoZumbi } from './pixels';
import './caca.css';

/** Cada pixel da arte vira 2×2 na tela: inteiro, nunca borra. */
const ESCALA = 2;
const L_ZUMBI = LARGURA * ESCALA;
const A_ZUMBI = ALTURA * ESCALA;
/** O esconderijo procura um quadrado livre deste lado; o zumbi fica no meio dele. */
const LADO = A_ZUMBI;
/** De quanto em quanto tempo o zumbi confere se o lugar continua livre. */
const CONFERE_MS = 1_500;

function palco(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-palco-abobora]');
}

// ── Ícones em pixel ─────────────────────────────────────────────────────────

const ICONES = {
  caveira: ['.wwwww.', 'wwwwwww', 'wkwwwkw', 'wkwwwkw', 'wwwkwww', '.wwwww.', '.w.w.w.'],
  mira:    ['...w...', '.wwwww.', '.w...w.', 'ww.w.ww', '.w...w.', '.wwwww.', '...w...'],
  raio:    ['...yy', '..yy.', '.yyyy', '...yy', '..yy.', '.yy..', '.y...'],
} as const;
const CORES_ICONE: Record<string, string> = { w: 'currentColor', k: 'transparent', y: 'currentColor' };

function IconePixel({ nome, tam = 2, className }: { nome: keyof typeof ICONES; tam?: number; className?: string }) {
  const linhas = ICONES[nome];
  const w = linhas[0].length, h = linhas.length;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w * tam} height={h * tam} shapeRendering="crispEdges" className={className} aria-hidden="true">
      {linhas.flatMap((l, j) => [...l].map((c, i) => (c === '.' || CORES_ICONE[c] === 'transparent'
        ? null
        : <rect key={`${i}-${j}`} x={i} y={j} width={1} height={1} fill={CORES_ICONE[c]} />)))}
    </svg>
  );
}

// ── O recado de quem atirou ─────────────────────────────────────────────────

type Recado =
  | { tipo: 'ganhou'; ms: number | null; headshot: boolean; rapida: boolean; headshotRapido: boolean; zumbi: Zumbi }
  | { tipo: 'perdeu'; nome: string | null; sumiu: boolean; zumbi: Zumbi };

function RecadoDoTiro({ recado }: { recado: Recado }) {
  return createPortal(
    <div className={`zb-recado${recado.tipo === 'ganhou' && recado.headshot ? ' zb-recado-hs' : ''}`} role="status">
      <SpriteZumbi zumbi={recado.zumbi} soCabeca morta escala={2} className="zb-recado-cabeca" />
      {recado.tipo === 'ganhou' ? (
        <div>
          <b>{recado.headshot ? 'HEADSHOT!' : 'ZUMBI ABATIDO!'}</b>
          <span>
            Você matou o zumbi primeiro, em <span className="zb-mono">{formatarTempo(recado.ms)}</span>.
            Seu nome está passando na faixa para todo mundo.
          </span>
          {(recado.rapida || recado.headshotRapido) && (
            <span className="zb-recado-recordes">
              {recado.rapida && <span className="zb-tag zb-tag-rapido"><IconePixel nome="raio" />Mais rápido do dia</span>}
              {recado.headshotRapido && <span className="zb-tag zb-tag-hs-rapido"><IconePixel nome="mira" />Headshot mais rápido do dia</span>}
            </span>
          )}
        </div>
      ) : (
        <div>
          <b>{recado.sumiu ? 'TARDE DEMAIS...' : 'POR POUCO!'}</b>
          <span>
            {recado.sumiu || !recado.nome
              ? 'Ele já tinha voltado para a cova. Fique de olho: o próximo aparece mais tarde.'
              : <><b className="zb-recado-nome">{nomeCurto(recado.nome)}</b> matou o zumbi primeiro.</>}
          </span>
        </div>
      )}
    </div>,
    document.body,
  );
}

// ── A camada (o zumbi rola com a página) ────────────────────────────────────

function useCamada(): Camada | null {
  const [camada, setCamada] = useState<Camada | null>(null);
  useEffect(() => {
    const p = palco();
    if (!p) return;
    const { camada: c, soltar } = pegarCamada(p);
    setCamada(c);
    return soltar;
  }, []);
  return camada;
}

// ── A morte, com física ─────────────────────────────────────────────────────

interface Morte {
  tiro: Tiro;
  impacto: { x: number; y: number };
  quadro: number;
  /** Para que lado o zumbi olhava (-1 = esquerda). */
  lado: number;
}

/**
 * Quanto tempo a mancha fica no chão depois da morte, apagada, como resquício
 * de que morreu um zumbi ali (Cleber, 07/10/2026 — «um tempinho»).
 */
const RESQUICIO_MS = 3 * 60_000;
/** O apagar da mancha no fim — o mesmo do CSS `.zb-palco-chao.some`. */
const SOME_MS = 1_200;

/**
 * O palco da morte: dois canvas transparentes em volta do zumbi, com o chão na
 * linha dos pés. Em cima, o que voa e o que cai — apaga no fim da cena. Embaixo,
 * as poças e os respingos — ficam, mais claros, por `RESQUICIO_MS`.
 * Não pegam clique. Em coordenadas do conteúdo: rolam com a página.
 */
function PalcoDaMorte({ camada, zumbi, morte, x, y, aoAcabar }: {
  camada: Camada; zumbi: Zumbi; morte: Morte; x: number; y: number; aoAcabar: () => void;
}) {
  const chaoRef = useRef<HTMLCanvasElement>(null);
  const restoRef = useRef<HTMLCanvasElement>(null);
  const [etapa, setEtapa] = useState<'cena' | 'resquicio' | 'some'>('cena');
  const fim = useRef(aoAcabar);
  fim.current = aoAcabar;

  useEffect(() => {
    const cChao = chaoRef.current?.getContext('2d');
    const cResto = restoRef.current?.getContext('2d');
    if (!cChao || !cResto) return;
    const cena = criarMorte(zumbi, morte.quadro, morte.tiro, morte.impacto);
    const bufChao = new Uint32Array(PALCO_L * PALCO_A);
    const bufResto = new Uint32Array(PALCO_L * PALCO_A);
    const imgChao = new ImageData(new Uint8ClampedArray(bufChao.buffer), PALCO_L, PALCO_A);
    const imgResto = new ImageData(new Uint8ClampedArray(bufResto.buffer), PALCO_L, PALCO_A);
    let antes = performance.now();
    let quadro = 0;
    let avisou = false;
    const rodar = (agora: number) => {
      avancar(cena, (agora - antes) / 1000);
      antes = agora;
      for (const e of cena.eventos.splice(0)) tocarEvento(e);
      desenharChao(cena, bufChao);
      desenharResto(cena, bufResto);
      cChao.putImageData(imgChao, 0, 0);
      cResto.putImageData(imgResto, 0, 0);
      if (!avisou && cena.t >= APAGA_S) { avisou = true; setEtapa('resquicio'); }
      if (acabou(cena)) return;
      quadro = requestAnimationFrame(rodar);
    };
    quadro = requestAnimationFrame(rodar);
    return () => cancelAnimationFrame(quadro);
  }, [zumbi, morte]);

  // O resquício fica um tempo e apaga.
  useEffect(() => {
    const some = setTimeout(() => setEtapa('some'), RESQUICIO_MS);
    const acaba = setTimeout(() => fim.current(), RESQUICIO_MS + SOME_MS);
    return () => { clearTimeout(some); clearTimeout(acaba); };
  }, []);

  const estilo: CSSProperties = {
    left: x - ORIGEM_X * ESCALA,
    top: y - ORIGEM_Y * ESCALA,
    width: PALCO_L * ESCALA,
    height: PALCO_A * ESCALA,
    transform: morte.lado < 0 ? 'scaleX(-1)' : undefined,
  };
  return createPortal(
    <>
      <canvas
        ref={chaoRef}
        width={PALCO_L}
        height={PALCO_A}
        className={`zb-palco zb-palco-chao${etapa !== 'cena' ? ' resquicio' : ''}${etapa === 'some' ? ' some' : ''}`}
        style={estilo}
        aria-hidden="true"
      />
      <canvas
        ref={restoRef}
        width={PALCO_L}
        height={PALCO_A}
        className={etapa === 'cena' ? 'zb-palco' : 'zb-palco apagando'}
        style={estilo}
        aria-hidden="true"
      />
    </>,
    camada.folha,
  );
}

/** O baque que soou por último: vinte peças batendo juntas não viram metralhadora. */
let ultimoBaque = 0;

function tocarEvento(e: Evento): void {
  if (e.tipo === 'crava') somCrava();
  else if (e.tipo === 'pop') somPop();
  else if (e.tipo === 'plof') somPlof();
  else {
    const agora = performance.now();
    if (agora - ultimoBaque < 70) return;
    ultimoBaque = agora;
    somBaque(e.forca);
  }
}

/** O letreiro que sobe da cabeça estourada. */
function LetreiroHeadshot({ camada, x, y }: { camada: Camada; x: number; y: number }) {
  return createPortal(
    <div className="zb-letreiro" style={{ left: x, top: y }} aria-hidden="true">HEADSHOT!</div>,
    camada.folha,
  );
}

/** O tiro que pegou na parede: um furo e um pouco de poeira. */
function furo(x: number, y: number) {
  somTiro();
  somRicochete();
  const el = document.createElement('div');
  el.className = 'zb-furo';
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 700);
}

// ── O zumbi escondido ───────────────────────────────────────────────────────

/** Onde o zumbi está: a caixa (quadrado de lado `LADO`), em coordenadas do conteúdo. */
interface Lugar { x: number; y: number }

/**
 * Depois de posto, quanto tempo ele ainda pode trocar de canto se a tela
 * terminar de carregar algo clicável por cima. Passado isso, fica onde está.
 */
const ASSENTAR_MS = 6_000;

/** Quanto ele sobe da cova antes de começar a andar (a subida do CSS é 0,85 s). */
const SUBIDA_MS = 1_100;

/**
 * Até onde ele anda para cada lado do lugar onde nasceu. A ronda é medida na
 * hora, de 8 em 8 px, com a mesma régua do esconderijo: só onde não há botão
 * nem nada clicável. Com tela cheia, a ronda encolhe — ou ele fica parado.
 */
const ALCANCE = 112;
const PASSO_DA_RONDA = 8;

/** Quanto tempo anda e quanto tempo para, sorteado a cada vez. */
const ANDA_MS: readonly [number, number] = [2_200, 5_000];
const PARA_MS: readonly [number, number] = [900, 2_400];

type Fase = 'vivo' | 'morrendo' | 'afundando';

interface Andar {
  /** Posição da caixa no conteúdo (x muda; y é o do nascimento). */
  x: number;
  /** 1 = para a direita, -1 = para a esquerda. É também para onde ele olha. */
  lado: number;
  modo: 'parado' | 'andando';
  /** Até quando fica neste modo (Date.now()). */
  ate: number;
  /** O passo na animação (o pé que está à frente). */
  passo: number;
}

const sortear = ([a, b]: readonly [number, number]) => a + Math.random() * (b - a);

/** A ronda em volta de `x` (coordenadas da janela): quanto dá para andar para cada lado. */
function medirRonda(p: HTMLElement, x: number, y: number, propria: Element | null): { min: number; max: number } {
  const livre = (nx: number) => caixaLivre({ x: nx, y, lado: LADO }, p, propria, 4, undefined, false);
  let min = 0, max = 0;
  for (let d = PASSO_DA_RONDA; d <= ALCANCE && livre(x - d); d += PASSO_DA_RONDA) min = -d;
  for (let d = PASSO_DA_RONDA; d <= ALCANCE && livre(x + d); d += PASSO_DA_RONDA) max = d;
  return { min, max };
}

function ZumbiEscondido({ camada, rodada, aoAtirar, aoAcabar }: {
  camada: Camada;
  rodada: RodadaAbobora;
  aoAtirar: (r: Recado) => void;
  aoAcabar: () => void;
}) {
  const zumbi = zumbiDaRodada(rodada);
  /** Onde nasceu, e até onde pode andar (no conteúdo). */
  const [lugar, setLugar] = useState<(Lugar & { min: number; max: number }) | null>(null);
  /** Onde está agora e para onde olha — muda a cada passo. */
  const [agora, setAgora] = useState<{ x: number; lado: number } | null>(null);
  const [fase, setFase] = useState<Fase>('vivo');
  const [morte, setMorte] = useState<Morte | null>(null);
  const [letreiro, setLetreiro] = useState(false);
  // Muda a cada troca de lugar: remonta o zumbi e ele sobe da terra de novo.
  const [vez, setVez] = useState(0);
  const caixaRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const quadroRef = useRef(0);
  const andar = useRef<Andar | null>(null);
  const atirou = useRef(false);
  const gemeu = useRef(false);
  const tentativa = useRef(0);
  const postoEm = useRef(0);
  const { pathname } = useLocation();

  const colocar = useCallback((avancarSequencia: boolean) => {
    const p = camada.palco;
    if (avancarSequencia) tentativa.current += 1;
    const achado = acharEsconderijo(p, rodada.semente, LADO, tentativa.current, caixaRef.current);
    if (!achado) { setLugar(null); setAgora(null); return; }
    const ronda = medirRonda(p, achado.x, achado.y, caixaRef.current);
    const c = camada.paraConteudo(achado.x, achado.y);
    // A direção é sorteada na tela de cada um (Cleber: «aleatório para cada pessoa»).
    const lado = Math.random() < 0.5 ? -1 : 1;
    andar.current = { x: c.x, lado, modo: 'parado', ate: Date.now() + SUBIDA_MS, passo: 0 };
    quadroRef.current = 0;
    postoEm.current = Date.now();
    setLugar({ x: c.x, y: c.y, min: c.x + ronda.min, max: c.x + ronda.max });
    setAgora({ x: c.x, lado });
    setVez(v => v + 1);
    // O gemido é de quando ele sai da cova, não de cada troca de canto.
    if (!gemeu.current) { gemeu.current = true; somGemido(); }
  }, [camada, rodada.semente]);

  // Chega meio segundo depois do aviso: a tela termina de assentar.
  useEffect(() => {
    const t = setTimeout(() => colocar(false), 450);
    return () => clearTimeout(t);
  }, [colocar]);

  // Trocou de tela: vivo, procura outro canto na tela nova; morto, a mancha
  // era da tela de antes e sai junto.
  const primeiraRota = useRef(true);
  useEffect(() => {
    if (primeiraRota.current) { primeiraRota.current = false; return; }
    if (fase === 'morrendo') { aoAcabar(); return; }
    if (fase !== 'vivo') return;
    const t = setTimeout(() => colocar(true), 900);
    return () => clearTimeout(t);
    // Só a troca de tela dispara; a fase é lida no momento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Janela de outro tamanho: o conteúdo se rearruma; procura outro canto.
  useEffect(() => {
    if (fase !== 'vivo') return;
    let espera: ReturnType<typeof setTimeout> | undefined;
    const aoRedimensionar = () => { clearTimeout(espera); espera = setTimeout(() => colocar(true), 300); };
    window.addEventListener('resize', aoRedimensionar);
    return () => { clearTimeout(espera); window.removeEventListener('resize', aoRedimensionar); };
  }, [colocar, fase]);

  // Sem lugar: tenta de novo. Logo depois de posto, se a lista terminou de
  // carregar por cima dele, muda de canto uma vez.
  useEffect(() => {
    if (fase !== 'vivo') return;
    const t = setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      if (!lugar) { colocar(true); return; }
      if (Date.now() - postoEm.current > ASSENTAR_MS || !andar.current) return;
      const v = camada.paraTela(andar.current.x, lugar.y);
      if (!caixaLivre({ x: v.x, y: v.y, lado: LADO }, camada.palco, caixaRef.current)) colocar(true);
    }, CONFERE_MS);
    return () => clearInterval(t);
  }, [lugar, fase, colocar, camada]);

  // A vida do zumbi: sobe, fica um pouco, anda devagar, para, vira, anda de
  // novo — sempre dentro da ronda. Um passo de cada vez; o quadro na tela é
  // sempre conhecido (o tiro pergunta em que pixel caiu NESTE quadro).
  useEffect(() => {
    if (!lugar || fase !== 'vivo') return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const quadros = quadrosDoZumbi(zumbi);
    let t: ReturnType<typeof setTimeout>;
    const pintar = () => ctx.putImageData(quadros[quadroRef.current], 0, 0);
    pintar();
    const passo = () => {
      const a = andar.current;
      if (a && document.visibilityState !== 'hidden') {
        const hora = Date.now();
        if (hora >= a.ate) {
          if (a.modo === 'parado' && lugar.max > lugar.min) {
            a.modo = 'andando';
            a.ate = hora + sortear(ANDA_MS);
            // De vez em quando muda de ideia antes de chegar ao fim.
            if (Math.random() < 0.3) a.lado = -a.lado;
          } else {
            a.modo = 'parado';
            a.ate = hora + sortear(PARA_MS);
          }
        }
        if (a.modo === 'andando') {
          let nx = a.x + a.lado * ESCALA;
          if (nx < lugar.min || nx > lugar.max) {
            // Fim da ronda: vira e respira antes de voltar.
            a.lado = -a.lado;
            a.modo = 'parado';
            a.ate = hora + sortear(PARA_MS);
            nx = a.x;
          }
          a.x = nx;
          a.passo = (a.passo + 1) % 4;
          quadroRef.current = a.modo === 'andando' ? PRIMEIRO_PASSO + a.passo : 0;
        } else {
          quadroRef.current = (quadroRef.current + 1) % PRIMEIRO_PASSO;
        }
        pintar();
        setAgora(v => (v && v.x === a.x && v.lado === a.lado ? v : { x: a.x, lado: a.lado }));
      }
      t = setTimeout(passo, andar.current?.modo === 'andando' ? MS_POR_PASSO : MS_POR_QUADRO);
    };
    t = setTimeout(passo, MS_POR_QUADRO);
    return () => clearTimeout(t);
  }, [lugar, vez, fase, zumbi]);

  const morrer = useCallback((tiro: Tiro, impacto: { x: number; y: number }) => {
    if (tiro === 'cabeca') somCerebro(); else somAcerto();
    setMorte({ tiro, impacto, quadro: quadroRef.current, lado: andar.current?.lado ?? 1 });
    setFase('morrendo');
    if (tiro === 'cabeca') setLetreiro(true);
  }, []);

  // Outra pessoa matou, ou ele voltou para a cova: a tela de quem não atirou
  // vê o fim do mesmo jeito.
  useEffect(() => {
    if (atirou.current || fase !== 'vivo') return;
    if (rodada.situacao === 'achada') {
      if (!lugar) { aoAcabar(); return; }
      const tiro: Tiro = rodada.headshot ? 'cabeca' : 'corpo';
      const img = montarQuadro(zumbi, TODOS_OS_QUADROS[quadroRef.current]);
      morrer(tiro, centroDaParte(img, NUMERO_DA_PARTE[tiro === 'cabeca' ? 'cabeca' : 'tronco']));
    } else if (rodada.situacao === 'sumiu') {
      if (!lugar) { aoAcabar(); return; }
      setFase('afundando');
    }
  }, [rodada.situacao, rodada.headshot, fase, lugar, zumbi, morrer, aoAcabar]);

  useEffect(() => {
    if (fase !== 'afundando') return;
    const t = setTimeout(aoAcabar, 1_200);
    return () => clearTimeout(t);
  }, [fase, aoAcabar]);

  useEffect(() => {
    if (!letreiro) return;
    const t = setTimeout(() => setLetreiro(false), 1_400);
    return () => clearTimeout(t);
  }, [letreiro]);

  async function atirar(e: MouseEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (fase !== 'vivo' || atirou.current) return;
    const r = e.currentTarget.getBoundingClientRect();
    let sx = Math.floor((e.clientX - r.left) / ESCALA);
    const sy = Math.floor((e.clientY - r.top) / ESCALA);
    if ((andar.current?.lado ?? 1) < 0) sx = LARGURA - 1 - sx;
    const parte = parteNoPonto(montarQuadro(zumbi, TODOS_OS_QUADROS[quadroRef.current]), sx, sy);
    if (!parte) { furo(e.clientX, e.clientY); return; }

    atirou.current = true;
    const tiro: Tiro = parte === NUMERO_DA_PARTE.cabeca ? 'cabeca' : 'corpo';
    somTiro();
    morrer(tiro, { x: sx, y: sy });
    const res = await pegarAbobora(rodada.id, tiro === 'cabeca');
    if (res.erro) {
      toast.error('O tiro não chegou', { description: res.erro });
      return;
    }
    const rr = res.rodada;
    aoAtirar(res.ganhou
      ? {
        tipo: 'ganhou', ms: rr?.ms ?? null, headshot: tiro === 'cabeca', zumbi,
        rapida: !!rr?.mais_rapida_do_dia, headshotRapido: !!rr?.headshot_mais_rapido_do_dia,
      }
      : { tipo: 'perdeu', nome: rr?.achada_por_nome ?? null, sumiu: rr?.situacao !== 'achada', zumbi });
  }

  // A rodinha do mouse em cima do zumbi rola a página, como em qualquer canto.
  function rolar(e: WheelEvent<HTMLDivElement>) {
    camada.palco.scrollBy({ left: e.deltaX, top: e.deltaY });
  }

  if (!lugar || !agora) return null;
  const esquerda = agora.x + (LADO - L_ZUMBI) / 2;
  return (
    <>
      {fase !== 'morrendo' && createPortal(
        <div
          key={vez}
          ref={caixaRef}
          // Caça é de olho: a tecla Tab não entrega o esconderijo.
          tabIndex={-1}
          role="button"
          className={fase === 'afundando' ? 'zb-zumbi afunda' : 'zb-zumbi'}
          style={{ left: esquerda, top: lugar.y, width: L_ZUMBI, height: A_ZUMBI }}
          aria-label={`Um zumbi! Atire: ${zumbi.nome.replace(/^(o|a) /, '')}`}
          onClick={atirar}
          onWheel={rolar}
        >
          {/* Virar fica numa camada só dele: a subida da cova e o afundar
              animam o `transform` do canvas, e animação passa por cima do
              estilo — o zumbi andava para a esquerda olhando para a direita. */}
          <span className="zb-zumbi-vira" style={{ transform: agora.lado < 0 ? 'scaleX(-1)' : undefined }}>
            <canvas
              ref={canvasRef}
              width={LARGURA}
              height={ALTURA}
              className="zb-zumbi-sprite"
              style={{ width: L_ZUMBI, height: A_ZUMBI }}
            />
          </span>
        </div>,
        camada.folha,
      )}
      {fase === 'morrendo' && morte && (
        <PalcoDaMorte camada={camada} zumbi={zumbi} morte={morte} x={esquerda} y={lugar.y} aoAcabar={aoAcabar} />
      )}
      {letreiro && <LetreiroHeadshot camada={camada} x={esquerda + L_ZUMBI / 2} y={lugar.y - 4} />}
    </>
  );
}

/**
 * O zumbi (quando há um solto, e até o fim da morte dele) e o recado de quem
 * atirou — o recado sobrevive ao zumbi.
 */
export function CenaCaca({ rodada, naTela }: { rodada: RodadaAbobora | null; naTela: boolean }) {
  const [recado, setRecado] = useState<Recado | null>(null);
  // O zumbi que está na tela (vivo ou morrendo). Fica até a cena dele acabar,
  // mesmo que a rodada já tenha virado «achada».
  const [mostrando, setMostrando] = useState<RodadaAbobora | null>(null);
  // Zumbi que já morreu (ou afundou) nesta tela não volta — nem se a resposta
  // do banco demorar e a rodada ainda chegar como «solta».
  const acabados = useRef(new Set<number>());

  const camada = useCamada();

  useEffect(() => { carregarFontesPixel(); }, []);

  useEffect(() => {
    if (rodada && naTela && rodada.situacao === 'solta' && !acabados.current.has(rodada.id)) {
      setMostrando(m => (m && m.id === rodada.id ? m : rodada));
    }
  }, [rodada, naTela]);

  useEffect(() => {
    if (!recado) return;
    const t = setTimeout(() => setRecado(null), 5_200);
    return () => clearTimeout(t);
  }, [recado]);

  const acabar = useCallback(() => {
    setMostrando(m => { if (m) acabados.current.add(m.id); return null; });
  }, []);

  // A versão mais nova da rodada que está na tela; se o folga do relógio
  // venceu sem aviso do banco, ela «sumiu» daqui.
  let atual = mostrando && rodada && rodada.id === mostrando.id ? rodada : mostrando;
  if (atual && atual.situacao === 'solta' && !naTela && rodada?.id === atual.id) atual = { ...atual, situacao: 'sumiu' };

  return (
    <>
      {atual && camada && <ZumbiEscondido key={atual.id} camada={camada} rodada={atual} aoAtirar={setRecado} aoAcabar={acabar} />}
      {recado && <RecadoDoTiro recado={recado} />}
    </>
  );
}

// ── A faixa ─────────────────────────────────────────────────────────────────

/** Velocidade da faixa, em px por segundo. */
const VELOCIDADE = 70;

function UmRecado({ rodada }: { rodada: RodadaAbobora }) {
  const [semFoto, setSemFoto] = useState(false);
  const foto = rodada.achada_por_foto && !semFoto ? rodada.achada_por_foto : null;
  return (
    <span className="zb-faixa-recado">
      <SpriteZumbi zumbi={zumbiDaRodada(rodada)} soCabeca morta escala={2} className="zb-faixa-cabeca" />
      {foto && (
        <img src={foto} alt="" className="zb-faixa-foto" loading="eager" onError={() => setSemFoto(true)} />
      )}
      <span className="zb-faixa-nome">{nomeCurto(rodada.achada_por_nome)}</span>
      {rodada.headshot && <span className="zb-tag zb-tag-hs"><IconePixel nome="mira" />Headshot</span>}
      <span>matou o zumbi primeiro, em</span>
      <span className="zb-faixa-tempo">{formatarTempo(rodada.ms)}</span>
      {rodada.mais_rapida_do_dia && <span className="zb-tag zb-tag-rapido"><IconePixel nome="raio" />Mais rápido do dia</span>}
      {rodada.headshot_mais_rapido_do_dia && (
        <span className="zb-tag zb-tag-hs-rapido"><IconePixel nome="mira" />Headshot mais rápido do dia</span>
      )}
      <IconePixel nome="caveira" className="zb-faixa-caveira" />
    </span>
  );
}

/**
 * O letreiro: o recado passa sem parar enquanto a faixa estiver aberta (10 min,
 * ver `FAIXA_MS`). Dois grupos iguais, um atrás do outro, correndo meia volta:
 * quando o primeiro sai inteiro, o segundo está exatamente onde ele começou, e
 * o laço não tem emenda. Cada grupo tem cópias bastantes para cobrir a largura
 * da janela.
 */
export function FaixaAbobora({ rodada }: { rodada: RodadaAbobora }) {
  const grupoRef = useRef<HTMLDivElement>(null);
  const [copias, setCopias] = useState(3);
  const [duracao, setDuracao] = useState(30);

  useEffect(() => { carregarFontesPixel(); }, []);

  useLayoutEffect(() => {
    const medir = () => {
      const g = grupoRef.current;
      const um = g?.firstElementChild as HTMLElement | null;
      if (!g || !um || um.offsetWidth === 0) return;
      const precisa = Math.max(2, Math.ceil(window.innerWidth / um.offsetWidth) + 1);
      if (precisa !== copias) { setCopias(precisa); return; }
      setDuracao(Math.max(12, g.offsetWidth / VELOCIDADE));
    };
    medir();
    // A fonte chega depois e muda a largura.
    void document.fonts?.ready.then(medir);
    window.addEventListener('resize', medir);
    return () => window.removeEventListener('resize', medir);
  }, [copias, rodada]);

  const grupo = (ref?: Ref<HTMLDivElement>) => (
    <div className="zb-faixa-grupo" ref={ref}>
      {Array.from({ length: copias }, (_, i) => <UmRecado key={i} rodada={rodada} />)}
    </div>
  );

  const frase = `${rodada.achada_por_nome ?? 'Alguém'} matou o zumbi primeiro`
    + (rodada.headshot ? ', com um headshot,' : '')
    + ` em ${formatarTempo(rodada.ms)}`
    + (rodada.mais_rapida_do_dia ? ' — o mais rápido do dia' : '')
    + (rodada.headshot_mais_rapido_do_dia ? ' — o headshot mais rápido do dia' : '')
    + '.';

  return (
    <div className="zb-faixa">
      <span className="sr-only" role="status">{frase}</span>
      <div className="zb-faixa-trilho" aria-hidden="true" style={{ '--zb-dur': `${duracao}s` } as CSSProperties}>
        {grupo(grupoRef)}
        {grupo()}
      </div>
    </div>
  );
}

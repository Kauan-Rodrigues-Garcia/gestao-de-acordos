/**
 * BolaDaSaudacao — no Natal, o sólido da saudação (`FormaSaudacao`) vira uma
 * bola de árvore pendurada no varal de luzes do alto (Cleber, 29/10/2026).
 *
 * A bola gira de verdade: é um globo em Canvas 2D, com as faixas douradas e os
 * flocos presos na superfície. Eles somem atrás da curva e encurtam perto da
 * borda, como num enfeite girando no fio. O brilho e a sombra ficam parados,
 * porque é a luz da sala, não a bola. O clique dá um giro forte, que vai
 * perdendo força, e um empurrão no balanço.
 *
 * Com o trenzinho na tela, o fio sai do trilho da estação, logo acima (desde
 * 04/11/2026: a estação entrou entre o varal e a saudação, e o fio ficava
 * comprido demais). Sem ele, o fio sobe até o varal: a bola mede onde o fio do varal passa em cima dela
 * (`varal.ts`, a mesma curva que o desenha) e estica a linha até lá. As bolas
 * de enfeite do varal que caírem em cima dela ficam escondidas enquanto ela
 * está na tela, para não penduradas duas no mesmo lugar.
 *
 * Puxar a bola estica o fio até ele arrebentar: aí ela sai na mão, quica e dá
 * para brincar com ela por uns segundos (`BolaSolta`, mais abaixo).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { VAO, naCurva } from './varal';
import { Cesta } from './cesta/Cesta';
import {
  ajudarNaMira, baterNaPonta, frearNaRede, largouDeLonge, passouPeloAro, posicaoDoAro, subiuPeloAro,
  velocidadeDoArremesso, type Amostra,
} from './cesta/fisica';
import { mirar, sortearErro, T_PEGA, T_SOLTA, type Lado } from './cesta/arremesso';
import { bonecoDaCesta, type BonecoNaCesta } from './cesta/boneco';
import { prepararSomDaCesta, somDaCesta, somDoArremessoDoBoneco, somDoAro, somDoBonecoPegando } from './cesta/som';
import { Confete } from './presente/Confete';
import './saudacao.css';

/** A bola tem o diâmetro da linha da saudação (`text-2xl`, 32 px). */
const RAIO = 16;
const LARGURA = 40;
const ALTURA = 48;
const CX = LARGURA / 2;
const CY = 29;
/** Onde o fio prende: o meio da argola, no alto do canvas. */
const ARGOLA_Y = 5;
/*
 * O alinhamento com o texto: o título centraliza a caixa de margem de cada
 * item, e o centro da bola não é o meio do canvas (a argola fica em cima).
 * As margens negativas fazem o meio da caixa de margem cair em `CY`, e o
 * canvas não aumenta a altura da linha.
 */
const MARGEM_BAIXO = 6;
const MARGEM_CIMA = 2 * CY - ALTURA + MARGEM_BAIXO;

/** Giro de repouso e o do clique (rad/s), e quanto o clique perde por segundo. */
const GIRO_BASE = 0.85;
const GIRO_CLIQUE = 11;
const FREIO = 1.1;
/** A bola é vista um pouco de cima: o eixo inclina para quem olha. */
const INCLINACAO = 0.28;

/** A mesma escolha de movimento do CreatorsLab que a `FormaSaudacao` respeita. */
function movimentoReduzido(): boolean {
  try { return localStorage.getItem('creatorsLab:movimento') === 'reduzido'; }
  catch { return false; }
}

/** Projeta um ponto da superfície (latitude, longitude já girada). */
function projetar(lat: number, lon: number) {
  const X = Math.cos(lat) * Math.sin(lon);
  const Y = Math.sin(lat);
  const Z = Math.cos(lat) * Math.cos(lon);
  const y = Y * Math.cos(INCLINACAO) - Z * Math.sin(INCLINACAO);
  const z = Z * Math.cos(INCLINACAO) + Y * Math.sin(INCLINACAO);
  return { x: CX + RAIO * X, y: CY - RAIO * y, z, X };
}

function desenhar(cx: CanvasRenderingContext2D, giro: number) {
  cx.clearRect(0, 0, LARGURA, ALTURA);

  // ── A esfera ──
  const base = cx.createRadialGradient(CX - RAIO * 0.38, CY - RAIO * 0.42, 1, CX, CY, RAIO * 1.15);
  base.addColorStop(0, '#ff7f86');
  base.addColorStop(0.3, '#e0283a');
  base.addColorStop(0.75, '#9a0f20');
  base.addColorStop(1, '#5a0611');
  cx.beginPath();
  cx.arc(CX, CY, RAIO, 0, Math.PI * 2);
  cx.fillStyle = base;
  cx.fill();

  cx.save();
  cx.beginPath();
  cx.arc(CX, CY, RAIO, 0, Math.PI * 2);
  cx.clip();

  // Faixas douradas: dois paralelos perto do equador, em pedacinhos (some atrás).
  cx.lineCap = 'round';
  for (const lat of [-0.24, 0.24]) {
    for (let i = 0; i < 72; i++) {
      const a = projetar(lat, (i / 72) * Math.PI * 2 + giro);
      const b = projetar(lat, ((i + 1) / 72) * Math.PI * 2 + giro);
      if (a.z <= 0 && b.z <= 0) continue;
      cx.globalAlpha = 0.35 + 0.65 * Math.max(0, (a.z + b.z) / 2);
      cx.strokeStyle = '#f6cf5c';
      cx.lineWidth = 1.5;
      cx.beginPath(); cx.moveTo(a.x, a.y); cx.lineTo(b.x, b.y); cx.stroke();
    }
  }
  // Entre as faixas, contas de purpurina.
  for (let i = 0; i < 18; i++) {
    const p = projetar(0, (i / 18) * Math.PI * 2 + giro);
    if (p.z <= 0) continue;
    cx.globalAlpha = 0.4 + 0.6 * p.z;
    cx.fillStyle = i % 2 ? '#fff3c4' : '#f4c542';
    cx.beginPath(); cx.arc(p.x, p.y, 0.7 + 0.8 * p.z, 0, Math.PI * 2); cx.fill();
  }
  // Flocos: uma fileira em cima, outra embaixo, desencontradas.
  cx.strokeStyle = '#ffffff';
  cx.lineWidth = 0.9;
  for (let fileira = 0; fileira < 2; fileira++) {
    const lat = fileira ? -0.68 : 0.62;
    for (let i = 0; i < 6; i++) {
      const lon = (i / 6) * Math.PI * 2 + (fileira ? Math.PI / 6 : 0) + giro;
      const p = projetar(lat, lon);
      if (p.z <= 0.05) continue;
      const s = RAIO * 0.18;
      cx.save();
      cx.translate(p.x, p.y);
      // Encurta de lado conforme vira para a borda (e um pouco de cima a baixo, pelo alto da bola).
      cx.scale(0.2 + 0.8 * Math.sqrt(1 - p.X * p.X), 0.78 + 0.22 * p.z);
      cx.globalAlpha = 0.95 * p.z;
      cx.beginPath();
      for (let k = 0; k < 3; k++) {
        const ang = (k * Math.PI) / 3;
        const dx = Math.cos(ang) * s, dy = Math.sin(ang) * s;
        cx.moveTo(-dx, -dy); cx.lineTo(dx, dy);
        // As farpas da ponta.
        for (const lado of [1, -1]) {
          const px = dx * 0.62 * lado, py = dy * 0.62 * lado;
          const ang2 = ang + (lado > 0 ? 0 : Math.PI);
          cx.moveTo(px, py); cx.lineTo(px + Math.cos(ang2 + 0.7) * 1.3, py + Math.sin(ang2 + 0.7) * 1.3);
          cx.moveTo(px, py); cx.lineTo(px + Math.cos(ang2 - 0.7) * 1.3, py + Math.sin(ang2 - 0.7) * 1.3);
        }
      }
      cx.stroke();
      cx.restore();
    }
  }
  cx.restore();
  cx.globalAlpha = 1;

  // ── A luz da sala (parada) ──
  const borda = cx.createRadialGradient(CX, CY, RAIO * 0.55, CX, CY, RAIO);
  borda.addColorStop(0, 'rgba(40, 0, 6, 0)');
  borda.addColorStop(1, 'rgba(40, 0, 6, .42)');
  cx.fillStyle = borda;
  cx.beginPath(); cx.arc(CX, CY, RAIO, 0, Math.PI * 2); cx.fill();

  // O reflexo da janela: uma mancha larga e um ponto.
  cx.save();
  cx.translate(CX - RAIO * 0.4, CY - RAIO * 0.44);
  cx.rotate(-0.65);
  const reflexo = cx.createRadialGradient(0, 0, 0, 0, 0, RAIO * 0.36);
  reflexo.addColorStop(0, 'rgba(255,255,255,.85)');
  reflexo.addColorStop(1, 'rgba(255,255,255,0)');
  cx.fillStyle = reflexo;
  cx.scale(1, 0.6);
  cx.beginPath(); cx.arc(0, 0, RAIO * 0.36, 0, Math.PI * 2); cx.fill();
  cx.restore();
  cx.fillStyle = 'rgba(255,255,255,.9)';
  cx.beginPath(); cx.arc(CX - RAIO * 0.5, CY - RAIO * 0.5, 1.3, 0, Math.PI * 2); cx.fill();
  // A luz que volta da parede, embaixo e à direita.
  cx.strokeStyle = 'rgba(255, 170, 170, .35)';
  cx.lineWidth = 1.2;
  cx.beginPath(); cx.arc(CX, CY, RAIO - 1.2, 0.15, 1.35); cx.stroke();

  // ── O pino e a argola ──
  const topo = CY - RAIO;
  const metal = cx.createLinearGradient(CX - 6, 0, CX + 6, 0);
  metal.addColorStop(0, '#7a5410');
  metal.addColorStop(0.35, '#ffe9a6');
  metal.addColorStop(0.6, '#d4a63a');
  metal.addColorStop(1, '#6e4a0c');
  cx.fillStyle = metal;
  cx.beginPath();
  cx.moveTo(CX - 5.5, topo - 5.5);
  cx.lineTo(CX + 5.5, topo - 5.5);
  cx.lineTo(CX + 5.5, topo + 0.5);
  cx.quadraticCurveTo(CX, topo + 2.6, CX - 5.5, topo + 0.5);
  cx.closePath();
  cx.fill();
  cx.strokeStyle = 'rgba(90, 60, 10, .55)';
  cx.lineWidth = 0.6;
  for (let i = -3; i <= 3; i += 2) {
    cx.beginPath(); cx.moveTo(CX + i, topo - 5); cx.lineTo(CX + i, topo + 0.8); cx.stroke();
  }
  cx.strokeStyle = '#d9b24a';
  cx.lineWidth = 1.3;
  cx.beginPath(); cx.arc(CX, ARGOLA_Y, 2.6, 0, Math.PI * 2); cx.stroke();
}

// ── A brincadeira: puxar a bola arrebenta o fio ──────────────────────────────

/*
 * Pedido do Cleber, 05/11/2026 (antes eram cinco cliques): segurar a bola e
 * puxar estica o fio — ele vira para o lado do puxão e estica com resistência,
 * e a bola treme perto do limite. Passou de `ARREBENTA_PX`, o fio arrebenta e
 * a bola sai na mão, já sendo arrastada. Soltou antes, ela volta como mola.
 * Um clique (sem puxar) só dá o giro de sempre.
 *
 * Solta, ela tem o MESMO tamanho da pendurada e peso (05/11/2026: estava
 * maior e leve demais, batendo forte nas bordas; no mesmo dia, um tico mais
 * leve e quicando um pouco mais; e de novo, mais leve e quicando bem mais:
 * gravidade 2050 → 1500, ar 0,7 → 0,82, batida devolve 55–82% em vez de
 * 36–68%, e só para de quicar abaixo de 70 px/s). Segurando, ela vai COLADA
 * no mouse (antes vinha atrás numa mola e cedia à gravidade — «difícil
 * demais», Cleber, 05/11/2026), e o arremesso sai com a velocidade do fim do
 * gesto do mouse (`velocidadeDoArremesso`), com teto. No ar ela freia pouco,
 * para o arco ser previsível; a batida perde mais força quanto mais forte for
 * — com uma amassadinha na hora. Quica nas bordas da área do conteúdo; um
 * clique nela chuta para cima.
 *
 * Solta, aparece a CESTA DE NATAL (`cesta/`, Cleber, 05/11/2026): as pontas
 * do aro batem na bola, e cada cesta conta no placar, solta confete, balança
 * a rede e toca o sininho. Só vale a bola SOLTA cruzando o aro de cima para
 * baixo, arremessada de longe — segurando, largando colada no aro ou subindo
 * pela rede não conta (as regras estão em `cesta/fisica.ts`).
 *
 * Depois de `DURACAO_JOGO_S` (30 s, sem aviso nem relógio na tela — Cleber,
 * 05/11/2026) ela congela onde estiver e volta voando para o fio, já
 * encaixando no caminho. Depois, por `PAUSA_MS` (5 min, sem relógio na tela:
 * é surpresa), o fio não arrebenta: a bola volta e ganha uma zoeira.
 */
const DURACAO_JOGO_S = 30;
/** Quanto o puxão estica o fio (antes da resistência) até ele arrebentar. */
const ARREBENTA_PX = 70;
/** O fio estica menos do que o puxão: a resistência. */
const ELASTICO = 0.45;
/** O fio vira até esse tanto (rad) para o lado do puxão. */
const ANGULO_MAX = 1.3;
/** Menos que isso de movimento é um clique, não um puxão. */
const CLIQUE_PX = 6;
const R_SOLTA = RAIO;
const GRAVIDADE = 1500;
/** O ar freia (fração da velocidade que sobra a cada segundo): pouco, para o arco do arremesso ser previsível. */
const AR = 0.95;
/** Nenhum movimento passa disso (px/s): nada de bala de canhão. */
const VELOCIDADE_MAX = 1600;
/** Rolando no chão: fração da velocidade que sobra a cada segundo. */
const ROLAGEM = 0.5;
/** A física do voo, para a mira do boneco acertar com a mesma conta da bola. */
const VOO = { gravidade: GRAVIDADE, ar: AR };
/*
 * O boneco de neve (`cesta/boneco.ts`): a bola a menos de `PERTO_DO_BONECO`
 * px do colo dele o faz pedir; passando de `LONGE_DO_BONECO`, ele desiste
 * (a folga entre os dois evita ele ficar piscando na borda). Solta, a bola
 * chegando devagar a `NAS_MAOS` px ele pega sozinho.
 */
const PERTO_DO_BONECO = 62;
const LONGE_DO_BONECO = 95;
const NAS_MAOS = 34;
type QuemArremessou = 'pessoa' | 'boneco';
/** Depois de brincar, a bola descansa esse tanto (sem relógio: só as zoeiras dão a dica). */
const PAUSA_MS = 5 * 60_000;
const CHAVE_BRINCOU = 'natal:bola:brincou-em';
const ZOEIRAS = [
  'Você não pode ficar brincando, ao trabalho! 😄',
  'Ei! O chefe tá olhando… disfarça! 👀',
  'Acabou o recreio! 🔔',
  'Primeiro bate a meta, depois brinca! 📈',
  'A bola foi tomar um chocolate quente. ☕',
  'Shhh… a bola tá cochilando. 😴',
  'O Papai Noel tá vendo quem tá trabalhando… 🎅',
  'Hmm… talvez você devesse voltar daqui uns 5 minutos. 🎄',
  'A bola tá descansando. Tenta de novo daqui a pouquinho! 😉',
  'Tem acordo te esperando, hein! 💼',
  'Essa bola não é de futebol, viu? ⚽❌',
  'Bola cansada. Volta mais tarde! 💤',
] as const;

const brincouHaPouco = () => {
  try { return Date.now() - Number(localStorage.getItem(CHAVE_BRINCOU) ?? 0) < PAUSA_MS; } catch { return false; }
};
const marcarBrincou = () => { try { localStorage.setItem(CHAVE_BRINCOU, String(Date.now())); } catch { /* modo privado */ } };

/** Quanto da velocidade volta numa batida: menos quanto mais forte ela for. */
const quique = (v: number) => Math.min(0.82, Math.max(0.55, 0.82 - Math.abs(v) / 9000));
const limitar = (v: number) => Math.max(-VELOCIDADE_MAX, Math.min(VELOCIDADE_MAX, v));

/** As paredes: a área do conteúdo (o `<main>`), ou a janela. */
function paredes() {
  const r = document.querySelector('main')?.getBoundingClientRect();
  return r ? { esq: r.left, dir: r.right, cima: r.top, baixo: r.bottom } : { esq: 0, dir: window.innerWidth, cima: 0, baixo: window.innerHeight };
}

type FaseDaBola = 'solta' | 'congelando' | 'voltando';
type Ponto = { x: number; y: number };
/** Onde o mouse pegou a bola (em relação ao centro dela) e onde ele está. */
type Pegada = { dx: number; dy: number; px: number; py: number };

/**
 * A bola solta, por cima de tudo (portal no `body`). Física num
 * `requestAnimationFrame` só, escrevendo o `transform` direto no elemento.
 */
function BolaSolta({ de, pega, casa, aoChegando, aoTerminar }: {
  de: Ponto;
  /** O fio arrebentou com o mouse segurando: ela já sai arrastada. */
  pega: Pegada | null;
  /** Onde está AGORA o centro da bola pendurada (ela balança: a volta mira nela a cada quadro). */
  casa: () => Ponto;
  /** Quase chegando: o fio começa a crescer de novo. */
  aoChegando: () => void;
  /** Encaixou; `giro` é onde o desenho parou, para a pendurada continuar dali sem pulo. */
  aoTerminar: (giro: number) => void;
}) {
  const embrulho = useRef<HTMLDivElement>(null);
  const tela = useRef<HTMLCanvasElement>(null);
  const [fase, setFase] = useState<FaseDaBola>('solta');
  const faseAtual = useRef<FaseDaBola>('solta');
  // O estado da física, fora do React. `amassa`: o quanto ela está amassada, e em que eixo.
  const corpo = useRef({ x: de.x, y: de.y, vx: 0, vy: 0, rot: 0, giro: 0.4, amassa: 0, deitada: true });
  /*
   * `amostras`: por onde o mouse passou, para medir o arremesso. `dx/dy` é a
   * distância da bola ao mouse agora, e `alvoDx/alvoDy` a de onde a mão pegou:
   * quando o fio arrebenta, a bola está atrás do mouse (o fio estica menos que
   * o puxão), e em ~0,1 s ela alcança a mão em vez de dar um pulo.
   */
  const arrasto = useRef<(Pegada & { alvoDx: number; alvoDy: number; andou: number; x0: number; y0: number; amostras: Amostra[] }) | null>(
    pega ? {
      ...pega, dx: pega.px - de.x, dy: pega.py - de.y, alvoDx: pega.dx, alvoDy: pega.dy,
      andou: CLIQUE_PX, x0: pega.px, y0: pega.py, amostras: [{ x: pega.px, y: pega.py, t: performance.now() }],
    } : null,
  );
  // A cesta: onde está o aro, se o arremesso de agora vale, e o placar.
  const [aro, setAro] = useState(() => posicaoDoAro(paredes()));
  const aroAtual = useRef(aro);
  const arremessoVale = useRef(false);
  const [acertos, setAcertos] = useState(0);
  const [acertosBoneco, setAcertosBoneco] = useState(0);
  const [ultima, setUltima] = useState<QuemArremessou | null>(null);
  const [festas, setFestas] = useState<{ id: number; origem: Ponto }[]>([]);
  /*
   * O boneco de neve (`cesta/boneco.ts`): se a bola está perto dele (ele
   * esperando), se está nas mãos dele (e desde quando), e se o arremesso dele
   * está no ar (para ele comemorar ou ficar triste). `quem`: quem fez o
   * arremesso que está voando.
   */
  const esperando = useRef(false);
  const entregarAgora = useRef(false);
  const comBoneco = useRef<{ inicio: number; de: Ponto; boneco: BonecoNaCesta } | null>(null);
  const vooDoBoneco = useRef<{ desde: number } | null>(null);
  const quem = useRef<QuemArremessou>('pessoa');

  const posicionar = useCallback(() => {
    const c = corpo.current;
    const e = embrulho.current;
    if (!e) return;
    // Amassada no eixo da batida: chão e teto achatam, paredes afinam.
    const a = c.amassa, sx = c.deitada ? 1 + a : 1 - a, sy = c.deitada ? 1 - a : 1 + a;
    e.style.transform = `translate(${(c.x - CX).toFixed(1)}px, ${(c.y - CY).toFixed(1)}px) scale(${sx.toFixed(3)}, ${sy.toFixed(3)})`;
    if (tela.current) tela.current.style.transform = `rotate(${c.rot.toFixed(3)}rad)`;
  }, []);

  useEffect(() => {
    const cv = tela.current;
    const cx = cv?.getContext('2d');
    if (!cv || !cx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = LARGURA * dpr;
    cv.height = ALTURA * dpr;
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    let antes = performance.now(), quadro = 0, vivo = true;
    const inicio = antes;
    // As paredes: medidas agora e quando a janela muda (ler o layout a cada quadro pesa).
    let p = paredes();
    const remedir = () => {
      p = paredes();
      aroAtual.current = posicaoDoAro(p);
      setAro(aroAtual.current);
    };
    window.addEventListener('resize', remedir);
    let placar = 0, placarBoneco = 0;
    const relogios: number[] = [];
    const comemorar = (fez: QuemArremessou) => {
      const k = aroAtual.current;
      if (fez === 'boneco') {
        setAcertosBoneco(++placarBoneco);
        bonecoDaCesta()?.resultado(true);
        vooDoBoneco.current = null;
      } else {
        setAcertos(++placar);
      }
      setUltima(fez);
      const id = performance.now();
      setFestas(f => [...f, { id, origem: { x: k.x, y: k.y + 24 } }]);
      relogios.push(window.setTimeout(() => setFestas(f => f.filter(x => x.id !== id)), 4500));
      somDaCesta(placar + placarBoneco);
    };
    /** A bola chegou às mãos do boneco: ele vira para a cesta e começa o arremesso. */
    const entregar = (bn: BonecoNaCesta, colo: Ponto) => {
      const c = corpo.current;
      const lado: Lado = aroAtual.current.x >= colo.x ? 1 : -1;
      comBoneco.current = { inicio: bn.receber(lado), de: { x: c.x, y: c.y }, boneco: bn };
      esperando.current = false;
      entregarAgora.current = false;
      arremessoVale.current = false;
      c.vx = 0;
      c.vy = 0;
      somDoBonecoPegando();
    };
    /** A brincadeira acabou (ou a bola sumiu): o boneco larga tudo. */
    const largarBoneco = () => {
      if (esperando.current || comBoneco.current || vooDoBoneco.current) bonecoDaCesta()?.cancelar();
      esperando.current = false;
      entregarAgora.current = false;
      comBoneco.current = null;
      vooDoBoneco.current = null;
    };
    const bateu = (v: number, deitada: boolean) => {
      const c = corpo.current;
      if (Math.abs(v) < 220) return;
      c.amassa = Math.min(0.24, Math.abs(v) / 5000);
      c.deitada = deitada;
    };
    const passo = (agora: number) => {
      if (!vivo) return;
      const dt = Math.min(0.033, (agora - antes) / 1000);
      antes = agora;
      const c = corpo.current;
      const a = arrasto.current;
      const yAntes = c.y;
      const k = aroAtual.current;
      // Nas mãos do boneco: segue a pose dele até a hora de soltar.
      let comEle = false;
      const cb = comBoneco.current;
      if (cb) {
        const t = agora - cb.inicio;
        if (t < T_SOLTA) {
          comEle = true;
          const alvo = cb.boneco.bolaEm(t);
          // Do lugar onde estava até as mãos dele, assentando (depois, colada nelas).
          const resta = Math.pow(1 - Math.min(1, t / T_PEGA), 3);
          const nx = alvo.x + (cb.de.x - alvo.x) * resta, ny = alvo.y + (cb.de.y - alvo.y) * resta;
          if (dt > 0) { c.vx = limitar((nx - c.x) / dt); c.vy = limitar((ny - c.y) / dt); }
          c.x = nx;
          c.y = ny;
        } else {
          // Soltou: mira na cesta com um erro sorteado, e a física decide.
          const largura = Math.abs(k.x - c.x);
          const folga = Math.min(220, 70 + largura * 0.22) * (0.85 + Math.random() * 0.3);
          const v = mirar({ x: c.x, y: c.y }, { x: k.x + sortearErro(), y: k.y }, folga, p.cima + R_SOLTA + 24, VOO, dt || 1 / 60);
          c.vx = v.vx;
          c.vy = v.vy;
          comBoneco.current = null;
          quem.current = 'boneco';
          arremessoVale.current = true;
          vooDoBoneco.current = { desde: agora };
          somDoArremessoDoBoneco();
        }
      }
      if (comEle) {
        // (a pose já pôs a bola no lugar)
      } else if (a) {
        // Segurando: colada no mouse. A velocidade aqui só serve para o giro do desenho.
        const alcanca = 1 - Math.exp(-30 * dt);
        a.dx += (a.alvoDx - a.dx) * alcanca;
        a.dy += (a.alvoDy - a.dy) * alcanca;
        const nx = a.px - a.dx, ny = a.py - a.dy;
        if (dt > 0) { c.vx = limitar((nx - c.x) / dt); c.vy = limitar((ny - c.y) / dt); }
        c.x = nx;
        c.y = ny;
      } else {
        c.vy += GRAVIDADE * dt;
        const ar = Math.pow(AR, dt);
        c.vx *= ar;
        c.vy *= ar;
        c.vx = limitar(c.vx);
        c.vy = limitar(c.vy);
        c.x += c.vx * dt;
        c.y += c.vy * dt;
      }
      // As paredes (nas mãos do boneco, quem manda é a pose).
      if (!comEle) {
        if (c.x - R_SOLTA < p.esq) { c.x = p.esq + R_SOLTA; bateu(c.vx, false); c.vx = Math.abs(c.vx) * quique(c.vx); }
        if (c.x + R_SOLTA > p.dir) { c.x = p.dir - R_SOLTA; bateu(c.vx, false); c.vx = -Math.abs(c.vx) * quique(c.vx); }
        if (c.y - R_SOLTA < p.cima) { c.y = p.cima + R_SOLTA; bateu(c.vy, true); c.vy = Math.abs(c.vy) * quique(c.vy); }
        if (c.y + R_SOLTA > p.baixo) {
          c.y = p.baixo - R_SOLTA;
          bateu(c.vy, true);
          c.vy = Math.abs(c.vy) < 70 ? 0 : -Math.abs(c.vy) * quique(c.vy);
          // No chão, rola e vai parando.
          c.vx *= Math.pow(ROLAGEM, dt);
        }
      }
      // A cesta: só com a bola solta (segurando, ela atravessa tudo e não conta).
      if (!a && !comEle) {
        // A ajuda de mira é para gente; o boneco arremessa por conta própria.
        if (quem.current === 'pessoa') ajudarNaMira(c, k, dt);
        frearNaRede(c, k, dt);
        // As duas pontas do aro batem na bola.
        for (const lado of [-1, 1]) {
          const forca = baterNaPonta(c, k.x + lado * k.meia, k.y, R_SOLTA, k.ponta);
          if (forca > 220) { c.amassa = Math.min(0.16, forca / 6000); c.deitada = true; somDoAro(forca); }
        }
        // Um arremesso vale uma cesta só.
        if (subiuPeloAro(yAntes, c, k)) arremessoVale.current = false;
        else if (arremessoVale.current && passouPeloAro(yAntes, c, k)) { arremessoVale.current = false; comemorar(quem.current); }
      }
      // O arremesso do boneco que não entrou: passou do aro para baixo, demorou, ou alguém pegou a bola no ar.
      const voo = vooDoBoneco.current;
      if (voo && (a || (c.y > k.y + 140 && c.vy > 0) || agora - voo.desde > 3500)) {
        vooDoBoneco.current = null;
        bonecoDaCesta()?.resultado(false);
      }
      // O boneco: a bola chegando perto faz ele pedir; soltando ali (ou ela chegando devagar), ele pega.
      const bn = bonecoDaCesta();
      if (bn && !comBoneco.current && !vooDoBoneco.current) {
        const colo = bn.colo();
        if (colo) {
          const d = Math.hypot(c.x - colo.x, c.y - colo.y);
          const vel = Math.hypot(c.vx, c.vy);
          if (d < PERTO_DO_BONECO && (a || vel < 900)) { esperando.current = true; bn.esperar(true, c.x); }
          else if (esperando.current && d > LONGE_DO_BONECO) { esperando.current = false; bn.esperar(false); }
          if (esperando.current && (entregarAgora.current || (!a && d < NAS_MAOS && vel < 700))) entregar(bn, colo);
        }
        entregarAgora.current = false;
      }
      if (comEle) {
        // Nas mãos do boneco, a bola se endireita (a tampinha para cima), sem girar a volta toda.
        const emPe = Math.round(c.rot / (Math.PI * 2)) * Math.PI * 2;
        c.rot += (emPe - c.rot) * (1 - Math.exp(-10 * dt));
      } else {
        // Rolando: gira com a velocidade de lado.
        c.rot += (c.vx / R_SOLTA) * dt * 0.6;
      }
      c.amassa *= Math.exp(-16 * dt);
      c.giro += (GIRO_BASE + Math.min(14, Math.hypot(c.vx, c.vy) / 90)) * dt;
      desenhar(cx, c.giro);
      posicionar();
      const passou = (agora - inicio) / 1000;
      if (passou >= DURACAO_JOGO_S) {
        arrasto.current = null;
        largarBoneco();
        c.amassa = 0;
        posicionar();
        faseAtual.current = 'congelando';
        setFase('congelando');
        return;
      }
      quadro = requestAnimationFrame(passo);
    };
    quadro = requestAnimationFrame(passo);
    return () => {
      vivo = false;
      cancelAnimationFrame(quadro);
      window.removeEventListener('resize', remedir);
      relogios.forEach(id => window.clearTimeout(id));
      largarBoneco();
    };
  }, [posicionar]);

  // O mouse, pela janela: o arrasto que começou no fio (antes desta bola existir) também passa por aqui.
  useEffect(() => {
    const mover = (ev: PointerEvent) => {
      const a = arrasto.current;
      if (!a) return;
      a.px = ev.clientX; a.py = ev.clientY;
      a.andou = Math.max(a.andou, Math.hypot(ev.clientX - a.x0, ev.clientY - a.y0));
      const agora = performance.now();
      a.amostras.push({ x: ev.clientX, y: ev.clientY, t: agora });
      while (a.amostras.length > 2 && agora - a.amostras[0].t > 200) a.amostras.shift();
    };
    const soltar = () => {
      const a = arrasto.current;
      arrasto.current = null;
      if (!a || faseAtual.current !== 'solta') return;
      const c = corpo.current;
      if (a.andou < CLIQUE_PX) {
        // Um clique: chute para cima, para um lado sorteado.
        c.vy = -780 - Math.random() * 220;
        c.vx = (Math.random() - 0.5) * 900;
      } else {
        // Arremesso: sai com a velocidade do fim do gesto do mouse (com teto).
        const v = velocidadeDoArremesso(a.amostras, performance.now(), VELOCIDADE_MAX);
        c.vx = v.vx;
        c.vy = v.vy;
      }
      // Soltou do lado do boneco que estava pedindo: é entrega (o laço passa para as mãos dele).
      if (esperando.current) entregarAgora.current = true;
      // Vale cesta se não foi largada colada em cima do aro.
      arremessoVale.current = largouDeLonge(c.x, c.y, aroAtual.current);
    };
    window.addEventListener('pointermove', mover);
    window.addEventListener('pointerup', soltar);
    window.addEventListener('pointercancel', soltar);
    return () => {
      window.removeEventListener('pointermove', mover);
      window.removeEventListener('pointerup', soltar);
      window.removeEventListener('pointercancel', soltar);
    };
  }, []);

  // Congelou: treme um pouco, fica branquinha de gelo e volta voando para o fio.
  useEffect(() => {
    if (fase !== 'congelando') return;
    const id = window.setTimeout(() => { faseAtual.current = 'voltando'; setFase('voltando'); }, 1400);
    return () => window.clearTimeout(id);
  }, [fase]);
  /*
   * A volta: num quadro por vez, mirando na bola pendurada de agora (ela
   * balança no fio), num arco por cima. No caminho ela já vai encaixando —
   * endireita o giro do corpo e o enfeite vai desacelerando até o giro de
   * repouso. Quando chega, está exatamente onde a pendurada está, e a troca
   * não dá pulo.
   */
  useEffect(() => {
    if (fase !== 'voltando') return;
    const e = embrulho.current, cv = tela.current;
    const cx = cv?.getContext('2d');
    if (!e || !cv || !cx) return;
    const c = corpo.current;
    const x0 = c.x, y0 = c.y, rot0 = c.rot;
    // Gira pelo menos uma volta e para em pé (múltiplo de uma volta).
    const rotFim = Math.ceil(rot0 / (Math.PI * 2)) * Math.PI * 2 + Math.PI * 2;
    const DURACAO = 1300;
    const inicio = performance.now();
    let antes = inicio, quadro = 0, avisou = false, vivo = true;
    const suave = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
    const passo = (agora: number) => {
      if (!vivo) return;
      const dt = Math.min(0.05, (agora - antes) / 1000);
      antes = agora;
      const k = Math.min(1, (agora - inicio) / DURACAO);
      const u = suave(k);
      const alvo = casa();
      const mx = (x0 + alvo.x) / 2, my = Math.min(y0, alvo.y) - 140;
      const x = (1 - u) * (1 - u) * x0 + 2 * (1 - u) * u * mx + u * u * alvo.x;
      const y = (1 - u) * (1 - u) * y0 + 2 * (1 - u) * u * my + u * u * alvo.y;
      c.rot = rot0 + (rotFim - rot0) * u;
      c.giro += (GIRO_BASE + 9 * (1 - k) * (1 - k)) * dt;
      desenhar(cx, c.giro);
      e.style.transform = `translate(${(x - CX).toFixed(1)}px, ${(y - CY).toFixed(1)}px)`;
      cv.style.transform = `rotate(${c.rot.toFixed(3)}rad)`;
      if (k > 0.72 && !avisou) { avisou = true; aoChegando(); }
      if (k < 1) quadro = requestAnimationFrame(passo);
      else aoTerminar(c.giro);
    };
    quadro = requestAnimationFrame(passo);
    return () => { vivo = false; cancelAnimationFrame(quadro); };
  }, [fase, casa, aoChegando, aoTerminar]);

  // Pegar a bola: o resto (mover e soltar) é pela janela, acima.
  const aoApertar = (ev: React.PointerEvent) => {
    if (fase !== 'solta') return;
    // Nas mãos do boneco, a bola é dele até o arremesso.
    if (comBoneco.current) return;
    ev.preventDefault();
    prepararSomDaCesta();
    arremessoVale.current = false;
    quem.current = 'pessoa';
    const c = corpo.current;
    arrasto.current = {
      dx: ev.clientX - c.x, dy: ev.clientY - c.y, alvoDx: ev.clientX - c.x, alvoDy: ev.clientY - c.y,
      px: ev.clientX, py: ev.clientY, andou: 0, x0: ev.clientX, y0: ev.clientY,
      amostras: [{ x: ev.clientX, y: ev.clientY, t: performance.now() }],
    };
  };

  return createPortal(
    <>
    <Cesta aro={aro} acertos={acertos} acertosBoneco={acertosBoneco} ultima={ultima} fase={fase} />
    {festas.map(f => (
      <Confete key={f.id} origem={f.origem} quantidade={90} forca={0.55} className="nt-cesta-confete" />
    ))}
    <div
      ref={embrulho}
      className={cn('nt-bola-solta', fase !== 'solta' && 'nt-bola-' + fase)}
      style={{ width: LARGURA, height: ALTURA, transformOrigin: `${CX}px ${CY}px`, transform: `translate(${de.x - CX}px, ${de.y - CY}px)` }}
      onPointerDown={aoApertar}
    >
      <canvas ref={tela} style={{ width: LARGURA, height: ALTURA, transformOrigin: `${CX}px ${CY}px` }} />
      {fase !== 'solta' && (
        <svg className="nt-bola-gelo" viewBox="-30 -30 60 60" width={R_SOLTA * 2.6} height={R_SOLTA * 2.6}
          style={{ left: CX - R_SOLTA * 1.3, top: CY - R_SOLTA * 1.3 }} aria-hidden="true">
          {[0, 60, 120].map(a => (
            <g key={a} transform={`rotate(${a})`} stroke="#E6F6FF" strokeWidth={1.6} strokeLinecap="round">
              <line x1={0} y1={-27} x2={0} y2={27} />
              <path d="M-4 -21 L0 -16 L4 -21 M-4 21 L0 16 L4 21" fill="none" />
            </g>
          ))}
        </svg>
      )}
    </div>
    </>,
    document.body,
  );
}

/** O puxão na bola pendurada, do aperto ao soltar. */
interface Puxao {
  /** De onde o mouse saiu. */
  x0: number; y0: number;
  /** O laço (de onde o fio sai) e o centro da bola em repouso, na tela. */
  laco: Ponto; centro: Ponto;
  /** O comprimento do fio, do laço ao centro da bola, em repouso. */
  comprimento: number;
  andou: number;
  /** O ângulo e o quanto o fio está esticado agora (o que está na tela). */
  angulo: number; estica: number;
  /** Já acabou (a bola descansando voltou com zoeira): o resto do arrasto não conta. */
  acabou: boolean;
}

export function BolaDaSaudacao() {
  const caixa = useRef<HTMLSpanElement>(null);
  const tela = useRef<HTMLCanvasElement>(null);
  /** Do fio do varal até a argola, em px. Zero: sem varal, só a bola. */
  const [fio, setFio] = useState(0);
  const empurrao = useRef<HTMLSpanElement>(null);
  const velocidade = useRef(GIRO_BASE);
  /** Onde está o giro do desenho (a bola solta devolve o dela ao encaixar). */
  const giroPendurada = useRef(0.4);
  const [parada] = useState(movimentoReduzido);
  /** Solta (a brincadeira), com o centro de onde ela saiu e o mouse que a segura; `null` = pendurada. */
  const [solta, setSolta] = useState<{ de: Ponto; pega: Pegada | null } | null>(null);
  /** Voltou para o fio: o fio cresce de novo (a chave remonta a animação). */
  const [religou, setReligou] = useState(0);
  const [zoeira, setZoeira] = useState<{ texto: string; x: number; y: number; id: number } | null>(null);
  const zoeiraVez = useRef(-1);
  const puxao = useRef<Puxao | null>(null);
  const quadroDaMola = useRef(0);

  useEffect(() => {
    if (!zoeira) return;
    const id = window.setTimeout(() => setZoeira(null), 3600);
    return () => window.clearTimeout(id);
  }, [zoeira]);
  useEffect(() => () => cancelAnimationFrame(quadroDaMola.current), []);

  /**
   * O centro da bola pendurada, na tela, com o balanço do fio (pelo canvas dela:
   * o meio dele, mais o desvio do centro da bola, que fica abaixo do meio).
   */
  const centroDaBola = useCallback(() => {
    const r = tela.current?.getBoundingClientRect() ?? caixa.current?.getBoundingClientRect();
    return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 + (CY - ALTURA / 2) } : { x: window.innerWidth / 2, y: 120 };
  }, []);
  /** Quase chegando: o fio cresce de novo. */
  const [chegando, setChegando] = useState(false);
  const aoChegando = useCallback(() => { setChegando(true); setReligou(v => v + 1); }, []);
  const voltou = useCallback((giro: number) => {
    giroPendurada.current = giro;
    velocidade.current = GIRO_BASE;
    setSolta(null);
    setChegando(false);
  }, []);

  // O giro.
  useEffect(() => {
    const cv = tela.current;
    const cx = cv?.getContext('2d');
    if (!cv || !cx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = LARGURA * dpr;
    cv.height = ALTURA * dpr;
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    let antes = performance.now(), quadro = 0, visivel = true;
    const passo = (agora: number) => {
      // 30 quadros por segundo bastam para um enfeite girando (e pesam metade).
      if (agora - antes < 31) { if (visivel && !parada) quadro = requestAnimationFrame(passo); return; }
      const dt = Math.min(0.1, (agora - antes) / 1000);
      antes = agora;
      const v = velocidade.current;
      velocidade.current = GIRO_BASE + (v - GIRO_BASE) * Math.exp(-FREIO * dt);
      giroPendurada.current += velocidade.current * dt;
      desenhar(cx, giroPendurada.current);
      if (visivel && !parada) quadro = requestAnimationFrame(passo);
    };
    desenhar(cx, giroPendurada.current);
    // Fora da tela (rolou para baixo), para de desenhar.
    const obs = new IntersectionObserver(([e]) => {
      visivel = e.isIntersecting;
      cancelAnimationFrame(quadro);
      if (visivel && !parada) { antes = performance.now(); quadro = requestAnimationFrame(passo); }
    });
    obs.observe(cv);
    return () => { cancelAnimationFrame(quadro); obs.disconnect(); };
  }, [parada]);

  // O fio até o varal.
  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    let escondidas: HTMLElement[] = [];
    const mostrar = () => { escondidas.forEach(b => { b.style.visibility = ''; }); escondidas = []; };
    const medir = () => {
      mostrar();
      // Com o trenzinho, a estação fica entre o varal e a saudação: o fio sai do trilho dela.
      const faixa = document.querySelector<HTMLElement>('[data-faixa-trem="topo"]');
      if (faixa) {
        const f = faixa.getBoundingClientRect(), b = el.getBoundingClientRect();
        const trilho = f.bottom - Number(faixa.dataset.trilho ?? 0) + 4;   // a borda de baixo do trilho
        setFio(Math.max(0, Math.round(b.top + ARGOLA_Y - trilho)));
        return true;
      }
      const varal = document.querySelector<HTMLElement>('.nt-varal');
      if (!varal) { setFio(0); return false; }
      const v = varal.getBoundingClientRect(), b = el.getBoundingClientRect();
      const meio = b.left + b.width / 2;
      const t = ((((meio - v.left) % VAO) + VAO) % VAO) / VAO;
      setFio(Math.max(0, Math.round(b.top + ARGOLA_Y - (v.top + naCurva(t).y))));
      document.querySelectorAll<HTMLElement>('.nt-bola').forEach(bola => {
        const r = bola.getBoundingClientRect();
        if (Math.abs(r.left + r.width / 2 - meio) < 40) { bola.style.visibility = 'hidden'; escondidas.push(bola); }
      });
      return true;
    };
    // O varal e a estação descem em pedaços à parte (lazy): remede por uns segundos,
    // até os dois chegarem (a estação, chegando depois do varal, muda o ponto do fio).
    let tentativas = 0;
    const procurar = window.setInterval(() => { medir(); if (++tentativas > 24) window.clearInterval(procurar); }, 250);
    medir();
    const obs = new ResizeObserver(() => { medir(); });
    obs.observe(el.closest('main') ?? document.body);
    window.addEventListener('resize', medir);
    return () => {
      window.clearInterval(procurar);
      obs.disconnect();
      window.removeEventListener('resize', medir);
      mostrar();
    };
  }, []);

  /** Vira o fio para o lado do puxão e estica (escrito direto no elemento: é a cada movimento do mouse). */
  const mostrarPuxada = useCallback((angulo: number, estica: number) => {
    const e = empurrao.current;
    if (!e) return;
    e.style.rotate = angulo ? `${(-angulo).toFixed(4)}rad` : '';
    e.style.setProperty('--puxa', `${estica.toFixed(1)}px`);
  }, []);

  /** Soltou sem arrebentar: volta como mola, balançando, e o fio desestica. */
  const voltarComoMola = useCallback((angulo: number, estica: number) => {
    cancelAnimationFrame(quadroDaMola.current);
    let a = angulo, va = 0, s = estica, vs = 0, antes = performance.now();
    const passo = (agora: number) => {
      const dt = Math.min(0.033, (agora - antes) / 1000);
      antes = agora;
      va += (-90 * a - 6 * va) * dt;
      a += va * dt;
      vs += (-500 * s - 32 * vs) * dt;
      s += vs * dt;
      if (Math.abs(a) < 0.002 && Math.abs(va) < 0.02 && Math.abs(s) < 0.3) { mostrarPuxada(0, 0); return; }
      mostrarPuxada(a, Math.max(0, s));
      quadroDaMola.current = requestAnimationFrame(passo);
    };
    quadroDaMola.current = requestAnimationFrame(passo);
  }, [mostrarPuxada]);

  /*
   * Duas camadas que balançam do mesmo ponto (o laço no varal) e se somam: o
   * balanço de sempre (CSS) e, por cima, o empurrão do clique (uma animação
   * avulsa, que pode recomeçar sem remontar o canvas). O puxão usa a mesma
   * camada do empurrão.
   */
  const empurrar = () => {
    velocidade.current = GIRO_CLIQUE;
    if (parada) return;
    empurrao.current?.animate(
      [{ rotate: '0deg' }, { rotate: '14deg' }, { rotate: '-10deg' }, { rotate: '6deg' }, { rotate: '-3deg' }, { rotate: '1deg' }, { rotate: '0deg' }],
      { duration: 2600, easing: 'ease-out' },
    );
  };

  const zoar = () => {
    const c = centroDaBola();
    // Uma zoeira sorteada, sem repetir a última.
    let i = Math.floor(Math.random() * ZOEIRAS.length);
    if (i === zoeiraVez.current) i = (i + 1) % ZOEIRAS.length;
    zoeiraVez.current = i;
    setZoeira({ texto: ZOEIRAS[i], x: c.x, y: c.y, id: Date.now() });
  };

  const aoApertar = (ev: React.PointerEvent<HTMLCanvasElement>) => {
    if (solta) return;
    ev.preventDefault();
    // Um gesto de verdade: libera o som da cesta, caso o fio arrebente neste puxão.
    prepararSomDaCesta();
    ev.currentTarget.setPointerCapture(ev.pointerId);
    cancelAnimationFrame(quadroDaMola.current);
    empurrao.current?.getAnimations().forEach(a => a.cancel());
    mostrarPuxada(0, 0);
    const centro = centroDaBola();
    const laco = { x: centro.x, y: centro.y - (CY - ARGOLA_Y) - fio };
    puxao.current = {
      x0: ev.clientX, y0: ev.clientY, laco, centro, comprimento: centro.y - laco.y,
      andou: 0, angulo: 0, estica: 0, acabou: false,
    };
  };

  const aoMover = (ev: React.PointerEvent<HTMLCanvasElement>) => {
    const p = puxao.current;
    if (!p || p.acabou) return;
    const dx = ev.clientX - p.x0, dy = ev.clientY - p.y0;
    p.andou = Math.max(p.andou, Math.hypot(dx, dy));
    if (parada || p.andou < CLIQUE_PX) return;
    // Para onde o puxão leva a bola, visto do laço.
    const alvo = { x: p.centro.x + dx - p.laco.x, y: p.centro.y + dy - p.laco.y };
    const comprimento = Math.hypot(alvo.x, alvo.y);
    const esticou = comprimento - p.comprimento;
    if (esticou > ARREBENTA_PX) {
      if (brincouHaPouco()) {
        // Descansando: o fio aguenta, a bola volta e ganha uma zoeira.
        p.acabou = true;
        voltarComoMola(p.angulo, p.estica);
        zoar();
        return;
      }
      // Arrebentou: a bola sai na mão, de onde ela estava na tela.
      marcarBrincou();
      const raio = p.comprimento + p.estica;
      const de = { x: p.laco.x + Math.sin(p.angulo) * raio, y: p.laco.y + Math.cos(p.angulo) * raio };
      ev.currentTarget.releasePointerCapture(ev.pointerId);
      puxao.current = null;
      mostrarPuxada(0, 0);
      setSolta({ de, pega: { dx: p.x0 - p.centro.x, dy: p.y0 - p.centro.y, px: ev.clientX, py: ev.clientY } });
      return;
    }
    const angulo = Math.max(-ANGULO_MAX, Math.min(ANGULO_MAX, Math.atan2(alvo.x, alvo.y)));
    const estica = Math.max(0, esticou) * ELASTICO;
    // Perto de arrebentar, o fio treme.
    const tensao = Math.max(0, esticou / ARREBENTA_PX - 0.7) / 0.3;
    p.angulo = angulo;
    p.estica = estica;
    mostrarPuxada(angulo + (Math.random() - 0.5) * 0.05 * tensao, estica + (Math.random() - 0.5) * 2 * tensao);
  };

  const aoSoltar = () => {
    const p = puxao.current;
    puxao.current = null;
    if (!p) return;
    if (p.andou < CLIQUE_PX) { empurrar(); return; }
    if (!p.acabou) voltarComoMola(p.angulo, p.estica);
  };

  return (
    <span
      ref={caixa}
      className={cn('nt-saud-bola', parada && 'parada')}
      style={{ width: LARGURA, height: ALTURA, marginTop: -MARGEM_CIMA, marginBottom: -MARGEM_BAIXO, ['--fio' as string]: `${fio}px`, ['--argola' as string]: `${ARGOLA_Y}px` }}
      aria-hidden="true"
    >
      <span className="nt-saud-balanco">
        <span ref={empurrao} className="nt-saud-empurrao">
          {fio > 0 && (
            <>
              <span key={religou} className={cn('nt-saud-fio', solta && !chegando && 'arrebentado', religou > 0 && 'religando')} />
              <svg className="nt-saud-laco" viewBox="0 0 20 12" width="16" height="10">
                <path d="M10 6 C6 0 0 1 1.5 6 C3 10 7 8 10 6 Z" />
                <path d="M10 6 C14 0 20 1 18.5 6 C17 10 13 8 10 6 Z" />
                <circle cx="10" cy="6" r="2" className="no" />
              </svg>
            </>
          )}
          <canvas
            ref={tela}
            style={{ width: LARGURA, height: ALTURA, visibility: solta ? 'hidden' : undefined }}
            onPointerDown={aoApertar}
            onPointerMove={aoMover}
            onPointerUp={aoSoltar}
            onPointerCancel={aoSoltar}
          />
        </span>
      </span>
      {solta && <BolaSolta de={solta.de} pega={solta.pega} casa={centroDaBola} aoChegando={aoChegando} aoTerminar={voltou} />}
      {zoeira && createPortal(
        // Na frente da bola (centrado nela) e por cima de tudo.
        <div key={zoeira.id} className="nt-bola-zoeira" style={{ left: zoeira.x, top: zoeira.y }} role="status">
          <span className="nt-bola-zoeira-estrela" aria-hidden="true">✦</span>
          <span className="nt-bola-zoeira-estrela outra" aria-hidden="true">✦</span>
          {zoeira.texto}
        </div>,
        document.body,
      )}
    </span>
  );
}

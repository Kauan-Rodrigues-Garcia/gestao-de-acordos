/**
 * cenaChefao.tsx — o chefão na tela: o Rei do Pop zumbi dançando, andando,
 * pulando e desviando, se machucando conforme perde vida, a vida de todos lá
 * em cima e o ranking no fim.
 *
 * Baixado só quando há chefão (ver `index.tsx`), como a cena do zumbi comum.
 * A regra (vida, lotes, golpe final, ranking) está em `chefao.ts` e na
 * migration 20261009120000; o desenho e os passos, em `chefaoArte.ts`; a
 * física do movimento, em `chefaoMovimento.ts`; o sangue, o braço que voa e
 * os rastros, em `chefaoEfeitos.ts`.
 *
 * ## O que é de cada tela
 *
 * A posição, o passo de dança, os desvios e a Fúria são da tela de cada um —
 * como a direção do zumbi comum. A vida e o ranking são de todos, e por isso
 * os ferimentos também: o estágio sai da vida (`estagioDaVida`).
 *
 * ## Como ele se mexe
 *
 * Um laço só (`requestAnimationFrame`) chama `mover`, troca o quadro e
 * escreve o `transform` direto no elemento: nada passa pelo React a cada
 * quadro. O tiro pergunta em que pixel da arte caiu NESTE quadro, desfazendo
 * a inclinação e o espelho (`pontoNaArte`) — braço que caiu não leva tiro.
 *
 * ## A Fúria do Rei (09/10/2026)
 *
 * Os olhos acendem, ele para um instante e sai dançando mais rápido, com
 * aura, notas e rastro, desviando de TODOS os tiros por alguns segundos. É a
 * hora de respirar — e é a MESMA para todo mundo («a fúria tem que ser ativa
 * para todos»): ela não sai de sorteio da tela de cada um, sai do que todos
 * sabem igual:
 *
 *   - o relógio da luta: a cada `FURIA_A_CADA_MS` contados da chegada
 *     (`solta_em`, do banco). Quem entra no meio pega o resto da Fúria;
 *   - a vida do banco: quando ela cruza o ponto em que ele perde um braço.
 *
 * ## O banquete (09/10/2026)
 *
 * O super_admin aperta «Recuperar vida» no placar: uma pessoa entra andando,
 * distraída, assobiando; ele PARA e a vê («!»), ela se assusta e congela, ele
 * corre e dá o bote, ela cai — e ele come, arrancando braço, braço, perna,
 * perna e cabeça (que voam e ficam no chão), roendo o tronco até sobrar osso.
 * Imune do começo ao fim, e a barra de vida sobe a cada mordida. A hora, a vítima e onde ela aparece vêm do banco (`cura_*`), então
 * é o mesmo banquete em toda tela.
 *
 * ## Autoclick (09/10/2026)
 *
 * Enquanto ele está na tela, `autoclick.ts` mede os cliques e cada lote leva o
 * que foi medido. Clique de script (`isTrusted` falso) nem vira tiro.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { carregarFontesPixel } from '@/components/Halloween/fonte';
import {
  ALTURA, LARGURA, NUMERO_DA_PARTE, centroDaParte, montarQuadro, parteNoPonto, type Imagem,
} from './zumbis';
import { imagemParaPixels } from './pixels';
import {
  CHEFAO, COR_OLHO_ACESO, DANO_CABECA, DANO_CORPO, PERDE_NO_ESTAGIO, VITIMA_LINHAS, cssDaTransforma, estagioDaVida,
  pontoNaArte, zumbiDaPose, type Estagio, type ParteVitima, type QuadroDanca,
} from './chefaoArte';
import {
  FURIA_MS, MORDIDA_MS, acendendo, comecarCura, comecarFuga, comecarFuria, criarMovimento, desviar, emCura, limites,
  mover, naFuria, quadroAtual, type Movimento,
} from './chefaoMovimento';
import {
  manchaNoChao, nota, pedacoQueVoa, pingo, poeira, rastro, recortar, respingo, textoQueSobe, vitima, type Vitima,
} from './chefaoEfeitos';
import { criarDetector, type Detector } from './autoclick';
import {
  LOTE_MS, MAX_ACERTOS_POR_LOTE, RANKING_MS, chefaoChegando, curando, curarChefao, danoDoLote, enviarLote,
  faltaDaCura, formatarRelogio, lerChefao, motivoDoErroDaCura, situacaoNaTela, type Golpeador, type MeuPlacar, type ResultadoLote, type RodadaChefao, type SituacaoChefao,
} from './chefao';
import { nomeCurto } from './caca';
import { IconePixel, PalcoDaMorte, type Morte } from './cena';
import { furo } from './furo';
import { SpriteZumbi } from './SpriteZumbi';
import {
  somAcertoChefao, somArranca, somArroto, somAu, somChefaoCai, somChefaoChega, somFuria, somHeeHee, somMoonwalk,
  somNhac, somPouso, somPulo, somRasga, somSocorro, somTique, somTiro, prepararVozesDoChefao, tocarTrilha, volumeDoChefao, type Trilha,
} from './sons';
import './caca.css';

/** O chefão é maior que o zumbi comum (2×): cada pixel da arte vira 3×3. */
const ESCALA = 3;
const L = LARGURA * ESCALA;
const A = ALTURA * ESCALA;
const CAIXA = { largura: L, altura: A };

/** Quanto tempo ele leva subindo da terra antes de dançar (o CSS é 1 s). */
const ENTRADA_MS = 1_200;
/** A poça de quando ele cai: fica e desbota mais rápido que a do zumbi comum (eram 60 s + 30 s). */
const POCA_DA_MORTE_MS = 12_000;
const POCA_SOME_MS = 8_000;
/** O «hee-hee» da chegada, com ele ainda saindo da terra (09/10/2026 — «quando ele surgir, tocar o hihi»). */
const HEE_HEE_DA_CHEGADA_MS = 350;

/** Apanhou isto em `RAJADA_MS`: sai pulando para outro canto. */
const RAJADA = 5;
const RAJADA_MS = 1_500;

/**
 * Sem aviso do banco há tanto tempo (mais um sorteio do mesmo tamanho), com ele
 * na tela: relê UMA vez — o freio dos avisos pode ter engolido o último. Só
 * relê de novo depois que algo mudar: era a cada 4 s, para sempre, em toda aba
 * — e na contagem de 1 min, quando nada muda, eram ~40 leituras por segundo
 * com 150 abas.
 */
const RELER_QUIETO_MS = 5_000;

/** De quanto em quanto tempo, desde a chegada, ele entra na Fúria (além de quando perde um braço). */
const FURIA_A_CADA_MS = 40_000;

/** O rastro: uma cópia a cada tanto, deslizando ou na Fúria. */
const RASTRO_MS = 70;
/** Na Fúria, menos cópias: com muitas, ele virava um borrão. */
const RASTRO_FURIA_MS = 110;

/** Machucado, ele dá um tranco de dor de vez em quando, e o toco pinga. */
const TRANCO_MS: readonly [number, number] = [2_500, 5_500];
const PINGO_MS = 260;

/** Onde fica o toco de cada braço, em px da arte (para o sangue pingar dali). */
const TOCO: Readonly<Partial<Record<Estagio, { x: number; y: number }>>> = {
  2: { x: 15, y: 16 },
  3: { x: 10, y: 17 },
};

/** A vítima do banquete, em px da tela. */
const VL = VITIMA_LINHAS[0].length * ESCALA;
const VA = VITIMA_LINHAS.length * ESCALA;
/** Quanto ele se encosta nela (px): comendo, ele fica por cima. */
const ENCOSTA = 22;
/** Chegou com menos que isto de banquete (aba que acordou tarde): nem começa. */
const FIM_SEM_BANQUETE_MS = 1_500;

/**
 * O roteiro do banquete, em ms desde `cura_em` (o banco dá 12 s, `CURA_MS`):
 * ela entra andando; ele a vê; ela se assusta; ele sai correndo. O bote vem
 * quando ele chega perto (`chefaoMovimento.ts`), e o resto é comer.
 */
const ANDA_MS = 1_800;
const VE_MS = 1_900;
const SUSTO_MS = 2_250;
const CORRE_MS = 2_600;
/** De quão longe ela vem andando (do lado oposto ao dele). */
const ENTRA_DE = 170;

/**
 * O que ele arranca, e em que ponto do banquete (fração das mordidas). Uma
 * parte por mordida; depois da cabeça, ele rói o tronco (`ROI_DE` em diante).
 */
const DESMEMBRA: readonly (readonly [number, ParteVitima])[] = [
  [0.1, 'bracoA'], [0.26, 'bracoB'], [0.42, 'pernaA'], [0.56, 'pernaB'], [0.7, 'cabeca'],
];
const ROI_DE = 0.74;

const sortear = ([a, b]: readonly [number, number]) => a + Math.random() * (b - a);

// ── A lâmina presa à janela ─────────────────────────────────────────────────

interface Palco {
  folha: HTMLDivElement;
  largura: number;
  altura: number;
}

/**
 * Uma lâmina fixa do tamanho do palco (o `<main>`), sem rolar com ele: o
 * chefão anda pela parte visível da tela, e quem rola continua vendo ele.
 */
function usePalco(): Palco | null {
  const [palco, setPalco] = useState<Palco | null>(null);
  useEffect(() => {
    const alvo = document.querySelector<HTMLElement>('[data-palco-abobora]') ?? document.body;
    const folha = document.createElement('div');
    folha.className = 'zb-chefao-palco';
    document.body.appendChild(folha);
    const ajustar = () => {
      const r = alvo.getBoundingClientRect();
      const largura = alvo.clientWidth || r.width;
      const altura = alvo === document.body ? window.innerHeight : alvo.clientHeight || r.height;
      folha.style.left = `${r.left}px`;
      folha.style.top = `${Math.max(0, r.top)}px`;
      folha.style.width = `${largura}px`;
      folha.style.height = `${altura}px`;
      setPalco(p => (p && p.largura === largura && p.altura === altura ? p : { folha, largura, altura }));
    };
    ajustar();
    window.addEventListener('resize', ajustar);
    const observador = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(ajustar) : null;
    observador?.observe(alvo);
    return () => {
      window.removeEventListener('resize', ajustar);
      observador?.disconnect();
      folha.remove();
    };
  }, []);
  return palco;
}

// ── Os quadros prontos ──────────────────────────────────────────────────────

interface Pronto {
  img: Imagem;
  pixels: ImageData;
  /** Os pixels dos olhos, quando acesos (o brilho vai em cima deles). */
  olhos: { x: number; y: number }[];
}

const prontos = new Map<string, Pronto>();

function quadroPronto(qd: QuadroDanca, estagio: Estagio, aceso: boolean): Pronto {
  const zumbi = zumbiDaPose(qd, estagio, aceso);
  const chave = `${zumbi.id}|${JSON.stringify(qd.quadro.desloca)}|${qd.quadro.piscando ? 1 : 0}`;
  let p = prontos.get(chave);
  if (!p) {
    const img = montarQuadro(zumbi, qd.quadro);
    const olhos: { x: number; y: number }[] = [];
    if (aceso) {
      img.cores.forEach((c, i) => { if (c === COR_OLHO_ACESO) olhos.push({ x: i % img.largura, y: Math.floor(i / img.largura) }); });
    }
    p = { img, pixels: imagemParaPixels(img, true), olhos };
    prontos.set(chave, p);
  }
  return p;
}

// ── O chefão ────────────────────────────────────────────────────────────────

type Fase = 'entrando' | 'dancando' | 'fugindo' | 'morrendo';

function Chefao({
  palco, situacao, estagio, estagioDoBanco, chegouEm, curaEm, curaAte, curaSemente, curaVida, golpeFinalMeu,
  aoAcertar, aoFuria, aoSumir,
}: {
  palco: Palco;
  situacao: SituacaoChefao;
  /** Os ferimentos: sai da vida de todos. Só sobe. */
  estagio: Estagio;
  /** O estágio pela vida do BANCO (igual para todos): é ele que chama a Fúria. */
  estagioDoBanco: Estagio;
  /** Quando ele chegou (`solta_em`, em ms): o relógio da Fúria marcada. */
  chegouEm: number;
  /** O banquete do banco (ms): de quando a quando, a vítima e quanto ele recupera. */
  curaEm: number | null;
  curaAte: number | null;
  curaSemente: number;
  curaVida: number;
  /** Fui eu que tirei a última gota (a morte é do jeito do meu último tiro). */
  golpeFinalMeu: boolean;
  aoAcertar: (cabeca: boolean) => void;
  aoFuria: (ligada: boolean) => void;
  aoSumir: () => void;
}) {
  const chaoRef = useRef<HTMLDivElement>(null);
  const caixaRef = useRef<HTMLDivElement>(null);
  const corpoRef = useRef<HTMLSpanElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const olhosRef = useRef<(HTMLSpanElement | null)[]>([]);
  const tamanho = useRef({ largura: palco.largura, altura: palco.altura });
  tamanho.current = { largura: palco.largura, altura: palco.altura };
  const estagioRef = useRef(estagio);
  const [fase, setFase] = useState<Fase>('entrando');
  const [morte, setMorte] = useState<{ morte: Morte; zumbi: typeof CHEFAO; x: number; y: number } | null>(null);
  const ultimoTiroCabeca = useRef(false);
  const acertos = useRef<number[]>([]);
  const fim = useRef(aoSumir);
  fim.current = aoSumir;
  const furiaAvisa = useRef(aoFuria);
  furiaAvisa.current = aoFuria;

  const m = useRef<Movimento | null>(null);
  if (!m.current) m.current = criarMovimento(palco.largura, palco.altura, CAIXA, performance.now(), ENTRADA_MS);

  /** Um ponto da arte, onde está agora na tela (sem a inclinação — é para sangue e pedaço). */
  const naTela = useCallback((ax: number, ay: number, largura = 1) => {
    const s = m.current!;
    const { qd, t } = quadroAtual(s, performance.now());
    const espelho = s.lado * qd.transforma.vira < 0;
    return {
      x: s.x + (espelho ? LARGURA - ax - largura : ax) * ESCALA,
      y: s.y - s.ar - t.sobe * ESCALA + ay * ESCALA,
      espelho,
    };
  }, []);

  // Chega: a porta rangendo, o trovão, o uivo, o «hee-hee» de quem chegou, e o
  // nome em cima da cabeça.
  useEffect(() => {
    somChefaoChega();
    const hihi = setTimeout(() => somHeeHee(1, true), HEE_HEE_DA_CHEGADA_MS);
    const t = setTimeout(() => {
      setFase(f => (f === 'entrando' ? 'dancando' : f));
      const s = m.current!;
      textoQueSobe(palco.folha, s.x + L / 2, s.y - 8, 'THRILLER!', 'passo');
    }, ENTRADA_MS);
    return () => { clearTimeout(t); clearTimeout(hihi); };
    // Só na chegada.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Entra na Fúria do Rei: os olhos acendem, ele para, e sai dançando.
   * `desde` (performance.now) pode estar no passado: quem entrou no meio de
   * uma Fúria pega só o resto, sem o letreiro nem o som.
   */
  const furia = useCallback((desde: number) => {
    const s = m.current!;
    const agora = performance.now();
    if (s.fugindo || naFuria(s, agora) || agora < s.entraAte || emCura(s, agora)) return;
    comecarFuria(s, desde);
    if (agora - desde > 500) return;
    somFuria();
    textoQueSobe(palco.folha, s.x + L / 2, s.y - 14, 'FÚRIA DO REI!', 'furia');
  }, [palco.folha]);

  // Machucou mais: o braço voa, o sangue espirra, e ele entra na Fúria.
  useEffect(() => {
    const antes = estagioRef.current;
    if (estagio <= antes || fase === 'morrendo') { estagioRef.current = Math.max(antes, estagio) as Estagio; return; }
    estagioRef.current = estagio;
    const s = m.current!;
    const agora = performance.now();
    const chao = s.y + A - 4;
    for (let e = antes + 1; e <= estagio; e++) {
      const parte = PERDE_NO_ESTAGIO[e as Estagio];
      if (parte) {
        // O braço como estava neste quadro, ainda inteiro (o estágio de antes).
        const { qd } = quadroAtual(s, agora);
        const img = montarQuadro(zumbiDaPose(qd, (e - 1) as Estagio), qd.quadro, p => p === parte);
        const r = recortar(img);
        if (r) {
          const pos = naTela(r.x, r.y, r.pixels.width);
          const voa = (pos.espelho ? 1 : -1) * (160 + Math.random() * 140);
          pedacoQueVoa(palco.folha, r, pos.x, pos.y, ESCALA, pos.espelho, voa, chao + (Math.random() - 0.3) * 18);
          respingo(palco.folha, pos.x + (r.pixels.width * ESCALA) / 2, pos.y + 6, 1);
          respingo(palco.folha, pos.x + (r.pixels.width * ESCALA) / 2, pos.y + 12, 1);
        }
        manchaNoChao(palco.folha, s.x + L / 2, chao, 0.9);
        somArranca();
        textoQueSobe(palco.folha, s.x + L / 2, s.y - 10, parte === 'bracoTras' ? 'LÁ SE VAI UM BRAÇO!' : 'E O OUTRO!', 'final');
      } else {
        somAu();
        respingo(palco.folha, s.x + L / 2, s.y + A * 0.3, 0.8);
        manchaNoChao(palco.folha, s.x + L / 2, chao, 0.5);
        textoQueSobe(palco.folha, s.x + L / 2, s.y - 10, 'OW!', 'final');
      }
    }
    s.trancoAte = agora + 300;
    s.trancoLado = s.lado;
  }, [estagio, fase, palco.folha, naTela]);

  // Perdeu um braço PELA VIDA DO BANCO: fica furioso — na tela de todos ao
  // mesmo tempo (o aviso chega junto para todo mundo).
  const maiorEstagioDoBanco = useRef(estagioDoBanco);
  useEffect(() => {
    if (estagioDoBanco <= maiorEstagioDoBanco.current) return;
    maiorEstagioDoBanco.current = estagioDoBanco;
    if (PERDE_NO_ESTAGIO[estagioDoBanco]) furia(performance.now());
  }, [estagioDoBanco, furia]);

  // A Fúria marcada no relógio da luta: a cada `FURIA_A_CADA_MS` desde a
  // chegada. Quem chega no meio de uma, entra nela com o tempo que sobra.
  useEffect(() => {
    if (fase !== 'dancando') return;
    let t: ReturnType<typeof setTimeout>;
    const agendar = () => {
      const agora = Date.now();
      const k = Math.floor((agora - chegouEm) / FURIA_A_CADA_MS);
      const comecoDaVez = chegouEm + k * FURIA_A_CADA_MS;
      if (k >= 1 && agora - comecoDaVez < FURIA_MS) furia(performance.now() - (agora - comecoDaVez));
      t = setTimeout(agendar, Math.max(50, comecoDaVez + FURIA_A_CADA_MS - agora));
    };
    agendar();
    return () => clearTimeout(t);
  }, [fase, furia, chegouEm]);

  // O banquete: a vítima entra andando e ele vai comer. A hora é do banco
  // (igual para todos); quem chega no meio pega o resto.
  const vitimaRef = useRef<Vitima | null>(null);
  const curaVista = useRef<number | null>(null);
  const curaVidaRef = useRef(curaVida);
  curaVidaRef.current = curaVida;
  const mordidas = useRef({ total: 1, dadas: 0, porMordida: 0 });
  /** Onde ela está (a caixa de pé) e se já se assustou. */
  const ela = useRef({ x: 0, y: 0, assustou: false });

  /** Onde ele para para comer: encostado nela, do lado de onde vem (sem espaço, do outro). */
  const ondeComer = useCallback((bossX: number) => {
    const { largura, altura } = tamanho.current;
    const b = limites(largura, altura, CAIXA);
    const { x: vx, y: vy } = ela.current;
    const encosta = (daEsquerda: boolean) => (daEsquerda ? vx - L + ENCOSTA : vx + VL - ENCOSTA);
    let daEsquerda = bossX + L / 2 < vx + VL / 2;
    if (encosta(daEsquerda) < b.x0 || encosta(daEsquerda) > b.x1) daEsquerda = !daEsquerda;
    return {
      x: Math.min(b.x1, Math.max(b.x0, encosta(daEsquerda))),
      y: Math.min(b.y1, Math.max(b.y0, vy + VA - A)),
      lado: (daEsquerda ? 1 : -1) as 1 | -1,
    };
  }, []);

  useEffect(() => {
    if (curaEm === null || curaAte === null || fase === 'morrendo' || fase === 'fugindo') return;
    if (curaVista.current === curaEm) return;
    const agoraMs = Date.now();
    if (agoraMs >= curaAte - FIM_SEM_BANQUETE_MS) return;
    curaVista.current = curaEm;
    const s = m.current!;
    const decorrido = Math.max(0, agoraMs - curaEm);
    const de = performance.now() - decorrido;
    const { largura, altura } = tamanho.current;
    const b = limites(largura, altura, CAIXA);
    const sem = Math.abs(curaSemente);
    // Onde ela para (os pés no chão onde ele pode pisar): a semente decide.
    const by = b.y0 + ((Math.floor(sem / 997) % 991) / 991) * (b.y1 - b.y0);
    const vx = Math.min(largura - VL - 8, Math.max(8, b.x0 + ((sem % 997) / 997) * (b.x1 + L - VL - b.x0)));
    const vy = by + A - VA;
    ela.current = { x: vx, y: vy, assustou: decorrido >= SUSTO_MS };
    const alvo = ondeComer(s.x);
    comecarCura(s, de, de + (curaAte - curaEm), alvo.x, alvo.y, alvo.lado, de + VE_MS, de + CORRE_MS);
    vitimaRef.current?.sumir(false);
    // Ela vem do lado oposto ao dele, andando; quem chega depois a acha no lugar.
    const longeDele = s.x + L / 2 < vx + VL / 2 ? 1 : -1;
    const vemDe = Math.min(largura - VL - 8, Math.max(8, vx + longeDele * ENTRA_DE));
    const resta = ANDA_MS - decorrido;
    const v = vitima(
      palco.folha, vx, vy, sem, ESCALA, caixaRef.current,
      resta > 200 ? { deX: vemDe + (vx - vemDe) * (decorrido / ANDA_MS), ms: resta } : undefined,
    );
    if (ela.current.assustou) v.assustar();
    vitimaRef.current = v;
    mordidas.current = { total: 1, dadas: 0, porMordida: 0 };
  }, [curaEm, curaAte, curaSemente, fase, palco.folha, ondeComer]);

  // Saiu da tela no meio do banquete (caiu, fugiu, acabou): a vítima vai junto.
  useEffect(() => () => { vitimaRef.current?.sumir(false); }, []);

  // O laço: anda, troca o quadro, escreve o transform, solta rastro, poeira e sangue.
  useEffect(() => {
    if (fase === 'morrendo') return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    let quadro = 0;
    let antes = performance.now();
    let pintado: Pronto | null = null;
    let ultimoRastro = 0;
    let ultimaNota = 0;
    let ultimoPingo = 0;
    let pingos = 0;
    let proximoTranco = antes + sortear(TRANCO_MS);
    let furiaAntes = false;
    const rodar = (agora: number) => {
      const dt = Math.min(64, agora - antes);
      antes = agora;
      const s = m.current!;
      const { largura, altura } = tamanho.current;
      const est = estagioRef.current;
      for (const ev of mover(s, dt, agora, largura, altura, CAIXA, est)) {
        if (ev.tipo === 'passo') {
          // Na Fúria os passos trocam rápido: o letreiro dela basta.
          if (!naFuria(s, agora)) textoQueSobe(palco.folha, s.x + L / 2, s.y - 8, ev.passo.nome, 'passo');
          if (ev.passo.id === 'chute') somAu(0.3);
        } else if (ev.tipo === 'pousou') {
          somPouso();
          poeira(palco.folha, ev.x + L / 2, ev.y + A, true);
        } else if (ev.tipo === 'pe') {
          somMoonwalk();
          if (Math.random() < 0.5) poeira(palco.folha, s.x + L / 2 + (s.lado > 0 ? -12 : 12), s.y + A, false);
        } else if (ev.tipo === 'viu') {
          // Ele a viu: o alvo sai de onde ele está AGORA (andou dançando).
          const alvo = ondeComer(s.x);
          if (s.cura) Object.assign(s.cura, alvo);
          textoQueSobe(palco.folha, s.x + L / 2, s.y - 18, '!', 'final');
          textoQueSobe(palco.folha, s.x + L / 2, s.y - 4, 'FOME!', 'furia');
          somHeeHee(1, true);
        } else if (ev.tipo === 'bote') {
          somPulo();
          poeira(palco.folha, s.x + L / 2, s.y + A, true);
        } else if (ev.tipo === 'chegouNaVitima') {
          const v = vitimaRef.current;
          if (v && s.cura) {
            v.derrubar(s.cura.lado);
            const meio = v.meio();
            respingo(palco.folha, meio.x, meio.y, 1);
            textoQueSobe(palco.folha, meio.x, meio.y - 20, 'AAAH!', 'final');
          }
          somNhac();
          somSocorro();
          // As mordidas que cabem até o fim dividem a vida do banquete.
          const total = Math.max(1, Math.floor(((s.cura?.ate ?? agora) - agora) / MORDIDA_MS));
          mordidas.current = { total, dadas: 0, porMordida: curaVidaRef.current / total };
        } else if (ev.tipo === 'mordida') {
          const v = vitimaRef.current;
          const md = mordidas.current;
          md.dadas += 1;
          const fr = md.dadas / md.total;
          somNhac(0.6);
          if (v) {
            // Um pedaço por mordida, na hora marcada: voa, espirra, e ele dá o tranco de quem puxou.
            for (const [quando, parte] of DESMEMBRA) {
              if (fr < quando || !v.arrancar(parte)) continue;
              somRasga();
              s.trancoAte = agora + 240;
              s.trancoLado = -s.lado;
              const meio = v.meio();
              textoQueSobe(palco.folha, meio.x, meio.y - 16, parte === 'cabeca' ? 'A CABEÇA!' : 'RRRASGA!', 'final');
              break;
            }
            if (fr >= ROI_DE) v.roer((fr - ROI_DE) / (1 - ROI_DE));
            const meio = v.meio();
            respingo(palco.folha, meio.x + (Math.random() - 0.5) * 24, meio.y + (Math.random() - 0.5) * 10, 0.6);
            if (md.dadas % 2 === 0) manchaNoChao(palco.folha, meio.x + (Math.random() - 0.5) * 30, v.chao - 2, 0.35);
          }
          const ganho = Math.round(md.porMordida * md.dadas) - Math.round(md.porMordida * (md.dadas - 1));
          if (ganho > 0 && md.dadas <= md.total) {
            textoQueSobe(palco.folha, s.x + L / 2 + (Math.random() - 0.5) * 24, s.y - 4, `+${ganho}`, 'cura');
          }
          if (md.dadas % 3 === 1) textoQueSobe(palco.folha, s.x + L / 2, s.y - 16, 'NHAC!', 'passo');
        } else if (ev.tipo === 'curaAcabou') {
          vitimaRef.current?.sumir(true);
          vitimaRef.current = null;
          somArroto();
          textoQueSobe(palco.folha, s.x + L / 2, s.y - 12, 'BURP!', 'final');
        }
      }
      // Ela se assusta pouco depois de ele a ver: braços para cima, tremendo.
      const v = vitimaRef.current;
      if (v && s.cura && !ela.current.assustou && agora >= s.cura.de + SUSTO_MS) {
        ela.current.assustou = true;
        v.assustar();
        somSocorro();
        const meio = v.meio();
        textoQueSobe(palco.folha, meio.x, meio.y - 40, 'SOCORRO!', 'final');
      }
      const furiaAgora = naFuria(s, agora);
      if (furiaAgora !== furiaAntes) { furiaAntes = furiaAgora; furiaAvisa.current(furiaAgora); }

      const { qd, t, achata } = quadroAtual(s, agora);
      const aceso = furiaAgora;
      const pronto = quadroPronto(qd, est, aceso);
      if (pronto !== pintado) { ctx.putImageData(pronto.pixels, 0, 0); pintado = pronto; }
      const transform = cssDaTransforma(t, s.lado, ESCALA, achata);
      const caixa = caixaRef.current;
      if (caixa) {
        caixa.style.transform = `translate(${Math.round(s.x)}px, ${Math.round(s.y - s.ar)}px)`;
        caixa.classList.toggle('furia', furiaAgora);
        caixa.classList.toggle('acendendo', acendendo(s, agora));
        caixa.classList.toggle('comendo', emCura(s, agora));
      }
      if (corpoRef.current) corpoRef.current.style.transform = transform;
      // O holofote fica no chão: no pulo, encolhe e apaga.
      if (chaoRef.current) {
        chaoRef.current.style.transform = `translate(${Math.round(s.x)}px, ${Math.round(s.y)}px) scale(${(1 - Math.min(0.5, s.ar / 240)).toFixed(2)})`;
      }
      // Os olhos acesos: o brilho em cima de cada pixel do olho.
      olhosRef.current.forEach((el, i) => {
        if (!el) return;
        const o = aceso ? pronto.olhos[i] : undefined;
        el.style.display = o ? 'block' : 'none';
        if (o) { el.style.left = `${o.x * ESCALA}px`; el.style.top = `${o.y * ESCALA}px`; }
      });
      // O rastro: deslizando, no moonwalk e na Fúria.
      const desliza = s.acao?.tipo === 'deslize' || s.passo.anda === 'tras' || furiaAgora;
      if (desliza && agora - ultimoRastro > (furiaAgora ? RASTRO_FURIA_MS : RASTRO_MS) && agora >= s.entraAte) {
        ultimoRastro = agora;
        rastro(palco.folha, pronto.pixels, s.x, s.y - s.ar, L, A, transform, furiaAgora, chaoRef.current);
      }
      if (furiaAgora && agora - ultimaNota > 170) {
        ultimaNota = agora;
        nota(palco.folha, s.x + L / 2 + (Math.random() - 0.5) * L * 1.4, s.y - s.ar + A * (0.2 + Math.random() * 0.5));
      }
      // Machucado: o tranco de dor, e o toco pingando.
      if (est >= 1 && agora > proximoTranco && !s.acao && !furiaAgora && !s.cura) {
        proximoTranco = agora + sortear(TRANCO_MS);
        s.trancoAte = agora + 220;
        s.trancoLado = Math.random() < 0.5 ? -1 : 1;
      }
      // Um toco no estágio 2; os dois no 3, alternando.
      const tocos = est >= 3 ? [TOCO[2], TOCO[3]] : est >= 2 ? [TOCO[2]] : [];
      const toco = tocos.length ? tocos[pingos % tocos.length] : undefined;
      if (toco && agora - ultimoPingo > PINGO_MS && agora >= s.entraAte) {
        ultimoPingo = agora;
        pingos += 1;
        const espelho = s.lado * qd.transforma.vira < 0;
        const px = s.x + (espelho ? LARGURA - toco.x : toco.x) * ESCALA;
        const py = s.y - s.ar - t.sobe * ESCALA + toco.y * ESCALA;
        pingo(palco.folha, px, py, s.y + A - 4 + (Math.random() - 0.5) * 6);
      }
      if (s.fugindo && (s.x < -L * 1.5 || s.x > largura + L * 0.5)) { fim.current(); return; }
      quadro = requestAnimationFrame(rodar);
    };
    quadro = requestAnimationFrame(rodar);
    return () => { cancelAnimationFrame(quadro); furiaAvisa.current(false); };
  }, [fase, palco.folha, ondeComer]);

  // O fim que vem do banco (ou do relógio): cai, ou foge dançando.
  useEffect(() => {
    const s = m.current!;
    if (situacao !== 'ativo') { vitimaRef.current?.sumir(false); vitimaRef.current = null; }
    if (situacao === 'derrotado' && fase !== 'morrendo') {
      const { qd } = quadroAtual(s, performance.now());
      const pose = qd.pernas === 'chute' ? { bracos: qd.bracos, pernas: 'normal' as const } : qd;
      const zumbi = zumbiDaPose(pose, estagioRef.current);
      const tiro = golpeFinalMeu && ultimoTiroCabeca.current ? 'cabeca' : 'corpo';
      const img = montarQuadro(zumbi, { desloca: {} });
      somChefaoCai();
      textoQueSobe(palco.folha, s.x + L / 2, s.y - 14, golpeFinalMeu ? 'GOLPE FINAL!' : 'K.O.!', 'final');
      manchaNoChao(palco.folha, s.x + L / 2, s.y + A - 4, 1);
      setMorte({
        morte: {
          tiro, quadro: 0, lado: s.lado,
          impacto: centroDaParte(img, NUMERO_DA_PARTE[tiro === 'cabeca' ? 'cabeca' : 'tronco']),
        },
        zumbi, x: s.x, y: s.y,
      });
      setFase('morrendo');
    } else if (situacao === 'fugiu' && !s.fugindo) {
      comecarFuga(s, tamanho.current.largura, CAIXA);
      textoQueSobe(palco.folha, s.x + L / 2, s.y - 8, 'FUI!', 'passo');
      somHeeHee();
      setFase('fugindo');
    }
  }, [situacao, fase, golpeFinalMeu, palco.folha]);

  function atirar(e: PointerEvent<HTMLSpanElement>) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    // Clique de script não vira tiro (e o detector anota: `autoclick.ts`).
    if (!e.nativeEvent.isTrusted) return;
    const s = m.current!;
    if (fase === 'morrendo' || s.fugindo || situacao !== 'ativo' || !caixaRef.current) return;
    const agora = performance.now();
    const r = caixaRef.current.getBoundingClientRect();
    const { qd, t } = quadroAtual(s, agora);
    const p = pontoNaArte(e.clientX - r.left, e.clientY - r.top, t, s.lado, ESCALA, LARGURA, ALTURA);
    const pronto = quadroPronto(qd, estagioRef.current, naFuria(s, agora));
    const parte = parteNoPonto(pronto.img, p.x, p.y);
    if (!parte) { furo(e.clientX, e.clientY); return; }

    somTiro();
    const { largura, altura } = tamanho.current;
    // Comendo: imune (o banco também recusa).
    if (emCura(s, agora)) {
      textoQueSobe(palco.folha, s.x + L / 2, s.y - s.ar - 6, 'IMUNE!', 'esquiva');
      return;
    }
    // Foge para o lado contrário de onde o tiro veio.
    const fuga = e.clientX - r.left < L / 2 ? 1 : -1;
    // Subindo da terra, no meio de um pulo, ou na Fúria: escapa sempre.
    if (agora < s.entraAte || s.acao) {
      textoQueSobe(palco.folha, s.x + L / 2, s.y - s.ar - 6, 'MISS', 'esquiva');
      return;
    }
    if (naFuria(s, agora)) {
      const onde = desviar(s, 'passinho', fuga, agora, largura, altura, CAIXA);
      somHeeHee(0.25);
      textoQueSobe(palco.folha, onde.x + L / 2, onde.y - 10, Math.random() < 0.5 ? 'INTOCÁVEL!' : 'HEE-HEE!', 'esquiva');
      return;
    }
    if (Math.random() < s.passo.esquiva) { esquiva(fuga, agora); return; }

    const cabeca = parte === NUMERO_DA_PARTE.cabeca;
    ultimoTiroCabeca.current = cabeca;
    aoAcertar(cabeca);
    somAcertoChefao(cabeca);
    const local = { x: e.clientX - r.left + s.x, y: e.clientY - r.top + s.y - s.ar };
    textoQueSobe(palco.folha, local.x, local.y - 10, cabeca ? `-${DANO_CABECA} HEADSHOT!` : `-${DANO_CORPO}`, cabeca ? 'hs' : 'dano');
    respingo(palco.folha, local.x, local.y, cabeca ? 0.8 : 0.35);
    // O sangue que cai no chão, aos pés dele.
    manchaNoChao(palco.folha, local.x + (Math.random() - 0.5) * 24, s.y + A - 4 + (Math.random() - 0.5) * 10, cabeca ? 0.35 : 0.15);
    const corpo = corpoRef.current;
    if (corpo) {
      corpo.classList.add('levou');
      setTimeout(() => corpo.classList.remove('levou'), 70);
    }
    // Apanhou demais seguido: sai pulando.
    acertos.current = [...acertos.current.filter(t0 => agora - t0 < RAJADA_MS), agora];
    if (acertos.current.length >= RAJADA) {
      acertos.current = [];
      esquiva(fuga, agora, 'pulo');
    }
  }

  /** O desvio de fora da Fúria: um pulo em arco ou um deslize de costas. */
  function esquiva(fuga: number, agora: number, tipo: 'pulo' | 'deslize' = Math.random() < 0.55 ? 'pulo' : 'deslize') {
    const s = m.current!;
    const { largura, altura } = tamanho.current;
    const de = { x: s.x, y: s.y };
    const onde = desviar(s, tipo, fuga, agora, largura, altura, CAIXA);
    somHeeHee(0.5);
    if (tipo === 'pulo') { somPulo(); poeira(palco.folha, de.x + L / 2, de.y + A, true); } else somMoonwalk();
    textoQueSobe(palco.folha, de.x + L / 2, de.y - 6, 'ESQUIVOU!', 'esquiva');
    textoQueSobe(palco.folha, onde.x + L / 2, onde.y - 16, 'HEE-HEE!', 'passo');
  }

  if (fase === 'morrendo' && morte) {
    return (
      <PalcoDaMorte
        camada={{ folha: palco.folha }}
        zumbi={morte.zumbi}
        morte={morte.morte}
        x={morte.x}
        y={morte.y}
        escala={ESCALA}
        resquicioMs={POCA_DA_MORTE_MS}
        someMs={POCA_SOME_MS}
        aoAcabar={aoSumir}
      />
    );
  }

  const s = m.current;
  return createPortal(
    <>
      <div ref={chaoRef} className="zb-chefao-chao" style={{ width: L, height: A }} aria-hidden="true" />
      <div
        ref={caixaRef}
        className={fase === 'entrando' ? 'zb-chefao entrando' : 'zb-chefao'}
        style={{ width: L, height: A, transform: `translate(${Math.round(s.x)}px, ${Math.round(s.y)}px)` }}
      >
        <span className="zb-chefao-aura" aria-hidden="true" />
        <span
          ref={corpoRef}
          className="zb-chefao-corpo"
          role="button"
          tabIndex={-1}
          aria-label="O Rei do Pop zumbi! Atire nele"
          onPointerDown={atirar}
          onContextMenu={e => e.preventDefault()}
        >
          <canvas ref={canvasRef} width={LARGURA} height={ALTURA} className="zb-chefao-sprite" />
          {[0, 1].map(i => (
            <span
              key={i}
              ref={el => { olhosRef.current[i] = el; }}
              className="zb-chefao-olho"
              style={{ width: ESCALA, height: ESCALA, display: 'none' }}
              aria-hidden="true"
            />
          ))}
        </span>
      </div>
    </>,
    palco.folha,
  );
}

// ── O placar de cima ────────────────────────────────────────────────────────

function Placar({ palco, rodada, vida, eu, meuDano, minhaPosicao, furia, superAdmin }: {
  palco: Palco;
  rodada: RodadaChefao;
  vida: number;
  eu: string | null;
  meuDano: number;
  minhaPosicao: number;
  /** A Fúria do Rei: o placar avisa que agora ele é intocável. */
  furia: boolean;
  /** Só o super_admin tem o botão do banquete. */
  superAdmin: boolean;
}) {
  const [agora, setAgora] = useState(() => Date.now());
  const comendo = curando(rodada, agora);
  // Comendo, a barra sobe aos poucos: o relógio do placar anda mais rápido.
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), comendo ? 150 : 500);
    return () => clearInterval(t);
  }, [comendo]);
  const [pedindo, setPedindo] = useState(false);
  async function curar() {
    setPedindo(true);
    const { erro } = await curarChefao(rodada.id);
    setPedindo(false);
    if (erro) toast.error('Não deu para recuperar a vida', { description: motivoDoErroDaCura(erro) });
  }
  const falta = Date.parse(rodada.expira_em) - agora;
  // O banco devolve a vida de uma vez; a barra mostra o que ele já comeu.
  vida = Math.max(0, vida - faltaDaCura(rodada, agora));
  const pct = Math.max(0, Math.min(100, (vida / rodada.vida_max) * 100));
  const top = rodada.ranking.slice(0, 3);
  return createPortal(
    <div className={comendo ? 'zb-chefao-hud comendo' : furia ? 'zb-chefao-hud furia' : 'zb-chefao-hud'} role="status" aria-live="off">
      <SpriteZumbi zumbi={CHEFAO} soCabeca escala={2} className="zb-chefao-hud-cabeca" />
      <div className="zb-chefao-hud-meio">
        <div className="zb-chefao-hud-titulo">
          <span>REI DO POP ZUMBI</span>
          <span className={falta < 30_000 ? 'zb-chefao-hud-relogio urgente' : 'zb-chefao-hud-relogio'}>{formatarRelogio(falta)}</span>
        </div>
        <div className="zb-chefao-vida" aria-label={`Vida: ${vida} de ${rodada.vida_max}`}>
          <div className="zb-chefao-vida-barra" style={{ width: `${pct}%` }} />
          <span className="zb-chefao-vida-numero">{vida} / {rodada.vida_max}</span>
        </div>
        <div className="zb-chefao-hud-linha">
          {comendo
            ? <span className="zb-chefao-hud-cura">COMENDO · IMUNE · </span>
            : furia && <span className="zb-chefao-hud-furia">FÚRIA DO REI · INTOCÁVEL · </span>}
          {rodada.participantes > 0 ? `${rodada.participantes} na caçada` : 'Atire nele!'}
          {meuDano > 0 && <> · você: <b>{meuDano}</b> de dano{minhaPosicao > 0 ? ` (${minhaPosicao}º)` : ''}</>}
        </div>
      </div>
      {superAdmin && (
        <button
          type="button"
          className="zb-chefao-curar"
          onClick={() => { void curar(); }}
          disabled={pedindo || comendo || rodada.vida >= rodada.vida_max}
          title="Uma pessoa entra andando, ele a vê e devora: recupera 25% da vida máxima e fica imune por 12 s (só você vê este botão)"
        >
          {comendo ? 'COMENDO…' : pedindo ? '…' : '+ RECUPERAR VIDA'}
        </button>
      )}
      {top.length > 0 && (
        <ol className="zb-chefao-top">
          {top.map((g, i) => (
            <li key={g.usuario} className={g.usuario === eu ? 'eu' : undefined}>
              <span className="pos">{i + 1}º</span>
              <span>{nomeCurto(g.nome)}</span>
              <span className="dano">{g.dano}</span>
            </li>
          ))}
        </ol>
      )}
    </div>,
    palco.folha,
  );
}

// ── A contagem antes de ele chegar ──────────────────────────────────────────

/** Nos últimos tantos segundos, o tique; nos últimos tantos, o número grande no meio. */
const TIQUE_S = 10;
const NUMERAO_S = 5;

/**
 * O minuto antes de ele aparecer: o aviso em cima, no lugar do placar, com o
 * relógio; o tique baixinho no fim e o 5, 4, 3, 2, 1 grande no meio da tela.
 * A hora da chegada é do banco (`solta_em`): todo mundo conta junto.
 */
function Contagem({ palco, rodada }: { palco: Palco; rodada: RodadaChefao }) {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 200);
    return () => clearInterval(t);
  }, []);
  const falta = Math.max(0, Date.parse(rodada.solta_em) - agora);
  const seg = Math.ceil(falta / 1000);
  const tocou = useRef<number | null>(null);
  useEffect(() => {
    if (seg >= 1 && seg <= TIQUE_S && tocou.current !== seg) {
      tocou.current = seg;
      somTique(seg <= 3);
    }
  }, [seg]);
  return createPortal(
    <>
      <div className="zb-chefao-hud zb-chefao-contagem" role="status" aria-live="polite">
        <SpriteZumbi zumbi={CHEFAO} soCabeca escala={2} className="zb-chefao-hud-cabeca" />
        <div className="zb-chefao-hud-meio">
          <div className="zb-chefao-hud-titulo"><span>O REI DO POP ZUMBI ESTÁ CHEGANDO</span></div>
          <div className={seg <= TIQUE_S ? 'zb-chefao-contagem-relogio urgente' : 'zb-chefao-contagem-relogio'}>
            {formatarRelogio(falta)}
          </div>
          <div className="zb-chefao-hud-linha">Prepare a mira: todo mundo atira junto na mesma vida.</div>
        </div>
      </div>
      {seg >= 1 && seg <= NUMERAO_S && <div key={seg} className="zb-chefao-numerao" aria-hidden="true">{seg}</div>}
    </>,
    palco.folha,
  );
}

// ── O ranking final ─────────────────────────────────────────────────────────

function Avatar({ g }: { g: Golpeador }) {
  const [semFoto, setSemFoto] = useState(false);
  if (g.foto && !semFoto) {
    return <img src={g.foto} alt="" className="zb-chefao-avatar" loading="eager" onError={() => setSemFoto(true)} />;
  }
  const iniciais = nomeCurto(g.nome).split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
  return <span className="zb-chefao-avatar" aria-hidden="true">{iniciais}</span>;
}

function RankingFinal({ rodada, situacao, eu, meu, aoFechar }: {
  rodada: RodadaChefao;
  situacao: SituacaoChefao;
  eu: string | null;
  meu: MeuPlacar | null;
  aoFechar: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(aoFechar, RANKING_MS);
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') aoFechar(); };
    window.addEventListener('keydown', tecla);
    return () => { clearTimeout(t); window.removeEventListener('keydown', tecla); };
  }, [aoFechar]);

  const derrotado = situacao === 'derrotado';
  const maior = Math.max(1, ...rodada.ranking.map(g => g.dano));
  const estouNoTopo = !!eu && rodada.ranking.some(g => g.usuario === eu);
  return createPortal(
    <div className={derrotado ? 'zb-chefao-final' : 'zb-chefao-final fugiu'} role="dialog" aria-label="Ranking do chefão">
      <div className="zb-chefao-final-topo">
        <SpriteZumbi zumbi={CHEFAO} soCabeca morta={derrotado} escala={3} />
        <div>
          <span className="zb-chefao-final-titulo">{derrotado ? 'O REI DO POP CAIU!' : 'ELE FUGIU DANÇANDO...'}</span>
          {derrotado ? (
            <span className="zb-chefao-final-golpe">
              Golpe final de <b>{rodada.golpe_final_por === eu ? 'você' : nomeCurto(rodada.golpe_final_nome)}</b>
            </span>
          ) : (
            <span className="zb-chefao-final-golpe">Sobrou <b>{rodada.vida}</b> de {rodada.vida_max} de vida.</span>
          )}
          {rodada.participantes > 0 && (
            <span className="zb-chefao-final-sub">
              {rodada.participantes === 1 ? '1 pessoa ajudou' : `${rodada.participantes} pessoas ajudaram`}
            </span>
          )}
        </div>
        <button type="button" className="zb-chefao-final-fechar" onClick={aoFechar} aria-label="Fechar o ranking">X</button>
      </div>
      {rodada.ranking.length === 0 ? (
        <p className="zb-chefao-final-vazio">Ninguém acertou nele.</p>
      ) : (
        <ol className="zb-chefao-lista">
          {rodada.ranking.map((g, i) => (
            <li key={g.usuario} className={g.usuario === eu ? 'eu' : undefined}>
              <span className="pos">{i + 1}º</span>
              <Avatar g={g} />
              <span className="quem">
                <span className="nome">
                  <span>{g.usuario === eu ? `${nomeCurto(g.nome)} (você)` : nomeCurto(g.nome)}</span>
                  {derrotado && g.usuario === rodada.golpe_final_por && <span className="zb-chefao-golpe">GOLPE FINAL</span>}
                </span>
                <span className="barra"><i style={{ width: `${(g.dano / maior) * 100}%` }} /></span>
              </span>
              <span className="numeros">
                <span className="dano">{g.dano}</span>
                <span className="detalhe">
                  {g.acertos + g.headshots} {g.acertos + g.headshots === 1 ? 'tiro' : 'tiros'}
                  {g.headshots > 0 && <><IconePixel nome="mira" tam={1} />{g.headshots}</>}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
      {!estouNoTopo && meu && meu.dano > 0 && (
        <p className="zb-chefao-final-eu">Você: {meu.posicao}º lugar, {meu.dano} de dano.</p>
      )}
    </div>,
    document.body,
  );
}

// ── A cena ──────────────────────────────────────────────────────────────────

/**
 * O chefão de uma rodada, do começo ao fim: montada com a chave da rodada
 * (`index.tsx`), vive até ele cair ou fugir e o ranking ser fechado.
 */
export function CenaChefao({ rodada, eu, superAdmin, aoAcabar }: {
  rodada: RodadaChefao;
  /** Quem está na tela, para achar a pessoa no ranking. */
  eu: string | null;
  /** O super_admin ouve o chefão inteiro; o operador, sempre a 50% (`VOLUME_DO_OPERADOR`). */
  superAdmin: boolean;
  aoAcabar: () => void;
}) {
  const palco = usePalco();
  const situacao = situacaoNaTela(rodada, Date.now());
  // Solto, mas ainda na contagem: só o aviso, sem chefão, sem trilha.
  const chegando = chefaoChegando(rodada, Date.now());
  // Só quem viu o chefão vivo vê ele cair e o ranking: quem chega depois não.
  const viuVivo = useRef(situacao === 'ativo');
  const [naTela, setNaTela] = useState(situacao === 'ativo');
  const [ranking, setRanking] = useState(false);

  // Os tiros guardados até o próximo lote, e o dano que ainda não voltou do banco.
  const lote = useRef({ acertos: 0, headshots: 0 });
  const [pendente, setPendente] = useState(0);
  const [meu, setMeu] = useState<MeuPlacar | null>(null);
  const avisouErro = useRef(false);
  // O detector de autoclick: ouve os cliques enquanto ele está na tela.
  const detector = useRef<Detector | null>(null);
  useEffect(() => {
    if (situacao !== 'ativo' || chegando) return;
    const d = criarDetector();
    detector.current = d;
    return () => { d.parar(); if (detector.current === d) detector.current = null; };
  }, [situacao, chegando]);
  const ultimaVersao = useRef({ versao: rodada.versao, em: Date.now(), relido: false });

  useEffect(() => { carregarFontesPixel(); prepararVozesDoChefao(); }, []);
  // Antes de qualquer som tocar: o volume de quem está na tela.
  useLayoutEffect(() => volumeDoChefao(superAdmin), [superAdmin]);

  useLayoutEffect(() => {
    if (rodada.versao !== ultimaVersao.current.versao) ultimaVersao.current = { versao: rodada.versao, em: Date.now(), relido: false };
  }, [rodada.versao]);

  // A trilha, enquanto ele dança; na Fúria, ela acelera.
  const trilha = useRef<Trilha | null>(null);
  const [furia, setFuria] = useState(false);
  useEffect(() => {
    if (situacao !== 'ativo' || chegando) return;
    const t = tocarTrilha();
    trilha.current = t;
    return () => { t.parar(); trilha.current = null; };
  }, [situacao, chegando]);
  const aoFuria = useCallback((ligada: boolean) => {
    setFuria(ligada);
    trilha.current?.furia(ligada);
  }, []);

  // Acabou: o ranking abre para quem viu a luta.
  useEffect(() => {
    if (situacao !== 'ativo' && viuVivo.current) setRanking(true);
    if (situacao !== 'ativo') { lote.current = { acertos: 0, headshots: 0 }; setPendente(0); }
  }, [situacao]);

  const aoAcertar = useCallback((cabeca: boolean) => {
    if (cabeca) lote.current.headshots += 1; else lote.current.acertos += 1;
    setPendente(p => p + (cabeca ? DANO_CABECA : DANO_CORPO));
  }, []);

  // O lote: a cada `LOTE_MS`, o que foi guardado vai ao banco.
  //
  // Sob carga (revisão de lançamento, 09/10/2026): todo mundo monta esta cena
  // com o MESMO aviso, então os relógios nasceriam alinhados e cem lotes
  // bateriam no banco no mesmo instante, na fila da mesma linha. Cada aba
  // começa num ponto sorteado do segundo. E só há um lote no ar por vez: com o
  // banco lento, a aba espera e o próximo leva mais tiros (até
  // `MAX_ACERTOS_POR_LOTE`), em vez de empilhar chamadas.
  useEffect(() => {
    if (situacao !== 'ativo') return;
    let vivo = true;
    let noAr = false;
    const chega = Date.parse(rodada.solta_em);
    const quieto = RELER_QUIETO_MS + Math.random() * RELER_QUIETO_MS;
    const tique = () => {
      if (noAr) return;
      const { acertos, headshots } = lote.current;
      if (acertos + headshots === 0) {
        // Ninguém mexeu há um tempo: pergunta uma vez, o último aviso pode ter
        // ficado no freio. Na contagem nada muda: não pergunta.
        const u = ultimaVersao.current;
        const agora = Date.now();
        if (rodada.id > 0 && !u.relido && agora >= chega && agora - Math.max(u.em, chega) > quieto) {
          u.relido = true;
          void lerChefao().catch((): void => undefined);
        }
        return;
      }
      const a = Math.min(acertos, MAX_ACERTOS_POR_LOTE);
      const h = Math.min(headshots, MAX_ACERTOS_POR_LOTE - a);
      lote.current = { acertos: acertos - a, headshots: headshots - h };
      const dano = danoDoLote(a, h);
      const colheita = detector.current?.colher() ?? { cliques: 0, suspeita: 0 };
      noAr = true;
      void enviarLote(rodada.id, a, h, colheita)
        .catch((e: unknown): ResultadoLote => ({ rodada: null, eu: null, erro: e instanceof Error ? e.message : String(e), freio: false }))
        .then(res => {
          noAr = false;
          if (!vivo) return;
          if (res.freio) {
            // Chegou cedo demais ao banco: os tiros voltam para o próximo lote.
            lote.current.acertos += a;
            lote.current.headshots += h;
            detector.current?.devolver(colheita);
            return;
          }
          setPendente(p => Math.max(0, p - dano));
          if (res.eu) setMeu(res.eu);
          if (res.erro && !avisouErro.current) {
            avisouErro.current = true;
            toast.error('Seus tiros não chegaram', { description: res.erro });
          }
        });
    };
    let t: ReturnType<typeof setInterval> | undefined;
    const inicio = setTimeout(() => { tique(); t = setInterval(tique, LOTE_MS); }, Math.random() * LOTE_MS);
    return () => { vivo = false; clearTimeout(inicio); if (t) clearInterval(t); };
  }, [situacao, rodada.id, rodada.solta_em]);

  const fecharRanking = useCallback(() => setRanking(false), []);
  const sumiu = useCallback(() => setNaTela(false), []);

  useEffect(() => {
    if (!naTela && !ranking) aoAcabar();
  }, [naTela, ranking, aoAcabar]);

  const vida = Math.max(0, rodada.vida - pendente);
  // Os ferimentos saem da vida de todos e só pioram: um lote recusado não devolve o braço.
  const [estagio, setEstagio] = useState<Estagio>(() => estagioDaVida(rodada.vida, rodada.vida_max));
  const estagioDaVidaAgora = estagioDaVida(vida, rodada.vida_max);
  useEffect(() => {
    if (situacao === 'ativo') setEstagio(e => (estagioDaVidaAgora > e ? estagioDaVidaAgora : e));
  }, [estagioDaVidaAgora, situacao]);

  // A Fúria olha a vida do banco, que é a mesma em toda tela.
  const estagioDoBanco = estagioDaVida(rodada.vida, rodada.vida_max);

  if (!palco) return null;
  const minhaPosicao = (eu ? rodada.ranking.findIndex(g => g.usuario === eu) + 1 : 0) || (meu?.posicao ?? 0);
  const doRanking = eu ? rodada.ranking.find(g => g.usuario === eu)?.dano ?? 0 : 0;
  const meuDano = Math.max(doRanking, meu?.dano ?? 0) + pendente;

  return (
    <>
      {chegando && <Contagem palco={palco} rodada={rodada} />}
      {naTela && viuVivo.current && !chegando && (
        <Chefao
          palco={palco}
          situacao={situacao}
          estagio={estagio}
          estagioDoBanco={estagioDoBanco}
          chegouEm={Date.parse(rodada.solta_em)}
          curaEm={rodada.cura_em ? Date.parse(rodada.cura_em) : null}
          curaAte={rodada.cura_ate ? Date.parse(rodada.cura_ate) : null}
          curaSemente={rodada.cura_semente}
          curaVida={rodada.cura_vida}
          golpeFinalMeu={!!eu && rodada.golpe_final_por === eu}
          aoAcertar={aoAcertar}
          aoFuria={aoFuria}
          aoSumir={sumiu}
        />
      )}
      {situacao === 'ativo' && !chegando && (
        <Placar palco={palco} rodada={rodada} vida={vida} eu={eu} meuDano={meuDano} minhaPosicao={minhaPosicao} furia={furia} superAdmin={superAdmin} />
      )}
      {ranking && <RankingFinal rodada={rodada} situacao={situacao} eu={eu} meu={meu} aoFechar={fecharRanking} />}
    </>
  );
}

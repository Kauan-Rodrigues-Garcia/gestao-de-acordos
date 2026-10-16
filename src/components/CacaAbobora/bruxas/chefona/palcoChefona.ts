/**
 * palcoChefona.ts — onde a Bruxa do Pântano flutua, joga poção e morre.
 *
 * A chefona é a BRUXA DO MINECRAFT (`arte.ts`). Um motor sem React, como o
 * `../palco.ts` das bruxas comuns: recebe um elemento e põe nele um canvas de
 * baixa resolução (um pixel do canvas = um pixel da arte, ampliado pelo CSS
 * sem suavizar), a caixa de tiro, a barra de chefe, a contagem e os letreiros.
 *
 * ## A luta
 *
 * - Antes dela, a CONTAGEM (1 min, como o Rei do Pop): o aviso no alto com o
 *   relógio, o tique nos 10 s finais e o 5, 4, 3, 2, 1 grande no meio.
 * - Ela flutua sob Levitação. Tiro por peça: a cabeça é CRÍTICO, o chapéu
 *   quase nada; o tiro que passa raspando (até `FOLGA_MIRA`) pega a peça mais
 *   perto. Cada tiro deixa ela vermelha um instante (o dano do jogo), e ela
 *   vai ficando ESTRAGADA (três estágios: fuligem, rasgos, curativo; ver
 *   `estragos` em `arte.ts`), soltando fumaça. Quanto mais estragada, mais
 *   FRACA e CURTA a poção (nível II → I).
 * - Apanhou demais em pouco tempo: ela bebe uma poção ou JOGA a pérola do
 *   Ender (`movimento.ts`). Só some do tiro no instante do teleporte.
 * - De tempos em tempos ela para, gargalha, ergue a garrafa e JOGA A POÇÃO: a
 *   garrafa voa em arco, gira, estoura no alvo e o efeito pega a tela. Quem
 *   atira enquanto ela prepara tira mais vida, e dano suficiente QUEBRA a
 *   poção (ela fica tonta).
 * - O forte é o ENCANTAMENTO: a mesa de encantamento aparece no chão, as
 *   runas do Alfabeto Galáctico voam para o livro e giram em volta dela, a
 *   frase dela se escreve em runas no alto, e a página distorce.
 * - A CURA é de quem comanda (`curar()`, o botão do laboratório): ela para,
 *   leva a Poção de Cura à boca, bebe (os goles, o nariz mexendo) e a vida
 *   volta de uma vez, como a Vida Instantânea do jogo.
 * - O FEITIÇO DE PROTEÇÃO (`proteger()`) é o Totem da Imortalidade: ela ergue
 *   o totem e passa a segurá-lo. O golpe que a mataria não mata: o totem
 *   estoura na tela (o ídolo dourado subindo e girando, as partículas verdes e
 *   amarelas), ela fica com 1 de vida, ganha Absorção (a parte dourada da
 *   barra) e Regeneração. Um totem por feitiço.
 * - Com pouca vida, a FÚRIA: mais rápida, joga mais, desvia mais.
 * - Vida zero: a morte do Minecraft — vermelha, cai, tomba de lado, some num
 *   «puf» de fumaça branca e deixa os drops dela (garrafa, redstone, pedra
 *   luminosa, açúcar, olho de aranha, graveto, pólvora) e as bolinhas de XP,
 *   que voam para a barra; a última toca o «subiu de nível». Toda poção ativa
 *   se desfaz na hora.
 *
 * Os itens e os sons são os do jogo (`texturasMC.ts`, `sonsMC.ts`, 15/10/2026).
 *
 * ## A barra, o escudo e o computador fraco (15/10/2026)
 *
 * - A vida aparece em CORAÇÕES de chefe (`coracoes.ts`): duas fileiras de 20,
 *   os do modo hardcore, que piscam, tremem e ficam dourados como no jogo.
 * - Enquanto ela está na tela, um ESCUDO cobre o Gestão: clique fora dela não
 *   chega no app (ninguém abre acordo, apaga linha ou troca de aba sem querer
 *   atirando). A rolagem passa, e o que estiver marcado com
 *   `data-chefona-livre` (a barra lateral) fica de fora. O super_admin não tem
 *   escudo (`escudo: false`). Quem esconde o chefão desmonta o palco e o escudo
 *   vai junto.
 * - Tiro nela SEMPRE tira vida (15/10/2026: «clicar nela e ela não tomar dano é
 *   frustrante»). Nas manobras, no piscar do teleporte e de vez em quando na
 *   sorte, o tiro é DE RASPÃO: metade do dano, e ela se esquiva para o lado,
 *   deixando um rastro de si mesma.
 * - Quem ajudou a derrubar ganha a PLACA de conquista épica (`conquista.ts`).
 *   Quando o ranking abre, ela sobe para a faixa do alto, menor
 *   (`ancorarConquista`, 16/10/2026), e o ranking começa embaixo dela: a placa
 *   nunca cobre o dano e o golpe final.
 * - A fúria e o estrago acompanham os corações: se a vida volta (a cura, ou
 *   gente nova entrando, que aumenta a vida de todos), a fúria passa.
 * - Em computador fraco ela roda LEVE (`leve.ts`): 30 quadros por segundo,
 *   menos partículas, e as poções da tela toda sem `filter`. O palco mede os
 *   próprios quadros e liga o leve sozinho se a luta engasgar.
 * - Prazo acabou: ela gargalha e vai embora.
 *
 * No laboratório (`../laboratorio.ts`) a vida é desta tela. Na caça de
 * verdade (`CenaChefona.tsx`, 15/10/2026) a vida é do BANCO, a mesma para
 * todos (`banco.ts`): o palco recebe uma `FonteDoBanco` e passa a só mostrar
 * — a vida vem dela a cada quadro, a morte, o totem e a cura acontecem quando
 * o banco diz, e o prazo é o do banco. A bruxa voando, as poções e os desvios
 * continuam desta tela.
 */
import { furo } from '../../furo';
import { somAcerto, somCerebro, somTiro, somTique } from '../../sons';
import { NUMERO_DA_PARTE, PARTE_DO_NUMERO, alvoDaParte, centroDaParte, parteNoPonto, type Imagem, type NomeParte } from '../arte';
import { canvasDaImagem, miniatura } from '../pixels';
import { somBloco, somBrava, somCura, somOnda, somPuf, somPufMorte, somVento } from '../sons';
import {
  LADO, TREME_ABAIXO, coracoesDaVida, coracoesDeOuro, posicaoDoCoracao, pulinhoDaRegeneracao, tamanhoDosCoracoes,
  type Coracao,
} from './coracoes';
import {
  ALTURA_MC, BOCA, COR_DA_CURA, DROPS, ESCALA_CHEFONA, GARRAFA, LARGURA_MC, MAO_ERGUIDA, MAO_NO_ALTO, NOME_CHEFONA, OUTRA_MAO,
  PEROLA, PIXEL_MC, PONTA_DO_CHAPEU, PRIMEIRO_BEBENDO_MC, PRIMEIRO_DOR_MC, PRIMEIRO_RINDO_MC, PRIMEIRO_SEGURANDO_MC,
  PRIMEIRO_TOTEM_MC, QUADROS_FLUTUANDO, TOTEM, cabecaMC, comContorno, coresDaPocao, estagioDoDano, montarBruxaMC,
  type Item,
} from './arte';
import { escreverMC, larguraTextoMC } from './fonteMC';
import {
  FEITICOS, FEITICO_FORTE, LISTA_FEITICOS, alvoDaPocao, alvosPorAtributo, disponivel, duracaoDoFeitico, encantoDa,
  escolherVariante, feiticosLeves, forcaDoFeitico, lancar, nivelDaPocao, type AlvosFeitico, type NomeFeitico,
} from './feiticos';
import { ESCALA_PLACA, PLACA_MS, montarPlaca } from './conquista';
import { chefonaLeve, criarVigiaDeQuadros, marcarChefonaLeve } from './leve';
import { ENCANTO, glifo, letrasComRuna } from './galatico';
import {
  COR_MANOBRA, NOME_MANOBRA, avancarCorpo, balanco, criarCorpo, escolherManobra, faseDaPerola, iniciarManobra, novoAlvo,
  pairar, type Corpo, type Manobra, type Zona,
} from './movimento';
import {
  prepararSonsMC, somArremesso, somBeber, somComemora, somConquista, somDor, somEncantamento, somGargalhada, somMorte,
  somNivel, somPerola, somTeleporte, somTotem, somVidro, somXp,
} from './sonsMC';
import {
  CORACAO_CHEIO_MC, CORACAO_CHEIO_PISCA_MC, CORACAO_CURA_MC, CORACAO_METADE_MC, CORACAO_METADE_PISCA_MC, CORACAO_OURO_MC,
  CORACAO_OURO_METADE_MC, CORACAO_SECO_MC, CORACAO_SECO_METADE_MC, CORACAO_VAZIO_MC, CORACAO_VAZIO_PISCA_MC, ESTANTE_MC,
  LIVRO_CAPA_MC, LIVRO_PAGINA_MC, MESA_LADO_MC, MESA_TOPO_MC, ORBES_MC,
} from './texturasMC';
import './chefona.css';

const LARG = LARGURA_MC;
const ALT = ALTURA_MC;

// ── Os números da luta ─────────────────────────────────────────────────────

export const VIDA_PADRAO = 300;
export const PRAZO_PADRAO_S = 120;
/** A contagem antes dela (s), como a do Rei do Pop. */
export const ESPERA_PADRAO_S = 60;
const TIQUE_S = 10;
const NUMERAO_S = 5;
/** Velocidade de cruzeiro (px da arte/s), e na fúria. */
const VELOCIDADE = 70;
const VELOCIDADE_FURIA = 105;
/** O dano de cada tiro, pela peça. */
export const DANO: Readonly<Record<ReturnType<typeof alvoDaParte>, number>> = {
  cabeca: 6, corpo: 3, vassoura: 2, chapeu: 2, raspao: 1,
};
/** Abaixo desta fração da vida, a fúria; ela só passa se a vida voltar a esta folga acima. */
export const FURIA_EM = 0.35;
export const SAI_DA_FURIA = 0.1;
/** Preparando a poção ela apanha 50% a mais; tonta, o dobro. */
const MULT_CONJURANDO = 1.5;
const MULT_TONTA = 2;
/** Dano no preparo (fração da vida máxima) que quebra a poção; o Encantamento pede mais. */
export const QUEBRA_FEITICO = 0.06;
const QUEBRA_FORTE = 0.09;
const CONJURO_S = 1.4;
const CONJURO_FORTE_S = 2.8;
const TONTA_S = 1.8;
/** O vermelho do dano (o do jogo). */
const DOR_MS = 260;
/**
 * Entre uma poção e outra (s), normal e na fúria. A primeira sai mais cedo.
 * Eram 12–18 s e ela quase não jogava (Kauan, 15/10/2026: «está usando poucos
 * feitiços»); passou a 7–11 s. Em 16/10/2026 saíram quatro poções e ficaram
 * seis, cada uma com jeitos diferentes de cair: ela joga mais (5–8 s) e
 * passa por todas antes de repetir (`RECENTES`).
 */
const INTERVALO: readonly [number, number] = [5, 8];
const INTERVALO_FURIA: readonly [number, number] = [3.5, 6];
const PRIMEIRO_FEITICO_S = 3;
/** Quantas das últimas poções ela evita repetir (se houver outra para jogar). */
const RECENTES = 3;
/** O Encantamento: o primeiro não antes disto (s de luta), e depois um a cada tanto. */
const PRIMEIRO_FORTE_S = 20;
const ENTRE_FORTES_S = 22;
/**
 * Tiros dentro de `JANELA_S` que fazem ela desviar, e a folga entre manobras.
 * Subiram em 15/10/2026: com 6 tiros em 1,6 s ela desviava o tempo todo de
 * quem clica rápido.
 */
const JANELA_S = 1.6;
const LIMIAR_DESVIO = 9;
const LIMIAR_DESVIO_FURIA = 7;
const CHANCE_DESVIO = 0.04;
const CHANCE_DESVIO_FURIA = 0.07;
const FOLGA_MANOBRA_S = 4;
/** O tiro de raspão: a chance fora das manobras, a fração do dano, e a esquiva (s e px da arte). */
export const CHANCE_RASPAO = 0.12;
export const DANO_RASPAO = 0.5;
const ESQUIVA_S = 0.3;
const ESQUIVA_PX = 8;
/** O tiro que passa a até tantos pixels da arte dela ainda pega (a peça mais perto). */
export const FOLGA_MIRA = 4;
/** A pérola voando: a altura do arco (px da arte). */
const ARCO_PEROLA = 46;
/** A Poção de Cura: quanto da vida ela devolve e quanto tempo ela leva bebendo (o gole do jogo é 1,6 s). */
export const CURA_FRACAO = 0.22;
export const BEBER_S = 1.8;
/** A cor da Poção de Cura (a da Vida Instantânea do jogo). */
const COR_CURA = COR_DA_CURA;
/** O feitiço de proteção: quanto tempo ela leva erguendo o totem. */
const PROTEGER_S = 1.3;
/** O totem salvou: a Absorção (fração da vida máxima, a parte dourada) e a Regeneração. */
export const ABSORCAO_FRACAO = 0.1;
export const REGEN_FRACAO = 0.15;
export const REGEN_S = 8;
/** A conquista de quem ajudou a derrubar a chefona (o desafio do Minecraft). */
export const CONQUISTA = {
  titulo: 'Desafio concluído!',
  nome: 'Quem Mandou Jogar Poção?',
  descricao: `Ajudou a derrubar a ${NOME_CHEFONA}`,
  raridade: '★ Raridade épica ★',
} as const;
/** A toast do jogo (`toastDeConquista`): a cor do título de desafio (§d). */
const COR_DESAFIO = '#ff55ff';
const SOMBRA_DESAFIO = '#3f153f';
/** A morte: gravidade, o tombo de lado, o tempo deitada e quanto os drops ficam. */
const GRAVIDADE = 330;
const TOMBO_S = 0.45;
const DEITADA_S = 0.9;
const DROPS_S = 12;
const ORBES_XP = 14;

const MAX_PARTICULAS = 700;
/** Leve (computador fraco): bem menos partículas, e só uma parte das que nascem. */
const MAX_PARTICULAS_LEVE = 220;
const SOBRA_DE_PARTICULAS_LEVE = 0.5;
/** Cada pixel do coração vira tantos px da tela (o jogo usa a escala da interface). */
const ESCALA_CORACAO = 3;
/** As estantes da mesa de encantamento: a distância da mesa (px da arte). */
const ESTANTE_LONGE = 58;
const MAX_LETREIROS = 14;
/** As partículas de bruxa (roxas) e as da levitação. */
const CORES_BRUXA = ['#a040e0', '#c070ff', '#7a2ad0'] as const;
const CORES_LEVITACAO = ['#ceffff', '#9ae8f0', '#ffffff'] as const;
const CORES_PORTAL = ['#c040ff', '#8a1ad0', '#e0a0ff', '#2a0a4a'] as const;
const CORES_FUMACA = ['#ffffff', '#e8e8e8', '#c8c8c8', '#a8a8a8'] as const;
const CORES_CRITICO = ['#fff4c8', '#e8c890', '#ffffff'] as const;
const CORES_CURA = [COR_CURA, '#ff8a8a', '#ffc0c0'] as const;
/** As partículas do totem (verdes e amarelas, as do jogo) e as da Regeneração (rosa). */
const CORES_TOTEM = ['#c8ff3a', '#86e020', '#4ec81a', '#f8e040', '#ffd020', '#fff6a0'] as const;
const CORES_REGEN = ['#cd5cab', '#e88ad0', '#f4b8e4'] as const;
const CORES_MANTO = ['#6a1fb0', '#5a1a9a', '#8a3ad0', '#1f8a2a', '#1a1a1c'] as const;
/** A fumaça roxa que sai da ponta do chapéu (a da referência). */
const CORES_FUMACA_CHAPEU = ['#8a1ad0', '#a83ae8', '#6a10a8', '#c070ff'] as const;
/** A fumaça cinza de quem está estragada (estágio 2 em diante) e as fagulhas do estágio 3. */
const CORES_FUMACA_DANO = ['#6a6460', '#857e78', '#4e4844'] as const;
const CORES_FAGULHA = ['#ff8a2a', '#ffb040', '#ffd870'] as const;

export type Fase =
  | 'fora' | 'chegando' | 'entrando' | 'voando' | 'conjurando' | 'tonta' | 'curando' | 'protegendo'
  | 'caindo' | 'tombando' | 'fugindo';

export type EventoChefona =
  | { tipo: 'chegando'; segundos: number }
  | { tipo: 'entrou' }
  | { tipo: 'acertou'; dano: number; parte: NomeParte; vida: number; meu: boolean }
  | { tipo: 'errou' }
  | { tipo: 'esquivou'; manobra: Manobra }
  | { tipo: 'manobra'; manobra: Manobra }
  | { tipo: 'conjurando'; feitico: NomeFeitico; variante: string }
  | { tipo: 'feitico'; feitico: NomeFeitico; variante: string; forca: number; duracaoMs: number }
  | { tipo: 'quebrou'; feitico: NomeFeitico }
  | { tipo: 'bebendo' }
  | { tipo: 'curou'; vida: number }
  | { tipo: 'protegida' }
  | { tipo: 'totem'; vida: number }
  | { tipo: 'furia' }
  | { tipo: 'derrotada'; segundos: number }
  | { tipo: 'fugiu' }
  | { tipo: 'conquista'; nome: string };

/**
 * A vida de todos (a caça de verdade): o palco lê a cada quadro e mostra; o
 * tiro desta tela vai para quem comanda, que junta em lote e manda ao banco.
 */
export interface FonteDoBanco {
  /** O que a barra mostra agora: vida e Absorção (já sem os meus tiros a caminho), a máxima e o tempo que falta. */
  ler(): { vida: number; vidaMax: number; absorcao: number; restanteS: number };
  /** Um tiro DESTA tela acertou: o dano dele e se foi na cabeça. */
  aoAcertar(dano: number, critico: boolean): void;
}

export interface OpcoesChefona {
  escala?: number;
  alvos?: AlvosFeitico;
  aoEvento?: (e: EventoChefona) => void;
  /** Com o banco, a vida é dele (ver `FonteDoBanco`). Sem, é desta tela (o laboratório). */
  banco?: FonteDoBanco;
  /** O escudo que segura os cliques no Gestão (padrão: ligado). O super_admin passa `false`. */
  escudo?: boolean;
}

/** ponto, cruz, estrela (o brilho), espiral (a partícula de efeito de poção). */
type Forma = 'ponto' | 'cruz' | 'estrela' | 'espiral';

interface Particula {
  x: number; y: number; vx: number; vy: number;
  vida: number; max: number; cor: string; tam: number; g: number;
  forma: Forma;
  /** Cai no chão e fica um pouco (a poção derramada). */
  gruda: boolean;
}

interface Anel { x: number; y: number; r: number; vr: number; vida: number; max: number; cor: string }

/** A garrafa voando em arco até o alvo (com o jeito que a poção vai cair). */
interface Garrafa { feitico: NomeFeitico; variante: string; t: number; dura: number; de: { x: number; y: number }; ate: { x: number; y: number }; altura: number }

/** A Poção de Cura na boca: o tempo bebendo, quanto ela vai curar e o próximo gole. */
interface Cura { t: number; total: number; proximoGole: number }

/** A Regeneração que o totem deixa: quanto falta curar e o ritmo. */
interface Regen { resta: number; porSegundo: number; proximoNumero: number }

interface Queda { vy: number; vx: number }

/** A mesa de encantamento no chão, com o livro. */
interface Mesa { x: number; t: number; aparecendo: number; saindo: boolean }

/** Uma runa voando para o livro da mesa. */
interface RunaVoando { de: { x: number; y: number }; t: number; dura: number; letra: string }

interface Drop { item: Item; x: number; y: number; vx: number; vy: number; t: number; fase: number; noChao: boolean }

interface Orbe { x: number; y: number; vx: number; vy: number; t: number; voando: boolean; tam: number; pegou: boolean }

/** A Pérola do Ender voando: de onde saiu e onde vai cair (px da arte). */
interface PerolaVoando { de: { x: number; y: number }; ate: { x: number; y: number } }

const entre = (a: number, b: number) => a + Math.random() * (b - a);

/**
 * A peça no ponto, ou a mais perto até `FOLGA_MIRA` pixels (15/10/2026: ela é
 * fina no chapéu e nos pés, e voa; o tiro que passava raspando virava furo).
 */
export function parteComFolga(img: Imagem, x: number, y: number): number {
  const exato = parteNoPonto(img, x, y);
  if (exato) return exato;
  for (let d = 2; d <= FOLGA_MIRA; d++) {
    for (let dy = -d; dy <= d; dy++) {
      for (let dx = -d; dx <= d; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue;
        const p = parteNoPonto(img, x + dx, y + dy);
        if (p) return p;
      }
    }
  }
  return 0;
}

/** O primeiro ancestral que rola (para a rolagem atravessar o escudo), ou a página. */
function rolavel(el: Element | null): Element | null {
  for (let e = el; e && e !== document.body; e = e.parentElement) {
    const s = getComputedStyle(e);
    if (/(auto|scroll)/.test(`${s.overflowY}${s.overflowX}`) && (e.scrollHeight > e.clientHeight || e.scrollWidth > e.clientWidth)) return e;
  }
  return document.scrollingElement;
}

const sorteia = <T,>(l: readonly T[]): T => l[Math.floor(Math.random() * l.length)];
const FORMATO_MILHAR = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
/** 40700 → «40.700». */
export const milhar = (n: number): string => FORMATO_MILHAR.format(n);
const suave = (u: number) => u * u * (3 - 2 * u);

// ── Os desenhos prontos (guardados: são poucos) ────────────────────────────

const cacheImagens = new Map<number, Imagem>();
/** O sprite sem rachadura, para o tiro por peça. */
function imagemDoQuadro(quadro: number): Imagem {
  let img = cacheImagens.get(quadro);
  if (!img) { img = montarBruxaMC(quadro, 0); cacheImagens.set(quadro, img); }
  return img;
}

const cacheSprites = new Map<string, HTMLCanvasElement>();
/** O sprite com as rachaduras do estágio, já virado, e vermelho quando apanha. */
function sprite(estagio: number, quadro: number, lado: 1 | -1, vermelho: boolean): HTMLCanvasElement {
  const chave = `${estagio}:${quadro}:${lado}:${vermelho}`;
  let c = cacheSprites.get(chave);
  if (!c) {
    c = canvasDaImagem(montarBruxaMC(quadro, estagio), lado < 0);
    if (vermelho) {
      const ctx = c.getContext('2d')!;
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = 'rgba(255,30,30,0.55)';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.globalCompositeOperation = 'source-over';
    }
    cacheSprites.set(chave, c);
  }
  return c;
}

const cacheItens = new Map<Item, Item>();
/** O item com o contorno escuro, guardado (o `miniatura` guarda pelo objeto). */
function contornado(it: Item): Item {
  let c = cacheItens.get(it);
  if (!c) { c = comContorno(it); cacheItens.set(it, c); }
  return c;
}

const cacheGarrafas = new Map<string, Item>();
/** A garrafa de poção do jogo com o líquido da poção (a cor multiplica o cinza do líquido, como no jogo). */
function garrafa(cor: string): HTMLCanvasElement {
  let it = cacheGarrafas.get(cor);
  if (!it) {
    it = contornado({ nome: cor, linhas: GARRAFA, cores: coresDaPocao(cor) });
    cacheGarrafas.set(cor, it);
  }
  return miniatura(it)[0];
}

const cacheOrbes = new Map<string, HTMLCanvasElement>();
/**
 * A bolinha de XP do jogo: a textura em cinza pintada na hora. O jogo varia o
 * vermelho num seno (verde ↔ amarelo) e deixa o verde no máximo; `tom` vai de
 * 0 a 7.
 */
function orbe(tamanho: number, tom: number): HTMLCanvasElement {
  const chave = `${tamanho}:${tom}`;
  let c = cacheOrbes.get(chave);
  if (!c) {
    const o = ORBES_MC[Math.max(0, Math.min(ORBES_MC.length - 1, tamanho))];
    const k = (Math.sin((tom / 8) * Math.PI * 2) + 1) / 2;
    const r = 0.5 + 0.5 * k, b = 0.1 * k;
    const w = o.linhas[0].length, h = o.linhas.length;
    const img: Imagem = { largura: w, altura: h, cores: new Array(w * h).fill(null), partes: new Uint8Array(w * h) };
    const hex = (v: number) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0');
    o.linhas.forEach((l, j) => [...l].forEach((ch, i) => {
      const g = o.cinzas[ch];
      if (g !== undefined) img.cores[j * w + i] = `#${hex(g * r)}${hex(g)}${hex(g * b)}`;
    }));
    c = canvasDaImagem(img, false);
    cacheOrbes.set(chave, c);
  }
  return c;
}

/** O item como imagem (um canvas novo a cada chamada: para pôr na página). */
function imagemDoItem(it: Item): Imagem {
  const w = it.linhas[0].length, h = it.linhas.length;
  const img: Imagem = { largura: w, altura: h, cores: new Array(w * h).fill(null), partes: new Uint8Array(w * h) };
  it.linhas.forEach((l, j) => [...l].forEach((ch, i) => { if (ch !== '.') img.cores[j * w + i] = it.cores[ch] ?? null; }));
  return img;
}

/**
 * A toast de conquista do jogo, em pixels da interface (1 = 1 pixel da GUI):
 * 160 × 32 (cresce se o nome for comprido), cantos cortados, contorno preto,
 * borda cinza, fundo escuro; o ícone em (8, 8), o título em (30, 7) e o nome
 * em (30, 18).
 */
export function toastDeConquista(titulo: string, nome: string, icone: HTMLCanvasElement): HTMLCanvasElement {
  const w = Math.max(160, 30 + Math.max(larguraTextoMC(titulo), larguraTextoMC(nome)) + 8), h = 32;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const c = cv.getContext('2d')!;
  const caixa = (x: number, y: number, cw: number, ch: number, cor: string) => {
    // Retângulo com o canto de 1 pixel cortado.
    c.fillStyle = cor;
    c.fillRect(x + 1, y, cw - 2, ch);
    c.fillRect(x, y + 1, cw, ch - 2);
  };
  caixa(0, 0, w, h, '#000000');
  caixa(1, 1, w - 2, h - 2, '#555555');
  caixa(2, 2, w - 4, h - 4, '#212121');
  c.drawImage(icone, 8, 8);
  escreverMC(c, titulo, 30, 7, COR_DESAFIO, SOMBRA_DESAFIO);
  escreverMC(c, nome, 30, 18, '#ffffff', '#3f3f3f');
  return cv;
}

let mesaPronta: { frente: HTMLCanvasElement; tampo: HTMLCanvasElement; estante: HTMLCanvasElement; topoEstante: HTMLCanvasElement; capa: HTMLCanvasElement; pagina: HTMLCanvasElement } | null = null;

/** A textura girada 90° (o livro aberto fica deitado: a página de 5 × 8 vira 8 × 5). */
function deitado(c: HTMLCanvasElement): HTMLCanvasElement {
  const r = document.createElement('canvas');
  r.width = c.height;
  r.height = c.width;
  const g = r.getContext('2d')!;
  g.translate(r.width, 0);
  g.rotate(Math.PI / 2);
  g.drawImage(c, 0, 0);
  return r;
}
/**
 * A mesa de encantamento do jogo (15/10/2026, a primeira era desenhada à mão e
 * ficou feia): a frente é a textura do lado (12 de altura), o tampo é a
 * textura de cima em perspectiva (cada fileira um pouco mais larga, da de
 * trás para a da frente), as estantes ao lado e o livro do modelo do jogo.
 */
function mesa() {
  if (mesaPronta) return mesaPronta;
  const deItem = (it: Item) => canvasDaImagem(imagemDoItem(it), false);
  // O tampo: 6 fileiras, de 12 a 16 de largura, tiradas do topo (16 × 16).
  const topo = imagemDoItem(MESA_TOPO_MC);
  const tampo = document.createElement('canvas');
  tampo.width = 16;
  tampo.height = 6;
  const t = tampo.getContext('2d')!;
  for (let j = 0; j < 6; j++) {
    const w = 12 + Math.round((j * 4) / 5), x0 = Math.round((16 - w) / 2);
    for (let x = 0; x < w; x++) {
      const cor = topo.cores[Math.floor((j * 16) / 6) * 16 + Math.floor((x * 16) / w)];
      if (!cor) continue;
      t.fillStyle = cor;
      t.fillRect(x0 + x, j, 1, 1);
    }
  }
  // O topo da estante é tábua: duas cores de madeira em listras.
  const topoEstante = document.createElement('canvas');
  topoEstante.width = 16;
  topoEstante.height = 5;
  const te = topoEstante.getContext('2d')!;
  for (let j = 0; j < 5; j++) {
    const w = 13 + Math.round((j * 3) / 4), x0 = Math.round((16 - w) / 2);
    te.fillStyle = j % 2 ? '#9c7f4e' : '#b8945f';
    te.fillRect(x0, j, w, 1);
  }
  mesaPronta = {
    frente: deItem(MESA_LADO_MC), tampo, estante: deItem(ESTANTE_MC), topoEstante,
    capa: deitado(deItem(LIVRO_CAPA_MC)), pagina: deitado(deItem(LIVRO_PAGINA_MC)),
  };
  return mesaPronta;
}

export class PalcoChefona {
  readonly raiz: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly c: CanvasRenderingContext2D;
  private readonly caixa: HTMLDivElement;
  private readonly barra: HTMLDivElement;
  private readonly escala: number;
  private readonly alvos: AlvosFeitico;
  private readonly aoEvento?: (e: EventoChefona) => void;
  private readonly banco?: FonteDoBanco;
  /** O tempo que falta, pelo banco (com ele). */
  private restanteBanco = 0;
  /** A próxima leitura do banco é a primeira desta luta. */
  private primeiraLeitura = true;
  private larg = 0;
  private alt = 0;
  private observador: ResizeObserver | null = null;
  private quadroRaf = 0;
  private antes = 0;

  private fase: Fase = 'fora';
  private corpo: Corpo | null = null;
  private vida = 0;
  private vidaMax = VIDA_PADRAO;
  private prazo = PRAZO_PADRAO_S;
  private tempo = 0;
  private relogio = 0;
  private furia = false;
  /** A fúria veio da vida baixa (e sai quando a vida volta); a do laboratório fica. */
  private furiaPorVida = false;
  private tFase = 0;
  private dorAte = 0;
  /** Esta tela acertou ao menos um tiro (nela): ganha a conquista. */
  private ajudei = false;
  private relogioConquista: ReturnType<typeof setTimeout> | undefined;
  /** O ranking abriu: a placa de conquista mora na faixa do alto, fora do caminho dele. */
  private conquistaNoAlto = false;
  private ultimaDor = 0;
  private estagioVisto = 0;
  private acertos: number[] = [];
  private folgaManobra = 0;
  private ultimaManobra: Manobra | null = null;
  private proximoFeitico = PRIMEIRO_FEITICO_S;
  private proximoForte = PRIMEIRO_FORTE_S;
  /** As últimas poções jogadas (a mais nova no fim), e o último jeito de cada uma. */
  private recentes: NomeFeitico[] = [];
  private readonly ultimaVariante = new Map<NomeFeitico, string>();
  private conjuro: { feitico: NomeFeitico; variante: string; dano: number } | null = null;
  private voando: Garrafa | null = null;
  private ativos = new Map<NomeFeitico, { desfazer: () => void; variante: string }>();
  private particulas: Particula[] = [];
  /** Cheio de partículas, a nova entra no lugar da mais velha (a roda, sem arrastar a lista). */
  private rodaParticulas = 0;
  private aneis: Anel[] = [];
  private clarao = 0;
  private sobraRastro = 0;
  private cura: Cura | null = null;
  /** Segura o Totem da Imortalidade: o próximo golpe fatal não mata. */
  private protegida = false;
  /** A Absorção (vida dourada, gasta antes da vida) e a Regeneração do totem. */
  private absorcao = 0;
  private regen: Regen | null = null;
  private mesa: Mesa | null = null;
  private runas: RunaVoando[] = [];
  private queda: Queda | null = null;
  private drops: Drop[] = [];
  private orbes: Orbe[] = [];
  /** As bolinhas que já chegaram (a última toca o «subiu de nível»). */
  private orbesPegos = 0;
  private perola: PerolaVoando | null = null;
  private tremeAte = 0;
  private chegaEm = 0;
  private segContagem = -1;
  private hudContagem: HTMLDivElement | null = null;
  private letreiros: HTMLDivElement[] = [];
  /** Câmera lenta (1 = normal). Só no laboratório. */
  lenta = 1;
  /** Computador fraco: menos partículas, 30 quadros por segundo, poções sem `filter` (`leve.ts`). */
  private leve = chefonaLeve();
  private readonly vigia = criarVigiaDeQuadros();
  private pularDesenho = false;
  /** O escudo que cobre o Gestão enquanto ela está na tela (clique fora dela não chega no app). */
  private readonly escudo: HTMLDivElement;
  private escudoLigado = false;
  private readonly comEscudo: boolean;
  /** Quando o escudo mede de novo onde fica a barra lateral (s do relógio). */
  private proximaMedidaDoEscudo = 0;
  /** A esquiva do raspão (para que lado, e quanto já andou) e os rastros dela. */
  private esquiva: { t: number; dir: 1 | -1 } | null = null;
  private ultimoRaspao = 0;
  private fantasmas: { x: number; y: number; quadro: number; lado: 1 | -1; estagio: number; vida: number }[] = [];
  /** A barra de corações e os textos dela (guardados: são lidos a cada quadro). */
  private readonly cvCoracoes: HTMLCanvasElement;
  private readonly txtVida: HTMLDivElement;
  private readonly txtTempo: HTMLDivElement;
  private readonly iconeTotem: HTMLCanvasElement;
  private chaveCoracoes = '';
  /** Os números do texto da vida da última vez (o texto só é refeito quando eles mudam). */
  private chaveTextoVida = '';
  /** O tamanho e o lugar da caixa de tiro da última vez (o estilo só é escrito quando muda). */
  private tamanhoCaixa = '';
  private lugarCaixa = '';

  constructor(host: HTMLElement, opcoes: OpcoesChefona = {}) {
    this.escala = opcoes.escala ?? ESCALA_CHEFONA;
    this.alvos = opcoes.alvos ?? alvosPorAtributo();
    this.aoEvento = opcoes.aoEvento;
    this.banco = opcoes.banco;
    this.comEscudo = opcoes.escudo ?? true;
    this.raiz = document.createElement('div');
    this.raiz.className = 'bxc-palco';
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'bxc-canvas';
    this.caixa = this.novaCaixa(`A ${NOME_CHEFONA}! Atire nela`, (x, y) => this.atirar(x, y));
    this.barra = document.createElement('div');
    this.barra.className = 'bxc-barra';
    this.barra.hidden = true;
    this.barra.innerHTML = '<div class="bxc-nome"><span></span></div><canvas class="bxc-coracoes"></canvas><div class="bxc-vida-texto"></div><div class="bxc-tempo"></div>';
    this.barra.querySelector('.bxc-nome span')!.textContent = NOME_CHEFONA;
    this.cvCoracoes = this.barra.querySelector('.bxc-coracoes')!;
    this.cvCoracoes.setAttribute('role', 'img');
    this.txtVida = this.barra.querySelector('.bxc-vida-texto')!;
    this.txtTempo = this.barra.querySelector('.bxc-tempo')!;
    // O totem ao lado do nome enquanto ela está protegida.
    this.iconeTotem = canvasDaImagem(imagemDoItem(contornado(TOTEM)), false);
    this.iconeTotem.className = 'bxc-nome-totem';
    this.iconeTotem.title = 'Protegida pelo Totem da Imortalidade';
    this.iconeTotem.hidden = true;
    this.barra.querySelector('.bxc-nome')!.appendChild(this.iconeTotem);
    this.escudo = this.novoEscudo();
    this.raiz.append(this.canvas, this.escudo, this.caixa, this.barra);
    if (this.leve) this.raiz.classList.add('leve');
    feiticosLeves(this.leve);
    host.appendChild(this.raiz);
    this.c = this.canvas.getContext('2d')!;
    this.medir();
    this.observador = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => this.medir()) : null;
    this.observador?.observe(this.raiz);
    // O sprite fica pronto antes de ela entrar: o primeiro quadro não engasga.
    sprite(0, 0, 1, false);
    // Os sons do jogo descem durante a contagem (sem eles, toca o sintetizado).
    prepararSonsMC();
  }

  private novaCaixa(rotulo: string, aoTiro: (x: number, y: number) => void): HTMLDivElement {
    const el = document.createElement('div');
    el.className = 'bxc-caixa';
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', rotulo);
    el.style.display = 'none';
    el.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      // Na caça de verdade, clique de script não vira tiro (o detector de autoclick anota).
      if (this.banco && !e.isTrusted) return;
      e.preventDefault();
      e.stopPropagation();
      aoTiro(e.clientX, e.clientY);
    });
    return el;
  }

  /**
   * O escudo: cobre a página enquanto ela está na tela. Clique nele é tiro que
   * errou (o furo na parede), não clique no Gestão. A rolagem passa para o que
   * estiver embaixo, para ninguém ficar preso no meio de uma lista.
   */
  private novoEscudo(): HTMLDivElement {
    const el = document.createElement('div');
    el.className = 'bxc-escudo';
    el.style.display = 'none';
    el.innerHTML = '<span class="bxc-escudo-dica"></span>';
    el.firstElementChild!.textContent = 'A tela está pausada enquanto a chefona estiver aqui (o menu ao lado funciona) · «Esconder» volta ao trabalho';
    const segurar = (e: Event) => { e.preventDefault(); e.stopPropagation(); };
    el.addEventListener('pointerdown', e => {
      segurar(e);
      if (e.button !== 0) return;
      furo(e.clientX, e.clientY);
      this.aoEvento?.({ tipo: 'errou' });
    });
    for (const tipo of ['click', 'dblclick', 'auxclick', 'contextmenu', 'mousedown', 'mouseup', 'pointerup']) el.addEventListener(tipo, segurar);
    el.addEventListener('wheel', e => {
      el.style.pointerEvents = 'none';
      const embaixo = document.elementFromPoint(e.clientX, e.clientY);
      el.style.pointerEvents = '';
      rolavel(embaixo)?.scrollBy({ left: e.deltaX, top: e.deltaY });
    }, { passive: true });
    return el;
  }

  /** Liga ou desliga o escudo (só mexe no DOM quando muda). Sem escudo (o super_admin), nunca liga. */
  private escudar(ligado: boolean): void {
    const vale = ligado && this.comEscudo;
    if (vale && this.relogio >= this.proximaMedidaDoEscudo) {
      // A barra lateral fica livre: o escudo começa onde ela termina. Ela abre e
      // fecha, então mede de novo a cada meio segundo (sem ler layout a cada quadro).
      this.proximaMedidaDoEscudo = this.relogio + 0.5;
      this.liberarLaterais();
    }
    if (vale === this.escudoLigado) return;
    this.escudoLigado = vale;
    this.escudo.style.display = vale ? '' : 'none';
  }

  /** Começa o escudo depois do que estiver encostado na esquerda com `data-chefona-livre` (a barra lateral). */
  private liberarLaterais(): void {
    let esquerda = 0;
    for (const el of document.querySelectorAll<HTMLElement>('[data-chefona-livre]')) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && r.left <= 1) esquerda = Math.max(esquerda, r.right);
    }
    const v = `${Math.round(esquerda)}px`;
    if (this.escudo.style.left !== v) this.escudo.style.left = v;
  }

  /** A luta engasgou: daqui em diante, leve (`leve.ts`). */
  private ficarLeve(): void {
    if (this.leve) return;
    this.leve = true;
    marcarChefonaLeve();
    feiticosLeves(true);
    this.raiz.classList.add('leve');
    if (this.particulas.length > MAX_PARTICULAS_LEVE) this.particulas.splice(0, this.particulas.length - MAX_PARTICULAS_LEVE);
    // O que pesa e já está na tela sai agora (o filtro na página toda): as próximas já vêm leves.
    for (const f of ['encantamento', 'visao'] as const) this.ativos.get(f)?.desfazer();
  }

  // ── Tamanho e zona ───────────────────────────────────────────────────────

  private medir(): void {
    const w = Math.max(1, Math.ceil(this.raiz.clientWidth / this.escala));
    const h = Math.max(1, Math.ceil(this.raiz.clientHeight / this.escala));
    if (w === this.larg && h === this.alt) return;
    this.larg = w;
    this.alt = h;
    this.canvas.width = w;
    this.canvas.height = h;
    this.canvas.style.width = `${w * this.escala}px`;
    this.canvas.style.height = `${h * this.escala}px`;
    this.c.imageSmoothingEnabled = false;
  }

  private zona(): Zona {
    // Abaixo da barra de chefe e do aviso (uns 130 px da tela): ela nunca some atrás deles.
    const y0 = Math.max(ALT / 2 + 22, Math.round(190 / this.escala));
    const chao = this.alt - 8;
    return {
      x0: LARG / 2 + 8, x1: Math.max(LARG, this.larg - LARG / 2 - 8),
      y0, y1: Math.max(y0 + 10, Math.min(chao - ALT / 2 - 30, this.alt * 0.62)), chao,
    };
  }

  private get fracao(): number {
    return Math.max(0, this.vida) / this.vidaMax;
  }

  private get estagio(): number {
    return estagioDoDano(this.fracao);
  }

  get estado() {
    return {
      fase: this.fase, vida: Math.max(0, Math.round(this.vida)), vidaMax: this.vidaMax, furia: this.furia,
      feiticos: [...this.ativos.keys()], restante: Math.max(0, this.prazo - this.tempo),
      estagio: this.estagio, forca: forcaDoFeitico(this.fracao),
      contagem: this.fase === 'chegando' ? Math.max(0, Math.ceil((this.chegaEm - performance.now()) / 1000)) : 0,
      protegida: this.protegida, absorcao: Math.round(this.absorcao),
      drops: this.drops.length, orbes: this.orbes.length,
    };
  }

  // ── Comandos ─────────────────────────────────────────────────────────────

  /** Solta a Bruxa: a contagem (se houver) e depois ela. Soltar de novo recomeça. */
  soltar(o: { vida?: number; prazoS?: number; esperaS?: number } = {}): void {
    this.limpar();
    this.medir();
    this.vidaMax = o.vida ?? VIDA_PADRAO;
    this.vida = this.vidaMax;
    this.prazo = o.prazoS ?? PRAZO_PADRAO_S;
    const espera = o.esperaS ?? ESPERA_PADRAO_S;
    if (espera > 0) {
      this.chegaEm = performance.now() + espera * 1000;
      this.mudarFase('chegando');
      this.montarContagem();
      this.aoEvento?.({ tipo: 'chegando', segundos: espera });
      this.acordar();
      return;
    }
    this.entrar();
  }

  /** Esta tela acertou a chefona nesta luta (vai ganhar a placa de conquista quando ela cair). */
  get ajudou(): boolean {
    return this.ajudei;
  }

  /**
   * O ranking abriu: a placa de conquista sobe para a faixa do alto, menor, e
   * o ranking começa embaixo dela. Vale também para a placa que ainda vai
   * aparecer. O aviso do alto sai, para não ficar atrás da placa.
   */
  ancorarConquista(): void {
    this.conquistaNoAlto = true;
    this.raiz.querySelectorAll('.bxc-placa').forEach(p => p.classList.add('no-alto'));
    this.raiz.querySelectorAll('.bxc-aviso').forEach(a => a.remove());
  }

  /** O laboratório pula o resto da contagem. */
  pularContagem(): void {
    if (this.fase === 'chegando') this.chegaEm = performance.now();
  }

  /** Com o banco: a contagem segue a hora de chegada dele (`solta_em`), não a desta tela. */
  chegarEm(segundos: number): void {
    if (this.fase === 'chegando') this.chegaEm = performance.now() + Math.max(0, segundos) * 1000;
  }

  private entrar(): void {
    this.desmontarContagem();
    this.tempo = 0;
    this.furia = false;
    this.furiaPorVida = false;
    this.protegida = false;
    this.absorcao = 0;
    this.regen = null;
    this.cura = null;
    this.estagioVisto = 0;
    this.primeiraLeitura = true;
    this.ajudei = false;
    this.proximoFeitico = PRIMEIRO_FEITICO_S;
    this.proximoForte = PRIMEIRO_FORTE_S;
    this.recentes = [];
    this.corpo = criarCorpo(this.zona(), Math.random);
    this.mudarFase('entrando');
    this.barra.hidden = false;
    this.barra.classList.remove('furia');
    this.caixa.style.display = '';
    somPuf();
    setTimeout(somGargalhada, 200);
    this.aviso(`A ${NOME_CHEFONA} chegou!`, 'Atire nela antes que ela jogue poção no Gestão');
    this.aoEvento?.({ tipo: 'entrou' });
    this.acordar();
  }

  /** Tiro de outra pessoa (os robôs do laboratório): numa peça sorteada. */
  tiroDeOutro(): void {
    const corpo = this.corpo;
    if (!corpo || !this.atingivel()) return;
    const sorte = Math.random();
    const parte: NomeParte = sorte < 0.2 ? 'cabeca' : sorte < 0.65 ? 'tronco' : sorte < 0.85 ? 'bracoFrente' : 'chapeu';
    this.ferir(parte, this.pontoDaParte(parte), false, !!corpo.manobra || !corpo.visivel || Math.random() < CHANCE_RASPAO);
  }

  /** Tira uma fração da vida de uma vez (o «arrancar» do laboratório). */
  arrancar(fracao: number): void {
    if (!this.corpo || !this.atingivel()) return;
    this.tirarVida(this.vidaMax * fracao);
    this.doer();
    this.depoisDoDano();
  }

  /** Joga uma poção já (o laboratório escolhe qual, e o jeito, se quiser). */
  conjurar(f?: NomeFeitico, variante?: string): void {
    if (!this.corpo || !['voando', 'entrando'].includes(this.fase)) return;
    this.corpo.manobra = null;
    this.corpo.visivel = true;
    this.iniciarConjuro(f, variante);
  }

  /** Faz uma manobra já. */
  manobrar(m?: Manobra): void {
    if (!this.corpo || this.fase !== 'voando') return;
    this.fazerManobra(m);
  }

  /**
   * Ela bebe a Poção de Cura (quem escolhe a hora é quem comanda: o botão).
   * Com o banco, ele já decidiu quanto (`total`) e quando: `decorridoS` é o
   * quanto do gole já passou (o aviso chega um pouco depois).
   */
  curar(o: { total?: number; decorridoS?: number } = {}): void {
    if (!this.corpo) return;
    const pode = this.banco ? ['voando', 'entrando', 'conjurando', 'tonta'] : ['voando', 'entrando'];
    if (!pode.includes(this.fase)) return;
    if (!this.banco && this.vida >= this.vidaMax) return;
    // Com o banco, a cura vale de todo jeito: a poção que ela preparava fica para depois.
    if (this.conjuro) { this.conjuro = null; this.encerrarMesa(); }
    this.corpo.manobra = null;
    this.corpo.visivel = true;
    this.iniciarCura(o.total);
    if (this.cura && o.decorridoS) this.cura.t = Math.min(BEBER_S * 0.9, Math.max(0, o.decorridoS));
  }

  /** O feitiço de proteção: ela ergue o Totem da Imortalidade e passa a segurá-lo. */
  proteger(): void {
    if (!this.corpo || this.protegida || !['voando', 'entrando'].includes(this.fase)) return;
    this.corpo.manobra = null;
    this.corpo.visivel = true;
    this.iniciarProtecao();
  }

  /** Com o banco: segurando o totem ou não, sem a cena de erguer (quem chega no meio). */
  definirProtegida(v: boolean): void {
    if (this.fase !== 'protegendo') this.protegida = v;
  }

  /** Com o banco: o golpe fatal pegou o totem. `regen` é a Regeneração que o banco devolveu. */
  totemEstourou(regen: number): void {
    if (!this.corpo || !this.atingivel()) return;
    this.usarTotem(regen);
  }

  /** Com o banco: ela caiu (vida zero lá). */
  derrubar(): void {
    if (this.fase === 'chegando') { this.limpar(); return; }
    if (!this.corpo || !this.atingivel()) return;
    this.derrotar();
  }

  enfurecer(): void {
    if (!this.corpo || this.furia || !this.atingivel()) return;
    this.entrarNaFuria(false);
  }

  /** O prazo acabou: ela gargalha e vai embora. */
  fugir(): void {
    if (this.fase === 'chegando') { this.limpar(); return; }
    if (!this.corpo || ['fora', 'caindo', 'tombando', 'fugindo'].includes(this.fase)) return;
    this.corpo.manobra = null;
    this.corpo.visivel = true;
    this.conjuro = null;
    this.voando = null;
    this.cura = null;
    this.encerrarMesa();
    this.mudarFase('fugindo');
    somComemora();
    this.aviso('Ela fugiu!', 'A bruxa voltou para a cabana do pântano');
    this.caixa.style.display = 'none';
  }

  /** Apaga tudo e desfaz toda poção. */
  limpar(): void {
    this.desfazerTodos();
    clearTimeout(this.relogioConquista);
    this.conquistaNoAlto = false;
    this.raiz.querySelectorAll('.bxc-conquista, .bxc-placa, .bxc-totem').forEach(a => a.remove());
    this.desmontarContagem();
    this.fase = 'fora';
    this.corpo = null;
    this.conjuro = null;
    this.voando = null;
    this.queda = null;
    this.cura = null;
    this.protegida = false;
    this.absorcao = 0;
    this.regen = null;
    this.mesa = null;
    this.runas = [];
    this.drops = [];
    this.orbes = [];
    this.perola = null;
    this.esquiva = null;
    this.fantasmas = [];
    this.particulas = [];
    this.rodaParticulas = 0;
    this.aneis = [];
    this.acertos = [];
    this.caixa.style.display = 'none';
    this.escudar(false);
    this.barra.hidden = true;
    this.chaveCoracoes = '';
    this.chaveTextoVida = '';
    for (const l of this.letreiros) l.remove();
    this.letreiros = [];
    this.raiz.querySelectorAll('.bxc-aviso, .bxc-numerao').forEach(a => a.remove());
    this.c.clearRect(0, 0, this.larg, this.alt);
  }

  destruir(): void {
    this.limpar();
    cancelAnimationFrame(this.quadroRaf);
    this.observador?.disconnect();
    this.raiz.remove();
  }

  // ── A contagem ───────────────────────────────────────────────────────────

  private montarContagem(): void {
    this.desmontarContagem();
    const el = document.createElement('div');
    el.className = 'bxc-contagem';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.innerHTML = '<div class="bxc-contagem-meio"><div class="bxc-contagem-titulo"></div>'
      + '<div class="bxc-contagem-relogio"></div>'
      + '<div class="bxc-contagem-linha">Prepare a mira: todo mundo atira junto na mesma vida.</div></div>';
    el.querySelector('.bxc-contagem-titulo')!.textContent = `A ${NOME_CHEFONA.toUpperCase()} ESTÁ CHEGANDO`;
    const cabeca = canvasDaImagem(cabecaMC(), false);
    cabeca.className = 'bxc-contagem-cabeca';
    cabeca.style.width = `${cabeca.width * 4}px`;
    cabeca.style.height = `${cabeca.height * 4}px`;
    el.prepend(cabeca);
    this.raiz.appendChild(el);
    this.hudContagem = el;
    this.segContagem = -1;
  }

  private desmontarContagem(): void {
    this.hudContagem?.remove();
    this.hudContagem = null;
  }

  private passoContagem(): void {
    const falta = Math.max(0, this.chegaEm - performance.now());
    const seg = Math.ceil(falta / 1000);
    if (seg !== this.segContagem) {
      this.segContagem = seg;
      const relogio = this.hudContagem?.querySelector('.bxc-contagem-relogio');
      if (relogio) {
        relogio.textContent = `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, '0')}`;
        relogio.classList.toggle('urgente', seg <= TIQUE_S);
      }
      if (seg >= 1 && seg <= TIQUE_S) somTique(seg <= 3);
      if (seg >= 1 && seg <= NUMERAO_S) {
        this.raiz.querySelectorAll('.bxc-numerao').forEach(n => n.remove());
        const n = document.createElement('div');
        n.className = 'bxc-numerao';
        n.setAttribute('aria-hidden', 'true');
        n.textContent = String(seg);
        this.raiz.appendChild(n);
        setTimeout(() => n.remove(), 1000);
      }
    }
    if (falta <= 0) this.entrar();
  }

  // ── O tiro ───────────────────────────────────────────────────────────────

  private atingivel(): boolean {
    return ['entrando', 'voando', 'conjurando', 'tonta', 'curando', 'protegendo'].includes(this.fase);
  }

  /**
   * O quadro da pose de agora. Flutuando, um ciclo de 6 (respira, o chapéu
   * balança, os pés); cada ação tem os seus 2, em ritmo próprio: o nariz mexe
   * rápido bebendo, a gargalhada sacode, o apanhar fecha os olhos.
   */
  private quadroAtual(): number {
    const t = this.relogio * 1000;
    const par = (ms: number) => Math.floor(t / ms) % 2;
    switch (this.fase) {
      case 'conjurando':
        return this.conjuro?.feitico === FEITICO_FORTE ? PRIMEIRO_RINDO_MC + par(140) : PRIMEIRO_SEGURANDO_MC + par(180);
      case 'curando': return PRIMEIRO_BEBENDO_MC + par(90);
      case 'protegendo': return PRIMEIRO_TOTEM_MC + par(150);
      case 'tonta': case 'caindo': case 'tombando': return PRIMEIRO_DOR_MC + par(200);
      case 'fugindo': return PRIMEIRO_RINDO_MC + par(140);
      default:
        if (this.corpo && faseDaPerola(this.corpo)?.mirando) return PRIMEIRO_SEGURANDO_MC + par(180);
        if (performance.now() < this.dorAte) return PRIMEIRO_DOR_MC;
        // Acabou de jogar a garrafa: a gargalhada.
        if (this.fase === 'voando' && this.tFase < 0.5 && this.voando) return PRIMEIRO_RINDO_MC + par(120);
        return Math.floor(t / 150) % QUADROS_FLUTUANDO;
    }
  }

  private centroSprite(): { x: number; y: number } {
    const corpo = this.corpo!;
    const flutua = !['caindo', 'tombando'].includes(this.fase);
    // A esquiva do raspão: vai para o lado e volta, num arco curto.
    const e = this.esquiva;
    const k = e ? Math.sin(Math.min(1, e.t / ESQUIVA_S) * Math.PI) : 0;
    return {
      x: corpo.x + (e ? e.dir * Math.round(ESQUIVA_PX * k) : 0),
      y: corpo.y + (flutua ? balanco(this.relogio) : 0) - Math.round(2 * k),
    };
  }

  /** Ponto da tela (px da arte) → pixel do sprite, desfazendo giro e espelho. */
  private paraSprite(wx: number, wy: number): { lx: number; ly: number } {
    const corpo = this.corpo!;
    const s = this.centroSprite();
    const dx = wx - s.x, dy = wy - s.y;
    const cos = Math.cos(-corpo.giro), sin = Math.sin(-corpo.giro);
    let lx = Math.floor(dx * cos - dy * sin + LARG / 2);
    const ly = Math.floor(dx * sin + dy * cos + ALT / 2);
    if (corpo.lado < 0) lx = LARG - 1 - lx;
    return { lx, ly };
  }

  /** Pixel do sprite → ponto da tela (px da arte). */
  private paraTela(lx: number, ly: number): { x: number; y: number } {
    const corpo = this.corpo!;
    const s = this.centroSprite();
    const px = (corpo.lado < 0 ? LARG - 1 - lx : lx) - LARG / 2;
    const py = ly - ALT / 2;
    const cos = Math.cos(corpo.giro), sin = Math.sin(corpo.giro);
    return { x: s.x + px * cos - py * sin, y: s.y + px * sin + py * cos };
  }

  private pontoDaParte(p: NomeParte): { x: number; y: number } {
    const c = centroDaParte(imagemDoQuadro(this.quadroAtual()), NUMERO_DA_PARTE[p]);
    return this.paraTela(c.x, c.y);
  }

  private atirar(clientX: number, clientY: number): void {
    const corpo = this.corpo;
    if (!corpo || !this.atingivel()) return;
    const r = this.raiz.getBoundingClientRect();
    const wx = (clientX - r.left) / this.escala, wy = (clientY - r.top) / this.escala;
    // No piscar do teleporte ela não tem desenho: quem clicou onde ela estava pega de raspão.
    if (!corpo.visivel) {
      somTiro();
      this.ferir('tronco', { x: wx, y: wy }, true, true);
      return;
    }
    const { lx, ly } = this.paraSprite(wx, wy);
    const num = parteComFolga(imagemDoQuadro(this.quadroAtual()), lx, ly);
    if (!num) {
      furo(clientX, clientY);
      this.aoEvento?.({ tipo: 'errou' });
      return;
    }
    somTiro();
    // Nas manobras (e na sorte) o tiro é de raspão: tira menos, e ela se esquiva.
    this.ferir(PARTE_DO_NUMERO[num]!, { x: wx, y: wy }, true, !!corpo.manobra || Math.random() < CHANCE_RASPAO);
  }

  private ferir(parte: NomeParte, onde: { x: number; y: number }, meu: boolean, raspao = false): void {
    const alvo = alvoDaParte(parte);
    let dano = DANO[alvo];
    if (this.fase === 'conjurando') dano *= MULT_CONJURANDO;
    if (this.fase === 'tonta') dano *= MULT_TONTA;
    if (raspao) {
      dano *= DANO_RASPAO;
      this.esquivar(Math.sign((this.corpo?.x ?? onde.x) - onde.x) || 1);
      // Um letreiro por vez: em rajada eles se empilhavam.
      const agora = performance.now();
      if (meu && agora - this.ultimoRaspao > 350) { this.ultimoRaspao = agora; this.letreiro('DE RASPÃO!', onde.x, onde.y - 16, 'esquiva'); }
      this.aoEvento?.({ tipo: 'esquivou', manobra: this.corpo?.manobra?.tipo ?? 'velocidade' });
    }
    this.tirarVida(dano);
    if (meu) this.ajudei = true;
    if (meu) this.banco?.aoAcertar(dano, alvo === 'cabeca');
    this.doer();
    // O empurrão do golpe, como no jogo (só voando: na manobra e na cura ela está presa ao caminho).
    const corpo = this.corpo!;
    if (this.fase === 'voando') corpo.x += Math.sign(corpo.x - onde.x || 1) * 1.5;
    // As lascas do «bloco» que ela é: pedacinhos do manto.
    for (let i = 0; i < (meu ? 6 : 2); i++) {
      this.particula({
        x: onde.x, y: onde.y, vx: entre(-60, 60), vy: entre(-80, 0), vida: entre(0.35, 0.7),
        cor: sorteia(CORES_MANTO), tam: PIXEL_MC, g: GRAVIDADE, forma: 'ponto',
      });
    }
    if (alvo === 'cabeca') {
      // O crítico do jogo: as estrelinhas que espirram em leque.
      for (let i = 0; i < (meu ? 10 : 4); i++) {
        this.particula({
          x: onde.x, y: onde.y, vx: entre(-90, 90), vy: entre(-110, -20), vida: entre(0.4, 0.7),
          cor: sorteia(CORES_CRITICO), tam: 1, g: 160, forma: 'cruz',
        });
      }
    }
    if (meu) {
      if (alvo === 'cabeca') { somCerebro(); this.letreiro('CRÍTICO!', onde.x, onde.y - 8, 'hs'); } else somAcerto();
      if (alvo === 'chapeu') this.letreiro('NO CHAPÉU!', onde.x, onde.y - 8, 'dano');
      else this.letreiro(`-${Math.round(dano)}`, onde.x + entre(-6, 6), onde.y - 4, 'dano');
    }
    this.aoEvento?.({ tipo: 'acertou', dano, parte, vida: Math.max(0, this.vida), meu });
    if (this.conjuro) this.conjuro.dano += dano;
    this.acertos.push(this.tempo);
    this.depoisDoDano();
  }

  /**
   * A esquiva do raspão: ela dá um passo para o lado (o desenho e a mira andam
   * juntos, em `centroSprite`) e deixa um rastro roxo de onde estava.
   */
  private esquivar(dir: number): void {
    const corpo = this.corpo;
    if (!corpo) return;
    if (!this.esquiva || this.esquiva.t > ESQUIVA_S * 0.6) {
      const s = this.centroSprite();
      this.fantasmas.push({ x: s.x, y: s.y, quadro: this.quadroAtual(), lado: corpo.lado, estagio: this.estagio, vida: 0.32 });
      if (this.fantasmas.length > 4) this.fantasmas.shift();
      somVento();
    }
    this.esquiva = { t: 0, dir: dir < 0 ? -1 : 1 };
  }

  /** O vermelho do dano e o «hmf» (o som não repete em rajada). */
  private doer(): void {
    const agora = performance.now();
    this.dorAte = agora + DOR_MS;
    if (agora - this.ultimaDor > 220) { this.ultimaDor = agora; somDor(); }
  }

  /** O dano gasta primeiro a Absorção (a vida dourada do totem), depois a vida. */
  private tirarVida(dano: number): void {
    const abs = Math.min(this.absorcao, dano);
    this.absorcao -= abs;
    this.vida -= dano - abs;
  }

  private depoisDoDano(): void {
    if (this.vida <= 0) {
      // Com o banco, quem diz se ela caiu (ou se o totem a salvou) é ele.
      if (this.banco) { this.vida = 0; return; }
      if (this.protegida) this.usarTotem(); else this.derrotar();
      return;
    }
    // Estragou mais um estágio: o «crec» e os pedaços de pano e de fuligem voando.
    if (this.estagio > this.estagioVisto) {
      this.estagioVisto = this.estagio;
      const c = this.corpo!;
      somBloco();
      this.estilhacos(c.x, c.y, [...CORES_MANTO, ...CORES_FUMACA_DANO], 24);
    }
    if (!this.furia && this.fracao <= FURIA_EM) this.entrarNaFuria(true);
    // A poção quebra se o time bater forte enquanto ela prepara.
    const limiar = this.conjuro?.feitico === FEITICO_FORTE ? QUEBRA_FORTE : QUEBRA_FEITICO;
    if (this.conjuro && this.conjuro.dano >= this.vidaMax * limiar) {
      const f = this.conjuro.feitico;
      this.conjuro = null;
      this.encerrarMesa();
      this.mudarFase('tonta');
      somBrava();
      somVidro();
      const c = this.corpo!;
      const mao = this.paraTelaMaoErguida();
      this.estourarGarrafa(mao.x, mao.y, f, 0.6);
      this.letreiro(f === FEITICO_FORTE ? 'ENCANTAMENTO QUEBRADO!' : 'POÇÃO QUEBRADA!', c.x, c.y - ALT / 2 - 6, 'quebra');
      this.aoEvento?.({ tipo: 'quebrou', feitico: f });
      return;
    }
    // Apanhou demais (ou na sorte): ela desvia.
    if (this.fase !== 'voando' || this.folgaManobra > 0) return;
    this.acertos = this.acertos.filter(t => this.tempo - t <= JANELA_S);
    const limiarDesvio = this.furia ? LIMIAR_DESVIO_FURIA : LIMIAR_DESVIO;
    const chance = this.furia ? CHANCE_DESVIO_FURIA : CHANCE_DESVIO;
    if (this.acertos.length >= limiarDesvio || Math.random() < chance) this.fazerManobra();
  }

  private fazerManobra(m?: Manobra): void {
    const corpo = this.corpo!;
    const tipo = m ?? escolherManobra(corpo, this.zona(), Math.random, this.ultimaManobra);
    iniciarManobra(corpo, tipo, this.zona(), Math.random);
    this.ultimaManobra = tipo;
    this.folgaManobra = FOLGA_MANOBRA_S;
    this.acertos = [];
    // A pérola faz o som quando sai da mão (o evento `lancou`); as poções, o gole.
    if (tipo !== 'perola') { somBeber(); somVento(); }
    this.efeito(corpo.x, corpo.y, [COR_MANOBRA[tipo], '#ffffff'], 18);
    this.letreiro(NOME_MANOBRA[tipo], corpo.x, corpo.y - ALT / 2 - 8, 'esquiva');
    this.aoEvento?.({ tipo: 'manobra', manobra: tipo });
  }

  private entrarNaFuria(porVida: boolean): void {
    this.furia = true;
    this.furiaPorVida = porVida;
    this.barra.classList.add('furia');
    somBrava();
    setTimeout(somGargalhada, 250);
    const c = this.corpo!;
    this.letreiro('FÚRIA!', c.x, c.y - ALT / 2 - 8, 'quebra');
    this.proximoFeitico = Math.min(this.proximoFeitico, 3);
    this.aoEvento?.({ tipo: 'furia' });
  }

  /**
   * A vida voltou (a cura, a Regeneração, ou gente nova entrando na luta, que
   * aumenta a vida de todos): os corações enchem, e a fúria e o estrago
   * acompanham. Sem isso, a barra cheia aparecia com ela furiosa e em
   * frangalhos. A folga (`SAI_DA_FURIA`) não deixa ela piscar na beira.
   */
  private acompanharVida(): void {
    if (this.estagio < this.estagioVisto) this.estagioVisto = this.estagio;
    if (!this.furia || !this.furiaPorVida || this.fracao <= FURIA_EM + SAI_DA_FURIA) return;
    this.furia = false;
    this.furiaPorVida = false;
    this.barra.classList.remove('furia');
  }

  // ── A Poção de Cura ──────────────────────────────────────────────────────

  private iniciarCura(total?: number): void {
    const corpo = this.corpo!;
    this.cura = { t: 0, total: total ?? Math.min(this.vidaMax * CURA_FRACAO, this.vidaMax - this.vida), proximoGole: 0 };
    this.mudarFase('curando');
    somGargalhada();
    this.aviso('Ela vai beber a Poção de Cura!', 'Atirem nela enquanto ela bebe');
    this.letreiro('POÇÃO DE CURA!', corpo.x, corpo.y - ALT / 2 - 8, 'cura');
    this.aoEvento?.({ tipo: 'bebendo' });
  }

  /** Bebendo: parada no ar, a garrafa na boca, os goles e as gotas. No fim a vida volta de uma vez. */
  private passoCura(dt: number): void {
    const corpo = this.corpo!;
    const cura = this.cura!;
    pairar(corpo, dt);
    cura.t += dt;
    cura.proximoGole -= dt;
    if (cura.proximoGole <= 0) { cura.proximoGole = 0.55; somBeber(); }
    const boca = this.paraTela(BOCA.x * PIXEL_MC, BOCA.y * PIXEL_MC);
    if (Math.random() < dt * 26) {
      // As gotas da poção escorrendo da boca (as partículas de beber do jogo).
      this.particula({
        x: boca.x + entre(-3, 3), y: boca.y + entre(-2, 2), vx: entre(-25, 25), vy: entre(-40, -5), vida: entre(0.35, 0.6),
        cor: sorteia(CORES_CURA), tam: 1, g: GRAVIDADE * 0.7, forma: 'ponto',
      });
    }
    if (cura.t >= BEBER_S) this.terminarCura();
  }

  /** O último gole: a Vida Instantânea, de uma vez, com as espirais vermelhas. */
  private terminarCura(): void {
    const corpo = this.corpo!;
    // Com o banco, a vida já subiu lá: a barra mostra no último gole (`vidaPorAparecer`).
    const ganho = this.banco ? this.cura!.total : Math.max(0, Math.min(this.cura!.total, this.vidaMax - this.vida));
    if (!this.banco) this.vida += ganho;
    this.cura = null;
    somCura();
    setTimeout(somGargalhada, 300);
    for (let i = 0; i < 40; i++) {
      this.particula({
        x: corpo.x + entre(-LARG / 2, LARG / 2), y: corpo.y + entre(-ALT / 2, ALT / 2), vx: entre(-12, 12), vy: entre(-40, -10),
        vida: entre(0.7, 1.2), cor: sorteia(CORES_CURA), tam: 1, g: 0, forma: 'espiral',
      });
    }
    this.anel(corpo.x, corpo.y, '#ff8a8a', 70, 0.5);
    this.letreiro(`+${Math.round(ganho)}`, corpo.x, corpo.y - ALT / 2 - 4, 'cura');
    this.aviso('Ela bebeu a Poção de Cura!', `Recuperou ${Math.round(ganho)} de vida`);
    this.aoEvento?.({ tipo: 'curou', vida: Math.round(this.vida) });
    novoAlvo(corpo, this.zona(), Math.random);
    this.mudarFase('voando');
  }

  // ── O feitiço de proteção: o Totem da Imortalidade ──────────────────────

  private iniciarProtecao(): void {
    const c = this.corpo!;
    this.mudarFase('protegendo');
    somEncantamento();
    this.letreiro('FEITIÇO DE PROTEÇÃO!', c.x, c.y - ALT / 2 - 10, 'totem');
    this.aviso('Feitiço de proteção!', 'Ela ergueu o Totem da Imortalidade: o golpe final não vai derrubá-la');
  }

  private passoProtecao(dt: number): void {
    const corpo = this.corpo!;
    pairar(corpo, dt);
    const totem = this.paraTela(MAO_NO_ALTO.x * PIXEL_MC, MAO_NO_ALTO.y * PIXEL_MC - 8);
    // O brilho dourado subindo do totem enquanto ela o ergue.
    if (Math.random() < dt * 40) {
      const a = Math.random() * Math.PI * 2, r = entre(10, 26);
      this.particula({
        x: totem.x + Math.cos(a) * r, y: totem.y + Math.sin(a) * r, vx: -Math.cos(a) * r * 2, vy: -Math.sin(a) * r * 2,
        vida: 0.5, cor: sorteia(CORES_TOTEM), tam: 1, g: 0, forma: Math.random() < 0.4 ? 'estrela' : 'ponto',
      });
    }
    if (this.tFase < PROTEGER_S) return;
    this.protegida = true;
    somCura();
    this.anel(totem.x, totem.y, '#f8e040', 60, 0.45);
    this.aoEvento?.({ tipo: 'protegida' });
    novoAlvo(corpo, this.zona(), Math.random);
    this.mudarFase('voando');
  }

  /**
   * O golpe fatal com o totem na mão: no jogo, o totem some da mão, o ídolo
   * sobe girando no meio da tela, as partículas verdes e amarelas explodem e o
   * mob fica com 1 de vida, Absorção e Regeneração.
   */
  private usarTotem(regenDoBanco?: number): void {
    const corpo = this.corpo!;
    this.protegida = false;
    // Com o banco, a vida e a Absorção já vêm dele: aqui é a cena e o ritmo da Regeneração.
    if (!this.banco) {
      this.vida = 1;
      this.absorcao = this.vidaMax * ABSORCAO_FRACAO;
    }
    const total = regenDoBanco ?? this.vidaMax * REGEN_FRACAO;
    this.regen = { resta: total, porSegundo: total / REGEN_S, proximoNumero: 0.8 };
    // A poção que ela preparava e a que bebia se perdem no susto.
    if (this.conjuro) { this.conjuro = null; this.encerrarMesa(); }
    this.cura = null;
    corpo.manobra = null;
    corpo.visivel = true;
    corpo.giro = 0;
    this.pausa(140);
    somTotem();
    this.clarao = 0.35;
    this.tremeAte = performance.now() + 350;
    for (let i = 0; i < 140; i++) {
      const a = Math.random() * Math.PI * 2, v = entre(30, 170);
      this.particula({
        x: corpo.x + entre(-6, 6), y: corpo.y + entre(-ALT / 3, ALT / 3), vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40,
        vida: entre(0.9, 1.8), cor: sorteia(CORES_TOTEM), tam: sorteia([1, 1, 2]), g: 90, forma: Math.random() < 0.3 ? 'cruz' : 'ponto',
      });
    }
    this.anel(corpo.x, corpo.y, '#c8ff3a', 160, 0.7);
    this.anel(corpo.x, corpo.y, '#f8e040', 110, 0.9);
    this.mostrarTotem();
    this.letreiro('TOTEM DA IMORTALIDADE!', corpo.x, corpo.y - ALT / 2 - 10, 'totem');
    this.aviso('Ela não caiu!', 'O Totem da Imortalidade a salvou: Absorção e Regeneração');
    this.aoEvento?.({ tipo: 'totem', vida: 1 });
    this.folgaManobra = FOLGA_MANOBRA_S;
    this.mudarFase('voando');
  }

  /** O ídolo no meio da tela: sobe, cresce, gira como no jogo e some. */
  private mostrarTotem(): void {
    this.raiz.querySelectorAll('.bxc-totem').forEach(a => a.remove());
    const el = canvasDaImagem(imagemDoItem(contornado(TOTEM)), false);
    el.className = 'bxc-totem';
    el.setAttribute('aria-hidden', 'true');
    this.raiz.appendChild(el);
    setTimeout(() => el.remove(), 2100);
  }

  /** A Regeneração: a vida voltando aos poucos, com as espirais rosa. */
  private passoRegen(dt: number): void {
    const r = this.regen;
    const corpo = this.corpo;
    if (!r || !corpo) return;
    const ganho = Math.min(r.resta, r.porSegundo * dt, this.vidaMax - this.vida);
    if (!this.banco) this.vida += ganho;
    r.resta -= r.porSegundo * dt;
    r.proximoNumero -= dt;
    if (r.proximoNumero <= 0) {
      r.proximoNumero = 1.2;
      this.letreiro(`+${Math.max(1, Math.round(r.porSegundo * 1.2))}`, corpo.x + entre(-8, 8), corpo.y - ALT / 2 - 4, 'cura');
    }
    if (corpo.visivel && Math.random() < dt * 10) {
      this.particula({
        x: corpo.x + entre(-LARG / 2, LARG / 2), y: corpo.y + entre(-ALT / 2, ALT / 3), vx: entre(-4, 4), vy: entre(-18, -8),
        vida: entre(0.6, 1), cor: sorteia(CORES_REGEN), tam: 1, g: 0, forma: 'espiral',
      });
    }
    if (r.resta <= 0 || (!this.banco && this.vida >= this.vidaMax)) this.regen = null;
  }

  // ── As poções ────────────────────────────────────────────────────────────

  /**
   * Qual poção agora: nenhuma que já está na tela, e de preferência nenhuma
   * das últimas (`RECENTES`) — ela passa pelas seis antes de repetir. O forte,
   * quando liberado, sai na frente dos outros na metade das vezes.
   */
  private escolherFeitico(): NomeFeitico | null {
    const forteLiberado = this.tempo >= this.proximoForte;
    const possiveis = LISTA_FEITICOS.filter(f => !this.ativos.has(f) && (f !== FEITICO_FORTE || forteLiberado) && disponivel(f, this.alvos));
    if (possiveis.includes(FEITICO_FORTE) && Math.random() < 0.5) return FEITICO_FORTE;
    const comuns = possiveis.filter(p => p !== FEITICO_FORTE);
    const novos = comuns.filter(p => !this.recentes.includes(p));
    // Sem nenhuma nova, a que saiu há mais tempo (a última jogada nunca repete de cara).
    const velha = this.recentes.find(p => comuns.includes(p) && p !== this.recentes[this.recentes.length - 1]);
    if (novos.length) return sorteia(novos);
    if (velha) return velha;
    return possiveis.length ? sorteia(comuns.length ? comuns : possiveis) : null;
  }

  private iniciarConjuro(forcado?: NomeFeitico, varianteForcada?: string): void {
    const f = forcado ?? this.escolherFeitico();
    const variante = f ? varianteForcada ?? escolherVariante(f, this.alvos, this.ultimaVariante.get(f)) : null;
    if (!f || !variante) { this.proximoFeitico = 3; return; }
    if (f === FEITICO_FORTE) this.proximoForte = this.tempo + ENTRE_FORTES_S;
    this.recentes = [...this.recentes.filter(p => p !== f), f].slice(-RECENTES);
    this.ultimaVariante.set(f, variante);
    this.conjuro = { feitico: f, variante, dano: 0 };
    this.mudarFase('conjurando');
    const c = this.corpo!;
    const nivel = nivelDaPocao(forcaDoFeitico(this.fracao));
    if (f === FEITICO_FORTE) {
      somEncantamento();
      this.mesa = { x: c.x, t: 0, aparecendo: 0, saindo: false };
      this.letreiro('ENCANTAMENTO!', c.x, c.y - ALT / 2 - 10, 'quebra');
      this.aviso('Ela está encantando a tela!', 'Atirem nela agora para quebrar o Encantamento');
    } else {
      somGargalhada();
      this.letreiro(`${FEITICOS[f].titulo.toUpperCase()} ${nivel}`, c.x, c.y - ALT / 2 - 8, 'feitico');
    }
    this.aoEvento?.({ tipo: 'conjurando', feitico: f, variante });
  }

  private duracaoDoConjuro(): number {
    return this.conjuro?.feitico === FEITICO_FORTE ? CONJURO_FORTE_S : CONJURO_S;
  }

  /** O preparo terminou sem quebrar: a garrafa sai voando (ou a onda do Encantamento). */
  private soltarFeitico(): void {
    const { feitico: f, variante } = this.conjuro!;
    this.conjuro = null;
    if (f === FEITICO_FORTE) {
      // O forte não tem garrafa: a onda sai dela e varre a tela inteira.
      const c = this.corpo!;
      somOnda();
      this.anel(c.x, c.y, FEITICOS[f].corClara, 420, 1.1);
      this.anel(c.x, c.y, FEITICOS[f].cor, 300, 1.3);
      this.clarao = 0.4;
      this.tremeAte = performance.now() + 500;
      this.aplicarFeitico(f, variante);
      this.encerrarMesa();
      this.mudarFase('voando');
      return;
    }
    const el = alvoDaPocao(f, this.alvos, variante);
    const ate = el && el !== this.alvos.raiz() ? this.centroDoElemento(el) : { x: this.larg / 2 + entre(-40, 40), y: this.alt * 0.55 };
    const de = this.paraTelaMaoErguida();
    const dist = Math.hypot(ate.x - de.x, ate.y - de.y);
    this.voando = { feitico: f, variante, t: 0, dura: 0.55 + Math.min(0.6, dist / 500), de, ate, altura: 30 + dist * 0.25 };
    somArremesso();
    this.mudarFase('voando');
  }

  /**
   * Os textos por cima (`data-bx-feitico`) não aguentam dois feitiços na mesma
   * peça: o novo tira o velho. A Poção Estranha e o Encantamento disputam as
   * abas; a Poção de Dano e o Encantamento «tudo», os valores.
   */
  private tirarQuemDisputa(f: NomeFeitico, variante: string): void {
    const enc = this.ativos.get('encantamento');
    if (f === 'estranha' || (f === 'dano' && enc?.variante === 'tudo')) enc?.desfazer();
    if (f === 'encantamento') {
      this.ativos.get('estranha')?.desfazer();
      if (variante === 'tudo') this.ativos.get('dano')?.desfazer();
    }
  }

  private aplicarFeitico(f: NomeFeitico, variante: string): void {
    const forca = forcaDoFeitico(this.fracao);
    const duracaoMs = duracaoDoFeitico(f, forca);
    this.tirarQuemDisputa(f, variante);
    const l = lancar(f, this.alvos, Math.random, forca, variante);
    const raiz = this.alvos.raiz();
    const info = FEITICOS[f];
    const base = this.raiz.getBoundingClientRect();
    for (const el of l.atingidos.slice(0, 12)) {
      if (el === raiz) continue;
      const p = this.centroDoElemento(el, base);
      this.efeito(p.x, p.y, [info.cor, info.corClara], 10);
    }
    this.registrar(f, variante, l.desfazer, duracaoMs);
    const nivel = nivelDaPocao(forca);
    const fraca = nivel === 'I' ? ' · fraca: ela está rachando' : '';
    this.aviso(f === FEITICO_FORTE ? info.titulo : `${info.titulo} ${nivel}`, `${encantoDa(f, variante)} (${Math.round(duracaoMs / 1000)} s${fraca})`);
    this.aoEvento?.({ tipo: 'feitico', feitico: f, variante, forca, duracaoMs });
  }

  private registrar(f: NomeFeitico, variante: string, desfazer: () => void, duracaoMs: number): void {
    this.ativos.get(f)?.desfazer();
    let feito = false;
    const desfazerUmaVez = () => {
      if (feito) return;
      feito = true;
      clearTimeout(relogio);
      desfazer();
      if (this.ativos.get(f)?.desfazer === desfazerUmaVez) this.ativos.delete(f);
    };
    const relogio = setTimeout(desfazerUmaVez, duracaoMs);
    this.ativos.set(f, { desfazer: desfazerUmaVez, variante });
  }

  private desfazerTodos(): void {
    for (const a of [...this.ativos.values()]) a.desfazer();
    this.ativos.clear();
  }

  /** O meio do elemento, em px da arte. `base` é o retângulo do palco, quando já foi medido. */
  private centroDoElemento(el: HTMLElement, base: DOMRect = this.raiz.getBoundingClientRect()): { x: number; y: number } {
    const r = el.getBoundingClientRect();
    return { x: (r.left + r.width / 2 - base.left) / this.escala, y: (r.top + r.height / 2 - base.top) / this.escala };
  }

  /** A garrafa estoura: cacos de vidro e a nuvem da poção abrindo em roda. */
  private estourarGarrafa(x: number, y: number, f: NomeFeitico, forca = 1): void {
    const info = FEITICOS[f];
    for (let i = 0; i < 10 * forca; i++) {
      this.particula({ x, y, vx: entre(-90, 90), vy: entre(-120, -20), vida: entre(0.4, 0.8), cor: sorteia(['#ffffff', '#cfe6f2', '#a0c8e0']), tam: 1, g: GRAVIDADE, forma: 'ponto' });
    }
    const n = Math.round(24 * forca);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + entre(-0.1, 0.1), v = entre(40, 90) * forca;
      this.particula({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.7 - 10, vida: entre(0.6, 1.1), cor: k % 3 ? info.cor : info.corClara, tam: 1, g: -6, forma: 'espiral' });
    }
    this.anel(x, y, info.corClara, 90 * forca, 0.45);
  }

  // ── A mesa de encantamento ───────────────────────────────────────────────

  private encerrarMesa(): void {
    if (this.mesa) this.mesa.saindo = true;
  }

  private passoMesa(dt: number): void {
    const m = this.mesa;
    if (!m) return;
    m.t += dt;
    if (m.saindo) {
      m.aparecendo -= dt * 2.5;
      if (m.aparecendo <= 0) this.mesa = null;
      return;
    }
    m.aparecendo = Math.min(1, m.aparecendo + dt * 3);
    // As runas saem das estantes e voam para o livro, como no jogo.
    if (m.aparecendo >= 0.8 && Math.random() < dt * (this.leve ? 10 : 22)) {
      const e = sorteia(this.estantesDaMesa());
      this.runas.push({
        de: { x: e.x + entre(-12, 12), y: e.y + entre(-14, 6) },
        t: 0, dura: entre(0.8, 1.2), letra: sorteia(letrasComRuna(ENCANTO)),
      });
    }
  }

  private livroDaMesa(): { x: number; y: number } {
    return { x: this.mesa?.x ?? this.larg / 2, y: this.zona().chao - 12 * PIXEL_MC - 6 * PIXEL_MC - 9 * PIXEL_MC };
  }

  // ── O fim ────────────────────────────────────────────────────────────────

  /** Vida zero: a morte do Minecraft. Vermelha, cai, tomba, «puf», drops. */
  private derrotar(): void {
    this.vida = 0;
    this.conjuro = null;
    this.voando = null;
    const corpo = this.corpo!;
    corpo.manobra = null;
    corpo.visivel = true;
    corpo.giro = 0;
    this.cura = null;
    this.regen = null;
    this.absorcao = 0;
    this.encerrarMesa();
    this.desfazerTodos();
    this.mudarFase('caindo');
    this.caixa.style.display = 'none';
    this.pausa(160);
    somMorte();
    this.queda = { vx: Math.max(-40, Math.min(40, corpo.vx * 0.4)), vy: -60 };
    this.aviso(`A ${NOME_CHEFONA} foi abatida`, 'pelo time do Gestão. As poções se desfizeram');
    this.aoEvento?.({ tipo: 'derrotada', segundos: this.tempo });
    // Quem ajudou ganha a conquista, depois do «puf» (como no jogo, quando o mob some).
    if (this.ajudei) this.relogioConquista = setTimeout(() => this.mostrarConquista(), (TOMBO_S + DEITADA_S) * 1000 + 900);
  }

  private pausaAte = 0;
  private pausa(ms: number): void {
    this.pausaAte = performance.now() + ms;
  }

  /** A queda até o chão (sem a levitação) e o tombo de lado. */
  private passoQueda(): void {
    const corpo = this.corpo!;
    if (this.fase === 'caindo') return;
    // Tombando: gira 90° em volta do pé, para o lado de onde olha.
    const u = Math.min(1, this.tFase / TOMBO_S);
    corpo.giro = corpo.lado * (Math.PI / 2) * suave(u);
    if (this.tFase >= TOMBO_S + DEITADA_S) this.sumirEmFumaca();
  }

  private passoCaindo(dt: number): void {
    const corpo = this.corpo!;
    const q = this.queda!;
    const chaoY = this.zona().chao - ALT / 2;
    q.vy += GRAVIDADE * dt;
    corpo.x += q.vx * dt;
    corpo.y += q.vy * dt;
    corpo.x = Math.max(LARG / 2 + ALT, Math.min(this.larg - LARG / 2 - ALT, corpo.x));
    if (corpo.y < chaoY) return;
    corpo.y = chaoY;
    somBloco();
    this.tremeAte = performance.now() + 200;
    this.estilhacos(corpo.x, this.zona().chao - 2, ['#7a6a5a', '#9a8a7a', '#5a4a3a'], 12);
    this.mudarFase('tombando');
  }

  /** O «puf» de fumaça branca, os drops e o XP. */
  private sumirEmFumaca(): void {
    const corpo = this.corpo!;
    const z = this.zona();
    // Deitada, o meio do corpo fica ao lado do pé.
    const cx = corpo.x + corpo.lado * (LARG / 2 + ALT / 2), cy = z.chao - LARG / 2;
    somPufMorte();
    for (let i = 0; i < 34; i++) {
      this.particula({
        x: cx + entre(-ALT / 2, ALT / 2), y: cy + entre(-LARG / 2, LARG / 4), vx: entre(-14, 14), vy: entre(-30, -6),
        vida: entre(0.6, 1.2), cor: sorteia(CORES_FUMACA), tam: sorteia([2, 3, 4]), g: -10, forma: 'ponto',
      });
    }
    // Cada drop sai 0 ou 1 vez, como na tabela do jogo; nunca menos de dois.
    let itens = DROPS.filter(() => Math.random() < 0.5);
    if (itens.length < 2) itens = [...DROPS].sort(() => Math.random() - 0.5).slice(0, 2);
    this.drops = itens.map(item => ({ item, x: cx + entre(-16, 16), y: cy, vx: entre(-90, 90), vy: entre(-120, -60), t: 0, fase: Math.random() * 6, noChao: false }));
    this.orbesPegos = 0;
    this.orbes = Array.from({ length: ORBES_XP }, () => ({
      // `tam` é o quadro da textura (0 a menor): quase todas pequenas, como as do jogo.
      x: cx + entre(-8, 8), y: cy, vx: entre(-70, 70), vy: entre(-140, -50), t: entre(0, 0.3), voando: false, tam: sorteia([0, 0, 0, 0, 1]), pegou: false,
    }));
    this.corpo = null;
    this.queda = null;
    this.fase = 'fora';
    this.barra.hidden = true;
  }

  private passoDrops(dt: number): void {
    const chao = this.zona().chao;
    for (const d of this.drops) {
      d.t += dt;
      if (d.noChao) continue;
      d.vy += GRAVIDADE * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      if (d.y >= chao - 9) { d.y = chao - 9; d.noChao = true; }
    }
    this.drops = this.drops.filter(d => d.t < DROPS_S);
    // O XP: pula, quica no chão e depois voa para a barra, um «plim» cada.
    const destino = { x: this.larg / 2, y: Math.round(30 / this.escala) };
    for (const o of this.orbes) {
      o.t += dt;
      if (!o.voando) {
        o.vy += GRAVIDADE * dt;
        o.x += o.vx * dt;
        o.y += o.vy * dt;
        if (o.y >= chao - 3) { o.y = chao - 3; o.vy = -Math.abs(o.vy) * 0.4; o.vx *= 0.6; }
        if (o.t > 1.4 + o.tam * 0.15) o.voando = true;
      } else {
        const dx = destino.x - o.x, dy = destino.y - o.y;
        const d = Math.max(1, Math.hypot(dx, dy));
        const v = 120 + Math.max(0, o.t - 1.4) * 260;
        o.x += (dx / d) * Math.min(d, v * dt);
        o.y += (dy / d) * Math.min(d, v * dt);
        if (d < 6) {
          o.pegou = true;
          this.orbesPegos += 1;
          // A última: o «subiu de nível» do jogo, um pouco depois do «plim».
          if (this.orbesPegos === ORBES_XP) { somXp(); setTimeout(somNivel, 120); } else somXp();
        }
      }
    }
    this.orbes = this.orbes.filter(o => !o.pegou);
  }

  // ── O relógio ────────────────────────────────────────────────────────────

  private mudarFase(f: Fase): void {
    this.fase = f;
    this.tFase = 0;
  }

  private acordar(): void {
    if (this.quadroRaf) return;
    this.antes = performance.now();
    const passo = (agora: number) => {
      // O carimbo do quadro pode vir ANTES do `performance.now()` de quem acordou
      // o laço: sem o zero, o primeiro passo andava para trás.
      const bruto = agora - this.antes;
      let dt = Math.max(0, Math.min(0.05, bruto / 1000)) * this.lenta;
      this.antes = agora;
      // A luta engasgando liga o leve (a aba de fundo para o laço: salto grande não conta).
      if (!this.leve && this.fase !== 'chegando' && bruto > 0 && bruto < 250 && this.vigia(bruto)) this.ficarLeve();
      // O tranco do último tiro: o jogo congela um instante.
      if (agora < this.pausaAte) dt = 0;
      this.avancar(dt);
      // Leve: desenha um quadro sim, um não (30 por segundo); a conta anda em todos.
      this.pularDesenho = this.leve && !this.pularDesenho;
      if (!this.pularDesenho) this.desenhar(agora);
      if (this.vivo()) this.quadroRaf = requestAnimationFrame(passo);
      else { this.quadroRaf = 0; this.c.clearRect(0, 0, this.larg, this.alt); }
    };
    this.quadroRaf = requestAnimationFrame(passo);
  }

  private vivo(): boolean {
    return this.fase !== 'fora' || this.particulas.length > 0 || this.aneis.length > 0
      || !!this.mesa || this.runas.length > 0 || this.drops.length > 0 || this.orbes.length > 0;
  }

  private avancar(dt: number): void {
    this.relogio += dt;
    this.tFase += dt;
    this.folgaManobra = Math.max(0, this.folgaManobra - dt);
    this.clarao = Math.max(0, this.clarao - dt * 0.9);
    if (this.fase === 'chegando') { this.passoContagem(); return; }
    const corpo = this.corpo;
    const z = this.zona();
    if (this.banco && corpo && this.atingivel()) this.sincronizarComBanco();
    if (corpo && this.atingivel()) {
      this.tempo += dt;
      // Com o banco, o prazo é dele: quem comanda chama `fugir()`.
      if (!this.banco && this.tempo >= this.prazo) this.fugir();
    }
    if (corpo) {
      switch (this.fase) {
        case 'entrando':
          avancarCorpo(corpo, z, dt, VELOCIDADE * 1.4, Math.random);
          if (corpo.x > z.x0 && corpo.x < z.x1) this.mudarFase('voando');
          break;
        case 'voando': {
          for (const e of avancarCorpo(corpo, z, dt, this.furia ? VELOCIDADE_FURIA : VELOCIDADE, Math.random)) {
            if (e.tipo === 'lancou') {
              this.perola = { de: this.paraTelaMaoErguida(), ate: { x: e.ateX, y: e.ateY } };
              somPerola();
            } else if (e.tipo === 'some') {
              // A pérola caiu: ela some daqui num redemoinho roxo...
              this.perola = null;
              this.efeito(e.x, e.y, CORES_PORTAL, 34);
              this.portal(e.x, e.y, 26);
              somTeleporte();
            } else if (e.tipo === 'aparece') {
              // ... e aparece onde a pérola caiu.
              this.efeito(e.x, e.y, CORES_PORTAL, 40);
              this.portal(e.x, e.y, 34);
              this.anel(e.x, e.y, '#c040ff', 70, 0.4);
            }
          }
          if (corpo.manobra) {
            // O rastro do efeito da poção que ela bebeu.
            if (corpo.visivel && Math.random() < dt * 40) {
              this.particula({ x: corpo.x + entre(-LARG / 2, LARG / 2), y: corpo.y + entre(-ALT / 2, ALT / 2), vx: -corpo.lado * entre(5, 30), vy: entre(-15, 5), vida: entre(0.4, 0.8), cor: COR_MANOBRA[corpo.manobra.tipo], tam: 1, g: 0, forma: 'espiral' });
            }
            break;
          }
          if (this.voando) break;
          this.proximoFeitico -= dt;
          if (this.proximoFeitico <= 0) {
            const [a, b] = this.furia ? INTERVALO_FURIA : INTERVALO;
            this.proximoFeitico = entre(a, b);
            this.iniciarConjuro();
          }
          break;
        }
        case 'conjurando':
          pairar(corpo, dt);
          // O Encantamento ela faz no meio da tela, em cima da mesa.
          if (this.conjuro?.feitico === FEITICO_FORTE) {
            const k = Math.min(1, dt * 1.6);
            corpo.x += (this.larg / 2 - corpo.x) * k;
            corpo.y += (Math.max(z.y0 + 10, Math.min(z.y1, this.alt * 0.42)) - corpo.y) * k;
            if (this.mesa) this.mesa.x = corpo.x;
          }
          this.magiaEntrando(dt);
          if (this.tFase >= this.duracaoDoConjuro()) this.soltarFeitico();
          break;
        case 'tonta':
          pairar(corpo, dt);
          corpo.giro = Math.sin(this.tFase * 9) * 0.12;
          if (this.tFase >= TONTA_S) { corpo.giro = 0; novoAlvo(corpo, z, Math.random); this.mudarFase('voando'); }
          break;
        case 'curando':
          if (this.cura) this.passoCura(dt);
          else { novoAlvo(corpo, z, Math.random); this.mudarFase('voando'); }
          break;
        case 'protegendo':
          this.passoProtecao(dt);
          break;
        case 'fugindo': {
          const dir = corpo.x < this.larg / 2 ? -1 : 1;
          corpo.lado = dir;
          corpo.vx += (dir * 220 - corpo.vx) * Math.min(1, dt * 3);
          corpo.vy += (-60 - corpo.vy) * Math.min(1, dt * 3);
          corpo.x += corpo.vx * dt;
          corpo.y += corpo.vy * dt;
          if (corpo.x < -LARG * 2 || corpo.x > this.larg + LARG * 2 || corpo.y < -ALT * 2) {
            this.corpo = null;
            this.fase = 'fora';
            this.barra.hidden = true;
            this.desfazerTodos();
            this.aoEvento?.({ tipo: 'fugiu' });
          }
          break;
        }
        case 'caindo':
          this.passoCaindo(dt);
          break;
        case 'tombando':
          this.passoQueda();
          break;
        default:
          break;
      }
    }
    if (this.corpo && this.atingivel()) { this.rastro(dt); this.passoRegen(dt); this.acompanharVida(); }
    if (this.esquiva) { this.esquiva.t += dt; if (this.esquiva.t >= ESQUIVA_S) this.esquiva = null; }
    if (this.fantasmas.length) {
      for (const f of this.fantasmas) f.vida -= dt;
      this.fantasmas = this.fantasmas.filter(f => f.vida > 0);
    }
    if (this.voando) {
      const g = this.voando;
      g.t += dt;
      if (g.t >= g.dura) {
        this.voando = null;
        somVidro();
        this.estourarGarrafa(g.ate.x, g.ate.y, g.feitico);
        this.aplicarFeitico(g.feitico, g.variante);
      }
    }
    this.passoMesa(dt);
    if (this.runas.length) {
      for (const r of this.runas) r.t += dt;
      this.runas = this.runas.filter(r => r.t < r.dura);
    }
    this.passoDrops(dt);
    this.moverParticulas(dt);
    this.atualizarBarra();
    this.posicionarCaixas();
  }

  /**
   * A vida do banco, a cada quadro. Se ela desceu sem tiro desta tela, foi o
   * time: ela fica vermelha, e o dano conta para quebrar a poção que ela
   * prepara (sem som: com cem pessoas atirando, o «hmf» não pararia).
   */
  private sincronizarComBanco(): void {
    const b = this.banco!.ler();
    this.vidaMax = Math.max(1, b.vidaMax);
    this.restanteBanco = b.restanteS;
    const queda = this.vida + this.absorcao - (b.vida + b.absorcao);
    this.vida = b.vida;
    this.absorcao = b.absorcao;
    // A primeira leitura (quem chegou no meio da luta) só acerta o número: as
    // rachaduras já estão lá, sem o «crec» de cada uma.
    if (this.primeiraLeitura) {
      this.primeiraLeitura = false;
      this.estagioVisto = this.estagio;
      if (!this.furia && this.fracao <= FURIA_EM) this.entrarNaFuria(true);
      return;
    }
    if (queda > 0.5) {
      this.dorAte = performance.now() + DOR_MS;
      if (this.conjuro) this.conjuro.dano += queda;
      this.depoisDoDano();
    }
  }

  /** As espirais da poção entrando na garrafa enquanto ela prepara. */
  private magiaEntrando(dt: number): void {
    const f = this.conjuro?.feitico;
    if (!f) return;
    const forte = f === FEITICO_FORTE;
    if (Math.random() > dt * (forte ? 50 : 30)) return;
    const info = FEITICOS[f];
    const s = this.centroSprite();
    const a = Math.random() * Math.PI * 2;
    const raio = forte ? 46 : LARG * 0.8;
    const x = s.x + Math.cos(a) * raio, y = s.y + Math.sin(a) * raio * 0.9;
    const m = forte ? s : this.paraTelaMaoErguida();
    this.particula({ x, y, vx: (m.x - x) * 2, vy: (m.y - y) * 2, vida: 0.45, cor: Math.random() < 0.3 ? info.corClara : info.cor, tam: 1, g: 0, forma: Math.random() < 0.3 ? 'estrela' : 'espiral' });
  }

  /** Onde fica a garrafa erguida (na mão, acima do ombro, do lado para onde ela olha). */
  private paraTelaMaoErguida(): { x: number; y: number } {
    return this.paraTela(MAO_ERGUIDA.x * PIXEL_MC, MAO_ERGUIDA.y * PIXEL_MC - 6);
  }

  /** As partículas de bruxa (roxas) e as da Levitação embaixo do pé. */
  private rastro(dt: number): void {
    const corpo = this.corpo!;
    if (!corpo.visivel) return;
    // A fumaça roxa da ponta do chapéu: quadradinhos que sobem e vão para trás.
    if (Math.random() < dt * (this.furia ? 16 : 9)) {
      const p = this.paraTela(PONTA_DO_CHAPEU.x * PIXEL_MC, PONTA_DO_CHAPEU.y * PIXEL_MC);
      this.particula({
        x: p.x, y: p.y, vx: -corpo.lado * entre(4, 14), vy: entre(-26, -14), vida: entre(0.9, 1.5),
        cor: sorteia(CORES_FUMACA_CHAPEU), tam: PIXEL_MC, g: -4, forma: 'ponto',
      });
    }
    // Estragada (estágio 2 em diante): fumaça cinza saindo do manto; no 3, fagulhas.
    const estagio = this.estagio;
    if (estagio >= 2 && Math.random() < dt * (estagio === 3 ? 14 : 7)) {
      const p = this.paraTela(entre(6, LARG - 6), entre(ALT * 0.3, ALT * 0.85));
      this.particula({
        x: p.x, y: p.y, vx: entre(-6, 6), vy: entre(-22, -10), vida: entre(0.8, 1.4),
        cor: sorteia(CORES_FUMACA_DANO), tam: sorteia([PIXEL_MC, PIXEL_MC, 3]), g: -6, forma: 'ponto',
      });
    }
    if (estagio === 3 && Math.random() < dt * 5) {
      const p = this.paraTela(entre(8, LARG - 8), entre(ALT * 0.55, ALT * 0.9));
      this.particula({ x: p.x, y: p.y, vx: entre(-20, 20), vy: entre(-50, -20), vida: entre(0.3, 0.6), cor: sorteia(CORES_FAGULHA), tam: 1, g: 60, forma: 'ponto' });
    }
    this.sobraRastro += dt * (this.furia ? 30 : 18);
    while (this.sobraRastro >= 1) {
      this.sobraRastro -= 1;
      if (Math.random() < 0.6) {
        const p = this.paraTela(entre(4, LARG - 4), ALT - entre(0, 4));
        this.particula({ x: p.x, y: p.y, vx: entre(-6, 6), vy: entre(4, 16), vida: entre(0.4, 0.8), cor: sorteia(CORES_LEVITACAO), tam: 1, g: 0, forma: 'espiral' });
      } else {
        const p = this.paraTela(entre(0, LARG), entre(0, ALT * 0.7));
        this.particula({ x: p.x, y: p.y, vx: entre(-6, 6), vy: entre(-20, -6), vida: entre(0.5, 0.9), cor: this.furia ? sorteia(['#ff4a3a', '#ff8a6a']) : sorteia(CORES_BRUXA), tam: 1, g: 0, forma: 'cruz' });
      }
    }
  }

  /**
   * Uma partícula nova. No teto, ela entra no lugar de uma das antigas, em
   * roda (antes era `shift()`, que arrasta a lista toda a cada partícula —
   * no estouro do totem, 140 vezes seguidas).
   */
  private particula(p: Omit<Particula, 'max' | 'gruda'> & { gruda?: boolean }): void {
    if (this.leve && Math.random() > SOBRA_DE_PARTICULAS_LEVE) return;
    const teto = this.leve ? MAX_PARTICULAS_LEVE : MAX_PARTICULAS;
    const nova: Particula = { ...p, gruda: p.gruda ?? false, max: p.vida };
    if (this.particulas.length < teto) { this.particulas.push(nova); return; }
    this.rodaParticulas = (this.rodaParticulas + 1) % this.particulas.length;
    this.particulas[this.rodaParticulas] = nova;
  }

  private anel(x: number, y: number, cor: string, vr: number, vida: number): void {
    this.aneis.push({ x, y, r: 2, vr, vida, max: vida, cor });
  }

  /** A nuvem de partículas de um efeito (poção, teleporte, fumaça). */
  private efeito(x: number, y: number, cores: readonly string[], n = 26): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = entre(10, 55);
      this.particula({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.7 - 8, vida: entre(0.5, 1), cor: sorteia(cores), tam: sorteia([1, 2, 2]), g: -12, forma: Math.random() < 0.4 ? 'espiral' : 'ponto' });
    }
  }

  /** As lascas quadradas de bloco quebrando. */
  private estilhacos(x: number, y: number, cores: readonly string[], n: number): void {
    for (let i = 0; i < n; i++) {
      this.particula({ x: x + entre(-8, 8), y: y + entre(-8, 8), vx: entre(-80, 80), vy: entre(-120, -20), vida: entre(0.5, 1), cor: sorteia(cores), tam: sorteia([2, 2, 3]), g: GRAVIDADE, forma: 'ponto' });
    }
  }

  /** Anda com as partículas e tira as apagadas no lugar (sem uma lista nova a cada quadro). */
  private moverParticulas(dt: number): void {
    const chao = this.zona().chao;
    const ps = this.particulas;
    let vivas = 0;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      p.vida -= dt;
      if (p.vida <= 0) continue;
      ps[vivas++] = p;
      if (p.gruda && p.g === 0 && p.vx === 0 && p.vy === 0) continue;
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      // A poção derramada bate no chão e fica, uma mancha que some devagar.
      if (p.gruda && p.y >= chao - 1) {
        p.y = chao - 1 + Math.round(Math.random());
        p.vx = 0; p.vy = 0; p.g = 0;
        p.vida = p.max = entre(3, 5);
      }
    }
    ps.length = vivas;
    if (this.aneis.length) {
      for (const a of this.aneis) { a.vida -= dt; a.r += a.vr * dt; }
      this.aneis = this.aneis.filter(a => a.vida > 0);
    }
  }

  private atualizarBarra(): void {
    if (this.barra.hidden) return;
    const agora = performance.now();
    // Os corações só se redesenham quando algo neles muda (a chave), não a cada quadro.
    const lista = coracoesDaVida(Math.max(0, this.vida), this.vidaMax, this.cura ? this.cura.total : 0);
    const ouro = coracoesDeOuro(this.absorcao, this.vidaMax);
    const pisca = agora < this.dorAte;
    const treme = this.vida > 0 && this.fracao <= TREME_ABAIXO ? Math.floor(agora / 90) : -1;
    const pulo = pulinhoDaRegeneracao(this.relogio, !!this.regen);
    const seco = this.furia && Math.floor(agora / 260) % 2 === 1;
    const chave = `${lista.join('')}|${ouro.join('')}|${pisca ? 1 : 0}|${treme}|${pulo}|${seco ? 1 : 0}`;
    if (chave !== this.chaveCoracoes) {
      this.chaveCoracoes = chave;
      this.desenharCoracoes(lista, ouro, pisca, treme, pulo, seco);
    }
    if (this.iconeTotem.hidden === this.protegida) this.iconeTotem.hidden = !this.protegida;
    // Com muita gente a vida passa de dezenas de milhares: o número vai com o
    // ponto do milhar, e só é refeito quando muda.
    const vida = Math.max(0, Math.ceil(this.vida)), dourada = this.absorcao >= 1 ? Math.ceil(this.absorcao) : 0;
    const chaveTexto = `${vida}|${dourada}|${this.vidaMax}`;
    if (chaveTexto !== this.chaveTextoVida) {
      this.chaveTextoVida = chaveTexto;
      const texto = `${milhar(vida)}${dourada ? ` + ${milhar(dourada)}` : ''} / ${milhar(this.vidaMax)}`;
      this.txtVida.textContent = texto;
      this.cvCoracoes.setAttribute('aria-label', `Vida: ${texto}`);
    }
    const resta = Math.max(0, Math.ceil(this.banco ? this.restanteBanco : this.prazo - this.tempo));
    const relogio = `${Math.floor(resta / 60)}:${String(resta % 60).padStart(2, '0')}`;
    const linha = this.furia ? `FÚRIA · ${relogio}` : relogio;
    if (this.txtTempo.textContent !== linha) this.txtTempo.textContent = linha;
  }

  /**
   * Os corações no canvas da barra, em pixel do jogo (ampliado pelo CSS sem
   * borrar): a fileira dourada por cima (Absorção), depois as duas da vida.
   * Cada coração é o fundo (o vazio do hardcore) e, por cima, o que ele tem.
   */
  private desenharCoracoes(lista: readonly Coracao[], ouro: readonly ('cheio' | 'metade')[], pisca: boolean, treme: number, pulo: number, seco: boolean): void {
    const cv = this.cvCoracoes;
    const comOuro = ouro.length > 0;
    const { largura, altura } = tamanhoDosCoracoes(comOuro);
    if (cv.width !== largura || cv.height !== altura) {
      cv.width = largura;
      cv.height = altura;
      cv.style.width = `min(${largura * ESCALA_CORACAO}px, 92vw)`;
    }
    const c = cv.getContext('2d')!;
    c.imageSmoothingEnabled = false;
    c.clearRect(0, 0, largura, altura);
    const img = (it: Item) => miniatura(it)[0];
    const fundo = img(pisca ? CORACAO_VAZIO_PISCA_MC : CORACAO_VAZIO_MC);
    ouro.forEach((o, i) => {
      const x = i * 8;
      c.drawImage(fundo, x, 0);
      c.drawImage(img(o === 'cheio' ? CORACAO_OURO_MC : CORACAO_OURO_METADE_MC), x, 0);
    });
    lista.forEach((k, i) => {
      const { x, y } = posicaoDoCoracao(i, comOuro);
      // Treme com pouca vida (um sorteio fixo por coração e por instante), e o pulinho da Regeneração.
      const dy = (i === pulo ? -2 : 0) + (treme >= 0 ? ((i * 7 + treme * 13) % 3) - 1 : 0);
      c.drawImage(fundo, x, y + dy);
      let cheio: Item | null = null;
      if (k === 'cheio') cheio = pisca ? CORACAO_CHEIO_PISCA_MC : seco ? CORACAO_SECO_MC : CORACAO_CHEIO_MC;
      else if (k === 'metade') cheio = pisca ? CORACAO_METADE_PISCA_MC : seco ? CORACAO_SECO_METADE_MC : CORACAO_METADE_MC;
      else if (k === 'cura' || k === 'cura-metade') cheio = CORACAO_CURA_MC;
      if (!cheio) return;
      if (k === 'cura-metade') {
        // Meio coração da cura: só a metade da esquerda.
        c.drawImage(img(cheio), 0, 0, Math.ceil(LADO / 2), LADO, x, y + dy, Math.ceil(LADO / 2), LADO);
      } else c.drawImage(img(cheio), x, y + dy);
    });
  }

  /** A caixa de tiro segue a bruxa. O estilo só é escrito quando muda (escrever igual também custa recálculo). */
  private posicionarCaixas(): void {
    const corpo = this.corpo;
    const vale = !!corpo && this.atingivel();
    this.escudar(vale);
    if (!vale) return;
    const s = this.centroSprite();
    const folga = 6;
    const tamanho = `${(LARG + folga * 2) * this.escala}|${(ALT + folga * 2) * this.escala}`;
    if (tamanho !== this.tamanhoCaixa) {
      this.tamanhoCaixa = tamanho;
      this.caixa.style.width = `${(LARG + folga * 2) * this.escala}px`;
      this.caixa.style.height = `${(ALT + folga * 2) * this.escala}px`;
    }
    const lugar = `translate(${Math.round((s.x - LARG / 2 - folga) * this.escala)}px, ${Math.round((s.y - ALT / 2 - folga) * this.escala)}px)`;
    if (lugar !== this.lugarCaixa) {
      this.lugarCaixa = lugar;
      this.caixa.style.transform = lugar;
    }
  }

  // ── O desenho ────────────────────────────────────────────────────────────

  private desenhar(agora: number): void {
    const c = this.c;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.larg, this.alt);
    if (agora < this.tremeAte) c.translate(Math.round(entre(-2, 2)), Math.round(entre(-2, 2)));
    if (this.conjuro?.feitico === FEITICO_FORTE) {
      // O céu escurece enquanto o Encantamento cresce.
      c.fillStyle = `rgba(20,6,40,${Math.min(0.32, this.tFase / CONJURO_FORTE_S * 0.32)})`;
      c.fillRect(-4, -4, this.larg + 8, this.alt + 8);
    }
    this.desenharMesa();
    this.desenharDrops();
    this.desenharAneis();
    for (const p of this.particulas) this.desenharParticula(p);
    c.globalAlpha = 1;
    this.desenharRunasVoando();
    // Os rastros da esquiva, por baixo dela: cópias que apagam.
    for (const f of this.fantasmas) {
      c.globalAlpha = Math.max(0, Math.min(0.45, f.vida * 1.4));
      c.drawImage(sprite(f.estagio, f.quadro, f.lado, false), Math.round(f.x - LARG / 2), Math.round(f.y - ALT / 2));
    }
    c.globalAlpha = 1;
    const corpo = this.corpo;
    if (corpo && corpo.visivel) {
      if (this.conjuro?.feitico === FEITICO_FORTE) this.desenharCirculo(agora);
      this.desenharBruxa(agora);
      if (this.conjuro?.feitico === FEITICO_FORTE) this.desenharEncanto();
    }
    if (this.voando) this.desenharGarrafaVoando();
    this.desenharPerolaVoando();
    this.desenharOrbes(agora);
    if (this.clarao > 0) {
      c.fillStyle = `rgba(230,200,255,${this.clarao})`;
      c.fillRect(-4, -4, this.larg + 8, this.alt + 8);
    }
  }

  private desenharParticula(p: Particula): void {
    const c = this.c;
    c.globalAlpha = Math.max(0, Math.min(1, p.vida / p.max));
    c.fillStyle = p.cor;
    const x = Math.round(p.x), y = Math.round(p.y);
    if (p.forma === 'cruz') {
      c.fillRect(x - 1, y, 3, 1);
      c.fillRect(x, y - 1, 1, 3);
    } else if (p.forma === 'estrela') {
      // A estrelinha: braços que encolhem conforme ela apaga.
      const braco = p.vida / p.max > 0.5 ? 2 : 1;
      c.fillRect(x - braco, y, braco * 2 + 1, 1);
      c.fillRect(x, y - braco, 1, braco * 2 + 1);
      c.fillStyle = '#ffffff';
      c.fillRect(x, y, 1, 1);
    } else if (p.forma === 'espiral') {
      // A partícula de efeito de poção do jogo: um anelzinho de 3 × 3 que vira ponto.
      if (p.vida / p.max > 0.45) {
        c.fillRect(x - 1, y - 1, 3, 1);
        c.fillRect(x - 1, y + 1, 3, 1);
        c.fillRect(x - 1, y, 1, 1);
        c.fillRect(x + 1, y, 1, 1);
      } else c.fillRect(x, y, 1, 1);
    } else c.fillRect(x, y, p.tam, p.tam);
  }

  /** Um círculo de pixels (o anel do estouro, o círculo do Encantamento). */
  private circuloPixel(cx: number, cy: number, r: number, cor: string | ((i: number) => string | null)): void {
    const c = this.c;
    const passos = Math.max(12, Math.round(r * 2 * Math.PI));
    let ultimo = '';
    for (let i = 0; i < passos; i++) {
      const a = (i / passos) * Math.PI * 2;
      const x = Math.round(cx + Math.cos(a) * r), y = Math.round(cy + Math.sin(a) * r);
      const chave = `${x},${y}`;
      if (chave === ultimo) continue;
      ultimo = chave;
      const tinta = typeof cor === 'string' ? cor : cor(i);
      if (!tinta) continue;
      c.fillStyle = tinta;
      c.fillRect(x, y, 1, 1);
    }
  }

  private desenharAneis(): void {
    const c = this.c;
    for (const a of this.aneis) {
      c.globalAlpha = Math.max(0, a.vida / a.max);
      this.circuloPixel(a.x, a.y, a.r, a.cor);
      if (a.r > 6) this.circuloPixel(a.x, a.y, a.r - 2, i => (i % 3 === 0 ? '#ffffff' : null));
    }
    c.globalAlpha = 1;
  }

  /** O círculo do Encantamento: dois anéis tracejados girando e as runas. */
  private desenharCirculo(agora: number): void {
    const c = this.c;
    const s = this.centroSprite();
    const k = Math.min(1, this.tFase / 0.4);
    const r = 50 * k;
    const gira = agora / 500;
    const cores = FEITICOS[FEITICO_FORTE];
    c.globalAlpha = 0.85;
    this.circuloPixel(s.x, s.y, r, i => ((Math.floor(i / 3) + Math.floor(gira * 10)) % 2 === 0 ? cores.corClara : null));
    this.circuloPixel(s.x, s.y, Math.max(1, r - 5), i => ((Math.floor(i / 2) - Math.floor(gira * 14)) % 3 === 0 ? cores.cor : null));
    // As runas do Alfabeto Galáctico em volta, girando.
    const letras = letrasComRuna(ENCANTO);
    letras.forEach((l, i) => {
      const g = glifo(l, i % 2 ? cores.corClara : '#ffffff', 14);
      if (!g) return;
      const a = gira * 1.4 + (i * Math.PI * 2) / letras.length;
      const rr = r + 9;
      c.globalAlpha = 0.6 + 0.4 * Math.sin(agora / 150 + i);
      c.drawImage(g, Math.round(s.x + Math.cos(a) * rr - g.width / 2), Math.round(s.y + Math.sin(a) * rr - g.height / 2));
    });
    c.globalAlpha = 1;
  }

  /** A frase dela em runas, se escrevendo letra a letra acima dela. */
  private desenharEncanto(): void {
    const c = this.c;
    const s = this.centroSprite();
    const letras = [...ENCANTO.toLowerCase()];
    const quantas = Math.min(letras.length, Math.floor((this.tFase / (CONJURO_FORTE_S * 0.8)) * letras.length) + 1);
    const glifos = letras.slice(0, quantas).map((l, i) => (l === ' ' ? null : glifo(l, i % 2 ? '#ffffff' : FEITICOS[FEITICO_FORTE].corClara, 15)));
    const largura = glifos.reduce((t, g) => t + (g ? g.width + 3 : 8), 0);
    let x = Math.round(s.x - largura / 2);
    const y = Math.round(s.y - ALT / 2 - 34);
    for (const g of glifos) {
      if (!g) { x += 8; continue; }
      c.drawImage(g, x, y + Math.round(Math.sin(this.relogio * 6 + x) * 1));
      x += g.width + 3;
    }
  }

  /**
   * A mesa de encantamento do jogo no chão, subindo da terra, com duas estantes
   * ao lado (de onde as runas saem, como no jogo) e o livro flutuando em cima:
   * abre e fecha devagar, folheia uma página de vez em quando e sobe e desce.
   */
  private desenharMesa(): void {
    const m = this.mesa;
    if (!m) return;
    const c = this.c;
    const P = PIXEL_MC;
    const z = this.zona();
    const peca = mesa();
    // Tudo sobe da terra: o que está abaixo do chão não aparece.
    const sobe = (1 - Math.max(0, Math.min(1, m.aparecendo))) * 20 * P;
    c.save();
    c.beginPath();
    c.rect(0, 0, this.larg, z.chao);
    c.clip();
    // As estantes, uma de cada lado.
    for (const e of this.estantesDaMesa()) {
      const x = Math.round(e.x - 8 * P), y = Math.round(z.chao - 16 * P + sobe);
      c.drawImage(peca.topoEstante, x, y - 5 * P, 16 * P, 5 * P);
      c.drawImage(peca.estante, x, y, 16 * P, 16 * P);
      // A sombra do lado de baixo, para o bloco não ficar chapado.
      c.fillStyle = 'rgba(0,0,0,.18)';
      c.fillRect(x, y + 12 * P, 16 * P, 4 * P);
    }
    // A mesa: o tampo em perspectiva em cima da frente (12 de altura).
    const x0 = Math.round(m.x - 8 * P);
    const frente = Math.round(z.chao - 16 * P + sobe);
    const topoDaFrente = frente + 4 * P;
    c.drawImage(peca.tampo, x0, topoDaFrente - 6 * P, 16 * P, 6 * P);
    c.drawImage(peca.frente, x0, frente, 16 * P, 16 * P);
    c.restore();
    if (m.aparecendo < 0.8) return;
    this.desenharLivro(m.x, topoDaFrente - 6 * P - 9 * P + Math.round(Math.sin(m.t * 2.4) * 2), m.t);
  }

  /**
   * O livro da mesa, aberto e deitado como no jogo: duas páginas em V a partir
   * da lombada, a capa marrom por baixo, abrindo e fechando devagar (a ponta de
   * fora sobe e desce), e de vez em quando uma folha vira da direita para a
   * esquerda. Desenhado coluna a coluna (1 px da arte cada), para o V ficar em
   * degrau de pixel e não borrar.
   */
  private desenharLivro(cx: number, cy: number, t: number): void {
    const c = this.c;
    const P = PIXEL_MC;
    const peca = mesa();
    const pag = peca.pagina; // 8 × 5 (deitada)
    const metade = pag.width * P; // 16 px da arte
    const alto = pag.height * P; // 10 px da arte
    const ergue = 3 + Math.round(2 + 2 * Math.sin(t * 2.2)); // quanto a ponta de fora sobe
    const x0 = Math.round(cx), topo = Math.round(cy - alto / 2);
    const coluna = (lado: -1 | 1, i: number, largura: number, extra: number) => {
      // i: 0 na lombada, `largura − 1` na ponta. A textura é lida pela fração da largura.
      const k = largura <= 1 ? 0 : i / (largura - 1);
      const lift = Math.round(k * (ergue + extra));
      const sx = Math.min(pag.width - 1, Math.floor(k * pag.width));
      const x = lado < 0 ? x0 - 1 - i : x0 + i;
      // A capa: dois pixels de marrom embaixo da folha, com o dourado na ponta.
      c.fillStyle = i >= largura - 2 ? '#e8b048' : '#6b3a17';
      c.fillRect(x, topo + alto - lift, 1, P);
      c.drawImage(pag, lado < 0 ? pag.width - 1 - sx : sx, 0, 1, pag.height, x, topo - lift, 1, alto);
    };
    for (let i = 0; i < metade; i++) { coluna(-1, i, metade, 0); coluna(1, i, metade, 0); }
    // A folha virando: a cada 1,8 s, por 0,5 s, sai da direita, fica em pé e deita na esquerda.
    const u = (t % 1.8) / 0.5;
    if (u < 1) {
      const k = Math.cos(u * Math.PI);
      const w = Math.max(1, Math.round(metade * Math.abs(k)));
      const extra = Math.round((1 - Math.abs(k)) * 10);
      for (let i = 0; i < w; i++) coluna(k > 0 ? 1 : -1, i, w, extra);
    }
    // A lombada.
    c.fillStyle = '#3e2410';
    c.fillRect(x0 - 1, topo, 2, alto + P);
    // O brilho do encantamento em volta do livro, de vez em quando.
    if (Math.random() < 0.25) {
      this.particula({ x: cx + entre(-metade, metade), y: cy + entre(-alto, 0), vx: 0, vy: entre(-12, -4), vida: 0.5, cor: sorteia(CORES_PORTAL), tam: 1, g: 0, forma: 'ponto' });
    }
  }

  /** Onde ficam as estantes (o meio de cada uma, px da arte), dentro da tela. */
  private estantesDaMesa(): { x: number; y: number }[] {
    const m = this.mesa;
    if (!m) return [];
    const y = this.zona().chao - 10 * PIXEL_MC;
    const dentro = (x: number) => Math.max(10 * PIXEL_MC, Math.min(this.larg - 10 * PIXEL_MC, x));
    return [{ x: dentro(m.x - ESTANTE_LONGE), y }, { x: dentro(m.x + ESTANTE_LONGE), y }];
  }

  private desenharRunasVoando(): void {
    if (!this.runas.length) return;
    const c = this.c;
    const livro = this.livroDaMesa();
    for (const r of this.runas) {
      const u = r.t / r.dura;
      const x = r.de.x + (livro.x - r.de.x) * suave(u);
      const y = r.de.y + (livro.y - r.de.y) * u - Math.sin(u * Math.PI) * 10;
      const g = glifo(r.letra, u < 0.5 ? '#ffffff' : FEITICOS[FEITICO_FORTE].corClara, 9);
      if (!g) continue;
      c.globalAlpha = Math.min(1, (1 - u) * 2);
      c.drawImage(g, Math.round(x - g.width / 2), Math.round(y - g.height / 2));
    }
    c.globalAlpha = 1;
  }

  private desenharBruxa(agora: number): void {
    const c = this.c;
    const corpo = this.corpo!;
    const s = this.centroSprite();
    const f = this.quadroAtual();
    const morrendo = this.fase === 'caindo' || this.fase === 'tombando';
    const img = sprite(this.estagio, f, corpo.lado, morrendo || agora < this.dorAte);
    c.save();
    if (this.fase === 'tombando') {
      // O tombo do jogo: gira em volta do canto do pé, do lado para onde cai.
      c.translate(Math.round(s.x + corpo.lado * LARG / 2), Math.round(s.y + ALT / 2));
      c.rotate(corpo.giro);
      c.drawImage(img, corpo.lado > 0 ? -LARG : 0, -ALT);
    } else {
      c.translate(Math.round(s.x), Math.round(s.y));
      if (this.fase === 'tonta') c.translate(Math.round(Math.sin(agora / 40) * 1.5), 0);
      c.rotate(corpo.giro);
      c.drawImage(img, -LARG / 2, -ALT / 2);
    }
    c.restore();
    // A garrafa: erguida na mão enquanto ela prepara (sacudindo em passos de pixel), na boca enquanto bebe.
    const preparando = this.fase === 'conjurando' && !!this.conjuro && this.conjuro.feitico !== FEITICO_FORTE;
    if (preparando) {
      const info = FEITICOS[this.conjuro!.feitico];
      const g = garrafa(info.cor);
      const p = this.paraTelaMaoErguida();
      c.drawImage(g, Math.round(p.x - g.width / 2), Math.round(p.y - g.height / 2 - (Math.floor(agora / 180) % 2)));
    }
    if (this.fase === 'curando' && this.cura) {
      const g = garrafa(COR_CURA);
      const boca = this.paraTela(BOCA.x * PIXEL_MC, BOCA.y * PIXEL_MC);
      // Vira a garrafa em passos de 45° (como item do jogo, sem borrar o pixel) até o fundo ficar
      // para cima, com o gargalo na boca; cada gole dá um tranco de 1 pixel.
      const giro = -corpo.lado * (this.cura.t < 0.25 ? Math.PI / 2 : (Math.PI * 3) / 4);
      const gole = Math.floor(agora / 140) % 2;
      const gx = boca.x - 7 * Math.sin(giro), gy = boca.y + 7 * Math.cos(giro) - gole;
      c.save();
      c.translate(Math.round(gx), Math.round(gy));
      c.rotate(giro);
      c.drawImage(g, -g.width / 2, -g.height / 2);
      c.restore();
    }
    // A Pérola do Ender na mão, enquanto ela mira.
    if (faseDaPerola(corpo)?.mirando) {
      const p = miniatura(contornado(PEROLA))[0];
      const m = this.paraTelaMaoErguida();
      c.drawImage(p, Math.round(m.x - p.width / 2), Math.round(m.y - p.height / 2 - (Math.floor(agora / 160) % 2)));
    }
    // O totem: erguido bem alto no feitiço, e depois na outra mão enquanto ela está protegida.
    const totem = miniatura(contornado(TOTEM))[0];
    if (this.fase === 'protegendo') {
      const p = this.paraTela(MAO_NO_ALTO.x * PIXEL_MC, MAO_NO_ALTO.y * PIXEL_MC - 8);
      const sobe = Math.round(Math.min(1, this.tFase / 0.3) * 4);
      c.drawImage(totem, Math.round(p.x - totem.width / 2), Math.round(p.y - totem.height / 2 - sobe));
    } else if (this.protegida && !morrendo) {
      const p = this.paraTela(OUTRA_MAO.x * PIXEL_MC, OUTRA_MAO.y * PIXEL_MC);
      c.drawImage(totem, Math.round(p.x - totem.width / 2), Math.round(p.y - totem.height / 2 + (Math.floor(agora / 300) % 2)));
    }
    if (this.fase === 'tonta') {
      // As estrelinhas rodando em volta do chapéu.
      for (let i = 0; i < 3; i++) {
        const a = agora / 260 + (i * Math.PI * 2) / 3;
        this.desenharParticula({ x: s.x + Math.cos(a) * 16, y: s.y - ALT / 2 + 6 + Math.sin(a) * 4, vx: 0, vy: 0, vida: 1, max: 1, cor: '#ffe14d', tam: 1, g: 0, forma: 'estrela', gruda: false });
      }
    }
  }

  /** A Pérola do Ender em arco, deixando o rastro roxo de portal (a do jogo). */
  private desenharPerolaVoando(): void {
    const p = this.perola;
    const corpo = this.corpo;
    const u = corpo ? faseDaPerola(corpo)?.voo : null;
    if (!p || u == null) return;
    const x = p.de.x + (p.ate.x - p.de.x) * u;
    const y = p.de.y + (p.ate.y - p.de.y) * u - ARCO_PEROLA * 4 * u * (1 - u);
    const img = miniatura(contornado(PEROLA))[0];
    this.c.drawImage(img, Math.round(x - img.width / 2), Math.round(y - img.height / 2));
    if (Math.random() < 0.85) {
      this.particula({ x: x + entre(-3, 3), y: y + entre(-3, 3), vx: entre(-10, 10), vy: entre(-6, 14), vida: entre(0.3, 0.6), cor: sorteia(CORES_PORTAL), tam: 1, g: 0, forma: 'ponto' });
    }
  }

  /** O redemoinho do teleporte: as partículas de portal do Enderman, que caem girando para o centro. */
  private portal(x: number, y: number, n: number): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = entre(10, 30);
      this.particula({
        x: x + Math.cos(a) * r, y: y + Math.sin(a) * r * 1.4, vx: -Math.cos(a) * r * 1.8, vy: -Math.sin(a) * r * 2.2 + 10,
        vida: entre(0.4, 0.7), cor: sorteia(CORES_PORTAL), tam: sorteia([1, 1, 2]), g: 0, forma: 'ponto',
      });
    }
  }

  /** A garrafa em arco: sobe, gira e desce no alvo. */
  private desenharGarrafaVoando(): void {
    const v = this.voando!;
    const c = this.c;
    const u = Math.min(1, v.t / v.dura);
    const x = v.de.x + (v.ate.x - v.de.x) * u;
    const y = v.de.y + (v.ate.y - v.de.y) * u - v.altura * 4 * u * (1 - u);
    const info = FEITICOS[v.feitico];
    const g = garrafa(info.cor);
    c.save();
    c.translate(Math.round(x), Math.round(y));
    // Gira em passos de 45°, como item do jogo voando.
    c.rotate(Math.round(u * 16) * (Math.PI / 4));
    c.drawImage(g, -g.width / 2, -g.height / 2);
    c.restore();
    if (Math.random() < 0.7) this.particula({ x, y, vx: entre(-8, 8), vy: entre(-8, 8), vida: 0.35, cor: info.corClara, tam: 1, g: 0, forma: 'espiral' });
  }

  private desenharDrops(): void {
    if (!this.drops.length) return;
    const c = this.c;
    for (const d of this.drops) {
      // No chão o item flutua, sobe e desce, como no jogo; some piscando no fim.
      if (d.t > DROPS_S - 2 && Math.floor(d.t * 8) % 2 === 0) continue;
      const bob = d.noChao ? Math.round(Math.sin(d.t * 3 + d.fase) * 2) - 2 : 0;
      const [direita, esquerda] = miniatura(contornado(d.item));
      const img = Math.floor((d.t + d.fase) * 1.5) % 2 ? direita : esquerda;
      c.drawImage(img, Math.round(d.x - img.width / 2), Math.round(d.y - img.height / 2 + bob));
    }
  }

  private desenharOrbes(agora: number): void {
    if (!this.orbes.length) return;
    const c = this.c;
    for (const o of this.orbes) {
      // A bolinha de XP do jogo (a textura), mudando de verde para amarelo.
      const tom = Math.floor(agora / 70 + o.x * 0.3) % 8;
      const img = orbe(o.tam, tom);
      const x = Math.round(o.x - img.width / 2), y = Math.round(o.y - img.height / 2 + (o.voando ? 0 : Math.sin(o.t * 6)));
      c.drawImage(img, x, y);
    }
  }

  // ── Letreiros ────────────────────────────────────────────────────────────

  private letreiro(texto: string, x: number, y: number, tipo: 'hs' | 'esquiva' | 'feitico' | 'dano' | 'quebra' | 'cura' | 'totem'): void {
    const el = document.createElement('div');
    el.className = `bxc-letreiro ${tipo}`;
    el.textContent = texto;
    el.style.left = `${Math.round(x * this.escala)}px`;
    // Nunca por cima da barra de chefe e do aviso, lá no alto.
    el.style.top = `${Math.max(Math.round(y * this.escala), 150)}px`;
    this.raiz.appendChild(el);
    this.letreiros.push(el);
    if (this.letreiros.length > MAX_LETREIROS) this.letreiros.shift()!.remove();
    setTimeout(() => {
      el.remove();
      this.letreiros = this.letreiros.filter(l => l !== el);
    }, 1200);
  }

  /**
   * A conquista de quem ajudou: a placa épica (`conquista.ts`) no alto da tela,
   * com a fanfarra de desafio do jogo e três estouros de estrelinhas douradas e
   * roxas em volta dela.
   */
  private mostrarConquista(): void {
    this.raiz.querySelectorAll('.bxc-placa').forEach(a => a.remove());
    const el = montarPlaca(CONQUISTA, miniatura(contornado(DROPS[0]))[0]);
    // O ranking já abriu: ela nasce na faixa do alto, fora do caminho dele.
    if (this.conquistaNoAlto) el.classList.add('no-alto');
    this.raiz.appendChild(el);
    somConquista();
    this.aoEvento?.({ tipo: 'conquista', nome: CONQUISTA.nome });
    setTimeout(() => el.remove(), PLACA_MS + 600);
    // Os estouros em volta da placa (o meio dela, em px da arte).
    const r = el.getBoundingClientRect();
    const base = this.raiz.getBoundingClientRect();
    const cx = (r.left + r.width / 2 - base.left) / this.escala;
    const cy = (r.top + r.height / 2 - base.top) / this.escala;
    const meia = (r.width / 2 / this.escala) || (80 * ESCALA_PLACA) / this.escala;
    const estouro = () => {
      for (let i = 0; i < 46; i++) {
        const a = Math.random() * Math.PI * 2, v = entre(40, 140);
        this.particula({
          x: cx + entre(-meia, meia), y: cy + entre(-8, 8), vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.6 - 30,
          vida: entre(0.7, 1.4), cor: sorteia(['#ff55ff', '#ffd34d', '#fff6a0', '#c070ff', '#ffffff']), tam: 1, g: 60,
          forma: Math.random() < 0.5 ? 'estrela' : 'cruz',
        });
      }
      this.anel(cx, cy, '#ff55ff', 160, 0.6);
      this.acordar();
    };
    estouro();
    setTimeout(estouro, 550);
    setTimeout(estouro, 1150);
  }

  private aviso(titulo: string, sub: string): void {
    this.raiz.querySelectorAll('.bxc-aviso').forEach(a => a.remove());
    const el = document.createElement('div');
    el.className = 'bxc-aviso';
    el.innerHTML = '<b></b><span></span>';
    el.querySelector('b')!.textContent = titulo;
    el.querySelector('span')!.textContent = sub;
    this.raiz.appendChild(el);
    setTimeout(() => el.remove(), 3400);
  }
}

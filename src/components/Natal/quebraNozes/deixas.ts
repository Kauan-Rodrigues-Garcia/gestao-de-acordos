/**
 * As deixas dos quebra-nozes: o vocabulário do que um boneco sabe fazer, e a
 * função que aplica uma deixa no elemento dele.
 *
 * Mesmo molde do Grinch (`chale/grinch/gravacao.ts`): o espetáculo é uma folha
 * de deixas com hora marcada; tocar é disparar cada uma na hora dela, e o
 * movimento entre uma e outra é transição de `transform`, que a placa de vídeo
 * faz sozinha (`quebraNozes.css`). A diferença é que aqui a folha não é
 * escrita à mão: quem monta é o diretor (`diretor.ts`), a partir de um sorteio
 * com semente — cada aparição sai diferente, e igual para a cidade inteira.
 */

/** `a` é o diretor (Anderson); `b`, o head da cidade. */
export type Quem = 'a' | 'b';

export type Pose =
  | 'sentido' | 'descanso' | 'continencia' | 'cintura' | 'bracos-cima' | 'aplaude' | 'le' | 'segura'
  | 'aponta-e' | 'aponta-d' | 'aponta-cima' | 'dedo' | 'pensa' | 'ombros' | 'luneta' | 'corneta'
  | 'brinda' | 'tchau' | 'equilibra' | 'espia-e' | 'espia-d' | 'sem-corda' | 'reverencia'
  | 'cobre-rosto' | 'tambor' | 'vitoria' | 'chapeu' | 'queixo' | 'relogio' | 'da-corda-e' | 'da-corda-d';

/** O que ele leva na mão. */
export type ItemDeMao = 'bastao' | 'sino' | 'corneta' | 'luneta' | 'xicara' | 'noz' | 'relogio' | 'baqueta';
/** O que ele leva na frente do corpo. */
export type ItemDePeito = 'pergaminho' | 'tambor' | 'presente';
/** De uma vez só, no corpo inteiro. */
export type Reacao = 'susto' | 'riso' | 'pulinho' | 'giro' | 'estufa' | 'tremor' | 'tropeco' | 'alto' | 'mola'
  /** Só nos quadrinhos do modo leve (`quadrinho.ts`): o pulinho de quem fala, a cada quadro. */
  | 'quadro';
/** De uma vez só, na cabeça. */
export type Gesto = 'sim' | 'nao' | 'espirro' | 'inclina' | 'olha-cima';
/** Entradas e saídas no ar ou por baixo do palco. */
export type Salto = 'sobe' | 'desce' | 'paraquedas' | 'pulo';
/** Um movimento que se repete enquanto a deixa valer. */
export type Mexe = 'aceno' | 'aplauso' | 'tambor' | 'dedo' | 'sino' | 'cutuca' | 'regencia' | 'corda' | 'gole';
export type Enfeite = 'azevinho' | 'estrela' | 'floco' | 'sininho';

export type Lugar = number | 'esq' | 'dir' | readonly ['esq' | 'dir', number];

export interface Movimento {
  mostra?: boolean;
  /**
   * Para onde vai: px a partir do centro do palco; a coxia da esquerda ou da
   * direita (fora da tela, seja qual for a largura dela); ou tantos px para
   * dentro da coxia (`['esq', 60]` = espiando pela beirada esquerda).
   */
  x?: Lugar;
  dur?: number;
  curva?: string;
  pose?: Pose;
  /** A velocidade das juntas nesta troca de pose. */
  ritmo?: 'lento' | 'rapido' | null;
  /** Para onde ele se volta: -1 esquerda, 1 direita, 0 a plateia. */
  olha?: -1 | 0 | 1;
  /** 0 parado, 1 marcha, 2 passo acelerado. */
  anda?: 0 | 1 | 2;
  /** Os braços não balançam na marcha (levando alguma coisa). */
  firme?: boolean;
  /** A mandíbula: 0 fechada; 1, 2, 3 são três jeitos de falar. */
  fala?: 0 | 1 | 2 | 3;
  /** A mandíbula parada aberta (px). */
  boca?: number;
  /** Balançando a cabeça de quem escuta. */
  ouve?: boolean;
  mexe?: Mexe | null;
  /** A chave de corda nas costas: 0 parada, 1 girando, 2 girando depressa. */
  chave?: 0 | 1 | 2;
  /** Batendo o pé, impaciente. */
  pe?: boolean;
  itemD?: ItemDeMao | null;
  itemE?: ItemDeMao | null;
  peito?: ItemDePeito | null;
  salto?: Salto;
  reacao?: Reacao;
  gesto?: Gesto;
  /** O sinal em cima do chapéu: «!», «?», «♪», «♥», «★», «zzz», «💧». */
  emote?: string;
  enfeite?: Enfeite | null;
  /** Quem passa na frente de quem. */
  frente?: boolean;
}

/** O que sai de dentro da noz. */
export type Surpresa = 'estrela' | 'coracao' | 'nota' | 'floco' | 'presente' | 'poeira' | 'moeda' | 'confete';

/** O cenário do palco. */
export type Cena =
  | { tapete: boolean }
  /** As plaquinhas de nome, cada uma no x do seu boneco; `null` recolhe. */
  | { placas: Partial<Record<Quem, number>> | null }
  | { veu: boolean }
  | { letreiro: string | null }
  | { caixa: { q: Quem; x: number; estado: 'cai' | 'abre' | 'some' } }
  | { confete: number }
  | { noz: { x: number; surpresa: Surpresa } }
  | { cartao: number }
  | { cartoes: 'somem' }
  /**
   * Um som do espetáculo (`sons.ts`). `dur`: quanto dura o que se repete (o
   * sino balançando, o tambor); `x`: de onde vem, em px do centro do palco.
   */
  | { som: SomDeCena; dur?: number; x?: number };

/**
 * Os sons que a folha de deixas pede: acompanham o que se vê (quem põe a
 * maioria é o `Roteiro.fim`, do diretor). A entrada e a saída são mudas
 * (Cleber, 12/11/2026).
 */
export type SomDeCena =
  | 'fanfarra' | 'sino' | 'tambor' | 'corneta' | 'corda' | 'palmas' | 'baque' | 'pop' | 'brinde';

export type Deixa =
  | { t: number; q: Quem; m: Movimento }
  | { t: number; balao: { q: Quem; texto: string | null } }
  | { t: number; cena: Cena };

export interface Espetaculo {
  deixas: Deixa[];
  /** Segundos, do começo ao último boneco fora do palco. */
  duracao: number;
  /** Para conferir e testar: o que o sorteio escolheu. */
  resumo: string[];
}

/** Onde fica a coxia, em px do centro: o bastante para ele sumir inteiro. */
export interface Medidas { coxia: number }

/** O lugar em px, nesta tela. */
export function pxDoLugar(lugar: Lugar, medidas: Medidas): number {
  if (typeof lugar === 'number') return lugar;
  if (lugar === 'esq') return -medidas.coxia;
  if (lugar === 'dir') return medidas.coxia;
  return lugar[0] === 'esq' ? -medidas.coxia + lugar[1] : medidas.coxia - lugar[1];
}

function reiniciar(el: HTMLElement, atributo: string, valor: string) {
  // A mesma animação duas vezes seguidas só recomeça se o atributo sair e voltar
  // — e isso pede um leiaute forçado. Trocando de animação, basta trocar o atributo.
  if (el.getAttribute(atributo) === valor) {
    el.removeAttribute(atributo);
    void el.offsetWidth;
  }
  el.setAttribute(atributo, valor);
}

function trocarItem(el: HTMLElement, onde: string, item: string | null) {
  // Já está com isso na mão: nada a fazer (e nenhum leiaute forçado à toa).
  const chave = `item${onde.charAt(0).toUpperCase()}${onde.slice(1)}`;
  if ((el.dataset[chave] ?? '') === (item ?? '')) return;
  el.dataset[chave] = item ?? '';
  el.querySelectorAll<HTMLElement>(`[data-onde="${onde}"]`).forEach(peca => {
    const mostra = peca.dataset.item === item;
    peca.style.display = mostra ? 'block' : 'none';
  });
}

const DE_UMA_VEZ = ['visivel', 'salto', 'reacao', 'gesto', 'anda', 'fala', 'mexe', 'ouve', 'pe', 'chave'] as const;

/**
 * Aplica um movimento no boneco: só atributos e `transform` — o CSS faz o
 * resto. `passado` é a deixa que já tinha acontecido quando a pessoa abriu a
 * página no meio do espetáculo: vale o estado, sem a animação de uma vez só.
 */
export function aplicarNoBoneco(el: HTMLElement, m: Movimento, medidas: Medidas, passado = false) {
  const d = el.dataset;
  if (m.mostra === true) d.visivel = '1';
  if (m.mostra === false) for (const chave of DE_UMA_VEZ) delete d[chave];
  if (m.x !== undefined) {
    const x = pxDoLugar(m.x, medidas);
    // Guardado para o palco refazer a conta se a coxia mudar de lugar (`reposicionar`).
    d.lugar = JSON.stringify(m.x);
    el.style.transitionDuration = `${passado ? 0 : m.dur ?? 0}s`;
    el.style.transitionTimingFunction = m.curva ?? 'linear';
    el.style.transform = `translateX(${x}px)`;
  }
  if (m.pose) d.pose = m.pose;
  if (m.ritmo !== undefined) { if (m.ritmo) d.ritmo = m.ritmo; else delete d.ritmo; }
  if (m.olha !== undefined) { if (m.olha) d.olha = String(m.olha); else delete d.olha; }
  if (m.anda !== undefined) { if (m.anda) d.anda = String(m.anda); else delete d.anda; }
  if (m.firme !== undefined) { if (m.firme) d.firme = '1'; else delete d.firme; }
  if (m.fala !== undefined) { if (m.fala) d.fala = String(m.fala); else delete d.fala; }
  if (m.boca !== undefined) el.style.setProperty('--mx', `${m.boca}px`);
  if (m.ouve !== undefined) { if (m.ouve) d.ouve = '1'; else delete d.ouve; }
  if (m.mexe !== undefined) { if (m.mexe) d.mexe = m.mexe; else delete d.mexe; }
  if (m.chave !== undefined) { if (m.chave) d.chave = String(m.chave); else delete d.chave; }
  if (m.pe !== undefined) { if (m.pe) d.pe = '1'; else delete d.pe; }
  if (m.itemD !== undefined) trocarItem(el, 'd', m.itemD);
  if (m.itemE !== undefined) trocarItem(el, 'e', m.itemE);
  if (m.peito !== undefined) trocarItem(el, 'peito', m.peito);
  if (m.enfeite !== undefined) trocarItem(el, 'chapeu', m.enfeite);
  if (m.frente !== undefined) el.style.zIndex = m.frente ? '3' : '';
  if (passado) return;
  if (m.salto) reiniciar(el, 'data-salto', m.salto);
  if (m.reacao === 'quadro') {
    // O pulinho do quadro (modo leve) vai direto para a placa, sem atributo e sem leiaute forçado.
    el.querySelector<HTMLElement>('.qn-reage')?.animate?.(
      [{ transform: 'translateY(4px) scale(.94, 1.05)' }, { transform: 'translateY(0) scale(1)' }],
      { duration: 280, easing: 'cubic-bezier(.3, 1.6, .5, 1)' });
  } else if (m.reacao) reiniciar(el, 'data-reacao', m.reacao);
  if (m.gesto) reiniciar(el, 'data-gesto', m.gesto);
  if (m.emote) {
    const sinal = el.querySelector<HTMLElement>('.qn-emote');
    if (sinal) {
      sinal.textContent = m.emote;
      // Sobe, fica e some: direto na placa, sem leiaute forçado para recomeçar.
      sinal.animate?.([
        { opacity: 0, transform: 'translateY(12px) scale(.2)' },
        { opacity: 1, transform: 'translateY(0) scale(1.2)', offset: 0.14 },
        { opacity: 1, transform: 'translateY(0) scale(1)', offset: 0.24 },
        { opacity: 1, transform: 'translateY(-5px) scale(1)', offset: 0.78 },
        { opacity: 0, transform: 'translateY(-16px) scale(.8)' },
      ], { duration: 1700, easing: 'cubic-bezier(.3, 1.5, .5, 1)' });
    }
  }
}

/**
 * A coxia mudou de lugar (a janela mudou de tamanho, ou o palco encolheu): o
 * boneco que está nela, ou a caminho dela, vai para o lugar novo. Quem está
 * numa marca do palco (px do centro) não precisa de nada.
 */
export function reposicionar(el: HTMLElement, medidas: Medidas) {
  let lugar: Lugar;
  try { lugar = JSON.parse(el.dataset.lugar ?? 'null') as Lugar; } catch { return; }
  if (lugar === null || typeof lugar === 'number') return;
  el.style.transitionDuration = el.dataset.visivel ? '.5s' : '0s';
  el.style.transitionTimingFunction = 'ease-out';
  el.style.transform = `translateX(${pxDoLugar(lugar, medidas)}px)`;
}

export interface Palco {
  boneco: (q: Quem) => HTMLElement | null;
  balao: (q: Quem, texto: string | null) => void;
  cena: (cena: Cena, passado: boolean) => void;
  medidas: () => Medidas;
}

/**
 * Toca o espetáculo a partir do segundo `desde` (quem chega no meio entra no
 * ponto em que ele está). Cada deixa na hora dela, contada de um relógio só.
 * Resolve no fim, ou assim que `vivo` disser que o palco saiu da tela.
 */
export function tocar(deixas: readonly Deixa[], palco: Palco, vivo: () => boolean, desde = 0): Promise<void> {
  return new Promise(resolve => {
    const inicio = performance.now() - desde * 1000;
    let i = 0;
    const disparar = (d: Deixa, passado: boolean) => {
      if ('m' in d) { const el = palco.boneco(d.q); if (el) aplicarNoBoneco(el, d.m, palco.medidas(), passado); }
      else if ('balao' in d) palco.balao(d.balao.q, d.balao.texto);
      else palco.cena(d.cena, passado);
    };
    // O que já passou: só o estado.
    while (i < deixas.length && deixas[i].t < desde - 0.05) disparar(deixas[i++], true);
    const passo = () => {
      if (!vivo()) { resolve(); return; }
      const agora = (performance.now() - inicio) / 1000;
      while (i < deixas.length && deixas[i].t <= agora + 0.008) disparar(deixas[i++], false);
      if (i >= deixas.length) { resolve(); return; }
      window.setTimeout(passo, Math.max(0, (deixas[i].t - agora) * 1000));
    };
    passo();
  });
}

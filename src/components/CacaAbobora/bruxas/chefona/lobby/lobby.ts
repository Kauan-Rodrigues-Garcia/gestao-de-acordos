/**
 * lobby.ts — o lobby antes da Bruxa do Pântano (16/10/2026).
 *
 * Pedido do Cleber: a contagem vira 3 minutos e, em vez de anunciar a chefona
 * direto, chega um CONVITE na tela de todo mundo — a bruxa está chegando,
 * vamos unir forças — com «Entrar no lobby» e «Ficar de fora». Quem entra vê
 * quantos já entraram e um painel de partida de jogo, onde cada pessoa que
 * chega aparece. A música (`tocador.ts`) toca só para quem está no lobby,
 * subindo baixinha até a bruxa nascer no drop dela (2:27,4).
 *
 * SÓ QUEM ENTROU vê a bruxa e luta (`LobbyDaChefona.tsx` monta a cena só para
 * ele, e o banco só conta tiro de quem está no lobby) — o super_admin também
 * precisa entrar. Quem não entrou vê só este menu no alto, sem a contagem
 * (tique, números grandes, «chegou»): na espera, o convite ou «Você ficou de
 * fora»; na luta, «A batalha está acontecendo», com o botão para entrar.
 *
 * Estados de quem vê:
 *  - `convite`: ainda não respondeu. Faixa no alto com os dois botões.
 *  - `fora`:    ficou de fora (ou não respondeu até ela chegar). Uma pílula
 *               discreta, com o botão para entrar (na contagem e na luta).
 *  - `lobby`:   entrou, na contagem. O painel por 5 s e depois a pílula; o
 *               painel volta enquanto o Tab (no celular, o dedo na pílula)
 *               estiver segurado.
 *  - `luta`:    entrou, e a bruxa nasceu. Sobra a barrinha da música.
 *  - `fim`:     a bruxa morreu ou fugiu: a música some rápido e nada fica.
 *
 * ## Computador fraco
 *
 * Nada aqui roda a cada quadro sem precisar: o relógio acorda só na virada de
 * cada segundo (e no máximo 4 vezes por segundo), os elementos que ele mexe
 * ficam guardados (nada de procurar no DOM a cada passo), as barrinhas da
 * música só animam com ela tocando e à vista (30 por segundo), e no modo leve
 * da chefona (`../leve.ts`) não há animação nenhuma.
 */
import './lobby.css';
import { tiqueDaContagem } from './sonsLobby';
import { canvasDaImagem } from '../../pixels';
import { NOME_CHEFONA, cabecaMC } from '../arte';
import { TocadorTrilha } from './tocador';
import { CONTAGEM_LOBBY_S, DURACAO_MUSICA_S, PONTO_DA_BRUXA_S, faltaParaMusica, mmss } from './trilha';

export interface Guerreiro {
  id: string;
  nome: string;
  setor?: string | null;
}

export type EstadoLobby = 'convite' | 'fora' | 'lobby' | 'luta' | 'fim';

export interface OpcoesLobby {
  /** Quanto falta para a bruxa nascer (s), pela hora de quem manda (no app, o banco). */
  faltaS: () => number;
  /** Quem sou eu (para marcar «você» no painel). */
  eu: Guerreiro;
  /** Onde começar (padrão: `convite`). Quem recarrega a página já no lobby volta recolhido. */
  estadoInicial?: EstadoLobby;
  /** Sem animação nenhuma (o modo leve da chefona). */
  leve?: boolean;
  /** Entrou. Devolvendo `false` (o banco recusou), volta para onde estava. */
  aoEntrar?: () => void | Promise<boolean>;
  aoFicarFora?: () => void;
  aoSair?: () => void;
}

const TIQUE_S = 10;
const NUMERAO_S = 5;
const MAX_NO_PAINEL = 24;
const MAX_NO_MONTE = 6;
const BARRAS_EQ = 18;
const BARRAS_EQ_MINI = 5;
/** Depois de entrar, o lobby fica aberto este tempo e recolhe sozinho. */
const RECOLHE_SOZINHO_MS = 5_000;
/** O relógio acorda no máximo a cada tanto (ms) — e na virada de cada segundo. */
const PASSO_MAX_MS = 250;

/** O foco está num campo de digitar (lá o Tab é do formulário). */
function emCampo(alvo: EventTarget | null): boolean {
  const e = alvo as HTMLElement | null;
  if (!e || !e.tagName) return false;
  return e.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.tagName);
}

// ── O rostinho de cada um (8×8, como a cabeça de um jogador) ────────────────

const PELES = ['#f2c9a0', '#e0ac7e', '#c68c5a', '#a26a42', '#7a4a2a', '#5a3620'];
const CABELOS = ['#2b1b10', '#4a2f1b', '#7a4a20', '#c78a3b', '#e8c46b', '#1c1c24', '#8a2f2f', '#5b3f8c'];
const OLHOS = ['#3b5bd6', '#2f8a4a', '#5a3a1a', '#222', '#7a46c8'];

function hash(s: string): number {
  let h = 2166136261;
  for (const ch of s) { h ^= ch.codePointAt(0)!; h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Os rostos desenhados (um canvas 8×8 por pessoa, reaproveitado como imagem). */
const rostos = new Map<string, string>();

/** O rosto em pixels, sempre o mesmo para a mesma pessoa. */
export function rostinho(id: string): HTMLImageElement {
  let url = rostos.get(id);
  if (!url) {
    const h = hash(id);
    const pele = PELES[h % PELES.length];
    const cabelo = CABELOS[(h >>> 4) % CABELOS.length];
    const olho = OLHOS[(h >>> 8) % OLHOS.length];
    const franja = (h >>> 12) % 3;
    const longo = ((h >>> 14) & 1) === 1;
    const c = document.createElement('canvas');
    c.width = 8; c.height = 8;
    const g = c.getContext('2d')!;
    g.fillStyle = pele; g.fillRect(0, 0, 8, 8);
    g.fillStyle = cabelo;
    g.fillRect(0, 0, 8, 2);
    if (franja === 1) g.fillRect(0, 2, 3, 1);
    if (franja === 2) { g.fillRect(5, 2, 3, 1); g.fillRect(0, 2, 1, 1); }
    if (longo) { g.fillRect(0, 2, 1, 6); g.fillRect(7, 2, 1, 6); } else { g.fillRect(0, 2, 1, 2); g.fillRect(7, 2, 1, 2); }
    g.fillStyle = '#fff'; g.fillRect(1, 4, 2, 1); g.fillRect(5, 4, 2, 1);
    g.fillStyle = olho; g.fillRect(2, 4, 1, 1); g.fillRect(5, 4, 1, 1);
    g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(3, 5, 2, 1);
    g.fillStyle = '#7a3b2e'; g.fillRect(2, 6, 4, 1);
    url = c.toDataURL();
    if (rostos.size > 500) rostos.clear();
    rostos.set(id, url);
  }
  const img = document.createElement('img');
  img.src = url;
  img.alt = '';
  img.className = 'bxl-rosto';
  return img;
}

/** A cabeça da bruxa, desenhada uma vez. */
let urlCabeca: string | null = null;
function cabeca(escala: number): HTMLImageElement {
  const base = canvasDaImagem(cabecaMC(), false);
  if (!urlCabeca) urlCabeca = base.toDataURL();
  const img = document.createElement('img');
  img.src = urlCabeca;
  img.alt = '';
  img.className = 'bxl-cabeca';
  img.style.width = `${base.width * escala}px`;
  img.style.height = `${base.height * escala}px`;
  return img;
}

function primeiroNome(nome: string): string {
  const [a, b] = nome.trim().split(/\s+/);
  return b ? `${a} ${b[0]}.` : a;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, texto?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

function botao(cls: string, texto: string, aoClicar: () => void): HTMLButtonElement {
  const b = el('button', cls, texto);
  b.type = 'button';
  b.onclick = aoClicar;
  return b;
}

const sons = new Map<string, HTMLAudioElement>();
function tocarArquivo(nome: string, volume: number): void {
  let a = sons.get(nome);
  if (!a) { a = new Audio(`/sons/minecraft/${nome}.ogg`); sons.set(nome, a); }
  a.volume = volume;
  a.currentTime = 0;
  void a.play().catch((): void => undefined);
}

/** Os elementos que o relógio mexe, guardados a cada desenho. */
interface Refs {
  relogios: HTMLElement[];
  xp: HTMLElement[];
  nivel: HTMLElement | null;
  eq: HTMLElement[];
  status: HTMLElement | null;
  pos: HTMLElement | null;
}

const SEM_REFS: Refs = { relogios: [], xp: [], nivel: null, eq: [], status: null, pos: null };

// ── O lobby ────────────────────────────────────────────────────────────────

export class LobbyChefona {
  readonly tocador: TocadorTrilha;
  private raiz: HTMLDivElement;
  private estado: EstadoLobby;
  private readonly leve: boolean;
  private recolhido: boolean;
  /** Recolhido, mas aberto enquanto o Tab (ou o dedo na pílula) segura. */
  private espiando = false;
  private guerreiros: Guerreiro[] = [];
  private total = 0;
  private chaveGuerreiros = '';
  private conhecidos = new Set<string>();
  private feed: string[] = [];
  private refs: Refs = SEM_REFS;
  private relogio = 0;
  private eqRaf = 0;
  private segAnterior = Number.NaN;
  private recolherTimer = 0;
  private chegouJa = false;
  private readonly desligar: () => void;

  constructor(pai: HTMLElement, private readonly op: OpcoesLobby) {
    this.tocador = new TocadorTrilha(op.faltaS);
    this.leve = op.leve ?? false;
    this.estado = op.estadoInicial ?? 'convite';
    this.recolhido = this.estado === 'lobby';
    this.chegouJa = op.faltaS() <= 0;
    this.raiz = el('div', this.leve ? 'bxl leve' : 'bxl');
    this.raiz.setAttribute('role', 'region');
    this.raiz.setAttribute('aria-label', `Lobby da ${NOME_CHEFONA}`);
    pai.appendChild(this.raiz);

    // Quem volta já no lobby (recarregou a página): a música precisa de um
    // gesto para tocar — o primeiro clique em qualquer lugar serve.
    const destravar = () => { if (this.estado === 'lobby' || this.estado === 'luta') this.tocador.destravar(); };
    if (this.estado === 'lobby' || this.estado === 'luta') this.tocador.destravar();

    // Tab segurado abre o lobby recolhido; soltar fecha. Com o foco num campo,
    // o Tab é do formulário (pular de campo no Novo Acordo), não do lobby.
    const desce = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !this.podeEspiar() || emCampo(e.target)) return;
      e.preventDefault();
      if (!e.repeat) this.espiar(true);
    };
    const sobe = (e: KeyboardEvent) => { if (e.key === 'Tab' && this.espiando) { e.preventDefault(); this.espiar(false); } };
    const perdeu = () => this.espiar(false);
    // O dedo (ou o mouse) que segurou a pílula pode soltar em qualquer lugar.
    const soltou = () => { if (this.espiando) this.espiar(false); };
    window.addEventListener('pointerdown', destravar, { capture: true, passive: true });
    window.addEventListener('keydown', desce);
    window.addEventListener('keyup', sobe);
    window.addEventListener('blur', perdeu);
    window.addEventListener('pointerup', soltou);
    window.addEventListener('pointercancel', soltou);
    this.desligar = () => {
      window.removeEventListener('pointerdown', destravar, { capture: true });
      window.removeEventListener('keydown', desce);
      window.removeEventListener('keyup', sobe);
      window.removeEventListener('blur', perdeu);
      window.removeEventListener('pointerup', soltou);
      window.removeEventListener('pointercancel', soltou);
    };

    this.montar();
    this.agendar();
  }

  get situacao(): EstadoLobby { return this.estado; }

  /**
   * Quem está no lobby (na ordem de chegada; no app, os últimos 24 que o banco
   * manda) e quantos são ao todo. Só redesenha quando muda.
   */
  atualizarGuerreiros(lista: Guerreiro[], total = lista.length): void {
    const chave = `${total}|${lista.map(g => g.id).join(',')}`;
    if (chave === this.chaveGuerreiros) return;
    this.chaveGuerreiros = chave;
    const primeira = this.conhecidos.size === 0 && this.guerreiros.length === 0;
    const novos = lista.filter(g => !this.conhecidos.has(g.id));
    this.guerreiros = lista;
    this.total = Math.max(total, lista.length);
    for (const g of lista) this.conhecidos.add(g.id);
    // Na primeira lista (quem abre a página no meio) ninguém «acabou de entrar».
    if (!primeira) {
      for (const g of novos) {
        if (g.id === this.op.eu.id) continue;
        this.feed = [`${primeiroNome(g.nome)} entrou na batalha`, ...this.feed].slice(0, 4);
      }
      if (this.estado === 'lobby' && novos.some(g => g.id !== this.op.eu.id)) tocarArquivo('xp', 0.12);
    }
    this.montar(primeira ? [] : novos.map(g => g.id));
  }

  /** O banco diz que eu já estou no lobby (outra aba, ou a leitura chegou depois). */
  jaEstaNoLobby(): void {
    if (this.estado !== 'convite' && this.estado !== 'fora') return;
    this.tocador.destravar();
    this.estado = this.op.faltaS() > 0 ? 'lobby' : 'luta';
    this.recolhido = true;
    this.espiando = false;
    this.montar();
  }

  /** Recomeça do zero (laboratório). */
  reiniciar(): void {
    clearTimeout(this.recolherTimer);
    this.estado = 'convite';
    this.recolhido = false;
    this.espiando = false;
    this.chegouJa = false;
    this.conhecidos.clear();
    this.guerreiros = [];
    this.total = 0;
    this.chaveGuerreiros = '';
    this.feed = [];
    this.segAnterior = Number.NaN;
    this.tocador.rearmar();
    this.montar();
    this.agendar();
  }

  /** A bruxa morreu (ou fugiu, ou a luta acabou): a música some rápido e o menu sai. */
  encerrarLuta(): void {
    if (this.estado === 'fim') return;
    this.tocador.calar();
    this.estado = 'fim';
    clearTimeout(this.relogio);
    clearTimeout(this.recolherTimer);
    this.montar();
  }

  destruir(): void {
    clearTimeout(this.relogio);
    clearTimeout(this.recolherTimer);
    cancelAnimationFrame(this.eqRaf);
    this.desligar();
    this.tocador.destruir();
    this.raiz.remove();
  }

  // ── Ações ────────────────────────────────────────────────────────────────

  private entrar(): void {
    const antes = this.estado;
    // Dentro do clique: o navegador só deixa tocar som depois de um gesto.
    this.tocador.destravar();
    const naLuta = this.op.faltaS() <= 0;
    this.estado = naLuta ? 'luta' : 'lobby';
    this.recolhido = false;
    this.espiando = false;
    if (!this.leve) tocarArquivo('nivel', 0.25);
    this.montar();
    clearTimeout(this.recolherTimer);
    // Mostra o lobby por uns segundos e recolhe sozinho: o Tab abre de novo.
    if (!naLuta) this.recolherTimer = window.setTimeout(() => this.recolher(), RECOLHE_SOZINHO_MS);
    const r = this.op.aoEntrar?.();
    if (r instanceof Promise) {
      void r.then(ok => {
        if (ok !== false || (this.estado !== 'lobby' && this.estado !== 'luta')) return;
        clearTimeout(this.recolherTimer);
        this.tocador.rearmar();
        this.estado = antes;
        this.montar();
      });
    }
  }

  private ficarFora(): void {
    this.estado = 'fora';
    this.op.aoFicarFora?.();
    this.montar();
  }

  private sair(): void {
    clearTimeout(this.recolherTimer);
    this.tocador.rearmar();
    this.estado = 'fora';
    this.espiando = false;
    this.op.aoSair?.();
    this.montar();
  }

  private recolher(): void {
    clearTimeout(this.recolherTimer);
    if (this.estado !== 'lobby' || this.recolhido) return;
    this.recolhido = true;
    this.espiando = false;
    this.montar();
  }

  private podeEspiar(): boolean {
    return this.estado === 'lobby' && this.recolhido;
  }

  private espiar(aberto: boolean): void {
    if (aberto && !this.podeEspiar()) return;
    if (this.espiando === aberto) return;
    this.espiando = aberto;
    this.montar();
  }

  // ── O relógio ────────────────────────────────────────────────────────────

  /** Acorda na virada do próximo segundo (ou em `PASSO_MAX_MS`), o que vier antes. */
  private agendar(): void {
    clearTimeout(this.relogio);
    if (this.estado === 'fim') return;
    const falta = this.op.faltaS();
    let ms = PASSO_MAX_MS;
    if (falta > 0) ms = Math.min(ms, (falta - Math.floor(falta)) * 1000 + 15);
    this.relogio = window.setTimeout(() => { this.passo(); this.agendar(); }, Math.max(16, ms));
  }

  private passo(): void {
    const falta = this.op.faltaS();
    if (this.estado === 'lobby' || this.estado === 'luta') this.tocador.sincronizar();

    if (falta <= 0 && !this.chegouJa) { this.chegou(); return; }

    const seg = Math.ceil(falta);
    if (seg !== this.segAnterior) {
      this.segAnterior = seg;
      // A contagem (o tique original e os números grandes) é só de quem entrou:
      // quem não escolheu, ou ficou de fora, não participa (16/10/2026).
      if (falta > 0 && this.estado === 'lobby') {
        if (seg >= 1 && seg <= TIQUE_S) tiqueDaContagem(seg <= 3);
        if (seg >= 1 && seg <= NUMERAO_S) this.numerao(seg);
      }
      this.atualizarRelogios(falta);
    }
    this.atualizarMusica(falta);
    this.ligarEq();
  }

  private chegou(): void {
    this.chegouJa = true;
    if (this.estado === 'lobby') {
      this.estado = 'luta';
      const aviso = el('div', 'bxl-chegou');
      aviso.innerHTML = `<span>A ${NOME_CHEFONA.toUpperCase()} CHEGOU!</span><small>Todo mundo junto: atira!</small>`;
      this.raiz.appendChild(aviso);
      setTimeout(() => aviso.remove(), 2600);
    } else if (this.estado === 'convite') {
      // Não respondeu até ela chegar: fica de fora, com o botão para entrar.
      this.estado = 'fora';
    }
    clearTimeout(this.recolherTimer);
    this.espiando = false;
    this.montar();
  }

  private numerao(n: number): void {
    this.raiz.querySelectorAll('.bxl-numerao').forEach(x => x.remove());
    const d = el('div', 'bxl-numerao', String(n));
    d.setAttribute('aria-hidden', 'true');
    this.raiz.appendChild(d);
    setTimeout(() => d.remove(), 1000);
  }

  private atualizarRelogios(falta: number): void {
    const urgente = falta > 0 && falta <= TIQUE_S;
    const texto = mmss(falta);
    for (const r of this.refs.relogios) {
      if (r.textContent !== texto) r.textContent = texto;
      r.classList.toggle('urgente', urgente);
    }
    const p = 1 - Math.max(0, Math.min(1, falta / CONTAGEM_LOBBY_S));
    for (const b of this.refs.xp) b.style.transform = `scaleX(${p})`;
    if (this.refs.nivel) this.refs.nivel.textContent = String(Math.max(0, Math.ceil(falta)));
  }

  private atualizarMusica(falta: number): void {
    const { status, pos } = this.refs;
    if (status) {
      const est = this.tocador.estado();
      const espera = faltaParaMusica(falta);
      const texto = est.calada ? 'Música encerrada'
        : est.mudo ? 'Música desligada'
        : espera > 0 ? `A trilha começa em ${mmss(espera)}`
        : 'Tocando agora';
      if (status.textContent !== texto) status.textContent = texto;
    }
    if (pos) {
      const alvo = Math.max(0, Math.min(DURACAO_MUSICA_S, PONTO_DA_BRUXA_S - falta));
      pos.style.transform = `scaleX(${alvo / DURACAO_MUSICA_S})`;
    }
  }

  /** As barrinhas: só animam com a música tocando, à vista, e fora do modo leve. */
  private ligarEq(): void {
    const quer = this.refs.eq.length > 0 && !this.leve && this.tocador.tocandoComSom();
    if (quer && !this.eqRaf) {
      let pula = false;
      const laco = () => {
        pula = !pula;
        if (!pula) {
          const barras = this.refs.eq;
          const v = this.tocador.barras(barras.length);
          for (let i = 0; i < barras.length; i++) barras[i].style.transform = `scaleY(${0.08 + v[i] * 0.92})`;
        }
        this.eqRaf = requestAnimationFrame(laco);
      };
      this.eqRaf = requestAnimationFrame(laco);
    } else if (!quer && this.eqRaf) {
      cancelAnimationFrame(this.eqRaf);
      this.eqRaf = 0;
      for (const b of this.refs.eq) b.style.transform = '';
    }
  }

  // ── O desenho ────────────────────────────────────────────────────────────

  private montar(chegaram: string[] = []): void {
    this.raiz.replaceChildren(...this.raiz.querySelectorAll('.bxl-chegou, .bxl-numerao'));
    this.raiz.dataset.estado = this.estado;
    const falta = this.op.faltaS();
    if (this.estado === 'convite') this.raiz.appendChild(this.convite(chegaram));
    else if (this.estado === 'fora') this.raiz.appendChild(this.pilulaFora(falta));
    else if (this.estado === 'lobby') this.raiz.appendChild(this.recolhido && !this.espiando ? this.pilulaLobby() : this.painel(chegaram));
    else if (this.estado === 'luta') this.raiz.appendChild(this.barraLuta());
    this.refs = {
      relogios: [...this.raiz.querySelectorAll<HTMLElement>('[data-relogio]')],
      xp: [...this.raiz.querySelectorAll<HTMLElement>('[data-xp]')],
      nivel: this.raiz.querySelector<HTMLElement>('[data-nivel]'),
      eq: [...this.raiz.querySelectorAll<HTMLElement>('[data-eq] i')],
      status: this.raiz.querySelector<HTMLElement>('[data-musica-status]'),
      pos: this.raiz.querySelector<HTMLElement>('[data-pos]'),
    };
    this.atualizarRelogios(falta);
    this.atualizarMusica(falta);
    this.ligarEq();
  }

  private monte(chegaram: string[]): HTMLElement {
    const m = el('div', 'bxl-monte');
    for (const g of this.guerreiros.slice(-MAX_NO_MONTE).reverse()) {
      const r = rostinho(g.id);
      r.title = g.nome;
      if (chegaram.includes(g.id)) r.classList.add('chegou');
      m.appendChild(r);
    }
    return m;
  }

  private contador(): HTMLElement {
    return el('b', 'bxl-num', String(this.total));
  }

  private convite(chegaram: string[]): HTMLElement {
    const box = el('div', 'bxl-convite bxl-caixa');
    box.appendChild(cabeca(3));
    const meio = el('div', 'bxl-convite-meio');
    meio.append(
      el('div', 'bxl-kicker', 'CHEFONA À VISTA'),
      el('div', 'bxl-titulo', `A ${NOME_CHEFONA.toUpperCase()} ESTÁ CHEGANDO`),
      el('div', 'bxl-linha', 'Sozinho ninguém derruba ela. Vamos unir forças e acabar com ela juntos!'),
    );
    const quem = el('div', 'bxl-quem');
    quem.append(this.monte(chegaram), this.contador(), el('span', '', this.total === 1 ? 'pessoa já entrou na batalha' : 'pessoas já entraram na batalha'));
    if (chegaram.length) quem.classList.add('pulou');
    meio.appendChild(quem);
    const lado = el('div', 'bxl-convite-lado');
    const rel = el('div', 'bxl-relogio');
    rel.dataset.relogio = '';
    lado.append(
      el('div', 'bxl-rotulo', 'ELA CHEGA EM'), rel,
      botao('bxl-btn verde', '⚔ Entrar no lobby', () => this.entrar()),
      botao('bxl-btn pedra', 'Ficar de fora', () => this.ficarFora()),
    );
    box.append(meio, lado);
    return box;
  }

  /** De fora: na contagem, «Você ficou de fora»; na luta, «A batalha está acontecendo». */
  private pilulaFora(falta: number): HTMLElement {
    const naLuta = falta <= 0;
    const p = el('div', naLuta ? 'bxl-pilula bxl-caixa acontecendo' : 'bxl-pilula bxl-caixa');
    p.append(cabeca(1.5));
    if (naLuta) {
      p.append(el('span', 'bxl-pilula-alerta', 'A batalha contra a bruxa está acontecendo'));
      const n = el('span', 'bxl-pilula-n');
      n.append(this.contador(), document.createTextNode(' lutando'));
      p.append(n, botao('bxl-btn mini verde', '⚔ Entrar na luta', () => this.entrar()));
      return p;
    }
    p.append(el('span', '', 'Você ficou de fora'));
    const rel = el('b', 'bxl-pilula-relogio');
    rel.dataset.relogio = '';
    const n = el('span', 'bxl-pilula-n');
    n.append(this.contador(), document.createTextNode(' na batalha'));
    p.append(rel, n, botao('bxl-btn mini verde', 'Mudei de ideia', () => this.entrar()));
    return p;
  }

  private pilulaLobby(): HTMLElement {
    const p = el('div', 'bxl-pilula bxl-caixa dentro');
    p.append(cabeca(1.5));
    const rel = el('b', 'bxl-pilula-relogio');
    rel.dataset.relogio = '';
    const n = el('span', 'bxl-pilula-n');
    n.append(this.contador(), document.createTextNode(' aguardando'));
    // No computador, o Tab; no celular (sem Tab), segurar o dedo na pílula.
    const dica = el('span', 'bxl-dica-tab');
    dica.innerHTML = '<span class="so-teclado">segure <kbd>TAB</kbd></span><span class="so-toque">segure aqui</span>';
    p.append(rel, n, this.eq(BARRAS_EQ_MINI, true), dica, this.botaoMudo(true));
    p.addEventListener('pointerdown', e => {
      if ((e.target as HTMLElement).closest('button')) return;
      this.espiar(true);
    });
    return p;
  }

  private painel(chegaram: string[]): HTMLElement {
    const box = el('div', this.espiando ? 'bxl-painel bxl-caixa espiando' : 'bxl-painel bxl-caixa');
    if (this.espiando) {
      const solte = el('div', 'bxl-solte');
      solte.innerHTML = '<span class="so-teclado">solte o <kbd>TAB</kbd> para fechar</span><span class="so-toque">solte para fechar</span>';
      box.appendChild(solte);
    }

    // Cabeçalho.
    const topo = el('div', 'bxl-topo');
    topo.append(el('span', 'bxl-topo-titulo', 'LOBBY DA BATALHA'), el('span', 'bxl-topo-dentro', '✔ Você está dentro'));
    if (!this.espiando) {
      const recolher = botao('bxl-icone', '—', () => this.recolher());
      recolher.title = 'Recolher (a contagem e a música continuam)';
      recolher.setAttribute('aria-label', 'Recolher o lobby');
      topo.appendChild(recolher);
    }

    // A chegada: retrato, relógio e a barra de XP.
    const heroi = el('div', 'bxl-heroi');
    heroi.appendChild(cabeca(4));
    const hm = el('div', 'bxl-heroi-meio');
    const rel = el('div', 'bxl-relogio grande');
    rel.dataset.relogio = '';
    const xp = el('div', 'bxl-xp');
    const xpCheio = el('div', 'bxl-xp-cheio');
    xpCheio.dataset.xp = '';
    const nivel = el('span', 'bxl-xp-nivel');
    nivel.dataset.nivel = '';
    xp.append(xpCheio, nivel);
    hm.append(el('div', 'bxl-rotulo', `A ${NOME_CHEFONA.toUpperCase()} CHEGA EM`), rel, xp);
    heroi.appendChild(hm);

    // Quem está aqui.
    const quem = el('div', 'bxl-secao');
    const cab = el('div', 'bxl-secao-cab');
    const cont = el('span', 'bxl-cont');
    cont.append(this.contador(), document.createTextNode(this.total === 1 ? ' guerreiro aguardando' : ' guerreiros aguardando'));
    if (chegaram.length) cont.classList.add('pulou');
    cab.append(cont, el('span', 'bxl-dica', 'a luta começa sozinha no zero'));
    const grade = el('div', 'bxl-grade');
    const mostrar = this.guerreiros.slice(-MAX_NO_PAINEL);
    for (const g of mostrar) {
      const card = el('div', 'bxl-card');
      if (g.id === this.op.eu.id) card.classList.add('eu');
      if (chegaram.includes(g.id)) card.classList.add('chegou');
      const nomes = el('div', 'bxl-card-nomes');
      nomes.append(el('span', 'bxl-card-nome', g.id === this.op.eu.id ? 'Você' : primeiroNome(g.nome)));
      if (g.setor) nomes.append(el('span', 'bxl-card-setor', g.setor));
      card.append(rostinho(g.id), nomes);
      grade.appendChild(card);
    }
    if (this.total > mostrar.length) grade.appendChild(el('div', 'bxl-card mais', `+${this.total - mostrar.length}`));
    // Vagas vazias: o lobby «pede» gente, como numa partida.
    for (let i = mostrar.length; i < Math.min(MAX_NO_PAINEL, Math.max(8, mostrar.length + 2)); i++) {
      grade.appendChild(el('div', 'bxl-card vazio', '?'));
    }
    quem.append(cab, grade);

    // O chat do jogo: quem entrou.
    const feed = el('div', 'bxl-feed');
    feed.setAttribute('aria-live', 'polite');
    for (const [i, linha] of this.feed.entries()) {
      const l = el('div', 'bxl-feed-linha', linha);
      if (i === 0 && chegaram.length) l.classList.add('nova');
      feed.appendChild(l);
    }

    box.append(topo, heroi, quem, feed, this.musica(), botao('bxl-sair', 'Sair do lobby', () => this.sair()));
    return box;
  }

  private eq(n: number, mini = false): HTMLElement {
    const eq = el('div', mini ? 'bxl-eq mini' : 'bxl-eq');
    eq.dataset.eq = '';
    eq.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < n; i++) eq.appendChild(el('i'));
    return eq;
  }

  /** O botão da música; `icone` = só o símbolo (na pílula, onde não cabe o texto). */
  private botaoMudo(icone = false): HTMLButtonElement {
    const mudo = this.tocador.estado().mudo;
    const texto = mudo ? 'Ligar música' : 'Desligar música';
    const b = botao('bxl-btn mini pedra', icone ? (mudo ? '🔈' : '🔇') : `${mudo ? '🔈' : '🔇'} ${texto}`, () => {
      this.tocador.alternarMudo();
      this.montar();
    });
    b.title = texto;
    b.setAttribute('aria-label', texto);
    b.setAttribute('aria-pressed', String(mudo));
    return b;
  }

  private musica(): HTMLElement {
    const m = el('div', 'bxl-musica');
    const linha1 = el('div', 'bxl-musica-l1');
    const info = el('div', 'bxl-musica-info');
    const status = el('span', 'bxl-musica-status');
    status.dataset.musicaStatus = '';
    info.append(status);
    linha1.append(el('span', 'bxl-nota', '♪'), info, this.eq(BARRAS_EQ), this.botaoMudo());

    // A linha da música com a marca do drop (onde a bruxa nasce).
    const trilho = el('div', 'bxl-trilho');
    const pos = el('div', 'bxl-trilho-pos');
    pos.dataset.pos = '';
    const marca = el('div', 'bxl-trilho-marca');
    marca.style.left = `${(PONTO_DA_BRUXA_S / DURACAO_MUSICA_S) * 100}%`;
    marca.title = 'A bruxa nasce aqui, no drop';
    marca.appendChild(cabeca(0.75));
    trilho.append(pos, marca);
    const linha2 = el('div', 'bxl-musica-l2');
    linha2.append(trilho);

    m.append(linha1, linha2);
    return m;
  }

  private barraLuta(): HTMLElement {
    const b = el('div', 'bxl-pilula bxl-caixa luta');
    b.append(el('span', 'bxl-nota', '♪'), this.eq(BARRAS_EQ_MINI, true), this.botaoMudo());
    return b;
  }
}

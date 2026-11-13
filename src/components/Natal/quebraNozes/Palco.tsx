/**
 * O palco dos quebra-nozes: o pé da janela, onde eles aparecem.
 *
 * Recebe um espetáculo já montado (`diretor.ts`) e toca: cada deixa na hora
 * dela (`tocar`, em `deixas.ts`). Os bonecos são mexidos direto no elemento
 * (atributos e `transform`), sem passar pelo React; o cenário — tapete,
 * plaquinhas, caixas, faixa, cartões — é estado comum, porque muda poucas
 * vezes. Confete e casca de noz são peças soltas animadas por WAAPI: cada uma
 * tem o seu caminho, e variável dentro de `@keyframes` não vai para a placa.
 *
 * A tela de cada pessoa tem um tamanho, e o espetáculo é o mesmo para todas:
 * as deixas falam em «coxia» e em px a partir do centro, e é aqui que isso
 * vira posição (`medir`). O palco inteiro encolhe em tela pequena.
 *
 * Ao lado do tablado ficam duas bolinhas de Natal (Cleber, 12/11/2026): a do
 * som, e a seta que encolhe o palco inteiro para ele não atrapalhar quem está
 * salvando acordo. O espetáculo segue igual, só menor; os balões e os cartões
 * encolhem menos, para continuar dando para ler. A escolha fica no navegador.
 *
 * Quem abre a página no meio entra no ponto em que o espetáculo está (`desde`).
 *
 * ## Para o computador fraco
 *
 * O espetáculo chega pronto (a folha de deixas): aqui não se calcula nada por
 * quadro, só se troca atributo na hora de cada deixa, e quem move é a placa de
 * vídeo. O que custava era nascer: 700 nós de uma vez, na hora de começar. Por
 * isso o palco nasce ANTES da hora (`desde` negativo: `sistema.tsx` monta uns
 * segundos antes), escondido e em quatro tempos — o chão, um boneco, o outro, os
 * cartões —, e já deixa a mesa de som montada. Quando a hora chega, está tudo parado no
 * lugar.
 *
 * No modo leve o espetáculo vem em quadrinhos (`quadrinho.ts`): uma pose por
 * fala, sem nada que se repita (`[data-quadrinho]`, no CSS).
 */
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Volume2, VolumeX } from 'lucide-react';
import { cn } from '@/lib/utils';
import { aplicarNoBoneco, reposicionar, tocar, type Cena, type Medidas, type Quem, type Reacao, type Surpresa } from './deixas';
import type { Destaque, EspetaculoMontado } from './diretor';
import type { Artista, Cidade } from './elenco';
import { DefsDoQuebraNozes, QuebraNozes } from './QuebraNozes';
import {
  descansarSonsDosQuebraNozes, ligarSonsDosQuebraNozes, pararMusicaDosDestaques, prepararSonsDosQuebraNozes, tocarMusicaDosDestaques,
  tocarSom, tocarVozinha, useSonsDosQuebraNozes,
} from './sons';
import { criarSorteio, sementeDe } from './sorteio';

interface EstadoDaCena {
  veu: boolean;
  tapete: boolean;
  placas: Partial<Record<Quem, number>> | null;
  letreiro: string | null;
  caixas: Partial<Record<Quem, { x: number; estado: 'cai' | 'abre' | 'some' }>>;
  /** Até que cartão já foi revelado (-1 = nenhum). */
  cartoes: number;
  cartoesSaindo: boolean;
}

const VAZIA: EstadoDaCena = { veu: false, tapete: false, placas: null, letreiro: null, caixas: {}, cartoes: -1, cartoesSaindo: false };

const CORES_DO_CONFETE = ['#E4393D', '#F2C04E', '#1F8F5A', '#2B66C0', '#FFFFFF', '#F36A5E'];
const SURPRESAS: Record<Surpresa, { sinal: string; cor: string }> = {
  estrela: { sinal: '★', cor: '#F2C04E' },
  coracao: { sinal: '♥', cor: '#E4393D' },
  nota: { sinal: '♪', cor: '#2B66C0' },
  floco: { sinal: '❄', cor: '#9FD3FF' },
  presente: { sinal: '🎁', cor: '#1F8F5A' },
  poeira: { sinal: '💨', cor: '#9AA3AE' },
  moeda: { sinal: '●', cor: '#F2C04E' },
  confete: { sinal: '🎉', cor: '#E4393D' },
};

/** A largura de um cartão mais o vão, e a altura de uma fileira deles. */
const PASSO_DO_CARTAO = 122;
const FILEIRA_DE_CARTOES = 150;
/** A linha dos pés, em px acima do pé da janela (`.qn { top }`, no CSS). */
const PES = 24;
/** Meia largura do tablado (`.qn-tablado`, no CSS): as bolinhas ficam logo ao lado. */
const MEIO_TABLADO = 210;

/** O palco pequeno: quanto ele encolhe, e quanto os cartões crescem de volta (`[data-mini]`, no CSS). */
const MINI = 0.58;
const CARTOES_NO_MINI = 1.3;
const CHAVE_DO_MINI = 'natal:quebra-nozes:mini';
function lerMini(): boolean {
  try { return localStorage.getItem(CHAVE_DO_MINI) === '1'; } catch { return false; }
}

function inicial(nome: string) { return nome.trim().charAt(0).toUpperCase(); }

const Cartao = memo(function Cartao({ d, revelado, saindo }: { d: Destaque; revelado: boolean; saindo: boolean }) {
  const [quebrada, setQuebrada] = useState(false);
  return (
    <div className={cn('qn-cartao', d.meu && 'meu', saindo ? 'sai' : revelado && 'revelado')}>
      <div className="qn-cartao-setor">{d.setor}</div>
      <div className="qn-cartao-foto">
        {d.foto && !quebrada ? <img src={d.foto} alt="" draggable={false} onError={() => setQuebrada(true)} /> : inicial(d.nome)}
      </div>
      <div className="qn-cartao-nome">{d.nome}</div>
      <div className="qn-cartao-feito">{d.feito ?? '★ destaque'}</div>
    </div>
  );
});

export interface PropsDoPalco {
  cidade: Cidade;
  elenco: { a: Artista; b: Artista };
  espetaculo: EspetaculoMontado;
  destaques?: readonly Destaque[];
  /** O que a faixa dos destaques diz («Destaques de ontem», «Destaques de sexta»). */
  titulo?: string;
  /** O super_admin deixou os sons ligados para todos (a bolinha do som só aparece assim). */
  comSom?: boolean;
  /** Segundos já passados quando a pessoa chegou; negativo = quanto falta para começar (o palco nasce antes, escondido). */
  desde?: number;
  /** O espetáculo veio em quadrinhos (modo leve): nada se repete nem desliza. */
  quadrinho?: boolean;
  /** A chamada dos destaques: a musiquinha toca enquanto a faixa está em cena. */
  comMusica?: boolean;
  aoTerminar?: () => void;
}

/**
 * Monta, toca uma vez e avisa. Para outro espetáculo, quem usa troca a `key`
 * (o palco nasce de novo, com os bonecos zerados).
 */
/** Entre um tempo e outro do nascimento do palco (ms): o bastante para a página respirar no meio. */
const ENTRE_TEMPOS_MS = 70;

/** A voz de cada um na vozinha (Hz): o diretor mais grave, a head mais aguda. */
const VOZ_DO_DIRETOR = 470;
const VOZ_DO_HEAD = 560;
const VOZ_DA_HEAD = 700;
/** A musiquinha entra depois da fanfarra da faixa. */
const MUSICA_DEPOIS_DA_FAIXA_MS = 1_400;

export function PalcoDosQuebraNozes({ cidade, elenco, espetaculo, destaques = [], titulo = 'Destaques de ontem', comSom = true, desde = 0, quadrinho = false, comMusica = false, aoTerminar }: PropsDoPalco) {
  const sons = useSonsDosQuebraNozes();
  // O palco nasce em quatro tempos: 0 o chão, 1 um boneco, 2 o outro, 3 os cartões — e aí toca.
  const [tempo, setTempo] = useState<0 | 1 | 2 | 3>(0);
  const nascido = useRef(performance.now());
  useEffect(() => {
    const relogios = [
      window.setTimeout(() => setTempo(1), ENTRE_TEMPOS_MS),
      window.setTimeout(() => setTempo(2), ENTRE_TEMPOS_MS * 2),
      window.setTimeout(() => { setTempo(3); prepararSonsDosQuebraNozes(); }, ENTRE_TEMPOS_MS * 3),
    ];
    return () => { relogios.forEach(t => window.clearTimeout(t)); descansarSonsDosQuebraNozes(); };
  }, []);
  const [mini, setMini] = useState(lerMini);
  const raiz = useRef<HTMLDivElement>(null);
  const controles = useRef<HTMLDivElement>(null);
  const voa = useRef<HTMLDivElement>(null);
  const bonecos = useRef<Record<Quem, HTMLDivElement | null>>({ a: null, b: null });
  const medidas = useRef<Medidas & { escala: number }>({ coxia: 800, escala: 1 });
  const [cena, setCena] = useState<EstadoDaCena>(VAZIA);
  const terminar = useRef(aoTerminar);
  terminar.current = aoTerminar;

  // A escala e a coxia desta tela.
  const medir = useCallback(() => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    // O palco inteiro (com a faixa dos destaques) tem uns 530 de altura: cabe em 83% da janela.
    const escala = Math.max(0.7, Math.min(1.35, w / 1150, h / 640)) * (mini ? MINI : 1);
    medidas.current = { escala, coxia: w / 2 / escala + 90 };
    const el = raiz.current;
    if (!el) return;
    // Os cartões: no palco pequeno eles crescem de volta, e em qualquer um têm de caber na janela.
    const k = mini ? CARTOES_NO_MINI : 1;
    const largura = (w / escala - 48) / k;
    const altura = (h / escala - (mini ? 350 : 308)) / k - 90;
    const colunas = Math.max(1, destaques.length <= 7 ? destaques.length : Math.ceil(destaques.length / 2));
    const fileiras = destaques.length <= 7 ? 1 : 2;
    el.style.setProperty('--qn-escala', String(escala));
    // O chão vai só até a beira da janela (era uma faixa de 6000 px).
    el.style.setProperty('--qn-meia', `${Math.ceil(w / 2 / escala) + 2}px`);
    el.style.setProperty('--qn-largura', `${Math.max(PASSO_DO_CARTAO, Math.min(largura, colunas * PASSO_DO_CARTAO))}px`);
    el.style.setProperty('--qn-cartoes', String(Math.max(0.4, Math.min(1, largura / (colunas * PASSO_DO_CARTAO), altura / (fileiras * FILEIRA_DE_CARTOES)))));
    controles.current?.style.setProperty('--qn-x', `${Math.round(MEIO_TABLADO * escala + 12)}px`);
    // A coxia mudou de lugar: quem está nela (ou indo para ela) acompanha.
    for (const q of ['a', 'b'] as const) { const b = bonecos.current[q]; if (b) reposicionar(b, medidas.current); }
  }, [destaques.length, mini]);

  useLayoutEffect(() => {
    medir();
    window.addEventListener('resize', medir);
    return () => window.removeEventListener('resize', medir);
  }, [medir]);

  // ── O que voa ─────────────────────────────────────────────────────────────
  const soltar = useCallback((classe: string, estilo: Partial<CSSStyleDeclaration>, quadros: Keyframe[], opcoes: KeyframeAnimationOptions, texto?: string) => {
    const caixa = voa.current;
    if (!caixa) return;
    const peca = document.createElement('i');
    peca.className = classe;
    Object.assign(peca.style, estilo);
    if (texto) peca.textContent = texto;
    caixa.appendChild(peca);
    const anim = peca.animate(quadros, { fill: 'both', ...opcoes });
    anim.onfinish = () => peca.remove();
    anim.oncancel = () => peca.remove();
  }, []);

  /** Dois canhões de confete, um de cada lado, atirando para o meio e para cima. */
  const confete = useCallback((semente: number) => {
    const s = criarSorteio(sementeDe('confete', semente));
    for (let i = 0; i < 54; i++) {
      const lado = i % 2 === 0 ? -1 : 1;
      const x0 = lado * 330;
      const alcance = s.entre(60, 560);
      const topo = -s.entre(300, 600);
      const giro = s.entre(-900, 900);
      soltar('papel', { background: s.escolher(CORES_DO_CONFETE) }, [
        { transform: `translate(${x0}px, -40px) rotate(0deg)`, opacity: 1, easing: 'cubic-bezier(.1, .7, .3, 1)' },
        { transform: `translate(${x0 - lado * alcance * 0.62}px, ${topo}px) rotate(${giro * 0.5}deg)`, opacity: 1, offset: 0.36, easing: 'cubic-bezier(.5, 0, .8, .6)' },
        { transform: `translate(${x0 - lado * alcance}px, ${s.entre(-60, 10)}px) rotate(${giro}deg)`, opacity: 0 },
      ], { duration: s.entre(1900, 3000), delay: s.entre(0, 320) });
    }
  }, [soltar]);

  /** As duas metades da casca saem voando; a surpresa sobe e some. */
  const noz = useCallback((x: number, surpresa: Surpresa) => {
    const y = -(PES + 92);
    for (const lado of [-1, 1]) {
      soltar('casca', {}, [
        { transform: `translate(${x}px, ${y}px) rotate(0deg)`, opacity: 1, easing: 'cubic-bezier(.2, .7, .4, 1)' },
        { transform: `translate(${x + lado * 34}px, ${y - 34}px) rotate(${lado * 160}deg)`, opacity: 1, offset: 0.4, easing: 'cubic-bezier(.5, 0, .8, .5)' },
        { transform: `translate(${x + lado * 62}px, ${y + 92}px) rotate(${lado * 420}deg)`, opacity: 0 },
      ], { duration: 950 });
    }
    const { sinal, cor } = SURPRESAS[surpresa];
    soltar('surpresa', { color: cor }, [
      { transform: `translate(${x}px, ${y}px) scale(.2)`, opacity: 0 },
      { transform: `translate(${x}px, ${y - 84}px) scale(1.5)`, opacity: 1, offset: 0.26, easing: 'ease-out' },
      { transform: `translate(${x}px, ${y - 96}px) scale(1.2)`, opacity: 1, offset: 0.74 },
      { transform: `translate(${x}px, ${y - 128}px) scale(.9)`, opacity: 0 },
    ], { duration: 2100, delay: 120 }, sinal);
  }, [soltar]);

  // ── Toca ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (tempo < 3) return;
    let vivo = true;
    let entradaDaMusica = 0;
    // Quanto cada balão fica aberto (até o mesmo boneco fechar o balão): a vozinha dura o tempo da boca mexendo.
    const abertoPor = new Map<string, number>();
    espetaculo.deixas.forEach((d, i) => {
      if (!('balao' in d) || !d.balao.texto) return;
      const fecha = espetaculo.deixas.slice(i + 1).find(e => 'balao' in e && e.balao.q === d.balao.q);
      const chave = d.balao.q + '|' + d.balao.texto;
      if (fecha && !abertoPor.has(chave)) abertoPor.set(chave, fecha.t - d.t);
    });
    const voz = (q: Quem) => (q === 'a' ? VOZ_DO_DIRETOR : elenco.b.artigo === 'a' ? VOZ_DA_HEAD : VOZ_DO_HEAD);
    // De que lado cada um está (o da esquerda soa à esquerda).
    const ladoDe = (q: Quem) => ((q === 'a') !== !!espetaculo.troca ? -90 : 90);
    void tocar(espetaculo.deixas, {
      boneco: q => bonecos.current[q],
      medidas: () => medidas.current,
      balao: (q, texto, passado) => {
        const c = bonecos.current[q]?.querySelector<HTMLElement>('.qn-balao-c');
        if (!c) return;
        if (texto === null) { c.classList.remove('aberto'); return; }
        c.textContent = texto;
        c.classList.add('aberto');
        // De vez em quando, o tagarelar de bichinho (`sons.ts`).
        if (!passado) tocarVozinha(texto, voz(q), ladoDe(q), abertoPor.get(q + '|' + texto) ?? 3);
        // O pulinho do balão vai direto para a placa (recomeçar por classe pedia um leiaute forçado a cada fala).
        c.animate?.([{ transform: 'scale(.3)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }],
          { duration: quadrinho ? 220 : 320, easing: 'cubic-bezier(.3, 1.6, .5, 1)' });
      },
      cena: (c: Cena, passado) => {
        if ('som' in c) { if (!passado) tocarSom(c.som, { dur: c.dur, x: c.x }); return; }
        if ('confete' in c) { if (!passado) { confete(c.confete); tocarSom('viva'); } return; }
        if ('noz' in c) { if (!passado) { noz(c.noz.x, c.noz.surpresa); tocarSom('noz'); } return; }
        if ('cartao' in c && !passado) tocarSom('cartao', { n: c.cartao });
        // A musiquinha: entra com a faixa dos destaques e sai com os cartões.
        if (comMusica && 'letreiro' in c) {
          window.clearTimeout(entradaDaMusica);
          if (c.letreiro) entradaDaMusica = window.setTimeout(() => { if (vivo) tocarMusicaDosDestaques(); }, passado ? 0 : MUSICA_DEPOIS_DA_FAIXA_MS);
          else pararMusicaDosDestaques();
        }
        if ('cartoes' in c) pararMusicaDosDestaques();
        setCena(antes => {
          if ('veu' in c) return { ...antes, veu: c.veu };
          if ('tapete' in c) return { ...antes, tapete: c.tapete };
          if ('placas' in c) return { ...antes, placas: c.placas };
          if ('letreiro' in c) return { ...antes, letreiro: c.letreiro };
          if ('caixa' in c) return { ...antes, caixas: { ...antes.caixas, [c.caixa.q]: { x: c.caixa.x, estado: c.caixa.estado } } };
          if ('cartao' in c) return { ...antes, cartoes: Math.max(antes.cartoes, c.cartao) };
          return { ...antes, cartoesSaindo: true };
        });
      },
      // O tempo que o palco levou para nascer conta: quem chegou no meio continua no ponto certo.
    }, () => vivo, desde + (performance.now() - nascido.current) / 1000).then(() => { if (vivo) terminar.current?.(); });
    return () => { vivo = false; window.clearTimeout(entradaDaMusica); pararMusicaDosDestaques(); };
    // Um palco, um espetáculo: quem troca de espetáculo troca a `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tempo]);

  /** O clique é só de quem clicou: um agrado do boneco, que não mexe no espetáculo. */
  const agradar = useCallback((q: Quem) => {
    const el = bonecos.current[q];
    if (!el) return;
    // Em quadrinhos, o agrado é o pulinho do quadro.
    if (quadrinho) { aplicarNoBoneco(el, { reacao: 'quadro' }, medidas.current); return; }
    const reacoes: Reacao[] = ['pulinho', 'giro', 'estufa', 'susto'];
    const sinais = ['♥', '★', '!', '♪'];
    const i = Math.floor(Math.random() * reacoes.length);
    aplicarNoBoneco(el, { reacao: reacoes[i], emote: sinais[i] }, medidas.current);
  }, [quadrinho]);

  // Sempre as mesmas funções: o boneco é `memo`, e com função nova a cada render o React
  // redesenhava os dois (700 nós) a cada plaquinha, faixa ou cartão que mudava no cenário.
  const agradarA = useCallback(() => agradar('a'), [agradar]);
  const agradarB = useCallback(() => agradar('b'), [agradar]);
  const guardarA = useCallback((el: HTMLDivElement | null) => { bonecos.current.a = el; }, []);
  const guardarB = useCallback((el: HTMLDivElement | null) => { bonecos.current.b = el; }, []);

  const encolher = useCallback(() => {
    const novo = !mini;
    try { localStorage.setItem(CHAVE_DO_MINI, novo ? '1' : '0'); } catch { /* modo privado */ }
    setMini(novo);
  }, [mini]);

  const sozinho = espetaculo.formacao !== 'dupla';
  // A faixa e os cartões dos destaques. No palco pequeno eles saem do meio e vão,
  // pequenos, para o canto da tela: quem encolheu está trabalhando (Cleber, 13/11/2026).
  const quadro = tempo >= 3 && destaques.length > 0 && (
    <div className="qn-quadro">
      <div className="qn-quadro-c">
        <div className={cn('qn-letreiro-c', cena.letreiro && !cena.cartoesSaindo && 'desce')}>
          <small>{cena.letreiro ?? ' '}</small>{titulo}
        </div>
        <div className="qn-cartoes-c">
          {destaques.map((d, i) => <Cartao key={`${d.setor}:${d.nome}`} d={d} revelado={i <= cena.cartoes} saindo={cena.cartoesSaindo} />)}
        </div>
      </div>
    </div>
  );
  const rotuloDoSom = sons ? 'Calar os quebra-nozes' : 'Ligar o som dos quebra-nozes';
  const rotuloDoTamanho = mini ? 'Voltar os quebra-nozes ao tamanho normal' : 'Diminuir os quebra-nozes';
  return (
    <>
      <div ref={raiz} className="qn-palco" data-cidade={cidade} data-troca={espetaculo.troca ? '' : undefined} data-solo={sozinho ? '' : undefined} data-mini={mini ? '' : undefined}
        // Em quadrinhos quem manda no que anima é o CSS do palco, não a regra geral do modo leve (`index.css`).
        data-quadrinho={quadrinho ? '' : undefined} data-anima-sempre={quadrinho ? '' : undefined}
        // Fora da pausa do «ninguém olhando» (`lib/atencao.ts`): o espetáculo segue com a janela de lado (Cleber, 13/11/2026).
        data-nao-pausa="">
        <DefsDoQuebraNozes />
        <div className={cn('qn-chao', cena.veu && 'aceso')} />
        <div className={cn('qn-tablado', cena.veu && 'aceso')}><i className="qn-tampo" /><i className="qn-frente" /></div>
        <div className={cn('qn-tapete', cena.tapete && 'aberto')} />
        {(['a', 'b'] as const).map(q => (
          <div key={q} className={cn('qn-placa', cena.placas?.[q] !== undefined && 'sobe')} data-farda={elenco[q].farda} style={{ left: cena.placas?.[q] ?? (q === 'a' ? -70 : 70) }}>
            {elenco[q].nome}<small>{elenco[q].cargo}</small>
          </div>
        ))}
        {tempo >= 1 && <QuebraNozes ref={guardarA} artista={elenco.a} semente={3} aoClicar={agradarA} />}
        {tempo >= 2 && <QuebraNozes ref={guardarB} artista={elenco.b} semente={8} aoClicar={agradarB} />}
        {(['a', 'b'] as const).map(q => {
          const caixa = cena.caixas[q];
          return caixa && (
            <div key={q} className="qn-caixa" data-quem={q} data-estado={caixa.estado} style={{ left: caixa.x }}>
              <div className="qn-caixa-y"><div className="qn-caixa-corpo" /><div className="qn-caixa-tampa" /></div>
            </div>
          );
        })}
        {!mini && quadro}
        <div ref={voa} className="qn-voa" />
      </div>
      {mini && quadro && (
        <div className="qn-canto" data-cidade={cidade} data-quadrinho={quadrinho ? '' : undefined} data-anima-sempre={quadrinho ? '' : undefined} data-nao-pausa="">
          {quadro}
        </div>
      )}
      {/* Fora do palco, para não encolher com ele: tem de continuar dando para clicar. */}
      <div ref={controles} className={cn('qn-controles', cena.veu && 'aceso')} data-anima-sempre={quadrinho ? '' : undefined} data-nao-pausa="">
        {comSom && (
          <button type="button" className="qn-bola som" data-mudo={sons ? undefined : ''} onClick={() => ligarSonsDosQuebraNozes(!sons)} aria-label={rotuloDoSom} title={rotuloDoSom}>
            {sons ? <Volume2 size={14} strokeWidth={2.4} aria-hidden /> : <VolumeX size={14} strokeWidth={2.4} aria-hidden />}
          </button>
        )}
        <button type="button" className="qn-bola tamanho" onClick={encolher} aria-label={rotuloDoTamanho} aria-pressed={mini} title={rotuloDoTamanho}>
          {mini ? <ChevronUp size={17} strokeWidth={3} aria-hidden /> : <ChevronDown size={17} strokeWidth={3} aria-hidden />}
        </button>
      </div>
    </>
  );
}

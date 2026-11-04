// A abertura do Natal (28/10/2026): o vídeo que toca quando a pessoa abre o
// presente no alto do sistema.
//
// Não pode parecer vídeo. Antes de ele começar, o app põe todo mundo no tema
// claro padrão (o do vídeo); aí o primeiro quadro é a luz do presente, parada,
// e ela se desfaz mostrando o sistema — a casca e o Dashboard do app, com o
// CSS dele, sem filtro nenhum por cima. É o sistema que se anima.
//
// O que é de outubro aparece como era: o desenho, a física, a animação e o
// TAMANHO do sistema. Por isso tudo do Halloween é desenhado nas coordenadas
// do app (1600×874), e só o que é do vídeo (as mensagens, o placar) nas da tela.
//
// Só música e efeitos, sem narração. Dados reais só da gincana e da pesquisa
// (`dados.ts`).

import { useMemo, useRef } from 'react';
import { AbsoluteFill, Audio, interpolate, Sequence, staticFile, useCurrentFrame } from 'remotion';
import { Casca } from '../app/Casca';
import { OPERADORA } from '../app/dados';
import { PessoaContext, type Pessoa } from '../app/pessoa';
import { APP_L } from '../app/layout';
import { ALTURA_NATAL } from './Detalhes';
import { Dashboard } from '../app/paginas/Dashboard';
import { tempoApp } from '../app/roteiro';
import { type PontoCursor } from '../componentes/Cursor';
import { Seta } from './Seta';
import { entre, mola, ms, s, SUAVE, SUAVE_IDA_VOLTA } from '../movimento';
import { Recados, type Recado } from './Recado';
import { Conversa, ALVO_BORA, roteiroDaConversa } from './Conversa';
import { Ceu } from './Ceu';
import { AboboraNaTela, Estouro, FaixaAbobora, type CenaAbobora } from './Abobora';
import { ALTURA_FAIXA_ZUMBI, Cacadas, FaixaDaCaca, Mira, SonsDaCaca, type Cacada } from './Caca';
import { ReiDoPop, SonsDoChefao, roteiroDoChefao } from './Chefao';
import { Montagem, SonsDaMontagem, roteiroDaMontagem } from './Montagem';
import { BruxaDoPantano, BruxasNoConteudo, PretoDaPocao, SonsDasBruxas, roteiroDasBruxas } from './Bruxas';
import { BolhaDoChat, ChapeuNaFoto, Detalhes, MarcaDoMenu, mouseDosDetalhes, roteiroDosDetalhes } from './Detalhes';
import { ACHOU_ABOBORA, MATADORES } from './dados';

/** A pessoa do vídeo, sem nome nem iniciais: só o cargo e o setor. */
const SEM_NOME: Pessoa = { ...OPERADORA, nome: '', primeiroNome: '', iniciais: '' };

const L = 1920;
const A = 936;
/** O app tem 1600×900 neste vídeo: 16:9 exato, ocupa a tela inteira sem cortar nada. */
const ESC = Math.max(L / APP_L, A / ALTURA_NATAL);
/** A janela do sistema fica um pouco menor que a tela, sobre a noite. */
const JANELA = 0.92;

// ── O roteiro ───────────────────────────────────────────────────────────────

// A ordem (Cleber, 28/10): a conversa com a pessoa (`Conversa.tsx`, fora do
// sistema); o sistema entra voando; o TEMA chegando, uma coisa de cada vez (o
// nome, o chat, a teia e a aranha, os chapéus, os morcegos, a aranha jogada e
// o cartaz); e aí as caças — a abóbora, depois os zumbis.
const CONVERSA = roteiroDaConversa();
/** O sistema entra voando como uma janela, depois do «Bora!». */
const SISTEMA_ENTRA = CONVERSA.sai + ms(300);
const TEMA = SISTEMA_ENTRA + s(1.4);
/** O tema de Halloween chegando no sistema (`Detalhes.tsx`). */
const DET = roteiroDosDetalhes(TEMA);
const CACA_ABOBORA = DET.fim;
const ABOBORA: CenaAbobora = { x: 1000, y: 570, chega: CACA_ABOBORA + s(0.8), mouseEmCima: CACA_ABOBORA + s(2.55), clique: CACA_ABOBORA + s(3.2) };
const FAIXA_ABOBORA = { abre: ABOBORA.clique + ms(250), fecha: ABOBORA.clique + s(3.6) };
const C = FAIXA_ABOBORA.fecha + s(0.8);

export const T = {
  luzParada: ms(350),
  luzSome: s(1.4),
  tema: TEMA,
  cacaAbobora: CACA_ABOBORA,
  zumbiTexto: C - ms(500),
  caca: C,
};



/** Os zumbis da cena, nas coordenadas do app (2 px por pixel da arte, como no sistema). */
const CACADAS: Cacada[] = [
  {
    zumbi: 0, x: 820, y: 560, lado: -1, sobe: C, semente: 7,
    passeio: [{ dur: 0.5, vel: 0 }, { dur: 1.6, vel: -4.2 }, { dur: 0.6, vel: 0 }],
    erra: C + s(2.3), tiro: C + s(2.95), jeito: 'cabeca', recordes: ['hsRapido'], ...MATADORES[0],
  },
  {
    zumbi: 7, x: 520, y: 580, lado: 1, sobe: C + s(2.4), semente: 21,
    passeio: [{ dur: 0.4, vel: 0 }, { dur: 1.2, vel: 4.2 }, { dur: 0.5, vel: 0 }, { dur: 2, vel: -4.2 }],
    tiro: C + s(5.1), jeito: 'corpo', recordes: ['rapido'], ...MATADORES[1],
  },
  {
    zumbi: 3, x: 1080, y: 580, lado: -1, sobe: C + s(4.4), semente: 33,
    passeio: [{ dur: 0.6, vel: 0 }, { dur: 2, vel: -4.2 }],
    tiro: C + s(7.0), jeito: 'cabeca', ...MATADORES[2],
  },
];
/** O Rei do Pop zumbi, logo depois do último zumbi (`Chefao.tsx`). */
const CHEFE = roteiroDoChefao(CACADAS[2].tiro + s(1.8));
/** As bruxas de vassoura e a Bruxa do Pântano, até a poção da escuridão (`Bruxas.tsx`). */
const BRUXAS = roteiroDasBruxas(CHEFE.sai + ms(400));
/** Do preto da poção, a montagem num cenário só do vídeo (`Montagem.tsx`). */
const MONTAGEM = roteiroDaMontagem(BRUXAS.fim);
const FIM = MONTAGEM.fim;
export const TOTAL_NATAL = FIM;
const FAIXA_ZUMBI = { abre: CACADAS[0].tiro + ms(250), fecha: CHEFE.entra - ms(200) };

/** O mouse de quem achou a abóbora, nas coordenadas do app. */
const MOUSE: PontoCursor[] = [
  { f: ABOBORA.chega + ms(700), x: 1300, y: 640 },
  { f: ABOBORA.mouseEmCima + ms(50), x: ABOBORA.x + 22, y: ABOBORA.y + 24, viagemMs: 1000 },
  { f: ABOBORA.clique + ms(600), x: ABOBORA.x + 24, y: ABOBORA.y + 25 },
  { f: ABOBORA.clique + s(1.8), x: 1500, y: 750, viagemMs: 1100 },
];

function congelar<V>(v: V): V {
  if (typeof v === 'number') return 1e9 as V;
  if (Array.isArray(v)) return v.map(congelar) as V;
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, congelar(x)])) as V;
  return v;
}

// ── O sistema, com as faixas no fluxo ───────────────────────────────────────

/** Quanto a faixa aberta empurra o conteúdo (a do app entra no fluxo, logo abaixo da barra). */
function alturaDaFaixa(f: number, abre: number, fecha: number, altura: number) {
  return altura * entre(f, abre, abre + ms(220), 0, 1, SUAVE) * (1 - entre(f, fecha, fecha + ms(220), 0, 1, SUAVE));
}

const alturas = (f: number) => {
  const abobora = alturaDaFaixa(f, FAIXA_ABOBORA.abre, FAIXA_ABOBORA.fecha, 36);
  const zumbi = alturaDaFaixa(f, FAIXA_ZUMBI.abre, FAIXA_ZUMBI.fecha, ALTURA_FAIXA_ZUMBI);
  return { abobora, zumbi, total: abobora + zumbi };
};

const Conteudo: React.FC = () => {
  const f = useCurrentFrame();
  const t = useMemo(() => congelar(tempoApp()), []);
  const { abobora: hAbobora, zumbi: hZumbi, total: h } = alturas(f);
  return (
    <>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: h, overflow: 'hidden', zIndex: 5 }}>
        {hAbobora > 0 && <FaixaAbobora abre={FAIXA_ABOBORA.abre} {...ACHOU_ABOBORA} />}
        {hZumbi > 0 && <FaixaDaCaca cacadas={CACADAS} abre={FAIXA_ZUMBI.abre} />}
      </div>
      {/* Ocupa o `main` inteiro: o Dashboard é `absolute inset-0`, e o transform vira a referência dele. */}
      <div style={{ position: 'absolute', inset: 0, transform: `translateY(${h}px)` }}>
        <Dashboard t={t} entra={-1e9} visita={2} />
      </div>
    </>
  );
};

const MOUSE_DETALHES = mouseDosDetalhes(DET);

/**
 * O app inteiro, ocupando a tela. Tudo de outubro é desenhado aqui dentro.
 * A abóbora e os zumbis moravam na camada do conteúdo: quando a faixa abre e
 * empurra a página, eles descem junto.
 */
const Sistema: React.FC = () => {
  const f = useCurrentFrame();
  const h = alturas(f).total;
  // A página que as poções enfeitiçam (o `#root` do app): a casca, sem os palcos.
  const app = useRef<HTMLDivElement>(null);
  if (f < SISTEMA_ENTRA) return null;
  // O sistema não finge ser a tela da pessoa: é uma janela sobre a noite, que entra
  // voando (deitada e pequena, endireitando) e fica um pouco menor que a tela.
  const e = mola(f, SISTEMA_ENTRA, { mass: 1, stiffness: 80, damping: 15, overshootClamping: false });
  const k = ESC * JANELA * (0.6 + 0.4 * e);
  return (
    <div style={{
      position: 'absolute', left: 0, top: 0, width: APP_L, height: ALTURA_NATAL, overflow: 'hidden', borderRadius: 16,
      transformOrigin: '0 0', opacity: Math.min(1, e * 1.5), boxShadow: '0 40px 110px rgba(0,0,0,.65), 0 0 0 1px rgba(255,255,255,.08)',
      transform: `translate(${L / 2}px, ${A / 2 + (1 - Math.min(1, e)) * 240}px) perspective(1800px) rotateX(${(1 - Math.min(1, e)) * 24}deg) scale(${k}) translate(${-APP_L / 2}px, ${-ALTURA_NATAL / 2}px)`,
    }}>
      <div ref={app} style={{ position: 'absolute', inset: 0 }}>
        <Casca aparece={-1e9} ativo="dashboard" anterior="dashboard" trocaEm={0} cliques={[]} desempenhoAberto={false} altura={ALTURA_NATAL}>
          <Conteudo />
        </Casca>
      </div>
      <div style={{ position: 'absolute', inset: 0, transform: `translateY(${h}px)` }}>
        <AboboraNaTela c={ABOBORA} />
        <Estouro x={ABOBORA.x + 20} y={ABOBORA.y + 20} em={ABOBORA.clique} />
        {/* O resto de sangue dos zumbis sai quando as bruxas chegam (no sistema, a rodada nova limpava). */}
        {f < BRUXAS.inicio && <div style={{ position: 'absolute', inset: 0, opacity: 1 - entre(f, BRUXAS.inicio - ms(700), BRUXAS.inicio, 0, 1) }}><Cacadas cacadas={CACADAS} /></div>}
        <Mira cacadas={CACADAS} entra={CACADAS[0].sobe + s(1.4)} sai={CACADAS[2].tiro + ms(500)} />
      </div>
      <ReiDoPop r={CHEFE} />
      <BruxasNoConteudo r={BRUXAS} />
      <BruxaDoPantano r={BRUXAS} app={() => app.current} />
      {/* No fim (o mural subindo) o sistema volta limpo, sem o Halloween: dali entra o app de verdade. */}
      {f < MONTAGEM.inicio && <>
      <Detalhes r={DET} />
      <MarcaDoMenu r={DET} marca="BookPlay" />
      {/* As duas fotos da casca (32 px): a do cabeçalho e a do cartão do menu. */}
      <ChapeuNaFoto em={DET.chapeus} x={1361} y={12} tamanho={32} chave="Juliana Prado" />
      <ChapeuNaFoto em={DET.chapeus + ms(260)} x={20} y={ALTURA_NATAL - 52} tamanho={32} chave="Juliana Prado" />
      <BolhaDoChat r={DET} />
      </>}
      <Seta pontos={MOUSE} cliques={[ABOBORA.clique]} />
      <Seta pontos={MOUSE_DETALHES} cliques={[DET.cliqueMorcego]} segura={[[DET.pegaAranha, DET.soltaAranha]]} />
    </div>
  );
};

/** A noite atrás de tudo; no começo, com o brilho dourado da luz do presente se desfazendo. */
const CeuDoComeco: React.FC = () => {
  const f = useCurrentFrame();
  return <Ceu quente={1 - entre(f, T.luzSome, T.luzSome + s(2.5), 0, 1)} />;
};
/** O mouse da conversa: escolhe «Bora!». */
const MOUSE_CONVERSA: PontoCursor[] = [
  { f: CONVERSA.chips + ms(300), x: 1520, y: 880 },
  { f: CONVERSA.clique - ms(80), x: ALVO_BORA.x, y: ALVO_BORA.y, viagemMs: 900 },
  { f: CONVERSA.clique + ms(500), x: ALVO_BORA.x + 140, y: ALVO_BORA.y + 140, viagemMs: 500 },
];

// ── A luz do presente ───────────────────────────────────────────────────────

/** Parada no começo (é a mesma luz do app); depois só se desfaz — sem zoom. */
const Luz: React.FC = () => {
  const f = useCurrentFrame();
  const p = entre(f, T.luzParada, T.luzSome, 0, 1, SUAVE_IDA_VOLTA);
  if (p >= 1) return null;
  return <AbsoluteFill style={{ background: 'radial-gradient(circle at 50% 14%, #fffdf2 0%, #fff1c2 26%, #f8d474 58%, #eeb23c 100%)', opacity: 1 - p }} />;
};

// ── Som ─────────────────────────────────────────────────────────────────────

const Som: React.FC = () => (
  <>
    {/* «Halloween», o tema de John Carpenter do player do sistema (2min25s),
        entra quando o tema chega, baixinho, e sobe devagar. */}
    {/* Acaba no apagão da poção: na montagem entra a música animada (`Montagem.tsx`). */}
    <Sequence from={T.tema} durationInFrames={BRUXAS.preto - T.tema}>
      <Audio src={staticFile('natal/halloween.mp3')} volume={(f) => interpolate(f + T.tema, [T.tema, T.tema + s(2.5), C, C + s(0.6), CHEFE.entra - ms(300), CHEFE.entra + ms(300), CHEFE.sai, CHEFE.sai + s(0.6), BRUXAS.chefona - ms(300), BRUXAS.chefona + ms(600), BRUXAS.preto], [0.04, 0.4, 0.4, 0.3, 0.3, 0.1, 0.1, 0.26, 0.26, 0.05, 0], { extrapolateRight: 'clamp' })} />
    </Sequence>
    {/* A conversa: um pop a cada mensagem, o clique no «Bora!» e o sistema entrando. */}
    {CONVERSA.falas.map(x => <Sequence key={x.fala} from={x.fala} durationInFrames={s(1)}><Audio src={staticFile('sons/pop.wav')} volume={0.18} /></Sequence>)}
    <Sequence from={CONVERSA.clique} durationInFrames={s(0.6)}><Audio src={staticFile('sons/clique.wav')} volume={0.4} /></Sequence>
    <Sequence from={CONVERSA.resposta} durationInFrames={s(1)}><Audio src={staticFile('sons/pop.wav')} volume={0.2} /></Sequence>
    <Sequence from={SISTEMA_ENTRA} durationInFrames={s(1.5)}><Audio src={staticFile('sons/whoosh.wav')} volume={0.3} /></Sequence>
    {/* O tema chegando */}
    <Sequence from={DET.marca} durationInFrames={s(1)}><Audio src={staticFile('sons/whoosh.wav')} volume={0.22} /></Sequence>
    <Sequence from={DET.viraAbobora} durationInFrames={s(0.6)}><Audio src={staticFile('natal/caca/pop.wav')} volume={0.32} /></Sequence>
    <Sequence from={DET.mensagem} durationInFrames={s(1.5)}><Audio src={staticFile('sons/chat-notificacao.mp3')} volume={0.4} /></Sequence>
    <Sequence from={DET.chapeus} durationInFrames={s(0.6)}><Audio src={staticFile('natal/caca/pop.wav')} volume={0.22} /></Sequence>
    <Sequence from={DET.chapeus + ms(260)} durationInFrames={s(0.6)}><Audio src={staticFile('natal/caca/pop.wav')} volume={0.2} /></Sequence>
    <Sequence from={DET.cliqueMorcego} durationInFrames={s(0.6)}><Audio src={staticFile('sons/clique.wav')} volume={0.35} /></Sequence>
    <Sequence from={DET.cliqueMorcego + ms(30)} durationInFrames={s(0.6)}><Audio src={staticFile('natal/caca/pop.wav')} volume={0.28} /></Sequence>
    <Sequence from={DET.pegaAranha} durationInFrames={s(0.6)}><Audio src={staticFile('sons/clique.wav')} volume={0.3} /></Sequence>
    <Sequence from={DET.cartaz} durationInFrames={s(1.5)}><Audio src={staticFile('sons/whoosh.wav')} volume={0.3} /></Sequence>
    {/* As caças */}
    <Sequence from={ABOBORA.clique} durationInFrames={s(0.6)}><Audio src={staticFile('sons/clique.wav')} volume={0.4} /></Sequence>
    <Sequence from={ABOBORA.clique + ms(40)} durationInFrames={s(1)}><Audio src={staticFile('natal/caca/pop.wav')} volume={0.3} /></Sequence>
    {CACADAS.map(c => <SonsDaCaca key={c.zumbi} c={c} />)}
    <SonsDoChefao r={CHEFE} />
    <SonsDasBruxas r={BRUXAS} />
    <SonsDaMontagem r={MONTAGEM} />
  </>
);

/** A poção da escuridão vira preto (`Bruxas.tsx`). */
const Preto: React.FC = () => <PretoDaPocao r={BRUXAS} f={useCurrentFrame()} />;

// ── O vídeo ─────────────────────────────────────────────────────────────────

export const VideoNatal: React.FC = () => {
  const recados: Recado[] = [
    // O tema chegando, uma coisa de cada vez
    { de: T.tema, ate: DET.viraAbobora - ms(150), olho: 'Em outubro', texto: 'O Gestão entrou no clima de Halloween.', icone: '🎃' },
    { de: DET.viraAbobora + ms(150), ate: DET.teias - ms(150), texto: 'O chat virou abóbora — e acendia com mensagem nova.', icone: '💬' },
    { de: DET.teias + ms(150), ate: DET.chapeus - ms(150), texto: 'Apareceu teia no canto… e a Dona Aranha.', icone: '🕸️' },
    { de: DET.chapeus + ms(150), ate: DET.morcegos + ms(200), texto: 'Todo mundo ganhou chapéu de bruxa.', icone: '🧙' },
    { de: DET.morcegos + ms(400), ate: DET.cliqueMorcego + s(1.2), texto: 'Morcegos cruzavam a tela… e caíam no clique.', icone: '🦇' },
    { de: DET.pegaAranha - s(0.6), ate: DET.perdida, texto: 'E a aranha? Dava para puxar o fio até estourar.', icone: '🕷️' },
    { de: DET.cartaz + ms(300), ate: DET.fim - ms(200), texto: 'Fugiu? Lá vinha o morcego com o cartaz.', icone: '📜' },
    // As caças
    { de: T.cacaAbobora + ms(100), ate: ABOBORA.mouseEmCima - ms(200), olho: 'E teve as caças!', texto: 'Primeiro, a abóbora: quem achasse antes, levava.', icone: '🎃' },
    { de: T.zumbiTexto, ate: C + s(1.8), olho: 'Depois a gente melhorou', texto: 'A abóbora virou zumbi…', icone: '🧟' },
    { de: CHEFE.entra, ate: CHEFE.entra + s(2.6), texto: 'O Rei do Pop atacou.', icone: '🕺' },
    { de: BRUXAS.inicio + ms(100), ate: BRUXAS.chefona - ms(200), olho: 'Depois, a Caça às Bruxas', texto: 'Elas vinham de vassoura… e caíam no tiro.', icone: '🧹', cor: '#a78bfa' },
    // Depois do aviso dela («A Bruxa do Pântano chegou!», 3,4 s), que é do palco.
    { de: BRUXAS.chefona + s(3.6), ate: BRUXAS.pocoes[2] + s(1.0), texto: 'Cada poção dela mudava o Gestão.', icone: '🧪', topo: 820, cor: '#a78bfa' },
  ];
  return (
    // Sem nome: cada pessoa assiste no próprio sistema, e um nome que não é o
    // dela denunciaria o vídeo (pedido do Cleber, 28/10).
    <PessoaContext.Provider value={SEM_NOME}>
      <AbsoluteFill style={{ background: '#08071b', overflow: 'hidden' }}>
        <CeuDoComeco />
        {/* A conversa fica atrás: o sistema entra voando por cima dela. */}
        <Conversa r={CONVERSA} />
        <Sistema />
        <Seta pontos={MOUSE_CONVERSA} cliques={[CONVERSA.clique]} tamanho={1.6} />
        <Recados itens={recados} topo={84} />
        <Luz />
        <Preto />
        <Montagem r={MONTAGEM} />
        <Som />
      </AbsoluteFill>
    </PessoaContext.Provider>
  );
};

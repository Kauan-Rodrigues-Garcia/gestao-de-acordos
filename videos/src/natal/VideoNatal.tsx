// A abertura do Natal (28/10/2026): o vídeo que toca quando a pessoa abre o
// presente no alto do sistema.
//
// Antes de ele começar, o app põe todo mundo no tema claro padrão; o primeiro
// quadro é a luz do presente, parada, e ela se desfaz na noite.
//
// O roteiro:
//   1. a conversa (`Conversa.tsx`): o Gestão chama para relembrar outubro;
//   2. a Arena de Outubro (`Arena.tsx`, 06/11/2026): as caças, sem o sistema
//      no fundo — a abóbora, os zumbis, o Rei do Pop, as bruxas e a Bruxa do
//      Pântano, cuja última poção apaga tudo;
//   3. a montagem (`Montagem.tsx`): do preto, a pesquisa, o player, as
//      corridas e o mural, que termina embrulhado no papel do presente.
//
// Até 06/11 o meio era o sistema entrando como janela e o Halloween chegando
// nele coisa por coisa (`Detalhes.tsx`); o Cleber achou longo demais. A versão
// antiga está salva com ele.
//
// Só música e efeitos, sem narração. Dados reais só da gincana e da pesquisa
// (`dados.ts`).

import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame } from 'remotion';
import { OPERADORA } from '../app/dados';
import { PessoaContext, type Pessoa } from '../app/pessoa';
import { type PontoCursor } from '../componentes/Cursor';
import { Seta } from './Seta';
import { entre, ms, s, SUAVE_IDA_VOLTA } from '../movimento';
import { Conversa, ALVO_BORA, roteiroDaConversa } from './Conversa';
import { Ceu } from './Ceu';
import { Arena, SonsDaArena, roteiroDaArena } from './Arena';
import { Montagem, SonsDaMontagem, roteiroDaMontagem } from './Montagem';

/** A pessoa do vídeo, sem nome nem iniciais: só o cargo e o setor. */
const SEM_NOME: Pessoa = { ...OPERADORA, nome: '', primeiroNome: '', iniciais: '' };

// ── O roteiro ───────────────────────────────────────────────────────────────

const CONVERSA = roteiroDaConversa();
/** A arena começa logo depois do «Bora!». */
const ARENA = roteiroDaArena(CONVERSA.sai + ms(300));
/** Do preto da poção, a montagem num cenário só do vídeo (`Montagem.tsx`). */
const MONTAGEM = roteiroDaMontagem(ARENA.fim);
export const TOTAL_NATAL = MONTAGEM.fim;

export const T = {
  luzParada: ms(350),
  luzSome: s(1.4),
  arena: ARENA.inicio,
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
    {/* A conversa: um pop a cada mensagem e o clique no «Bora!». */}
    {CONVERSA.falas.map(x => <Sequence key={x.fala} from={x.fala} durationInFrames={s(1)}><Audio src={staticFile('sons/pop.wav')} volume={0.18} /></Sequence>)}
    <Sequence from={CONVERSA.clique} durationInFrames={s(0.6)}><Audio src={staticFile('sons/clique.wav')} volume={0.4} /></Sequence>
    <Sequence from={CONVERSA.resposta} durationInFrames={s(1)}><Audio src={staticFile('sons/pop.wav')} volume={0.2} /></Sequence>
    <SonsDaArena r={ARENA} />
    <SonsDaMontagem r={MONTAGEM} />
  </>
);

// ── O vídeo ─────────────────────────────────────────────────────────────────

export const VideoNatal: React.FC = () => (
  // Sem nome: cada pessoa assiste no próprio sistema, e um nome que não é o
  // dela denunciaria o vídeo (pedido do Cleber, 28/10).
  <PessoaContext.Provider value={SEM_NOME}>
    <AbsoluteFill style={{ background: '#08071b', overflow: 'hidden' }}>
      <CeuDoComeco />
      <Conversa r={CONVERSA} />
      <Arena r={ARENA} />
      <Seta pontos={MOUSE_CONVERSA} cliques={[CONVERSA.clique]} tamanho={1.6} />
      <Luz />
      <Montagem r={MONTAGEM} />
      <Som />
    </AbsoluteFill>
  </PessoaContext.Provider>
);

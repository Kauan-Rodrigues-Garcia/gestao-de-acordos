// A Caça às Bruxas e a Bruxa do Pântano (14 a 16/10/2026), com os palcos
// ORIGINAIS do app (`PalcoBruxas`, `PalcoChefona`) rodando no relógio virtual
// (`RelogioVirtual.tsx`): o voo, a queda, as poções e os feitiços são o código
// de lá, sem simplificar. O roteiro só diz quando soltar, atirar e jogar.
//
// As bruxas moram na área do conteúdo (o `[data-palco-abobora]` do app); a
// chefona, na tela inteira do app (o `position: fixed` dela fica preso à
// réplica, que tem transform). Os feitiços pegam as peças marcadas com
// `data-alvo-feitico` na réplica (valores e abas do menu), como no sistema. A
// última poção é a de Cegueira, na variante «escuridão»: a tela escurece — e é
// dela que o vídeo sai para a montagem.

import { Audio, Sequence, staticFile } from 'remotion';
import { PalcoBruxas, ESCALA_BRUXAS } from '../../../arquivo-morto/caca-zumbis-bruxas/src/components/CacaAbobora/bruxas/palco';
import { quadrosDa } from '../../../arquivo-morto/caca-zumbis-bruxas/src/components/CacaAbobora/bruxas/pixels';
import { LARGURA, NUMERO_DA_PARTE, centroDaParte, type Bruxa } from '../../../arquivo-morto/caca-zumbis-bruxas/src/components/CacaAbobora/bruxas/arte';
import { PalcoChefona } from '../../../arquivo-morto/caca-zumbis-bruxas/src/components/CacaAbobora/bruxas/chefona/palcoChefona';
import { alvosPorAtributo, feiticosLeves } from '../../../arquivo-morto/caca-zumbis-bruxas/src/components/CacaAbobora/bruxas/chefona/feiticos';
import '../../../arquivo-morto/caca-zumbis-bruxas/src/components/CacaAbobora/caca.css';
import '../../../arquivo-morto/caca-zumbis-bruxas/src/components/CacaAbobora/bruxas/bruxas.css';
import './bruxas-video.css';
import { APP_L, CABECALHO, SIDEBAR } from '../app/layout';
import { ms, s } from '../movimento';
import { PalcoVirtual, type Comando } from './RelogioVirtual';
import { ALTURA_NATAL } from './Detalhes';

const FPS = 60;
/** Quadros do vídeo em ms do relógio do palco. */
const emMs = (quadros: number) => (quadros / FPS) * 1000;

// ── O roteiro ───────────────────────────────────────────────────────────────

/**
 * Cada poção leva o preparo (1,4 s) e o voo da garrafa (até 1,2 s) antes de
 * quebrar; a próxima só sai depois, senão a garrafa no ar é trocada pela nova.
 */
const PREPARO_E_VOO = s(2.3);

export function roteiroDasBruxas(B: number) {
  const bruxas = {
    soltas: [B + ms(100), B + ms(800)],
    tiros: [B + s(2.2), B + s(3.4)],
  };
  const chefona = B + s(4.8);
  const pocoes = [chefona + s(1.2), chefona + s(4.0), chefona + s(6.8)];
  const escuridao = chefona + s(9.6);
  // A última poção apaga a tela enquanto voa: preto no vidro quebrando, e um respiro no escuro.
  const preto = escuridao + PREPARO_E_VOO;
  return {
    inicio: B, bruxas, chefona,
    /** Os tiros de todo mundo nela (o dano chega como «tiro de outro»). */
    tirosNela: Array.from({ length: 40 }, (_, i) => chefona + s(1.0) + i * ms(230)),
    pocoes, escuridao,
    /** Quando cada garrafa quebra (o vidro). */
    quebras: [...pocoes, escuridao].map(t => t + PREPARO_E_VOO),
    preto,
    /** Quando ela solta a última garrafa (fim do preparo): a tela começa a apagar. */
    apaga: escuridao + s(1.4),
    fim: preto + s(0.7),
  };
}
export type RoteiroBruxas = ReturnType<typeof roteiroDasBruxas>;

// ── As bruxas de vassoura ───────────────────────────────────────────────────

/** As duas da cena (índice em `BRUXAS`): a Feiosa leva o headshot, a Vampira (com o morcego) o tiro no corpo. */
export const FEIOSA = 1;
export const VAMPIRA = 3;

type PalcoAberto = {
  vivas: { voo: { lado: number }; bruxa: Bruxa; semChapeu: boolean; quadro: number }[];
  raiz: HTMLElement;
  escala: number;
  posSprite: (v: unknown) => { x: number; y: number };
  atirar: (v: unknown, x: number, y: number) => void;
};

/**
 * O clique de quem caça, no meio da peça escolhida da primeira bruxa no ar.
 * O palco converte o clique pela escala dele, sem saber que o vídeo amplia a
 * réplica — então o ponto vai na conta dele, não na da tela.
 */
export function atirarNa(palco: PalcoBruxas, parte: 'cabeca' | 'tronco') {
  const p = palco as unknown as PalcoAberto;
  const v = p.vivas[0];
  if (!v) return;
  const img = quadrosDa(v.bruxa, v.semChapeu).imagens[v.quadro];
  const c = centroDaParte(img, NUMERO_DA_PARTE[parte]);
  const sp = p.posSprite(v);
  const lx = v.voo.lado < 0 ? LARGURA - 1 - c.x : c.x;
  const r = p.raiz.getBoundingClientRect();
  p.atirar(v, r.left + (sp.x + lx + 0.5) * p.escala, r.top + (sp.y + c.y + 0.5) * p.escala);
}

export const BruxasNoConteudo: React.FC<{ r: RoteiroBruxas }> = ({ r }) => {
  const rel = (q: number) => emMs(q - r.inicio);
  // `onde` em pixels da arte: o palco tem (1600 − 240) / 1,5 ≈ 906 de largura.
  const comandos: Comando<PalcoBruxas>[] = [
    { t: rel(r.bruxas.soltas[0]), fazer: p => { p.soltar(FEIOSA, { x: 640, y: 150 }); } },
    { t: rel(r.bruxas.soltas[1]), fazer: p => { p.soltar(VAMPIRA, { x: 220, y: 210 }); } },
    { t: rel(r.bruxas.tiros[0]), fazer: p => atirarNa(p, 'cabeca') },
    { t: rel(r.bruxas.tiros[1]), fazer: p => atirarNa(p, 'tronco') },
  ];
  return (
    <div style={{ position: 'absolute', left: SIDEBAR, top: CABECALHO, width: APP_L - SIDEBAR, height: ALTURA_NATAL - CABECALHO, overflow: 'hidden', pointerEvents: 'none' }}>
      <PalcoVirtual<PalcoBruxas>
        inicio={r.inicio} fim={r.chefona + s(2)} semente={14}
        criar={host => new PalcoBruxas(host, { escala: ESCALA_BRUXAS })}
        comandos={comandos}
      />
    </div>
  );
};

// ── A Bruxa do Pântano ──────────────────────────────────────────────────────

export type ChefonaAberta = { proximoFeitico: number; proximoForte: number; leve: boolean; raiz: HTMLElement };

/** Só o roteiro joga poção: a dela, sozinha, fica para depois do vídeo. */
export function semPocaoSozinha(p: PalcoChefona) {
  const a = p as unknown as ChefonaAberta;
  a.proximoFeitico = 1e9;
  a.proximoForte = 1e9;
}

export const BruxaDoPantano: React.FC<{ r: RoteiroBruxas; app: () => HTMLElement | null }> = ({ r, app }) => {
  const rel = (q: number) => emMs(q - r.chefona);
  const jogar = (f: Parameters<PalcoChefona['conjurar']>[0], v: string) => (p: PalcoChefona) => { p.conjurar(f, v); semPocaoSozinha(p); };
  const comandos: Comando<PalcoChefona>[] = [
    { t: 0, fazer: (p: PalcoChefona) => { p.soltar({ esperaS: 0 }); semPocaoSozinha(p); } },
    ...r.tirosNela.map(t => ({ t: rel(t), fazer: (p: PalcoChefona) => p.tiroDeOutro() })),
    { t: rel(r.pocoes[0]), fazer: jogar('dano', 'negativo') },
    { t: rel(r.pocoes[1]), fazer: jogar('estranha', 'minecraft') },
    { t: rel(r.pocoes[2]), fazer: jogar('visao', 'temas') },
    { t: rel(r.escuridao), fazer: jogar('cegueira', 'escuridao') },
  ].sort((a, b) => a.t - b.t);
  return (
    <PalcoVirtual<PalcoChefona>
      inicio={r.chefona} fim={r.fim} semente={16}
      criar={host => {
        const p = new PalcoChefona(host, {
          escudo: false, contagem: false,
          // Os feitiços pegam a réplica do sistema, não a página do vídeo.
          alvos: alvosPorAtributo(() => app(), () => app()),
        });
        // A máquina que grava não tem placa de vídeo, e o palco se acharia num
        // PC fraco: aqui ela roda como num PC bom (60 quadros, poção com filtro).
        const a = p as unknown as ChefonaAberta;
        a.leve = false;
        a.raiz.classList.remove('leve');
        feiticosLeves(false);
        return p;
      }}
      comandos={comandos}
      // O véu das poções (Cegueira) vai no `body`, fora do palco.
      extras={() => [...document.querySelectorAll('body > .bx-enf-veu')]}
    />
  );
};

// ── O preto do fim ──────────────────────────────────────────────────────────

/**
 * A poção da escuridão (Cleber, 28/10): a tela apaga INTEIRA enquanto a
 * garrafa voa, como luz desligando — não aparece o efeito da poção antes. No
 * vidro quebrando já é preto, e é de lá que a montagem nasce.
 */
export const PretoDaPocao: React.FC<{ r: Pick<RoteiroBruxas, 'apaga' | 'preto' | 'fim'>; f: number }> = ({ r, f }) => {
  const de = r.apaga;
  // Depois do fim a montagem já cobre a tela (ela nasce do preto).
  if (f < de || f >= r.fim) return null;
  const p = Math.min(1, (f - de) / (r.preto - de));
  // Escurece devagar no começo e cai de vez no fim (o vidro).
  return <div style={{ position: 'absolute', inset: 0, background: '#000', opacity: Math.pow(p, 1.6), zIndex: 100 }} />;
};

// ── O som ───────────────────────────────────────────────────────────────────

const mc = (n: string) => staticFile(`natal/chefona/${n}`);
const bx = (n: string) => staticFile(`natal/bruxas/${n}.wav`);
const zb = (n: string) => staticFile(`natal/caca/${n}.wav`);

export const SonsDasBruxas: React.FC<{ r: RoteiroBruxas }> = ({ r }) => (
  <>
    {/* As de vassoura: o puf de chegada e a gargalhada (160 ms depois), como em `soltar`. */}
    {r.bruxas.soltas.map(t => (
      <Sequence key={`s${t}`} from={t} durationInFrames={s(1.5)}>
        <Audio src={bx('puf')} volume={0.28} />
        <Sequence from={ms(160)}><Audio src={bx('gargalhada')} volume={0.28} /></Sequence>
      </Sequence>
    ))}
    {r.bruxas.tiros.map((t, i) => (
      <Sequence key={`t${t}`} from={t} durationInFrames={s(2.4)}>
        <Audio src={zb('tiro')} volume={0.28} />
        <Audio src={zb(i === 0 ? 'cerebro' : 'acerto')} volume={0.32} />
        <Sequence from={ms(120)}><Audio src={bx('grito')} volume={0.24} /></Sequence>
        <Sequence from={ms(900)}><Audio src={bx('espatifa')} volume={0.28} /></Sequence>
      </Sequence>
    ))}
    {/* A chefona: a música da luta, o teleporte da chegada e a risada. */}
    <Sequence from={r.chefona} durationInFrames={r.preto - r.chefona + s(0.4)}>
      <Audio src={mc('the-mad-king.mp3')} volume={(f) => Math.min(0.62, f / 40) * (1 - Math.max(0, Math.min(1, (f - (r.apaga - r.chefona)) / (r.preto - r.apaga))))} />
    </Sequence>
    <Sequence from={r.chefona} durationInFrames={s(2)}><Audio src={mc('teleporte-1.ogg')} volume={0.45} /></Sequence>
    <Sequence from={r.chefona + ms(200)} durationInFrames={s(2)}><Audio src={mc('bruxa-ri-1.ogg')} volume={0.55} /></Sequence>
    {r.tirosNela.filter((_, i) => i % 3 === 0).map((t, i) => (
      <Sequence key={`n${t}`} from={t} durationInFrames={s(1)}>
        <Audio src={zb('acerto')} volume={0.18} />
        {i % 3 === 0 && <Audio src={mc(`bruxa-dano-${(i / 3) % 3 + 1}.ogg`)} volume={0.4} />}
      </Sequence>
    ))}
    {/* Cada poção: a risada do preparo, o arremesso, e o vidro quebrando. */}
    {[...r.pocoes, r.escuridao].map((t, i) => (
      <Sequence key={`p${t}`} from={t} durationInFrames={s(3)}>
        <Audio src={mc(`bruxa-ri-${(i % 4) + 2}.ogg`)} volume={0.45} />
        <Sequence from={s(1.4)}><Audio src={mc(`bruxa-joga-${(i % 3) + 1}.ogg`)} volume={0.5} /></Sequence>
        <Sequence from={s(1.4)}><Audio src={mc('arremesso.ogg')} volume={0.45} /></Sequence>
      </Sequence>
    ))}
    {r.quebras.map((t, i) => (
      <Sequence key={`v${t}`} from={t} durationInFrames={s(2)}>
        <Audio src={mc(`vidro-${(i % 3) + 1}.ogg`)} volume={0.55} />
      </Sequence>
    ))}
  </>
);

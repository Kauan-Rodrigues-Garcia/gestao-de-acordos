// A Arena de Outubro (Cleber, 06/11/2026): o miolo do vídeo de Natal, refeito.
//
// Antes, o sistema entrava como janela e o Halloween chegava nele coisa por
// coisa — demorava demais. Agora não tem sistema nenhum: depois do «Bora!» a
// câmera desce do céu num cemitério à noite, e outubro passa ali em fases,
// cada uma aberta por uma cartela que cai com tranco:
//
//   1. a abóbora — pula do chão, o mouse pega;
//   2. os zumbis — saem da cova, a mira derruba os três;
//   3. o Rei do Pop — o chefão dança, apanha, perde os braços e foge;
//   4. as bruxas de vassoura — duas no ar, dois tiros;
//   5. a Bruxa do Pântano — joga as poções nas lápides dos recordes e a
//      última apaga tudo. Do preto nasce a montagem (`Montagem.tsx`).
//
// Cada fase vencida levanta uma lápide com o recorde dela (dados reais, de
// `dados.ts`). São as lápides que as poções enfeitiçam: os números viram
// negativos, as letras saem do avesso, a tela vira negativo.
//
// A arte, a física e os sons são os do app (os mesmos de `Caca.tsx`,
// `Chefao.tsx` e `Bruxas.tsx`); o cenário, as cartelas, o placar e a câmera
// são só do vídeo. Música: o tema do Halloween do começo ao apagão, abaixando
// quando a briga aperta.
//
// Tudo desenhado num palco de 1600 × 780 (o tamanho do app no vídeo),
// ampliado 1,2× para a tela de 1920 × 936.

import { useLayoutEffect, useMemo } from 'react';
import { AbsoluteFill, Audio, interpolate, Sequence, staticFile, useCurrentFrame } from 'remotion';
import { loadFont as fonteCreepster } from '@remotion/google-fonts/Creepster';
import { loadFont as fonteNunito } from '@remotion/google-fonts/Nunito';
import { loadFont as fonteCinzel } from '@remotion/google-fonts/CinzelDecorative';
import { ZUMBIS } from '../../../arquivo-morto/caca-zumbis-bruxas/src/components/CacaAbobora/zumbis';
import { PalcoBruxas, ESCALA_BRUXAS } from '../../../arquivo-morto/caca-zumbis-bruxas/src/components/CacaAbobora/bruxas/palco';
import { PalcoChefona } from '../../../arquivo-morto/caca-zumbis-bruxas/src/components/CacaAbobora/bruxas/chefona/palcoChefona';
import { alvosPorAtributo, feiticosLeves } from '../../../arquivo-morto/caca-zumbis-bruxas/src/components/CacaAbobora/bruxas/chefona/feiticos';
import { ACELERA, entre, mola, ms, s, SUAVE, SUAVE_IDA_VOLTA } from '../movimento';
import { DesenhoAbobora, Estouro, AboboraNaTela, vela, type CenaAbobora } from './Abobora';
import { CabecaZumbi, Cacadas, Mira, SonsDaCaca, formatarTempo, type Cacada } from './Caca';
import { ReiDoPop, SonsDoChefao, roteiroDoChefao } from './Chefao';
import { FEIOSA, VAMPIRA, PretoDaPocao, atirarNa, semPocaoSozinha, type ChefonaAberta } from './Bruxas';
import { PalcoVirtual, type Comando } from './RelogioVirtual';
import { Seta } from './Seta';
import { sorteio } from './Ceu';
import { ACHOU_ABOBORA, BRUXA_DO_PANTANO, MATADORES, PLACAR_BRUXAS, RECORDE_ZUMBIS, REI_DO_POP } from './dados';
import type { PontoCursor } from '../componentes/Cursor';
import { NOME, NOME_NA_PEDRA } from './nome';

fonteCreepster('normal', { weights: ['400'], subsets: ['latin'] });
fonteNunito('normal', { weights: ['700', '800', '900'], subsets: ['latin', 'latin-ext'] });
fonteCinzel('normal', { weights: ['700'], subsets: ['latin', 'latin-ext'] });

/** O palco da arena (as coordenadas do app no vídeo) e a ampliação para a tela. */
const PL = 1600;
const PA = 780;
const ESC = 1.2;
/** A linha do chão: atrás dela ficam as lápides; na frente, quem briga. */
const CHAO = 640;

/** Os zumbis e a abóbora são pixel art pequena: cada um vai numa camada ampliada. */
const ZOOM_ZUMBI = 1.9;
const ZOOM_ABOBORA = 3;
/** O Rei do Pop e as bruxas também ganham uma camada ampliada (o HUD do chefão vem junto). */
const ZOOM_REI = 1.5;
const ZOOM_BRUXA = 1.4;

const ARCADE = "'Press Start TwoP', 'Press Start 2P', monospace";
const TERROR = "Creepster, 'Nunito', sans-serif";
const TEXTO = "Nunito, Inter, sans-serif";

// ── O roteiro ───────────────────────────────────────────────────────────────

type Fase = { cartela: number; cartelaSai: number; fim: number };

export function roteiroDaArena(A: number) {
  const abertura = { inicio: A, raio: A + s(0.9), titulo: A + s(1.0), tituloSai: A + s(2.9), fim: A + s(3.0) };

  // 1. A abóbora
  const P = abertura.fim;
  const cenaAbobora: CenaAbobora = {
    x: Math.round((PL / 2 - 20 * ZOOM_ABOBORA) / ZOOM_ABOBORA), y: Math.round((700 - 40 * ZOOM_ABOBORA) / ZOOM_ABOBORA),
    chega: P + s(1.3), mouseEmCima: P + s(2.5), clique: P + s(3.0),
  };
  const abobora = { cartela: P, cartelaSai: P + s(1.5), cena: cenaAbobora, lapide: P + s(3.7), fim: P + s(5.0) };

  // 2. Os zumbis (nas coordenadas da camada ampliada: 842 × 410)
  const Z = abobora.fim;
  const yZumbi = Math.round(705 / ZOOM_ZUMBI - 68);
  const cacadas: Cacada[] = [
    {
      zumbi: 0, x: 250, y: yZumbi, lado: 1, sobe: Z + s(0.9), semente: 7,
      passeio: [{ dur: 0.3, vel: 0 }, { dur: 0.9, vel: 4.2 }, { dur: 0.6, vel: 0 }],
      erra: Z + s(2.35), tiro: Z + s(2.9), jeito: 'cabeca', recordes: ['hsRapido'], ...MATADORES[0],
    },
    {
      zumbi: 7, x: 470, y: yZumbi + 5, lado: -1, sobe: Z + s(1.6), semente: 21,
      passeio: [{ dur: 0.3, vel: 0 }, { dur: 1.6, vel: -4.2 }],
      tiro: Z + s(3.8), jeito: 'corpo', recordes: ['rapido'], ...MATADORES[1],
    },
    {
      zumbi: 3, x: 650, y: yZumbi - 3, lado: -1, sobe: Z + s(2.4), semente: 33,
      passeio: [{ dur: 0.3, vel: 0 }, { dur: 1.6, vel: -4.2 }],
      tiro: Z + s(4.7), jeito: 'cabeca', ...MATADORES[2],
    },
  ];
  const zumbis = { cartela: Z, cartelaSai: Z + s(1.5), cacadas, mira: { entra: Z + s(1.6), sai: Z + s(5.3) }, lapide: Z + s(5.7), fim: Z + s(6.8) };

  // 3. O Rei do Pop: anda só no chão do cemitério, e foge pela direita.
  // (Nas coordenadas da camada dele, 1066 × 520: o chão vai de 280 a 500.)
  const R = zumbis.fim;
  const chefe = roteiroDoChefao(R + s(1.2), { area: { top: 280, altura: 220, largura: Math.round(PL / ZOOM_REI) }, onde: { x: 600, y: 80 }, dura: 9.2 });
  const rei = { cartela: R, cartelaSai: R + s(1.6), chefe, lapide: chefe.sai - s(1.4), fim: chefe.sai + s(0.6) };

  // 4. As bruxas de vassoura
  const B = rei.fim;
  const bruxas = {
    cartela: B, cartelaSai: B + s(1.5),
    soltas: [B + s(0.7), B + s(1.2)], tiros: [B + s(2.5), B + s(3.5)],
    lapide: B + s(4.6), fim: B + s(5.4),
  };

  // 5. A Bruxa do Pântano
  const C = bruxas.fim;
  const PREPARO_E_VOO = s(2.3);
  const chegaChefona = C + s(0.9);
  const pocoes = [C + s(2.4), C + s(5.0), C + s(7.6)];
  const escuridao = C + s(10.0);
  const preto = escuridao + PREPARO_E_VOO;
  const pantano = {
    cartela: C, cartelaSai: C + s(1.8), raio: C + s(0.15), chega: chegaChefona,
    tirosNela: Array.from({ length: 40 }, (_, i) => chegaChefona + s(1.0) + i * ms(230)),
    /** O placar de quem mais bateu nela, entrando durante a luta. */
    top: [C + s(3.2), C + s(4.4), C + s(5.6)],
    pocoes, escuridao,
    quebras: [...pocoes, escuridao].map(t => t + PREPARO_E_VOO),
    apaga: escuridao + s(1.4), preto, fim: preto + s(0.7),
  };

  return { inicio: A, abertura, abobora, zumbis, rei, bruxas, pantano, fim: pantano.fim };
}
export type RoteiroArena = ReturnType<typeof roteiroDaArena>;

/** As fases na ordem, com o que cada cartela diz. */
function fases(r: RoteiroArena): (Fase & { olho: string; titulo: string; sub: string; cor: string; jeito: Jeito })[] {
  return [
    { ...r.abobora, olho: 'Fase 1', titulo: 'A Abóbora', sub: 'Quem achasse primeiro, levava.', cor: '#ff8a1c', jeito: 'letras' },
    { ...r.zumbis, olho: 'Fase 2', titulo: 'Caça aos Zumbis', sub: 'A abóbora virou zumbi… e a mira apareceu.', cor: '#8fd14f', jeito: 'cova' },
    { ...r.rei, olho: 'Chefão', titulo: 'O Rei do Pop', sub: `${REI_DO_POP.pessoas} caçadores contra ele, ao mesmo tempo.`, cor: '#ff3b3b', jeito: 'holofote' },
    { ...r.bruxas, olho: 'Fase 3', titulo: 'Caça às Bruxas', sub: 'Vinham de vassoura… e caíam no tiro.', cor: '#b48cff', jeito: 'voo' },
    { ...r.pantano, olho: 'Chefona', titulo: 'A Bruxa do Pântano', sub: 'Cada poção dela mudava tudo.', cor: '#5fe38a', jeito: 'pantano' },
  ];
}

// ── A câmera: o tranco dos impactos ─────────────────────────────────────────

type Impacto = { f: number; forca: number };

function impactos(r: RoteiroArena): Impacto[] {
  const lista: Impacto[] = [{ f: r.abertura.titulo + ms(130), forca: 12 }];
  for (const fz of fases(r)) {
    const c = fz.cartela;
    if (fz.jeito === 'letras') lista.push({ f: c + ms(55 * fz.titulo.length), forca: 3 });
    if (fz.jeito === 'cova') {
      for (let k = 0; k < 5; k++) lista.push({ f: c + ms(150 * k), forca: 2.5 });
      lista.push({ f: c + ms(720), forca: 7 });
    }
    if (fz.jeito === 'holofote') lista.push({ f: c, forca: 4 });
    if (fz.jeito === 'pantano') lista.push({ f: c + ms(300), forca: 5 });
  }
  lista.push({ f: r.abobora.cena.clique, forca: 4 });
  for (const c of r.zumbis.cacadas) lista.push({ f: c.tiro, forca: c.jeito === 'cabeca' ? 7 : 4 });
  lista.push({ f: r.rei.chefe.entra + ms(1200), forca: 7 });
  for (const t of r.bruxas.tiros) lista.push({ f: t, forca: 5 }, { f: t + ms(900), forca: 4 });
  for (const t of r.pantano.quebras) lista.push({ f: t, forca: 8 });
  for (const t of [r.abobora.lapide, r.zumbis.lapide, r.rei.lapide, r.bruxas.lapide]) lista.push({ f: t + ms(520), forca: 3 });
  return lista;
}

function tremor(f: number, lista: Impacto[]) {
  let x = 0, y = 0, rot = 0;
  for (const i of lista) {
    const t = (f - i.f) / 60;
    if (t < 0 || t > 0.6) continue;
    const k = i.forca * Math.exp(-t / 0.13);
    x += k * Math.sin(t * 71 + i.f);
    y += k * Math.cos(t * 59 + i.f * 1.3);
    rot += k * 0.04 * Math.sin(t * 47);
  }
  return { x, y, rot };
}

// ── O cenário ───────────────────────────────────────────────────────────────

const ESTRELAS = (() => {
  const r = sorteio(4242);
  return Array.from({ length: 90 }, () => ({ x: r() * PL, y: -380 + r() * 760, tam: 1 + r() * 2, vel: 0.5 + r() * 1.8, fase: r() * 6.28 }));
})();

/** O céu, a lua e as nuvens. `subida`: quanto a câmera ainda está olhando para cima (px). */
const Ceu: React.FC<{ subida: number }> = ({ subida }) => {
  const f = useCurrentFrame();
  const t = f / 60;
  // O céu anda menos que o chão: profundidade.
  const y = subida * 0.55;
  return (
    <div style={{ position: 'absolute', left: 0, top: -420 + y, width: PL, height: PA + 420 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, #05040f 0%, #120b2e 38%, #2a1650 70%, #3b1d4a 86%, #4a2338 100%)' }} />
      {ESTRELAS.map((e, i) => (
        <div key={i} style={{ position: 'absolute', left: e.x, top: e.y + 420, width: e.tam, height: e.tam, borderRadius: '50%', background: '#fff', opacity: 0.2 + 0.6 * Math.abs(Math.sin(t * e.vel + e.fase)) }} />
      ))}
      {/* A lua cheia, com o halo */}
      <div style={{ position: 'absolute', left: 1180 - 260, top: 420 + 120 - 260, width: 520, height: 520, borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(255,236,190,.42), rgba(255,200,150,.12) 55%, transparent)' }} />
      <div style={{
        position: 'absolute', left: 1180 - 78, top: 420 + 120 - 78, width: 156, height: 156, borderRadius: '50%',
        background: 'radial-gradient(circle at 38% 34%, #fffaf0 0%, #fbeec8 45%, #e9d29a 80%, #cdb378 100%)',
        boxShadow: '0 0 60px rgba(255,232,180,.55), inset -14px -10px 24px rgba(160,120,60,.35)',
      }}>
        {[[40, 50, 22], [92, 40, 14], [70, 96, 26], [108, 88, 10]].map(([cx, cy, rr], i) => (
          <div key={i} style={{ position: 'absolute', left: cx - rr / 2, top: cy - rr / 2, width: rr, height: rr, borderRadius: '50%', background: 'rgba(170,140,90,.28)' }} />
        ))}
      </div>
      {/* Nuvens passando na frente da lua */}
      {[{ y: 150, l: 520, v: 14, o: 0.55, d: 0 }, { y: 260, l: 680, v: 9, o: 0.4, d: 700 }, { y: 70, l: 420, v: 18, o: 0.35, d: 1300 }].map((n, i) => {
        const x = ((n.d + t * n.v * 4) % (PL + n.l)) - n.l;
        return <div key={i} style={{ position: 'absolute', left: x, top: 420 + n.y, width: n.l, height: n.l * 0.22, borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(40,24,70,.95), rgba(40,24,70,0))', opacity: n.o }} />;
      })}
    </div>
  );
};

/** Morcego de silhueta batendo asa. */
const Morcego: React.FC<{ x: number; y: number; tam: number; bate: number }> = ({ x, y, tam, bate }) => (
  <svg width={tam} height={tam * 0.5} viewBox="0 0 40 20" style={{ position: 'absolute', left: x, top: y, transform: `scaleY(${0.55 + 0.45 * Math.abs(Math.sin(bate))})` }}>
    <path d="M20 8 C17 3 12 2 2 6 C7 7 9 10 9 13 C12 10 15 11 17 14 L20 11 L23 14 C25 11 28 10 31 13 C31 10 33 7 38 6 C28 2 23 3 20 8 Z" fill="#06040d" />
  </svg>
);

const Morcegos: React.FC<{ subida: number }> = ({ subida }) => {
  const t = useCurrentFrame() / 60;
  return (
    <>
      {[{ y: 180, v: 140, d: 0, tam: 46 }, { y: 120, v: 110, d: 600, tam: 34 }, { y: 250, v: 170, d: 1200, tam: 28 }].map((m, i) => {
        const x = ((m.d + t * m.v) % (PL + 300)) - 150;
        return <Morcego key={i} x={x} y={m.y + Math.sin(t * 2 + i) * 22 + subida * 0.7} tam={m.tam} bate={t * 14 + i} />;
      })}
    </>
  );
};

/** As colinas, as árvores secas e a grade do cemitério (atrás das lápides). */
const Fundo: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <svg width={PL} height={PA} viewBox={`0 0 ${PL} ${PA}`} style={{ position: 'absolute', inset: 0 }}>
      <path d={`M0 520 C 200 470 360 500 520 480 C 700 455 860 500 1040 470 C 1240 440 1420 480 ${PL} 455 L ${PL} ${PA} L 0 ${PA} Z`} fill="#1d1338" />
      <path d={`M0 585 C 240 555 420 590 640 570 C 880 548 1080 590 1300 565 C 1440 552 1520 570 ${PL} 560 L ${PL} ${PA} L 0 ${PA} Z`} fill="#140d28" />
      {/* Árvores secas */}
      {[{ x: 110, e: 1 }, { x: 1490, e: -1 }].map(({ x, e }, i) => (
        <g key={i} transform={`translate(${x} 640) scale(${e} 1)`} fill="none" stroke="#090614" strokeLinecap="round">
          <path d="M0 0 C 4 -80 -6 -160 6 -250" strokeWidth="22" />
          <path d="M3 -150 C 40 -180 70 -190 110 -240" strokeWidth="10" />
          <path d="M70 -195 C 90 -200 100 -215 130 -210" strokeWidth="6" />
          <path d="M5 -210 C -30 -240 -60 -250 -90 -300" strokeWidth="9" />
          <path d="M-50 -250 C -70 -260 -80 -280 -75 -300" strokeWidth="5" />
          <path d="M6 -250 C 10 -290 30 -310 26 -340" strokeWidth="6" />
          <path d="M2 -100 C -30 -110 -45 -125 -70 -130" strokeWidth="7" />
        </g>
      ))}
      {/* A grade de ferro */}
      <g fill="#0b0818">
        <rect x="0" y="600" width={PL} height="5" />
        <rect x="0" y="560" width={PL} height="4" />
        {Array.from({ length: 54 }, (_, i) => (
          <g key={i} transform={`translate(${i * 30 + 6} 0)`}>
            <rect x="0" y="548" width="4" height="62" />
            <path d="M-3 550 L2 538 L7 550 Z" />
          </g>
        ))}
      </g>
      {/* Abóboras acesas nas pontas, pequenas */}
      <foreignObject x="36" y="596" width="48" height="48"><DesenhoAbobora luz={vela(f)} style={{ width: 48, height: 48 }} /></foreignObject>
      <foreignObject x={PL - 92} y="600" width="42" height="42"><DesenhoAbobora luz={vela(f + 50)} style={{ width: 42, height: 42 }} /></foreignObject>
    </svg>
  );
};

/** O chão de terra e a névoa rasteira (na frente das lápides, atrás de quem briga). */
const Chao: React.FC = () => (
  <div style={{ position: 'absolute', left: 0, top: CHAO - 4, width: PL, height: PA - CHAO + 4, background: 'linear-gradient(180deg, #221737 0%, #150e26 40%, #0a0715 100%)', boxShadow: '0 -2px 0 #2e2148' }}>
    <svg width={PL} height="14" style={{ position: 'absolute', left: 0, top: -10 }}>
      {Array.from({ length: 120 }, (_, i) => <path key={i} d={`M${i * 13.4} 14 L${i * 13.4 + 3} ${3 + (i * 7) % 8} L${i * 13.4 + 6} 14 Z`} fill="#221737" />)}
    </svg>
  </div>
);

const Nevoa: React.FC = () => {
  const t = useCurrentFrame() / 60;
  return (
    <>
      {[{ y: 600, v: 18, o: 0.32, l: 900, d: 0 }, { y: 660, v: -12, o: 0.26, l: 1100, d: 500 }, { y: 720, v: 24, o: 0.3, l: 800, d: 900 }].map((n, i) => {
        const x = (((n.d + t * n.v) % (PL + n.l)) + PL + n.l) % (PL + n.l) - n.l;
        return (
          <div key={i} style={{ position: 'absolute', left: 0, top: n.y - 60, width: PL, height: 140, pointerEvents: 'none' }}>
            {[x, x + PL + n.l].map((xx, k) => (
              <div key={k} style={{ position: 'absolute', left: xx - n.l / 2, top: 0, width: n.l * 2, height: 140, borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(190,175,255,.55), rgba(190,175,255,0))', opacity: n.o }} />
            ))}
          </div>
        );
      })}
    </>
  );
};

// ── As lápides dos recordes ─────────────────────────────────────────────────

type DadosLapide = { x: number; sobe: number; titulo: string; nome: string; valor: string; rodape: string; cor: string };

function lapides(r: RoteiroArena): DadosLapide[] {
  return [
    { x: 270, sobe: r.abobora.lapide, titulo: 'A Abóbora', nome: ACHOU_ABOBORA.quem, valor: ACHOU_ABOBORA.tempo, rodape: 'a mais rápida', cor: '#ff8a1c' },
    { x: 600, sobe: r.zumbis.lapide, titulo: 'Os Zumbis', nome: RECORDE_ZUMBIS.nome.split(' ').slice(0, 2).join(' '), valor: RECORDE_ZUMBIS.tempo, rodape: 'o tiro mais rápido', cor: '#8fd14f' },
    { x: 1000, sobe: r.rei.lapide, titulo: 'Rei do Pop', nome: `golpe final: ${REI_DO_POP.golpeFinal}`, valor: String(REI_DO_POP.pessoas), rodape: 'caçadores na luta', cor: '#ff3b3b' },
    { x: 1330, sobe: r.bruxas.lapide, titulo: 'As Bruxas', nome: PLACAR_BRUXAS[0].nome, valor: String(PLACAR_BRUXAS[0].pegos), rodape: 'bruxas derrubadas', cor: '#b48cff' },
  ];
}

const LARG_LAPIDE = 230;
const ALT_LAPIDE = 200;

const Lapide: React.FC<{ d: DadosLapide }> = ({ d }) => {
  const f = useCurrentFrame();
  if (f < d.sobe) return null;
  // Sobe da terra em tranco: rápida, quica um pouco e assenta.
  const p = Math.min(1.04, mola(f, d.sobe, { mass: 1, stiffness: 90, damping: 13, overshootClamping: false }));
  const treme = f < d.sobe + ms(520) ? Math.sin(f * 2.1) * 2 : 0;
  const brilho = entre(f, d.sobe + ms(500), d.sobe + ms(900), 0, 1) * (1 - entre(f, d.sobe + ms(900), d.sobe + s(2.2), 0, 0.7));
  return (
    <>
      <div style={{ position: 'absolute', left: d.x - LARG_LAPIDE / 2 - 20, top: CHAO - ALT_LAPIDE - 30, width: LARG_LAPIDE + 40, height: ALT_LAPIDE + 30 + 2, overflow: 'hidden' }}>
        <div style={{
          position: 'absolute', left: 20 + treme, top: 30, width: LARG_LAPIDE, height: ALT_LAPIDE,
          transform: `translateY(${(1 - p) * (ALT_LAPIDE + 10)}px)`,
          borderRadius: `${LARG_LAPIDE / 2}px ${LARG_LAPIDE / 2}px 10px 10px`,
          background: 'linear-gradient(160deg, #a7a3bb 0%, #7d7993 38%, #55516b 78%, #3e3b52 100%)',
          boxShadow: `inset 0 3px 0 rgba(255,255,255,.28), inset -10px -8px 22px rgba(0,0,0,.35), 0 0 ${34 * brilho}px ${d.cor}`,
          display: 'grid', justifyItems: 'center', alignContent: 'start', paddingTop: 30, color: '#25222f', textAlign: 'center',
        }}>
          {/* Musgo e rachadura */}
          <svg width={LARG_LAPIDE} height={ALT_LAPIDE} style={{ position: 'absolute', inset: 0 }}>
            <path d="M150 0 L142 40 L156 66 L148 98" stroke="rgba(30,26,40,.5)" strokeWidth="2.5" fill="none" />
            <ellipse cx="34" cy={ALT_LAPIDE - 6} rx="40" ry="12" fill="rgba(70,110,60,.55)" />
            <ellipse cx={LARG_LAPIDE - 30} cy={ALT_LAPIDE - 4} rx="30" ry="9" fill="rgba(70,110,60,.45)" />
          </svg>
          <span data-alvo-feitico="aba" style={{ position: 'relative', font: '700 21px "Cinzel Decorative", serif', letterSpacing: '0.04em', textShadow: '0 1px 0 rgba(255,255,255,.35)' }}>{d.titulo}</span>
          <span style={{ position: 'relative', width: 120, height: 2, background: 'rgba(37,34,47,.45)', margin: '6px 0 4px' }} />
          <span data-alvo-feitico="valor" style={{ position: 'relative', font: `400 46px ${TERROR}`, lineHeight: 1.05, color: '#1c1924', textShadow: '0 1px 0 rgba(255,255,255,.3)' }}>{d.valor}</span>
          <span style={{ position: 'relative', font: `800 14px ${TEXTO}`, textTransform: 'uppercase', letterSpacing: '0.12em', opacity: 0.75 }}>{d.rodape}</span>
          <span style={{ position: 'relative', font: `900 17px ${TEXTO}`, marginTop: 6, maxWidth: LARG_LAPIDE - 30, ...NOME_NA_PEDRA }}>{d.nome}</span>
        </div>
      </div>
      <Poeira x={d.x} y={CHAO} em={d.sobe} />
    </>
  );
};

/** A terra que espirra quando algo sai do chão. */
const Poeira: React.FC<{ x: number; y: number; em: number; n?: number }> = ({ x, y, em, n = 14 }) => {
  const f = useCurrentFrame();
  const t = (f - em) / 60;
  if (t < 0 || t > 1.1) return null;
  const r = sorteio(Math.round(x * 7 + em));
  return (
    <>
      {Array.from({ length: n }, (_, i) => {
        const vx = (r() - 0.5) * 420, vy = -160 - r() * 260, tam = 4 + Math.round(r() * 3) * 2;
        return (
          <div key={i} style={{
            position: 'absolute', left: x + (r() - 0.5) * LARG_LAPIDE * 0.8 + vx * t, top: y - 6 + vy * t + 520 * t * t,
            width: tam, height: tam, background: i % 3 ? '#4a3424' : '#6b5038', opacity: 1 - t / 1.1,
          }} />
        );
      })}
    </>
  );
};

// ── As cartelas, a etiqueta da fase e o placar de abates ────────────────────

/**
 * O jeito de cada cartela entrar e sair (Cleber, 06/11: todas iguais ficava
 * repetitivo). Cada fase tem o seu, e o som acompanha (`SomDaCartela`):
 *   tranco    cai do alto e bate (a abertura)
 *   letras    as letras pulam uma a uma, como pipoca; saem estourando (a abóbora)
 *   cova      sobe da terra tremendo; sai afundando (os zumbis)
 *   holofote  o holofote liga piscando, letreiro de neon; apaga seco (o Rei do Pop)
 *   voo       entra voando de vassoura com rastro; sai voando (as bruxas)
 *   pantano   as letras se formam do lodo, moles; saem derretendo (a chefona)
 */
type Jeito = 'tranco' | 'letras' | 'cova' | 'holofote' | 'voo' | 'pantano';

/** As letras do título, cada uma num `inline-block` (o espaço não some). */
const Letras: React.FC<{ texto: string; estilo: (i: number, n: number) => React.CSSProperties }> = ({ texto, estilo }) => {
  const letras = [...texto];
  return <>{letras.map((ch, i) => <span key={i} style={{ display: 'inline-block', ...estilo(i, letras.length) }}>{ch === ' ' ? ' ' : ch}</span>)}</>;
};

const SOMBRA_TITULO = '0 3px 0 #120606, 0 6px 0 #120606, 0 9px 0 #0a0303, 0 14px 30px rgba(0,0,0,.7), 0 0 40px rgba(0,0,0,.5)';
const SAIDA = ms(420);

const Cartela: React.FC<{ de: number; ate: number; olho: string; titulo: string; sub: string; cor: string; jeito: Jeito; grande?: boolean }> = ({ de, ate, olho, titulo, sub, cor, jeito, grande }) => {
  const f = useCurrentFrame();
  if (f < de || f > ate + SAIDA + ms(300)) return null;
  const sai = entre(f, ate, ate + ms(380), 0, 1, ACELERA);
  const subOp = entre(f, de + ms(320), de + ms(580), 0, 1) * (1 - sai);
  const olhoOp = entre(f, de + ms(120), de + ms(320), 0, 1) * (1 - sai);
  const tam = grande ? 128 : 116;
  const topo = grande ? 220 : 236;
  const base: React.CSSProperties = { position: 'relative', font: `400 ${tam}px ${TERROR}`, lineHeight: 1, letterSpacing: '0.02em', color: cor, whiteSpace: 'nowrap' };
  let titEl: React.ReactNode;
  let fundo = 0.72 * Math.min(1, (f - de) / ms(120)) * (1 - sai);
  let extra: React.ReactNode = null;

  if (jeito === 'tranco') {
    const cai = mola(f, de, { mass: 0.7, stiffness: 240, damping: 13, overshootClamping: false });
    const esc = (2.4 - 1.4 * cai) * (1 - 0.15 * sai);
    const varre = entre(f, de + ms(220), de + ms(900), -30, 130, SUAVE_IDA_VOLTA);
    titEl = (
      <span style={{ ...base, transform: `translateY(${-30 * sai}px) scale(${esc}) rotate(${(1 - Math.min(1, cai)) * -4}deg)`, opacity: Math.min(1, (f - de) / ms(90)) * (1 - sai), textShadow: SOMBRA_TITULO }}>
        {titulo}
        <span aria-hidden="true" style={{
          position: 'absolute', inset: 0, color: 'transparent', whiteSpace: 'nowrap', textShadow: 'none',
          background: `linear-gradient(100deg, transparent ${varre - 18}%, rgba(255,255,255,.85) ${varre}%, transparent ${varre + 18}%)`,
          WebkitBackgroundClip: 'text', backgroundClip: 'text',
        }}>{titulo}</span>
      </span>
    );
  } else if (jeito === 'letras') {
    const brilho = vela(f);
    titEl = (
      <span style={{ ...base, textShadow: `${SOMBRA_TITULO}, 0 0 ${26 * brilho}px rgba(255,160,40,.75)` }}>
        <Letras texto={titulo} estilo={(i, n) => {
          const e = mola(f, de + ms(55 * i), { mass: 0.5, stiffness: 320, damping: 10, overshootClamping: false });
          const lado = i % 2 ? 1 : -1;
          // Saída: cada letra estoura para um lado.
          const q = entre(f, ate + ms(18 * i), ate + ms(18 * i) + ms(360), 0, 1, ACELERA);
          const ang = ((i - (n - 1) / 2) / n) * Math.PI * 0.9 - Math.PI / 2;
          return {
            transform: `translate(${Math.cos(ang) * 260 * q}px, ${(1 - Math.min(1, e)) * -50 + Math.sin(ang) * 220 * q}px) scale(${Math.max(0, e) * (1 + 0.5 * q)}) rotate(${lado * 10 * (1 - Math.min(1, e)) + lado * 140 * q}deg)`,
            opacity: Math.min(1, e * 2) * (1 - q),
          };
        }} />
      </span>
    );
  } else if (jeito === 'cova') {
    const sobe = entre(f, de, de + ms(750), 0, 1, SUAVE);
    const afunda = entre(f, ate, ate + SAIDA, 0, 1, ACELERA);
    const treme = (sobe < 1 || afunda > 0) ? Math.sin(f * 2.3) * 4 : 0;
    const y = (1 - sobe) * 115 + afunda * 115;
    titEl = (
      // Só embaixo corta: as letras saem do chão (a linha de baixo da caixa).
      <span style={{ ...base, display: 'inline-block', clipPath: 'inset(-60% -10% 0 -10%)', paddingBottom: 10 }}>
        <span style={{ display: 'inline-block', transform: `translate(${treme}px, ${y}%)`, textShadow: SOMBRA_TITULO }}>
          <Letras texto={titulo} estilo={i => ({ transform: `rotate(${(i % 3 - 1) * 3 + Math.sin(f / 14 + i) * 1.5}deg)` })} />
        </span>
      </span>
    );
    // A terra rachada embaixo, que espirra quando as letras saem e quando afundam.
    const terra = Math.min(1, (f - de) / ms(150)) * (1 - entre(f, ate + SAIDA, ate + SAIDA + ms(250), 0, 1));
    const chao = topo + 40 + tam;
    extra = (
      <>
        <div style={{ position: 'absolute', left: PL / 2 - 520, top: chao, width: 1040, height: 14, background: 'radial-gradient(closest-side, #3a281b, rgba(58,40,27,0))', opacity: terra }} />
        <Poeira x={PL / 2} y={chao + 8} em={de} n={22} />
        <Poeira x={PL / 2} y={chao + 8} em={ate} n={14} />
      </>
    );
  } else if (jeito === 'holofote') {
    const t = f - de;
    const luz = t < ms(70) ? 1 : t < ms(140) ? 0 : t < ms(230) ? 1 : t < ms(290) ? 0.25 : 1;
    // Apaga seco: o holofote cai num quadro e o neon esfria em seguida.
    const desliga = f >= ate ? 1 : 0;
    const esfria = entre(f, ate, ate + ms(300), 0, 1);
    fundo = 0.9 * Math.min(1, t / ms(100)) * (1 - entre(f, ate, ate + ms(350), 0, 1));
    const neon = luz * (1 - esfria);
    titEl = (
      <span style={{ ...base, opacity: neon, transform: `scale(${1 + 0.03 * Math.sin(f / 5) * (1 - desliga)})`, color: '#ffe3e3', textShadow: `0 0 6px #fff, 0 0 18px ${cor}, 0 0 42px ${cor}, 0 0 80px ${cor}, 0 4px 0 #300` }}>{titulo}</span>
    );
    extra = (
      <div style={{ position: 'absolute', inset: 0, opacity: luz * (1 - desliga) }}>
        {/* O cone de luz do alto e a poça no chão */}
        <div style={{ position: 'absolute', left: PL / 2 - 520, top: -40, width: 1040, height: 520, clipPath: 'polygon(42% 0, 58% 0, 100% 100%, 0 100%)', background: 'linear-gradient(180deg, rgba(255,240,210,.5), rgba(255,240,210,.06))' }} />
        <div style={{ position: 'absolute', left: PL / 2 - 520, top: 420, width: 1040, height: 150, borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(255,235,200,.35), transparent)' }} />
      </div>
    );
  } else if (jeito === 'voo') {
    const ida = entre(f, de, de + ms(720), 0, 1, SUAVE);
    const vai = entre(f, ate, ate + SAIDA, 0, 1, ACELERA);
    const pos = (fr: number) => {
      const p = entre(fr, de, de + ms(720), 0, 1, SUAVE), q = entre(fr, ate, ate + SAIDA, 0, 1, ACELERA);
      return { x: (1 - p) * -1350 + q * 1450, y: -Math.sin(p * Math.PI) * 110 - q * 190 + Math.sin(fr / 10) * 5 };
    };
    const agora = pos(f);
    const rot = (1 - ida) * -14 + vai * 12 + Math.sin(f / 12) * 1.5;
    titEl = <span style={{ ...base, transform: `translate(${agora.x}px, ${agora.y}px) rotate(${rot}deg)`, textShadow: `${SOMBRA_TITULO}, 0 0 30px ${cor}aa` }}>{titulo}</span>;
    // O rastro de estrelinhas atrás (as posições dos quadros anteriores).
    const voando = ida < 1 || vai > 0;
    extra = voando ? (
      <>
        {Array.from({ length: 14 }, (_, k) => {
          const pp = pos(f - (k + 1) * 2);
          const lado = vai > 0 ? -1 : 1;
          const tamK = 10 - k * 0.5;
          return <div key={k} style={{
            position: 'absolute', left: PL / 2 + pp.x - lado * 430 + Math.sin(k * 7.3) * 18, top: topo + 80 + pp.y + Math.cos(k * 5.1) * 26,
            width: tamK, height: tamK, borderRadius: 2, transform: 'rotate(45deg)', background: k % 3 ? cor : '#fff4c2', opacity: (1 - k / 14) * 0.9, boxShadow: `0 0 10px ${cor}`,
          }} />;
        })}
      </>
    ) : null;
  } else {
    // pantano
    titEl = (
      <span style={{ ...base, textShadow: `${SOMBRA_TITULO}, 0 0 28px ${cor}99` }}>
        <Letras texto={titulo} estilo={(i) => {
          const e = entre(f, de + ms(45 * i), de + ms(45 * i) + ms(520), 0, 1, SUAVE);
          const q = entre(f, ate + ms(22 * i), ate + ms(22 * i) + ms(460), 0, 1, ACELERA);
          const mole = Math.sin(f / 6 + i * 0.9) * (5 * (1 - e) + 1.2);
          return {
            transformOrigin: '50% 0%',
            transform: `translateY(${(1 - e) * -34 + q * 70}px) scale(${1 - 0.25 * (1 - e) - 0.2 * q}, ${1.7 - 0.7 * e + 1.3 * q}) skewX(${mole}deg)`,
            opacity: e * (1 - q),
          };
        }} />
      </span>
    );
    // Pingos de lodo caindo das letras.
    const op = Math.min(1, (f - de) / ms(500)) * (1 - entre(f, ate, ate + SAIDA, 0, 1));
    extra = (
      <>
        {Array.from({ length: 9 }, (_, k) => {
          const x = PL / 2 - 380 + k * 95 + ((k * 37) % 30);
          const ciclo = ((f - de) * 2.2 + k * 41) % 90;
          return <div key={k} style={{ position: 'absolute', left: x, top: topo + 30 + tam + ciclo, width: 9, height: 14, borderRadius: '50% 50% 50% 50% / 60% 60% 40% 40%', background: cor, opacity: op * (1 - ciclo / 90) * 0.85, boxShadow: `0 0 8px ${cor}` }} />;
        })}
      </>
    );
  }

  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: PL, height: PA, pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(60% 42% at 50% 44%, rgba(4,2,12,1), rgba(4,2,12,0))', opacity: fundo }} />
      {extra}
      <div style={{ position: 'absolute', left: 0, right: 0, top: topo, display: 'grid', justifyItems: 'center', gap: 14 }}>
        <span style={{ font: `400 20px ${ARCADE}`, letterSpacing: '0.2em', textTransform: 'uppercase', color: cor, opacity: olhoOp, textShadow: `0 0 18px ${cor}88, 0 3px 0 #000` }}>{olho}</span>
        {titEl}
        <span style={{ font: `800 30px ${TEXTO}`, color: '#f4eefe', opacity: subOp, transform: `translateY(${(1 - subOp) * 12}px)`, textShadow: '0 2px 12px rgba(0,0,0,.8)' }}>{sub}</span>
      </div>
    </div>
  );
};

/** A etiqueta da fase no canto, enquanto ela acontece. */
const Etiqueta: React.FC<{ de: number; ate: number; olho: string; titulo: string; cor: string }> = ({ de, ate, olho, titulo, cor }) => {
  const f = useCurrentFrame();
  if (f < de || f > ate + ms(300)) return null;
  const e = mola(f, de, { mass: 0.8, stiffness: 170, damping: 18, overshootClamping: false });
  const sai = entre(f, ate, ate + ms(280), 0, 1, ACELERA);
  return (
    <div style={{
      position: 'absolute', left: 28, top: 26, display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px 10px 12px', borderRadius: 999,
      background: 'rgba(10,8,18,.82)', boxShadow: `0 0 0 1px rgba(255,255,255,.08), 0 0 0 5px ${cor}1f`,
      transform: `translateX(${(1 - Math.min(1, e)) * -260 - sai * 60}px)`, opacity: Math.min(1, e * 1.4) * (1 - sai),
    }}>
      <span style={{ width: 12, height: 12, borderRadius: 999, background: cor, boxShadow: `0 0 12px ${cor}` }} />
      <span style={{ font: `400 12px ${ARCADE}`, color: cor, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{olho}</span>
      <span style={{ font: `900 20px ${TEXTO}`, color: '#fff' }}>{titulo}</span>
    </div>
  );
};

type Abate = { f: number; icone: React.ReactNode; nome: string; acao: string; valor?: string; tag?: string; cor: string };

/** O placar de abates à direita, como num jogo de tiro. Some inteiro no fim da fase. */
const PlacarDeAbates: React.FC<{ itens: Abate[]; some: number; esquerda?: boolean }> = ({ itens, some, esquerda }) => {
  const f = useCurrentFrame();
  const sai = entre(f, some, some + ms(300), 0, 1, ACELERA);
  if (sai >= 1) return null;
  const vivos = itens.filter(a => f >= a.f);
  return (
    <div style={{ position: 'absolute', ...(esquerda ? { left: 26 } : { right: 26 }), top: 96, display: 'grid', justifyItems: esquerda ? 'start' : 'end', gap: 10, opacity: 1 - sai, transform: `translateX(${sai * (esquerda ? -40 : 40)}px)` }}>
      {vivos.map((a, i) => {
        const e = mola(f, a.f, { mass: 0.7, stiffness: 210, damping: 16, overshootClamping: false });
        const flash = 1 - entre(f, a.f, a.f + ms(380), 0, 1);
        return (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '9px 16px 9px 10px', borderRadius: 12,
            background: `linear-gradient(90deg, rgba(10,8,18,.9), rgba(10,8,18,.82))`, [esquerda ? 'borderRight' : 'borderLeft']: `4px solid ${a.cor}`,
            boxShadow: `0 10px 26px -12px rgba(0,0,0,.7), 0 0 ${24 * flash}px ${a.cor}`,
            transform: `translateX(${(1 - Math.min(1, e)) * (esquerda ? -340 : 340)}px) scale(${1 + 0.06 * flash})`, transformOrigin: esquerda ? '0% 50%' : '100% 50%', opacity: Math.min(1, e * 1.5),
          }}>
            <span style={{ display: 'grid', placeItems: 'center', width: 34, height: 34 }}>{a.icone}</span>
            <span style={{ font: `900 20px ${TEXTO}`, ...NOME }}>{a.nome}</span>
            {a.tag && <span style={{ font: `400 10px ${ARCADE}`, color: '#fff', background: '#c8202a', padding: '5px 7px', borderRadius: 4 }}>{a.tag}</span>}
            <span style={{ font: `700 17px ${TEXTO}`, color: 'rgba(255,255,255,.7)' }}>{a.acao}</span>
            {a.valor && <span style={{ font: `400 14px ${ARCADE}`, color: a.cor }}>{a.valor}</span>}
          </div>
        );
      })}
    </div>
  );
};

/** «PEGOU!»: o letreiro que pula do lugar do clique. */
const Letreiro: React.FC<{ x: number; y: number; em: number; texto: string; cor: string }> = ({ x, y, em, texto, cor }) => {
  const f = useCurrentFrame();
  const t = f - em;
  if (t < 0 || t > s(1.4)) return null;
  const e = mola(f, em, { mass: 0.6, stiffness: 260, damping: 12, overshootClamping: false });
  const sai = entre(f, em + s(0.9), em + s(1.4), 0, 1, ACELERA);
  return (
    <div style={{
      position: 'absolute', left: x, top: y, transform: `translate(-50%, -50%) translateY(${-60 * e - 40 * sai}px) scale(${0.4 + 0.6 * e}) rotate(-6deg)`, opacity: 1 - sai,
      font: `400 44px ${ARCADE}`, color: cor, textShadow: '4px 4px 0 #2a0d00, -2px -2px 0 #2a0d00, 2px -2px 0 #2a0d00, -2px 2px 0 #2a0d00, 0 0 30px rgba(255,170,60,.6)', whiteSpace: 'nowrap',
    }}>{texto}</div>
  );
};

/** O clarão do relâmpago: duas piscadas e some. */
const Relampago: React.FC<{ em: number[]; tambem?: { f: number; forca: number }[] }> = ({ em, tambem = [] }) => {
  const f = useCurrentFrame();
  let op = 0;
  for (const r of em) {
    const t = f - r;
    if (t < 0 || t > ms(700)) continue;
    op = Math.max(op, t < ms(60) ? 0.9 : t < ms(120) ? 0.15 : t < ms(180) ? 0.75 : 0.75 * (1 - (t - ms(180)) / ms(520)));
  }
  for (const c of tambem) {
    const t = f - c.f;
    if (t >= 0 && t < ms(160)) op = Math.max(op, c.forca * (1 - t / ms(160)));
  }
  if (op <= 0) return null;
  return <div style={{ position: 'absolute', inset: 0, background: '#eae6ff', opacity: op, mixBlendMode: 'screen', pointerEvents: 'none' }} />;
};

// ── As bruxas e a chefona (os palcos do app, no relógio virtual) ────────────

const emMs = (q: number) => (q / 60) * 1000;

const BruxasNaArena: React.FC<{ r: RoteiroArena }> = ({ r }) => {
  const b = r.bruxas;
  const rel = (q: number) => emMs(q - b.cartela);
  // `onde` em pixels da arte: o palco tem 1600 / 1,4 / 1,5 ≈ 762 de largura.
  const comandos: Comando<PalcoBruxas>[] = [
    { t: rel(b.soltas[0]), fazer: p => { p.soltar(FEIOSA, { x: 470, y: 80 }); } },
    { t: rel(b.soltas[1]), fazer: p => { p.soltar(VAMPIRA, { x: 170, y: 120 }); } },
    { t: rel(b.tiros[0]), fazer: p => atirarNa(p, 'cabeca') },
    { t: rel(b.tiros[1]), fazer: p => atirarNa(p, 'tronco') },
  ];
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: PL / ZOOM_BRUXA, height: PA / ZOOM_BRUXA, transform: `scale(${ZOOM_BRUXA})`, transformOrigin: '0 0', overflow: 'hidden', pointerEvents: 'none' }}>
      <PalcoVirtual<PalcoBruxas>
        inicio={b.cartela} fim={b.fim + s(0.5)} semente={14}
        criar={host => new PalcoBruxas(host, { escala: ESCALA_BRUXAS })}
        comandos={comandos}
      />
    </div>
  );
};

const PantanoNaArena: React.FC<{ r: RoteiroArena; raiz: () => HTMLElement | null }> = ({ r, raiz }) => {
  const p = r.pantano;
  const rel = (q: number) => emMs(q - p.chega);
  const jogar = (fe: Parameters<PalcoChefona['conjurar']>[0], v: string) => (pc: PalcoChefona) => { pc.conjurar(fe, v); semPocaoSozinha(pc); };
  const comandos: Comando<PalcoChefona>[] = [
    { t: 0, fazer: (pc: PalcoChefona) => { pc.soltar({ esperaS: 0 }); semPocaoSozinha(pc); } },
    ...p.tirosNela.map(t => ({ t: rel(t), fazer: (pc: PalcoChefona) => pc.tiroDeOutro() })),
    // Os recordes das lápides viram negativos; o nome delas sai do avesso; a tela vira negativo; e a escuridão.
    { t: rel(p.pocoes[0]), fazer: jogar('dano', 'negativo') },
    { t: rel(p.pocoes[1]), fazer: jogar('estranha', 'avesso') },
    { t: rel(p.pocoes[2]), fazer: jogar('visao', 'negativo') },
    { t: rel(p.escuridao), fazer: jogar('cegueira', 'escuridao') },
  ].sort((a, b) => a.t - b.t);
  return (
    <PalcoVirtual<PalcoChefona>
      inicio={p.chega} fim={p.fim} semente={16}
      criar={host => {
        const pc = new PalcoChefona(host, { escudo: false, contagem: false, alvos: alvosPorAtributo(() => raiz(), () => raiz()) });
        const a = pc as unknown as ChefonaAberta;
        a.leve = false;
        a.raiz.classList.remove('leve');
        feiticosLeves(false);
        return pc;
      }}
      comandos={comandos}
      extras={() => [...document.querySelectorAll('body > .bx-enf-veu')]}
    />
  );
};

// ── A arena inteira ─────────────────────────────────────────────────────────

/** O mouse de quem achou a abóbora, nas coordenadas da arena. */
function mouseDaAbobora(c: CenaAbobora): PontoCursor[] {
  const cx = (c.x + 22) * ZOOM_ABOBORA, cy = (c.y + 24) * ZOOM_ABOBORA;
  return [
    { f: c.chega + ms(500), x: 1380, y: 760 },
    { f: c.mouseEmCima + ms(50), x: cx, y: cy, viagemMs: 1000 },
    { f: c.clique + ms(500), x: cx + 4, y: cy + 2 },
    { f: c.clique + s(1.6), x: 1500, y: 800, viagemMs: 1000 },
  ];
}

export const Arena: React.FC<{ r: RoteiroArena }> = ({ r }) => {
  const f = useCurrentFrame();
  const raiz = useMemo(() => ({ el: null as HTMLDivElement | null }), []);
  const lista = useMemo(() => impactos(r), [r]);
  const fs = useMemo(() => fases(r), [r]);
  const pedras = useMemo(() => lapides(r), [r]);
  const mouse = useMemo(() => mouseDaAbobora(r.abobora.cena), [r]);
  /*
   * O véu da Cegueira (a escuridão) mora no `body`, fora do palco, e só sai
   * quando o feitiço acaba no relógio do palco — que para no fim da arena.
   * Sem isto o escuro ficava por cima da montagem até o fim (06/11).
   */
  useLayoutEffect(() => {
    if (f >= r.pantano.chega && f < r.pantano.fim) return;
    document.querySelectorAll('body > .bx-enf-veu').forEach(el => el.remove());
  }, [f, r]);
  if (f < r.inicio || f >= r.fim) return null;

  // A câmera desce do céu (a lua) até o chão do cemitério.
  const desce = entre(f, r.inicio, r.inicio + s(2.2), 0, 1, SUAVE_IDA_VOLTA);
  const subida = (1 - desce) * 380;
  const entra = entre(f, r.inicio, r.inicio + ms(600), 0, 1);
  const tr = tremor(f, lista);
  // Um zoom de leve nos chefões.
  const zoom = 1 + 0.035 * Math.max(
    entre(f, r.rei.chefe.entra, r.rei.chefe.entra + s(1.2), 0, 1) * (1 - entre(f, r.rei.chefe.foge, r.rei.chefe.foge + s(1.2), 0, 1)),
    entre(f, r.pantano.chega, r.pantano.chega + s(1.2), 0, 1),
  );

  const zb = r.zumbis;
  const abatesZumbi: Abate[] = zb.cacadas.map(c => ({
    f: c.tiro + ms(220), icone: <CabecaZumbi zumbi={ZUMBIS[c.zumbi]} escala={2} />, nome: c.quem,
    tag: c.jeito === 'cabeca' ? 'HEADSHOT' : undefined, acao: `matou ${ZUMBIS[c.zumbi].nome} em`, valor: formatarTempo(c.msTiro), cor: '#8fd14f',
  }));
  const abatesBruxa: Abate[] = r.bruxas.tiros.map((t, i) => ({
    f: t + ms(260), icone: <span style={{ fontSize: 26 }}>🧹</span>, nome: PLACAR_BRUXAS[i + 1].nome.split(' ').slice(0, 2).join(' '),
    tag: i === 0 ? 'HEADSHOT' : undefined, acao: 'derrubou uma bruxa em', valor: formatarTempo(PLACAR_BRUXAS[i + 1].ms), cor: '#b48cff',
  }));
  const abatesPantano: Abate[] = BRUXA_DO_PANTANO.top.map((g, i) => ({
    f: r.pantano.top[i], icone: <span style={{ font: `400 14px ${ARCADE}`, color: '#5fe38a' }}>{i + 1}º</span>, nome: g.nome.split(' ').slice(0, 2).join(' '),
    acao: 'de dano', valor: g.dano.toLocaleString('pt-BR'), cor: '#5fe38a',
  }));

  return (
    <AbsoluteFill style={{ opacity: entra, overflow: 'hidden' }}>
      <div style={{
        position: 'absolute', left: 0, top: 0, width: PL, height: PA, transformOrigin: '0 0',
        transform: `scale(${ESC})`,
      }}>
        {/* O mundo: tudo que treme com a câmera. É ele que contém os palcos (position: fixed). */}
        <div style={{
          position: 'absolute', inset: 0, overflow: 'hidden', transformOrigin: '50% 60%',
          transform: `translate(${tr.x}px, ${tr.y}px) rotate(${tr.rot}deg) scale(${zoom})`,
        }}>
          {/* A raiz das poções: céu, cenário e lápides (não os palcos). */}
          <div ref={el => { raiz.el = el; }} style={{ position: 'absolute', inset: 0 }}>
            <Ceu subida={subida} />
            <Morcegos subida={subida} />
            <div style={{ position: 'absolute', inset: 0, transform: `translateY(${subida}px)` }}>
              <Fundo />
              {pedras.map(d => <Lapide key={d.titulo} d={d} />)}
              <Chao />
              <Nevoa />
            </div>
          </div>

          <div style={{ position: 'absolute', inset: 0, transform: `translateY(${subida}px)` }}>
            {/* 1. A abóbora */}
            <div style={{ position: 'absolute', left: 0, top: 0, width: PL / ZOOM_ABOBORA, height: PA / ZOOM_ABOBORA, transform: `scale(${ZOOM_ABOBORA})`, transformOrigin: '0 0' }}>
              <AboboraNaTela c={r.abobora.cena} />
              <Estouro x={r.abobora.cena.x + 20} y={r.abobora.cena.y + 20} em={r.abobora.cena.clique} />
            </div>
            <Poeira x={(r.abobora.cena.x + 20) * ZOOM_ABOBORA} y={700} em={r.abobora.cena.chega} n={10} />
            <Letreiro x={(r.abobora.cena.x + 20) * ZOOM_ABOBORA} y={r.abobora.cena.y * ZOOM_ABOBORA} em={r.abobora.cena.clique + ms(60)} texto="PEGOU!" cor="#ffb340" />

            {/* 2. Os zumbis */}
            {f >= zb.cartela && f < zb.fim + s(1) && (
              <div style={{ position: 'absolute', left: 0, top: 0, width: PL / ZOOM_ZUMBI, height: PA / ZOOM_ZUMBI, transform: `scale(${ZOOM_ZUMBI})`, transformOrigin: '0 0' }}>
                <div style={{ position: 'absolute', inset: 0, opacity: 1 - entre(f, zb.fim, zb.fim + ms(600), 0, 1) }}><Cacadas cacadas={zb.cacadas} /></div>
                <Mira cacadas={zb.cacadas} entra={zb.mira.entra} sai={zb.mira.sai} />
              </div>
            )}

            {/* 3. O Rei do Pop */}
            <div style={{ position: 'absolute', left: 0, top: 0, width: PL / ZOOM_REI, height: PA / ZOOM_REI, transform: `scale(${ZOOM_REI})`, transformOrigin: '0 0' }}>
              <ReiDoPop r={r.rei.chefe} />
            </div>

            {/* 4. As bruxas */}
            {f >= r.bruxas.cartela && f < r.bruxas.fim + s(0.5) && <BruxasNaArena r={r} />}
          </div>

          {/* 5. A Bruxa do Pântano (tela inteira da arena) */}
          {f >= r.pantano.chega && <PantanoNaArena r={r} raiz={() => raiz.el} />}

          <Seta pontos={mouse} cliques={[r.abobora.cena.clique]} tamanho={1.5} />
        </div>

        {/* O que não treme: placar, etiqueta, cartelas */}
        <PlacarDeAbates itens={abatesZumbi} some={zb.fim} />
        <PlacarDeAbates itens={abatesBruxa} some={r.bruxas.fim} />
        <PlacarDeAbates itens={abatesPantano} some={r.pantano.escuridao} esquerda />
        {fs.map(fz => <Etiqueta key={fz.titulo} de={fz.cartelaSai} ate={fz.fim - ms(300)} olho={fz.olho} titulo={fz.titulo} cor={fz.cor} />)}
        <Cartela de={r.abertura.titulo} ate={r.abertura.tituloSai} olho="Outubro no Gestão" titulo="As Caças de Outubro" sub="Relembra quem caçou o quê." cor="#ff8a1c" jeito="tranco" grande />
        {fs.map(fz => <Cartela key={fz.titulo} de={fz.cartela} ate={fz.cartelaSai} olho={fz.olho} titulo={fz.titulo} sub={fz.sub} cor={fz.cor} jeito={fz.jeito} />)}
        <Relampago em={[r.abertura.raio, r.pantano.raio]} tambem={zb.cacadas.filter(c => c.jeito === 'cabeca').map(c => ({ f: c.tiro, forca: 0.18 }))} />
        {/* Vinheta */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(120% 90% at 50% 45%, transparent 55%, rgba(0,0,0,.55) 100%)' }} />
      </div>
      <PretoDaPocao r={r.pantano} f={f} />
    </AbsoluteFill>
  );
};

// ── O som ───────────────────────────────────────────────────────────────────

const so = (arquivo: string) => staticFile(arquivo);

const Efeito: React.FC<{ em: number; src: string; volume: number; dura?: number }> = ({ em, src, volume, dura = 2 }) => (
  <Sequence from={Math.max(0, em)} durationInFrames={s(dura)}><Audio src={so(src)} volume={volume} /></Sequence>
);

/** O som de cada jeito de cartela: entrada e saída diferentes em cada fase. */
const SomDaCartela: React.FC<{ de: number; ate: number; jeito: Jeito; letras: number }> = ({ de, ate, jeito, letras }) => {
  if (jeito === 'letras') return (
    <>
      <Efeito em={de} src="natal/arena/brilho.wav" volume={0.32} />
      {[0, 1, 2].map(k => <Efeito key={k} em={de + ms(55 * Math.round((k * letras) / 3))} src="natal/caca/pop.wav" volume={0.14} dura={0.6} />)}
      <Efeito em={ate} src="natal/bruxas/puf.wav" volume={0.26} />
    </>
  );
  if (jeito === 'cova') return (
    <>
      <Efeito em={de + ms(150)} src="natal/caca/gemido.wav" volume={0.45} />
      <Efeito em={de + ms(700)} src="natal/caca/baque-forte.wav" volume={0.32} />
      <Efeito em={ate + ms(250)} src="natal/caca/baque-fraco.wav" volume={0.24} />
    </>
  );
  if (jeito === 'holofote') return (
    <>
      <Efeito em={de - ms(320)} src="natal/arena/arranhao.wav" volume={0.42} />
      <Efeito em={de} src="natal/arena/holofote.wav" volume={0.55} />
      <Efeito em={de + ms(520)} src="natal/chefao/hee-hee.wav" volume={0.5} />
      <Efeito em={ate} src="natal/arena/holofote.wav" volume={0.42} />
    </>
  );
  if (jeito === 'voo') return (
    <>
      <Efeito em={de - ms(150)} src="natal/bruxas/vento.wav" volume={0.32} />
      <Efeito em={de} src="sons/whoosh.wav" volume={0.38} />
      <Efeito em={de + ms(600)} src="natal/bruxas/gargalhada.wav" volume={0.32} />
      <Efeito em={ate} src="sons/whoosh.wav" volume={0.3} />
    </>
  );
  // pantano (o trovão do relâmpago já toca pelo roteiro)
  return (
    <>
      <Efeito em={de + ms(100)} src="natal/arena/borbulha.wav" volume={0.5} />
      <Efeito em={de + ms(350)} src="natal/chefona/encantar-2.ogg" volume={0.32} />
      <Efeito em={ate} src="natal/caca/plof.wav" volume={0.34} />
    </>
  );
};

/**
 * A mixagem (06/11/2026): o tema do Halloween é a cama do começo ao apagão,
 * a ~0,42; quando a briga aperta (a chuva de tiros no Rei do Pop, a luta com
 * a chefona) ele desce para ~0,26 para os efeitos aparecerem. No Rei do Pop
 * (08/11/2026) ele quase some e toca a trilha de 8 bits do chefão, com o
 * pulo, o pé do moonwalk e a fúria de quando perde um braço — uma música de
 * cada vez. Cada cartela tem a subida antes e o impacto grave no tranco; o
 * vidro das poções e o apagão fecham.
 */
export const SonsDaArena: React.FC<{ r: RoteiroArena }> = ({ r }) => {
  const fs = fases(r);
  const rc = r.rei.chefe;
  const p = r.pantano;
  const ALTO = 0.42, BAIXO = 0.26;
  // No Rei do Pop o Halloween quase some e entra a trilha de 8 bits dele (08/11/2026).
  const SOB_O_REI = 0.04;
  const pontos = [r.inicio, r.abertura.titulo, r.rei.cartela - ms(300), r.rei.cartela + ms(400), rc.sai - ms(200), rc.sai + ms(800), p.chega, p.chega + s(0.6), p.apaga, p.preto];
  const valores = [0.12, ALTO, ALTO, SOB_O_REI, SOB_O_REI, ALTO, ALTO, BAIXO, BAIXO, 0];
  const musica = (q: number) => interpolate(q + r.inicio, pontos, valores, { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const durRei = rc.sai - rc.entra;
  const trilhaDoRei = (q: number) => interpolate(q, [0, ms(500), s(2.2), s(2.6), durRei - s(1.2), durRei], [0, 0.38, 0.38, 0.27, 0.27, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <>
      <Sequence from={r.inicio} durationInFrames={p.preto - r.inicio + s(0.3)}>
        <Audio src={so('natal/halloween.mp3')} volume={musica} />
      </Sequence>

      {/* A abertura: a câmera descendo, o trovão, o título */}
      <Efeito em={r.inicio} src="sons/whoosh.wav" volume={0.3} />
      <Efeito em={r.abertura.raio} src="natal/arena/trovao.wav" volume={0.55} dura={3.5} />
      <Efeito em={r.abertura.titulo - s(1.3) + ms(130)} src="natal/arena/subida.wav" volume={0.22} />
      <Efeito em={r.abertura.titulo + ms(110)} src="natal/arena/impacto.wav" volume={0.6} />

      {/* As cartelas */}
      {fs.map(fz => <SomDaCartela key={fz.titulo} de={fz.cartela} ate={fz.cartelaSai} jeito={fz.jeito} letras={fz.titulo.length} />)}

      {/* As lápides subindo */}
      {[r.abobora.lapide, r.zumbis.lapide, r.rei.lapide, r.bruxas.lapide].map(t => (
        <Efeito key={`l${t}`} em={t + ms(520)} src="sons/ding.wav" volume={0.14} dura={1.4} />
      ))}

      {/* 1. A abóbora */}
      <Efeito em={r.abobora.cena.clique} src="sons/clique.wav" volume={0.4} />
      <Efeito em={r.abobora.cena.clique + ms(80)} src="sons/festa.wav" volume={0.28} />

      {/* 2. Os zumbis: os sons da física do app */}
      {r.zumbis.cacadas.map(c => <SonsDaCaca key={c.zumbi} c={c} enxuto />)}

      {/* 3. O Rei do Pop com a trilha de 8 bits dele: sobe na entrada, abaixa
          na chuva de tiros (os acertos, o braço, a fúria aparecem) e some na fuga. */}
      <SonsDoChefao r={rc} trilha={trilhaDoRei} volume={0.85} enxuto />

      {/* 4. As bruxas de vassoura: o puf e a gargalhada; o tiro, o grito e o tombo */}
      {r.bruxas.soltas.map(t => (
        <Sequence key={`s${t}`} from={t} durationInFrames={s(1.5)}>
          <Audio src={so('natal/bruxas/puf.wav')} volume={0.3} />
          <Sequence from={ms(160)}><Audio src={so('natal/bruxas/gargalhada.wav')} volume={0.32} /></Sequence>
        </Sequence>
      ))}
      {r.bruxas.tiros.map((t, i) => (
        <Sequence key={`t${t}`} from={t} durationInFrames={s(2.4)}>
          <Audio src={so('natal/caca/tiro.wav')} volume={0.4} />
          <Audio src={so(i === 0 ? 'natal/caca/cerebro.wav' : 'natal/caca/acerto.wav')} volume={0.42} />
          <Sequence from={ms(120)}><Audio src={so('natal/bruxas/grito.wav')} volume={0.3} /></Sequence>
          <Sequence from={ms(900)}><Audio src={so('natal/bruxas/espatifa.wav')} volume={0.34} /></Sequence>
        </Sequence>
      ))}

      {/* 5. A Bruxa do Pântano */}
      <Efeito em={p.raio} src="natal/arena/trovao.wav" volume={0.5} dura={3.5} />
      <Efeito em={p.chega} src="natal/chefona/teleporte-1.ogg" volume={0.5} />
      <Efeito em={p.chega + ms(200)} src="natal/chefona/bruxa-ri-1.ogg" volume={0.6} />
      {p.tirosNela.filter((_, i) => i % 6 === 0).map((t, i) => (
        <Sequence key={`n${t}`} from={t} durationInFrames={s(1)}>
          <Audio src={so('natal/caca/acerto.wav')} volume={0.13} />
          {i % 2 === 0 && <Audio src={so(`natal/chefona/bruxa-dano-${(i / 2) % 3 + 1}.ogg`)} volume={0.32} />}
        </Sequence>
      ))}
      {[...p.pocoes, p.escuridao].map((t, i) => (
        <Sequence key={`p${t}`} from={t} durationInFrames={s(3)}>
          <Audio src={so(`natal/chefona/bruxa-ri-${(i % 4) + 2}.ogg`)} volume={0.45} />
          <Sequence from={s(1.4)}><Audio src={so('natal/chefona/arremesso.ogg')} volume={0.4} /></Sequence>
        </Sequence>
      ))}
      {p.quebras.map((t, i) => (
        <Sequence key={`v${t}`} from={t} durationInFrames={s(2)}>
          <Audio src={so(`natal/chefona/vidro-${(i % 3) + 1}.ogg`)} volume={0.5} />
        </Sequence>
      ))}
      {/* O apagão: o soco grave no escuro */}
      <Efeito em={p.preto - ms(60)} src="natal/arena/impacto.wav" volume={0.5} />
    </>
  );
};

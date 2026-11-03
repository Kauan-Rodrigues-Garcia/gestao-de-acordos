/**
 * Lendas.tsx — a arte das LENDAS DE OUTUBRO: as três pessoas que completaram o
 * álbum, com as cinco insígnias. O Kauan pediu em 26/10/2026 «uma arte foda
 * para representar o top 3 que possuem as 5 insígnias», e, na segunda volta,
 * as insígnias DO GESTÃO (não redesenhadas), a estética das placas e um card
 * solo para cada um.
 *
 * Por isso é React, e não canvas: as medalhas são o próprio `Medalha.tsx`, e
 * o visual sai das placas do hover (`insignias.css`): borda em degrau, letra
 * de fliperama. Em 28/10 o fundo virou a noite de Halloween (`NoiteDasLendas`)
 * e os pedestais, pedra de cripta com vela. Duas peças:
 *
 *   - `PodioDasLendas`: as três juntas (1920 × 1080);
 *   - `CartaoDaLenda`: um card de cada (1080 × 1350).
 *
 * O ranking é o da pontuação (`../pontuacao.ts`), lido do banco em 26/10.
 */
import { INSIGNIAS, type Conquista, type IdInsignia } from '../insignias';
import { Medalha } from '../Medalha';
import '../insignias.css';
import './lendas.css';

export interface Lenda {
  posicao: 1 | 2 | 3;
  nome: string;
  setor: string;
  pontos: number;
  pegos: number;
  naCabeca: number;
  chefes: number;
  golpeFinal: boolean;
}

/** O top 3 da pontuação de 26/10/2026: as únicas três com as cinco. */
export const LENDAS: readonly Lenda[] = [
  { posicao: 1, nome: 'Erika Eduarda', setor: 'Receptivo', pontos: 630, pegos: 2, naCabeca: 1, chefes: 3, golpeFinal: true },
  { posicao: 2, nome: 'Ayslan Silva', setor: 'Play 2', pontos: 595, pegos: 3, naCabeca: 2, chefes: 3, golpeFinal: false },
  { posicao: 3, nome: 'Nicole Pacheco', setor: 'Receptivo', pontos: 575, pegos: 3, naCabeca: 0, chefes: 3, golpeFinal: false },
];

/** O que a medalha lê: só o desenho (o primeiro zumbi e a primeira bruxa). */
const CONQUISTA: Conquista = {
  vezes: 1, primeiraEm: '', ultimaEm: '', desenho: 0, headshots: 0, melhorMs: null, golpeFinal: false, maiorDano: 0,
};

/** O nome curto de cada gincana, embaixo da medalha. */
const CURTO: Readonly<Record<IdInsignia, string>> = {
  zumbi: 'Zumbis',
  reiDoPop: 'Rei do Pop',
  bruxas: 'Bruxas',
  pantano: 'Pântano',
  guerra: 'Guerra',
};

function iniciais(nome: string): string {
  const p = nome.trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase() || '?';
}

function Foto({ lenda, foto }: { lenda: Lenda; foto?: string }) {
  return (
    <div className="lenda-foto">
      {foto ? <img src={foto} alt="" draggable={false} /> : <span className="lenda-iniciais">{iniciais(lenda.nome)}</span>}
    </div>
  );
}

/** A barra com as cinco medalhas penduradas, como a do topo do app. */
function Varal({ tam, rotulos }: { tam: number; rotulos?: boolean }) {
  return (
    <div className="lenda-varal" style={{ ['--tam-medalha' as string]: `${tam}px` }}>
      {INSIGNIAS.map(ins => (
        <div key={ins.id} className="lenda-varal-item">
          <Medalha insignia={ins} conquista={CONQUISTA} tam={tam} pendurada />
          {rotulos && <span className="lenda-varal-rotulo">{CURTO[ins.id]}</span>}
        </div>
      ))}
    </div>
  );
}

// ── A noite de Halloween (28/10/2026) ───────────────────────────────────────
//
// As bandeirinhas e o fundo listrado davam festa junina (pedido de 28/10:
// «não está com um clima de Halloween, está com um clima de festa junina»).
// O fundo virou a noite dos cartazes de terror antigos, em pixel grosso (um
// ponto = 8 px): o céu roxo em faixas, a lua cheia com os morcegos, o
// cemitério em silhueta nas beiradas (as lápides, a cerca, a árvore seca), as
// abóboras acesas no chão e a neblina passando. Nos cantos, as teias.

type Rect = readonly [number, number, number, number, string];

/** Um disco em pixel: uma linha de retângulos por altura. */
function disco(cx: number, cy: number, r: number, cor: string): Rect[] {
  const out: Rect[] = [];
  for (let y = -r; y <= r; y++) {
    const m = Math.floor(Math.sqrt(r * r - y * y));
    out.push([cx - m, cy + y, m * 2 + 1, 1, cor]);
  }
  return out;
}

/** Uma lápide de topo redondo, com a cruz (ou o R.I.P. de três riscos). */
function lapide(x: number, chao: number, l: number, a: number, cor: string, cruz: boolean): Rect[] {
  const r = Math.floor(l / 2);
  const out: Rect[] = [...disco(x + r, chao - a + r, r, cor), [x, chao - a + r, l, a - r, cor]];
  if (cruz) out.push([x + r, chao - a + 3, 1, 5, '#05030a'], [x + r - 1, chao - a + 4, 3, 1, '#05030a']);
  else for (let i = 0; i < 3; i++) out.push([x + 2, chao - a + 4 + i * 2, l - 4, 1, '#05030a']);
  return out;
}

/** Um morcego de 7 × 3, asas abertas. */
function morcego(x: number, y: number): Rect[] {
  const c = '#05030a';
  return [[x, y, 2, 1, c], [x + 5, y, 2, 1, c], [x + 1, y + 1, 5, 1, c], [x + 3, y, 1, 1, c], [x + 2, y + 2, 1, 1, c], [x + 4, y + 2, 1, 1, c]];
}

/** Uma abóbora acesa de 7 × 6 no chão. */
function abobora(x: number, chao: number): Rect[] {
  const y = chao - 6;
  return [
    [x + 3, y, 1, 1, '#3d5a1a'],
    [x + 1, y + 1, 5, 5, '#e8731a'], [x, y + 2, 7, 3, '#e8731a'],
    [x + 1, y + 2, 1, 1, '#ffd34d'], [x + 5, y + 2, 1, 1, '#ffd34d'],
    [x + 2, y + 4, 3, 1, '#ffd34d'], [x + 1, y + 5, 5, 1, '#b8500e'],
  ];
}

const NOITE: readonly Rect[] = (() => {
  const L = 240, chao = 128;
  const r: Rect[] = [];
  // O céu em faixas, do preto ao roxo e ao vinho no horizonte.
  const faixas = ['#07040d', '#0a0612', '#0e0818', '#130a20', '#190c28', '#200e2e', '#281032', '#301232', '#391430'];
  faixas.forEach((cor, i) => r.push([0, i * 15, L, 15, cor]));
  // As estrelas.
  for (const [x, y] of [[14, 8], [36, 20], [58, 6], [84, 14], [112, 4], [140, 18], [166, 9], [26, 40], [72, 34], [150, 36], [230, 12], [8, 60], [98, 28]] as const) {
    r.push([x, y, 1, 1, '#cfc3e8']);
  }
  // A lua cheia, o halo e as crateras.
  r.push(...disco(204, 30, 24, 'rgb(255 236 170 / 0.06)'), ...disco(204, 30, 19, 'rgb(255 236 170 / 0.1)'));
  r.push(...disco(204, 30, 15, '#f3e6b0'));
  r.push(...disco(199, 26, 3, '#dccb8c'), ...disco(210, 35, 2, '#dccb8c'), ...disco(208, 23, 1, '#dccb8c'), ...disco(197, 36, 2, '#e6d69c'));
  // Os morcegos passando na frente da lua.
  r.push(...morcego(186, 22), ...morcego(214, 40), ...morcego(176, 44), ...morcego(28, 26));
  // Os morros ao longe e o chão.
  for (let x = 0; x < L; x += 4) {
    const h = Math.round(16 + 7 * Math.sin(x / 19) + 4 * Math.sin(x / 7.3));
    r.push([x, chao - h, 4, h, '#1a0c24']);
  }
  r.push([0, chao - 6, L, 7, '#0b0610']);
  // A árvore seca da esquerda.
  r.push([12, chao - 46, 3, 46, '#05030a'], [6, chao - 40, 6, 1, '#05030a'], [5, chao - 44, 1, 4, '#05030a'],
    [15, chao - 34, 7, 1, '#05030a'], [21, chao - 38, 1, 4, '#05030a'], [10, chao - 50, 1, 4, '#05030a'], [15, chao - 54, 1, 8, '#05030a'],
    [16, chao - 54, 3, 1, '#05030a'], [9, chao - 50, 1, 1, '#05030a']);
  // A cerca do cemitério, nas duas beiradas.
  for (const [de, ate] of [[0, 30], [212, L]] as const) {
    r.push([de, chao - 12, ate - de, 1, '#05030a']);
    for (let x = de + 1; x < ate; x += 4) r.push([x, chao - 16, 1, 16, '#05030a'], [x, chao - 17, 1, 1, '#2a1c36']);
  }
  // As lápides.
  r.push(...lapide(24, chao, 9, 14, '#0a0710', true), ...lapide(4, chao, 7, 10, '#0a0710', false));
  r.push(...lapide(214, chao, 9, 15, '#0a0710', false), ...lapide(228, chao, 7, 11, '#0a0710', true));
  // As abóboras acesas.
  r.push(...abobora(34, chao), ...abobora(198, chao), ...abobora(12, chao + 1));
  return r;
})();

function NoiteDasLendas() {
  return (
    <div className="lenda-noite" aria-hidden>
      <svg viewBox="0 0 240 135" preserveAspectRatio="xMidYMid slice" shapeRendering="crispEdges">
        {NOITE.map(([x, y, l, a, cor], i) => <rect key={i} x={x} y={y} width={l} height={a} fill={cor} />)}
      </svg>
      <span className="lenda-neblina" />
      <span className="lenda-neblina lenda-neblina-2" />
    </div>
  );
}

/** A teia de canto (a mesma conta da `CenaHalloween`): sete raios e sete voltas. */
const TEIA = (() => {
  const raios = 7, voltas = 7, d: string[] = [];
  const ang = (i: number) => (Math.PI / 2) * (i / (raios - 1));
  const p = (a: number, r: number) => `${(Math.cos(a) * r).toFixed(1)} ${(Math.sin(a) * r).toFixed(1)}`;
  for (let i = 0; i < raios; i++) d.push(`M0 0 L${p(ang(i), 100 * (0.92 + 0.08 * Math.sin(i * 2.3)))}`);
  for (let k = 1; k <= voltas; k++) {
    const r = 100 * (k / voltas) * 0.9;
    for (let i = 0; i < raios - 1; i++) {
      if (k === 5 && i === 3) continue;
      const a1 = ang(i), a2 = ang(i + 1);
      d.push(`M${p(a1, r)} Q${p((a1 + a2) / 2, r * 0.86)} ${p(a2, r)}`);
    }
  }
  return d.join(' ');
})();

function Teias() {
  return (
    <>
      <svg className="lenda-teia" viewBox="0 0 100 100" aria-hidden><path d={TEIA} /></svg>
      <svg className="lenda-teia lenda-teia-direita" viewBox="0 0 100 100" aria-hidden><path d={TEIA} /></svg>
    </>
  );
}

// ── O pódio ─────────────────────────────────────────────────────────────────

export function PodioDasLendas({ fotos }: { fotos: Partial<Record<1 | 2 | 3, string>> }) {
  const ordem = [2, 1, 3] as const;
  return (
    <div id="podio" className="lenda-quadro lenda-podio">
      <NoiteDasLendas />
      <Teias />
      <header className="lenda-cabeca">
        <p className="lenda-selo">OUTUBRO 2026</p>
        <h1 className="lenda-titulo">Lendas de Outubro</h1>
        <p className="lenda-sub">Quem completou o álbum: 5 de 5 insígnias</p>
      </header>
      <div className="lenda-degraus">
        {ordem.map(p => {
          const l = LENDAS.find(x => x.posicao === p)!;
          return (
            <div key={p} className={`lenda-coluna lenda-lugar-${p}`}>
              <div className="lenda-pessoa">
                <Foto lenda={l} foto={fotos[p]} />
                <p className="lenda-nome">{l.nome}</p>
                <p className="lenda-setor">{l.setor}{l.golpeFinal && <span className="lenda-golpe"> · golpe final</span>}</p>
              </div>
              <div className="lenda-pedestal">
                <span className="lenda-vela" aria-hidden />
                <span className="lenda-vela lenda-vela-direita" aria-hidden />
                <Varal tam={p === 1 ? 64 : 56} />
                <p className="lenda-numero">{p}</p>
                <p className="lenda-pontos">{l.pontos} PTS</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── O card solo ─────────────────────────────────────────────────────────────

export function CartaoDaLenda({ lenda: l, foto }: { lenda: Lenda; foto?: string }) {
  const numeros: [number | string, string][] = [
    [l.pontos, 'pontos'],
    [l.pegos, l.pegos === 1 ? 'zumbi ou bruxa' : 'zumbis e bruxas'],
    [l.naCabeca, 'na cabeça'],
    [l.chefes, l.chefes === 1 ? 'chefe derrubado' : 'chefes derrubados'],
  ];
  return (
    <div id={`cartao-${l.posicao}`} className={`lenda-quadro lenda-cartao lenda-lugar-${l.posicao}`}>
      <NoiteDasLendas />
      <Teias />
      <header className="lenda-cartao-topo">
        <span className="lenda-selo">TOP {l.posicao}</span>
        <span className="lenda-selo">5/5</span>
      </header>
      <h1 className="lenda-titulo">Lendas de Outubro</h1>
      <Foto lenda={l} foto={foto} />
      <p className="lenda-nome">{l.nome}</p>
      <p className="lenda-setor">{l.setor}{l.golpeFinal && <span className="lenda-golpe"> · golpe final</span>}</p>
      <div className="lenda-cartao-medalhas">
        <Varal tam={104} rotulos />
      </div>
      <dl className="lenda-numeros">
        {numeros.map(([n, rotulo]) => (
          <div key={rotulo}>
            <dt>{n}</dt>
            <dd>{rotulo}</dd>
          </div>
        ))}
      </dl>
      <p className="lenda-rodape">Álbum de insígnias · Gestão de Acordos · outubro de 2026</p>
    </div>
  );
}

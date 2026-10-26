/**
 * Lendas.tsx — a arte das LENDAS DE OUTUBRO: as três pessoas que completaram o
 * álbum, com as cinco insígnias. O Kauan pediu em 26/10/2026 «uma arte foda
 * para representar o top 3 que possuem as 5 insígnias», e, na segunda volta,
 * as insígnias DO GESTÃO (não redesenhadas), a estética das placas e um card
 * solo para cada um.
 *
 * Por isso é React, e não canvas: as medalhas são o próprio `Medalha.tsx`, e
 * o visual sai das placas do hover (`insignias.css`): noite listrada, borda em
 * degrau, letra de fliperama, bandeirinhas das bruxas. Duas peças:
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

function Bandeirinhas() {
  return <div className="lenda-bandeirinhas" aria-hidden />;
}

// ── O pódio ─────────────────────────────────────────────────────────────────

export function PodioDasLendas({ fotos }: { fotos: Partial<Record<1 | 2 | 3, string>> }) {
  const ordem = [2, 1, 3] as const;
  return (
    <div id="podio" className="lenda-quadro lenda-podio">
      <Bandeirinhas />
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
      <Bandeirinhas />
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

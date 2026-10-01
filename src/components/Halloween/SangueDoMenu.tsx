/**
 * SangueDoMenu — a aba selecionada do menu ganha sangue escorrendo da borda
 * de baixo.
 *
 * Um desenho vetorial só, calculado na largura real da aba (medida com
 * `ResizeObserver`): uma faixa grossa colada na borda e, saindo dela, vários
 * escorridos de largura e comprimento diferentes, com a ponta arredondada e
 * um brilho úmido do lado. Vetor e na escala certa — nítido em qualquer tela,
 * sem o serrilhado de caixinhas de 2 px.
 *
 * Ao abrir a tela, a faixa corre da esquerda para a direita e os escorridos
 * descem de dentro dela, cada um no seu tempo; de vez em quando uma gota se
 * solta da ponta do mais comprido e cai.
 *
 * Cor de objeto (vermelho-sangue): lê sobre a aba em qualquer tema. Carregado
 * sob demanda pelo `Layout`, com a própria folha: quem não vê o Halloween não
 * baixa nada disto.
 */
import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import './sangue.css';

const acaso = (min: number, max: number) => min + Math.random() * (max - min);

/** Altura da faixa colada na borda. */
const FAIXA = 8;
/** Quanto a faixa sobe para dentro da aba. */
const DENTRO = 3;

type Escorrido = {
  /** Posição, de 0 a 1 da largura. */
  x: number;
  largura: number;
  comprimento: number;
  atraso: number;
  duracao: number;
};

function sortearEscorridos(quantos: number): Escorrido[] {
  const lista: Escorrido[] = [];
  // Espalhados com folga: divide em faixas e sorteia um ponto em cada.
  for (let i = 0; i < quantos; i++) {
    const fatia = 1 / quantos;
    const x = Math.min(0.94, Math.max(0.06, fatia * i + fatia * acaso(0.2, 0.8)));
    // Uns curtos e grossos, outros longos e finos — como no sangue de verdade.
    const longo = Math.random() < 0.35;
    lista.push({
      x,
      largura: longo ? acaso(6, 8.5) : acaso(7.5, 12),
      comprimento: longo ? acaso(16, 26) : acaso(4, 11),
      atraso: 0.45 + acaso(0, 0.8),
      duracao: longo ? acaso(1.6, 2.6) : acaso(0.9, 1.6),
    });
  }
  return lista;
}

/** Corpo de um escorrido: sai de dentro da faixa, desce afinando e termina numa gota. */
function caminhoEscorrido(cx: number, e: Escorrido): string {
  const topo = DENTRO - 1;
  const meia = e.largura / 2;
  const fim = FAIXA + e.comprimento;
  // A ponta é mais gorda que o corpo: o sangue se junta embaixo antes de pingar.
  const r = meia * 1.18;
  const corpo = meia * 0.82;
  return [
    `M${cx - meia} ${topo}`,
    `C ${cx - meia} ${topo + e.comprimento * 0.35}, ${cx - corpo} ${fim - r * 2.2}, ${cx - corpo} ${fim - r * 1.1}`,
    `C ${cx - r * 1.05} ${fim - r * 0.7}, ${cx - r} ${fim + r * 0.95}, ${cx} ${fim + r * 0.95}`,
    `C ${cx + r} ${fim + r * 0.95}, ${cx + r * 1.05} ${fim - r * 0.7}, ${cx + corpo} ${fim - r * 1.1}`,
    `C ${cx + corpo} ${fim - r * 2.2}, ${cx + meia} ${topo + e.comprimento * 0.35}, ${cx + meia} ${topo}`,
    'Z',
  ].join(' ');
}

/** O brilho úmido: um traço claro do lado esquerdo do escorrido, terminando na gota. */
function caminhoBrilho(cx: number, e: Escorrido): string {
  const meia = e.largura / 2;
  const fim = FAIXA + e.comprimento;
  const x = cx - meia * 0.38;
  return `M${x} ${FAIXA + 1} L${x} ${fim - meia * 0.6}`;
}

/**
 * A faixa: borda de cima reta (encostada na aba), borda de baixo ondulada e
 * com um «pescoço» alargado onde cada escorrido sai.
 */
function caminhoFaixa(largura: number, escorridos: Escorrido[], xs: number[]): string {
  const partes = [`M0 ${DENTRO + 1.5}`, `Q 0 0, 4 0`, `L ${largura - 4} 0`, `Q ${largura} 0, ${largura} ${DENTRO + 1.5}`];
  // Volta da direita para a esquerda pela borda de baixo.
  const ordem = escorridos.map((e, i) => ({ e, x: xs[i] })).sort((a, b) => b.x - a.x);
  let ultimoX = largura;
  for (const { e, x } of ordem) {
    const meia = e.largura / 2;
    const pescoco = meia + 3;
    const meioCaminho = (ultimoX + x + pescoco) / 2;
    partes.push(`Q ${meioCaminho} ${FAIXA + acaso(-0.6, 0.9)}, ${x + pescoco} ${FAIXA}`);
    partes.push(`Q ${x + meia} ${FAIXA}, ${x + meia} ${FAIXA + 2.5}`);
    partes.push(`L ${x - meia} ${FAIXA + 2.5}`);
    partes.push(`Q ${x - meia} ${FAIXA}, ${x - pescoco} ${FAIXA}`);
    ultimoX = x - pescoco;
  }
  partes.push(`Q ${ultimoX / 2} ${FAIXA + acaso(-0.6, 0.9)}, 0 ${DENTRO + 1.5}`, 'Z');
  return partes.join(' ');
}

export default function SangueDoMenu({ estreita = false }: { estreita?: boolean }) {
  const id = useId().replace(/:/g, '');
  const caixa = useRef<HTMLSpanElement>(null);
  const [largura, setLargura] = useState(0);

  useLayoutEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const medir = () => setLargura(Math.round(el.getBoundingClientRect().width));
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Sorteado uma vez por montagem; a largura só reposiciona.
  const escorridos = useMemo(() => sortearEscorridos(estreita ? 2 : 8), [estreita]);
  const xs = useMemo(() => escorridos.map(e => Math.round(e.x * largura * 10) / 10), [escorridos, largura]);
  const faixa = useMemo(() => (largura ? caminhoFaixa(largura, escorridos, xs) : ''), [largura, escorridos, xs]);
  const maisLongo = escorridos.reduce((m, e, i) => (e.comprimento > escorridos[m].comprimento ? i : m), 0);
  const altura = FAIXA + Math.max(...escorridos.map(e => e.comprimento + e.largura)) + 4;

  return (
    <span ref={caixa} className="hw-sangue" aria-hidden="true">
      {largura > 0 && (
        <svg className="hw-sangue-svg" width={largura} height={altura} viewBox={`0 0 ${largura} ${altura}`}>
          <defs>
            <linearGradient id={`${id}-cor`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#b3131c" />
              <stop offset="1" stopColor="#c9232b" />
            </linearGradient>
            <linearGradient id={`${id}-corpo`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#b8161f" />
              <stop offset=".45" stopColor="#cf2a32" />
              <stop offset="1" stopColor="#9c0d16" />
            </linearGradient>
            {/* Os escorridos só aparecem abaixo do meio da faixa: saem de dentro dela. */}
            <clipPath id={`${id}-saida`}>
              <rect x="0" y={DENTRO - 0.5} width={largura} height={altura} />
            </clipPath>
          </defs>

          <g clipPath={`url(#${id}-saida)`}>
            {escorridos.map((e, i) => (
              <g
                key={i}
                className="hw-sangue-escorre"
                style={{
                  ['--atraso' as string]: `${e.atraso}s`,
                  ['--duracao' as string]: `${e.duracao}s`,
                  ['--desce' as string]: `${-(e.comprimento + e.largura)}px`,
                }}
              >
                <path d={caminhoEscorrido(xs[i], e)} fill={`url(#${id}-corpo)`} />
                <path d={caminhoBrilho(xs[i], e)} className="hw-sangue-brilho" strokeWidth={Math.max(0.9, e.largura * 0.2)} />
                {/* Reflexo pequeno na gota da ponta. */}
                <ellipse
                  cx={xs[i] - e.largura * 0.18} cy={FAIXA + e.comprimento + e.largura * 0.1}
                  rx={e.largura * 0.16} ry={e.largura * 0.24} className="hw-sangue-reflexo"
                />
              </g>
            ))}
          </g>

          <g className="hw-sangue-faixa">
            <path d={faixa} fill={`url(#${id}-cor)`} />
            {/* O brilho úmido ao longo da faixa. */}
            <path
              d={`M6 ${FAIXA * 0.55} Q ${largura * 0.3} ${FAIXA * 0.35}, ${largura * 0.55} ${FAIXA * 0.6} T ${largura - 6} ${FAIXA * 0.5}`}
              className="hw-sangue-brilho" strokeWidth="1.1"
            />
          </g>

          {/* A gota que se solta do escorrido mais comprido. */}
          <ellipse
            className="hw-sangue-gota"
            cx={xs[maisLongo]} cy={FAIXA + escorridos[maisLongo].comprimento + escorridos[maisLongo].largura * 0.5}
            rx={escorridos[maisLongo].largura * 0.42} ry={escorridos[maisLongo].largura * 0.55}
            style={{ ['--pinga-atraso' as string]: `${escorridos[maisLongo].atraso + escorridos[maisLongo].duracao + 1}s` }}
          />
        </svg>
      )}
    </span>
  );
}

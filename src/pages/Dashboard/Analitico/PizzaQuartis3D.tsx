/**
 * PizzaQuartis3D — distribuição dos operadores por quartil.
 *
 * SVG próprio em vez de recharts: o efeito 3D é uma elipse (rx > ry) com uma
 * parede lateral extrudada, e recharts só desenha setores circulares. Achatar
 * um PieChart via CSS `rotateX` funcionaria visualmente, mas deslocaria o
 * hit-test do tooltip do próprio recharts.
 *
 * ## A fatia é um filtro
 *
 * Clicar na área verde deixa na tabela ao lado só o primeiro quartil; clicar de
 * novo devolve todo mundo. O gráfico já respondia «quantos estão em cada
 * faixa?» — a pergunta seguinte é sempre «quem são?», e ela obrigava a percorrer
 * a tabela inteira procurando o rótulo colorido linha a linha.
 *
 * As fatias continuam do mesmo tamanho com um filtro ligado: o gráfico é o
 * universo, e encolher a fatia escolhida até 100% apagaria a proporção que é a
 * razão de ele existir. Quem não está escolhido perde saturação, não espaço.
 */

import { COR_QUARTIL } from '@/lib/diasUteis';

export interface FatiaQuartil {
  quartil: number;
  qtd: number;
}

interface PizzaQuartis3DProps {
  fatias: FatiaQuartil[];
  /** Operadores com meta definida — base do 100% das porcentagens. */
  total: number;
  largura?: number;
  /** Quartil em foco, ou `null` para «todos». */
  selecionado?: number | null;
  /**
   * Clique numa fatia. Recebe o quartil clicado, ou `null` quando o clique cai
   * no que já estava escolhido — clicar de novo desfaz, que é o gesto que se
   * espera de um filtro que se liga com um clique.
   */
  onSelecionar?: (quartil: number | null) => void;
}

const RX = 96;   // raio horizontal
const RY = 46;   // raio vertical (achatamento = perspectiva)
const DEPTH = 18; // espessura da parede

/** Ponto na elipse. ang em radianos, 0 = direita, cresce no sentido horário. */
function ponto(cx: number, cy: number, ang: number, rx = RX, ry = RY): [number, number] {
  return [cx + rx * Math.cos(ang), cy + ry * Math.sin(ang)];
}

/**
 * O que o clique vai fazer, dito antes do clique.
 *
 * Serve ao leitor de tela e à dica do mouse. «Mostrar só» e «voltar a mostrar
 * todos» são ações opostas no mesmo alvo — sem dizer qual das duas está armada,
 * quem usa teclado descobre apertando.
 */
function rotuloFatia(f: FatiaQuartil, selecionado: number | null): string {
  const quem = `${f.quartil}º quartil · ${f.qtd} ${f.qtd === 1 ? 'operador' : 'operadores'}`;
  return selecionado === f.quartil
    ? `${quem} — clique para voltar a mostrar todos`
    : `${quem} — clique para ver só este quartil`;
}

/** Escurece um hex #rrggbb por um fator (0..1) — cor da parede lateral. */
function escurecer(hex: string, fator: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * fator);
  const g = Math.round(((n >> 8) & 255) * fator);
  const b = Math.round((n & 255) * fator);
  return `rgb(${r},${g},${b})`;
}

export function PizzaQuartis3D({
  fatias, total, largura = 240, selecionado = null, onSelecionar,
}: PizzaQuartis3DProps) {
  const comDados = fatias.filter(f => f.qtd > 0);
  const clicavel = typeof onSelecionar === 'function';

  /** O que uma fatia faz ao ser clicada: escolher, ou desfazer a escolha. */
  const aoClicar = (quartil: number) =>
    onSelecionar?.(selecionado === quartil ? null : quartil);

  /** Fatia fora do foco perde saturação — nunca tamanho. Ver o cabeçalho. */
  const opacidade = (quartil: number) =>
    (selecionado === null || selecionado === quartil ? 1 : 0.28);
  const cx = largura / 2;
  const cy = RY + 14;
  const altura = cy + RY + DEPTH + 14;

  if (total === 0 || comDados.length === 0) {
    return (
      <div className="flex items-center justify-center text-xs text-muted-foreground italic"
        style={{ height: altura }}>
        Sem operadores com meta.
      </div>
    );
  }

  // Uma fatia só: arco de 360° degenera (início = fim), então desenha a elipse
  // inteira em vez de um path vazio.
  const unica = comDados.length === 1 ? comDados[0] : null;

  let ang = -Math.PI / 2;   // começa no topo
  const setores = comDados.map(f => {
    const varredura = (f.qtd / total) * Math.PI * 2;
    const a0 = ang;
    const a1 = ang + varredura;
    ang = a1;
    return { ...f, a0, a1, varredura };
  });

  return (
    <svg width={largura} height={altura} className="overflow-visible">
      {/* Paredes: só a metade frontal da elipse (sin > 0) é visível. Desenhadas
          antes do topo para o topo cobrir a emenda. */}
      {!unica && setores.map(s => {
        // Recorta a fatia contra o arco frontal [0, PI] (onde sin > 0). Fora
        // dele a parede fica atrás do topo e não se desenha.
        const ini = Math.max(s.a0, 0);
        const fim = Math.min(s.a1, Math.PI);
        if (fim <= ini) return null;
        const [x0, y0] = ponto(cx, cy, ini);
        const [x1, y1] = ponto(cx, cy, fim);
        return (
          <path
            key={`parede-${s.quartil}`}
            d={`M ${x0} ${y0}
                A ${RX} ${RY} 0 0 1 ${x1} ${y1}
                L ${x1} ${y1 + DEPTH}
                A ${RX} ${RY} 0 0 0 ${x0} ${y0 + DEPTH} Z`}
            fill={escurecer(COR_QUARTIL[s.quartil] ?? '#6366f1', 0.62)}
            opacity={opacidade(s.quartil)}
            /* A parede não recebe clique: ela é a espessura da fatia do topo, e
               dois alvos para a mesma fatia dobrariam o foco no teclado. */
            pointerEvents="none"
          />
        );
      })}
      {unica && (
        <>
          <path
            d={`M ${cx - RX} ${cy}
                A ${RX} ${RY} 0 0 0 ${cx + RX} ${cy}
                L ${cx + RX} ${cy + DEPTH}
                A ${RX} ${RY} 0 0 1 ${cx - RX} ${cy + DEPTH} Z`}
            fill={escurecer(COR_QUARTIL[unica.quartil] ?? '#6366f1', 0.62)}
            opacity={opacidade(unica.quartil)}
            pointerEvents="none"
          />
          <ellipse cx={cx} cy={cy} rx={RX} ry={RY}
            fill={COR_QUARTIL[unica.quartil] ?? '#6366f1'}
            stroke="rgba(0,0,0,0.18)" strokeWidth={0.75}
            opacity={opacidade(unica.quartil)}
            role={clicavel ? 'button' : undefined}
            tabIndex={clicavel ? 0 : undefined}
            aria-pressed={clicavel ? selecionado === unica.quartil : undefined}
            aria-label={clicavel ? rotuloFatia(unica, selecionado) : undefined}
            className={clicavel ? 'cursor-pointer outline-none focus-visible:brightness-125' : undefined}
            onClick={clicavel ? () => aoClicar(unica.quartil) : undefined}
            onKeyDown={clicavel ? e => {
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); aoClicar(unica.quartil); }
            } : undefined}
          >
            {clicavel && <title>{rotuloFatia(unica, selecionado)}</title>}
          </ellipse>
        </>
      )}

      {/* Topo — é ele que recebe o clique. */}
      {!unica && setores.map(s => {
        const [x0, y0] = ponto(cx, cy, s.a0);
        const [x1, y1] = ponto(cx, cy, s.a1);
        const largo = s.varredura > Math.PI ? 1 : 0;
        return (
          <path
            key={`topo-${s.quartil}`}
            d={`M ${cx} ${cy} L ${x0} ${y0} A ${RX} ${RY} 0 ${largo} 1 ${x1} ${y1} Z`}
            fill={COR_QUARTIL[s.quartil] ?? '#6366f1'}
            stroke={selecionado === s.quartil ? 'currentColor' : 'rgba(0,0,0,0.18)'}
            strokeWidth={selecionado === s.quartil ? 1.75 : 0.75}
            opacity={opacidade(s.quartil)}
            role={clicavel ? 'button' : undefined}
            tabIndex={clicavel ? 0 : undefined}
            aria-pressed={clicavel ? selecionado === s.quartil : undefined}
            aria-label={clicavel ? rotuloFatia(s, selecionado) : undefined}
            className={clicavel ? 'cursor-pointer outline-none focus-visible:brightness-125' : undefined}
            onClick={clicavel ? () => aoClicar(s.quartil) : undefined}
            onKeyDown={clicavel ? e => {
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); aoClicar(s.quartil); }
            } : undefined}
          >
            {clicavel && <title>{rotuloFatia(s, selecionado)}</title>}
          </path>
        );
      })}
    </svg>
  );
}

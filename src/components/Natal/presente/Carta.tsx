/**
 * Carta — a carta do Polo Norte, o fim novo da abertura do Natal (Cleber,
 * 04/11/2026: o presente voltando para a caixa saiu; «outra ideia, única e
 * com espírito natalino»).
 *
 * O vídeo acaba no mural embrulhado no papel do presente. Ele encolhe e vira
 * um envelope desse mesmo papel, com selo de pinheirinho e o carimbo «Polo
 * Norte · 25 dez». O envelope flutua no meio da tela com estrelinhas em volta,
 * o lacre de cera pulsa três vezes e racha numa chuva de purpurina, a aba se
 * abre e a carta sobe de dentro dele — e vira o bilhete (`Cartao.tsx`).
 *
 * As etapas são classes (`np-carta-<etapa>`); só `transform` e `opacity`
 * animam (`presente.css`). O papel é o de `papel.ts`, o mesmo do vídeo.
 */
import { estiloDoPapel } from './papel';

export type EtapaDaCarta = 'chega' | 'lacre' | 'abre' | 'sai' | 'vai';

/** O tamanho do envelope; a carta sai do meio dele. */
export const LARGURA_DA_CARTA = 320;
export const ALTURA_DA_CARTA = 208;
/** Quanto a carta sobe de dentro do envelope antes de virar o bilhete. */
export const SUBIDA_DA_CARTA = 120;

const ESTRELAS = [
  { x: -34, y: 18, t: 16, d: 0 }, { x: 346, y: 4, t: 20, d: 0.6 }, { x: 352, y: 150, t: 13, d: 1.1 },
  { x: -28, y: 170, t: 18, d: 0.3 }, { x: 150, y: -40, t: 12, d: 0.9 }, { x: 260, y: 236, t: 15, d: 1.4 },
  { x: 40, y: 236, t: 11, d: 0.5 },
];

export function Carta({ etapa, x, y }: { etapa: EtapaDaCarta; x: number; y: number }) {
  return (
    <div
      className={`np-carta np-carta-${etapa}`}
      style={{ left: x, top: y, width: LARGURA_DA_CARTA, height: ALTURA_DA_CARTA, marginLeft: -LARGURA_DA_CARTA / 2, marginTop: -ALTURA_DA_CARTA / 2 }}
      aria-hidden
    >
      <span className="np-carta-halo" />
      {ESTRELAS.map((e, i) => (
        <span key={i} className="np-carta-estrela" style={{ left: e.x, top: e.y, width: e.t, height: e.t, animationDelay: `${e.d}s` }} />
      ))}
      <div className="np-carta-flutua">
        {/* O lado de dentro do envelope, com o forro dourado */}
        <div className="np-carta-fundo" />
        {/* A carta, que sobe de dentro */}
        <div className="np-carta-papel">
          <span className="np-carta-papel-titulo">Feliz Natal</span>
          <span className="np-carta-papel-linha" />
          <span className="np-carta-papel-linha curta" />
          <span className="np-carta-papel-linha" />
        </div>
        {/* A frente: o bolso em V, no papel do presente */}
        <div className="np-carta-bolso" style={estiloDoPapel(16)} />
        <div className="np-carta-bolso-dobra" />
        {/* O selo e o carimbo */}
        <div className="np-carta-selo"><span>🎄</span><b>25</b></div>
        <div className="np-carta-carimbo">
          <span>POLO NORTE</span>
          <b>25 · DEZ</b>
        </div>
        {/* A aba, que vira para cima ao abrir */}
        <div className="np-carta-aba">
          <div className="np-carta-aba-frente" style={estiloDoPapel(16)} />
          <div className="np-carta-aba-verso" />
        </div>
        {/* O lacre de cera, na ponta da aba: racha em duas metades */}
        <div className="np-carta-cera">
          <span className="metade esquerda" />
          <span className="metade direita" />
          <span className="np-carta-cera-floco">❄</span>
        </div>
      </div>
    </div>
  );
}

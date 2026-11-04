/**
 * Cartela.tsx — a cartela 5×5, a mesma na tela do jogador, na central do
 * líder e na TV (a cartela-prova de quem ganhou).
 *
 * O tamanho vem de `celula` (px); o resto escala junto. Marcar é só pintar:
 * quem decide se vale é o banco, no grito.
 *
 * Sem `prefers-reduced-motion`, como o resto do Bingo (ver `BingoTv.tsx`).
 */
import type { CSSProperties } from 'react';
import { ESTRELA, LETRAS } from './regras';
import type { TemaBingo } from './temas/contrato';

export function Cartela({ tema, numeros, marcadas, auto, vence, sorte, celula = 56, aoTocar, rotulo, provaAtrasoMs }: {
  tema: TemaBingo;
  numeros: number[];
  /** O que vale como marcado (à mão, ou as pedras sorteadas na visão do líder). */
  marcadas: ReadonlySet<number>;
  /** Marcadas pelo sistema porque a pessoa demorou. */
  auto?: ReadonlySet<number>;
  /** Índices da linha vencedora (a prova). */
  vence?: readonly number[];
  /** Números da sorte: os que faltam para fechar. */
  sorte?: readonly number[];
  celula?: number;
  aoTocar?: (numero: number) => void;
  rotulo?: string;
  /** Na comemoração: a linha vencedora acende casa a casa, a partir daqui. */
  provaAtrasoMs?: number;
}) {
  const c = tema.cartela;
  const k = celula / 56;
  const gap = Math.max(3, Math.round(5 * k));
  // A ordem de cada casa na linha vencedora, para acender uma atrás da outra.
  const ordemNaProva = new Map((vence ?? []).map((indice, ordem) => [indice, ordem]));
  const venceSet = new Set(vence ?? []);
  const sorteSet = new Set(sorte ?? []);
  const fonte = Math.round(celula * 0.42 * tema.escalaNumero);

  return (
    <div
      role="grid"
      aria-label={rotulo ?? 'Cartela de bingo'}
      style={{
        display: 'inline-block', padding: Math.round(9 * k), borderRadius: c.raio * k,
        background: c.fundo, border: `${Math.max(2, Math.round(4 * k))}px solid ${c.borda}`,
        boxShadow: `0 ${Math.round(6 * k)}px 0 ${c.sombra}`, fontFamily: tema.familia,
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(5, ${celula}px)`, gap }}>
        {LETRAS.map(l => (
          <div key={l} style={{
            height: Math.round(celula * 0.72), display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: c.cabecalhoFundo, color: c.cabecalhoTexto, borderRadius: Math.min(c.raioCelula, 12) * k,
            fontSize: Math.round(celula * 0.46 * tema.escalaNumero), fontWeight: 700,
          }}>{l}</div>
        ))}
        {numeros.map((n, i) => {
          const estrela = i === ESTRELA || n === 0;
          const marcada = estrela || marcadas.has(n);
          const peloSistema = !estrela && !marcadas.has(n) && !!auto?.has(n);
          const ordem = ordemNaProva.get(i);
          const animacao = provaAtrasoMs != null && ordem != null
            ? `bingo-prova 520ms ease-out ${provaAtrasoMs + ordem * 120}ms both`
            : marcada && !estrela && aoTocar ? 'bingo-marca 380ms ease-out'
            : peloSistema ? 'bingo-auto 600ms ease-out'
            : undefined;
          const estilo: CSSProperties = {
            width: celula, height: celula, display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: `${c.raioCelula}%`, fontSize: fonte, fontWeight: 700, position: 'relative',
            background: estrela ? c.estrelaFundo : marcada ? c.marcaFundo : peloSistema ? c.autoFundo : c.celulaFundo,
            color: estrela ? c.estrelaTexto : marcada ? c.marcaTexto : peloSistema ? c.autoTexto : c.celulaTexto,
            boxShadow: venceSet.has(i)
              ? `0 0 0 ${Math.max(3, Math.round(4 * k))}px ${c.vence}, 0 0 ${Math.round(18 * k)}px ${c.vence}`
              : sorteSet.has(n) ? `0 0 0 ${Math.max(2, Math.round(3 * k))}px ${c.sorte}` : undefined,
            transition: 'background-color 220ms ease, color 220ms ease, transform 140ms ease',
            animation: animacao,
            cursor: aoTocar && !estrela ? 'pointer' : undefined,
            border: peloSistema ? `${Math.max(2, Math.round(2 * k))}px dashed ${c.autoTexto}` : undefined,
            userSelect: 'none',
            ['--bingo-foco' as string]: c.sorte,
          };
          const conteudo = estrela ? '★' : n;
          return aoTocar && !estrela ? (
            <button key={i} type="button" className="bingo-celula" style={estilo} onClick={() => aoTocar(n)} aria-pressed={marcada || peloSistema}>
              {conteudo}
            </button>
          ) : (
            <div key={i} style={estilo}>{conteudo}</div>
          );
        })}
      </div>
      <style>{`
        @keyframes bingo-marca { 0% { transform: scale(.72) } 55% { transform: scale(1.1) } 100% { transform: none } }
        @keyframes bingo-auto { from { opacity: .2; transform: scale(.88) } to { opacity: 1; transform: none } }
        @keyframes bingo-prova { 0% { transform: none } 45% { transform: scale(1.16) } 100% { transform: none } }
        .bingo-celula:hover { transform: translateY(-2px); }
        .bingo-celula:active { transform: scale(.92); }
        .bingo-celula:focus-visible { outline: 3px solid var(--bingo-foco); outline-offset: 2px; }
      `}</style>
    </div>
  );
}

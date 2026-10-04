/**
 * O placar de setores: um cartão por setor, com o que importa de primeira
 * vista (recebido, meta, ritmo, onde fecha, quartis), e o detalhe aberto LOGO
 * ABAIXO da fileira do cartão clicado — o olho não sai do lugar.
 *
 * Quantos cartões cabem por fileira é medido (ResizeObserver), não chutado:
 * é o que diz onde a fileira termina.
 */
import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { formatBRL } from '@/lib/money';
import { cn } from '@/lib/utils';
import type { ModoCofen } from './modelo';
import { nomeDoMes, variacaoPct } from './modelo';
import type { ResumoQuartis, SetorDoPlacar } from './placar';
import { rotuloDoRitmo, tomDoRitmo } from './placar';
import { BarraDeMeta, FaixaQuartis } from './Pulso';
import { corDaMarca, mil, pct, rotuloModo, sinal } from './formato';
export type { OrdemDoPlacar } from './placar';

const CARTAO_MIN = 250, VAO = 12;

const CartaoDoSetor = memo(function CartaoDoSetor({ s, quartis, modo, mesAnterior, aberto, onAbrir, ordem }: {
  s: SetorDoPlacar; quartis: ResumoQuartis | null | undefined; modo: ModoCofen; mesAnterior: string;
  aberto: boolean; onAbrir: (chave: string) => void; ordem: number;
}) {
  const v = s.temAnterior ? variacaoPct(s.valor, s.valorAnterior) : null;
  const r = s.ritmo;
  return (
    <button type="button" className={cn('vg-st', s.cofen && 'vg-st-cofen')} aria-expanded={aberto}
      onClick={() => onAbrir(s.chave)} style={{ animationDelay: `${Math.min(ordem, 12) * 35}ms` }}>
      <span className="vg-st-l1">
        <span className="vg-st-nome"><span className="vg-ponto" style={{ background: corDaMarca(s.marca) }} /><span>{s.nome}</span></span>
        {s.cofen && <span className="vg-selo cofen">Cofen</span>}
      </span>
      <span className="vg-st-v">{formatBRL(s.valor)}{s.cofen && <small>{rotuloModo(modo)}</small>}</span>
      <BarraDeMeta ritmo={r} />
      {r ? (
        <span className="vg-st-l3">
          <span><b>{pct(r.pctMeta)}</b> de {mil(r.meta)}</span>
          <span className="vg-pill" style={{ ['--s' as string]: `var(--vg-${tomDoRitmo(r.pct)})` }} title={rotuloDoRitmo(r.pct)}>{pct(r.pct)} do ritmo</span>
        </span>
      ) : (
        <span className="vg-st-l3"><span className="vg-st-sem">sem meta cadastrada</span></span>
      )}
      <span className="vg-st-l3">
        <span>{r ? <>fecha em <b>{mil(r.fecha)}</b></> : <>{s.operadores} operadores</>}</span>
        {v !== null && <span className={v >= 0 ? 'vg-sobe' : 'vg-desce'}>{sinal(v)} {nomeDoMes(mesAnterior).slice(0, 3)}.</span>}
      </span>
      {quartis !== undefined && <FaixaQuartis resumo={quartis} />}
    </button>
  );
});

export function PlacarDeSetores({ setores, quartisPorSetor, modo, mesAnterior, aberto, onAbrir, detalhe }: {
  setores: SetorDoPlacar[];
  /** chave → resumo; `null` enquanto as pessoas carregam; ausente = sem pessoas para mostrar. */
  quartisPorSetor: Map<string, ResumoQuartis | null>;
  modo: ModoCofen; mesAnterior: string; aberto: string | null;
  onAbrir: (chave: string) => void;
  detalhe: (s: SetorDoPlacar) => ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [colunas, setColunas] = useState(4);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const medir = () => setColunas(Math.max(1, Math.floor((el.clientWidth + VAO) / (CARTAO_MIN + VAO))));
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const idx = setores.findIndex(s => s.chave === aberto);
  const fimDaFileira = idx < 0 ? -1 : Math.min(setores.length - 1, Math.floor(idx / colunas) * colunas + colunas - 1);
  const itens = useMemo(() => setores, [setores]);

  return (
    <div ref={ref} className="vg-placar">
      {itens.map((s, i) => (
        <PlacarItem key={s.chave} s={s} i={i} quartis={quartisPorSetor.has(s.chave) ? quartisPorSetor.get(s.chave) ?? null : undefined}
          modo={modo} mesAnterior={mesAnterior} aberto={aberto === s.chave} onAbrir={onAbrir}
          depois={i === fimDaFileira ? detalhe(setores[idx]) : null} />
      ))}
    </div>
  );
}

function PlacarItem({ s, i, quartis, modo, mesAnterior, aberto, onAbrir, depois }: {
  s: SetorDoPlacar; i: number; quartis: ResumoQuartis | null | undefined; modo: ModoCofen; mesAnterior: string;
  aberto: boolean; onAbrir: (chave: string) => void; depois: ReactNode;
}) {
  return (
    <>
      <CartaoDoSetor s={s} quartis={quartis} modo={modo} mesAnterior={mesAnterior} aberto={aberto} onAbrir={onAbrir} ordem={i} />
      {depois}
    </>
  );
}

/** Os setores por ritmo, do melhor para o pior — o ranking ao lado do gráfico. */
export const RankingDeRitmo = memo(function RankingDeRitmo({ setores, onAbrir }: {
  setores: SetorDoPlacar[]; onAbrir: (chave: string) => void;
}) {
  const lista = setores.filter(s => s.ritmo).sort((a, b) => (b.ritmo?.pct ?? 0) - (a.ritmo?.pct ?? 0));
  const maior = Math.max(100, ...lista.map(s => s.ritmo?.pct ?? 0));
  if (!lista.length) return <p className="vg-nota">Nenhum setor com meta cadastrada neste mês.</p>;
  return (
    <ol className="vg-rank">
      {lista.map((s, i) => {
        const r = s.ritmo!;
        return (
          <li key={s.chave}>
            <button type="button" onClick={() => onAbrir(s.chave)}>
              <span className="vg-rank-pos">{i + 1}</span>
              <span className="vg-rank-meio">
                <span className="vg-rank-nome">{s.nome}{s.cofen && <span className="vg-selo cofen">Cofen</span>}</span>
                <span className="vg-rank-bar"><i style={{ width: `${(r.pct / maior) * 100}%`, background: `var(--vg-${tomDoRitmo(r.pct)})` }} />
                  <u style={{ left: `${(100 / maior) * 100}%` }} /></span>
              </span>
              <span className="vg-rank-pct" style={{ color: `var(--vg-${tomDoRitmo(r.pct)})` }}>{pct(r.pct)}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
});

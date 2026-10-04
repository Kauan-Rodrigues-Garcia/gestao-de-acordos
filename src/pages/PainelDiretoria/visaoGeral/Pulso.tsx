/**
 * O pulso do mês: o cartão do geral (ou da empresa filtrada) e os cartões das
 * cidades — o que a diretoria lê de primeira vista.
 *
 * Só o que é importante: quanto entrou, quanto devia ter entrado até hoje,
 * onde o mês fecha e como as pessoas se distribuem nos quartis. O resto mora
 * no detalhe do setor.
 */
import { memo } from 'react';
import { ValorAnimado } from '@/components/ValorAnimado';
import { formatBRL } from '@/lib/money';
import { cn } from '@/lib/utils';
import { nomeDoMes, variacaoPct, type CidadeDaVisao, type EscopoDaVisao, type ModoCofen, type ParteDoGeral } from './modelo';
import type { ResumoQuartis, Ritmo, SetorDoPlacar } from './placar';
import { tomDoRitmo } from './placar';
import { corDaMarca, mil, pct, rotuloModo, sinal } from './formato';

function ValorGrande({ valor }: { valor: number }) {
  return (
    <>
      <small>R$</small>
      <ValorAnimado valor={valor} formatar={v => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} />
    </>
  );
}

/** A barra de meta: o preenchido é o recebido; o risco, o que devia ter hoje. */
export function BarraDeMeta({ ritmo, cor }: { ritmo: Ritmo | null; cor?: string }) {
  if (!ritmo) return <span className="vg-meta vg-sem" aria-hidden="true" />;
  const f = Math.min(100, ritmo.pctMeta);
  const e = Math.min(100, (ritmo.esperado / ritmo.meta) * 100);
  return (
    <span className="vg-meta" aria-hidden="true" style={{ ['--cor' as string]: cor ?? `var(--vg-${tomDoRitmo(ritmo.pct)})` }}>
      <i style={{ width: `${f}%` }} />
      <u style={{ left: `calc(${e}% - 1px)` }} />
    </span>
  );
}

/** As pessoas por quartil, numa faixa: a largura é quanto cada quartil representa. */
export function FaixaQuartis({ resumo, rotulos = false, alta = false }: {
  resumo: ResumoQuartis | null; rotulos?: boolean; alta?: boolean;
}) {
  if (!resumo) return <span className={cn('vg-qfaixa vg-carregando', alta && 'vg-alta')} aria-hidden="true" />;
  if (!resumo.total) return <span className={cn('vg-qfaixa vg-sem', alta && 'vg-alta')} aria-label="Ninguém com meta individual" />;
  return (
    <span className={cn('vg-qfaixa', alta && 'vg-alta')} role="img"
      aria-label={resumo.fatias.map(f => `Q${f.quartil} ${pct(f.pct)}`).join(', ')}>
      {resumo.fatias.map(f => f.qtd > 0 && (
        <i key={f.quartil} style={{ width: `${f.pct}%`, background: `var(--vg-q${f.quartil})` }}
          title={`Q${f.quartil}: ${f.qtd} ${f.qtd === 1 ? 'pessoa' : 'pessoas'} · ${pct(f.pct)}${f.mediaProjecao !== null ? ` · projeção média ${pct(f.mediaProjecao)}` : ''}`}>
          {rotulos && f.pct >= 14 ? `Q${f.quartil} ${pct(f.pct)}` : ''}
        </i>
      ))}
    </span>
  );
}

/** A legenda dos quartis: % das pessoas e a projeção média de cada um. */
export function LegendaQuartis({ resumo }: { resumo: ResumoQuartis | null }) {
  if (!resumo?.total) return null;
  return (
    <div className="vg-qleg">
      {resumo.fatias.map(f => (
        <span key={f.quartil}>
          <span className="vg-ponto" style={{ background: `var(--vg-q${f.quartil})` }} />
          Q{f.quartil} <b>{pct(f.pct)}</b>
          {f.mediaProjecao !== null && <small> · média {pct(f.mediaProjecao)}</small>}
        </span>
      ))}
    </div>
  );
}

const COR_DA_CARTEIRA_NO_ESCURO: Record<ParteDoGeral['chave'], string> = {
  nosso_produto: 'rgb(255 255 255 / .82)',
  cofen: 'var(--vg-cofen)',
};

function Anel({ ritmo }: { ritmo: Ritmo | null }) {
  const r = 52, c = 2 * Math.PI * r;
  const f = ritmo ? Math.min(1, ritmo.pctMeta / 100) : 0;
  const marca = ritmo ? Math.min(1, ritmo.esperado / ritmo.meta) : 0;
  return (
    <div className="vg-anel" role="img" aria-label={ritmo ? `${pct(ritmo.pctMeta)} da meta do mês` : 'Sem meta cadastrada'}>
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle cx="60" cy="60" r={r} fill="none" stroke="rgb(255 255 255 / .14)" strokeWidth="10" />
        <circle cx="60" cy="60" r={r} fill="none" stroke="#7fe3b4" strokeWidth="10" strokeLinecap="round"
          strokeDasharray={`${c * f} ${c}`} className="vg-anel-f" />
        {ritmo && <circle cx="60" cy="60" r={r} fill="none" stroke="#fff" strokeWidth="13" strokeDasharray={`2.2 ${c}`} strokeDashoffset={-c * marca} />}
      </svg>
      <div><b>{ritmo ? pct(ritmo.pctMeta) : '—'}</b><small>{ritmo ? 'DA META' : 'SEM META'}</small></div>
    </div>
  );
}

/** O cartão escuro: o escopo inteiro (geral, ou a empresa filtrada). */
export const CartaoDoMes = memo(function CartaoDoMes({ rotulo, escopo, ritmo, semMeta, quartis, carteiras, modo, mesAnterior, pessoas }: {
  rotulo: string; escopo: EscopoDaVisao; ritmo: Ritmo | null; semMeta: number; quartis: ResumoQuartis | null;
  carteiras: ParteDoGeral[]; modo: ModoCofen; mesAnterior: string; pessoas: number | null;
}) {
  const v = variacaoPct(escopo.valor, escopo.valorAnterior);
  const sobra = ritmo ? ritmo.diferenca : 0;
  return (
    <div className="vg-hero">
      <div className="vg-hero-a">
        <span className="vg-rot">{rotulo}</span>
        <div className="vg-grande"><ValorGrande valor={escopo.valor} /></div>
        <div className="vg-vs">mesmo dia de {nomeDoMes(mesAnterior)} {mil(escopo.valorAnterior)}{' '}
          {v !== null && <b className={v >= 0 ? 'vg-sobe-h' : 'vg-desce-h'}>{sinal(v)}</b>}</div>
      </div>
      <Anel ritmo={ritmo} />
      <div className="vg-hero-l">
        <div>
          <small>Hoje deveria ter</small>
          <b>{ritmo ? mil(ritmo.esperado) : '—'}</b>
          {ritmo && <em className={sobra >= 0 ? 'vg-sobe-h' : 'vg-desce-h'}>{sobra >= 0 ? `sobra ${mil(sobra)}` : `falta ${mil(-sobra)}`}</em>}
        </div>
        <div>
          <small>Fecha o mês em</small>
          <b>{ritmo ? mil(ritmo.fecha) : '—'}</b>
          {ritmo && <em className={ritmo.fecha >= ritmo.meta ? 'vg-sobe-h' : 'vg-aviso-h'}>{pct((ritmo.fecha / ritmo.meta) * 100)} da meta de {mil(ritmo.meta)}</em>}
        </div>
        <div className="vg-hero-q">
          <small>Pessoas por quartil{pessoas !== null ? ` · ${pessoas}` : ''}</small>
          <FaixaQuartis resumo={quartis} rotulos />
          <LegendaQuartis resumo={quartis} />
        </div>
      </div>
      {(escopo.cofen || semMeta > 0) && (
        <div className="vg-hero-pe">
          {escopo.cofen && escopo.valor > 0 && (
            <>
              <div className="vg-divisao" aria-hidden="true">
                {carteiras.map(p => <i key={p.chave} style={{ width: `${(p.valor / escopo.valor) * 100}%`, background: COR_DA_CARTEIRA_NO_ESCURO[p.chave] }} />)}
              </div>
              <div className="vg-legenda">
                {carteiras.map(p => (
                  <span key={p.chave}><span className="vg-ponto" style={{ background: COR_DA_CARTEIRA_NO_ESCURO[p.chave] }} />
                    {p.nome}{p.chave === 'cofen' ? ` (${rotuloModo(modo)})` : ''} <b>{pct((p.valor / escopo.valor) * 100)}</b></span>
                ))}
                {semMeta > 0 && <span className="vg-hero-semmeta">{semMeta} {semMeta === 1 ? 'setor' : 'setores'} sem meta cadastrada</span>}
              </div>
            </>
          )}
          {!escopo.cofen && semMeta > 0 && <div className="vg-legenda"><span className="vg-hero-semmeta">{semMeta} {semMeta === 1 ? 'setor' : 'setores'} sem meta cadastrada</span></div>}
        </div>
      )}
    </div>
  );
});

/** Uma cidade: filtra a tela inteira por ela (e volta ao geral no segundo clique). */
export const CartaoDaCidade = memo(function CartaoDaCidade({ cidade, setores, ritmo, quartis, modo, ativa, onClick }: {
  cidade: CidadeDaVisao; setores: SetorDoPlacar[]; ritmo: Ritmo | null; quartis: ResumoQuartis | null;
  modo: ModoCofen; ativa: boolean; onClick: () => void;
}) {
  const comRitmo = setores.filter(s => s.ritmo).sort((a, b) => (b.ritmo?.pct ?? 0) - (a.ritmo?.pct ?? 0));
  const melhor = comRitmo[0] ?? null;
  const atencao = comRitmo.length > 1 ? comRitmo[comRitmo.length - 1] : null;
  return (
    <button type="button" className={cn('vg-cid', cidade.marca)} aria-pressed={ativa} onClick={onClick}
      aria-label={ativa ? `Voltar ao geral` : `Ver só ${cidade.nome}`}>
      <span className="vg-cid-topo">
        <span className="vg-rot"><span className="vg-ponto" style={{ background: corDaMarca(cidade.marca) }} />
          {cidade.nome}{cidade.rotuloMarca ? ` · ${cidade.rotuloMarca}` : ''}</span>
        <span className="vg-cid-acao">{ativa ? '× geral' : 'filtrar →'}</span>
      </span>
      <span className="vg-cid-val"><ValorGrande valor={cidade.mes.valor} /></span>
      <BarraDeMeta ritmo={ritmo} cor="var(--cc)" />
      <span className="vg-cid-mini">
        <span><small>Da meta</small><b>{ritmo ? pct(ritmo.pctMeta) : '—'}</b></span>
        <span><small>Ritmo</small><b style={ritmo ? { color: `var(--vg-${tomDoRitmo(ritmo.pct)})` } : undefined}>{ritmo ? pct(ritmo.pct) : '—'}</b></span>
        <span><small>Fecha em</small><b>{ritmo ? mil(ritmo.fecha) : '—'}</b></span>
      </span>
      <FaixaQuartis resumo={quartis} />
      <span className="vg-cid-pe">
        {melhor?.ritmo && <span>melhor <b className="vg-sobe">{melhor.nome} {pct(melhor.ritmo.pct)}</b></span>}
        {atencao?.ritmo && <span>atenção <b style={{ color: `var(--vg-${tomDoRitmo(atencao.ritmo.pct)})` }}>{atencao.nome} {pct(atencao.ritmo.pct)}</b></span>}
      </span>
      {cidade.cofen && (
        <span className="vg-cid-pe vg-cid-cart">
          <span>Nosso produto <b>{formatBRL(cidade.mes.nossoProduto)}</b></span>
          <span>{cidade.cofen.nome} · Cofen {rotuloModo(modo)} <b className="vg-c">{formatBRL(cidade.cofen.valor)}</b></span>
        </span>
      )}
    </button>
  );
});

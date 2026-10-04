/**
 * O detalhe de um setor, aberto no lugar, embaixo da fileira do cartão.
 *
 * Em cima, os seis números que respondem «como esse setor está»: recebido,
 * meta, o que devia ter hoje, quanto falta, onde fecha e os quartis. Embaixo,
 * as abas — cada uma é uma pergunta:
 *
 *   Equipes     como cada equipe do gestão está (o card do Painel Líder); a
 *               equipe abre no lugar com as pessoas dela
 *   Quartis     quanto cada quartil representa, a projeção média de cada um,
 *               e o setor contra a empresa e a marca
 *   Pessoas     a tabela da aba Quartis do Painel Líder
 *   Agenda      o agendado do mês nos acordos salvos
 *   Dia a dia   o ritmo do setor, dia a dia, e as formas de pagamento
 *
 * O recebido do setor é o do Painel Diretoria (59, ou a conciliação no
 * Cofen). Equipes e pessoas são as do Painel Líder (Analítico) — são
 * relatórios diferentes, e a tela diz isso onde os dois aparecem juntos.
 */
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { formatBRL } from '@/lib/money';
import { cn } from '@/lib/utils';
import type { QuartilConfig } from '@/lib/supabase';
import { buscarDetalheDoSetor, type DetalheDoSetor as Detalhe59 } from '@/services/mestre/diretoriaSetores.service';
import type { CofenDoMes } from '@/services/mestre/diretoriaCidades.service';
import { buscarAgendaDosSetores, type AgendaDoSetor, type FontesDoPainel } from '@/services/mestre/diretoriaPlacar.service';
import type { LinhaQuartil } from '@/pages/Dashboard/Analitico/linhasQuartil';
import type { MapaRecebimentoIndireto } from '@/services/metas/recebimentoIndireto.service';
import type { EquipeNaTela } from '@/pages/Mobile/equipe/montarEquipe';
import { formasCofen, nomeDoMes, serieCofen, variacaoPct, type ModoCofen } from './modelo';
import {
  equipesDoSetor, resumirQuartis, ritmoDe, rotuloDoRitmo, tomDoRitmo,
  type Calendario, type ResumoQuartis, type Ritmo, type SetorDoPlacar,
} from './placar';
import { BarraDeMeta, FaixaQuartis, LegendaQuartis } from './Pulso';
import { GraficoRitmo } from './GraficoRitmo';
import { FormasDoEscopo, PilhaCofen } from './partes';
import { mil, pct, rotuloModo, sinal } from './formato';

export type AbaDoSetor = 'equipes' | 'quartis' | 'pessoas' | 'agenda' | 'dia';

/** `undefined` = carregando; `null` = sem acesso (outra empresa). */
type Fontes = FontesDoPainel | null | undefined;

export const DetalheDoSetor = memo(function DetalheDoSetor({
  setor, cal, calMes, indireto, modo, ho, mes, mesAnterior, diaCorte, diasNoMes, empresaId, empresaDoSetor, fontes, linhas,
  quartis, resumoEmpresa, resumoMarca, rotuloMarca, cofen, aba, onAba, onFechar,
}: {
  setor: SetorDoPlacar; cal: Calendario;
  /** O calendário de HOJE: equipes e quartis são do mês, não do corte. */
  calMes: Calendario;
  /** O recebimento indireto (meta indireta, regra Cofen). */
  indireto?: MapaRecebimentoIndireto;
  modo: ModoCofen; ho: number;
  mes: string; mesAnterior: string; diaCorte: number; diasNoMes: number;
  /** A empresa do painel (59). */
  empresaId: string;
  /** A empresa dona do setor (a PaguePlay, no Cofen). `null` sem acesso. */
  empresaDoSetor: string | null;
  fontes: Fontes; linhas: LinhaQuartil[] | null | undefined; quartis: QuartilConfig[];
  resumoEmpresa: ResumoQuartis | null; resumoMarca: ResumoQuartis | null; rotuloMarca: string;
  cofen: CofenDoMes | null; aba: AbaDoSetor; onAba: (a: AbaDoSetor) => void; onFechar: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const t = window.setTimeout(() => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 120);
    return () => window.clearTimeout(t);
  }, [setor.chave]);

  const r = setor.ritmo;
  const emHO = setor.cofen && modo === 'ho';
  const resumo = useMemo(() => (linhas ? resumirQuartis(linhas, quartis) : null), [linhas, quartis]);
  const equipes = useMemo(
    () => (fontes && setor.setorId ? equipesDoSetor(fontes, setor.setorId, calMes, emHO, ho, indireto) : null),
    [fontes, setor.setorId, calMes, emHO, ho, indireto],
  );
  const v = setor.temAnterior ? variacaoPct(setor.valor, setor.valorAnterior) : null;
  const abas: { k: AbaDoSetor; t: string; n?: number }[] = [
    { k: 'equipes', t: 'Equipes', n: equipes?.length },
    { k: 'quartis', t: 'Quartis' },
    { k: 'pessoas', t: 'Pessoas', n: linhas?.length },
    { k: 'agenda', t: 'Agenda do mês' },
    { k: 'dia', t: 'Dia a dia' },
  ];

  return (
    <section ref={ref} className={cn('vg-det', setor.cofen && 'vg-det-cofen')} aria-label={`Detalhe de ${setor.nome}`}>
      <div className="vg-det-cab">
        <div>
          <h2>{setor.nome}
            {setor.cofen && <span className="vg-selo cofen">Carteira Cofen</span>}
            {r && <span className="vg-pill" style={{ ['--s' as string]: `var(--vg-${tomDoRitmo(r.pct)})` }}>{pct(r.pct)} · {rotuloDoRitmo(r.pct)}</span>}
          </h2>
          <p>{setor.cidadeNome} · meta do setor na aba Metas{setor.cofen ? ` · em ${rotuloModo(modo)}` : ''} · dia útil {cal.decorridos} de {cal.totalUteis}</p>
        </div>
        <button type="button" className="vg-x" aria-label="Fechar o detalhe" onClick={onFechar}><X className="w-4 h-4" /></button>
      </div>

      <div className="vg-kpis">
        <div className="vg-kpi vg-forte"><small>Recebido</small><b>{mil(setor.valor)}</b>
          <em className={v === null ? '' : v >= 0 ? 'vg-sobe' : 'vg-desce'}>{v === null ? 'sem base em ' + nomeDoMes(mesAnterior) : `${sinal(v)} sobre ${nomeDoMes(mesAnterior)}`}</em></div>
        <div className="vg-kpi"><small>Meta do mês</small><b>{r ? mil(r.meta) : '—'}</b><em>{r ? `${pct(r.pctMeta)} atingido` : 'sem meta cadastrada'}</em></div>
        <div className="vg-kpi"><small>Hoje deveria ter</small><b>{r ? mil(r.esperado) : '—'}</b><em>{r ? <SobraFalta d={r.diferenca} /> : ''}</em></div>
        <div className="vg-kpi"><small>Falta para a meta</small><b>{r ? (r.falta ? mil(r.falta) : 'batida') : '—'}</b>
          <em>{r ? (r.falta ? `${mil(r.porDiaUtil)} por dia útil` : 'a meta do mês já foi alcançada') : ''}</em></div>
        <div className="vg-kpi"><small>Fecha o mês em</small><b>{r ? mil(r.fecha) : '—'}</b>
          <em style={r ? { color: `var(--vg-${tomDoRitmo(r.pct)})` } : undefined}>{r ? `${pct((r.fecha / r.meta) * 100)} da meta` : ''}</em></div>
        <div className="vg-kpi"><small>Pessoas por quartil{resumo ? ` · ${resumo.total}` : ''}</small>
          <FaixaQuartis resumo={linhas === undefined ? null : resumo} />
          <em>{resumo?.total ? `Q1 ${pct(resumo.fatias[0]?.pct ?? 0)} · Q4 ${pct(resumo.fatias[resumo.fatias.length - 1]?.pct ?? 0)}` : linhas === undefined ? 'carregando…' : 'ninguém com meta'}</em></div>
      </div>

      <div className="vg-abas" role="tablist" aria-label={`Detalhes de ${setor.nome}`}>
        {abas.map(a => (
          <button key={a.k} type="button" role="tab" aria-selected={aba === a.k} onClick={() => onAba(a.k)}>
            {a.t}{a.n !== undefined && <span>{a.n}</span>}
          </button>
        ))}
      </div>

      <div className="vg-painel" role="tabpanel" key={aba}>
        {aba === 'equipes' && <AbaEquipes equipes={equipes} fontes={fontes} cal={calMes} quartis={quartis} emHO={emHO} nomeSetor={setor.nome} />}
        {aba === 'quartis' && <AbaQuartis resumo={resumo} carregando={linhas === undefined} equipes={equipes} quartis={quartis}
          resumoEmpresa={resumoEmpresa} resumoMarca={resumoMarca} rotuloMarca={rotuloMarca} nomeSetor={setor.nome} />}
        {aba === 'pessoas' && <AbaPessoas linhas={linhas} />}
        {aba === 'agenda' && <AbaAgenda empresa={empresaDoSetor} setorId={setor.setorId} mes={mes} nome={setor.nome} />}
        {aba === 'dia' && <AbaDia setor={setor} empresaId={empresaId} mes={mes} mesAnterior={mesAnterior} diaCorte={diaCorte}
          diasNoMes={diasNoMes} cal={cal} cofen={cofen} modo={modo} ritmo={r} />}
      </div>
    </section>
  );
});

function SobraFalta({ d }: { d: number }) {
  return d >= 0 ? <span className="vg-sobe">sobra {mil(d)}</span> : <span className="vg-desce">falta {mil(-d)}</span>;
}

function SemFontes({ fontes }: { fontes: Fontes }) {
  if (fontes === undefined) return <div className="vg-esq"><Skeleton className="h-28 rounded-2xl" /><Skeleton className="h-28 rounded-2xl" /><Skeleton className="h-28 rounded-2xl" /></div>;
  return <p className="vg-nota">Este login não enxerga as equipes e pessoas da outra empresa. Quem tem acesso às duas vê tudo aqui.</p>;
}

// ── Equipes ─────────────────────────────────────────────────────────────────

function ritmoDaEquipe(e: EquipeNaTela, cal: Calendario): Ritmo | null {
  return ritmoDe(e.acumulado, e.meta, { ...cal, totalUteis: e.totalUteis, decorridos: e.decorridos });
}

function AbaEquipes({ equipes, fontes, cal, quartis, emHO, nomeSetor }: {
  equipes: EquipeNaTela[] | null; fontes: Fontes; cal: Calendario; quartis: QuartilConfig[]; emHO: boolean; nomeSetor: string;
}) {
  const [aberta, setAberta] = useState<string | null>(null);
  if (!equipes) return <SemFontes fontes={fontes} />;
  if (!equipes.length) return <p className="vg-nota">{nomeSetor} não tem equipes cadastradas no gestão.</p>;
  const eq = equipes.find(e => e.id === aberta) ?? null;
  return (
    <>
      <div className="vg-eqs">
        {equipes.map((e, i) => {
          const r = ritmoDaEquipe(e, cal);
          const res = resumirQuartis(e.linhas, quartis);
          const sel = aberta === e.id;
          return (
            <button key={e.id} type="button" className="vg-eq" aria-expanded={sel} onClick={() => setAberta(sel ? null : e.id)}
              style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}>
              <span className="vg-eq-l1"><span><b>{e.nome}</b><small>{e.operadorIds.length} pessoas{e.treinamento ? ' · treinamento' : ''}</small></span>
                {r && <span className="vg-pill" style={{ ['--s' as string]: `var(--vg-${tomDoRitmo(r.pct)})` }}>{pct(r.pct)}</span>}</span>
              <span className="vg-eq-v">{formatBRL(e.acumulado)}{emHO && <small>H.O.</small>}</span>
              <BarraDeMeta ritmo={r} />
              <span className="vg-eq-l3">{r ? <><span>{pct(r.pctMeta)} de {mil(r.meta)}</span><SobraFalta d={r.diferenca} /></> : <span>sem meta da equipe</span>}</span>
              <FaixaQuartis resumo={res} />
            </button>
          );
        })}
      </div>
      {eq && <EquipeAberta e={eq} cal={cal} quartis={quartis} emHO={emHO} onFechar={() => setAberta(null)} />}
      <p className="vg-nota">As equipes cadastradas no gestão para {nomeSetor}, com o número do card do Painel Líder (Analítico) e a meta da equipe na aba Metas. Clique numa equipe para ver as pessoas dela.</p>
    </>
  );
}

function EquipeAberta({ e, cal, quartis, emHO, onFechar }: {
  e: EquipeNaTela; cal: Calendario; quartis: QuartilConfig[]; emHO: boolean; onFechar: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [e.id]);
  const r = ritmoDaEquipe(e, cal);
  const res = resumirQuartis(e.linhas, quartis);
  return (
    <div ref={ref} className="vg-eq-aberta">
      <div className="vg-det-cab">
        <div><h3>{e.nome}</h3><p>{e.operadorIds.length} pessoas{e.treinamento ? ' · equipe em treinamento (dias úteis desde o início dela)' : ''} · dia útil {e.decorridos} de {e.totalUteis}</p></div>
        <button type="button" className="vg-x" aria-label="Fechar a equipe" onClick={onFechar}><X className="w-4 h-4" /></button>
      </div>
      <div className="vg-kpis vg-kpis-4">
        <div className="vg-kpi vg-forte"><small>Recebido{emHO ? ' · H.O.' : ''}</small><b>{mil(e.acumulado)}</b><em>{r ? `${pct(r.pctMeta)} da meta de ${mil(r.meta)}` : 'sem meta da equipe'}</em></div>
        <div className="vg-kpi"><small>Hoje deveria ter</small><b>{r ? mil(r.esperado) : '—'}</b><em>{r ? <SobraFalta d={r.diferenca} /> : ''}</em></div>
        <div className="vg-kpi"><small>Fecha o mês em</small><b>{r ? mil(r.fecha) : '—'}</b><em>{r ? `${pct(r.pct)} do ritmo` : ''}</em></div>
        <div className="vg-kpi"><small>Pessoas por quartil</small><FaixaQuartis resumo={res} /><em>{res.total} com meta{e.semMeta.length ? ` · ${e.semMeta.length} sem meta` : ''}</em></div>
      </div>
      <TabelaPessoas linhas={e.linhas} mostrarEquipe={false} />
    </div>
  );
}

// ── Quartis ─────────────────────────────────────────────────────────────────

function AbaQuartis({ resumo, carregando, equipes, quartis, resumoEmpresa, resumoMarca, rotuloMarca, nomeSetor }: {
  resumo: ResumoQuartis | null; carregando: boolean; equipes: EquipeNaTela[] | null; quartis: QuartilConfig[];
  resumoEmpresa: ResumoQuartis | null; resumoMarca: ResumoQuartis | null; rotuloMarca: string; nomeSetor: string;
}) {
  if (carregando) return <div className="vg-esq"><Skeleton className="h-40 rounded-2xl" /></div>;
  if (!resumo) return <SemFontes fontes={null} />;
  const faixa = (q: number) => {
    const ord = [...quartis].sort((a, b) => a.quartil - b.quartil);
    const i = ord.findIndex(x => x.quartil === q);
    const min = ord[i]?.min_pct ?? 0, acima = ord[i - 1]?.min_pct;
    return acima === undefined ? `${min}% ou mais` : min === 0 ? `abaixo de ${acima}%` : `${min} a ${acima - 1}%`;
  };
  return (
    <div className="vg-qgrade">
      <div className="vg-qcomp">
        <div className="vg-qlinha vg-qprin"><span>{nomeSetor}</span><FaixaQuartis resumo={resumo} rotulos alta /></div>
        <div className="vg-qlinha"><span>{rotuloMarca}</span><FaixaQuartis resumo={resumoMarca} /></div>
        <div className="vg-qlinha"><span>Empresa</span><FaixaQuartis resumo={resumoEmpresa} /></div>
        <LegendaQuartis resumo={resumo} />
        {equipes && equipes.length > 0 && (
          <>
            <div className="vg-subtit" style={{ marginTop: 14 }}>Por equipe</div>
            {equipes.map(e => (
              <div key={e.id} className="vg-qlinha"><span>{e.nome}</span><FaixaQuartis resumo={resumirQuartis(e.linhas, quartis)} /></div>
            ))}
          </>
        )}
      </div>
      <div className="vg-tabw">
        <table className="vg-tabela">
          <thead><tr><th>Quartil</th><th className="n">Pessoas</th><th className="n">% do setor</th><th className="n">Projeção média</th><th className="n">Recebido médio</th></tr></thead>
          <tbody>
            {resumo.fatias.map(f => (
              <tr key={f.quartil}>
                <td><span className="vg-qchip" style={{ ['--q' as string]: `var(--vg-q${f.quartil})` }}>Q{f.quartil}</span> <small>{faixa(f.quartil)}</small></td>
                <td className="n">{f.qtd}</td>
                <td className="n"><b>{pct(f.pct)}</b></td>
                <td className="n">{f.mediaProjecao !== null ? pct(f.mediaProjecao) : '—'}</td>
                <td className="n">{f.recebidoMedio !== null ? formatBRL(f.recebidoMedio) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Pessoas ─────────────────────────────────────────────────────────────────

function AbaPessoas({ linhas }: { linhas: LinhaQuartil[] | null | undefined }) {
  if (linhas === undefined) return <div className="vg-esq"><Skeleton className="h-48 rounded-2xl" /></div>;
  if (linhas === null) return <SemFontes fontes={null} />;
  return (
    <>
      <TabelaPessoas linhas={linhas} mostrarEquipe />
      <p className="vg-nota">A mesma conta e as mesmas faixas da aba Quartis do Painel Líder: quem está de férias, desligado ou sem meta individual fica fora.</p>
    </>
  );
}

function TabelaPessoas({ linhas, mostrarEquipe }: { linhas: LinhaQuartil[]; mostrarEquipe: boolean }) {
  const ordenadas = useMemo(() => [...linhas].sort((a, b) => (b.projecao ?? -1) - (a.projecao ?? -1)), [linhas]);
  if (!ordenadas.length) return <p className="vg-nota">Ninguém com meta individual neste mês.</p>;
  return (
    <div className="vg-tabw">
      <table className="vg-tabela">
        <thead><tr>
          <th>Pessoa</th>{mostrarEquipe && <th>Equipe</th>}<th className="n">Meta</th><th className="n">Recebido</th>
          <th className="n">Hoje deveria</th><th className="n">Diferença</th><th className="n">Projeção</th><th>Quartil</th>
        </tr></thead>
        <tbody>
          {ordenadas.map(l => {
            const q = l.quartil?.quartil ?? null;
            const d = l.diferenca ?? 0;
            return (
              <tr key={l.op.id} className={q ? `vg-q${q}` : undefined}>
                <td><b>{l.op.nome}</b>{l.ajusteManual ? <small title="Parte do recebido veio de ajuste manual"> · ajuste</small> : null}</td>
                {mostrarEquipe && <td>{l.equipeNome || '—'}</td>}
                <td className="n">{l.meta !== null ? formatBRL(l.meta) : '—'}</td>
                <td className="n">{formatBRL(l.recebido)}</td>
                <td className="n">{l.hoje !== null ? formatBRL(l.hoje) : '—'}</td>
                <td className={cn('n', d >= 0 ? 'vg-sobe' : 'vg-desce')}>{l.diferenca !== null ? `${d >= 0 ? '+' : '−'}${formatBRL(Math.abs(d))}` : '—'}</td>
                <td className="n" style={l.projecao !== null ? { color: `var(--vg-${tomDoRitmo(l.projecao)})`, fontWeight: 700 } : undefined}>{l.projecao !== null ? pct(l.projecao) : '—'}</td>
                <td>{q && <span className="vg-qchip" style={{ ['--q' as string]: `var(--vg-q${q})` }}>Q{q}</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Agenda ──────────────────────────────────────────────────────────────────

function AbaAgenda({ empresa, setorId, mes, nome }: { empresa: string | null; setorId: string | null; mes: string; nome: string }) {
  const [a, setA] = useState<AgendaDoSetor | null | undefined>(undefined);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    if (!empresa || !setorId) { setA(null); return; }
    let vivo = true;
    buscarAgendaDosSetores(empresa, mes)
      .then(m => { if (vivo) setA(m[setorId] ?? null); })
      .catch(e => { if (vivo) setErro(e instanceof Error ? e.message : 'Falha ao ler a agenda.'); });
    return () => { vivo = false; };
  }, [empresa, setorId, mes]);
  if (erro) return <p className="vg-nota">{erro}</p>;
  if (a === undefined) return <div className="vg-esq"><Skeleton className="h-24 rounded-2xl" /></div>;
  if (!empresa) return <SemFontes fontes={null} />;
  if (!a || !a.agendado) return <p className="vg-nota">Nenhum acordo de {nome} vence neste mês.</p>;
  const t = a.agendado;
  return (
    <>
      <div className="vg-kpis vg-kpis-4">
        <div className="vg-kpi vg-forte"><small>Agendado no mês</small><b>{mil(t)}</b><em>{a.acordos} acordos salvos</em></div>
        <div className="vg-kpi"><small>Já pago</small><b className="vg-sobe">{mil(a.pago)}</b><em>{pct((a.pago / t) * 100)} do agendado</em></div>
        <div className="vg-kpi"><small>A vencer</small><b>{mil(a.aVencer)}</b><em>{pct((a.aVencer / t) * 100)} do agendado</em></div>
        <div className="vg-kpi"><small>Não pago</small><b className="vg-desce">{mil(a.naoPago)}</b><em>{pct((a.naoPago / t) * 100)} do agendado</em></div>
      </div>
      <div className="vg-funil" aria-hidden="true">
        <i style={{ width: `${(a.pago / t) * 100}%`, background: 'var(--vg-q1)' }} />
        <i style={{ width: `${(a.aVencer / t) * 100}%`, background: 'color-mix(in srgb, var(--muted-foreground) 35%, transparent)' }} />
        <i style={{ width: `${(a.naoPago / t) * 100}%`, background: 'var(--vg-q4)' }} />
      </div>
      <p className="vg-nota">
        Dos acordos salvos no gestão que vencem neste mês, pela tabulação. Se tudo que ainda vence for pago, {nome} soma mais {mil(a.aVencer)}.
      </p>
    </>
  );
}

// ── Dia a dia ───────────────────────────────────────────────────────────────

function AbaDia({ setor, empresaId, mes, mesAnterior, diaCorte, diasNoMes, cal, cofen, modo, ritmo }: {
  setor: SetorDoPlacar; empresaId: string; mes: string; mesAnterior: string; diaCorte: number; diasNoMes: number;
  cal: Calendario; cofen: CofenDoMes | null; modo: ModoCofen; ritmo: Ritmo | null;
}) {
  const [d, setD] = useState<Detalhe59 | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    if (setor.cofen || !setor.setorId) return;
    let vivo = true;
    buscarDetalheDoSetor(empresaId, mes, { setorId: setor.setorId }, diaCorte)
      .then(x => { if (vivo) setD(x); })
      .catch(e => { if (vivo) setErro(e instanceof Error ? e.message : 'Falha ao carregar.'); });
    return () => { vivo = false; };
  }, [setor.cofen, setor.setorId, empresaId, mes, diaCorte]);

  const meta = ritmo?.meta ?? null;
  if (setor.cofen && cofen) {
    return (
      <>
        <div className="vg-dia2">
          <div><div className="vg-subtit">Ritmo do mês · {rotuloModo(modo)}</div>
            <GraficoRitmo mes={mes} serie={serieCofen(cofen, modo)} meta={meta} cal={cal} diaCorte={diaCorte} diasNoMes={diasNoMes} baixo /></div>
          <div><div className="vg-subtit">Formas de pagamento · {rotuloModo(modo)}</div><FormasDoEscopo formas={formasCofen(cofen, modo)} /></div>
        </div>
        <div><div className="vg-subtit">Para onde vai o bruto</div><PilhaCofen v={cofen.mes} legenda /></div>
        <p className="vg-nota">Total do relatório de conciliação, pela data de cada pagamento, como no acumulado da diretoria PaguePlay.</p>
      </>
    );
  }
  if (erro) return <p className="vg-nota">{erro}</p>;
  if (!d) return <div className="vg-esq"><Skeleton className="h-40 rounded-2xl" /></div>;
  return (
    <div className="vg-dia2">
      <div><div className="vg-subtit">Ritmo do mês · comparando com {nomeDoMes(mesAnterior)}</div>
        <GraficoRitmo mes={mes} serie={d.serie} meta={meta} cal={cal} diaCorte={diaCorte} diasNoMes={d.diasNoMes} baixo /></div>
      <div><div className="vg-subtit">Formas de pagamento</div><FormasDoEscopo formas={d.formas} /></div>
    </div>
  );
}

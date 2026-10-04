/**
 * Os setores da cidade aberta, e o detalhe do setor aberto no lugar.
 *
 * Nosso produto: o valor de cada cartão é o da aba «Setores e equipes» (a
 * mesma grade), e o detalhe é o mesmo `fn_mestre_diretoria_setor` daquela aba
 * — uma tela não pode discordar da outra sobre quanto um setor recebeu.
 *
 * Cofen é outra carteira, com outra estrutura: o número vem do relatório de
 * conciliação (H.O. ou bruto, pelo disjuntor), o repasse sai das colunas do
 * relatório, e os operadores são os do Analítico.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ArrowDownWideNarrow, ArrowDownAZ, TrendingUp, X, CreditCard, Users, Receipt, Layers } from 'lucide-react';
import { AbasSegmentadas, type AbaSegmentada } from '@/components/AbasSegmentadas';
import { KpiTile } from '@/components/KpiTile';
import { Skeleton } from '@/components/ui/skeleton';
import { formatBRL } from '@/lib/money';
import { cn } from '@/lib/utils';
import { buscarDetalheDoSetor, type DetalheDoSetor } from '@/services/mestre/diretoriaSetores.service';
import type { CarteiraDaCidade, CofenDoMes } from '@/services/mestre/diretoriaCidades.service';
import {
  formasCofen, mediaDiaria, noModo, nomeDoMes, serieCofen, variacaoPct,
  type CidadeDaVisao, type ModoCofen, type ParteCofen, type SetorDaCidade,
} from './modelo';
import { EscolhaDaCarteira, FormasDoEscopo, GraficoDoMes, PilhaCofen } from './partes';
import { mil, pct, rotuloModo, sinal } from './formato';

type Ordem = 'valor' | 'cresc' | 'az';
const ORDENS: readonly AbaSegmentada<Ordem>[] = [
  { key: 'valor', label: 'Maior recebido', Icon: ArrowDownWideNarrow },
  { key: 'cresc', label: 'Maior crescimento', Icon: TrendingUp },
  { key: 'az', label: 'A–Z', Icon: ArrowDownAZ },
];

/** O que está aberto: um setor ou carteira do 59, ou a carteira Cofen. */
type Alvo = { tipo: 'setor' | 'carteira'; id: string; nome: string } | { tipo: 'cofen'; id: string; nome: string };

export function SetoresDaCidade({
  empresaId, mes, mesAnterior, diaCorte, cidade, cofen, modo, cidadesParaEscolha, superAdmin, onGravou,
}: {
  empresaId: string; mes: string; mesAnterior: string; diaCorte: number;
  cidade: CidadeDaVisao; cofen: CofenDoMes | null; modo: ModoCofen;
  cidadesParaEscolha: { id: string; nome: string }[]; superAdmin: boolean; onGravou: () => void;
}) {
  const [ordem, setOrdem] = useState<Ordem>('valor');
  const [alvo, setAlvo] = useState<Alvo | null>(null);
  // Outra cidade: nada do que estava aberto vale.
  useEffect(() => { setAlvo(null); setOrdem('valor'); }, [cidade.chave]);

  const setores = useMemo(() => {
    const cresc = (s: SetorDaCidade) => (s.temAnterior ? variacaoPct(s.valor, s.valorAnterior) ?? -Infinity : -Infinity);
    return [...cidade.setores].sort((a, b) =>
      ordem === 'az' ? a.nome.localeCompare(b.nome) : ordem === 'cresc' ? cresc(b) - cresc(a) : b.valor - a.valor);
  }, [cidade.setores, ordem]);
  const maior = Math.max(1, ...cidade.setores.map(s => s.valor));
  const atraso = (i: number) => ({ animationDelay: `${120 + i * 60}ms` });
  const alternar = (a: Alvo) => setAlvo(x => (x && x.tipo === a.tipo && x.id === a.id ? null : a));
  const aberto = (tipo: Alvo['tipo'], id: string) => alvo?.tipo === tipo && alvo.id === id;
  const total = cidade.setores.length + (cidade.cofen ? 1 : 0);

  return (
    <div>
      <div className="vg-sec-cab">
        <h3>Setores de {cidade.nome} · {total}</h3>
        <AbasSegmentadas<Ordem> abas={ORDENS} ativa={ordem} onTrocar={setOrdem} rotulo="Ordenar setores" />
      </div>
      <div className="vg-setores">
        {setores.map((s, i) => {
          const v = s.temAnterior ? variacaoPct(s.valor, s.valorAnterior) : null;
          const sel = aberto('setor', s.setorId);
          return (
            <button key={s.setorId} type="button" className={cn('vg-card-setor', sel && 'vg-sel')} style={atraso(i)}
              onClick={() => alternar({ tipo: 'setor', id: s.setorId, nome: s.nome })} aria-expanded={sel}>
              <h4>{s.nome}{v !== null && <span className={cn('vg-var-pq', v >= 0 ? 'vg-sobe' : 'vg-desce')}>{v >= 0 ? '+' : '−'}{pct(Math.abs(v))}</span>}</h4>
              <div className="vg-valor">{formatBRL(s.valor)}</div>
              <div className="vg-meta">{s.operadores} operadores · {s.linhas.toLocaleString('pt-BR')} pgtos</div>
              <div className="vg-tr"><i style={{ width: `${(s.valor / maior) * 100}%`, animationDelay: `${250 + i * 60}ms` }} /></div>
            </button>
          );
        })}
        {cidade.cofen && (
          <CartaoCofen parte={cidade.cofen} modo={modo} estilo={atraso(setores.length)}
            sel={aberto('cofen', cidade.cofen.setorId ?? 'cofen')}
            onAbrir={() => alternar({ tipo: 'cofen', id: cidade.cofen?.setorId ?? 'cofen', nome: cidade.cofen?.nome ?? 'Cofen' })} />
        )}
        {cidade.carteirasSemSetor.map((k, i) => (
          <CartaoCarteira key={k.cod} carteira={k} cidade={cidade.nome} estilo={atraso(setores.length + 1 + i)}
            sel={aberto('carteira', k.cod)} onAbrir={() => alternar({ tipo: 'carteira', id: k.cod, nome: k.nome })}
            empresaId={empresaId} cidadesParaEscolha={cidadesParaEscolha} superAdmin={superAdmin} onGravou={onGravou} />
        ))}
      </div>
      {total === 0 && cidade.carteirasSemSetor.length === 0 && (
        <p className="vg-nota" style={{ marginTop: 8 }}>Nenhum setor desta cidade recebeu no período.</p>
      )}

      <div className={cn('vg-desdobra', alvo && 'vg-aberto')}>
        <div>
          {alvo?.tipo === 'cofen' && cofen ? (
            <DetalheCofen key="cofen" cofen={cofen} modo={modo} mes={mes} mesAnterior={mesAnterior} diaCorte={diaCorte}
              onFechar={() => setAlvo(null)} />
          ) : alvo && alvo.tipo !== 'cofen' ? (
            <DetalheNoLugar key={`${alvo.tipo}-${alvo.id}`} empresaId={empresaId} mes={mes} mesAnterior={mesAnterior}
              diaCorte={diaCorte} alvo={alvo} onFechar={() => setAlvo(null)} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** O cartão da carteira Cofen: o número no modo, o outro ao lado, e o repasse. */
function CartaoCofen({ parte: c, modo, estilo, sel, onAbrir }: {
  parte: ParteCofen; modo: ModoCofen; estilo: CSSProperties; sel: boolean; onAbrir: () => void;
}) {
  const v = variacaoPct(c.valor, c.valorAnterior);
  return (
    <button type="button" className={cn('vg-card-setor vg-cofen', sel && 'vg-sel')} style={estilo} onClick={onAbrir} aria-expanded={sel}>
      <h4>{c.nome}<span className="vg-selo cofen">Carteira Cofen</span></h4>
      <div className="vg-valor">{formatBRL(c.valor)}<small>{rotuloModo(modo)}</small></div>
      <div className="vg-meta">
        {modo === 'ho' ? `bruto ${formatBRL(c.bruto)}` : `H.O. ${formatBRL(c.ho)}`}
        {v !== null && <> · <span className={v >= 0 ? 'vg-sobe' : 'vg-desce'}>{sinal(v)}</span></>} · {c.operadores} operadores
      </div>
      <div style={{ marginTop: 12 }}><PilhaCofen v={c} legenda /></div>
    </button>
  );
}

function CartaoCarteira({ carteira: k, cidade, estilo, sel, onAbrir, empresaId, cidadesParaEscolha, superAdmin, onGravou }: {
  carteira: CarteiraDaCidade; cidade: string; estilo: CSSProperties; sel: boolean; onAbrir: () => void;
  empresaId: string; cidadesParaEscolha: { id: string; nome: string }[]; superAdmin: boolean; onGravou: () => void;
}) {
  return (
    <div className={cn('vg-card-setor vg-solta', sel && 'vg-sel')} style={estilo}>
      <button type="button" onClick={onAbrir} aria-expanded={sel} className="text-left" style={{ all: 'unset', cursor: 'pointer', display: 'block' }}>
        <h4>{k.nome}<span className="vg-selo alerta">carteira sem setor</span></h4>
        <div className="vg-valor">{formatBRL(k.valor)}</div>
        <div className="vg-meta">conta para {cidade} por escolha no painel · {k.linhas} pgtos</div>
      </button>
      {superAdmin && (
        <div style={{ marginTop: 12 }}>
          <EscolhaDaCarteira empresaId={empresaId} carteira={k} cidades={cidadesParaEscolha} superAdmin={superAdmin} onGravou={onGravou} />
        </div>
      )}
    </div>
  );
}

/** Leva o detalhe para a vista depois que a grade abre. */
function useLevarParaVista() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const t = window.setTimeout(() => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 200);
    return () => window.clearTimeout(t);
  }, []);
  return ref;
}

function Cabecalho({ nome, selo, sub, onFechar }: { nome: string; selo: ReactNode; sub: string; onFechar: () => void }) {
  return (
    <div className="vg-dia-cab">
      <div>
        <div className="vg-dia-data" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>{nome}{selo}</div>
        <div className="vg-dia-sub">{sub}</div>
      </div>
      <div className="vg-nav"><button type="button" aria-label="Fechar o detalhe" onClick={onFechar}><X className="w-4 h-4" /></button></div>
    </div>
  );
}

/** O detalhe da carteira Cofen: tudo do que já está carregado, sem nova leitura. */
function DetalheCofen({ cofen: c, modo, mes, mesAnterior, diaCorte, onFechar }: {
  cofen: CofenDoMes; modo: ModoCofen; mes: string; mesAnterior: string; diaCorte: number; onFechar: () => void;
}) {
  const ref = useLevarParaVista();
  const valor = noModo(c.mes, modo);
  const anterior = modo === 'ho' ? c.anterior.hoAteCorte : c.anterior.brutoAteCorte;
  const v = variacaoPct(valor, anterior);
  const serie = useMemo(() => serieCofen(c, modo), [c, modo]);
  const formas = useMemo(() => formasCofen(c, modo), [c, modo]);
  const dias = c.serie.filter(d => d.dentroDoCorte && d.bruto !== 0).length;
  const ops = useMemo(() => [...c.operadores.lista].sort((a, b) => noModo(b, modo) - noModo(a, modo)), [c, modo]);
  const maiorOp = Math.max(1, ...ops.map(o => noModo(o, modo)));
  const somaOps = ops.reduce((a, o) => a + noModo(o, modo), 0);

  return (
    <div ref={ref} className="vg-detalhe vg-detalhe-cofen">
      <Cabecalho nome={c.nome} selo={<span className="vg-selo cofen">Carteira Cofen</span>} onFechar={onFechar}
        sub={`O mês até o dia ${diaCorte} · total do relatório de conciliação, operadores do Analítico · em ${rotuloModo(modo)}`} />
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <KpiTile rotulo={modo === 'ho' ? 'H.O. · fica com a operação' : 'Bruto recebido'} valor="" valorNumerico={valor} formatar={formatBRL}
          sub={`${modo === 'ho' ? `bruto ${formatBRL(c.mes.bruto)}` : `H.O. ${formatBRL(c.mes.ho)}`}${v !== null ? ` · ${sinal(v)} sobre ${nomeDoMes(mesAnterior)}` : ''}`}
          Icon={Receipt} tom="alerta" />
        <KpiTile rotulo="Pagamentos" valor={c.mes.quantidade.toLocaleString('pt-BR')}
          sub={c.mes.quantidade ? `ticket ${formatBRL(valor / c.mes.quantidade)} ${rotuloModo(modo)}` : undefined} Icon={CreditCard} tom="primario" />
        <KpiTile rotulo="Operadores" valor={c.operadores.quantidade} sub="com recebimento no Analítico" Icon={Users} tom="neutro" />
        <KpiTile rotulo="Média por dia" valor={dias ? mil(valor / dias) : '—'} sub={`${dias} dias com recebimento`} Icon={Layers} tom="neutro" />
      </div>
      <div>
        <div className="vg-subtit" style={{ marginBottom: 10 }}>Para onde vai o bruto</div>
        <PilhaCofen v={c.mes} legenda />
      </div>
      <div className="vg-detalhe-grade">
        <div>
          <div className="vg-subtit" style={{ marginBottom: 10 }}>Dia a dia · {rotuloModo(modo)}</div>
          <GraficoDoMes mes={mes} serie={serie} diaCorte={diaCorte} diasNoMes={c.diasNoMes}
            mediaAnterior={mediaDiaria(modo === 'ho' ? c.anterior.hoMes : c.anterior.brutoMes, c.anterior.dias)}
            mesAnterior={mesAnterior} diaAberto={null} />
        </div>
        <div>
          <div className="vg-subtit" style={{ marginBottom: 10 }}>Formas de pagamento · {rotuloModo(modo)}</div>
          <FormasDoEscopo formas={formas} />
        </div>
      </div>
      {ops.length > 0 && (
        <div>
          <div className="vg-subtit" style={{ marginBottom: 10 }}>Operadores · Analítico</div>
          <div className="vg-equipes">
            {ops.map((o, i) => (
              <div key={o.operadorId} className="vg-equipe">
                <span><b>{o.nome}</b><small> · {o.pagamentos} pgtos</small></span>
                <span className="font-mono text-xs">{formatBRL(noModo(o, modo))}</span>
                <span className="vg-tr"><i style={{ width: `${(noModo(o, modo) / maiorOp) * 100}%`, animationDelay: `${Math.min(i, 12) * 40}ms` }} /></span>
              </div>
            ))}
          </div>
          <p className="vg-nota" style={{ marginTop: 8 }}>
            Os operadores somam {formatBRL(somaOps)} no Analítico. O total da carteira é o do relatório de conciliação:
            são relatórios diferentes, e um não é a divisão do outro.
          </p>
        </div>
      )}
    </div>
  );
}

/** O detalhe de um setor (ou carteira) do 59, aberto embaixo da grade. */
function DetalheNoLugar({ empresaId, mes, mesAnterior, diaCorte, alvo, onFechar }: {
  empresaId: string; mes: string; mesAnterior: string; diaCorte: number;
  alvo: { tipo: 'setor' | 'carteira'; id: string; nome: string }; onFechar: () => void;
}) {
  const [d, setD] = useState<DetalheDoSetor | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const ref = useLevarParaVista();

  useEffect(() => {
    let vivo = true;
    const busca = alvo.tipo === 'setor'
      ? buscarDetalheDoSetor(empresaId, mes, { setorId: alvo.id }, diaCorte)
      : buscarDetalheDoSetor(empresaId, mes, { codGrupo: alvo.id }, diaCorte);
    busca.then(x => { if (vivo) setD(x); }).catch(e => { if (vivo) setErro(e instanceof Error ? e.message : 'Falha ao carregar.'); });
    return () => { vivo = false; };
  }, [empresaId, mes, diaCorte, alvo]);

  const cab = (
    <Cabecalho nome={alvo.nome} onFechar={onFechar}
      selo={alvo.tipo === 'carteira' ? <span className="vg-selo alerta">carteira sem setor</span> : null}
      sub={`O mês até o dia ${diaCorte} · os mesmos números da aba Setores e equipes`} />
  );

  if (erro) return <div ref={ref} className="vg-detalhe">{cab}<p className="vg-nota">{erro}</p></div>;
  if (!d) return <div ref={ref} className="vg-detalhe">{cab}<Skeleton className="h-20 rounded-xl" /><Skeleton className="h-40 rounded-xl" /></div>;

  const v = d.temAnterior ? variacaoPct(d.recebido, d.recebidoAnterior) : null;
  const maiorEquipe = Math.max(1, ...d.equipes.map(e => e.valor));
  const diasComRecebimento = d.serie.filter(x => x.dentroDoCorte && x.valor > 0).length;

  return (
    <div ref={ref} className="vg-detalhe">
      {cab}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <KpiTile rotulo="Recebido" valor={formatBRL(d.recebido)} sub={v !== null ? `${sinal(v)} sobre ${nomeDoMes(mesAnterior)}` : undefined} Icon={Receipt} tom="sucesso" />
        <KpiTile rotulo="Pagamentos" valor={d.linhas.toLocaleString('pt-BR')} sub={d.linhas ? `ticket ${formatBRL(d.recebido / d.linhas)}` : undefined} Icon={CreditCard} tom="primario" />
        <KpiTile rotulo="Operadores" valor={d.operadores} sub={`${d.equipes.length} equipes`} Icon={Users} tom="neutro" />
        <KpiTile rotulo="Média por dia" valor={diasComRecebimento ? mil(d.recebido / diasComRecebimento) : '—'} sub={`${diasComRecebimento} dias com recebimento`} Icon={Layers} tom="neutro" />
      </div>
      <div className="vg-detalhe-grade">
        <div>
          <div className="vg-subtit" style={{ marginBottom: 10 }}>Dia a dia</div>
          <GraficoDoMes mes={mes} serie={d.serie} diaCorte={diaCorte} diasNoMes={d.diasNoMes}
            mediaAnterior={0} mesAnterior={mesAnterior} diaAberto={null} />
        </div>
        <div>
          <div className="vg-subtit" style={{ marginBottom: 10 }}>Formas de pagamento</div>
          <FormasDoEscopo formas={d.formas} />
        </div>
      </div>
      {d.equipes.length > 0 && (
        <div>
          <div className="vg-subtit" style={{ marginBottom: 10 }}>Equipes</div>
          <div className="vg-equipes">
            {[...d.equipes].sort((a, b) => b.valor - a.valor).map((e, i) => (
              <div key={`${e.codGrupo}-${e.nome}`} className="vg-equipe">
                <span><b>{e.equipeNome ?? e.nome}</b>{e.liderNome && <small> · {e.liderNome}</small>}
                  {e.veioDeFora && <small> · veio de outra carteira</small>}{e.eIntegral && <small> · integral</small>}</span>
                <span className="font-mono text-xs">{formatBRL(e.valor)} · {e.operadores} op.</span>
                <span className="vg-tr"><i style={{ width: `${(e.valor / maiorEquipe) * 100}%`, animationDelay: `${i * 50}ms` }} /></span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

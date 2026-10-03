/**
 * Os setores da cidade aberta, e o detalhe do setor aberto no lugar.
 *
 * O valor de cada cartão é o da aba «Setores e equipes» (a mesma grade), e o
 * detalhe é o mesmo `fn_mestre_diretoria_setor` daquela aba — uma tela não
 * pode discordar da outra sobre quanto um setor recebeu.
 *
 * Setor com regra Cofen tem outro cartão: o número grande é o H.O. (o que fica
 * com a operação), com o bruto ao lado e a divisão do repasse.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ArrowDownWideNarrow, ArrowDownAZ, TrendingUp, X, CreditCard, Users, Receipt, Layers } from 'lucide-react';
import { AbasSegmentadas, type AbaSegmentada } from '@/components/AbasSegmentadas';
import { KpiTile } from '@/components/KpiTile';
import { Skeleton } from '@/components/ui/skeleton';
import { formatBRL } from '@/lib/money';
import { cn } from '@/lib/utils';
import { buscarDetalheDoSetor, type DetalheDoSetor } from '@/services/mestre/diretoriaSetores.service';
import type { CarteiraDaCidade } from '@/services/mestre/diretoriaCidades.service';
import { divisaoCofen, nomeDoMes, variacaoPct, type CidadeDaVisao, type SetorDaCidade } from './modelo';
import { EscolhaDaCarteira, FormasDoEscopo, GraficoDoMes, PilhaCofen } from './partes';
import { mil, pct, sinal } from './formato';

type Ordem = 'valor' | 'cresc' | 'az';
const ORDENS: readonly AbaSegmentada<Ordem>[] = [
  { key: 'valor', label: 'Maior recebido', Icon: ArrowDownWideNarrow },
  { key: 'cresc', label: 'Maior crescimento', Icon: TrendingUp },
  { key: 'az', label: 'A–Z', Icon: ArrowDownAZ },
];

/** O que está aberto: um setor, ou uma carteira sem setor. */
type Alvo = { tipo: 'setor'; id: string; nome: string; cofen: boolean } | { tipo: 'carteira'; id: string; nome: string; cofen: boolean };

export function SetoresDaCidade({
  empresaId, mes, mesAnterior, diaCorte, cidade, ho, cidadesParaEscolha, podeDefinir, onGravou,
}: {
  empresaId: string; mes: string; mesAnterior: string; diaCorte: number;
  cidade: CidadeDaVisao; ho: number; cidadesParaEscolha: { id: string; nome: string }[];
  podeDefinir: boolean; onGravou: () => void;
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

  return (
    <div>
      <div className="vg-sec-cab">
        <h3>Setores de {cidade.nome} · {cidade.setores.length}</h3>
        <AbasSegmentadas<Ordem> abas={ORDENS} ativa={ordem} onTrocar={setOrdem} rotulo="Ordenar setores" />
      </div>
      <div className="vg-setores">
        {setores.map((s, i) => {
          const v = s.temAnterior ? variacaoPct(s.valor, s.valorAnterior) : null;
          const sel = alvo?.tipo === 'setor' && alvo.id === s.setorId;
          const abrir = () => setAlvo(sel ? null : { tipo: 'setor', id: s.setorId, nome: s.nome, cofen: s.regra === 'cofen' });
          if (s.regra === 'cofen') {
            return (
              <button key={s.setorId} type="button" className={cn('vg-card-setor vg-cofen', sel && 'vg-sel')} style={atraso(i)} onClick={abrir} aria-expanded={sel}>
                <h4>{s.nome}<span className="vg-selo cofen">Regra Cofen</span></h4>
                <div className="vg-valor">{formatBRL(s.valor * ho)}<small>H.O.</small></div>
                <div className="vg-meta">bruto {formatBRL(s.valor)}{v !== null && <> · <span className={v >= 0 ? 'vg-sobe' : 'vg-desce'}>{sinal(v)}</span></>} · {s.operadores} operadores</div>
                <div style={{ marginTop: 12 }}><PilhaCofen bruto={s.valor} ho={ho} legenda /></div>
              </button>
            );
          }
          return (
            <button key={s.setorId} type="button" className={cn('vg-card-setor', sel && 'vg-sel')} style={atraso(i)} onClick={abrir} aria-expanded={sel}>
              <h4>{s.nome}{v !== null && <span className={cn('vg-var-pq', v >= 0 ? 'vg-sobe' : 'vg-desce')}>{v >= 0 ? '+' : '−'}{pct(Math.abs(v))}</span>}</h4>
              <div className="vg-valor">{formatBRL(s.valor)}</div>
              <div className="vg-meta">{s.operadores} operadores · {s.linhas.toLocaleString('pt-BR')} pgtos</div>
              <div className="vg-tr"><i style={{ width: `${(s.valor / maior) * 100}%`, animationDelay: `${250 + i * 60}ms` }} /></div>
            </button>
          );
        })}
        {cidade.carteirasSemSetor.map((k, i) => (
          <CartaoCarteira key={k.cod} carteira={k} ho={ho} cidade={cidade.nome} estilo={atraso(setores.length + i)}
            sel={alvo?.tipo === 'carteira' && alvo.id === k.cod}
            onAbrir={() => setAlvo(alvo?.tipo === 'carteira' && alvo.id === k.cod ? null : { tipo: 'carteira', id: k.cod, nome: k.nome, cofen: k.regra === 'cofen' })}
            empresaId={empresaId} cidadesParaEscolha={cidadesParaEscolha} podeDefinir={podeDefinir} onGravou={onGravou} />
        ))}
      </div>
      {cidade.setores.length === 0 && cidade.carteirasSemSetor.length === 0 && (
        <p className="vg-nota" style={{ marginTop: 8 }}>Nenhum setor desta cidade recebeu no período.</p>
      )}

      <div className={cn('vg-desdobra', alvo && 'vg-aberto')}>
        <div>
          {alvo && (
            <DetalheNoLugar key={`${alvo.tipo}-${alvo.id}`} empresaId={empresaId} mes={mes} mesAnterior={mesAnterior}
              diaCorte={diaCorte} alvo={alvo} ho={ho} onFechar={() => setAlvo(null)} />
          )}
        </div>
      </div>
    </div>
  );
}

function CartaoCarteira({ carteira: k, ho, cidade, estilo, sel, onAbrir, empresaId, cidadesParaEscolha, podeDefinir, onGravou }: {
  carteira: CarteiraDaCidade; ho: number; cidade: string; estilo: CSSProperties; sel: boolean; onAbrir: () => void;
  empresaId: string; cidadesParaEscolha: { id: string; nome: string }[]; podeDefinir: boolean; onGravou: () => void;
}) {
  const cofen = k.regra === 'cofen';
  return (
    <div className={cn('vg-card-setor', cofen ? 'vg-cofen' : 'vg-solta', sel && 'vg-sel')} style={estilo}>
      <button type="button" onClick={onAbrir} aria-expanded={sel} className="text-left" style={{ all: 'unset', cursor: 'pointer', display: 'block' }}>
        <h4>{k.nome}<span className={cn('vg-selo', cofen ? 'cofen' : 'alerta')}>{cofen ? 'Regra Cofen' : 'carteira sem setor'}</span></h4>
        {cofen
          ? <div className="vg-valor">{formatBRL(k.valor * ho)}<small>H.O.</small></div>
          : <div className="vg-valor">{formatBRL(k.valor)}</div>}
        <div className="vg-meta">
          {cofen ? `bruto ${formatBRL(k.valor)} · ` : ''}conta para {cidade} por escolha no painel · {k.linhas} pgtos
        </div>
      </button>
      {cofen && <div style={{ marginTop: 12 }}><PilhaCofen bruto={k.valor} ho={ho} legenda /></div>}
      {podeDefinir && (
        <div style={{ marginTop: 12 }}>
          <EscolhaDaCarteira empresaId={empresaId} carteira={k} cidades={cidadesParaEscolha} podeDefinir={podeDefinir} onGravou={onGravou} />
        </div>
      )}
    </div>
  );
}

/** O detalhe de um setor (ou carteira) do 59, aberto embaixo da grade. */
function DetalheNoLugar({ empresaId, mes, mesAnterior, diaCorte, alvo, ho, onFechar }: {
  empresaId: string; mes: string; mesAnterior: string; diaCorte: number; alvo: Alvo; ho: number; onFechar: () => void;
}) {
  const [d, setD] = useState<DetalheDoSetor | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let vivo = true;
    const busca = alvo.tipo === 'setor'
      ? buscarDetalheDoSetor(empresaId, mes, { setorId: alvo.id }, diaCorte)
      : buscarDetalheDoSetor(empresaId, mes, { codGrupo: alvo.id }, diaCorte);
    busca.then(x => { if (vivo) setD(x); }).catch(e => { if (vivo) setErro(e instanceof Error ? e.message : 'Falha ao carregar.'); });
    // Leva o detalhe para a vista depois que a grade abre.
    const t = window.setTimeout(() => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 200);
    return () => { vivo = false; window.clearTimeout(t); };
  }, [empresaId, mes, diaCorte, alvo]);

  const cab = (
    <div className="vg-dia-cab">
      <div>
        <div className="vg-dia-data" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {alvo.nome}{alvo.cofen && <span className="vg-selo cofen">Regra Cofen</span>}{alvo.tipo === 'carteira' && <span className="vg-selo alerta">carteira sem setor</span>}
        </div>
        <div className="vg-dia-sub">O mês até o dia {diaCorte} · os mesmos números da aba Setores e equipes</div>
      </div>
      <div className="vg-nav"><button type="button" aria-label="Fechar o detalhe" onClick={onFechar}><X className="w-4 h-4" /></button></div>
    </div>
  );

  if (erro) return <div ref={ref} className="vg-detalhe">{cab}<p className="vg-nota">{erro}</p></div>;
  if (!d) return <div ref={ref} className="vg-detalhe">{cab}<Skeleton className="h-20 rounded-xl" /><Skeleton className="h-40 rounded-xl" /></div>;

  const v = d.temAnterior ? variacaoPct(d.recebido, d.recebidoAnterior) : null;
  const maiorEquipe = Math.max(1, ...d.equipes.map(e => e.valor));
  const cofen = alvo.cofen ? divisaoCofen(d.recebido, ho) : null;
  const diasComRecebimento = d.serie.filter(x => x.dentroDoCorte && x.valor > 0).length;

  return (
    <div ref={ref} className="vg-detalhe">
      {cab}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {cofen ? (
          <KpiTile rotulo="H.O. · fica" valor={formatBRL(cofen.ho)} sub={`bruto ${formatBRL(d.recebido)}${v !== null ? ` · ${sinal(v)}` : ''}`} Icon={Receipt} tom="alerta" />
        ) : (
          <KpiTile rotulo="Recebido" valor={formatBRL(d.recebido)} sub={v !== null ? `${sinal(v)} sobre ${nomeDoMes(mesAnterior)}` : undefined} Icon={Receipt} tom="sucesso" />
        )}
        <KpiTile rotulo="Pagamentos" valor={d.linhas.toLocaleString('pt-BR')} sub={d.linhas ? `ticket ${formatBRL(d.recebido / d.linhas)}${cofen ? ' bruto' : ''}` : undefined} Icon={CreditCard} tom="primario" />
        <KpiTile rotulo="Operadores" valor={d.operadores} sub={`${d.equipes.length} equipes`} Icon={Users} tom="neutro" />
        <KpiTile rotulo="Média por dia" valor={diasComRecebimento ? mil(d.recebido / diasComRecebimento) : '—'} sub={`${diasComRecebimento} dias com recebimento`} Icon={Layers} tom="neutro" />
      </div>
      {cofen && <PilhaCofen bruto={d.recebido} ho={ho} legenda />}
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

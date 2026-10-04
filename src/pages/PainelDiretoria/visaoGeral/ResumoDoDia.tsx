/**
 * O resumo de um dia, aberto ali mesmo, embaixo do gráfico.
 *
 * Escopo: o geral, ou a cidade aberta. Duas carteiras, duas fontes:
 *
 *   - Nosso produto: o 59 do dia (`fn_mestre_diretoria_dia`) — setores, e as
 *     carteiras sem setor e o que conta só no total, marcados;
 *   - Cofen: o dia da conciliação, já carregado com o mês (`cofenNoDia`), em
 *     bloco próprio — H.O. ou bruto pelo disjuntor, repasse das colunas do
 *     relatório, destaque do Analítico.
 *
 * O total do dia soma as duas, no modo escolhido.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, CreditCard, ArrowLeftRight, Users, Star, X } from 'lucide-react';
import { KpiTile } from '@/components/KpiTile';
import { Skeleton } from '@/components/ui/skeleton';
import { formatBRL } from '@/lib/money';
import { cn } from '@/lib/utils';
import {
  buscarResumoDoDia, espiarResumoDoDia, type EscopoDoDia, type ResumoDoDia as Resumo, type UnidadeDoDia,
} from '@/services/mestre/diretoriaCidades.service';
import { nomeDoMes, rotuloDoDia, separarDia, variacaoPct, type CofenNoDia, type MarcaVisual, type ModoCofen } from './modelo';
import { PilhaCofen, PilhaDeFormas } from './partes';
import { mil, pct, rotuloModo, sinal } from './formato';

export function ResumoDoDia({
  empresaId, mes, mesAnterior, dia, diaCorte, escopo, rotuloEscopo, cidadeDe, cofen, cidadeDoCofen, modo, onDia, onFechar,
}: {
  empresaId: string; mes: string; mesAnterior: string; dia: number; diaCorte: number;
  escopo: EscopoDoDia; rotuloEscopo: string;
  /** Nome e marca da cidade de um id — para a etiqueta de cada linha no geral. */
  cidadeDe: (id: string | null) => { nome: string; marca: MarcaVisual } | null;
  /** A carteira Cofen neste dia, se ela conta no escopo. */
  cofen: CofenNoDia | null;
  /** A etiqueta de cidade do bloco Cofen, no geral. */
  cidadeDoCofen: { nome: string; marca: MarcaVisual } | null;
  modo: ModoCofen; onDia: (dia: number) => void; onFechar: () => void;
}) {
  const [dados, setDados] = useState<Resumo | null>(() => espiarResumoDoDia(empresaId, mes, dia, escopo, diaCorte) ?? null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    setErro(null);
    const pronto = espiarResumoDoDia(empresaId, mes, dia, escopo, diaCorte);
    if (pronto) { setDados(pronto); return; }
    buscarResumoDoDia(empresaId, mes, dia, escopo, diaCorte)
      .then(d => { if (vivo) setDados(d); })
      .catch(e => { if (vivo) setErro(e instanceof Error ? e.message : 'Falha ao carregar o dia.'); });
    return () => { vivo = false; };
  }, [empresaId, mes, dia, escopo, diaCorte]);

  // O que está na tela é de outro dia ou escopo enquanto o novo chega: fica
  // esmaecido, mas fica — trocar de dia não pisca a tela em branco.
  const atual = dados && dados.dia === dia && dados.escopo === escopo;
  const separado = useMemo(() => (dados ? separarDia(dados.unidades) : null), [dados]);
  const formas = useMemo(() => (dados ? [...dados.formas, ...(cofen?.formas ?? [])] : []), [dados, cofen]);

  // As duas carteiras somadas, no modo.
  const total = dados ? {
    valor: dados.total.valor + (cofen?.valor ?? 0),
    linhas: dados.total.linhas + (cofen?.quantidade ?? 0),
    operadores: dados.total.operadores + (cofen?.operadores ?? 0),
    anterior: dados.mesmoDiaAnterior + (cofen?.valorAnterior ?? 0),
    mediaAnterior: dados.mediaDiaAnterior + (cofen?.mediaAnterior ?? 0),
  } : null;

  const cabecalho = (
    <div className="vg-dia-cab">
      <div>
        <div className="vg-dia-data">{rotuloDoDia(mes, dia)}{dia === diaCorte && diaCorte < diasDoMes(mes) ? ' · hoje, até agora' : ''}</div>
        <div className="vg-dia-sub">Resumo do dia · <b>{rotuloEscopo}</b>{cofen && <> · Cofen em {rotuloModo(modo)}</>}</div>
      </div>
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        {total && (
          <div className="vg-dia-valor">
            {formatBRL(total.valor)}
            {total.mediaAnterior > 0 && (() => {
              const v = variacaoPct(total.valor, total.mediaAnterior);
              return <small className={v !== null && v >= 0 ? 'vg-sobe' : 'vg-desce'}>{sinal(v)} sobre a média de {nomeDoMes(mesAnterior)}</small>;
            })()}
          </div>
        )}
        <div className="vg-nav">
          <button type="button" aria-label="Dia anterior" disabled={dia <= 1} onClick={() => onDia(dia - 1)}><ChevronLeft className="w-4 h-4" /></button>
          <button type="button" aria-label="Dia seguinte" disabled={dia >= diaCorte} onClick={() => onDia(dia + 1)}><ChevronRight className="w-4 h-4" /></button>
          <button type="button" aria-label="Fechar o resumo do dia" onClick={onFechar}><X className="w-4 h-4" /></button>
        </div>
      </div>
    </div>
  );

  if (erro) return <div className="vg-dia-in">{cabecalho}<p className="vg-nota">{erro}</p></div>;
  if (!dados || !separado || !total) {
    return <div className="vg-dia-in">{cabecalho}<Skeleton className="h-24 rounded-xl" /><Skeleton className="h-48 rounded-xl" /></div>;
  }

  const maiorNosso = separado.nossoProduto[0] ?? null;
  const maiorValor = Math.max(1, ...[...separado.nossoProduto, ...separado.semSetor, ...separado.soNoTotal].map(u => u.valor));
  const vsSet = variacaoPct(total.valor, total.anterior);
  const noGeral = escopo === 'geral';
  const setoresNoDia = dados.unidades.filter(u => u.tipo === 'setor').length + (cofen && cofen.valor !== 0 ? 1 : 0);

  const linha = (u: UnidadeDoDia, i: number, classe?: string, etiqueta?: ReactNode) => {
    const vsMedia = variacaoPct(u.valor, u.media);
    const c = noGeral ? cidadeDe(u.cidadeId) : null;
    return (
      <div key={`${u.tipo}-${u.setorId ?? u.cod}`} className={cn('vg-tab-l', classe)} role="row" style={{ animationDelay: `${60 + i * 40}ms` }}>
        <span className="vg-nome" role="cell"><span>{u.nome}</span>{etiqueta}{c && <span className={cn('vg-selo', c.marca)}>{c.nome}</span>}</span>
        <span className="vg-m vg-forte" role="cell">{formatBRL(u.valor)}</span>
        <span className="vg-m" role="cell">{u.linhas}</span>
        <span className="vg-m" role="cell">{u.linhas ? formatBRL(u.valor / u.linhas) : '—'}</span>
        <span className="vg-part" role="cell"><i><b style={{ width: `${(u.valor / maiorValor) * 100}%` }} /></i><span className="vg-m">{total.valor ? pct((u.valor / total.valor) * 100) : '—'}</span></span>
        <span className={cn('vg-m', vsMedia !== null && (vsMedia >= 0 ? 'vg-sobe' : 'vg-desce'))} role="cell">{vsMedia === null ? '—' : `${vsMedia >= 0 ? '+' : '−'}${pct(Math.abs(vsMedia))}`}</span>
        <span className="vg-dest" role="cell">{u.destaque ? <><b>{u.destaque.nome}</b> · {mil(u.destaque.valor)}</> : '—'}</span>
      </div>
    );
  };

  return (
    <div className="vg-dia-in" style={{ opacity: atual ? 1 : 0.55, transition: 'opacity .2s' }}>
      {cabecalho}

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <KpiTile rotulo="Pagamentos" valor={total.linhas.toLocaleString('pt-BR')}
          sub={total.linhas ? `ticket médio ${formatBRL(total.valor / total.linhas)}` : undefined} Icon={CreditCard} tom="sucesso" />
        <KpiTile rotulo={`Mesmo dia de ${nomeDoMes(mesAnterior)}`} valor={mil(total.anterior)}
          sub={vsSet !== null ? sinal(vsSet) : 'sem recebimento nesse dia'} Icon={ArrowLeftRight} tom="primario" />
        <KpiTile rotulo="Operadores que receberam" valor={total.operadores}
          sub={`${setoresNoDia} setores com recebimento`} Icon={Users} tom="neutro" />
        <KpiTile rotulo="Maior setor · Nosso produto" valor={maiorNosso?.nome ?? '—'}
          sub={maiorNosso && total.valor ? `${mil(maiorNosso.valor)} · ${pct((maiorNosso.valor / total.valor) * 100)} do dia` : undefined}
          Icon={Star} tom="alerta" />
      </div>

      {cofen && total.valor > 0 && (
        <div>
          <div className="vg-subtit" style={{ marginBottom: 10 }}>De qual carteira veio</div>
          <div className="vg-pilha" aria-hidden="true">
            <i style={{ width: `${(dados.total.valor / total.valor) * 100}%`, background: 'var(--vg-c)' }} />
            <i style={{ width: `${(cofen.valor / total.valor) * 100}%`, background: 'var(--vg-cofen)' }} />
          </div>
          <div className="vg-pilha-leg">
            <span><span className="vg-ponto" style={{ background: 'var(--vg-c)' }} />Nosso produto <b>{formatBRL(dados.total.valor)}</b></span>
            <span><span className="vg-ponto" style={{ background: 'var(--vg-cofen)' }} />Cofen ({rotuloModo(modo)}) <b>{formatBRL(cofen.valor)}</b></span>
          </div>
        </div>
      )}

      <div>
        <div className="vg-subtit" style={{ marginBottom: 10 }}>Por onde entrou no dia</div>
        <PilhaDeFormas formas={formas} />
      </div>

      {(separado.nossoProduto.length + separado.semSetor.length + separado.soNoTotal.length) > 0 && (
        <>
          <div className="vg-subtit">Setores · Nosso produto</div>
          <div className="vg-tab" role="table" aria-label="Setores no dia">
            <div className="vg-tab-l vg-cab" role="row">
              <span role="columnheader">Setor</span><span role="columnheader">Recebido</span><span role="columnheader">Pgtos</span>
              <span role="columnheader">Ticket</span><span role="columnheader">% do dia</span><span role="columnheader">vs média</span>
              <span role="columnheader">Destaque do dia</span>
            </div>
            {separado.nossoProduto.map((u, i) => linha(u, i))}
            {separado.semSetor.map((u, i) => linha(u, separado.nossoProduto.length + i, 'vg-solta', <span className="vg-selo alerta">sem setor</span>))}
            {separado.soNoTotal.map((u, i) => linha(u, separado.nossoProduto.length + separado.semSetor.length + i, 'vg-sogeral', <span className="vg-selo neutra">só no total</span>))}
          </div>
        </>
      )}

      {cofen && <BlocoCofen c={cofen} modo={modo} cidade={noGeral ? cidadeDoCofen : null} />}

      {dados.total.colchao > 0 && (
        <p className="vg-nota">
          {formatBRL(dados.total.colchao)} do dia é colchão (2ª parcela em diante de Pix automático e cartão recorrente):
          conta no total, em setor nenhum — por isso a tabela não fecha com o valor do dia.
        </p>
      )}
    </div>
  );
}

/** A carteira Cofen no dia: outra carteira, outra estrutura. */
function BlocoCofen({ c, modo, cidade }: { c: CofenNoDia; modo: ModoCofen; cidade: { nome: string; marca: MarcaVisual } | null }) {
  const vsMedia = variacaoPct(c.valor, c.media);
  const efetivo = c.bruto ? (c.ho / c.bruto) * 100 : null;
  return (
    <div className="vg-cofen">
      <div className="vg-cofen-cab">
        <h4>{c.nome} <span className="vg-selo cofen">Carteira Cofen</span>{cidade && <span className={cn('vg-selo', cidade.marca)}>{cidade.nome}</span>}</h4>
        <span className="vg-nota">
          Outra carteira: o que fica é o H.O.{efetivo !== null ? ` (${pct(efetivo)} no dia)` : ''}; o resto é repasse ao Coren e ao Cofen.
          Valores do relatório de conciliação.
        </span>
      </div>
      <div className="vg-cofen-grade">
        <div className={cn(modo === 'bruto' && 'vg-ho')}><small>Bruto recebido</small><b>{formatBRL(c.bruto)}</b></div>
        <div className={cn(modo === 'ho' && 'vg-ho')}><small>H.O. · fica</small><b>{formatBRL(c.ho)}</b></div>
        <div><small>Repasse Coren</small><b>{formatBRL(c.coren)}</b></div>
        <div><small>Repasse Cofen</small><b>{formatBRL(c.cofen)}</b></div>
      </div>
      <PilhaCofen v={c} />
      <div className="vg-cofen-pe">
        <span><b>{c.quantidade}</b> pagamentos</span>
        {c.quantidade > 0 && <span>ticket <b>{formatBRL(c.valor / c.quantidade)}</b> {rotuloModo(modo)}</span>}
        <span><b>{c.operadores}</b> operadores receberam (Analítico)</span>
        {vsMedia !== null && <span>{rotuloModo(modo)} <b className={vsMedia >= 0 ? 'vg-sobe' : 'vg-desce'}>{vsMedia >= 0 ? '+' : '−'}{pct(Math.abs(vsMedia))}</b> vs média do mês</span>}
        {c.destaque && <span>destaque: <b>{c.destaque.nome}</b> · {mil(c.destaque.valor)} {rotuloModo(modo)}</span>}
      </div>
    </div>
  );
}

function diasDoMes(mes: string): number {
  const [a, m] = mes.split('-').map(Number);
  return new Date(a, m, 0).getDate();
}

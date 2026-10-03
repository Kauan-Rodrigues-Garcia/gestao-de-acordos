/**
 * O resumo de um dia, aberto ali mesmo, embaixo do gráfico.
 *
 * Escopo: o geral, ou a cidade aberta. A tabela é de Nosso produto (setores, e
 * as carteiras sem setor e o que conta só no total, marcados); a regra Cofen
 * sai da tabela e ganha bloco próprio — o que fica com a operação ali é o H.O.,
 * e somar o bruto dela com o dos outros setores compararia coisas diferentes.
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
import { divisaoCofen, nomeDoMes, rotuloDoDia, separarDia, variacaoPct, type MarcaVisual } from './modelo';
import { PilhaCofen, PilhaDeFormas } from './partes';
import { mil, pct, sinal } from './formato';

export function ResumoDoDia({
  empresaId, mes, mesAnterior, dia, diaCorte, escopo, rotuloEscopo, cidadeDe, ho, onDia, onFechar,
}: {
  empresaId: string; mes: string; mesAnterior: string; dia: number; diaCorte: number;
  escopo: EscopoDoDia; rotuloEscopo: string;
  /** Nome e marca da cidade de um id — para a etiqueta de cada linha no geral. */
  cidadeDe: (id: string | null) => { nome: string; marca: MarcaVisual } | null;
  ho: number; onDia: (dia: number) => void; onFechar: () => void;
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

  const cabecalho = (
    <div className="vg-dia-cab">
      <div>
        <div className="vg-dia-data">{rotuloDoDia(mes, dia)}{dia === diaCorte && diaCorte < diasDoMes(mes) ? ' · hoje, até agora' : ''}</div>
        <div className="vg-dia-sub">Resumo do dia · <b>{rotuloEscopo}</b></div>
      </div>
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        {dados && (
          <div className="vg-dia-valor">
            {formatBRL(dados.total.valor)}
            {dados.mediaDiaAnterior > 0 && (() => {
              const v = variacaoPct(dados.total.valor, dados.mediaDiaAnterior);
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
  if (!dados || !separado) {
    return <div className="vg-dia-in">{cabecalho}<Skeleton className="h-24 rounded-xl" /><Skeleton className="h-48 rounded-xl" /></div>;
  }

  const { total } = dados;
  const maiorNosso = separado.nossoProduto[0] ?? null;
  const maiorValor = Math.max(1, ...[...separado.nossoProduto, ...separado.semSetor, ...separado.soNoTotal].map(u => u.valor));
  const vsSet = variacaoPct(total.valor, dados.mesmoDiaAnterior);
  const noGeral = escopo === 'geral';

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
        <KpiTile rotulo={`Mesmo dia de ${nomeDoMes(mesAnterior)}`} valor={mil(dados.mesmoDiaAnterior)}
          sub={vsSet !== null ? sinal(vsSet) : 'sem recebimento nesse dia'} Icon={ArrowLeftRight} tom="primario" />
        <KpiTile rotulo="Operadores que receberam" valor={total.operadores}
          sub={`${dados.unidades.filter(u => u.tipo === 'setor').length} setores com recebimento`} Icon={Users} tom="neutro" />
        <KpiTile rotulo="Maior setor · Nosso produto" valor={maiorNosso?.nome ?? '—'}
          sub={maiorNosso && total.valor ? `${mil(maiorNosso.valor)} · ${pct((maiorNosso.valor / total.valor) * 100)} do dia` : undefined}
          Icon={Star} tom="alerta" />
      </div>

      <div>
        <div className="vg-subtit" style={{ marginBottom: 10 }}>Por onde entrou no dia</div>
        <PilhaDeFormas formas={dados.formas} />
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

      {separado.cofen.map((u, i) => {
        const d = divisaoCofen(u.valor, ho);
        const c = noGeral ? cidadeDe(u.cidadeId) : null;
        const vsMedia = variacaoPct(u.valor, u.media);
        return (
          <div key={`cofen-${u.setorId ?? u.cod}`} className="vg-cofen" style={{ animationDelay: `${120 + i * 60}ms` }}>
            <div className="vg-cofen-cab">
              <h4>{u.nome} <span className="vg-selo cofen">Regra Cofen</span>{c && <span className={cn('vg-selo', c.marca)}>{c.nome}</span>}
                {u.tipo !== 'setor' && <span className="vg-selo alerta">sem setor</span>}</h4>
              <span className="vg-nota">Outra carteira: o que fica é o H.O. ({pct(ho * 100)}); o resto é repasse ao Coren e ao Cofen.</span>
            </div>
            <div className="vg-cofen-grade">
              <div><small>Bruto recebido</small><b>{formatBRL(u.valor)}</b></div>
              <div className="vg-ho"><small>H.O. · fica</small><b>{formatBRL(d.ho)}</b></div>
              <div><small>Repasse Coren</small><b>{formatBRL(d.coren)}</b></div>
              <div><small>Repasse Cofen</small><b>{formatBRL(d.cofen)}</b></div>
            </div>
            <PilhaCofen bruto={u.valor} ho={ho} />
            <div className="vg-cofen-pe">
              <span><b>{u.linhas}</b> pagamentos</span>
              {u.linhas > 0 && <span>ticket <b>{formatBRL(u.valor / u.linhas)}</b> bruto</span>}
              <span><b>{u.operadores}</b> operadores receberam</span>
              {vsMedia !== null && <span>H.O. <b className={vsMedia >= 0 ? 'vg-sobe' : 'vg-desce'}>{vsMedia >= 0 ? '+' : '−'}{pct(Math.abs(vsMedia))}</b> vs média do mês</span>}
              {u.destaque && <span>destaque: <b>{u.destaque.nome}</b> · {mil(u.destaque.valor * ho)} H.O.</span>}
            </div>
          </div>
        );
      })}

      {total.colchao > 0 && (
        <p className="vg-nota">
          {formatBRL(total.colchao)} do dia é colchão (2ª parcela em diante de Pix automático e cartão recorrente):
          conta no total, em setor nenhum — por isso a tabela não fecha com o valor do dia.
        </p>
      )}
    </div>
  );
}

function diasDoMes(mes: string): number {
  const [a, m] = mes.split('-').map(Number);
  return new Date(a, m, 0).getDate();
}

/**
 * MudancasImportacao — «o que mudou no relatório deste mês», como uma conta.
 *
 * A pergunta do operador quando o relatório é reimportado é uma só: «o meu
 * número mudou por quê?». A resposta aqui tem a forma de uma conta de
 * padaria, não de um texto:
 *
 *     −R$ 444,90   NR 4136093 passou para Bianca Rocha
 *     −R$ 553,90   NR 4128887 saiu do relatório
 *     +R$ 312,50   NR 4199120 veio de Diego Nunes
 *     ───────────
 *     =−R$ 686,30  no seu total do mês
 *
 * Fechada, é uma linha só, logo abaixo da barra de comando da página — o
 * efeito em reais e quantos NRs. «Entender» desdobra a conta ali mesmo, sem
 * painel por cima da tela.
 *
 * Dois modos, a partir da mesma lista (`useMudancasImportacao`):
 *
 *   'operador' ... a carteira de quem está olhando. Só as linhas em que ele é
 *                  uma das pontas; o sinal é o do bolso dele.
 *   'lideranca' .. o escopo inteiro. A troca de dono aparece, mas não entra na
 *                  soma — ela não muda o total do escopo.
 *
 * Quem recorta de verdade é o banco (`fn_analitico_mudancas_do_mes`): o modo
 * aqui muda o TEXTO, não o alcance. Um operador não recebe a linha do colega
 * nem pedindo.
 */
import { useMemo, useState } from 'react';
import { ArrowRightLeft, ChevronDown, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatBRL } from '@/lib/money';
import { useMudancasImportacao } from '@/hooks/useMudancasImportacao';
import {
  efeitoNoTotal, fraseCurta, fraseParaLideranca, fraseParaOperador, grupoDaMudanca,
  minhasMudancas, valorParaQuemOlha, type Mudanca,
} from '@/services/analitico/mudancasImportacao';

type Modo = 'operador' | 'lideranca';

interface Props {
  empresaId: string;
  /** `yyyy-MM` — o mês da lente. */
  mes: string;
  /** Quem está olhando: decide o texto e, no modo operador, o filtro. */
  operadorId: string;
  modo: Modo;
  className?: string;
}

/** Quantas linhas da conta aparecem antes do «mais N». */
const PREVIA = 6;

/** «−R$ 444,90» — o sinal tipográfico, não o hífen. */
function comSinal(v: number): string {
  if (v === 0) return formatBRL(0);
  return `${v > 0 ? '+' : '−'}${formatBRL(Math.abs(v))}`;
}

/** «03/10» a partir de 'yyyy-MM-dd'. */
function diaMes(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split('-');
  return d && m ? `${d}/${m}` : '—';
}

/** «15/10 11:07», no fuso de São Paulo. */
function quando(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
  }).format(d).replace(',', '');
}

export function MudancasImportacao({ empresaId, mes, operadorId, modo, className }: Props) {
  const { mudancas, carregando, erro, recarregar } = useMudancasImportacao(empresaId, mes);
  const [aberto, setAberto] = useState(false);
  const [tudo, setTudo] = useState(false);

  const lista = useMemo(
    () => (modo === 'operador' ? minhasMudancas(mudancas, operadorId) : mudancas),
    [mudancas, modo, operadorId],
  );
  const total = useMemo(() => efeitoNoTotal(lista, modo, operadorId), [lista, modo, operadorId]);

  // Sem mudança nenhuma a faixa não ocupa espaço. O erro também não vira tela
  // vermelha: é um aviso a mais na aba, não a aba.
  if (erro || lista.length === 0) return null;

  const visiveis = tudo ? lista : lista.slice(0, PREVIA);
  const corTotal = total < 0 ? 'text-destructive' : total > 0 ? 'text-success' : 'text-foreground';
  const nrs = `${lista.length} ${lista.length === 1 ? 'NR mexido' : 'NRs mexidos'} pela reimportação do relatório`;
  const foco = aberto ? 0 : -1;

  return (
    <div className={cn('overflow-hidden rounded-xl border border-border bg-card', className)}>
      {/* ── A linha fechada ─────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setAberto(a => !a)}
        aria-expanded={aberto}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-warning/50 motion-reduce:animate-none" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-warning" />
        </span>
        <p className="min-w-0 flex-1 text-sm text-foreground">
          {total !== 0 ? (
            <>
              {modo === 'operador' ? 'Seu analítico mudou ' : 'O analítico do escopo mudou '}
              <strong className={cn('font-mono font-semibold tabular-nums', corTotal)}>{comSinal(total)}</strong>
              <span className="text-muted-foreground"> · {nrs}</span>
            </>
          ) : (
            <>
              {lista.length === 1 ? '1 NR trocou' : `${lista.length} NRs trocaram`} de dono
              <span className="text-muted-foreground"> · o total não mudou</span>
            </>
          )}
        </p>
        <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-primary">
          {aberto ? 'Fechar' : 'Entender'}
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform motion-reduce:transition-none', aberto && 'rotate-180')} aria-hidden="true" />
        </span>
      </button>

      {/* ── A conta ─────────────────────────────────────────────────────────
          Desdobra no lugar. `grid-template-rows` 0fr → 1fr anima a altura
          sem medir nada; com movimento reduzido, abre de uma vez. */}
      <div
        className="grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none"
        style={{ gridTemplateRows: aberto ? '1fr' : '0fr' }}
        aria-hidden={!aberto}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="border-t border-border px-4 pb-3 pt-2">
            <ol aria-label="O que mudou, linha a linha">
              {visiveis.map(m => <LinhaDaConta key={chave(m)} m={m} modo={modo} operadorId={operadorId} />)}
            </ol>

            {lista.length > PREVIA && (
              <button type="button" tabIndex={foco} onClick={() => setTudo(t => !t)}
                className="ml-[6.25rem] mt-0.5 pl-4 text-xs font-medium text-primary hover:underline sm:ml-[8.5rem]">
                {tudo ? 'Mostrar menos' : `+ ${lista.length - PREVIA} ${lista.length - PREVIA === 1 ? 'mudança' : 'mudanças'}`}
              </button>
            )}

            {/* O resultado da conta, com o traço de soma em cima. */}
            <div className="mt-1.5 grid grid-cols-[6.25rem_minmax(0,1fr)] items-baseline gap-x-4 border-t border-foreground/25 pt-2 sm:grid-cols-[8.5rem_minmax(0,1fr)]">
              <span className={cn('text-right font-mono text-sm font-bold tabular-nums', corTotal)}>
                = {comSinal(total)}
              </span>
              <p className="text-sm font-medium text-foreground">
                {modo === 'operador' ? 'no seu total do mês' : 'no total do escopo'}
                {modo === 'lideranca' && lista.some(m => grupoDaMudanca(m, modo, operadorId) === 'trocou') && (
                  <span className="font-normal text-muted-foreground"> · trocas de dono não mudam o total</span>
                )}
              </p>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
              <p className="max-w-prose">
                O relatório do ERP é reimportado várias vezes por dia. Aqui só entram NRs que estavam
                há mais de 24 horas com {modo === 'operador' ? 'você' : 'a pessoa'}.
                {modo === 'operador' && ' Se algum saiu sem motivo claro, fale com a liderança.'}
              </p>
              <button type="button" tabIndex={foco} onClick={recarregar} disabled={carregando}
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium text-muted-foreground hover:text-foreground disabled:opacity-60">
                <RefreshCw className={cn('h-3 w-3', carregando && 'animate-spin')} aria-hidden="true" /> Atualizar
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Um NR pode ter mudado mais de uma vez no mês — a data entra na chave. */
function chave(m: Mudanca): string {
  return `${m.codigo}#${m.data_pagamento}#${m.ocorrido_em}`;
}

/** Uma linha da conta: o valor com sinal à esquerda, o que aconteceu à direita. */
function LinhaDaConta({ m, modo, operadorId }: { m: Mudanca; modo: Modo; operadorId: string }) {
  const grupo = grupoDaMudanca(m, modo, operadorId);
  const valor = valorParaQuemOlha(m, grupo);
  const troca = grupo === 'trocou';
  // A frase longa de antes continua valendo para o leitor de tela.
  const completa = modo === 'operador' ? fraseParaOperador(m, operadorId) : fraseParaLideranca(m);
  return (
    <li className="grid grid-cols-[6.25rem_minmax(0,1fr)] items-baseline gap-x-4 py-1.5 sm:grid-cols-[8.5rem_minmax(0,1fr)_auto]">
      <span className={cn(
        'text-right font-mono text-sm tabular-nums',
        troca ? 'text-muted-foreground' : valor < 0 ? 'text-destructive' : 'text-success',
      )}>
        {troca
          ? <><ArrowRightLeft className="mr-1 inline h-3 w-3 align-[-1px]" aria-hidden="true" />{formatBRL(valor)}</>
          : comSinal(valor)}
      </span>
      <div className="min-w-0">
        <p className="text-sm text-foreground" aria-hidden="true">{fraseCurta(m, grupo)}</p>
        <p className="truncate text-[11px] text-muted-foreground" aria-hidden="true">
          {m.nome_cliente ? `${m.nome_cliente} · ` : ''}pago em {diaMes(m.data_pagamento)}
          <span className="sm:hidden"> · importação de {quando(m.ocorrido_em)}</span>
        </p>
        <span className="sr-only">{completa}</span>
      </div>
      <span className="hidden whitespace-nowrap text-[11px] tabular-nums text-muted-foreground sm:block" aria-hidden="true"
        title="Quando a importação mexeu neste NR">
        {quando(m.ocorrido_em)}
      </span>
    </li>
  );
}

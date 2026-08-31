/**
 * PixPainelPremiacoes — quanto ainda sai para cada pessoa.
 *
 * ## A pergunta que a tela não respondia
 *
 * Havia «comissão aprovada» e havia «pago». Faltava o que se pergunta na hora
 * de mandar os Pix: *quanto ainda falta para esta pessoa?* Quem precisava disso
 * abria a lista, filtrava por operador, somava as linhas pagas de cabeça e
 * subtraía. Toda semana, para cada nome.
 *
 * E errava no caso que mais custa: a **dobra** aparecia como o total do mês e
 * não como o resto. «R$ 2.000,00» com R$ 1.000,00 já pagos, e quem lesse
 * pagaria duas vezes.
 *
 * ## As três parcelas ficam à vista
 *
 * Premiação, já pago e falta, lado a lado, sempre. O resultado sozinho seria
 * mais limpo e seria pior: um número que encolheu sem explicação é o tipo de
 * coisa que ninguém confere, porque não se sabe o que conferir.
 *
 * Quando a premiação dobrou, a linha de baixo mostra a conta — «R$ 1.039,18 ×
 * 2» —, senão o valor cheio pareceria erro para quem sabe de cor quanto a
 * pessoa fez.
 *
 * ## A divergência NÃO tem coluna aqui
 *
 * Ela teve uma, por um dia, e saiu a pedido do Cleber em 02/09/2026. O acerto
 * já acontece do outro lado — a liderança carimba o saldo num acordo pela ação
 * «Corrigir valor», e ele entra no pagamento por ali. Uma segunda coluna
 * dizendo a mesma coisa confundia mais do que informava, e uma linha de
 * «−R$ 17,50» para quem tinha R$ 0,00 de premiação parecia dívida nova em vez
 * de acerto pendente.
 *
 * ## Quem vê
 *
 * Só quem já podia ver o Pix dos outros. O painel é uma leitura do que já está
 * na tela — ele não busca nada por conta própria, recebe a mesma lista que a
 * tabela usa. Filtrou por equipe? O painel fala daquela equipe.
 */
import { useMemo, useState } from 'react';
import {
  Wallet, ChevronDown, TrendingUp, AlertTriangle, Check, Search, Clock3, Loader2,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/index';
import type { PixAutoAcordo } from '@/services/pix_automatico.service';
import type { MetaRecebimentoDobra } from './pixAutomaticoView';
import { painelPremiacoes, totalDoPainel, type Premiacao } from './pixPremiacao';
import type { MesRef } from '@/lib/mesReferencia';
import type { PixPremiacaoPagamento } from '@/services/pix_automatico.service';

interface Props {
  itens: PixAutoAcordo[];
  pctPorSetor: Record<string, number>;
  mes: MesRef;
  nomePorOperador?: Record<string, string>;
  /** Meta de recebimento por operador — é ela que decide a dobra. */
  metaPorOperador?: Record<string, MetaRecebimentoDobra>;
  metaPorSetor?: Record<string, number>;
  pagamentos?: readonly PixPremiacaoPagamento[];
  podeMarcarPago?: boolean;
  alterandoOperadorId?: string | null;
  onMarcarPago?: (operadorId: string, pago: boolean) => void | Promise<void>;
}

/** Uma parcela da conta, com o rótulo em cima e o número embaixo. */
function Parcela({
  rotulo, valor, cls, titulo,
}: { rotulo: string; valor: number; cls?: string; titulo?: string }) {
  return (
    <div className="min-w-0" title={titulo}>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground leading-none">
        {rotulo}
      </p>
      <p className={cn('text-sm font-semibold tabular-nums leading-tight mt-0.5', cls)}>
        {formatCurrency(valor)}
      </p>
    </div>
  );
}

function LinhaPremiacao({
  l, pagamento, podeMarcarPago, alterando, onMarcarPago,
}: {
  l: Premiacao;
  pagamento?: PixPremiacaoPagamento;
  podeMarcarPago: boolean;
  alterando: boolean;
  onMarcarPago?: (operadorId: string, pago: boolean) => void | Promise<void>;
}) {
  const quitado = Math.abs(l.falta) < 0.005;
  const deve    = l.falta < -0.005;
  const pago    = pagamento?.pago === true;
  const tituloPagamento = pago
    ? `Pago${pagamento?.pago_por_nome ? ` por ${pagamento.pago_por_nome}` : ''}${pagamento?.pago_em ? ` em ${new Date(pagamento.pago_em).toLocaleString('pt-BR')}` : ''}`
    : 'Premiação ainda não marcada como paga';

  return (
    <div className={cn(
      'grid min-w-[720px] grid-cols-[minmax(0,1.5fr)_repeat(2,minmax(0,1fr))_minmax(105px,0.8fr)_minmax(0,1fr)] items-center gap-3',
      'border-t border-border/60 px-3 py-2.5 transition-colors hover:bg-muted/30',
      quitado && 'opacity-60',
      pago && !quitado && 'bg-emerald-500/[0.035]',
    )}>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{l.nome}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-1">
          {l.dobrou && (
            <Badge
              variant="outline"
              className="h-4 gap-0.5 border-amber-500/40 px-1 text-[9px] font-bold uppercase text-amber-600 dark:text-amber-400"
              title="Bateu os dois requisitos: a quantidade de acordos e a meta de recebimento"
            >
              <TrendingUp className="h-2.5 w-2.5" /> dobrada
            </Badge>
          )}
          {quitado && (
            <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
              <Check className="h-3 w-3" /> quitado
            </span>
          )}
        </div>
      </div>

      <div className="min-w-0">
        <Parcela
          rotulo="Premiação" valor={l.premiacao}
          cls={l.dobrou ? 'text-amber-600 dark:text-amber-400' : undefined}
          titulo={l.dobrou
            ? `Comissão de ${formatCurrency(l.comissao)} dobrada por bater os dois requisitos`
            : 'Comissão aprovada do mês'}
        />
        {/* A conta embaixo do valor dobrado: sem ela, quem sabe de cor quanto a
            pessoa fez acha que o número está errado. */}
        {l.dobrou && (
          <p className="text-[10px] leading-tight text-muted-foreground tabular-nums">
            {formatCurrency(l.comissao)} × 2
          </p>
        )}
      </div>
      <Parcela rotulo="Já pago" valor={l.jaPago} cls="text-muted-foreground" />
      <div className="flex min-w-0 items-center gap-2" title={tituloPagamento}>
        {podeMarcarPago ? (
          <>
            <Switch
              checked={pago}
              disabled={alterando}
              onCheckedChange={marcado => void onMarcarPago?.(l.operadorId, marcado)}
              aria-label={`${pago ? 'Desmarcar' : 'Marcar'} premiação de ${l.nome} como paga`}
            />
            {alterando
              ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
              : (
                <span className={cn(
                  'truncate text-[11px] font-medium',
                  pago ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground',
                )}>
                  {pago ? 'Pago' : 'Não pago'}
                </span>
              )}
          </>
        ) : (
          <span className={cn(
            'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold',
            pago
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              : 'border-border bg-muted/30 text-muted-foreground',
          )}>
            {pago ? <Check className="h-3 w-3" /> : <Clock3 className="h-3 w-3" />}
            {pago ? 'Pago' : 'Não pago'}
          </span>
        )}
      </div>
      <Parcela
        rotulo="Falta pagar" valor={l.falta}
        cls={deve ? 'text-destructive' : quitado || pago ? 'text-muted-foreground' : 'text-primary'}
        titulo={deve ? 'Negativo: já saiu mais do que era devido' : undefined}
      />
    </div>
  );
}

export function PixPainelPremiacoes({
  itens, pctPorSetor, mes, nomePorOperador, metaPorOperador, metaPorSetor,
  pagamentos = [], podeMarcarPago = false, alterandoOperadorId, onMarcarPago,
}: Props) {
  const [aberto, setAberto] = useState(true);
  const [busca, setBusca] = useState('');
  const [soPendentes, setSoPendentes] = useState(false);

  const linhas = useMemo(
    () => painelPremiacoes({
      itens, pctPorSetor, mes, nomePorOperador, metaPorOperador, metaPorSetor,
    }),
    [itens, pctPorSetor, mes, nomePorOperador, metaPorOperador, metaPorSetor],
  );

  const total = useMemo(() => totalDoPainel(linhas), [linhas]);
  const pagamentoPorOperador = useMemo(
    () => new Map(pagamentos.map(p => [p.operador_id, p])),
    [pagamentos],
  );
  const faltaPagar = useMemo(
    () => totalDoPainel(
      linhas.filter(l => pagamentoPorOperador.get(l.operadorId)?.pago !== true),
    ).falta,
    [linhas, pagamentoPorOperador],
  );

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return linhas
      .filter(l => (termo ? l.nome.toLowerCase().includes(termo) : true))
      // «Só quem falta» é o modo de trabalho: a lista fica com o que ainda
      // precisa de ação, e some quem já está quitado.
      .filter(l => (soPendentes
        ? Math.abs(l.falta) >= 0.005 && pagamentoPorOperador.get(l.operadorId)?.pago !== true
        : true));
  }, [linhas, busca, soPendentes, pagamentoPorOperador]);

  if (linhas.length === 0) return null;

  return (
    <Card className="border-border/60">
      <CardContent className="p-0">
        <button
          type="button"
          onClick={() => setAberto(a => !a)}
          aria-expanded={aberto}
          className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/30"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-primary/25 bg-primary/10">
            <Wallet className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-tight">Premiação a pagar</p>
            <p className="text-[11px] leading-tight text-muted-foreground">
              {linhas.length} {linhas.length === 1 ? 'pessoa' : 'pessoas'}
              {total.comDobra > 0
                && ` · ${total.comDobra} com premiação dobrada (+${formatCurrency(total.bonus)})`}
            </p>
          </div>
          <div className="hidden shrink-0 text-right sm:block">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground leading-none">
              Falta pagar
            </p>
            <p className="mt-0.5 text-base font-bold tabular-nums text-primary leading-tight">
              {formatCurrency(faltaPagar)}
            </p>
          </div>
          <ChevronDown className={cn(
            'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
            aberto && 'rotate-180',
          )} />
        </button>

        {aberto && (
          <>
            <div className="flex flex-wrap items-center gap-2 border-t border-border/60 px-3 py-2">
              <div className="relative min-w-[160px] flex-1">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={busca} onChange={e => setBusca(e.target.value)}
                  placeholder="Procurar pessoa"
                  className="w-full rounded-lg bg-muted/60 py-1.5 pl-8 pr-2 text-xs outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                <input
                  type="checkbox" checked={soPendentes}
                  onChange={e => setSoPendentes(e.target.checked)}
                  className="h-3.5 w-3.5 accent-[hsl(var(--primary))]"
                />
                Só quem falta
              </label>
            </div>

            {/* Cabeçalho das colunas: sem ele as quatro parcelas viram quatro
                números soltos, e o leitor tem de adivinhar qual é qual. */}
            <div className="overflow-x-auto">
              <div className="grid min-w-[720px] grid-cols-[minmax(0,1.5fr)_repeat(2,minmax(0,1fr))_minmax(105px,0.8fr)_minmax(0,1fr)] gap-3 border-t border-border/60 bg-muted/30 px-3 py-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Pessoa</span>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Premiação</span>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Já pago</span>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Foi pago?</span>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Falta pagar</span>
              </div>

              {visiveis.length === 0 ? (
                <p className="min-w-[720px] border-t border-border/60 px-4 py-6 text-center text-xs text-muted-foreground">
                  {busca.trim() ? 'Ninguém com esse nome.' : 'Tudo quitado por aqui.'}
                </p>
              ) : (
                visiveis.map(l => (
                  <LinhaPremiacao
                    key={l.operadorId}
                    l={l}
                    pagamento={pagamentoPorOperador.get(l.operadorId)}
                    podeMarcarPago={podeMarcarPago}
                    alterando={alterandoOperadorId === l.operadorId}
                    onMarcarPago={onMarcarPago}
                  />
                ))
              )}
            </div>

            {/* A dobra nao acontece sem os DOIS requisitos, e o segundo depende
                de a meta do mes estar cadastrada. Sem esta nota, quem esperava
                o dobro e nao viu ficaria procurando defeito no lugar errado. */}
            {total.comDobra === 0 && (
              <p className="flex items-start gap-1.5 border-t border-border/60 bg-muted/20 px-4 py-2 text-[11px] leading-relaxed text-muted-foreground">
                <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span>
                  Ninguém com premiação dobrada aqui. A dobra exige os dois
                  requisitos — a quantidade de acordos Pix do mês <strong>e</strong> a
                  meta de recebimento batida. Sem meta cadastrada em Metas, o
                  segundo requisito não fecha.
                </span>
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

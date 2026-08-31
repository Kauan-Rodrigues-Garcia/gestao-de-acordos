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
 * Duas coisas erravam essa conta, e as duas para MAIS:
 *
 *   • a **divergência** aparecia num painel ao lado e não entrava em número
 *     nenhum — quem devia R$ 20,00 era mostrado com a premiação cheia;
 *   • a **dobra** mostrava o total do mês, não o resto — «R$ 2.000,00» com
 *     R$ 1.000,00 já pagos, e quem lesse pagaria duas vezes.
 *
 * ## As quatro parcelas ficam à vista
 *
 * Premiação, já pago, divergência e falta, lado a lado, sempre. O resultado
 * sozinho seria mais limpo e seria pior: um número que encolheu sem explicação
 * é o tipo de coisa que ninguém confere, porque não se sabe o que conferir.
 * Aqui dá para apontar qual parcela está errada.
 *
 * ## Quem vê
 *
 * Só quem já podia ver o Pix dos outros. O painel é uma leitura do que já está
 * na tela — ele não busca nada por conta própria, recebe a mesma lista que a
 * tabela usa. Filtrou por equipe? O painel fala daquela equipe.
 */
import { useMemo, useState } from 'react';
import {
  Wallet, ChevronDown, TrendingUp, AlertTriangle, Check, Search,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/index';
import type { PixAutoAcordo, PixAutoSaldo } from '@/services/pix_automatico.service';
import type { MetaRecebimentoDobra } from './pixAutomaticoView';
import { painelPremiacoes, totalDoPainel, type Premiacao } from './pixPremiacao';
import type { MesRef } from '@/lib/mesReferencia';

interface Props {
  itens: PixAutoAcordo[];
  saldos: PixAutoSaldo[];
  pctPorSetor: Record<string, number>;
  mes: MesRef;
  nomePorOperador?: Record<string, string>;
  /** Meta de recebimento por operador — é ela que decide a dobra. */
  metaPorOperador?: Record<string, MetaRecebimentoDobra>;
  metaPorSetor?: Record<string, number>;
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

function LinhaPremiacao({ l }: { l: Premiacao }) {
  const quitado = Math.abs(l.falta) < 0.005;
  const deve    = l.falta < -0.005;

  return (
    <div className={cn(
      'grid grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,1fr))] items-center gap-3',
      'border-t border-border/60 px-3 py-2.5 transition-colors hover:bg-muted/30',
      quitado && 'opacity-60',
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

      <Parcela
        rotulo="Premiação" valor={l.premiacao}
        titulo={l.dobrou
          ? `Comissão de ${formatCurrency(l.comissao)} dobrada`
          : 'Comissão aprovada do mês'}
      />
      <Parcela rotulo="Já pago" valor={l.jaPago} cls="text-muted-foreground" />
      <Parcela
        rotulo="Divergência"
        valor={l.divergencia}
        cls={l.divergencia < 0 ? 'text-destructive' : l.divergencia > 0 ? 'text-emerald-500' : 'text-muted-foreground/50'}
        titulo={l.divergenciaMotivo ?? 'Sem divergência em aberto'}
      />
      <Parcela
        rotulo="Falta pagar" valor={l.falta}
        cls={deve ? 'text-destructive' : quitado ? 'text-muted-foreground' : 'text-primary'}
        titulo={deve
          ? 'Negativo: já saiu mais do que era devido, ou a dívida passa da premiação'
          : undefined}
      />
    </div>
  );
}

export function PixPainelPremiacoes({
  itens, saldos, pctPorSetor, mes, nomePorOperador, metaPorOperador, metaPorSetor,
}: Props) {
  const [aberto, setAberto] = useState(true);
  const [busca, setBusca] = useState('');
  const [soPendentes, setSoPendentes] = useState(false);

  const linhas = useMemo(
    () => painelPremiacoes({
      itens, saldos, pctPorSetor, mes, nomePorOperador, metaPorOperador, metaPorSetor,
    }),
    [itens, saldos, pctPorSetor, mes, nomePorOperador, metaPorOperador, metaPorSetor],
  );

  const total = useMemo(() => totalDoPainel(linhas), [linhas]);

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return linhas
      .filter(l => (termo ? l.nome.toLowerCase().includes(termo) : true))
      // «Só quem falta» é o modo de trabalho: a lista fica com o que ainda
      // precisa de ação, e some quem já está quitado.
      .filter(l => (soPendentes ? Math.abs(l.falta) >= 0.005 : true));
  }, [linhas, busca, soPendentes]);

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
              {total.comDobra > 0 && ` · ${total.comDobra} com premiação dobrada`}
              {Math.abs(total.divergencia) >= 0.005
                && ` · ${formatCurrency(total.divergencia)} de divergência`}
            </p>
          </div>
          <div className="hidden shrink-0 text-right sm:block">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground leading-none">
              Falta pagar
            </p>
            <p className="mt-0.5 text-base font-bold tabular-nums text-primary leading-tight">
              {formatCurrency(total.falta)}
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
            <div className="grid grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,1fr))] gap-3 border-t border-border/60 bg-muted/30 px-3 py-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Pessoa</span>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Premiação</span>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Já pago</span>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Divergência</span>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Falta pagar</span>
            </div>

            {visiveis.length === 0 ? (
              <p className="border-t border-border/60 px-4 py-6 text-center text-xs text-muted-foreground">
                {busca.trim() ? 'Ninguém com esse nome.' : 'Tudo quitado por aqui.'}
              </p>
            ) : (
              visiveis.map(l => <LinhaPremiacao key={l.operadorId} l={l} />)
            )}

            {/* O aviso da dívida: é o caso que precisa de decisão de gente, e
                não pode ficar só como número vermelho no meio da lista. */}
            {total.divergencia < -0.005 && (
              <p className="flex items-start gap-1.5 border-t border-border/60 bg-amber-500/5 px-4 py-2 text-[11px] leading-relaxed text-muted-foreground">
                <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-amber-500" />
                <span>
                  A divergência já está descontada de «falta pagar». Ela some da
                  lista quando o pagamento que a levou for marcado como pago —
                  não desconte de novo no próximo mês.
                </span>
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

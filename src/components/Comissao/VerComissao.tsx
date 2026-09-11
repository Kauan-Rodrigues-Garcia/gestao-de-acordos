/**
 * VerComissao — a comissão inteira de uma pessoa, num Dialog.
 *
 * ## A escada é a tela
 *
 * Quem abre isto quer três respostas: quanto já recebe, em que faixa está e
 * quanto falta para a próxima. A progressão 1ª → 2ª → 3ª → 4ª responde as três
 * de uma vez, então ela é o centro: uma barra preenchida até o recebido, com um
 * marco por faixa, e um cartão por faixa com a situação ESCRITA — cor sozinha
 * não diz nada a quem não a distingue.
 *
 * O resto é apoio e fica quieto: o resumo dos três números, a faixa do benefício
 * do setor e a indireta. As contas vêm prontas de `calcularComissao`.
 *
 * O mesmo componente abre pelo card do Dashboard e pela linha do operador na aba
 * Comissão da tela de Metas.
 */
import type { CSSProperties, ReactNode } from 'react';
import { ArrowRight, CheckCircle2, Circle, MinusCircle, Sparkles, Star } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { formatBRL } from '@/lib/money';
import { cn } from '@/lib/utils';
import { mesPorExtenso } from '@/pages/Dashboard/Analitico/mensagemOperador';
import type { FaixaComissao, ResultadoComissao } from '@/services/comissao/comissao';
import { formatarPct } from './formato';

interface VerComissaoProps {
  aberto: boolean;
  onFechar: () => void;
  nome: string;
  /** `yyyy-MM`. */
  mes: string;
  isPaguePlay: boolean;
  /** Mês que já passou: «faltou», e não «faltam». */
  mesFechado: boolean;
  resultado: ResultadoComissao;
}

const SITUACAO = {
  atingida:     { rotulo: 'Atingida',       Icone: CheckCircle2, classe: 'text-emerald-600 dark:text-emerald-400' },
  atual:        { rotulo: 'Comissão atual', Icone: Star,         classe: 'text-primary' },
  proxima:      { rotulo: 'Próxima',        Icone: ArrowRight,   classe: 'text-sky-600 dark:text-sky-400' },
  nao_atingida: { rotulo: 'Não atingida',   Icone: Circle,       classe: 'text-muted-foreground' },
} as const;

const SEM_PCT = { rotulo: 'Sem % neste mês', Icone: MinusCircle, classe: 'text-muted-foreground' };

/**
 * Quanto da barra está preenchido.
 *
 * Os marcos das faixas ficam igualmente espaçados — a barra conta faixas, não
 * reais. Dentro de cada trecho o preenchimento é proporcional ao recebido entre
 * a faixa anterior e a próxima, que é a leitura de «estou quase na 3ª».
 */
function preenchimento(faixas: readonly FaixaComissao[], recebido: number): number {
  const n = faixas.length;
  if (n === 0) return 0;
  let anterior = 0;
  for (let i = 0; i < n; i++) {
    const meta = faixas[i].meta;
    if (recebido < meta) {
      const trecho = meta - anterior;
      const fracao = trecho > 0 ? Math.max(0, recebido - anterior) / trecho : 0;
      return ((i + fracao) / n) * 100;
    }
    anterior = meta;
  }
  return 100;
}

function dataHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

function Numero({ rotulo, valor, apoio, destaque }: {
  rotulo: string; valor: string; apoio?: string; destaque?: boolean;
}) {
  return (
    <div className={cn(
      'rounded-xl border px-3 py-2.5',
      destaque ? 'border-primary/40 bg-primary/5' : 'border-border bg-card',
    )}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{rotulo}</p>
      <p className={cn('mt-0.5 font-mono font-bold tabular-nums leading-tight', destaque ? 'text-2xl' : 'text-lg')}>
        {valor}
      </p>
      {apoio && <p className="mt-0.5 text-xs text-muted-foreground">{apoio}</p>}
    </div>
  );
}

function Linha({ rotulo, children, forte }: { rotulo: string; children: ReactNode; forte?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-muted-foreground">{rotulo}</dt>
      <dd className={cn('font-mono tabular-nums', forte ? 'font-bold' : 'font-medium')}>{children}</dd>
    </div>
  );
}

function CartaoFaixa({ faixa, beneficioAtivo, faltaRotulo }: {
  faixa: FaixaComissao; beneficioAtivo: boolean; faltaRotulo: string;
}) {
  const semPct = faixa.pctNormal === null;
  const s = semPct && faixa.atingida ? SEM_PCT : SITUACAO[faixa.situacao];
  const ehAtual = faixa.situacao === 'atual';
  const mudouComBeneficio = beneficioAtivo && faixa.pctEfetivo !== null && faixa.pctEfetivo !== faixa.pctNormal;

  return (
    <li
      aria-current={ehAtual ? 'step' : undefined}
      className={cn(
        'flex flex-col gap-2 rounded-xl border bg-card p-3',
        ehAtual
          ? 'border-primary shadow-md ring-2 ring-primary/25 sm:-translate-y-1'
          : 'border-border',
        faixa.situacao === 'nao_atingida' && 'bg-muted/30',
      )}
    >
      <p className={cn('flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide', s.classe)}>
        <s.Icone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>{s.rotulo}</span>
      </p>
      <p className={cn('font-bold leading-none', ehAtual ? 'text-lg' : 'text-base')}>{faixa.ordem}ª Meta</p>
      <dl className="space-y-1 text-xs">
        <Linha rotulo="Meta">{formatBRL(faixa.meta)}</Linha>
        <Linha rotulo="Percentual">
          {semPct ? '—' : mudouComBeneficio ? (
            <>
              <span className="mr-1 text-muted-foreground line-through">{formatarPct(faixa.pctNormal)}</span>
              {formatarPct(faixa.pctEfetivo)}
            </>
          ) : formatarPct(faixa.pctEfetivo)}
        </Linha>
        <Linha rotulo="Comissão" forte={ehAtual}>
          {faixa.comissao !== null ? formatBRL(faixa.comissao) : '—'}
        </Linha>
      </dl>
      {faixa.falta !== null && (
        <p className="text-xs font-medium text-sky-700 dark:text-sky-300">
          {`${faltaRotulo} ${formatBRL(faixa.falta)}`}
        </p>
      )}
    </li>
  );
}

export function VerComissao({
  aberto, onFechar, nome, mes, isPaguePlay, mesFechado, resultado: r,
}: VerComissaoProps) {
  const faltaRotulo = mesFechado ? 'Faltou' : 'Faltam';
  const preenchido = preenchimento(r.faixas, r.recebido);

  // «Se o setor bater a meta…» fala da faixa em que a pessoa está — ou da
  // primeira, enquanto ela não chegou a nenhuma.
  const alvoDoAviso = r.atual ?? r.proxima;
  const avisoBeneficio = r.temRegraSetor && !r.beneficioAtivo && alvoDoAviso
    && alvoDoAviso.pctComBeneficio !== null && alvoDoAviso.comissaoComBeneficio !== null
    ? `Se o setor bater a meta: ${alvoDoAviso.ordem}ª Meta passa a ${formatarPct(alvoDoAviso.pctComBeneficio)} (${formatBRL(alvoDoAviso.comissaoComBeneficio)})`
    : null;

  const regraRotulo = r.regraSetor === 'multiplicador' && r.multiplicador !== null
    ? `multiplicador ${r.multiplicador.toLocaleString('pt-BR', { maximumFractionDigits: 3 })}×`
    : '% especial';

  const semFaixas = r.motivo === 'sem_meta' || r.motivo === 'sem_config';

  return (
    <Dialog open={aberto} onOpenChange={aberto => { if (!aberto) onFechar(); }}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{`Comissão — ${nome}`}</DialogTitle>
          <DialogDescription>
            {`${mesPorExtenso(mes)}${isPaguePlay ? ' · valores em H.O.' : ''} · recebido ${formatBRL(r.recebido)}`}
          </DialogDescription>
        </DialogHeader>

        {semFaixas ? (
          <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
            {r.motivo === 'sem_meta'
              ? 'Sem meta cadastrada neste mês — não há faixas de comissão.'
              : 'A comissão deste mês ainda não foi configurada para este setor.'}
          </p>
        ) : (
          <div className="space-y-5">
            {/* ── Os três números ─────────────────────────────────────────── */}
            <div className="grid gap-3 sm:grid-cols-3">
              <Numero rotulo="Comissão atual" valor={formatBRL(r.total)} destaque />
              <Numero
                rotulo="Faixa atual"
                valor={r.atual ? `${r.atual.ordem}ª Meta · ${formatarPct(r.atual.pctEfetivo)}` : 'Nenhuma ainda'}
              />
              <Numero
                rotulo="Próxima comissão"
                valor={r.proxima
                  ? (r.proxima.comissao !== null ? formatBRL(r.proxima.comissao) : `${r.proxima.ordem}ª Meta`)
                  : 'Todas atingidas'}
                apoio={r.proxima?.falta !== null && r.proxima?.falta !== undefined
                  ? `${faltaRotulo} ${formatBRL(r.proxima.falta)} para a ${r.proxima.ordem}ª Meta`
                  : undefined}
              />
            </div>

            {/* ── Benefício do setor ──────────────────────────────────────── */}
            {r.beneficioAtivo && (
              <div role="status" className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3">
                <p className="flex items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-300">
                  <Sparkles className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {`Meta do setor atingida — benefício ativo (${regraRotulo})`}
                </p>
                {r.atual && r.atual.pctNormal !== null && r.atual.comissaoNormal !== null && r.atual.comissao !== null && (
                  <div className="mt-1.5 grid gap-1 text-sm sm:grid-cols-2">
                    <span>{`Percentual: ${formatarPct(r.atual.pctNormal)} → ${formatarPct(r.atual.pctEfetivo)}`}</span>
                    <span>{`Comissão: ${formatBRL(r.atual.comissaoNormal)} → ${formatBRL(r.atual.comissao)}`}</span>
                  </div>
                )}
                {r.confirmadaPorNome && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {`Confirmado por ${r.confirmadaPorNome}${r.confirmadaEm ? ` em ${dataHora(r.confirmadaEm)}` : ''}`}
                  </p>
                )}
              </div>
            )}
            {avisoBeneficio && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {avisoBeneficio}
              </p>
            )}

            {/* ── A escada ────────────────────────────────────────────────── */}
            <div className="space-y-3">
              <div
                role="progressbar"
                aria-label="Recebido em relação às faixas"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(preenchido)}
                className="relative h-2 rounded-full bg-muted"
              >
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-primary transition-[width] duration-500 motion-reduce:transition-none"
                  style={{ width: `${preenchido}%` }}
                />
                {r.faixas.map((f, i) => (
                  <span
                    key={f.ordem}
                    aria-hidden="true"
                    className={cn(
                      'absolute top-1/2 h-3.5 w-1 -translate-y-1/2 rounded-full border-2 border-background',
                      f.atingida ? 'bg-primary' : 'bg-muted-foreground/40',
                    )}
                    style={{ left: `calc(${((i + 1) / r.faixas.length) * 100}% - 2px)` }}
                  />
                ))}
              </div>

              <ol
                aria-label="Faixas de comissão"
                className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(var(--faixas),minmax(0,1fr))]"
                style={{ '--faixas': Math.max(r.faixas.length, 1) } as CSSProperties}
              >
                {r.faixas.map(f => (
                  <CartaoFaixa
                    key={f.ordem}
                    faixa={f}
                    beneficioAtivo={r.beneficioAtivo}
                    faltaRotulo={faltaRotulo}
                  />
                ))}
              </ol>
            </div>

            {/* ── A indireta, no modo separado ────────────────────────────── */}
            {r.indireta && (
              <section className="space-y-1 rounded-xl border border-border bg-muted/20 px-4 py-3">
                <p className="text-sm font-semibold">Meta indireta</p>
                <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
                  <span>{`Meta ${formatBRL(r.indireta.meta)}`}</span>
                  <span>
                    {`Percentual ${formatarPct(r.indireta.pctEfetivo)}`}
                  </span>
                  <span>{`Comissão ${r.indireta.valor !== null ? formatBRL(r.indireta.valor) : '—'}`}</span>
                  <span className={r.indireta.atingida
                    ? 'font-medium text-emerald-700 dark:text-emerald-400'
                    : 'font-medium text-sky-700 dark:text-sky-300'}>
                    {r.indireta.atingida
                      ? 'Atingida'
                      : `${faltaRotulo} ${formatBRL(r.indireta.falta ?? 0)}`}
                  </span>
                </div>
              </section>
            )}
            {r.indireta && (
              <p className="text-right text-sm font-semibold">{`Total ${formatBRL(r.total)}`}</p>
            )}

            <p className="text-[11px] text-muted-foreground">
              Comissão = valor da meta × percentual. Vale a maior faixa atingida — as faixas não somam.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * ConteudoComissao — a comissão inteira de uma pessoa: resumo, benefício, escada e indireta.
 *
 * ## A escada é a tela
 *
 * Quem abre isto quer três respostas: quanto já recebe, em que faixa está e
 * quanto falta para a próxima. A progressão 1ª → 2ª → 3ª → 4ª responde as três
 * de uma vez, então ela é o centro: uma barra preenchida até o realizado, com um
 * marco por faixa, e um cartão por faixa com a situação ESCRITA — cor sozinha
 * não diz nada a quem não a distingue.
 *
 * A faixa atual mostra a comissão sobre o realizado; as outras, o mínimo que
 * pagam («a partir de»). As contas vêm prontas de `calcularComissao`.
 *
 * ## Dois lugares, uma conta
 *
 * Aparece no Dialog «Ver comissão» (a consulta da liderança, na tela de Metas) e
 * no painel lateral do operador. `compacto` é o painel: 420px numa tela larga,
 * então a coluna única vem da prop, e não da largura da janela.
 */
import type { CSSProperties, ReactNode } from 'react';
import { ArrowRight, CheckCircle2, Circle, MinusCircle, Sparkles, Star } from 'lucide-react';
import { formatBRL } from '@/lib/money';
import { cn } from '@/lib/utils';
import type { FaixaComissao, ResultadoComissao } from '@/services/comissao/comissao';
import { formatarPct } from './formato';

interface ConteudoComissaoProps {
  resultado: ResultadoComissao;
  /** Mês que já passou: «faltou», e não «faltam». */
  mesFechado: boolean;
  /** Uma coluna só — o painel lateral. */
  compacto?: boolean;
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
 * reais. Dentro de cada trecho o preenchimento é proporcional ao realizado entre
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

function Numero({ rotulo, valor, apoio, destaque, className }: {
  rotulo: string; valor: string; apoio?: string; destaque?: boolean; className?: string;
}) {
  return (
    <div className={cn(
      'rounded-xl border px-3 py-2.5',
      destaque ? 'border-primary/40 bg-primary/5' : 'border-border bg-card',
      className,
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

function CartaoFaixa({ faixa, recebido, beneficioAtivo, faltaRotulo, compacto }: {
  faixa: FaixaComissao; recebido: number; beneficioAtivo: boolean; faltaRotulo: string; compacto: boolean;
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
          ? cn('border-primary shadow-md ring-2 ring-primary/25', !compacto && 'sm:-translate-y-1')
          : 'border-border',
        faixa.situacao === 'nao_atingida' && 'bg-muted/30',
      )}
    >
      <div className={cn('flex gap-2', compacto ? 'items-baseline justify-between' : 'flex-col')}>
        <p className={cn('flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide', s.classe)}>
          <s.Icone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{s.rotulo}</span>
        </p>
        <p className={cn('font-bold leading-none', ehAtual ? 'text-lg' : 'text-base')}>{faixa.ordem}ª Meta</p>
      </div>
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
        {ehAtual ? (
          <Linha rotulo="Comissão" forte>
            {faixa.comissao !== null ? formatBRL(faixa.comissao) : '—'}
          </Linha>
        ) : (
          <Linha rotulo="A partir de">
            {faixa.minimo !== null ? formatBRL(faixa.minimo) : '—'}
          </Linha>
        )}
      </dl>
      {ehAtual && (
        <p className="text-[11px] text-muted-foreground">{`sobre ${formatBRL(recebido)} realizados`}</p>
      )}
      {faixa.falta !== null && (
        <p className="text-xs font-medium text-sky-700 dark:text-sky-300">
          {`${faltaRotulo} ${formatBRL(faixa.falta)}`}
        </p>
      )}
    </li>
  );
}

/** «Se o setor bater a meta…»: na faixa atual, sobre o realizado; antes dela, o mínimo. */
function avisoDoBeneficio(r: ResultadoComissao): string | null {
  if (!r.temRegraSetor || r.beneficioAtivo) return null;
  const alvo = r.atual ?? r.proxima;
  if (!alvo || alvo.pctComBeneficio === null) return null;

  const valor = alvo === r.atual
    ? (alvo.comissaoComBeneficio !== null ? formatBRL(alvo.comissaoComBeneficio) : null)
    : (alvo.minimoComBeneficio !== null ? `a partir de ${formatBRL(alvo.minimoComBeneficio)}` : null);
  if (!valor) return null;

  return `Se o setor bater a meta: ${alvo.ordem}ª Meta passa a ${formatarPct(alvo.pctComBeneficio)} (${valor})`;
}

export function ConteudoComissao({ resultado: r, mesFechado, compacto = false }: ConteudoComissaoProps) {
  const faltaRotulo = mesFechado ? 'Faltou' : 'Faltam';
  const preenchido = preenchimento(r.faixas, r.recebido);
  const aviso = avisoDoBeneficio(r);

  const regraRotulo = r.regraSetor === 'multiplicador' && r.multiplicador !== null
    ? `multiplicador ${r.multiplicador.toLocaleString('pt-BR', { maximumFractionDigits: 3 })}×`
    : '% especial';

  if (r.motivo === 'sem_meta' || r.motivo === 'sem_config') {
    return (
      <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
        {r.motivo === 'sem_meta'
          ? 'Sem meta cadastrada neste mês — não há faixas de comissão.'
          : 'A comissão deste mês ainda não foi configurada para este setor.'}
      </p>
    );
  }

  const proxima = r.proxima;

  return (
    <div className={compacto ? 'space-y-4' : 'space-y-5'}>
      {/* ── Os três números ─────────────────────────────────────────────── */}
      <div className={cn('grid gap-3', compacto ? 'grid-cols-2' : 'sm:grid-cols-3')}>
        <Numero
          rotulo="Comissão atual"
          valor={formatBRL(r.total)}
          destaque
          className={compacto ? 'col-span-2' : undefined}
        />
        <Numero
          rotulo="Faixa atual"
          valor={r.atual ? `${r.atual.ordem}ª Meta · ${formatarPct(r.atual.pctEfetivo)}` : 'Nenhuma ainda'}
        />
        <Numero
          rotulo={proxima && proxima.minimo !== null ? 'Próxima faixa, a partir de' : 'Próxima faixa'}
          valor={proxima
            ? (proxima.minimo !== null ? formatBRL(proxima.minimo) : `${proxima.ordem}ª Meta`)
            : 'Todas atingidas'}
          apoio={proxima && proxima.falta !== null
            ? `${faltaRotulo} ${formatBRL(proxima.falta)} para a ${proxima.ordem}ª Meta`
            : undefined}
        />
      </div>

      {/* ── Benefício do setor ──────────────────────────────────────────── */}
      {r.beneficioAtivo && (
        <div role="status" className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-300">
            <Sparkles className="h-4 w-4 shrink-0" aria-hidden="true" />
            {`Meta do setor atingida — benefício ativo (${regraRotulo})`}
          </p>
          {r.atual && r.atual.pctNormal !== null && r.atual.comissaoNormal !== null && r.atual.comissao !== null && (
            <div className={cn('mt-1.5 grid gap-1 text-sm', !compacto && 'sm:grid-cols-2')}>
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
      {aviso && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {aviso}
        </p>
      )}

      {/* ── A escada ────────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div
          role="progressbar"
          aria-label="Realizado em relação às faixas"
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
          className={compacto
            ? 'grid grid-cols-1 gap-2'
            : 'grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(var(--faixas),minmax(0,1fr))]'}
          style={compacto ? undefined : { '--faixas': Math.max(r.faixas.length, 1) } as CSSProperties}
        >
          {r.faixas.map(f => (
            <CartaoFaixa
              key={f.ordem}
              faixa={f}
              recebido={r.recebido}
              beneficioAtivo={r.beneficioAtivo}
              faltaRotulo={faltaRotulo}
              compacto={compacto}
            />
          ))}
        </ol>
      </div>

      {/* ── A indireta, no modo separado ────────────────────────────────── */}
      {r.indireta && (
        <section className="space-y-1 rounded-xl border border-border bg-muted/20 px-4 py-3">
          <p className="text-sm font-semibold">Meta indireta</p>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
            <span>{`Meta ${formatBRL(r.indireta.meta)}`}</span>
            <span>{`Percentual ${formatarPct(r.indireta.pctEfetivo)}`}</span>
            <span>
              {r.indireta.atingida
                ? `Comissão ${formatBRL(r.indireta.comissao)}`
                : `A partir de ${r.indireta.minimo !== null ? formatBRL(r.indireta.minimo) : '—'}`}
            </span>
            <span className={r.indireta.atingida
              ? 'font-medium text-emerald-700 dark:text-emerald-400'
              : 'font-medium text-sky-700 dark:text-sky-300'}>
              {r.indireta.atingida
                ? `Atingida · sobre ${formatBRL(r.indireta.recebido)}`
                : `${faltaRotulo} ${formatBRL(r.indireta.falta ?? 0)}`}
            </span>
          </div>
        </section>
      )}
      {r.indireta && (
        <p className="text-right text-sm font-semibold">{`Total ${formatBRL(r.total)}`}</p>
      )}

      <p className="text-[11px] text-muted-foreground">
        Comissão = valor realizado × percentual da maior faixa atingida. O percentual muda quando a
        próxima meta é atingida; as faixas não somam.
      </p>
    </div>
  );
}

/**
 * CardComissaoDashboard — a própria comissão, ao lado do «Progresso da meta».
 *
 * ## Por que voltou ao Dashboard
 *
 * Em 11/09/2026 o card saiu do Dashboard e a comissão passou a abrir só pelo
 * botão do menu lateral. A liderança pediu em 14/09/2026 que ela volte a ficar
 * à vista, ao lado do donut da meta — as duas perguntas andam juntas: «quanto
 * da meta eu fiz» e «quanto isso me paga» —, e que o botão do menu saia.
 *
 * ## O desenho
 *
 * Mesmo acabamento do `CardMetaDonut` (Card, cabeçalho com ícone em quadrado
 * tingido), porque os dois ficam lado a lado e com a mesma altura. O valor
 * grande é a comissão; embaixo, a escada das faixas em uma linha cada — sem os
 * cartões do `ConteudoComissao`, que não caberiam numa coluna de grade. O resto
 * abre em «Ver comissão», no mesmo Dialog da tela de Metas.
 *
 * ## A altura é a do card ao lado
 *
 * `ALTURA_CARD_PROGRESSO`, a mesma do «Progresso da meta» nas duas vistas dele
 * (14/09/2026). Com a altura do próprio conteúdo, uma faixa a mais ou o aviso da
 * indireta faziam este card e o vizinho andarem juntos. A escada rola por dentro
 * quando não cabe.
 *
 * ## Bônus (16/09/2026)
 *
 * Cada bônus da pessoa entra na mesma lista rolável, depois das faixas, com o
 * valor e a situação. O detalhe — quanto falta, período — fica no «Ver
 * comissão». Sem faixas no mês (sem meta ou sem configuração) e com bônus, o
 * card existe só por causa deles.
 *
 * Só desenha. Quem decide se o card existe é o `PainelMetas`.
 */
import { useState } from 'react';
import { ArrowRight, CheckCircle2, Circle, Coins, Gift, Sparkles, Star } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatBRL } from '@/lib/money';
import { cn } from '@/lib/utils';
import { ALTURA_CARD_PROGRESSO } from '@/components/PainelMetas/tamanhoCards';
import type { BonusCalculado } from '@/services/comissao/bonus';
import type { FaixaComissao, ResultadoComissao } from '@/services/comissao/comissao';
import { SITUACAO_BONUS, diaMes } from './bonusTexto';
import { formatarPct } from './formato';
import { VerComissao } from './VerComissao';

interface CardComissaoDashboardProps {
  resultado: ResultadoComissao;
  isPaguePlay: boolean;
  /** Mês que já passou: «faltou», e não «faltam». */
  mesFechado: boolean;
  /** `yyyy-MM` — vai para o título do «Ver comissão». */
  mes: string;
  /** Nome da pessoa — idem. */
  nome: string;
}

const ICONE_SITUACAO = {
  atingida:     { Icone: CheckCircle2, classe: 'text-emerald-600 dark:text-emerald-400', rotulo: 'atingida' },
  atual:        { Icone: Star,         classe: 'text-primary',                            rotulo: 'atual' },
  proxima:      { Icone: ArrowRight,   classe: 'text-sky-600 dark:text-sky-400',          rotulo: 'próxima' },
  nao_atingida: { Icone: Circle,       classe: 'text-muted-foreground',                   rotulo: 'não atingida' },
} as const;

function LinhaFaixa({ faixa }: { faixa: FaixaComissao }) {
  const s = ICONE_SITUACAO[faixa.situacao];
  const ehAtual = faixa.situacao === 'atual';
  return (
    <li
      aria-current={ehAtual ? 'step' : undefined}
      className={cn(
        'flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs',
        ehAtual ? 'bg-primary/10 ring-1 ring-inset ring-primary/30' : 'bg-muted/30',
      )}
    >
      <s.Icone className={cn('h-3.5 w-3.5 shrink-0', s.classe)} aria-label={s.rotulo} />
      <span className={cn('shrink-0', ehAtual ? 'font-bold' : 'font-medium')}>{faixa.ordem}ª Meta</span>
      <span className="min-w-0 flex-1 truncate text-right font-mono tabular-nums text-muted-foreground">
        {formatBRL(faixa.meta)}
      </span>
      <span className={cn('w-14 shrink-0 text-right font-mono tabular-nums', ehAtual && 'font-bold text-primary')}>
        {formatarPct(faixa.pctEfetivo)}
      </span>
    </li>
  );
}

function rotuloCurtoDoBonus(b: BonusCalculado): string {
  if (b.tipo === 'meta') return `Bônus ${b.metaOrdem}ª Meta`;
  if (b.tipo === 'valor') return `Bônus ${b.alvo !== null ? formatBRL(b.alvo) : ''}`;
  return `Bônus ${diaMes(b.periodoInicio)}–${diaMes(b.periodoFim)}`;
}

function LinhaBonus({ bonus: b }: { bonus: BonusCalculado }) {
  return (
    <li
      className={cn(
        'flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs',
        b.atingido ? 'bg-emerald-500/10 ring-1 ring-inset ring-emerald-500/30' : 'bg-muted/30',
      )}
    >
      {b.atingido
        ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-label={SITUACAO_BONUS[b.situacao]} />
        : <Gift className="h-3.5 w-3.5 shrink-0 text-amber-600" aria-label={SITUACAO_BONUS[b.situacao]} />}
      <span className="min-w-0 flex-1 truncate font-medium">{rotuloCurtoDoBonus(b)}</span>
      <span className={cn('shrink-0 text-right font-mono tabular-nums', b.atingido && 'font-bold text-emerald-700 dark:text-emerald-400')}>
        {`+${formatBRL(b.valorBonus)}`}
      </span>
    </li>
  );
}

export function CardComissaoDashboard({
  resultado: r, isPaguePlay, mesFechado, mes, nome,
}: CardComissaoDashboardProps) {
  const [verAberto, setVerAberto] = useState(false);
  const cor = r.beneficioAtivo ? '#f59e0b' : '#10b981';
  const falta = mesFechado ? 'Faltou' : 'Faltam';

  let apoio: string | null = null;
  if (r.atual) {
    apoio = `${r.atual.ordem}ª Meta · ${formatarPct(r.atual.pctEfetivo)} sobre ${formatBRL(r.recebido)}`;
  } else if (r.proxima) {
    apoio = `Realizado ${formatBRL(r.recebido)}`;
  }

  let proxima: string | null = null;
  if (r.proxima && r.proxima.falta !== null) {
    const minimo = r.proxima.minimo !== null ? ` · a partir de ${formatBRL(r.proxima.minimo)}` : '';
    proxima = `${falta} ${formatBRL(r.proxima.falta)} para a ${r.proxima.ordem}ª Meta${minimo}`;
  } else if (r.atual && !r.proxima) {
    proxima = 'Todas as faixas atingidas';
  }

  const indireta = r.indireta && r.indireta.comissao > 0 ? r.indireta.comissao : 0;
  const semFaixas = r.motivo === 'sem_meta' || r.motivo === 'sem_config';

  return (
    <Card data-card-comissao className={cn('flex flex-col border-border/70 bg-card shadow-sm', ALTURA_CARD_PROGRESSO)}>
      <CardHeader className="px-4 pb-2 pt-4">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <div
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
              style={{ background: cor + '22' }}
            >
              <Coins className="h-3.5 w-3.5" style={{ color: cor }} aria-hidden="true" />
            </div>
            Comissão
            {isPaguePlay && (
              <span className="text-[11px] font-normal text-muted-foreground">· H.O.</span>
            )}
          </CardTitle>
          {r.beneficioAtivo && (
            <span
              className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300"
              title="Meta do setor atingida — benefício ativo"
            >
              <Sparkles className="h-3 w-3" aria-hidden="true" />
              setor
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex min-h-0 flex-1 flex-col gap-3 pb-4">
        <div className="shrink-0 space-y-0.5 text-center">
          <p
            className="font-mono text-2xl font-bold leading-tight tabular-nums"
            style={r.atual || r.total > 0 ? { color: cor } : undefined}
          >
            {semFaixas ? 'Sem faixas no mês' : r.atual || r.total > 0 ? formatBRL(r.total) : 'Nenhuma faixa ainda'}
          </p>
          {apoio && <p className="text-[11px] text-muted-foreground">{apoio}</p>}
          {indireta > 0 && (
            <p className="text-[11px] text-muted-foreground">{`inclui ${formatBRL(indireta)} da indireta`}</p>
          )}
          {r.totalBonus > 0 && (
            <p className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
              {`+ ${formatBRL(r.totalBonus)} de bônus garantido`}
            </p>
          )}
        </div>

        {(r.faixas.length > 0 || r.bonus.length > 0) && (
          <ol className="min-h-0 space-y-1 overflow-y-auto" aria-label="Faixas de comissão">
            {r.faixas.map(f => <LinhaFaixa key={f.ordem} faixa={f} />)}
            {r.bonus.map(b => <LinhaBonus key={b.id} bonus={b} />)}
          </ol>
        )}

        {proxima && (
          <p className="shrink-0 text-center text-[11px] font-medium text-sky-700 dark:text-sky-400">{proxima}</p>
        )}

        <Button
          type="button"
          size="sm"
          variant="outline"
          className="mt-auto h-7 shrink-0 self-center text-xs"
          onClick={() => setVerAberto(true)}
        >
          Ver comissão
        </Button>
      </CardContent>

      {verAberto && (
        <VerComissao
          aberto
          onFechar={() => setVerAberto(false)}
          nome={nome}
          mes={mes}
          isPaguePlay={isPaguePlay}
          mesFechado={mesFechado}
          resultado={r}
        />
      )}
    </Card>
  );
}

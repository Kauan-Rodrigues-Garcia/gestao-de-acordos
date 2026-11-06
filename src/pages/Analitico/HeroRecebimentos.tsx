// src/pages/Analitico/HeroRecebimentos.tsx
/**
 * O topo da visão geral: quanto entrou no recorte, e de quais equipes.
 *
 * Substituiu, em 25/10/2026, a grade de cinco tiles do mesmo tamanho (Total,
 * HO, Operadores, Acordos pagos, Período). O total é a pergunta da tela e
 * agora é o único número grande; HO, pagamentos e operadores ficam ao lado,
 * menores. O tile «Período» saiu: repetia o que o seletor de recorte já diz, e
 * a data do relatório passou para a linha de baixo do total.
 *
 * A faixa de equipes é a fatia de cada equipe na soma dos operadores da lista.
 * É PROPORÇÃO, não valor: a lista conta um clone nas duas equipes em que ele
 * está, e o total do card soma pelo carimbo do relatório — os dois não somam o
 * mesmo número, e a faixa não tenta fingir que somam.
 */
import { CreditCard, Users, Receipt } from 'lucide-react';
import { ValorAnimado } from '@/components/ValorAnimado';
import { formatBRL } from '@/lib/money';
import { cn } from '@/lib/utils';

export interface FatiaEquipe {
  id: string;
  nome: string;
  valor: number;
}

interface HeroRecebimentosProps {
  rotulo: string;
  total: number;
  /** Linha de baixo do total: fonte e data do relatório. */
  rodape: string;
  /** `null` = o recorte não tem HO (diário, BookPlay). */
  ho: { valor: number; pct: string | null } | null;
  pagamentos: number;
  operadores: number;
  equipes: FatiaEquipe[];
  carregando: boolean;
  vazio: string | null;
}

/** Quantas equipes ganham cor própria; o resto vira «outras». */
const MAX_FATIAS = 5;
/** A cor da marca em degraus — uma escala, não um arco-íris de equipes. */
const OPACIDADES = [1, 0.72, 0.52, 0.38, 0.27];

export function HeroRecebimentos({
  rotulo, total, rodape, ho, pagamentos, operadores, equipes, carregando, vazio,
}: HeroRecebimentosProps) {
  if (carregando) {
    return <div className="h-[168px] animate-pulse rounded-2xl bg-muted" aria-label="Carregando o resumo" />;
  }
  if (vazio) {
    return (
      <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
        {vazio}
      </div>
    );
  }

  const fatias = montarFatias(equipes);

  return (
    <section
      aria-label="Resumo do recorte"
      className="overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/[0.07] via-card to-card"
    >
      <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{rotulo}</p>
          <ValorAnimado
            valor={total} formatar={formatBRL}
            className="mt-1 block truncate font-mono text-[2rem] font-bold leading-tight tracking-tight text-primary sm:text-[2.6rem]"
          />
          <p className="mt-1 text-xs text-muted-foreground">{rodape}</p>
        </div>

        <dl className={cn('grid grid-cols-2 gap-2 sm:gap-3', ho ? 'sm:grid-cols-3 lg:min-w-[500px]' : 'lg:min-w-[300px]')}>
          {ho && (
            <Numero Icon={CreditCard} rotulo="HO" valor={formatBRL(ho.valor)} apoio={ho.pct}
              className="col-span-2 sm:col-span-1" />
          )}
          <Numero Icon={Receipt} rotulo="Pagamentos" valor={pagamentos.toLocaleString('pt-BR')} />
          <Numero Icon={Users} rotulo="Operadores" valor={operadores.toLocaleString('pt-BR')} />
        </dl>
      </div>

      {fatias.length > 1 && (
        <div className="border-t border-border/60 bg-card/60 px-4 py-3 sm:px-5">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Divisão entre equipes
            </p>
            <p className="hidden text-[10.5px] text-muted-foreground sm:block">proporção do que os operadores receberam</p>
          </div>
          <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-muted" role="img"
            aria-label={fatias.map(f => `${f.nome} ${f.pct}%`).join(', ')}>
            {fatias.map((f, i) => (
              <span key={f.id} title={`${f.nome}: ${formatBRL(f.valor)} (${f.pct}%)`}
                className={cn('h-full', i > 0 && 'border-l-2 border-card', f.outras ? 'bg-muted-foreground/30' : 'bg-primary')}
                style={{ width: `${f.largura}%`, opacity: f.outras ? 1 : OPACIDADES[i] }} />
            ))}
          </div>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {fatias.map((f, i) => (
              <li key={f.id} className="flex min-w-0 items-center gap-1.5 text-xs" title={formatBRL(f.valor)}>
                <span aria-hidden="true"
                  className={cn('h-2 w-2 shrink-0 rounded-full', f.outras ? 'bg-muted-foreground/30' : 'bg-primary')}
                  style={f.outras ? undefined : { opacity: OPACIDADES[i] }} />
                <span className="max-w-[11rem] truncate text-foreground/90">{f.nome}</span>
                <span className="font-mono tabular-nums text-muted-foreground">{f.pct}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Numero({ Icon, rotulo, valor, apoio, className }: {
  Icon: typeof Users; rotulo: string; valor: string; apoio?: string | null; className?: string;
}) {
  return (
    <div className={cn('@container min-w-0 rounded-xl border border-border/70 bg-card/80 px-3 py-2.5', className)}>
      <dt className="flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3 w-3 shrink-0" aria-hidden="true" /> {rotulo}
      </dt>
      {/* Dinheiro não quebra no meio: «R$ 110.081,3 / 9» se lê como dois números. */}
      <dd className="mt-0.5 whitespace-nowrap font-mono text-sm font-bold leading-tight tabular-nums text-foreground @[10rem]:text-base">
        {valor}
      </dd>
      {apoio && <dd className="text-[10.5px] leading-tight text-muted-foreground">{apoio}</dd>}
    </div>
  );
}

interface Fatia extends FatiaEquipe { pct: number; largura: number; outras: boolean }

/** As maiores equipes, e o resto somado em «outras». Percentual inteiro. */
function montarFatias(equipes: readonly FatiaEquipe[]): Fatia[] {
  const positivas = equipes.filter(e => e.valor > 0).sort((a, b) => b.valor - a.valor);
  const soma = positivas.reduce((s, e) => s + e.valor, 0);
  if (soma <= 0) return [];
  const topo = positivas.length > MAX_FATIAS ? positivas.slice(0, MAX_FATIAS - 1) : positivas;
  const resto = positivas.slice(topo.length);
  const lista: FatiaEquipe[] = resto.length
    ? [...topo, { id: '__outras__', nome: `outras ${resto.length}`, valor: resto.reduce((s, e) => s + e.valor, 0) }]
    : topo;
  return lista.map(e => ({
    ...e,
    largura: (e.valor / soma) * 100,
    pct: Math.round((e.valor / soma) * 100),
    outras: e.id === '__outras__',
  }));
}

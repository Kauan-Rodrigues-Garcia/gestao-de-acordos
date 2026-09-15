/**
 * CardEquipeDiretoria — uma equipe do Gestão dentro do setor, no Painel Diretoria.
 *
 * Pedido de 14/09/2026: «copiando as informações do painel líder; não quero que
 * copie a estética». Então os NÚMEROS são os do card de Desempenho Equipes
 * (acumulado, meta, projeção, faixa, fechamento projetado, ritmo necessário,
 * pessoas por quartil, destaque) e o desenho é o dos cards desta aba: borda
 * fina, número em mono, selo de quartil.
 *
 * O card é a porta — o clique abre `DetalheEquipeDiretoria` na própria aba.
 */
import { ChevronRight, GraduationCap, Star, Link2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { corProjecao, COR_QUARTIL } from '@/lib/diasUteis';
import { formatBRL } from '@/lib/money';
import { cn } from '@/lib/utils';
import type { LiderInfo } from '@/pages/Dashboard/Analitico/lideresDaEquipe';
import type { EquipeDiretoria } from '@/services/mestre/equipesDiretoria';
import { SeloQuartil } from './components';

const pct1 = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const iniciais = (nome: string) =>
  nome.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();

/** Diferença abaixo disto é arredondamento, e não merece a linha do 59. */
const TOLERANCIA_59 = 1;

export function CardEquipeDiretoria({
  equipe: e, lideres, valor59, onAbrir,
}: {
  equipe: EquipeDiretoria;
  lideres: LiderInfo[];
  /** O que o 59 atribui a esta equipe pelo vínculo. `null` = nenhum subgrupo ligado. */
  valor59: number | null;
  onAbrir: () => void;
}) {
  const d = e.detalhe;
  const esperado = e.meta !== null && e.totalUteis > 0 ? (e.meta / e.totalUteis) * e.decorridos : null;
  const larguraAcumulado = e.meta ? Math.min(100, (e.acumulado / e.meta) * 100) : 0;
  const marcaEsperado = e.meta && esperado !== null ? Math.min(100, (esperado / e.meta) * 100) : null;
  const cor = d.projecaoPct !== null ? corProjecao(d.projecaoPct) : undefined;
  const lider = lideres[0];
  const mostra59 = valor59 !== null && Math.abs(valor59 - e.acumulado) >= TOLERANCIA_59;

  return (
    <button
      type="button"
      onClick={onAbrir}
      className="group flex w-full flex-col gap-3 rounded-xl border border-border/70 bg-card p-3.5 text-left shadow-sm transition-colors hover:border-primary/40 hover:bg-muted/20"
    >
      {/* Quem é */}
      <div className="flex items-start gap-2.5">
        <Avatar className="h-8 w-8 shrink-0 border border-border/60">
          {lider?.foto_url && <AvatarImage src={lider.foto_url} alt="" />}
          <AvatarFallback className="bg-muted text-[10px] font-semibold text-muted-foreground">
            {iniciais(lider?.nome ?? e.nome)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground" title={e.nome}>{e.nome}</p>
          <p className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
            {lideres.length ? lideres.map(l => l.nome).join(' · ') : 'sem líder definido'}
            {e.treino && (
              <span className="inline-flex shrink-0 items-center gap-0.5 rounded border border-border px-1 text-[9px] uppercase">
                <GraduationCap className="h-2.5 w-2.5" /> treino
              </span>
            )}
          </p>
        </div>
        {d.faixaAtual && <SeloQuartil quartil={d.faixaAtual.quartil} />}
        <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </div>

      {/* Quanto, e contra o quê */}
      <div>
        <div className="flex items-baseline justify-between gap-2">
          <p className="font-mono text-lg font-bold tabular-nums text-foreground">{formatBRL(e.acumulado)}</p>
          <p className="shrink-0 text-[11px] text-muted-foreground">
            {e.meta !== null ? <>meta <span className="font-mono tabular-nums">{formatBRL(e.meta)}</span></> : 'sem meta'}
          </p>
        </div>
        {e.meta !== null && (
          <div className="relative mt-1.5 h-1.5 rounded-full bg-muted" aria-hidden="true">
            <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${larguraAcumulado}%`, background: cor }} />
            {marcaEsperado !== null && (
              <span
                className="absolute top-1/2 h-3 w-0.5 -translate-y-1/2 rounded-full bg-foreground/60"
                style={{ left: `calc(${marcaEsperado}% - 1px)` }}
                title="Esperado até hoje"
              />
            )}
          </div>
        )}
        {mostra59 && (
          <p className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
            <Link2 className="h-2.5 w-2.5" /> no 59: <span className="font-mono tabular-nums">{formatBRL(valor59)}</span>
          </p>
        )}
      </div>

      {/* Ritmo */}
      <dl className="grid grid-cols-3 gap-2 border-t border-border/50 pt-2.5 text-[11px]">
        <div className="min-w-0">
          <dt className="text-muted-foreground">Projeção</dt>
          <dd className="font-mono font-bold tabular-nums" style={cor ? { color: cor } : undefined}>
            {d.projecaoPct !== null ? `${pct1(d.projecaoPct)}%` : '—'}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-muted-foreground">Fecha em</dt>
          <dd className="truncate font-mono font-semibold tabular-nums text-foreground" title={formatBRL(d.projecaoFechamento)}>
            {formatBRL(d.projecaoFechamento)}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-muted-foreground">Precisa/dia</dt>
          <dd className="truncate font-mono font-semibold tabular-nums text-foreground">
            {e.meta === null ? '—' : d.ritmoNecessario === null ? 'meta batida' : formatBRL(d.ritmoNecessario)}
          </dd>
        </div>
      </dl>

      {/* Pessoas */}
      <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
        {d.porQuartil.map(q => (
          <span
            key={q.quartil}
            className={cn('rounded px-1.5 py-0.5 font-semibold tabular-nums', q.qtd === 0 && 'opacity-40')}
            style={{ background: `${COR_QUARTIL[q.quartil] ?? COR_QUARTIL[4]}1a`, color: COR_QUARTIL[q.quartil] ?? COR_QUARTIL[4] }}
            title={q.nomes.join(', ') || 'ninguém nesta faixa'}
          >
            Q{q.quartil}: {q.qtd}
          </span>
        ))}
        <span className="text-muted-foreground">
          {d.totalOperadores} {d.totalOperadores === 1 ? 'pessoa' : 'pessoas'}
        </span>
        {d.destaque && d.destaque.recebido > 0 && (
          <span className="ml-auto inline-flex min-w-0 items-center gap-1 truncate text-muted-foreground" title="Maior recebimento da equipe">
            <Star className="h-3 w-3 shrink-0 text-amber-500" />
            <span className="truncate">{d.destaque.nome}</span>
          </span>
        )}
      </div>
    </button>
  );
}

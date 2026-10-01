/**
 * PainelLateral — a coluna da direita da aba Indicações.
 *
 * Duas versões, porque são duas perguntas:
 *
 *   `RankingIndicacoes` — quem enxerga a equipe ou o setor: quem mais indicou,
 *                          com pódio e a própria linha destacada.
 *   `MeuMes`            — quem enxerga só as próprias (ou escolheu «só as
 *                          minhas»): o ranking teria uma pessoa só — a RPC é
 *                          INVOKER e devolve o recorte da RLS —, e um pódio de
 *                          um lugar não diz nada. No lugar dele, o mês da
 *                          pessoa: constância, melhor dia, mês anterior.
 *
 * `RitmoDoMes` aparece nas duas: as barras por dia, com hoje destacado.
 */
import { Trophy, Flame, CalendarCheck, TrendingUp, TrendingDown, Star, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { iniciais, type PontoDia, type ResumoDoMes } from '@/lib/indicacoesResumo';
import type { Indicacao, LinhaRanking } from '@/services/vendas/indicacoes.service';

function diaCurto(iso: string): string {
  return iso.slice(8, 10) + '/' + iso.slice(5, 7);
}

const MEDALHAS = [
  { anel: 'ring-amber-400/60 bg-amber-400/15 text-amber-600 dark:text-amber-300', rotulo: '1º' },
  { anel: 'ring-slate-400/60 bg-slate-400/15 text-slate-600 dark:text-slate-300', rotulo: '2º' },
  { anel: 'ring-orange-500/50 bg-orange-500/15 text-orange-700 dark:text-orange-300', rotulo: '3º' },
] as const;

function Cartao({ titulo, Icone, children, extra }: {
  titulo: string; Icone: typeof Trophy; children: React.ReactNode; extra?: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-[14px] font-semibold">
          <Icone className="h-4 w-4 text-primary" aria-hidden /> {titulo}
        </h2>
        {extra}
      </div>
      {children}
    </section>
  );
}

/* ── Ranking ──────────────────────────────────────────────────────────────── */

export function RankingIndicacoes({ ranking, perfilId, carregando, mesRotulo }: {
  ranking: readonly LinhaRanking[];
  perfilId: string | null;
  carregando: boolean;
  mesRotulo: string;
}) {
  const maior = Math.max(1, ...ranking.map(r => r.quantidade));
  const podio = ranking.slice(0, 3);
  const resto = ranking.slice(3);

  return (
    <Cartao titulo="Quem mais indicou" Icone={Trophy}
            extra={ranking.length > 0 && <span className="text-[11px] text-muted-foreground">{ranking.length} pessoas</span>}>
      {ranking.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {carregando ? 'Carregando…' : `Ninguém indicou em ${mesRotulo} ainda. A primeira pode ser a sua!`}
        </p>
      ) : (
        <>
          {/* Pódio de verdade: 2º, 1º, 3º — o primeiro no meio e mais alto. */}
          <div className="grid grid-cols-3 items-end gap-2">
            {[1, 0, 2].map(i => podio[i] && { r: podio[i], i }).filter(Boolean).map(x => {
              const { r, i } = x as { r: LinhaRanking; i: number };
              return (
              <div key={r.operador_id}
                   className={cn(
                     'flex flex-col items-center rounded-xl border px-1.5 text-center',
                     i === 0 ? 'py-4' : 'py-2.5',
                     r.operador_id === perfilId ? 'border-primary/40 bg-primary/[0.06]' : 'border-border bg-muted/20',
                   )}>
                <span className={cn('flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold ring-2', MEDALHAS[i].anel)}>
                  {iniciais(r.operador_nome)}
                </span>
                <span className="mt-1 text-[10px] font-semibold text-muted-foreground">{MEDALHAS[i].rotulo}</span>
                <span className="w-full truncate text-xs font-medium" title={r.operador_nome}>
                  {r.operador_nome.split(' ')[0]}
                </span>
                <span className="font-mono text-base font-bold tabular-nums">{r.quantidade}</span>
              </div>
              );
            })}
          </div>

          {resto.length > 0 && (
            <ol className="mt-3 space-y-1.5">
              {resto.map((r, k) => {
                const eu = r.operador_id === perfilId;
                return (
                  <li key={r.operador_id}
                      className={cn('flex items-center gap-2.5 rounded-lg px-2 py-1', eu && 'bg-primary/[0.07] ring-1 ring-primary/25')}>
                    <span className="w-6 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{k + 4}º</span>
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">
                      {iniciais(r.operador_nome)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-xs">{r.operador_nome}{eu && <span className="ml-1 text-primary">(você)</span>}</span>
                        <span className="shrink-0 text-xs font-semibold tabular-nums">{r.quantidade}</span>
                      </div>
                      <div className="mt-0.5 h-1 w-full rounded-full bg-muted">
                        <div className="h-1 rounded-full bg-primary/70" style={{ width: `${(r.quantidade / maior) * 100}%` }} />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </>
      )}
    </Cartao>
  );
}

/* ── O mês de quem enxerga só as próprias ─────────────────────────────────── */

export function MeuMes({ resumo, anterior, mesRotulo, mesAnteriorRotulo, ultimas }: {
  resumo: ResumoDoMes;
  /** Total do mês anterior, no mesmo recorte. `null` = ainda carregando. */
  anterior: number | null;
  mesRotulo: string;
  mesAnteriorRotulo: string;
  /** As últimas por contato: a escola uma vez, com quantos telefones teve. */
  ultimas: readonly { item: Indicacao; telefones: number }[];
}) {
  const diferenca = anterior === null ? null : resumo.total - anterior;

  const fatos: { Icone: typeof Flame; titulo: string; valor: string; apoio: string; tom?: string }[] = [
    {
      Icone: Flame, titulo: 'Sequência',
      valor: resumo.sequencia > 0 ? `${resumo.sequencia} ${resumo.sequencia === 1 ? 'dia' : 'dias'}` : '—',
      apoio: resumo.sequencia > 0 ? 'dias úteis seguidos indicando' : 'indique hoje para começar uma',
      tom: resumo.sequencia >= 3 ? 'text-orange-500' : undefined,
    },
    {
      Icone: CalendarCheck, titulo: 'Dias com indicação',
      valor: String(resumo.diasAtivos), apoio: `em ${mesRotulo}`,
    },
    {
      Icone: Star, titulo: 'Melhor dia',
      valor: resumo.melhorDia ? diaCurto(resumo.melhorDia.dia) : '—',
      apoio: resumo.melhorDia ? `${resumo.melhorDia.quantidade} ${resumo.melhorDia.quantidade === 1 ? 'indicação' : 'indicações'}` : 'ainda sem indicação',
    },
    {
      Icone: diferenca !== null && diferenca < 0 ? TrendingDown : TrendingUp,
      titulo: `Contra ${mesAnteriorRotulo}`,
      valor: diferenca === null ? '…' : diferenca === 0 ? 'igual' : `${diferenca > 0 ? '+' : ''}${diferenca}`,
      apoio: anterior === null ? 'carregando' : `${anterior} no mês anterior`,
      tom: diferenca === null || diferenca === 0 ? undefined : diferenca > 0 ? 'text-success' : 'text-warning',
    },
  ];

  return (
    <Cartao titulo="Seu mês" Icone={Star}>
      <div className="grid grid-cols-2 gap-2">
        {fatos.map(f => (
          <div key={f.titulo} className="rounded-xl border border-border bg-muted/20 p-2.5">
            <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              <f.Icone className="h-3 w-3" aria-hidden /> {f.titulo}
            </p>
            <p className={cn('mt-0.5 font-mono text-lg font-bold tabular-nums', f.tom)}>{f.valor}</p>
            <p className="text-[10px] text-muted-foreground">{f.apoio}</p>
          </div>
        ))}
      </div>

      <div className="mt-4">
        <p className="mb-1.5 flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
          <Clock className="h-3 w-3" aria-hidden /> Suas últimas
        </p>
        {ultimas.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhuma ainda neste mês.</p>
        ) : (
          <ul className="space-y-1">
            {ultimas.map(({ item, telefones }) => (
              <li key={item.id} className="flex items-center justify-between gap-2 rounded-lg px-1.5 py-1 text-xs hover:bg-muted/40">
                <span className="min-w-0 truncate">
                  {item.instituicao}
                  {telefones > 1 && <span className="ml-1.5 text-[10px] text-primary">· {telefones} telefones</span>}
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">{diaCurto(item.data_indicacao)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Cartao>
  );
}

/* ── Ritmo do mês ─────────────────────────────────────────────────────────── */

export function RitmoDoMes({ porDia, hoje, semana }: {
  porDia: readonly PontoDia[];
  hoje: string;
  /** Total dos últimos 7 dias, para a legenda. */
  semana: number;
}) {
  const maior = Math.max(1, ...porDia.map(p => p.quantidade));
  // Com muitos dias, número e rótulo em cada barra viram borrão: mostra um
  // dia sim, outro não (e sempre hoje e o pico). O valor exato fica no title.
  const apertado = porDia.length > 14;
  const mostrar = (p: PontoDia, k: number) =>
    !apertado || k % 2 === 0 || p.dia === hoje || p.quantidade === maior;
  return (
    <Cartao titulo="Ritmo do mês" Icone={TrendingUp}
            extra={<span className="text-[11px] text-muted-foreground">{semana} nos últimos 7 dias</span>}>
      {porDia.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">As barras aparecem com a primeira indicação.</p>
      ) : (
        // As barras dividem a largura: um mês cheio cabe no cartão sem rolar.
        <div className="flex items-end gap-0.5 pb-1" style={{ minHeight: 96 }}>
          {porDia.map((p, k) => {
            const ehHoje = p.dia === hoje;
            const rotulo = mostrar(p, k);
            return (
              <div key={p.dia} className="flex min-w-0 max-w-7 flex-1 flex-col items-center gap-1">
                <span className={cn('text-[10px] tabular-nums', ehHoje ? 'font-bold text-primary' : 'text-muted-foreground', !rotulo && 'invisible')}>
                  {p.quantidade}
                </span>
                <div className={cn('w-full rounded-md', ehHoje ? 'bg-primary' : 'bg-primary/35')}
                     style={{ height: `${Math.max(6, (p.quantidade / maior) * 60)}px` }}
                     title={`${p.quantidade} em ${diaCurto(p.dia)}`} />
                <span className={cn('text-[10px] tabular-nums', ehHoje ? 'font-semibold text-primary' : 'text-muted-foreground', !rotulo && 'invisible')}>
                  {ehHoje ? 'hoje' : p.dia.slice(8, 10)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Cartao>
  );
}

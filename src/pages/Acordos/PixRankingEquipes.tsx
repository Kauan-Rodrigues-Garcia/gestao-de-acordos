/**
 * PixRankingEquipes.tsx — o modo «Equipes» do ranking Pix: as equipes de UM
 * setor disputando entre si.
 *
 * Pedido de 24/11/2026. Equipes do mesmo setor se comparam (meta de acordos e
 * percentual de comissão são os mesmos), mas equipe grande soma mais que
 * equipe pequena só por ser grande. Por isso a ordem é escolhível: por
 * ACORDOS (o volume, padrão), por MÉDIA por operador (o ritmo, que tira o
 * tamanho da conta) e por % DA META (só quando alguma equipe tem meta no mês).
 *
 * O desenho repete o pódio dos operadores — o 1º maior, as mesmas cores — e
 * cada equipe é um botão: clicar abre os operadores dela no modo Operadores.
 * Equipe parada aparece zerada e apagada; «Sem equipe» fica no fim, sem lugar.
 *
 * As contas moram em `rankingPixPorEquipe` (pura, com teste).
 */
import { motion } from 'framer-motion';
import { Users, Crown, Medal, ChevronRight, Target } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/index';
import { cn } from '@/lib/utils';
import type { LinhaRankingEquipePix, OrdemRankingEquipe } from './pixAutomaticoView';
import { PODIO } from './pixRankingPodio';

const ROTULO_ORDEM: Record<OrdemRankingEquipe, string> = {
  acordos: 'Acordos',
  media:   'Média por operador',
  meta:    '% da meta',
};

const umaCasa = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });

export interface PixRankingEquipesProps {
  linhas: LinhaRankingEquipePix[];
  ordem: OrdemRankingEquipe;
  onOrdem: (o: OrdemRankingEquipe) => void;
  /** Abre a equipe no modo Operadores. `null` = «Sem equipe». */
  onAbrirEquipe: (equipeId: string | null) => void;
  /** A equipe de quem está olhando, para o selo «sua equipe». */
  minhaEquipeId?: string | null;
}

/** «82% da meta» — verde quando bateu. */
function SeloMeta({ pct, batida }: { pct: number | null; batida: boolean }) {
  if (pct == null) return null;
  return (
    <span
      title={batida ? 'Meta de Pix da equipe batida no mês' : 'Quanto da meta de Pix da equipe já foi feito no mês'}
      className={cn(
        'shrink-0 inline-flex items-center gap-0.5 rounded-md border px-1 py-0.5 text-[9px] font-bold tabular-nums',
        batida
          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
          : 'border-border bg-muted/40 text-muted-foreground',
      )}
    >
      <Target className="w-2.5 h-2.5" /> {Math.round(pct)}%
    </span>
  );
}

function SeloSua() {
  return (
    <Badge variant="outline" className="shrink-0 border-primary/40 px-1 py-0 text-[9px] text-primary">
      sua equipe
    </Badge>
  );
}

export function PixRankingEquipes({
  linhas, ordem, onOrdem, onAbrirEquipe, minhaEquipeId,
}: PixRankingEquipesProps) {
  const times  = linhas.filter(l => l.equipeId != null);
  const sem    = linhas.find(l => l.equipeId == null) ?? null;
  // Pódio só para quem fez acordo: um 2º lugar com zero não é lugar.
  const podio  = times.filter(t => t.acordos > 0).slice(0, 3);
  const demais = times.filter(t => !podio.includes(t));
  const maximo = Math.max(...times.map(t => t.acordos), 1);
  const temMeta = times.some(t => t.pctMeta != null);
  const ordens: OrdemRankingEquipe[] = temMeta ? ['acordos', 'media', 'meta'] : ['acordos', 'media'];

  return (
    <div>
      {/* ── Ordem ── */}
      <div className="flex flex-wrap items-center gap-1.5 px-3 pt-3">
        <span className="text-[10.5px] text-muted-foreground">Ordenar por</span>
        <div role="radiogroup" aria-label="Ordem do ranking de equipes"
          className="inline-flex rounded-lg border border-border bg-muted/30 p-0.5">
          {ordens.map(o => (
            <button
              key={o}
              type="button"
              role="radio"
              aria-checked={ordem === o}
              onClick={() => onOrdem(o)}
              className={cn(
                'rounded-md px-2 py-0.5 text-[10.5px] font-semibold transition-colors',
                ordem === o ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {ROTULO_ORDEM[o]}
            </button>
          ))}
        </div>
      </div>

      {/* ── Pódio das equipes ── */}
      {podio.length > 0 && (
        <div className="grid grid-cols-1 gap-2.5 p-3 sm:grid-cols-[1.4fr_1fr_1fr] sm:items-end">
          {podio.map((t, i) => {
            const pos = i + 1;
            const cor = PODIO[pos];
            const ehLider = pos === 1;
            const ehSua = minhaEquipeId != null && t.equipeId === minhaEquipeId;
            return (
              <motion.button
                type="button"
                key={t.equipeId}
                onClick={() => onAbrirEquipe(t.equipeId)}
                title="Ver os operadores desta equipe"
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05, duration: 0.25 }}
                className={cn(
                  'group flex flex-col gap-2 rounded-xl border text-left transition-transform hover:-translate-y-0.5',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
                  ehLider ? 'p-3.5 sm:gap-2.5' : 'p-2.5',
                  cor.cartao,
                  ehSua && 'ring-1 ring-primary/50',
                )}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className={cn(
                    'shrink-0 flex items-center justify-center rounded-full bg-background/60',
                    ehLider ? 'h-10 w-10' : 'h-8 w-8',
                    cor.anel,
                  )}>
                    <Users className={cn(ehLider ? 'h-4 w-4' : 'h-3.5 w-3.5', cor.texto)} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={cn(
                      'flex items-center gap-1 font-semibold text-foreground',
                      ehLider ? 'text-sm' : 'text-xs',
                    )}>
                      {ehLider
                        ? <Crown className="h-3.5 w-3.5 shrink-0 text-amber-500 dark:text-amber-300" />
                        : <Medal className={cn('h-3 w-3 shrink-0', cor.texto)} />}
                      <span className="truncate">{t.nome}</span>
                    </p>
                    <p className={cn('text-[10px] font-bold uppercase tracking-wide', cor.texto)}>
                      {pos}º lugar
                    </p>
                  </div>
                  <SeloMeta pct={t.pctMeta} batida={t.metaBatida} />
                  {ehSua && <SeloSua />}
                </div>

                <div className="flex items-baseline gap-1.5">
                  <span className={cn('font-mono font-bold leading-none', ehLider ? 'text-3xl' : 'text-xl', cor.texto)}>
                    {t.acordos}
                  </span>
                  <span className="text-[10.5px] text-muted-foreground">acordos</span>
                </div>

                <div className={cn('w-full overflow-hidden rounded-full bg-muted', ehLider ? 'h-2' : 'h-1.5')}>
                  <motion.div
                    className={cn('h-full rounded-full', cor.barra)}
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.round((t.acordos / maximo) * 100)}%` }}
                    transition={{ delay: 0.1 + i * 0.05, duration: 0.5 }}
                  />
                </div>

                <p className="text-[10.5px] text-muted-foreground tabular-nums">
                  {t.operadores} operador{t.operadores !== 1 ? 'es' : ''} · {umaCasa(t.mediaAcordos)} por operador
                  {t.noRequisito > 0 && <> · {t.noRequisito} na meta de acordos</>}
                </p>

                <div className="flex w-full items-center justify-between text-[10.5px] tabular-nums">
                  <span className="text-muted-foreground">{formatCurrency(t.valor)}</span>
                  <span className="inline-flex items-center gap-1 font-mono font-semibold text-primary">
                    {formatCurrency(t.comissao)}
                    <ChevronRight className="h-3 w-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                  </span>
                </div>
              </motion.button>
            );
          })}
        </div>
      )}

      {/* ── Do 4º em diante (e as paradas), mais «Sem equipe» no fim ── */}
      {(demais.length > 0 || sem) && (
        <div className={cn('divide-y divide-border/30', podio.length > 0 ? 'border-t border-border/60' : 'mt-3 border-t border-border/60')}>
          {[...demais, ...(sem ? [sem] : [])].map((t, i) => {
            const semLugar = t.equipeId == null;
            const parada = t.acordos === 0;
            const pos = podio.length + i + 1;
            const ehSua = minhaEquipeId != null && t.equipeId === minhaEquipeId;
            return (
              <button
                type="button"
                key={t.equipeId ?? 'sem-equipe'}
                onClick={() => onAbrirEquipe(t.equipeId)}
                disabled={parada}
                title={parada ? 'Nenhum acordo Pix no mês' : 'Ver os operadores desta equipe'}
                className={cn(
                  'group flex w-full items-center gap-3 px-4 py-2 text-left transition-colors',
                  parada ? 'cursor-default opacity-55' : 'hover:bg-accent/20',
                  ehSua && 'bg-primary/[0.07]',
                )}
              >
                <span className="w-6 shrink-0 text-[10.5px] font-bold text-muted-foreground tabular-nums">
                  {semLugar ? '—' : `${pos}º`}
                </span>
                <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className={cn('min-w-0 flex-1 truncate text-xs', semLugar ? 'italic text-muted-foreground' : 'text-foreground/90')}>
                  {t.nome}
                </span>
                <SeloMeta pct={t.pctMeta} batida={t.metaBatida} />
                {ehSua && <SeloSua />}
                <span className="hidden w-28 shrink-0 text-right text-[10.5px] text-muted-foreground tabular-nums sm:inline">
                  {t.operadores} op · {umaCasa(t.mediaAcordos)}/op
                </span>
                <span className="w-8 shrink-0 text-right font-mono text-xs font-bold text-foreground">
                  {t.acordos}
                </span>
                <span className="hidden w-24 shrink-0 text-right font-mono text-[10.5px] text-muted-foreground sm:inline">
                  {formatCurrency(t.valor)}
                </span>
                <span className="w-20 shrink-0 text-right font-mono text-[10.5px] font-semibold text-primary">
                  {formatCurrency(t.comissao)}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

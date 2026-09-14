/**
 * DetalheEquipeDiretoria — a equipe aberta, dentro do setor, no Painel Diretoria.
 *
 * Pedido de 14/09/2026: «clicando nesse card da equipe, vai aparecer as
 * informações detalhadas daquela equipe: como está a operação, como está a
 * equipe, recebimento diário, todos os dados que um diretor precisa ver e
 * entender. Também os dados do painel líder: faixa atual, ritmo e fechamento,
 * quartil de cada operador, quantas pessoas tem cada quartil, quem é o operador
 * destaque».
 *
 * Abre NA PRÓPRIA ABA, como o detalhe do setor, e pelo mesmo motivo: gráfico e
 * tabela precisam da largura inteira.
 *
 * Os números são os de `detalharEquipe` — os do Painel Líder. O recebimento por
 * dia vem sob demanda (`serieDaEquipe`), porque é a única leitura pesada.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from 'recharts';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Wallet, Target, TrendingUp, CalendarClock, Star, AlertTriangle,
  GraduationCap, Link2, Link2Off,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { useAxisColors, useChartColors } from '@/hooks/useChartColors';
import { corProjecao, COR_QUARTIL } from '@/lib/diasUteis';
import { formatBRL } from '@/lib/money';
import { rotuloDoMes } from '@/lib/mesReferencia';
import { cn } from '@/lib/utils';
import type { LiderInfo } from '@/pages/Dashboard/Analitico/lideresDaEquipe';
import type { EquipeDiretoria } from '@/services/mestre/equipesDiretoria';
import { SeloQuartil } from './components';

const pct1 = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const iniciais = (nome: string) =>
  nome.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();

function Numero({ icone: Icone, rotulo, valor, apoio, cor, destaque }: {
  icone: typeof Wallet; rotulo: string; valor: React.ReactNode; apoio?: React.ReactNode;
  cor?: string; destaque?: boolean;
}) {
  return (
    <div className={cn('rounded-xl border bg-card p-3.5 shadow-sm', destaque ? 'border-primary/40' : 'border-border/70')}>
      <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        <Icone className="h-3 w-3" /> {rotulo}
      </span>
      <p className="mt-1.5 font-mono text-xl font-bold tabular-nums text-foreground" style={cor ? { color: cor } : undefined}>
        {valor}
      </p>
      {apoio && <p className="mt-0.5 text-[11px] text-muted-foreground">{apoio}</p>}
    </div>
  );
}

export function DetalheEquipeDiretoria({
  equipe: e, lideres, setorNome, mes, valor59, rotulos59, carregarSerie, onVoltar,
}: {
  equipe: EquipeDiretoria;
  lideres: LiderInfo[];
  setorNome: string;
  mes: string;
  /** O que o 59 atribui a esta equipe pelo vínculo. `null` = nenhum subgrupo ligado. */
  valor59: number | null;
  /** Os subgrupos do ERP ligados a esta equipe. */
  rotulos59: string[];
  carregarSerie: (equipeId: string) => Promise<{ dia: number; valor: number }[]>;
  onVoltar: () => void;
}) {
  const d = e.detalhe;
  const [serie, setSerie] = useState<{ dia: number; valor: number }[] | null>(null);
  const [erroSerie, setErroSerie] = useState(false);

  const { tickColor, gridColor } = useAxisColors();
  const cores = useChartColors(['--azul-bookplay']);
  const corBarra = cores['--azul-bookplay'] ?? '#3b82f6';

  useEffect(() => {
    let vivo = true;
    setSerie(null);
    setErroSerie(false);
    carregarSerie(e.equipeId)
      .then(s => { if (vivo) setSerie(s); })
      .catch(() => { if (vivo) setErroSerie(true); });
    return () => { vivo = false; };
  }, [e.equipeId, carregarSerie]);

  const diasComRecebimento = useMemo(() => (serie ?? []).filter(p => p.valor > 0), [serie]);
  const mediaDosDias = diasComRecebimento.length
    ? diasComRecebimento.reduce((s, p) => s + p.valor, 0) / diasComRecebimento.length
    : 0;
  const melhorDia = diasComRecebimento.reduce<{ dia: number; valor: number } | null>(
    (m, p) => (!m || p.valor > m.valor ? p : m), null,
  );

  const cor = d.projecaoPct !== null ? corProjecao(d.projecaoPct) : undefined;
  const esperado = e.meta !== null && e.totalUteis > 0 ? (e.meta / e.totalUteis) * e.decorridos : null;
  const comMeta = e.operadores.filter(o => o.quartil !== null).length;

  return (
    <motion.div
      initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2 }}
      className="space-y-4 pb-16"
    >
      <button
        type="button"
        onClick={onVoltar}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Voltar para {setorNome}
      </button>

      {/* Quem é */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex -space-x-2">
          {(lideres.length ? lideres : [{ nome: e.nome, foto_url: null }]).slice(0, 3).map(l => (
            <Avatar key={l.nome} className="h-10 w-10 border-2 border-background">
              {l.foto_url && <AvatarImage src={l.foto_url} alt="" />}
              <AvatarFallback className="bg-muted text-[11px] font-semibold text-muted-foreground">
                {iniciais(l.nome)}
              </AvatarFallback>
            </Avatar>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="flex flex-wrap items-center gap-2 text-xl font-bold tracking-tight text-foreground">
            {e.nome}
            {d.faixaAtual && <SeloQuartil quartil={d.faixaAtual.quartil} />}
            {e.treino && (
              <span className="inline-flex items-center gap-1 rounded border border-border bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                <GraduationCap className="h-3 w-3" /> treinamento
              </span>
            )}
          </h2>
          <p className="text-[11px] text-muted-foreground">
            {setorNome}
            {lideres.length > 0 && ` · ${lideres.map(l => l.nome).join(' · ')}`}
            {` · ${rotuloDoMes(mes)} · ${e.decorridos} de ${e.totalUteis} dias úteis`}
          </p>
        </div>
      </div>

      {/* Como está a operação */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Numero
          icone={Wallet} rotulo="Acumulado" destaque
          valor={formatBRL(e.acumulado)}
          apoio={e.meta !== null
            ? <>meta {formatBRL(e.meta)}{d.faltaMeta ? ` · faltam ${formatBRL(d.faltaMeta)}` : ' · meta batida'}</>
            : 'sem meta cadastrada na aba Metas'}
        />
        <Numero
          icone={Target} rotulo="Projeção e faixa"
          valor={d.projecaoPct !== null ? `${pct1(d.projecaoPct)}%` : '—'}
          cor={cor}
          apoio={d.faixaAtual
            ? <>{d.faixaAtual.quartil}º quartil · esperado {formatBRL(esperado ?? 0)}</>
            : 'sem meta, sem faixa'}
        />
        <Numero
          icone={TrendingUp} rotulo="Fechamento projetado"
          valor={formatBRL(d.projecaoFechamento)}
          apoio={d.sobraProjetada === null
            ? `média de ${formatBRL(d.mediaDiaria)} por dia útil`
            : d.sobraProjetada >= 0
              ? <span className="text-emerald-600 dark:text-emerald-400">{formatBRL(d.sobraProjetada)} acima da meta</span>
              : <span className="text-rose-600 dark:text-rose-400">{formatBRL(Math.abs(d.sobraProjetada))} abaixo da meta</span>}
        />
        <Numero
          icone={CalendarClock} rotulo="Ritmo necessário"
          valor={e.meta === null ? '—' : d.ritmoNecessario === null ? 'meta batida' : formatBRL(d.ritmoNecessario)}
          apoio={`por dia útil · ${d.diasRestantes} ${d.diasRestantes === 1 ? 'dia restante' : 'dias restantes'} · média atual ${formatBRL(d.mediaDiaria)}/dia`}
        />
      </div>

      {/* Recebimento diário */}
      <section className="rounded-xl border border-border/70 bg-card p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Recebimento diário</h3>
            <p className="text-[11px] text-muted-foreground">
              Soma dos operadores da equipe em cada dia de {rotuloDoMes(mes)}, pelo analítico.
            </p>
          </div>
          {melhorDia && (
            <p className="text-[11px] text-muted-foreground">
              melhor dia: <strong className="text-foreground">{melhorDia.dia}</strong> ({formatBRL(melhorDia.valor)})
              {' · '}média dos dias com recebimento: <strong className="text-foreground">{formatBRL(mediaDosDias)}</strong>
            </p>
          )}
        </div>
        <div className="h-[220px] w-full">
          {erroSerie ? (
            <p className="py-16 text-center text-xs text-muted-foreground">Não foi possível carregar o recebimento por dia.</p>
          ) : serie === null ? (
            <Skeleton className="h-full w-full rounded-lg" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={serie} margin={{ top: 6, right: 8, bottom: 0, left: -6 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                <XAxis dataKey="dia" tick={{ fontSize: 10, fill: tickColor }} stroke={gridColor} tickLine={false} />
                <YAxis
                  tick={{ fontSize: 10, fill: tickColor }} stroke={gridColor}
                  tickLine={false} axisLine={false} width={52}
                  tickFormatter={v => `${Math.round(Number(v) / 1000)}k`}
                />
                <Tooltip
                  cursor={{ fill: corBarra, fillOpacity: 0.08 }}
                  formatter={(v: number) => [formatBRL(v), 'Recebido']}
                  labelFormatter={dia => `Dia ${dia}`}
                  contentStyle={{
                    borderRadius: '10px', border: '1px solid rgba(148,163,184,0.2)',
                    background: 'var(--popover)', color: 'var(--popover-foreground)', fontSize: '11px',
                  }}
                />
                {mediaDosDias > 0 && (
                  <ReferenceLine y={mediaDosDias} stroke={tickColor} strokeOpacity={0.5} strokeDasharray="4 4" />
                )}
                <Bar dataKey="valor" fill={corBarra} radius={[3, 3, 0, 0]} maxBarSize={22} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Degraus */}
        <section className="rounded-xl border border-border/70 bg-card p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-foreground">Quanto falta para cada faixa</h3>
          <p className="text-[11px] text-muted-foreground">
            Hoje é o que entra na faixa agora; amanhã é o que a mantém nela depois que a régua subir um dia útil.
          </p>
          {d.degraus.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">Sem meta da equipe, não há degraus.</p>
          ) : (
            <table className="mt-3 w-full text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  <th className="pb-1.5 text-left font-medium">Faixa</th>
                  <th className="pb-1.5 text-right font-medium">Falta hoje</th>
                  <th className="pb-1.5 text-right font-medium">Falta amanhã</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {d.degraus.map(g => (
                  <tr key={g.quartil} className={cn(d.faixaAtual?.quartil === g.quartil && 'bg-muted/30')}>
                    <td className="py-1.5"><SeloQuartil quartil={g.quartil} /> <span className="text-muted-foreground">≥ {g.minPct}%</span></td>
                    <td className="py-1.5 text-right font-mono tabular-nums">{g.alcancado ? 'alcançada' : formatBRL(g.falta)}</td>
                    <td className="py-1.5 text-right font-mono tabular-nums">
                      {g.faltaAmanha === null ? '—' : g.faltaAmanha === 0 ? 'mantida' : formatBRL(g.faltaAmanha)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* Pessoas por quartil + destaque */}
        <section className="rounded-xl border border-border/70 bg-card p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-foreground">Como está a equipe</h3>
          <p className="text-[11px] text-muted-foreground">
            {d.totalOperadores} {d.totalOperadores === 1 ? 'pessoa' : 'pessoas'} · {comMeta} com meta
            {d.semMeta > 0 && ` · ${d.semMeta} sem meta, fora da distribuição`}
            {` · média de ${formatBRL(d.mediaPorOperador)} por pessoa`}
          </p>
          <ul className="mt-3 space-y-2">
            {d.porQuartil.map(q => {
              const corQ = COR_QUARTIL[q.quartil] ?? COR_QUARTIL[4];
              const largura = comMeta ? (q.qtd / comMeta) * 100 : 0;
              return (
                <li key={q.quartil} className="text-xs">
                  <div className="flex items-center gap-2">
                    <SeloQuartil quartil={q.quartil} />
                    <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted/60">
                      <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${largura}%`, background: corQ }} />
                    </span>
                    <span className="w-20 shrink-0 whitespace-nowrap text-right font-mono tabular-nums">
                      {q.qtd} {q.qtd === 1 ? 'pessoa' : 'pessoas'}
                    </span>
                  </div>
                  {q.nomes.length > 0 && (
                    <p className="mt-0.5 truncate pl-9 text-[10px] text-muted-foreground" title={q.nomes.join(', ')}>
                      {q.nomes.join(', ')}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="mt-3 grid gap-2 border-t border-border/50 pt-3 sm:grid-cols-2">
            <div className="flex items-start gap-2 text-xs">
              <Star className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Operador destaque</p>
                <p className="truncate font-semibold text-foreground">{d.destaque && d.destaque.recebido > 0 ? d.destaque.nome : '—'}</p>
                {d.destaque && d.destaque.recebido > 0 && (
                  <p className="font-mono text-[11px] tabular-nums text-muted-foreground">{formatBRL(d.destaque.recebido)}</p>
                )}
              </div>
            </div>
            <div className="flex items-start gap-2 text-xs">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-500" />
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Mais longe do ritmo</p>
                <p className="truncate font-semibold text-foreground">{d.atencao?.nome ?? '—'}</p>
                {d.atencao && (
                  <p className="font-mono text-[11px] tabular-nums text-muted-foreground">{formatBRL(d.atencao.recebido)}</p>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Quartil de cada operador */}
      <section className="rounded-xl border border-border/70 bg-card p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-foreground">Operadores</h3>
        <p className="text-[11px] text-muted-foreground">
          Projeção de cada pessoa com os dias úteis da equipe — a mesma conta da aba Quartis do Painel Líder.
        </p>
        {e.operadores.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">Nenhum operador nesta equipe no mês.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[520px] text-xs">
              <thead>
                <tr className="border-b border-border/60 text-[10px] uppercase tracking-wide text-muted-foreground">
                  <th className="pb-1.5 text-left font-medium">Operador</th>
                  <th className="pb-1.5 text-right font-medium">Recebido</th>
                  <th className="pb-1.5 text-right font-medium">Meta</th>
                  <th className="pb-1.5 text-right font-medium">Projeção</th>
                  <th className="pb-1.5 text-center font-medium">Quartil</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {e.operadores.map(o => (
                  <tr key={o.id}>
                    <td className="py-1.5">
                      <span className="flex items-center gap-2">
                        <Avatar className="h-6 w-6 shrink-0 border border-border/60">
                          {o.fotoUrl && <AvatarImage src={o.fotoUrl} alt="" />}
                          <AvatarFallback className="bg-muted text-[9px] font-semibold text-muted-foreground">{iniciais(o.nome)}</AvatarFallback>
                        </Avatar>
                        <span className="truncate font-medium text-foreground">{o.nome}</span>
                        {d.destaque?.id === o.id && o.recebido > 0 && <Star className="h-3 w-3 shrink-0 text-amber-500" />}
                      </span>
                    </td>
                    <td className="py-1.5 text-right font-mono tabular-nums text-foreground">{formatBRL(o.recebido)}</td>
                    <td className="py-1.5 text-right font-mono tabular-nums text-muted-foreground">{o.meta !== null ? formatBRL(o.meta) : 'sem meta'}</td>
                    <td className="py-1.5 text-right font-mono font-semibold tabular-nums"
                        style={o.projecaoPct !== null ? { color: corProjecao(o.projecaoPct) } : undefined}>
                      {o.projecaoPct !== null ? `${pct1(o.projecaoPct)}%` : '—'}
                    </td>
                    <td className="py-1.5 text-center">{o.quartil !== null ? <SeloQuartil quartil={o.quartil} /> : <span className="text-muted-foreground">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* De onde vem: o 59 e o analítico, lado a lado quando divergem. */}
      <p className="flex flex-wrap items-center gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
        {valor59 !== null ? <Link2 className="h-3 w-3" /> : <Link2Off className="h-3 w-3" />}
        Números do analítico e das Metas, os mesmos do Painel Líder.
        {valor59 !== null
          ? <> No 59, os subgrupos ligados a esta equipe ({rotulos59.join(', ')}) somam <strong className="text-foreground">{formatBRL(valor59)}</strong>.</>
          : <> Nenhum subgrupo do 59 está vinculado a esta equipe.</>}
      </p>
    </motion.div>
  );
}

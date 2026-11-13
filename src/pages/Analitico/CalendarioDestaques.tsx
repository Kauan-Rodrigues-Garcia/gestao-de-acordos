// src/pages/Analitico/CalendarioDestaques.tsx
/**
 * Destaques do dia, desenhados como o mês que eles são.
 *
 * Até 25/10/2026 a aba empilhava os 30 dias, um card por linha, e o mês só
 * cabia rolando três telas. Agora é um calendário: cada dia mostra o maior
 * recebimento, o fundo esquenta com o valor, e clicar no dia abre embaixo a
 * lista completa (um destaque por equipe/subgrupo, quando há divisão).
 *
 * Em tela estreita sete colunas não cabem nome nenhum, então ali o calendário
 * vira lista — só dos dias que têm destaque.
 *
 * 13/11/2026: cada dia já mostra o ranking das equipes (o destaque de cada uma,
 * do maior para o menor) e a foto de cada pessoa — antes o dia mostrava um só
 * nome e um «+N equipes», e era preciso clicar para ver os outros.
 *
 * Os dados chegam prontos de `AnaliticoLider` (as duas RPCs de destaque); aqui
 * só se decide o desenho.
 */
import { useMemo, useState } from 'react';
import { Star } from 'lucide-react';
import { formatBRL } from '@/lib/money';
import { cn } from '@/lib/utils';
import type { DestaqueDiaAnalitico, DestaqueGrupoDia } from '@/services/analitico/analitico.service';

const SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

interface DestaqueDoDia {
  chave: string;
  operadorId: string;
  nome: string;
  grupo: string | null;
  valor: number;
  pagamentos: number;
}

interface CalendarioDestaquesProps {
  mes: string;            // 'yyyy-MM'
  diasNoMes: number;
  hojeISO: string;
  /** O dia da lente Dia, quando é ela que está ligada. */
  diaDaLente: string | null;
  porGrupo: Map<string, DestaqueGrupoDia[]>;
  unico: Map<string, DestaqueDiaAnalitico>;
  usarGrupos: boolean;
  /** operador_id → foto_url; ausente = iniciais. */
  fotos?: Record<string, string | null>;
}

/** Quantos destaques cabem dentro do quadradinho do dia; o resto vira «+N». */
const NO_QUADRO = 4;

const compacto = new Intl.NumberFormat('pt-BR', {
  style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1,
});

function iniciaisDe(nome: string): string {
  const p = nome.trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase() || '?';
}

/** A foto redonda, ou as iniciais. */
function Avatar({ nome, foto, className }: { nome: string; foto: string | null | undefined; className: string }) {
  return foto ? (
    <img src={foto} alt="" loading="lazy" className={cn('shrink-0 rounded-full object-cover', className)} />
  ) : (
    <span aria-hidden="true" className={cn('flex shrink-0 items-center justify-center rounded-full bg-muted font-semibold text-muted-foreground', className)}>
      {iniciaisDe(nome)}
    </span>
  );
}

function primeiroNome(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  return partes.length > 1 ? `${partes[0]} ${partes[partes.length - 1][0]}.` : partes[0];
}

export function CalendarioDestaques({
  mes, diasNoMes, hojeISO, diaDaLente, porGrupo, unico, usarGrupos, fotos = {},
}: CalendarioDestaquesProps) {
  const dias = useMemo(() => Array.from({ length: diasNoMes }, (_, i) => {
    const dia = `${mes}-${String(i + 1).padStart(2, '0')}`;
    const lista: DestaqueDoDia[] = usarGrupos
      ? (porGrupo.get(dia) ?? []).map(g => ({
          chave: `${g.grupo_id ?? 'sem'}-${g.operador_id}`,
          operadorId: g.operador_id,
          nome: g.operador_nome ?? g.operador_usuario,
          grupo: g.grupo_nome ?? 'sem equipe',
          valor: g.total_recebido,
          pagamentos: g.total_pagamentos,
        })).sort((a, b) => b.valor - a.valor)
      : [];
    const u = unico.get(dia);
    if (lista.length === 0 && u) {
      lista.push({
        chave: u.operador_id, operadorId: u.operador_id, nome: u.operador_nome ?? u.operador_usuario, grupo: null,
        valor: u.total_recebido, pagamentos: u.total_pagamentos,
      });
    }
    return { dia, n: i + 1, futuro: dia > hojeISO, lista };
  }), [mes, diasNoMes, hojeISO, porGrupo, unico, usarGrupos]);

  const maior = dias.reduce((m, d) => Math.max(m, d.lista[0]?.valor ?? 0), 0);
  const ultimoComDado = [...dias].reverse().find(d => d.lista.length > 0)?.dia ?? null;
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const diaAberto = escolhido ?? diaDaLente ?? ultimoComDado;
  const aberto = dias.find(d => d.dia === diaAberto) ?? null;
  const vazios = new Date(`${mes}-01T12:00:00`).getDay();

  if (!ultimoComDado) {
    return (
      <div className="rounded-xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
        Nenhum recebimento neste mês ainda.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* ── Calendário (sm+) ─────────────────────────────────────────────── */}
      <div className="hidden overflow-hidden rounded-xl border border-border bg-card sm:block">
        <div className="grid grid-cols-7 border-b border-border bg-muted/40">
          {SEMANA.map(s => (
            <div key={s} className="px-2 py-1.5 text-center text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">{s}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {Array.from({ length: vazios }).map((_, i) => (
            <div key={`v${i}`} className="min-h-[88px] border-b border-r border-border/60 bg-muted/20" />
          ))}
          {dias.map(d => {
            const top = d.lista[0];
            const calor = top && maior > 0 ? 0.04 + (top.valor / maior) * 0.3 : 0;
            const ativo = d.dia === diaAberto;
            return (
              <button key={d.dia} type="button"
                disabled={d.lista.length === 0}
                aria-pressed={ativo}
                aria-label={top
                  ? `${d.n}: ${d.lista.map((x, i) => `${i + 1}º ${x.nome}, ${formatBRL(x.valor)}`).join('; ')}`
                  : `${d.n}: sem recebimentos`}
                onClick={() => setEscolhido(d.dia)}
                className={cn(
                  'relative flex min-h-[88px] min-w-0 flex-col items-stretch gap-1 border-b border-r border-border/60 p-2 text-left transition-colors',
                  'focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                  d.lista.length > 0 ? 'cursor-pointer hover:brightness-[0.97] dark:hover:brightness-110' : 'cursor-default',
                  d.futuro && 'opacity-45',
                  ativo && 'ring-2 ring-inset ring-primary',
                )}
                style={calor ? { background: `color-mix(in oklch, var(--primary) ${Math.round(calor * 100)}%, var(--card))` } : undefined}
              >
                <span className={cn(
                  'font-mono text-xs font-bold tabular-nums',
                  d.dia === hojeISO ? 'text-primary' : 'text-foreground/70',
                )}>
                  {String(d.n).padStart(2, '0')}
                </span>
                {top && (
                  // O ranking das equipes no próprio dia: o 1º maior, os outros embaixo.
                  <span className="mt-auto min-w-0 space-y-0.5">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <Avatar nome={top.nome} foto={fotos[top.operadorId]} className="h-6 w-6 text-[9px] ring-2 ring-amber-400/70" />
                      <span className="min-w-0">
                        <span className="flex min-w-0 items-center gap-0.5 text-[11px] font-semibold leading-tight text-foreground">
                          <Star className="h-2.5 w-2.5 shrink-0 fill-amber-400 text-amber-600" aria-hidden="true" />
                          <span className="truncate">{primeiroNome(top.nome)}</span>
                        </span>
                        <span className="block truncate font-mono text-[11px] font-semibold tabular-nums text-primary">
                          {d.lista.length > 1 ? compacto.format(top.valor) : formatBRL(top.valor)}
                        </span>
                      </span>
                    </span>
                    {d.lista.slice(1, NO_QUADRO).map((x, i) => (
                      <span key={x.chave} className="flex min-w-0 items-center gap-1 text-[10px] leading-tight text-muted-foreground"
                        title={`${i + 2}º ${x.nome}${x.grupo ? ` · ${x.grupo}` : ''} · ${formatBRL(x.valor)}`}>
                        <span className="w-2.5 shrink-0 text-right font-mono tabular-nums">{i + 2}</span>
                        <Avatar nome={x.nome} foto={fotos[x.operadorId]} className="h-4 w-4 text-[7px]" />
                        <span className="min-w-0 flex-1 truncate">{primeiroNome(x.nome)}</span>
                        <span className="shrink-0 font-mono tabular-nums">{compacto.format(x.valor)}</span>
                      </span>
                    ))}
                    {d.lista.length > NO_QUADRO && (
                      <span className="block text-[10px] text-muted-foreground">+{d.lista.length - NO_QUADRO} equipe{d.lista.length - NO_QUADRO > 1 ? 's' : ''}</span>
                    )}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Lista (celular): só os dias com destaque, o detalhe embaixo do
          dia tocado — no fim da lista ele ficaria a vinte linhas de distância. */}
      <ul className="space-y-1.5 sm:hidden">
        {dias.filter(d => d.lista.length > 0).reverse().map(d => (
          <li key={d.dia} className="space-y-1.5">
            <button type="button" onClick={() => setEscolhido(d.dia)} aria-pressed={d.dia === diaAberto}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left',
                d.dia === diaAberto ? 'border-primary/50 bg-primary/5' : 'border-border bg-card',
              )}>
              <span className="w-8 shrink-0 text-center">
                <span className="block font-mono text-base font-bold leading-none">{String(d.n).padStart(2, '0')}</span>
                <span className="text-[10px] text-muted-foreground">{SEMANA[new Date(d.dia + 'T12:00:00').getDay()]}</span>
              </span>
              <Avatar nome={d.lista[0].nome} foto={fotos[d.lista[0].operadorId]} className="h-8 w-8 text-[10px]" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{d.lista[0].nome}</span>
                {d.lista.length > 1 && (
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {d.lista.slice(1).map(x => primeiroNome(x.nome)).join(' · ')}
                  </span>
                )}
              </span>
              <span className="shrink-0 font-mono text-sm font-bold text-primary">{formatBRL(d.lista[0].valor)}</span>
            </button>
            {d.dia === diaAberto && d.lista.length > 1 && <DetalheDoDia dia={d.dia} lista={d.lista} fotos={fotos} />}
          </li>
        ))}
      </ul>

      {/* ── O dia aberto (sm+) ────────────────────────────────────────────── */}
      {aberto && aberto.lista.length > 0 && (
        <div className="hidden sm:block"><DetalheDoDia dia={aberto.dia} lista={aberto.lista} fotos={fotos} /></div>
      )}
    </div>
  );
}

function DetalheDoDia({ dia, lista, fotos }: { dia: string; lista: DestaqueDoDia[]; fotos: Record<string, string | null> }) {
  return (
        <section aria-label={`Destaques de ${dia.slice(8)}`} className="rounded-xl border border-border bg-card">
          <header className="flex items-baseline justify-between gap-2 border-b border-border px-4 py-2.5">
            <h3 className="text-sm font-semibold first-letter:uppercase">
              {new Date(dia + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
            </h3>
            <span className="text-xs text-muted-foreground">
              {lista.length > 1 ? `${lista.length} equipes` : 'destaque do dia'}
            </span>
          </header>
          <ol className="divide-y divide-border">
            {lista.map((x, i) => (
              <li key={x.chave} className="flex items-center gap-3 px-4 py-2">
                <span className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-bold',
                  i === 0 ? 'bg-amber-400/20 text-amber-700 dark:text-amber-400' : 'bg-muted text-muted-foreground',
                )}>{i + 1}</span>
                <Avatar nome={x.nome} foto={fotos[x.operadorId]}
                  className={cn('h-9 w-9 text-[11px]', i === 0 && 'ring-2 ring-amber-400/70')} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{x.nome}</span>
                  {x.grupo && <span className="block truncate text-xs text-muted-foreground">{x.grupo}</span>}
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-mono text-sm font-bold text-primary">{formatBRL(x.valor)}</span>
                  <span className="text-[11px] text-muted-foreground">{x.pagamentos} pgto{x.pagamentos !== 1 ? 's' : ''}.</span>
                </span>
              </li>
            ))}
          </ol>
        </section>
  );
}

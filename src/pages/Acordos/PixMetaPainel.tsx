/**
 * PixMetaPainel.tsx — meta de Pix automático, equipe a equipe.
 *
 * Responde ao líder, para cada equipe do setor: quanto já fez de Pix no mês,
 * quanto falta e se está no ritmo (projeção). No topo, o total do setor.
 *
 * ## A meta do setor não é digitada
 *
 * Ela é a SOMA das metas das equipes — Bryan, Luciana, Matheus. Guardar também
 * um total do setor criaria dois lugares para a mesma verdade, e um deles
 * ficaria velho na primeira alteração.
 *
 * ## Por que não é a meta de recebimento
 *
 * O valor do Pix automático já entra no recebimento pelo analítico, que é quem
 * faz esse papel. Somar de novo numa meta de recebimento contaria o mesmo
 * dinheiro duas vezes. Esta meta é só do Pix: existe para acompanhar o Pix em
 * si, e por isso mora em tabela própria (`pix_automatico_metas`).
 *
 * Só líder+ vê. Não é segredo — é que o operador enxerga apenas os próprios
 * acordos (RLS), e "faltam X para a equipe" calculado com as linhas de uma
 * pessoa só seria um número errado apresentado como certo.
 *
 * ## O desenho (16/10/2026)
 *
 * Era uma lista de linhas com uma barra fina no fim de cada uma, e o total do
 * setor numa última linha cinza — o número mais importante no lugar menos
 * visto. Agora o setor abre o painel: um anel com o % da meta, e ao lado os
 * quatro números que o líder procura (realizado, meta, falta, ritmo). As
 * equipes viram cartões, cada um com a sua barra, o «faltam» e a projeção numa
 * pílula da cor do ritmo — verde no ritmo, vermelho longe dele, a mesma régua
 * de `corProjecao` que o dashboard usa.
 *
 * A equipe sem meta continua mostrando o que produziu (ver o caso «Bryan»,
 * abaixo), agora com o atalho «Definir meta» para quem pode editar.
 *
 * As contas ficam em `calcularMetaPixPorEquipe` (pura, com teste). A projeção
 * usa a mesma mecânica de dias úteis do dashboard, para os dois não discordarem.
 */
import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Target, TrendingUp, CheckCircle2, Save, RefreshCw, Pencil, X, Plus, Layers,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { formatCurrency } from '@/lib/index';
import { corProjecao } from '@/lib/diasUteis';
import { cn } from '@/lib/utils';
import type { ConsolidadoMetaPix, ResumoMetaPix } from './pixAutomaticoView';
import { corTexto } from '@/lib/temas';

export interface EquipeOpcao { id: string; nome: string }

export interface PixMetaPainelProps {
  consolidado: ConsolidadoMetaPix | null;
  nomeSetor?: string;
  /** Equipes do setor — inclusive as que ainda não têm meta. */
  equipes: EquipeOpcao[];
  /** Metas salvas: equipe_id → { valor, acordos }, para preencher a edição. */
  metasAtuais: Record<string, { valor: number; acordos: number }>;
  podeEditar: boolean;
  salvando: boolean;
  onSalvar: (equipeId: string, metaValor: number, metaAcordos: number) => void;
  /** Converte "1.234,56" digitado em número — o mesmo parser do resto da tela. */
  parseValor: (v: string) => number;
}

/** O anel do setor: % da meta no meio, a cor é a do ritmo. */
function Anel({ pct, cor, batida }: { pct: number; cor: string; batida: boolean }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const cheio = Math.min(Math.max(pct, 0), 100) / 100;
  return (
    <div className="relative h-[88px] w-[88px] shrink-0">
      <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" strokeWidth="8" className="stroke-muted" />
        <circle
          cx="40" cy="40" r={r} fill="none" strokeWidth="8" strokeLinecap="round"
          stroke={batida ? 'var(--success)' : cor}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - cheio)}
          style={{ transition: 'stroke-dashoffset 700ms ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {batida
          ? <CheckCircle2 className="h-5 w-5 text-success" />
          : <span className="font-mono text-lg font-bold tabular-nums leading-none text-foreground">{pct}%</span>}
        <span className="mt-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">
          {batida ? 'batida' : 'da meta'}
        </span>
      </div>
    </div>
  );
}

/** A pílula do ritmo: «no ritmo» × «abaixo do ritmo», na cor da projeção. */
function Ritmo({ r }: { r: ResumoMetaPix }) {
  const cor = corProjecao(r.projecao);
  if (r.metaBatida) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-[10.5px] font-semibold text-success">
        <CheckCircle2 className="h-3 w-3" /> Meta batida
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-semibold tabular-nums"
      style={{ color: corTexto(cor), borderColor: `${cor}66`, background: `${cor}1a` }}
      title="Projeção: o realizado sobre o esperado até hoje, em dias úteis. 100% = no ritmo de bater."
    >
      <TrendingUp className="h-3 w-3" /> {r.projecao}% do ritmo
    </span>
  );
}

/** Um número do cabeçalho do setor. */
function Numero({ rotulo, children, cls }: { rotulo: string; children: React.ReactNode; cls?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground leading-none">{rotulo}</p>
      <p className={cn('mt-1 truncate font-mono text-[15px] font-bold tabular-nums leading-tight text-foreground', cls)}>
        {children}
      </p>
    </div>
  );
}

export function PixMetaPainel({
  consolidado, nomeSetor, equipes, metasAtuais,
  podeEditar, salvando, onSalvar, parseValor,
}: PixMetaPainelProps) {
  const [editandoEquipe, setEditandoEquipe] = useState<string | null>(null);
  const [valorInput, setValorInput]     = useState('');
  const [acordosInput, setAcordosInput] = useState('');

  /**
   * Abrir a edição parte do que está SALVO — não do que ficou digitado numa
   * tentativa anterior, que já não é mais verdade. Feito aqui, no clique, e não
   * num efeito: efeito reagiria também à meta chegando do banco e apagaria o
   * que o líder está digitando no meio da frase.
   */
  function abrir(equipeId: string) {
    const atual = metasAtuais[equipeId];
    setEditandoEquipe(equipeId);
    setValorInput(atual?.valor
      ? atual.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : '');
    setAcordosInput(atual?.acordos ? String(atual.acordos) : '');
  }

  function salvar(equipeId: string) {
    const valor   = valorInput.trim()   ? parseValor(valorInput) : 0;
    const acordos = acordosInput.trim() ? parseInt(acordosInput.replace(/\D/g, ''), 10) : 0;
    if (isNaN(valor) || valor < 0)     return;
    if (isNaN(acordos) || acordos < 0) return;
    onSalvar(equipeId, valor, Number.isFinite(acordos) ? acordos : 0);
    setEditandoEquipe(null);
  }

  const porEquipe = new Map((consolidado?.equipes ?? []).map(e => [e.equipeId, e.resumo]));
  const setor = consolidado?.setor ?? null;
  const corSetor = setor ? corProjecao(setor.projecao) : 'var(--primary)';

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <Card className="overflow-hidden border-border">
        {/* ── O setor: o anel e os quatro números ─────────────────────────── */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-4 px-5 py-4">
          <div className="flex min-w-0 items-center gap-4">
            {setor ? (
              <Anel pct={setor.pctValor} cor={corSetor} batida={setor.metaBatida} />
            ) : (
              <span className="flex h-[88px] w-[88px] shrink-0 items-center justify-center rounded-full border-[8px] border-muted">
                <Target className="h-6 w-6 text-muted-foreground/50" />
              </span>
            )}
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <Target className="h-3.5 w-3.5" /> Meta de Pix do setor
              </p>
              <h3 className="mt-0.5 truncate text-base font-bold text-foreground">{nomeSetor ?? 'Setor'}</h3>
              {setor ? (
                <div className="mt-1.5"><Ritmo r={setor} /></div>
              ) : (
                <p className="mt-1 max-w-xs text-[11px] text-muted-foreground">
                  Nenhuma equipe com meta de Pix neste mês. A meta do setor é a soma das metas das equipes.
                </p>
              )}
            </div>
          </div>

          {setor && (
            <div className="grid min-w-0 flex-1 grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
              <Numero rotulo="Realizado" cls="text-primary">
                {formatCurrency(setor.realizado)}
              </Numero>
              <Numero rotulo="Meta">{formatCurrency(setor.metaValor)}</Numero>
              <Numero rotulo="Falta" cls={setor.faltaValor > 0 ? undefined : 'text-success'}>
                {setor.faltaValor > 0 ? formatCurrency(setor.faltaValor) : 'nada'}
              </Numero>
              <Numero rotulo="Acordos">
                <span className="font-sans">
                  {setor.acordos}
                  {setor.metaAcordos > 0 && <span className="text-muted-foreground font-normal"> / {setor.metaAcordos}</span>}
                </span>
              </Numero>
            </div>
          )}
        </div>

        {/* ── As equipes ──────────────────────────────────────────────────── */}
        <div className="border-t border-border p-4">
          {equipes.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">Nenhuma equipe neste setor.</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {equipes.map(eq => {
                const r = porEquipe.get(eq.id) ?? null;
                // O que a equipe produziu, tenha meta ou não. Ver
                // `realizadoPorEquipe` em `calcularMetaPixPorEquipe`.
                const realizadoDaEquipe = consolidado?.realizadoPorEquipe?.[eq.id] ?? null;
                const emEdicao = editandoEquipe === eq.id;
                const cor = r ? (r.metaBatida ? 'var(--success)' : corProjecao(r.projecao)) : undefined;

                return (
                  <div
                    key={eq.id}
                    className={cn(
                      'flex flex-col gap-2.5 rounded-xl border p-3.5 transition-colors',
                      r?.metaBatida
                        ? 'border-success/25 bg-success/[0.03]'
                        : r ? 'border-border bg-card' : 'border-dashed border-border bg-muted/20',
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted">
                        <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-foreground">{eq.nome}</span>
                      {podeEditar && !emEdicao && (
                        <button
                          type="button"
                          title={r ? 'Editar a meta desta equipe' : 'Definir a meta desta equipe'}
                          aria-label={r ? `Editar a meta de ${eq.nome}` : `Definir a meta de ${eq.nome}`}
                          onClick={() => abrir(eq.id)}
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>

                    {emEdicao ? (
                      <div className="space-y-2">
                        <div className="grid grid-cols-[1fr_88px] gap-2">
                          <div className="space-y-1">
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Meta em R$</p>
                            <Input
                              value={valorInput}
                              onChange={e => setValorInput(e.target.value)}
                              placeholder="0,00"
                              className="h-8 font-mono text-xs"
                              autoFocus
                              onKeyDown={e => { if (e.key === 'Enter') salvar(eq.id); }}
                            />
                          </div>
                          <div className="space-y-1">
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Acordos</p>
                            <Input
                              value={acordosInput}
                              onChange={e => setAcordosInput(e.target.value.replace(/\D/g, ''))}
                              placeholder="Qtd."
                              inputMode="numeric"
                              className="h-8 font-mono text-xs"
                              onKeyDown={e => { if (e.key === 'Enter') salvar(eq.id); }}
                            />
                          </div>
                        </div>
                        <div className="flex items-center justify-end gap-1.5">
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs"
                            onClick={() => setEditandoEquipe(null)}>
                            <X className="h-3.5 w-3.5" /> Cancelar
                          </Button>
                          <Button size="sm" className="h-7 gap-1 text-xs" disabled={salvando}
                            onClick={() => salvar(eq.id)}>
                            {salvando ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                            Salvar
                          </Button>
                        </div>
                      </div>
                    ) : r ? (
                      <>
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="font-mono text-[15px] font-bold tabular-nums text-foreground">
                            {formatCurrency(r.realizado)}
                          </span>
                          <span className="truncate text-[11px] tabular-nums text-muted-foreground">
                            de {formatCurrency(r.metaValor)}
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{ width: `${Math.min(r.pctValor, 100)}%`, background: cor }}
                          />
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
                          <span className="text-[11px] tabular-nums text-muted-foreground">
                            <strong className="text-foreground">{r.pctValor}%</strong>
                            {r.faltaValor > 0 && <> · faltam {formatCurrency(r.faltaValor)}</>}
                            {r.metaAcordos > 0 && <> · {r.acordos}/{r.metaAcordos} acordos</>}
                          </span>
                          <Ritmo r={r} />
                        </div>
                      </>
                    ) : (
                      /*
                        Sem meta, mas COM produção: mostra o realizado.

                        Antes esta linha dizia só «sem meta definida», e o
                        dinheiro da equipe não aparecia em lugar nenhum da
                        tela — nem aqui, nem numa linha própria. Em agosto de
                        2026 isso escondeu R$ 1.862.936,40 da equipe «Bryan»,
                        que produziu o mês inteiro e foi dividida em setembro,
                        ficando de fora das metas lançadas depois.
                      */
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[11px] tabular-nums text-muted-foreground">
                          {realizadoDaEquipe && realizadoDaEquipe.acordos > 0 ? (
                            <>
                              <strong className="font-mono text-[13px] text-foreground">
                                {formatCurrency(realizadoDaEquipe.realizado)}
                              </strong>
                              {' '}em {realizadoDaEquipe.acordos}{' '}
                              {realizadoDaEquipe.acordos === 1 ? 'acordo' : 'acordos'} · sem meta
                            </>
                          ) : 'Sem meta definida'}
                        </span>
                        {podeEditar && (
                          <button
                            type="button"
                            onClick={() => abrir(eq.id)}
                            className="inline-flex h-7 items-center gap-1 rounded-md border border-input bg-background px-2.5 text-[11px] font-medium text-foreground shadow-sm transition-colors hover:bg-accent"
                          >
                            <Plus className="h-3 w-3" /> Definir meta
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Card>
    </motion.div>
  );
}

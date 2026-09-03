/**
 * RankingView — pódio do ranking do Analítico.
 *
 * Top 3 em pódio, 4º–10º em lista com barra de progresso e demais (11+)
 * em lista compacta. Usado tanto na visão do líder quanto na do operador.
 *
 * `destaqueOperadorId` (opcional): destaca a linha/card do operador atual,
 * útil na visão do operador para ele se localizar no ranking.
 *
 * ## Os três critérios
 *
 * `recebimento` é o histórico, e é o que a tela faz quando ninguém passa
 * `criterio` — as duas chamadas antigas continuam valendo sem mudança.
 *
 * `percentual` troca a régua: a posição sai do percentual da meta, e o número
 * grande do card passa a ser ele. O valor recebido continua na tela, menor,
 * porque tirar o dinheiro da vista do ranking gera a pergunta "então quanto
 * ele fez?" em toda conversa sobre o pódio.
 *
 * `equipes` troca o SUJEITO: o pódio é de equipes e subgrupos somados. Nesse
 * modo a lista de pessoas continua embaixo, como detalhamento — quem olha o
 * placar de times ainda quer saber quem puxou.
 *
 * A ordenação não acontece aqui. Ela mora em `rankingCriterio.ts`, que é puro
 * e testado; esta tela recebe as listas já na ordem e só desenha.
 */

import { Copy } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { formatBRL } from '@/lib/money';
import { copiarTexto } from '@/lib/clipboard';
import { cn } from '@/lib/utils';
import type { ResumoOperadorAnalitico } from '@/services/analitico/analitico.service';
import type { CriterioRanking } from '@/services/analitico/rankingConfig.service';
import type { LinhaRanking, LinhaGrupoRanking } from './rankingCriterio';

interface RankingViewProps {
  /**
   * As linhas do ranking, JÁ ORDENADAS.
   *
   * O tipo aceita `ResumoOperadorAnalitico` puro porque as chamadas que não
   * configuram critério nenhum (a visão do operador, por exemplo) passam o
   * resumo cru — `pct` e `grupoNome` chegam como `undefined` e a tela cai no
   * desenho de sempre.
   */
  resumos: (ResumoOperadorAnalitico | LinhaRanking)[];
  destaqueOperadorId?: string | null;
  /** Exibe o botão "Copiar mensagem" em cada posição (visão líder+). */
  mostrarCopiar?: boolean;
  /** Item 5: ids que somem do ranking (férias/desligado). O recebimento deles
   *  continua nos totais — o filtro é só de exibição. */
  operadoresOcultos?: Set<string>;
  /** Régua da posição. Ausente = `recebimento`, o comportamento histórico. */
  criterio?: CriterioRanking;
  /** Pódio de equipes/subgrupos. Só desenhado quando `criterio` é `equipes`. */
  grupos?: LinhaGrupoRanking[];
}

/** A linha com os campos opcionais do ranking configurável já resolvidos. */
type Linha = ResumoOperadorAnalitico & Partial<Pick<LinhaRanking, 'pct' | 'grupoNome'>>;

/** Nome completo do operador reduzido ao primeiro e segundo nome. */
function primeiroSegundoNome(r: Linha): string {
  const base = (r.operador_nome ?? r.operador_usuario ?? '').trim();
  return base.split(/\s+/).slice(0, 2).join(' ');
}

/** Saudação conforme o horário: manhã, tarde ou noite. */
function saudacao(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

/**
 * Mensagem motivacional do ranking (mesmo formato do protótipo HTML).
 *
 * No critério de percentual a mensagem fala de percentual: mandar "faltam
 * R$ X para ultrapassar" para alguém cuja posição é decidida por porcentagem
 * manda a pessoa correr atrás do número errado.
 */
function montarMensagemRanking(
  pos: number, nome: string, r: Linha,
  acima: Linha | null, criterio: CriterioRanking,
): string {
  const ola = saudacao();
  const porPct = criterio === 'percentual' && r.pct != null;
  const meu = porPct ? `${r.pct}% da meta` : `${formatBRL(r.total_recebido)} de recebido geral`;

  if (pos === 1) {
    return `${ola}, ${nome}! Você está em 1º lugar, com ${meu}. Continue nesse ritmo para manter a liderança.`;
  }

  const sufixo = pos === 2 ? 'para assumir a liderança' : 'para ultrapassar o próximo lugar';
  const nomeAcima = acima ? primeiroSegundoNome(acima) : '';

  if (porPct && acima?.pct != null) {
    const falta = Math.max(0, acima.pct - (r.pct ?? 0));
    return `${ola}, ${nome}! Você está em ${pos}º lugar, com ${meu}. À sua frente está ${nomeAcima}, e faltam ${falta} pontos percentuais ${sufixo}.`;
  }

  const gap = acima ? acima.total_recebido - r.total_recebido : 0;
  return `${ola}, ${nome}! Você está em ${pos}º lugar, com ${meu}. À sua frente está ${nomeAcima}, e faltam ${formatBRL(gap)} ${sufixo}.`;
}

function CopiarMsgBtn({
  pos, r, acima, criterio, className,
}: {
  pos: number;
  r: Linha;
  acima: Linha | null;
  criterio: CriterioRanking;
  className?: string;
}) {
  const msg = montarMensagemRanking(pos, primeiroSegundoNome(r), r, acima, criterio);
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); void copiarTexto(msg, 'Mensagem copiada'); }}
      className={cn(
        'inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground',
        'hover:text-foreground hover:bg-muted/60 border border-border rounded-md px-2 py-1 transition-colors',
        className,
      )}
    >
      <Copy className="w-3 h-3 shrink-0" /> Copiar mensagem
    </button>
  );
}

const PODIO_STYLE = [
  {
    border: 'border-yellow-400/60', bg: 'bg-yellow-50/60 dark:bg-yellow-950/20',
    medal: '🥇', text: 'text-yellow-700 dark:text-yellow-400',
  },
  {
    border: 'border-slate-400/60',  bg: 'bg-slate-50/60 dark:bg-slate-900/20',
    medal: '🥈', text: 'text-slate-600 dark:text-slate-400',
  },
  {
    border: 'border-amber-700/40',  bg: 'bg-orange-50/40 dark:bg-orange-950/10',
    medal: '🥉', text: 'text-amber-700 dark:text-amber-500',
  },
];

/**
 * Pódio de equipes e subgrupos.
 *
 * Sem "faltam R$ X para ultrapassar": entre times a distância é responsabilidade
 * coletiva, e a frase individual empurra a leitura para culpar uma pessoa pelo
 * gap do grupo inteiro.
 */
function PodioGrupos({ grupos, criterio }: { grupos: LinhaGrupoRanking[]; criterio: CriterioRanking }) {
  if (grupos.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        Nenhuma equipe com recebimento neste mês.
      </p>
    );
  }

  const porPct = criterio === 'percentual';
  const max = (porPct
    ? grupos.find(g => g.pct != null)?.pct ?? 0
    : grupos[0]?.totalRecebido) || 1;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {grupos.slice(0, 3).map((g, i) => {
          const s = PODIO_STYLE[i];
          return (
            <Card key={g.grupoId ?? '__sem_grupo__'} className={cn('border-2', s.border, s.bg)}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-2xl">{s.medal}</span>
                  <Badge variant="outline" className={cn('text-xs font-bold', s.text)}>
                    {i + 1}º lugar
                  </Badge>
                </div>
                <p className="font-bold text-sm leading-tight">{g.grupoNome}</p>
                <div>
                  {porPct && g.pct != null ? (
                    <>
                      <p className="text-lg font-bold text-primary font-mono">{g.pct}%</p>
                      <p className="text-xs text-muted-foreground font-mono">{formatBRL(g.totalRecebido)}</p>
                    </>
                  ) : (
                    <p className="text-lg font-bold text-primary font-mono">{formatBRL(g.totalRecebido)}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {g.operadores} {g.operadores === 1 ? 'pessoa' : 'pessoas'} · {g.totalPagamentos} pgtos.
                  </p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {grupos.length > 3 && (
        <Card className="border-border">
          <CardContent className="p-0">
            {grupos.slice(3).map((g, i) => {
              const base = porPct ? (g.pct ?? 0) : g.totalRecebido;
              const w = Math.max(4, Math.round((base / max) * 100));
              return (
                <div key={g.grupoId ?? `__sem_grupo__${i}`} className={cn(
                  'flex items-center gap-3 px-3 py-2.5 hover:bg-muted/30 transition-colors',
                  i > 0 && 'border-t border-border',
                )}>
                  <span className="text-sm font-bold text-muted-foreground w-6 text-right shrink-0">{i + 4}º</span>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium truncate">{g.grupoNome}</span>
                    <div className="mt-1 h-1 rounded-full bg-border overflow-hidden">
                      <div className="h-full rounded-full bg-primary/40" style={{ width: `${Math.min(100, w)}%` }} />
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-mono font-bold text-primary">
                      {porPct && g.pct != null ? `${g.pct}%` : formatBRL(g.totalRecebido)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {porPct ? formatBRL(g.totalRecebido) : `${g.totalPagamentos} pgtos.`}
                    </p>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export function RankingView({
  resumos, destaqueOperadorId, mostrarCopiar, operadoresOcultos,
  criterio = 'recebimento', grupos,
}: RankingViewProps) {
  // Item 5: férias/desligado saem do ranking (o recebimento deles segue nos totais).
  const todas = resumos as Linha[];
  const lista = operadoresOcultos ? todas.filter(r => !operadoresOcultos.has(r.operador_id)) : todas;

  const porPct = criterio === 'percentual';

  /**
   * Base da barra de progresso.
   *
   * No percentual não é `lista[0].pct` direto: o primeiro da lista pode estar
   * sem meta quando NINGUÉM tem meta, e aí a barra dividiria por `null`.
   */
  const max = (porPct
    ? lista.find(r => r.pct != null)?.pct ?? 0
    : lista[0]?.total_recebido) || 1;

  /** O número grande de cada posição, na régua do critério. */
  const destaqueValor = (r: Linha) =>
    porPct && r.pct != null ? `${r.pct}%` : formatBRL(r.total_recebido);

  /** A legenda logo abaixo dele. */
  const legendaValor = (r: Linha) =>
    porPct
      ? (r.pct != null ? formatBRL(r.total_recebido) : 'sem meta definida')
      : `${r.total_pagamentos} pagamentos`;

  const top3  = lista.slice(0, 3);
  const meio  = lista.slice(3, 10);
  const resto = lista.slice(10);

  const ehVoce = (id: string) => !!destaqueOperadorId && id === destaqueOperadorId;

  // Critério de equipes: o pódio é dos grupos, e as pessoas viram detalhamento.
  if (criterio === 'equipes' && grupos) {
    return (
      <div className="space-y-5">
        <PodioGrupos grupos={grupos} criterio={criterio} />
        {lista.length > 0 && (
          <>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">
              Quem puxou o resultado
            </p>
            <Card className="border-border">
              <CardContent className="p-0">
                {lista.slice(0, 20).map((r, i) => (
                  <div key={r.operador_id} className={cn(
                    'flex items-center gap-3 px-3 py-2 text-xs transition-colors',
                    ehVoce(r.operador_id) ? 'bg-primary/10' : 'hover:bg-muted/20',
                    i > 0 && 'border-t border-border',
                  )}>
                    <span className="font-bold text-muted-foreground w-8 text-right shrink-0">{i + 1}º</span>
                    <span className="flex-1 truncate font-medium">{r.operador_nome ?? r.operador_usuario}</span>
                    {r.grupoNome && (
                      <span className="text-muted-foreground truncate max-w-[120px] shrink-0">{r.grupoNome}</span>
                    )}
                    <span className="font-mono font-semibold text-primary shrink-0">{formatBRL(r.total_recebido)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Pódio — top 3 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {top3.map((r, i) => {
          const acima = i > 0 ? lista[i - 1] : null;
          // No percentual a distância também é em pontos percentuais: mostrar
          // reais aqui contradiria a régua que decidiu a posição.
          const gap = !acima
            ? 0
            : porPct && acima.pct != null && r.pct != null
              ? Math.max(0, acima.pct - r.pct)
              : acima.total_recebido - r.total_recebido;
          const baseAcima = porPct ? (acima?.pct ?? 0) : (acima?.total_recebido ?? 0);
          const baseMinha = porPct ? (r.pct ?? 0) : r.total_recebido;
          const prox = acima && baseAcima > 0
            ? Math.min(100, Math.round((baseMinha / baseAcima) * 100))
            : 100;
          const s = PODIO_STYLE[i];
          const voce = ehVoce(r.operador_id);
          return (
            <Card key={r.operador_id} className={cn('border-2', s.border, s.bg, voce && 'ring-2 ring-primary ring-offset-1')}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-2xl">{s.medal}</span>
                  <Badge variant="outline" className={cn('text-xs font-bold', s.text)}>
                    {i + 1}º lugar
                  </Badge>
                </div>
                <div>
                  <p className="font-bold text-sm leading-tight flex items-center gap-1.5">
                    {r.operador_nome ?? r.operador_usuario}
                    {voce && <span className="text-[10px] font-bold uppercase text-primary bg-primary/10 rounded-full px-1.5 py-0.5">Você</span>}
                  </p>
                  <p className="text-xs text-muted-foreground font-mono">
                    {r.grupoNome ?? r.operador_usuario}
                  </p>
                </div>
                <div>
                  <p className="text-lg font-bold text-primary font-mono">{destaqueValor(r)}</p>
                  <p className="text-xs text-muted-foreground">{legendaValor(r)}</p>
                </div>
                {i === 0 ? (
                  <p className="text-xs font-medium text-yellow-600 dark:text-yellow-400">★ Líder do ranking</p>
                ) : gap > 0 ? (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                      Faltam <strong>{porPct ? `${gap} p.p.` : formatBRL(gap)}</strong> p/ ultrapassar
                    </p>
                    <div className="h-1.5 rounded-full bg-border overflow-hidden">
                      <div className="h-full rounded-full bg-primary/50 transition-all"
                        style={{ width: `${prox}%` }} />
                    </div>
                  </div>
                ) : null}
                {mostrarCopiar && (
                  <CopiarMsgBtn pos={i + 1} r={r} acima={acima} criterio={criterio} className="w-full justify-center mt-1" />
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* 4º ao 10º */}
      {meio.length > 0 && (
        <>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">4º ao 10º lugar</p>
          <Card className="border-border">
            <CardContent className="p-0">
              {meio.map((r, i) => {
                const pos   = i + 4;
                const base  = porPct ? (r.pct ?? 0) : r.total_recebido;
                const w     = Math.max(4, Math.min(100, Math.round((base / max) * 100)));
                const acima = lista[pos - 2];
                const gap = !acima
                  ? 0
                  : porPct && acima.pct != null && r.pct != null
                    ? Math.max(0, acima.pct - r.pct)
                    : acima.total_recebido - r.total_recebido;
                const voce  = ehVoce(r.operador_id);
                return (
                  <div key={r.operador_id} className={cn(
                    'flex items-center gap-3 px-3 py-2.5 transition-colors',
                    voce ? 'bg-primary/10' : 'hover:bg-muted/30',
                    i > 0 && 'border-t border-border',
                  )}>
                    <span className="text-sm font-bold text-muted-foreground w-6 text-right shrink-0">{pos}º</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{r.operador_nome ?? r.operador_usuario}</span>
                        {voce && <span className="text-[10px] font-bold uppercase text-primary bg-primary/10 rounded-full px-1.5 py-0.5 shrink-0">Você</span>}
                        {gap > 0 && (
                          <span className="text-xs text-muted-foreground shrink-0">
                            faltam {porPct ? `${gap} p.p.` : formatBRL(gap)}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 h-1 rounded-full bg-border overflow-hidden">
                        <div className="h-full rounded-full bg-primary/40" style={{ width: `${w}%` }} />
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-mono font-bold text-primary">{destaqueValor(r)}</p>
                      <p className="text-xs text-muted-foreground">
                        {porPct
                          ? (r.pct != null ? formatBRL(r.total_recebido) : 'sem meta')
                          : `${r.total_pagamentos} pgtos.`}
                      </p>
                    </div>
                    {mostrarCopiar && <CopiarMsgBtn pos={pos} r={r} acima={acima ?? null} criterio={criterio} className="shrink-0" />}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </>
      )}

      {/* Demais (11+) */}
      {resto.length > 0 && (
        <>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">Demais operadores</p>
          <Card className="border-border">
            <CardContent className="p-0">
              {resto.map((r, i) => {
                const pos   = i + 11;
                const acima = lista[pos - 2] ?? null;
                const voce  = ehVoce(r.operador_id);
                return (
                  <div key={r.operador_id} className={cn(
                    'flex items-center gap-3 px-3 py-2 transition-colors text-xs',
                    voce ? 'bg-primary/10' : 'hover:bg-muted/20',
                    i > 0 && 'border-t border-border',
                  )}>
                    <span className="font-bold text-muted-foreground w-8 text-right shrink-0">{pos}º</span>
                    <span className="flex-1 truncate font-medium flex items-center gap-1.5">
                      {r.operador_nome ?? r.operador_usuario}
                      {voce && <span className="text-[10px] font-bold uppercase text-primary bg-primary/10 rounded-full px-1.5 py-0.5 shrink-0">Você</span>}
                    </span>
                    <span className="font-mono font-semibold text-primary shrink-0">{destaqueValor(r)}</span>
                    <span className="text-muted-foreground shrink-0">
                      {porPct ? formatBRL(r.total_recebido) : `${r.total_pagamentos} pgtos.`}
                    </span>
                    {mostrarCopiar && <CopiarMsgBtn pos={pos} r={r} acima={acima} criterio={criterio} className="shrink-0" />}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
